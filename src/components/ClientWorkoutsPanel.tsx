import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  UserProfile, Mesocycle, WorkoutLog, Exercise, OnboardingData,
  WorkoutAssignment, Workout,
} from '../types';
import { createWorkoutAssignment, deleteWorkoutAssignment, updateWorkoutLog, updateUserProfile } from '../dbService';
import { invalidateResource } from '../hooks/useResourceCache';
import { adherenciaDeMesociclo } from '../utils/adherence';
import { useToast } from '../hooks/useToast';
import MesocycleDashboard from './MesocycleDashboard';
import LoadHistoryPanel from './LoadHistoryPanel';
import MesocycleManager from './MesocycleManager';
import { Badge, BadgeTone, Sheet, Button, Icon, Input, Select, SegmentedControl } from './ui';

type SubView = 'info' | 'programacion';
const SUBVIEW_KEY = 'enforma_coach_workouts_subview';
const readSubView = (): SubView => {
  try { return localStorage.getItem(SUBVIEW_KEY) === 'info' ? 'info' : 'programacion'; }
  catch { return 'programacion'; }
};

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

  const [subView, setSubView] = useState<SubView>(readSubView);
  const changeSubView = (v: string) => {
    setSubView(v as SubView);
    try { localStorage.setItem(SUBVIEW_KEY, v); } catch { /* noop */ }
  };

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
        // Migración 24-08: la colección pasa a EMAIL, como las otras ~30.
        athleteId: athlete.email,
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

      <SegmentedControl
        label="Vista de entrenamientos"
        options={[{ value: 'programacion', label: 'Programación' }, { value: 'info', label: 'Información' }]}
        value={subView}
        onChange={changeSubView}
      />

      {subView === 'info' ? (
        <>
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
        </>
      ) : (
      <>
      {/* Notas del atleta — agrupadas por sesión (mockup Fase 3, pantalla 06):
          cada log de entreno es una sesión, y dentro de ella la nota del
          entreno completo y las notas por ejercicio son "notas" individuales,
          cada una con su propio punto de no-leído en vez de un único
          "Marcar visto" por sesión. */}
      {(() => {
        const logsWithNotes = athleteLogs
          .filter(l => l.note || l.entries.some(e => e.note))
          .sort((a, b) => b.date.localeCompare(a.date));
        if (logsWithNotes.length === 0) return null;

        const totalUnread = logsWithNotes.reduce((s, l) => {
          let n = 0;
          if (l.note && !l.noteCoachSeen) n++;
          n += l.entries.filter(e => e.note && !e.noteCoachSeen).length;
          return s + n;
        }, 0);

        const markLogSeen = (logId: string) => {
          updateWorkoutLog(logId, { noteCoachSeen: true }).catch(console.error);
          setAthleteLogs(prev => prev.map(l => l.id === logId ? { ...l, noteCoachSeen: true } : l));
        };
        const markEntrySeen = (logId: string, exerciseId: string) => {
          setAthleteLogs(prev => prev.map(l => {
            if (l.id !== logId) return l;
            const entries = l.entries.map(e => e.exerciseId === exerciseId ? { ...e, noteCoachSeen: true } : e);
            updateWorkoutLog(logId, { entries }).catch(console.error);
            return { ...l, entries };
          }));
        };

        return (
          <div className="bg-surface border border-hairline rounded-surface p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-sans font-bold text-title-s text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-300 text-title-s">sticky_note_2</span>
                Notas del atleta
              </h3>
              {totalUnread > 0 && (
                <Badge tone="accent">{totalUnread} sin leer</Badge>
              )}
            </div>

            <div className="space-y-5">
              {logsWithNotes.map(log => {
                const wo = getWorkout(log.workoutId);
                const notes: { key: string; ctx: string; unread: boolean; text: string; onSeen: () => void }[] = [];
                if (log.note) {
                  notes.push({
                    key: `${log.id}-w`, ctx: 'ENTRENO COMPLETO',
                    unread: !log.noteCoachSeen, text: log.note,
                    onSeen: () => markLogSeen(log.id),
                  });
                }
                log.entries.filter(e => e.note).forEach(e => {
                  notes.push({
                    key: `${log.id}-${e.exerciseId}`,
                    ctx: getExercise(e.exerciseId)?.name || e.exerciseId,
                    unread: !e.noteCoachSeen, text: e.note!,
                    onSeen: () => markEntrySeen(log.id, e.exerciseId),
                  });
                });
                return (
                  <div key={log.id} className="space-y-2">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-caption text-ink-2 uppercase tracking-[.09em]">
                        {wo?.name || 'Rutina'} · {log.date}
                      </span>
                      <div className="flex-1 h-px bg-hairline" />
                    </div>
                    <div className="space-y-2">
                      {notes.map(n => (
                        <div
                          key={n.key}
                          onClick={n.unread ? n.onSeen : undefined}
                          className={`rounded-surface border p-3.5 transition-colors ${
                            n.unread ? 'bg-accent-bg border-accent-line cursor-pointer' : 'bg-raised border-hairline'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {n.unread && <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse-dot flex-shrink-0" />}
                            <span className={`font-mono text-caption uppercase tracking-[.07em] flex-1 truncate ${n.unread ? 'text-accent' : 'text-ink-3'}`}>
                              {n.ctx}
                            </span>
                          </div>
                          <p className="mt-2 text-body-s text-ink leading-relaxed">{n.text}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
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

        {/* Adherencia del mesociclo activo (mockup Fase 3, pantalla 05) — se deriva
            de las asignaciones del mesociclo en curso (fecha de hoy dentro de su
            rango de semanas, o el último por número si ninguno está en curso).
            No existía como % en esta pantalla: MesocycleDashboard ya calculaba la
            misma cuenta completed/total por mesociclo, para su gráfica de barras —
            aquí se reutiliza el mismo criterio (completed/total), sin duplicar una
            fórmula nueva, solo resumida en un único número para el meso vigente. */}
        {(() => {
          if (mesocycles.length === 0 || assignments.length === 0) return null;
          const today = new Date().toISOString().split('T')[0];
          const sorted = [...mesocycles].sort((a, b) => a.number - b.number);
          const current = sorted.find(m => {
            const end = new Date(m.startDate + 'T00:00:00');
            end.setDate(end.getDate() + m.weeks * 7);
            return today >= m.startDate && today < end.toISOString().split('T')[0];
          }) ?? sorted[sorted.length - 1];
          const mesoAssignments = assignments.filter(a => a.mesocycleId === current.id);
          if (mesoAssignments.length === 0) return null;
          const completed = mesoAssignments.filter(a => a.status === 'completed').length;
          const adherence = adherenciaDeMesociclo(assignments, current.id) ?? 0;
          const cells = [...mesoAssignments].sort((a, b) => a.date.localeCompare(b.date));
          return (
            <div className="bg-bg border border-hairline rounded-surface px-4 py-3 space-y-2">
              <div className="flex items-baseline gap-2">
                <span className="font-mono font-semibold text-title-l text-ink tabular-nums">{adherence}%</span>
                <span className="font-sans text-caption text-ink-2">
                  adherencia · meso #{current.number} · {completed}/{mesoAssignments.length}
                </span>
              </div>
              <div className="flex gap-0.5 h-1">
                {cells.map(a => (
                  <div
                    key={a.id}
                    className="flex-1 rounded-full"
                    style={{
                      backgroundColor:
                        a.status === 'completed' ? 'var(--color-success)' :
                        a.status === 'skipped' || a.status === 'perdido' ? 'var(--color-danger)' :
                        'var(--color-track)',
                    }}
                  />
                ))}
              </div>
            </div>
          );
        })()}

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
        athleteLevel={onboardingData?.experienceLevel}
        athleteName={athlete.displayName}
        athleteLogs={athleteLogs}
        athleteAssignments={assignments}
      />
      </>
      )}

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
