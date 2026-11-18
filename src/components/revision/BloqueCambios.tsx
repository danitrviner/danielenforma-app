import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getCambiosAtleta } from '../../db/cambios';
import { getHipotesis, guardarHipotesis } from '../../db/hipotesis';
import type { AreaCambio, CambioAtleta } from '../../utils/cambiosAtleta';
import type { Exercise, WorkoutLog } from '../../types';
import { estadoDeHipotesis, type Hipotesis } from '../../utils/hipotesis';
import { addDays, hoyIsoLocal } from '../../utils/trainingWeek';
import { Icon, Skeleton } from '../ui';
import { useToast } from '../../hooks/useToast';
import HipotesisDeCambio, { type EjercicioParaMirar } from './HipotesisDeCambio';

/* ═══════════════════════════════════════════════════════════════════════════
   Lo que he cambiado — dos widgets, Nutrición y Entreno.

   Qué le he tocado a este atleta en el periodo que estoy revisando, con la
   flecha de antes → después. Sustituye a mirar el historial de la ficha, que
   mezcla propuestas, actividad del atleta y cambios en una sola lista.

   Los cambios de entreno llevan además su hipótesis (S5, 11-11-2026): qué se
   espera de él y cuándo se mira (ver HipotesisDeCambio.tsx). Un cambio cuya
   revisión ya toca se enseña SIEMPRE, aunque se hiciera antes del periodo que
   se está mirando: si no, vencería sin que nadie lo viera. En presentación no
   sale nada de esto: son notas de trabajo del coach.

   18-11-2026 · «Lo que cambio y por qué» en el vídeo: al presentar, cada
   cambio con hipótesis dice lo que se busca con él («Lo que busco: …», las
   palabras del coach), sin fechas ni antes/después; y las áreas sin cambios no
   salen (en su lugar, una línea si no se ha tocado nada).
   ═══════════════════════════════════════════════════════════════════════════ */

const VISIBLES = 4;
const LINEAS_POR_CAMBIO = 3;

const AREAS: { area: AreaCambio; titulo: string; icono: string; vacio: string }[] = [
  { area: 'nutricion', titulo: 'Nutrición', icono: 'restaurant', vacio: 'No has tocado la nutrición en este periodo.' },
  { area: 'entreno', titulo: 'Entreno', icono: 'fitness_center', vacio: 'No has tocado el entreno en este periodo.' },
];

function fecha(at: string): string {
  return new Date(at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

const Entrada: React.FC<{ c: CambioAtleta; abierta: boolean; porQue?: string; children?: React.ReactNode }> = ({ c, abierta, porQue, children }) => {
  const lineas = abierta ? c.lineas : c.lineas.slice(0, LINEAS_POR_CAMBIO);
  const resto = c.lineas.length - lineas.length;
  return (
    <li className="py-2.5 first:pt-0 last:pb-0 border-t first:border-t-0 border-hairline">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-sans text-label font-bold text-ink truncate">{c.titulo}</p>
        <span className="font-mono text-caption text-ink-3 flex-shrink-0">{fecha(c.at)}</span>
      </div>
      <ul className="m-0 mt-1 p-0 list-none space-y-0.5">
        {lineas.map((l, i) => (
          <li key={i} className="font-mono text-caption text-ink-2">{l}</li>
        ))}
        {resto > 0 && <li className="font-mono text-caption text-ink-3">+{resto} más</li>}
      </ul>
      {porQue && (
        <p className="mt-1 font-sans text-label text-ink text-pretty">
          <span className="text-ink-3">Lo que busco: </span>«{porQue}»
        </p>
      )}
      {children}
    </li>
  );
};

const Widget: React.FC<{
  cfg: typeof AREAS[number];
  cambios: CambioAtleta[];
  desde: string;
  hasta: string;
  todoAbierto: boolean;
  /** Solo en entreno y fuera de presentación: lo que hace falta para las hipótesis. */
  hipotesis?: {
    lista: Hipotesis[];
    logs: readonly WorkoutLog[];
    ejercicios: EjercicioParaMirar[];
    hoy: string;
    onGuardar: (h: Hipotesis) => void;
  };
  /** Al presentar: lo que se busca con cada cambio, si tiene hipótesis. */
  porQueDe?: (c: CambioAtleta) => string | undefined;
}> = ({ cfg, cambios, desde, hasta, todoAbierto, hipotesis, porQueDe }) => {
  const [verTodos, setVerTodos] = useState(false);
  const delPeriodo = (c: CambioAtleta) => {
    const dia = c.at.slice(0, 10);
    return dia >= desde && dia <= hasta;
  };
  const enPeriodo = cambios.filter(delPeriodo);
  // Lo que toca revisar y se cambió antes del periodo: arriba, siempre a la vista.
  const porRevisar = hipotesis
    ? cambios.filter(c => !delPeriodo(c) && hipotesis.lista.some(h => h.id === c.id && estadoDeHipotesis(h, hipotesis.hoy) === 'toca_revisar'))
    : [];
  const abierto = verTodos || todoAbierto;
  const lista = [...porRevisar, ...(abierto ? enPeriodo : enPeriodo.slice(0, VISIBLES))];
  const anteriores = cambios.length - enPeriodo.length;

  return (
    <section className="bg-surface border border-hairline rounded-surface p-4 space-y-3" aria-label={cfg.titulo}>
      <header className="flex items-center justify-between gap-2">
        <h4 className="font-sans font-bold text-label text-ink flex items-center gap-2">
          <Icon name={cfg.icono} size="s" className="text-accent-ink" />
          {cfg.titulo}
        </h4>
        <span className="font-mono text-caption text-ink-3">
          {enPeriodo.length} {enPeriodo.length === 1 ? 'cambio' : 'cambios'}
        </span>
      </header>

      {lista.length === 0 ? (
        <p className="font-sans text-label text-ink-3">{cfg.vacio}</p>
      ) : (
        <ul className="m-0 p-0 list-none">
          {lista.map(c => (
            <Entrada key={c.id} c={c} abierta={abierto} porQue={porQueDe?.(c)}>
              {hipotesis && (
                <HipotesisDeCambio
                  cambio={c}
                  hipotesis={hipotesis.lista.find(h => h.id === c.id)}
                  logs={hipotesis.logs}
                  ejercicios={hipotesis.ejercicios}
                  hoy={hipotesis.hoy}
                  onGuardar={hipotesis.onGuardar}
                />
              )}
            </Entrada>
          ))}
        </ul>
      )}

      {enPeriodo.length > VISIBLES && !todoAbierto && (
        <button
          type="button"
          onClick={() => setVerTodos(v => !v)}
          className="font-mono text-caption text-accent-ink hover:underline"
        >
          {verTodos ? 'Ver menos' : `Ver los ${enPeriodo.length - VISIBLES} anteriores`}
        </button>
      )}
      {anteriores > 0 && !porQueDe && (
        <p className="font-mono text-caption text-ink-4">
          {anteriores} {anteriores === 1 ? 'cambio' : 'cambios'} más fuera de este periodo.
        </p>
      )}
    </section>
  );
};

interface Props {
  athleteEmail: string;
  desde: string;
  hasta: string;
  todoAbierto: boolean;
  /** Para el antes y el después de las hipótesis. Sin ellos no se ofrecen. */
  logs?: WorkoutLog[];
  exercises?: Exercise[];
  /** En presentación las hipótesis no salen: son notas del coach. */
  presentando?: boolean;
}

/** Semanas hacia atrás de las que salen los ejercicios en los que se puede mirar un cambio. */
const SEMANAS_DE_EJERCICIOS = 10;

export default function BloqueCambios({ athleteEmail, desde, hasta, todoAbierto, logs, exercises, presentando = false }: Props) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const hoy = hoyIsoLocal();
  const conHipotesis = !presentando && !!logs && !!exercises;
  // También al presentar: de ahí sale el «por qué» de cada cambio.
  const { data: hipotesis = [] } = useQuery({
    queryKey: ['hipotesis', athleteEmail],
    queryFn: () => getHipotesis(athleteEmail),
    enabled: conHipotesis || presentando,
    staleTime: 60_000,
  });
  const ejercicios = useMemo<EjercicioParaMirar[]>(() => {
    if (!logs || !exercises) return [];
    const corte = addDays(hoy, -7 * SEMANAS_DE_EJERCICIOS);
    const ids = new Set(logs.filter(l => l.date >= corte).flatMap(l => l.entries.map(e => e.exerciseId)));
    return exercises.filter(e => ids.has(e.id)).map(e => ({ id: e.id, nombre: e.name })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [logs, exercises, hoy]);
  const guardar = (h: Hipotesis) => {
    const antes = queryClient.getQueryData<Hipotesis[]>(['hipotesis', athleteEmail]);
    queryClient.setQueryData<Hipotesis[]>(['hipotesis', athleteEmail], prev => [...(prev ?? []).filter(x => x.id !== h.id), h]);
    guardarHipotesis(athleteEmail, h).catch(err => {
      console.error('BloqueCambios: no se pudo guardar la hipótesis', err);
      queryClient.setQueryData(['hipotesis', athleteEmail], antes);
      showToast('No se ha podido guardar', 'error');
    });
  };

  const { data = [], isPending, isError } = useQuery({
    queryKey: ['cambiosAtleta', athleteEmail],
    queryFn: () => getCambiosAtleta(athleteEmail),
    staleTime: 60_000,
  });

  if (isPending) return <Skeleton className="h-24 w-full" />;
  if (isError) {
    return <p className="font-sans text-label text-ink-3">No se ha podido cargar el historial de cambios.</p>;
  }

  const delPeriodo = (c: CambioAtleta) => c.at.slice(0, 10) >= desde && c.at.slice(0, 10) <= hasta;
  // Al presentar, solo las áreas con algún cambio en el periodo.
  const areas = presentando ? AREAS.filter(cfg => data.some(c => c.area === cfg.area && delPeriodo(c))) : AREAS;
  if (areas.length === 0) {
    return <p className="font-sans text-label text-ink-2">Esta semana no he cambiado nada: seguimos con el plan.</p>;
  }
  const porQueDe = presentando
    ? (c: CambioAtleta) => hipotesis.find(h => h.id === c.id || h.cambioId === c.id)?.espero?.trim() || undefined
    : undefined;

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {areas.map(cfg => (
        <Widget
          key={cfg.area}
          cfg={cfg}
          cambios={data.filter(c => c.area === cfg.area)}
          desde={desde}
          hasta={hasta}
          todoAbierto={todoAbierto}
          hipotesis={conHipotesis && cfg.area === 'entreno' ? { lista: hipotesis, logs: logs!, ejercicios, hoy, onGuardar: guardar } : undefined}
          porQueDe={porQueDe}
        />
      ))}
    </div>
  );
}
