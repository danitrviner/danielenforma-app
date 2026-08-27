import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Roadmap, WeeklyProgressionRule } from '../types';
import {
  getMesocycles, getNutritionProgram, getRoadmap, saveRoadmap, getUserProfileByEmail,
  getStepsForAthlete, getWorkoutLogs, getExercises, getDietCompletionLogsForAthlete,
  getDietsForAthlete, getWorkoutAssignments, getTasksForAthlete, getWorkouts, createTask, updateTask,
  updateWorkout, updateMesocycle, saveNutritionProgram,
} from '../dbService';
import { useAthleteWeight } from '../hooks/useAthleteWeight';
import { deriveReviewEvents, deriveVolumeIncreaseEvents, deriveKcalChangeEvents, deriveDeloadEvents, ConditionData } from '../utils/planEvents';
import { recentDietAdherencePct } from '../utils/nutritionPeriodization';
import RoadmapTimeline from './RoadmapTimeline';
import PlanPhaseEditor from './roadmap/PlanPhaseEditor';
import ChallengeManager from './roadmap/ChallengeManager';
import LevelLadderEditor from './roadmap/LevelLadderEditor';
import { PhaseData } from '../utils/planPhase';
import { LadderData } from '../utils/levelLadder';
import { ChallengeData } from '../utils/weeklyChallenge';
import { Icon, Tabs } from './ui';

interface Props {
  athleteEmail: string;
}

type SubTab = 'fases' | 'retos' | 'niveles' | 'timeline';

const SUB_TABS: { id: SubTab; label: string; icon: string }[] = [
  { id: 'fases', label: 'Fases', icon: 'route' },
  { id: 'retos', label: 'Retos', icon: 'flag' },
  { id: 'niveles', label: 'Niveles', icon: 'military_tech' },
  { id: 'timeline', label: 'Timeline', icon: 'view_timeline' },
];

export default function CoachRoadmapView({ athleteEmail }: Props) {
  const queryClient = useQueryClient();
  const [subTab, setSubTab] = useState<SubTab>('fases');
  const { logs: bodyweightLogs } = useAthleteWeight(athleteEmail);

  const roadmapKey = ['roadmap', athleteEmail] as const;

  const { data: profile, isPending: loadingProfile } = useQuery({
    queryKey: ['userProfileByEmail', athleteEmail],
    queryFn: () => getUserProfileByEmail(athleteEmail),
  });
  const { data: mesocycles = [], isPending: loadingMesos } = useQuery({
    queryKey: ['mesocycles', athleteEmail],
    queryFn: () => getMesocycles(athleteEmail),
  });
  const { data: nutritionProgram = null, isPending: loadingNutri } = useQuery({
    queryKey: ['nutritionProgram', athleteEmail],
    queryFn: () => getNutritionProgram(athleteEmail),
  });
  const { data: roadmap, isPending: loadingRoadmap } = useQuery({
    queryKey: roadmapKey,
    queryFn: () => getRoadmap(athleteEmail),
  });
  const { data: stepLogs = [], isPending: loadingSteps } = useQuery({
    queryKey: ['stepsForAthlete', athleteEmail],
    queryFn: () => getStepsForAthlete(athleteEmail),
  });
  const { data: workoutLogs = [], isPending: loadingWorkoutLogs } = useQuery({
    queryKey: ['workoutLogs', athleteEmail],
    queryFn: () => getWorkoutLogs(athleteEmail),
  });
  const { data: exercises = [], isPending: loadingExercises } = useQuery({
    queryKey: ['exercises'],
    queryFn: getExercises,
  });
  // Solo para derivar los marcadores de subida de volumen (Bloque F → H) del carril
  // de Entrenamiento — las reglas `weeklyProgression` ya viven en estos Workout.
  const { data: workouts = [], isPending: loadingWorkouts } = useQuery({
    queryKey: ['workouts'],
    queryFn: getWorkouts,
  });
  const { data: dietCompletionLogs = [], isPending: loadingDcl } = useQuery({
    queryKey: ['dietCompletionLogsForAthlete', athleteEmail],
    queryFn: () => getDietCompletionLogsForAthlete(athleteEmail),
  });
  // Carril "Revisiones" del timeline (Bloque H) — se deriva de las tareas del
  // atleta, no se guarda aparte: programar un check-in/cuestionario ya lo pone
  // aquí solo.
  const { data: tasks = [], isPending: loadingTasks } = useQuery({
    queryKey: ['tasksForAthlete', athleteEmail],
    queryFn: () => getTasksForAthlete(athleteEmail),
  });
  const { data: diets = [], isPending: loadingDiets } = useQuery({
    queryKey: ['dietsForAthlete', athleteEmail],
    queryFn: () => getDietsForAthlete(athleteEmail),
  });
  const uid = profile?.userId;
  const { data: assignments = [], isPending: loadingAssignments } = useQuery({
    queryKey: ['workoutAssignments', uid],
    queryFn: () => getWorkoutAssignments({ uid: uid!, email: athleteEmail }),
    enabled: !!uid,
  });

  const initialWeight = profile?.actualWeight ?? profile?.initialWeight;
  const loading = loadingProfile || loadingMesos || loadingNutri || loadingRoadmap
    || loadingSteps || loadingWorkoutLogs || loadingExercises || loadingWorkouts || loadingDcl || loadingDiets
    || loadingTasks || (!!uid && loadingAssignments);

  async function handleSave(updated: Roadmap) {
    await saveRoadmap(updated);
    queryClient.setQueryData(roadmapKey, updated);
  }

  const tasksKey = ['tasksForAthlete', athleteEmail] as const;
  async function handleCreateReview(input: { title: string; date: string; type: 'revision' | 'cuestionario' | 'foto' }) {
    await createTask({
      athleteId: athleteEmail, type: input.type, title: input.title, dueDate: input.date,
      status: 'pending', createdBy: 'coach', createdAt: new Date().toISOString(),
    });
    queryClient.invalidateQueries({ queryKey: tasksKey });
  }

  async function handleMoveReview(taskId: string, newDate: string) {
    queryClient.setQueryData<typeof tasks>(tasksKey, prev =>
      prev?.map(t => t.id === taskId ? { ...t, dueDate: newDate } : t));
    await updateTask(taskId, { dueDate: newDate });
    queryClient.invalidateQueries({ queryKey: tasksKey });
  }

  // Panel "+ Evento" (Pantalla 2) → subida de volumen: añade la regla al
  // ejercicio dentro del Workout ya guardado — no crea un Workout nuevo, sigue
  // siendo la misma plantilla reutilizada en todas las semanas del mesociclo.
  async function handleAddVolumeRule(workoutId: string, exerciseId: string, rule: WeeklyProgressionRule) {
    const wo = workouts.find(w => w.id === workoutId);
    if (!wo) return;
    const updatedExercises = wo.exercises.map(we =>
      we.exerciseId === exerciseId ? { ...we, weeklyProgression: [...(we.weeklyProgression ?? []), rule] } : we);
    await updateWorkout(workoutId, { exercises: updatedExercises });
    queryClient.invalidateQueries({ queryKey: ['workouts'] });
  }

  // Arrastrar un marcador de subida de volumen a otra semana (Pantalla 1) —
  // reescribe el `atWeek` de la regla que lo originó, la regla misma no cambia.
  async function handleMoveVolumeRule(workoutId: string, exerciseId: string, oldAtWeek: number, newAtWeek: number) {
    const wo = workouts.find(w => w.id === workoutId);
    if (!wo) return;
    const updatedExercises = wo.exercises.map(we =>
      we.exerciseId === exerciseId
        ? { ...we, weeklyProgression: (we.weeklyProgression ?? []).map(r => r.atWeek === oldAtWeek ? { ...r, atWeek: newAtWeek } : r) }
        : we);
    await updateWorkout(workoutId, { exercises: updatedExercises });
    queryClient.invalidateQueries({ queryKey: ['workouts'] });
  }

  // Arrastrar el borde derecho de una barra (Pantalla 1) — alarga/acorta el
  // mesociclo o la fase de nutrición. Optimista: la UI ya mostró la duración
  // en curso durante el arrastre, aquí solo se persiste.
  const mesosKey = ['mesocycles', athleteEmail] as const;
  async function handleResizeMesocycle(id: string, weeks: number) {
    queryClient.setQueryData<typeof mesocycles>(mesosKey, prev =>
      prev?.map(m => m.id === id ? { ...m, weeks } : m));
    await updateMesocycle(id, { weeks });
    queryClient.invalidateQueries({ queryKey: mesosKey });
  }

  const nutriKey = ['nutritionProgram', athleteEmail] as const;
  async function handleResizeNutritionPhase(phaseId: string, weeks: number) {
    if (!nutritionProgram) return;
    const updated = { ...nutritionProgram, phases: nutritionProgram.phases.map(ph => ph.id === phaseId ? { ...ph, weeks } : ph) };
    queryClient.setQueryData(nutriKey, updated);
    await saveNutritionProgram(updated);
    queryClient.invalidateQueries({ queryKey: nutriKey });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Icon name="refresh" size="xl" className="text-accent animate-spin" />
      </div>
    );
  }

  const rm = roadmap ?? { athleteId: athleteEmail, items: [] };
  const today = new Date().toISOString().split('T')[0];

  const phaseData: PhaseData = {
    bodyweightLogs, stepLogs, workoutLogs, exercises, initialWeight, today,
    completionLogs: dietCompletionLogs, coachDiets: diets.filter(d => !d.selfManaged),
  };
  const ladderData: LadderData = { bodyweightLogs, stepLogs, workoutLogs, exercises, initialWeight, today };

  // Bloque H2.2 — datos para evaluar las condiciones "solo si..." de las
  // reglas de progresión, reutilizando exactamente lo que ya se pide para el
  // resto de la pantalla (nada de queries nuevas).
  const conditionData: ConditionData = {
    workoutAssignments: assignments, workoutLogs, bodyweightLogs,
    dietAdherencePct: recentDietAdherencePct(dietCompletionLogs, diets, today),
  };
  const challengeData: ChallengeData = {
    stepLogs, bodyweightLogs, workoutLogs, exercises,
    completionLogs: dietCompletionLogs, coachDiets: diets.filter(d => !d.selfManaged),
    assignments, projection: null, liftExerciseIds: rm.challengeConfig?.liftExerciseIds,
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-sans font-bold text-title-m text-white uppercase tracking-tight">Road map del atleta</h2>
        <p className="text-ink-2 text-label font-sans mt-1">Fases, retos semanales y niveles — editable por el coach</p>
      </div>

      <Tabs items={SUB_TABS} value={subTab} onChange={id => setSubTab(id as SubTab)} label="Secciones del Road map" />

      {subTab === 'fases' && (
        <PlanPhaseEditor
          roadmap={rm}
          onSave={handleSave}
          phaseData={phaseData}
          nutritionProgram={nutritionProgram}
          currentWeightKg={initialWeight}
          onProgramSaved={program => queryClient.setQueryData(['nutritionProgram', athleteEmail], program)}
        />
      )}
      {subTab === 'retos' && (uid
        ? <ChallengeManager athleteEmail={athleteEmail} challengeData={challengeData} roadmap={rm} onSaveRoadmap={handleSave} />
        : <p className="text-label text-ink-3 font-sans py-4">No se ha podido cargar el perfil del atleta.</p>
      )}
      {subTab === 'niveles' && <LevelLadderEditor roadmap={rm} onSave={handleSave} ladderData={ladderData} />}
      {subTab === 'timeline' && (
        <RoadmapTimeline
          mesocycles={mesocycles}
          nutritionProgram={nutritionProgram}
          roadmap={rm}
          readonly={false}
          onSave={handleSave}
          bodyweightLogs={bodyweightLogs}
          initialWeight={initialWeight}
          reviewEvents={deriveReviewEvents(tasks, today)}
          workoutAssignments={assignments}
          volumeEvents={mesocycles.flatMap(m => deriveVolumeIncreaseEvents(workouts, exercises, m, today, conditionData))}
          nutritionEvents={deriveKcalChangeEvents(nutritionProgram, today)}
          deloadEvents={deriveDeloadEvents(mesocycles, today)}
          onCreateReview={handleCreateReview}
          onMoveReview={handleMoveReview}
          workouts={workouts}
          exercises={exercises}
          onAddVolumeRule={handleAddVolumeRule}
          onResizeMesocycle={handleResizeMesocycle}
          onResizeNutritionPhase={handleResizeNutritionPhase}
          onMoveVolumeEvent={handleMoveVolumeRule}
        />
      )}
    </div>
  );
}
