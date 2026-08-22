import React from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { UserProfile, Mesocycle, TaskItem, WorkoutAssignment, NutritionProgram } from '../types';
import {
  getAllUserProfiles, getMesocycles, getTasksForAthlete, getWorkoutAssignments,
  getNutritionProgram, getWorkouts, getExercises,
} from '../dbService';
import { atletasActivos } from '../utils/atletas';
import { getWeekRange, getWeekStart } from '../utils/trainingWeek';
import { deriveReviewEvents, deriveVolumeIncreaseEvents, deriveKcalChangeEvents, deriveDeloadEvents, weekAdherence } from '../utils/planEvents';
import { PageHeader, EmptyState, Skeleton, Icon, Badge, BadgeTone } from './ui';

// Pantalla 5 (Bloque H) — "Esta semana", fuera del perfil de un cliente: una
// fila por atleta con qué le toca en los próximos 7 días. Es la vista de
// lunes por la mañana que HubFit no tiene (su Autoflow es por cliente, uno a
// uno) — aquí se ve de un vistazo quién necesita algo sin abrir cada ficha.

const ADHERENCE_TONE: Record<string, BadgeTone> = {
  alta: 'success', media: 'warning', baja: 'danger', 'sin-datos': 'neutral', futuro: 'neutral',
};
const ADHERENCE_LABEL: Record<string, string> = {
  alta: 'Al día', media: 'A medias', baja: 'Floja', 'sin-datos': 'Sin datos', futuro: 'Sin datos',
};

interface Props {
  coachId: string;
}

export default function CoachWeekScreen({ coachId: _coachId }: Props) {
  const navigate = useNavigate();
  const { start: weekStart, end: weekEnd } = getWeekRange();
  const today = new Date().toISOString().split('T')[0];
  const weekEndExclusive = new Date(weekEnd + 'T00:00:00');
  weekEndExclusive.setDate(weekEndExclusive.getDate() + 1);
  const weekEndExclusiveStr = weekEndExclusive.toISOString().split('T')[0];

  const { data: allProfiles = [], isPending: loadingProfiles } = useQuery({
    queryKey: ['userProfiles'],
    queryFn: getAllUserProfiles,
  });
  const athletes = React.useMemo(() => atletasActivos(allProfiles).filter(p => p.role !== 'coach'), [allProfiles]);

  const { data: workouts = [], isPending: loadingWorkouts } = useQuery({ queryKey: ['workouts'], queryFn: getWorkouts });
  const { data: exercises = [], isPending: loadingExercises } = useQuery({ queryKey: ['exercises'], queryFn: getExercises });

  const mesoQueries = useQueries({
    queries: athletes.map(a => ({ queryKey: ['mesocycles', a.email], queryFn: () => getMesocycles(a.email) })),
  });
  const taskQueries = useQueries({
    queries: athletes.map(a => ({ queryKey: ['tasksForAthlete', a.email], queryFn: () => getTasksForAthlete(a.email) })),
  });
  const assignmentQueries = useQueries({
    queries: athletes.map(a => ({ queryKey: ['workoutAssignments', a.userId], queryFn: () => getWorkoutAssignments(a.userId) })),
  });
  const nutritionQueries = useQueries({
    queries: athletes.map(a => ({ queryKey: ['nutritionProgram', a.email], queryFn: () => getNutritionProgram(a.email) })),
  });

  const loading = loadingProfiles || loadingWorkouts || loadingExercises
    || mesoQueries.some(q => q.isPending) || taskQueries.some(q => q.isPending)
    || assignmentQueries.some(q => q.isPending) || nutritionQueries.some(q => q.isPending);

  if (loading) {
    return (
      <div className="space-y-4">
        <PageHeader title="Esta semana" subtitle={`${weekStart} – ${weekEnd}`} />
        <Skeleton className="h-20 w-full rounded-surface" />
        <Skeleton className="h-20 w-full rounded-surface" />
        <Skeleton className="h-20 w-full rounded-surface" />
      </div>
    );
  }

  const rows = athletes.map((a, i) => {
    const mesocycles = (mesoQueries[i]?.data as Mesocycle[] | undefined) ?? [];
    const tasks = (taskQueries[i]?.data as TaskItem[] | undefined) ?? [];
    const assignments = (assignmentQueries[i]?.data as WorkoutAssignment[] | undefined) ?? [];
    const nutritionProgram = (nutritionQueries[i]?.data as NutritionProgram | null | undefined) ?? null;

    const sorted = [...mesocycles].sort((a2, b2) => a2.number - b2.number);
    const currentMeso = sorted.find(m => {
      const end = new Date(m.startDate + 'T00:00:00');
      end.setDate(end.getDate() + m.weeks * 7);
      return today >= m.startDate && today < end.toISOString().split('T')[0];
    }) ?? null;
    const weekOfMeso = currentMeso
      ? Math.min(currentMeso.weeks, Math.floor((new Date(today).getTime() - new Date(currentMeso.startDate + 'T00:00:00').getTime()) / 86400000 / 7) + 1)
      : null;

    const inWeek = (date: string) => date >= weekStart && date < weekEndExclusiveStr;

    const reviewChips = deriveReviewEvents(tasks, today).filter(ev => inWeek(ev.date));
    const volumeChips = mesocycles.flatMap(m => deriveVolumeIncreaseEvents(workouts, exercises, m, today)).filter(ev => inWeek(ev.date));
    const kcalChips = deriveKcalChangeEvents(nutritionProgram, today).filter(ev => inWeek(ev.date));
    const deloadChips = deriveDeloadEvents(mesocycles, today).filter(ev => inWeek(ev.date));
    const chips = [...reviewChips, ...volumeChips, ...kcalChips, ...deloadChips];

    const adherence = weekAdherence(assignments, weekStart, weekEndExclusiveStr, today);

    return { athlete: a, currentMeso, weekOfMeso, chips, adherence };
  });

  const withEvents = rows.filter(r => r.chips.length > 0);
  const pendingOrOverdue = rows.filter(r => r.adherence === 'baja' || r.chips.some(c => c.status === 'vencido'));

  return (
    <div className="space-y-6">
      <PageHeader title="Esta semana" subtitle={`Semana del ${weekStart} al ${weekEnd}`} />

      <div className="flex gap-3 flex-wrap font-mono text-caption text-ink-2">
        <span>{athletes.length} atletas</span>
        <span>·</span>
        <span>{withEvents.length} con eventos esta semana</span>
        <span>·</span>
        <span>{pendingOrOverdue.length} pendientes o con adherencia baja</span>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon="group" title="Sin atletas activos." description="En cuanto tengas clientes activos, aparecerán aquí." />
      ) : (
        <div className="space-y-2">
          {rows.map(({ athlete, currentMeso, weekOfMeso, chips, adherence }) => (
            <button
              key={athlete.userId}
              onClick={() => navigate(`/clients/${encodeURIComponent(athlete.email)}/roadmap`)}
              className="w-full flex items-center gap-3 bg-surface border border-hairline rounded-surface p-4 text-left hover:border-accent/30 transition-all"
            >
              <img src={athlete.avatarUrl} alt={athlete.displayName} className="w-10 h-10 rounded-full object-cover border border-hairline flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-sans font-bold text-body-s text-white truncate">{athlete.displayName}</p>
                  {currentMeso && weekOfMeso && (
                    <span className="font-mono text-caption text-ink-2">Semana {weekOfMeso} de {currentMeso.weeks}</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                  {chips.length === 0 ? (
                    <span className="font-sans text-caption text-ink-3 italic">Sin eventos esta semana</span>
                  ) : chips.map(ev => (
                    <span
                      key={ev.id}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-chip bg-raised border border-hairline text-caption font-sans text-ink-2"
                      title={ev.title}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 12 }}>{ev.icon}</span>
                      {ev.title.length > 28 ? ev.title.slice(0, 28) + '…' : ev.title}
                    </span>
                  ))}
                </div>
              </div>
              <Badge tone={ADHERENCE_TONE[adherence]}>{ADHERENCE_LABEL[adherence]}</Badge>
              <Icon name="chevron_right" size="s" className="text-ink-3 flex-shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
