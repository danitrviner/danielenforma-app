import React from 'react';
import { Icon } from '../ui';

/** Agua y raciones de verdura/fruta del día, contra los mínimos que ha puesto
 *  el coach en la periodización. Un toque suma; nada de formularios. */
export default function HabitosDelDia({ minimos, aguaMl, raciones, onCambiar }: {
  minimos: { aguaL?: number; raciones?: number };
  aguaMl: number;
  raciones: number;
  onCambiar: (patch: { aguaMl?: number; racionesVegetales?: number }) => void;
}) {
  const fila = (
    etiqueta: string, valor: string, objetivo: string, llega: boolean,
    menos: () => void, mas: () => void, masTexto: string, nombre: string,
  ) => (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="font-sans font-bold text-label text-ink">{etiqueta}</p>
        <p className={`font-mono text-caption tabular-nums ${llega ? 'text-success' : 'text-ink-2'}`}>{valor} de {objetivo}{llega ? ' · hecho' : ''}</p>
      </div>
      <button type="button" onClick={menos} aria-label={`Quitar ${nombre}`}
        className="w-9 h-9 rounded-control bg-inset text-ink-2 font-mono font-bold hover:bg-hairline">−</button>
      <button type="button" onClick={mas} aria-label={`Añadir ${nombre}`}
        className="h-9 px-3 rounded-control bg-accent/14 text-accent-ink font-mono text-label font-bold hover:bg-accent/22">{masTexto}</button>
    </div>
  );
  return (
    <section className="rounded-surface border border-hairline bg-surface px-4 py-3 space-y-3" aria-label="Hábitos del día">
      <p className="flex items-center gap-1.5 font-mono text-caption uppercase tracking-wider text-ink-2">
        <Icon name="checklist" size="s" />Mínimos del día
      </p>
      {minimos.aguaL ? fila(
        'Agua', `${(aguaMl / 1000).toLocaleString('es-ES', { maximumFractionDigits: 2 })} L`, `${minimos.aguaL.toLocaleString('es-ES')} L`,
        aguaMl >= minimos.aguaL * 1000,
        () => onCambiar({ aguaMl: Math.max(0, aguaMl - 250) }), () => onCambiar({ aguaMl: aguaMl + 250 }), '+ vaso', 'un vaso de agua',
      ) : null}
      {minimos.raciones ? fila(
        'Verdura y fruta', `${raciones} raciones`, `${minimos.raciones}`, raciones >= minimos.raciones,
        () => onCambiar({ racionesVegetales: Math.max(0, raciones - 1) }), () => onCambiar({ racionesVegetales: raciones + 1 }), '+ ración', 'una ración',
      ) : null}
    </section>
  );
}
