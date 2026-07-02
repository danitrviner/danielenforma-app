import React, { useState, useEffect, useCallback } from 'react';
import { UserProfile, Workout, WorkoutAssignment, Exercise, WorkoutLog, WorkoutEntryLog } from '../types';
import LoadHistoryPanel from './LoadHistoryPanel';
import {
  getWorkoutAssignmentsForAthlete, getWorkouts, getExercises, seedExercisesIfEmpty,
  createWorkoutLog, updateWorkoutAssignment, getWorkoutLogs,
} from '../dbService';
import { getWeekRange, getWeekStart, MONTHS_ES, formatDate } from '../utils/trainingWeek';

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
  pliometría:   'bg-[#e2ff00]/10 text-[#e2ff00] border border-[#e2ff00]/20',
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function TrainingScreen({ profile }: TrainingScreenProps) {
  const [mainTab, setMainTab] = useState<MainTab>('programa');
  const [loading, setLoading] = useState(true);

  // Data
  const [assignments, setAssignments] = useState<WorkoutAssignment[]>([]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [logs, setLogs] = useState<WorkoutLog[]>([]);

  // List filter
  const [listFilter, setListFilter] = useState<WorkoutAssignment['status'] | 'all'>('pending');

  // Player state
  const [activeAssignment, setActiveAssignment] = useState<WorkoutAssignment | null>(null);
  const [activeWorkout, setActiveWorkout] = useState<Workout | null>(null);
  const [playerSets, setPlayerSets] = useState<SetInput[][]>([]);
  const [prevEntries, setPrevEntries] = useState<WorkoutEntryLog[]>([]);
  const [isFinishing, setIsFinishing] = useState(false);
  const [finishMsg, setFinishMsg] = useState('');

  // ── Load data ──────────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [asn, wos, logs] = await Promise.all([
        getWorkoutAssignmentsForAthlete(profile.userId),
        getWorkouts(),
        getWorkoutLogs(profile.email),
      ]);

      // Pending assignments more than a week past their date are lost — the athlete missed
      // the weekly block entirely. Persist so the coach sees it too (ClientHub).
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 7);
      const cutoffStr = cutoff.toISOString().split('T')[0];
      const toMarkLost = asn.filter(a => a.status === 'pending' && a.date < cutoffStr);
      if (toMarkLost.length > 0) {
        await Promise.all(toMarkLost.map(a => updateWorkoutAssignment(a.id, { status: 'perdido' })));
      }
      const lostIds = new Set(toMarkLost.map(a => a.id));
      const resolvedAssignments = asn.map(a => lostIds.has(a.id) ? { ...a, status: 'perdido' as const } : a);

      setAssignments(resolvedAssignments);
      setWorkouts(wos);
      setLogs(logs);

      // Exercises — seed if needed
      await seedExercisesIfEmpty();
      setExercises(await getExercises());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [profile.email]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const getWorkout = (id: string) => workouts.find(w => w.id === id);
  const getExercise = (id: string) => exercises.find(e => e.id === id);

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
  const initPlayerSets = (workout: Workout): SetInput[][] =>
    workout.exercises
      .slice()
      .sort((a, b) => a.order - b.order)
      .map(we => Array.from({ length: we.sets }, () => ({
        weight: '',
        repsDone: '',
        rir: String(we.rir),
        done: false,
      })));

  const openPlayer = (assignment: WorkoutAssignment) => {
    const wo = getWorkout(assignment.workoutId);
    if (!wo) return;
    setActiveAssignment(assignment);
    setActiveWorkout(wo);
    setPlayerSets(initPlayerSets(wo));
    setFinishMsg('');

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
        }))
        .filter(e => e.sets.length > 0);

      const now = new Date().toISOString();
      const newLog = await createWorkoutLog({
        athleteId:   profile.email,
        workoutId:   activeWorkout.id,
        assignmentId: activeAssignment.id,
        mesocycleId:  activeAssignment.mesocycleId,
        date:         activeAssignment.date,
        completedAt:  now,
        entries,
      });

      await updateWorkoutAssignment(activeAssignment.id, { status: 'completed' });

      setAssignments(prev => prev.map(a =>
        a.id === activeAssignment.id ? { ...a, status: 'completed' } : a
      ));
      setLogs(prev => [...prev, newLog]);
      setActiveAssignment(null);
      setActiveWorkout(null);
      setPrevEntries([]);
      setFinishMsg('¡Entreno completado! Buen trabajo 💪');
      setTimeout(() => setFinishMsg(''), 5000);
    } catch (err) {
      console.error(err);
    } finally {
      setIsFinishing(false);
    }
  };

  const handleSkip = async (assignment: WorkoutAssignment) => {
    try {
      await updateWorkoutAssignment(assignment.id, { status: 'skipped' });
      setAssignments(prev => prev.map(a =>
        a.id === assignment.id ? { ...a, status: 'skipped' } : a
      ));
    } catch (err) {
      console.error('Error saltando sesión:', err);
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
        className={`border rounded-xl p-4 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
          isNext
            ? 'bg-[#1a1c12] border-[#e2ff00]/50 shadow-lg shadow-[#e2ff00]/5'
            : 'bg-[#121212] border-[#2a2a2a]'
        }`}
      >
        <div className="flex items-center gap-4">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
            a.status === 'completed' ? 'bg-emerald-500/15 text-emerald-400'
            : a.status === 'skipped'  ? 'bg-[#1c1b1b] text-[#c6c9ab]'
            : a.status === 'perdido'  ? 'bg-red-500/10 text-red-300'
            : isNext ? 'bg-[#e2ff00]/15 text-[#e2ff00]'
            : 'bg-[#1a1a1a] text-[#c6c9ab]'
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
                <span className="text-[9px] font-mono bg-[#e2ff00]/15 text-[#e2ff00] border border-[#e2ff00]/30 px-2 py-0.5 rounded uppercase font-bold">Siguiente</span>
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
                className="flex items-center gap-1 px-3 py-1.5 bg-[#1c1b1b] border border-[#2a2a2a] text-[#c6c9ab] hover:text-white hover:border-[#3a3a3a] font-mono text-[10px] uppercase font-bold rounded-lg active:scale-95 transition-all"
              >
                <span className="material-symbols-outlined text-sm">skip_next</span>
                Saltar
              </button>
              {wo && (
                <button
                  onClick={() => openPlayer(a)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[#e2ff00] text-black font-mono font-bold text-xs uppercase rounded-lg hover:bg-[#bad200] active:scale-95 transition-all"
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
        <header className="flex items-center gap-3 pb-4 border-b border-[#2a2a2a]/60 sticky top-[65px] bg-[#131313] z-30 pt-2">
          <button
            onClick={() => { setActiveAssignment(null); setActiveWorkout(null); setPrevEntries([]); }}
            className="flex items-center gap-1.5 text-xs font-mono text-[#c6c9ab] hover:text-white border border-[#2a2a2a] hover:border-[#3a3a3a] px-3 py-2 rounded-lg transition-all flex-shrink-0"
          >
            <span className="material-symbols-outlined text-sm">arrow_back</span>
            Volver
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-sans font-black text-xl text-white truncate">{activeWorkout.name}</h1>
            <p className="font-mono text-[10px] text-[#c6c9ab]">{formatDate(activeAssignment.date)} · {orderedExercises.length} ejercicios</p>
          </div>
          <div className="flex-shrink-0 text-right">
            <span className="font-mono text-xs text-[#e2ff00] font-bold">{doneSetsTotal}/{totalSets}</span>
            <span className="block font-mono text-[9px] text-[#c6c9ab] uppercase">series hechas</span>
          </div>
        </header>

        {/* Progress bar */}
        <div className="h-1.5 bg-[#1c1b1b] rounded-full overflow-hidden">
          <div
            className="h-full bg-[#e2ff00] rounded-full transition-all duration-300"
            style={{ width: totalSets > 0 ? `${(doneSetsTotal / totalSets) * 100}%` : '0%' }}
          />
        </div>

        {/* Exercise cards */}
        {orderedExercises.map((we, exIdx) => {
          const ex = getExercise(we.exerciseId);
          const exSets = playerSets[exIdx] || [];
          const prevEntry = prevEntries.find(e => e.exerciseId === we.exerciseId);
          const doneSets = exSets.filter(s => s.done).length;
          return (
            <div key={`${we.exerciseId}-${exIdx}`} className="bg-[#121212] border border-[#2a2a2a] rounded-xl overflow-hidden">
              {/* Exercise header */}
              <div className="flex items-center gap-3 p-4 bg-[#161616] border-b border-[#2a2a2a]/50">
                <span className="font-mono text-[10px] text-[#c6c9ab]/50 w-5 text-center font-bold flex-shrink-0">{exIdx + 1}</span>
                {ex?.imageUrl ? (
                  <img src={ex.imageUrl} alt={ex.name} className="w-10 h-10 rounded-lg object-cover border border-[#2a2a2a] flex-shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-[#1e1e1e] border border-[#2a2a2a] flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-base text-[#c6c9ab]">fitness_center</span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-sans font-bold text-sm text-white truncate">{ex?.name || we.exerciseId}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="font-mono text-[9px] text-[#c6c9ab]">
                      Prescripción: {we.sets}×{we.reps} · {we.restSeconds}s · RIR {we.rir}
                    </span>
                    {ex?.type && (
                      <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded capitalize ${TYPE_CHIP[ex.type] || ''}`}>{ex.type}</span>
                    )}
                  </div>
                </div>
                <div className="flex-shrink-0">
                  <span className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded ${doneSets === we.sets ? 'bg-emerald-500/15 text-emerald-300' : 'bg-[#2a2a2a] text-[#c6c9ab]'}`}>
                    {doneSets}/{we.sets}
                  </span>
                </div>
              </div>

              {/* Set table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left min-w-[480px]">
                  <thead>
                    <tr className="bg-[#111111] border-b border-[#2a2a2a]/40">
                      <th className="px-4 py-2 font-mono text-[9px] text-[#c6c9ab] uppercase w-12">Serie</th>
                      <th className="px-3 py-2 font-mono text-[9px] text-[#c6c9ab] uppercase">Peso (kg)</th>
                      <th className="px-3 py-2 font-mono text-[9px] text-[#c6c9ab] uppercase">Reps</th>
                      <th className="px-3 py-2 font-mono text-[9px] text-[#c6c9ab] uppercase">RIR</th>
                      <th className="px-3 py-2 font-mono text-[9px] text-[#444] uppercase">Anterior</th>
                      <th className="px-4 py-2 font-mono text-[9px] text-[#c6c9ab] uppercase text-center">Hecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exSets.map((setInput, sIdx) => {
                      const prev = prevEntry?.sets[sIdx];
                      return (
                        <tr
                          key={sIdx}
                          className={`border-b border-[#2a2a2a]/20 transition-colors ${setInput.done ? 'bg-emerald-500/5' : 'hover:bg-[#1a1a1a]'}`}
                        >
                          <td className="px-4 py-2.5">
                            <span className="font-mono text-xs font-bold text-[#c6c9ab]">S{sIdx + 1}</span>
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min={0}
                              step={0.5}
                              value={setInput.weight}
                              onChange={e => updateSet(exIdx, sIdx, 'weight', e.target.value)}
                              placeholder="—"
                              disabled={setInput.done}
                              className="w-20 bg-[#0e0e0e] border border-[#2a2a2a] rounded-md px-2 py-1.5 text-center text-white font-mono text-sm focus:outline-none focus:ring-1 focus:ring-[#e2ff00] disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min={0}
                              value={setInput.repsDone}
                              onChange={e => updateSet(exIdx, sIdx, 'repsDone', e.target.value)}
                              placeholder="—"
                              disabled={setInput.done}
                              className="w-16 bg-[#0e0e0e] border border-[#2a2a2a] rounded-md px-2 py-1.5 text-center text-white font-mono text-sm focus:outline-none focus:ring-1 focus:ring-[#e2ff00] disabled:opacity-50 disabled:cursor-not-allowed"
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
                              className="w-14 bg-[#0e0e0e] border border-[#2a2a2a] rounded-md px-2 py-1.5 text-center text-white font-mono text-sm focus:outline-none focus:ring-1 focus:ring-[#e2ff00] disabled:opacity-50 disabled:cursor-not-allowed"
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
                              onClick={() => updateSet(exIdx, sIdx, 'done', !setInput.done)}
                              className={`w-11 h-11 rounded-lg border flex items-center justify-center mx-auto transition-all ${
                                setInput.done
                                  ? 'bg-emerald-500 border-emerald-500 text-white shadow-md shadow-emerald-500/20'
                                  : 'border-[#2a2a2a] text-[#2a2a2a] hover:border-[#e2ff00]/50 hover:text-[#e2ff00]/50'
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

              {we.notes && (
                <div className="px-4 py-2 bg-[#111111] border-t border-[#2a2a2a]/30">
                  <p className="font-mono text-[10px] text-[#c6c9ab] italic">📌 {we.notes}</p>
                </div>
              )}
            </div>
          );
        })}

        {/* Player action bar */}
        <div className="fixed bottom-24 md:bottom-6 left-0 right-0 flex justify-center gap-3 z-40 px-4">
          <button
            onClick={async () => {
              await handleSkip(activeAssignment);
              setActiveAssignment(null);
              setActiveWorkout(null);
              setPrevEntries([]);
            }}
            className="flex items-center gap-2 px-5 py-4 bg-[#1c1b1b] border border-[#2a2a2a] text-[#c6c9ab] hover:text-white hover:border-[#3a3a3a] font-mono font-bold text-sm uppercase rounded-2xl active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined">skip_next</span>
            Saltar
          </button>
          <button
            onClick={handleFinish}
            disabled={!canFinish || isFinishing}
            className="flex items-center gap-2 px-8 py-4 bg-[#e2ff00] text-black font-mono font-black text-sm uppercase rounded-2xl hover:bg-[#bad200] active:scale-95 transition-all disabled:opacity-40 shadow-xl shadow-[#e2ff00]/20 disabled:shadow-none"
          >
            {isFinishing ? (
              <><span className="material-symbols-outlined animate-spin">refresh</span>Guardando...</>
            ) : (
              <><span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>flag</span>Finalizar</>
            )}
          </button>
        </div>
      </div>
    );
  }

  // ── Render: LIST + PROGRESSION ─────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-end justify-between pb-4 border-b border-[#2a2a2a]/60 gap-3">
        <div>
          <h1 className="font-sans font-black text-3xl tracking-tight text-white uppercase">Entrenamiento</h1>
          <p className="text-[#c6c9ab] text-sm mt-1">
            {visiblePendingCount > 0
              ? `${visiblePendingCount} entrenamientos pendientes`
              : 'Todo al día — sin pendientes'}
          </p>
        </div>
        {/* Week summary chip */}
        <div className="flex items-center gap-2 bg-[#121212] border border-[#2a2a2a] px-4 py-2 rounded-xl">
          <span className="material-symbols-outlined text-[#e2ff00] text-sm">calendar_today</span>
          <span className="font-mono text-xs text-[#c6c9ab]">Esta semana:</span>
          <span className="font-mono text-sm font-black text-white">{weekCompleted}/{weekAssignments.length}</span>
          <span className="font-mono text-xs text-[#c6c9ab]">completados</span>
        </div>
      </header>

      {finishMsg && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-white p-4 rounded-xl text-sm flex items-center gap-3">
          <span className="material-symbols-outlined text-emerald-400 text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>emoji_events</span>
          <p className="font-sans font-bold">{finishMsg}</p>
        </div>
      )}

      {/* Main tabs */}
      <div className="flex bg-[#121212] border border-[#2a2a2a] p-1 rounded-lg gap-1 w-full sm:w-fit">
        <button
          onClick={() => setMainTab('programa')}
          className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-md font-sans text-xs font-bold tracking-wider uppercase transition-all ${mainTab === 'programa' ? 'bg-[#e2ff00] text-black shadow-lg' : 'text-[#c6c9ab] hover:text-white'}`}
        >
          <span className="material-symbols-outlined text-base">event</span>
          Programa
        </button>
        <button
          onClick={() => setMainTab('progresion')}
          className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-md font-sans text-xs font-bold tracking-wider uppercase transition-all ${mainTab === 'progresion' ? 'bg-[#e2ff00] text-black shadow-lg' : 'text-[#c6c9ab] hover:text-white'}`}
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
                    ? 'bg-[#e2ff00] border-[#e2ff00] text-black'
                    : 'border-[#2a2a2a] text-[#c6c9ab] hover:border-[#3a3a3a] hover:text-white'
                }`}
              >
                {f === 'pending' ? `Pendientes (${visiblePendingCount})` :
                 f === 'completed' ? `Completados (${assignments.filter(a => a.status === 'completed').length})` :
                 `Todos (${assignments.length})`}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <span className="material-symbols-outlined animate-spin text-[#e2ff00] mr-2">refresh</span>
              <span className="font-mono text-xs uppercase tracking-widest text-[#c6c9ab]">Cargando programa...</span>
            </div>
          ) : listFilter === 'pending' ? (
            thisWeekBlock.length === 0 && overdueBlock.length === 0 ? (
              <div className="bg-[#121212] border border-dashed border-[#2a2a2a] rounded-xl p-14 text-center">
                <span className="material-symbols-outlined text-4xl text-[#e2ff00]/30 block mb-3">fitness_center</span>
                <p className="text-white font-bold text-sm">Sin entrenamientos pendientes</p>
                <p className="text-[#c6c9ab] text-xs mt-1">Tu entrenador asignará sesiones próximamente.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Esta semana — siempre primero */}
                {thisWeekBlock.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-[10px] uppercase font-bold tracking-widest text-[#e2ff00]">
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
            <div className="bg-[#121212] border border-dashed border-[#2a2a2a] rounded-xl p-14 text-center">
              <span className="material-symbols-outlined text-4xl text-[#e2ff00]/30 block mb-3">fitness_center</span>
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
                          <span className={`font-mono text-[10px] uppercase font-bold tracking-widest ${isCurWeek ? 'text-[#e2ff00]' : 'text-[#c6c9ab]'}`}>
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
        <LoadHistoryPanel logs={logs} exercises={exercises} />
      )}
    </div>
  );
}
