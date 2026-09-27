/**
 * Migra referencias a `exerciseId` antes de aplicar la limpieza del catálogo
 * de ejercicios (ver scripts/limpiarCatalogoEjercicios.mjs y el plan de
 * limpieza). Usa scripts/out/mapaIdsEjercicios.json ({ idViejo: idNuevo|null })
 * para reescribir cada referencia al ejercicio superviviente, o para avisar
 * si un id se va a borrar SIN superviviente (no debería pasar: solo pasa con
 * las "caja torácica amplia", que no tienen historial propio distinto de su
 * pareja "plana" — pero igualmente un atleta pudo haber registrado esa
 * variante, así que también hay que revisar esos casos a mano).
 *
 * Colecciones que referencian `exerciseId`:
 *   - workoutLogs        entries[].exerciseId       (historial real del atleta)
 *   - workouts            exercises[].exerciseId     (plantillas de sesión)
 *   - mesocycleTemplates  stages[].days[].exercises[].exerciseId
 *   - exerciseNotes       doc.exerciseId (+ doc id determinista `${exerciseId}_${athleteId}`)
 *   - weeklyChallenges    metric.exerciseId (opcional)
 *
 * POR DEFECTO ES UN SIMULACRO: cuenta documentos afectados POR COLECCIÓN Y
 * POR ATLETA, sin escribir nada. Hace falta --aplicar para escribir de verdad.
 *
 * Uso:
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json node scripts/migrarReferenciasEjercicios.mjs
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json node scripts/migrarReferenciasEjercicios.mjs --aplicar
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { abrirDb } from './_lib/firestoreDb.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAPA_PATH = resolve(__dirname, 'out/mapaIdsEjercicios.json');
const APLICAR = process.argv.includes('--aplicar');
const BATCH_SIZE = 400;

const SA_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!SA_PATH) {
  console.error('Error: falta GOOGLE_APPLICATION_CREDENTIALS.');
  process.exit(1);
}
const serviceAccount = JSON.parse(readFileSync(resolve(SA_PATH), 'utf8'));
const db = abrirDb(serviceAccount);

const mapaIds = JSON.parse(readFileSync(MAPA_PATH, 'utf8'));
// Solo interesan los ids que de verdad cambian (id -> otro id distinto, o -> null).
const idsQueCambian = new Set(
  Object.entries(mapaIds).filter(([id, destino]) => destino !== id).map(([id]) => id),
);
const idsSinSuperviviente = new Set(
  Object.entries(mapaIds).filter(([id, destino]) => destino === null).map(([id]) => id),
);

console.log(APLICAR
  ? '⚠️  MODO ESCRITURA — se van a reescribir referencias en producción.\n'
  : '🔍 SIMULACRO — no se escribe nada. Añade --aplicar para escribir.\n');
console.log(`Ids que cambian: ${idsQueCambian.size} (de los cuales ${idsSinSuperviviente.size} se borran sin equivalente)\n`);

// ---------------------------------------------------------------------------
// 1) workoutLogs — entries[].exerciseId (historial real de series registradas)
// ---------------------------------------------------------------------------
async function migrarWorkoutLogs() {
  const snap = await db.collection('workoutLogs').get();
  const afectados = [];
  const porAtleta = new Map();
  const sinSuperviviente = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    const entries = data.entries ?? [];
    const tocados = entries.filter((en) => idsQueCambian.has(en.exerciseId));
    if (tocados.length === 0) continue;
    afectados.push(doc.id);
    const atleta = data.athleteId ?? '(desconocido)';
    porAtleta.set(atleta, (porAtleta.get(atleta) ?? 0) + tocados.length);
    for (const en of tocados) {
      if (idsSinSuperviviente.has(en.exerciseId)) sinSuperviviente.push({ doc: doc.id, atleta, exerciseId: en.exerciseId });
    }
    if (APLICAR) {
      const nuevasEntries = entries.map((en) =>
        idsQueCambian.has(en.exerciseId) && mapaIds[en.exerciseId]
          ? { ...en, exerciseId: mapaIds[en.exerciseId] }
          : en,
      );
      await doc.ref.update({ entries: nuevasEntries });
    }
  }
  console.log(`workoutLogs: ${afectados.length} documentos afectados, ${[...porAtleta.values()].reduce((a, b) => a + b, 0)} entradas de ejercicio a reescribir`);
  for (const [atleta, n] of porAtleta) console.log(`  - ${atleta}: ${n} entrada(s)`);
  if (sinSuperviviente.length) {
    console.log(`  ⚠️  ${sinSuperviviente.length} entradas apuntan a un id SIN superviviente (revisar a mano):`);
    for (const s of sinSuperviviente) console.log(`     doc ${s.doc} (${s.atleta}) -> ${s.exerciseId}`);
  }
  return { documentos: afectados.length, entradas: porAtleta };
}

// ---------------------------------------------------------------------------
// 2) workouts — exercises[].exerciseId (plantillas de sesión, no logs)
// ---------------------------------------------------------------------------
async function migrarWorkouts() {
  const snap = await db.collection('workouts').get();
  let afectados = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    const exercises = data.exercises ?? [];
    const tocados = exercises.filter((ex) => idsQueCambian.has(ex.exerciseId));
    if (tocados.length === 0) continue;
    afectados++;
    if (APLICAR) {
      const nuevas = exercises.map((ex) =>
        idsQueCambian.has(ex.exerciseId) && mapaIds[ex.exerciseId]
          ? { ...ex, exerciseId: mapaIds[ex.exerciseId] }
          : ex,
      );
      await doc.ref.update({ exercises: nuevas });
    }
  }
  console.log(`workouts: ${afectados} documentos afectados`);
  return { documentos: afectados };
}

// ---------------------------------------------------------------------------
// 3) mesocycleTemplates — stages[].days[].exercises[].exerciseId
// ---------------------------------------------------------------------------
async function migrarMesocycleTemplates() {
  const snap = await db.collection('mesocycleTemplates').get();
  let afectados = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    const stages = data.stages ?? [];
    let tocado = false;
    const nuevasStages = stages.map((stage) => {
      const days = stage.days ?? [];
      const nuevosDays = days.map((day) => {
        const exercises = day.exercises ?? [];
        if (!exercises.some((ex) => idsQueCambian.has(ex.exerciseId))) return day;
        tocado = true;
        return {
          ...day,
          exercises: exercises.map((ex) =>
            idsQueCambian.has(ex.exerciseId) && mapaIds[ex.exerciseId]
              ? { ...ex, exerciseId: mapaIds[ex.exerciseId] }
              : ex,
          ),
        };
      });
      return { ...stage, days: nuevosDays };
    });
    if (!tocado) continue;
    afectados++;
    if (APLICAR) await doc.ref.update({ stages: nuevasStages });
  }
  console.log(`mesocycleTemplates: ${afectados} documentos afectados`);
  return { documentos: afectados };
}

// ---------------------------------------------------------------------------
// 4) exerciseNotes — doc id determinista `${exerciseId}_${athleteId}` + campo
//    exerciseId. No basta actualizar el campo: hay que crear el doc con el id
//    nuevo y borrar el viejo, o colisionaría con la nota que ya exista (si
//    la hay) para el ejercicio superviviente.
// ---------------------------------------------------------------------------
async function migrarExerciseNotes() {
  const snap = await db.collection('exerciseNotes').get();
  let renombrados = 0;
  let colisiones = [];
  const porAtleta = new Map();
  for (const doc of snap.docs) {
    const data = doc.data();
    if (!idsQueCambian.has(data.exerciseId)) continue;
    const nuevoExerciseId = mapaIds[data.exerciseId];
    if (!nuevoExerciseId) {
      colisiones.push({ doc: doc.id, motivo: 'sin superviviente' });
      continue;
    }
    const nuevoId = `${nuevoExerciseId}_${data.athleteId}`;
    porAtleta.set(data.athleteId, (porAtleta.get(data.athleteId) ?? 0) + 1);
    renombrados++;
    if (APLICAR) {
      const existente = await db.collection('exerciseNotes').doc(nuevoId).get();
      if (existente.exists) {
        colisiones.push({ doc: doc.id, motivo: `ya existe ${nuevoId} (nota del ejercicio superviviente) — revisar a mano cuál se conserva` });
        continue;
      }
      await db.collection('exerciseNotes').doc(nuevoId).set({ ...data, id: nuevoId, exerciseId: nuevoExerciseId });
      await doc.ref.delete();
    }
  }
  console.log(`exerciseNotes: ${renombrados} notas a renombrar`);
  for (const [atleta, n] of porAtleta) console.log(`  - ${atleta}: ${n} nota(s)`);
  if (colisiones.length) {
    console.log(`  ⚠️  ${colisiones.length} casos a revisar a mano:`);
    for (const c of colisiones) console.log(`     ${c.doc}: ${c.motivo}`);
  }
  return { documentos: renombrados };
}

// ---------------------------------------------------------------------------
// 5) weeklyChallenges — metric.exerciseId (opcional, retos activos/pasados)
// ---------------------------------------------------------------------------
async function migrarWeeklyChallenges() {
  const snap = await db.collection('weeklyChallenges').get();
  let afectados = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    const exerciseId = data.metric?.exerciseId;
    if (!exerciseId || !idsQueCambian.has(exerciseId)) continue;
    afectados++;
    if (APLICAR && mapaIds[exerciseId]) {
      await doc.ref.update({ 'metric.exerciseId': mapaIds[exerciseId] });
    }
  }
  console.log(`weeklyChallenges: ${afectados} documentos afectados`);
  return { documentos: afectados };
}

async function main() {
  const r1 = await migrarWorkoutLogs();
  const r2 = await migrarWorkouts();
  const r3 = await migrarMesocycleTemplates();
  const r4 = await migrarExerciseNotes();
  const r5 = await migrarWeeklyChallenges();

  console.log('\n--- Resumen ---');
  console.log(`workoutLogs: ${r1.documentos} docs`);
  console.log(`workouts: ${r2.documentos} docs`);
  console.log(`mesocycleTemplates: ${r3.documentos} docs`);
  console.log(`exerciseNotes: ${r4.documentos} docs`);
  console.log(`weeklyChallenges: ${r5.documentos} docs`);

  if (!APLICAR) {
    console.log('\nNada escrito (simulacro). Revisa los conteos por atleta arriba antes de correr con --aplicar.');
  } else {
    console.log('\nHecho. Referencias reescritas. Antes de subir el catálogo limpio, vuelve a correr este script en modo simulacro: debe dar 0 en todas las colecciones.');
  }
}

main().catch((err) => {
  console.error('Migración falló:', err);
  process.exit(1);
});
