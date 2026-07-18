import { db, collection, doc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, query, where } from '../firebase';
import { Exercise, ExercisePersonalNote, Workout, WorkoutAssignment, WorkoutLog, MuscleGroup, Mesocycle, MesocycleTemplate, MuscleGroupConfig, TemplateDay } from '../types';
import { forceLocalOnly, setLocalBypassMode, stripUndefined } from './core';
import { SYSTEM_EXERCISES } from '../data';

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
    const snap = await getDocs(collection(db, 'exercises'));
    const exercises = snap.docs.map(d => ({ id: d.id, ...d.data() } as Exercise));
    saveLocalExercises(exercises);
    exercisesCache = exercises;
    return exercises;
  } catch (err) {
    console.warn('getExercises Firestore failed, using local:', err);
    setLocalBypassMode(true);
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
    return newEx;
  } catch (err) {
    console.warn('createExercise Firestore failed, saving local:', err);
    setLocalBypassMode(true);
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
  } catch (err) {
    console.warn('updateExercise Firestore failed, updating local:', err);
    setLocalBypassMode(true);
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
  } catch (err) {
    console.warn('deleteExercise Firestore failed, deleting local:', err);
    setLocalBypassMode(true);
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
    setLocalBypassMode(true);
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
    setLocalBypassMode(true);
    saveLocalExerciseNotes([...getLocalExerciseNotes().filter(n => n.id !== docId), note]);
    return note;
  }
}

export async function seedExercisesIfEmpty(): Promise<void> {
  exercisesCache = null;
  if (forceLocalOnly) {
    if (getLocalExercises().length === 0) {
      const seeded = SYSTEM_EXERCISES.map((ex, i) => ({ ...ex, id: `system_${i + 1}` }));
      saveLocalExercises(seeded);
    }
    return;
  }
  try {
    const snap = await getDocs(collection(db, 'exercises'));
    if (snap.empty) {
      for (const ex of SYSTEM_EXERCISES) {
        await addDoc(collection(db, 'exercises'), stripUndefined(ex));
      }
    }
    const after = await getDocs(collection(db, 'exercises'));
    const seeded = after.docs.map(d => ({ id: d.id, ...d.data() } as Exercise));
    saveLocalExercises(seeded);
  } catch (err) {
    console.warn('seedExercises Firestore failed, seeding local:', err);
    setLocalBypassMode(true);
    if (getLocalExercises().length === 0) {
      const seeded = SYSTEM_EXERCISES.map((ex, i) => ({ ...ex, id: `system_${i + 1}` }));
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
    const snap = await getDocs(collection(db, 'workouts'));
    const workouts = snap.docs.map(d => ({ id: d.id, ...d.data() } as Workout));
    saveLocalWorkouts(workouts);
    workoutsCache = workouts;
    return workouts;
  } catch (err) {
    console.warn('getWorkouts Firestore failed, using local:', err);
    setLocalBypassMode(true);
    return getLocalWorkouts();
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
    const newW: Workout = { ...data, id: ref.id };
    const list = getLocalWorkouts();
    list.push(newW);
    saveLocalWorkouts(list);
    return newW;
  } catch (err) {
    console.warn('createWorkout Firestore failed, saving local:', err);
    setLocalBypassMode(true);
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
    saveLocalWorkouts(getLocalWorkouts().map(w => (w.id === id ? { ...w, ...updates } : w)));
  } catch (err) {
    console.warn('updateWorkout Firestore failed, updating local:', err);
    setLocalBypassMode(true);
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
    // Cascade: remove assignments that reference this workout
    const aSnap = await getDocs(query(collection(db, 'workoutAssignments'), where('workoutId', '==', id)));
    await Promise.all(aSnap.docs.map(d => deleteDoc(d.ref).catch(() => {})));
    dropLocal();
  } catch (err) {
    console.warn('deleteWorkout Firestore failed, deleting local:', err);
    setLocalBypassMode(true);
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

export async function getWorkoutAssignments(athleteId?: string): Promise<WorkoutAssignment[]> {
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
    setLocalBypassMode(true);
    const all = getLocalAssignments();
    return athleteId ? all.filter(a => a.athleteId === athleteId) : all;
  }
}

// Strict athlete query by UID — throws on Firestore failure (no local fallback).
// Firestore rule requires athleteId == request.auth.uid, so the where clause is mandatory.
export async function getWorkoutAssignmentsForAthlete(uid: string): Promise<WorkoutAssignment[]> {
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
    setLocalBypassMode(true);
    return getLocalAssignments().filter(a => a.mesocycleId && mesocycleIds.includes(a.mesocycleId));
  }
}

export async function createWorkoutAssignment(data: Omit<WorkoutAssignment, 'id'>): Promise<WorkoutAssignment> {
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
    setLocalBypassMode(true);
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
  try {
    await updateDoc(doc(db, 'workoutAssignments', id), stripUndefined(updates) as Record<string, unknown>);
    saveLocalAssignments(getLocalAssignments().map(a => (a.id === id ? { ...a, ...updates } : a)));
  } catch (err) {
    console.warn('updateWorkoutAssignment Firestore failed, updating local:', err);
    setLocalBypassMode(true);
    saveLocalAssignments(getLocalAssignments().map(a => (a.id === id ? { ...a, ...updates } : a)));
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
    setLocalBypassMode(true);
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

export async function getWorkoutLogs(athleteId?: string): Promise<WorkoutLog[]> {
  if (forceLocalOnly) {
    const all = getLocalWorkoutLogs();
    return athleteId ? all.filter(l => l.athleteId === athleteId) : all;
  }
  try {
    const colRef = collection(db, 'workoutLogs');
    const q = athleteId ? query(colRef, where('athleteId', '==', athleteId)) : colRef;
    const snap = await getDocs(q);
    const logs = snap.docs.map(d => ({ id: d.id, ...d.data() } as WorkoutLog));
    const local = getLocalWorkoutLogs().filter(l => !logs.find(b => b.id === l.id));
    saveLocalWorkoutLogs([...local, ...logs]);
    return logs;
  } catch (err) {
    console.warn('getWorkoutLogs Firestore failed, using local:', err);
    setLocalBypassMode(true);
    const all = getLocalWorkoutLogs();
    return athleteId ? all.filter(l => l.athleteId === athleteId) : all;
  }
}

export async function createWorkoutLog(data: Omit<WorkoutLog, 'id'>): Promise<WorkoutLog> {
  if (forceLocalOnly) {
    const newL: WorkoutLog = { ...data, id: `local_log_${Date.now()}` };
    const list = getLocalWorkoutLogs();
    list.push(newL);
    saveLocalWorkoutLogs(list);
    return newL;
  }
  try {
    const ref = await addDoc(collection(db, 'workoutLogs'), stripUndefined(data));
    const newL: WorkoutLog = { ...data, id: ref.id };
    const list = getLocalWorkoutLogs();
    list.push(newL);
    saveLocalWorkoutLogs(list);
    return newL;
  } catch (err) {
    console.warn('createWorkoutLog Firestore failed, saving local:', err);
    setLocalBypassMode(true);
    const newL: WorkoutLog = { ...data, id: `local_log_${Date.now()}` };
    const list = getLocalWorkoutLogs();
    list.push(newL);
    saveLocalWorkoutLogs(list);
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
    setLocalBypassMode(true);
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
    setLocalBypassMode(true);
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
  const workout: Workout = { ...data, id: ref.id };
  const list = getLocalWorkouts();
  list.push(workout);
  saveLocalWorkouts(list);
  return workout;
}

export async function createWorkoutAssignmentStrict(data: Omit<WorkoutAssignment, 'id'>): Promise<WorkoutAssignment> {
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

export async function getMesocycles(athleteId: string): Promise<Mesocycle[]> {
  if (forceLocalOnly) {
    return getLocalMesocycles().filter(m => m.athleteId === athleteId);
  }
  try {
    const q = query(collection(db, 'mesocycles'), where('athleteId', '==', athleteId));
    const snap = await getDocs(q);
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Mesocycle));
    const others = getLocalMesocycles().filter(m => m.athleteId !== athleteId);
    setLocalMesocycles([...others, ...list]);
    return list;
  } catch (err) {
    console.warn('getMesocycles Firestore failed, using local:', err);
    setLocalBypassMode(true);
    return getLocalMesocycles().filter(m => m.athleteId === athleteId);
  }
}

export async function createMesocycle(data: Omit<Mesocycle, 'id'>): Promise<Mesocycle> {
  if (forceLocalOnly) {
    const m: Mesocycle = { id: `meso_${Date.now()}`, ...data };
    setLocalMesocycles([...getLocalMesocycles(), m]);
    return m;
  }
  try {
    const ref = await addDoc(collection(db, 'mesocycles'), stripUndefined(data));
    const m: Mesocycle = { id: ref.id, ...data };
    setLocalMesocycles([...getLocalMesocycles(), m]);
    return m;
  } catch (err) {
    console.warn('createMesocycle Firestore failed, saving local:', err);
    setLocalBypassMode(true);
    const m: Mesocycle = { id: `meso_${Date.now()}`, ...data };
    setLocalMesocycles([...getLocalMesocycles(), m]);
    return m;
  }
}

export async function updateMesocycle(id: string, updates: Partial<Omit<Mesocycle, 'id'>>): Promise<void> {
  const all = getLocalMesocycles();
  const next = all.map(m => m.id === id ? { ...m, ...updates } : m);
  if (forceLocalOnly) { setLocalMesocycles(next); return; }
  try {
    await updateDoc(doc(db, 'mesocycles', id), stripUndefined(updates) as Record<string, unknown>);
    setLocalMesocycles(next);
  } catch (err) {
    console.warn('updateMesocycle Firestore failed, saving local:', err);
    setLocalBypassMode(true);
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
    setLocalBypassMode(true);
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
    setLocalBypassMode(true);
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
    setLocalBypassMode(true);
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
    setLocalBypassMode(true);
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
    setLocalBypassMode(true);
    setLocalMesoTemplates(filtered);
  }
}

