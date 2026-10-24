import React, { useMemo, useState } from 'react';
import type { MealItem } from '../../types';
import { Sheet, Button, Input } from '../ui';
import { foodNameWithoutGrams } from '../../utils/exchangeHelpers';
import { previsionDeGramos, gramosSugeridos } from '../../utils/gramosDeAlimento';

/* ═══════════════════════════════════════════════════════════════════════════
   Cantidad en gramos (D-03, modo «Calorías y macros»)

   Tocar un alimento pregunta cuántos gramos y enseña, mientras se escribe,
   lo que aporta. En un alimento del banco los números salen de sus
   intercambios y se avisa de que son aproximados.
   ═══════════════════════════════════════════════════════════════════════════ */

type Props = {
  food: MealItem;
  /** Gramos de la última vez que lo apuntó, si los hay. */
  ultimos?: number;
  onConfirm: (gramos: number) => void;
  onClose: () => void;
};

export default function GramosSheet({ food, ultimos, onConfirm, onClose }: Props) {
  const [texto, setTexto] = useState(String(gramosSugeridos(food, ultimos)));
  const gramos = parseFloat(texto.replace(',', '.'));
  const valido = Number.isFinite(gramos) && gramos > 0 && gramos <= 5000;
  const prev = useMemo(() => previsionDeGramos(food, valido ? gramos : 0), [food, gramos, valido]);
  const n = prev.nutrientes;

  return (
    <Sheet
      open
      onClose={onClose}
      title={foodNameWithoutGrams(food.label)}
      footer={<Button onClick={() => valido && onConfirm(gramos)} disabled={!valido} fullWidth>Añadir</Button>}
    >
      <div className="space-y-4 pt-2">
        <Input label="Cantidad (g)" value={texto} onChange={setTexto} inputMode="decimal" placeholder="100" />
        <div className="rounded-surface border border-hairline bg-surface p-4">
          {n ? (
            <>
              <p className="font-mono text-display text-ink">{prev.aproximado ? '≈ ' : ''}{n.kcal} kcal</p>
              <dl className="grid grid-cols-3 gap-2 pt-3">
                {([['Proteína', n.p], ['Hidratos', n.hc], ['Grasa', n.g]] as const).map(([nombre, v]) => (
                  <div key={nombre} className="rounded-control bg-raised p-2 text-center">
                    <dt className="font-sans text-caption text-ink-3">{nombre}</dt>
                    <dd className="font-mono text-title-s text-ink">{v} g</dd>
                  </div>
                ))}
              </dl>
              {prev.aproximado && (
                <p className="pt-3 font-sans text-caption text-ink-3">
                  Aproximado: este alimento viene del banco de intercambios, no de una etiqueta.
                </p>
              )}
            </>
          ) : (
            <p className="font-sans text-body-s text-ink-3">Escribe los gramos para ver lo que aporta.</p>
          )}
        </div>
      </div>
    </Sheet>
  );
}
