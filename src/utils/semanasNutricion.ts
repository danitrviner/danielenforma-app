import type {
  ReglaDePeso, DietCompletionLog,
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
  diet: Diet, ajustes: AjusteDeComida[], opciones: { mantenimiento?: boolean; libres?: number[]; hcDelDia?: number } = {},
): Diet {
  let meals = diet.meals.map(m => ({ ...m, items: m.items.map(it => ({ ...it })) }));
  const slots = resolveSlots(meals);
  // Día alto/bajo: a la comida pegada al entreno si la dieta la marca; si no,
  // a la que más hidratos lleva.
  const iEntreno = meals.findIndex(m => m.aroundTraining);
  const todos: AjusteDeComida[] = [
    ...ajustes,
    ...(opciones.mantenimiento ? meals.map((_, i) => ({ slot: slots[i], cat: 'HC' as const, delta: 1 })) : []),
    ...(opciones.hcDelDia ? [{ ...(iEntreno >= 0 ? { slot: slots[iEntreno] } : {}), cat: 'HC' as const, delta: opciones.hcDelDia }] : []),
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

/** Intercambios de HC que el ciclado suma (o resta) ese día, o 0. `entrena`
 *  undefined = no se sabe (no se aplica nada). */
export function hcDelCiclado(program: Pick<NutritionProgram, 'ciclado'>, semana: number, entrena: boolean | undefined): number {
  const c = program.ciclado;
  if (!c || entrena === undefined || semana < c.desde || (c.hasta !== undefined && semana > c.hasta)) return 0;
  return entrena ? c.entreno : c.descanso;
}

/** La dieta que toca `fecha` con todo lo programado para esa semana.
 *  `entrena`: si ese día tiene sesión asignada (para el ciclado de hidratos). */
export function dietaDeLaSemana(diet: Diet, program: NutritionProgram | null | undefined, fecha: string, entrena?: boolean): Diet {
  if (!program) return diet;
  const s = semanaDelPrograma(program, fecha);
  const ajustes = ajustesDeLaSemana(program, s);
  const mantenimiento = (program.semanasMantenimiento ?? []).includes(s);
  const libres = libresDelDia(program, s, diaDeLaSemana(fecha));
  const hcDelDia = hcDelCiclado(program, s, entrena);
  if (ajustes.length === 0 && !mantenimiento && libres.length === 0 && hcDelDia === 0) return diet;
  return aplicarAjustes(diet, ajustes, { mantenimiento, libres, hcDelDia });
}

/** Objetivo de pasos que rige `fecha`: el último que haya empezado, o `base`. */
export function objetivoDePasos(program: Pick<NutritionProgram, 'startDate' | 'pasosPorSemana'> | null | undefined, fecha: string, base: number | undefined): number | undefined {
  if (!program?.pasosPorSemana?.length) return base;
  const s = semanaDelPrograma(program, fecha);
  const vigente = [...program.pasosPorSemana].filter(p => p.semana <= s).sort((a, b) => b.semana - a.semana)[0];
  return vigente?.pasos ?? base;
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
  if (program.ciclado && program.ciclado.desde === s) {
    const { entreno, descanso } = program.ciclado;
    const t = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)} ${Math.abs(n) === 1 ? 'intercambio' : 'intercambios'} de hidratos`;
    ajustes.push(`Días de entreno: ${t(entreno)}; días de descanso: ${t(descanso)}`);
  }
  const pasos = (program.pasosPorSemana ?? []).find(p => p.semana === s);
  if (pasos) ajustes.push(`Objetivo de pasos: ${pasos.pasos.toLocaleString('es-ES')} al día`);
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

// ── Progresiones en un clic ─────────────────────────────────────────────────

/** Salida de déficit: +1 intercambio de hidratos cada semana desde `desde`
 *  hasta rozar `objetivoKcal` (sin pasarse más de medio intercambio). */
export function salidaDeDeficit(program: NutritionProgram, diets: Diet[], desde: number, objetivoKcal: number): NutritionProgram {
  let p = program;
  const n = totalSemanas(program);
  for (let s = desde; s <= n; s++) {
    const k = kcalPorSemana(p, diets)[s];
    if (k == null || k + 100 > objetivoKcal + 50) break;
    p = { ...p, cambiosSemana: programarAjuste(p, s, false, { cat: 'HC', delta: 1 }) };
  }
  return p;
}

/** Una semana de mantenimiento cada `cada` semanas entre `desde` y `hasta`
 *  (la última de cada tramo: 6 → S6, S12…). */
export function descansosDeDieta(program: NutritionProgram, cada: number, desde: number, hasta: number): NutritionProgram {
  const nuevas: number[] = [];
  for (let s = desde + cada - 1; s <= hasta; s += cada) nuevas.push(s);
  const lista = Array.from(new Set<number>([...(program.semanasMantenimiento ?? []), ...nuevas])).sort((a, b) => a - b);
  return { ...program, semanasMantenimiento: lista.length > 0 ? lista : undefined };
}

/** Bajada progresiva: −1 intercambio de `cat` cada `cada` semanas desde
 *  `desde`, sin bajar de `sueloKcal`. */
export function bajadaProgresiva(program: NutritionProgram, diets: Diet[], desde: number, cada: number, cat: MacroAjustable, sueloKcal: number): NutritionProgram {
  let p = program;
  const n = totalSemanas(program);
  for (let s = desde; s <= n; s += Math.max(1, cada)) {
    const k = kcalPorSemana(p, diets)[s];
    if (k == null || k - 100 < sueloKcal) break;
    p = { ...p, cambiosSemana: programarAjuste(p, s, false, { cat, delta: -1 }) };
  }
  return p;
}

// ── Reglas por peso ─────────────────────────────────────────────────────────

export interface PropuestaDeRegla {
  regla: ReglaDePeso;
  semana: number;           // desde qué semana se propone el ajuste
  ajuste: AjusteDeComida;
  texto: string;
}

const kg = (n: number) => `${n.toLocaleString('es-ES', { maximumFractionDigits: 2 })} kg`;

/**
 * Reglas que se cumplen con el peso de las últimas semanas COMPLETAS antes de
 * `semanaActual`. `pesos[i]` = media de la semana i+1 (weeklyRealWeightKg).
 * No propone nada si esa semana ya tiene un cambio programado.
 */
export function evaluarReglasDePeso(program: NutritionProgram, pesos: (number | null)[], semanaActual: number): PropuestaDeRegla[] {
  const out: PropuestaDeRegla[] = [];
  const destino = semanaActual + 1;
  if (destino > totalSemanas(program)) return out;
  if ((program.cambiosSemana ?? []).some(c => c.semana === destino)) return out;
  for (const regla of program.reglasPeso ?? []) {
    const ritmos: number[] = [];
    // Semanas completas: de semanaActual-1 hacia atrás.
    for (let s = semanaActual - 1; s >= 2 && ritmos.length < regla.semanas; s--) {
      const a = pesos[s - 2], b = pesos[s - 1];
      if (a == null || b == null) break;
      ritmos.push(b - a);
    }
    if (ritmos.length < regla.semanas) continue;
    const insuficiente = regla.tipo === 'bajar'
      ? ritmos.every(r => -r < regla.ritmoMinimo)
      : ritmos.every(r => r < regla.ritmoMinimo);
    if (!insuficiente) continue;
    const delta = regla.tipo === 'bajar' ? -regla.cantidad : regla.cantidad;
    const media = ritmos.reduce((x, y) => x + y, 0) / ritmos.length;
    out.push({
      regla, semana: destino, ajuste: { cat: regla.cat, delta },
      texto: `${regla.semanas} semanas ${regla.tipo === 'bajar' ? 'bajando' : 'subiendo'} ${kg(Math.abs(media))}/semana de media (menos de ${kg(regla.ritmoMinimo)}): ${delta > 0 ? '+' : '−'}${Math.abs(delta)} ${NOMBRE_MACRO[regla.cat]} desde la semana ${destino}.`,
    });
  }
  return out;
}

// ── Proteína ────────────────────────────────────────────────────────────────

/** g de proteína por kg de peso que da el cupo de cada semana (25 g por
 *  intercambio de proteína, mixtos a medias). Índice 1..N; null sin dato. */
export function proteinaGKgPorSemana(program: NutritionProgram, diets: Diet[], pesoKg: number | null): (number | null)[] {
  const n = totalSemanas(program);
  return Array.from({ length: n + 1 }, (_, s) => {
    if (s === 0 || !pesoKg) return null;
    const f = faseDeLaSemana(program, s);
    const diet = f && diets.find(d => d.id === f.fase.dietId);
    if (!diet) return null;
    const d = aplicarAjustes(diet, ajustesDeLaSemana(program, s), { mantenimiento: (program.semanasMantenimiento ?? []).includes(s) });
    return Math.round((macrosDeCupo(d.budget).PROT * 25 / pesoKg) * 10) / 10;
  });
}

// ── Hábitos (agua y verdura/fruta) ──────────────────────────────────────────

export interface HabitosDeSemana { aguaL: number | null; raciones: number | null; dias: number }

/** Media diaria de agua (L) y raciones por semana del programa, solo con los
 *  días en que el atleta apuntó algo. Índice 1..N. */
export function habitosPorSemana(program: NutritionProgram, logs: DietCompletionLog[]): (HabitosDeSemana | null)[] {
  const n = totalSemanas(program);
  const acc = Array.from({ length: n + 1 }, () => ({ agua: [] as number[], rac: [] as number[] }));
  for (const l of logs) {
    const s = semanaDelPrograma(program, l.date);
    if (s < 1 || s > n || l.date < program.startDate) continue;
    if (typeof l.aguaMl === 'number') acc[s].agua.push(l.aguaMl / 1000);
    if (typeof l.racionesVegetales === 'number') acc[s].rac.push(l.racionesVegetales);
  }
  const media = (xs: number[]) => xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null;
  return acc.map((a, s) => s === 0 || (a.agua.length === 0 && a.rac.length === 0)
    ? null
    : { aguaL: media(a.agua), raciones: media(a.rac), dias: Math.max(a.agua.length, a.rac.length) });
}
