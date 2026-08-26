import { db, collection, doc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, query, where, orderBy, limit, documentId } from '../firebase';
import { Exercise, ExercisePersonalNote, Workout, WorkoutAssignment, WorkoutLog, MuscleGroup, Mesocycle, MesocycleTemplate, MuscleGroupConfig, TemplateDay } from '../types';
import {
  forceLocalOnly, setLocalBypassMode, stripUndefined, esFalloDePermisos,
  conTimeout, EscrituraEncolada,
} from './core';
import { SYSTEM_EXERCISES } from '../data';
import { combinarLogs } from './combinarLogs';
import { normalizeMuscleGroups } from '../utils/normalizeMuscleGroups';
import { slugify } from '../utils/maquinaId';
import { exigeUid, exigeEmail } from './clavesDeAtleta';
import { leerCatalogo, marcarCatalogoCambiado } from './catalogoVersionado';

// T14 (18-08): mismo patrón que idDeFoodItem — un ID determinista hace que
// sembrar dos veces sobreescriba en vez de duplicar.
const idDeSystemExercise = (ex: { primaryFocus?: string; name: string }): string =>
  `sys_${slugify(ex.primaryFocus ?? '')}_${slugify(ex.name)}`;

// ─── EXERCISE LIBRARY ─────────────────────────────────────────────────────────

const EXERCISES_LOCAL_KEY = 'enforma_exercises';

function getLocalExercises(): Exercise[] {
  try {
    const raw = localStorage.getItem(EXERCISES_LOCAL_KEY);
    return raw ? (JSON.parse(raw) as Exercise[]) : [];
  } catch (e) {
    return [];
  }
}

function saveLocalExercises(exercises: Exercise[]) {
  try {
    localStorage.setItem(EXERCISES_LOCAL_KEY, JSON.stringify(exercises));
  } catch (e) {}
}

let exercisesCache: Exercise[] | null = null;

export async function getExercises(): Promise<Exercise[]> {
  if (forceLocalOnly) return getLocalExercises();
  if (exercisesCache) return exercisesCache;
  try {
    // `leerCatalogo` sirve la copia local del dispositivo (0 lecturas) cuando
    // su versión coincide con `catalogos/exercises` — antes esto era un
    // `getDocs` completo (1.681 documentos) en CADA sesión de CADA persona.
    const exercises = await leerCatalogo('exercises', 'exercises', d => ({ id: d.id, ...d.data() } as Exercise));
    saveLocalExercises(exercises);
    exercisesCache = exercises;
    return exercises;
  } catch (err) {
    console.warn('getExercises Firestore failed, using local:', err);
    setLocalBypassMode(true, err);
    return getLocalExercises();
  }
}

export async function createExercise(data: Omit<Exercise, 'id'>): Promise<Exercise> {
  exercisesCache = null;
  if (forceLocalOnly) {
    const newEx: Exercise = { ...data, id: `local_ex_${Date.now()}` };
    const list = getLocalExercises();
    list.push(newEx);
    saveLocalExercises(list);
    return newEx;
  }
  try {
    const ref = await addDoc(collection(db, 'exercises'), stripUndefined(data));
    const newEx: Exercise = { ...data, id: ref.id };
    const list = getLocalExercises();
    list.push(newEx);
    saveLocalExercises(list);
    void marcarCatalogoCambiado('exercises');
    return newEx;
  } catch (err) {
    console.warn('createExercise Firestore failed, saving local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    const newEx: Exercise = { ...data, id: `local_ex_${Date.now()}` };
    const list = getLocalExercises();
    list.push(newEx);
    saveLocalExercises(list);
    return newEx;
  }
}

export async function updateExercise(id: string, updates: Partial<Exercise>): Promise<void> {
  exercisesCache = null;
  if (forceLocalOnly) {
    const list = getLocalExercises().map(ex => (ex.id === id ? { ...ex, ...updates } : ex));
    saveLocalExercises(list);
    return;
  }
  try {
    await updateDoc(doc(db, 'exercises', id), stripUndefined(updates) as Record<string, unknown>);
    const list = getLocalExercises().map(ex => (ex.id === id ? { ...ex, ...updates } : ex));
    saveLocalExercises(list);
    void marcarCatalogoCambiado('exercises');
  } catch (err) {
    console.warn('updateExercise Firestore failed, updating local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    const list = getLocalExercises().map(ex => (ex.id === id ? { ...ex, ...updates } : ex));
    saveLocalExercises(list);
  }
}

export async function deleteExercise(id: string): Promise<void> {
  exercisesCache = null;
  if (forceLocalOnly) {
    saveLocalExercises(getLocalExercises().filter(ex => ex.id !== id));
    return;
  }
  try {
    await deleteDoc(doc(db, 'exercises', id));
    saveLocalExercises(getLocalExercises().filter(ex => ex.id !== id));
    void marcarCatalogoCambiado('exercises');
  } catch (err) {
    console.warn('deleteExercise Firestore failed, deleting local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    saveLocalExercises(getLocalExercises().filter(ex => ex.id !== id));
  }
}

// ─── EXERCISE PERSONAL NOTES (per-athlete observation, doc id = `${exerciseId}_${athleteId}`) ──

const LOCAL_EXERCISE_NOTES = 'enforma_exercise_notes_v1';

function getLocalExerciseNotes(): ExercisePersonalNote[] {
  try { return JSON.parse(localStorage.getItem(LOCAL_EXERCISE_NOTES) || '[]'); } catch { return []; }
}
function saveLocalExerciseNotes(list: ExercisePersonalNote[]): void {
  localStorage.setItem(LOCAL_EXERCISE_NOTES, JSON.stringify(list));
}

// Bulk-loads every personalized observation for an athlete (used by the athlete's
// workout player, which needs to look up notes for several exercises at once).
export async function getExerciseNotesForAthlete(athleteId: string): Promise<ExercisePersonalNote[]> {
  if (forceLocalOnly) return getLocalExerciseNotes().filter(n => n.athleteId === athleteId);
  try {
    const snap = await getDocs(query(collection(db, 'exerciseNotes'), where('athleteId', '==', athleteId)));
    const notes = snap.docs.map(d => ({ id: d.id, ...d.data() } as ExercisePersonalNote));
    const others = getLocalExerciseNotes().filter(n => n.athleteId !== athleteId);
    saveLocalExerciseNotes([...others, ...notes]);
    return notes;
  } catch (err) {
    console.warn('getExerciseNotesForAthlete Firestore failed, using local:', err);
    setLocalBypassMode(true, err);
    return getLocalExerciseNotes().filter(n => n.athleteId === athleteId);
  }
}

export async function saveExerciseNote(data: Omit<ExercisePersonalNote, 'id'>): Promise<ExercisePersonalNote> {
  const docId = `${data.exerciseId}_${data.athleteId}`;
  const note: ExercisePersonalNote = { ...data, id: docId };
  if (forceLocalOnly) {
    saveLocalExerciseNotes([...getLocalExerciseNotes().filter(n => n.id !== docId), note]);
    return note;
  }
  try {
    await setDoc(doc(db, 'exerciseNotes', docId), stripUndefined(data));
    saveLocalExerciseNotes([...getLocalExerciseNotes().filter(n => n.id !== docId), note]);
    return note;
  } catch (err) {
    console.warn('saveExerciseNote Firestore failed, saving local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    saveLocalExerciseNotes([...getLocalExerciseNotes().filter(n => n.id !== docId), note]);
    return note;
  }
}

export async function seedExercisesIfEmpty(): Promise<void> {
  if (forceLocalOnly) {
    if (getLocalExercises().length === 0) {
      const seeded = SYSTEM_EXERCISES.map(ex => ({ ...ex, id: idDeSystemExercise(ex) }));
      saveLocalExercises(seeded);
    }
    return;
  }
  try {
    // `limit(1)`: solo hace falta saber si la colección está vacía, no
    // descargarla entera para comprobarlo. Esta era la lectura más cara de
    // toda la app — 1.681 documentos, en CADA montaje de ClientHub,
    // ExerciseLibraryScreen, WorkoutsScreen y ExerciseTriageScreen, dos veces
    // (aquí y en el re-lectura que había al final).
    const probe = await getDocs(query(collection(db, 'exercises'), limit(1)));
    if (probe.empty) {
      // setDoc con ID determinista, no addDoc: mismo motivo que foodItems —
      // dos cargas concurrentes viendo la colección vacía escriben los
      // MISMOS documentos en vez de duplicarlos. seedExercisesIfEmpty se
      // llama en cada montaje de ClientHub, así que la carrera es real.
      for (const ex of SYSTEM_EXERCISES) {
        await setDoc(doc(db, 'exercises', idDeSystemExercise(ex)), stripUndefined(ex));
      }
      exercisesCache = null;
      void marcarCatalogoCambiado('exercises');
    }
    // Ya NO se vuelve a leer la colección entera aquí: si acaba de sembrarse
    // (o ya tenía algo), el `getExercises()` que casi siempre sigue a esta
    // llamada hace su propia lectura, y esa sí pasa por `leerCatalogo` — que
    // la sirve desde la copia local en cuanto la versión coincide.
  } catch (err) {
    // No relanza ante permisos, a diferencia del resto de escrituras de este
    // fichero: lo que se siembra es el catálogo de ejercicios del sistema, no
    // un dato que el usuario acabe de introducir. Aquí no se pierde nada suyo
    // ni se le miente — la app arranca con el catálogo por defecto.
    console.warn('seedExercises Firestore failed, seeding local:', err);
    setLocalBypassMode(true, err);
    if (getLocalExercises().length === 0) {
      const seeded = SYSTEM_EXERCISES.map(ex => ({ ...ex, id: idDeSystemExercise(ex) }));
      saveLocalExercises(seeded);
    }
  }
}

// ─── WORKOUTS ─────────────────────────────────────────────────────────────────

const WORKOUTS_LOCAL_KEY = 'enforma_workouts';

function getLocalWorkouts(): Workout[] {
  try {
    const raw = localStorage.getItem(WORKOUTS_LOCAL_KEY);
    return raw ? (JSON.parse(raw) as Workout[]) : [];
  } catch (e) {
    return [];
  }
}

function saveLocalWorkouts(workouts: Workout[]) {
  try {
    localStorage.setItem(WORKOUTS_LOCAL_KEY, JSON.stringify(workouts));
  } catch (e) {}
}

let workoutsCache: Workout[] | null = null;

export async function getWorkouts(): Promise<Workout[]> {
  if (forceLocalOnly) return getLocalWorkouts();
  if (workoutsCache) return workoutsCache;
  try {
    // Mismo tratamiento que `exercises`/`foodItems`, y por el mismo motivo: esto
    // era un `getDocs` de la colección entera en CADA sesión de CADA persona.
    // Y aquí pesa más que en un catálogo de solo-coach — `getWorkouts()` lo
    // llaman diez pantallas, tres de ellas del atleta (Hoy, Rutinas y Road
    // map), así que la colección se bajaba entera también en el móvil de cada
    // cliente. Es además la que más crece con el uso: una rutina nueva por
    // cada mesociclo de cada atleta, sin techo.
    const workouts = await leerCatalogo('workouts', 'workouts', d => ({ id: d.id, ...d.data() } as Workout));
    saveLocalWorkouts(workouts);
    workoutsCache = workouts;
    return workouts;
  } catch (err) {
    console.warn('getWorkouts Firestore failed, using local:', err);
    setLocalBypassMode(true, err);
    return getLocalWorkouts();
  }
}

// Rutinas de un conjunto de ids concreto — pensada para pantallas de UN
// atleta (Hoy, Entrenamiento, la ficha del coach) que ya tienen las
// asignaciones cargadas y solo necesitan las rutinas que esas asignaciones
// referencian, no la colección entera de TODOS los atletas. `getWorkouts()`
// se queda para donde el coach de verdad necesita el listado global
// (WorkoutsScreen, ExerciseTriageScreen).
export async function getWorkoutsByIds(ids: string[]): Promise<Workout[]> {
  const unicos = Array.from(new Set(ids));
  if (unicos.length === 0) return [];
  if (forceLocalOnly) {
    const local = getLocalWorkouts();
    return unicos.map(id => local.find(w => w.id === id)).filter((w): w is Workout => !!w);
  }
  try {
    const results: Workout[] = [];
    const CHUNK = 30; // límite de Firestore para `in`
    for (let i = 0; i < unicos.length; i += CHUNK) {
      const chunk = unicos.slice(i, i + CHUNK);
      const snap = await getDocs(query(collection(db, 'workouts'), where(documentId(), 'in', chunk)));
      snap.docs.forEach(d => results.push({ id: d.id, ...d.data() } as Workout));
    }
    // Fusiona con la copia local sin pisarla entera — a diferencia de
    // getWorkouts(), esto es un subconjunto y no debe sobrescribir el espejo
    // completo del dispositivo.
    const local = getLocalWorkouts().filter(w => !results.find(r => r.id === w.id));
    saveLocalWorkouts([...local, ...results]);
    return results;
  } catch (err) {
    console.warn('getWorkoutsByIds Firestore failed, using local:', err);
    setLocalBypassMode(true, err);
    const local = getLocalWorkouts();
    return unicos.map(id => local.find(w => w.id === id)).filter((w): w is Workout => !!w);
  }
}

export async function createWorkout(data: Omit<Workout, 'id'>): Promise<Workout> {
  workoutsCache = null;
  if (forceLocalOnly) {
    const newW: Workout = { ...data, id: `local_w_${Date.now()}` };
    const list = getLocalWorkouts();
    list.push(newW);
    saveLocalWorkouts(list);
    return newW;
  }
  try {
    const ref = await addDoc(collection(db, 'workouts'), stripUndefined(data));
    void marcarCatalogoCambiado('workouts');
    const newW: Workout = { ...data, id: ref.id };
    const list = getLocalWorkouts();
    list.push(newW);
    saveLocalWorkouts(list);
    return newW;
  } catch (err) {
    console.warn('createWorkout Firestore failed, saving local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    const newW: Workout = { ...data, id: `local_w_${Date.now()}` };
    const list = getLocalWorkouts();
    list.push(newW);
    saveLocalWorkouts(list);
    return newW;
  }
}

export async function updateWorkout(id: string, updates: Partial<Workout>): Promise<void> {
  workoutsCache = null;
  if (forceLocalOnly) {
    saveLocalWorkouts(getLocalWorkouts().map(w => (w.id === id ? { ...w, ...updates } : w)));
    return;
  }
  try {
    await updateDoc(doc(db, 'workouts', id), stripUndefined(updates) as Record<string, unknown>);
    void marcarCatalogoCambiado('workouts');
    saveLocalWorkouts(getLocalWorkouts().map(w => (w.id === id ? { ...w, ...updates } : w)));
  } catch (err) {
    console.warn('updateWorkout Firestore failed, updating local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    saveLocalWorkouts(getLocalWorkouts().map(w => (w.id === id ? { ...w, ...updates } : w)));
  }
}

export async function deleteWorkout(id: string): Promise<void> {
  workoutsCache = null;
  const dropLocal = () => {
    saveLocalWorkouts(getLocalWorkouts().filter(w => w.id !== id));
    saveLocalAssignments(getLocalAssignments().filter(a => a.workoutId !== id));
  };
  if (forceLocalOnly) { dropLocal(); return; }
  try {
    await deleteDoc(doc(db, 'workouts', id));
    void marcarCatalogoCambiado('workouts');
    // Cascade: remove assignments that reference this workout
    const aSnap = await getDocs(query(collection(db, 'workoutAssignments'), where('workoutId', '==', id)));
    await Promise.all(aSnap.docs.map(d => deleteDoc(d.ref).catch(() => {})));
    dropLocal();
  } catch (err) {
    console.warn('deleteWorkout Firestore failed, deleting local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    dropLocal();
  }
}

// ─── WORKOUT ASSIGNMENTS ──────────────────────────────────────────────────────

const ASSIGNMENTS_LOCAL_KEY = 'enforma_workout_assignments';

function getLocalAssignments(): WorkoutAssignment[] {
  try {
    const raw = localStorage.getItem(ASSIGNMENTS_LOCAL_KEY);
    return raw ? (JSON.parse(raw) as WorkoutAssignment[]) : [];
  } catch (e) {
    return [];
  }
}

function saveLocalAssignments(assignments: WorkoutAssignment[]) {
  try {
    localStorage.setItem(ASSIGNMENTS_LOCAL_KEY, JSON.stringify(assignments));
  } catch (e) {}
}

/**
 * OJO: `athleteId` aquí es el **UID**, no el email — `workoutAssignments` es la
 * única colección así (ver `clavesDeAtleta.ts`). Con un email la consulta
 * devolvería 0 asignaciones sin error, así que se comprueba antes.
 */
export async function getWorkoutAssignments(athleteId?: string): Promise<WorkoutAssignment[]> {
  if (athleteId) exigeUid(athleteId, 'getWorkoutAssignments');
  if (forceLocalOnly) {
    const all = getLocalAssignments();
    return athleteId ? all.filter(a => a.athleteId === athleteId) : all;
  }
  try {
    const colRef = collection(db, 'workoutAssignments');
    const q = athleteId ? query(colRef, where('athleteId', '==', athleteId)) : colRef;
    const snap = await getDocs(q);
    const assignments = snap.docs.map(d => ({ id: d.id, ...d.data() } as WorkoutAssignment));
    // Merge into local cache
    const local = getLocalAssignments().filter(a => !assignments.find(b => b.id === a.id));
    saveLocalAssignments([...local, ...assignments]);
    return assignments;
  } catch (err) {
    console.warn('getWorkoutAssignments Firestore failed, using local:', err);
    setLocalBypassMode(true, err);
    const all = getLocalAssignments();
    return athleteId ? all.filter(a => a.athleteId === athleteId) : all;
  }
}

// Strict athlete query by UID — throws on Firestore failure (no local fallback).
// Firestore rule requires athleteId == request.auth.uid, so the where clause is mandatory.
export async function getWorkoutAssignmentsForAthlete(uid: string): Promise<WorkoutAssignment[]> {
  exigeUid(uid, 'getWorkoutAssignmentsForAthlete');
  const q = query(collection(db, 'workoutAssignments'), where('athleteId', '==', uid));
  const snap = await getDocs(q);
  const assignments = snap.docs.map(d => ({ id: d.id, ...d.data() } as WorkoutAssignment));
  return assignments.sort((a, b) => a.date.localeCompare(b.date));
}

// Load all assignments belonging to a set of mesocycles (avoids the UID vs email mismatch).
export async function getWorkoutAssignmentsByMesocycleIds(mesocycleIds: string[]): Promise<WorkoutAssignment[]> {
  if (mesocycleIds.length === 0) return [];
  if (forceLocalOnly) {
    return getLocalAssignments().filter(a => a.mesocycleId && mesocycleIds.includes(a.mesocycleId));
  }
  try {
    // Firestore 'in' supports up to 30 values; batch if needed.
    const results: WorkoutAssignment[] = [];
    const CHUNK = 30;
    for (let i = 0; i < mesocycleIds.length; i += CHUNK) {
      const chunk = mesocycleIds.slice(i, i + CHUNK);
      const q = query(collection(db, 'workoutAssignments'), where('mesocycleId', 'in', chunk));
      const snap = await getDocs(q);
      snap.docs.forEach(d => results.push({ id: d.id, ...d.data() } as WorkoutAssignment));
    }
    // Merge into local cache
    const local = getLocalAssignments().filter(a => !results.find(b => b.id === a.id));
    saveLocalAssignments([...local, ...results]);
    return results;
  } catch (err) {
    console.warn('getWorkoutAssignmentsByMesocycleIds Firestore failed, using local:', err);
    setLocalBypassMode(true, err);
    return getLocalAssignments().filter(a => a.mesocycleId && mesocycleIds.includes(a.mesocycleId));
  }
}

// Asignaciones de un lote de atletas por UID — para CoachWeekScreen (antes,
// una consulta por atleta con getWorkoutAssignments). Mismo troceo de 30 que
// el resto de consultas 'in'.
export async function getWorkoutAssignmentsForAthletes(athleteUids: string[]): Promise<WorkoutAssignment[]> {
  const unicos = Array.from(new Set(athleteUids));
  if (unicos.length === 0) return [];
  if (forceLocalOnly) {
    return getLocalAssignments().filter(a => unicos.includes(a.athleteId));
  }
  try {
    const results: WorkoutAssignment[] = [];
    const CHUNK = 30;
    for (let i = 0; i < unicos.length; i += CHUNK) {
      const chunk = unicos.slice(i, i + CHUNK);
      const snap = await getDocs(query(collection(db, 'workoutAssignments'), where('athleteId', 'in', chunk)));
      snap.docs.forEach(d => results.push({ id: d.id, ...d.data() } as WorkoutAssignment));
    }
    const local = getLocalAssignments().filter(a => !unicos.includes(a.athleteId));
    saveLocalAssignments([...local, ...results]);
    return results;
  } catch (err) {
    console.warn('getWorkoutAssignmentsForAthletes Firestore failed, using local:', err);
    setLocalBypassMode(true, err);
    return getLocalAssignments().filter(a => unicos.includes(a.athleteId));
  }
}

export async function createWorkoutAssignment(data: Omit<WorkoutAssignment, 'id'>): Promise<WorkoutAssignment> {
  // Escribir con email deja la asignación huérfana PARA SIEMPRE: la regla exige
  // `athleteId == request.auth.uid`, así que el atleta nunca la verá ni podrá
  // marcarla, y nada lo avisa. Peor que un error de lectura.
  exigeUid(data.athleteId, 'createWorkoutAssignment');
  if (forceLocalOnly) {
    const newA: WorkoutAssignment = { ...data, id: `local_a_${Date.now()}` };
    const list = getLocalAssignments();
    list.push(newA);
    saveLocalAssignments(list);
    return newA;
  }
  try {
    const ref = await addDoc(collection(db, 'workoutAssignments'), stripUndefined(data));
    const newA: WorkoutAssignment = { ...data, id: ref.id };
    const list = getLocalAssignments();
    list.push(newA);
    saveLocalAssignments(list);
    return newA;
  } catch (err) {
    console.warn('createWorkoutAssignment Firestore failed, saving local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    const newA: WorkoutAssignment = { ...data, id: `local_a_${Date.now()}` };
    const list = getLocalAssignments();
    list.push(newA);
    saveLocalAssignments(list);
    return newA;
  }
}

export async function updateWorkoutAssignment(id: string, updates: Partial<WorkoutAssignment>): Promise<void> {
  if (forceLocalOnly) {
    saveLocalAssignments(getLocalAssignments().map(a => (a.id === id ? { ...a, ...updates } : a)));
    return;
  }
  const aplicarEnLocal = () =>
    saveLocalAssignments(getLocalAssignments().map(a => (a.id === id ? { ...a, ...updates } : a)));

  try {
    await conTimeout('Actualizar la sesión',
      updateDoc(doc(db, 'workoutAssignments', id), stripUndefined(updates) as Record<string, unknown>));
    aplicarEnLocal();
  } catch (err) {
    // 05-2. Es la segunda escritura de «Terminar sesión», justo después de
    // createWorkoutLog: sin timeout aquí, el arreglo de arriba no serviría de
    // nada porque el spinner se quedaba colgado igual, una línea más abajo.
    if (err instanceof EscrituraEncolada) {
      console.info('updateWorkoutAssignment encolada, sube al recuperar conexión:', id);
      aplicarEnLocal();
      return;
    }
    console.warn('updateWorkoutAssignment Firestore failed, updating local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    aplicarEnLocal();
  }
}

export async function deleteWorkoutAssignment(id: string): Promise<void> {
  if (forceLocalOnly) {
    saveLocalAssignments(getLocalAssignments().filter(a => a.id !== id));
    return;
  }
  try {
    await deleteDoc(doc(db, 'workoutAssignments', id));
    saveLocalAssignments(getLocalAssignments().filter(a => a.id !== id));
  } catch (err) {
    console.warn('deleteWorkoutAssignment Firestore failed, deleting local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    saveLocalAssignments(getLocalAssignments().filter(a => a.id !== id));
  }
}

// ─── WORKOUT LOGS ─────────────────────────────────────────────────────────────

const WORKOUT_LOGS_LOCAL_KEY = 'enforma_workout_logs';

function getLocalWorkoutLogs(): WorkoutLog[] {
  try {
    const raw = localStorage.getItem(WORKOUT_LOGS_LOCAL_KEY);
    return raw ? (JSON.parse(raw) as WorkoutLog[]) : [];
  } catch (e) {
    return [];
  }
}

function saveLocalWorkoutLogs(logs: WorkoutLog[]) {
  try {
    localStorage.setItem(WORKOUT_LOGS_LOCAL_KEY, JSON.stringify(logs));
  } catch (e) {}
}

/**
 * `06-2`. La ventana es OPCIONAL y por defecto no se aplica, a propósito.
 *
 * Un `limit` global habría sido un desastre silencioso: `allTimeBestBefore` y
 * el motor de reportes calculan récords sobre TODO el historial, así que
 * recortar la lectura por defecto habría hecho que un atleta con dos años de
 * entrenamientos «batiera» récords que ya tenía batidos, sin que nada fallara.
 * Por eso la ventana la pide quien sabe que le vale con lo reciente, y no la
 * sufre quien necesita el historial entero.
 */
export interface VentanaDeLogs {
  /** Fecha mínima, `YYYY-MM-DD`. */
  desde: string;
  /** Techo de documentos. Segundo cinturón por si un atleta entrena a diario. */
  limite?: number;
}

export async function getWorkoutLogs(
  athleteId?: string,
  ventana?: VentanaDeLogs,
): Promise<WorkoutLog[]> {
  // `workoutLogs` va por EMAIL, al revés que `workoutAssignments` (que va por
  // UID) — las dos se usan juntas en las mismas pantallas y confundirlas
  // devuelve una lista vacía sin dar error. Ver `clavesDeAtleta.ts`.
  if (athleteId) exigeEmail(athleteId, 'getWorkoutLogs');
  if (forceLocalOnly) {
    const all = getLocalWorkoutLogs();
    const propios = athleteId ? all.filter(l => l.athleteId === athleteId) : all;
    return ventana ? propios.filter(l => l.date >= ventana.desde) : propios;
  }
  try {
    const colRef = collection(db, 'workoutLogs');
    let q = athleteId ? query(colRef, where('athleteId', '==', athleteId)) : query(colRef);
    if (ventana) {
      // Necesita el índice compuesto workoutLogs (athleteId ASC, date DESC),
      // declarado en firestore.indexes.json.
      q = query(q, where('date', '>=', ventana.desde), orderBy('date', 'desc'), limit(ventana.limite ?? 200));
    }
    const snap = await getDocs(q);
    const logs = snap.docs.map(d => ({ id: d.id, ...d.data() } as WorkoutLog));

    // Una lectura con ventana NO puede tocar la copia local: sobrescribiría el
    // espejo completo del dispositivo con un trozo, y de paso `combinarLogs`
    // creería que todo lo que queda fuera de la ventana está «solo en el móvil»
    // y lo mostraría como pendiente de subir. La copia local solo la actualiza
    // quien ha leído entero.
    if (ventana) {
      void reenviarLogsHuérfanos();
      return logs;
    }

    // 03-6. Aquí estaba el agujero: se guardaba `[...locales, ...logs]` y se
    // devolvía SOLO `logs`. Las dos reglas de la mezcla —y el filtro por atleta,
    // que es un guardarraíl de privacidad— viven en `combinarLogs`, con pruebas.
    const { visibles, paraGuardar } = combinarLogs(logs, getLocalWorkoutLogs(), athleteId);
    saveLocalWorkoutLogs(paraGuardar);

    // Lo que quedó de antes de que las escrituras encoladas llevaran id
    // definitivo (05-2) se reenvía en segundo plano.
    void reenviarLogsHuérfanos();

    return visibles;
  } catch (err) {
    console.warn('getWorkoutLogs Firestore failed, using local:', err);
    setLocalBypassMode(true, err);
    const all = getLocalWorkoutLogs();
    const propios = athleteId ? all.filter(l => l.athleteId === athleteId) : all;
    return ventana ? propios.filter(l => l.date >= ventana.desde) : propios;
  }
}

/* ── Reenvío de los logs que se quedaron solo en el dispositivo ──────────────
   `03-6`. Antes de 05-2, un entrenamiento guardado sin conexión recibía un id
   `local_log_<timestamp>` que no correspondía a ningún documento de Firestore,
   y no había en todo el repo ningún mecanismo que lo subiera después: se
   quedaba ahí para siempre.

   Los nuevos ya nacen con su id definitivo y con la mutación encolada en
   IndexedDB, así que suben solos. Esto es para los viejos, los que un cliente
   real puede tener ahora mismo en su móvil. Se ejecuta una vez por sesión,
   detrás de una lectura que ya ha demostrado que hay servidor al otro lado, y
   nunca bloquea a quien lo llama. */

const PREFIJO_HUÉRFANO = 'local_log_';
let reenvíoHecho = false;

async function reenviarLogsHuérfanos(): Promise<void> {
  if (reenvíoHecho) return;
  reenvíoHecho = true;

  const huérfanos = getLocalWorkoutLogs().filter(l => l.id.startsWith(PREFIJO_HUÉRFANO));
  if (huérfanos.length === 0) return;

  console.info(`Reenviando ${huérfanos.length} entrenamiento(s) que se habían quedado en el móvil`);

  for (const log of huérfanos) {
    try {
      const { id: _viejo, ...datos } = log;
      const ref = doc(collection(db, 'workoutLogs'));
      await conTimeout('Reenviar entrenamiento', setDoc(ref, stripUndefined(datos)));

      // Solo se sustituye el id cuando el servidor ha confirmado. Si venció el
      // plazo, se deja como está y se reintenta en la siguiente sesión: cambiar
      // el id de algo que quizá no llegó dejaría un log invisible otra vez.
      saveLocalWorkoutLogs(
        getLocalWorkoutLogs().map(l => (l.id === log.id ? { ...l, id: ref.id } : l))
      );
    } catch (err) {
      // Un fallo aquí no puede tumbar la pantalla: el log sigue en el
      // dispositivo, que es donde estaba, y se reintentará.
      console.warn('No se pudo reenviar un entrenamiento local:', log.id, err);
    }
  }
}

export async function createWorkoutLog(data: Omit<WorkoutLog, 'id'>): Promise<WorkoutLog> {
  // 03-6. Aquí había un atajo `if (forceLocalOnly)` que escribía SOLO en
  // localStorage con un id `local_log_<timestamp>`, y ese era el origen del
  // entrenamiento que nunca llegaba al coach. La bandera de modo local pasa a
  // gobernar únicamente las LECTURAS: para escribir siempre se intenta
  // Firestore, porque con la caché persistente activa el intento no se pierde
  // —queda encolado en IndexedDB y sube al recuperar conexión—, mientras que
  // el atajo garantizaba que no subiera nunca. Cuesta los 8 s del timeout de
  // 05-2 en el peor caso; el atajo costaba el entrenamiento entero.

  // 05-2. El id se reserva ANTES de escribir, con `doc()` en vez de `addDoc()`.
  // Firestore genera los ids en el cliente, así que esto no cuesta una vuelta a
  // la red y a cambio da algo que antes no existía: saber cómo se llama el
  // documento aunque el servidor todavía no haya contestado. Es lo que permite
  // que una escritura encolada guarde su copia local con su id DEFINITIVO y no
  // con un `local_log_<timestamp>` que después nadie sabía reconciliar (03-6).
  const ref = doc(collection(db, 'workoutLogs'));
  const newL: WorkoutLog = { ...data, id: ref.id };
  const guardarCopiaLocal = () => {
    const list = getLocalWorkoutLogs();
    list.push(newL);
    saveLocalWorkoutLogs(list);
  };

  try {
    await conTimeout('Guardar el entrenamiento', setDoc(ref, stripUndefined(data)));
    guardarCopiaLocal();
    return newL;
  } catch (err) {
    // 05-2. Sin red, `setDoc` no resolvía NUNCA: el botón «Terminar sesión» se
    // quedaba en spinner indefinido y el atleta acababa matando la app. Ahora
    // vence a los 8 s, pero vencer no es fallar — la mutación está en IndexedDB
    // con su id y Firestore la subirá sola. Por eso NO se activa el modo local
    // (envenenaría el resto de la sesión) y NO se crea un log paralelo: sería
    // un duplicado del que ya está encolado. Se devuelve como éxito, y quien
    // avisa de que falta sincronizar es el banner, con el contador real de
    // escrituras pendientes.
    if (err instanceof EscrituraEncolada) {
      console.info('createWorkoutLog encolada, sube al recuperar conexión:', ref.id);
      guardarCopiaLocal();
      return newL;
    }
    console.warn('createWorkoutLog Firestore failed, saving local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    guardarCopiaLocal();
    return newL;
  }
}

export async function deleteWorkoutLog(id: string): Promise<void> {
  if (forceLocalOnly) {
    saveLocalWorkoutLogs(getLocalWorkoutLogs().filter(l => l.id !== id));
    return;
  }
  try {
    await deleteDoc(doc(db, 'workoutLogs', id));
    saveLocalWorkoutLogs(getLocalWorkoutLogs().filter(l => l.id !== id));
  } catch (err) {
    console.warn('deleteWorkoutLog Firestore failed, deleting local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    saveLocalWorkoutLogs(getLocalWorkoutLogs().filter(l => l.id !== id));
  }
}

export async function updateWorkoutLog(id: string, updates: Partial<WorkoutLog>): Promise<void> {
  const updated = getLocalWorkoutLogs().map(l => l.id === id ? { ...l, ...updates } : l);
  if (forceLocalOnly) { saveLocalWorkoutLogs(updated); return; }
  try {
    await updateDoc(doc(db, 'workoutLogs', id), stripUndefined(updates) as Record<string, unknown>);
    saveLocalWorkoutLogs(updated);
  } catch (err) {
    console.warn('updateWorkoutLog Firestore failed, updating local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    saveLocalWorkoutLogs(updated);
  }
}


// ─── EXERCISE MIGRATION ───────────────────────────────────────────────────────

function normalizeStr(s: string): string {
  return s.toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

const FOCUS_TO_MUSCLE_GROUP: Record<string, MuscleGroup> = {
  'pecho':           'pecho',
  'dorsal':          'dorsal',
  'espalda':         'dorsal',
  'trapecio':        'trapecio',
  'deltoide_ant':    'deltoide_ant',
  'deltoide_lat':    'deltoide_lat',
  'hombros':         'deltoide_lat',
  'hombro':          'deltoide_lat',
  'deltoides':       'deltoide_lat',
  'hombro lateral':  'deltoide_lat',
  'deltoide_post':   'deltoide_post',
  'hombro posterior':'deltoide_post',
  'biceps':          'biceps',
  'triceps':         'triceps',
  'antebrazo':       'antebrazo',
  'cuadriceps':      'cuadriceps',
  'piernas':         'cuadriceps',
  'quad':            'cuadriceps',
  'isquios':         'isquios',
  'isquiotibiales':  'isquios',
  'femoral':         'isquios',
  'gluteo':          'gluteo',
  'gluteos':         'gluteo',
  'glteos':          'gluteo',
  'aductores':       'aductores',
  'aductor':         'aductores',
  'adductores':      'aductores',
  'gemelo':          'gemelo',
  'gemelos':         'gemelo',
  'pantorrilla':     'gemelo',
  'pantorrillas':    'gemelo',
  'core':            'core',
  'abdomen':         'core',
  'abdominales':     'core',
  'abdominal':       'core',
};

export async function migratePrimaryFocusToMuscleGroup(): Promise<{ updated: number; skipped: number }> {
  const FLAG = 'enforma_migration_muscleGroup_v1';
  if (localStorage.getItem(FLAG) === 'true') return { updated: 0, skipped: 0 };

  let updated = 0;
  let skipped = 0;

  if (forceLocalOnly) {
    const list = getLocalExercises();
    const next = list.map(ex => {
      if (ex.muscleGroup) return ex;
      const key = normalizeStr(ex.primaryFocus ?? '');
      const mg = FOCUS_TO_MUSCLE_GROUP[key];
      if (mg) { updated++; return { ...ex, muscleGroup: mg }; }
      skipped++;
      return ex;
    });
    saveLocalExercises(next);
    localStorage.setItem(FLAG, 'true');
    return { updated, skipped };
  }

  try {
    const snap = await getDocs(collection(db, 'exercises'));
    const writes: Promise<void>[] = [];
    const localUpdates: Record<string, MuscleGroup> = {};

    for (const d of snap.docs) {
      const ex = d.data() as Exercise;
      if (ex.muscleGroup) { skipped++; continue; }
      const key = normalizeStr(ex.primaryFocus ?? '');
      const mg = FOCUS_TO_MUSCLE_GROUP[key];
      if (mg) {
        writes.push(updateDoc(d.ref, { muscleGroup: mg }).catch(() => {}));
        localUpdates[d.id] = mg;
        updated++;
      } else {
        skipped++;
      }
    }

    await Promise.all(writes);

    // Patch local cache
    const localList = getLocalExercises().map(ex =>
      localUpdates[ex.id] ? { ...ex, muscleGroup: localUpdates[ex.id] } : ex
    );
    saveLocalExercises(localList);
    localStorage.setItem(FLAG, 'true');
    if (updated > 0) {
      exercisesCache = null;
      void marcarCatalogoCambiado('exercises');
    }
    console.log(`[migration muscleGroup] updated=${updated} skipped=${skipped}`);
  } catch (err) {
    console.warn('[migration muscleGroup] failed, will retry:', err);
  }

  return { updated, skipped };
}


// ─── DELETE BY MESOCYCLE ──────────────────────────────────────────────────────

export async function deleteWorkoutsByMesocycleId(mesocycleId: string): Promise<void> {
  saveLocalWorkouts(getLocalWorkouts().filter(w => w.mesocycleId !== mesocycleId));
  if (forceLocalOnly) return;
  try {
    const q = query(collection(db, 'workouts'), where('mesocycleId', '==', mesocycleId));
    const snap = await getDocs(q);
    await Promise.all(snap.docs.map(d => deleteDoc(d.ref).catch(() => {})));
  } catch (err) {
    console.warn('deleteWorkoutsByMesocycleId failed:', err);
  }
}

export async function deleteWorkoutAssignmentsByMesocycleId(mesocycleId: string): Promise<void> {
  saveLocalAssignments(getLocalAssignments().filter(a => a.mesocycleId !== mesocycleId));
  if (forceLocalOnly) return;
  try {
    const q = query(collection(db, 'workoutAssignments'), where('mesocycleId', '==', mesocycleId));
    const snap = await getDocs(q);
    await Promise.all(snap.docs.map(d => deleteDoc(d.ref).catch(() => {})));
  } catch (err) {
    console.warn('deleteWorkoutAssignmentsByMesocycleId failed:', err);
  }
}

// ─── STRICT FIRESTORE WRITES (mesocycle generator) ───────────────────────────
// These never fall back to localStorage — they throw on any Firestore failure
// so the caller can surface the real error instead of silently writing local.

export async function deleteWorkoutsByMesocycleIdStrict(mesocycleId: string): Promise<void> {
  saveLocalWorkouts(getLocalWorkouts().filter(w => w.mesocycleId !== mesocycleId));
  const q = query(collection(db, 'workouts'), where('mesocycleId', '==', mesocycleId));
  const snap = await getDocs(q);
  if (snap.size > 0) await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
}

export async function deleteWorkoutAssignmentsByMesocycleIdStrict(mesocycleId: string): Promise<void> {
  saveLocalAssignments(getLocalAssignments().filter(a => a.mesocycleId !== mesocycleId));
  const q = query(collection(db, 'workoutAssignments'), where('mesocycleId', '==', mesocycleId));
  const snap = await getDocs(q);
  if (snap.size > 0) await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
}

export async function createWorkoutStrict(data: Omit<Workout, 'id'>): Promise<Workout> {
  workoutsCache = null;
  const ref = await addDoc(collection(db, 'workouts'), stripUndefined(data));
  void marcarCatalogoCambiado('workouts');
  const workout: Workout = { ...data, id: ref.id };
  const list = getLocalWorkouts();
  list.push(workout);
  saveLocalWorkouts(list);
  return workout;
}

export async function createWorkoutAssignmentStrict(data: Omit<WorkoutAssignment, 'id'>): Promise<WorkoutAssignment> {
  exigeUid(data.athleteId, 'createWorkoutAssignmentStrict');
  const ref = await addDoc(collection(db, 'workoutAssignments'), stripUndefined(data));
  const assignment: WorkoutAssignment = { ...data, id: ref.id };
  const list = getLocalAssignments();
  list.push(assignment);
  saveLocalAssignments(list);
  return assignment;
}


// ─── MESOCYCLES ───────────────────────────────────────────────────────────────

const MESOCYCLES_LOCAL_KEY = 'enforma_mesocycles_v1';

function getLocalMesocycles(): Mesocycle[] {
  try {
    const raw = localStorage.getItem(MESOCYCLES_LOCAL_KEY);
    return raw ? (JSON.parse(raw) as Mesocycle[]) : [];
  } catch { return []; }
}

function setLocalMesocycles(m: Mesocycle[]): void {
  try { localStorage.setItem(MESOCYCLES_LOCAL_KEY, JSON.stringify(m)); } catch {}
}

// T10: nada sale de esta capa con huecos en `groups` — un mesociclo escrito
// antes de un grupo muscular nuevo (p. ej. "aductores") no tiene esa clave, y
// el resto del código la lee sin comprobar (`groups[g].series` directo).
function withNormalizedGroups(m: Mesocycle): Mesocycle {
  return { ...m, groups: normalizeMuscleGroups(m.groups) };
}

export async function getMesocycles(athleteId: string): Promise<Mesocycle[]> {
  if (forceLocalOnly) {
    return getLocalMesocycles().filter(m => m.athleteId === athleteId).map(withNormalizedGroups);
  }
  try {
    const q = query(collection(db, 'mesocycles'), where('athleteId', '==', athleteId));
    const snap = await getDocs(q);
    const list = snap.docs.map(d => withNormalizedGroups({ id: d.id, ...d.data() } as Mesocycle));
    const others = getLocalMesocycles().filter(m => m.athleteId !== athleteId);
    setLocalMesocycles([...others, ...list]);
    return list;
  } catch (err) {
    console.warn('getMesocycles Firestore failed, using local:', err);
    setLocalBypassMode(true, err);
    return getLocalMesocycles().filter(m => m.athleteId === athleteId).map(withNormalizedGroups);
  }
}

// Mesociclos de un lote de atletas — para CoachWeekScreen (antes, una consulta
// por atleta). Firestore no admite `where('athleteId', 'in', chunk)` con más
// de 30 valores, de ahí el troceo.
export async function getMesocyclesForAthletes(athleteIds: string[]): Promise<Mesocycle[]> {
  const unicos = Array.from(new Set(athleteIds));
  if (unicos.length === 0) return [];
  if (forceLocalOnly) {
    return getLocalMesocycles().filter(m => unicos.includes(m.athleteId)).map(withNormalizedGroups);
  }
  try {
    const results: Mesocycle[] = [];
    const CHUNK = 30;
    for (let i = 0; i < unicos.length; i += CHUNK) {
      const chunk = unicos.slice(i, i + CHUNK);
      const snap = await getDocs(query(collection(db, 'mesocycles'), where('athleteId', 'in', chunk)));
      snap.docs.forEach(d => results.push(withNormalizedGroups({ id: d.id, ...d.data() } as Mesocycle)));
    }
    const local = getLocalMesocycles().filter(m => !unicos.includes(m.athleteId));
    setLocalMesocycles([...local, ...results]);
    return results;
  } catch (err) {
    console.warn('getMesocyclesForAthletes Firestore failed, using local:', err);
    setLocalBypassMode(true, err);
    return getLocalMesocycles().filter(m => unicos.includes(m.athleteId)).map(withNormalizedGroups);
  }
}

export async function createMesocycle(data: Omit<Mesocycle, 'id'>): Promise<Mesocycle> {
  const normalized = { ...data, groups: normalizeMuscleGroups(data.groups) };
  if (forceLocalOnly) {
    const m: Mesocycle = { id: `meso_${Date.now()}`, ...normalized };
    setLocalMesocycles([...getLocalMesocycles(), m]);
    return m;
  }
  try {
    const ref = await addDoc(collection(db, 'mesocycles'), stripUndefined(normalized));
    const m: Mesocycle = { id: ref.id, ...normalized };
    setLocalMesocycles([...getLocalMesocycles(), m]);
    return m;
  } catch (err) {
    console.warn('createMesocycle Firestore failed, saving local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    const m: Mesocycle = { id: `meso_${Date.now()}`, ...normalized };
    setLocalMesocycles([...getLocalMesocycles(), m]);
    return m;
  }
}

export async function updateMesocycle(id: string, updates: Partial<Omit<Mesocycle, 'id'>>): Promise<void> {
  // Solo normaliza si esta actualización TOCA `groups` — updates.groups ya
  // viene completo desde MesocycleManager (es el Mesocycle entero menos el
  // id), así que rellenar huecos aquí no pisa una actualización parcial de
  // otro campo.
  const normalizedUpdates = updates.groups
    ? { ...updates, groups: normalizeMuscleGroups(updates.groups) }
    : updates;
  const all = getLocalMesocycles();
  const next = all.map(m => m.id === id ? { ...m, ...normalizedUpdates } : m);
  if (forceLocalOnly) { setLocalMesocycles(next); return; }
  try {
    await updateDoc(doc(db, 'mesocycles', id), stripUndefined(normalizedUpdates) as Record<string, unknown>);
    setLocalMesocycles(next);
  } catch (err) {
    console.warn('updateMesocycle Firestore failed, saving local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    setLocalMesocycles(next);
  }
}

export async function deleteMesocycle(id: string): Promise<void> {
  const filtered = getLocalMesocycles().filter(m => m.id !== id);
  if (forceLocalOnly) { setLocalMesocycles(filtered); return; }
  try {
    await deleteDoc(doc(db, 'mesocycles', id));
    setLocalMesocycles(filtered);
  } catch (err) {
    console.warn('deleteMesocycle Firestore failed, deleting local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    setLocalMesocycles(filtered);
  }
}

// ─── MESOCYCLE TEMPLATES ─────────────────────────────────────────────────────

const MESO_TEMPLATES_LOCAL_KEY = 'enforma_meso_templates_v1';

function getLocalMesoTemplates(): MesocycleTemplate[] {
  try {
    const raw = localStorage.getItem(MESO_TEMPLATES_LOCAL_KEY);
    return raw ? (JSON.parse(raw) as MesocycleTemplate[]) : [];
  } catch { return []; }
}

function setLocalMesoTemplates(t: MesocycleTemplate[]): void {
  try { localStorage.setItem(MESO_TEMPLATES_LOCAL_KEY, JSON.stringify(t)); } catch {}
}

function migrateTemplate(raw: Record<string, unknown>): MesocycleTemplate {
  if (Array.isArray((raw as unknown as MesocycleTemplate).stages)) {
    return raw as unknown as MesocycleTemplate;
  }
  // Old format: root-level weeks/daysPerWeek/groups → wrap in stages[0]
  return {
    id: raw.id as string,
    ownerId: raw.ownerId as string,
    name: raw.name as string,
    description: raw.description as string | undefined,
    stages: [{
      id: `stage_migrated`,
      name: 'Mesociclo 1',
      weeks: (raw.weeks as number) ?? 4,
      daysPerWeek: (raw.daysPerWeek as number) ?? 4,
      groups: raw.groups as Record<MuscleGroup, MuscleGroupConfig>,
      days: raw.days as TemplateDay[] | undefined,
    }],
  };
}

export async function getMesocycleTemplates(ownerId: string): Promise<MesocycleTemplate[]> {
  if (forceLocalOnly) return getLocalMesoTemplates().filter(t => t.ownerId === ownerId).map(t => migrateTemplate(t as unknown as Record<string, unknown>));
  try {
    const q    = query(collection(db, 'mesocycleTemplates'), where('ownerId', '==', ownerId));
    const snap = await getDocs(q);
    const list = snap.docs.map(d => {
      const raw = { id: d.id, ...d.data() } as Record<string, unknown>;
      return migrateTemplate(raw);
    });
    const others = getLocalMesoTemplates().filter(t => t.ownerId !== ownerId);
    setLocalMesoTemplates([...others, ...list]);
    return list;
  } catch (err) {
    console.warn('getMesocycleTemplates Firestore failed, using local:', err);
    setLocalBypassMode(true, err);
    return getLocalMesoTemplates().filter(t => t.ownerId === ownerId).map(t => migrateTemplate(t as unknown as Record<string, unknown>));
  }
}

export async function createMesocycleTemplate(data: Omit<MesocycleTemplate, 'id'>): Promise<MesocycleTemplate> {
  if (forceLocalOnly) {
    const t: MesocycleTemplate = { id: `tpl_${Date.now()}`, ...data };
    setLocalMesoTemplates([...getLocalMesoTemplates(), t]);
    return t;
  }
  try {
    const ref = await addDoc(collection(db, 'mesocycleTemplates'), stripUndefined(data));
    const t: MesocycleTemplate = { id: ref.id, ...data };
    setLocalMesoTemplates([...getLocalMesoTemplates(), t]);
    return t;
  } catch (err) {
    console.warn('createMesocycleTemplate Firestore failed, saving local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    const t: MesocycleTemplate = { id: `tpl_${Date.now()}`, ...data };
    setLocalMesoTemplates([...getLocalMesoTemplates(), t]);
    return t;
  }
}

export async function updateMesocycleTemplate(id: string, updates: Partial<Omit<MesocycleTemplate, 'id'>>): Promise<void> {
  const all  = getLocalMesoTemplates();
  const next = all.map(t => t.id === id ? { ...t, ...updates } : t);
  if (forceLocalOnly) { setLocalMesoTemplates(next); return; }
  try {
    await updateDoc(doc(db, 'mesocycleTemplates', id), stripUndefined(updates) as Record<string, unknown>);
    setLocalMesoTemplates(next);
  } catch (err) {
    console.warn('updateMesocycleTemplate Firestore failed, saving local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    setLocalMesoTemplates(next);
  }
}

export async function deleteMesocycleTemplate(id: string): Promise<void> {
  const filtered = getLocalMesoTemplates().filter(t => t.id !== id);
  if (forceLocalOnly) { setLocalMesoTemplates(filtered); return; }
  try {
    await deleteDoc(doc(db, 'mesocycleTemplates', id));
    setLocalMesoTemplates(filtered);
  } catch (err) {
    console.warn('deleteMesocycleTemplate Firestore failed, deleting local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    setLocalMesoTemplates(filtered);
  }
}

