/* La FUENTE DE DATOS de las tools (28-10-2026).

   Hasta aquí lectores y propuestas importaban `dbService` directamente: el SDK
   de cliente de Firebase, con su espejo en localStorage y su modo local. Eso
   las ataba al navegador y a la sesión de Dani. El autopiloto necesita las
   mismas tools en una función de Vercel con el SDK de administración.

   Aquí no hay Firebase: solo la interfaz de lo que una tool puede leer y
   escribir, y un registro. Quien arranca decide la fuente:
     · la app: `usarFuenteDeDatos(fuenteCliente)` (tools/fuenteCliente.ts),
       que la puerta `src/ai/tools.ts` registra al importarse;
     · el servidor: `usarFuenteDeDatos(fuenteAdmin(db))` (api/_lib/fuenteAdmin.ts).
   Las funciones exportadas abajo tienen el mismo nombre y tipo que las de
   `dbService`, así que lectores y propuestas solo cambiaron el `from`. Los
   tipos se toman de la implementación de cliente con `import type * as`,
   que se borra al compilar: el servidor no carga `dbService`. */

import type * as DB from '../../dbService.js';
import type * as Dossier from '../../db/dossier.js';
import type * as Repartos from '../../db/repartos.js';
import type * as Ajustes from '../../db/coachSettings.js';

export interface FuenteDeDatos {
  appendDossierFacts: typeof Dossier.appendDossierFacts;
  createAiProposal: typeof DB.createAiProposal;
  createCoachClientTask: typeof DB.createCoachClientTask;
  getAiProposalsForAthlete: typeof DB.getAiProposalsForAthlete;
  getAlimentosPersonales: typeof DB.getAlimentosPersonales;
  getAllUserProfiles: typeof DB.getAllUserProfiles;
  getApprovedAiProposals: typeof DB.getApprovedAiProposals;
  getAssignmentsForAthlete: typeof DB.getAssignmentsForAthlete;
  getAthleteDietConfig: typeof DB.getAthleteDietConfig;
  getAthleteNutritionConfig: typeof DB.getAthleteNutritionConfig;
  getBodyMeasurementsForAthlete: typeof DB.getBodyMeasurementsForAthlete;
  getBodyweightForAthlete: typeof DB.getBodyweightForAthlete;
  getCardioAssignmentsForAthlete: typeof DB.getCardioAssignmentsForAthlete;
  getCardioSessionsForAthlete: typeof DB.getCardioSessionsForAthlete;
  getCheckIns: typeof DB.getCheckIns;
  getCoachClientTasks: typeof DB.getCoachClientTasks;
  getDietCompletionLogsForAthlete: typeof DB.getDietCompletionLogsForAthlete;
  getDietsForAthlete: typeof DB.getDietsForAthlete;
  getDossier: typeof Dossier.getDossier;
  getExercises: typeof DB.getExercises;
  getFoodItems: typeof DB.getFoodItems;
  getKnowledgeNotes: typeof DB.getKnowledgeNotes;
  getMesocycles: typeof DB.getMesocycles;
  getNutritionProgram: typeof DB.getNutritionProgram;
  getOnboarding: typeof DB.getOnboarding;
  getOnboardingTemplate: typeof DB.getOnboardingTemplate;
  getPhotoAssignmentsForAthlete: typeof DB.getPhotoAssignmentsForAthlete;
  getProgressPhotos: typeof DB.getProgressPhotos;
  getQuestionnairesByCoach: typeof DB.getQuestionnairesByCoach;
  getRepartosGuardados: typeof Repartos.getRepartosGuardados;
  getResponsesForAthlete: typeof DB.getResponsesForAthlete;
  getRoadmap: typeof DB.getRoadmap;
  getStepsForAthlete: typeof DB.getStepsForAthlete;
  getTasksForAthlete: typeof DB.getTasksForAthlete;
  getUserProfileByEmail: typeof DB.getUserProfileByEmail;
  getVolumeLandmarks: typeof Ajustes.getVolumeLandmarks;
  getWeeklyChallenge: typeof DB.getWeeklyChallenge;
  getWeeklyChallengesForAthlete: typeof DB.getWeeklyChallengesForAthlete;
  getWorkoutAssignments: typeof DB.getWorkoutAssignments;
  getWorkoutAssignmentsByMesocycleIds: typeof DB.getWorkoutAssignmentsByMesocycleIds;
  getWorkoutLogs: typeof DB.getWorkoutLogs;
  getWorkouts: typeof DB.getWorkouts;
  isLocalBypassActive: typeof DB.isLocalBypassActive;
  saveCoachReport: typeof DB.saveCoachReport;
  /** Quién es el coach en esta ejecución: la sesión en la app, la cuenta fija en el servidor. */
  coachActual(): { uid: string; email: string };
}

let fuente: FuenteDeDatos | null = null;

export function usarFuenteDeDatos(f: FuenteDeDatos): void { fuente = f; }
export function hayFuenteDeDatos(): boolean { return fuente !== null; }

export function datos(): FuenteDeDatos {
  if (!fuente) throw new Error('Las tools no tienen fuente de datos: llama a usarFuenteDeDatos(...) antes de ejecutar una tool.');
  return fuente;
}

export const coachActual = (): { uid: string; email: string } => datos().coachActual();

export const appendDossierFacts: FuenteDeDatos['appendDossierFacts'] = (...a) => (datos().appendDossierFacts as (...x: unknown[]) => unknown)(...a) as ReturnType<FuenteDeDatos['appendDossierFacts']>;
export const createAiProposal: FuenteDeDatos['createAiProposal'] = (...a) => (datos().createAiProposal as (...x: unknown[]) => unknown)(...a) as ReturnType<FuenteDeDatos['createAiProposal']>;
export const createCoachClientTask: FuenteDeDatos['createCoachClientTask'] = (...a) => (datos().createCoachClientTask as (...x: unknown[]) => unknown)(...a) as ReturnType<FuenteDeDatos['createCoachClientTask']>;
export const getAiProposalsForAthlete: FuenteDeDatos['getAiProposalsForAthlete'] = (...a) => (datos().getAiProposalsForAthlete as (...x: unknown[]) => unknown)(...a) as ReturnType<FuenteDeDatos['getAiProposalsForAthlete']>;
export const getAlimentosPersonales: FuenteDeDatos['getAlimentosPersonales'] = (...a) => (datos().getAlimentosPersonales as (...x: unknown[]) => unknown)(...a) as ReturnType<FuenteDeDatos['getAlimentosPersonales']>;
export const getAllUserProfiles: FuenteDeDatos['getAllUserProfiles'] = (...a) => (datos().getAllUserProfiles as (...x: unknown[]) => unknown)(...a) as ReturnType<FuenteDeDatos['getAllUserProfiles']>;
export const getApprovedAiProposals: FuenteDeDatos['getApprovedAiProposals'] = (...a) => (datos().getApprovedAiProposals as (...x: unknown[]) => unknown)(...a) as ReturnType<FuenteDeDatos['getApprovedAiProposals']>;
export const getAssignmentsForAthlete: FuenteDeDatos['getAssignmentsForAthlete'] = (...a) => (datos().getAssignmentsForAthlete as (...x: unknown[]) => unknown)(...a) as ReturnType<FuenteDeDatos['getAssignmentsForAthlete']>;
export const getAthleteDietConfig: FuenteDeDatos['getAthleteDietConfig'] = (...a) => (datos().getAthleteDietConfig as (...x: unknown[]) => unknown)(...a) as ReturnType<FuenteDeDatos['getAthleteDietConfig']>;
export const getAthleteNutritionConfig: FuenteDeDatos['getAthleteNutritionConfig'] = (...a) => (datos().getAthleteNutritionConfig as (...x: unknown[]) => unknown)(...a) as ReturnType<FuenteDeDatos['getAthleteNutritionConfig']>;
export const getBodyMeasurementsForAthlete: FuenteDeDatos['getBodyMeasurementsForAthlete'] = (...a) => (datos().getBodyMeasurementsForAthlete as (...x: unknown[]) => unknown)(...a) as ReturnType<FuenteDeDatos['getBodyMeasurementsForAthlete']>;
export const getBodyweightForAthlete: FuenteDeDatos['getBodyweightForAthlete'] = (...a) => (datos().getBodyweightForAthlete as (...x: unknown[]) => unknown)(...a) as ReturnType<FuenteDeDatos['getBodyweightForAthlete']>;
export const getCardioAssignmentsForAthlete: FuenteDeDatos['getCardioAssignmentsForAthlete'] = (...a) => (datos().getCardioAssignmentsForAthlete as (...x: unknown[]) => unknown)(...a) as ReturnType<FuenteDeDatos['getCardioAssignmentsForAthlete']>;
export const getCardioSessionsForAthlete: FuenteDeDatos['getCardioSessionsForAthlete'] = (...a) => (datos().getCardioSessionsForAthlete as (...x: unknown[]) => unknown)(...a) as ReturnType<FuenteDeDatos['getCardioSessionsForAthlete']>;
export const getCheckIns: FuenteDeDatos['getCheckIns'] = (...a) => (datos().getCheckIns as (...x: unknown[]) => unknown)(...a) as ReturnType<FuenteDeDatos['getCheckIns']>;
export const getCoachClientTasks: FuenteDeDatos['getCoachClientTasks'] = (...a) => (datos().getCoachClientTasks as (...x: unknown[]) => unknown)(...a) as ReturnType<FuenteDeDatos['getCoachClientTasks']>;
export const getDietCompletionLogsForAthlete: FuenteDeDatos['getDietCompletionLogsForAthlete'] = (...a) => (datos().getDietCompletionLogsForAthlete as (...x: unknown[]) => unknown)(...a) as ReturnType<FuenteDeDatos['getDietCompletionLogsForAthlete']>;
export const getDietsForAthlete: FuenteDeDatos['getDietsForAthlete'] = (...a) => (datos().getDietsForAthlete as (...x: unknown[]) => unknown)(...a) as ReturnType<FuenteDeDatos['getDietsForAthlete']>;
export const getDossier: FuenteDeDatos['getDossier'] = (...a) => (datos().getDossier as (...x: unknown[]) => unknown)(...a) as ReturnType<FuenteDeDatos['getDossier']>;
export const getExercises: FuenteDeDatos['getExercises'] = (...a) => (datos().getExercises as (...x: unknown[]) => unknown)(...a) as ReturnType<FuenteDeDatos['getExercises']>;
export const getFoodItems: FuenteDeDatos['getFoodItems'] = (...a) => (datos().getFoodItems as (...x: unknown[]) => unknown)(...a) as ReturnType<FuenteDeDatos['getFoodItems']>;
export const getKnowledgeNotes: FuenteDeDatos['getKnowledgeNotes'] = (...a) => (datos().getKnowledgeNotes as (...x: unknown[]) => unknown)(...a) as ReturnType<FuenteDeDatos['getKnowledgeNotes']>;
export const getMesocycles: FuenteDeDatos['getMesocycles'] = (...a) => (datos().getMesocycles as (...x: unknown[]) => unknown)(...a) as ReturnType<FuenteDeDatos['getMesocycles']>;
export const getNutritionProgram: FuenteDeDatos['getNutritionProgram'] = (...a) => (datos().getNutritionProgram as (...x: unknown[]) => unknown)(...a) as ReturnType<FuenteDeDatos['getNutritionProgram']>;
export const getOnboarding: FuenteDeDatos['getOnboarding'] = (...a) => (datos().getOnboarding as (...x: unknown[]) => unknown)(...a) as ReturnType<FuenteDeDatos['getOnboarding']>;
export const getOnboardingTemplate: FuenteDeDatos['getOnboardingTemplate'] = (...a) => (datos().getOnboardingTemplate as (...x: unknown[]) => unknown)(...a) as ReturnType<FuenteDeDatos['getOnboardingTemplate']>;
export const getPhotoAssignmentsForAthlete: FuenteDeDatos['getPhotoAssignmentsForAthlete'] = (...a) => (datos().getPhotoAssignmentsForAthlete as (...x: unknown[]) => unknown)(...a) as ReturnType<FuenteDeDatos['getPhotoAssignmentsForAthlete']>;
export const getProgressPhotos: FuenteDeDatos['getProgressPhotos'] = (...a) => (datos().getProgressPhotos as (...x: unknown[]) => unknown)(...a) as ReturnType<FuenteDeDatos['getProgressPhotos']>;
export const getQuestionnairesByCoach: FuenteDeDatos['getQuestionnairesByCoach'] = (...a) => (datos().getQuestionnairesByCoach as (...x: unknown[]) => unknown)(...a) as ReturnType<FuenteDeDatos['getQuestionnairesByCoach']>;
export const getRepartosGuardados: FuenteDeDatos['getRepartosGuardados'] = (...a) => (datos().getRepartosGuardados as (...x: unknown[]) => unknown)(...a) as ReturnType<FuenteDeDatos['getRepartosGuardados']>;
export const getResponsesForAthlete: FuenteDeDatos['getResponsesForAthlete'] = (...a) => (datos().getResponsesForAthlete as (...x: unknown[]) => unknown)(...a) as ReturnType<FuenteDeDatos['getResponsesForAthlete']>;
export const getRoadmap: FuenteDeDatos['getRoadmap'] = (...a) => (datos().getRoadmap as (...x: unknown[]) => unknown)(...a) as ReturnType<FuenteDeDatos['getRoadmap']>;
export const getStepsForAthlete: FuenteDeDatos['getStepsForAthlete'] = (...a) => (datos().getStepsForAthlete as (...x: unknown[]) => unknown)(...a) as ReturnType<FuenteDeDatos['getStepsForAthlete']>;
export const getTasksForAthlete: FuenteDeDatos['getTasksForAthlete'] = (...a) => (datos().getTasksForAthlete as (...x: unknown[]) => unknown)(...a) as ReturnType<FuenteDeDatos['getTasksForAthlete']>;
export const getUserProfileByEmail: FuenteDeDatos['getUserProfileByEmail'] = (...a) => (datos().getUserProfileByEmail as (...x: unknown[]) => unknown)(...a) as ReturnType<FuenteDeDatos['getUserProfileByEmail']>;
export const getVolumeLandmarks: FuenteDeDatos['getVolumeLandmarks'] = (...a) => (datos().getVolumeLandmarks as (...x: unknown[]) => unknown)(...a) as ReturnType<FuenteDeDatos['getVolumeLandmarks']>;
export const getWeeklyChallenge: FuenteDeDatos['getWeeklyChallenge'] = (...a) => (datos().getWeeklyChallenge as (...x: unknown[]) => unknown)(...a) as ReturnType<FuenteDeDatos['getWeeklyChallenge']>;
export const getWeeklyChallengesForAthlete: FuenteDeDatos['getWeeklyChallengesForAthlete'] = (...a) => (datos().getWeeklyChallengesForAthlete as (...x: unknown[]) => unknown)(...a) as ReturnType<FuenteDeDatos['getWeeklyChallengesForAthlete']>;
export const getWorkoutAssignments: FuenteDeDatos['getWorkoutAssignments'] = (...a) => (datos().getWorkoutAssignments as (...x: unknown[]) => unknown)(...a) as ReturnType<FuenteDeDatos['getWorkoutAssignments']>;
export const getWorkoutAssignmentsByMesocycleIds: FuenteDeDatos['getWorkoutAssignmentsByMesocycleIds'] = (...a) => (datos().getWorkoutAssignmentsByMesocycleIds as (...x: unknown[]) => unknown)(...a) as ReturnType<FuenteDeDatos['getWorkoutAssignmentsByMesocycleIds']>;
export const getWorkoutLogs: FuenteDeDatos['getWorkoutLogs'] = (...a) => (datos().getWorkoutLogs as (...x: unknown[]) => unknown)(...a) as ReturnType<FuenteDeDatos['getWorkoutLogs']>;
export const getWorkouts: FuenteDeDatos['getWorkouts'] = (...a) => (datos().getWorkouts as (...x: unknown[]) => unknown)(...a) as ReturnType<FuenteDeDatos['getWorkouts']>;
export const isLocalBypassActive: FuenteDeDatos['isLocalBypassActive'] = (...a) => (datos().isLocalBypassActive as (...x: unknown[]) => unknown)(...a) as ReturnType<FuenteDeDatos['isLocalBypassActive']>;
export const saveCoachReport: FuenteDeDatos['saveCoachReport'] = (...a) => (datos().saveCoachReport as (...x: unknown[]) => unknown)(...a) as ReturnType<FuenteDeDatos['saveCoachReport']>;
