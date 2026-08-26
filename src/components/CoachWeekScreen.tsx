import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Mesocycle, WorkoutAssignment, NutritionProgram } from '../types';
import {
  getAllUserProfiles, getMesocyclesForAthletes, getTasksForAthletes, getWorkoutAssignmentsForAthletes,
  getNutritionProgramsForAthletes, getWorkoutsByIds, getExercises,
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
  const athleteEmails = React.useMemo(() => athletes.map(a => a.email), [athletes]);
  const athleteUids = React.useMemo(() => athletes.map(a => a.userId), [athletes]);
  const hayAtletas = athletes.length > 0;

  const { data: exercises = [], isPending: loadingExercises } = useQuery({ queryKey: ['exercises'], queryFn: getExercises });

  // Cuatro consultas de lote (30 ids por `in`) en vez de 4×N — con 30 clientes,
  // esto pasa de 120 idas y vueltas a 4. Ver Fase 3 del plan de optimización.
  const { data: mesocyclesFlat = [], isPending: loadingMeso } = useQuery({
    queryKey: ['mesocyclesForAthletes', athleteEmails],
    queryFn: () => getMesocyclesForAthletes(athleteEmails),
    enabled: hayAtletas,
  });
  const { data: tasksFlat = [], isPending: loadingTasks } = useQuery({
    queryKey: ['tasksForAthletes', athleteEmails],
    queryFn: () => getTasksForAthletes(athleteEmails),
    enabled: hayAtletas,
  });
  const { data: assignmentsFlat = [], isPending: loadingAssignmentsQuery } = useQuery({
    queryKey: ['workoutAssignmentsForAthletes', athleteUids],
    queryFn: () => getWorkoutAssignmentsForAthletes(athleteUids),
    enabled: hayAtletas,
  });
  const { data: nutritionProgramsFlat = [], isPending: loadingNutrition } = useQuery({
    queryKey: ['nutritionProgramsForAthletes', athleteEmails],
    queryFn: () => getNutritionProgramsForAthletes(athleteEmails),
    enabled: hayAtletas,
  });
  const loadingAssignments = hayAtletas && loadingAssignmentsQuery;

  // Las rutinas dependen de qué workoutId aparece en las asignaciones ya
  // cargadas — sustituye a getWorkouts() (colección entera de TODOS los
  // atletas) por solo las que de verdad se usan esta semana.
  const workoutIds = React.useMemo(() => Array.from(new Set(assignmentsFlat.map(a => a.workoutId))), [assignmentsFlat]);
  const { data: workouts = [], isPending: loadingWorkoutsQuery } = useQuery({
    queryKey: ['workoutsByIds', workoutIds],
    queryFn: () => getWorkoutsByIds(workoutIds),
    enabled: workoutIds.length > 0,
  });
  const loadingWorkouts = workoutIds.length > 0 && loadingWorkoutsQuery;

  const mesoByAthlete = React.useMemo(() => {
    const map = new Map<string, Mesocycle[]>();
    for (const m of mesocyclesFlat) map.set(m.athleteId, [...(map.get(m.athleteId) ?? []), m]);
    return map;
  }, [mesocyclesFlat]);
  const tasksByAthlete = React.useMemo(() => {
    const map = new Map<string, typeof tasksFlat>();
    for (const t of tasksFlat) map.set(t.athleteId, [...(map.get(t.athleteId) ?? []), t]);
    return map;
  }, [tasksFlat]);
  const assignmentsByAthlete = React.useMemo(() => {
    const map = new Map<string, WorkoutAssignment[]>();
    for (const a of assignmentsFlat) map.set(a.athleteId, [...(map.get(a.athleteId) ?? []), a]);
    return map;
  }, [assignmentsFlat]);
  const nutritionByAthlete = React.useMemo(() => {
    const map = new Map<string, NutritionProgram>();
    for (const p of nutritionProgramsFlat) map.set(p.athleteId, p);
    return map;
  }, [nutritionProgramsFlat]);

  const loading = loadingProfiles || loadingWorkouts || loadingExercises
    || loadingMeso || loadingTasks || loadingAssignments || loadingNutrition;

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

  const rows = athletes.map((a) => {
    const mesocycles = mesoByAthlete.get(a.email) ?? [];
    const tasks = tasksByAthlete.get(a.email) ?? [];
    const assignments = assignmentsByAthlete.get(a.userId) ?? [];
    const nutritionProgram = nutritionByAthlete.get(a.email) ?? null;

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
