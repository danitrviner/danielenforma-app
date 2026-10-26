/**
 * Escribe los campos nuevos en kcal y gramos en lo guardado en intercambios:
 *   · dietas sin `objetivo` → el de su cupo,
 *   · periodizaciones → `gramos` en ajustes, ciclado y reglas de peso,
 *   · menús semanales → `objetivo` en kcal en cada día.
 *
 * La app ya lee lo viejo con el adaptador (src/utils/macrosLegado.ts): esto no
 * hace falta para que funcione, deja lo guardado sin depender de él. Solo
 * AÑADE campos; no borra `budget`, `delta`, `cantidad`… que siguen leyendo los
 * binarios viejos. Idempotente: lo ya migrado no se vuelve a tocar. La lógica
 * está en src/utils/migracionKcal.ts, con sus tests.
 *
 * POR DEFECTO ES UN SIMULACRO: lee, cuenta y NO escribe. --aplicar escribe
 * (solo con el OK de Dani).
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json npx tsx scripts/migrarAKcal.ts
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json npx tsx scripts/migrarAKcal.ts --aplicar
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { abrirDb } from './_lib/firestoreDb.mjs';
import { parcheDeDieta, parcheDePrograma, parcheDeMenu } from '../src/utils/migracionKcal';
import type { Diet, MenuDay, NutritionProgram } from '../src/types';

const APLICAR = process.argv.includes('--aplicar');
const LOTE = 400;

const sa = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!sa) {
  console.error('Falta GOOGLE_APPLICATION_CREDENTIALS (ruta al JSON de la cuenta de servicio).');
  process.exit(1);
}
const db = abrirDb(JSON.parse(readFileSync(resolve(sa), 'utf8')));

type Parcheador = (data: Record<string, unknown>) => Record<string, unknown> | null;

async function migrar(coleccion: string, parchear: Parcheador): Promise<void> {
  const snap = await db.collection(coleccion).get();
  const cambios = snap.docs
    .map(d => ({ ref: d.ref, parche: parchear(d.data()) }))
    .filter((c): c is { ref: typeof c.ref; parche: Record<string, unknown> } => c.parche !== null);
  console.log(`${coleccion}: ${snap.size} documentos, ${cambios.length} por migrar`);
  if (!APLICAR || cambios.length === 0) return;
  for (let i = 0; i < cambios.length; i += LOTE) {
    const lote = db.batch();
    for (const c of cambios.slice(i, i + LOTE)) lote.update(c.ref, c.parche);
    await lote.commit();
  }
  console.log(`  ✔ ${cambios.length} escritos`);
}

await migrar('diets', d => parcheDeDieta(d as unknown as Diet));
await migrar('nutritionPrograms', d => parcheDePrograma(d as unknown as NutritionProgram));
await migrar('weeklyMenus', d => (Array.isArray(d.days) ? parcheDeMenu({ days: d.days as MenuDay[] }) : null));

console.log(APLICAR ? 'Hecho.' : 'Simulacro: no se ha escrito nada. Repite con --aplicar para escribir.');
