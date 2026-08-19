import React, { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { StepLog } from '../types';
import { getAthleteNutritionConfig, getStepsForAthlete, addSteps, updateSteps } from '../dbService';
import { todayStr } from '../utils/questionnaireSchedule';
import { DEFAULT_KCAL_PER_STEP } from '../utils/nutritionConstants';
import { Skeleton } from './ui';
import { Icon, Button } from './ui';

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
      <div className="bg-surface border border-hairline rounded-surface p-4">
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  return (
    <div className="bg-surface border border-hairline rounded-surface p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-sans font-bold text-body-s text-white flex items-center gap-2">
          <Icon name="directions_walk" size="m" className="text-accent" />
          Pasos de hoy
        </h2>
        {!editing && (
          <Button variant="ghost" size="s" onClick={() => { setInput(String(steps)); setEditing(true); }} icon="edit" label="Editar" />
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
            className="flex-1 bg-raised border border-hairline rounded-control px-3 py-2 text-white font-mono text-title-s focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <Button size="s" onClick={handleSave} loading={saving} icon="check" label="Guardar" />
        </div>
      ) : (
        <>
          {/* Una línea y la barra, en vez de tres columnas rotuladas + barra +
              pie de kcal (petición de Dani, 14-08: «dejarlo un poco más bajo»).
              No se pierde ni un dato: realizados y objetivo van en la cifra
              partida, lo que falta y las kcal a la derecha. Cuatro alturas de
              texto pasan a una. */}
          <div className="mb-2 flex items-baseline justify-between gap-3 font-mono">
            <p className="whitespace-nowrap">
              <span className="text-title-s font-bold text-white">{steps.toLocaleString('es-ES')}</span>
              <span className="text-caption text-ink-2"> / {goal.toLocaleString('es-ES')}</span>
            </p>
            <p className="truncate text-caption text-ink-2">
              {remaining > 0
                ? <>Faltan <span className="font-bold text-accent">{remaining.toLocaleString('es-ES')}</span></>
                : <span className="font-bold text-success">Objetivo cumplido</span>}
              <span className="text-ink-3"> · +{kcalEarned.toLocaleString('es-ES')} kcal</span>
            </p>
          </div>
          <div className="h-1.5 bg-raised rounded-full overflow-hidden">
            <div className="h-full bg-accent rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
          </div>
        </>
      )}
    </div>
  );
}
