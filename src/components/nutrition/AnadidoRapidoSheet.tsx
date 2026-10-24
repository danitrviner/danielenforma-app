import React, { useState } from 'react';
import { Sheet, Button, Input, Banner } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Añadido rápido (D-03, modo «Calorías y macros»)

   Para lo que no está en ningún banco: una comida fuera de casa, un plato
   suelto. Se escribe lo que aporta la ración entera. Hacen falta las kcal y
   al menos un macro: sin macros no hay manera honrada de repartirlo en
   intercambios, y no se inventa nada. Un macro en blanco cuenta como 0.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface AnadidoRapido { nombre: string; kcal: number; p: number; hc: number; g: number }

type Props = { onConfirm: (a: AnadidoRapido) => void; onClose: () => void };

const num = (t: string): number | null => {
  if (t.trim() === '') return null;
  const n = parseFloat(t.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : NaN;
};

export default function AnadidoRapidoSheet({ onConfirm, onClose }: Props) {
  const [f, setF] = useState({ nombre: '', kcal: '', p: '', hc: '', g: '' });
  const set = (k: keyof typeof f) => (v: string) => setF(prev => ({ ...prev, [k]: v }));
  const kcal = num(f.kcal); const p = num(f.p); const hc = num(f.hc); const g = num(f.g);
  const malEscrito = [kcal, p, hc, g].some(v => v !== null && Number.isNaN(v));
  const algunMacro = [p, hc, g].some(v => v !== null && !Number.isNaN(v) && v > 0);
  const valido = !malEscrito && kcal !== null && kcal > 0 && algunMacro;

  return (
    <Sheet
      open
      onClose={onClose}
      title="Añadido rápido"
      alto="completo"
      footer={(
        <Button
          fullWidth
          disabled={!valido}
          onClick={() => valido && onConfirm({
            nombre: f.nombre.trim() || 'Añadido rápido',
            kcal: kcal as number, p: p ?? 0, hc: hc ?? 0, g: g ?? 0,
          })}
        >Añadir</Button>
      )}
    >
      <div className="space-y-4 pt-2">
        <p className="font-sans text-body-s text-ink-2">
          Escribe lo que aporta la ración entera, no por 100 g.
        </p>
        <Input label="Nombre (opcional)" value={f.nombre} onChange={set('nombre')} placeholder="Comida fuera" />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Kcal" value={f.kcal} onChange={set('kcal')} inputMode="decimal" placeholder="450" />
          <Input label="Proteína (g)" value={f.p} onChange={set('p')} inputMode="decimal" placeholder="30" />
          <Input label="Hidratos (g)" value={f.hc} onChange={set('hc')} inputMode="decimal" placeholder="50" />
          <Input label="Grasa (g)" value={f.g} onChange={set('g')} inputMode="decimal" placeholder="12" />
        </div>
        {malEscrito && <Banner tone="danger">Usa solo números.</Banner>}
        {!malEscrito && kcal !== null && kcal > 0 && !algunMacro && (
          <Banner tone="info">Añade al menos un macro para poder contarlo en tu día.</Banner>
        )}
      </div>
    </Sheet>
  );
}
