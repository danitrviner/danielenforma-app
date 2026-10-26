import React from 'react';
import type { DietMeal, Macros } from '../types';
import { macrosDeLineas } from '../utils/macrosLegado';

/* ═══════════════════════════════════════════════════════════════════════════
   DietNumerosView — resumen en kcal y gramos de un plan (10-2026)

   Lo que pone cada comida del plan (kcal y gramos de proteína, hidratos y
   grasa) y el total del día contra su objetivo. Sin objetivo por comida: solo
   cuenta el total del día. Lo usa el editor de dietas del coach.
   ═══════════════════════════════════════════════════════════════════════════ */

const MACROS = [
  { clave: 'p', etiqueta: 'P', color: 'text-macro-prot' },
  { clave: 'hc', etiqueta: 'HC', color: 'text-macro-hc' },
  { clave: 'g', etiqueta: 'G', color: 'text-macro-grasa' },
] as const;

function labelForMeal(name: string, n: number): string {
  const stripped = name.replace(/^Comida\s*\d+\s*/i, '').trim();
  return stripped || `Comida ${n}`;
}

interface NumerosProps {
  meals: DietMeal[];
  objetivo: Macros;
}

export function DietNumerosView({ meals, objetivo }: NumerosProps) {
  const total = macrosDeLineas(meals.flatMap(m => m.items));
  const kcalDelta = Math.round(total.kcal - objetivo.kcal);
  const enObjetivo = objetivo.kcal > 0 && Math.abs(kcalDelta) <= objetivo.kcal * 0.05;

  return (
    <div className="space-y-2">
      {meals.map((meal, mi) => {
        const m = macrosDeLineas(meal.items);
        return (
          <div key={meal.id} className="bg-surface border border-hairline rounded-surface overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-hairline">
              <span className="font-sans font-bold text-ink text-body-s">{labelForMeal(meal.name, mi + 1)}</span>
              <span className="font-mono text-accent-ink font-bold text-body-s">{m.kcal > 0 ? `${Math.round(m.kcal)} kcal` : '—'}</span>
            </div>
            <div className="grid grid-cols-3 divide-x divide-hairline">
              {MACROS.map(x => (
                <div key={x.clave} className="py-3 px-2 text-center">
                  <span className={`block font-mono text-caption font-bold uppercase ${x.color}`}>{x.etiqueta}</span>
                  <span className="block font-mono font-bold text-body-s text-ink">{Math.round(m[x.clave])} g</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <div className="bg-bg border border-accent/20 rounded-surface overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-hairline">
          <span className="font-mono text-caption text-accent-ink uppercase font-bold tracking-wide">Total del día</span>
          <div className="text-right">
            <span className="font-mono font-bold text-accent-ink">{Math.round(total.kcal)} kcal</span>
            {objetivo.kcal > 0 && (
              <span className={`block font-mono text-caption ${enObjetivo ? 'text-success' : kcalDelta > 0 ? 'text-danger' : 'text-ink-3'}`}>
                {enObjetivo ? '✓ en objetivo' : `${kcalDelta > 0 ? '+' : ''}${kcalDelta} vs ${Math.round(objetivo.kcal)}`}
              </span>
            )}
          </div>
        </div>
        <div className="grid grid-cols-3 divide-x divide-hairline">
          {MACROS.map(x => {
            const v = total[x.clave];
            const o = objetivo[x.clave];
            const pasado = o > 0 && v > o * 1.05;
            const ok = o > 0 && Math.abs(v - o) <= o * 0.05;
            return (
              <div key={x.clave} className="py-3 px-2 text-center">
                <span className={`block font-mono text-caption font-bold uppercase ${x.color}`}>{x.etiqueta}</span>
                <span className={`block font-mono font-bold text-title-s ${pasado ? 'text-danger' : ok ? 'text-success' : 'text-ink'}`}>
                  {Math.round(v)}{o > 0 ? `/${Math.round(o)}` : ''} g
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
