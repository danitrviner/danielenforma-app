import React, { useState, useEffect } from 'react';
import { UserProfile, WeightCheckIn, Workout, WorkoutAssignment, WorkoutLog, Exercise } from '../types';
import { getAllUserProfiles, submitCoachFeedback, getWorkouts, getWorkoutAssignments, createWorkoutAssignment, deleteWorkoutAssignment, getWorkoutLogs, getExercises, seedExercisesIfEmpty } from '../dbService';

interface ClientsScreenProps {
  checkins: WeightCheckIn[];
  onRefreshCheckIns: () => void;
}

export default function ClientsScreen({ checkins, onRefreshCheckIns }: ClientsScreenProps) {
  const [athletes, setAthletes] = useState<UserProfile[]>([]);
  const [loadingAthletes, setLoadingAthletes] = useState(true);
  const [selectedAthlete, setSelectedAthlete] = useState<UserProfile | null>(null);
  const [selectedView, setSelectedView] = useState<'front' | 'side' | 'back'>('front');
  const [activeCheckInId, setActiveCheckInId] = useState<string>('');
  const [feedbackText, setFeedbackText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Assignment state
  const [assignments, setAssignments] = useState<WorkoutAssignment[]>([]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignWorkoutId, setAssignWorkoutId] = useState('');
  const [assignDate, setAssignDate] = useState(new Date().toISOString().split('T')[0]);
  const [isAssigning, setIsAssigning] = useState(false);

  // Workout logs + exercises for history
  const [athleteLogs, setAthleteLogs] = useState<WorkoutLog[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [histExerciseId, setHistExerciseId] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  const pendingCheckins = checkins.filter(c => !c.approved || !c.coachFeedback);

  useEffect(() => {
    async function fetchAthletes() {
      try {
        const list = await getAllUserProfiles();
        setAthletes(list);
      } catch (err) {
        console.error('Error fetching athletes:', err);
      } finally {
        setLoadingAthletes(false);
      }
    }
    fetchAthletes();
  }, [checkins]);

  const handleSelectAthlete = (athlete: UserProfile) => {
    setSelectedAthlete(athlete);
    setAssignments([]);
    const athleteChecks = checkins.filter(
      c => c.userId === athlete.userId || c.email.toLowerCase() === athlete.email.toLowerCase()
    );
    if (athleteChecks.length > 0) {
      setActiveCheckInId(athleteChecks[0].id);
      setFeedbackText(athleteChecks[0].coachFeedback || '');
    } else {
      setActiveCheckInId('');
      setFeedbackText('');
    }
    setErrorMsg('');
    setSuccessMsg('');
  };

  // Load assignments, logs, workouts and exercises whenever an athlete is selected
  useEffect(() => {
    if (!selectedAthlete) return;
    setAssignments([]);
    setAthleteLogs([]);
    setHistExerciseId('');
    setShowHistory(false);
    getWorkoutAssignments(selectedAthlete.userId).then(setAssignments).catch(console.error);
    getWorkoutLogs(selectedAthlete.userId).then(setAthleteLogs).catch(console.error);
    if (workouts.length === 0) getWorkouts().then(setWorkouts).catch(console.error);
    if (exercises.length === 0) {
      (async () => {
        await seedExercisesIfEmpty();
        getExercises().then(setExercises).catch(console.error);
      })();
    }
  }, [selectedAthlete]);

  const handleSelectCheckIn = (id: string, initialFeedback: string) => {
    setActiveCheckInId(id);
    setFeedbackText(initialFeedback || '');
    setErrorMsg('');
    setSuccessMsg('');
  };

  const handleSendFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCheckInId) { setErrorMsg('No hay ningún check-in seleccionado.'); return; }
    if (!feedbackText.trim()) { setErrorMsg('Por favor ingresa una directriz para el atleta.'); return; }
    setErrorMsg('');
    setSuccessMsg('');
    setIsSubmitting(true);
    try {
      await submitCoachFeedback(activeCheckInId, feedbackText);
      setSuccessMsg('¡Directiva enviada con éxito!');
      onRefreshCheckIns();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: any) {
      console.error(err);
      setErrorMsg('Fallo en la comunicación con la base de datos.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Weekly compliance (real data) ──────────────────────────────────────────
  const getWeekRange = () => {
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
  };

  const { start: weekStart, end: weekEnd } = getWeekRange();
  const weekAssignments = assignments.filter(a => a.date >= weekStart && a.date <= weekEnd);
  const weekCompleted = weekAssignments.filter(a => a.status === 'completed').length;
  const weekTotal = weekAssignments.length;
  const weekPct = weekTotal > 0 ? Math.round((weekCompleted / weekTotal) * 100) : 0;

  // ── Exercise history helpers ────────────────────────────────────────────────
  const getExercise = (id: string) => exercises.find(e => e.id === id);
  const getWorkout = (id: string) => workouts.find(w => w.id === id);

  const loggedExerciseIds = Array.from(new Set<string>(athleteLogs.flatMap(l => l.entries.map(e => e.exerciseId))));
  const loggedExercises = loggedExerciseIds.map(id => getExercise(id)).filter(Boolean) as Exercise[];

  const getExerciseHistory = (exerciseId: string) =>
    athleteLogs
      .filter(log => log.entries.some(e => e.exerciseId === exerciseId))
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(log => {
        const entry = log.entries.find(e => e.exerciseId === exerciseId)!;
        const maxWeight = Math.max(...entry.sets.map(s => s.weight), 0);
        const totalReps = entry.sets.reduce((acc, s) => acc + s.repsDone, 0);
        return { date: log.date, workoutName: getWorkout(log.workoutId)?.name || '—', sets: entry.sets, maxWeight, totalReps };
      });

  function formatDate(dateStr: string) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    return `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}`;
  }

  const handleCreateAssignment = async () => {
    if (!selectedAthlete || !assignWorkoutId || !assignDate) return;
    setIsAssigning(true);
    try {
      const newA = await createWorkoutAssignment({
        workoutId: assignWorkoutId,
        athleteId: selectedAthlete.userId,
        date: assignDate,
        status: 'pending',
      });
      setAssignments(prev => [...prev, newA].sort((a, b) => a.date.localeCompare(b.date)));
      setShowAssignModal(false);
      setAssignWorkoutId('');
    } catch (err) {
      console.error(err);
    } finally {
      setIsAssigning(false);
    }
  };

  const handleDeleteAssignment = async (id: string) => {
    try {
      await deleteWorkoutAssignment(id);
      setAssignments(prev => prev.filter(a => a.id !== id));
    } catch (err) {
      console.error(err);
    }
  };

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

  const currentAthleteCheckins = selectedAthlete
    ? checkins.filter(c => c.userId === selectedAthlete.userId || c.email.toLowerCase() === selectedAthlete.email.toLowerCase())
    : [];

  const activeCheckIn = activeCheckInId
    ? checkins.find(c => c.id === activeCheckInId)
    : currentAthleteCheckins[0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-end justify-between pb-4 border-b border-[#2a2a2a]/60 gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded bg-[#201f1f] text-[10px] font-mono border border-[#e2ff00]/30 text-[#e2ff00] font-bold uppercase tracking-wider">
              Consola de Entrenador
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs font-mono text-[#00eefc]">
              <span className="w-2 h-2 rounded-full bg-[#00eefc] animate-pulse"></span>
              Sincronizado
            </span>
          </div>
          {selectedAthlete ? (
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSelectedAthlete(null)}
                className="p-1 px-3 bg-[#1c1b1b] hover:bg-[#2c2b2b] text-[#e2ff00] border border-[#2a2a2a] text-xs font-mono rounded flex items-center gap-1 active:scale-95 transition-all"
              >
                <span className="material-symbols-outlined text-sm">arrow_back</span>
                Volver
              </button>
              <h1 className="font-sans font-extrabold text-2xl tracking-tight text-white">
                Auditoría: <span className="text-[#e2ff00]">{selectedAthlete.displayName}</span>
              </h1>
            </div>
          ) : (
            <h1 className="font-sans font-black text-3xl tracking-tight text-white uppercase">Clientes</h1>
          )}
        </div>
      </header>

      {successMsg && (
        <div className="bg-[#e2ff00]/15 border border-[#e2ff00]/30 text-white p-4 rounded-xl text-sm flex items-center gap-2">
          <span className="material-symbols-outlined text-[#e2ff00]">check_circle</span>
          <p>{successMsg}</p>
        </div>
      )}
      {errorMsg && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-200 p-4 rounded-xl text-xs font-mono">{errorMsg}</div>
      )}

      {/* Summary cards — landing */}
      {!selectedAthlete && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pb-2">
          <div className="lg:col-span-5 bg-gradient-to-br from-[#121414] to-[#121212] border border-[#2a2a2a] p-5 rounded-2xl relative overflow-hidden flex flex-col justify-between shadow-lg">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#e2ff00]/5 rounded-bl-full pointer-events-none" />
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#e2ff00] text-xl">group</span>
                  <h2 className="font-sans font-extrabold text-[#c6c9ab] text-xs uppercase tracking-wider">Atletas del Entrenador</h2>
                </div>
                <span className="text-[10px] bg-teal-500/15 text-[#00eefc] px-2 py-0.5 border border-teal-500/20 rounded font-mono font-bold uppercase">Activos</span>
              </div>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="font-sans font-black text-5xl text-white tracking-tight">{athletes.length}</span>
                <span className="text-xs text-[#c6c9ab] font-sans pb-1">deportistas registrados</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-6 pt-4 border-t border-[#2a2a2a]/60">
              <div className="bg-[#1b1c1c]/50 p-2.5 rounded-xl border border-[#2a2a2a]/40 text-center font-mono">
                <span className="block text-[8px] text-[#c6c9ab] uppercase">Racha Promedio</span>
                <span className="block text-sm font-black text-[#e2ff00] mt-0.5">
                  {athletes.length > 0 ? Math.round(athletes.reduce((acc, curr) => acc + (curr.currentStreak || 0), 0) / athletes.length) : 0} sem
                </span>
              </div>
              <div className="bg-[#1b1c1c]/50 p-2.5 rounded-xl border border-[#2a2a2a]/40 text-center font-mono">
                <span className="block text-[8px] text-[#00eefc] uppercase">Nivel Medio</span>
                <span className="block text-sm font-black text-white mt-0.5">
                  Lvl {athletes.length > 0 ? (athletes.reduce((acc, curr) => acc + (curr.level || 0), 0) / athletes.length).toFixed(1) : '1.0'}
                </span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-7 bg-[#121212] border border-[#2a2a2a] p-5 rounded-2xl flex flex-col justify-between shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#00eefc] text-xl">pending_actions</span>
                <h2 className="font-sans font-extrabold text-[#c6c9ab] text-xs uppercase tracking-wider">Revisiones Pendientes</h2>
              </div>
              {pendingCheckins.length > 0 ? (
                <span className="text-[10px] bg-red-500/10 text-rose-400 px-2.5 py-0.5 border border-red-500/25 rounded font-mono uppercase font-black animate-pulse">
                  {pendingCheckins.length} por evaluar
                </span>
              ) : (
                <span className="text-[10px] bg-[#e2ff00]/10 text-[#e2ff00] px-2.5 py-0.5 border border-[#e2ff00]/20 rounded font-mono uppercase font-bold">Al día</span>
              )}
            </div>
            {pendingCheckins.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center text-[#c6c9ab]">
                <span className="material-symbols-outlined text-3xl text-[#e2ff00] mb-2">verified_user</span>
                <p className="text-xs font-bold text-white">¡Sin revisiones pendientes!</p>
              </div>
            ) : (
              <p className="text-sm text-[#c6c9ab] font-mono">
                Ve a <strong className="text-[#e2ff00]">Revisiones</strong> para evaluar los {pendingCheckins.length} check-ins pendientes.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Athletes list */}
      {!selectedAthlete && (
        <div className="space-y-4">
          <div className="bg-[#121212] border border-[#2a2a2a] p-4 rounded-xl flex items-center justify-between">
            <p className="text-xs text-[#c6c9ab] font-sans">Selecciona un atleta para ver su auditoría completa.</p>
            <span className="text-[10px] bg-teal-500/10 text-teal-300 px-3 py-1 border border-teal-500/20 rounded font-mono uppercase">
              {athletes.length} ATLETAS
            </span>
          </div>
          {loadingAthletes ? (
            <div className="text-center py-12 text-[#c6c9ab] font-mono tracking-widest uppercase text-xs animate-pulse">Cargando atletas...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {athletes.map((athlete) => {
                const totalCheckCount = checkins.filter(
                  c => c.userId === athlete.userId || c.email.toLowerCase() === athlete.email.toLowerCase()
                ).length;
                return (
                  <div
                    key={athlete.userId}
                    onClick={() => handleSelectAthlete(athlete)}
                    className="bg-[#131313] border border-[#2a2a2a] rounded-xl p-5 hover:border-[#e2ff00]/50 hover:shadow-[0_4px_20px_rgba(226,255,0,0.05)] cursor-pointer transition-all flex flex-col justify-between group relative overflow-hidden"
                  >
                    <div className="absolute right-0 top-0 w-16 h-16 bg-gradient-to-tr from-transparent to-[#e2ff00]/5 rounded-bl-full pointer-events-none" />
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-[#2a2a2a] group-hover:border-[#e2ff00]/60 transition-all">
                          <img src={athlete.avatarUrl} alt={athlete.displayName} className="w-full h-full object-cover" />
                        </div>
                        <div>
                          <h3 className="font-sans font-bold text-white text-base leading-snug group-hover:text-[#e2ff00] transition-colors">{athlete.displayName}</h3>
                          <p className="font-mono text-[10px] text-[#c6c9ab] truncate max-w-[200px]">{athlete.email}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 bg-[#1b1c1c]/50 p-2.5 rounded-lg border border-[#2a2a2a]/40 text-center font-mono">
                        <div>
                          <span className="block text-[8px] text-[#c6c9ab] uppercase">INICIAL</span>
                          <span className="block text-xs font-bold text-white">{athlete.initialWeight} kg</span>
                        </div>
                        <div>
                          <span className="block text-[8px] text-[#e2ff00] uppercase font-bold">ACTUAL</span>
                          <span className="block text-xs font-bold text-[#e2ff00]">{athlete.actualWeight || athlete.initialWeight} kg</span>
                        </div>
                        <div>
                          <span className="block text-[8px] text-[#00eefc] uppercase">META</span>
                          <span className="block text-xs font-bold text-[#00eefc]">{athlete.targetWeight} kg</span>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex justify-between font-mono text-[10px]">
                          <span className="text-[#c6c9ab] uppercase flex items-center gap-1">
                            <span className="material-symbols-outlined text-[12px] text-orange-400">local_fire_department</span> Racha
                          </span>
                          <strong className="text-white">{athlete.currentStreak || 0} sem</strong>
                        </div>
                        <div className="flex justify-between font-mono text-[10px]">
                          <span className="text-[#c6c9ab] uppercase flex items-center gap-1">
                            <span className="material-symbols-outlined text-[12px] text-teal-400">military_tech</span> Nivel
                          </span>
                          <strong className="text-[#00eefc]">Lvl {athlete.level || 1}</strong>
                        </div>
                      </div>
                    </div>
                    <div className="mt-5 pt-3.5 border-t border-[#2a2a2a]/60 flex items-center justify-between text-xs font-mono">
                      <span className="text-[#c6c9ab]">{totalCheckCount} Reportes</span>
                      <span className="text-[#e2ff00] flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                        <span>Ver Auditoría</span>
                        <span className="material-symbols-outlined text-[10px]">arrow_forward</span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Athlete audit view */}
      {selectedAthlete && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* LEFT: stats + history + compliance */}
          <section className="lg:col-span-4 flex flex-col gap-6">
            <div className="bg-[#121212] border border-[#2a2a2a] rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-4 border-b border-[#2a2a2a] pb-3">
                <div className="w-14 h-14 rounded-full overflow-hidden border border-[#e2ff00]/25">
                  <img src={selectedAthlete.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                </div>
                <div>
                  <h3 className="font-sans font-bold text-white text-lg">{selectedAthlete.displayName}</h3>
                  <span className="font-mono text-xs text-[#00eefc]">Meta: {selectedAthlete.targetWeight} kg</span>
                </div>
              </div>
              <div className="space-y-3 pt-1">
                <div className="flex justify-between items-baseline text-xs font-mono">
                  <span className="text-[#c6c9ab] uppercase">Correo:</span>
                  <span className="text-white font-bold">{selectedAthlete.email}</span>
                </div>
                <div className="flex justify-between items-baseline text-xs font-mono">
                  <span className="text-[#c6c9ab] uppercase">Racha:</span>
                  <span className="text-orange-400 font-bold">{selectedAthlete.currentStreak || 4} Semanas</span>
                </div>
                <div className="flex justify-between items-baseline text-xs font-mono">
                  <span className="text-[#c6c9ab] uppercase">Nivel:</span>
                  <span className="text-[#00eefc] font-bold">Nivel {selectedAthlete.level || 5}</span>
                </div>
                <div className="flex justify-between items-baseline text-xs font-mono">
                  <span className="text-[#c6c9ab] uppercase">XP:</span>
                  <span className="text-slate-300 font-bold">{selectedAthlete.xp || 320} / 400</span>
                </div>
              </div>
            </div>

            <div className="bg-[#121212] border border-[#2a2a2a] rounded-xl p-5 flex-1 space-y-4">
              <h3 className="font-sans font-bold text-sm text-white flex items-center gap-2 border-b border-[#2a2a2a] pb-2 uppercase tracking-wide">
                <span className="material-symbols-outlined text-[#00eefc] text-sm">history_edu</span>
                Historial Progresivo
              </h3>
              {currentAthleteCheckins.length === 0 ? (
                <p className="text-xs text-[#c6c9ab] font-mono text-center py-4">Sin pesajes registrados.</p>
              ) : (
                <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1 hide-scrollbar">
                  {currentAthleteCheckins.map((check) => (
                    <div
                      key={check.id}
                      onClick={() => handleSelectCheckIn(check.id, check.coachFeedback || '')}
                      className={`p-3 rounded-lg border cursor-pointer transition-all ${activeCheckInId === check.id ? 'bg-[#1e1e1a] border-[#e2ff00] text-white' : 'bg-[#131313] border-[#2a2a2a] hover:border-slate-500 text-slate-300'}`}
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-mono text-xs font-bold">{check.dateStr}</span>
                        <span className={`text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded ${check.approved ? 'bg-[#e2ff00]/10 text-[#e2ff00]' : 'bg-red-500/10 text-red-300'}`}>
                          {check.approved ? 'Evaluado' : 'Pendiente'}
                        </span>
                      </div>
                      <div className="flex gap-4 mt-2 text-xs font-mono">
                        <span>Peso: <strong className="text-white">{check.weight} kg</strong></span>
                        <span>Cumple: <strong className="text-white">{check.adherence}</strong></span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-[#121212] border border-[#2a2a2a] rounded-xl p-5 space-y-4">
              <h3 className="font-sans font-bold text-sm text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-[#00eefc] text-sm">assignment_turned_in</span>
                Cumplimiento Semanal
              </h3>
              <div className="space-y-3 text-xs">
                <div>
                  <div className="flex justify-between mb-1.5 font-mono text-[10px]">
                    <span className="text-[#c6c9ab] uppercase">Entrenamientos</span>
                    <span className="text-white">{weekCompleted} / {weekTotal > 0 ? weekTotal : '—'}</span>
                  </div>
                  <div className="h-1.5 w-full bg-[#1c1b1b] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#00eefc] rounded-full shadow-[0_0_6px_rgba(0,238,252,0.3)] transition-all"
                      style={{ width: weekTotal > 0 ? `${weekPct}%` : '0%' }}
                    />
                  </div>
                  {weekTotal === 0 && (
                    <p className="font-mono text-[9px] text-[#c6c9ab] mt-1">Sin entrenamientos programados esta semana</p>
                  )}
                </div>
                <div>
                  <div className="flex justify-between mb-1.5 font-mono text-[10px]">
                    <span className="text-[#c6c9ab] uppercase">Adherencia Macros</span>
                    <span className="text-[#c6c9ab]">—</span>
                  </div>
                  <div className="h-1.5 w-full bg-[#1c1b1b] rounded-full overflow-hidden">
                    <div className="h-full bg-[#e2ff00] w-0 rounded-full" />
                  </div>
                  <p className="font-mono text-[9px] text-[#c6c9ab] mt-1">Datos de nutrición próximamente</p>
                </div>
              </div>
            </div>
          </section>

          {/* RIGHT: photos + check-in detail + feedback */}
          <section className="lg:col-span-8 flex flex-col gap-6">
            <div className="bg-[#121212] border border-[#2a2a2a] rounded-xl overflow-hidden">
              <div className="p-4 border-b border-[#2a2a2a] flex items-center justify-between bg-[#1c1b1b]">
                <h3 className="font-sans font-bold text-sm text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#e2ff00] text-sm">photo_camera</span>
                  Historial Fotográfico
                </h3>
                <div className="flex bg-[#2a2a2a] rounded p-0.5">
                  {(['front', 'side', 'back'] as const).map((view) => (
                    <button
                      key={view}
                      type="button"
                      onClick={() => setSelectedView(view)}
                      className={`px-3 py-1 rounded font-mono text-[9px] font-bold uppercase transition-all tracking-wider ${selectedView === view ? 'bg-[#e2ff00] text-black shadow-md' : 'text-[#c6c9ab] hover:text-white'}`}
                    >
                      {view}
                    </button>
                  ))}
                </div>
              </div>
              <div className="p-3 grid grid-cols-2 gap-3 bg-[#131313]/90">
                <div className="relative rounded-lg overflow-hidden border border-[#2a2a2a] group">
                  <div className="absolute top-2 left-2 z-10 bg-black/75 backdrop-blur-sm border border-[#2a2a2a] px-2.5 py-0.5 rounded text-white font-mono text-[10px]">
                    Baseline (S1)
                  </div>
                  <img
                    className="w-full h-[280px] object-cover object-top filter grayscale-[15%] group-hover:filter-none transition-all duration-500"
                    src="https://lh3.googleusercontent.com/aida-public/AB6AXuCembU5PDvcRsGK_NeKUJUjJ0C4iyB3TjRmqUz0ICDMLKno0GJG-vc6PkXBlOrZ6lKLe3_xQQX74ev4M4oXWnNXlB0-ywA94vvgxgRj0uTEcOAsPm4hQeXwpQgvp7pFs-hIspYO7w2uAv_2BMTBzWgMhdFYZAeTT8psKgvECQnecZG6tI5dLcVbej4gJX2t2-Cf3PppEFrMnKOoj0JIRWfHpvrvTRbHBHVoe-0Sbfo9drSiGRy2sQSJn1e5svDWXPBW1bjjQD1Wn5ab"
                    alt="Baseline"
                  />
                </div>
                <div className="relative rounded-lg overflow-hidden border border-[#e2ff00]/20 group">
                  <div className="absolute top-2 left-2 z-10 bg-[#e2ff00] text-black px-2.5 py-0.5 rounded font-mono text-[10px] font-black shadow-md">
                    Actual
                  </div>
                  <img
                    className="w-full h-[280px] object-cover object-top group-hover:scale-105 transition-all duration-500"
                    src="https://lh3.googleusercontent.com/aida-public/AB6AXuBmPlIy5pwqq-9j9RusW6cmHeHZEEQCHOULf9mpDx67LB56kmapDKD4S6TX3sOc9zBv0KA_ZokJ3EBqlHlchw3jc9tuNK_2oQm--a46HeMBvL5MgQjJaMSXyTaEW3mW1kZ_aVbNcYPoFGdpJJfWOnLh6zlA4h7aC_0MAVCUviar-P2_qSt-pRsnwPylJ1JUSnuQ7NpVeChalKhgi-mraO1P10CiJfVQ5tOMrmzvL8M_-V6NnKWTimdZA-nDXcUYt5CoJMjyLKSghHuL"
                    alt="Actual"
                  />
                </div>
              </div>
            </div>

            {activeCheckIn ? (
              <div className="bg-[#121212] border border-[#2a2a2a] rounded-xl p-5 space-y-4">
                <div className="flex justify-between items-center border-b border-[#2a2a2a] pb-3">
                  <h4 className="font-sans font-bold text-sm text-[#00eefc] flex items-center gap-2 uppercase tracking-wide">
                    <span className="material-symbols-outlined text-sm">folder_open</span>
                    Entrada: {activeCheckIn.dateStr}
                  </h4>
                  <span className="text-xs font-mono text-[#c6c9ab]">{new Date(activeCheckIn.timestamp).toLocaleDateString()}</span>
                </div>
                <div className="grid grid-cols-3 gap-4 font-mono text-xs">
                  <div className="bg-[#191919] p-3 rounded-lg border border-[#2a2a2a]/40">
                    <span className="block text-[#c6c9ab] text-[9px] uppercase">Peso</span>
                    <strong className="text-white text-base">{activeCheckIn.weight} kg</strong>
                  </div>
                  <div className="bg-[#191919] p-3 rounded-lg border border-[#2a2a2a]/40">
                    <span className="block text-[#c6c9ab] text-[9px] uppercase">Adherencia</span>
                    <strong className="text-base text-[#e2ff00]">{activeCheckIn.adherence}</strong>
                  </div>
                  <div className="bg-[#191919] p-3 rounded-lg border border-[#2a2a2a]/40">
                    <span className="block text-[#c6c9ab] text-[9px] uppercase">Humor</span>
                    <strong className="text-base text-white">{activeCheckIn.mood || '😊'}</strong>
                  </div>
                </div>
                <div className="bg-[#181818]/60 p-3.5 rounded-lg border border-[#2a2a2a]/30">
                  <span className="block font-mono text-[9px] text-[#c6c9ab] uppercase mb-1">Notas del deportista</span>
                  <p className="text-xs text-slate-300 font-sans italic">"{activeCheckIn.notes || 'Sin notas adicionales.'}"</p>
                </div>
              </div>
            ) : (
              <div className="bg-[#121212] border border-dashed border-[#2a2a2a] p-8 text-center rounded-xl text-xs text-[#c6c9ab]">
                Selecciona una entrada del historial para inspeccionar.
              </div>
            )}

            <form onSubmit={handleSendFeedback} className="bg-[#121212] border border-[#2a2a2a] p-5 rounded-xl space-y-4 relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#e2ff00]" />
              <div className="flex justify-between items-center">
                <h3 className="font-sans font-bold text-sm text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#e2ff00] text-sm">rate_review</span>
                  Directriz &amp; Devolución
                </h3>
                {activeCheckIn?.approved && (
                  <span className="bg-[#e2ff00]/10 text-[#e2ff00] font-mono text-[9px] font-black uppercase px-2 py-0.5 rounded border border-[#e2ff00]/25">
                    Evaluado
                  </span>
                )}
              </div>
              <textarea
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder="Ajustes nutricionales, indicaciones de cargas, observaciones motivacionales..."
                className="w-full bg-[#1c1b1b] border border-[#2a2a2a]/60 rounded p-3 text-sm text-white focus:ring-1 focus:ring-[#e2ff00] focus:border-[#e2ff00] focus:outline-none min-h-[110px] resize-none placeholder-slate-600 font-sans"
              />
              <div className="flex items-center justify-between gap-4 flex-col md:flex-row pt-1">
                <span className="text-[10px] font-mono text-[#c6c9ab] leading-snug">
                  La directriz se refleja de inmediato en el panel del deportista.
                </span>
                <button
                  type="submit"
                  disabled={isSubmitting || !activeCheckIn}
                  className="h-[40px] px-6 bg-[#e2ff00] hover:bg-[#bad200] text-black font-mono font-bold text-xs uppercase rounded flex items-center justify-center gap-2 shadow-[0_0_12px_rgba(226,255,0,0.25)] active:scale-95 transition-all disabled:opacity-50 disabled:pointer-events-none"
                >
                  {isSubmitting ? 'Guardando...' : 'Enviar y Aprobar'}
                  <span className="material-symbols-outlined text-sm">send</span>
                </button>
              </div>
            </form>
            {/* ── EXERCISE LOAD HISTORY ───────────────────────────────── */}
            <div className="bg-[#121212] border border-[#2a2a2a] rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-sans font-bold text-sm text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#00eefc] text-sm">trending_up</span>
                  Historial de Carga
                </h3>
                {loggedExercises.length > 0 && (
                  <button
                    onClick={() => setShowHistory(h => !h)}
                    className="text-[#c6c9ab] hover:text-white font-mono text-[10px] uppercase flex items-center gap-1 transition-colors"
                  >
                    <span className="material-symbols-outlined text-sm">{showHistory ? 'expand_less' : 'expand_more'}</span>
                    {showHistory ? 'Ocultar' : 'Mostrar'}
                  </button>
                )}
              </div>

              {loggedExercises.length === 0 ? (
                <p className="text-xs text-[#c6c9ab] font-mono text-center py-3">Sin entrenos registrados todavía.</p>
              ) : showHistory && (
                <div className="space-y-3">
                  <div>
                    <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase mb-1.5">Ejercicio:</label>
                    <select
                      value={histExerciseId || loggedExercises[0]?.id || ''}
                      onChange={e => setHistExerciseId(e.target.value)}
                      className="w-full bg-[#0e0e0e] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#00eefc] cursor-pointer"
                    >
                      {loggedExercises.map(ex => (
                        <option key={ex.id} value={ex.id}>{ex.name}</option>
                      ))}
                    </select>
                  </div>

                  {(() => {
                    const selectedId = histExerciseId || loggedExercises[0]?.id || '';
                    const history = getExerciseHistory(selectedId);
                    if (history.length === 0) return <p className="text-xs text-[#c6c9ab] font-mono">Sin datos.</p>;
                    return (
                      <div className="overflow-x-auto rounded-lg border border-[#2a2a2a]/50">
                        <table className="w-full text-left min-w-[380px]">
                          <thead>
                            <tr className="bg-[#111111] border-b border-[#2a2a2a]/40">
                              <th className="px-3 py-2 font-mono text-[9px] text-[#c6c9ab] uppercase">Fecha</th>
                              <th className="px-3 py-2 font-mono text-[9px] text-[#c6c9ab] uppercase">Peso máx.</th>
                              <th className="px-3 py-2 font-mono text-[9px] text-[#c6c9ab] uppercase">Reps</th>
                              <th className="px-3 py-2 font-mono text-[9px] text-[#c6c9ab] uppercase">Series</th>
                            </tr>
                          </thead>
                          <tbody>
                            {history.map((entry, i) => {
                              const prevMax = i > 0 ? history[i - 1].maxWeight : null;
                              const improved = prevMax !== null && entry.maxWeight > prevMax;
                              return (
                                <tr key={i} className="border-b border-[#2a2a2a]/20 hover:bg-[#1a1a1a]">
                                  <td className="px-3 py-2.5 font-mono text-[11px] text-[#c6c9ab]">{formatDate(entry.date)}</td>
                                  <td className="px-3 py-2.5">
                                    <span className={`font-mono text-sm font-bold ${improved ? 'text-emerald-400' : 'text-white'}`}>
                                      {entry.maxWeight > 0 ? `${entry.maxWeight} kg` : '—'}
                                    </span>
                                    {improved && <span className="ml-1 font-mono text-[9px] text-emerald-400">↑</span>}
                                  </td>
                                  <td className="px-3 py-2.5 font-mono text-[11px] text-[#c6c9ab]">{entry.totalReps}</td>
                                  <td className="px-3 py-2.5">
                                    <div className="flex flex-wrap gap-1">
                                      {entry.sets.slice(0, 4).map((s, si) => (
                                        <span key={si} className="font-mono text-[9px] bg-[#1e1e1e] border border-[#2a2a2a] px-1.5 py-0.5 rounded text-[#c6c9ab]">
                                          {s.weight}×{s.repsDone}
                                        </span>
                                      ))}
                                      {entry.sets.length > 4 && <span className="font-mono text-[9px] text-[#c6c9ab]">+{entry.sets.length - 4}</span>}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* ── WORKOUT ASSIGNMENTS ─────────────────────────────────── */}
            <div className="bg-[#121212] border border-[#2a2a2a] rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-sans font-bold text-sm text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#e2ff00] text-sm">fitness_center</span>
                  Entrenamientos asignados
                </h3>
                <button
                  onClick={() => {
                    setAssignWorkoutId(workouts[0]?.id || '');
                    setAssignDate(new Date().toISOString().split('T')[0]);
                    setShowAssignModal(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#e2ff00]/10 border border-[#e2ff00]/30 text-[#e2ff00] hover:bg-[#e2ff00]/20 font-mono text-[10px] uppercase rounded-lg transition-all"
                >
                  <span className="material-symbols-outlined text-sm">add</span>
                  Asignar entrenamiento
                </button>
              </div>

              {assignments.length === 0 ? (
                <div className="py-6 text-center">
                  <span className="material-symbols-outlined text-2xl text-[#2a2a2a] block mb-2">calendar_today</span>
                  <p className="text-xs text-[#c6c9ab]">Sin entrenamientos asignados todavía.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {assignments.sort((a, b) => a.date.localeCompare(b.date)).map(a => {
                    const wo = workouts.find(w => w.id === a.workoutId);
                    return (
                      <div key={a.id} className="flex items-center justify-between gap-3 p-3 bg-[#171717] border border-[#2a2a2a]/50 rounded-lg">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="material-symbols-outlined text-base text-[#c6c9ab] flex-shrink-0">event</span>
                          <div className="min-w-0">
                            <p className="font-sans font-bold text-sm text-white truncate">
                              {wo?.name || <span className="italic text-[#c6c9ab]">Rutina eliminada</span>}
                            </p>
                            <p className="font-mono text-[10px] text-[#c6c9ab]">{a.date} · {wo ? `${wo.exercises.length} ejercicios` : ''}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className={`text-[9px] font-mono font-bold uppercase px-2 py-0.5 rounded ${STATUS_STYLE[a.status]}`}>
                            {STATUS_LABEL[a.status]}
                          </span>
                          <button
                            onClick={() => handleDeleteAssignment(a.id)}
                            className="text-[#c6c9ab] hover:text-red-400 p-1 rounded transition-colors"
                            title="Eliminar asignación"
                          >
                            <span className="material-symbols-outlined text-sm">delete</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {/* ── ASSIGN MODAL ────────────────────────────────────────────────── */}
      {showAssignModal && selectedAthlete && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#191919] border border-[#2a2a2a] rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-sans font-black text-xl text-white uppercase tracking-tight">Asignar entrenamiento</h2>
              <button onClick={() => setShowAssignModal(false)} className="text-[#c6c9ab] hover:text-white transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <p className="text-xs text-[#c6c9ab] font-mono flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm text-[#e2ff00]">person</span>
              Atleta: <strong className="text-white">{selectedAthlete.displayName}</strong>
            </p>

            <div>
              <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider mb-1.5">Rutina *</label>
              {workouts.length === 0 ? (
                <p className="text-xs text-[#c6c9ab] font-mono italic">No hay rutinas disponibles. Crea una primero en la pestaña Entrenamiento.</p>
              ) : (
                <select
                  value={assignWorkoutId}
                  onChange={e => setAssignWorkoutId(e.target.value)}
                  className="w-full bg-[#121212] border border-[#2a2a2a] rounded-lg px-3 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#e2ff00] cursor-pointer"
                >
                  {workouts.map(w => (
                    <option key={w.id} value={w.id}>{w.name} ({w.exercises.length} ej.)</option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider mb-1.5">Fecha *</label>
              <input
                type="date"
                value={assignDate}
                onChange={e => setAssignDate(e.target.value)}
                className="w-full bg-[#121212] border border-[#2a2a2a] rounded-lg px-3 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#e2ff00]"
              />
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowAssignModal(false)}
                className="flex-1 py-3 border border-[#2a2a2a] text-[#c6c9ab] hover:text-white font-mono text-xs uppercase rounded-xl transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateAssignment}
                disabled={isAssigning || !assignWorkoutId || !assignDate || workouts.length === 0}
                className="flex-1 py-3 bg-[#e2ff00] text-black font-mono font-bold text-xs uppercase rounded-xl hover:bg-[#bad200] active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {isAssigning ? (
                  <><span className="material-symbols-outlined text-sm animate-spin">refresh</span>Asignando...</>
                ) : (
                  <><span className="material-symbols-outlined text-sm">event_available</span>Confirmar</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
