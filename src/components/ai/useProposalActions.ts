/* Aprobar, rechazar y comentar una propuesta de la IA.
 *
 * Vivía dentro de AiChatPanel, que es donde se revisaban: la bandeja del
 * chat. Pero revisar el plan de un mes ahí es incómodo —ocupa media columna
 * de un panel lateral— y la pantalla de Propuestas necesita exactamente la
 * MISMA lógica de aprobación. Duplicarla habría sido garantizar que las dos
 * se separan en cuanto alguien toque una.
 *
 * Aquí solo está lo que ESCRIBE. Lo que se pinta (tarjeta, editor, «antes →
 * después») vive en ProposalCard, y cada pantalla pone el suyo alrededor.
 */

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AiProposal, AiProposalPayload, Diet, DossierPatch, LevelLadder, Mesocycle,
  PeriodizationBlockPayload, RoadmapProposalPayload, NutritionProgramProposalPayload,
  SpecialDayProposalPayload, WorkoutDaysProposalPayload, WorkoutExercise, NutritionPhase, Roadmap,
  SetupConfigProposalPayload, PublishBlockProposalPayload, WeeklyChallengeProposalPayload,
  WorkoutTemplateProposalPayload, MesocycleTemplateProposalPayload, WeeklyChallenge, CardioProgram,
  TemplateStage, WeekDay, ProposalComment,
} from '../../types';
import {
  updateAiProposal, submitCoachFeedback, createDiet, updateDiet, createMesocycle,
  createTask, getRoadmap, saveRoadmap, saveNutritionProgram, getAllUserProfiles,
  getWorkoutAssignments, updateWorkoutAssignment,
  getWorkouts, createWorkoutStrict, updateWorkout, getMesocycles, getExercises,
  updateUserProfile, getAthleteNutritionConfig, saveAthleteNutritionConfig,
  getAthleteDietConfig, saveAthleteDietConfig, assignQuestionnaire, assignPhotoCheckIn,
  createCardioAssignment, saveWeeklyChallenge, createMesocycleTemplate,
  createWorkoutAssignmentStrict, getDietsForAthlete,
} from '../../dbService';
import { sesionesDeMesociclo, fechasDelMesociclo } from '../../utils/asignacionMesociclo';
import { prescripcionDeSemana, ZONA2_BASE_MIN_DEFECTO } from '../../utils/cardioProgression';
import { isoWeekKey, isoWeekBounds } from '../../utils/challengeOptions';
import { saveDossierJudgement, appendDossierFacts } from '../../db/dossier';
import { dossierKey } from '../DossierPanel';
import { nombreDeSesion } from '../../utils/nombresMeso';
import { describirEdicion, motivoParaNoAprobar } from '../../utils/edicionPropuesta';
import { ordenarPropuestasPorPlan } from '../../utils/ordenPropuestas';
import { auth } from '../../firebase';

function clavesQueRefrescar(kind: AiProposal['kind'], athleteEmail: string): unknown[][] {
  switch (kind) {
    case 'workoutDays':
      return [['workouts']];
    case 'mesocycle':
    case 'periodizationBlock':
      return [['mesocycles', athleteEmail], ['workouts'], ['tasksForAthlete', athleteEmail]];
    case 'levelLadder':
    case 'roadmap':
      return [['roadmap', athleteEmail]];
    case 'specialDay':
      return [['roadmap', athleteEmail], ['tasksForAthlete', athleteEmail]];
    case 'nutritionProgram':
      return [['nutritionProgram', athleteEmail], ['dietsForAthlete', athleteEmail]];
    case 'diet':
      return [['dietsForAthlete', athleteEmail]];
    case 'setupConfig':
      return [
        ['userProfiles'], ['athleteNutritionConfig', athleteEmail], ['athleteDietConfig', athleteEmail],
        ['assignmentsForAthlete', athleteEmail], ['photoAssignmentsForAthlete', athleteEmail],
        ['roadmap', athleteEmail], ['cardioAssignments', athleteEmail],
      ];
    case 'publishBlock':
      // Las asignaciones se cachean por UID (ClientHub) y con otra raíz en la
      // pantalla del atleta: se invalidan las dos por prefijo, porque aquí solo
      // tenemos el email.
      return [['workoutAssignments'], ['workoutAssignmentsForAthlete'], ['workouts'], ['mesocycles', athleteEmail]];
    case 'weeklyChallenge':
      return [['weeklyChallenge', athleteEmail], ['weeklyChallengesForAthlete', athleteEmail], ['roadmap', athleteEmail]];
    case 'workoutTemplate':
      return [['workouts']];
    case 'mesocycleTemplate':
      return [['mesocycleTemplates']];
    default:
      return [];
  }
}

class AprobacionYaAvisada extends Error {
  constructor(readonly causa: unknown) { super('aprobación fallida, ya avisada'); }
}

export interface ProposalActions {
  /** Id de la propuesta que se está escribiendo ahora mismo, o null. */
  reviewingId: string | null;
  /** Email del atleta cuyo plan se está aprobando entero, o null. */
  aprobandoTodas: string | null;
  aprobar: (original: AiProposal, editado?: AiProposalPayload, nota?: string) => Promise<boolean>;
  aprobarTodas: (lista: AiProposal[], editsPorId?: Record<string, AiProposalPayload>) => Promise<void>;
  rechazar: (p: AiProposal) => Promise<void>;
  comentar: (p: AiProposal, texto: string) => Promise<void>;
}

export function useProposalActions(
  { onError, onAprobada }: { onError: (msg: string) => void; onAprobada?: (id: string) => void },
): ProposalActions {
  const queryClient = useQueryClient();
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [aprobandoTodas, setAprobandoTodas] = useState<string | null>(null);
  const setError = onError;

  /** Las dos consultas que enseñan propuestas: la bandeja (todas las
   *  pendientes) y el aviso de la ficha del cliente. Se refrescan juntas o una
   *  de las dos se queda con el número viejo. */
  const refrescarListas = () => {
    queryClient.invalidateQueries({ queryKey: ['aiProposalsPendientes'] });
    queryClient.invalidateQueries({ queryKey: ['aiProposalsForAthlete'] });
  };

  const approveProposal = async (
    original: AiProposal, editado?: AiProposalPayload, nota = '',
  ): Promise<boolean> => {
    setReviewingId(original.id);
    // Se aprueba lo que Dani tiene delante, no lo que propuso la IA.
    const p: AiProposal = editado ? { ...original, payload: editado } : original;
    try {
      if (p.kind === 'checkinFeedback') {
        const { checkInId, feedback } = p.payload as { checkInId: string; feedback: string };
        await submitCoachFeedback(checkInId, feedback);
        await updateAiProposal(p.id, { status: 'approved', reviewedAt: new Date().toISOString(), resultEntityId: checkInId });
      } else if (p.kind === 'diet') {
        const dietPayload = p.payload as Omit<Diet, 'id'>;
        if (p.baseEntityId) {
          await updateDiet(p.baseEntityId, dietPayload);
          await updateAiProposal(p.id, { status: 'approved', reviewedAt: new Date().toISOString(), resultEntityId: p.baseEntityId });
        } else {
          const created = await createDiet(dietPayload);
          await updateAiProposal(p.id, { status: 'approved', reviewedAt: new Date().toISOString(), resultEntityId: created.id });
        }
      } else if (p.kind === 'mesocycle') {
        const created = await createMesocycle(p.payload as Omit<Mesocycle, 'id'>);
        await updateAiProposal(p.id, { status: 'approved', reviewedAt: new Date().toISOString(), resultEntityId: created.id });
      } else if (p.kind === 'roadmap') {
        // Se AÑADEN a lo que ya tiene: el roadmap es suyo, no se reemplaza.
        const { items, planPhases } = p.payload as RoadmapProposalPayload;
        const actual = await getRoadmap(p.athleteId);
        const base: Roadmap = actual ?? { athleteId: p.athleteId, items: [] };
        await saveRoadmap({
          ...base,
          items: [...base.items, ...items],
          ...(planPhases ? { planPhases } : {}),
        });
        await updateAiProposal(p.id, { status: 'approved', reviewedAt: new Date().toISOString(), resultEntityId: p.athleteId });
      } else if (p.kind === 'nutritionProgram') {
        // Las fases que traían dieta nueva la crean AQUÍ y se enlazan por id:
        // una fase sin dieta enlazada no le enseña nada al atleta.
        const { startDate, phases, refeedDays } = p.payload as NutritionProgramProposalPayload;
        const fases: NutritionPhase[] = [];
        for (const [i, fase] of phases.entries()) {
          let dietId = fase.dietId ?? '';
          if (!dietId && fase.diet) {
            const creada = await createDiet(fase.diet);
            dietId = creada.id;
          }
          fases.push({
            id: `nph_${Date.now()}_${i}`,
            name: fase.name,
            weeks: fase.weeks,
            dietId,
            ...(fase.targetKcal != null ? { targetKcal: fase.targetKcal } : {}),
            ...(fase.targetWeight != null ? { targetWeight: fase.targetWeight } : {}),
            ...(fase.phaseType ? { phaseType: fase.phaseType } : {}),
          });
        }
        await saveNutritionProgram({
          athleteId: p.athleteId,
          startDate,
          phases: fases,
          ...(refeedDays?.length ? { refeedDays } : {}),
        });
        await updateAiProposal(p.id, { status: 'approved', reviewedAt: new Date().toISOString(), resultEntityId: p.athleteId });
      } else if (p.kind === 'specialDay') {
        // Las tres cosas a la vez: por separado ninguna se nota. El hito lo ve
        // venir, la tarea le salta ese día, y la nota la lee encima de la sesión.
        const dia = p.payload as SpecialDayProposalPayload;
        const actual = await getRoadmap(p.athleteId);
        const base: Roadmap = actual ?? { athleteId: p.athleteId, items: [] };
        await saveRoadmap({
          ...base,
          items: [...base.items, {
            id: `rmi_${Date.now()}`,
            title: dia.title,
            description: dia.description,
            type: 'hito',
            lane: dia.kind === 'otro' ? 'general' : 'entreno',
            targetDate: dia.date,
            status: 'pendiente',
          }],
        });
        await createTask({
          athleteId: p.athleteId, type: 'manual', title: dia.title, dueDate: dia.date,
          status: 'pending', linkTab: 'training', createdBy: 'coach', createdAt: new Date().toISOString(),
        });
        const perfil = (await getAllUserProfiles()).find(u => u.email === p.athleteId);
        if (perfil) {
          const asignaciones = await getWorkoutAssignments({ uid: perfil.userId, email: perfil.email });
          const delDia = asignaciones.find(a => a.date === dia.date);
          if (delDia) await updateWorkoutAssignment(delDia.id, { note: dia.athleteNote });
        }
        await updateAiProposal(p.id, { status: 'approved', reviewedAt: new Date().toISOString(), resultEntityId: p.athleteId });
      } else if (p.kind === 'dossier') {
        // La IA solo propone los campos de juicio; aquí es donde se aplican.
        await saveDossierJudgement(p.athleteId, p.payload as DossierPatch);
        await updateAiProposal(p.id, { status: 'approved', reviewedAt: new Date().toISOString(), resultEntityId: p.athleteId });
        await queryClient.invalidateQueries({ queryKey: dossierKey(p.athleteId) });
      } else if (p.kind === 'workoutDays') {
        // Cada día se guarda como LA rutina de ese día del mesociclo. Si ya
        // había una, se reescribe conservando su id: las asignaciones del
        // calendario del atleta apuntan a ese documento, y crear uno nuevo
        // dejaría al atleta entrenando la rutina vieja para siempre.
        const { mesocycleId, days } = p.payload as WorkoutDaysProposalPayload;
        const [todas, mesos] = await Promise.all([getWorkouts(), getMesocycles(p.athleteId)]);
        const meso = mesos.find(m => m.id === mesocycleId);
        const delMeso = todas.filter(w => w.mesocycleId === mesocycleId);
        const athleteName = (await getAllUserProfiles()).find(u => u.email === p.athleteId)?.displayName;
        // Se escribe día a día y no hay transacción posible (son documentos
        // sueltos). Si peta a mitad, lo que NO puede pasar es que el error diga
        // solo "no se pudo": los días ya escritos están vivos y el atleta los
        // ve. Se lleva la cuenta para decirlo.
        const guardados: number[] = [];
        for (const dia of days) {
          const exercises: WorkoutExercise[] = dia.exercises.map((ex, i) => ({
            exerciseId: ex.exerciseId,
            order: i,
            sets: ex.sets,
            reps: ex.reps,
            rir: ex.rir,
            restSeconds: ex.restSeconds,
            ...(ex.notes ? { notes: ex.notes } : {}),
            ...(ex.muscleGroup ? { muscleGroup: ex.muscleGroup } : {}),
          }));
          const nombre = dia.name?.trim() || (meso
            ? nombreDeSesion({ dayIdx: dia.dayIndex, athleteName, meso })
            : `Sesión ${dia.dayIndex + 1}`);
          const existente = delMeso.find(w => w.dayIndex === dia.dayIndex);
          try {
            if (existente) {
              await updateWorkout(existente.id, { name: nombre, exercises });
            } else {
              await createWorkoutStrict({
                ownerId: auth.currentUser?.uid ?? '',
                name: nombre,
                mesocycleId,
                dayIndex: dia.dayIndex,
                exercises,
              });
            }
            guardados.push(dia.dayIndex + 1);
          } catch (err) {
            queryClient.invalidateQueries({ queryKey: ['workouts'] });
            const yaHechos = guardados.length
              ? ` Los días ${guardados.join(', ')} sí se guardaron: vuelve a aprobarla para terminar (reescribe los mismos días, no duplica).`
              : ' No se guardó ningún día.';
            setError(`Falló al guardar el día ${dia.dayIndex + 1}.${yaHechos}`);
            setReviewingId(null);
            throw new AprobacionYaAvisada(err);
          }
        }
        await updateAiProposal(p.id, { status: 'approved', reviewedAt: new Date().toISOString(), resultEntityId: mesocycleId });
      } else if (p.kind === 'levelLadder') {
        const ladder = p.payload as LevelLadder;
        const actual = await getRoadmap(p.athleteId);
        const base: Roadmap = actual ?? { athleteId: p.athleteId, items: [] };
        await saveRoadmap({ ...base, levelLadder: ladder });
        await updateAiProposal(p.id, { status: 'approved', reviewedAt: new Date().toISOString(), resultEntityId: p.athleteId });
      } else if (p.kind === 'setupConfig') {
        // Cada campo va a su sitio; los que no vengan no se tocan. Las dietas
        // del calendario llegan por NOMBRE porque al proponerlas todavía no
        // existían (las crea la periodización al aprobarse), así que se
        // resuelven aquí contra las que el atleta tiene YA.
        const v = p.payload as SetupConfigProposalPayload;
        const perfilUpdates: Record<string, unknown> = {};
        if (v.planStartDate) perfilUpdates.planStartDate = v.planStartDate;
        if (v.planDurationMonths) perfilUpdates.planDurationMonths = v.planDurationMonths;
        if (v.targetWeight) perfilUpdates.targetWeight = v.targetWeight;
        if (Object.keys(perfilUpdates).length) {
          const perfil = (await getAllUserProfiles()).find(u => u.email === p.athleteId);
          if (!perfil) throw new Error(`No se encuentra el perfil de ${p.athleteId}.`);
          await updateUserProfile(perfil.userId, perfilUpdates);
        }
        if (v.stepGoal !== undefined) {
          const cfg = await getAthleteNutritionConfig(p.athleteId);
          await saveAthleteNutritionConfig({ ...cfg, stepGoal: v.stepGoal });
        }
        if (v.activeDietNames || v.weeklyScheduleByName) {
          const dietas = await getDietsForAthlete(p.athleteId);
          const idDe = (nombre: string) => dietas.find(d => d.name.trim().toLowerCase() === nombre.trim().toLowerCase())?.id ?? null;
          const sinResolver = [
            ...(v.activeDietNames ?? []),
            ...Object.values(v.weeklyScheduleByName ?? {}).filter((x): x is string => typeof x === 'string'),
          ].filter(n => !idDe(n));
          if (sinResolver.length) {
            setError(`No encuentro estas dietas de ${p.athleteId}: ${[...new Set(sinResolver)].join(', ')}. Aprueba antes la propuesta de dietas o de periodización nutricional.`);
            setReviewingId(null);
            throw new AprobacionYaAvisada(new Error('dietas sin resolver'));
          }
          const cfg = await getAthleteDietConfig(p.athleteId);
          const base = cfg ?? { athleteId: p.athleteId, activeDietIds: [] };
          const schedule: Partial<Record<WeekDay, string | null>> = { ...(base.weeklySchedule ?? {}) };
          for (const [dia, nombre] of Object.entries(v.weeklyScheduleByName ?? {})) {
            schedule[dia as WeekDay] = nombre ? idDe(nombre) : null;
          }
          await saveAthleteDietConfig({
            ...base,
            ...(v.activeDietNames ? { activeDietIds: v.activeDietNames.map(n => idDe(n)!) } : {}),
            ...(v.weeklyScheduleByName ? { weeklySchedule: schedule } : {}),
          });
        }
        if (v.questionnaire) {
          await assignQuestionnaire({
            questionnaireId: v.questionnaire.questionnaireId,
            athleteId: p.athleteId,
            schedule: v.questionnaire.schedule,
            startDate: v.questionnaire.startDate,
            active: true,
            createdAt: new Date().toISOString(),
          });
        }
        if (v.photos) {
          await assignPhotoCheckIn({
            athleteId: p.athleteId,
            schedule: v.photos.schedule,
            startDate: v.photos.startDate,
            views: v.photos.views,
            active: true,
            createdAt: new Date().toISOString(),
          });
        }
        if (v.liftExerciseNames?.length) {
          const catalogo = await getExercises();
          const ids = v.liftExerciseNames
            .map(n => catalogo.find(e => e.name.trim().toLowerCase() === n.trim().toLowerCase())?.id)
            .filter((x): x is string => !!x);
          const actual = await getRoadmap(p.athleteId);
          const base: Roadmap = actual ?? { athleteId: p.athleteId, items: [] };
          await saveRoadmap({ ...base, challengeConfig: { ...(base.challengeConfig ?? {}), liftExerciseIds: ids } });
        }
        if (v.cardio) {
          const program: CardioProgram = v.cardio.kind === 'vo2max'
            ? { kind: 'vo2max', protocolId: v.cardio.protocolId ?? 'noruego4x4', startDate: v.cardio.startDate }
            : { kind: 'zona2', protocolId: 'zona2', startDate: v.cardio.startDate, baseMinutes: v.cardio.baseMinutes ?? ZONA2_BASE_MIN_DEFECTO, targetZone: 'z2' };
          const semana1 = prescripcionDeSemana(program, 1);
          await createCardioAssignment({
            athleteId: p.athleteId,
            type: v.cardio.kind === 'vo2max' ? 'intervalos' : 'zona2',
            targetDurationSec: semana1.intervals
              ? semana1.intervals.reduce((sum, b) => sum + b.durationSec, 0)
              : semana1.targetDurationSec,
            ...(v.cardio.kind === 'zona2' ? { targetZone: 'z2' as const } : {}),
            ...(semana1.intervals ? { intervals: semana1.intervals } : {}),
            timesPerWeek: semana1.sesionesPorSemana,
            active: true,
            createdAt: new Date().toISOString(),
            program,
          });
        }
        await updateAiProposal(p.id, { status: 'approved', reviewedAt: new Date().toISOString(), resultEntityId: p.athleteId });
      } else if (p.kind === 'publishBlock') {
        // El paso que hace que el atleta VEA sus entrenos: una asignación por
        // sesión y vuelta. Las fechas que ya tenga asignadas no se duplican, así
        // que volver a aprobar después de un fallo termina el trabajo en vez de
        // dejarle el calendario doble.
        const { mesocycleId, mesocycleName } = p.payload as PublishBlockProposalPayload;
        const perfil = (await getAllUserProfiles()).find(u => u.email === p.athleteId);
        if (!perfil) throw new Error(`No se encuentra el perfil de ${p.athleteId}.`);
        const [todas, mesos, yaAsignadas] = await Promise.all([
          getWorkouts(), getMesocycles(p.athleteId),
          getWorkoutAssignments({ uid: perfil.userId, email: perfil.email }),
        ]);
        const meso = mesos.find(m => m.id === mesocycleId);
        if (!meso) throw new Error(`El mesociclo de «${mesocycleName}» ya no existe.`);
        const sesiones = sesionesDeMesociclo(todas, mesocycleId);
        if (sesiones.length === 0) {
          setError(`«${mesocycleName}» todavía no tiene sesiones. Aprueba antes la propuesta de sesiones y vuelve a aprobar esta.`);
          setReviewingId(null);
          throw new AprobacionYaAvisada(new Error('bloque sin sesiones'));
        }
        const ocupadas = new Set(yaAsignadas.filter(a => a.mesocycleId === mesocycleId).map(a => `${a.workoutId}_${a.date}`));
        const fechas = fechasDelMesociclo(meso, sesiones.length);
        let creadas = 0;
        for (const f of fechas) {
          const workoutId = sesiones[f.dayIdx]?.id;
          if (!workoutId || ocupadas.has(`${workoutId}_${f.date}`)) continue;
          try {
            await createWorkoutAssignmentStrict({
              workoutId, athleteId: p.athleteId, mesocycleId, date: f.date, status: 'pending',
            });
            creadas++;
          } catch (err) {
            queryClient.invalidateQueries({ queryKey: ['workoutAssignments', p.athleteId] });
            setError(`Falló al asignar el ${f.date}. Se habían creado ${creadas} entrenos: vuelve a aprobarla para terminar (no duplica los que ya están).`);
            setReviewingId(null);
            throw new AprobacionYaAvisada(err);
          }
        }
        await updateAiProposal(p.id, { status: 'approved', reviewedAt: new Date().toISOString(), resultEntityId: mesocycleId });
      } else if (p.kind === 'weeklyChallenge') {
        const v = p.payload as WeeklyChallengeProposalPayload;
        const { weekStart, weekEnd } = isoWeekBounds(v.today);
        const isoWeek = isoWeekKey(v.today);
        const reto: WeeklyChallenge = {
          id: `${p.athleteId}_${isoWeek}`,
          athleteId: p.athleteId,
          isoWeek, weekStart, weekEnd,
          kind: v.kind, title: v.title, description: v.description,
          origin: 'coach', metric: v.metric,
          status: 'activo',
          createdAt: new Date().toISOString(),
          ...(v.isMilestone ? { isMilestone: true } : {}),
          ...(v.difficulty ? { difficulty: v.difficulty } : {}),
        };
        await saveWeeklyChallenge(reto);
        await updateAiProposal(p.id, { status: 'approved', reviewedAt: new Date().toISOString(), resultEntityId: reto.id });
      } else if (p.kind === 'workoutTemplate') {
        // Rutina del coach SIN mesocycleId: es una plantilla suya, no el
        // entreno de nadie. Aparece en Entrenamientos para reutilizarla.
        const v = p.payload as WorkoutTemplateProposalPayload;
        const created = await createWorkoutStrict({
          ownerId: auth.currentUser?.uid ?? '',
          name: v.name,
          exercises: v.exercises.map((ex, i) => ({
            exerciseId: ex.exerciseId, order: i, sets: ex.sets, reps: ex.reps,
            rir: ex.rir, restSeconds: ex.restSeconds,
            ...(ex.notes ? { notes: ex.notes } : {}),
            ...(ex.muscleGroup ? { muscleGroup: ex.muscleGroup } : {}),
          })),
        });
        await updateAiProposal(p.id, { status: 'approved', reviewedAt: new Date().toISOString(), resultEntityId: created.id });
      } else if (p.kind === 'mesocycleTemplate') {
        const v = p.payload as MesocycleTemplateProposalPayload;
        const stages: TemplateStage[] = v.stages.map((st, i) => ({
          id: `stage_${Date.now()}_${i}`,
          name: st.name, weeks: st.weeks, daysPerWeek: st.daysPerWeek, groups: st.groups,
          ...(st.deloadWeek !== undefined ? { deloadWeek: st.deloadWeek } : {}),
          ...(st.reviewCadenceWeeks !== undefined ? { reviewCadenceWeeks: st.reviewCadenceWeeks, reviewType: st.reviewType ?? 'revision' } : {}),
          ...(st.days ? {
            days: st.days.map((d, k) => ({
              id: `tday_${Date.now()}_${i}_${k}`,
              name: d.name,
              exercises: d.exercises.map((ex, j) => ({
                exerciseId: ex.exerciseId, order: j, sets: ex.sets, reps: ex.reps,
                rir: ex.rir, restSeconds: ex.restSeconds,
                ...(ex.notes ? { notes: ex.notes } : {}),
                ...(ex.muscleGroup ? { muscleGroup: ex.muscleGroup } : {}),
              })),
            })),
          } : {}),
        }));
        const created = await createMesocycleTemplate({
          ownerId: auth.currentUser?.uid ?? '',
          name: v.name,
          ...(v.description ? { description: v.description } : {}),
          stages,
        });
        await updateAiProposal(p.id, { status: 'approved', reviewedAt: new Date().toISOString(), resultEntityId: created.id });
      } else if (p.kind === 'periodizationBlock') {
        // Bloque H2.1 — al aprobar se crea el mesociclo Y toda la cadencia de
        // revisiones de golpe; el carril "Revisiones" del cuadro de mando las
        // pinta solas en cuanto existen como TaskItem, no hace falta nada más.
        const { mesocycle, reviewCadenceWeeks, reviewType } = p.payload as PeriodizationBlockPayload;
        const created = await createMesocycle(mesocycle);
        const reviewCount = Math.max(1, Math.floor(mesocycle.weeks / reviewCadenceWeeks));
        const reviewTitle = reviewType === 'revision' ? 'Revisión' : reviewType === 'cuestionario' ? 'Cuestionario' : 'Fotos de check-in';
        await Promise.all(Array.from({ length: reviewCount }, (_, i) => {
          const weekOffset = (i + 1) * reviewCadenceWeeks;
          const date = new Date(mesocycle.startDate + 'T00:00:00');
          date.setDate(date.getDate() + weekOffset * 7);
          return createTask({
            athleteId: p.athleteId, type: reviewType,
            title: `${reviewTitle} — bloque #${mesocycle.number}`,
            dueDate: date.toISOString().split('T')[0],
            status: 'pending', createdBy: 'coach', createdAt: new Date().toISOString(),
          });
        }));
        await updateAiProposal(p.id, { status: 'approved', reviewedAt: new Date().toISOString(), resultEntityId: created.id });
      }
      // Aprobar es un hecho: se apunta solo en la ficha, con el porqué si Dani
      // lo ha escrito. Lo que él cambie DESPUÉS a mano no se pregunta aquí
      // (todavía no ha cambiado nada): se detecta comparando la propuesta con
      // la entidad viva — ver utils/derivaPropuestas.ts.
      const notaLimpia = nota.trim();
      if (notaLimpia) {
        await updateAiProposal(p.id, {
          expediente: { datos: '', huecos: '', preguntas: [], esperado: '', ...p.expediente, notaAlAprobar: notaLimpia },
        });
      }
      // Lo que se acaba de escribir tiene que verse SIN recargar. Antes solo
      // invalidaba la ficha viva, así que aprobar un roadmap o una
      // periodización no cambiaba nada en pantalla hasta salir y volver.
      for (const clave of clavesQueRefrescar(p.kind, p.athleteId)) {
        queryClient.invalidateQueries({ queryKey: clave });
      }

      // Editarla antes de aprobar es la corrección más barata que existe, y la
      // que más dice de su criterio. Se apunta como hecho para que la próxima
      // propuesta ya venga con ella dentro (la IA lo lee en get_athlete_dossier).
      const hechos = [{
        at: new Date().toISOString(),
        kind: 'aprobacion' as const,
        text: notaLimpia ? `${p.summary} — ${notaLimpia}` : p.summary,
        proposalId: p.id,
        chatId: p.chatId,
      }];
      if (editado) {
        hechos.push({
          at: new Date().toISOString(),
          kind: 'aprobacion' as const,
          text: `Dani editó la propuesta antes de aprobarla: ${describirEdicion(original, editado)}`,
          proposalId: p.id,
          chatId: p.chatId,
        });
      }
      appendDossierFacts(p.athleteId, hechos)
        .catch(err => console.warn('No se pudo apuntar la aprobación en la ficha:', err));
      onAprobada?.(p.id);
      refrescarListas();
      return true;
    } catch (err) {
      // El error del guardado por días ya trae su propio mensaje, con qué se
      // llegó a guardar. Pisarlo con el genérico sería peor que no decir nada.
      if (!(err instanceof AprobacionYaAvisada)) {
        setError('No se pudo aprobar la propuesta — inténtalo de nuevo.');
      }
      return false;
    } finally {
      setReviewingId(null);
    }
  };

  const aprobarTodas = async (lista: AiProposal[], editsPorId: Record<string, AiProposalPayload> = {}) => {
    if (aprobandoTodas) return;
    setAprobandoTodas(lista[0]?.athleteId ?? '');
    setError('');
    try {
      for (const p of ordenarPropuestasPorPlan(lista)) {
        const payload = editsPorId[p.id] ?? p.payload;
        const bloqueo = motivoParaNoAprobar(p.kind, payload);
        if (bloqueo) {
          setError(`Parado en «${p.summary}»: ${bloqueo}`);
          return;
        }
        const ok = await approveProposal(p, editsPorId[p.id]);
        if (!ok) return; // el error ya está puesto; las siguientes siguen pendientes
      }
    } finally {
      setAprobandoTodas(null);
    }
  };

  const rejectProposal = async (p: AiProposal) => {
    setReviewingId(p.id);
    try {
      await updateAiProposal(p.id, { status: 'rejected', reviewedAt: new Date().toISOString() });
      onAprobada?.(p.id);
      refrescarListas();
    } catch {
      setError('No se pudo rechazar la propuesta — inténtalo de nuevo.');
    } finally {
      setReviewingId(null);
    }
  };

  /** Un comentario de Dani sobre la propuesta. No la aprueba ni la rechaza:
   *  queda con ella para poder pedirle a la IA que la rehaga atendiéndolos
   *  (los lee con get_proposal_feedback), y para acordarse de por qué no la
   *  aprobó tal cual. */
  const comentar = async (p: AiProposal, texto: string) => {
    const limpio = texto.trim();
    if (!limpio) return;
    const comentario: ProposalComment = { at: new Date().toISOString(), text: limpio };
    const comentarios = [...(p.comentarios ?? []), comentario];
    setReviewingId(p.id);
    try {
      await updateAiProposal(p.id, { comentarios });
      refrescarListas();
    } catch {
      setError('No se pudo guardar el comentario — inténtalo de nuevo.');
    } finally {
      setReviewingId(null);
    }
  };

  return { reviewingId, aprobandoTodas, aprobar: approveProposal, aprobarTodas, rechazar: rejectProposal, comentar };
}
