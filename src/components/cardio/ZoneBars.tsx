import React from 'react';
import { CardioZones } from '../../types';
import { ZONE_ORDER, ZONE_LABEL, ZONE_COLOR, BELOW_ZONE_LABEL, BELOW_ZONE_COLOR } from '../../utils/cardioZones';

/* Tiempo por zona en vivo — página 3 del carrusel de FITIV (§4bis.2bis del
   análisis): cada fila es una barra de progreso horizontal con un círculo
   del color de zona a la izquierda DENTRO de la propia barra, el % superpuesto
   sobre el relleno, y el tiempo alineado a la derecha, fuera de la barra.
   Se conserva el nombre de zona (F1/F2/…) que FITIV no rotula — ahí confían
   en que el orden de arriba abajo se recuerde de memoria; aquí se prefiere
   legible sin tener que memorizar nada. */

interface Props {
  timeInZone: Record<keyof CardioZones, number>;
  belowZoneSec: number;
  elapsedSec: number;
  /** Zona en la que está el atleta ahora mismo — pinta "AHORA" en su fila (§, panel "Zonas de Frecuencia" de Graficas - Experiencia.dc.html). `null`/`undefined` = ninguna fila marcada (p. ej. por debajo de Z1). */
  currentZone?: keyof CardioZones | null;
}

function fmt(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

export default function ZoneBars({ timeInZone, belowZoneSec, elapsedSec, currentZone }: Props) {
  const total = Math.max(elapsedSec, 1);
  const rows = [
    ...[...ZONE_ORDER].reverse().map(z => ({ key: z, label: ZONE_LABEL[z], color: ZONE_COLOR[z], sec: timeInZone[z] })),
    { key: 'below', label: BELOW_ZONE_LABEL, color: BELOW_ZONE_COLOR, sec: belowZoneSec },
  ];

  return (
    <div className="space-y-2">
      {rows.map(row => {
        const pct = Math.min(100, Math.round((row.sec / total) * 100));
        return (
          <div key={row.key} className="flex items-center gap-2">
            <div className="relative flex-1 h-8 rounded-full overflow-hidden" style={{ backgroundColor: `${row.color}14` }}>
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-(--duration-state)"
                style={{ width: `${Math.max(pct, 6)}%`, backgroundColor: `${row.color}55` }}
              />
              <div className="relative h-full flex items-center gap-2 px-3">
                <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
                <span className="text-caption font-sans uppercase truncate" style={{ color: row.color }}>{row.label}</span>
                {row.key === currentZone && (
                  <span className="text-caption font-mono font-bold uppercase text-ink shrink-0">Ahora</span>
                )}
                <span className="ml-auto text-caption font-mono font-bold text-ink tabular-nums">{pct}%</span>
              </div>
            </div>
            <span className="text-caption font-mono text-ink-2 tabular-nums w-10 text-right shrink-0">{fmt(row.sec)}</span>
          </div>
        );
      })}
    </div>
  );
}
