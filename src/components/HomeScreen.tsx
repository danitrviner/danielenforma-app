import React, { useEffect, useState } from 'react';
import { UserProfile, WeightCheckIn, Workout, WorkoutAssignment } from '../types';
import { getWorkoutAssignmentsForAthlete, getWorkouts } from '../dbService';
import { getWeekRange, getWeekStart, formatDate } from '../utils/trainingWeek';
import PendingTasksPanel from './PendingTasksPanel';
import StepsWidget from './StepsWidget';
import ResourcesPanel from './ResourcesPanel';

type NavTarget = 'checkin' | 'training' | 'nutrition' | 'roadmap';

interface HomeScreenProps {
  profile: UserProfile;
  checkins: WeightCheckIn[];
  onNavigate: (tab: NavTarget) => void;
}

// Circular progress ring — plain SVG, no charting lib needed for a single value.
function ProgressRing({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const r = 42;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - clamped / 100);
  return (
    <div className="relative w-[104px] h-[104px] flex-shrink-0">
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#1e1e1b" strokeWidth="9" />
        <circle
          cx="50" cy="50" r={r} fill="none" stroke="#fbcb1a" strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-sans font-extrabold text-2xl text-white leading-none">{Math.round(clamped)}%</span>
        <span className="font-mono text-[8px] text-[#c6c9ab] uppercase tracking-widest mt-1">Semana</span>
      </div>
    </div>
  );
}

export default function HomeScreen({ profile, checkins, onNavigate }: HomeScreenProps) {
  const [assignments, setAssignments] = useState<WorkoutAssignment[]>([]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loadingTraining, setLoadingTraining] = useState(true);

  useEffect(() => {
    Promise.all([
      getWorkoutAssignmentsForAthlete(profile.userId),
      getWorkouts(),
    ]).then(([asn, wos]) => {
      setAssignments(asn);
      setWorkouts(wos);
    }).catch(console.error).finally(() => setLoadingTraining(false));
  }, [profile.userId]);

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
      <div>
        <h1 className="font-sans font-extrabold text-3xl tracking-tight text-white">Inicio</h1>
        <p className="text-[#c6c9ab] text-sm mt-1">Tus tareas, entrenamientos pendientes y recursos.</p>
      </div>

      {/* ── Resumen de hoy: anillo de progreso semanal ──────────────────────── */}
      {!loadingTraining && weekAssignments.length > 0 && (
        <section className="bg-[#181816] border border-white/7 rounded-2xl p-5">
          <h2 className="font-sans font-bold text-base text-white mb-4">Resumen de hoy</h2>
          <div className="flex items-center gap-5">
            <ProgressRing pct={weekPct} />
            <div className="flex-1 grid grid-cols-1 gap-2.5 font-mono">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[#c6c9ab] uppercase tracking-wide">Entrenamientos</span>
                <span className="text-sm font-bold text-white">{weekCompleted}/{weekAssignments.length}</span>
              </div>
              <div className="h-px bg-white/7"></div>
              <p className="text-[10px] text-[#c6c9ab] leading-relaxed">
                {weekCompleted === weekAssignments.length
                  ? '¡Semana completada! 💪'
                  : `Te ${weekAssignments.length - weekCompleted === 1 ? 'queda' : 'quedan'} ${weekAssignments.length - weekCompleted} entrenamiento${weekAssignments.length - weekCompleted === 1 ? '' : 's'} esta semana.`}
              </p>
            </div>
          </div>
        </section>
      )}

      <PendingTasksPanel profile={profile} checkins={checkins} onNavigate={onNavigate} />

      <StepsWidget athleteEmail={profile.email} />

      {/* ── Entrenamientos pendientes de esta semana + atrasados ─────────────── */}
      <section className="bg-[#181816] border border-white/7 rounded-2xl p-4 sm:p-5">
        <h2 className="font-sans font-bold text-base text-white mb-3 pb-2 border-b border-white/7 flex items-center gap-2">
          <span className="material-symbols-outlined text-[#00eefc]">fitness_center</span>
          Entrenamiento
          <button
            onClick={() => onNavigate('training')}
            className="ml-auto text-[10px] font-mono font-bold uppercase text-[#c6c9ab] hover:text-[#fbcb1a] transition-colors"
          >
            Ver todo
          </button>
        </h2>

        {loadingTraining ? (
          <p className="text-xs text-[#c6c9ab] font-mono animate-pulse py-2">Cargando...</p>
        ) : thisWeekPending.length === 0 && overdue.length === 0 ? (
          <p className="text-xs text-[#555] font-mono py-2">Sin entrenamientos pendientes esta semana.</p>
        ) : (
          <div className="space-y-3">
            {thisWeekPending.length > 0 && (
              <div className="space-y-1.5">
                <span className="font-mono text-[10px] uppercase font-bold tracking-widest text-[#fbcb1a]">Esta semana</span>
                {thisWeekPending.map(a => (
                  <button
                    key={a.id}
                    onClick={() => onNavigate('training')}
                    className="w-full flex items-center justify-between bg-[#1e1e1e] border border-white/7 hover:border-[#fbcb1a]/40 rounded-lg p-3 text-left transition-all"
                  >
                    <span className="font-sans text-sm text-white truncate">{getWorkout(a.workoutId)?.name || 'Rutina'}</span>
                    <span className="font-mono text-[10px] text-[#c6c9ab] flex-shrink-0 ml-2">{formatDate(a.date)}</span>
                  </button>
                ))}
              </div>
            )}
            {overdue.length > 0 && (
              <div className="space-y-1.5">
                <span className="font-mono text-[10px] uppercase font-bold tracking-widest text-red-300">Atrasados</span>
                {overdue.map(a => (
                  <button
                    key={a.id}
                    onClick={() => onNavigate('training')}
                    className="w-full flex items-center justify-between bg-[#1e1e1e] border border-red-500/20 hover:border-red-500/40 rounded-lg p-3 text-left transition-all"
                  >
                    <span className="font-sans text-sm text-white truncate">{getWorkout(a.workoutId)?.name || 'Rutina'}</span>
                    <span className="font-mono text-[10px] text-red-300 flex-shrink-0 ml-2">{formatDate(a.date)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      <ResourcesPanel isCoach={false} />
    </div>
  );
}
