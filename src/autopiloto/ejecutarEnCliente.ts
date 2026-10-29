/* El ejecutor del NAVEGADOR: traduce las operaciones de `aplicarPropuesta` a
   las funciones de `dbService` de siempre, con todo lo que ellas arrastran y
   que una escritura cruda perdería: espejo local, sello de versión de los
   catálogos (`workouts`), historial de cambios del coach (`cambiosAtleta`),
   modo local si Firestore no responde.

   Si una operación falla a mitad, lo que ya se escribió está vivo y el atleta
   lo ve. Por eso el error dice cuántas se hicieron y recuerda que volver a
   aprobar no duplica: cada propuesta recalcula qué falta desde el estado real
   (sesiones por `dayIndex`, asignaciones por `workoutId_date`). */

import {
  createDiet, updateDiet, createMesocycle, updateMesocycle, createWorkoutStrict, updateWorkout,
  createWorkoutAssignmentStrict, updateWorkoutAssignment, saveRoadmap, saveNutritionProgram, createTask,
  updateUserProfile, saveAthleteNutritionConfig, saveAthleteDietConfig, assignQuestionnaire, assignPhotoCheckIn,
  createCardioAssignment, saveWeeklyChallenge, createMesocycleTemplate, submitCoachFeedback,
} from '../dbService.js';
import { saveDossierJudgement } from '../db/dossier.js';
import { guardarRespuestaCoach } from '../db/questionnaires.js';
import type { SnapshotDocumento } from '../types.js';
import { fotoDeCreacion, resolverReferencias, type Operacion } from './aplicarPropuesta.js';

export interface ResultadoEjecucion {
  /** Ids reales de lo creado, por `ref`. */
  refs: Record<string, string>;
  /** Snapshot de lo creado (`datos: null`): deshacer = borrar. */
  creados: SnapshotDocumento[];
}

export class ErrorDeEjecucion extends Error {
  constructor(
    readonly hechas: number,
    readonly total: number,
    readonly operacion: Operacion,
    readonly causa: unknown,
  ) {
    super(describir(hechas, total, operacion));
    this.name = 'ErrorDeEjecucion';
  }
}

const QUE: Record<Operacion['tipo'], string> = {
  crearDieta: 'crear la dieta', actualizarDieta: 'actualizar la dieta',
  crearMesociclo: 'crear el mesociclo', actualizarMesociclo: 'actualizar el mesociclo',
  crearRutina: 'guardar la sesión', actualizarRutina: 'reescribir la sesión',
  crearAsignacion: 'asignar el entreno', actualizarAsignacion: 'anotar el día',
  guardarRoadmap: 'guardar el road map', guardarPrograma: 'guardar la periodización', crearTarea: 'crear la tarea',
  guardarJuicioFicha: 'guardar la ficha', actualizarPerfil: 'actualizar el perfil',
  guardarConfigNutricion: 'guardar los pasos', guardarConfigDieta: 'guardar el calendario de dietas',
  asignarCuestionario: 'asignar el cuestionario', asignarFotos: 'asignar las fotos', crearCardio: 'asignar el cardio',
  guardarReto: 'guardar el reto', crearPlantillaMesociclo: 'guardar la plantilla', feedbackCheckin: 'enviar el feedback',
  responderRevision: 'enviar la respuesta a la revisión',
};

function describir(hechas: number, total: number, op: Operacion): string {
  const detalle = op.tipo === 'crearRutina' && op.rutina.dayIndex !== undefined ? ` (día ${op.rutina.dayIndex + 1})`
    : op.tipo === 'crearAsignacion' ? ` (${op.asignacion.date})` : '';
  const ya = hechas > 0
    ? ` Se guardaron ${hechas} de ${total}: vuelve a aprobarla para terminar (no duplica lo que ya está).`
    : ' No se guardó nada.';
  return `Falló al ${QUE[op.tipo]}${detalle}.${ya}`;
}

export async function ejecutarEnCliente(operaciones: Operacion[]): Promise<ResultadoEjecucion> {
  const refs: Record<string, string> = {};
  const creados: SnapshotDocumento[] = [];
  for (const [i, bruta] of operaciones.entries()) {
    const op = resolverReferencias(bruta, refs);
    try {
      switch (op.tipo) {
        case 'crearDieta': { const d = await createDiet(op.dieta); refs[op.ref] = d.id; creados.push(fotoDeCreacion(op, d.id)); break; }
        case 'actualizarDieta': await updateDiet(op.id, op.cambios); break;
        case 'crearMesociclo': { const m = await createMesocycle(op.mesociclo); refs[op.ref] = m.id; creados.push(fotoDeCreacion(op, m.id)); break; }
        case 'actualizarMesociclo': await updateMesocycle(op.id, op.cambios); break;
        case 'crearRutina': { const w = await createWorkoutStrict(op.rutina); refs[op.ref] = w.id; creados.push(fotoDeCreacion(op, w.id)); break; }
        case 'actualizarRutina': await updateWorkout(op.id, op.cambios); break;
        case 'crearAsignacion': { const a = await createWorkoutAssignmentStrict(op.asignacion); creados.push(fotoDeCreacion(op, a.id)); break; }
        case 'actualizarAsignacion': await updateWorkoutAssignment(op.id, op.cambios); break;
        case 'guardarRoadmap': await saveRoadmap(op.roadmap); break;
        case 'guardarPrograma': await saveNutritionProgram(op.programa); break;
        case 'crearTarea': { const t = await createTask(op.tarea); creados.push(fotoDeCreacion(op, t.id)); break; }
        case 'guardarJuicioFicha': await saveDossierJudgement(op.athleteId, op.patch); break;
        case 'actualizarPerfil': await updateUserProfile(op.userId, op.cambios); break;
        case 'guardarConfigNutricion': await saveAthleteNutritionConfig(op.config); break;
        case 'guardarConfigDieta': await saveAthleteDietConfig(op.config); break;
        case 'asignarCuestionario': { const q = await assignQuestionnaire(op.asignacion); creados.push(fotoDeCreacion(op, q.id)); break; }
        case 'asignarFotos': { const f = await assignPhotoCheckIn(op.asignacion); creados.push(fotoDeCreacion(op, f.id)); break; }
        case 'crearCardio': { const c = await createCardioAssignment(op.asignacion); creados.push(fotoDeCreacion(op, c.id)); break; }
        case 'guardarReto': await saveWeeklyChallenge(op.reto); creados.push(fotoDeCreacion(op, op.reto.id)); break;
        case 'crearPlantillaMesociclo': { const t = await createMesocycleTemplate(op.plantilla); refs[op.ref] = t.id; creados.push(fotoDeCreacion(op, t.id)); break; }
        case 'feedbackCheckin': await submitCoachFeedback(op.checkInId, op.feedback); break;
        case 'responderRevision': await guardarRespuestaCoach(op.responseId, op.respuesta); break;
      }
    } catch (err) {
      throw new ErrorDeEjecucion(i, operaciones.length, op, err);
    }
  }
  return { refs, creados };
}
