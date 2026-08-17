import React from 'react';

/* Página 2 del carrusel — CAL ACTIVA · CAL TOTAL · PUNTOS (§4.7 del análisis
   FITIV). Sale de `displayLive` del motor (F4 de este plan): mismo cálculo
   que el post-entreno (Keytel, METs, Points), recalculado cada submuestreo.
   Sin peso/edad/sexo en la anamnesis no hay cifra — nunca se inventa una. */

interface Props {
  caloriesKcal?: number;
  caloriesActiveKcal?: number;
  points?: number;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 text-center">
      <p className="font-mono text-display font-bold text-white tabular-nums">{value}</p>
      <p className="text-caption font-sans uppercase text-white/70 mt-1">{label}</p>
    </div>
  );
}

export default function PageCalorias({ caloriesKcal, caloriesActiveKcal, points }: Props) {
  return (
    <div className="flex h-full items-center justify-center gap-4 px-6">
      <Stat label="Cal. activa" value={caloriesActiveKcal !== undefined ? String(Math.round(caloriesActiveKcal)) : '--'} />
      <Stat label="Cal. total" value={caloriesKcal !== undefined ? String(Math.round(caloriesKcal)) : '--'} />
      <Stat label="Puntos" value={points !== undefined ? String(points) : '--'} />
    </div>
  );
}
