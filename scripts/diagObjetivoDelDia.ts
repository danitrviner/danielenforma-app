/* Diagnóstico READ-ONLY de N-01: compara, para cada atleta, lo que Nutrición
 * calculaba hasta ahora (dietaPautadaDelDia + dietaDeLaSemana) con lo que da
 * `objetivoDelDia`. No escribe nada.
 *
 * Uso:
 *   npx tsx scripts/diagObjetivoDelDia.ts                 # todos los atletas con dietas
 *   npx tsx scripts/diagObjetivoDelDia.ts a@b.c d@e.f     # solo esos
 *   FECHA=2026-10-26 npx tsx scripts/diagObjetivoDelDia.ts
 *
 * Lecturas: user_profiles una vez (si no pasas emails) y, por atleta, tres
 * consultas acotadas por su email. Nunca barre colecciones enteras.
 * Necesita serviceAccount.json (como el resto de scripts diag*).
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { abrirDb } from './_lib/firestoreDb.mjs';
import { objetivoDelDia } from '../src/utils/objetivoDelDia';
import { dietaPautadaDelDia } from '../src/utils/nutritionSummary';
import { dietaDeLaSemana, diaDeLaSemana, kcalDeDieta } from '../src/utils/semanasNutricion';
import type { Diet, AthleteDietConfig, NutritionProgram } from '../src/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceAccount = JSON.parse(readFileSync(resolve(__dirname, '../serviceAccount.json'), 'utf8'));
const db = abrirDb(serviceAccount);

const hoyLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const fecha = process.env.FECHA || hoyLocal();

let emails = process.argv.slice(2);
if (emails.length === 0) {
  const perfiles = await db.collection('user_profiles').get();
  emails = perfiles.docs
    .map(d => String(d.data().email || ''))
    .filter(e => e && e !== 'danitrviner@gmail.com');
}

let iguales = 0;
const distintos: string[] = [];
const sinDieta: string[] = [];

for (const email of emails) {
  const dietas = (await db.collection('diets').where('athleteId', '==', email).get())
    .docs.map(d => ({ id: d.id, ...d.data() }) as Diet);
  if (dietas.length === 0) { sinDieta.push(email); continue; }
  const cfgSnap = await db.collection('athleteDietConfigs').doc(email).get();
  const progSnap = await db.collection('nutritionPrograms').doc(email).get();
  const config = (cfgSnap.exists ? cfgSnap.data() : null) as AthleteDietConfig | null;
  const program = (progSnap.exists ? progSnap.data() : null) as NutritionProgram | null;

  const antes = dietaPautadaDelDia(dietas, config, diaDeLaSemana(fecha));
  const antesEfectiva = antes ? dietaDeLaSemana(antes, program, fecha) : null;
  const ahora = objetivoDelDia({ diets: dietas, config, program, fecha });

  const kAntes = antesEfectiva ? kcalDeDieta(antesEfectiva) : null;
  const kAhora = ahora.kcal;
  const mismaDieta = (antesEfectiva?.id ?? null) === (ahora.dieta?.id ?? null);
  if (kAntes === kAhora && mismaDieta) { iguales++; } else {
    distintos.push(
      `${email}: antes ${antesEfectiva ? `${antesEfectiva.name} · ${kAntes} kcal` : 'sin dieta'}` +
      ` → ahora ${ahora.dieta ? `${ahora.dieta.name} · ${kAhora} kcal` : 'sin dieta'} [${ahora.origen}]`,
    );
  }
  for (const av of ahora.avisos) {
    console.log(`  aviso ${email}: ${JSON.stringify(av)}`);
  }
}

console.log(`\nFecha: ${fecha} · atletas con dieta: ${iguales + distintos.length} · sin dieta: ${sinDieta.length}`);
console.log(`Igual que antes: ${iguales}`);
console.log(`Cambian (${distintos.length}):`);
for (const l of distintos) console.log(`  - ${l}`);
