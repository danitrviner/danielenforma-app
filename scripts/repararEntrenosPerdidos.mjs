/* Devuelve a «completado» los entrenos que se hicieron y figuran como pendientes.
 *
 * Reprogramar un mesociclo borraba TODAS sus asignaciones —también las de días
 * ya entrenados— y las recreaba en `pending` (auditoría §4.1). El `WorkoutLog`
 * con las series sobrevivió siempre; lo que se perdió fue la marca. Esto la
 * repone cruzando logs y asignaciones por atleta y fecha.
 *
 * El arreglo del código impide que vuelva a pasar; esto limpia lo ya roto.
 *
 * Por defecto NO escribe: enseña qué cambiaría.
 *
 * Uso:
 *   node scripts/repararEntrenosPerdidos.mjs                → informe
 *   node scripts/repararEntrenosPerdidos.mjs --aplicar      → lo arregla
 *   node scripts/repararEntrenosPerdidos.mjs --atleta ana@correo.com
 *
 * Haz una copia antes:  node scripts/backupFirestore.mjs --sin-catalogos
 */
import { readFileSync } from 'fs';
import { abrirDb, DATABASE_ID } from './_lib/firestoreDb.mjs';

const args = process.argv.slice(2);
const aplicar = args.includes('--aplicar');
const iAtleta = args.indexOf('--atleta');
const soloAtleta = iAtleta >= 0 ? args[iAtleta + 1] : null;

const db = abrirDb(JSON.parse(readFileSync(new URL('../serviceAccount.json', import.meta.url), 'utf8')));

console.log(`Base:  ${DATABASE_ID}`);
console.log(`Modo:  ${aplicar ? 'APLICAR — se va a escribir' : 'informe (no escribe nada)'}`);
if (soloAtleta) console.log(`Atleta: ${soloAtleta}`);
console.log('');

// Misma clave que src/utils/estadoDeAsignacion.ts: atleta + fecha. NO la rutina
// — al regenerar, los Workout se crean de cero y todos los workoutId son
// nuevos, así que el del log apunta a una rutina que ya no existe.
const clave = (x) => `${x.athleteId}__${x.date}`;

const [snapLogs, snapAsig] = await Promise.all([
  db.collection('workoutLogs').get(),
  db.collection('workoutAssignments').get(),
]);

/* Cuántos entrenos hay guardados por día, no solo si hay alguno.
 *
 * Importa: reasignar repetidas veces dejó atletas con VARIAS asignaciones el
 * mismo día (andernovgu tiene tres el 31-08). Si un día con un solo entreno
 * guardado marcase las tres, se le inventarían dos entrenos que no hizo y su
 * adherencia saldría inflada. Se reparan como mucho tantas como entrenos haya,
 * igual que hace conEstadoReal en la app. */
const entrenosPorDia = new Map();
for (const d of snapLogs.docs) {
  const k = clave(d.data());
  entrenosPorDia.set(k, (entrenosPorDia.get(k) ?? 0) + 1);
}
console.log(`${snapLogs.size} entrenos guardados · ${snapAsig.size} asignaciones\n`);

// Las que ya están en `completed` consumen cupo: si el día tiene un entreno y
// una asignación ya completada, no queda nada que reparar.
const cupoUsado = new Map();
for (const d of snapAsig.docs) {
  const a = d.data();
  if (a.status !== 'completed') continue;
  const k = clave(a);
  cupoUsado.set(k, (cupoUsado.get(k) ?? 0) + 1);
}

const aReparar = [];
const sobrantes = [];
for (const d of snapAsig.docs) {
  const a = d.data();
  if (soloAtleta && a.athleteId !== soloAtleta) continue;
  if (a.status === 'completed') continue;
  const k = clave(a);
  const entrenos = entrenosPorDia.get(k) ?? 0;
  if (entrenos === 0) continue;
  const usado = cupoUsado.get(k) ?? 0;
  if (usado >= entrenos) { sobrantes.push(d); continue; }
  cupoUsado.set(k, usado + 1);
  aReparar.push(d);
}

if (aReparar.length === 0) {
  console.log('Nada que reparar: no hay ningún entreno guardado marcado como pendiente.');
  process.exit(0);
}

// Agrupado por atleta, que es como Dani va a querer comprobarlo.
const porAtleta = new Map();
for (const d of aReparar) {
  const a = d.data();
  const lista = porAtleta.get(a.athleteId) ?? [];
  lista.push({ fecha: a.date, estado: a.status });
  porAtleta.set(a.athleteId, lista);
}

for (const [atleta, dias] of [...porAtleta].sort((x, y) => y[1].length - x[1].length)) {
  console.log(`${atleta} — ${dias.length} ${dias.length === 1 ? 'día' : 'días'}`);
  for (const d of dias.sort((x, y) => x.fecha.localeCompare(y.fecha))) {
    console.log(`    ${d.fecha}  (${d.estado} → completed)`);
  }
}

console.log(`\n${aReparar.length} asignaciones a reparar, ${porAtleta.size} ${porAtleta.size === 1 ? 'atleta' : 'atletas'}.`);

if (sobrantes.length > 0) {
  console.log(`\n${sobrantes.length} asignaciones duplicadas del mismo día NO se tocan: hay más`);
  console.log(`asignaciones que entrenos guardados, así que marcarlas inventaría entrenos.`);
  console.log(`Son restos de reasignaciones repetidas; conviene revisarlas a mano:`);
  for (const d of sobrantes.slice(0, 10)) {
    const a = d.data();
    console.log(`    ${a.athleteId}  ${a.date}  (${a.status})  id=${d.id}`);
  }
  if (sobrantes.length > 10) console.log(`    … y ${sobrantes.length - 10} más`);
}

if (!aplicar) {
  console.log(`\nPara aplicarlo:\n  node scripts/repararEntrenosPerdidos.mjs --aplicar`);
  process.exit(0);
}

for (let i = 0; i < aReparar.length; i += 400) {
  const lote = db.batch();
  for (const d of aReparar.slice(i, i + 400)) lote.update(d.ref, { status: 'completed' });
  await lote.commit();
}

console.log(`\n${aReparar.length} asignaciones reparadas.`);
console.log('Las apps lo verán en su próxima carga: workoutAssignments no es un catálogo sellado.');
