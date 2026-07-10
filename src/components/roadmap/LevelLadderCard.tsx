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
    <div className="rounded-3xl border border-white/7 bg-[#121212] p-5 flex flex-col gap-4">
      <p className="font-mono text-[9px] uppercase tracking-widest text-[#c6c9ab]">Tu nivel</p>

      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 bg-[#fbcb1a]/10 text-[#fbcb1a]">
          <span className="material-symbols-outlined text-2xl">{currentLevel?.icon || 'military_tech'}</span>
        </div>
        <div>
          <p className="font-sans font-black text-lg text-white">{currentLevel?.name ?? 'Aún por empezar'}</p>
          {nextLevel && (
            <p className="text-[#c6c9ab] text-xs font-mono">Siguiente: {nextLevel.name}</p>
          )}
        </div>
      </div>

      {nextLevel && nextLevelCriteria.length > 0 && (
        <div className="flex flex-col gap-2 pt-2 border-t border-white/7">
          {nextLevelCriteria.map(c => (
            <div key={c.criterion.id} className="flex items-center gap-2">
              <span
                className="material-symbols-outlined text-sm flex-shrink-0"
                style={{ color: c.done ? '#8ac926' : '#555' }}
              >
                {c.done ? 'check_circle' : 'radio_button_unchecked'}
              </span>
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-mono ${c.done ? 'text-[#8ac926]' : 'text-[#c6c9ab]'}`}>
                  {c.criterion.label}
                </p>
                {c.criterion.kind !== 'manual' && (
                  <div className="h-1 rounded-full bg-[#1e1e1b] overflow-hidden mt-1">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.max(4, c.pct)}%`, backgroundColor: c.done ? '#8ac926' : '#00eefc' }}
                    />
                  </div>
                )}
              </div>
              {c.criterion.kind !== 'manual' && c.currentValue != null && (
                <span className="font-mono text-[9px] text-[#c6c9ab] flex-shrink-0">
                  {fmtCriterionValue(c.criterion.kind, c.currentValue)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {!nextLevel && currentLevel && (
        <p className="text-xs font-mono text-[#fbcb1a] pt-2 border-t border-white/7">
          Has llegado al nivel más alto de la escalera. 💪
        </p>
      )}
    </div>
  );
}
