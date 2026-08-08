import React from 'react';
import { ExerciseBestProgress } from '../utils/athleteMetrics';
import { Sparkline } from './ui';

interface Props {
  progress: ExerciseBestProgress;
  trend: number[];
}

/**
 * "Tu mejor serie" de la ficha de ejercicio (Biblioteca - Experiencia, panel
 * 02) — mejor set histórico + kg de diferencia vs. el mejor anterior +
 * `Sparkline` de las últimas sesiones (la propia primitiva, de F3.3, ya
 * apuntaba a este uso en su comentario).
 */
export default function ExerciseBestSetCard({ progress, trend }: Props) {
  const { current, deltaKgVsPrevious } = progress;
  return (
    <div className="p-4 bg-bg border-t border-hairline space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="font-sans text-caption text-ink-2 uppercase tracking-widest">Tu mejor serie</p>
          <p className="font-display text-title-l font-bold text-ink mt-1">
            {current.weight}<span className="text-label font-sans font-normal text-ink-2"> kg × {current.reps}</span>
          </p>
        </div>
        {deltaKgVsPrevious != null && deltaKgVsPrevious !== 0 && (
          <span className={`font-sans text-caption font-bold px-2 py-1 rounded-control shrink-0 ${
            deltaKgVsPrevious > 0 ? 'bg-success/14 text-success' : 'bg-danger/14 text-danger'
          }`}>
            {deltaKgVsPrevious > 0 ? '+' : ''}{deltaKgVsPrevious} KG
          </span>
        )}
      </div>
      {trend.length >= 2 && (
        <>
          <Sparkline values={trend} label={`Progresión de peso, últimas ${trend.length} sesiones`} />
          <p className="font-sans text-caption text-ink-3">Últimas {trend.length} sesiones</p>
        </>
      )}
    </div>
  );
}
