import React, { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { StepLog } from '../types';
import { getAthleteNutritionConfig, getStepsForDate, addSteps, updateSteps } from '../dbService';
import { todayStr } from '../utils/questionnaireSchedule';
import { DEFAULT_KCAL_PER_STEP } from '../utils/nutritionConstants';
import { isHealthStepsSupported, isHealthStepsLinked, linkHealthSteps, getTodaySteps } from '../services/healthSteps';
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
  // Este widget solo necesita el registro de HOY, así que lo pide y ya. Antes
  // leía el historial completo (`getStepsForAthlete`) para hacer un `.find()`
  // por fecha: 728 documentos a los dos años para quedarse con uno.
  //
  // Y con CLAVE PROPIA, no la de la lista completa: `['stepsForAthlete', email]`
  // la comparten siete pantallas —Correlaciones, Análisis nutricional, los dos
  // road maps, Cardio— y varias necesitan la serie entera. Escribir un único
  // día bajo esa clave les dejaría un historial de un elemento sin ningún error
  // que lo delatara.
  const { data: todayLog = null, isPending: loadingSteps } = useQuery({
    queryKey: ['stepsForDate', athleteEmail, todayStr()],
    queryFn: () => getStepsForDate(athleteEmail, todayStr()),
  });
  const loading = loadingConfig || loadingSteps;

  const goal = config?.stepGoal || DEFAULT_STEP_GOAL;
  const kcalPerStep = config?.kcalPerStep || DEFAULT_KCAL_PER_STEP;
  const todayId = todayLog?.id ?? null;
  const steps = todayLog?.steps ?? 0;

  const [input, setInput] = useState('');
  const [editing, setEditing] = useState(false);
  const [linked, setLinked] = useState(isHealthStepsLinked());
  const [linking, setLinking] = useState(false);
  const healthSupported = isHealthStepsSupported();
  const healthSource = Capacitor.getPlatform() === 'ios' ? 'apple_health' : 'google_health_connect';

  const { data: healthSteps } = useQuery({
    queryKey: ['healthSteps', athleteEmail],
    queryFn: getTodaySteps,
    enabled: linked,
    refetchInterval: 60_000,
  });

  const saveMutation = useMutation({
    mutationFn: async ({ val, source = 'manual' }: { val: number; source?: StepLog['source'] }) => {
      if (todayId) {
        await updateSteps(todayId, { steps: val });
        return { id: todayId, steps: val };
      }
      const entry = await addSteps({
        athleteId: athleteEmail, date: todayStr(), steps: val,
        source, createdAt: new Date().toISOString(),
      });
      return entry;
    },
    onSuccess: result => {
      queryClient.setQueryData<StepLog | null>(['stepsForDate', athleteEmail, todayStr()],
        prev => (prev ? { ...prev, steps: result.steps } : (result as StepLog)));
      // La lista completa la comparten otras pantallas. Si ya está en caché se
      // parchea para que no enseñen un dato viejo; si no lo está, no se crea
      // —inventar una lista de un elemento sería peor que no tener ninguna—.
      queryClient.setQueryData<StepLog[]>(stepsKey, prev => {
        if (!prev) return prev;
        const idx = prev.findIndex(l => l.id === result.id);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = { ...copy[idx], steps: result.steps };
          return copy;
        }
        return [...prev, result as StepLog];
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
    saveMutation.mutate({ val });
  };

  const handleLink = async () => {
    setLinking(true);
    try {
      const ok = await linkHealthSteps();
      if (ok) { setLinked(true); setEditing(false); }
    } finally {
      setLinking(false);
    }
  };

  // Vinculado: cada lectura fresca de Salud/Health Connect sustituye el
  // registro de hoy — deja de pedirse a mano (petición de Dani, 22-08).
  useEffect(() => {
    if (linked && healthSteps !== undefined && healthSteps !== null && healthSteps !== steps) {
      saveMutation.mutate({ val: healthSteps, source: healthSource });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linked, healthSteps]);

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
        {linked ? (
          <span className="flex items-center gap-1 text-caption font-sans text-success">
            <Icon name="check_circle" size="s" />
            Vinculado
          </span>
        ) : healthSupported ? (
          <Button variant="ghost" size="s" onClick={handleLink} loading={linking} icon="favorite" label="Vincular con Salud" />
        ) : !editing && (
          <Button variant="ghost" size="s" onClick={() => { setInput(String(steps)); setEditing(true); }} icon="edit" label="Editar" />
        )}
      </div>

      {editing && !linked ? (
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
