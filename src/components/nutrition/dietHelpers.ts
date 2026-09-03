// Helpers puros compartidos por el editor de "Mi plan" (fusión de la antigua
// Intercambios + Mis Dietas) y sus piezas. Extraído tal cual de
// NutritionScreen.tsx (líneas 17-55 de la versión pre-fusión) — sin cambio de
// comportamiento, solo de ubicación.
import { Diet, DietMeal, WeekDay } from '../../types';

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

// ── Esqueleto de un día nuevo ─────────────────────────────────────────────────

/**
 * Las comidas con las que arranca un día que todavía no tiene nada registrado.
 *
 * No copia lo que comiste ayer —eso sería inventarte el día— sino la ESTRUCTURA:
 * cuántas ingestas haces, cómo se llaman y en qué franja caen. Sale de la
 * anamnesis del atleta si la rellenó, y si no de un día normal de cinco
 * ingestas. Sin esto, cada día nuevo aparecía como una lista en blanco a la que
 * había que ir creando comidas a mano antes de poder registrar nada.
 */
const COMIDAS_POR_DEFECTO: { name: string; slot: number }[] = [
  { name: 'Desayuno', slot: 1 },
  { name: 'Media mañana', slot: 2 },
  { name: 'Comida', slot: 3 },
  { name: 'Merienda', slot: 4 },
  { name: 'Cena', slot: 5 },
];

export function estructuraDeDia(
  plantilla?: { name: string; slot?: number }[] | null,
): DietMeal[] {
  const base = plantilla?.length ? plantilla : COMIDAS_POR_DEFECTO;
  return base.map((m, i) => ({
    id: makeId() + `_${i}`,   // makeId() usa Date.now(): sin el sufijo, cinco comidas creadas en el mismo milisegundo colisionarían
    name: m.name,
    slot: m.slot,
    items: [],
  }));
}

/** "martes, 2 de septiembre" — la fecha del día que se está viendo, en claro. */
export function fechaLarga(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
}
