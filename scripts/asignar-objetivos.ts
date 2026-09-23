// Pone objetivo corporal (Volumen, Déficit…) a las fases de periodización de
// TODOS los atletas que tienen plan, a partir de lo que la app ya deduce:
// el tipo marcado a mano, el nombre de la fase o el salto de kcal.
//
// Backfill de una vez para los programas anteriores a `NutritionPhase.objetivo`
// (09-2026). Al quedar CONFIRMADO, el atleta pasa a ver «Tu objetivo» en su
// Revisión. Solo escribe `objetivo` (y `phaseType` si faltaba): semanas, kcal,
// ritmo y dietas no se tocan.
//
// Simulacro por defecto (no escribe nada). Hace falta --aplicar para escribir:
//
//   npx tsx scripts/asignar-objetivos.ts             # solo informa
//   npx tsx scripts/asignar-objetivos.ts --aplicar   # escribe (y guarda copia antes)
//
// Credencial: serviceAccount.json en la raíz, o FIREBASE_SERVICE_ACCOUNT con el JSON.
//
// Lee la colección nutritionPrograms entera: un documento por atleta con plan,
// decenas, no miles. Es un script de una vez, no una pantalla.

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { abrirDb } from './_lib/firestoreDb.mjs';
import { confirmarObjetivosDeducidos, faseEnCurso } from '../src/utils/objetivoDeFase';
import { OBJETIVO_LABEL } from '../src/utils/verificacionObjetivo';
import type { NutritionProgram } from '../src/types';

// La credencial sale de serviceAccount.json (en local) o de la variable
// FIREBASE_SERVICE_ACCOUNT con el mismo JSON (entornos en la nube, sin archivo).
const credencial = process.env.FIREBASE_SERVICE_ACCOUNT
  ?? readFileSync(new URL('../serviceAccount.json', import.meta.url), 'utf8');
const db = abrirDb(JSON.parse(credencial));
const APLICAR = process.argv.includes('--aplicar');

const pad = (n: number) => String(n).padStart(2, '0');
const d = new Date();
const hoy = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const POR: Record<string, string> = {
  tipo: 'tipo marcado',
  nombre: 'nombre de la fase',
  kcal: 'salto de kcal  ⚠ revisar',
};

const snap = await db.collection('nutritionPrograms').get();
const copia: Record<string, unknown> = {};
const cambios: { ref: FirebaseFirestore.DocumentReference; phases: unknown }[] = [];
let aEscribir = 0;
let dudosos = 0;

for (const doc of snap.docs) {
  const program = { athleteId: doc.id, ...doc.data() } as NutritionProgram;
  if (!Array.isArray(program.phases) || program.phases.length === 0) continue;

  const { program: nuevo, asignados, sinDeducir } = confirmarObjetivosDeducidos(program);
  const enCurso = faseEnCurso(nuevo, hoy);

  console.log(`\n${doc.id}`);
  program.phases.forEach((fase, idx) => {
    const a = asignados.find(x => x.idx === idx);
    const marca = enCurso?.idx === idx ? '▶' : ' ';
    const estado = fase.objetivo
      ? `${OBJETIVO_LABEL[fase.objetivo]} (ya estaba)`
      : a ? `→ ${OBJETIVO_LABEL[a.tipo]}   [${POR[a.por]}]`
      : '→ sin deducir: se queda sin objetivo';
    console.log(`  ${marca} ${String(idx + 1).padStart(2)}. ${fase.name.padEnd(28)} ${String(fase.weeks).padStart(2)} sem  ${estado}`);
  });
  if (!enCurso) console.log('    (ninguna fase en curso hoy: el atleta no verá la tarjeta hasta que empiece una)');

  dudosos += asignados.filter(a => a.por === 'kcal').length + sinDeducir.length;
  if (asignados.length === 0) continue;

  aEscribir++;
  copia[doc.id] = doc.data();
  cambios.push({ ref: doc.ref, phases: JSON.parse(JSON.stringify(nuevo.phases)) });
}

console.log(`\n${aEscribir} programas con fases por confirmar · ${dudosos} fases a revisar a mano (⚠ o sin deducir).`);

if (APLICAR && cambios.length > 0) {
  // La copia va ANTES de escribir: si algo falla a mitad, lo de antes ya está a salvo.
  mkdirSync(new URL('./backups/', import.meta.url), { recursive: true });
  const ruta = new URL(`./backups/nutritionPrograms-antes-de-objetivos-${hoy}.json`, import.meta.url);
  writeFileSync(ruta, JSON.stringify(copia, null, 2));
  console.log(`Copia de lo que había antes en ${ruta.pathname}`);
  for (const c of cambios) await c.ref.update({ phases: c.phases });
  console.log(`Escrito en ${cambios.length} programas.`);
} else if (!APLICAR) {
  console.log('\nSimulacro completo. Relanza con --aplicar para escribir de verdad.');
}
