// Reparto de un total en pasos de 0,25 con SUMA EXACTA — cuota de Hare
// (resto mayor), empate al índice menor. Módulo propio sin dependencias para
// que tanto mealDistribution.ts (intercambios por comida) como menuEngine.ts
// (franjas del menú semanal) lo compartan sin crear un ciclo entre los dos.
import { round2 } from './exchangeHelpers';

export function quotaSplit(total: number, weights: number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const units = Math.round(total / 0.25);
  const sum = weights.reduce((s, w) => s + w, 0);
  if (units <= 0 || sum <= 0) return distributeEvenlyUnits(units, n);

  const exact = weights.map(w => (units * w) / sum);
  const floors = exact.map(Math.floor);
  let rest = units - floors.reduce((s, v) => s + v, 0);
  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => (b.frac - a.frac) || (a.i - b.i));
  const out = [...floors];
  for (let k = 0; rest > 0; k++, rest--) out[order[k % n].i] += 1;
  return out.map(u => round2(u * 0.25));
}

function distributeEvenlyUnits(units: number, n: number): number[] {
  if (n === 0) return [];
  const base = Math.floor(units / n);
  const extra = units - base * n;
  return Array.from({ length: n }, (_, i) => round2((base + (i < extra ? 1 : 0)) * 0.25));
}
