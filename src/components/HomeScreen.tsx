import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { UserProfile, WeightCheckIn, WeekDay } from '../types';
import { getWorkoutAssignmentsForAthlete, getWorkouts, getCardioAssignmentsForAthlete, getDietsForAthlete, getAthleteDietConfig, getDietCompletionLog } from '../dbService';
import { getWeekRange, getWeekStart, formatDate } from '../utils/trainingWeek';
import { pickActiveZona2Assignment, pickActiveIntervalAssignment } from '../utils/cardioSession';
import { pickTodaysDiet, countMealsDone } from '../utils/nutritionSummary';
import PendingTasksPanel from './PendingTasksPanel';
import StepsWidget from './StepsWidget';
import ResourcesPanel from './ResourcesPanel';
import AthleteReportsPanel from './AthleteReportsPanel';
import PlanInPreparationCard from './PlanInPreparationCard';
import { useTourTarget } from '../features/tutorial/TourTargetContext';
import { Skeleton } from './ui';
import { Icon, Button, PageHeader, ListRow, ProgressBar } from './ui';

type NavTarget = 'checkin' | 'training' | 'nutrition' | 'roadmap' | 'academy' | 'cardio' | 'profile';

interface HomeScreenProps {
  profile: UserProfile;
  checkins: WeightCheckIn[];
  onNavigate: (tab: NavTarget) => void;
}

const JS_TO_WD: Record<number, WeekDay> = { 0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat' };
const TODAY_DATE = new Date().toISOString().split('T')[0];
const TODAY_WD: WeekDay = JS_TO_WD[new Date().getDay()];

/* ═══════════════════════════════════════════════════════════════════════════
   HomeScreen — "Hoy" (F3.11, módulo 8 del handoff)

   Una tarea manda: el entreno del día es siempre la primera tarjeta con el
   único botón primario. El cardio nunca aparece por encima del entreno de
   fuerza — solo sube a tarjeta principal en día de descanso (sin nada de
   fuerza programado hoy). La nutrición se resume en una fila de progreso,
   nunca repite el detalle de NutritionScreen. Entreno hecho se confirma en
   verde, no en oro. Sin datos todavía, la tarjeta se omite.

   Fuera de alcance a propósito: el checklist de los "tres primeros pasos"
   (primera sesión, cinco ingestas, lección del RIR) necesita el campo
   `checklistInicial` que el motor de tutorial de F3.12 todavía no ha creado
   — se añade en esa fase, no aquí, para no inventar un modelo de datos que
   F3.12 podría necesitar dar forma distinta.
   ═══════════════════════════════════════════════════════════════════════════ */

export default function HomeScreen({ profile, checkins, onNavigate }: HomeScreenProps) {
  const { data: assignments = [], isPending: loadingAssignments } = useQuery({
    queryKey: ['workoutAssignments', profile.userId],
    queryFn: () => getWorkoutAssignmentsForAthlete(profile.userId),
  });
  const { data: workouts = [], isPending: loadingWorkouts } = useQuery({
    queryKey: ['workouts'],
    queryFn: getWorkouts,
  });
  const loadingTraining = loadingAssignments || loadingWorkouts;

  const { data: cardioAssignments = [] } = useQuery({
    queryKey: ['cardioAssignments', profile.email],
    queryFn: () => getCardioAssignmentsForAthlete(profile.email),
  });
  const { data: diets = [] } = useQuery({
    queryKey: ['dietsForAthlete', profile.email],
    queryFn: () => getDietsForAthlete(profile.email),
  });
  const { data: dietConfig = null } = useQuery({
    queryKey: ['athleteDietConfig', profile.email],
    queryFn: () => getAthleteDietConfig(profile.email).catch(() => null),
  });
  const { data: completionLog } = useQuery({
    queryKey: ['dietCompletionLog', profile.email, TODAY_DATE],
    queryFn: () => getDietCompletionLog(profile.email, TODAY_DATE),
  });

  const curWeekStart = getWeekRange().start;
  const sorted = [...assignments].sort((a, b) => a.date.localeCompare(b.date));
  const thisWeekPending = sorted.filter(a => getWeekStart(a.date) === curWeekStart && a.status === 'pending');
  const overdue = sorted.filter(a => a.status === 'pending' && getWeekStart(a.date) < curWeekStart);
  const getWorkout = (id: string) => workouts.find(w => w.id === id);

  const todayAssignment = assignments.find(a => a.date === TODAY_DATE);
  const todayWorkout = todayAssignment ? getWorkout(todayAssignment.workoutId) : undefined;
  const isRestDay = !todayAssignment;

  const zona2Assignment = pickActiveZona2Assignment(cardioAssignments);
  const intervalAssignment = pickActiveIntervalAssignment(cardioAssignments);
  const cardioRx = zona2Assignment ?? intervalAssignment;

  const todaysDiet = pickTodaysDiet(diets, dietConfig, TODAY_WD);
  const mealsDone = todaysDiet ? countMealsDone(todaysDiet, completionLog?.doneItemIds ?? []) : null;

  const cardioIsPrimary = isRestDay && !!cardioRx;
  const primaryCardRef = useTourTarget('home-primary-card');
  const cardioRowRef = useTourTarget('home-cardio-row');

  return (
    <div className="space-y-6">
      <PageHeader title="Hoy" subtitle="Tu tarea del día." />

      {!loadingTraining && assignments.length === 0 && (
        <PlanInPreparationCard profile={profile} onNavigate={onNavigate} />
      )}

      {!loadingTraining && assignments.length > 0 && (
        <>
          {/* ── Tarjeta primaria: entreno de fuerza, salvo día de descanso con cardio prescrito ── */}
          {!cardioIsPrimary && todayAssignment && (
            <section ref={primaryCardRef} className={`rounded-canvas p-5 border ${todayAssignment.status === 'completed' ? 'bg-success/8 border-success/25' : 'bg-surface border-hairline'}`}>
              <p className="text-caption font-mono uppercase tracking-wider text-ink-2">Entreno de hoy</p>
              <p className="font-display text-feature font-black uppercase text-ink mt-1">{todayWorkout?.name ?? 'Rutina'}</p>
              {todayAssignment.status === 'completed' ? (
                <p className="flex items-center gap-2 text-body-s font-sans font-bold text-success mt-3">
                  <Icon name="check_circle" size="m" />
                  Hecho
                </p>
              ) : (
                <Button onClick={() => onNavigate('training')} fullWidth size="l" className="mt-4">Empezar entreno</Button>
              )}
            </section>
          )}

          {cardioIsPrimary && cardioRx && (
            <section ref={primaryCardRef} className="rounded-canvas p-5 border bg-surface border-hairline">
              <p className="text-caption font-mono uppercase tracking-wider text-ink-2">Día de descanso · Cardio</p>
              <p className="font-display text-feature font-black uppercase text-ink mt-1">
                {cardioRx.type === 'zona2' ? 'Zona 2' : 'Intervalos'}
              </p>
              <Button onClick={() => onNavigate('cardio')} fullWidth size="l" className="mt-4">Empezar cardio</Button>
            </section>
          )}

          {isRestDay && !cardioRx && (
            <section className="rounded-canvas p-5 border bg-surface border-hairline text-center">
              <p className="font-sans text-body-s text-ink-2">Hoy es día de descanso.</p>
            </section>
          )}

          {/* ── Cardio como fila secundaria cuando hoy toca fuerza ── */}
          {!cardioIsPrimary && cardioRx && (
            <div ref={cardioRowRef}>
            <ListRow
              onClick={() => onNavigate('cardio')}
              className="rounded-control border bg-surface border-hairline"
              leading={<Icon name="favorite" size="m" className="text-accent" />}
              title="Cardio"
              subtitle={cardioRx.type === 'zona2' ? 'Zona 2' : 'Intervalos'}
              chevron
            />
            </div>
          )}

          {/* ── Nutrición: fila de progreso, nunca el detalle ── */}
          {todaysDiet && mealsDone && (
            <button onClick={() => onNavigate('nutrition')} className="w-full text-left bg-surface border border-hairline rounded-control p-4 space-y-2 hover:border-strong transition-colors">
              <div className="flex items-center justify-between">
                <p className="text-caption font-mono uppercase text-ink-2">Nutrición</p>
                <p className="text-caption font-mono text-ink-2 tabular-nums">{mealsDone.done}/{mealsDone.total} ingestas</p>
              </div>
              <ProgressBar value={mealsDone.total > 0 ? (mealsDone.done / mealsDone.total) * 100 : 0} label={`Ingestas de hoy, ${mealsDone.done} de ${mealsDone.total}`} />
            </button>
          )}
        </>
      )}

      <PendingTasksPanel profile={profile} checkins={checkins} onNavigate={onNavigate} />

      <AthleteReportsPanel athleteEmail={profile.email} />

      <StepsWidget athleteEmail={profile.email} />

      {/* ── Semana: pendientes + atrasados ─────────────────────────────────── */}
      {(loadingTraining || assignments.length > 0) && (
      <section className="bg-surface border border-hairline rounded-surface p-4 sm:p-5">
        <h2 className="font-sans font-bold uppercase tracking-tight text-title-s text-white mb-3 pb-2 border-b border-hairline flex items-center gap-2">
          <Icon name="fitness_center" size="l" className="text-accent" />
          Esta semana
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
                <span className="font-mono text-caption uppercase font-bold tracking-widest text-danger">Atrasados</span>
                {overdue.map(a => (
                  <ListRow
                    key={a.id}
                    onClick={() => onNavigate('training')}
                    className="rounded-control border bg-raised border-danger/20"
                    title={getWorkout(a.workoutId)?.name || 'Rutina'}
                    trailing={<span className="font-mono text-caption text-danger flex-shrink-0">{formatDate(a.date)}</span>}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </section>
      )}

      <ResourcesPanel isCoach={false} />
    </div>
  );
}
