import React from 'react';
import { VEGETABLES } from '../data/micronutrients';

interface Props {
  selected: string[];
  onToggle: (id: string) => void;
}

// Chips de verduras habituales — compartido entre el panel de análisis del coach
// y la pantalla de nutrición del atleta; ambos escriben en la misma
// AthleteNutritionConfig.vegTypes, así la estimación de micros usa el perfil
// real de verduras en los dos lados.
export default function VegetableSelector({ selected, onToggle }: Props) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {VEGETABLES.map(v => {
        const on = selected.includes(v.id);
        return (
          <button
            key={v.id}
            onClick={() => onToggle(v.id)}
            className={`px-2.5 py-1.5 rounded-full text-[10px] font-mono font-bold border transition-all ${
              on
                ? 'bg-accent/15 border-accent/50 text-accent'
                : 'bg-[#1e1e1b] border-white/7 text-ink-2 hover:text-white hover:border-white/20'
            }`}
          >
            {on ? '✓ ' : ''}{v.label}
          </button>
        );
      })}
    </div>
  );
}
