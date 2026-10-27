import React, { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { StepLog } from '../types';
import { getAthleteNutritionConfig, getStepsForDate, addSteps, updateSteps, getNutritionProgram } from '../dbService';
import { objetivoDePasos } from '../utils/semanasNutricion';
import { todayStr } from '../utils/questionnaireSchedule';
import { DEFAULT_KCAL_PER_STEP } from '../utils/nutritionConstants';
import { isHealthStepsSupported, isHealthStepsLinked, linkHealthSteps, getTodaySteps } from '../services/healthSteps';
import { Skeleton } from './ui';
import { Icon, Button, Sheet } from './ui';
import { useCifraQueSube } from '../hooks/useCifraQueSube';

interface Props {
  athleteEmail: string;
  /**
   * Versión pequeña, para la segunda fila de Inicio: una tarjeta de columna
   * con la cifra y la barra, sin la fila de acciones. Desde 09-2026 los pasos
   * suben arriba del todo, y ahí no cabe —ni hace falta— la carcasa entera.
   */
  compacto?: boolean;
}

const DEFAULT_STEP_GOAL = 8000;

function stepsForAthleteKey(athleteEmail: string) {
  return ['stepsForAthlete', athleteEmail] as const;
}

export default function StepsWidget({ athleteEmail, compacto = false }: Props) {
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

  // La periodización puede subir los pasos por semanas; manda sobre el fijo.
  const { data: programa = null } = useQuery({
    queryKey: ['nutritionProgram', athleteEmail],
    queryFn: () => getNutritionProgram(athleteEmail).catch(() => null),
  });
  const goal = objetivoDePasos(programa, todayStr(), config?.stepGoal) || DEFAULT_STEP_GOAL;
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
      //
      // `setQueriesData` y no `setQueryData`: desde que las pantallas del
      // atleta piden los pasos CON VENTANA, la clave lleva un tercer elemento
      // con la fecha de inicio. Un `setQueryData` con la clave corta no habría
      // encontrado ninguna de ellas y el calendario habría seguido enseñando
      // los pasos de antes de guardar, sin error que lo delatara.
      queryClient.setQueriesData<StepLog[]>({ queryKey: stepsKey }, prev => {
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
  const pasosAnimados = useCifraQueSube(steps);
  const kcalEarned = Math.round(steps * kcalPerStep);

  if (loading) {
    return (
      <div className="bg-surface border border-hairline rounded-surface p-4">
        <Skeleton className={compacto ? 'h-24 w-full' : 'h-16 w-full'} />
      </div>
    );
  }

  if (compacto) {
    // `button` cuando se puede tocar, `div` cuando no. Ver más abajo.
    const Envoltorio = (linked ? 'div' : 'button') as React.ElementType;
    /* Sin vincular Y sin nada apuntado hoy, la tarjeta NO enseña «0 / 8.000»:
       un cero es un hueco con forma de dato y encima desanima justo a quien
       menos ha andado. Enseña el OBJETIVO de hoy, apagado, con la barra vacía
       y la invitación debajo; mide lo mismo que la tarjeta con datos para que
       la pantalla no pegue un salto el día que los haya. Antes era una tarjeta
       de puro texto que en la web (sin Salud) no decía nada del objetivo
       (Dani, 15-10-2026). */
    const vacio = !linked && steps === 0;
    const alTocar = vacio && healthSupported
      ? handleLink
      : () => { setInput(steps ? String(steps) : ''); setEditing(true); };
    return (
      <>
        <Envoltorio
          {...(linked ? {} : { onClick: alTocar })}
          aria-label={vacio
            ? `Pasos de hoy: objetivo ${goal.toLocaleString('es-ES')}. ${healthSupported ? 'Pulsa para conectarlo con Salud.' : 'Pulsa para apuntar los de hoy.'}`
            : `Pasos de hoy: ${steps.toLocaleString('es-ES')} de ${goal.toLocaleString('es-ES')}.${
                remaining > 0 ? ` Te faltan ${remaining.toLocaleString('es-ES')}.` : ' Objetivo cumplido.'
              }${linked ? '' : ' Pulsa para editarlos.'}`}
          className={`text-left bg-surface border rounded-surface p-4 flex flex-col gap-2 transition-colors duration-(--duration-state) ${
            vacio ? 'border-dashed border-strong hover:border-accent-line' : linked ? 'border-hairline' : 'border-hairline hover:border-strong'
          }`}
        >
          <p className="font-mono text-caption uppercase tracking-wider text-accent-ink flex items-center gap-1.5">
            {vacio ? 'Pasos · objetivo' : 'Pasos'}
            {linked && <Icon name="check_circle" size="s" className="text-success" label="Vinculado con Salud" />}
          </p>
          <p className={`font-mono font-bold text-feature tracking-tight leading-none tabular-nums ${vacio ? 'text-ink-3' : 'text-ink'}`}>
            {vacio ? goal.toLocaleString('es-ES') : Math.round(pasosAnimados).toLocaleString('es-ES')}
          </p>
          <div className="h-[26px] flex items-center">
            <div className="h-1.5 w-full bg-track rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-[color,background-color,border-color,opacity,transform,box-shadow] duration-(--duration-slide)"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
          <p className="font-mono text-caption text-ink-4 leading-snug">
            {vacio
              ? (healthSupported ? 'Conéctalo con Salud' : 'Toca y apunta los de hoy')
              : <>de {goal.toLocaleString('es-ES')}{remaining > 0 ? ` · faltan ${remaining.toLocaleString('es-ES')}` : ' · cumplido'}</>}
          </p>
        </Envoltorio>
        {/* Antes el toque ponía `editing` a true pero esta rama nunca pintaba el
            campo (solo la versión grande lo hacía): en la web la tarjeta no
            respondía. */}
        <Sheet
          open={editing && !linked}
          onClose={() => setEditing(false)}
          title="Pasos de hoy"
          size="s"
          footer={<Button onClick={handleSave} loading={saving} className="w-full">Guardar</Button>}
        >
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={100000}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
            placeholder="0"
            autoFocus
            aria-label="Pasos de hoy"
            className="w-full bg-raised border border-control-line rounded-control px-3 py-2 text-ink font-mono text-title-s focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <p className="mt-2 font-mono text-caption text-ink-3">Objetivo de hoy: {goal.toLocaleString('es-ES')}</p>
        </Sheet>
      </>
    );
  }

  return (
    <div className="bg-surface border border-hairline rounded-surface p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-sans font-bold text-body-s text-ink flex items-center gap-2">
          <Icon name="directions_walk" size="m" className="text-accent-ink" />
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
            className="flex-1 bg-raised border border-control-line rounded-control px-3 py-2 text-ink font-mono text-title-s focus:outline-none focus:ring-1 focus:ring-accent"
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
              <span className="text-title-s font-bold text-ink">{steps.toLocaleString('es-ES')}</span>
              <span className="text-caption text-ink-2"> / {goal.toLocaleString('es-ES')}</span>
            </p>
            <p className="truncate text-caption text-ink-2">
              {remaining > 0
                ? <>Faltan <span className="font-bold text-accent-ink">{remaining.toLocaleString('es-ES')}</span></>
                : <span className="font-bold text-success">Objetivo cumplido</span>}
              <span className="text-ink-3"> · +{kcalEarned.toLocaleString('es-ES')} kcal</span>
            </p>
          </div>
          <div className="h-1.5 bg-track rounded-full overflow-hidden">
            <div className="h-full bg-accent rounded-full transition-[color,background-color,border-color,opacity,transform,box-shadow] duration-300" style={{ width: `${pct}%` }} />
          </div>
        </>
      )}
    </div>
  );
}
