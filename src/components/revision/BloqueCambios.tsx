import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getCambiosAtleta } from '../../db/cambios';
import type { AreaCambio, CambioAtleta } from '../../utils/cambiosAtleta';
import { Icon, Skeleton } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Lo que he cambiado — dos widgets, Nutrición y Entreno.

   Qué le he tocado a este atleta en el periodo que estoy revisando, con la
   flecha de antes → después. Sustituye a mirar el historial de la ficha, que
   mezcla propuestas, actividad del atleta y cambios en una sola lista.
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

const Entrada: React.FC<{ c: CambioAtleta; abierta: boolean }> = ({ c, abierta }) => {
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
    </li>
  );
};

const Widget: React.FC<{
  cfg: typeof AREAS[number];
  cambios: CambioAtleta[];
  desde: string;
  hasta: string;
  todoAbierto: boolean;
}> = ({ cfg, cambios, desde, hasta, todoAbierto }) => {
  const [verTodos, setVerTodos] = useState(false);
  const enPeriodo = cambios.filter(c => {
    const dia = c.at.slice(0, 10);
    return dia >= desde && dia <= hasta;
  });
  const abierto = verTodos || todoAbierto;
  const lista = abierto ? enPeriodo : enPeriodo.slice(0, VISIBLES);
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
          {lista.map(c => <Entrada key={c.id} c={c} abierta={abierto} />)}
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
      {anteriores > 0 && (
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
}

export default function BloqueCambios({ athleteEmail, desde, hasta, todoAbierto }: Props) {
  const { data = [], isPending, isError } = useQuery({
    queryKey: ['cambiosAtleta', athleteEmail],
    queryFn: () => getCambiosAtleta(athleteEmail),
    staleTime: 60_000,
  });

  if (isPending) return <Skeleton className="h-24 w-full" />;
  if (isError) {
    return <p className="font-sans text-label text-ink-3">No se ha podido cargar el historial de cambios.</p>;
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {AREAS.map(cfg => (
        <Widget
          key={cfg.area}
          cfg={cfg}
          cambios={data.filter(c => c.area === cfg.area)}
          desde={desde}
          hasta={hasta}
          todoAbierto={todoAbierto}
        />
      ))}
    </div>
  );
}
