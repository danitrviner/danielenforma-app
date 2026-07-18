import {
  db,
  auth,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  collection,
  doc,
  getDoc,
  setDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  storage,
  storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
  writeBatch,
} from './firebase';
import { QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { UserProfile, WeightCheckIn, Exercise, ExercisePersonalNote, Workout, WorkoutAssignment, WorkoutLog, MealItem, AthleteNutritionConfig, DietMode, Diet, AthleteDietConfig, DietCompletionLog, Recipe, RecipeFavorites, ProgressPhoto, PhotoView, PhotoAssignment, Mesocycle, MuscleGroup, MuscleGroupConfig, MesocycleTemplate, TemplateStage, TemplateDay, Questionnaire, QuestionnaireAssignment, QuestionnaireResponse, BodyweightLog, StepLog, OnboardingData, NutritionPhase, NutritionProgram, RoadmapItem, Roadmap, LevelLadder, Invite, CoachNote, OnboardingTemplate, AppNotification, TaskItem, Resource, CoachReport, WeeklyChallenge, ChallengeTemplate, CoachClientTask, AiChat, AiProposal, KnowledgeNote, CoachInstructions, CoachQuickReplies, WeeklyMenu, MenuCompletionLog } from './types';
import { SYSTEM_EXERCISES } from './data';
import { SYSTEM_FOODS } from './nutricion_seed_en_forma';
import { compressImage } from './utils/compressImage';
import { markInviteJoined } from './db/invites';
import { forceLocalOnly, stripUndefined, authReady, withAuthRetry, setLocalBypassMode, isLocalBypassActive } from './db/core';

// stripUndefined/authReady/withAuthRetry/forceLocalOnly/setLocalBypassMode/
// isLocalBypassActive movidos a src/db/core.ts (2026-07-18) — es la ÚNICA
// fuente de esa bandera ahora (import de arriba); reexportados aquí para
// que ningún import existente (`from '../dbService'`) tenga que cambiar.
export { setLocalBypassMode, isLocalBypassActive };

// ─── USER PROFILES + CHECKINS ─────────────────────────────────────────────────
// Movido a src/db/profiles.ts (2026-07-18) — reexportado aquí para que ningún
// import existente (`from '../dbService'`) tenga que cambiar.
export {
  getOrCreateUserProfile, getAllUserProfiles, getAllUsersAdmin, updateUserProfile,
  getCheckIns, addWeightCheckIn, submitCoachFeedback, seedInitialCheckinsIfEmpty,
  updateCheckIn, deleteCheckIn,
} from './db/profiles';

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

// ─── FOOD ITEMS ───────────────────────────────────────────────────────────────

const FOOD_ITEMS_LOCAL_KEY = 'enforma_food_items_v2';

function getLocalFoodItems(): MealItem[] {
  try {
    const raw = localStorage.getItem(FOOD_ITEMS_LOCAL_KEY);
    return raw ? (JSON.parse(raw) as MealItem[]) : [];
  } catch (e) {
    return [];
  }
}

function saveLocalFoodItems(items: MealItem[]) {
  try {
    localStorage.setItem(FOOD_ITEMS_LOCAL_KEY, JSON.stringify(items));
  } catch (e) {}
}

let foodItemsCache: MealItem[] | null = null;

export async function getFoodItems(): Promise<MealItem[]> {
  if (forceLocalOnly) return getLocalFoodItems();
  if (foodItemsCache) return foodItemsCache;
  try {
    const snap = await getDocs(collection(db, 'foodItems'));
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as MealItem));
    saveLocalFoodItems(items);
    foodItemsCache = items;
    return items;
  } catch (err) {
    console.warn('getFoodItems Firestore failed, using local:', err);
    setLocalBypassMode(true);
    return getLocalFoodItems();
  }
}

export async function createFoodItem(data: Omit<MealItem, 'id'>): Promise<MealItem> {
  foodItemsCache = null;
  if (forceLocalOnly) {
    const newItem: MealItem = { ...data, id: `local_food_${Date.now()}` };
    saveLocalFoodItems([...getLocalFoodItems(), newItem]);
    return newItem;
  }
  try {
    const ref = await addDoc(collection(db, 'foodItems'), stripUndefined(data));
    const newItem: MealItem = { ...data, id: ref.id };
    saveLocalFoodItems([...getLocalFoodItems(), newItem]);
    return newItem;
  } catch (err) {
    console.warn('createFoodItem Firestore failed, saving local:', err);
    setLocalBypassMode(true);
    const newItem: MealItem = { ...data, id: `local_food_${Date.now()}` };
    saveLocalFoodItems([...getLocalFoodItems(), newItem]);
    return newItem;
  }
}

export async function updateFoodItem(id: string, updates: Partial<MealItem>): Promise<void> {
  foodItemsCache = null;
  if (forceLocalOnly) {
    saveLocalFoodItems(getLocalFoodItems().map(f => (f.id === id ? { ...f, ...updates } : f)));
    return;
  }
  try {
    await updateDoc(doc(db, 'foodItems', id), stripUndefined(updates) as Record<string, unknown>);
    saveLocalFoodItems(getLocalFoodItems().map(f => (f.id === id ? { ...f, ...updates } : f)));
  } catch (err) {
    console.warn('updateFoodItem Firestore failed, updating local:', err);
    setLocalBypassMode(true);
    saveLocalFoodItems(getLocalFoodItems().map(f => (f.id === id ? { ...f, ...updates } : f)));
  }
}

export async function deleteFoodItem(id: string): Promise<void> {
  foodItemsCache = null;
  if (forceLocalOnly) {
    saveLocalFoodItems(getLocalFoodItems().filter(f => f.id !== id));
    return;
  }
  try {
    await deleteDoc(doc(db, 'foodItems', id));
    saveLocalFoodItems(getLocalFoodItems().filter(f => f.id !== id));
  } catch (err) {
    console.warn('deleteFoodItem Firestore failed, deleting local:', err);
    setLocalBypassMode(true);
    saveLocalFoodItems(getLocalFoodItems().filter(f => f.id !== id));
  }
}

export async function seedFoodItemsIfEmpty(): Promise<void> {
  foodItemsCache = null;
  const seeded: MealItem[] = SYSTEM_FOODS.map((f, i) => ({
    id: `system_food_${i + 1}`,
    mode: f.mode,
    category: f.category,
    label: f.label,
  }));

  if (forceLocalOnly) {
    if (getLocalFoodItems().length === 0) {
      saveLocalFoodItems(seeded);
    }
    return;
  }
  try {
    const snap = await getDocs(collection(db, 'foodItems'));
    if (snap.empty) {
      for (const item of seeded) {
        const { id, ...data } = item;
        await addDoc(collection(db, 'foodItems'), stripUndefined(data));
      }
    }
    const after = await getDocs(collection(db, 'foodItems'));
    saveLocalFoodItems(after.docs.map(d => ({ id: d.id, ...d.data() } as MealItem)));
  } catch (err) {
    console.warn('seedFoodItems Firestore failed, seeding local:', err);
    setLocalBypassMode(true);
    if (getLocalFoodItems().length === 0) {
      saveLocalFoodItems(seeded);
    }
  }
}

// ─── ATHLETE NUTRITION CONFIG ─────────────────────────────────────────────────

export async function getAthleteNutritionConfig(athleteEmail: string): Promise<AthleteNutritionConfig> {
  const defaultConfig: AthleteNutritionConfig = { athleteId: athleteEmail, enabledModes: ['OMNIVORO'] };
  const localKey = `enforma_nutri_config_${athleteEmail}`;
  // Stored docs can predate fields (or be flat-out `{}` from an old write) — merge
  // over the defaults and force athleteId so a later save never targets `undefined`.
  const normalize = (data: Partial<AthleteNutritionConfig>): AthleteNutritionConfig =>
    ({ ...defaultConfig, ...data, athleteId: athleteEmail });
  if (forceLocalOnly) {
    try {
      const raw = localStorage.getItem(localKey);
      return raw ? normalize(JSON.parse(raw)) : defaultConfig;
    } catch (e) { return defaultConfig; }
  }
  await authReady;
  try {
    return await withAuthRetry(async () => {
      const docRef = doc(db, 'athleteNutritionConfigs', athleteEmail);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = normalize(snap.data() as Partial<AthleteNutritionConfig>);
        localStorage.setItem(localKey, JSON.stringify(data));
        return data;
      }
      try {
        const raw = localStorage.getItem(localKey);
        if (raw) return normalize(JSON.parse(raw));
      } catch (_) {}
      return defaultConfig;
    });
  } catch (err) {
    console.warn('getAthleteNutritionConfig Firestore failed, using local:', err);
    // Do NOT call setLocalBypassMode(true) here: a rules failure on this collection
    // must not poison writes for unrelated collections (onboarding, workouts, etc.).
    try {
      const raw = localStorage.getItem(localKey);
      return raw ? normalize(JSON.parse(raw)) : defaultConfig;
    } catch (e) { return defaultConfig; }
  }
}

export async function saveAthleteNutritionConfig(config: AthleteNutritionConfig): Promise<void> {
  const localKey = `enforma_nutri_config_${config.athleteId}`;
  const data = { ...config };
  if (forceLocalOnly) {
    localStorage.setItem(localKey, JSON.stringify(data));
    return;
  }
  try {
    await setDoc(doc(db, 'athleteNutritionConfigs', config.athleteId), stripUndefined(data));
    localStorage.setItem(localKey, JSON.stringify(data));
  } catch (err) {
    console.warn('saveAthleteNutritionConfig Firestore failed, saving local:', err);
    setLocalBypassMode(true);
    localStorage.setItem(localKey, JSON.stringify(data));
  }
}

// ─── DIETS ────────────────────────────────────────────────────────────────────

const DIETS_LOCAL_KEY = 'enforma_diets_v1';

function getDietsFromLocal(): Diet[] {
  try {
    const raw = localStorage.getItem(DIETS_LOCAL_KEY);
    return raw ? (JSON.parse(raw) as Diet[]) : [];
  } catch { return []; }
}

function setDietsToLocal(diets: Diet[]): void {
  localStorage.setItem(DIETS_LOCAL_KEY, JSON.stringify(diets));
}

export async function getDietsForAthlete(athleteEmail: string): Promise<Diet[]> {
  if (forceLocalOnly) {
    return getDietsFromLocal().filter(d => d.athleteId === athleteEmail);
  }
  try {
    const q = query(collection(db, 'diets'), where('athleteId', '==', athleteEmail));
    const snap = await getDocs(q);
    const diets = snap.docs.map(d => ({ id: d.id, ...d.data() } as Diet));
    const others = getDietsFromLocal().filter(d => d.athleteId !== athleteEmail);
    setDietsToLocal([...others, ...diets]);
    return diets;
  } catch (err) {
    console.warn('getDietsForAthlete Firestore failed, using local:', err);
    setLocalBypassMode(true);
    return getDietsFromLocal().filter(d => d.athleteId === athleteEmail);
  }
}

export async function createDiet(data: Omit<Diet, 'id'>): Promise<Diet> {
  if (forceLocalOnly) {
    const diet: Diet = { id: `diet_${Date.now()}`, ...data };
    setDietsToLocal([...getDietsFromLocal(), diet]);
    return diet;
  }
  try {
    const ref = await addDoc(collection(db, 'diets'), stripUndefined(data));
    const diet: Diet = { id: ref.id, ...data };
    setDietsToLocal([...getDietsFromLocal(), diet]);
    return diet;
  } catch (err) {
    console.warn('createDiet Firestore failed, saving local:', err);
    setLocalBypassMode(true);
    const diet: Diet = { id: `diet_${Date.now()}`, ...data };
    setDietsToLocal([...getDietsFromLocal(), diet]);
    return diet;
  }
}

export async function updateDiet(id: string, updates: Partial<Diet>): Promise<void> {
  const all = getDietsFromLocal();
  const updated = all.map(d => d.id === id ? { ...d, ...updates } : d);
  if (forceLocalOnly) { setDietsToLocal(updated); return; }
  try {
    await updateDoc(doc(db, 'diets', id), stripUndefined(updates) as Record<string, unknown>);
    setDietsToLocal(updated);
  } catch (err) {
    console.warn('updateDiet Firestore failed, saving local:', err);
    setLocalBypassMode(true);
    setDietsToLocal(updated);
  }
}

export async function deleteDiet(id: string): Promise<void> {
  const filtered = getDietsFromLocal().filter(d => d.id !== id);
  if (forceLocalOnly) { setDietsToLocal(filtered); return; }
  try {
    await deleteDoc(doc(db, 'diets', id));
    setDietsToLocal(filtered);
  } catch (err) {
    console.warn('deleteDiet Firestore failed, deleting local:', err);
    setLocalBypassMode(true);
    setDietsToLocal(filtered);
  }
}

// ─── WEEKLY MENUS ─────────────────────────────────────────────────────────────
// Recipe-first weekly menu generated by the coach (see utils/menuEngine.ts).
// Draft until the coach publishes it; only the published one is athlete-visible
// (mirrors the coachReports draft/sent pattern).

const WEEKLY_MENUS_LOCAL_KEY = 'enforma_weekly_menus_v1';

function getWeeklyMenusFromLocal(): WeeklyMenu[] {
  try {
    const raw = localStorage.getItem(WEEKLY_MENUS_LOCAL_KEY);
    return raw ? (JSON.parse(raw) as WeeklyMenu[]) : [];
  } catch { return []; }
}

function setWeeklyMenusToLocal(menus: WeeklyMenu[]): void {
  localStorage.setItem(WEEKLY_MENUS_LOCAL_KEY, JSON.stringify(menus));
}

// Coach view: all menus (draft/published/archived) for a client. Coach-only —
// the rules let isCoach() read every status, but an athlete calling this would
// have its query rejected (their rule only allows status == 'published'), so
// athletes must use getPublishedMenu instead.
export async function getWeeklyMenusForAthlete(athleteEmail: string): Promise<WeeklyMenu[]> {
  if (forceLocalOnly) {
    return getWeeklyMenusFromLocal().filter(m => m.athleteId === athleteEmail);
  }
  try {
    const q = query(collection(db, 'weeklyMenus'), where('athleteId', '==', athleteEmail));
    const snap = await getDocs(q);
    const menus = snap.docs.map(d => ({ id: d.id, ...d.data() } as WeeklyMenu));
    const others = getWeeklyMenusFromLocal().filter(m => m.athleteId !== athleteEmail);
    setWeeklyMenusToLocal([...others, ...menus]);
    return menus;
  } catch (err) {
    console.warn('getWeeklyMenusForAthlete Firestore failed, using local:', err);
    setLocalBypassMode(true);
    return getWeeklyMenusFromLocal().filter(m => m.athleteId === athleteEmail);
  }
}

// Athlete view: only the currently published menu, if any. Must filter by status
// in the QUERY (not in memory) — the athlete's read rule requires status ==
// 'published', so a query that could surface a draft is rejected wholesale by
// Firestore, which would flip the whole app into offline/local mode.
export async function getPublishedMenu(athleteEmail: string): Promise<WeeklyMenu | null> {
  if (forceLocalOnly) {
    return getWeeklyMenusFromLocal().find(m => m.athleteId === athleteEmail && m.status === 'published') ?? null;
  }
  try {
    const q = query(collection(db, 'weeklyMenus'), where('athleteId', '==', athleteEmail), where('status', '==', 'published'));
    const snap = await getDocs(q);
    const menu = snap.docs.map(d => ({ id: d.id, ...d.data() } as WeeklyMenu))[0] ?? null;
    if (menu) setWeeklyMenusToLocal([...getWeeklyMenusFromLocal().filter(m => m.id !== menu.id), menu]);
    return menu;
  } catch (err) {
    console.warn('getPublishedMenu Firestore failed, using local:', err);
    setLocalBypassMode(true);
    return getWeeklyMenusFromLocal().find(m => m.athleteId === athleteEmail && m.status === 'published') ?? null;
  }
}

export async function createWeeklyMenu(data: Omit<WeeklyMenu, 'id'>): Promise<WeeklyMenu> {
  if (forceLocalOnly) {
    const menu: WeeklyMenu = { id: `menu_${Date.now()}`, ...data };
    setWeeklyMenusToLocal([...getWeeklyMenusFromLocal(), menu]);
    return menu;
  }
  try {
    const ref = await addDoc(collection(db, 'weeklyMenus'), stripUndefined(data));
    const menu: WeeklyMenu = { id: ref.id, ...data };
    setWeeklyMenusToLocal([...getWeeklyMenusFromLocal(), menu]);
    return menu;
  } catch (err) {
    console.warn('createWeeklyMenu Firestore failed, saving local:', err);
    setLocalBypassMode(true);
    const menu: WeeklyMenu = { id: `menu_${Date.now()}`, ...data };
    setWeeklyMenusToLocal([...getWeeklyMenusFromLocal(), menu]);
    return menu;
  }
}

export async function updateWeeklyMenu(id: string, updates: Partial<WeeklyMenu>): Promise<void> {
  const all = getWeeklyMenusFromLocal();
  const updated = all.map(m => m.id === id ? { ...m, ...updates } : m);
  if (forceLocalOnly) { setWeeklyMenusToLocal(updated); return; }
  try {
    await updateDoc(doc(db, 'weeklyMenus', id), stripUndefined(updates) as Record<string, unknown>);
    setWeeklyMenusToLocal(updated);
  } catch (err) {
    console.warn('updateWeeklyMenu Firestore failed, saving local:', err);
    setLocalBypassMode(true);
    setWeeklyMenusToLocal(updated);
  }
}

export async function deleteWeeklyMenu(id: string): Promise<void> {
  const filtered = getWeeklyMenusFromLocal().filter(m => m.id !== id);
  if (forceLocalOnly) { setWeeklyMenusToLocal(filtered); return; }
  try {
    await deleteDoc(doc(db, 'weeklyMenus', id));
    setWeeklyMenusToLocal(filtered);
  } catch (err) {
    console.warn('deleteWeeklyMenu Firestore failed, deleting local:', err);
    setLocalBypassMode(true);
    setWeeklyMenusToLocal(filtered);
  }
}

// Publishing swaps the athlete-visible menu: the previous published menu (if any)
// is archived rather than deleted, so its swapHistory stays available to the coach.
// Archived menus older than 4 weeks are pruned to keep the collection small.
export async function publishWeeklyMenu(menu: WeeklyMenu): Promise<void> {
  const all = await getWeeklyMenusForAthlete(menu.athleteId);
  const now = new Date();
  const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);

  for (const other of all) {
    if (other.id === menu.id) continue;
    if (other.status === 'published') {
      await updateWeeklyMenu(other.id, { status: 'archived' });
    } else if (other.status === 'archived' && new Date(other.createdAt) < fourWeeksAgo) {
      await deleteWeeklyMenu(other.id);
    }
  }

  await updateWeeklyMenu(menu.id, { status: 'published', publishedAt: now.toISOString() });
}

// ─── DIET COMPLETION LOGS (per-athlete-per-day, doc id = `${athleteId}_${date}`) ──

const LOCAL_DIET_COMPLETION_LOGS = 'enforma_diet_completion_logs_v1';

function getLocalDietCompletionLogs(): DietCompletionLog[] {
  try { return JSON.parse(localStorage.getItem(LOCAL_DIET_COMPLETION_LOGS) || '[]'); } catch { return []; }
}
function saveLocalDietCompletionLogs(list: DietCompletionLog[]): void {
  localStorage.setItem(LOCAL_DIET_COMPLETION_LOGS, JSON.stringify(list));
}

export async function getDietCompletionLog(athleteId: string, date: string): Promise<DietCompletionLog | null> {
  const docId = `${athleteId}_${date}`;
  if (forceLocalOnly) return getLocalDietCompletionLogs().find(l => l.id === docId) ?? null;
  try {
    const snap = await getDoc(doc(db, 'dietCompletionLogs', docId));
    if (!snap.exists()) return null;
    const log = { id: snap.id, ...snap.data() } as DietCompletionLog;
    saveLocalDietCompletionLogs([...getLocalDietCompletionLogs().filter(l => l.id !== docId), log]);
    return log;
  } catch (err) {
    console.warn('getDietCompletionLog Firestore failed, using local:', err);
    setLocalBypassMode(true);
    return getLocalDietCompletionLogs().find(l => l.id === docId) ?? null;
  }
}

// Bulk range read for the AI nutrition dashboard's adherence computation.
export async function getDietCompletionLogsForAthlete(athleteId: string): Promise<DietCompletionLog[]> {
  if (forceLocalOnly) {
    return getLocalDietCompletionLogs().filter(l => l.athleteId === athleteId).sort((a, b) => a.date.localeCompare(b.date));
  }
  try {
    const snap = await getDocs(query(collection(db, 'dietCompletionLogs'), where('athleteId', '==', athleteId)));
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as DietCompletionLog)).sort((a, b) => a.date.localeCompare(b.date));
    saveLocalDietCompletionLogs([...getLocalDietCompletionLogs().filter(l => l.athleteId !== athleteId), ...list]);
    return list;
  } catch (err) {
    console.warn('getDietCompletionLogsForAthlete Firestore failed, using local:', err);
    setLocalBypassMode(true);
    return getLocalDietCompletionLogs().filter(l => l.athleteId === athleteId).sort((a, b) => a.date.localeCompare(b.date));
  }
}

export async function saveDietCompletionLog(data: Omit<DietCompletionLog, 'id'>): Promise<DietCompletionLog> {
  const docId = `${data.athleteId}_${data.date}`;
  const log: DietCompletionLog = { ...data, id: docId };
  if (forceLocalOnly) {
    saveLocalDietCompletionLogs([...getLocalDietCompletionLogs().filter(l => l.id !== docId), log]);
    return log;
  }
  try {
    await setDoc(doc(db, 'dietCompletionLogs', docId), stripUndefined(data));
    saveLocalDietCompletionLogs([...getLocalDietCompletionLogs().filter(l => l.id !== docId), log]);
    return log;
  } catch (err) {
    console.warn('saveDietCompletionLog Firestore failed, saving local:', err);
    setLocalBypassMode(true);
    saveLocalDietCompletionLogs([...getLocalDietCompletionLogs().filter(l => l.id !== docId), log]);
    return log;
  }
}

// ─── MENU COMPLETION LOGS (per-athlete-per-day, doc id = `${athleteId}_${date}`) ──
// Separate from dietCompletionLogs so menu tick-offs never mix with the
// Intercambios tracker (see MenuCompletionLog docstring in types.ts).

const LOCAL_MENU_COMPLETION_LOGS = 'enforma_menu_completion_logs_v1';

function getLocalMenuCompletionLogs(): MenuCompletionLog[] {
  try { return JSON.parse(localStorage.getItem(LOCAL_MENU_COMPLETION_LOGS) || '[]'); } catch { return []; }
}
function saveLocalMenuCompletionLogs(list: MenuCompletionLog[]): void {
  localStorage.setItem(LOCAL_MENU_COMPLETION_LOGS, JSON.stringify(list));
}

export async function getMenuCompletionLog(athleteId: string, date: string): Promise<MenuCompletionLog | null> {
  const docId = `${athleteId}_${date}`;
  if (forceLocalOnly) return getLocalMenuCompletionLogs().find(l => l.id === docId) ?? null;
  try {
    const snap = await getDoc(doc(db, 'menuCompletionLogs', docId));
    if (!snap.exists()) return null;
    const log = { id: snap.id, ...snap.data() } as MenuCompletionLog;
    saveLocalMenuCompletionLogs([...getLocalMenuCompletionLogs().filter(l => l.id !== docId), log]);
    return log;
  } catch (err) {
    console.warn('getMenuCompletionLog Firestore failed, using local:', err);
    setLocalBypassMode(true);
    return getLocalMenuCompletionLogs().find(l => l.id === docId) ?? null;
  }
}

// Bulk range read for menu adherence.
export async function getMenuCompletionLogsForAthlete(athleteId: string): Promise<MenuCompletionLog[]> {
  if (forceLocalOnly) {
    return getLocalMenuCompletionLogs().filter(l => l.athleteId === athleteId).sort((a, b) => a.date.localeCompare(b.date));
  }
  try {
    const snap = await getDocs(query(collection(db, 'menuCompletionLogs'), where('athleteId', '==', athleteId)));
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as MenuCompletionLog)).sort((a, b) => a.date.localeCompare(b.date));
    saveLocalMenuCompletionLogs([...getLocalMenuCompletionLogs().filter(l => l.athleteId !== athleteId), ...list]);
    return list;
  } catch (err) {
    console.warn('getMenuCompletionLogsForAthlete Firestore failed, using local:', err);
    setLocalBypassMode(true);
    return getLocalMenuCompletionLogs().filter(l => l.athleteId === athleteId).sort((a, b) => a.date.localeCompare(b.date));
  }
}

export async function saveMenuCompletionLog(data: Omit<MenuCompletionLog, 'id'>): Promise<MenuCompletionLog> {
  const docId = `${data.athleteId}_${data.date}`;
  const log: MenuCompletionLog = { ...data, id: docId };
  if (forceLocalOnly) {
    saveLocalMenuCompletionLogs([...getLocalMenuCompletionLogs().filter(l => l.id !== docId), log]);
    return log;
  }
  try {
    await setDoc(doc(db, 'menuCompletionLogs', docId), stripUndefined(data));
    saveLocalMenuCompletionLogs([...getLocalMenuCompletionLogs().filter(l => l.id !== docId), log]);
    return log;
  } catch (err) {
    console.warn('saveMenuCompletionLog Firestore failed, saving local:', err);
    setLocalBypassMode(true);
    saveLocalMenuCompletionLogs([...getLocalMenuCompletionLogs().filter(l => l.id !== docId), log]);
    return log;
  }
}

// ─── ATHLETE DIET CONFIG ──────────────────────────────────────────────────────

export async function getAthleteDietConfig(athleteEmail: string): Promise<AthleteDietConfig> {
  const defaultCfg: AthleteDietConfig = { athleteId: athleteEmail, activeDietIds: [] };
  const localKey = `enforma_athlete_diet_config_${athleteEmail}`;
  if (forceLocalOnly) {
    try {
      const raw = localStorage.getItem(localKey);
      return raw ? JSON.parse(raw) : defaultCfg;
    } catch { return defaultCfg; }
  }
  try {
    const snap = await getDoc(doc(db, 'athleteDietConfigs', athleteEmail));
    if (snap.exists()) {
      const data = snap.data() as AthleteDietConfig;
      localStorage.setItem(localKey, JSON.stringify(data));
      return data;
    }
    try {
      const raw = localStorage.getItem(localKey);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return defaultCfg;
  } catch (err) {
    console.warn('getAthleteDietConfig Firestore failed, using local:', err);
    setLocalBypassMode(true);
    try {
      const raw = localStorage.getItem(localKey);
      return raw ? JSON.parse(raw) : defaultCfg;
    } catch { return defaultCfg; }
  }
}

export async function saveAthleteDietConfig(config: AthleteDietConfig): Promise<void> {
  const localKey = `enforma_athlete_diet_config_${config.athleteId}`;
  if (forceLocalOnly) { localStorage.setItem(localKey, JSON.stringify(config)); return; }
  try {
    await setDoc(doc(db, 'athleteDietConfigs', config.athleteId), stripUndefined(config));
    localStorage.setItem(localKey, JSON.stringify(config));
  } catch (err) {
    console.warn('saveAthleteDietConfig Firestore failed, saving local:', err);
    setLocalBypassMode(true);
    localStorage.setItem(localKey, JSON.stringify(config));
  }
}

// ─── NUTRITION PROGRAMS ───────────────────────────────────────────────────────

const LOCAL_NUTPROG = 'enforma_nutrition_programs_v1';

function getLocalNutProgs(): NutritionProgram[] {
  try { return JSON.parse(localStorage.getItem(LOCAL_NUTPROG) || '[]'); } catch { return []; }
}
function saveLocalNutProgs(list: NutritionProgram[]): void {
  localStorage.setItem(LOCAL_NUTPROG, JSON.stringify(list));
}

export async function getNutritionProgram(athleteEmail: string): Promise<NutritionProgram | null> {
  if (forceLocalOnly) {
    return getLocalNutProgs().find(p => p.athleteId === athleteEmail) ?? null;
  }
  try {
    const snap = await getDoc(doc(db, 'nutritionPrograms', athleteEmail));
    if (!snap.exists()) return null;
    return { athleteId: athleteEmail, ...snap.data() } as NutritionProgram;
  } catch (err) {
    console.warn('getNutritionProgram Firestore failed:', err);
    setLocalBypassMode(true);
    return getLocalNutProgs().find(p => p.athleteId === athleteEmail) ?? null;
  }
}

export async function saveNutritionProgram(program: NutritionProgram): Promise<void> {
  const { athleteId, ...rest } = program;
  const data = stripUndefined(rest);
  if (forceLocalOnly) {
    const list = getLocalNutProgs().filter(p => p.athleteId !== athleteId);
    saveLocalNutProgs([...list, program]);
    return;
  }
  try {
    await setDoc(doc(db, 'nutritionPrograms', athleteId), data);
    const list = getLocalNutProgs().filter(p => p.athleteId !== athleteId);
    saveLocalNutProgs([...list, program]);
  } catch (err) {
    console.warn('saveNutritionProgram Firestore failed:', err);
    setLocalBypassMode(true);
    const list = getLocalNutProgs().filter(p => p.athleteId !== athleteId);
    saveLocalNutProgs([...list, program]);
  }
}

// Escritura parcial para el atleta: solo marca la fase vista, sin reescribir el
// programa entero desde su snapshot (que podía revertir ediciones concurrentes
// del coach en la periodización — last-writer-wins sobre el doc completo).
export async function markNutritionPhaseSeen(athleteEmail: string, phaseId: string): Promise<void> {
  const patchLocal = () => {
    const list = getLocalNutProgs();
    const prog = list.find(p => p.athleteId === athleteEmail);
    if (prog) saveLocalNutProgs([...list.filter(p => p.athleteId !== athleteEmail), { ...prog, lastSeenPhaseId: phaseId }]);
  };
  if (forceLocalOnly) { patchLocal(); return; }
  try {
    await setDoc(doc(db, 'nutritionPrograms', athleteEmail), { lastSeenPhaseId: phaseId }, { merge: true });
    patchLocal();
  } catch (err) {
    // Solo afecta al banner de "nueva fase" — si falla, volverá a mostrarse.
    console.warn('markNutritionPhaseSeen Firestore failed:', err);
    patchLocal();
  }
}

export async function deleteNutritionProgram(athleteEmail: string): Promise<void> {
  if (forceLocalOnly) {
    saveLocalNutProgs(getLocalNutProgs().filter(p => p.athleteId !== athleteEmail));
    return;
  }
  try {
    await deleteDoc(doc(db, 'nutritionPrograms', athleteEmail));
    saveLocalNutProgs(getLocalNutProgs().filter(p => p.athleteId !== athleteEmail));
  } catch (err) {
    console.warn('deleteNutritionProgram Firestore failed:', err);
    setLocalBypassMode(true);
    saveLocalNutProgs(getLocalNutProgs().filter(p => p.athleteId !== athleteEmail));
  }
}

// ─── ROADMAPS ─────────────────────────────────────────────────────────────────

const LOCAL_ROADMAP = 'enforma_roadmaps_v1';

function getLocalRoadmaps(): Roadmap[] {
  try { return JSON.parse(localStorage.getItem(LOCAL_ROADMAP) || '[]'); } catch { return []; }
}
function saveLocalRoadmaps(list: Roadmap[]): void {
  localStorage.setItem(LOCAL_ROADMAP, JSON.stringify(list));
}

export async function getRoadmap(athleteEmail: string): Promise<Roadmap> {
  const empty: Roadmap = { athleteId: athleteEmail, items: [] };
  if (forceLocalOnly) {
    return getLocalRoadmaps().find(r => r.athleteId === athleteEmail) ?? empty;
  }
  try {
    const snap = await getDoc(doc(db, 'roadmaps', athleteEmail));
    if (!snap.exists()) return empty;
    return { athleteId: athleteEmail, ...snap.data() } as Roadmap;
  } catch (err) {
    console.warn('getRoadmap Firestore failed:', err);
    setLocalBypassMode(true);
    return getLocalRoadmaps().find(r => r.athleteId === athleteEmail) ?? empty;
  }
}

export async function saveRoadmap(roadmap: Roadmap): Promise<void> {
  const { athleteId, ...rest } = roadmap;
  const data = stripUndefined(rest);
  if (forceLocalOnly) {
    const list = getLocalRoadmaps().filter(r => r.athleteId !== athleteId);
    saveLocalRoadmaps([...list, roadmap]);
    return;
  }
  try {
    await setDoc(doc(db, 'roadmaps', athleteId), data);
    const list = getLocalRoadmaps().filter(r => r.athleteId !== athleteId);
    saveLocalRoadmaps([...list, roadmap]);
  } catch (err) {
    console.warn('saveRoadmap Firestore failed:', err);
    setLocalBypassMode(true);
    const list = getLocalRoadmaps().filter(r => r.athleteId !== athleteId);
    saveLocalRoadmaps([...list, roadmap]);
  }
}

// Escritura parcial para el atleta al subir de nivel: merge solo del campo
// levelLadder, sin tocar items/planPhases/challengeConfig. El saveRoadmap
// completo desde el snapshot del atleta podía revertir ediciones de fases que
// el coach hubiera hecho después de que el atleta cargara la pantalla.
export async function saveRoadmapLevelProgress(athleteEmail: string, ladder: LevelLadder): Promise<void> {
  const patchLocal = () => {
    const list = getLocalRoadmaps();
    const rm = list.find(r => r.athleteId === athleteEmail) ?? { athleteId: athleteEmail, items: [] };
    saveLocalRoadmaps([...list.filter(r => r.athleteId !== athleteEmail), { ...rm, levelLadder: ladder }]);
  };
  if (forceLocalOnly) { patchLocal(); return; }
  try {
    await setDoc(doc(db, 'roadmaps', athleteEmail), { levelLadder: stripUndefined(ladder) }, { merge: true });
    patchLocal();
  } catch (err) {
    // Auto-reparable: los niveles se recalculan de los logs en la próxima visita.
    console.warn('saveRoadmapLevelProgress Firestore failed:', err);
    patchLocal();
  }
}

// ─── WEEKLY CHALLENGES (docId = `${email}_${isoWeek}`) ────────────────────────

const LOCAL_CHALLENGES = 'enforma_weekly_challenges_v1';

function getLocalChallenges(): WeeklyChallenge[] {
  try { return JSON.parse(localStorage.getItem(LOCAL_CHALLENGES) || '[]'); } catch { return []; }
}
function saveLocalChallenges(list: WeeklyChallenge[]): void {
  localStorage.setItem(LOCAL_CHALLENGES, JSON.stringify(list));
}
function upsertLocalChallenge(ch: WeeklyChallenge): void {
  saveLocalChallenges([...getLocalChallenges().filter(c => c.id !== ch.id), ch]);
}

export function weeklyChallengeDocId(athleteEmail: string, isoWeek: string): string {
  return `${athleteEmail}_${isoWeek}`;
}

export async function getWeeklyChallenge(athleteEmail: string, isoWeek: string): Promise<WeeklyChallenge | null> {
  const id = weeklyChallengeDocId(athleteEmail, isoWeek);
  if (forceLocalOnly) {
    return getLocalChallenges().find(c => c.id === id) ?? null;
  }
  try {
    const snap = await getDoc(doc(db, 'weeklyChallenges', id));
    if (!snap.exists()) return null;
    return { ...snap.data(), id } as WeeklyChallenge;
  } catch (err) {
    console.warn('getWeeklyChallenge Firestore failed:', err);
    setLocalBypassMode(true);
    return getLocalChallenges().find(c => c.id === id) ?? null;
  }
}

// Blind setDoc sobre ID determinista: un único reto por atleta y semana ISO,
// idempotente para el auto-generador (generate-on-read) y sobrescribible por
// el coach al asignar manualmente.
export async function saveWeeklyChallenge(challenge: WeeklyChallenge): Promise<void> {
  const data = stripUndefined(challenge);
  if (forceLocalOnly) {
    upsertLocalChallenge(challenge);
    return;
  }
  try {
    await setDoc(doc(db, 'weeklyChallenges', challenge.id), data);
    upsertLocalChallenge(challenge);
  } catch (err) {
    console.warn('saveWeeklyChallenge Firestore failed:', err);
    setLocalBypassMode(true);
    upsertLocalChallenge(challenge);
  }
}

export async function getWeeklyChallengesForAthlete(athleteEmail: string): Promise<WeeklyChallenge[]> {
  if (forceLocalOnly) {
    return getLocalChallenges()
      .filter(c => c.athleteId === athleteEmail)
      .sort((a, b) => b.isoWeek.localeCompare(a.isoWeek));
  }
  try {
    const snap = await getDocs(
      query(collection(db, 'weeklyChallenges'), where('athleteId', '==', athleteEmail))
    );
    const list = snap.docs.map(d => ({ ...d.data(), id: d.id } as WeeklyChallenge));
    list.sort((a, b) => b.isoWeek.localeCompare(a.isoWeek));
    return list;
  } catch (err) {
    console.warn('getWeeklyChallengesForAthlete Firestore failed:', err);
    setLocalBypassMode(true);
    return getLocalChallenges()
      .filter(c => c.athleteId === athleteEmail)
      .sort((a, b) => b.isoWeek.localeCompare(a.isoWeek));
  }
}

// ─── CHALLENGE TEMPLATES (biblioteca de retos del coach) ──────────────────────

const LOCAL_CHALLENGE_TEMPLATES = 'enforma_challenge_templates_v1';

function getLocalChallengeTemplates(): ChallengeTemplate[] {
  try { return JSON.parse(localStorage.getItem(LOCAL_CHALLENGE_TEMPLATES) || '[]'); } catch { return []; }
}
function saveLocalChallengeTemplates(list: ChallengeTemplate[]): void {
  localStorage.setItem(LOCAL_CHALLENGE_TEMPLATES, JSON.stringify(list));
}

export async function getChallengeTemplates(): Promise<ChallengeTemplate[]> {
  if (forceLocalOnly) return getLocalChallengeTemplates();
  try {
    const snap = await getDocs(collection(db, 'challengeTemplates'));
    const list = snap.docs.map(d => ({ ...d.data(), id: d.id } as ChallengeTemplate));
    list.sort((a, b) => a.title.localeCompare(b.title));
    saveLocalChallengeTemplates(list);
    return list;
  } catch (err) {
    console.warn('getChallengeTemplates Firestore failed:', err);
    setLocalBypassMode(true);
    return getLocalChallengeTemplates();
  }
}

export async function saveChallengeTemplate(template: ChallengeTemplate): Promise<void> {
  const data = stripUndefined(template);
  const upsertLocal = () =>
    saveLocalChallengeTemplates([...getLocalChallengeTemplates().filter(t => t.id !== template.id), template]);
  if (forceLocalOnly) {
    upsertLocal();
    return;
  }
  try {
    await setDoc(doc(db, 'challengeTemplates', template.id), data);
    upsertLocal();
  } catch (err) {
    console.warn('saveChallengeTemplate Firestore failed:', err);
    setLocalBypassMode(true);
    upsertLocal();
  }
}

export async function deleteChallengeTemplate(templateId: string): Promise<void> {
  const removeLocal = () =>
    saveLocalChallengeTemplates(getLocalChallengeTemplates().filter(t => t.id !== templateId));
  if (forceLocalOnly) {
    removeLocal();
    return;
  }
  try {
    await deleteDoc(doc(db, 'challengeTemplates', templateId));
    removeLocal();
  } catch (err) {
    console.warn('deleteChallengeTemplate Firestore failed:', err);
    setLocalBypassMode(true);
    removeLocal();
  }
}

// ─── CLIENT INVITES (coach-only, doc id = email) ──────────────────────────────
// Movido a src/db/invites.ts (2026-07-18) — reexportado aquí para que ningún
// import existente (`from '../dbService'`) tenga que cambiar.
export { inviteClient, getPendingInvites, markInviteJoined } from './db/invites';

export function computeActivePhase(program: NutritionProgram, today: string): NutritionPhase | null {
  if (!program.phases.length || !program.startDate) return null;
  let cursor = new Date(program.startDate + 'T00:00:00');
  for (const phase of program.phases) {
    const phaseEnd = new Date(cursor);
    phaseEnd.setDate(phaseEnd.getDate() + phase.weeks * 7);
    const todayDate = new Date(today + 'T00:00:00');
    if (todayDate >= cursor && todayDate < phaseEnd) return phase;
    cursor = phaseEnd;
  }
  return null;
}

export function computePhaseStartDate(program: NutritionProgram, phaseIdx: number): string {
  const cursor = new Date(program.startDate + 'T00:00:00');
  for (let i = 0; i < phaseIdx; i++) {
    cursor.setDate(cursor.getDate() + program.phases[i].weeks * 7);
  }
  return cursor.toISOString().split('T')[0];
}

// ─── RECIPES ─────────────────────────────────────────────────────────────────
// Movido a src/db/recipes.ts (2026-07-18) — reexportado aquí para que ningún
// import existente (`from '../dbService'`) tenga que cambiar.
export { getRecipes, getRecipeById, queryIndyaRecipes, createRecipe, updateRecipe, deleteRecipe, getRecipeFavorites, saveRecipeFavorites } from './db/recipes';
export type { IndyaRecipeCursor, IndyaRecipeFilters } from './db/recipes';

// ─── PROGRESS PHOTOS ──────────────────────────────────────────────────────────

export async function getProgressPhotos(athleteEmail: string): Promise<ProgressPhoto[]> {
  try {
    const snap = await getDocs(
      query(collection(db, 'progressPhotos'), where('athleteId', '==', athleteEmail))
    );
    return snap.docs
      .map(d => d.data() as ProgressPhoto)
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch (err) {
    console.warn('getProgressPhotos failed:', err);
    return [];
  }
}

export async function uploadProgressPhoto(
  athleteEmail: string,
  date: string,
  view: PhotoView,
  file: File
): Promise<ProgressPhoto> {
  const path = `progressPhotos/${athleteEmail}/${date}_${view}`;
  const sRef = storageRef(storage, path);
  const uploadData = await compressImage(file);
  await uploadBytes(sRef, uploadData);
  const url = await getDownloadURL(sRef);
  const photo: ProgressPhoto = {
    id: `${athleteEmail}_${date}_${view}`,
    athleteId: athleteEmail,
    date,
    view,
    url,
    uploadedAt: new Date().toISOString(),
  };
  await setDoc(doc(db, 'progressPhotos', photo.id), stripUndefined(photo));
  return photo;
}

export async function deleteProgressPhoto(photo: ProgressPhoto): Promise<void> {
  const path = `progressPhotos/${photo.athleteId}/${photo.date}_${photo.view}`;
  await deleteObject(storageRef(storage, path)).catch(() => {});
  await deleteDoc(doc(db, 'progressPhotos', photo.id));
}

// ─── PHOTO CHECK-IN ASSIGNMENTS ───────────────────────────────────────────────
// Collection: photoAssignments  (athleteId = email) — same shape/pattern as
// questionnaireAssignments, so the athlete's photo check-ins can have a
// pending/upcoming calendar like questionnaires do.

const LOCAL_PHOTO_ASSIGNMENTS = 'photoAssignments_v1';

function getLocalPhotoAssignments(): PhotoAssignment[] {
  try { return JSON.parse(localStorage.getItem(LOCAL_PHOTO_ASSIGNMENTS) || '[]'); } catch { return []; }
}

export async function assignPhotoCheckIn(data: Omit<PhotoAssignment, 'id'>): Promise<PhotoAssignment> {
  const safeData = { ...data, schedule: data.schedule ?? { type: 'once' as const } };
  if (forceLocalOnly) {
    const a: PhotoAssignment = { ...safeData, id: `local_pa_${Date.now()}` };
    localStorage.setItem(LOCAL_PHOTO_ASSIGNMENTS, JSON.stringify([...getLocalPhotoAssignments(), a]));
    return a;
  }
  try {
    const ref = await addDoc(collection(db, 'photoAssignments'), stripUndefined(safeData));
    return { ...safeData, id: ref.id };
  } catch (err) {
    console.warn('assignPhotoCheckIn Firestore failed, saving local:', err);
    setLocalBypassMode(true);
    const a: PhotoAssignment = { ...safeData, id: `local_pa_${Date.now()}` };
    localStorage.setItem(LOCAL_PHOTO_ASSIGNMENTS, JSON.stringify([...getLocalPhotoAssignments(), a]));
    return a;
  }
}

export async function getPhotoAssignmentsForAthlete(email: string): Promise<PhotoAssignment[]> {
  if (forceLocalOnly) return getLocalPhotoAssignments().filter(a => a.athleteId === email);
  try {
    const snap = await getDocs(query(collection(db, 'photoAssignments'), where('athleteId', '==', email)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as PhotoAssignment));
  } catch (err) {
    console.warn('getPhotoAssignmentsForAthlete Firestore failed, using local:', err);
    setLocalBypassMode(true);
    return getLocalPhotoAssignments().filter(a => a.athleteId === email);
  }
}

export async function deactivatePhotoAssignment(id: string): Promise<void> {
  if (forceLocalOnly) {
    localStorage.setItem(LOCAL_PHOTO_ASSIGNMENTS, JSON.stringify(getLocalPhotoAssignments().map(a => a.id === id ? { ...a, active: false } : a)));
    return;
  }
  try {
    await updateDoc(doc(db, 'photoAssignments', id), { active: false });
  } catch (err) {
    console.warn('deactivatePhotoAssignment Firestore failed:', err);
    setLocalBypassMode(true);
    localStorage.setItem(LOCAL_PHOTO_ASSIGNMENTS, JSON.stringify(getLocalPhotoAssignments().map(a => a.id === id ? { ...a, active: false } : a)));
  }
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

// ─── USER PROFILE BY EMAIL ────────────────────────────────────────────────────

export async function getUserProfileByEmail(email: string): Promise<UserProfile | null> {
  const normalEmail = email.toLowerCase();

  if (forceLocalOnly) {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key?.startsWith('enforma_profile_')) continue;
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const p = JSON.parse(raw) as UserProfile;
        if (p.email.toLowerCase() === normalEmail) return p;
      }
    } catch { }
    return null;
  }

  try {
    const q = query(collection(db, 'user_profiles'), where('email', '==', email));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const d = snap.docs[0];
      return { id: d.id, ...d.data(), userId: d.id } as unknown as UserProfile;
    }
    // Try lowercase variant
    const q2 = query(collection(db, 'user_profiles'), where('email', '==', normalEmail));
    const snap2 = await getDocs(q2);
    if (!snap2.empty) {
      const d = snap2.docs[0];
      return { ...d.data(), userId: d.id } as unknown as UserProfile;
    }
    return null;
  } catch (err) {
    console.warn('getUserProfileByEmail failed:', err);
    return null;
  }
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

// ─── ONE-TIME CLEANUP ──────────────────────────────────────────────────────────
// ─── QUESTIONNAIRES ──────────────────────────────────────────────────────────
// Collection: questionnaires  (owned by coach — ownerId == coachUid)

const LOCAL_QUESTIONNAIRES = 'questionnaires_v1';

function getLocalQuestionnaires(): Questionnaire[] {
  try { return JSON.parse(localStorage.getItem(LOCAL_QUESTIONNAIRES) || '[]'); } catch { return []; }
}

export async function getQuestionnairesByCoach(coachUid: string): Promise<Questionnaire[]> {
  if (forceLocalOnly) return getLocalQuestionnaires().filter(q => q.ownerId === coachUid);
  try {
    const snap = await getDocs(query(collection(db, 'questionnaires'), where('ownerId', '==', coachUid)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Questionnaire));
  } catch (err) {
    console.warn('getQuestionnairesByCoach Firestore failed, using local:', err);
    setLocalBypassMode(true);
    return getLocalQuestionnaires().filter(q => q.ownerId === coachUid);
  }
}

export async function createQuestionnaire(data: Omit<Questionnaire, 'id'>): Promise<Questionnaire> {
  if (forceLocalOnly) {
    const q: Questionnaire = { ...data, id: `local_q_${Date.now()}` };
    localStorage.setItem(LOCAL_QUESTIONNAIRES, JSON.stringify([...getLocalQuestionnaires(), q]));
    return q;
  }
  try {
    const ref = await addDoc(collection(db, 'questionnaires'), stripUndefined(data));
    return { ...data, id: ref.id };
  } catch (err) {
    console.warn('createQuestionnaire Firestore failed, saving local:', err);
    setLocalBypassMode(true);
    const q: Questionnaire = { ...data, id: `local_q_${Date.now()}` };
    localStorage.setItem(LOCAL_QUESTIONNAIRES, JSON.stringify([...getLocalQuestionnaires(), q]));
    return q;
  }
}

export async function updateQuestionnaire(id: string, updates: Partial<Omit<Questionnaire, 'id'>>): Promise<void> {
  if (forceLocalOnly) {
    localStorage.setItem(LOCAL_QUESTIONNAIRES, JSON.stringify(getLocalQuestionnaires().map(q => q.id === id ? { ...q, ...updates } : q)));
    return;
  }
  try {
    await updateDoc(doc(db, 'questionnaires', id), stripUndefined(updates) as Record<string, unknown>);
  } catch (err) {
    console.warn('updateQuestionnaire Firestore failed, updating local:', err);
    setLocalBypassMode(true);
    localStorage.setItem(LOCAL_QUESTIONNAIRES, JSON.stringify(getLocalQuestionnaires().map(q => q.id === id ? { ...q, ...updates } : q)));
  }
}

export async function deleteQuestionnaire(id: string): Promise<void> {
  if (forceLocalOnly) {
    localStorage.setItem(LOCAL_QUESTIONNAIRES, JSON.stringify(getLocalQuestionnaires().filter(q => q.id !== id)));
    return;
  }
  try {
    await deleteDoc(doc(db, 'questionnaires', id));
  } catch (err) {
    console.warn('deleteQuestionnaire Firestore failed, deleting local:', err);
    setLocalBypassMode(true);
    localStorage.setItem(LOCAL_QUESTIONNAIRES, JSON.stringify(getLocalQuestionnaires().filter(q => q.id !== id)));
  }
}

// ─── QUESTIONNAIRE ASSIGNMENTS ───────────────────────────────────────────────
// Collection: questionnaireAssignments  (athleteId = email)

const LOCAL_Q_ASSIGNMENTS = 'questionnaireAssignments_v1';

function getLocalQAssignments(): QuestionnaireAssignment[] {
  try { return JSON.parse(localStorage.getItem(LOCAL_Q_ASSIGNMENTS) || '[]'); } catch { return []; }
}

export async function assignQuestionnaire(data: Omit<QuestionnaireAssignment, 'id'>): Promise<QuestionnaireAssignment> {
  // Guarantee schedule is always present — stripUndefined would remove it if undefined,
  // producing a Firestore document that crashes isDueToday on read.
  const safeData = { ...data, schedule: data.schedule ?? { type: 'once' as const } };
  if (forceLocalOnly) {
    const a: QuestionnaireAssignment = { ...safeData, id: `local_qa_${Date.now()}` };
    localStorage.setItem(LOCAL_Q_ASSIGNMENTS, JSON.stringify([...getLocalQAssignments(), a]));
    return a;
  }
  try {
    const ref = await addDoc(collection(db, 'questionnaireAssignments'), stripUndefined(safeData));
    return { ...safeData, id: ref.id };
  } catch (err) {
    console.warn('assignQuestionnaire Firestore failed, saving local:', err);
    setLocalBypassMode(true);
    const a: QuestionnaireAssignment = { ...safeData, id: `local_qa_${Date.now()}` };
    localStorage.setItem(LOCAL_Q_ASSIGNMENTS, JSON.stringify([...getLocalQAssignments(), a]));
    return a;
  }
}

export async function getAssignmentsForAthlete(email: string): Promise<QuestionnaireAssignment[]> {
  if (forceLocalOnly) return getLocalQAssignments().filter(a => a.athleteId === email);
  try {
    const snap = await getDocs(query(collection(db, 'questionnaireAssignments'), where('athleteId', '==', email)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as QuestionnaireAssignment));
  } catch (err) {
    console.warn('getAssignmentsForAthlete Firestore failed, using local:', err);
    setLocalBypassMode(true);
    return getLocalQAssignments().filter(a => a.athleteId === email);
  }
}

export async function deactivateAssignment(id: string): Promise<void> {
  if (forceLocalOnly) {
    localStorage.setItem(LOCAL_Q_ASSIGNMENTS, JSON.stringify(getLocalQAssignments().map(a => a.id === id ? { ...a, active: false } : a)));
    return;
  }
  try {
    await updateDoc(doc(db, 'questionnaireAssignments', id), { active: false });
  } catch (err) {
    console.warn('deactivateAssignment Firestore failed:', err);
    setLocalBypassMode(true);
    localStorage.setItem(LOCAL_Q_ASSIGNMENTS, JSON.stringify(getLocalQAssignments().map(a => a.id === id ? { ...a, active: false } : a)));
  }
}

// ─── QUESTIONNAIRE RESPONSES ─────────────────────────────────────────────────
// Collection: questionnaireResponses  (athleteId = email)

const LOCAL_Q_RESPONSES = 'questionnaireResponses_v1';

function getLocalQResponses(): QuestionnaireResponse[] {
  try { return JSON.parse(localStorage.getItem(LOCAL_Q_RESPONSES) || '[]'); } catch { return []; }
}

export async function submitResponse(data: Omit<QuestionnaireResponse, 'id'>): Promise<QuestionnaireResponse> {
  if (forceLocalOnly) {
    const r: QuestionnaireResponse = { ...data, id: `local_qr_${Date.now()}` };
    localStorage.setItem(LOCAL_Q_RESPONSES, JSON.stringify([...getLocalQResponses(), r]));
    return r;
  }
  try {
    const ref = await addDoc(collection(db, 'questionnaireResponses'), stripUndefined(data));
    return { ...data, id: ref.id };
  } catch (err) {
    console.warn('submitResponse Firestore failed, saving local:', err);
    setLocalBypassMode(true);
    const r: QuestionnaireResponse = { ...data, id: `local_qr_${Date.now()}` };
    localStorage.setItem(LOCAL_Q_RESPONSES, JSON.stringify([...getLocalQResponses(), r]));
    return r;
  }
}

export async function getQuestionnaireById(id: string): Promise<Questionnaire | null> {
  try {
    const snap = await getDoc(doc(db, 'questionnaires', id));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as Questionnaire) : null;
  } catch {
    const local: Questionnaire[] = JSON.parse(localStorage.getItem(LOCAL_QUESTIONNAIRES) || '[]');
    return local.find(q => q.id === id) ?? null;
  }
}

export async function getResponsesForAthlete(email: string): Promise<QuestionnaireResponse[]> {
  if (forceLocalOnly) return getLocalQResponses().filter(r => r.athleteId === email);
  try {
    const snap = await getDocs(query(collection(db, 'questionnaireResponses'), where('athleteId', '==', email)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as QuestionnaireResponse));
  } catch (err) {
    console.warn('getResponsesForAthlete Firestore failed, using local:', err);
    setLocalBypassMode(true);
    return getLocalQResponses().filter(r => r.athleteId === email);
  }
}

export async function getResponsesByQuestionnaireIds(ids: string[]): Promise<QuestionnaireResponse[]> {
  if (ids.length === 0) return [];
  if (forceLocalOnly) {
    const local = getLocalQResponses();
    return local.filter(r => ids.includes(r.questionnaireId));
  }
  try {
    const batches: Promise<QuestionnaireResponse[]>[] = [];
    for (let i = 0; i < ids.length; i += 10) {
      const batch = ids.slice(i, i + 10);
      batches.push(
        getDocs(query(collection(db, 'questionnaireResponses'), where('questionnaireId', 'in', batch)))
          .then(snap => snap.docs.map(d => ({ id: d.id, ...d.data() } as QuestionnaireResponse)))
      );
    }
    const results = await Promise.all(batches);
    return results.flat();
  } catch (err) {
    console.warn('getResponsesByQuestionnaireIds Firestore failed:', err);
    setLocalBypassMode(true);
    const local = getLocalQResponses();
    return local.filter(r => ids.includes(r.questionnaireId));
  }
}

export async function updateQuestionnaireResponse(
  id: string,
  answers: QuestionnaireResponse['answers'],
): Promise<void> {
  const patch = (list: QuestionnaireResponse[]) =>
    list.map(r => r.id === id ? { ...r, answers } : r);
  if (forceLocalOnly) {
    localStorage.setItem(LOCAL_Q_RESPONSES, JSON.stringify(patch(getLocalQResponses())));
    return;
  }
  try {
    await updateDoc(doc(db, 'questionnaireResponses', id), { answers });
    localStorage.setItem(LOCAL_Q_RESPONSES, JSON.stringify(patch(getLocalQResponses())));
  } catch (err) {
    console.warn('updateQuestionnaireResponse failed:', err);
    setLocalBypassMode(true);
    localStorage.setItem(LOCAL_Q_RESPONSES, JSON.stringify(patch(getLocalQResponses())));
  }
}

export async function deleteQuestionnaireResponse(id: string): Promise<void> {
  const remove = (list: QuestionnaireResponse[]) => list.filter(r => r.id !== id);
  if (forceLocalOnly) {
    localStorage.setItem(LOCAL_Q_RESPONSES, JSON.stringify(remove(getLocalQResponses())));
    return;
  }
  try {
    await deleteDoc(doc(db, 'questionnaireResponses', id));
    localStorage.setItem(LOCAL_Q_RESPONSES, JSON.stringify(remove(getLocalQResponses())));
  } catch (err) {
    console.warn('deleteQuestionnaireResponse failed:', err);
    setLocalBypassMode(true);
    localStorage.setItem(LOCAL_Q_RESPONSES, JSON.stringify(remove(getLocalQResponses())));
  }
}

// Collection: bodyweightLogs  (athleteId = email)

const LOCAL_BW = 'enforma_bodyweight_v1';

function getLocalBw(): BodyweightLog[] {
  try { return JSON.parse(localStorage.getItem(LOCAL_BW) || '[]'); } catch { return []; }
}
function saveLocalBw(list: BodyweightLog[]): void {
  localStorage.setItem(LOCAL_BW, JSON.stringify(list));
}

export async function getBodyweightForAthlete(email: string): Promise<BodyweightLog[]> {
  if (forceLocalOnly) {
    return getLocalBw().filter(b => b.athleteId === email).sort((a, b) => a.date.localeCompare(b.date));
  }
  try {
    const snap = await getDocs(query(collection(db, 'bodyweightLogs'), where('athleteId', '==', email)));
    const list = snap.docs
      .map(d => ({ id: d.id, ...d.data() } as BodyweightLog))
      .sort((a, b) => a.date.localeCompare(b.date));
    saveLocalBw([...getLocalBw().filter(b => b.athleteId !== email), ...list]);
    return list;
  } catch (err) {
    console.warn('getBodyweightForAthlete Firestore failed, using local:', err);
    setLocalBypassMode(true);
    return getLocalBw().filter(b => b.athleteId === email).sort((a, b) => a.date.localeCompare(b.date));
  }
}

export async function addBodyweight(data: Omit<BodyweightLog, 'id'>): Promise<BodyweightLog> {
  if (forceLocalOnly) {
    const entry: BodyweightLog = { ...data, id: `local_bw_${Date.now()}` };
    saveLocalBw([...getLocalBw(), entry]);
    return entry;
  }
  try {
    const ref = await addDoc(collection(db, 'bodyweightLogs'), stripUndefined(data));
    const entry: BodyweightLog = { ...data, id: ref.id };
    saveLocalBw([...getLocalBw(), entry]);
    return entry;
  } catch (err) {
    console.warn('addBodyweight Firestore failed, saving local:', err);
    setLocalBypassMode(true);
    const entry: BodyweightLog = { ...data, id: `local_bw_${Date.now()}` };
    saveLocalBw([...getLocalBw(), entry]);
    return entry;
  }
}

export async function updateBodyweight(id: string, updates: Partial<Pick<BodyweightLog, 'date' | 'weight' | 'kind'>>): Promise<void> {
  const all = getLocalBw();
  const updated = all.map(b => b.id === id ? { ...b, ...updates } : b);
  if (forceLocalOnly) { saveLocalBw(updated); return; }
  try {
    await updateDoc(doc(db, 'bodyweightLogs', id), stripUndefined(updates) as Record<string, unknown>);
    saveLocalBw(updated);
  } catch (err) {
    console.warn('updateBodyweight Firestore failed, updating local:', err);
    setLocalBypassMode(true);
    saveLocalBw(updated);
  }
}

export async function deleteBodyweight(id: string): Promise<void> {
  const updated = getLocalBw().filter(b => b.id !== id);
  if (forceLocalOnly) { saveLocalBw(updated); return; }
  try {
    await deleteDoc(doc(db, 'bodyweightLogs', id));
    saveLocalBw(updated);
  } catch (err) {
    console.warn('deleteBodyweight Firestore failed, deleting local:', err);
    setLocalBypassMode(true);
    saveLocalBw(updated);
  }
}

// Collection: stepLogs  (athleteId = email) — manual entry today; Fase 3 adds
// Apple Health / Google Health Connect as additional `source` values.

const LOCAL_STEPS = 'enforma_steps_v1';

function getLocalSteps(): StepLog[] {
  try { return JSON.parse(localStorage.getItem(LOCAL_STEPS) || '[]'); } catch { return []; }
}
function saveLocalSteps(list: StepLog[]): void {
  localStorage.setItem(LOCAL_STEPS, JSON.stringify(list));
}

export async function getStepsForAthlete(email: string): Promise<StepLog[]> {
  if (forceLocalOnly) {
    return getLocalSteps().filter(s => s.athleteId === email).sort((a, b) => a.date.localeCompare(b.date));
  }
  try {
    const snap = await getDocs(query(collection(db, 'stepLogs'), where('athleteId', '==', email)));
    const list = snap.docs
      .map(d => ({ id: d.id, ...d.data() } as StepLog))
      .sort((a, b) => a.date.localeCompare(b.date));
    saveLocalSteps([...getLocalSteps().filter(s => s.athleteId !== email), ...list]);
    return list;
  } catch (err) {
    console.warn('getStepsForAthlete Firestore failed, using local:', err);
    setLocalBypassMode(true);
    return getLocalSteps().filter(s => s.athleteId === email).sort((a, b) => a.date.localeCompare(b.date));
  }
}

export async function addSteps(data: Omit<StepLog, 'id'>): Promise<StepLog> {
  if (forceLocalOnly) {
    const entry: StepLog = { ...data, id: `local_steps_${Date.now()}` };
    saveLocalSteps([...getLocalSteps(), entry]);
    return entry;
  }
  try {
    const ref = await addDoc(collection(db, 'stepLogs'), stripUndefined(data));
    const entry: StepLog = { ...data, id: ref.id };
    saveLocalSteps([...getLocalSteps(), entry]);
    return entry;
  } catch (err) {
    console.warn('addSteps Firestore failed, saving local:', err);
    setLocalBypassMode(true);
    const entry: StepLog = { ...data, id: `local_steps_${Date.now()}` };
    saveLocalSteps([...getLocalSteps(), entry]);
    return entry;
  }
}

export async function updateSteps(id: string, updates: Partial<Pick<StepLog, 'steps'>>): Promise<void> {
  const updated = getLocalSteps().map(s => s.id === id ? { ...s, ...updates } : s);
  if (forceLocalOnly) { saveLocalSteps(updated); return; }
  try {
    await updateDoc(doc(db, 'stepLogs', id), stripUndefined(updates) as Record<string, unknown>);
    saveLocalSteps(updated);
  } catch (err) {
    console.warn('updateSteps Firestore failed, updating local:', err);
    setLocalBypassMode(true);
    saveLocalSteps(updated);
  }
}

// ─── ONBOARDING ───────────────────────────────────────────────────────────────

const ONBOARDING_LS = 'enforma_onboarding_v1';

function getLocalOnboardingAll(): OnboardingData[] {
  try { return JSON.parse(localStorage.getItem(ONBOARDING_LS) ?? '[]'); } catch { return []; }
}
function setLocalOnboardingAll(data: OnboardingData[]) {
  localStorage.setItem(ONBOARDING_LS, JSON.stringify(data));
}

export async function getOnboarding(email: string): Promise<OnboardingData | null> {
  const localAll = getLocalOnboardingAll();
  const local = localAll.find(o => o.athleteId === email) ?? null;
  if (forceLocalOnly) return local;
  try {
    const snap = await getDoc(doc(db, 'onboarding', email));
    if (!snap.exists()) return null;
    const data = snap.data() as OnboardingData;
    setLocalOnboardingAll([...localAll.filter(o => o.athleteId !== email), data]);
    return data;
  } catch (err) {
    console.warn('getOnboarding Firestore failed, using local:', err);
    return local;
  }
}

export async function updateOnboardingFoods(
  email: string,
  likedFoods: string[],
  dislikedFoods: string[],
): Promise<void> {
  const all = getLocalOnboardingAll();
  const existing = all.find(o => o.athleteId === email);
  if (existing) {
    setLocalOnboardingAll([
      ...all.filter(o => o.athleteId !== email),
      { ...existing, likedFoods, dislikedFoods },
    ]);
  }
  if (forceLocalOnly) return;
  try {
    await updateDoc(doc(db, 'onboarding', email), { likedFoods, dislikedFoods });
  } catch (err) {
    console.warn('updateOnboardingFoods Firestore failed:', err);
    setLocalBypassMode(true);
  }
}

export async function saveOnboarding(data: OnboardingData): Promise<void> {
  const others = getLocalOnboardingAll().filter(o => o.athleteId !== data.athleteId);
  setLocalOnboardingAll([...others, data]); // backup always saved locally
  if (forceLocalOnly) {
    throw new Error('Sin conexión con Firestore. Recarga la página e inténtalo de nuevo.');
  }
  await setDoc(doc(db, 'onboarding', data.athleteId), stripUndefined(data));
}

export async function updateOnboarding(data: OnboardingData): Promise<void> {
  const all = getLocalOnboardingAll();
  const existing = all.find(o => o.athleteId === data.athleteId);
  setLocalOnboardingAll([
    ...all.filter(o => o.athleteId !== data.athleteId),
    existing ? { ...existing, ...data } : data,
  ]); // backup always saved locally
  if (forceLocalOnly) {
    throw new Error('Sin conexión con Firestore. Recarga la página e inténtalo de nuevo.');
  }
  await updateDoc(doc(db, 'onboarding', data.athleteId), stripUndefined(data) as unknown as Record<string, unknown>);
}

// ── Onboarding template (per coach, keyed by coach email) ────────────────────

const OBT_LS = 'onboardingTemplates_local';

function getLocalOBT(coachEmail: string): OnboardingTemplate | null {
  try {
    const all = JSON.parse(localStorage.getItem(OBT_LS) || '{}') as Record<string, OnboardingTemplate>;
    return all[coachEmail] ?? null;
  } catch { return null; }
}

function setLocalOBT(coachEmail: string, tpl: OnboardingTemplate) {
  try {
    const all = JSON.parse(localStorage.getItem(OBT_LS) || '{}') as Record<string, OnboardingTemplate>;
    all[coachEmail] = tpl;
    localStorage.setItem(OBT_LS, JSON.stringify(all));
  } catch { /* ignore */ }
}

export async function getOnboardingTemplate(coachEmail: string): Promise<OnboardingTemplate | null> {
  const local = getLocalOBT(coachEmail);
  if (forceLocalOnly) return local;
  try {
    const snap = await getDoc(doc(db, 'onboardingTemplates', coachEmail));
    if (!snap.exists()) return null;
    const tpl = snap.data() as OnboardingTemplate;
    setLocalOBT(coachEmail, tpl);
    return tpl;
  } catch (err) {
    console.warn('getOnboardingTemplate Firestore failed, using local:', err);
    return local;
  }
}

export async function saveOnboardingTemplate(coachEmail: string, tpl: OnboardingTemplate): Promise<void> {
  setLocalOBT(coachEmail, tpl);
  if (forceLocalOnly) return;
  try {
    await setDoc(doc(db, 'onboardingTemplates', coachEmail), stripUndefined(tpl));
  } catch (err) {
    console.warn('saveOnboardingTemplate Firestore failed, saving local:', err);
    setLocalBypassMode(true);
  }
}

// ── Notifications ─────────────────────────────────────────────────────────────

const NOTIF_LS = 'notifications_local';

function getLocalNotifs(recipientEmail: string): AppNotification[] {
  try {
    const all = JSON.parse(localStorage.getItem(NOTIF_LS) || '{}') as Record<string, AppNotification[]>;
    return all[recipientEmail] ?? [];
  } catch { return []; }
}

function setLocalNotifs(recipientEmail: string, notifs: AppNotification[]) {
  try {
    const all = JSON.parse(localStorage.getItem(NOTIF_LS) || '{}') as Record<string, AppNotification[]>;
    all[recipientEmail] = notifs;
    localStorage.setItem(NOTIF_LS, JSON.stringify(all));
  } catch { /* ignore */ }
}

export async function getNotifications(recipientEmail: string): Promise<AppNotification[]> {
  const local = getLocalNotifs(recipientEmail);
  if (forceLocalOnly) return local.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  try {
    const snap = await getDocs(
      query(collection(db, 'notifications'), where('recipientEmail', '==', recipientEmail))
    );
    const notifs = snap.docs.map(d => d.data() as AppNotification);
    notifs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    setLocalNotifs(recipientEmail, notifs);
    return notifs;
  } catch (err) {
    console.warn('getNotifications Firestore failed, using local:', err);
    return local.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

export async function createNotificationDeduped(
  dedupeKey: string,
  data: Omit<AppNotification, 'id'>
): Promise<void> {
  const notif: AppNotification = { ...data, id: dedupeKey };

  // Local dedup — prevents repeat calls within the same session
  const local = getLocalNotifs(data.recipientEmail);
  if (local.some(n => n.id === dedupeKey)) return;
  setLocalNotifs(data.recipientEmail, [notif, ...local]);

  if (forceLocalOnly) return;

  try {
    // Blind setDoc — no pre-read. The deterministic ID already prevents duplicates.
    // If the doc already exists (e.g. from a prior session) and the caller lacks update
    // permission, Firestore will reject with PERMISSION_DENIED. That is expected and safe
    // to ignore: the notification already exists in Firestore.
    await setDoc(doc(db, 'notifications', dedupeKey), stripUndefined(notif));
  } catch {
    // Silent — doc may already exist and caller may lack update permission (by design).
  }
}

export async function markNotificationRead(id: string, recipientEmail: string): Promise<void> {
  const local = getLocalNotifs(recipientEmail);
  setLocalNotifs(recipientEmail, local.map(n => n.id === id ? { ...n, read: true } : n));
  if (forceLocalOnly) return;
  try {
    await updateDoc(doc(db, 'notifications', id), { read: true });
  } catch (err) {
    console.warn('markNotificationRead Firestore failed:', err);
    setLocalBypassMode(true);
  }
}

// Module-level cache: a weekly menu generation touches every used intakeType
// once (≤5 queries) instead of once per meal slot across 7 days (≤35 queries).
const indyaGeneratorCache = new Map<number, Recipe[]>();

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export async function queryIndyaForGenerator(intakeType: number, maxResults = 300): Promise<Recipe[]> {
  const cached = indyaGeneratorCache.get(intakeType);
  if (cached) return cached;
  try {
    const q = query(
      collection(db, 'recipes'),
      where('ownerId', '==', 'indya'),
      where('intakeTypes', 'array-contains', intakeType),
      orderBy('name'),
      limit(maxResults),
    );
    const snap = await getDocs(q);
    // orderBy('name') biases toward the start of the alphabet; shuffle client-side
    // so the generator/swap picker don't always surface the same few recipes.
    const recipes = shuffle(snap.docs.map(d => ({ id: d.id, ...d.data() } as Recipe)));
    indyaGeneratorCache.set(intakeType, recipes);
    return recipes;
  } catch (err) {
    console.warn(`queryIndyaForGenerator(intakeType=${intakeType}) failed:`, err);
    return [];
  }
}

export async function markAllNotificationsRead(recipientEmail: string): Promise<void> {
  const local = getLocalNotifs(recipientEmail);
  setLocalNotifs(recipientEmail, local.map(n => ({ ...n, read: true })));
  if (forceLocalOnly) return;
  try {
    const snap = await getDocs(
      query(collection(db, 'notifications'),
        where('recipientEmail', '==', recipientEmail),
        where('read', '==', false))
    );
    await Promise.all(snap.docs.map(d => updateDoc(d.ref, { read: true })));
  } catch (err) {
    console.warn('markAllNotificationsRead Firestore failed:', err);
    setLocalBypassMode(true);
  }
}

// ─── TASKS (dashboard "Tareas pendientes") ─────────────────────────────────────

const TASKS_LOCAL_KEY = 'enforma_tasks_v1';

function getLocalTasks(): TaskItem[] {
  try {
    const raw = localStorage.getItem(TASKS_LOCAL_KEY);
    return raw ? (JSON.parse(raw) as TaskItem[]) : [];
  } catch { return []; }
}

function saveLocalTasks(tasks: TaskItem[]): void {
  localStorage.setItem(TASKS_LOCAL_KEY, JSON.stringify(tasks));
}

export async function getTasksForAthlete(athleteId: string): Promise<TaskItem[]> {
  if (forceLocalOnly) return getLocalTasks().filter(t => t.athleteId === athleteId);
  try {
    const q = query(collection(db, 'tasks'), where('athleteId', '==', athleteId));
    const snap = await getDocs(q);
    const tasks = snap.docs.map(d => ({ id: d.id, ...d.data() } as TaskItem));
    const others = getLocalTasks().filter(t => t.athleteId !== athleteId);
    saveLocalTasks([...others, ...tasks]);
    return tasks;
  } catch (err) {
    console.warn('getTasksForAthlete Firestore failed, using local:', err);
    setLocalBypassMode(true);
    return getLocalTasks().filter(t => t.athleteId === athleteId);
  }
}

export async function createTask(data: Omit<TaskItem, 'id'>): Promise<TaskItem> {
  if (forceLocalOnly) {
    const task: TaskItem = { ...data, id: `local_task_${Date.now()}` };
    saveLocalTasks([...getLocalTasks(), task]);
    return task;
  }
  try {
    const ref = await addDoc(collection(db, 'tasks'), stripUndefined(data));
    const task: TaskItem = { ...data, id: ref.id };
    saveLocalTasks([...getLocalTasks(), task]);
    return task;
  } catch (err) {
    console.warn('createTask Firestore failed, saving local:', err);
    setLocalBypassMode(true);
    const task: TaskItem = { ...data, id: `local_task_${Date.now()}` };
    saveLocalTasks([...getLocalTasks(), task]);
    return task;
  }
}

export async function updateTask(id: string, updates: Partial<TaskItem>): Promise<void> {
  const updated = getLocalTasks().map(t => t.id === id ? { ...t, ...updates } : t);
  if (forceLocalOnly) { saveLocalTasks(updated); return; }
  try {
    await updateDoc(doc(db, 'tasks', id), stripUndefined(updates) as Record<string, unknown>);
    saveLocalTasks(updated);
  } catch (err) {
    console.warn('updateTask Firestore failed, saving local:', err);
    setLocalBypassMode(true);
    saveLocalTasks(updated);
  }
}

// ─── COACH NOTES (private to-do list, never visible to athletes) ──────────────

const COACH_NOTES_LOCAL_KEY = 'enforma_coach_notes_v1';

function getLocalCoachNotes(): CoachNote[] {
  try { return JSON.parse(localStorage.getItem(COACH_NOTES_LOCAL_KEY) || '[]'); } catch { return []; }
}
function saveLocalCoachNotes(list: CoachNote[]): void {
  localStorage.setItem(COACH_NOTES_LOCAL_KEY, JSON.stringify(list));
}

export async function getCoachNotes(): Promise<CoachNote[]> {
  if (forceLocalOnly) return getLocalCoachNotes();
  try {
    const snap = await getDocs(collection(db, 'coachNotes'));
    const notes = snap.docs.map(d => ({ id: d.id, ...d.data() } as CoachNote));
    saveLocalCoachNotes(notes);
    return notes;
  } catch (err) {
    console.warn('getCoachNotes Firestore failed, using local:', err);
    setLocalBypassMode(true);
    return getLocalCoachNotes();
  }
}

export async function createCoachNote(data: Omit<CoachNote, 'id'>): Promise<CoachNote> {
  if (forceLocalOnly) {
    const note: CoachNote = { ...data, id: `local_cn_${Date.now()}` };
    saveLocalCoachNotes([...getLocalCoachNotes(), note]);
    return note;
  }
  try {
    const ref = await addDoc(collection(db, 'coachNotes'), stripUndefined(data));
    const note: CoachNote = { ...data, id: ref.id };
    saveLocalCoachNotes([...getLocalCoachNotes(), note]);
    return note;
  } catch (err) {
    console.warn('createCoachNote Firestore failed, saving local:', err);
    setLocalBypassMode(true);
    const note: CoachNote = { ...data, id: `local_cn_${Date.now()}` };
    saveLocalCoachNotes([...getLocalCoachNotes(), note]);
    return note;
  }
}

export async function updateCoachNote(id: string, updates: Partial<CoachNote>): Promise<void> {
  const updated = getLocalCoachNotes().map(n => n.id === id ? { ...n, ...updates } : n);
  if (forceLocalOnly) { saveLocalCoachNotes(updated); return; }
  try {
    await updateDoc(doc(db, 'coachNotes', id), stripUndefined(updates) as Record<string, unknown>);
    saveLocalCoachNotes(updated);
  } catch (err) {
    console.warn('updateCoachNote Firestore failed, saving local:', err);
    setLocalBypassMode(true);
    saveLocalCoachNotes(updated);
  }
}

export async function deleteCoachNote(id: string): Promise<void> {
  const filtered = getLocalCoachNotes().filter(n => n.id !== id);
  if (forceLocalOnly) { saveLocalCoachNotes(filtered); return; }
  try {
    await deleteDoc(doc(db, 'coachNotes', id));
    saveLocalCoachNotes(filtered);
  } catch (err) {
    console.warn('deleteCoachNote Firestore failed, deleting local:', err);
    setLocalBypassMode(true);
    saveLocalCoachNotes(filtered);
  }
}

// ─── COACH CLIENT TASKS (Setup panel checklist) ────────────────────────────────
// Seeded items get a deterministic doc id (`${email}_${itemId}`) and are only
// written the first time the coach toggles them — cheap idempotent upserts,
// same pattern as weeklyChallengeDocId. Extras use Firestore auto-ids.

const COACH_CLIENT_TASKS_LOCAL_KEY = 'enforma_coach_client_tasks_v1';

function getLocalCoachClientTasks(): CoachClientTask[] {
  try { return JSON.parse(localStorage.getItem(COACH_CLIENT_TASKS_LOCAL_KEY) || '[]'); } catch { return []; }
}
function saveLocalCoachClientTasks(list: CoachClientTask[]): void {
  localStorage.setItem(COACH_CLIENT_TASKS_LOCAL_KEY, JSON.stringify(list));
}

export async function getCoachClientTasks(athleteEmail: string): Promise<CoachClientTask[]> {
  if (forceLocalOnly) return getLocalCoachClientTasks().filter(t => t.athleteId === athleteEmail);
  try {
    const snap = await getDocs(query(collection(db, 'coachClientTasks'), where('athleteId', '==', athleteEmail)));
    const tasks = snap.docs.map(d => ({ id: d.id, ...d.data() } as CoachClientTask));
    const merged = [...getLocalCoachClientTasks().filter(t => t.athleteId !== athleteEmail), ...tasks];
    saveLocalCoachClientTasks(merged);
    return tasks;
  } catch (err) {
    console.warn('getCoachClientTasks Firestore failed, using local:', err);
    setLocalBypassMode(true);
    return getLocalCoachClientTasks().filter(t => t.athleteId === athleteEmail);
  }
}

export async function setSeededTaskDone(athleteEmail: string, itemId: string, title: string, phase: string, done: boolean): Promise<void> {
  const id = `${athleteEmail}_${itemId}`;
  const task: CoachClientTask = {
    id, athleteId: athleteEmail, itemId, title, phase, done,
    doneAt: done ? new Date().toISOString() : undefined,
    createdBy: 'seed', createdAt: new Date().toISOString(),
  };
  const updated = [...getLocalCoachClientTasks().filter(t => t.id !== id), task];
  if (forceLocalOnly) { saveLocalCoachClientTasks(updated); return; }
  try {
    await setDoc(doc(db, 'coachClientTasks', id), stripUndefined(task), { merge: true });
    saveLocalCoachClientTasks(updated);
  } catch (err) {
    console.warn('setSeededTaskDone Firestore failed, saving local:', err);
    setLocalBypassMode(true);
    saveLocalCoachClientTasks(updated);
  }
}

export async function createCoachClientTask(data: Omit<CoachClientTask, 'id'>): Promise<CoachClientTask> {
  if (forceLocalOnly) {
    const task: CoachClientTask = { ...data, id: `local_cct_${Date.now()}` };
    saveLocalCoachClientTasks([...getLocalCoachClientTasks(), task]);
    return task;
  }
  try {
    const ref = await addDoc(collection(db, 'coachClientTasks'), stripUndefined(data));
    const task: CoachClientTask = { ...data, id: ref.id };
    saveLocalCoachClientTasks([...getLocalCoachClientTasks(), task]);
    return task;
  } catch (err) {
    console.warn('createCoachClientTask Firestore failed, saving local:', err);
    setLocalBypassMode(true);
    const task: CoachClientTask = { ...data, id: `local_cct_${Date.now()}` };
    saveLocalCoachClientTasks([...getLocalCoachClientTasks(), task]);
    return task;
  }
}

export async function updateCoachClientTask(id: string, updates: Partial<CoachClientTask>): Promise<void> {
  const updated = getLocalCoachClientTasks().map(t => t.id === id ? { ...t, ...updates } : t);
  if (forceLocalOnly) { saveLocalCoachClientTasks(updated); return; }
  try {
    await updateDoc(doc(db, 'coachClientTasks', id), stripUndefined(updates) as Record<string, unknown>);
    saveLocalCoachClientTasks(updated);
  } catch (err) {
    console.warn('updateCoachClientTask Firestore failed, saving local:', err);
    setLocalBypassMode(true);
    saveLocalCoachClientTasks(updated);
  }
}

export async function deleteCoachClientTask(id: string): Promise<void> {
  const filtered = getLocalCoachClientTasks().filter(t => t.id !== id);
  if (forceLocalOnly) { saveLocalCoachClientTasks(filtered); return; }
  try {
    await deleteDoc(doc(db, 'coachClientTasks', id));
    saveLocalCoachClientTasks(filtered);
  } catch (err) {
    console.warn('deleteCoachClientTask Firestore failed, deleting local:', err);
    setLocalBypassMode(true);
    saveLocalCoachClientTasks(filtered);
  }
}

// ─── RESOURCES (coach-shared files/links) ──────────────────────────────────────

const RESOURCES_LOCAL_KEY = 'enforma_resources_v1';

function getLocalResources(): Resource[] {
  try {
    const raw = localStorage.getItem(RESOURCES_LOCAL_KEY);
    return raw ? (JSON.parse(raw) as Resource[]) : [];
  } catch { return []; }
}

function saveLocalResources(resources: Resource[]): void {
  localStorage.setItem(RESOURCES_LOCAL_KEY, JSON.stringify(resources));
}

// Single-coach app — resources aren't filtered per coach, same pattern as
// getFoodItems()/getExercises() (shared library, any authenticated user reads all).
export async function getAllResources(): Promise<Resource[]> {
  if (forceLocalOnly) return getLocalResources();
  try {
    const snap = await getDocs(collection(db, 'resources'));
    const resources = snap.docs.map(d => ({ id: d.id, ...d.data() } as Resource));
    saveLocalResources(resources);
    return resources;
  } catch (err) {
    console.warn('getAllResources Firestore failed, using local:', err);
    setLocalBypassMode(true);
    return getLocalResources();
  }
}

export async function createResource(data: Omit<Resource, 'id'>): Promise<Resource> {
  if (forceLocalOnly) {
    const resource: Resource = { ...data, id: `local_resource_${Date.now()}` };
    saveLocalResources([...getLocalResources(), resource]);
    return resource;
  }
  try {
    const ref = await addDoc(collection(db, 'resources'), stripUndefined(data));
    const resource: Resource = { ...data, id: ref.id };
    saveLocalResources([...getLocalResources(), resource]);
    return resource;
  } catch (err) {
    console.warn('createResource Firestore failed, saving local:', err);
    setLocalBypassMode(true);
    const resource: Resource = { ...data, id: `local_resource_${Date.now()}` };
    saveLocalResources([...getLocalResources(), resource]);
    return resource;
  }
}

export async function deleteResource(id: string): Promise<void> {
  const filtered = getLocalResources().filter(r => r.id !== id);
  if (forceLocalOnly) { saveLocalResources(filtered); return; }
  try {
    await deleteDoc(doc(db, 'resources', id));
    saveLocalResources(filtered);
  } catch (err) {
    console.warn('deleteResource Firestore failed, deleting local:', err);
    setLocalBypassMode(true);
    saveLocalResources(filtered);
  }
}

// ─── COACH REPORTS (persistent coach→athlete performance/nutrition reports) ─────

const COACH_REPORTS_LOCAL_KEY = 'enforma_coach_reports_v1';

function getLocalCoachReports(): CoachReport[] {
  try {
    const raw = localStorage.getItem(COACH_REPORTS_LOCAL_KEY);
    return raw ? (JSON.parse(raw) as CoachReport[]) : [];
  } catch { return []; }
}

function saveLocalCoachReports(reports: CoachReport[]): void {
  localStorage.setItem(COACH_REPORTS_LOCAL_KEY, JSON.stringify(reports));
}

// Coach view — all reports (drafts + sent) for one athlete, newest first.
export async function getCoachReportsForAthlete(athleteId: string): Promise<CoachReport[]> {
  const local = getLocalCoachReports().filter(r => r.athleteId === athleteId);
  if (forceLocalOnly) return local.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  try {
    const q = query(collection(db, 'coachReports'), where('athleteId', '==', athleteId), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as CoachReport));
  } catch (err) {
    console.warn('getCoachReportsForAthlete Firestore failed, using local:', err);
    setLocalBypassMode(true);
    return local.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

// Athlete view — only sent reports (Firestore rules block drafts, so the query
// must constrain status to 'sent' or it would be rejected). Newest first.
export async function getSentReportsForAthlete(athleteId: string): Promise<CoachReport[]> {
  const local = getLocalCoachReports().filter(r => r.athleteId === athleteId && r.status === 'sent');
  if (forceLocalOnly) return local.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  try {
    const q = query(
      collection(db, 'coachReports'),
      where('athleteId', '==', athleteId),
      where('status', '==', 'sent'),
      orderBy('createdAt', 'desc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as CoachReport));
  } catch (err) {
    console.warn('getSentReportsForAthlete Firestore failed, using local:', err);
    setLocalBypassMode(true);
    return local.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

// Upsert (create or update). Deterministic doc id lives on the report itself so
// draft→sent edits keep the same document. Fires a notification when a report is
// sent (status 'sent' with a fresh sentAt handled by the caller).
export async function saveCoachReport(report: CoachReport): Promise<void> {
  const others = getLocalCoachReports().filter(r => r.id !== report.id);
  saveLocalCoachReports([...others, report]);
  if (forceLocalOnly) return;
  try {
    await setDoc(doc(db, 'coachReports', report.id), stripUndefined(report));
  } catch (err) {
    console.warn('saveCoachReport Firestore failed, saving local:', err);
    setLocalBypassMode(true);
  }
}

export async function deleteCoachReport(id: string): Promise<void> {
  const filtered = getLocalCoachReports().filter(r => r.id !== id);
  if (forceLocalOnly) { saveLocalCoachReports(filtered); return; }
  try {
    await deleteDoc(doc(db, 'coachReports', id));
    saveLocalCoachReports(filtered);
  } catch (err) {
    console.warn('deleteCoachReport Firestore failed, deleting local:', err);
    setLocalBypassMode(true);
    saveLocalCoachReports(filtered);
  }
}

// ─── AI ASSISTANT (chats + propuestas, solo coach) ──────────────────────────────

const AI_CHATS_LOCAL_KEY = 'enforma_ai_chats_v1';
const AI_PROPOSALS_LOCAL_KEY = 'enforma_ai_proposals_v1';

function getLocalAiChats(): AiChat[] {
  try {
    const raw = localStorage.getItem(AI_CHATS_LOCAL_KEY);
    return raw ? (JSON.parse(raw) as AiChat[]) : [];
  } catch { return []; }
}

function saveLocalAiChats(chats: AiChat[]): void {
  localStorage.setItem(AI_CHATS_LOCAL_KEY, JSON.stringify(chats));
}

export async function getAiChats(): Promise<AiChat[]> {
  if (forceLocalOnly) return getLocalAiChats().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  try {
    const snap = await getDocs(collection(db, 'aiChats'));
    const chats = snap.docs.map(d => ({ id: d.id, ...d.data() } as AiChat));
    saveLocalAiChats(chats);
    return chats.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch (err) {
    console.warn('getAiChats Firestore failed, using local:', err);
    setLocalBypassMode(true);
    return getLocalAiChats().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
}

// Upsert — el id lo genera el panel al abrir el chat, así el mismo doc se va
// reescribiendo turno a turno.
export async function saveAiChat(chat: AiChat): Promise<void> {
  const others = getLocalAiChats().filter(c => c.id !== chat.id);
  saveLocalAiChats([...others, chat]);
  if (forceLocalOnly) return;
  try {
    await setDoc(doc(db, 'aiChats', chat.id), stripUndefined(chat));
  } catch (err) {
    console.warn('saveAiChat Firestore failed, saving local:', err);
    setLocalBypassMode(true);
  }
}

export async function deleteAiChat(id: string): Promise<void> {
  const filtered = getLocalAiChats().filter(c => c.id !== id);
  if (forceLocalOnly) { saveLocalAiChats(filtered); return; }
  try {
    await deleteDoc(doc(db, 'aiChats', id));
    saveLocalAiChats(filtered);
  } catch (err) {
    console.warn('deleteAiChat Firestore failed, deleting local:', err);
    setLocalBypassMode(true);
    saveLocalAiChats(filtered);
  }
}

function getLocalAiProposals(): AiProposal[] {
  try {
    const raw = localStorage.getItem(AI_PROPOSALS_LOCAL_KEY);
    return raw ? (JSON.parse(raw) as AiProposal[]) : [];
  } catch { return []; }
}

function saveLocalAiProposals(list: AiProposal[]): void {
  localStorage.setItem(AI_PROPOSALS_LOCAL_KEY, JSON.stringify(list));
}

export async function getAiProposalsForAthlete(athleteEmail: string): Promise<AiProposal[]> {
  if (forceLocalOnly) return getLocalAiProposals().filter(p => p.athleteId === athleteEmail);
  try {
    const q = query(collection(db, 'aiProposals'), where('athleteId', '==', athleteEmail));
    const snap = await getDocs(q);
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as AiProposal));
    const others = getLocalAiProposals().filter(p => p.athleteId !== athleteEmail);
    saveLocalAiProposals([...others, ...list]);
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (err) {
    console.warn('getAiProposalsForAthlete Firestore failed, using local:', err);
    setLocalBypassMode(true);
    return getLocalAiProposals().filter(p => p.athleteId === athleteEmail);
  }
}

export async function createAiProposal(data: Omit<AiProposal, 'id'>): Promise<AiProposal> {
  if (forceLocalOnly) {
    const proposal: AiProposal = { id: `aiprop_${Date.now()}`, ...data };
    saveLocalAiProposals([...getLocalAiProposals(), proposal]);
    return proposal;
  }
  try {
    const ref = await addDoc(collection(db, 'aiProposals'), stripUndefined(data));
    const proposal: AiProposal = { id: ref.id, ...data };
    saveLocalAiProposals([...getLocalAiProposals(), proposal]);
    return proposal;
  } catch (err) {
    console.warn('createAiProposal Firestore failed, saving local:', err);
    setLocalBypassMode(true);
    const proposal: AiProposal = { id: `aiprop_${Date.now()}`, ...data };
    saveLocalAiProposals([...getLocalAiProposals(), proposal]);
    return proposal;
  }
}

export async function updateAiProposal(id: string, updates: Partial<AiProposal>): Promise<void> {
  const updated = getLocalAiProposals().map(p => p.id === id ? { ...p, ...updates } : p);
  if (forceLocalOnly) { saveLocalAiProposals(updated); return; }
  try {
    await updateDoc(doc(db, 'aiProposals', id), stripUndefined(updates) as Record<string, unknown>);
    saveLocalAiProposals(updated);
  } catch (err) {
    console.warn('updateAiProposal Firestore failed, saving local:', err);
    setLocalBypassMode(true);
    saveLocalAiProposals(updated);
  }
}

// ─── BASE DE CONOCIMIENTO (bóveda del coach, solo-coach) ────────────────────────
// Notas de metodología importadas desde Obsidian. La IA las consulta vía la tool
// search_knowledge. Cache local para búsqueda instantánea sin round-trips.

const KNOWLEDGE_LOCAL_KEY = 'enforma_knowledge_v1';

function getLocalKnowledge(): KnowledgeNote[] {
  try {
    const raw = localStorage.getItem(KNOWLEDGE_LOCAL_KEY);
    return raw ? (JSON.parse(raw) as KnowledgeNote[]) : [];
  } catch { return []; }
}

function saveLocalKnowledge(notes: KnowledgeNote[]): void {
  try { localStorage.setItem(KNOWLEDGE_LOCAL_KEY, JSON.stringify(notes)); } catch { /* quota — la fuente de verdad es Firestore */ }
}

export async function getKnowledgeNotes(): Promise<KnowledgeNote[]> {
  if (forceLocalOnly) return getLocalKnowledge();
  try {
    const snap = await getDocs(collection(db, 'knowledgeBase'));
    const notes = snap.docs.map(d => ({ id: d.id, ...d.data() } as KnowledgeNote));
    saveLocalKnowledge(notes);
    return notes;
  } catch (err) {
    console.warn('getKnowledgeNotes Firestore failed, using local:', err);
    setLocalBypassMode(true);
    return getLocalKnowledge();
  }
}

// Importa/reemplaza el lote entero de notas (el coach re-sincroniza la bóveda).
// Doc id determinista (`${folder}/${slug}` saneado) → reimportar no duplica.
// writeBatch en trozos de 400 (límite de 500 ops/batch de Firestore).
export async function bulkUpsertKnowledgeNotes(notes: KnowledgeNote[]): Promise<number> {
  saveLocalKnowledge(notes);
  if (forceLocalOnly) return notes.length;
  try {
    for (let i = 0; i < notes.length; i += 400) {
      const batch = writeBatch(db);
      for (const note of notes.slice(i, i + 400)) {
        const docId = note.id.replace(/\//g, '__');
        batch.set(doc(db, 'knowledgeBase', docId), stripUndefined(note));
      }
      await batch.commit();
    }
    return notes.length;
  } catch (err) {
    console.warn('bulkUpsertKnowledgeNotes Firestore failed, kept local:', err);
    setLocalBypassMode(true);
    return notes.length;
  }
}

// ─── INSTRUCCIONES FIJAS DEL COACH (para el asistente IA) ───────────────────────
// Doc único (id determinista 'main'): reglas propias de Dani, con prioridad
// sobre convenciones genéricas del prompt. Editable desde AiChatPanel.

const COACH_INSTRUCTIONS_LOCAL_KEY = 'enforma_coach_instructions_v1';
const COACH_INSTRUCTIONS_DOC_ID = 'main';

export async function getCoachInstructions(): Promise<string> {
  if (forceLocalOnly) return localStorage.getItem(COACH_INSTRUCTIONS_LOCAL_KEY) ?? '';
  try {
    const snap = await getDoc(doc(db, 'coachSettings', COACH_INSTRUCTIONS_DOC_ID));
    const text = snap.exists() ? ((snap.data() as CoachInstructions).text ?? '') : '';
    localStorage.setItem(COACH_INSTRUCTIONS_LOCAL_KEY, text);
    return text;
  } catch (err) {
    console.warn('getCoachInstructions Firestore failed, using local:', err);
    setLocalBypassMode(true);
    return localStorage.getItem(COACH_INSTRUCTIONS_LOCAL_KEY) ?? '';
  }
}

// ─── NOTA DE ESTADO POR ATLETA (panel visual del ClientHub, solo-coach) ─────────
// Texto libre del coach: "qué está haciendo ahora" este cliente. Doc por email
// en athleteStatus. Complementa los datos derivados (fase, objetivo, cambios).

const ATHLETE_STATUS_LOCAL_KEY = 'enforma_athlete_status_v1';

function getLocalStatusNotes(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(ATHLETE_STATUS_LOCAL_KEY) ?? '{}'); } catch { return {}; }
}

export async function getAthleteStatusNote(email: string): Promise<string> {
  if (forceLocalOnly) return getLocalStatusNotes()[email] ?? '';
  try {
    const snap = await getDoc(doc(db, 'athleteStatus', email));
    return snap.exists() ? ((snap.data().note as string) ?? '') : '';
  } catch (err) {
    console.warn('getAthleteStatusNote Firestore failed, using local:', err);
    setLocalBypassMode(true);
    return getLocalStatusNotes()[email] ?? '';
  }
}

export async function saveAthleteStatusNote(email: string, note: string): Promise<void> {
  const all = getLocalStatusNotes();
  all[email] = note;
  localStorage.setItem(ATHLETE_STATUS_LOCAL_KEY, JSON.stringify(all));
  if (forceLocalOnly) return;
  try {
    await setDoc(doc(db, 'athleteStatus', email), { note, updatedAt: new Date().toISOString() });
  } catch (err) {
    console.warn('saveAthleteStatusNote Firestore failed, kept local:', err);
    setLocalBypassMode(true);
  }
}

export async function saveCoachInstructions(text: string): Promise<void> {
  localStorage.setItem(COACH_INSTRUCTIONS_LOCAL_KEY, text);
  if (forceLocalOnly) return;
  try {
    const data: CoachInstructions = { text, updatedAt: new Date().toISOString() };
    await setDoc(doc(db, 'coachSettings', COACH_INSTRUCTIONS_DOC_ID), data);
  } catch (err) {
    console.warn('saveCoachInstructions Firestore failed, kept local:', err);
    setLocalBypassMode(true);
  }
}

// ─── PLANTILLAS DE FEEDBACK RÁPIDO (Revisiones) ─────────────────────────────────
// Doc separado ('quickReplies') en la misma colección coachSettings — mismo
// patrón simple que las instrucciones fijas del coach.

const QUICK_REPLIES_LOCAL_KEY = 'enforma_quick_replies_v1';
const QUICK_REPLIES_DOC_ID = 'quickReplies';

export async function getQuickReplies(): Promise<string[]> {
  const local = (): string[] => {
    try { return JSON.parse(localStorage.getItem(QUICK_REPLIES_LOCAL_KEY) ?? '[]'); } catch { return []; }
  };
  if (forceLocalOnly) return local();
  try {
    const snap = await getDoc(doc(db, 'coachSettings', QUICK_REPLIES_DOC_ID));
    const replies = snap.exists() ? ((snap.data() as CoachQuickReplies).replies ?? []) : [];
    localStorage.setItem(QUICK_REPLIES_LOCAL_KEY, JSON.stringify(replies));
    return replies;
  } catch (err) {
    console.warn('getQuickReplies Firestore failed, using local:', err);
    setLocalBypassMode(true);
    return local();
  }
}

export async function saveQuickReplies(replies: string[]): Promise<void> {
  localStorage.setItem(QUICK_REPLIES_LOCAL_KEY, JSON.stringify(replies));
  if (forceLocalOnly) return;
  try {
    const data: CoachQuickReplies = { replies, updatedAt: new Date().toISOString() };
    await setDoc(doc(db, 'coachSettings', QUICK_REPLIES_DOC_ID), data);
  } catch (err) {
    console.warn('saveQuickReplies Firestore failed, kept local:', err);
    setLocalBypassMode(true);
  }
}
