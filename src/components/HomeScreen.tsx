import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { UserProfile, WeightCheckIn } from '../types';
import { getWorkoutAssignmentsForAthlete, getWorkouts } from '../dbService';
import { getWeekRange, getWeekStart, formatDate } from '../utils/trainingWeek';
import PendingTasksPanel from './PendingTasksPanel';
import StepsWidget from './StepsWidget';
import ResourcesPanel from './ResourcesPanel';
import AthleteReportsPanel from './AthleteReportsPanel';
import ProgressRing from './ProgressRing';
import StatTile from './StatTile';
import PlanInPreparationCard from './PlanInPreparationCard';
import { Skeleton } from './ui';
import { Icon, PageHeader, ListRow } from './ui';

type NavTarget = 'checkin' | 'training' | 'nutrition' | 'roadmap' | 'academy' | 'cardio';

interface HomeScreenProps {
  profile: UserProfile;
  checkins: WeightCheckIn[];
  onNavigate: (tab: NavTarget) => void;
}

export default function HomeScreen({ profile, checkins, onNavigate }: HomeScreenProps) {
  // Pilot migration to TanStack Query (replaces the old useEffect+useState
  // fetch): 'workouts' is shared/reusable across screens under one cache key,
  // so TrainingScreen switching tabs won't re-fetch it if this query already
  // populated the cache (and vice versa) — the win useResourceCache was going
  // for, but app-wide instead of one-off per hook.
  const { data: assignments = [], isPending: loadingAssignments } = useQuery({
    queryKey: ['workoutAssignments', profile.userId],
    queryFn: () => getWorkoutAssignmentsForAthlete(profile.userId),
  });
  const { data: workouts = [], isPending: loadingWorkouts } = useQuery({
    queryKey: ['workouts'],
    queryFn: getWorkouts,
  });
  const loadingTraining = loadingAssignments || loadingWorkouts;

  const curWeekStart = getWeekRange().start;
  const sorted = [...assignments].sort((a, b) => a.date.localeCompare(b.date));
  const thisWeekPending = sorted.filter(a => getWeekStart(a.date) === curWeekStart && a.status === 'pending');
  const overdue = sorted.filter(a => a.status === 'pending' && getWeekStart(a.date) < curWeekStart);
  const getWorkout = (id: string) => workouts.find(w => w.id === id);

  const weekAssignments = sorted.filter(a => getWeekStart(a.date) === curWeekStart);
  const weekCompleted = weekAssignments.filter(a => a.status === 'completed').length;
  const weekPct = weekAssignments.length > 0 ? (weekCompleted / weekAssignments.length) * 100 : 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Inicio" subtitle="Tus tareas, entrenamientos pendientes y recursos." />

      {/* ── Sin ningún entrenamiento asignado todavía: recién llegado, el coach
          aún no le ha montado el plan. Antes esto caía directo en "sin
          entrenamientos pendientes" — la app se sentía vacía justo en el
          momento de mayor motivación del atleta nuevo. ──────────────────── */}
      {!loadingTraining && assignments.length === 0 && (
        <PlanInPreparationCard profile={profile} onNavigate={onNavigate} />
      )}

      {/* ── Resumen de hoy: anillo de progreso semanal ──────────────────────── */}
      {!loadingTraining && weekAssignments.length > 0 && (
        <section className="bg-surface border border-hairline rounded-canvas p-5">
          <h2 className="font-sans font-bold uppercase tracking-tight text-title-m text-white mb-4">Resumen de hoy</h2>
          <div className="flex items-center gap-5">
            <ProgressRing pct={weekPct} />
            <div className="flex-1 flex flex-col gap-3">
              <StatTile
                icon="fitness_center"
                label="Entrenamientos"
                value={`${weekCompleted}/${weekAssignments.length}`}
              />
              <p className="text-caption text-ink-2 font-mono leading-relaxed">
                {weekCompleted === weekAssignments.length
                  ? '¡Semana completada! 💪'
                  : `Te ${weekAssignments.length - weekCompleted === 1 ? 'queda' : 'quedan'} ${weekAssignments.length - weekCompleted} entrenamiento${weekAssignments.length - weekCompleted === 1 ? '' : 's'} esta semana.`}
              </p>
            </div>
          </div>
        </section>
      )}

      <PendingTasksPanel profile={profile} checkins={checkins} onNavigate={onNavigate} />

      <AthleteReportsPanel athleteEmail={profile.email} />

      <StepsWidget athleteEmail={profile.email} />

      {/* ── Entrenamientos pendientes de esta semana + atrasados ─────────────── */}
      {/* Oculta del todo para el atleta sin ningún entrenamiento asignado
          nunca (PlanInPreparationCard ya cubre ese mensaje arriba) — mostrar
          "sin entrenamientos pendientes" justo debajo sería contradecir el
          tono de "tu coach lo está preparando". */}
      {(loadingTraining || assignments.length > 0) && (
      <section className="bg-surface border border-hairline rounded-surface p-4 sm:p-5">
        <h2 className="font-sans font-bold uppercase tracking-tight text-title-s text-white mb-3 pb-2 border-b border-hairline flex items-center gap-2">
          <Icon name="fitness_center" size="l" className="text-data" />
          Entrenamiento
          <button
            onClick={() => onNavigate('training')}
            className="ml-auto text-caption font-mono font-bold uppercase text-ink-2 hover:text-accent transition-colors"
          >
            Ver todo
          </button>
        </h2>

        {loadingTraining ? (
          <div className="space-y-2">
            <Skeleton className="h-11 w-full rounded-surface" />
            <Skeleton className="h-11 w-full rounded-surface" />
          </div>
        ) : thisWeekPending.length === 0 && overdue.length === 0 ? (
          <p className="text-label text-ink-3 font-sans py-2">Sin entrenamientos pendientes esta semana.</p>
        ) : (
          <div className="space-y-3">
            {thisWeekPending.length > 0 && (
              <div className="space-y-2">
                <span className="font-mono text-caption uppercase font-bold tracking-widest text-accent">Esta semana</span>
                {thisWeekPending.map(a => (
                  <ListRow
                    key={a.id}
                    onClick={() => onNavigate('training')}
                    className="rounded-control border bg-raised border-hairline"
                    title={getWorkout(a.workoutId)?.name || 'Rutina'}
                    trailing={<span className="font-mono text-caption text-ink-2 flex-shrink-0">{formatDate(a.date)}</span>}
                  />
                ))}
              </div>
            )}
            {overdue.length > 0 && (
              <div className="space-y-2">
                <span className="font-mono text-caption uppercase font-bold tracking-widest text-red-300">Atrasados</span>
                {overdue.map(a => (
                  <ListRow
                    key={a.id}
                    onClick={() => onNavigate('training')}
                    className="rounded-control border bg-raised border-red-500/20"
                    title={getWorkout(a.workoutId)?.name || 'Rutina'}
                    trailing={<span className="font-mono text-caption text-red-300 flex-shrink-0">{formatDate(a.date)}</span>}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </section>
      )}

      {/* ── Accesos a Academia y Cardio: viven aquí en vez de en la barra de
          navegación para no saturarla con más pestañas. ────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => onNavigate('academy')}
          className="bg-surface border border-hairline hover:border-accent/40 rounded-control p-4 flex flex-col items-start gap-2 text-left transition-all"
        >
          <Icon name="school" size="l" className="text-accent" />
          <span className="font-sans font-bold text-body-s text-white uppercase tracking-tight">Academia</span>
          <span className="text-caption text-ink-2 font-mono">Cursos y formación</span>
        </button>
        <button
          onClick={() => onNavigate('cardio')}
          className="bg-surface border border-hairline hover:border-accent/40 rounded-control p-4 flex flex-col items-start gap-2 text-left transition-all"
        >
          <Icon name="favorite" size="l" className="text-accent" />
          <span className="font-sans font-bold text-body-s text-white uppercase tracking-tight">Cardio</span>
          <span className="text-caption text-ink-2 font-sans">Zonas y FC en directo</span>
        </button>
      </div>

      <ResourcesPanel isCoach={false} />
    </div>
  );
}
