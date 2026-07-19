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
import ProgressRing from './ProgressRing';
import Skeleton from './Skeleton';
import { HubTab, AnalisisTab } from './ClientHub';

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
  done: 'text-emerald-400',
  attention: 'text-orange-400',
  pending: 'text-[#c6c9ab]',
  na: 'text-[#4a4a4a]',
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

  const toggleManual = async (item: SetupItem) => {
    const nextDone = item.status !== 'done';
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
    } catch (err) { console.error(err); }
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
    } finally {
      setSavingExtra(false);
    }
  };

  const toggleExtra = async (task: CoachClientTask) => {
    const done = !task.done;
    queryClient.setQueryData<CoachClientTask[]>(coachClientTasksKey, prev =>
      prev?.map(t => t.id === task.id ? { ...t, done } : t));
    try { await updateCoachClientTask(task.id, { done, doneAt: done ? new Date().toISOString() : undefined }); } catch (err) { console.error(err); }
  };

  const removeExtra = async (task: CoachClientTask) => {
    queryClient.setQueryData<CoachClientTask[]>(coachClientTasksKey, prev => prev?.filter(t => t.id !== task.id));
    try { await deleteCoachClientTask(task.id); } catch (err) { console.error(err); }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-14 w-full rounded-xl" />
        <Skeleton className="h-14 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Cabecera: anillo global + siguiente paso */}
      <div className="bg-[#181816] border border-white/7 rounded-2xl p-5 flex items-center gap-5">
        <ProgressRing pct={result.globalPct} color={result.globalPct >= 100 ? '#34d399' : '#fbcb1a'} label="Setup" />
        <div className="flex-1 min-w-0">
          {result.nextStep ? (
            <>
              <p className="font-mono text-[9px] text-[#c6c9ab] uppercase tracking-wide mb-1">Siguiente paso</p>
              <p className="font-sans font-bold text-sm text-white mb-2">{result.nextStep.title}</p>
              {result.nextStep.link && (
                <button
                  onClick={() => goToItem(result.nextStep!)}
                  className="flex items-center gap-1 font-mono text-[10px] text-black bg-[#fbcb1a] px-3 py-1.5 rounded-lg font-bold uppercase hover:bg-[#d4a800] transition-all"
                >
                  Ir ahora
                  <span className="material-symbols-outlined text-sm">arrow_forward</span>
                </button>
              )}
            </>
          ) : (
            <p className="font-sans font-bold text-sm text-emerald-400">Todo configurado</p>
          )}
        </div>
      </div>

      {/* Alertas */}
      {result.alerts.length > 0 && (
        <div className="flex flex-col gap-2">
          {result.alerts.map(alert => (
            <button
              key={alert.id}
              onClick={() => alert.link && onGoToTab(alert.link.tab)}
              className={`flex items-center gap-2 text-left border rounded-xl p-3 transition-all ${
                alert.severity === 'critical'
                  ? 'bg-red-500/10 border-red-500/20 hover:border-red-500/40'
                  : 'bg-orange-500/10 border-orange-500/20 hover:border-orange-500/40'
              }`}
            >
              <span className={`material-symbols-outlined text-base ${alert.severity === 'critical' ? 'text-red-400' : 'text-orange-400'}`}>
                {alert.severity === 'critical' ? 'error' : 'warning'}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-sans text-xs font-bold text-white">{alert.title}</p>
                {alert.detail && <p className="font-mono text-[10px] text-[#c6c9ab]">{alert.detail}</p>}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Fases */}
      <div className="space-y-3">
        {result.phases.map(phase => {
          const expanded = expandedPhase === phase.id;
          return (
            <div key={phase.id} className="bg-[#181816] border border-white/7 rounded-2xl overflow-hidden">
              <button
                onClick={() => setExpandedPhase(expanded ? null : phase.id)}
                className="w-full flex items-center gap-3 p-4"
              >
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-2">
                    <p className="font-sans font-bold text-sm text-white">{phase.title}</p>
                    {phase.subtitle && <span className="font-mono text-[9px] text-[#c6c9ab]">{phase.subtitle}</span>}
                  </div>
                  <div className="w-full h-1.5 bg-[#0e0e0e] rounded-full mt-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${phase.donePct >= 100 ? 'bg-emerald-400' : 'bg-[#fbcb1a]'}`}
                      style={{ width: `${phase.donePct}%` }}
                    />
                  </div>
                </div>
                <span className="font-mono text-xs text-[#c6c9ab] flex-shrink-0">{phase.donePct}%</span>
                <span className="material-symbols-outlined text-[#c6c9ab] flex-shrink-0">
                  {expanded ? 'expand_less' : 'expand_more'}
                </span>
              </button>

              {expanded && (
                <div className="border-t border-white/7 divide-y divide-white/7">
                  {phase.items.map(item => (
                    <button
                      key={item.id}
                      onClick={() => item.manual ? toggleManual(item) : goToItem(item)}
                      disabled={item.status === 'na'}
                      className={`w-full flex items-center gap-3 p-3 text-left transition-all ${
                        item.status === 'na' ? 'opacity-40 cursor-default' : 'hover:bg-white/5'
                      }`}
                    >
                      <span className={`material-symbols-outlined flex-shrink-0 text-base ${STATUS_COLOR[item.status]}`}>
                        {STATUS_ICON[item.status]}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className={`font-sans text-xs ${item.status === 'done' ? 'text-[#c6c9ab] line-through' : 'text-white'}`}>{item.title}</p>
                        {item.detail && <p className="font-mono text-[10px] text-[#c6c9ab] mt-0.5">{item.detail}</p>}
                      </div>
                      {item.link && item.status !== 'na' && (
                        <span className="material-symbols-outlined text-[#4a4a4a] text-base flex-shrink-0">chevron_right</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Tareas extra */}
      <div className="bg-[#181816] border border-white/7 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-sans font-bold text-base text-white flex items-center gap-2">
            <span className="material-symbols-outlined text-[#fbcb1a] text-base">playlist_add_check</span>
            Tareas extra
          </h3>
          <button
            onClick={() => setShowExtraForm(v => !v)}
            className="flex items-center gap-1 font-mono text-[10px] text-[#c6c9ab] hover:text-[#fbcb1a] transition-colors border border-white/7 px-2.5 py-1.5 rounded-lg"
          >
            <span className="material-symbols-outlined text-sm">{showExtraForm ? 'close' : 'add'}</span>
            {showExtraForm ? 'Cancelar' : 'Añadir'}
          </button>
        </div>

        {showExtraForm && (
          <form onSubmit={handleAddExtra} className="bg-[#1e1e1b] border border-white/7 rounded-xl p-3 mb-3 flex gap-2">
            <input
              type="text"
              value={extraTitle}
              onChange={e => setExtraTitle(e.target.value)}
              placeholder="Título de la tarea"
              className="flex-1 bg-[#0e0e0e] border border-white/7 rounded p-2 text-xs text-white focus:outline-none focus:border-[#fbcb1a]"
              required
            />
            <button
              type="submit"
              disabled={savingExtra}
              className="px-3 py-2 bg-[#fbcb1a] text-black font-sans font-bold text-xs uppercase rounded hover:bg-[#d4a800] active:scale-95 transition-all disabled:opacity-50"
            >
              {savingExtra ? '...' : 'Crear'}
            </button>
          </form>
        )}

        {extraTasks.length === 0 ? (
          <p className="text-xs text-[#555] font-mono py-2">Sin tareas extra.</p>
        ) : (
          <div className="space-y-2">
            {extraTasks.map(task => (
              <div
                key={task.id}
                className={`w-full flex items-center gap-3 border rounded-lg p-3 transition-all ${
                  task.done ? 'bg-[#161616] border-white/50 opacity-60' : 'bg-[#1e1e1e] border-white/7'
                }`}
              >
                <button onClick={() => toggleExtra(task)} className="flex-shrink-0">
                  <span className={`material-symbols-outlined ${task.done ? 'text-emerald-400' : 'text-[#c6c9ab]'}`}>
                    {task.done ? 'check_circle' : 'radio_button_unchecked'}
                  </span>
                </button>
                <p className={`flex-1 min-w-0 font-sans text-sm truncate ${task.done ? 'line-through text-[#c6c9ab]' : 'text-white'}`}>{task.title}</p>
                <button onClick={() => removeExtra(task)} className="flex-shrink-0 text-[#4a4a4a] hover:text-red-400 transition-colors">
                  <span className="material-symbols-outlined text-base">delete</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
