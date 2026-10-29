import type { DietMeal, Macros } from '../types.js';
import { resolveSlots } from './mealDistribution.js';
import { resumenDelDia } from './resumenDelDia.js';
import { mealLabel } from '../components/nutrition/dietHelpers.js';

/* ═══════════════════════════════════════════════════════════════════════════
   La tarjeta «Nutrición de hoy» de Inicio (28-10-2026)

   Antes era una fila de progreso con «N/M registradas» que contaba las
   comidas con alimentos dentro. Desde el diario en kcal las comidas del día
   empiezan VACÍAS (solo sale lo que apunta el atleta), así que ese recuento
   daba «0/0» toda la mañana. Aquí una comida está registrada en cuanto tiene
   algo apuntado — la misma regla que usa Nutrición para repartir lo que queda
   entre las comidas que faltan.

   No hay objetivo por comida (Dani, 26-10-2026: solo cuenta el total del día),
   así que la comida que toca enseña lo que queda repartido entre las que
   faltan, igual que las sugerencias de recetas de Nutrición.
   ═══════════════════════════════════════════════════════════════════════════ */

/** A partir de qué minuto del día toca cada franja (1 Desayuno … 5 Cena). */
const INICIO_DE_FRANJA: Record<number, number> = {
  1: 0,
  2: 11 * 60,
  3: 13 * 60,
  4: 16 * 60 + 30,
  5: 20 * 60,
};

export interface ComidaDeHoy {
  /** Posición en el día: es lo que casa con Nutrición aunque el día aún no
   *  esté guardado (sus ids se inventan al sembrarlo). */
  idx: number;
  nombre: string;
  slot: number;
  kcal: number;
  registrada: boolean;
  libre: boolean;
}

export interface NutricionDeHoy {
  comidas: ComidaDeHoy[];
  /** La comida que toca ahora; `null` con todo registrado. */
  toca: number | null;
  /** Lo que queda del día repartido entre las comidas que faltan. */
  kcalPorComida: number;
  kcal: number;
  objetivoKcal: number;
  todoRegistrado: boolean;
  cerrado: boolean;
}

/**
 * El sello «Día cerrado»: las kcal dentro de un ±5 % del objetivo y la
 * proteína casi completa (≥ 90 %). Mismo criterio en Nutrición y en Inicio.
 */
export function diaCerrado(comido: { kcal: number; p: number }, objetivo: Macros, hayAlgo: boolean): boolean {
  const kcalObjetivo = Math.round(objetivo.kcal);
  return kcalObjetivo > 0
    && hayAlgo
    && Math.abs(comido.kcal - kcalObjetivo) <= kcalObjetivo * 0.05
    && (objetivo.p <= 0 || comido.p >= objetivo.p * 0.9);
}

/** La franja de la hora: la última que ya ha empezado. */
export function franjaDeLaHora(minutos: number): number {
  let franja = 1;
  for (const [slot, inicio] of Object.entries(INICIO_DE_FRANJA)) {
    if (minutos >= inicio) franja = Number(slot);
  }
  return franja;
}

/**
 * Qué comida toca: la de la franja de ahora si está por registrar; si ya está,
 * la siguiente que falte; y si no queda ninguna después, la última que se
 * quedó atrás (una merienda olvidada a las once de la noche).
 */
function comidaQueToca(comidas: ComidaDeHoy[], minutos: number): number | null {
  const pendientes = comidas.filter(c => !c.registrada && !c.libre);
  if (pendientes.length === 0) return null;
  const franja = franjaDeLaHora(minutos);
  const yaEmpezadas = comidas.filter(c => c.slot <= franja);
  const base = yaEmpezadas.length > 0 ? yaEmpezadas[yaEmpezadas.length - 1].idx : -1;
  const ahora = comidas.find(c => c.idx === base);
  if (ahora && !ahora.registrada && !ahora.libre) return ahora.idx;
  const despues = pendientes.find(c => c.idx > base);
  if (despues) return despues.idx;
  return pendientes[pendientes.length - 1].idx;
}

export function nutricionDeHoy(
  meals: DietMeal[],
  doneItemIds: Iterable<string>,
  objetivo: Macros,
  minutos: number,
): NutricionDeHoy {
  const hechos = new Set(doneItemIds);
  const slots = resolveSlots(meals);
  const comidas: ComidaDeHoy[] = meals.map((m, i) => ({
    idx: i,
    nombre: mealLabel(m.name, i + 1),
    slot: slots[i],
    kcal: resumenDelDia([m], hechos).kcal,
    registrada: m.items.some((_, k) => hechos.has(`${m.id}_${k}`)),
    libre: !!m.libre,
  }));
  const resumen = resumenDelDia(meals, hechos);
  const objetivoKcal = Math.round(objetivo.kcal);
  const porHacer = comidas.filter(c => !c.registrada && !c.libre).length;
  const queda = Math.max(0, objetivoKcal - resumen.kcal);
  return {
    comidas,
    toca: comidaQueToca(comidas, minutos),
    kcalPorComida: porHacer > 0 ? Math.round(queda / porHacer) : 0,
    kcal: resumen.kcal,
    objetivoKcal,
    todoRegistrado: porHacer === 0 && comidas.some(c => c.registrada),
    cerrado: diaCerrado(resumen, objetivo, comidas.some(c => c.registrada)),
  };
}
