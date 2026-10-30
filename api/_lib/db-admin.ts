// Lectores y escritores mínimos del latido diario, con el SDK de
// administración.
//
// Vercel ignora en el enrutado todo lo que empiece por `_`, así que esto es un
// módulo, no un endpoint.
//
// Por qué no se reutiliza `src/dbService`: ese módulo es el del NAVEGADOR. Trae
// el SDK de cliente, un espejo en localStorage por cada dominio y el modo
// `forceLocalOnly` que hace que, ante un fallo de permisos, la app siga
// funcionando contra el almacenamiento local. En un proceso de servidor nada de
// eso existe —no hay localStorage, y un fallo de permisos tiene que ser un
// fallo, no un silencio—, así que aquí hay lecturas y escrituras desnudas.
//
// Lo que NO se duplica es la lógica: las reglas de qué hay que hacerle a cada
// atleta viven en `src/utils/latidoDiario.ts` y en `src/utils/motorRetoSemanal.ts`,
// que no saben nada de Firestore. Este fichero solo sabe leer y escribir.
import type {
  AiProposal, AppNotification, AthleteDietConfig, BodyweightLog, CardioSession, Diet, WeightCheckIn,
  SenalesDelAtleta, MensajeCoach,
  DietCompletionLog, Exercise, LevelLadder, NutritionProgram, Roadmap, StepLog,
  UserProfile, WeeklyChallenge, WorkoutAssignment, WorkoutLog,
  Mesocycle, QuestionnaireAssignment, QuestionnaireResponse, Workout, ExperienceLevel, OnboardingData, Questionnaire, WeeklyMenu,
} from '../../src/types.js';
import type { Episodio } from '../../src/autopiloto/episodios.js';
import { atletasActivos } from '../../src/utils/atletas.js';
import { getAdminDb } from './auth.js';
import { isoLocal } from '../../src/utils/trainingWeek.js';

type Firestore = NonNullable<Awaited<ReturnType<typeof getAdminDb>>>;

/** `undefined` no viaja a Firestore: el SDK de administración lo rechaza. */
function sinIndefinidos<T extends object>(obj: T): T {
  const salida: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) salida[k] = v;
  return salida as T;
}

function conId<T>(d: { id: string; data(): unknown }): T {
  return { id: d.id, ...(d.data() as object) } as T;
}

// ─── Lecturas ────────────────────────────────────────────────────────────────

/**
 * Los atletas a los que hay que pasarles el latido.
 *
 * Usa el MISMO filtro que las pantallas del coach (`utils/atletas.ts`): ni
 * anonimizados ni dados de baja. Si el latido usara un criterio propio,
 * acabaría mandándole avisos a gente que el coach ya no ve en su lista, y nadie
 * sabría de dónde salen. Los archivados del CRM también quedan fuera: archivar
 * es «quítamelo de delante», y eso incluye no seguir generándole trabajo.
 */
export async function leerAtletasActivos(db: Firestore): Promise<UserProfile[]> {
  const snap = await db.collection('user_profiles').where('role', '==', 'client').get();
  const perfiles = snap.docs.map(d => conId<UserProfile>(d)).filter(p => !!p.email);
  return atletasActivos(perfiles);
}

export async function leerAsignaciones(
  db: Firestore, email: string, uid: string,
): Promise<WorkoutAssignment[]> {
  // Las dos claves: `workoutAssignments` migró de UID a email en 08-2026 y
  // durante el paso conviven documentos con una y con otra (ver
  // src/db/clavesDeAtleta.ts). Pedir solo una devuelve CERO documentos sin dar
  // error, que es la peor forma de equivocarse aquí.
  const claves = uid && uid !== email ? [email, uid] : [email];
  const snap = await db.collection('workoutAssignments').where('athleteId', 'in', claves).get();
  return snap.docs.map(d => conId<WorkoutAssignment>(d));
}

export async function leerLogsDeEntreno(db: Firestore, email: string): Promise<WorkoutLog[]> {
  const snap = await db.collection('workoutLogs').where('athleteId', '==', email).get();
  return snap.docs.map(d => conId<WorkoutLog>(d));
}

export async function leerPesajes(db: Firestore, email: string, desde?: string): Promise<BodyweightLog[]> {
  let q = db.collection('bodyweightLogs').where('athleteId', '==', email);
  if (desde) q = q.where('date', '>=', desde);
  const snap = await q.get();
  return snap.docs.map(d => conId<BodyweightLog>(d));
}

export async function leerPasos(db: Firestore, email: string, desde?: string): Promise<StepLog[]> {
  let q = db.collection('stepLogs').where('athleteId', '==', email);
  if (desde) q = q.where('date', '>=', desde);
  const snap = await q.get();
  return snap.docs.map(d => conId<StepLog>(d));
}

export async function leerEjercicios(db: Firestore): Promise<Exercise[]> {
  const snap = await db.collection('exercises').get();
  return snap.docs.map(d => conId<Exercise>(d));
}

export async function leerProgramaDeNutricion(
  db: Firestore, email: string,
): Promise<NutritionProgram | null> {
  const snap = await db.collection('nutritionPrograms').doc(email).get();
  if (!snap.exists) return null;
  return { athleteId: email, ...(snap.data() as object) } as NutritionProgram;
}

export async function leerConfigDeDieta(
  db: Firestore, email: string,
): Promise<AthleteDietConfig | null> {
  const snap = await db.collection('athleteDietConfigs').doc(email).get();
  if (!snap.exists) return null;
  return { athleteId: email, ...(snap.data() as object) } as AthleteDietConfig;
}

/** Cuestionarios asignados y activos (recordatorios de la revisión). */
export async function leerCuestionariosAsignados(db: Firestore, email: string): Promise<QuestionnaireAssignment[]> {
  const snap = await db.collection('questionnaireAssignments').where('athleteId', '==', email).where('active', '==', true).get();
  return snap.docs.map(d => conId<QuestionnaireAssignment>(d));
}

/** Respuestas de cuestionario desde una fecha (ISO). */
export async function leerRespuestasDeCuestionarios(db: Firestore, email: string, desde: string): Promise<QuestionnaireResponse[]> {
  // Sin `submittedAt >=` en la consulta: (athleteId, submittedAt) no tiene
  // índice compuesto y la consulta fallaría. Se filtra en memoria.
  const snap = await db.collection('questionnaireResponses').where('athleteId', '==', email).get();
  return snap.docs.map(d => conId<QuestionnaireResponse>(d)).filter(r => (r.submittedAt ?? '') >= desde);
}

export async function leerMesociclos(db: Firestore, email: string): Promise<Mesocycle[]> {
  const snap = await db.collection('mesocycles').where('athleteId', '==', email).get();
  return snap.docs.map(d => conId<Mesocycle>(d));
}

/** Rutinas por id (una lectura por rutina, en un solo viaje). */
export async function leerRutinas(db: Firestore, ids: string[]): Promise<Workout[]> {
  if (ids.length === 0) return [];
  const snaps = await db.getAll(...ids.map(id => db.collection('workouts').doc(id)));
  return snaps.filter(s => s.exists).map(s => conId<Workout>(s));
}

/** La experiencia que declaró el atleta en el alta (para el nivel de retos). */
export async function leerExperiencia(db: Firestore, email: string): Promise<ExperienceLevel | undefined> {
  const snap = await db.collection('onboarding').doc(email).get();
  return snap.exists ? (snap.data() as { experienceLevel?: ExperienceLevel }).experienceLevel : undefined;
}

export async function leerDietas(db: Firestore, email: string): Promise<Diet[]> {
  const snap = await db.collection('diets').where('athleteId', '==', email).get();
  return snap.docs.map(d => conId<Diet>(d));
}

export async function leerRegistrosDeComida(
  db: Firestore, email: string, desde?: string,
): Promise<DietCompletionLog[]> {
  let q = db.collection('dietCompletionLogs').where('athleteId', '==', email);
  if (desde) q = q.where('date', '>=', desde);
  const snap = await q.get();
  return snap.docs.map(d => conId<DietCompletionLog>(d));
}

export async function leerRoadmap(db: Firestore, email: string): Promise<Roadmap | null> {
  const snap = await db.collection('roadmaps').doc(email).get();
  if (!snap.exists) return null;
  return { athleteId: email, ...(snap.data() as object) } as Roadmap;
}

export async function leerRetos(db: Firestore, email: string): Promise<WeeklyChallenge[]> {
  const snap = await db.collection('weeklyChallenges').where('athleteId', '==', email).get();
  return snap.docs.map(d => conId<WeeklyChallenge>(d));
}

export async function leerSesionesDeCardio(
  db: Firestore, email: string, desde?: string,
): Promise<CardioSession[]> {
  let q = db.collection('cardioSessions').where('athleteId', '==', email);
  if (desde) q = q.where('date', '>=', desde);
  const snap = await q.get();
  return snap.docs.map(d => conId<CardioSession>(d));
}

// ─── Escrituras ──────────────────────────────────────────────────────────────

export async function marcarSesionPerdida(db: Firestore, assignmentId: string): Promise<void> {
  await db.collection('workoutAssignments').doc(assignmentId).update({ status: 'perdido' });
}

export async function guardarConfigDeDieta(
  db: Firestore, email: string, activeDietIds: string[],
): Promise<void> {
  await db.collection('athleteDietConfigs').doc(email)
    .set({ athleteId: email, activeDietIds }, { merge: true });
}

export async function marcarFaseVista(
  db: Firestore, email: string, phaseId: string,
): Promise<void> {
  // Merge parcial: reescribir el programa entero desde aquí podría pisar una
  // edición del coach hecha mientras corre el latido.
  await db.collection('nutritionPrograms').doc(email)
    .set({ lastSeenPhaseId: phaseId }, { merge: true });
}

export async function guardarNivelesConseguidos(
  db: Firestore, email: string, ladder: LevelLadder,
): Promise<void> {
  await db.collection('roadmaps').doc(email)
    .set({ levelLadder: sinIndefinidos(ladder) }, { merge: true });
}

/** Señales de acompañamiento del atleta (utils/senalesDelAtleta.ts). Merge:
 *  el perfil lo edita el coach y el atleta a la vez; aquí solo entra este campo. */
export async function guardarSenales(
  db: Firestore, userId: string, senales: SenalesDelAtleta,
): Promise<void> {
  await db.collection('user_profiles').doc(userId).set({ senales }, { merge: true });
}

/** Un borrador de mensaje al atleta (utils/latidoDiario.ts). `create` y no
 *  `set`: si Dani ya lo firmó (o lo borró), la noche siguiente no lo pisa. */
export async function crearMensajeBorrador(
  db: Firestore, mensaje: Omit<MensajeCoach, 'creadoEn'>,
): Promise<boolean> {
  const { id, ...datos } = mensaje;
  try {
    await db.collection('mensajesCoach').doc(id).create(sinIndefinidos({ ...datos, creadoEn: new Date().toISOString() }));
    return true;
  } catch (err) {
    if ((err as { code?: number }).code === 6) return false; // ALREADY_EXISTS
    throw err;
  }
}

export async function actualizarPeldanos(
  db: Firestore, userId: string, peldanos: number,
): Promise<void> {
  await db.collection('user_profiles').doc(userId).set({ level: peldanos }, { merge: true });
}

export async function guardarReto(db: Firestore, challenge: WeeklyChallenge): Promise<void> {
  await db.collection('weeklyChallenges').doc(challenge.id).set(sinIndefinidos(challenge));
}

export async function leerReto(
  db: Firestore, email: string, isoWeek: string,
): Promise<WeeklyChallenge | null> {
  const snap = await db.collection('weeklyChallenges').doc(`${email}_${isoWeek}`).get();
  if (!snap.exists) return null;
  return conId<WeeklyChallenge>({ id: snap.id, data: () => snap.data() });
}

/**
 * Crea el aviso con la clave de deduplicación como id del documento.
 *
 * `create` y no `set`: si ya existe, `create` falla y ahí se queda. Con `set`
 * se reescribiría, y un aviso que el atleta ya había leído volvería a aparecer
 * como no leído cada noche.
 */
export async function crearAvisoUnaVez(
  db: Firestore, dedupeKey: string, data: Omit<AppNotification, 'id'>,
): Promise<void> {
  try {
    await db.collection('notifications').doc(dedupeKey)
      .create(sinIndefinidos({ ...data, id: dedupeKey }));
  } catch {
    // Ya existía: es exactamente lo que se quería evitar, no un error.
  }
}

/**
 * La propuesta ya aplicada que deja el latido para que Dani la vea en «Hecho
 * hoy» y pueda deshacerla. `set` con id determinista: dos pasadas el mismo
 * día no duplican. Si ya existía (segunda pasada), se conserva el snapshot de
 * la primera, que es el «antes» de verdad.
 */
export async function guardarHuellaDelLatido(db: Firestore, id: string, huella: Omit<AiProposal, 'id'>): Promise<void> {
  const ref = db.collection('aiProposals').doc(id);
  const previa = await ref.get();
  if (previa.exists) {
    await ref.set(sinIndefinidos({ summary: huella.summary, cambios: huella.cambios, payload: huella.payload, aplicadaEn: huella.aplicadaEn }), { merge: true });
    return;
  }
  await ref.set(sinIndefinidos({ ...huella, id }));
}

// ─── Alta y cuestionarios (detectores del autopiloto) ─────────────────────────

/** Check-ins del atleta desde una fecha (colección `checkins`, clave `userId` = uid). */
export async function leerCheckIns(db: Firestore, uid: string, desde: string): Promise<WeightCheckIn[]> {
  if (!uid) return [];
  const snap = await db.collection('checkins').where('userId', '==', uid).get();
  const aFecha = (v: unknown): Date => (v && typeof (v as { toDate?: () => Date }).toDate === 'function') ? (v as { toDate: () => Date }).toDate() : new Date(v as string);
  return snap.docs
    .map(d => { const data = d.data() as Record<string, unknown>; return { id: d.id, ...data, timestamp: aFecha(data.timestamp) } as WeightCheckIn; })
    .filter(c => !Number.isNaN(c.timestamp.getTime()) && isoLocal(c.timestamp) >= desde);
}

export async function leerOnboarding(db: Firestore, email: string): Promise<OnboardingData | null> {
  const snap = await db.collection('onboarding').doc(email).get();
  return snap.exists ? ({ athleteId: email, ...(snap.data() as object) } as OnboardingData) : null;
}

export async function leerCuestionariosDelCoach(db: Firestore, coachUid: string): Promise<Questionnaire[]> {
  const snap = await db.collection('questionnaires').where('ownerId', '==', coachUid).get();
  return snap.docs.map(d => conId<Questionnaire>(d));
}

// ─── Episodios del autopiloto ─────────────────────────────────────────────────

/** Encola un episodio. `create` con id determinista: detectar lo mismo dos
 *  veces no duplica, y un episodio ya en curso no se reinicia. */
export async function crearEpisodioUnaVez(db: Firestore, ep: Episodio): Promise<boolean> {
  try {
    await db.collection('episodios').doc(ep.id).create(sinIndefinidos(ep));
    return true;
  } catch {
    return false; // ya existía
  }
}

export async function leerEpisodiosPendientes(db: Firestore, limite: number): Promise<Episodio[]> {
  const snap = await db.collection('episodios').where('estado', 'in', ['pendiente', 'en_curso']).get();
  return snap.docs
    .map(d => conId<Episodio>(d))
    .sort((a, b) => a.prioridad - b.prioridad || a.creadoEn.localeCompare(b.creadoEn))
    .slice(0, limite);
}

/** Episodios parados esperando la decisión de Dani sobre sus propuestas. */
export async function leerEpisodiosEnEspera(db: Firestore): Promise<Episodio[]> {
  const snap = await db.collection('episodios').where('estado', '==', 'escalado').get();
  return snap.docs.map(d => conId<Episodio>(d)).filter(e => (e.esperaPropuestas?.length ?? 0) > 0);
}

export async function leerPropuestasPorId(db: Firestore, ids: string[]): Promise<AiProposal[]> {
  const out: AiProposal[] = [];
  for (const id of ids) {
    const s = await db.collection('aiProposals').doc(id).get();
    if (s.exists) out.push({ id: s.id, ...(s.data() as object) } as AiProposal);
  }
  return out;
}

export async function guardarEpisodio(db: Firestore, ep: Episodio): Promise<void> {
  await db.collection('episodios').doc(ep.id).set(sinIndefinidos(ep));
}

// ─── Menús semanales (publicación automática a las 24 h) ──────────────────────

export async function leerMenusDelAtleta(db: Firestore, email: string): Promise<WeeklyMenu[]> {
  const snap = await db.collection('weeklyMenus').where('athleteId', '==', email).get();
  return snap.docs.map(d => conId<WeeklyMenu>(d));
}

/** Publica un menú como lo haría `publishWeeklyMenu` en la app: en un lote,
 *  borrados primero, luego archivar el publicado anterior, luego publicar. */
export async function publicarMenu(db: Firestore, plan: { publicar: { id: string; publishedAt: string }; archivar: string[]; borrar: string[] }): Promise<void> {
  const lote = db.batch();
  for (const id of plan.borrar) lote.delete(db.collection('weeklyMenus').doc(id));
  for (const id of plan.archivar) lote.update(db.collection('weeklyMenus').doc(id), { status: 'archived' });
  lote.update(db.collection('weeklyMenus').doc(plan.publicar.id), { status: 'published', publishedAt: plan.publicar.publishedAt });
  await lote.commit();
}
