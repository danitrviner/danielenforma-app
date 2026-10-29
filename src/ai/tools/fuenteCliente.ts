/* La fuente de datos de las tools en la APP: `dbService` tal cual, más la
   sesión del coach. Es lo único de src/ai/tools que toca el SDK de cliente. */
import { createAiProposal, createCoachClientTask, getAiProposalsForAthlete, getAlimentosPersonales, getAllUserProfiles, getApprovedAiProposals, getAssignmentsForAthlete, getAthleteDietConfig, getAthleteNutritionConfig, getBodyMeasurementsForAthlete, getBodyweightForAthlete, getCardioAssignmentsForAthlete, getCardioSessionsForAthlete, getCheckIns, getCoachClientTasks, getDietCompletionLogsForAthlete, getDietsForAthlete, getExercises, getFoodItems, getKnowledgeNotes, getMesocycles, getNutritionProgram, getOnboarding, getOnboardingTemplate, getPhotoAssignmentsForAthlete, getProgressPhotos, getQuestionnairesByCoach, getResponsesForAthlete, getRoadmap, getStepsForAthlete, getTasksForAthlete, getUserProfileByEmail, getWeeklyChallenge, getWeeklyChallengesForAthlete, getWorkoutAssignments, getWorkoutAssignmentsByMesocycleIds, getWorkoutLogs, getWorkouts, isLocalBypassActive, saveCoachReport } from '../../dbService.js';
import { appendDossierFacts, getDossier } from '../../db/dossier.js';
import { getRepartosGuardados } from '../../db/repartos.js';
import { getVolumeLandmarks } from '../../db/coachSettings.js';
import { auth } from '../../firebase.js';
import type { FuenteDeDatos } from './datos.js';

export const fuenteCliente: FuenteDeDatos = {
  appendDossierFacts, createAiProposal, createCoachClientTask, getAiProposalsForAthlete, getAlimentosPersonales, getAllUserProfiles, getApprovedAiProposals, getAssignmentsForAthlete, getAthleteDietConfig, getAthleteNutritionConfig, getBodyMeasurementsForAthlete, getBodyweightForAthlete, getCardioAssignmentsForAthlete, getCardioSessionsForAthlete, getCheckIns, getCoachClientTasks, getDietCompletionLogsForAthlete, getDietsForAthlete, getDossier, getExercises, getFoodItems, getKnowledgeNotes, getMesocycles, getNutritionProgram, getOnboarding, getOnboardingTemplate, getPhotoAssignmentsForAthlete, getProgressPhotos, getQuestionnairesByCoach, getRepartosGuardados, getResponsesForAthlete, getRoadmap, getStepsForAthlete, getTasksForAthlete, getUserProfileByEmail, getVolumeLandmarks, getWeeklyChallenge, getWeeklyChallengesForAthlete, getWorkoutAssignments, getWorkoutAssignmentsByMesocycleIds, getWorkoutLogs, getWorkouts, isLocalBypassActive, saveCoachReport,
  coachActual: () => ({ uid: auth.currentUser?.uid ?? '', email: auth.currentUser?.email ?? '' }),
};
