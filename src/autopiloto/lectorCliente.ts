/* El lector del navegador para `aplicarPropuesta`: las mismas lecturas que
   hacía el hook de aprobación, detrás de la interfaz que el servidor
   implementará con el SDK de administración. */
import {
  getDietsForAthlete, getMesocycles, getWorkouts, getRoadmap, getNutritionProgram, getAllUserProfiles,
  getWorkoutAssignments, getAthleteNutritionConfig, getAthleteDietConfig, getExercises, getCheckIns, getResponsesForAthlete,
} from '../dbService.js';
import { getDossier } from '../db/dossier.js';
import type { LectorAplicacion } from './aplicarPropuesta.js';

export function lectorDeCliente(): LectorAplicacion {
  return {
    dietas: email => getDietsForAthlete(email),
    mesociclos: email => getMesocycles(email),
    rutinas: () => getWorkouts(),
    roadmap: email => getRoadmap(email),
    programa: email => getNutritionProgram(email),
    perfil: async email => (await getAllUserProfiles()).find(u => u.email === email) ?? null,
    asignaciones: perfil => getWorkoutAssignments({ uid: perfil.userId, email: perfil.email }),
    configNutricion: async email => (await getAthleteNutritionConfig(email)) ?? null,
    configDieta: async email => (await getAthleteDietConfig(email)) ?? null,
    ejercicios: () => getExercises(),
    checkin: async id => (await getCheckIns()).find(c => c.id === id) ?? null,
    ficha: email => getDossier(email),
    respuestaCuestionario: async (email, id) => (await getResponsesForAthlete(email)).find(r => r.id === id) ?? null,
  };
}
