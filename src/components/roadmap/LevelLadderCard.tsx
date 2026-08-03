import React from 'react';
import { LadderStatus } from '../../utils/levelLadder';

interface Props {
  status: LadderStatus;
}

function fmtCriterionValue(kind: string, value: number | undefined): string {
  if (value == null) return '';
  if (kind === 'peso_perdido_kg') return `${value} kg`;
  if (kind === 'sentadilla_xbw') return `${value}x`;
  if (kind === 'pasos_media_diaria') return `${Math.round(value).toLocaleString('es-ES')}`;
  return `${value}`;
}

// Escalera vertical de niveles con nombres motivadores. Muestra el nivel
// actual y el checklist de criterios que faltan para el siguiente; los
// niveles superiores quedan con candado.
export default function LevelLadderCard({ status }: Props) {
  const { currentLevel, nextLevel, nextLevelCriteria } = status;

  return (
    <div className="rounded-canvas border border-hairline bg-bg p-5 flex flex-col gap-4">
      <p className="font-mono text-caption uppercase tracking-widest text-ink-2">Tu nivel</p>

      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-surface flex items-center justify-center flex-shrink-0 bg-accent/10 text-accent">
          <span className="material-symbols-outlined text-2xl">{currentLevel?.icon || 'military_tech'}</span>
        </div>
        <div>
          <p className="font-sans font-black text-lg text-white">{currentLevel?.name ?? 'Aún por empezar'}</p>
          {nextLevel && (
            <p className="text-ink-2 text-xs font-mono">Siguiente: {nextLevel.name}</p>
          )}
        </div>
      </div>

      {nextLevel && nextLevelCriteria.length > 0 && (
        <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
          {nextLevelCriteria.map(c => (
            <div key={c.criterion.id} className="flex items-center gap-2">
              <span
                className="material-symbols-outlined text-sm flex-shrink-0"
                style={{ color: c.done ? 'var(--color-success)' : 'var(--color-ink-3)' }}
              >
                {c.done ? 'check_circle' : 'radio_button_unchecked'}
              </span>
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-mono ${c.done ? 'text-success' : 'text-ink-2'}`}>
                  {c.criterion.label}
                </p>
                {c.criterion.kind !== 'manual' && (
                  <div className="h-1 rounded-full bg-raised overflow-hidden mt-1">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.max(4, c.pct)}%`, backgroundColor: c.done ? 'var(--color-success)' : 'var(--color-data)' }}
                    />
                  </div>
                )}
              </div>
              {c.criterion.kind !== 'manual' && c.currentValue != null && (
                <span className="font-mono text-caption text-ink-2 flex-shrink-0">
                  {fmtCriterionValue(c.criterion.kind, c.currentValue)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {!nextLevel && currentLevel && (
        <p className="text-xs font-mono text-accent pt-2 border-t border-hairline">
          Has llegado al nivel más alto de la escalera. 💪
        </p>
      )}
    </div>
  );
}
