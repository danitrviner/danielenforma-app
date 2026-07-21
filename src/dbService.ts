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
// Movido a src/db/coachReports.ts (2026-07-18) — reexportado aquí para que
// ningún import existente (`from '../dbService'`) tenga que cambiar.
export {
  getCoachReportsForAthlete, getSentReportsForAthlete, saveCoachReport, deleteCoachReport,
} from './db/coachReports';

// ─── AI ASSISTANT + BASE DE CONOCIMIENTO (chats, propuestas, bóveda, solo coach) ─
// Movido a src/db/ai.ts (2026-07-18) — reexportado aquí para que ningún
// import existente (`from '../dbService'`) tenga que cambiar.
export {
  getAiChats, saveAiChat, deleteAiChat,
  getAiProposalsForAthlete, createAiProposal, updateAiProposal,
  getKnowledgeNotes, bulkUpsertKnowledgeNotes,
} from './db/ai';

// ─── INSTRUCCIONES FIJAS + NOTA DE ESTADO + PLANTILLAS DE FEEDBACK (solo coach) ─
// Movido a src/db/coachSettings.ts (2026-07-18) — reexportado aquí para que
// ningún import existente (`from '../dbService'`) tenga que cambiar.
export {
  getCoachInstructions, saveCoachInstructions,
  getAthleteStatusNote, saveAthleteStatusNote,
  getQuickReplies, saveQuickReplies,
} from './db/coachSettings';

// ─── TRAININGLAB (academia: cursos, lecciones, progreso, acceso) ──────────────
export {
  getAllCourses, createCourse, updateCourse, deleteCourse,
  getAllLessons, createLesson, updateLesson, deleteLesson,
  getAcademyProgress, markLessonComplete,
  getAllAcademyAccess, getAcademyAccess, setAcademyAccess,
} from './db/academy';

// ─── CARDIO (zonas, BLE en vivo, tests de FC) ─────────────────────────────────
export {
  getCardioProfile, saveCardioProfile, defaultZonesFromAge,
  getCardioAssignmentsForAthlete, createCardioAssignment, updateCardioAssignment, deleteCardioAssignment,
  getCardioSessionsForAthlete, createCardioSession,
  getHrTestsForAthlete, getAllPendingHrTests, createHrTest, updateHrTest,
} from './db/cardio';
