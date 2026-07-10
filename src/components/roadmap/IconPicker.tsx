import React from 'react';

// Grid de iconos DIBUJADOS con etiqueta en español — sustituye los <select> de
// nombres técnicos (material symbol names) que el coach no reconoce a simple
// vista. Un icono guardado que no esté en esta lista curada se añade como
// opción extra al final, para no perder datos de docs ya existentes.
export const ICON_OPTIONS: { icon: string; label: string }[] = [
  { icon: 'route', label: 'Camino' },
  { icon: 'foundation', label: 'Cimientos' },
  { icon: 'local_fire_department', label: 'Fuego' },
  { icon: 'balance', label: 'Equilibrio' },
  { icon: 'fitness_center', label: 'Pesas' },
  { icon: 'content_cut', label: 'Mini-cut' },
  { icon: 'rocket_launch', label: 'Cohete' },
  { icon: 'bolt', label: 'Rayo' },
  { icon: 'favorite', label: 'Corazón' },
  { icon: 'flag', label: 'Bandera' },
  { icon: 'military_tech', label: 'Medalla' },
  { icon: 'shield', label: 'Escudo' },
  { icon: 'directions_run', label: 'En marcha' },
  { icon: 'local_shipping', label: 'Camión' },
];

interface Props {
  value: string;
  onChange: (icon: string) => void;
  accent?: string;
}

export default function IconPicker({ value, onChange, accent = '#fbcb1a' }: Props) {
  const options = ICON_OPTIONS.some(o => o.icon === value)
    ? ICON_OPTIONS
    : [...ICON_OPTIONS, { icon: value, label: value }];

  return (
    <div className="grid grid-cols-5 sm:grid-cols-7 gap-1.5">
      {options.map(opt => {
        const selected = opt.icon === value;
        return (
          <button
            key={opt.icon}
            type="button"
            onClick={() => onChange(opt.icon)}
            title={opt.label}
            className="flex flex-col items-center gap-0.5 rounded-lg p-1.5 border transition-colors"
            style={{
              borderColor: selected ? accent : 'rgba(255,255,255,0.07)',
              backgroundColor: selected ? `${accent}1a` : '#0e0e0e',
            }}
          >
            <span className="material-symbols-outlined text-lg" style={{ color: selected ? accent : '#c6c9ab' }}>
              {opt.icon}
            </span>
            <span className="font-mono text-[7px] text-[#c6c9ab] leading-none text-center">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
