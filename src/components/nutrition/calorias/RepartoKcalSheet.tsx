import React, { useState } from 'react';
import { Sheet, Button } from '../../ui';

/* Reparto del día por comidas, en calorías (Dani, 25-10-2026): en el modo
   «Calorías y macros» no se reparten intercambios, se reparten kcal. Cada
   comida lleva un % del objetivo y entre todas suman 100. */

interface Props {
  comidas: { id: string; nombre: string }[];
  porcentajes: number[];
  porDefecto: number[];
  kcalObjetivo: number;
  onGuardar: (porcentajes: number[]) => void;
  onClose: () => void;
}

const PASO = 5;

export default function RepartoKcalSheet({ comidas, porcentajes, porDefecto, kcalObjetivo, onGuardar, onClose }: Props) {
  const [pcts, setPcts] = useState(porcentajes);
  const total = pcts.reduce((s, n) => s + n, 0);
  const cuadra = total === 100;
  const mover = (i: number, d: number) => setPcts(prev => prev.map((v, j) => (j === i ? Math.max(0, Math.min(100, v + d)) : v)));

  return (
    <Sheet
      open
      onClose={onClose}
      title="Reparto de calorías"
      size="m"
      footer={(
        <Button fullWidth disabled={!cuadra} onClick={() => onGuardar(pcts)}>
          {cuadra ? 'Guardar reparto' : `Ajusta hasta el 100 % (llevas ${total} %)`}
        </Button>
      )}
    >
      <div className="space-y-4 pb-2 pt-1">
        <p className="font-sans text-body-s text-ink-2">
          Cuánto de tus {kcalObjetivo.toLocaleString('es-ES')} kcal va a cada comida. Lo verás junto a cada una en el Diario.
        </p>
        <div className="divide-y divide-hairline rounded-surface bg-surface">
          {comidas.map((c, i) => (
            <div key={c.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <span className="block truncate font-sans text-body font-bold text-ink">{c.nombre}</span>
                <span className="font-mono text-caption text-ink-2">{Math.round((kcalObjetivo * pcts[i]) / 100).toLocaleString('es-ES')} kcal</span>
              </div>
              <div className="flex items-center gap-1 rounded-control border border-hairline bg-inset">
                <button type="button" onClick={() => mover(i, -PASO)} aria-label={`Menos a ${c.nombre}`} className="h-9 w-9 font-bold text-ink-2 hover:text-ink">−</button>
                <span className="w-12 text-center font-mono text-body-s text-ink">{pcts[i]} %</span>
                <button type="button" onClick={() => mover(i, PASO)} aria-label={`Más a ${c.nombre}`} className="h-9 w-9 font-bold text-ink-2 hover:text-ink">+</button>
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <span className={`font-mono text-body-s font-bold ${cuadra ? 'text-ink-2' : 'text-danger'}`}>Total {total} %</span>
          <button type="button" onClick={() => setPcts(porDefecto)} className="font-sans text-body-s font-bold text-accent-ink">
            Repartir por mí
          </button>
        </div>
      </div>
    </Sheet>
  );
}
