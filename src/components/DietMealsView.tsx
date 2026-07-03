import React, { useMemo } from 'react';
import { DietMeal, FoodCategory } from '../types';

// ── Constants ─────────────────────────────────────────────────────────────────

const KCAL_INT: Record<FoodCategory, number> = {
  HC: 100, PROT: 100, GRASA: 99, MIX_HC: 100, MIX_GRASA: 100,
};

const DISPLAY_CATS: FoodCategory[] = ['HC', 'PROT', 'GRASA'];

const CAT_COLOR: Record<FoodCategory, string> = {
  HC: 'text-amber-300', PROT: 'text-blue-300', GRASA: 'text-orange-300',
  MIX_HC: 'text-violet-300', MIX_GRASA: 'text-pink-300',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function mealKcal(items: DietMeal['items']): number {
  return Math.round(items.reduce((s, it) => s + it.quantity * KCAL_INT[it.category], 0));
}

function mealExch(items: DietMeal['items']): Record<FoodCategory, number> {
  const r: Record<FoodCategory, number> = { HC: 0, PROT: 0, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0 };
  for (const it of items) r[it.category] = Math.round((r[it.category] + it.quantity) * 100) / 100;
  return r;
}

function round2(n: number) { return Math.round(n * 100) / 100; }

function fmtQ(q: number): string {
  if (Number.isInteger(q)) return String(q);
  return q.toFixed(2).replace(/\.?0+$/, '');
}

function labelForMeal(name: string, n: number): string {
  const stripped = name.replace(/^Comida\s*\d+\s*/i, '').trim();
  return stripped || `Comida ${n}`;
}

// ── DietNumerosView ───────────────────────────────────────────────────────────
// Resumen numérico de intercambios (colocado/objetivo por comida + total del día).
// Se muestra siempre integrado dentro de la vista de lista — ya no es una pestaña
// aparte (antes existía junto a "Fotos" bajo un selector Lista/Fotos/Números).

interface NumerosProps {
  meals: DietMeal[];
  budget: Record<FoodCategory, number>;
}

export function DietNumerosView({ meals, budget }: NumerosProps) {
  const totals = useMemo(() => {
    const t: Record<FoodCategory, number> = { HC: 0, PROT: 0, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0 };
    for (const meal of meals) {
      for (const it of meal.items) t[it.category] = round2(t[it.category] + it.quantity);
    }
    return t;
  }, [meals]);

  const totalKcal   = meals.reduce((s, m) => s + mealKcal(m.items), 0);
  const budgetKcal  = Math.round((budget.HC ?? 0) * KCAL_INT.HC + (budget.PROT ?? 0) * KCAL_INT.PROT + (budget.GRASA ?? 0) * KCAL_INT.GRASA);
  const kcalDelta   = totalKcal - budgetKcal;

  return (
    <div className="space-y-2">
      {/* Per-meal rows */}
      {meals.map((meal, mi) => {
        const kcal = mealKcal(meal.items);
        const exch = mealExch(meal.items);
        return (
          <div key={meal.id} className="bg-[#181816] border border-white/7 rounded-2xl overflow-hidden">
            {/* Meal header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#1e1e1e]">
              <span className="font-sans font-bold text-white text-sm">{labelForMeal(meal.name, mi + 1)}</span>
              <span className="font-mono text-[#fbcb1a] font-bold text-sm">{kcal > 0 ? `${kcal} kcal` : '—'}</span>
            </div>
            {/* Category grid */}
            <div className="grid grid-cols-3 divide-x divide-[#1e1e1e]">
              {DISPLAY_CATS.map(cat => {
                const v = exch[cat];
                const tgt = meal.target?.[cat] ?? 0;
                const isOk   = tgt > 0 && round2(v) >= round2(tgt);
                const isOver = tgt > 0 && v > tgt;
                return (
                  <div key={cat} className="py-3 px-2 text-center">
                    <span className={`block font-mono text-[9px] font-bold uppercase ${CAT_COLOR[cat]}`}>{cat}</span>
                    <span className={`block font-mono font-bold text-sm mt-0.5 ${isOver ? 'text-red-400' : isOk ? 'text-green-400' : 'text-white'}`}>
                      {fmtQ(v)}{tgt > 0 ? `/${fmtQ(tgt)}` : ''}
                    </span>
                    <span className={`block font-mono text-[8px] mt-0.5 ${isOk ? 'text-green-400' : isOver ? 'text-red-400' : 'text-[#444]'}`}>
                      {isOk ? '✓ ok' : isOver ? `+${fmtQ(round2(v - tgt))}` : 'int'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Day totals */}
      <div className="bg-[#0e0e0e] border border-[#fbcb1a]/20 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e1e1e]">
          <span className="font-mono text-[10px] text-[#fbcb1a] uppercase font-bold tracking-wide">Total del día</span>
          <div className="text-right">
            <span className="font-mono font-bold text-[#fbcb1a]">{totalKcal} kcal</span>
            {budgetKcal > 0 && (
              <span className={`block font-mono text-[9px] ${kcalDelta > 0 ? 'text-red-400' : kcalDelta < 0 ? 'text-[#555]' : 'text-green-400'}`}>
                {kcalDelta === 0 ? '✓ en presupuesto' : `${kcalDelta > 0 ? '+' : ''}${kcalDelta} vs ${budgetKcal}`}
              </span>
            )}
          </div>
        </div>
        <div className="grid grid-cols-3 divide-x divide-[#1e1e1e]">
          {DISPLAY_CATS.map(cat => {
            const v = totals[cat];
            const b = budget[cat] ?? 0;
            const isOver = b > 0 && v > b;
            const isOk   = b > 0 && round2(v) === round2(b);
            const delta  = round2(v - b);
            return (
              <div key={cat} className="py-3 px-2 text-center">
                <span className={`block font-mono text-[9px] font-bold uppercase ${CAT_COLOR[cat]}`}>{cat}</span>
                <span className={`block font-mono font-bold text-base mt-0.5 ${isOver ? 'text-red-400' : isOk ? 'text-green-400' : 'text-white'}`}>
                  {fmtQ(v)}{b > 0 ? `/${fmtQ(b)}` : ''}
                </span>
                <span className={`block font-mono text-[8px] mt-0.5 ${isOk ? 'text-green-400' : isOver ? 'text-red-400' : 'text-[#555]'}`}>
                  {isOk ? '✓' : isOver ? `+${fmtQ(delta)}` : b > 0 ? `${fmtQ(delta)}` : 'int'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
