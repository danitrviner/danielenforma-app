// Helpers puros compartidos por el editor de "Mi plan" (fusión de la antigua
// Intercambios + Mis Dietas) y sus piezas. Extraído tal cual de
// NutritionScreen.tsx (líneas 17-55 de la versión pre-fusión) — sin cambio de
// comportamiento, solo de ubicación.
import { Diet, WeekDay } from '../../types';

export const COACH_EMAIL = 'danitrviner@gmail.com';
export const makeId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;

export function blankDiet(athleteId: string, name = 'Mi menú'): Diet {
  return {
    id: `draft_${makeId()}`,
    athleteId,
    name,
    budget: { HC: 0, PROT: 0, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0 },
    meals: [{ id: makeId(), name: 'Comida 1', items: [] }],
    selfManaged: true,
  };
}

export function dietSnapshot(dt: Pick<Diet, 'name' | 'budget' | 'meals'>): string {
  return JSON.stringify({ name: dt.name, budget: dt.budget, meals: dt.meals });
}

// ── Weekly schedule constants ──────────────────────────────────────────────────

export const JS_TO_WD: Record<number, WeekDay> = { 0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat' };
export const TODAY_WD: WeekDay = JS_TO_WD[new Date().getDay()];
export const TODAY_DATE: string = new Date().toISOString().split('T')[0];
export const WD_ORDER: WeekDay[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const WD_SHORT: Record<WeekDay, string> = { mon: 'L', tue: 'M', wed: 'X', thu: 'J', fri: 'V', sat: 'S', sun: 'D' };
export const WD_FULL: Record<WeekDay, string> = { mon: 'lunes', tue: 'martes', wed: 'miércoles', thu: 'jueves', fri: 'viernes', sat: 'sábado', sun: 'domingo' };

// ── Helpers ────────────────────────────────────────────────────────────────────

export function mealLabel(name: string, n: number): string {
  const stripped = name.replace(/^Comida\s*\d+\s*/i, '').trim();
  return stripped || `Comida ${n}`;
}

// Etiquetas del tracker (panel 01): el handoff usa el nombre completo en mono
// para las tres barras de presupuesto, distinto del CAT_LABEL compartido
// ("Proteína") que usan el resto de pantallas de intercambios.
export const BAR_LABEL: Record<'HC' | 'PROT' | 'GRASA', string> = { HC: 'HIDRATOS', PROT: 'PROTEÍNA', GRASA: 'GRASA' };
export const CHIP_LABEL: Record<'HC' | 'PROT' | 'GRASA', string> = { HC: 'HC', PROT: 'PR', GRASA: 'GR' };

// key = `${mealId}_${itemIdx}`
export type ItemState = { foodLabel: string; done: boolean };
