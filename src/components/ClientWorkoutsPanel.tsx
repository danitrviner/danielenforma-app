import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  UserProfile, Mesocycle, WorkoutLog, Exercise, OnboardingData,
  WorkoutAssignment, Workout,
} from '../types';
import { createWorkoutAssignment, deleteWorkoutAssignment, updateWorkoutLog, updateUserProfile } from '../dbService';
import { invalidateResource } from '../hooks/useResourceCache';
import { useToast } from '../hooks/useToast';
import MesocycleDashboard from './MesocycleDashboard';
import LoadHistoryPanel from './LoadHistoryPanel';
import MesocycleManager from './MesocycleManager';
import { Badge, BadgeTone, Sheet, Button, Icon, Input, Select } from './ui';

const STATUS_LABEL: Record<WorkoutAssignment['status'], string> = {
  pending:   'Pendiente',
  completed: 'Completado',
  skipped:   'Saltado',
  perdido:   'Perdido',
};

const STATUS_TONE: Record<WorkoutAssignment['status'], BadgeTone> = {
  pending:   'warning',
  completed: 'success',
  skipped:   'neutral',
  perdido:   'danger',
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
  const queryClient = useQueryClient();

  const getExercise = (id: string) => exercises.find(e => e.id === id);

  // Lista de entrenamientos asignados plegada por defecto (puede ser muy larga)
  const [assignmentsExpanded, setAssignmentsExpanded] = useState(false);

  // T7.b (18-08): antes la sala de espera se abría sola en cuanto existía
  // UNA asignación (App.tsx, hasPlan) — Dani no controlaba el momento. Ahora
  // hace falta este botón, y solo aparece con clientes que NUNCA han tenido
  // un plan visible: en cuanto se pulsa, desaparece para siempre, aunque se
  // le monten más mesociclos después.
  const [publishing, setPublishing] = useState(false);
  const handlePublishPlan = async () => {
    setPublishing(true);
    try {
      await updateUserProfile(athlete.userId, { planPublishedAt: new Date().toISOString() });
      queryClient.invalidateQueries({ queryKey: ['userProfiles'] });
      showToast(`Plan publicado. ${athlete.displayName} ya puede verlo.`, 'success');
    } catch (err) {
      console.error('No se pudo publicar el plan:', err);
      showToast('No se pudo publicar el plan. Inténtalo otra vez.');
    } finally {
      setPublishing(false);
    }
  };

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
      {assignments.length > 0 && !athlete.planPublishedAt && (
        <div className="bg-accent/10 border border-accent/30 rounded-surface p-4 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h3 className="font-sans font-bold text-title-s text-white flex items-center gap-2">
              <Icon name="visibility" size="m" className="text-accent" />
              Plan montado, sin mostrar al atleta
            </h3>
            <p className="font-mono text-caption text-ink-3 mt-1">
              {athlete.displayName} sigue en la sala de espera hasta que pulses este botón.
            </p>
          </div>
          <Button onClick={handlePublishPlan} loading={publishing} icon="visibility" className="shrink-0">
            Mostrar el plan al atleta
          </Button>
        </div>
      )}

      {/* Periodización de entrenamiento — visión analítica */}
      <div>
        <h2 className="font-sans font-bold text-title-m tracking-tight text-white uppercase flex items-center gap-2">
          <span className="material-symbols-outlined text-accent" style={{ fontVariationSettings: "'FILL' 1" }}>monitoring</span>
          Periodización de entrenamiento
        </h2>
        <p className="font-sans text-label text-ink-2 mt-1">Cómo va el ciclo actual antes de tocar la programación.</p>
      </div>
      <MesocycleDashboard mesocycles={mesocycles} athleteEmail={athlete.email} />
      <LoadHistoryPanel logs={athleteLogs} exercises={exercises} athleteId={athlete.email} />

      {/* Onboarding exercise reference */}
      {onboardingData && (onboardingData.favoriteExercises.length > 0 || onboardingData.hatedExercises.length > 0 || onboardingData.equipment.length > 0) && (
        <div className="bg-bg border border-accent/15 rounded-surface p-4 space-y-3">
          <p className="font-mono text-caption text-accent uppercase tracking-wider flex items-center gap-2">
            <span className="material-symbols-outlined text-body-s">person_check</span>
            Preferencias de ejercicio
          </p>
          {onboardingData.favoriteExercises.length > 0 && (
            <div className="space-y-1">
              <p className="font-mono text-caption text-ink-2 uppercase">Favoritos</p>
              <div className="flex flex-wrap gap-2">
                {onboardingData.favoriteExercises.map(e => (
                  <span key={e} className="bg-accent/10 border border-accent/25 text-accent px-3 py-1 rounded-full text-caption font-mono font-bold">
                    {e}
                  </span>
                ))}
              </div>
            </div>
          )}
          {onboardingData.hatedExercises.length > 0 && (
            <div className="space-y-1">
              <p className="font-mono text-caption text-ink-2 uppercase">Evitar</p>
              <div className="flex flex-wrap gap-2">
                {onboardingData.hatedExercises.map(e => (
                  <span key={e} className="bg-red-500/10 border border-red-500/20 text-red-300 px-3 py-1 rounded-full text-caption font-mono">
                    {e}
                  </span>
                ))}
              </div>
            </div>
          )}
          {onboardingData.equipment.length > 0 && (
            <div className="space-y-1">
              <p className="font-mono text-caption text-ink-2 uppercase">Material disponible</p>
              <div className="flex flex-wrap gap-2">
                {onboardingData.equipment.map(e => (
                  <span key={e} className="bg-raised border border-hairline text-ink-2 px-3 py-1 rounded-full text-caption font-mono">
                    {e}
                  </span>
                ))}
              </div>
            </div>
          )}
          {onboardingData.injuries && (
            <p className="font-mono text-caption text-amber-300 flex items-center gap-1">
              <span className="material-symbols-outlined text-body-s">personal_injury</span>
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
            <h3 className="font-sans font-bold text-title-s text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-amber-300 text-title-s">sticky_note_2</span>
              Notas del atleta
            </h3>
            {logsWithNotes.map(log => {
              const wo = getWorkout(log.workoutId);
              const unseen = !log.noteCoachSeen;
              return (
                <div
                  key={log.id}
                  className={`border rounded-surface p-4 space-y-2 ${unseen ? 'bg-amber-500/5 border-amber-500/25' : 'bg-raised border-hairline'}`}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-sans text-label font-bold text-white">{wo?.name || 'Rutina'} · {log.date}</p>
                    {unseen && (
                      <button
                        onClick={() => {
                          updateWorkoutLog(log.id, { noteCoachSeen: true }).catch(console.error);
                          setAthleteLogs(prev => prev.map(l => l.id === log.id ? { ...l, noteCoachSeen: true } : l));
                        }}
                        className="flex-shrink-0 flex items-center gap-1 text-caption font-sans font-bold uppercase text-amber-300 hover:text-amber-200 transition-colors border border-amber-500/30 px-2 py-1 rounded-control"
                      >
                        <span className="material-symbols-outlined text-label">visibility</span>
                        Marcar visto
                      </button>
                    )}
                  </div>
                  {log.note && (
                    <p className="text-label text-ink-2 italic">"{log.note}"</p>
                  )}
                  {log.entries.filter(e => e.note).map(e => (
                    <p key={e.exerciseId} className="text-label text-ink-2">
                      <span className="font-sans text-caption text-accent">{getExercise(e.exerciseId)?.name || e.exerciseId}:</span> "{e.note}"
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
            <span className="material-symbols-outlined text-accent text-body-s">fitness_center</span>
            <h3 className="font-sans font-bold text-title-s text-white group-hover:text-accent transition-colors">
              Entrenamientos asignados
            </h3>
            {assignments.length > 0 && (
              <span className="font-mono text-caption text-ink-2 bg-white/5 border border-hairline rounded-full px-2 ">
                {assignments.length}
              </span>
            )}
            <span
              className="material-symbols-outlined text-ink-2 text-title-s transition-transform"
              style={{ transform: assignmentsExpanded ? 'rotate(180deg)' : 'none' }}
            >
              expand_more
            </span>
          </button>
          <button
            onClick={() => { setAssignWorkoutId(workouts[0]?.id || ''); setAssignDate(new Date().toISOString().split('T')[0]); setShowAssignModal(true); }}
            className="flex items-center gap-2 px-3 py-2 bg-accent/10 border border-accent/30 text-accent hover:bg-accent/20 font-mono text-caption uppercase rounded-control transition-all"
          >
            <span className="material-symbols-outlined text-body-s">add</span>
            Asignar
          </button>
        </div>
        {assignments.length === 0 ? (
          <div className="py-6 text-center">
            <span className="material-symbols-outlined text-title-l text-ink-3 block mb-2">calendar_today</span>
            <p className="text-label text-ink-2">Sin entrenamientos asignados todavía.</p>
          </div>
        ) : !assignmentsExpanded ? null : (
          <div className="space-y-2">
            {[...assignments].sort((a, b) => a.date.localeCompare(b.date)).map(a => {
              const wo = workouts.find(w => w.id === a.workoutId);
              return (
                <div key={a.id} className="flex items-center justify-between gap-3 p-3 bg-surface border border-hairline rounded-surface">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="material-symbols-outlined text-title-s text-ink-2 flex-shrink-0">event</span>
                    <div className="min-w-0">
                      <p className="font-sans font-bold text-body-s text-white truncate flex items-center gap-2">
                        {wo?.name || <span className="italic text-ink-2">Rutina eliminada</span>}
                        {wo?.exercises.some(e => e.recordVideoSet) && (
                          <span className="material-symbols-outlined text-accent text-body-s flex-shrink-0" title="Esta rutina pide grabar vídeo">videocam</span>
                        )}
                      </p>
                      <p className="font-mono text-caption text-ink-2">{a.date}{wo ? ` · ${wo.exercises.length} ejercicios` : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</Badge>
                    <button onClick={() => handleDeleteAssignment(a.id)} className="text-ink-2 hover:text-red-400 p-1 rounded-control transition-colors" title="Eliminar">
                      <span className="material-symbols-outlined text-body-s">delete</span>
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
        <Sheet
          open
          onClose={() => setShowAssignModal(false)}
          title="Asignar entrenamiento"
          footer={(
            <>
              <Button variant="secondary" onClick={() => setShowAssignModal(false)} fullWidth>
                Cancelar
              </Button>
              <Button
                onClick={handleCreateAssignment}
                disabled={isAssigning || !assignWorkoutId || !assignDate || workouts.length === 0}
                loading={isAssigning}
                icon="event_available"
                fullWidth
              >
                {isAssigning ? 'Asignando...' : 'Confirmar'}
              </Button>
            </>
          )}
        >
          <div className="space-y-5">
            <p className="text-label text-ink-2 font-mono flex items-center gap-2">
              <Icon name="person" size="s" className="text-accent" />
              Atleta: <strong className="text-white">{athlete.displayName}</strong>
            </p>
            {workouts.length === 0 ? (
              <div>
                <label className="block font-mono text-caption text-ink-2 uppercase tracking-wider mb-2">Rutina *</label>
                <p className="text-label text-ink-2 font-sans italic">No hay rutinas disponibles.</p>
              </div>
            ) : (
              <Select
                label="Rutina"
                required
                value={assignWorkoutId}
                onChange={setAssignWorkoutId}
                options={workouts.map(w => ({ value: w.id, label: `${w.name} (${w.exercises.length} ej.)` }))}
              />
            )}
            <Input
              label="Fecha"
              required
              type="date"
              value={assignDate}
              onChange={setAssignDate}
            />
          </div>
        </Sheet>
      )}
    </div>
  );
}
