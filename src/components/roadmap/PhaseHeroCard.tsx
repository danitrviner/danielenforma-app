import React from 'react';
import { PlanPhase } from '../../types';
import { PhaseProgress } from '../../utils/planPhase';
import { PhaseWeightStatus } from '../../utils/planNutritionBridge';
import ProgressRing from '../ProgressRing';
import StatTile from '../StatTile';

interface Props {
  phase: PlanPhase;
  progress: PhaseProgress;
  weightStatus?: PhaseWeightStatus | null;
}

// Hero de la fase actual: nombre motivador, % de avance de sus métricas
// objetivo y lo que hace falta para pasar a la siguiente fase.
export default function PhaseHeroCard({ phase, progress, weightStatus }: Props) {
  return (
    <div
      className="rounded-3xl border p-5 flex flex-col gap-4"
      style={{ backgroundColor: '#121212', borderColor: `${phase.color}33`, boxShadow: `0 0 24px ${phase.color}14` }}
    >
      <div className="flex items-center gap-4">
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${phase.color}1a`, color: phase.color }}
        >
          <span className="material-symbols-outlined text-2xl">{phase.icon || 'route'}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-mono text-[9px] uppercase tracking-widest text-[#c6c9ab]">Fase actual</p>
          <h2 className="font-sans font-black text-xl text-white uppercase tracking-tight truncate">{phase.name}</h2>
          {phase.motto && <p className="text-[#c6c9ab] text-xs font-mono mt-0.5">{phase.motto}</p>}
        </div>
        <ProgressRing pct={progress.overallPct} color={phase.color} label="Fase" />
      </div>

      {phase.description && (
        <p className="text-[#e2e2e1] text-sm leading-relaxed">{phase.description}</p>
      )}

      {progress.metrics.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {progress.metrics.map(m => (
            <StatTile
              key={m.metric.id}
              icon={m.done ? 'check_circle' : 'trending_up'}
              label={m.metric.label}
              value={m.metric.kind === 'manual' ? (m.done ? 'Hecho' : 'Pendiente') : `${Math.round(m.pct)}%`}
              accent={m.done ? '#8ac926' : phase.color}
            />
          ))}
        </div>
      )}

      {weightStatus && (
        <div className="pt-2 border-t border-white/7">
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-mono text-[9px] uppercase tracking-widest text-[#c6c9ab]">Peso en esta fase</span>
            {weightStatus.targetKg != null && (
              <span className="font-mono text-[9px] text-[#c6c9ab]">objetivo {weightStatus.targetKg} kg</span>
            )}
          </div>
          <div className="h-2 rounded-full bg-[#1e1e1b] overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.max(4, weightStatus.pct)}%`, backgroundColor: phase.color }}
            />
          </div>
          <p className="font-mono text-[9px] text-[#c6c9ab] mt-1">
            {weightStatus.currentKg != null ? `${weightStatus.currentKg} kg` : 'sin pesaje'}
            {weightStatus.projectedKg != null && ` · proyección ${weightStatus.projectedKg} kg`}
          </p>
        </div>
      )}

      {phase.exitCriteria && (
        <div className="flex items-start gap-2 pt-2 border-t border-white/7">
          <span className="material-symbols-outlined text-sm text-[#c6c9ab] mt-0.5">flag</span>
          <p className="text-[#c6c9ab] text-xs font-mono leading-relaxed">
            <span className="text-white">Para pasar a la siguiente fase:</span> {phase.exitCriteria}
          </p>
        </div>
      )}
    </div>
  );
}
