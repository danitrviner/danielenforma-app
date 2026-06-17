import React, { useState, useEffect, useCallback } from 'react';
import { UserProfile, Workout, WorkoutAssignment, Exercise, WorkoutLog, WorkoutEntryLog } from '../types';
import {
  getWorkoutAssignments, getWorkouts, getExercises, seedExercisesIfEmpty,
  createWorkoutLog, updateWorkoutAssignment, getWorkoutLogs,
} from '../dbService';

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

function getWeekRange(): { start: string; end: string } {
  const today = new Date();
  const day = today.getDay();
  const daysFromMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(today);
  monday.setDate(today.getDate() - daysFromMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: monday.toISOString().split('T')[0],
    end: sunday.toISOString().split('T')[0],
  };
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}`;
}

const STATUS_LABEL: Record<WorkoutAssignment['status'], string> = {
  pending:   'Pendiente',
  completed: 'Completado',
  skipped:   'Saltado',
};

const STATUS_STYLE: Record<WorkoutAssignment['status'], string> = {
  pending:   'bg-amber-500/10 text-amber-300 border border-amber-500/20',
  completed: 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20',
  skipped:   'bg-[#2a2a2a] text-[#c6c9ab] border border-[#3a3a3a]',
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
  const [isFinishing, setIsFinishing] = useState(false);
  const [finishMsg, setFinishMsg] = useState('');

  // Progression state
  const [histExerciseId, setHistExerciseId] = useState('');

  // ── Load data ──────────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [asn, wos, logs] = await Promise.all([
        getWorkoutAssignments(profile.userId),
        getWorkouts(),
        getWorkoutLogs(profile.userId),
      ]);
      setAssignments(asn);
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
  }, [profile.userId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const getWorkout = (id: string) => workouts.find(w => w.id === id);
  const getExercise = (id: string) => exercises.find(e => e.id === id);

  const sortedAssignments = [...assignments].sort((a, b) => a.date.localeCompare(b.date));
  const filteredAssignments = listFilter === 'all'
    ? sortedAssignments
    : sortedAssignments.filter(a => a.status === listFilter);

  const pendingCount = assignments.filter(a => a.status === 'pending').length;

  // Weekly stats
  const { start: weekStart, end: weekEnd } = getWeekRange();
  const weekAssignments = assignments.filter(a => a.date >= weekStart && a.date <= weekEnd);
  const weekCompleted = weekAssignments.filter(a => a.status === 'completed').length;

  // Exercises that appear in logs (for progression tab)
  const loggedExerciseIds = Array.from(new Set<string>(logs.flatMap(l => l.entries.map(e => e.exerciseId))));
  const loggedExercises = loggedExerciseIds
    .map(id => getExercise(id))
    .filter(Boolean) as Exercise[];

  // Build history for a given exercise
  const getExerciseHistory = (exerciseId: string) => {
    return logs
      .filter(log => log.entries.some(e => e.exerciseId === exerciseId))
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(log => {
        const entry = log.entries.find(e => e.exerciseId === exerciseId)!;
        const wo = getWorkout(log.workoutId);
        const maxWeight = Math.max(...entry.sets.map(s => s.weight), 0);
        const totalReps = entry.sets.reduce((acc, s) => acc + s.repsDone, 0);
        return { date: log.date, workoutName: wo?.name || '—', sets: entry.sets, maxWeight, totalReps };
      });
  };

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
        athleteId: profile.userId,
        workoutId: activeWorkout.id,
        assignmentId: activeAssignment.id,
        date: activeAssignment.date,
        completedAt: now,
        entries,
      });

      await updateWorkoutAssignment(activeAssignment.id, { status: 'completed' });

      setAssignments(prev => prev.map(a =>
        a.id === activeAssignment.id ? { ...a, status: 'completed' } : a
      ));
      setLogs(prev => [...prev, newLog]);
      setActiveAssignment(null);
      setActiveWorkout(null);
      setFinishMsg('¡Entreno completado! Buen trabajo 💪');
      setTimeout(() => setFinishMsg(''), 5000);
    } catch (err) {
      console.error(err);
    } finally {
      setIsFinishing(false);
    }
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
            onClick={() => { setActiveAssignment(null); setActiveWorkout(null); }}
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
                <table className="w-full text-left min-w-[420px]">
                  <thead>
                    <tr className="bg-[#111111] border-b border-[#2a2a2a]/40">
                      <th className="px-4 py-2 font-mono text-[9px] text-[#c6c9ab] uppercase w-12">Serie</th>
                      <th className="px-3 py-2 font-mono text-[9px] text-[#c6c9ab] uppercase">Peso (kg)</th>
                      <th className="px-3 py-2 font-mono text-[9px] text-[#c6c9ab] uppercase">Reps</th>
                      <th className="px-3 py-2 font-mono text-[9px] text-[#c6c9ab] uppercase">RIR</th>
                      <th className="px-4 py-2 font-mono text-[9px] text-[#c6c9ab] uppercase text-center">Hecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exSets.map((setInput, sIdx) => (
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
                        <td className="px-4 py-2 text-center">
                          <button
                            onClick={() => updateSet(exIdx, sIdx, 'done', !setInput.done)}
                            className={`w-8 h-8 rounded-lg border flex items-center justify-center mx-auto transition-all ${
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
                    ))}
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

        {/* Finish button */}
        <div className="fixed bottom-24 md:bottom-6 left-0 right-0 flex justify-center z-40 px-4">
          <button
            onClick={handleFinish}
            disabled={!canFinish || isFinishing}
            className="flex items-center gap-2 px-8 py-4 bg-[#e2ff00] text-black font-mono font-black text-sm uppercase rounded-2xl hover:bg-[#bad200] active:scale-95 transition-all disabled:opacity-40 shadow-xl shadow-[#e2ff00]/20 disabled:shadow-none"
          >
            {isFinishing ? (
              <><span className="material-symbols-outlined animate-spin">refresh</span>Guardando...</>
            ) : (
              <><span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>flag</span>Finalizar entreno</>
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
            {pendingCount > 0
              ? `${pendingCount} entrenamientos pendientes`
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
      <div className="flex bg-[#121212] border border-[#2a2a2a] p-1 rounded-lg gap-1 w-fit">
        <button
          onClick={() => setMainTab('programa')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md font-sans text-xs font-bold tracking-wider uppercase transition-all ${mainTab === 'programa' ? 'bg-[#e2ff00] text-black shadow-lg' : 'text-[#c6c9ab] hover:text-white'}`}
        >
          <span className="material-symbols-outlined text-base">event</span>
          Programa
        </button>
        <button
          onClick={() => setMainTab('progresion')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md font-sans text-xs font-bold tracking-wider uppercase transition-all ${mainTab === 'progresion' ? 'bg-[#e2ff00] text-black shadow-lg' : 'text-[#c6c9ab] hover:text-white'}`}
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
                className={`px-4 py-1.5 rounded-full font-mono text-[10px] uppercase font-bold border transition-all ${
                  listFilter === f
                    ? 'bg-[#e2ff00] border-[#e2ff00] text-black'
                    : 'border-[#2a2a2a] text-[#c6c9ab] hover:border-[#3a3a3a] hover:text-white'
                }`}
              >
                {f === 'pending' ? `Pendientes (${assignments.filter(a => a.status === 'pending').length})` :
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
          ) : filteredAssignments.length === 0 ? (
            <div className="bg-[#121212] border border-dashed border-[#2a2a2a] rounded-xl p-14 text-center">
              <span className="material-symbols-outlined text-4xl text-[#e2ff00]/30 block mb-3">fitness_center</span>
              <p className="text-white font-bold text-sm">Sin entrenamientos {listFilter === 'pending' ? 'pendientes' : listFilter === 'completed' ? 'completados' : ''}</p>
              <p className="text-[#c6c9ab] text-xs mt-1">Tu entrenador asignará sesiones próximamente.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredAssignments.map(a => {
                const wo = getWorkout(a.workoutId);
                const isToday = a.date === new Date().toISOString().split('T')[0];
                const isPast = a.date < new Date().toISOString().split('T')[0];
                return (
                  <div
                    key={a.id}
                    className={`bg-[#121212] border rounded-xl p-4 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                      isToday ? 'border-[#e2ff00]/40 shadow-md shadow-[#e2ff00]/5' : 'border-[#2a2a2a]'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${a.status === 'completed' ? 'bg-emerald-500/15' : isToday ? 'bg-[#e2ff00]/10' : 'bg-[#1a1a1a]'}`}>
                        <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>
                          {a.status === 'completed' ? 'check_circle' : isToday ? 'bolt' : 'fitness_center'}
                        </span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-sans font-bold text-white text-base">
                            {wo?.name || 'Rutina'}
                          </p>
                          {isToday && a.status === 'pending' && (
                            <span className="text-[9px] font-mono bg-[#e2ff00]/10 text-[#e2ff00] border border-[#e2ff00]/20 px-2 py-0.5 rounded uppercase font-bold">Hoy</span>
                          )}
                          {isPast && a.status === 'pending' && (
                            <span className="text-[9px] font-mono bg-red-500/10 text-red-300 border border-red-500/20 px-2 py-0.5 rounded uppercase font-bold">Atrasado</span>
                          )}
                        </div>
                        <p className="font-mono text-xs text-[#c6c9ab] mt-0.5">
                          {formatDate(a.date)} · {wo ? `${wo.exercises.length} ejercicios` : '—'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 self-end md:self-auto">
                      <span className={`text-[10px] font-mono font-bold uppercase px-2.5 py-1 rounded-full ${STATUS_STYLE[a.status]}`}>
                        {STATUS_LABEL[a.status]}
                      </span>
                      {a.status === 'pending' && wo && (
                        <button
                          onClick={() => openPlayer(a)}
                          className="flex items-center gap-1.5 px-4 py-2 bg-[#e2ff00] text-black font-mono font-bold text-xs uppercase rounded-lg hover:bg-[#bad200] active:scale-95 transition-all"
                        >
                          <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>play_circle</span>
                          Empezar
                        </button>
                      )}
                      {a.status === 'completed' && (
                        <span className="material-symbols-outlined text-emerald-400 text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>task_alt</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── PROGRESIÓN TAB ─────────────────────────────────────────────────── */}
      {mainTab === 'progresion' && (
        <div className="space-y-5">
          {loggedExercises.length === 0 ? (
            <div className="bg-[#121212] border border-dashed border-[#2a2a2a] rounded-xl p-14 text-center">
              <span className="material-symbols-outlined text-4xl text-[#e2ff00]/30 block mb-3">trending_up</span>
              <p className="text-white font-bold text-sm">Sin historial todavía</p>
              <p className="text-[#c6c9ab] text-xs mt-1">Completa tu primer entreno para ver la progresión de carga.</p>
            </div>
          ) : (
            <>
              {/* Exercise selector */}
              <div>
                <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider mb-2">Ver progresión de:</label>
                <select
                  value={histExerciseId || loggedExercises[0]?.id || ''}
                  onChange={e => setHistExerciseId(e.target.value)}
                  className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-4 py-3 text-sm text-white font-sans focus:outline-none focus:ring-1 focus:ring-[#e2ff00] cursor-pointer w-full md:w-auto"
                >
                  {loggedExercises.map(ex => (
                    <option key={ex.id} value={ex.id}>{ex.name}</option>
                  ))}
                </select>
              </div>

              {/* History table */}
              {(() => {
                const selectedId = histExerciseId || loggedExercises[0]?.id || '';
                const selectedEx = getExercise(selectedId);
                const history = getExerciseHistory(selectedId);
                return (
                  <div className="bg-[#121212] border border-[#2a2a2a] rounded-xl overflow-hidden">
                    {/* Exercise info header */}
                    <div className="flex items-center gap-3 p-4 bg-[#161616] border-b border-[#2a2a2a]/50">
                      {selectedEx?.imageUrl ? (
                        <img src={selectedEx.imageUrl} alt={selectedEx.name} className="w-10 h-10 rounded-lg object-cover border border-[#2a2a2a]" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-[#1e1e1e] border border-[#2a2a2a] flex items-center justify-center">
                          <span className="material-symbols-outlined text-base text-[#c6c9ab]">fitness_center</span>
                        </div>
                      )}
                      <div>
                        <p className="font-sans font-bold text-white">{selectedEx?.name}</p>
                        <p className="font-mono text-[10px] text-[#c6c9ab] capitalize">{selectedEx?.primaryFocus} · {history.length} sesiones registradas</p>
                      </div>
                    </div>

                    {history.length === 0 ? (
                      <p className="p-6 text-center text-xs text-[#c6c9ab] font-mono">Sin datos para este ejercicio.</p>
                    ) : (
                      <>
                        {/* Max weight trend */}
                        {history.length >= 2 && (
                          <div className="px-4 pt-4 pb-2 flex items-center gap-2">
                            {(() => {
                              const first = history[0].maxWeight;
                              const last = history[history.length - 1].maxWeight;
                              const diff = last - first;
                              return (
                                <div className={`flex items-center gap-1.5 text-sm font-mono font-bold ${diff >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                  <span className="material-symbols-outlined text-base">{diff >= 0 ? 'trending_up' : 'trending_down'}</span>
                                  {diff >= 0 ? '+' : ''}{diff.toFixed(1)} kg desde el inicio
                                </div>
                              );
                            })()}
                          </div>
                        )}

                        <div className="overflow-x-auto">
                          <table className="w-full text-left min-w-[500px]">
                            <thead>
                              <tr className="bg-[#111111] border-b border-[#2a2a2a]/40">
                                <th className="px-4 py-2.5 font-mono text-[9px] text-[#c6c9ab] uppercase">Fecha</th>
                                <th className="px-3 py-2.5 font-mono text-[9px] text-[#c6c9ab] uppercase">Rutina</th>
                                <th className="px-3 py-2.5 font-mono text-[9px] text-[#c6c9ab] uppercase">Peso máx.</th>
                                <th className="px-3 py-2.5 font-mono text-[9px] text-[#c6c9ab] uppercase">Reps total</th>
                                <th className="px-4 py-2.5 font-mono text-[9px] text-[#c6c9ab] uppercase">Series</th>
                              </tr>
                            </thead>
                            <tbody>
                              {history.map((entry, i) => {
                                const prevMax = i > 0 ? history[i - 1].maxWeight : null;
                                const isImprovement = prevMax !== null && entry.maxWeight > prevMax;
                                return (
                                  <tr key={i} className="border-b border-[#2a2a2a]/20 hover:bg-[#1a1a1a] transition-colors">
                                    <td className="px-4 py-3 font-mono text-xs text-[#c6c9ab]">{formatDate(entry.date)}</td>
                                    <td className="px-3 py-3 font-sans text-xs text-white truncate max-w-[120px]">{entry.workoutName}</td>
                                    <td className="px-3 py-3">
                                      <span className={`font-mono text-sm font-bold ${isImprovement ? 'text-emerald-400' : 'text-white'}`}>
                                        {entry.maxWeight > 0 ? `${entry.maxWeight} kg` : '—'}
                                      </span>
                                      {isImprovement && (
                                        <span className="ml-1 text-[9px] text-emerald-400 font-mono">↑{(entry.maxWeight - prevMax!).toFixed(1)}</span>
                                      )}
                                    </td>
                                    <td className="px-3 py-3 font-mono text-xs text-[#c6c9ab]">{entry.totalReps}</td>
                                    <td className="px-4 py-3">
                                      <div className="flex flex-wrap gap-1">
                                        {entry.sets.map((s, si) => (
                                          <span key={si} className="font-mono text-[9px] bg-[#1e1e1e] border border-[#2a2a2a] px-1.5 py-0.5 rounded text-[#c6c9ab]">
                                            {s.weight}×{s.repsDone}
                                          </span>
                                        ))}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </div>
                );
              })()}
            </>
          )}
        </div>
      )}
    </div>
  );
}
