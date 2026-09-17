// Asigna el cuestionario "Mediciones" a todos los atletas actuales que
// todavía no lo tengan, con la cadencia mensual sugerida (día 26).
//
// Complementa el hook de alta en api/create-athlete.ts (que ya asigna
// Mediciones a cada atleta NUEVO desde el día 1): este script es el
// backfill de una sola vez para los que ya existían antes de ese cambio.
//
// Simulacro por defecto (no escribe nada). Hace falta --aplicar para escribir:
//
//   node scripts/asignar-mediciones-todos.mjs             # solo informa
//   node scripts/asignar-mediciones-todos.mjs --aplicar   # asigna de verdad

import { readFileSync } from 'fs';
import { abrirDb } from './_lib/firestoreDb.mjs';

const db = abrirDb(JSON.parse(readFileSync(new URL('../serviceAccount.json', import.meta.url))));

const COACH_UID = 'THa4aRnQQVT2tPXBEqq5yytJxIm1';
const APLICAR = process.argv.includes('--aplicar');

// Mismas 15 preguntas y claves que src/data/questionnairePresets.ts (MEDICIONES).
// No se importa desde src/ porque este script corre con Node plano (.mjs),
// sin el transpilador de TypeScript del proyecto.
const PREGUNTAS_MEDICIONES = [
  ['Cuello (cm)', 'cuello'],
  ['Contorno de pecho (cm)', 'pecho'],
  ['Bíceps derecho relajado (cm)', 'biceps_der_relajado'],
  ['Bíceps derecho contraído (cm)', 'biceps_der_contraido'],
  ['Bíceps izquierdo relajado (cm)', 'biceps_izq_relajado'],
  ['Bíceps izquierdo contraído (cm)', 'biceps_izq_contraido'],
  ['Perímetro de cintura (cm)', 'cintura'],
  ['Perímetro de abdomen (cm)', 'abdomen'],
  ['Perímetro de cadera (cm)', 'cadera'],
  ['Muslo derecho relajado (cm)', 'muslo_der_relajado'],
  ['Muslo derecho contraído (cm)', 'muslo_der_contraido'],
  ['Muslo izquierdo relajado (cm)', 'muslo_izq_relajado'],
  ['Muslo izquierdo contraído (cm)', 'muslo_izq_contraido'],
  ['Gemelo derecho (cm)', 'gemelo_der'],
  ['Gemelo izquierdo (cm)', 'gemelo_izq'],
].map(([label, metricKey], idx) => ({
  id: `q-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
  label, type: 'metric', required: true, metricKey,
}));

const SCHEDULE = { type: 'monthly', dayOfMonth: 26 };

async function asegurarQuestionnaire() {
  const snap = await db.collection('questionnaires')
    .where('ownerId', '==', COACH_UID)
    .where('title', '==', 'Mediciones')
    .limit(1)
    .get();
  if (!snap.empty) {
    console.log(`Cuestionario "Mediciones" ya existe: ${snap.docs[0].id}`);
    return snap.docs[0].id;
  }
  if (!APLICAR) {
    console.log('(simulacro) crearía el cuestionario "Mediciones"');
    return '__simulado__';
  }
  const ref = await db.collection('questionnaires').add({
    ownerId: COACH_UID,
    title: 'Mediciones',
    description: 'Perímetros corporales mensuales — alimentan la ficha de mediciones y los índices '
      + 'antropométricos (Pecho/Cintura, Bíceps/Cintura, Cadera/Cintura, Muslo/Cintura). Sigue el orden del '
      + 'protocolo en vídeo: https://www.youtube.com/watch?v=cCQ8SPp9jdc',
    questions: PREGUNTAS_MEDICIONES,
  });
  console.log(`Cuestionario "Mediciones" creado: ${ref.id}`);
  return ref.id;
}

async function atletas() {
  const snap = await db.collection('user_profiles').get();
  const vistos = new Set();
  const lista = [];
  for (const doc of snap.docs) {
    const d = doc.data();
    const email = (d.email || '').trim().toLowerCase();
    if (!email || d.role === 'coach' || vistos.has(email)) continue;
    vistos.add(email);
    lista.push(email);
  }
  return lista;
}

async function main() {
  const questionnaireId = await asegurarQuestionnaire();
  const emails = await atletas();
  console.log(`${emails.length} atletas encontrados.\n`);

  let yaTenian = 0, asignados = 0;
  for (const email of emails) {
    const existente = await db.collection('questionnaireAssignments')
      .where('athleteId', '==', email)
      .where('questionnaireId', '==', questionnaireId)
      .limit(1)
      .get();
    if (!existente.empty) { yaTenian++; continue; }

    if (!APLICAR) {
      console.log(`(simulacro) asignaría Mediciones a ${email}`);
      asignados++;
      continue;
    }
    await db.collection('questionnaireAssignments').add({
      questionnaireId,
      athleteId: email,
      schedule: SCHEDULE,
      startDate: new Date().toISOString().slice(0, 10),
      active: true,
      createdAt: new Date().toISOString(),
    });
    asignados++;
  }

  console.log(`\n${yaTenian} ya la tenían. ${asignados} ${APLICAR ? 'asignadas' : 'pendientes de asignar'}.`);
  if (!APLICAR) console.log('\nSimulacro completo. Relanza con --aplicar para escribir de verdad.');
}

await main();
process.exit(0);
