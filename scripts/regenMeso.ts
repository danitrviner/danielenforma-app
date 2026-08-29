/**
 * Regenera el mesociclo de danielbriz8@gmail.com cuyos `workouts` se perdieron.
 * Mismo algoritmo que el boton "Generar" del coach (MesocycleManager).
 *   node --import tsx scripts/regenMeso.ts            # dry-run
 *   node --import tsx scripts/regenMeso.ts --apply
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { repartoDeSeries } from '../src/utils/programacion';
import { diasDeCiclo, vueltasDelCiclo } from '../src/utils/progression';
import { MUSCLE_ORDER } from '../src/types';

const APPLY = process.argv.includes('--apply');
const MESO_ID = 'dvL7PqeJGL57CsSz8OrD';
const ATHLETE_EMAIL = 'danielbriz8@gmail.com';
const COACH_ID = 'THa4aRnQQVT2tPXBEqq5yytJxIm1';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const cfg = JSON.parse(readFileSync(resolve(root, 'firebase-applet-config.json'), 'utf8'));
const SA = process.env.GOOGLE_APPLICATION_CREDENTIALS ?? resolve(root, 'serviceAccount.json');
initializeApp({ credential: cert(JSON.parse(readFileSync(resolve(SA), 'utf8'))) });
const db = getFirestore(cfg.firestoreDatabaseId);

function pad2(n: number) { return String(n).padStart(2, '0'); }
function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}
const DOW = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'];
function dow(s: string) { const [y, m, d] = s.split('-').map(Number); return DOW[new Date(y, m - 1, d).getDay()]; }
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const meso = (await db.collection('mesocycles').doc(MESO_ID).get()).data() as any;
if (!meso) throw new Error('meso no existe');
if (!meso.distribution?.days?.length) throw new Error('el meso no tiene distribution');

const exSnap = await db.collection('exercises').get();
const exercises = exSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
const byGroup: Record<string, any[]> = {};
for (const g of MUSCLE_ORDER) byGroup[g] = exercises.filter(e => e.muscleGroup === g);

type WE = { exerciseId: string; sets: number; reps: string; rir: number; restSeconds: number; order: number };
const dias = meso.distribution.days as Array<{ dayType?: string; assignments: Array<{ group: string; series: number }> }>;
const rutinas: { name: string; exercises: WE[] }[] = [];
for (let dayIdx = 0; dayIdx < meso.daysPerWeek; dayIdx++) {
  const day = dias[dayIdx] ?? { assignments: [] };
  const exs: WE[] = [];
  let order = 0;
  for (const { group, series } of day.assignments) {
    const available = byGroup[group] ?? [];
    if (available.length === 0) { console.warn(`  ! sin ejercicios para ${group}`); continue; }
    const chunks = repartoDeSeries(series, available.length);
    for (let i = 0; i < chunks.length; i++) {
      const ex = available[i % available.length];
      exs.push({ exerciseId: ex.id, sets: chunks[i], reps: '8-12', rir: 2, restSeconds: 90, order: order++ });
    }
  }
  rutinas.push({ name: `Dia ${dayIdx + 1} - Meso #${meso.number}`, exercises: exs });
}

const cicloDias = diasDeCiclo(meso.daysPerWeek, meso.cycleDays);
const vueltas = vueltasDelCiclo(meso.weeks, cicloDias);
const offsets: number[] = (meso.customOffsets && meso.customOffsets.length === meso.daysPerWeek)
  ? [...meso.customOffsets].sort((a: number, b: number) => a - b)
  : Array.from({ length: meso.daysPerWeek }, (_, i) => i);
const fechas: { dayIdx: number; date: string }[] = [];
for (let week = 1; week <= vueltas; week++)
  for (let dayIdx = 0; dayIdx < meso.daysPerWeek; dayIdx++)
    fechas.push({ dayIdx, date: addDays(meso.startDate, (week - 1) * cicloDias + (offsets[dayIdx] ?? dayIdx)) });

console.log(`\nMeso #${meso.number} · ${meso.weeks} sem · ${meso.daysPerWeek} dias/ciclo · ciclo ${cicloDias}d · ${vueltas} vueltas`);
console.log(`startDate ${meso.startDate} (${dow(meso.startDate)})  offsets [${offsets}]`);
for (const r of rutinas) {
  console.log(`\n${r.name}  (${r.exercises.length} ej, ${r.exercises.reduce((s, e) => s + e.sets, 0)} series)`);
  for (const e of r.exercises) {
    const ex = exercises.find(x => x.id === e.exerciseId);
    console.log(`   ${String(e.sets)}x ${ex?.name ?? e.exerciseId}  [${ex?.muscleGroup}]`);
  }
}
console.log(`\nAsignaciones: ${fechas.length}  (${fechas[0].date} ${dow(fechas[0].date)} -> ${fechas.at(-1)!.date} ${dow(fechas.at(-1)!.date)})`);
console.log('semana 1:', fechas.slice(0, meso.daysPerWeek).map(f => `${f.date}(${dow(f.date)})`).join(' '));

const prev = await db.collection('workoutAssignments').where('athleteId', '==', ATHLETE_EMAIL).get();
const prevW = await db.collection('workouts').where('mesocycleId', '==', MESO_ID).get();
console.log(`\nA borrar: ${prev.size} asignaciones, ${prevW.size} rutinas`);

if (!APPLY) { console.log('\n(dry-run · repite con --apply)'); process.exit(0); }

console.log('\n>>> APLICANDO');
let n = 0;
for (const b of chunk(prev.docs, 400)) { const w = db.batch(); b.forEach(d => w.delete(d.ref)); await w.commit(); n += b.length; }
console.log(`  borradas ${n} asignaciones`);
n = 0;
for (const b of chunk(prevW.docs, 400)) { const w = db.batch(); b.forEach(d => w.delete(d.ref)); await w.commit(); n += b.length; }
console.log(`  borradas ${n} rutinas`);
const workoutIds: string[] = [];
for (const r of rutinas) {
  const ref = await db.collection('workouts').add({ ownerId: COACH_ID, name: r.name, mesocycleId: MESO_ID, exercises: r.exercises });
  workoutIds.push(ref.id);
}
console.log(`  creadas ${workoutIds.length} rutinas`);
let created = 0;
for (const b of chunk(fechas, 400)) {
  const w = db.batch();
  for (const f of b) w.set(db.collection('workoutAssignments').doc(), {
    workoutId: workoutIds[f.dayIdx], athleteId: ATHLETE_EMAIL, mesocycleId: MESO_ID, date: f.date, status: 'pending',
  });
  await w.commit();
  created += b.length;
}
console.log(`  creadas ${created} asignaciones`);
await db.collection('catalogos').doc('workouts').set({ version: new Date().toISOString() }, { merge: true });
console.log('  sello catalogos/workouts actualizado\n\nHECHO');
process.exit(0);
