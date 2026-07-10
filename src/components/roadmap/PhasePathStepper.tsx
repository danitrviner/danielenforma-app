import React from 'react';
import { PlanPhase } from '../../types';

interface Props {
  phases: PlanPhase[];
}

// Camino de fases: completadas → actual → futuras. Las futuras se muestran
// legibles (no ocultas) bajo "lo que te queda por delante" — es la pieza que
// vende la renovación, mostrando que el plan sigue más allá de hoy.
export default function PhasePathStepper({ phases }: Props) {
  if (phases.length === 0) return null;
  const ordered = [...phases].sort((a, b) => a.order - b.order);

  return (
    <div className="rounded-3xl border border-white/7 bg-[#121212] p-5">
      <p className="font-mono text-[9px] uppercase tracking-widest text-[#c6c9ab] mb-4">
        Tu camino · lo que te queda por delante
      </p>
      <div className="flex flex-col gap-3">
        {ordered.map((phase, idx) => {
          const isLast = idx === ordered.length - 1;
          const isDone = phase.status === 'completada';
          const isActive = phase.status === 'actual';
          const isFuture = phase.status === 'futura';
          return (
            <div key={phase.id} className="flex gap-3">
              <div className="flex flex-col items-center flex-shrink-0">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center border-2"
                  style={{
                    borderColor: isFuture ? '#2a2a2a' : phase.color,
                    backgroundColor: isActive ? `${phase.color}22` : 'transparent',
                    color: isDone ? phase.color : isActive ? phase.color : '#555',
                  }}
                >
                  <span className="material-symbols-outlined text-base">
                    {isDone ? 'check' : phase.icon || 'circle'}
                  </span>
                </div>
                {!isLast && (
                  <div
                    className="w-0.5 flex-1 min-h-[24px] mt-1"
                    style={{ backgroundColor: isDone ? phase.color : '#2a2a2a' }}
                  />
                )}
              </div>
              <div className={`pb-3 ${isFuture ? 'opacity-70' : ''}`}>
                <p
                  className="font-sans font-bold text-sm"
                  style={{ color: isActive ? phase.color : isDone ? '#e2e2e1' : '#c6c9ab' }}
                >
                  {phase.name}
                  {isActive && (
                    <span className="ml-2 font-mono text-[8px] uppercase tracking-widest align-middle" style={{ color: phase.color }}>
                      ahora
                    </span>
                  )}
                </p>
                {(phase.motto || phase.description) && (
                  <p className="text-[#c6c9ab] text-xs font-mono mt-0.5 leading-relaxed">
                    {phase.motto || phase.description}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
