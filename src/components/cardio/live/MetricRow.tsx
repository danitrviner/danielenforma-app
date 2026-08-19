import React from 'react';

/* Fila de 3 métricas de FITIV (§4bis.1: "FC PROM. · METS · FC MAX"). Antes
   solo había 2 (faltaba METs, que ahora calcula el motor en vivo — ver
   displayLive en useCardioSession.tsx). Cifras en mono, regla del DS para
   datos frente a prosa.

   FC PROM. → FC actual (rastreo móvil, 17-08, a petición de Dani): el
   promedio de toda la sesión es poco útil mientras entrenas — lo que se
   mira de un vistazo es el pulso de ESTE momento. */

interface Props {
  bpm: number | null;
  mets?: number;
  maxHR?: number;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 bg-black/25 rounded-surface p-3 text-center">
      <p className="text-caption font-sans uppercase text-white/70">{label}</p>
      <p className="text-title-m font-mono font-bold text-white tabular-nums">{value}</p>
    </div>
  );
}

export default function MetricRow({ bpm, mets, maxHR }: Props) {
  return (
    <div className="flex gap-3 px-5">
      <Metric label="FC actual" value={bpm !== null ? String(bpm) : '--'} />
      <Metric label="METs" value={mets !== undefined ? mets.toFixed(1).replace('.', ',') : '--'} />
      <Metric label="FC máx." value={maxHR !== undefined ? String(maxHR) : '--'} />
    </div>
  );
}
