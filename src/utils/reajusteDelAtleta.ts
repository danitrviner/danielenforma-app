import type { IngredienteVinculado, MenuComplement, MenuDay, MenuMeal, PautadoDeComida, Recipe } from '../types.js';
import { escalarMacros, redondearMacros } from './macros.js';
import { intercambiosDeMacros } from './macrosLegado.js';
import { macrosDeAcompanamiento, macrosDeLaComida, macrosDelPlato, objetivoDeLaComida, objetivoDelDiaDeMenu } from './menuMacros.js';
import { escalasPermitidas } from './menuEngine.js';

/* ═══════════════════════════════════════════════════════════════════════════
   El atleta mueve su día (11-2026, Dani)

   «Si quiero comer un poco más del desayuno o un poco menos, que eso ajuste
   automáticamente las demás recetas. Y si le da a extra y mete fruta o algo
   dulce, que se ajuste también.»

   Hasta ahora la ración de un plato del menú no se podía tocar y un extra solo
   entraba si cabía en el hueco de SU comida. Aquí el tope pasa a ser el DÍA:

     1. Lo que el atleta elige se queda fijo, igual que lo que ya se ha comido,
        la fruta y el extra fijo del coach y los táperes de tanda.
     2. Lo que sobra o falta se reparte entre las comidas que quedan abiertas:
        primero se quitan los extras de cuadrar, luego se mueve la ración del
        plato de 0,25 en 0,25 (misma receta, siempre entera: no se desmonta).
     3. La proteína se protege: no se da un paso que deje el día por debajo del
        mínimo. Antes que eso, el día se queda algo pasado y se dice.

   Lógica pura: sin Firestore ni React.
   ═══════════════════════════════════════════════════════════════════════════ */

export const PASO_RACION = 0.25;

/** Lo que el coach deja mover. Valores por defecto; pensado para ir por atleta. */
export interface LimitesDeReajuste {
  /** kcal que el día puede desviarse sin tocar nada más. */
  margenKcal: number;
  /** Parte de la proteína del día que no se toca. */
  proteinaMinPct: number;
  /** Hasta dónde baja y sube el reajuste un plato respecto a lo pautado. */
  bajaHasta: number;
  subeHasta: number;
}
export const LIMITES_POR_DEFECTO: LimitesDeReajuste = { margenKcal: 50, proteinaMinPct: 0.9, bajaHasta: 0.5, subeHasta: 1.5 };

export interface CambioDeReajuste {
  mealId: string;
  comida: string;
  receta: string;
  kcalAntes: number;
  kcalDespues: number;
  racionAntes: number;
  racionDespues: number;
  extrasQuitados: string[];
}

export interface Reajuste {
  dia: MenuDay;
  /** Lo que se ha movido en las DEMÁS comidas. */
  cambios: CambioDeReajuste[];
  objetivoKcal: number;
  kcalDespues: number;
  /** kcal de más (+) o de menos (−) con que queda el día. */
  desvioKcal: number;
  estado: 'cuadra' | 'pasado' | 'corto';
  proteina: { objetivo: number; despues: number };
  /** No quedaba dónde compensar (todo comido o fijo, o tocaba la proteína). */
  sinMargen: boolean;
  /** Lo que ha cedido la PROPIA comida para que entre el extra o el capricho. */
  enSuComida?: CambioEnSuComida;
}

/** «Patata 250 → 190 g» o, si la receta no deja mover ingredientes, el plato
 *  entero de ×1 a ×0,75. */
export interface CambioEnSuComida {
  ingredientes: Array<{ nombre: string; antes: number; despues: number }>;
  racionAntes: number;
  racionDespues: number;
  /** kcal del plato (sin extras) antes y después. */
  kcalAntes: number;
  kcalDespues: number;
}

const aCuarto = (n: number) => Math.round(n * 4) / 4;
const techo1 = (n: number) => Math.ceil(n * 10 - 1e-9) / 10;
const kcalDe = (m: MenuMeal) => macrosDeLaComida(m).kcal;

export function pautadoDe(meal: MenuMeal): PautadoDeComida {
  return meal.pautado ?? {
    scale: meal.scale,
    macros: macrosDelPlato(meal),
    ...(meal.ajuste ? { ajuste: meal.ajuste } : {}),
    ...(meal.racionesExtra?.length ? { racionesExtra: meal.racionesExtra } : {}),
  };
}

/** La ración a la que se sirve ahora el plato, en las unidades de la barra (×1,25). */
export function racionDe(meal: MenuMeal): number {
  const base = pautadoDe(meal);
  const kcalDeLaPautada = (meal.mezcla?.macros ?? base.macros).kcal;
  if (!meal.pautado || kcalDeLaPautada <= 0) return meal.scale;
  return aCuarto(base.scale * macrosDelPlato(meal).kcal / kcalDeLaPautada);
}

/** Raciones entre las que puede elegir el atleta: las mismas del generador
 *  (un plato pequeño no baja de ¾, uno grande no pasa de ×3). */
export function racionesPosibles(meal: MenuMeal): number[] {
  const base = pautadoDe(meal);
  const kcalDeUna = base.scale > 0 ? base.macros.kcal / base.scale : base.macros.kcal;
  const lista = new Set<number>([...escalasPermitidas(kcalDeUna), base.scale, racionDe(meal)]);
  return [...lista].sort((a, b) => a - b);
}

/** El objetivo de la comida pasa a ser lo que suma ahora: así la capa de
 *  escritura (`acotarExtrasDeComida`) ni recorta lo elegido ni deja un hueco
 *  falso en la comida que ha cedido. Hacia arriba, para que el redondeo no
 *  se coma un cuarto de ración. */
function alDia(meal: MenuMeal): MenuMeal {
  const t = macrosDeLaComida(meal);
  const objetivoMacros = { kcal: Math.ceil(t.kcal), p: techo1(t.p), hc: techo1(t.hc), g: techo1(t.g) };
  const o = intercambiosDeMacros(objetivoMacros);
  return { ...meal, kcal: Math.round(t.kcal), objetivoMacros, objetivo: { HC: o.HC, PROT: o.PROT, GRASA: o.GRASA } };
}

/** El plato servido a `racion`, partiendo siempre de lo pautado (y de la
 *  mezcla de ingredientes del atleta, si la hay: la ración la escala entera). */
export function conRacion(meal: MenuMeal, racion: number, porAtleta = false): MenuMeal {
  const base = pautadoDe(meal);
  const f = base.scale > 0 ? racion / base.scale : 1;
  const macros = redondearMacros(escalarMacros(meal.mezcla?.macros ?? base.macros, f));
  const e = intercambiosDeMacros(macros);
  const racionesExtra = (base.racionesExtra ?? [])
    .map(r => ({ ...r, quantity: aCuarto(r.quantity * f), gramos: Math.round(r.gramos * f) }))
    .filter(r => r.quantity >= PASO_RACION);
  // Receta ajustada ingrediente a ingrediente (por el generador o por el
  // atleta): la ración va en los gramos.
  const gramosBase = meal.mezcla?.gramos ?? base.ajuste?.gramos;
  const { ajuste: _a, ...sinAjuste } = meal;
  void _a;
  const siguiente: MenuMeal = {
    ...sinAjuste,
    pautado: base,
    scale: base.ajuste ? base.scale : racion,
    macros,
    exch: { HC: e.HC, PROT: e.PROT, GRASA: e.GRASA },
    ...(gramosBase ? { ajuste: { cambios: base.ajuste?.cambios ?? [], gramos: gramosBase.map(g => ({ n: g.n, gramos: Math.round(g.gramos * f) })) } } : {}),
    racionesExtra: racionesExtra.length > 0 ? racionesExtra : undefined,
  };
  if (porAtleta) siguiente.racionDelAtleta = true;
  return alDia(siguiente);
}

/** Sube el objetivo de la comida hasta lo que suma, macro a macro, sin bajarlo
 *  donde todavía queda hueco. */
function alMenosLoQueSuma(meal: MenuMeal): MenuMeal {
  const o = objetivoDeLaComida(meal);
  if (!o) return meal;
  const t = macrosDeLaComida(meal);
  const objetivoMacros = { kcal: Math.max(o.kcal, Math.ceil(t.kcal)), p: Math.max(o.p, techo1(t.p)), hc: Math.max(o.hc, techo1(t.hc)), g: Math.max(o.g, techo1(t.g)) };
  const e = intercambiosDeMacros(objetivoMacros);
  return { ...meal, objetivoMacros, objetivo: { HC: e.HC, PROT: e.PROT, GRASA: e.GRASA } };
}

/** Comidas que el reajuste no toca: las ya comidas, las de tanda, las que el
 *  atleta ya eligió a su medida y las que no tienen plato que mover. */
export function comidasFijas(dia: MenuDay, hechas: Iterable<string> = [], tanda: Iterable<string> = []): Set<string> {
  const fijas = new Set<string>([...hechas, ...tanda]);
  for (const m of dia.meals) if (m.racionDelAtleta || m.soloFruta || !m.recipeId) fijas.add(m.id);
  return fijas;
}

const esDeCuadrar = (c: MenuComplement) => !c.obligatoria && !c.fijo && !c.delAtleta;
const densidadDeProteina = (p: number, kcal: number) => (kcal > 0 ? (p * 4) / kcal : 0);

/** Reparte lo que sobra o falta del día entre las comidas que no son `fijas`. */
export function reajustarElResto(dia: MenuDay, fijas: ReadonlySet<string>, limites: LimitesDeReajuste = LIMITES_POR_DEFECTO): Reajuste {
  const objetivo = objetivoDelDiaDeMenu(dia);
  const antes = new Map(dia.meals.map(m => [m.id, m]));
  let meals = dia.meals.map(m => ({ ...m, complements: [...(m.complements ?? [])] }));
  const abiertas = meals.map((m, i) => i).filter(i => !fijas.has(meals[i].id) && !meals[i].soloFruta && !!meals[i].recipeId);
  const quitados = new Map<string, string[]>();
  const total = () => meals.reduce((s, m) => s + kcalDe(m), 0);
  const proteina = () => meals.reduce((s, m) => s + macrosDeLaComida(m).p, 0);
  const falta = () => objetivo.kcal - total(); // >0 falta comer · <0 sobra
  let sinMargen = false;

  // 1. Sobra: primero se van los extras de cuadrar (el plátano de la merienda),
  //    empezando por los que menos proteína llevan.
  if (falta() < -limites.margenKcal) {
    const extras = abiertas.flatMap(i => meals[i].complements.filter(esDeCuadrar).map(c => ({ i, c, m: macrosDeAcompanamiento(c) })))
      .sort((a, b) => densidadDeProteina(a.m.p, a.m.kcal) - densidadDeProteina(b.m.p, b.m.kcal));
    for (const { i, c, m } of extras) {
      const sobra = -falta();
      if (sobra <= limites.margenKcal) break;
      if (m.kcal >= 2 * sobra) continue; // quitarlo dejaría el día más lejos
      meals[i] = { ...meals[i], complements: meals[i].complements.filter(x => x !== c) };
      quitados.set(meals[i].id, [...(quitados.get(meals[i].id) ?? []), c.foodLabel]);
    }
  }

  // 2. Pasos de ración, de 0,25 en 0,25, cada vez en la comida que menos se ha
  //    movido respecto a lo pautado (el recorte se reparte, no cae en una sola).
  for (let vuelta = 0; vuelta < 80; vuelta++) {
    const d = falta();
    if (Math.abs(d) <= limites.margenKcal) break;
    const dir = d > 0 ? 1 : -1;
    const prot = proteina();
    let mejor: { i: number; meal: MenuMeal; pos: number; dens: number } | null = null;
    for (const i of abiertas) {
      const m = meals[i];
      const base = pautadoDe(m);
      const sig = aCuarto(racionDe(m) + dir * PASO_RACION);
      if (sig < base.scale * limites.bajaHasta - 1e-9 || sig > base.scale * limites.subeHasta + 1e-9) continue;
      if (!racionesPosibles(m).includes(sig)) continue;
      const cand = conRacion(m, sig);
      const dk = kcalDe(cand) - kcalDe(m);
      if (dk === 0 || Math.abs(d - dk) >= Math.abs(d)) continue; // no acerca
      const protTras = prot + macrosDeLaComida(cand).p - macrosDeLaComida(m).p;
      if (dir < 0 && protTras < objetivo.p * limites.proteinaMinPct) continue; // proteína protegida
      const pos = sig / base.scale;
      const pm = macrosDelPlato(m);
      const dens = densidadDeProteina(pm.p, pm.kcal);
      const gana = !mejor
        || (dir < 0 ? pos > mejor.pos + 1e-9 : pos < mejor.pos - 1e-9)
        || (Math.abs(pos - mejor.pos) <= 1e-9 && (dir < 0 ? dens < mejor.dens : dens > mejor.dens));
      if (gana) mejor = { i, meal: cand, pos, dens };
    }
    if (!mejor) { sinMargen = true; break; }
    meals[mejor.i] = mejor.meal;
  }

  // Las comidas tocadas guardan su nuevo objetivo; las demás quedan tal cual.
  const cambios: CambioDeReajuste[] = [];
  meals = meals.map(m => {
    const era = antes.get(m.id)!;
    const k0 = Math.round(kcalDe(era));
    const k1 = Math.round(kcalDe(m));
    const fuera = quitados.get(m.id) ?? [];
    if (k0 === k1 && fuera.length === 0) return era;
    cambios.push({ mealId: m.id, comida: m.name, receta: m.recipeName, kcalAntes: k0, kcalDespues: k1, racionAntes: racionDe(era), racionDespues: racionDe(m), extrasQuitados: fuera });
    return alDia(m);
  });

  const kcalDespues = Math.round(meals.reduce((s, m) => s + kcalDe(m), 0));
  const desvioKcal = Math.round(kcalDespues - objetivo.kcal);
  return {
    dia: { ...dia, meals },
    cambios,
    objetivoKcal: Math.round(objetivo.kcal),
    kcalDespues,
    desvioKcal,
    estado: Math.abs(desvioKcal) <= limites.margenKcal ? 'cuadra' : desvioKcal > 0 ? 'pasado' : 'corto',
    proteina: { objetivo: Math.round(objetivo.p), despues: Math.round(meals.reduce((s, m) => s + macrosDeLaComida(m).p, 0)) },
    sinMargen: sinMargen && Math.abs(desvioKcal) > limites.margenKcal,
  };
}

const conComida = (dia: MenuDay, mealId: string, f: (m: MenuMeal) => MenuMeal): MenuDay =>
  ({ ...dia, meals: dia.meals.map(m => (m.id === mealId ? f(m) : m)) });

/** El atleta elige la ración de un plato y el resto del día se recoloca. */
export function cambiarRacion(dia: MenuDay, mealId: string, racion: number, fijas: ReadonlySet<string>, limites?: LimitesDeReajuste): Reajuste {
  const conLaSuya = conComida(dia, mealId, m => conRacion(m, racion, true));
  return reajustarElResto(conLaSuya, new Set([...fijas, mealId]), limites);
}

/* ── Los ingredientes del plato ──────────────────────────────────────────────
   Solo en recetas vinculadas al catálogo (cada ingrediente con sus valores por
   100 g): sin eso no se puede saber qué suma el plato al mover uno. */

/** Lo que hace falta de la receta para mover sus ingredientes. */
export interface IngredientesDeReceta { ings: IngredienteVinculado[]; nombres: string[] }

export function ingredientesDeReceta(recipe: Pick<Recipe, 'vinculo' | 'ingredientsText'> | null | undefined): IngredientesDeReceta | null {
  const ings = recipe?.vinculo?.ingredientes;
  if (!ings || !ings.some(i => i.alimentoId !== null && i.porCien)) return null;
  if (!ings.every(i => i.alimentoId === null || !!i.porCien)) return null;
  return { ings, nombres: (recipe!.ingredientsText ?? []).map(i => i.name) };
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const esGrasa = (i: IngredienteVinculado) => !!i.porCien && i.porCien.g >= 80;

/** Gramos de cada ingrediente a la ración pautada, sin mezcla del atleta. */
function gramosPautados(meal: MenuMeal, r: IngredientesDeReceta): Map<number, number> {
  const base = pautadoDe(meal);
  const deAjuste = new Map((base.ajuste?.gramos ?? []).map(g => [g.n, g.gramos]));
  // Solo los que cuentan (y los que el generador ya ajustó): la sal y el agua
  // se quedan con el texto de la receta.
  return new Map(r.ings
    .filter(i => deAjuste.has(i.n) || (i.alimentoId !== null && !!i.porCien))
    .map(i => [i.n, deAjuste.get(i.n) ?? i.gramos * (base.ajuste ? 1 : base.scale)]));
}

/** El plato con esos gramos (a la ración pautada) en los ingredientes que se
 *  indican; el resto se queda como estaba. La ración que tenía no cambia. */
function conMezcla(meal: MenuMeal, r: IngredientesDeReceta, cambios: Map<number, number>): MenuMeal {
  const base = pautadoDe(meal);
  const racion = racionDe(meal);
  const pautados = gramosPautados(meal, r);
  const gramos = new Map(pautados);
  for (const g of meal.mezcla?.gramos ?? []) if (gramos.has(g.n)) gramos.set(g.n, g.gramos);
  for (const [n, g] of cambios) if (gramos.has(n)) gramos.set(n, Math.max(0, g));
  let { kcal, p, hc, g } = base.macros;
  let igual = true;
  for (const i of r.ings) {
    const d = (gramos.get(i.n) ?? 0) - (pautados.get(i.n) ?? 0);
    if (Math.abs(d) < 0.05) continue;
    igual = false;
    if (!i.porCien) continue;
    kcal += i.porCien.kcal * d / 100; p += i.porCien.p * d / 100; hc += i.porCien.hc * d / 100; g += i.porCien.g * d / 100;
  }
  const { mezcla: _m, ...sinMezcla } = meal;
  void _m;
  const siguiente: MenuMeal = igual ? sinMezcla : {
    ...sinMezcla,
    mezcla: {
      gramos: [...gramos].map(([n, gr]) => ({ n, gramos: r1(gr) })),
      macros: { kcal: Math.max(0, r1(kcal)), p: Math.max(0, r1(p)), hc: Math.max(0, r1(hc)), g: Math.max(0, r1(g)) },
    },
  };
  return conRacion({ ...siguiente, pautado: base }, racion);
}

export interface IngredienteVariable {
  n: number;
  nombre: string;
  /** Gramos que lleva ahora y los que le tocaban, a la ración a la que se sirve. */
  gramos: number;
  pautado: number;
  /** De cuánto en cuánto sube y baja, y hasta dónde. */
  paso: number;
  min: number;
  max: number;
}

/** Los ingredientes que el atleta puede subir o bajar en ese plato. `holgura`
 *  es lo que le deja su nivel de libertad, igual que en la ración (0,25 = un
 *  cuarto arriba o abajo); sin tope, de quitarlo al triple. */
export function ingredientesVariables(meal: MenuMeal, r: IngredientesDeReceta, holgura = Infinity): IngredienteVariable[] {
  const base = pautadoDe(meal);
  const f = base.scale > 0 ? racionDe(meal) / base.scale : 1;
  const pautados = gramosPautados(meal, r);
  const mezcla = new Map((meal.mezcla?.gramos ?? []).map(g => [g.n, g.gramos]));
  const lista: IngredienteVariable[] = [];
  for (const i of r.ings) {
    if (i.alimentoId === null || !i.porCien) continue;
    const pautado = Math.round((pautados.get(i.n) ?? 0) * f);
    if (pautado <= 0) continue;
    const paso = esGrasa(i) ? (pautado < 20 ? 1 : 5) : pautado < 60 ? 5 : pautado < 200 ? 10 : 25;
    const pasos = Math.floor((pautado * Math.min(holgura, 2)) / paso + 1e-9);
    lista.push({
      n: i.n,
      nombre: r.nombres[i.n] ?? '',
      gramos: Math.round((mezcla.get(i.n) ?? pautados.get(i.n) ?? 0) * f),
      pautado,
      paso,
      min: Number.isFinite(holgura) ? Math.max(0, pautado - pasos * paso) : 0,
      max: pautado + pasos * paso,
    });
  }
  return lista;
}

/** El atleta pone `gramos` de un ingrediente (a la ración a la que se sirve el
 *  plato). Como la ración elegida, queda fijo para el reajuste del día. */
export function conIngrediente(meal: MenuMeal, r: IngredientesDeReceta, n: number, gramos: number): MenuMeal {
  const base = pautadoDe(meal);
  const f = base.scale > 0 ? racionDe(meal) / base.scale : 1;
  return { ...conMezcla(meal, r, new Map([[n, f > 0 ? gramos / f : gramos]])), racionDelAtleta: true };
}

/** ¿Es el mismo plato? Misma ración y mismos ingredientes. */
export function mismoPlato(a: MenuMeal, b: MenuMeal): boolean {
  return racionDe(a) === racionDe(b) && JSON.stringify(a.mezcla?.gramos ?? null) === JSON.stringify(b.mezcla?.gramos ?? null);
}

/** «Patata 250 → 300 g» por cada ingrediente que cambia entre dos versiones del plato. */
export function cambiosDeIngredientes(antes: MenuMeal, despues: MenuMeal, r: IngredientesDeReceta): Array<{ nombre: string; antes: number; despues: number }> {
  const a = new Map(ingredientesVariables(antes, r).map(i => [i.n, i]));
  return ingredientesVariables(despues, r)
    .filter(i => a.has(i.n) && a.get(i.n)!.gramos !== i.gramos)
    .map(i => ({ nombre: i.nombre, antes: a.get(i.n)!.gramos, despues: i.gramos }));
}

/** El día con esa comida tal como la deja el atleta: las demás compensan. */
export function conComidaElegida(dia: MenuDay, comida: MenuMeal, fijas: ReadonlySet<string>, limites?: LimitesDeReajuste): Reajuste {
  return reajustarElResto(conComida(dia, comida.id, () => comida), new Set([...fijas, comida.id]), limites);
}

/** Saca `kcal` del plato para hacerle sitio a un extra. Con receta vinculada,
 *  de los ingredientes de hidratos y de grasa (la proteína no se toca), todos
 *  en la misma proporción y nunca por debajo de `bajaHasta`. Sin ella, el plato
 *  entero baja de cuarto en cuarto. Lo que no consiga sacar se queda para el
 *  reajuste del resto del día. */
function recortarPlato(meal: MenuMeal, kcal: number, r: IngredientesDeReceta | null, limites: LimitesDeReajuste): MenuMeal {
  if (kcal <= 0 || !meal.recipeId) return meal;
  const base = pautadoDe(meal);
  const racion = racionDe(meal);
  const f = base.scale > 0 ? racion / base.scale : 1;
  if (r && f > 0) {
    const ahora = new Map(ingredientesVariables(meal, r).map(i => [i.n, i]));
    const cedibles = r.ings
      .filter(i => !i.fijo && (i.palanca === 'hc' || i.palanca === 'grasa') && !!i.porCien && (ahora.get(i.n)?.gramos ?? 0) > 0)
      .map(i => ({ i, g: ahora.get(i.n)!.gramos, suelo: (ahora.get(i.n)!.pautado) * limites.bajaHasta }));
    const total = cedibles.reduce((s, c) => s + c.g * c.i.porCien!.kcal / 100, 0);
    if (total > 0) {
      const factor = Math.max(0, 1 - kcal / total);
      const cambios = new Map<number, number>();
      for (const c of cedibles) {
        const paso = esGrasa(c.i) ? 1 : 5;
        const despues = Math.min(c.g, Math.max(Math.ceil(c.suelo / paso - 1e-9) * paso, Math.round((c.g * factor) / paso) * paso));
        if (despues !== c.g) cambios.set(c.i.n, despues / f);
      }
      if (cambios.size > 0) return conMezcla(meal, r, cambios);
    }
  }
  // Sin ingredientes que mover: la ración entera, al cuarto que más se acerque.
  const antes = macrosDelPlato(meal).kcal;
  let mejor = meal;
  let resto = kcal;
  for (const sig of racionesPosibles(meal)) {
    if (sig >= racion || sig < base.scale * limites.bajaHasta - 1e-9) continue;
    const cand = conRacion(meal, sig);
    const queda = Math.abs(kcal - (antes - macrosDelPlato(cand).kcal));
    if (queda < resto) { mejor = cand; resto = queda; }
  }
  return mejor;
}

/** El atleta añade un extra o un capricho a una comida. Entra entero y, si el
 *  día se pasa, lo primero que cede es el plato de ESA comida (Dani, 16-11-2026:
 *  «si mete 100 kcal de galletas, tendrá que comer 100 kcal menos de comida»);
 *  solo lo que ese plato no pueda ceder se reparte entre las demás. `receta` es
 *  la de esa comida, si está vinculada: sin ella el plato baja entero. */
export function anadirExtraDelAtleta(
  dia: MenuDay, mealId: string, extra: MenuComplement, fijas: ReadonlySet<string>,
  limites: LimitesDeReajuste = LIMITES_POR_DEFECTO, receta: IngredientesDeReceta | null = null,
): Reajuste {
  const original = dia.meals.find(m => m.id === mealId);
  const conExtra = (m: MenuMeal) => alDia({ ...m, complements: [...(m.complements ?? []), { ...extra, delAtleta: true }] });
  let conElExtra = conComida(dia, mealId, conExtra);
  let enSuComida: CambioEnSuComida | undefined;
  const objetivo = objetivoDelDiaDeMenu(dia);
  const sobra = conElExtra.meals.reduce((s, m) => s + kcalDe(m), 0) - objetivo.kcal;
  if (original && !fijas.has(mealId) && sobra > limites.margenKcal) {
    // Nunca más que el propio extra: 100 kcal de galletas, 100 kcal menos de plato.
    const recortada = recortarPlato(original, Math.min(sobra, macrosDeAcompanamiento(extra).kcal), receta, limites);
    const candidato = conComida(dia, mealId, () => conExtra(recortada));
    // La proteína se protege igual que en el resto del día: el recorte no
    // puede ser lo que la deje por debajo del mínimo.
    const prot = (d: MenuDay) => d.meals.reduce((s, m) => s + macrosDeLaComida(m).p, 0);
    const proteina = prot(candidato);
    if (recortada !== original && (proteina >= objetivo.p * limites.proteinaMinPct || proteina >= prot(conElExtra) - 0.5)) {
      conElExtra = candidato;
      enSuComida = {
        ingredientes: receta ? cambiosDeIngredientes(original, recortada, receta) : [],
        racionAntes: racionDe(original),
        racionDespues: racionDe(recortada),
        kcalAntes: Math.round(macrosDelPlato(original).kcal),
        kcalDespues: Math.round(macrosDelPlato(recortada).kcal),
      };
    }
  }
  const r = reajustarElResto(conElExtra, new Set([...fijas, mealId]), limites);
  return enSuComida ? { ...r, enSuComida } : r;
}

/** El atleta cambia el plato de una comida («Intercambiar»): entra la receta
 *  nueva y, si el día se descuadra, lo compensan las demás. `plato` es la
 *  comida ya con la receta nueva; lo que se guardó de la anterior (lo pautado,
 *  la ración elegida) se cae, porque era de otro plato. */
export function cambiarPlato(dia: MenuDay, mealId: string, plato: MenuMeal, fijas: ReadonlySet<string>, limites?: LimitesDeReajuste): Reajuste {
  const { pautado: _p, racionDelAtleta: _r, mezcla: _m, ...limpio } = plato;
  void _p; void _r; void _m;
  const nuevo: MenuMeal = { ...limpio, kcal: Math.round(kcalDe(limpio as MenuMeal)) };
  const r = reajustarElResto(conComida(dia, mealId, () => nuevo), new Set([...fijas, mealId]), limites);
  // Si alguien ha cedido o crecido por este plato, su comida ya no tiene hueco
  // que rellenar: su objetivo pasa a ser lo que suma. Y aunque nadie se mueva,
  // si el plato nuevo pesa más que el objetivo que heredó del anterior, el
  // objetivo sube con él: si no, la capa de escritura (`acotarExtrasDeComida`)
  // le quitaría al guardar los extras que el atleta sigue viendo en pantalla.
  const cambiada = r.dia.meals.find(m => m.id === mealId);
  const objetivo = cambiada ? objetivoDeLaComida(cambiada) : null;
  const sePasa = !!cambiada && !!objetivo && (() => {
    const t = macrosDeLaComida(cambiada);
    return t.kcal > objetivo.kcal || t.p > objetivo.p || t.hc > objetivo.hc || t.g > objetivo.g;
  })();
  if (r.cambios.length > 0) return { ...r, dia: conComida(r.dia, mealId, alDia) };
  return sePasa ? { ...r, dia: conComida(r.dia, mealId, alMenosLoQueSuma) } : r;
}

/** Deshace lo que el atleta y el reajuste movieron en un plato. */
export function aLoPautado(meal: MenuMeal): MenuMeal {
  if (!meal.pautado) return meal;
  const { mezcla: _m, ...sinMezcla } = meal;
  const { pautado, racionDelAtleta: _r, ...resto } = conRacion(sinMezcla, meal.pautado.scale);
  void pautado; void _r; void _m;
  return resto as MenuMeal;
}

const num = (n: number) => String(n).replace('.', ',');
/** «Cena ×1 → ×0,75 (−140 kcal)» · «Merienda sin Plátano». */
export function textoDeCambio(c: CambioDeReajuste): string {
  const partes: string[] = [];
  if (c.racionAntes !== c.racionDespues) partes.push(`×${num(c.racionAntes)} → ×${num(c.racionDespues)}`);
  if (c.extrasQuitados.length > 0) partes.push(`sin ${c.extrasQuitados.join(', ').toLowerCase()}`);
  const dk = c.kcalDespues - c.kcalAntes;
  return `${c.comida} ${partes.join(' · ')} (${dk > 0 ? '+' : '−'}${Math.abs(dk)} kcal)`;
}

export function textoDeEstado(r: Pick<Reajuste, 'estado' | 'desvioKcal'>): string {
  if (r.estado === 'cuadra') return 'El día sigue cuadrado';
  return r.estado === 'pasado' ? `Hoy te pasas ${Math.abs(r.desvioKcal)} kcal` : `Hoy te quedas ${Math.abs(r.desvioKcal)} kcal por debajo`;
}
