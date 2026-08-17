import React from 'react';

/* Página 5 del carrusel — en FITIV es la de métricas configurables
   (Duración · Intensidad de FC · Puntos · Distancia · Ritmo · Velocidad,
   elegidas por el atleta). Ese picker es F8 de este plan; mientras tanto
   esta página no se deja vacía — muestra duración e intensidad, que hoy no
   aparecen en ninguna otra página del carrusel. F8 sustituye este contenido
   fijo por el catálogo elegible, no cambia el hueco. */

function fmtClock(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

interface Props {
  elapsedSec: number;
  bpm: number | null;
  maxHR?: number;
}

export default function PageOtras({ elapsedSec, bpm, maxHR }: Props) {
  const intensityPct = bpm !== null && maxHR ? Math.round((bpm / maxHR) * 100) : null;
  return (
    <div className="flex h-full items-center justify-center gap-6 px-8">
      <div className="text-center">
        <p className="font-mono text-display font-bold text-white tabular-nums">{fmtClock(elapsedSec)}</p>
        <p className="text-caption font-sans uppercase text-white/70 mt-1">Duración</p>
      </div>
      <div className="text-center">
        <p className="font-mono text-display font-bold text-white tabular-nums">{intensityPct !== null ? `${intensityPct}%` : '--'}</p>
        <p className="text-caption font-sans uppercase text-white/70 mt-1">Intensidad</p>
      </div>
    </div>
  );
}
