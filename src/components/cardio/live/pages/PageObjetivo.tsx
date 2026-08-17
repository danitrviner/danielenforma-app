import React from 'react';
import { CardioIntervalBlock, CardioZones } from '../../../../types';
import { ZONE_LABEL } from '../../../../utils/cardioZones';

/* Página 1 del carrusel — en FITIV es "Ritmo" (`--:--` en cinta sin GPS, que
   está aplazado, §F7 del análisis). En vez de dejar un guión fijo que no
   dice nada, aquí va lo que hoy SÍ hay: el bloque de intervalos en curso o
   el objetivo de Zona 2, que antes vivían sueltos encima de la fila de
   métricas y ahora tienen página propia. */

function fmtClock(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

interface Props {
  intervalBlocks?: CardioIntervalBlock[] | null;
  currentBlockIndex?: number;
  blockRemainingSec?: number;
  targetZone?: keyof CardioZones;
  targetDurationSec?: number;
  targetProgressSec: number;
}

export default function PageObjetivo({ intervalBlocks, currentBlockIndex, blockRemainingSec, targetZone, targetDurationSec, targetProgressSec }: Props) {
  if (intervalBlocks && currentBlockIndex !== undefined) {
    const next = intervalBlocks[currentBlockIndex + 1];
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
        <p className="text-caption font-mono uppercase text-white/80">
          Bloque {currentBlockIndex + 1}/{intervalBlocks.length} · {intervalBlocks[currentBlockIndex].label}
        </p>
        <p className="font-sans font-extrabold text-display text-white tabular-nums">{fmtClock(blockRemainingSec ?? 0)}</p>
        {next && <p className="text-caption font-sans text-white/60">Siguiente: {next.label}</p>}
      </div>
    );
  }

  if (targetZone) {
    const fraction = targetDurationSec ? Math.min(targetProgressSec / targetDurationSec, 1) : null;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-8">
        <p className="text-caption font-sans uppercase text-white/80 text-center">
          Objetivo: {ZONE_LABEL[targetZone]}
          {targetDurationSec ? ` · ${fmtClock(targetProgressSec)} / ${fmtClock(targetDurationSec)}` : ` · ${fmtClock(targetProgressSec)}`}
        </p>
        {fraction !== null && (
          <div className="h-2 w-full rounded-full bg-black/30 overflow-hidden">
            <div className="h-full rounded-full bg-white transition-[width] duration-1000" style={{ width: `${fraction * 100}%` }} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 px-8 text-center">
      <p className="font-mono text-display text-white/50">--:--</p>
      <p className="text-caption font-sans uppercase text-white/50">Sesión libre, sin objetivo</p>
    </div>
  );
}
