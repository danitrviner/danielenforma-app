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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-sans font-extrabold text-3xl tracking-tight text-white">Inicio</h1>
        <p className="text-[#c6c9ab] text-sm mt-1">Tus tareas, entrenamientos pendientes y recursos.</p>
      </div>

      <PendingTasksPanel profile={profile} checkins={checkins} onNavigate={onNavigate} />

      <StepsWidget athleteEmail={profile.email} />

      {/* ── Entrenamientos pendientes de esta semana + atrasados ─────────────── */}
      <section className="bg-[#121212] border border-[#2a2a2a] rounded-xl p-4 sm:p-5">
        <h2 className="font-sans font-bold text-base text-white mb-3 pb-2 border-b border-[#2a2a2a] flex items-center gap-2">
          <span className="material-symbols-outlined text-[#00eefc]">fitness_center</span>
          Entrenamiento
          <button
            onClick={() => onNavigate('training')}
            className="ml-auto text-[10px] font-mono font-bold uppercase text-[#c6c9ab] hover:text-[#e2ff00] transition-colors"
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
                <span className="font-mono text-[9px] uppercase font-bold tracking-widest text-[#e2ff00]">Esta semana</span>
                {thisWeekPending.map(a => (
                  <button
                    key={a.id}
                    onClick={() => onNavigate('training')}
                    className="w-full flex items-center justify-between bg-[#1e1e1e] border border-[#2a2a2a] hover:border-[#e2ff00]/40 rounded-lg p-3 text-left transition-all"
                  >
                    <span className="font-sans text-sm text-white truncate">{getWorkout(a.workoutId)?.name || 'Rutina'}</span>
                    <span className="font-mono text-[10px] text-[#c6c9ab] flex-shrink-0 ml-2">{formatDate(a.date)}</span>
                  </button>
                ))}
              </div>
            )}
            {overdue.length > 0 && (
              <div className="space-y-1.5">
                <span className="font-mono text-[9px] uppercase font-bold tracking-widest text-red-300">Atrasados</span>
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
