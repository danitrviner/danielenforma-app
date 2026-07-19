import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UserProfile, Workout, WorkoutAssignment, Exercise, WorkoutLog, WorkoutEntryLog, ExercisePersonalNote } from '../types';
import LoadHistoryPanel from './LoadHistoryPanel';
import StatTile from './StatTile';
import {
  getWorkoutAssignmentsForAthlete, getWorkouts, getExercises, seedExercisesIfEmpty,
  createWorkoutLog, updateWorkoutAssignment, getWorkoutLogs, getExerciseNotesForAthlete,
} from '../dbService';
import { getWeekRange, getWeekStart, MONTHS_ES, formatDate } from '../utils/trainingWeek';
import { TECHNIQUE_EMOJI, TECHNIQUE_LABEL, TECHNIQUE_COLOR, TECHNIQUE_DESCRIPTION } from '../utils/workoutTechniques';
import { generateWarmup } from '../utils/warmup/WarmupGenerator';
import { parseTargetReps } from '../utils/warmup/WarmupEngine';
import { expandSetGroups } from '../utils/setGroups';
import { useToast } from '../hooks/useToast';
import Coachmark from './Coachmark';
import { epley } from '../utils/oneRepMax';
import { allTimeBestBefore } from '../utils/trainingReport';
import Skeleton from './Skeleton';

interface TrainingScreenProps {
  profile: UserProfile;
}

// ── Types ────────────────────────────────────────────────────────────────────

type MainTab = 'programa' | 'progresion';

interface SetInput {
  weight: string;
  repsDone: string;
  rir: string;
  done: boolean;
}

interface SessionCelebration {
  isFirstEver: boolean;
  totalSets: number;
  tonnage: number;
  prs: { exerciseId: string; name: string; newBest: number }[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatWeekLabel(weekStartStr: string, isCurrent: boolean): string {
  const s = new Date(weekStartStr + 'T00:00:00');
  const e = new Date(weekStartStr + 'T00:00:00');
  e.setDate(e.getDate() + 6);
  const sl = `${s.getDate()} ${MONTHS_ES[s.getMonth()]}`;
  const el = `${e.getDate()} ${MONTHS_ES[e.getMonth()]}`;
  return isCurrent ? `Esta semana · ${sl} – ${el}` : `${sl} – ${el}`;
}

const STATUS_LABEL: Record<WorkoutAssignment['status'], string> = {
  pending:   'Pendiente',
  completed: 'Completado',
  skipped:   'Saltado',
  perdido:   'Perdido',
};

const STATUS_STYLE: Record<WorkoutAssignment['status'], string> = {
  pending:   'bg-amber-500/10 text-amber-300 border border-amber-500/20',
  completed: 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20',
  skipped:   'bg-[#2a2a2a] text-[#c6c9ab] border border-[#3a3a3a]',
  perdido:   'bg-red-500/10 text-red-300 border border-red-500/20',
};

const TYPE_CHIP: Record<string, string> = {
  fuerza:       'bg-[#00eefc]/10 text-[#00eefc] border border-[#00eefc]/20',
  cardio:       'bg-orange-500/10 text-orange-300 border border-orange-500/20',
  estiramiento: 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20',
  pliometría:   'bg-[#fbcb1a]/10 text-[#fbcb1a] border border-[#fbcb1a]/20',
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function TrainingScreen({ profile }: TrainingScreenProps) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [mainTab, setMainTab] = useState<MainTab>('programa');

  // Data
  const assignmentsKey = ['workoutAssignmentsForAthlete', profile.userId] as const;
  const { data: assignments = [], isPending: loadingAssignments } = useQuery({
    queryKey: assignmentsKey,
    queryFn: () => getWorkoutAssignmentsForAthlete(profile.userId),
  });
  const { data: workouts = [], isPending: loadingWorkouts } = useQuery({
    queryKey: ['workouts'],
    queryFn: getWorkouts,
  });
  const { data: exercises = [], isPending: loadingExercises } = useQuery({
    queryKey: ['exercises'],
    queryFn: async () => {
      await seedExercisesIfEmpty();
      return getExercises();
    },
  });
  const logsKey = ['workoutLogs', profile.email] as const;
  const { data: logs = [], isPending: loadingLogs } = useQuery({
    queryKey: logsKey,
    queryFn: () => getWorkoutLogs(profile.email),
  });
  const { data: personalNotes = [], isPending: loadingNotes } = useQuery({
    queryKey: ['exerciseNotesForAthlete', profile.email],
    queryFn: () => getExerciseNotesForAthlete(profile.email),
  });
  const loading = loadingAssignments || loadingWorkouts || loadingExercises || loadingLogs || loadingNotes;

  // Pending assignments more than a week past their date are lost — the athlete missed
  // the weekly block entirely. Persist so the coach sees it too (ClientHub). Runs once
  // per athlete once assignments have loaded (guard pattern like StepsWidget) instead of
  // being baked into the fetch, so this query's cache entry stays a plain, shareable read
  // (also used as-is by AthleteRoadmapScreen).
  const markLostInitFor = useRef<string | null>(null);
  useEffect(() => {
    if (loadingAssignments || markLostInitFor.current === profile.userId) return;
    markLostInitFor.current = profile.userId;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    const cutoffStr = cutoff.toISOString().split('T')[0];
    const toMarkLost = assignments.filter(a => a.status === 'pending' && a.date < cutoffStr);
    if (toMarkLost.length === 0) return;
    const lostIds = new Set(toMarkLost.map(a => a.id));
    queryClient.setQueryData<WorkoutAssignment[]>(assignmentsKey, prev =>
      prev?.map(a => lostIds.has(a.id) ? { ...a, status: 'perdido' as const } : a));
    Promise.all(toMarkLost.map(a => updateWorkoutAssignment(a.id, { status: 'perdido' })))
      .catch(err => console.error('mark lost assignments failed:', err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingAssignments, profile.userId]);

  // List filter
  const [listFilter, setListFilter] = useState<WorkoutAssignment['status'] | 'all'>('pending');

  // Player state
  const [activeAssignment, setActiveAssignment] = useState<WorkoutAssignment | null>(null);
  const [activeWorkout, setActiveWorkout] = useState<Workout | null>(null);
  const [playerSets, setPlayerSets] = useState<SetInput[][]>([]);
  const [prevEntries, setPrevEntries] = useState<WorkoutEntryLog[]>([]);
  const [isFinishing, setIsFinishing] = useState(false);
  const [celebration, setCelebration] = useState<SessionCelebration | null>(null);
  const [exerciseNoteInputs, setExerciseNoteInputs] = useState<string[]>([]);
  const [workoutNoteInput, setWorkoutNoteInput] = useState('');
  // Cronómetro de descanso: se arranca solo al marcar una serie como hecha,
  // con el restSeconds prescrito del ejercicio — antes el atleta tenía que
  // llevar la cuenta él mismo en el momento de mayor intensidad de la sesión.
  const [restTimer, setRestTimer] = useState<{ totalSeconds: number; secondsLeft: number } | null>(null);

  // Cuenta atrás del descanso: se reprograma sola cada segundo vía el propio
  // cambio de estado; se detiene al llegar a 0 (el efecto de abajo la cierra).
  useEffect(() => {
    if (!restTimer || restTimer.secondsLeft <= 0) return;
    const id = setTimeout(() => {
      setRestTimer(prev => (prev ? { ...prev, secondsLeft: prev.secondsLeft - 1 } : null));
    }, 1000);
    return () => clearTimeout(id);
  }, [restTimer]);

  // Al llegar a 0: una vibración corta (no pide permiso, no-op si el
  // navegador no la soporta) y se cierra sola a los pocos segundos.
  useEffect(() => {
    if (restTimer?.secondsLeft !== 0) return;
    navigator.vibrate?.([150, 80, 150]);
    const id = setTimeout(() => setRestTimer(null), 3000);
    return () => clearTimeout(id);
  }, [restTimer?.secondsLeft]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const getWorkout = (id: string) => workouts.find(w => w.id === id);
  const getExercise = (id: string) => exercises.find(e => e.id === id);
  const getPersonalNote = (exerciseId: string) => personalNotes.find(n => n.exerciseId === exerciseId)?.observation;

  const today = new Date().toISOString().split('T')[0];
  const curWeekStart = getWeekRange().start;

  const sortedAssignments = [...assignments].sort((a, b) => a.date.localeCompare(b.date));
  const filteredAssignments = listFilter === 'all'
    ? sortedAssignments
    : sortedAssignments.filter(a => a.status === listFilter);

  // Current week's block (any status) + overdue pending carried over from earlier weeks.
  // Future weeks stay hidden until they become the current week; anything pending for
  // more than 7 days already flipped to 'perdido' in loadAll, so overdueBlock is always
  // recent backlog, never a growing pile.
  const thisWeekBlock = sortedAssignments.filter(a => getWeekStart(a.date) === curWeekStart);
  const overdueBlock = sortedAssignments.filter(a => a.status === 'pending' && getWeekStart(a.date) < curWeekStart);
  const nextAssignmentId = thisWeekBlock.find(a => a.status === 'pending')?.id ?? null;

  const visiblePendingCount = thisWeekBlock.filter(a => a.status === 'pending').length + overdueBlock.length;

  // Weekly stats
  const { start: weekStart, end: weekEnd } = getWeekRange();
  const weekAssignments = assignments.filter(a => a.date >= weekStart && a.date <= weekEnd);
  const weekCompleted = weekAssignments.filter(a => a.status === 'completed').length;

  // ── Player helpers ─────────────────────────────────────────────────────────
  // Top-set/back-off-set blocks (setGroups) expand into one row per set, each carrying
  // its own target RIR — a plain uniform exercise expands into `sets` identical rows.
  const initPlayerSets = (workout: Workout): SetInput[][] =>
    workout.exercises
      .slice()
      .sort((a, b) => a.order - b.order)
      .map(we => expandSetGroups(we).map(row => ({
        weight: '',
        repsDone: '',
        rir: String(row.rir),
        done: false,
      })));

  const openPlayer = (assignment: WorkoutAssignment) => {
    const wo = getWorkout(assignment.workoutId);
    if (!wo) return;
    setActiveAssignment(assignment);
    setActiveWorkout(wo);
    setPlayerSets(initPlayerSets(wo));
    setExerciseNoteInputs(wo.exercises.slice().sort((a, b) => a.order - b.order).map(() => ''));
    setWorkoutNoteInput('');
    setCelebration(null);

    // For each exercise in the workout, find the most recent logged set across ALL previous sessions
    const sortedPrev = logs
      .filter(l => l.date < assignment.date)
      .sort((a, b) => b.date.localeCompare(a.date));
    const seenExercises = new Set<string>();
    const entries: WorkoutEntryLog[] = [];
    for (const log of sortedPrev) {
      for (const entry of log.entries) {
        if (!seenExercises.has(entry.exerciseId)) {
          seenExercises.add(entry.exerciseId);
          entries.push(entry);
        }
      }
    }
    setPrevEntries(entries);
  };

  const updateSet = (exIdx: number, sIdx: number, field: keyof SetInput, value: string | boolean) => {
    setPlayerSets(prev => {
      const next = prev.map(ex => [...ex]);
      next[exIdx][sIdx] = { ...next[exIdx][sIdx], [field]: value };
      return next;
    });
  };

  const updateExerciseNote = (exIdx: number, value: string) => {
    setExerciseNoteInputs(prev => {
      const next = [...prev];
      next[exIdx] = value;
      return next;
    });
  };

  const canFinish = playerSets.some(exSets => exSets.some(s => s.done));

  const handleFinish = async () => {
    if (!activeAssignment || !activeWorkout || !canFinish) return;
    setIsFinishing(true);
    try {
      const orderedExercises = activeWorkout.exercises.slice().sort((a, b) => a.order - b.order);
      const entries: WorkoutEntryLog[] = orderedExercises
        .map((we, exIdx) => ({
          exerciseId: we.exerciseId,
          sets: (playerSets[exIdx] || [])
            .filter(s => s.done)
            .map(s => ({
              weight: parseFloat(s.weight) || 0,
              repsDone: parseInt(s.repsDone) || 0,
              rir: parseInt(s.rir) || 0,
            })),
          note: (exerciseNoteInputs[exIdx] || '').trim() || undefined,
        }))
        .filter(e => e.sets.length > 0);

      // PRs: mejor 1RM estimado de esta sesión por ejercicio contra el mejor
      // histórico ANTES de esta fecha — mismo criterio que el motor de
      // reportes (exige historial previo; un primer registro nunca es récord).
      const priorBest = allTimeBestBefore(logs, activeAssignment.date);
      const prs: SessionCelebration['prs'] = [];
      for (const entry of entries) {
        const newBest = entry.sets.reduce((max, s) => Math.max(max, epley(s.weight, s.repsDone)), 0);
        const prevBest = priorBest.get(entry.exerciseId);
        if (newBest > 0 && prevBest != null && newBest > prevBest) {
          prs.push({ exerciseId: entry.exerciseId, name: getExercise(entry.exerciseId)?.name || entry.exerciseId, newBest });
        }
      }
      const tonnage = entries.reduce((sum, e) => sum + e.sets.reduce((s, set) => s + set.weight * set.repsDone, 0), 0);
      const totalSets = entries.reduce((sum, e) => sum + e.sets.length, 0);
      const isFirstEver = logs.length === 0;

      const now = new Date().toISOString();
      const newLog = await createWorkoutLog({
        athleteId:   profile.email,
        workoutId:   activeWorkout.id,
        assignmentId: activeAssignment.id,
        mesocycleId:  activeAssignment.mesocycleId,
        date:         activeAssignment.date,
        completedAt:  now,
        entries,
        note: workoutNoteInput.trim() || undefined,
      });

      await updateWorkoutAssignment(activeAssignment.id, { status: 'completed' });

      queryClient.setQueryData<WorkoutAssignment[]>(assignmentsKey, prev => prev?.map(a =>
        a.id === activeAssignment.id ? { ...a, status: 'completed' } : a
      ));
      queryClient.setQueryData<WorkoutLog[]>(logsKey, prev => [...(prev ?? []), newLog]);
      setRestTimer(null);
      // El modal de celebración se muestra ANTES de cerrar el player — el
      // atleta lo despide él mismo (dismissCelebration) y ahí se limpia todo.
      setCelebration({ isFirstEver, totalSets, tonnage, prs });
    } catch (err) {
      console.error(err);
      showToast('No se pudo guardar el entrenamiento.');
    } finally {
      setIsFinishing(false);
    }
  };

  const dismissCelebration = () => {
    setCelebration(null);
    setActiveAssignment(null);
    setActiveWorkout(null);
    setPrevEntries([]);
    setExerciseNoteInputs([]);
    setWorkoutNoteInput('');
  };

  const handleSkip = async (assignment: WorkoutAssignment) => {
    try {
      await updateWorkoutAssignment(assignment.id, { status: 'skipped' });
      queryClient.setQueryData<WorkoutAssignment[]>(assignmentsKey, prev => prev?.map(a =>
        a.id === assignment.id ? { ...a, status: 'skipped' } : a
      ));
    } catch (err) {
      console.error('Error saltando sesión:', err);
      showToast('No se pudo saltar la sesión.');
    }
  };

  // ── Assignment card (shared by the "Esta semana / Atrasados" view and the classic
  // per-week history view) ────────────────────────────────────────────────────
  const renderAssignmentCard = (a: WorkoutAssignment, opts?: { isNext?: boolean }) => {
    const wo = getWorkout(a.workoutId);
    const isToday = a.date === today;
    const isPast = a.date < today;
    const isNext = opts?.isNext ?? false;
    const canAct = a.status === 'pending' || a.status === 'perdido';
    return (
      <div
        key={a.id}
        className={`border p-4 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
          isNext
            ? 'rounded-3xl bg-[#1a1c12] border-[#fbcb1a]/50 shadow-[0_0_30px_-8px_rgba(251,203,26,0.4)]'
            : 'rounded-2xl bg-[#181816] border-white/7'
        }`}
      >
        <div className="flex items-center gap-4">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
            a.status === 'completed' ? 'bg-emerald-500/15 text-emerald-400'
            : a.status === 'skipped'  ? 'bg-[#1c1b1b] text-[#c6c9ab]'
            : a.status === 'perdido'  ? 'bg-red-500/10 text-red-300'
            : isNext ? 'bg-[#fbcb1a]/15 text-[#fbcb1a]'
            : 'bg-[#1e1e1b] text-[#c6c9ab]'
          }`}>
            <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>
              {a.status === 'completed' ? 'check_circle'
                : a.status === 'skipped' ? 'skip_next'
                : a.status === 'perdido' ? 'event_busy'
                : isNext || isToday ? 'bolt' : 'fitness_center'}
            </span>
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-sans font-bold text-white text-base">{wo?.name || 'Rutina'}</p>
              {isNext && a.status === 'pending' && (
                <span className="text-[9px] font-mono bg-[#fbcb1a]/15 text-[#fbcb1a] border border-[#fbcb1a]/30 px-2 py-0.5 rounded uppercase font-bold">Siguiente</span>
              )}
              {!isNext && isPast && a.status === 'pending' && (
                <span className="text-[9px] font-mono bg-red-500/10 text-red-300 border border-red-500/20 px-2 py-0.5 rounded uppercase font-bold">Atrasado</span>
              )}
            </div>
            <p className="font-mono text-xs text-[#c6c9ab] mt-0.5">
              {formatDate(a.date)} · {wo ? `${wo.exercises.length} ejercicio${wo.exercises.length !== 1 ? 's' : ''}` : '—'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-end md:self-auto">
          <span className={`text-[10px] font-mono font-bold uppercase px-2.5 py-1 rounded-full ${STATUS_STYLE[a.status]}`}>
            {STATUS_LABEL[a.status]}
          </span>
          {canAct && (
            <>
              <button
                onClick={() => handleSkip(a)}
                className="flex items-center gap-1 px-3 py-1.5 bg-[#1c1b1b] border border-white/7 text-[#c6c9ab] hover:text-white hover:border-[#3a3a3a] font-mono text-[10px] uppercase font-bold rounded-lg active:scale-95 transition-all"
              >
                <span className="material-symbols-outlined text-sm">skip_next</span>
                Saltar
              </button>
              {wo && (
                <button
                  onClick={() => openPlayer(a)}
                  className="flex items-center gap-1.5 px-4 py-2.5 bg-[#fbcb1a] text-black font-sans font-bold text-xs uppercase rounded-lg hover:bg-[#d4a800] active:scale-95 transition-all shadow-sm"
                >
                  <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>play_circle</span>
                  {a.status === 'perdido' ? 'Recuperar' : 'Empezar'}
                </button>
              )}
            </>
          )}
          {a.status === 'completed' && (
            <span className="material-symbols-outlined text-emerald-400 text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>task_alt</span>
          )}
        </div>
      </div>
    );
  };

  // ── Render: PLAYER ─────────────────────────────────────────────────────────
  if (activeAssignment && activeWorkout) {
    const orderedExercises = activeWorkout.exercises.slice().sort((a, b) => a.order - b.order);
    const doneSetsTotal = playerSets.flat().filter(s => s.done).length;
    const totalSets = playerSets.flat().length;

    return (
      <div className="space-y-5 pb-24">
        {/* Player header */}
        <header className="flex items-center gap-3 pb-4 border-b border-white/60 sticky top-[65px] bg-[#111110] z-30 pt-2">
          <button
            onClick={() => { setActiveAssignment(null); setActiveWorkout(null); setPrevEntries([]); setExerciseNoteInputs([]); setWorkoutNoteInput(''); setRestTimer(null); }}
            className="flex items-center gap-1.5 text-xs font-mono text-[#c6c9ab] hover:text-white border border-white/7 hover:border-[#3a3a3a] px-3 py-2 rounded-lg transition-all flex-shrink-0"
          >
            <span className="material-symbols-outlined text-sm">arrow_back</span>
            Volver
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-sans font-black text-xl text-white truncate">{activeWorkout.name}</h1>
            <p className="font-mono text-[10px] text-[#c6c9ab]">{formatDate(activeAssignment.date)} · {orderedExercises.length} ejercicios</p>
          </div>
          <div className="flex-shrink-0 text-right">
            <span className="font-mono text-xs text-[#fbcb1a] font-bold">{doneSetsTotal}/{totalSets}</span>
            <span className="block font-mono text-[9px] text-[#c6c9ab] uppercase">series hechas</span>
          </div>
        </header>

        {/* Cronómetro de descanso — flotante, no bloquea el resto de la UI */}
        {restTimer && (
          <div className="fixed top-20 right-4 z-40 bg-[#181816] border border-[#fbcb1a]/40 rounded-2xl pl-3.5 pr-2 py-2 shadow-xl shadow-black/40 flex items-center gap-2.5">
            <span
              className={`material-symbols-outlined text-[#fbcb1a] text-lg ${restTimer.secondsLeft > 0 ? '' : 'animate-pulse'}`}
            >timer</span>
            <div className="leading-none">
              <p className="font-mono text-lg font-black text-white tabular-nums">
                {Math.floor(restTimer.secondsLeft / 60)}:{String(restTimer.secondsLeft % 60).padStart(2, '0')}
              </p>
              <p className="font-mono text-[8px] text-[#c6c9ab] uppercase tracking-wide mt-0.5">
                {restTimer.secondsLeft > 0 ? 'Descanso' : '¡Listo!'}
              </p>
            </div>
            <button
              onClick={() => setRestTimer(null)}
              aria-label="Saltar descanso"
              className="text-[#c6c9ab]/60 hover:text-white p-1 -m-1"
            >
              <span className="material-symbols-outlined text-base">close</span>
            </button>
          </div>
        )}

        {/* Progress bar */}
        <div className="h-1.5 bg-[#1c1b1b] rounded-full overflow-hidden">
          <div
            className="h-full bg-[#fbcb1a] rounded-full transition-all duration-300"
            style={{
              width: totalSets > 0 ? `${(doneSetsTotal / totalSets) * 100}%` : '0%',
              filter: 'drop-shadow(0 0 5px rgba(251,203,26,0.6))',
            }}
          />
        </div>

        {/* Stat tiles: real progress metrics */}
        <div className="grid grid-cols-2 gap-3">
          <StatTile icon="check_circle" label="Series hechas" value={`${doneSetsTotal}/${totalSets}`} />
          <StatTile icon="format_list_numbered" label="Ejercicios" value={orderedExercises.length} />
        </div>

        <Coachmark
          id="training_player_mark_set"
          email={profile.email}
          icon="touch_app"
          text="Marca el círculo al terminar cada serie — es lo que usa tu coach para progresarte."
        />

        {/* Exercise cards */}
        {orderedExercises.map((we, exIdx) => {
          const ex = getExercise(we.exerciseId);
          const exSets = playerSets[exIdx] || [];
          const prevEntry = prevEntries.find(e => e.exerciseId === we.exerciseId);
          const expanded = expandSetGroups(we);
          const totalSets = expanded.length;
          const doneSets = exSets.filter(s => s.done).length;
          // Warm-up reacts live to whatever the athlete is currently typing for the first
          // effective set (first row of the first block, top set included) — there's no
          // separate "prescribed weight" field, it's only known once the athlete types it.
          const set1Weight = parseFloat(exSets[0]?.weight || '') || 0;
          const warmup = generateWarmup({
            mode: we.warmupMode,
            manualSets: we.manualWarmupSets,
            targetWeight: set1Weight,
            targetReps: parseTargetReps(expanded[0]?.reps ?? we.reps),
            previousSets: prevEntry?.sets,
          });
          return (
            <div
              key={`${we.exerciseId}-${exIdx}`}
              className={`bg-[#181816] border rounded-2xl overflow-hidden ${
                we.recordVideoSet ? 'border-[#fbcb1a]/50 shadow-[0_0_0_1px_rgba(251,203,26,0.15)]' : 'border-white/7'
              }`}
            >
              {/* Exercise header */}
              <div className="flex items-center gap-3 p-4 bg-[#161616] border-b border-white/50">
                <span className="font-mono text-[10px] text-[#c6c9ab]/50 w-5 text-center font-bold flex-shrink-0">{exIdx + 1}</span>
                {ex?.imageUrl ? (
                  <img src={ex.imageUrl} alt={ex.name} className="w-11 h-11 rounded-full object-cover border border-white/7 flex-shrink-0" />
                ) : (
                  <div className="w-11 h-11 rounded-full bg-[#1e1e1b] border border-white/7 flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-base text-[#c6c9ab]">fitness_center</span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-sans font-bold text-sm text-white truncate flex items-center gap-1.5">
                    {ex?.name || we.exerciseId}
                    {we.technique && (
                      <span className={`inline-flex items-center gap-1 text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded border flex-shrink-0 ${TECHNIQUE_COLOR[we.technique]}`}>
                        {TECHNIQUE_EMOJI[we.technique]} {TECHNIQUE_LABEL[we.technique]}
                      </span>
                    )}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="font-mono text-[9px] text-[#c6c9ab]">
                      Prescripción: {we.setGroups && we.setGroups.length > 0
                        ? we.setGroups.map((g, i) => `${g.label || `Bloque ${i + 1}`} ${g.sets}×${g.reps} (RIR ${g.rir})`).join(' · ')
                        : `${we.sets}×${we.reps} · RIR ${we.rir}`} · {we.restSeconds}s
                    </span>
                    {ex?.type && (
                      <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded capitalize ${TYPE_CHIP[ex.type] || ''}`}>{ex.type}</span>
                    )}
                    {warmup.readiness && (
                      <span
                        title={warmup.readiness.message}
                        className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
                          warmup.readiness.score >= 75 ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10'
                          : warmup.readiness.score >= 45 ? 'text-amber-300 border-amber-500/30 bg-amber-500/10'
                          : 'text-red-300 border-red-500/30 bg-red-500/10'
                        }`}
                      >
                        🔥 Readiness {warmup.readiness.score}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex-shrink-0">
                  {doneSets === totalSets ? (
                    <span className="w-7 h-7 rounded-full bg-emerald-500/15 text-emerald-300 flex items-center justify-center">
                      <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>check</span>
                    </span>
                  ) : (
                    <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-white/7 text-[#c6c9ab]">
                      {doneSets}/{totalSets}
                    </span>
                  )}
                </div>
              </div>

              {we.recordVideoSet && (
                <div className="flex items-center gap-2 px-4 py-2 bg-[#fbcb1a]/10 border-b border-[#fbcb1a]/20">
                  <span className="material-symbols-outlined text-[#fbcb1a] text-base">videocam</span>
                  <p className="font-sans text-xs font-bold text-[#fbcb1a]">
                    {we.recordVideoSet === 'all'
                      ? 'Tu entrenador quiere que grabes todas las series con el móvil'
                      : `Tu entrenador quiere que grabes la serie ${we.recordVideoSet} con el móvil`}
                  </p>
                </div>
              )}

              {we.technique && (
                <div className={`flex items-start gap-2 px-4 py-2.5 border-b ${TECHNIQUE_COLOR[we.technique]}`}>
                  <span className="text-base flex-shrink-0 leading-none">{TECHNIQUE_EMOJI[we.technique]}</span>
                  <p className="font-sans text-xs leading-relaxed">
                    <span className="font-bold uppercase tracking-wide">{TECHNIQUE_LABEL[we.technique]}. </span>
                    {TECHNIQUE_DESCRIPTION[we.technique]}
                  </p>
                </div>
              )}

              {/* Set table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left min-w-[480px]">
                  <thead>
                    <tr className="bg-[#111111] border-b border-white/40">
                      <th className="px-4 py-2 font-mono text-[9px] text-[#c6c9ab] uppercase w-12">Serie</th>
                      <th className="px-3 py-2 font-mono text-[9px] text-[#c6c9ab] uppercase">Peso (kg)</th>
                      <th className="px-3 py-2 font-mono text-[9px] text-[#c6c9ab] uppercase">Reps</th>
                      <th className="px-3 py-2 font-mono text-[9px] text-[#c6c9ab] uppercase">RIR</th>
                      <th className="px-3 py-2 font-mono text-[9px] text-[#444] uppercase">Anterior</th>
                      <th className="px-4 py-2 font-mono text-[9px] text-[#c6c9ab] uppercase text-center">Hecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {warmup.sets.map((w, wIdx) => (
                      <tr key={`warmup-${wIdx}`} className="border-b border-white/20 bg-orange-500/5">
                        <td className="px-4 py-2.5">
                          <span className="font-mono text-xs font-bold text-orange-300 flex items-center gap-1">
                            🔥 W{wIdx + 1}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span className="w-20 inline-block text-center text-orange-200 font-mono text-sm">{w.weight}</span>
                        </td>
                        <td className="px-3 py-2">
                          <span className="w-16 inline-block text-center text-orange-200 font-mono text-sm">{w.reps}</span>
                        </td>
                        <td className="px-3 py-2 text-center text-orange-200/40 font-mono text-sm">—</td>
                        <td className="px-3 py-2 text-center text-orange-200/40 font-mono text-[10px]">Warm-up</td>
                        <td className="px-4 py-2 text-center text-orange-200/30 font-mono text-sm">—</td>
                      </tr>
                    ))}
                    {exSets.map((setInput, sIdx) => {
                      const prev = prevEntry?.sets[sIdx];
                      const shouldRecord = we.recordVideoSet === 'all' || we.recordVideoSet === sIdx + 1;
                      return (
                        <tr
                          key={sIdx}
                          className={`border-b border-white/20 transition-colors ${
                            setInput.done ? 'bg-emerald-500/5' : shouldRecord ? 'bg-[#fbcb1a]/5' : 'hover:bg-[#1e1e1b]'
                          }`}
                        >
                          <td className="px-4 py-2.5">
                            <span className="font-mono text-xs font-bold text-[#c6c9ab] flex items-center gap-1">
                              S{sIdx + 1}
                              {shouldRecord && (
                                <span className="material-symbols-outlined text-[#fbcb1a] text-sm" title="Grabar con el móvil">videocam</span>
                              )}
                            </span>
                            {(we.setGroups?.length ?? 0) > 1 && expanded[sIdx]?.label && (
                              <span className="block font-mono text-[8px] text-[#fbcb1a]/70 uppercase mt-0.5">{expanded[sIdx].label}</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min={0}
                              step={0.5}
                              value={setInput.weight}
                              onChange={e => updateSet(exIdx, sIdx, 'weight', e.target.value)}
                              placeholder={prev && prev.weight > 0 ? String(prev.weight) : '—'}
                              disabled={setInput.done}
                              className="w-20 bg-[#0e0e0e] border border-white/7 rounded-md px-2 py-1.5 text-center text-white font-mono text-sm focus:outline-none focus:ring-1 focus:ring-[#fbcb1a] disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min={0}
                              value={setInput.repsDone}
                              onChange={e => updateSet(exIdx, sIdx, 'repsDone', e.target.value)}
                              placeholder={prev && prev.repsDone > 0 ? String(prev.repsDone) : (expanded[sIdx]?.reps || '—')}
                              disabled={setInput.done}
                              className="w-16 bg-[#0e0e0e] border border-white/7 rounded-md px-2 py-1.5 text-center text-white font-mono text-sm focus:outline-none focus:ring-1 focus:ring-[#fbcb1a] disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min={0}
                              max={5}
                              value={setInput.rir}
                              onChange={e => updateSet(exIdx, sIdx, 'rir', e.target.value)}
                              disabled={setInput.done}
                              className="w-14 bg-[#0e0e0e] border border-white/7 rounded-md px-2 py-1.5 text-center text-white font-mono text-sm focus:outline-none focus:ring-1 focus:ring-[#fbcb1a] disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                          </td>
                          <td className="px-3 py-2">
                            {prev ? (
                              <span className="font-mono text-[10px] text-[#444] whitespace-nowrap">
                                {prev.weight > 0 ? `${prev.weight}kg` : '—'} × {prev.repsDone > 0 ? `${prev.repsDone}r` : '—'}
                              </span>
                            ) : (
                              <span className="font-mono text-[10px] text-[#333]">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-center">
                            <button
                              onClick={() => {
                                const markingDone = !setInput.done;
                                updateSet(exIdx, sIdx, 'done', markingDone);
                                if (markingDone && we.restSeconds) {
                                  setRestTimer({ totalSeconds: we.restSeconds, secondsLeft: we.restSeconds });
                                }
                              }}
                              className={`w-11 h-11 rounded-lg border flex items-center justify-center mx-auto transition-all ${
                                setInput.done
                                  ? 'bg-emerald-500 border-emerald-500 text-white shadow-md shadow-emerald-500/20'
                                  : 'border-white/7 text-[#2a2a2a] hover:border-[#fbcb1a]/50 hover:text-[#fbcb1a]/50'
                              }`}
                            >
                              <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>
                                {setInput.done ? 'check_circle' : 'radio_button_unchecked'}
                              </span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Athlete's note for this exercise */}
              <div className="px-4 py-3 bg-[#111111] border-t border-white/30">
                <label className="font-mono text-[9px] text-[#c6c9ab] uppercase tracking-wider block mb-1.5">Tu nota (opcional)</label>
                <textarea
                  value={exerciseNoteInputs[exIdx] || ''}
                  onChange={e => updateExerciseNote(exIdx, e.target.value)}
                  placeholder="ej. Molestia leve en el hombro derecho..."
                  rows={2}
                  className="w-full bg-[#0e0e0e] border border-white/7 rounded-lg p-2.5 text-xs text-white placeholder-[#c6c9ab]/40 focus:outline-none focus:ring-1 focus:ring-[#fbcb1a] resize-none"
                />
              </div>

              {we.notes && (
                <div className="px-4 py-2 bg-[#111111] border-t border-white/30">
                  <p className="font-mono text-[10px] text-[#c6c9ab] italic">📌 {we.notes}</p>
                </div>
              )}

              {ex?.instructions && (
                <div className="px-4 py-2 bg-[#111111] border-t border-white/30">
                  <p className="font-mono text-[9px] text-[#555] uppercase mb-0.5">Descripción</p>
                  <p className="text-xs text-[#c6c9ab]">{ex.instructions}</p>
                </div>
              )}

              {getPersonalNote(we.exerciseId) && (
                <div className="px-4 py-2 bg-[#1a1710] border-t border-[#fbcb1a]/15">
                  <p className="font-mono text-[9px] text-[#fbcb1a]/70 uppercase mb-0.5">Nota de tu entrenador para ti</p>
                  <p className="text-xs text-[#fbcb1a]">{getPersonalNote(we.exerciseId)}</p>
                </div>
              )}
            </div>
          );
        })}

        {/* Nota del entrenamiento completo */}
        <div className="bg-[#181816] border border-white/7 rounded-2xl p-4 space-y-2">
          <label className="font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider">Nota del entrenamiento (opcional)</label>
          <textarea
            value={workoutNoteInput}
            onChange={e => setWorkoutNoteInput(e.target.value)}
            placeholder="¿Cómo te sentiste hoy? Cualquier comentario general para tu entrenador..."
            rows={2}
            className="w-full bg-[#0e0e0e] border border-white/7 rounded-lg p-3 text-sm text-white placeholder-[#c6c9ab]/40 focus:outline-none focus:ring-1 focus:ring-[#fbcb1a] resize-none"
          />
        </div>

        {/* Player action bar */}
        <div className="fixed bottom-24 md:bottom-6 left-0 right-0 flex justify-center gap-3 z-40 px-4">
          <button
            onClick={async () => {
              await handleSkip(activeAssignment);
              setActiveAssignment(null);
              setActiveWorkout(null);
              setPrevEntries([]);
              setExerciseNoteInputs([]);
              setWorkoutNoteInput('');
              setRestTimer(null);
            }}
            className="flex items-center gap-2 px-5 py-4 bg-[#1c1b1b] border border-white/7 text-[#c6c9ab] hover:text-white hover:border-[#3a3a3a] font-mono font-bold text-sm uppercase rounded-2xl active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined">skip_next</span>
            Saltar
          </button>
          <button
            onClick={handleFinish}
            disabled={!canFinish || isFinishing || !!celebration}
            className="flex items-center gap-2 px-8 py-4 bg-[#fbcb1a] text-black font-sans font-black text-sm uppercase rounded-2xl hover:bg-[#d4a800] active:scale-95 transition-all disabled:opacity-40 shadow-xl shadow-[#fbcb1a]/20 disabled:shadow-none"
          >
            {isFinishing ? (
              <><span className="material-symbols-outlined animate-spin">refresh</span>Guardando...</>
            ) : (
              <><span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>flag</span>Finalizar</>
            )}
          </button>
        </div>

        {/* Celebración al terminar — se muestra antes de volver a la lista;
            el atleta la despide él mismo (dismissCelebration cierra ambas cosas). */}
        {celebration && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
            <div className="bg-[#181816] border border-[#fbcb1a]/30 rounded-3xl w-full max-w-sm p-7 space-y-5 shadow-2xl text-center">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-[#fbcb1a]/10 border border-[#fbcb1a]/30 flex items-center justify-center">
                <span className="material-symbols-outlined text-4xl text-[#fbcb1a]" style={{ fontVariationSettings: "'FILL' 1" }}>
                  {celebration.isFirstEver ? 'celebration' : 'bolt'}
                </span>
              </div>
              <div>
                <h2 className="font-sans font-black text-xl text-white">
                  {celebration.isFirstEver ? '¡Primera sesión registrada! 💪' : '¡Entreno completado! 💪'}
                </h2>
                <p className="text-sm text-[#c6c9ab] mt-1">
                  {celebration.isFirstEver ? 'Así se empieza — a partir de aquí, todo suma.' : 'Buen trabajo. Sigue así.'}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#1e1e1b] rounded-xl p-3">
                  <p className="font-mono text-2xl font-black text-white tabular-nums">{celebration.totalSets}</p>
                  <p className="font-mono text-[9px] text-[#c6c9ab] uppercase tracking-wide">Series</p>
                </div>
                <div className="bg-[#1e1e1b] rounded-xl p-3">
                  <p className="font-mono text-2xl font-black text-white tabular-nums">{Math.round(celebration.tonnage).toLocaleString('es-ES')}</p>
                  <p className="font-mono text-[9px] text-[#c6c9ab] uppercase tracking-wide">kg movidos</p>
                </div>
              </div>
              {celebration.prs.length > 0 && (
                <div className="bg-[#fbcb1a]/10 border border-[#fbcb1a]/30 rounded-xl p-3 space-y-1.5 text-left">
                  {celebration.prs.map(pr => (
                    <p key={pr.exerciseId} className="text-xs text-[#fbcb1a] flex items-center gap-2">
                      <span className="material-symbols-outlined text-sm">military_tech</span>
                      Récord en {pr.name} — {pr.newBest} kg est.
                    </p>
                  ))}
                </div>
              )}
              <button
                onClick={dismissCelebration}
                className="w-full py-3 rounded-xl bg-[#fbcb1a] text-black font-sans font-black text-sm uppercase tracking-widest active:scale-95 transition-all"
              >
                Genial
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Render: LIST + PROGRESSION ─────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-end justify-between pb-4 border-b border-white/60 gap-3">
        <div>
          <h1 className="font-sans font-black text-3xl tracking-tight text-white uppercase">Entrenamiento</h1>
          <p className="text-[#c6c9ab] text-sm mt-1">
            {visiblePendingCount > 0
              ? `${visiblePendingCount} entrenamientos pendientes`
              : 'Todo al día — sin pendientes'}
          </p>
        </div>
        {/* Week summary chip */}
        <div className="flex items-center gap-2 bg-[#181816] border border-white/7 px-4 py-2 rounded-2xl">
          <span className="material-symbols-outlined text-[#fbcb1a] text-sm">calendar_today</span>
          <span className="font-mono text-xs text-[#c6c9ab]">Esta semana:</span>
          <span className="font-mono text-sm font-black text-white">{weekCompleted}/{weekAssignments.length}</span>
          <span className="font-mono text-xs text-[#c6c9ab]">completados</span>
        </div>
      </header>

      {/* Main tabs */}
      <div className="flex bg-[#181816] border border-white/7 p-1 rounded-lg gap-1 w-full sm:w-fit">
        <button
          onClick={() => setMainTab('programa')}
          className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-md font-sans text-xs font-bold tracking-wider uppercase transition-all ${mainTab === 'programa' ? 'bg-[#fbcb1a] text-black shadow-lg' : 'text-[#c6c9ab] hover:text-white'}`}
        >
          <span className="material-symbols-outlined text-base">event</span>
          Programa
        </button>
        <button
          onClick={() => setMainTab('progresion')}
          className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-md font-sans text-xs font-bold tracking-wider uppercase transition-all ${mainTab === 'progresion' ? 'bg-[#fbcb1a] text-black shadow-lg' : 'text-[#c6c9ab] hover:text-white'}`}
        >
          <span className="material-symbols-outlined text-base">trending_up</span>
          Progresión
        </button>
      </div>

      {/* ── PROGRAMA TAB ───────────────────────────────────────────────────── */}
      {mainTab === 'programa' && (
        <div className="space-y-4">
          {/* Status filter */}
          <div className="flex gap-2 flex-wrap">
            {(['pending', 'completed', 'all'] as const).map(f => (
              <button
                key={f}
                onClick={() => setListFilter(f)}
                className={`px-4 py-2 rounded-full font-mono text-[10px] uppercase font-bold border transition-all min-h-[36px] ${
                  listFilter === f
                    ? 'bg-[#fbcb1a] border-[#fbcb1a] text-black'
                    : 'border-white/7 text-[#c6c9ab] hover:border-[#3a3a3a] hover:text-white'
                }`}
              >
                {f === 'pending' ? `Pendientes (${visiblePendingCount})` :
                 f === 'completed' ? `Completados (${assignments.filter(a => a.status === 'completed').length})` :
                 `Todos (${assignments.length})`}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full rounded-2xl" />
              <Skeleton className="h-20 w-full rounded-2xl" />
              <Skeleton className="h-20 w-full rounded-2xl" />
            </div>
          ) : listFilter === 'pending' ? (
            thisWeekBlock.length === 0 && overdueBlock.length === 0 ? (
              <div className="bg-[#181816] border border-dashed border-white/7 rounded-2xl p-14 text-center">
                <span className="material-symbols-outlined text-4xl text-[#fbcb1a]/30 block mb-3">fitness_center</span>
                <p className="text-white font-bold text-sm">Sin entrenamientos pendientes</p>
                <p className="text-[#c6c9ab] text-xs mt-1">Tu entrenador asignará sesiones próximamente.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Esta semana — siempre primero */}
                {thisWeekBlock.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-[10px] uppercase font-bold tracking-widest text-[#fbcb1a]">
                        {formatWeekLabel(curWeekStart, true)}
                      </span>
                      <div className="flex-1 h-px bg-[#2a2a2a]" />
                      <span className="font-mono text-[10px] text-[#c6c9ab]">
                        {thisWeekBlock.filter(a => a.status === 'completed').length}/{thisWeekBlock.length}
                      </span>
                    </div>
                    {thisWeekBlock.map(a => renderAssignmentCard(a, { isNext: a.id === nextAssignmentId }))}
                  </div>
                )}

                {/* Atrasados — semanas anteriores, todavía dentro de la semana de gracia */}
                {overdueBlock.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-[10px] uppercase font-bold tracking-widest text-red-300">Atrasados</span>
                      <div className="flex-1 h-px bg-[#2a2a2a]" />
                      <span className="font-mono text-[10px] text-[#c6c9ab]">{overdueBlock.length}</span>
                    </div>
                    {overdueBlock.map(a => renderAssignmentCard(a))}
                  </div>
                )}
              </div>
            )
          ) : filteredAssignments.length === 0 ? (
            <div className="bg-[#181816] border border-dashed border-white/7 rounded-2xl p-14 text-center">
              <span className="material-symbols-outlined text-4xl text-[#fbcb1a]/30 block mb-3">fitness_center</span>
              <p className="text-white font-bold text-sm">Sin entrenamientos {listFilter === 'completed' ? 'completados' : ''}</p>
              <p className="text-[#c6c9ab] text-xs mt-1">Tu entrenador asignará sesiones próximamente.</p>
            </div>
          ) : (
            (() => {
              // Group by week — used for "Completados" (history) and "Todos" (full picture,
              // including future weeks and 'perdido' items for recovery).
              const weekMap = new Map<string, WorkoutAssignment[]>();
              for (const a of filteredAssignments) {
                const ws = getWeekStart(a.date);
                if (!weekMap.has(ws)) weekMap.set(ws, []);
                weekMap.get(ws)!.push(a);
              }
              const weeks = Array.from(weekMap.entries()).sort(([a], [b]) => a.localeCompare(b));
              return (
                <div className="space-y-6">
                  {weeks.map(([weekStart, items]) => {
                    const isCurWeek = weekStart === curWeekStart;
                    return (
                      <div key={weekStart} className="space-y-3">
                        {/* Week header */}
                        <div className="flex items-center gap-3">
                          <span className={`font-mono text-[10px] uppercase font-bold tracking-widest ${isCurWeek ? 'text-[#fbcb1a]' : 'text-[#c6c9ab]'}`}>
                            {formatWeekLabel(weekStart, isCurWeek)}
                          </span>
                          <div className="flex-1 h-px bg-[#2a2a2a]" />
                          <span className="font-mono text-[10px] text-[#c6c9ab]">
                            {items.filter(a => a.status === 'completed').length}/{items.length}
                          </span>
                        </div>

                        {items.map(a => renderAssignmentCard(a, { isNext: isCurWeek && a.id === nextAssignmentId }))}
                      </div>
                    );
                  })}
                </div>
              );
            })()
          )}
        </div>
      )}

      {/* ── PROGRESIÓN TAB ─────────────────────────────────────────────────── */}
      {mainTab === 'progresion' && (
        <LoadHistoryPanel logs={logs} exercises={exercises} athleteId={profile.email} />
      )}
    </div>
  );
}
