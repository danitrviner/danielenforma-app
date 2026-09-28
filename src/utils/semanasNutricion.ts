import type {
  Diet, DietMeal, NutritionProgram, AjusteDeComida, CambioNutricionSemana, MacroAjustable, WeekDay, Suplemento, NutritionPhase,
} from '../types';
import { resolveSlots, SLOT_LABEL } from './mealDistribution';
import { exchangeToKcal } from './nutritionConstants';
import { addToPlaced } from './exchangeHelpers';
import type { FoodCategory } from '../types';

/* La periodización nutricional semana a semana. Las fases dicen QUÉ dieta toca
   (déficit, mantenimiento…); esto dice cómo se ajusta esa dieta dentro de la
   fase: −1 hidrato en la cena desde la S4, una semana de mantenimiento, la
   cena del sábado libre. Se aplica al sembrar el día del atleta sobre la dieta
   que le toque ese día, así que vale igual para la dieta de la fase que para
   el Día A / Día B de su calendario semanal. */

const DIA_SEMANA: WeekDay[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export const NOMBRE_DIA: Record<WeekDay, string> = {
  mon: 'lunes', tue: 'martes', wed: 'miércoles', thu: 'jueves', fri: 'viernes', sat: 'sábado', sun: 'domingo',
};
const NOMBRE_MACRO: Record<MacroAjustable, string> = { HC: 'hidratos', PROT: 'proteína', GRASA: 'grasa' };

function diasEntre(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.floor((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

/** Semana del programa (1-indexada) en la que cae `fecha`. */
export function semanaDelPrograma(program: Pick<NutritionProgram, 'startDate'>, fecha: string): number {
  return Math.max(1, Math.floor(diasEntre(program.startDate, fecha) / 7) + 1);
}

export function totalSemanas(program: Pick<NutritionProgram, 'phases'>): number {
  return program.phases.reduce((n, f) => n + Math.max(0, f.weeks), 0);
}

export function faseDeLaSemana(program: Pick<NutritionProgram, 'phases'>, semana: number): { fase: NutritionPhase; indice: number; semanaEnFase: number } | null {
  let acumulado = 0;
  for (let i = 0; i < program.phases.length; i++) {
    const f = program.phases[i];
    if (semana <= acumulado + f.weeks) return { fase: f, indice: i, semanaEnFase: semana - acumulado };
    acumulado += f.weeks;
  }
  return null;
}

const aplica = (c: CambioNutricionSemana, s: number) => c.semana <= s && (!c.solo || c.semana === s);

/** Los ajustes que rigen en la semana `s` (acumulados desde el principio). */
export function ajustesDeLaSemana(program: Pick<NutritionProgram, 'cambiosSemana'>, s: number): AjusteDeComida[] {
  return (program.cambiosSemana ?? []).filter(c => aplica(c, s)).flatMap(c => c.ajustes);
}

// ── Aplicar a una dieta ─────────────────────────────────────────────────────

function cantidadDe(meal: DietMeal, cat: MacroAjustable): number {
  return macrosDeComida(meal)[cat];
}

const MIXTO_DE: Partial<Record<MacroAjustable, FoodCategory>> = { HC: 'MIX_HC', GRASA: 'MIX_GRASA' };

function ajustarComida(meal: DietMeal, cat: MacroAjustable, deltaMacro: number): DietMeal {
  const items = meal.items.map(it => ({ ...it }));
  // Alimentos puros de ese macro; si la comida no tiene, el mixto que lo
  // lleva (un mixto cuenta medio intercambio de cada macro, así que se toca el doble).
  let catItems: FoodCategory = cat;
  let delta = deltaMacro;
  if (!items.some(it => it.category === cat) && MIXTO_DE[cat] && items.some(it => it.category === MIXTO_DE[cat])) {
    catItems = MIXTO_DE[cat]!;
    delta = deltaMacro * 2;
  }
  const delMacro = items.filter(it => it.category === catItems).sort((a, b) => b.quantity - a.quantity);
  if (delta > 0 && delMacro[0]) {
    delMacro[0].quantity += delta;
  } else if (delta < 0) {
    let falta = -delta;
    for (const it of delMacro) {
      const quita = Math.min(it.quantity, falta);
      it.quantity = Math.round((it.quantity - quita) * 100) / 100;
      falta -= quita;
      if (falta <= 0) break;
    }
  }
  const target = meal.target ? { ...meal.target, [catItems]: Math.max(0, (meal.target[catItems] ?? 0) + delta) } : meal.target;
  return { ...meal, items: items.filter(it => it.quantity > 0 || it.category !== catItems), ...(target ? { target } : {}) };
}

/** La dieta con los ajustes aplicados: comidas y cupo diario. */
export function aplicarAjustes(
  diet: Diet, ajustes: AjusteDeComida[], opciones: { mantenimiento?: boolean; libres?: number[] } = {},
): Diet {
  let meals = diet.meals.map(m => ({ ...m, items: m.items.map(it => ({ ...it })) }));
  const slots = resolveSlots(meals);
  const todos: AjusteDeComida[] = [
    ...ajustes,
    ...(opciones.mantenimiento ? meals.map((_, i) => ({ slot: slots[i], cat: 'HC' as const, delta: 1 })) : []),
  ];
  const budget = { ...diet.budget };
  for (const a of todos) {
    if (a.delta === 0 || meals.length === 0) continue;
    let idx = a.slot !== undefined ? slots.indexOf(a.slot) : -1;
    if (idx < 0) {
      // Sin franja (o la dieta no tiene esa comida): la que más lleva de ese macro.
      idx = meals.reduce((mejor, m, i) => cantidadDe(m, a.cat) > cantidadDe(meals[mejor], a.cat) ? i : mejor, 0);
    }
    meals = meals.map((m, i) => i === idx ? ajustarComida(m, a.cat, a.delta) : m);
    budget[a.cat] = Math.max(0, (budget[a.cat] ?? 0) + a.delta);
  }
  if (opciones.libres && opciones.libres.length > 0) {
    meals = meals.map((m, i) => opciones.libres!.includes(slots[i]) ? { ...m, libre: true } : m);
  }
  return { ...diet, meals, budget };
}

export function libresDelDia(program: Pick<NutritionProgram, 'comidasLibres'>, semana: number, dia: WeekDay): number[] {
  return (program.comidasLibres ?? [])
    .filter(c => c.dia === dia && c.desde <= semana && (c.hasta === undefined || semana <= c.hasta))
    .map(c => c.slot);
}

export function diaDeLaSemana(fecha: string): WeekDay {
  const [y, m, d] = fecha.split('-').map(Number);
  return DIA_SEMANA[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** La dieta que toca `fecha` con todo lo programado para esa semana. */
export function dietaDeLaSemana(diet: Diet, program: NutritionProgram | null | undefined, fecha: string): Diet {
  if (!program) return diet;
  const s = semanaDelPrograma(program, fecha);
  const ajustes = ajustesDeLaSemana(program, s);
  const mantenimiento = (program.semanasMantenimiento ?? []).includes(s);
  const libres = libresDelDia(program, s, diaDeLaSemana(fecha));
  if (ajustes.length === 0 && !mantenimiento && libres.length === 0) return diet;
  return aplicarAjustes(diet, ajustes, { mantenimiento, libres });
}

const VACIO = (): Record<FoodCategory, number> => ({ HC: 0, PROT: 0, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0 });

/** kcal del cupo, con los intercambios mixtos repartidos como en el resto de
 *  la app (medio de cada macro, ver addToPlaced). */
export function kcalDeDieta(diet: Pick<Diet, 'budget'>): number {
  const p = VACIO();
  for (const [cat, q] of Object.entries(diet.budget) as [FoodCategory, number][]) addToPlaced(p, cat, q ?? 0);
  return exchangeToKcal(p);
}

/** Intercambios de cada macro en el cupo diario, con los mixtos repartidos. */
export function macrosDeCupo(budget: Record<FoodCategory, number>): Record<MacroAjustable, number> {
  const p = VACIO();
  for (const [cat, q] of Object.entries(budget) as [FoodCategory, number][]) addToPlaced(p, cat, q ?? 0);
  return { HC: p.HC, PROT: p.PROT, GRASA: p.GRASA };
}

/** Intercambios de cada macro en una comida, con los mixtos repartidos. */
export function macrosDeComida(meal: DietMeal): Record<MacroAjustable, number> {
  const p = VACIO();
  if (meal.items.length > 0) for (const it of meal.items) addToPlaced(p, it.category, it.quantity);
  else for (const [cat, q] of Object.entries(meal.target ?? {}) as [FoodCategory, number][]) addToPlaced(p, cat, q ?? 0);
  return { HC: p.HC, PROT: p.PROT, GRASA: p.GRASA };
}

/** kcal de una comida por sus alimentos (o por su objetivo si aún no tiene). */
export function kcalDeComida(meal: DietMeal): number {
  const p = VACIO();
  if (meal.items.length > 0) for (const it of meal.items) addToPlaced(p, it.category, it.quantity);
  else for (const [cat, q] of Object.entries(meal.target ?? {}) as [FoodCategory, number][]) addToPlaced(p, cat, q ?? 0);
  return exchangeToKcal(p);
}

/** kcal/día de cada semana del programa (índice 1..N; 0 queda a null), con la
 *  dieta de su fase y lo programado. */
export function kcalPorSemana(program: NutritionProgram, diets: Diet[]): (number | null)[] {
  const n = totalSemanas(program);
  return Array.from({ length: n + 1 }, (_, s) => {
    if (s === 0) return null;
    const f = faseDeLaSemana(program, s);
    const diet = f && diets.find(d => d.id === f.fase.dietId);
    if (!diet) return null;
    const ajustes = ajustesDeLaSemana(program, s);
    return kcalDeDieta(aplicarAjustes(diet, ajustes, { mantenimiento: (program.semanasMantenimiento ?? []).includes(s) }));
  });
}

// ── Programar ───────────────────────────────────────────────────────────────

/** Suma `ajuste` al cambio de esa semana (desde o solo). Si se compensa hasta
 *  cero, desaparece. */
export function programarAjuste(
  program: Pick<NutritionProgram, 'cambiosSemana'>, semana: number, solo: boolean, ajuste: AjusteDeComida,
): CambioNutricionSemana[] | undefined {
  const lista = (program.cambiosSemana ?? []).map(c => ({ ...c, ajustes: c.ajustes.map(a => ({ ...a })) }));
  let cambio = lista.find(c => c.semana === semana && !!c.solo === solo);
  if (!cambio) { cambio = { semana, ...(solo ? { solo: true } : {}), ajustes: [] }; lista.push(cambio); }
  const mismo = cambio.ajustes.find(a => a.slot === ajuste.slot && a.cat === ajuste.cat);
  if (mismo) mismo.delta += ajuste.delta; else cambio.ajustes.push({ ...ajuste });
  cambio.ajustes = cambio.ajustes.filter(a => a.delta !== 0);
  const out = lista.filter(c => c.ajustes.length > 0).sort((a, b) => a.semana - b.semana);
  return out.length > 0 ? out : undefined;
}

export function quitarCambiosNutricion(program: Pick<NutritionProgram, 'cambiosSemana'>, semanas: number[]): CambioNutricionSemana[] | undefined {
  const out = (program.cambiosSemana ?? []).filter(c => !semanas.includes(c.semana));
  return out.length > 0 ? out : undefined;
}

export function suplementosDeLaSemana(program: Pick<NutritionProgram, 'suplementos'>, s: number): Suplemento[] {
  return (program.suplementos ?? []).filter(x => (x.desde ?? 1) <= s && (x.hasta === undefined || s <= x.hasta));
}

// ── Describir ───────────────────────────────────────────────────────────────

export function describirAjuste(a: AjusteDeComida): string {
  const donde = a.slot !== undefined ? SLOT_LABEL[a.slot] ?? `Comida ${a.slot}` : `Comida con más ${NOMBRE_MACRO[a.cat]}`;
  const n = Math.abs(a.delta);
  return `${donde}: ${a.delta > 0 ? '+' : '−'}${n.toLocaleString('es-ES')} ${n === 1 ? 'intercambio' : 'intercambios'} de ${NOMBRE_MACRO[a.cat]}`;
}

export interface NovedadesNutricion {
  mantenimiento: boolean;
  vuelveDeMantenimiento: boolean;
  ajustes: string[];
  libres: string[];
  suplementos: string[];
}

/** Lo que cambia en la dieta del atleta al empezar la semana `s`. */
export function novedadesNutricion(program: NutritionProgram, s: number): NovedadesNutricion {
  const mant = program.semanasMantenimiento ?? [];
  const ajustes = (program.cambiosSemana ?? [])
    .filter(c => c.semana === s)
    .flatMap(c => c.ajustes.map(a => `${describirAjuste(a)}${c.solo ? ' (solo esta semana)' : ''}`));
  // Lo que valía solo la semana pasada y ya no.
  const terminan = (program.cambiosSemana ?? []).filter(c => c.solo && c.semana === s - 1);
  if (terminan.length > 0) ajustes.push('Termina el ajuste puntual de la semana pasada');
  return {
    mantenimiento: mant.includes(s),
    vuelveDeMantenimiento: s > 1 && mant.includes(s - 1) && !mant.includes(s),
    ajustes,
    libres: (program.comidasLibres ?? []).filter(c => c.desde === s)
      .map(c => `${SLOT_LABEL[c.slot] ?? 'Comida'} del ${NOMBRE_DIA[c.dia]} libre${c.hasta ? ` hasta la semana ${c.hasta}` : ''}`),
    suplementos: (program.suplementos ?? []).filter(x => (x.desde ?? 1) === s)
      .map(x => [x.nombre, x.dosis, x.momento].filter(Boolean).join(' · ')),
  };
}

export function hayNovedadesNutricion(n: NovedadesNutricion): boolean {
  return n.mantenimiento || n.vuelveDeMantenimiento || n.ajustes.length > 0 || n.libres.length > 0 || n.suplementos.length > 0;
}
