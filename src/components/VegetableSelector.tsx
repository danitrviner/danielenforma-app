import React from 'react';
import { VEGETABLES } from '../data/micronutrients';
import { Chip } from './ui';

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
    <div className="flex flex-wrap gap-2">
      {VEGETABLES.map(v => (
        <Chip key={v.id} selected={selected.includes(v.id)} onClick={() => onToggle(v.id)}>{v.label}</Chip>
      ))}
    </div>
  );
}
