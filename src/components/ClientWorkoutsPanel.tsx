import React, { useState } from 'react';
import {
  UserProfile, Mesocycle, WorkoutLog, Exercise, OnboardingData,
  WorkoutAssignment, Workout,
} from '../types';
import { createWorkoutAssignment, deleteWorkoutAssignment, updateWorkoutLog } from '../dbService';
import { invalidateResource } from '../hooks/useResourceCache';
import { useToast } from '../hooks/useToast';
import MesocycleDashboard from './MesocycleDashboard';
import LoadHistoryPanel from './LoadHistoryPanel';
import MesocycleManager from './MesocycleManager';

const STATUS_LABEL: Record<WorkoutAssignment['status'], string> = {
  pending:   'Pendiente',
  completed: 'Completado',
  skipped:   'Saltado',
  perdido:   'Perdido',
};

const STATUS_STYLE: Record<WorkoutAssignment['status'], string> = {
  pending:   'bg-amber-500/10 text-amber-300 border border-amber-500/20',
  completed: 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20',
  skipped:   'bg-raised text-ink-2 border border-hairline',
  perdido:   'bg-red-500/10 text-red-300 border border-red-500/20',
};

interface Props {
  athlete: UserProfile;
  coachId: string;
  mesocycles: Mesocycle[];
  athleteLogs: WorkoutLog[];
  setAthleteLogs: React.Dispatch<React.SetStateAction<WorkoutLog[]>>;
  exercises: Exercise[];
  onboardingData: OnboardingData | null;
  assignments: WorkoutAssignment[];
  setAssignments: React.Dispatch<React.SetStateAction<WorkoutAssignment[]>>;
  workouts: Workout[];
  getWorkout: (id: string) => Workout | undefined;
}

export default function ClientWorkoutsPanel({
  athlete, coachId, mesocycles, athleteLogs, setAthleteLogs, exercises,
  onboardingData, assignments, setAssignments, workouts, getWorkout,
}: Props) {
  const { showToast } = useToast();

  const getExercise = (id: string) => exercises.find(e => e.id === id);

  // Lista de entrenamientos asignados plegada por defecto (puede ser muy larga)
  const [assignmentsExpanded, setAssignmentsExpanded] = useState(false);

  // Assign modal
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignWorkoutId, setAssignWorkoutId] = useState('');
  const [assignDate, setAssignDate] = useState(new Date().toISOString().split('T')[0]);
  const [isAssigning, setIsAssigning] = useState(false);

  const handleCreateAssignment = async () => {
    if (!assignWorkoutId || !assignDate) return;
    setIsAssigning(true);
    try {
      const newA = await createWorkoutAssignment({
        workoutId: assignWorkoutId,
        athleteId: athlete.userId,
        date:      assignDate,
        status:    'pending',
      });
      setAssignments(prev => [...prev, newA].sort((a, b) => a.date.localeCompare(b.date)));
      setShowAssignModal(false);
      setAssignWorkoutId('');
      invalidateResource(`assignments:${athlete.userId}`);
    } catch (err) { console.error(err); showToast('No se pudo asignar el entrenamiento.'); }
    finally { setIsAssigning(false); }
  };

  const handleDeleteAssignment = async (id: string) => {
    if (!window.confirm('¿Eliminar este entrenamiento asignado?')) return;
    try {
      await deleteWorkoutAssignment(id);
      setAssignments(prev => prev.filter(a => a.id !== id));
      invalidateResource(`assignments:${athlete.userId}`);
    } catch (err) { console.error(err); showToast('No se pudo eliminar el entrenamiento.'); }
  };

  return (
    <div className="space-y-6">
      {/* Periodización de entrenamiento — visión analítica */}
      <div>
        <h2 className="font-sans font-black text-xl tracking-tight text-white uppercase flex items-center gap-2">
          <span className="material-symbols-outlined text-accent" style={{ fontVariationSettings: "'FILL' 1" }}>monitoring</span>
          Periodización de entrenamiento
        </h2>
        <p className="font-mono text-xs text-ink-2 mt-1">Cómo va el ciclo actual antes de tocar la programación.</p>
      </div>
      <MesocycleDashboard mesocycles={mesocycles} athleteEmail={athlete.email} />
      <LoadHistoryPanel logs={athleteLogs} exercises={exercises} athleteId={athlete.email} />

      {/* Onboarding exercise reference */}
      {onboardingData && (onboardingData.favoriteExercises.length > 0 || onboardingData.hatedExercises.length > 0 || onboardingData.equipment.length > 0) && (
        <div className="bg-bg border border-accent/15 rounded-surface p-4 space-y-3">
          <p className="font-mono text-[10px] text-accent uppercase tracking-wider flex items-center gap-1.5">
            <span className="material-symbols-outlined text-sm">person_check</span>
            Preferencias de ejercicio
          </p>
          {onboardingData.favoriteExercises.length > 0 && (
            <div className="space-y-1">
              <p className="font-mono text-[9px] text-ink-2 uppercase">Favoritos</p>
              <div className="flex flex-wrap gap-1.5">
                {onboardingData.favoriteExercises.map(e => (
                  <span key={e} className="bg-accent/10 border border-accent/25 text-accent px-2.5 py-1 rounded-full text-[10px] font-mono font-bold">
                    {e}
                  </span>
                ))}
              </div>
            </div>
          )}
          {onboardingData.hatedExercises.length > 0 && (
            <div className="space-y-1">
              <p className="font-mono text-[9px] text-ink-2 uppercase">Evitar</p>
              <div className="flex flex-wrap gap-1.5">
                {onboardingData.hatedExercises.map(e => (
                  <span key={e} className="bg-red-500/10 border border-red-500/20 text-red-300 px-2.5 py-1 rounded-full text-[10px] font-mono">
                    {e}
                  </span>
                ))}
              </div>
            </div>
          )}
          {onboardingData.equipment.length > 0 && (
            <div className="space-y-1">
              <p className="font-mono text-[9px] text-ink-2 uppercase">Material disponible</p>
              <div className="flex flex-wrap gap-1.5">
                {onboardingData.equipment.map(e => (
                  <span key={e} className="bg-raised border border-hairline text-ink-2 px-2.5 py-1 rounded-full text-[10px] font-mono">
                    {e}
                  </span>
                ))}
              </div>
            </div>
          )}
          {onboardingData.injuries && (
            <p className="font-mono text-[10px] text-amber-300 flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">personal_injury</span>
              {onboardingData.injuries}
            </p>
          )}
        </div>
      )}

      {/* Notas del atleta (por ejercicio + entreno completo) */}
      {(() => {
        const logsWithNotes = athleteLogs
          .filter(l => l.note || l.entries.some(e => e.note))
          .sort((a, b) => b.date.localeCompare(a.date));
        if (logsWithNotes.length === 0) return null;
        return (
          <div className="bg-surface border border-hairline rounded-surface p-5 space-y-3">
            <h3 className="font-sans font-bold text-base text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-amber-300 text-base">sticky_note_2</span>
              Notas del atleta
            </h3>
            {logsWithNotes.map(log => {
              const wo = getWorkout(log.workoutId);
              const unseen = !log.noteCoachSeen;
              return (
                <div
                  key={log.id}
                  className={`border rounded-surface p-3.5 space-y-2 ${unseen ? 'bg-amber-500/5 border-amber-500/25' : 'bg-raised border-hairline'}`}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-sans text-xs font-bold text-white">{wo?.name || 'Rutina'} · {log.date}</p>
                    {unseen && (
                      <button
                        onClick={() => {
                          updateWorkoutLog(log.id, { noteCoachSeen: true }).catch(console.error);
                          setAthleteLogs(prev => prev.map(l => l.id === log.id ? { ...l, noteCoachSeen: true } : l));
                        }}
                        className="flex-shrink-0 flex items-center gap-1 text-[9px] font-sans font-bold uppercase text-amber-300 hover:text-amber-200 transition-colors border border-amber-500/30 px-2 py-1 rounded-control"
                      >
                        <span className="material-symbols-outlined text-xs">visibility</span>
                        Marcar visto
                      </button>
                    )}
                  </div>
                  {log.note && (
                    <p className="text-xs text-ink-2 italic">"{log.note}"</p>
                  )}
                  {log.entries.filter(e => e.note).map(e => (
                    <p key={e.exerciseId} className="text-xs text-ink-2">
                      <span className="font-mono text-[10px] text-accent">{getExercise(e.exerciseId)?.name || e.exerciseId}:</span> "{e.note}"
                    </p>
                  ))}
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Workout assignments — plegado por defecto: la lista puede ser larga
          y lo habitual es venir a asignar, no a repasarla entera */}
      <div className="bg-surface border border-hairline rounded-surface p-5 space-y-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setAssignmentsExpanded(e => !e)}
            className="flex items-center gap-2 text-left group"
          >
            <span className="material-symbols-outlined text-accent text-sm">fitness_center</span>
            <h3 className="font-sans font-bold text-base text-white group-hover:text-accent transition-colors">
              Entrenamientos asignados
            </h3>
            {assignments.length > 0 && (
              <span className="font-mono text-[10px] text-ink-2 bg-white/5 border border-hairline rounded-full px-2 py-0.5">
                {assignments.length}
              </span>
            )}
            <span
              className="material-symbols-outlined text-ink-2 text-base transition-transform"
              style={{ transform: assignmentsExpanded ? 'rotate(180deg)' : 'none' }}
            >
              expand_more
            </span>
          </button>
          <button
            onClick={() => { setAssignWorkoutId(workouts[0]?.id || ''); setAssignDate(new Date().toISOString().split('T')[0]); setShowAssignModal(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-accent/10 border border-accent/30 text-accent hover:bg-accent/20 font-mono text-[10px] uppercase rounded-control transition-all"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            Asignar
          </button>
        </div>
        {assignments.length === 0 ? (
          <div className="py-6 text-center">
            <span className="material-symbols-outlined text-2xl text-ink-3 block mb-2">calendar_today</span>
            <p className="text-xs text-ink-2">Sin entrenamientos asignados todavía.</p>
          </div>
        ) : !assignmentsExpanded ? null : (
          <div className="space-y-2">
            {[...assignments].sort((a, b) => a.date.localeCompare(b.date)).map(a => {
              const wo = workouts.find(w => w.id === a.workoutId);
              return (
                <div key={a.id} className="flex items-center justify-between gap-3 p-3 bg-surface border border-hairline rounded-surface">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="material-symbols-outlined text-base text-ink-2 flex-shrink-0">event</span>
                    <div className="min-w-0">
                      <p className="font-sans font-bold text-sm text-white truncate flex items-center gap-1.5">
                        {wo?.name || <span className="italic text-ink-2">Rutina eliminada</span>}
                        {wo?.exercises.some(e => e.recordVideoSet) && (
                          <span className="material-symbols-outlined text-accent text-sm flex-shrink-0" title="Esta rutina pide grabar vídeo">videocam</span>
                        )}
                      </p>
                      <p className="font-mono text-[10px] text-ink-2">{a.date}{wo ? ` · ${wo.exercises.length} ejercicios` : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-[9px] font-sans font-bold uppercase px-2 py-0.5 rounded-surface ${STATUS_STYLE[a.status]}`}>
                      {STATUS_LABEL[a.status]}
                    </span>
                    <button onClick={() => handleDeleteAssignment(a.id)} className="text-ink-2 hover:text-red-400 p-1 rounded-control transition-colors" title="Eliminar">
                      <span className="material-symbols-outlined text-sm">delete</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Macrociclos — programación de volumen/semanas (el análisis vive arriba) */}
      <MesocycleManager
        coachId={coachId}
        athleteEmail={athlete.email}
        athleteEquipment={onboardingData?.equipment ?? []}
      />

      {/* ── Assign modal ──────────────────────────────────────────────────── */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center sm:p-4">
          <div className="bg-raised border border-hairline rounded-t-surface sm:rounded-surface p-6 w-full sm:max-w-md shadow-2xl space-y-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pb-6">
            <div className="flex items-center justify-between">
              <h2 className="font-sans font-black text-xl text-white uppercase tracking-tight">Asignar entrenamiento</h2>
              <button onClick={() => setShowAssignModal(false)} className="text-ink-2 hover:text-white transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <p className="text-xs text-ink-2 font-mono flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm text-accent">person</span>
              Atleta: <strong className="text-white">{athlete.displayName}</strong>
            </p>
            <div>
              <label className="block font-mono text-[10px] text-ink-2 uppercase tracking-wider mb-1.5">Rutina *</label>
              {workouts.length === 0 ? (
                <p className="text-xs text-ink-2 font-mono italic">No hay rutinas disponibles.</p>
              ) : (
                <select
                  value={assignWorkoutId}
                  onChange={e => setAssignWorkoutId(e.target.value)}
                  className="w-full bg-surface border border-hairline rounded-control px-3 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-accent cursor-pointer"
                >
                  {workouts.map(w => (
                    <option key={w.id} value={w.id}>{w.name} ({w.exercises.length} ej.)</option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label className="block font-mono text-[10px] text-ink-2 uppercase tracking-wider mb-1.5">Fecha *</label>
              <input
                type="date"
                value={assignDate}
                onChange={e => setAssignDate(e.target.value)}
                className="w-full bg-surface border border-hairline rounded-control px-3 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowAssignModal(false)} className="flex-1 py-3 border border-hairline text-ink-2 hover:text-white font-mono text-xs uppercase rounded-control transition-all">
                Cancelar
              </button>
              <button
                onClick={handleCreateAssignment}
                disabled={isAssigning || !assignWorkoutId || !assignDate || workouts.length === 0}
                className="flex-1 py-3 bg-accent text-black font-sans font-bold text-xs uppercase rounded-control hover:bg-accent-press active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
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
