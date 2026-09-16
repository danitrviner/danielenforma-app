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
  AppNotification, AthleteDietConfig, BodyweightLog, CardioSession, Diet,
  DietCompletionLog, Exercise, LevelLadder, NutritionProgram, Roadmap, StepLog,
  UserProfile, WeeklyChallenge, WorkoutAssignment, WorkoutLog,
} from '../../src/types.js';
import { atletasActivos } from '../../src/utils/atletas.js';
import { getAdminDb } from './auth.js';

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
  return atletasActivos(perfiles).filter(p => p.archivadoCrm !== true);
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
