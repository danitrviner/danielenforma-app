import { setLocalBypassMode, isLocalBypassActive, hayFalloDePermisos, descartarAvisoDePermisos, escriturasPendientes, suscribirEscriturasPendientes, estadoDeConexion, suscribirEstadoDeConexion } from './db/core';

// stripUndefined/authReady/withAuthRetry/forceLocalOnly/setLocalBypassMode/
// isLocalBypassActive movidos a src/db/core.ts (2026-07-18) — es la ÚNICA
// fuente de esa bandera ahora (import de arriba); reexportados aquí para
// que ningún import existente (`from '../dbService'`) tenga que cambiar.
export { setLocalBypassMode, isLocalBypassActive, hayFalloDePermisos, descartarAvisoDePermisos };
// 05-3. El contador real de escrituras que vencieron el plazo y siguen sin
// confirmar. Lo lee LocalModeBanner para poder decir «pendiente de enviar» sin
// inventarse el número.
export { escriturasPendientes, suscribirEscriturasPendientes };
export { estadoDeConexion, suscribirEstadoDeConexion };

// ─── USER PROFILES + CHECKINS ─────────────────────────────────────────────────
// Movido a src/db/profiles.ts (2026-07-18) — reexportado aquí para que ningún
// import existente (`from '../dbService'`) tenga que cambiar.
export {
  getOrCreateUserProfile, getAllUserProfiles, getAllUserProfilesOrThrow, getAllUsersAdmin, updateUserProfile,
  getCheckIns, addWeightCheckIn, submitCoachFeedback,
  updateCheckIn, deleteCheckIn, getUserProfileByEmail,
} from './db/profiles';

// ─── TRAINING (ejercicios, rutinas, asignaciones, logs, mesociclos) ──────────
// Movido a src/db/training.ts (2026-07-18) — reexportado aquí para que ningún
// import existente (`from '../dbService'`) tenga que cambiar.
export {
  getExercises, createExercise, updateExercise, deleteExercise,
  getExerciseNotesForAthlete, saveExerciseNote, seedExercisesIfEmpty,
  getWorkouts, getWorkoutsByIds, createWorkout, updateWorkout, deleteWorkout,
  getWorkoutAssignments, getWorkoutAssignmentsForAthlete, getWorkoutAssignmentsByMesocycleIds, getWorkoutAssignmentsForAthletes,
  createWorkoutAssignment, updateWorkoutAssignment, deleteWorkoutAssignment,
  getWorkoutLogs, createWorkoutLog, deleteWorkoutLog, updateWorkoutLog,
  migratePrimaryFocusToMuscleGroup,
  deleteWorkoutsByMesocycleId, deleteWorkoutAssignmentsByMesocycleId,
  deleteWorkoutsByMesocycleIdStrict, deleteWorkoutAssignmentsByMesocycleIdStrict,
  reprogramarAsignacionesDelMeso,
  createWorkoutStrict, updateWorkoutStrict, createWorkoutAssignmentStrict,
  getMesocycles, getMesocyclesForAthletes, createMesocycle, updateMesocycle, deleteMesocycle,
  getMesocycleTemplates, createMesocycleTemplate, updateMesocycleTemplate, deleteMesocycleTemplate,
} from './db/training';
export {
  getRepartosGuardados, guardarReparto, renombrarRepartoGuardado, borrarRepartoGuardado, repartoDeGuardado,
} from './db/repartos';

// ─── CATÁLOGO DE MÁQUINAS + GIMNASIO DEL ATLETA ───────────────────────────────
// Catálogo publicado = JSON del bundle (src/data/maquinas) + overrides del admin
// en Firestore. El gimnasio del atleta (docId = email) guarda sus decisiones.
export {
  getCatalogoMaquinas, getCatalogoMaquinasAdmin, getCatalogoVersion,
  upsertOverrideMaquina, publicarMaquina, ocultarMaquina, crearMaquinaAdmin,
  promoverMaquinaPropia, subirImagenMaquina,
  getGimnasio, guardarGimnasio, guardarGimnasioLocal, guardarDecisiones, gimnasioVacio,
  subirFotoGimnasio, addMaquinaPropia, deleteMaquinaPropia,
  getMaquinasDisponibles, getEstadoCatalogo,
} from './db/machines';

// ─── NUTRICIÓN (alimentos, dietas, menús, configs, programas) ────────────────
// Movido a src/db/nutrition.ts (2026-07-18) — reexportado aquí para que ningún
// import existente (`from '../dbService'`) tenga que cambiar.
export {
  getFoodItems, getCatalogoAlimentos, createFoodItem, updateFoodItem, deleteFoodItem, seedFoodItemsIfEmpty,
  getAlimentosPersonales, crearAlimentoPersonal, actualizarAlimentoPersonal, borrarAlimentoPersonal,
  getAthleteNutritionConfig, saveAthleteNutritionConfig, guardarRacionPropia,
  getDietsForAthlete, createDiet, updateDiet, deleteDiet,
  getWeeklyMenusForAthlete, getPublishedMenu, createWeeklyMenu, updateWeeklyMenu, deleteWeeklyMenu, publishWeeklyMenu,
  getDietCompletionLog, getDietCompletionLogsForAthlete, saveDietCompletionLog,
  getMenuCompletionLog, getMenuCompletionLogsForAthlete, saveMenuCompletionLog,
  getAthleteDietConfig, saveAthleteDietConfig,
  getNutritionProgram, getNutritionProgramsForAthletes, saveNutritionProgram, markNutritionPhaseSeen, deleteNutritionProgram,
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

// ─── NOTAS DEL COACH POR DÍA (Roadmap → Calendario) ───────────────────────────
export {
  getCoachDayNote, getCoachDayNotesForAthlete, saveCoachDayNote, deleteCoachDayNote,
} from './db/coachDayNotes';

// ─── CLIENT INVITES (coach-only, doc id = email) ──────────────────────────────
// Movido a src/db/invites.ts (2026-07-18) — reexportado aquí para que ningún
// import existente (`from '../dbService'`) tenga que cambiar.
export { inviteClient, getPendingInvites, markInviteJoined, cancelInvite } from './db/invites';
// ─── RECIPES ─────────────────────────────────────────────────────────────────
// Movido a src/db/recipes.ts (2026-07-18) — reexportado aquí para que ningún
// import existente (`from '../dbService'`) tenga que cambiar.
export { getRecipes, getRecipeById, queryRecetas, cargarIndiceRecetas, createRecipe, updateRecipe, deleteRecipe, getRecipeFavorites, saveRecipeFavorites, getReglasDeReceta, saveReglasDeReceta, getAccesoGlobalARecetas, saveAccesoGlobalARecetas, queryRecetasForGenerator, OWNER_RECETARIO_TODOS } from './db/recipes';
export type { RecetasCursor, RecetasFilters } from './db/recipes';

// ─── PROGRESS PHOTOS + ASIGNACIONES DE FOTO ───────────────────────────────────
// Movido a src/db/media.ts (2026-07-18) — reexportado aquí para que ningún
// import existente (`from '../dbService'`) tenga que cambiar.
export {
  getProgressPhotos, uploadProgressPhoto, deleteProgressPhoto,
  assignPhotoCheckIn, getPhotoAssignmentsForAthlete, deactivatePhotoAssignment,
  uploadQuestionnaireMedia, uploadRespuestaCoachMedia,
} from './db/media';

// ─── QUESTIONNAIRES + ASIGNACIONES + RESPUESTAS ───────────────────────────────
// Movido a src/db/questionnaires.ts (2026-07-18) — reexportado aquí para que
// ningún import existente (`from '../dbService'`) tenga que cambiar.
export {
  getQuestionnairesByCoach, createQuestionnaire, updateQuestionnaire, deleteQuestionnaire,
  assignQuestionnaire, assignQuestionnairesBatch, getAssignmentsForAthlete, deactivateAssignment,
  submitResponse, getQuestionnaireById, getResponsesForAthlete, getResponsesByQuestionnaireIds,
  updateQuestionnaireResponse, deleteQuestionnaireResponse, marcarRespuestaVista, guardarRespuestaCoach,
  getQuestionnairePacksByCoach, createQuestionnairePack, updateQuestionnairePack, deleteQuestionnairePack,
} from './db/questionnaires';

// ─── PESO CORPORAL + PASOS ─────────────────────────────────────────────────────
// Movido a src/db/athleteMetrics.ts (2026-07-18) — reexportado aquí para que
// ningún import existente (`from '../dbService'`) tenga que cambiar.
export {
  getBodyweightForAthlete, addBodyweight, guardarPesoDelDia, updateBodyweight, deleteBodyweight,
  getStepsForAthlete, getStepsForDate, getPesoExtremo, addSteps, updateSteps,
} from './db/athleteMetrics';

// ─── MEDIDAS CORPORALES (perímetros) ──────────────────────────────────────────
export {
  getBodyMeasurementsForAthlete, saveBodyMeasurement, deleteBodyMeasurement,
} from './db/bodyMeasurements';

// ─── ONBOARDING ───────────────────────────────────────────────────────────────
// Movido a src/db/onboarding.ts (2026-07-18) — reexportado aquí para que ningún
// import existente (`from '../dbService'`) tenga que cambiar.
export {
  getOnboarding, updateOnboardingFoods, saveOnboarding, updateOnboarding,
  getOnboardingTemplate, saveOnboardingTemplate, fusionarConsentimientoIA,
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
export { getTasksForAthlete, getTasksForAthletes, createTask, updateTask } from './db/tasks';

// ─── COACH NOTES + COACH CLIENT TASKS + RESOURCES ─────────────────────────────
// Movido a src/db/coachTools.ts (2026-07-18) — reexportado aquí para que
// ningún import existente (`from '../dbService'`) tenga que cambiar.
export {
  getCoachNotes, createCoachNote, updateCoachNote, deleteCoachNote,
  getCoachClientTasks, setSeededTaskDone, createCoachClientTask, updateCoachClientTask, deleteCoachClientTask,
  getCoachTasksVencidas,
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
  getAiProposalsForAthlete, getApprovedAiProposals, getPendingAiProposals, createAiProposal, updateAiProposal,
  getKnowledgeNotes, bulkUpsertKnowledgeNotes,
} from './db/ai';

// ─── INSTRUCCIONES FIJAS + NOTA DE ESTADO + PLANTILLAS DE FEEDBACK (solo coach) ─
// Movido a src/db/coachSettings.ts (2026-07-18) — reexportado aquí para que
// ningún import existente (`from '../dbService'`) tenga que cambiar.
export {
  getCoachInstructions, saveCoachInstructions,
  getDoctrina, getDoctrinaParaEditar, saveDoctrina, resetDoctrina,
  getVolumeLandmarks, getVolumeLandmarksParaEditar, saveVolumeLandmarks, resetVolumeLandmarks,
  getAthleteStatusNote, saveAthleteStatusNote,
  getQuickReplies, saveQuickReplies,
} from './db/coachSettings';

// ─── TRAININGLAB (academia: cursos, lecciones, progreso, acceso) ──────────────
export {
  getAllCourses, createCourse, updateCourse, deleteCourse, deleteCourseWithLessons,
  getAllLessons, createLesson, updateLesson, deleteLesson,
  getAcademyProgress, markLessonComplete,
  getAllAcademyAccess, getAcademyAccess, setAcademyAccess,
} from './db/academy';

// ─── CRM (contactos, servicios, pagos, suscripciones, reuniones) ──────────────
// OJO: src/db/crm.ts NO implementa el fallback a localStorage del resto de
// dominios — las escrituras que fallan lanzan. Está explicado en ese fichero.
export {
  getCrmContactos, createCrmContacto, updateCrmContacto, deleteCrmContacto,
  updateClienteCrmFields, importarCrmContactosBatch,
  getCrmServicios, getCrmServiciosByCliente, createCrmServicioConPago,
  updateCrmServicio, archivarCrmServicio, desarchivarCrmServicio,
  getCrmPagos, getCrmPagosByCliente, createCrmPago, updateCrmPago, deleteCrmPago,
  getCrmSuscripciones, getCrmSuscripcionesByCliente, createCrmSuscripcion,
  updateCrmSuscripcion, deleteCrmSuscripcion, registrarCobroSuscripcion,
  eliminarClienteDelCrm,
  getCrmReuniones, getCrmReunionesByCliente, createCrmReunion, updateCrmReunion,
  EscrituraEncolada, CobroYaRegistrado,
} from './db/crm';

// ─── CARDIO (zonas, BLE en vivo, tests de FC) ─────────────────────────────────
export {
  getCardioProfile, saveCardioProfile, defaultZonesFromAge,
  getCardioAplazos, getCardioAplazosDesde, setCardioAplazo, deleteCardioAplazo,
  getCardioAssignmentsForAthlete, createCardioAssignment, updateCardioAssignment, deleteCardioAssignment,
  getCardioSessionsForAthlete, getCardioSessionsSince, createCardioSession, updateCardioSession,
  getCardioWeeklyGoal, saveCardioWeeklyGoal,
  getHrTestsForAthlete, getAllPendingHrTests, createHrTest, updateHrTest,
  getHrvReadingsForAthlete, createHrvReading,
} from './db/cardio';

export { corregirClasificacion } from './db/exerciseChanges';
export type { NuevaClasificacion } from './db/exerciseChanges';
