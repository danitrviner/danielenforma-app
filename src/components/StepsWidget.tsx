import React, { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { StepLog } from '../types';
import { getAthleteNutritionConfig, getStepsForAthlete, addSteps, updateSteps } from '../dbService';
import { todayStr } from '../utils/questionnaireSchedule';
import { DEFAULT_KCAL_PER_STEP } from '../utils/nutritionConstants';
import Skeleton from './Skeleton';

interface Props {
  athleteEmail: string;
}

const DEFAULT_STEP_GOAL = 8000;

function stepsForAthleteKey(athleteEmail: string) {
  return ['stepsForAthlete', athleteEmail] as const;
}

export default function StepsWidget({ athleteEmail }: Props) {
  const queryClient = useQueryClient();
  const stepsKey = stepsForAthleteKey(athleteEmail);
  const { data: config, isPending: loadingConfig } = useQuery({
    queryKey: ['athleteNutritionConfig', athleteEmail],
    queryFn: () => getAthleteNutritionConfig(athleteEmail),
  });
  const { data: logs = [], isPending: loadingSteps } = useQuery({
    queryKey: stepsKey,
    queryFn: () => getStepsForAthlete(athleteEmail),
  });
  const loading = loadingConfig || loadingSteps;

  const goal = config?.stepGoal || DEFAULT_STEP_GOAL;
  const kcalPerStep = config?.kcalPerStep || DEFAULT_KCAL_PER_STEP;
  const todayLog = logs.find(l => l.date === todayStr());
  const todayId = todayLog?.id ?? null;
  const steps = todayLog?.steps ?? 0;

  const [input, setInput] = useState('');
  const [editing, setEditing] = useState(false);

  // Same intent as the old "no entry for today yet" branch of the initial
  // Promise.all().then() — open the editor by default the first time we
  // learn there's no log for today, but only once per athlete (not on every
  // background refetch).
  const editingInitFor = useRef<string | null>(null);
  useEffect(() => {
    if (!loadingSteps && editingInitFor.current !== athleteEmail) {
      editingInitFor.current = athleteEmail;
      if (!todayLog) setEditing(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingSteps, athleteEmail]);

  const saveMutation = useMutation({
    mutationFn: async (val: number) => {
      if (todayId) {
        await updateSteps(todayId, { steps: val });
        return { id: todayId, steps: val };
      }
      const entry = await addSteps({
        athleteId: athleteEmail, date: todayStr(), steps: val,
        source: 'manual', createdAt: new Date().toISOString(),
      });
      return entry;
    },
    onSuccess: result => {
      queryClient.setQueryData<StepLog[]>(stepsKey, prev => {
        const list = prev ?? [];
        const idx = list.findIndex(l => l.id === result.id);
        if (idx >= 0) {
          const copy = [...list];
          copy[idx] = { ...copy[idx], steps: result.steps };
          return copy;
        }
        return [...list, result as StepLog];
      });
      setInput('');
      setEditing(false);
    },
    onError: err => console.error(err),
  });
  const saving = saveMutation.isPending;

  const handleSave = () => {
    const val = parseInt(input, 10);
    if (!input || isNaN(val) || val < 0 || val > 100000) return;
    saveMutation.mutate(val);
  };

  const remaining = Math.max(0, goal - steps);
  const pct = Math.min(100, (steps / goal) * 100);
  const kcalEarned = Math.round(steps * kcalPerStep);

  if (loading) {
    return (
      <div className="bg-[#181816] border border-white/7 rounded-2xl p-4">
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  return (
    <div className="bg-[#181816] border border-white/7 rounded-2xl p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-sans font-bold text-sm text-white flex items-center gap-2">
          <span className="material-symbols-outlined text-[#fbcb1a] text-base">directions_walk</span>
          Pasos de hoy
        </h2>
        {!editing && (
          <button
            onClick={() => { setInput(String(steps)); setEditing(true); }}
            className="text-[#c6c9ab] hover:text-white transition-colors"
            title="Editar"
          >
            <span className="material-symbols-outlined text-base">edit</span>
          </button>
        )}
      </div>

      {editing ? (
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            max={100000}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
            placeholder="0"
            autoFocus
            className="flex-1 bg-[#1e1e1b] border border-white/7 rounded-xl px-2.5 py-1.5 text-white font-mono text-sm focus:outline-none focus:ring-1 focus:ring-[#fbcb1a]"
          />
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-shrink-0 w-9 h-9 rounded-lg bg-[#fbcb1a] flex items-center justify-center text-black transition-all hover:bg-[#d4a800] active:scale-95 disabled:opacity-50"
          >
            {saving
              ? <span className="material-symbols-outlined text-sm animate-spin">refresh</span>
              : <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>check</span>
            }
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 mb-2 font-mono text-center">
            <div>
              <span className="block text-[9px] text-[#c6c9ab] uppercase">Realizados</span>
              <span className="block text-sm font-bold text-white">{steps.toLocaleString('es-ES')}</span>
            </div>
            <div>
              <span className="block text-[9px] text-[#c6c9ab] uppercase">Objetivo</span>
              <span className="block text-sm font-bold text-[#00eefc]">{goal.toLocaleString('es-ES')}</span>
            </div>
            <div>
              <span className="block text-[9px] text-[#c6c9ab] uppercase">Restantes</span>
              <span className="block text-sm font-bold text-[#fbcb1a]">{remaining.toLocaleString('es-ES')}</span>
            </div>
          </div>
          <div className="h-1.5 bg-[#1c1b1b] rounded-full overflow-hidden">
            <div className="h-full bg-[#fbcb1a] rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
          </div>
          <p className="font-mono text-[9px] text-[#c6c9ab] uppercase tracking-widest mt-2 text-center">
            +{kcalEarned.toLocaleString('es-ES')} kcal por actividad
          </p>
        </>
      )}
    </div>
  );
}
