import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  UserProfile, WeightCheckIn, OnboardingData, Mesocycle, WorkoutAssignment,
  Diet, AthleteDietConfig, AthleteNutritionConfig, QuestionnaireAssignment,
  PhotoAssignment, ProgressPhoto, WorkoutLog, CoachClientTask,
} from '../types';
import {
  getRoadmap, getNutritionProgram, getWeeklyChallenge,
  getCoachClientTasks, setSeededTaskDone, createCoachClientTask,
  updateCoachClientTask, deleteCoachClientTask, updateUserProfile,
} from '../dbService';
import { computeSetupChecklist, SetupItem, SetupPhaseId } from '../utils/clientSetup';
import { isoWeekKey } from '../utils/challengeOptions';
import { HubTab, AnalisisTab } from './ClientHub';
import { useToast } from '../hooks/useToast';
import { mensajeDeErrorFirestore } from '../utils/erroresFirestore';
import { Icon, Button, ListRow, RingSeal, Skeleton } from './ui';

interface Props {
  athlete: UserProfile;
  checkins: WeightCheckIn[];
  onboarding: OnboardingData | null;
  mesocycles: Mesocycle[];
  workoutAssignments: WorkoutAssignment[];
  diets: Diet[];
  dietConfig: AthleteDietConfig | null;
  nutritionConfig: AthleteNutritionConfig | null;
  qAssignments: QuestionnaireAssignment[];
  photoAssignments: PhotoAssignment[];
  photos: ProgressPhoto[];
  workoutLogs: WorkoutLog[];
  onGoToTab: (tab: HubTab) => void;
  onGoToAnalisis: (sub: AnalisisTab) => void;
}

const STATUS_ICON: Record<SetupItem['status'], string> = {
  done: 'check_circle',
  attention: 'warning',
  pending: 'radio_button_unchecked',
  na: 'remove',
};
const STATUS_COLOR: Record<SetupItem['status'], string> = {
  done: 'text-success',
  attention: 'text-warning',
  pending: 'text-ink-2',
  na: 'text-ink-3',
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function ClientSetupPanel({
  athlete, checkins, onboarding, mesocycles, workoutAssignments, diets,
  dietConfig, nutritionConfig, qAssignments, photoAssignments, photos,
  workoutLogs, onGoToTab, onGoToAnalisis,
}: Props) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const weekKey = isoWeekKey(todayISO());
  const coachClientTasksKey = ['coachClientTasks', athlete.email] as const;

  const { data: roadmap = null, isPending: loadingRoadmap } = useQuery({
    queryKey: ['roadmap', athlete.email],
    queryFn: () => getRoadmap(athlete.email),
  });
  const { data: nutritionProgram = null, isPending: loadingNutritionProgram } = useQuery({
    queryKey: ['nutritionProgram', athlete.email],
    queryFn: () => getNutritionProgram(athlete.email),
  });
  const { data: weeklyChallenge = null, isPending: loadingWeeklyChallenge } = useQuery({
    queryKey: ['weeklyChallenge', athlete.email, weekKey],
    queryFn: () => getWeeklyChallenge(athlete.email, weekKey),
  });
  const { data: manualTasks = [], isPending: loadingManualTasks } = useQuery({
    queryKey: coachClientTasksKey,
    queryFn: () => getCoachClientTasks(athlete.email),
  });
  const loading = loadingRoadmap || loadingNutritionProgram || loadingWeeklyChallenge || loadingManualTasks;

  const [expandedPhase, setExpandedPhase] = useState<SetupPhaseId | null>(null);

  const [showExtraForm, setShowExtraForm] = useState(false);
  const [extraTitle, setExtraTitle] = useState('');
  const [savingExtra, setSavingExtra] = useState(false);

  const result = computeSetupChecklist({
    profile: athlete, onboarding, checkins, mesocycles, workoutAssignments,
    diets, dietConfig, nutritionConfig, qAssignments, photoAssignments, photos,
    workoutLogs, roadmap, nutritionProgram, weeklyChallenge, manualTasks,
    today: todayISO(),
  });

  // Persist a lightweight summary for the clients grid so it doesn't need to
  // recompute the full checklist (roadmap/program/challenge) per card.
  useEffect(() => {
    if (loading) return;
    const prev = athlete.setupSummary;
    if (prev && prev.pct === result.globalPct && prev.attention === result.attentionCount) return;
    updateUserProfile(athlete.userId, {
      setupSummary: { pct: result.globalPct, attention: result.attentionCount, updatedAt: new Date().toISOString() },
    }).catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- athlete.setupSummary
    // solo se lee para el guard de "ya coincide"; incluirlo dispararía el
    // efecto en bucle cada vez que el propio guardado actualiza el perfil.
  }, [loading, result.globalPct, result.attentionCount, athlete.userId]);

  useEffect(() => {
    if (expandedPhase !== null) return;
    const firstPending = result.phases.find(p => p.items.some(i => i.status === 'attention' || i.status === 'pending'));
    if (firstPending) setExpandedPhase(firstPending.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a propósito solo
    // [loading]: auto-expande la primera fase pendiente una vez al cargar, sin
    // volver a colapsar/expandir si el coach ya interactuó con el acordeón.
  }, [loading]);

  const goToItem = (item: SetupItem) => {
    if (!item.link) return;
    if (item.link.analisisSub) onGoToAnalisis(item.link.analisisSub);
    onGoToTab(item.link.tab);
  };

  // Optimista en las cuatro (toggleManual/handleAddExtra/toggleExtra/removeExtra):
  // la casilla o la fila cambian al instante. Si la escritura falla de verdad
  // (permiso denegado — ya no se lo traga en silencio, ver
  // escriturasHonestas.test.ts) hay que deshacer el optimismo y avisar, si no
  // la pantalla del coach dice una cosa y Firestore otra.
  const toggleManual = async (item: SetupItem) => {
    const nextDone = item.status !== 'done';
    const previo = queryClient.getQueryData<CoachClientTask[]>(coachClientTasksKey);
    queryClient.setQueryData<CoachClientTask[]>(coachClientTasksKey, prev => {
      const list = prev ?? [];
      const existing = list.find(t => t.itemId === item.id);
      if (existing) return list.map(t => t.itemId === item.id ? { ...t, done: nextDone } : t);
      return [...list, {
        id: `${athlete.email}_${item.id}`, athleteId: athlete.email, itemId: item.id,
        title: item.title, phase: item.phase, done: nextDone, createdBy: 'seed', createdAt: new Date().toISOString(),
      }];
    });
    try {
      await setSeededTaskDone(athlete.email, item.id, item.title, item.phase, nextDone);
    } catch (err) {
      console.error(err);
      queryClient.setQueryData(coachClientTasksKey, previo);
      showToast(mensajeDeErrorFirestore(err, 'marcar la tarea'));
    }
  };

  const extraTasks = manualTasks.filter(t => t.createdBy === 'coach');

  const handleAddExtra = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!extraTitle.trim()) return;
    setSavingExtra(true);
    try {
      const task = await createCoachClientTask({
        athleteId: athlete.email, title: extraTitle.trim(), done: false,
        createdBy: 'coach', createdAt: new Date().toISOString(),
      });
      queryClient.setQueryData<CoachClientTask[]>(coachClientTasksKey, prev => [...(prev ?? []), task]);
      setExtraTitle('');
      setShowExtraForm(false);
    } catch (err) {
      console.error(err);
      showToast(mensajeDeErrorFirestore(err, 'añadir la tarea'));
    } finally {
      setSavingExtra(false);
    }
  };

  const toggleExtra = async (task: CoachClientTask) => {
    const done = !task.done;
    const previo = queryClient.getQueryData<CoachClientTask[]>(coachClientTasksKey);
    queryClient.setQueryData<CoachClientTask[]>(coachClientTasksKey, prev =>
      prev?.map(t => t.id === task.id ? { ...t, done } : t));
    try {
      await updateCoachClientTask(task.id, { done, doneAt: done ? new Date().toISOString() : undefined });
    } catch (err) {
      console.error(err);
      queryClient.setQueryData(coachClientTasksKey, previo);
      showToast(mensajeDeErrorFirestore(err, 'marcar la tarea'));
    }
  };

  const removeExtra = async (task: CoachClientTask) => {
    const previo = queryClient.getQueryData<CoachClientTask[]>(coachClientTasksKey);
    queryClient.setQueryData<CoachClientTask[]>(coachClientTasksKey, prev => prev?.filter(t => t.id !== task.id));
    try {
      await deleteCoachClientTask(task.id);
    } catch (err) {
      console.error(err);
      queryClient.setQueryData(coachClientTasksKey, previo);
      showToast(mensajeDeErrorFirestore(err, 'eliminar la tarea'));
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full rounded-surface" />
        <Skeleton className="h-14 w-full rounded-surface" />
        <Skeleton className="h-14 w-full rounded-surface" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Cabecera: anillo global + siguiente paso */}
      <div className="bg-surface border border-hairline rounded-surface p-5 flex items-center gap-5">
        <RingSeal percent={result.globalPct} size={104} strokeWidth={9} complete={result.globalPct >= 100} label="Progreso del setup">
          <div className="flex flex-col items-center justify-center">
            <span className="font-display font-black text-title-l text-ink leading-none">{result.globalPct}%</span>
            <span className="font-mono text-caption text-ink-2 uppercase tracking-widest mt-1">Setup</span>
          </div>
        </RingSeal>
        <div className="flex-1 min-w-0">
          {result.nextStep ? (
            <>
              <p className="font-mono text-caption text-ink-2 uppercase tracking-wide mb-1">Siguiente paso</p>
              <p className="font-sans font-bold text-body-s text-white mb-2">{result.nextStep.title}</p>
              {result.nextStep.link && (
                <Button size="s" onClick={() => goToItem(result.nextStep!)} iconTrailing="arrow_forward">Ir ahora</Button>
              )}
            </>
          ) : (
            <p className="font-sans font-bold text-body-s text-success">Todo configurado</p>
          )}
        </div>
      </div>

      {/* Alertas */}
      {result.alerts.length > 0 && (
        <div className="flex flex-col gap-2">
          {result.alerts.map(alert => (
            <ListRow
              key={alert.id}
              onClick={() => alert.link && onGoToTab(alert.link.tab)}
              className={`rounded-control border ${
                alert.severity === 'critical' ? 'bg-danger/10 border-danger/20' : 'bg-warning/10 border-warning/20'
              }`}
              leading={
                <Icon name={alert.severity === 'critical' ? 'error' : 'warning'} size="m" className={alert.severity === 'critical' ? 'text-danger' : 'text-warning'} />
              }
              title={alert.title}
              subtitle={alert.detail}
            />
          ))}
        </div>
      )}

      {/* Fases */}
      <div className="space-y-3">
        {result.phases.map(phase => {
          const expanded = expandedPhase === phase.id;
          return (
            <div key={phase.id} className="bg-surface border border-hairline rounded-surface overflow-hidden">
              <button
                onClick={() => setExpandedPhase(expanded ? null : phase.id)}
                className="w-full flex items-center gap-3 p-4"
              >
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-2">
                    <p className="font-sans font-bold text-body-s text-white">{phase.title}</p>
                    {phase.subtitle && <span className="font-sans text-caption text-ink-2">{phase.subtitle}</span>}
                  </div>
                  <div className="w-full h-1.5 bg-bg rounded-full mt-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${phase.donePct >= 100 ? 'bg-success' : 'bg-accent'}`}
                      style={{ width: `${phase.donePct}%` }}
                    />
                  </div>
                </div>
                <span className="font-mono text-label text-ink-2 flex-shrink-0">{phase.donePct}%</span>
                <Icon name={expanded ? 'expand_less' : 'expand_more'} size="l" className="text-ink-2 flex-shrink-0" />
              </button>

              {expanded && (
                <div className="border-t border-hairline divide-y divide-white/7">
                  {phase.items.map(item => (
                    <ListRow
                      key={item.id}
                      onClick={() => item.manual ? toggleManual(item) : goToItem(item)}
                      disabled={item.status === 'na'}
                      leading={<Icon name={STATUS_ICON[item.status]} size="m" className={`flex-shrink-0 ${STATUS_COLOR[item.status]}`} />}
                      title={item.title}
                      subtitle={item.detail}
                      chevron={!!item.link && item.status !== 'na'}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Tareas extra */}
      <div className="bg-surface border border-hairline rounded-surface p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-sans font-bold text-title-s text-white flex items-center gap-2">
            <Icon name="playlist_add_check" size="m" className="text-accent" />
            Tareas extra
          </h3>
          <Button variant="secondary" size="s" onClick={() => setShowExtraForm(v => !v)} icon={showExtraForm ? 'close' : 'add'}>
            {showExtraForm ? 'Cancelar' : 'Añadir'}
          </Button>
        </div>

        {showExtraForm && (
          <form onSubmit={handleAddExtra} className="bg-raised border border-hairline rounded-surface p-3 mb-3 flex gap-2">
            <input
              type="text"
              value={extraTitle}
              onChange={e => setExtraTitle(e.target.value)}
              placeholder="Título de la tarea"
              className="flex-1 bg-bg border border-hairline rounded-control p-2 text-title-s text-white focus:outline-none focus:border-accent"
              required
            />
            <Button type="submit" size="s" disabled={savingExtra}>{savingExtra ? '...' : 'Crear'}</Button>
          </form>
        )}

        {extraTasks.length === 0 ? (
          <p className="text-label text-ink-3 font-sans py-2">Sin tareas extra.</p>
        ) : (
          <div className="space-y-2">
            {extraTasks.map(task => (
              <ListRow
                key={task.id}
                className={`rounded-surface border ${task.done ? 'bg-surface border-hairline opacity-60' : 'bg-raised border-hairline'}`}
                leading={
                  <button onClick={() => toggleExtra(task)} className="flex-shrink-0">
                    <Icon name={task.done ? 'check_circle' : 'radio_button_unchecked'} size="l" className={task.done ? 'text-success' : 'text-ink-2'} />
                  </button>
                }
                title={task.title}
                trailing={
                  <button onClick={() => removeExtra(task)} className="flex-shrink-0 text-ink-3 hover:text-danger transition-colors">
                    <Icon name="delete" size="m" />
                  </button>
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
