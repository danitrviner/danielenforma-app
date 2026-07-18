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
  updateCheckIn, deleteCheckIn, getUserProfileByEmail,
} from './db/profiles';

// ─── TRAINING (ejercicios, rutinas, asignaciones, logs, mesociclos) ──────────
// Movido a src/db/training.ts (2026-07-18) — reexportado aquí para que ningún
// import existente (`from '../dbService'`) tenga que cambiar.
export {
  getExercises, createExercise, updateExercise, deleteExercise,
  getExerciseNotesForAthlete, saveExerciseNote, seedExercisesIfEmpty,
  getWorkouts, createWorkout, updateWorkout, deleteWorkout,
  getWorkoutAssignments, getWorkoutAssignmentsForAthlete, getWorkoutAssignmentsByMesocycleIds,
  createWorkoutAssignment, updateWorkoutAssignment, deleteWorkoutAssignment,
  getWorkoutLogs, createWorkoutLog, deleteWorkoutLog, updateWorkoutLog,
  migratePrimaryFocusToMuscleGroup,
  deleteWorkoutsByMesocycleId, deleteWorkoutAssignmentsByMesocycleId,
  deleteWorkoutsByMesocycleIdStrict, deleteWorkoutAssignmentsByMesocycleIdStrict,
  createWorkoutStrict, createWorkoutAssignmentStrict,
  getMesocycles, createMesocycle, updateMesocycle, deleteMesocycle,
  getMesocycleTemplates, createMesocycleTemplate, updateMesocycleTemplate, deleteMesocycleTemplate,
} from './db/training';

// ─── NUTRICIÓN (alimentos, dietas, menús, configs, programas) ────────────────
// Movido a src/db/nutrition.ts (2026-07-18) — reexportado aquí para que ningún
// import existente (`from '../dbService'`) tenga que cambiar.
export {
  getFoodItems, createFoodItem, updateFoodItem, deleteFoodItem, seedFoodItemsIfEmpty,
  getAthleteNutritionConfig, saveAthleteNutritionConfig,
  getDietsForAthlete, createDiet, updateDiet, deleteDiet,
  getWeeklyMenusForAthlete, getPublishedMenu, createWeeklyMenu, updateWeeklyMenu, deleteWeeklyMenu, publishWeeklyMenu,
  getDietCompletionLog, getDietCompletionLogsForAthlete, saveDietCompletionLog,
  getMenuCompletionLog, getMenuCompletionLogsForAthlete, saveMenuCompletionLog,
  getAthleteDietConfig, saveAthleteDietConfig,
  getNutritionProgram, saveNutritionProgram, markNutritionPhaseSeen, deleteNutritionProgram,
  computeActivePhase, computePhaseStartDate,
} from './db/nutrition';

// ─── ROADMAPS + RETOS SEMANALES ───────────────────────────────────────────────
// Movido a src/db/roadmap.ts (2026-07-18) — reexportado aquí para que ningún
// import existente (`from '../dbService'`) tenga que cambiar.
export {
  getRoadmap, saveRoadmap, saveRoadmapLevelProgress,
  weeklyChallengeDocId, getWeeklyChallenge, saveWeeklyChallenge, getWeeklyChallengesForAthlete,
  getChallengeTemplates, saveChallengeTemplate, deleteChallengeTemplate,
} from './db/roadmap';

// ─── CLIENT INVITES (coach-only, doc id = email) ──────────────────────────────
// Movido a src/db/invites.ts (2026-07-18) — reexportado aquí para que ningún
// import existente (`from '../dbService'`) tenga que cambiar.
export { inviteClient, getPendingInvites, markInviteJoined } from './db/invites';
// ─── RECIPES ─────────────────────────────────────────────────────────────────
// Movido a src/db/recipes.ts (2026-07-18) — reexportado aquí para que ningún
// import existente (`from '../dbService'`) tenga que cambiar.
export { getRecipes, getRecipeById, queryIndyaRecipes, createRecipe, updateRecipe, deleteRecipe, getRecipeFavorites, saveRecipeFavorites, queryIndyaForGenerator } from './db/recipes';
export type { IndyaRecipeCursor, IndyaRecipeFilters } from './db/recipes';

// ─── PROGRESS PHOTOS + ASIGNACIONES DE FOTO ───────────────────────────────────
// Movido a src/db/media.ts (2026-07-18) — reexportado aquí para que ningún
// import existente (`from '../dbService'`) tenga que cambiar.
export {
  getProgressPhotos, uploadProgressPhoto, deleteProgressPhoto,
  assignPhotoCheckIn, getPhotoAssignmentsForAthlete, deactivatePhotoAssignment,
} from './db/media';

// ─── QUESTIONNAIRES + ASIGNACIONES + RESPUESTAS ───────────────────────────────
// Movido a src/db/questionnaires.ts (2026-07-18) — reexportado aquí para que
// ningún import existente (`from '../dbService'`) tenga que cambiar.
export {
  getQuestionnairesByCoach, createQuestionnaire, updateQuestionnaire, deleteQuestionnaire,
  assignQuestionnaire, getAssignmentsForAthlete, deactivateAssignment,
  submitResponse, getQuestionnaireById, getResponsesForAthlete, getResponsesByQuestionnaireIds,
  updateQuestionnaireResponse, deleteQuestionnaireResponse,
} from './db/questionnaires';

// ─── PESO CORPORAL + PASOS ─────────────────────────────────────────────────────
// Movido a src/db/athleteMetrics.ts (2026-07-18) — reexportado aquí para que
// ningún import existente (`from '../dbService'`) tenga que cambiar.
export {
  getBodyweightForAthlete, addBodyweight, updateBodyweight, deleteBodyweight,
  getStepsForAthlete, addSteps, updateSteps,
} from './db/athleteMetrics';

// ─── ONBOARDING ───────────────────────────────────────────────────────────────
// Movido a src/db/onboarding.ts (2026-07-18) — reexportado aquí para que ningún
// import existente (`from '../dbService'`) tenga que cambiar.
export {
  getOnboarding, updateOnboardingFoods, saveOnboarding, updateOnboarding,
  getOnboardingTemplate, saveOnboardingTemplate,
} from './db/onboarding';

// ─── NOTIFICATIONS ─────────────────────────────────────────────────────────────
// Movido a src/db/notifications.ts (2026-07-18) — reexportado aquí para que
// ningún import existente (`from '../dbService'`) tenga que cambiar.
export {
  getNotifications, createNotificationDeduped, markNotificationRead, markAllNotificationsRead,
} from './db/notifications';

// ─── TASKS (dashboard "Tareas pendientes") ─────────────────────────────────────
// Movido a src/db/tasks.ts (2026-07-18) — reexportado aquí para que ningún
// import existente (`from '../dbService'`) tenga que cambiar.
export { getTasksForAthlete, createTask, updateTask } from './db/tasks';

// ─── COACH NOTES + COACH CLIENT TASKS + RESOURCES ─────────────────────────────
// Movido a src/db/coachTools.ts (2026-07-18) — reexportado aquí para que
// ningún import existente (`from '../dbService'`) tenga que cambiar.
export {
  getCoachNotes, createCoachNote, updateCoachNote, deleteCoachNote,
  getCoachClientTasks, setSeededTaskDone, createCoachClientTask, updateCoachClientTask, deleteCoachClientTask,
  getAllResources, createResource, deleteResource,
} from './db/coachTools';

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
