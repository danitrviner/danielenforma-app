// La fuente de datos de las tools del asistente en el SERVIDOR (28-10-2026).
//
// Implementa `FuenteDeDatos` (src/ai/tools/datos.ts) con el SDK de
// administración: las mismas 44 lecturas y escrituras que `dbService` hace en
// el navegador, calcadas consulta a consulta (colección, filtro, orden, valor
// por defecto) para que `get_client_brief` devuelva en una función de Vercel
// exactamente lo que devuelve en la app. Sin espejo local, sin modo local: un
// fallo de permisos aquí es un fallo, no un silencio.
//
// Lo que es distinto a propósito:
//   · `coachActual()` es la cuenta fija del coach, no una sesión.
//   · `createAiProposal` añade el contexto del EPISODIO que está corriendo
//     (`episodioId`, `autor`, `politica`) y, en modo sombra, guarda la propuesta
//     como `sombra` para que no aparezca pendiente en la bandeja.
import type {
  AiProposal, AthleteDietConfig, AthleteDossier, AthleteNutritionConfig, BodyMeasurement, BodyweightLog,
  CardioAssignment, CardioSession, CoachClientTask, CoachReport, Diet, DietCompletionLog, DossierFact, Exercise,
  KnowledgeNote, MealItem, Mesocycle, NutritionProgram, OnboardingData, OnboardingTemplate, PhotoAssignment,
  PoliticaPropuesta, ProgressPhoto, Questionnaire, QuestionnaireAssignment, QuestionnaireResponse, Roadmap, StepLog,
  TaskItem, UserProfile, WeeklyChallenge, WeightCheckIn, Workout, WorkoutAssignment, WorkoutLog, AutorPropuesta,
} from '../../src/types.js';
import type { FuenteDeDatos } from '../../src/ai/tools/datos.js';
import { normalizeMuscleGroups } from '../../src/utils/normalizeMuscleGroups.js';
import { fijarAlViernes } from '../../src/utils/questionnaireSchedule.js';
import { normalizarFicha, MAX_HECHOS_FICHA } from '../../src/utils/fichaViva.js';
import { VOLUME_LANDMARKS_DEFAULT } from '../../src/data/volumeLandmarks.js';
import { hoyIsoLocal, addDays } from '../../src/utils/trainingWeek.js';
import { COACH_EMAIL, getAdminDb } from './auth.js';
import { normalizarPolitica, type PoliticaAutopiloto } from '../../src/autopiloto/politica.js';

type Firestore = NonNullable<Awaited<ReturnType<typeof getAdminDb>>>;
type Doc = { id: string; data(): unknown; exists: boolean };

const conId = <T>(d: { id: string; data(): unknown }): T => ({ id: d.id, ...(d.data() as object) } as T);

function sinIndefinidos<T>(obj: T): T {
  if (Array.isArray(obj)) return obj.map(sinIndefinidos) as unknown as T;
  if (obj && typeof obj === 'object' && !(obj instanceof Date)) {
    const salida: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) if (v !== undefined) salida[k] = sinIndefinidos(v);
    return salida as T;
  }
  return obj;
}

/** `Timestamp` de Firestore (admin) → Date; cadenas y números también. */
function aFecha(v: unknown): Date {
  const t = v as { toDate?: () => Date } | string | number | undefined;
  const d = t && typeof t === 'object' && typeof t.toDate === 'function' ? t.toDate() : new Date(t as string);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

/** Lo que el episodio en curso quiere que lleve cada propuesta que se cree. */
export interface ContextoDeEpisodio {
  episodioId: string;
  autor: AutorPropuesta;
  politica: PoliticaPropuesta;
}
let contexto: ContextoDeEpisodio | null = null;
export function fijarContextoDeEpisodio(c: ContextoDeEpisodio | null): void { contexto = c; }

export function fuenteAdmin(db: Firestore, coachUid: string): FuenteDeDatos {
  const col = (nombre: string) => db.collection(nombre);
  const todos = async <T>(nombre: string, ...filtros: [string, FirebaseFirestore.WhereFilterOp, unknown][]): Promise<T[]> => {
    let q: FirebaseFirestore.Query = col(nombre);
    for (const [campo, op, valor] of filtros) q = q.where(campo, op, valor);
    return (await q.get()).docs.map(d => conId<T>(d));
  };
  const uno = async (nombre: string, id: string): Promise<Doc> => {
    const s = await col(nombre).doc(id).get();
    return { id: s.id, data: () => s.data(), exists: s.exists };
  };

  return {
    coachActual: () => ({ uid: coachUid, email: COACH_EMAIL }),
    isLocalBypassActive: () => false,

    // ── Perfiles y alta ─────────────────────────────────────────────────────
    getAllUserProfiles: () => todos<UserProfile>('user_profiles'),
    getUserProfileByEmail: async email => {
      const normal = email.toLowerCase();
      const exacto = await todos<UserProfile>('user_profiles', ['email', '==', email]);
      if (exacto[0]) return exacto[0];
      return (await todos<UserProfile>('user_profiles')).find(p => p.email?.toLowerCase() === normal) ?? null;
    },
    getOnboarding: async email => {
      const s = await uno('onboarding', email);
      return s.exists ? ({ athleteId: email, ...(s.data() as object) } as OnboardingData) : null;
    },
    getOnboardingTemplate: async coachEmail => {
      const s = await uno('onboardingTemplates', coachEmail);
      return s.exists ? (s.data() as OnboardingTemplate) : null;
    },

    // ── Check-ins y cuestionarios ────────────────────────────────────────────
    getCheckIns: async userId => {
      const docs = userId
        ? (await col('checkins').where('userId', '==', userId).get()).docs
        : (await col('checkins').orderBy('timestamp', 'desc').limit(300).get()).docs;
      return docs
        .map(d => { const data = d.data() as Record<string, unknown>; return { id: d.id, ...data, timestamp: aFecha(data.timestamp), ...(data.approvedAt ? { approvedAt: aFecha(data.approvedAt) } : {}) } as WeightCheckIn; })
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    },
    getResponsesForAthlete: async email => {
      // Igual que el cliente (26 semanas): sin exigir el índice, se filtra en memoria.
      const desde = new Date(Date.now() - 26 * 7 * 864e5).toISOString();
      return (await todos<QuestionnaireResponse>('questionnaireResponses', ['athleteId', '==', email]))
        .filter(r => (r.submittedAt ?? '') >= desde)
        .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
    },
    getAssignmentsForAthlete: async email =>
      (await todos<QuestionnaireAssignment>('questionnaireAssignments', ['athleteId', '==', email])).map(a => fijarAlViernes(a)),
    getQuestionnairesByCoach: uid => todos<Questionnaire>('questionnaires', ['ownerId', '==', uid]),

    // ── Entrenamiento ────────────────────────────────────────────────────────
    getWorkouts: () => todos<Workout>('workouts'),
    getExercises: () => todos<Exercise>('exercises'),
    getWorkoutAssignments: async claves => {
      if (!claves) return todos<WorkoutAssignment>('workoutAssignments');
      const ids = [...new Set([claves.email, claves.uid].filter(Boolean))];
      return todos<WorkoutAssignment>('workoutAssignments', ['athleteId', 'in', ids]);
    },
    getWorkoutAssignmentsByMesocycleIds: async ids => {
      const out: WorkoutAssignment[] = [];
      for (let i = 0; i < ids.length; i += 30) out.push(...await todos<WorkoutAssignment>('workoutAssignments', ['mesocycleId', 'in', ids.slice(i, i + 30)]));
      return out;
    },
    getWorkoutLogs: async (athleteId, ventana) => {
      let q: FirebaseFirestore.Query = col('workoutLogs');
      if (athleteId) q = q.where('athleteId', '==', athleteId);
      if (ventana) q = q.where('date', '>=', ventana.desde).orderBy('date', 'desc').limit(ventana.limite ?? 200);
      return (await q.get()).docs.map(d => conId<WorkoutLog>(d));
    },
    getMesocycles: async email => (await todos<Mesocycle>('mesocycles', ['athleteId', '==', email]))
      .map(m => ({ ...m, groups: normalizeMuscleGroups(m.groups) })),
    getCardioAssignmentsForAthlete: email => todos<CardioAssignment>('cardioAssignments', ['athleteId', '==', email]),
    getCardioSessionsForAthlete: email => todos<CardioSession>('cardioSessions', ['athleteId', '==', email]),
    getRepartosGuardados: ownerId => todos('repartosGuardados', ['ownerId', '==', ownerId]) as never,

    // ── Nutrición ────────────────────────────────────────────────────────────
    getDietsForAthlete: email => todos<Diet>('diets', ['athleteId', '==', email]),
    getDietCompletionLogsForAthlete: async (email, desde) => {
      const hoy = hoyIsoLocal();
      const filtros: [string, FirebaseFirestore.WhereFilterOp, unknown][] = [['athleteId', '==', email]];
      if (desde) filtros.push(['date', '>=', desde]);
      return (await todos<DietCompletionLog>('dietCompletionLogs', ...filtros)).filter(l => l.date <= hoy).sort((a, b) => a.date.localeCompare(b.date));
    },
    getAthleteNutritionConfig: async email => {
      const s = await uno('athleteNutritionConfigs', email);
      return s.exists ? ({ athleteId: email, ...(s.data() as object) } as AthleteNutritionConfig) : { athleteId: email, enabledModes: ['OMNIVORO'] };
    },
    getAthleteDietConfig: async email => {
      const s = await uno('athleteDietConfigs', email);
      return s.exists ? ({ athleteId: email, ...(s.data() as object) } as AthleteDietConfig) : { athleteId: email, activeDietIds: [] };
    },
    getNutritionProgram: async email => {
      const s = await uno('nutritionPrograms', email);
      return s.exists ? ({ athleteId: email, ...(s.data() as object) } as NutritionProgram) : null;
    },
    getFoodItems: () => todos<MealItem>('foodItems'),
    getAlimentosPersonales: async email => {
      if (!email) return [];
      const s = await uno('alimentosPersonales', email);
      const foods = s.exists ? ((s.data() as { foods?: MealItem[] }).foods ?? []) : [];
      return foods.map(f => ({ ...f, personal: true }));
    },

    // ── Cuerpo, pasos, fotos ─────────────────────────────────────────────────
    getBodyweightForAthlete: async (email, desde) => {
      const filtros: [string, FirebaseFirestore.WhereFilterOp, unknown][] = [['athleteId', '==', email]];
      if (desde) filtros.push(['date', '>=', desde]);
      return (await todos<BodyweightLog>('bodyweightLogs', ...filtros)).sort((a, b) => a.date.localeCompare(b.date));
    },
    getStepsForAthlete: async (email, desde) => {
      const filtros: [string, FirebaseFirestore.WhereFilterOp, unknown][] = [['athleteId', '==', email]];
      if (desde) filtros.push(['date', '>=', desde]);
      return (await todos<StepLog>('stepLogs', ...filtros)).sort((a, b) => a.date.localeCompare(b.date));
    },
    getBodyMeasurementsForAthlete: async email =>
      (await todos<BodyMeasurement>('bodyMeasurements', ['athleteId', '==', email])).sort((a, b) => a.date.localeCompare(b.date)),
    getProgressPhotos: email => todos<ProgressPhoto>('progressPhotos', ['athleteId', '==', email]),
    getPhotoAssignmentsForAthlete: email => todos<PhotoAssignment>('photoAssignments', ['athleteId', '==', email]),

    // ── Road map, retos, tareas ──────────────────────────────────────────────
    getRoadmap: async email => {
      const s = await uno('roadmaps', email);
      return s.exists ? ({ athleteId: email, ...(s.data() as object) } as Roadmap) : { athleteId: email, items: [] };
    },
    getWeeklyChallenge: async (email, isoWeek) => {
      const s = await uno('weeklyChallenges', `${email}_${isoWeek}`);
      return s.exists ? ({ ...(s.data() as object), id: s.id } as WeeklyChallenge) : null;
    },
    getWeeklyChallengesForAthlete: email => todos<WeeklyChallenge>('weeklyChallenges', ['athleteId', '==', email]),
    getTasksForAthlete: email => todos<TaskItem>('tasks', ['athleteId', '==', email]),
    getCoachClientTasks: email => todos<CoachClientTask>('coachClientTasks', ['athleteId', '==', email]),
    createCoachClientTask: async data => {
      const ref = await col('coachClientTasks').add(sinIndefinidos(data));
      return { id: ref.id, ...data };
    },

    // ── Ficha viva, propuestas, reportes, conocimiento ───────────────────────
    getDossier: async email => {
      const s = await uno('athleteStatus', email);
      return normalizarFicha(s.exists ? (s.data() as Record<string, unknown>) : undefined);
    },
    appendDossierFacts: async (email, nuevos: DossierFact[]) => {
      const s = await uno('athleteStatus', email);
      const actual: AthleteDossier = normalizarFicha(s.exists ? (s.data() as Record<string, unknown>) : undefined);
      if (nuevos.length === 0) return actual;
      const ficha: AthleteDossier = { ...actual, hechos: [...actual.hechos, ...nuevos].slice(-MAX_HECHOS_FICHA), updatedAt: new Date().toISOString() };
      await col('athleteStatus').doc(email).set(sinIndefinidos(ficha), { merge: true });
      return ficha;
    },
    getAiProposalsForAthlete: async email =>
      (await todos<AiProposal>('aiProposals', ['athleteId', '==', email])).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    getApprovedAiProposals: async () =>
      (await todos<AiProposal>('aiProposals', ['status', '==', 'approved'])).sort((a, b) => (b.reviewedAt ?? b.createdAt).localeCompare(a.reviewedAt ?? a.createdAt)),
    createAiProposal: async data => {
      const conContexto: Omit<AiProposal, 'id'> = contexto
        ? {
            ...data,
            episodioId: contexto.episodioId,
            autor: contexto.autor,
            politica: contexto.politica,
            // En sombra la propuesta existe para compararla, no para aprobarla.
            status: contexto.politica === 'sombra' ? 'sombra' : data.status,
          }
        : data;
      const ref = await col('aiProposals').add(sinIndefinidos(conContexto));
      return { id: ref.id, ...conContexto };
    },
    saveCoachReport: async (report: CoachReport) => { await col('coachReports').doc(report.id).set(sinIndefinidos(report)); },
    getKnowledgeNotes: () => todos<KnowledgeNote>('knowledgeBase'),
    getVolumeLandmarks: async () => {
      const s = await uno('coachSettings', 'volumeLandmarks');
      const raw = s.exists ? (s.data() as { table?: unknown }).table ?? s.data() : null;
      return (raw as typeof VOLUME_LANDMARKS_DEFAULT | null) ?? VOLUME_LANDMARKS_DEFAULT;
    },
  };
}

/** El UID del coach, para `ownerId` de rutinas, plantillas y cuestionarios. */
export async function uidDelCoach(db: Firestore): Promise<string> {
  const snap = await db.collection('user_profiles').where('email', '==', COACH_EMAIL).limit(1).get();
  const doc = snap.docs[0];
  if (!doc) throw new Error(`No hay perfil de coach para ${COACH_EMAIL}`);
  return (doc.data() as { userId?: string }).userId ?? doc.id;
}

/** Doctrina guardada por Dani (coachSettings/doctrina*), o el default. */
export async function leerDoctrina(db: Firestore, defaults: { entrenamiento: string; nutricion: string }): Promise<{ entrenamiento: string; nutricion: string }> {
  const [e, n] = await Promise.all([
    db.collection('coachSettings').doc('doctrinaEntrenamiento').get(),
    db.collection('coachSettings').doc('doctrinaNutricion').get(),
  ]);
  const texto = (s: FirebaseFirestore.DocumentSnapshot, porDefecto: string) =>
    s.exists && typeof (s.data() as { text?: unknown }).text === 'string' ? (s.data() as { text: string }).text : porDefecto;
  return { entrenamiento: texto(e, defaults.entrenamiento), nutricion: texto(n, defaults.nutricion) };
}

/** Instrucciones fijas de Dani para el asistente (coachSettings/instructions). */
export async function leerInstruccionesFijas(db: Firestore): Promise<string> {
  const s = await db.collection('coachSettings').doc('instructions').get();
  return s.exists ? ((s.data() as { text?: string }).text ?? '') : '';
}

/** La política del autopiloto que Dani edita en la app (coachSettings/autopiloto). */
export async function leerPoliticaAutopiloto(db: Firestore): Promise<PoliticaAutopiloto> {
  const s = await db.collection('coachSettings').doc('autopiloto').get();
  return normalizarPolitica(s.exists ? s.data() : null);
}

export { addDays };
