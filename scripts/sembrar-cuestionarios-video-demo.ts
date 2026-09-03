// Añade CUESTIONARIOS y REGISTROS a la cuenta de vídeo (demo.video@danielenforma.app).
//
// Complementa a crear-cuenta-video-demo.mjs: aquí se cuelgan las plantillas de
// cuestionario del coach, se asignan al atleta y se responden las ocurrencias
// pasadas (dejando la de esta semana pendiente para poder grabar cómo se
// rellena), más los "registros": mediciones de perímetros y check-ins de peso
// con feedback del coach.
//
//   npx tsx scripts/sembrar-cuestionarios-video-demo.ts
//   npx tsx scripts/sembrar-cuestionarios-video-demo.ts --limpiar
//
// Todo lo sembrado lleva demoSeed:true, videoDemo:true.

import { readFileSync } from 'fs';
import { getAuth } from 'firebase-admin/auth';
// @ts-expect-error — _lib es .mjs sin tipos
import { abrirDb } from './_lib/firestoreDb.mjs';
import { QUESTIONNAIRE_PRESETS, buildQuestionnaireFromPreset } from '../src/data/questionnairePresets';
import type { Questionnaire, QuestionnaireQuestion, QSchedule, BodyMetricKey } from '../src/types';

const db = abrirDb(JSON.parse(readFileSync(new URL('../serviceAccount.json', import.meta.url), 'utf8')));
const auth = getAuth();

const EMAIL = 'demo.video@danielenforma.app';
const COACH_UID = 'THa4aRnQQVT2tPXBEqq5yytJxIm1';
const MARCA = { demoSeed: true, videoDemo: true };

const iso = (d: Date) => d.toISOString().slice(0, 10);
const sumaDias = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

// Perímetros plausibles (cm) para un varón de ~1,78 m en definición.
const CM: Partial<Record<BodyMetricKey, number>> = {
  altura: 178, cuello: 39, pecho: 104, cintura: 82, abdomen: 85, cadera: 99,
  biceps_der_relajado: 33, biceps_der_contraido: 37.5,
  biceps_izq_relajado: 32.5, biceps_izq_contraido: 37,
  muslo_der_relajado: 57, muslo_der_contraido: 59,
  muslo_izq_relajado: 56.5, muslo_izq_contraido: 58.5,
  gemelo_der: 38, gemelo_izq: 37.5,
  biceps_der: 37, biceps_izq: 36.5, muslo_der: 58, muslo_izq: 57.5, gemelo: 38,
};

const TITULOS = ['Entrenamiento', 'Primera Semana', 'Revisión Semanal', 'Mediciones'];

/** Valor plausible para una pregunta según su tipo. `delta` desplaza las escalas/medidas. */
function responder(q: QuestionnaireQuestion, delta = 0): string | number | boolean {
  switch (q.type) {
    case 'scale': {
      const min = q.scaleMin ?? 1, max = q.scaleMax ?? 10;
      return Math.max(min, Math.min(max, Math.round((max * 0.75) + delta)));
    }
    case 'numeric': {
      if (/edad/i.test(q.label)) return 34;
      if (/horas.*duer|duermes|dormir|sue/i.test(q.label)) return 7;
      if (/d[íi]as.*entren/i.test(q.label)) return 4;
      if (/pasos/i.test(q.label)) return 8600 + delta * 200;
      if (/sentado/i.test(q.label)) return 7;
      if (/sol/i.test(q.label)) return 45;
      return 5;
    }
    case 'boolean':
      return true;
    case 'choice': {
      if (/sexo/i.test(q.label)) return 'Hombre';
      if (q.multiSelect) return (q.options ?? []).slice(0, 2).join(', ');
      return q.options?.[0] ?? 'Sí';
    }
    case 'metric':
      return (CM[q.metricKey as BodyMetricKey] ?? 40) + delta * 0.3;
    case 'media':
      return '';
    case 'text':
    default: {
      if (/nombre/i.test(q.label)) return 'Marcos Vídeo';
      if (/ocupaci|trabajo/i.test(q.label)) return 'Comercial, jornada de oficina';
      if (/objetivo/i.test(q.label)) return 'Perder grasa manteniendo fuerza y llegar a 74 kg';
      if (/lesi[óo]n|dolor|molestia/i.test(q.label)) return 'Nada relevante ahora mismo';
      if (/orgulloso/i.test(q.label)) return 'He subido 2,5 kg en press banca y me veo más seco';
      if (/fuerte/i.test(q.label)) return 'Hip thrust y jalón, muy sólidos esta semana';
      if (/costado|dif[íi]cil/i.test(q.label)) return 'La sentadilla hack el día de pierna, llego algo justo de energía';
      if (/sugerenc|comentar|añadir|preocupaci/i.test(q.label)) return 'Todo claro, seguimos así';
      return 'Semana buena, sin incidencias y con buena adherencia';
    }
  }
}

function answersFor(t: Questionnaire, delta = 0) {
  return t.questions
    .filter(q => q.type !== 'media')
    .map(q => ({ questionId: q.id, value: responder(q, delta) }));
}

async function asegurarPlantillas(): Promise<Map<string, Questionnaire>> {
  const snap = await db.collection('questionnaires').where('ownerId', '==', COACH_UID).get();
  const porTitulo = new Map<string, Questionnaire>();
  snap.docs.forEach((d: any) => porTitulo.set(d.data().title, { id: d.id, ...d.data() } as Questionnaire));

  for (const titulo of TITULOS) {
    if (porTitulo.has(titulo)) continue;
    const preset = QUESTIONNAIRE_PRESETS.find(p => p.title === titulo)!;
    const data = buildQuestionnaireFromPreset(preset, COACH_UID);
    const ref = db.collection('questionnaires').doc();
    await ref.set({ ...data, ...MARCA });
    porTitulo.set(titulo, { id: ref.id, ...data } as Questionnaire);
    console.log(`  + plantilla creada: ${titulo}`);
  }
  return porTitulo;
}

async function asignar(questionnaireId: string, schedule: QSchedule, startDate: string) {
  const ref = db.collection('questionnaireAssignments').doc();
  await ref.set({
    questionnaireId, athleteId: EMAIL, schedule, startDate,
    active: true, createdAt: new Date().toISOString(), ...MARCA,
  });
  return ref.id;
}

async function responder1(questionnaireId: string, assignmentId: string, submittedAt: string, t: Questionnaire, delta = 0) {
  const ref = db.collection('questionnaireResponses').doc();
  await ref.set({
    questionnaireId, assignmentId, athleteId: EMAIL, submittedAt,
    answers: answersFor(t, delta), ...MARCA,
  });
}

async function medicionesDe(fecha: string, t: Questionnaire, delta: number) {
  for (const q of t.questions) {
    if (q.type !== 'metric' || !q.metricKey || q.metricKey === 'bodyweight') continue;
    const value = Math.round(((CM[q.metricKey] ?? 40) + delta * 0.3) * 10) / 10;
    const docId = `${EMAIL}_${fecha}_${q.metricKey}`;
    await db.collection('bodyMeasurements').doc(docId).set({
      id: docId, athleteId: EMAIL, date: fecha, metricKey: q.metricKey,
      value, unit: 'cm', source: 'questionnaire', createdAt: `${fecha}T08:00:00.000Z`, ...MARCA,
    });
  }
}

async function limpiar() {
  let total = 0;
  for (const col of ['questionnaireAssignments', 'questionnaireResponses', 'bodyMeasurements', 'checkins']) {
    const campo = col === 'checkins' ? 'email' : 'athleteId';
    const snap = await db.collection(col).where(campo, '==', EMAIL).where('demoSeed', '==', true).get();
    for (const d of snap.docs) { await d.ref.delete(); total++; }
    console.log(`  ${col}: ${snap.size} borrados`);
  }
  const plantillas = await db.collection('questionnaires').where('ownerId', '==', COACH_UID).where('demoSeed', '==', true).get();
  for (const d of plantillas.docs) { await d.ref.delete(); total++; }
  console.log(`  questionnaires (creadas por el script): ${plantillas.size} borradas`);
  console.log(`\nTotal: ${total} documentos.`);
}

async function sembrar() {
  const uid = (await auth.getUserByEmail(EMAIL)).uid;
  const hoy = new Date();
  const perfil = (await db.collection('user_profiles').doc(uid).get()).data() || {};
  const planStart = perfil.planStartDate || iso(sumaDias(hoy, -35));

  const plantillas = await asegurarPlantillas();
  const tEntreno = plantillas.get('Entrenamiento')!;
  const tPrimera = plantillas.get('Primera Semana')!;
  const tSemanal = plantillas.get('Revisión Semanal')!;
  const tMedi = plantillas.get('Mediciones')!;

  // ── Cuestionarios de alta (respondidos al empezar) ──
  const aEntreno = await asignar(tEntreno.id, { type: 'once' }, planStart);
  await responder1(tEntreno.id, aEntreno, `${planStart}T10:15:00.000Z`, tEntreno);

  const aPrimera = await asignar(tPrimera.id, { type: 'plan_week', planWeek: 1 }, planStart);
  await responder1(tPrimera.id, aPrimera, `${iso(sumaDias(new Date(planStart), 7))}T18:40:00.000Z`, tPrimera);
  console.log('✔ cuestionarios de alta respondidos (Entrenamiento, Primera Semana)');

  // ── Revisión semanal: viernes. Respondidas las pasadas, pendiente la de esta semana ──
  const aSemanal = await asignar(tSemanal.id, { type: 'weekdays', weekdays: [5] }, planStart);
  let respondidas = 0;
  for (let semana = 5; semana >= 1; semana--) {
    const viernes = sumaDias(hoy, -(hoy.getDay() === 0 ? 2 : hoy.getDay() - 5) - semana * 7);
    if (iso(viernes) < planStart) continue;
    await responder1(tSemanal.id, aSemanal, `${iso(viernes)}T20:30:00.000Z`, tSemanal, 5 - semana);
    respondidas++;
  }
  console.log(`✔ Revisión Semanal: ${respondidas} respondidas, la de esta semana queda pendiente`);

  // ── Mediciones: mensual (día 26). Dos tomas para que haya tendencia ──
  const aMedi = await asignar(tMedi.id, { type: 'monthly', dayOfMonth: 26 }, iso(sumaDias(hoy, -70)));
  const tomas = [
    { fecha: iso(sumaDias(hoy, -63)), delta: 0 },
    { fecha: iso(sumaDias(hoy, -33)), delta: -2 },
  ];
  for (const { fecha, delta } of tomas) {
    await responder1(tMedi.id, aMedi, `${fecha}T08:05:00.000Z`, tMedi, delta);
    await medicionesDe(fecha, tMedi, delta);
  }
  console.log(`✔ Mediciones: ${tomas.length} tomas de perímetros (registros)`);

  // ── Check-ins de peso semanales, con feedback del coach ──
  const humor = ['😊', '🔥', '😐', '😊', '🔥'];
  const adher: Array<'Sí' | 'Parcial'> = ['Sí', 'Sí', 'Parcial', 'Sí', 'Sí'];
  const notas = [
    'Semana redonda, energía alta en todos los entrenos.',
    'Peso bajando estable. Dormí algo peor el finde.',
    'Comida fuera el sábado, por lo demás bien.',
    'Muy fuerte en empuje, subí carga en press militar.',
    'Cierro el mes contento, la ropa me queda distinta.',
  ];
  let nCheck = 0;
  for (let i = 5; i >= 1; i--) {
    const fecha = sumaDias(hoy, -i * 7 + 1);
    const peso = Math.round((77.0 - (5 - i) * 0.35 + ((i % 2) * 0.2 - 0.1)) * 10) / 10;
    const pendiente = i === 1; // el último, sin aprobar: el coach lo revisa en el vídeo
    const ref = db.collection('checkins').doc();
    await ref.set({
      userId: uid, email: EMAIL, timestamp: fecha,
      dateStr: fecha.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
      weight: peso, mood: humor[5 - i], adherence: adher[5 - i], notes: notas[5 - i],
      approved: !pendiente,
      ...(pendiente ? {} : { approvedAt: sumaDias(fecha, 1), coachFeedback: 'Muy bien, seguimos con el mismo plan esta semana. Cuida el descanso el finde.' }),
      ...MARCA,
    });
    nCheck++;
  }
  console.log(`✔ ${nCheck} check-ins de peso (4 aprobados con feedback, 1 pendiente)`);
}

const limpiando = process.argv.includes('--limpiar');
console.log(limpiando ? `Borrando cuestionarios/registros de ${EMAIL}...\n` : `Sembrando cuestionarios y registros de ${EMAIL}...\n`);
await (limpiando ? limpiar() : sembrar());
process.exit(0);
