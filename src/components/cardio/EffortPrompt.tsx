import React, { useState } from 'react';
import { PE_LABELS, peLabel } from '../../utils/cardioMetrics';

// Paso previo a guardar: Esfuerzo Percibido 1–10 (§5.4 del análisis) — la
// única carga de entrenamiento válida también para fuerza, y lo que alimenta
// Effort Minutes. FITIV lo autoestima desde la FC; aquí se sugiere por zona
// dominante (suggestedPerceivedEffort) y el atleta lo ajusta antes de guardar.

interface Props {
  suggested: number;
  onConfirm: (pe: number) => void;
  saving: boolean;
}

export default function EffortPrompt({ suggested, onConfirm, saving }: Props) {
  const [pe, setPe] = useState(suggested);

  return (
    <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center bg-bg px-6">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div>
          <p className="text-caption font-mono uppercase text-ink-2 tracking-wider">Esfuerzo percibido</p>
          <p className="font-sans font-black text-6xl text-accent tabular-nums mt-2">{pe}</p>
          <p className="text-sm font-sans font-semibold text-white mt-1">{peLabel(pe)}</p>
        </div>

        <input
          type="range" min={1} max={10} step={1} value={pe}
          onChange={e => setPe(Number(e.target.value))}
          className="w-full accent-accent"
        />
        <div className="flex justify-between text-caption font-mono text-ink-2 px-1">
          <span>{PE_LABELS[0]}</span>
          <span>{PE_LABELS[9]}</span>
        </div>

        <button onClick={() => onConfirm(pe)} disabled={saving}
          className="w-full py-3 bg-accent text-black font-sans font-bold text-xs uppercase rounded-control hover:bg-accent-press active:scale-95 transition-all disabled:opacity-50">
          {saving ? 'Guardando...' : 'Guardar sesión'}
        </button>
      </div>
    </div>
  );
}
