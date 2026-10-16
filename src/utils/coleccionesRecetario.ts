import type { DietCompletionLog, Recipe } from '../types';
import { dishType, type DishType } from './dishTypes';
import { normalizarTexto } from './busqueda';
import { minutosDeReceta } from './tiempoDeReceta';
import { recipeExchanges } from './recipeMatch';
import { exchangeToKcal } from './nutritionConstants';
import { violatesDietType } from './foodPrefs';
import { violatesHealthConditions } from './dietaryRestrictions';

/* ═══════════════════════════════════════════════════════════════════════════
   Colecciones de la portada «Descubrir» del recetario (10-2026)

   El recetario era una lista paginada con dos desplegables (categoría y
   momento del día): para dar con algo había que saber qué buscar. La portada
   nueva lo da hecho en filas —por comida, por calorías, por tipo de plato, por
   dieta, por ingrediente…— y cada fila abre la lista de esa colección.

   Todo se calcula en el cliente sobre el índice que ya viaja con la app (las
   8.850 recetas del recetario): no hay ninguna lectura nueva a Firestore. Las
   colecciones reciben el pool YA FILTRADO por las restricciones del atleta, así
   que los recuentos son los suyos: un celíaco ve cuántas recetas tiene él, no
   cuántas hay en el catálogo.

   Aquí solo vive la lógica pura; la pantalla es `RecetarioDescubrir.tsx`.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Lo que las colecciones miran de cada receta, calculado una sola vez. Son
 *  ~60 colecciones sobre 8.850 recetas: normalizar el nombre en cada consulta
 *  eran medio millón de NFD + regex al abrir la pantalla. */
interface Ficha {
  nombre: string;
  /** Nombre + ingredientes, normalizado: para «con pollo» vale cualquiera de los dos. */
  texto: string;
  nIngredientes: number;
  tipo: DishType;
  kcal: number;
  minutos: number | null;
  HC: number; PROT: number; GRASA: number;
}

const fichas = new WeakMap<Recipe, Ficha>();

export function fichaDe(r: Recipe): Ficha {
  let f = fichas.get(r);
  if (f) return f;
  const ingredientes = (r.ingredientsText ?? []).map(i => i.name);
  const e = recipeExchanges(r);
  const nombre = normalizarTexto(r.name);
  f = {
    nombre,
    texto: `${nombre} | ${normalizarTexto(ingredientes.join(' | '))}`,
    nIngredientes: ingredientes.length || (r.ingredients ?? []).length,
    tipo: dishType(r),
    // `kcal` del documento si lo trae (las del constructor); si no, de los
    // intercambios, que es lo que ya hace el resto de la app.
    kcal: r.kcal ?? Math.round(exchangeToKcal(e)),
    minutos: minutosDeReceta(r),
    HC: e.HC, PROT: e.PROT, GRASA: e.GRASA,
  };
  fichas.set(r, f);
  return f;
}

const tiene = (texto: string, claves: readonly string[]) => claves.some(k => texto.includes(k));

export interface Coleccion {
  id: string;
  titulo: string;
  /** Emoji de la baldosa. Las colecciones con foto (comida, ingredientes) no lo usan. */
  emoji?: string;
  /** Una línea para las tarjetas grandes. */
  descripcion?: string;
  encaja: (f: Ficha, r: Recipe) => boolean;
}

export type FormaDeFila = 'chip' | 'baldosa' | 'plato' | 'tarjeta';

export interface FilaDescubrir {
  id: string;
  titulo: string;
  forma: FormaDeFila;
  /** Baldosas en dos filas que se desplazan juntas (calorías, tipo de plato, dieta). */
  dosFilas?: boolean;
  colecciones: Coleccion[];
}

const porMomento = (id: string, titulo: string, emoji: string, momento: number): Coleccion =>
  ({ id, titulo, emoji, encaja: (_f, r) => (r.intakeTypes ?? []).includes(momento) });

const porTipo = (tipo: DishType, titulo: string, emoji: string): Coleccion =>
  ({ id: `tipo_${tipo}`, titulo, emoji, encaja: f => f.tipo === tipo });

const porKcal = (desde: number, hasta: number, emoji: string): Coleccion => ({
  id: `kcal_${desde}`,
  titulo: hasta === Infinity ? `${desde}+ kcal` : desde === 0 ? `<${hasta} kcal` : `${desde}-${hasta} kcal`,
  emoji,
  encaja: f => f.kcal >= desde && f.kcal < hasta,
});

/** Busca en nombre E ingredientes: «Ideas con pollo» tiene que pillar la
 *  ensalada que lleva pollo aunque no lo diga en el título. Las claves van ya
 *  normalizadas (sin tildes, en minúscula). */
const conIngrediente = (id: string, titulo: string, descripcion: string, claves: string[]): Coleccion =>
  ({ id, titulo, descripcion, encaja: f => tiene(f.texto, claves) });

/** Las cocinas del mundo se reconocen por el NOMBRE del plato: «soja» o
 *  «curry» como ingrediente no hacen asiático un plato de lentejas. */
const porNombre = (id: string, titulo: string, descripcion: string, claves: string[]): Coleccion =>
  ({ id, titulo, descripcion, encaja: f => tiene(f.nombre, claves) });

const RAPIDAS: Coleccion = { id: 'rapidas', titulo: 'En 10 minutos', emoji: '⚡', encaja: f => f.minutos != null && f.minutos <= 10 };
const TUPPER: Coleccion = { id: 'tupper', titulo: 'Para tupper', emoji: '🍱', encaja: (_f, r) => r.tupper === true };
const PROTEINA: Coleccion = { id: 'proteina', titulo: 'Rica en proteína', emoji: '🍳', encaja: f => f.PROT >= 2 && f.PROT >= f.HC };
const VEGETARIANA: Coleccion = { id: 'vegetariana', titulo: 'Vegetariana', emoji: '🧀', encaja: (_f, r) => !violatesDietType(r, 'vegetariano') };
const VEGANA: Coleccion = { id: 'vegana', titulo: 'Vegana', emoji: '🌱', encaja: (_f, r) => !violatesDietType(r, 'vegano') };
// Celiaquía (66) e intolerancia total a la lactosa (87): mismos códigos que el
// filtro duro de condiciones, así que «Sin gluten» dice lo mismo que el filtro.
const SIN_GLUTEN: Coleccion = { id: 'sin_gluten', titulo: 'Sin gluten', emoji: '🌾', encaja: (_f, r) => !violatesHealthConditions(r, [66]) };
const SIN_LACTOSA: Coleccion = { id: 'sin_lactosa', titulo: 'Sin lactosa', emoji: '🥛', encaja: (_f, r) => !violatesHealthConditions(r, [87]) };

export const MOMENTOS: Coleccion[] = [
  porMomento('desayuno', 'Desayuno', '☕', 1),
  porMomento('media_manana', 'Media mañana', '🍎', 2),
  porMomento('comida', 'Comida', '🍲', 3),
  porMomento('merienda', 'Merienda', '🥪', 4),
  porMomento('cena', 'Cena', '🥗', 5),
];

export const FILAS_DESCUBRIR: FilaDescubrir[] = [
  {
    id: 'populares', titulo: 'Categorías populares', forma: 'chip',
    colecciones: [MOMENTOS[0], MOMENTOS[2], MOMENTOS[4], RAPIDAS, TUPPER, PROTEINA, VEGANA, SIN_GLUTEN],
  },
  {
    id: 'kcal', titulo: 'Por calorías', forma: 'baldosa', dosFilas: true,
    colecciones: [
      porKcal(0, 100, '🍓'), porKcal(100, 200, '🥪'), porKcal(200, 300, '🥯'), porKcal(300, 400, '🥞'),
      porKcal(400, 500, '🍛'), porKcal(500, 600, '🌯'), porKcal(600, 700, '🍝'), porKcal(700, Infinity, '🍔'),
    ],
  },
  { id: 'momento', titulo: 'Elige tu comida', forma: 'plato', colecciones: MOMENTOS },
  {
    id: 'cocinar', titulo: 'Cómo quieres cocinar', forma: 'plato',
    colecciones: [
      RAPIDAS,
      { ...TUPPER, titulo: 'Para llevar' },
      { id: 'pocos_ingredientes', titulo: 'Pocos ingredientes', emoji: '🧺', encaja: f => f.nIngredientes > 0 && f.nIngredientes <= 4 },
      {
        id: 'sin_fuego', titulo: 'Sin fuego', emoji: '🥙',
        encaja: f => (f.tipo === 'ensalada' || f.tipo === 'tostada' || f.tipo === 'yogur' || f.tipo === 'batido') && f.minutos != null && f.minutos <= 10,
      },
      { id: 'al_horno', titulo: 'Al horno', emoji: '🔥', encaja: f => tiene(f.nombre, ['al horno', 'horneado', 'horneada', 'gratinad', 'asado', 'asada']) },
    ],
  },
  {
    id: 'tipo', titulo: 'Tipo de plato', forma: 'baldosa', dosFilas: true,
    colecciones: [
      porTipo('batido', 'Batidos', '🥤'), porTipo('avena', 'Avena y tortitas', '🥞'), porTipo('yogur', 'Yogures y bowls', '🥣'),
      porTipo('tortilla', 'Huevos', '🍳'), porTipo('tostada', 'Tostadas', '🥪'), porTipo('ensalada', 'Ensaladas', '🥗'),
      porTipo('sopa', 'Sopas y cremas', '🍜'), porTipo('arroz', 'Arroces', '🍚'), porTipo('pasta', 'Pastas', '🍝'),
      porTipo('legumbre', 'Legumbres', '🫘'), porTipo('pescado', 'Pescados', '🐟'), porTipo('carne', 'Carnes', '🍗'),
    ],
  },
  {
    id: 'dieta', titulo: 'Elige tu dieta', forma: 'baldosa', dosFilas: true,
    colecciones: [
      VEGETARIANA, VEGANA, SIN_GLUTEN, SIN_LACTOSA,
      { id: 'pescetariana', titulo: 'Pescetariana', emoji: '🐟', encaja: f => f.tipo === 'pescado' },
      { id: 'baja_hc', titulo: 'Baja en hidratos', emoji: '🥜', encaja: f => f.HC <= 0.5 && f.kcal >= 150 },
      { id: 'baja_grasa', titulo: 'Baja en grasa', emoji: '🥒', encaja: f => f.GRASA <= 0.5 },
      { id: 'baja_kcal', titulo: 'Baja en calorías', emoji: '🍏', encaja: f => f.kcal <= 250 },
    ],
  },
  {
    id: 'ingrediente', titulo: 'Cocina con lo que tienes', forma: 'tarjeta',
    colecciones: [
      conIngrediente('con_pollo', 'Ideas con pollo', 'A la plancha, al horno o en tupper: el comodín de la semana sin repetir plato.', ['pollo']),
      conIngrediente('con_huevo', 'Todo con huevo', 'Revueltos, tortillas y claras para cuando necesitas proteína en cinco minutos.', ['huevo', 'clara']),
      conIngrediente('con_avena', 'Avena para todo', 'Porridge, tortitas y bizcochos de taza que cuentan como hidrato de tu plan.', ['avena']),
      conIngrediente('con_legumbres', 'Legumbres sin pereza', 'Lentejas, garbanzos y alubias: hidrato y proteína en el mismo plato.', ['lenteja', 'garbanzo', 'alubia']),
      conIngrediente('con_atun', 'Con una lata de atún', 'Lo que tienes en la despensa convertido en comida de verdad.', ['atun']),
      conIngrediente('con_setas', 'Comidas con setas', 'Champiñones, setas y boletus para dar volumen al plato con pocas calorías.', ['champinon', 'seta', 'boletus', 'shiitake']),
      conIngrediente('con_salmon', 'Salmón', 'Grasa buena y proteína en recetas que no saben a dieta.', ['salmon']),
      conIngrediente('con_aguacate', 'Con aguacate', 'Tostadas, bowls y ensaladas donde el aguacate es tu intercambio de grasa.', ['aguacate']),
    ],
  },
  {
    id: 'mundo', titulo: 'La vuelta al mundo', forma: 'tarjeta',
    colecciones: [
      porNombre('mundo_mexico', 'Sabores mexicanos', 'Tacos, fajitas y burritos ajustados a tus intercambios.', ['taco', 'burrito', 'fajita', 'quesadilla', 'nacho', 'enchilada', 'guacamole', 'mexican']),
      porNombre('mundo_asia', 'Sabores de Asia', 'Woks, currys y pokes para salir de la plancha de siempre.', ['curry', 'wok', 'poke', 'sushi', 'teriyaki', 'pad thai', 'ramen', 'yakisoba', 'tikka']),
      porNombre('mundo_italia', 'Cocina italiana', 'Pasta, risotto y pizza que caben en tu plan sin hacer trampas.', ['pizza', 'risotto', 'lasana', 'carbonara', 'pesto', 'bolonesa', 'noqui', 'canelones']),
      porNombre('mundo_mediterraneo', 'Mediterráneo y Oriente', 'Hummus, cuscús, falafel y kebab casero.', ['hummus', 'falafel', 'cuscus', 'shawarma', 'kebab', 'tzatziki', 'griega', 'tabule', 'musaka']),
    ],
  },
  {
    id: 'caprichos', titulo: 'Caprichos', forma: 'tarjeta',
    colecciones: [{
      id: 'caprichos', titulo: 'Dulces que entran en tu plan',
      descripcion: 'Brownies, tartas y galletas con sus intercambios contados.',
      encaja: f => f.tipo === 'dulce' || tiene(f.nombre, ['brownie', 'tarta', 'galleta', 'helado', 'chocolate', 'bizcocho']),
    }],
  },
];

const TODAS = new Map<string, Coleccion>();
for (const fila of FILAS_DESCUBRIR) for (const c of fila.colecciones) if (!TODAS.has(c.id)) TODAS.set(c.id, c);
for (const c of MOMENTOS) if (!TODAS.has(c.id)) TODAS.set(c.id, c);

export function coleccionPorId(id: string): Coleccion | undefined {
  return TODAS.get(id);
}

/** Las recetas de una colección, en el orden en que llegan en el pool. */
export function recetasDeColeccion(c: Coleccion, pool: readonly Recipe[]): Recipe[] {
  return pool.filter(r => c.encaja(fichaDe(r), r));
}

export interface ResumenDeColeccion {
  total: number;
  /** Hasta 5 recetas CON foto para la portada (sobran dos para que las
   *  colecciones de una misma fila no tengan que repetir foto). */
  portadas: Recipe[];
}

const PORTADAS = 5;

/** Hash estable del id: elige las portadas «al azar» pero siempre las mismas,
 *  en vez de las primeras por orden alfabético (que en el recetario son todas
 *  «Arroz (P) / …» y dejaban cinco portadas casi iguales). */
function hashDe(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Cuántas recetas hay en cada colección y cuáles van de portada, en UNA
 *  pasada por el pool. */
export function resumirColecciones(pool: readonly Recipe[], tieneFoto: (r: Recipe) => boolean): Map<string, ResumenDeColeccion> {
  const cols = [...TODAS.values()];
  const total = new Map<string, number>(cols.map(c => [c.id, 0]));
  const candidatas = new Map<string, { r: Recipe; h: number }[]>(cols.map(c => [c.id, []]));
  for (const r of pool) {
    const f = fichaDe(r);
    const foto = tieneFoto(r);
    const h = foto ? hashDe(r.id) : 0;
    for (const c of cols) {
      if (!c.encaja(f, r)) continue;
      total.set(c.id, total.get(c.id)! + 1);
      if (!foto) continue;
      const lista = candidatas.get(c.id)!;
      if (lista.length < PORTADAS || h < lista[lista.length - 1].h) {
        lista.push({ r, h });
        lista.sort((a, b) => a.h - b.h);
        if (lista.length > PORTADAS) lista.pop();
      }
    }
  }
  return new Map(cols.map(c => [c.id, { total: total.get(c.id)!, portadas: candidatas.get(c.id)!.map(x => x.r) }]));
}

// ── «¿Qué tienes en la nevera?» ───────────────────────────────────────────────

export interface IngredienteDeNevera {
  id: string;
  etiqueta: string;
  emoji: string;
  /** Normalizadas. Basta una para que la receta lo lleve. */
  claves: string[];
  /** Para los nombres cortos que van dentro de otras palabras. */
  palabra?: RegExp;
}

const llevaIngrediente = (texto: string, i: IngredienteDeNevera) =>
  tiene(texto, i.claves) || (!!i.palabra && i.palabra.test(texto));

export const NEVERA: IngredienteDeNevera[] = [
  { id: 'pollo', etiqueta: 'Pollo', emoji: '🍗', claves: ['pollo'] },
  { id: 'huevo', etiqueta: 'Huevo', emoji: '🥚', claves: ['huevo', 'clara'] },
  { id: 'atun', etiqueta: 'Atún', emoji: '🐟', claves: ['atun'] },
  { id: 'pavo', etiqueta: 'Pavo', emoji: '🦃', claves: ['pavo'] },
  { id: 'salmon', etiqueta: 'Salmón', emoji: '🍣', claves: ['salmon'] },
  { id: 'arroz', etiqueta: 'Arroz', emoji: '🍚', claves: ['arroz'] },
  { id: 'pasta', etiqueta: 'Pasta', emoji: '🍝', claves: ['pasta', 'espagueti', 'macarrones', 'tallarines', 'fideos'] },
  { id: 'patata', etiqueta: 'Patata', emoji: '🥔', claves: ['patata'] },
  { id: 'avena', etiqueta: 'Avena', emoji: '🥣', claves: ['avena'] },
  // Palabra entera: «pan» va dentro de «empanada», «panceta» o «panela».
  { id: 'pan', etiqueta: 'Pan', emoji: '🍞', claves: [], palabra: /\bpan\b/ },
  { id: 'legumbres', etiqueta: 'Legumbres', emoji: '🫘', claves: ['lenteja', 'garbanzo', 'alubia'] },
  { id: 'yogur', etiqueta: 'Yogur', emoji: '🥛', claves: ['yogur', 'skyr'] },
  { id: 'queso', etiqueta: 'Queso', emoji: '🧀', claves: ['queso'] },
  { id: 'platano', etiqueta: 'Plátano', emoji: '🍌', claves: ['platano'] },
  { id: 'aguacate', etiqueta: 'Aguacate', emoji: '🥑', claves: ['aguacate'] },
  { id: 'tomate', etiqueta: 'Tomate', emoji: '🍅', claves: ['tomate'] },
  { id: 'espinacas', etiqueta: 'Espinacas', emoji: '🥬', claves: ['espinaca'] },
  { id: 'setas', etiqueta: 'Setas', emoji: '🍄', claves: ['champinon', 'seta'] },
];

/**
 * Recetas que llevan TODO lo marcado. Primero las que menos ingredientes
 * añaden a lo que ya tienes: si marcas pollo y arroz, «Arroz con pollo» de
 * cuatro ingredientes va antes que una paella de catorce, que también los
 * lleva pero te obliga a ir a comprar.
 */
export function recetasConLoQueTienes(pool: readonly Recipe[], ids: readonly string[]): Recipe[] {
  const elegidos = NEVERA.filter(i => ids.includes(i.id));
  if (elegidos.length === 0) return [];
  return pool
    .filter(r => { const t = fichaDe(r).texto; return elegidos.every(i => llevaIngrediente(t, i)); })
    .sort((a, b) => fichaDe(a).nIngredientes - fichaDe(b).nIngredientes);
}

// ── «Las que más haces» ───────────────────────────────────────────────────────

/**
 * Recetas que el atleta ha comido más días, sacadas de su registro diario.
 *
 * Cuenta DÍAS, no apariciones: una receta repartida en tres alimentos de la
 * misma comida (cada uno con su `originRecipeId`) es una vez, no tres. Y solo
 * cuenta lo marcado como comido: lo planificado y no hecho no es «lo que más
 * haces». Los días anteriores a 09-2026 no traen `meals` y no se pueden leer
 * sin la dieta de entonces, así que se saltan.
 */
export function recetasMasHechas(logs: readonly DietCompletionLog[], minimoDeDias = 2): { recipeId: string; dias: number }[] {
  const dias = new Map<string, number>();
  for (const log of logs) {
    if (!log.meals) continue;
    const hechos = new Set(log.doneItemIds ?? []);
    const delDia = new Set<string>();
    for (const meal of log.meals) {
      meal.items.forEach((item, idx) => {
        if (item.originRecipeId && hechos.has(`${meal.id}_${idx}`)) delDia.add(item.originRecipeId);
      });
    }
    for (const id of delDia) dias.set(id, (dias.get(id) ?? 0) + 1);
  }
  return [...dias.entries()]
    .filter(([, n]) => n >= minimoDeDias)
    .sort((a, b) => b[1] - a[1])
    .map(([recipeId, n]) => ({ recipeId, dias: n }));
}

// ── Encajar en un cupo ────────────────────────────────────────────────────────

export interface Cupo { HC: number; PROT: number; GRASA: number }

/**
 * ¿Llena ese hueco sin tocar cantidades? Medio intercambio arriba o abajo en
 * cada grupo, el mismo margen que usa `cabeEnElCupo`. No basta con «caber»: una
 * receta de medio intercambio cabe en todo y no resuelve la comida de nadie.
 */
export function encajaEnCupo(r: Recipe, cupo: Cupo, margen = 0.5): boolean {
  if (cupo.HC + cupo.PROT + cupo.GRASA <= 0) return false;
  const f = fichaDe(r);
  return Math.abs(f.HC - cupo.HC) <= margen && Math.abs(f.PROT - cupo.PROT) <= margen && Math.abs(f.GRASA - cupo.GRASA) <= margen;
}

// ── La próxima comida del día ─────────────────────────────────────────────────

const NOMBRE_DE_FRANJA: Record<number, string> = { 1: 'desayuno', 2: 'media mañana', 3: 'comida', 4: 'merienda', 5: 'cena' };

/** Franja que toca a esta hora. Cortes generosos hacia delante: a las 12:45
 *  ya se está pensando en la comida, no en la media mañana. */
export function franjaDeLaHora(hora: number): number {
  if (hora < 10.5) return 1;
  if (hora < 12.5) return 2;
  if (hora < 16) return 3;
  if (hora < 19.5) return 4;
  return 5;
}

/**
 * El reparto de la siguiente comida de hoy, para la fila «Encajan en tu…».
 *
 * Es el objetivo que el coach puso a ESA comida, no lo que le queda después de
 * lo ya comido: el recetario no lleva el registro del día y calcularlo aquí
 * sería duplicar (mal) lo que hace Mi plan. Sin reparto por comidas, sin dieta
 * hoy (día libre) o pasada la cena, no hay fila: mejor ninguna que una que
 * cuadre contra un número inventado.
 */
export function cupoDeLaProximaComida(
  meals: readonly { name: string; slot?: number; target?: Partial<Cupo>; libre?: boolean }[] | undefined,
  resolverFranjas: (m: { name: string; slot?: number }[]) => number[],
  hora: number,
): { titulo: string; cupo: Cupo } | null {
  if (!meals?.length) return null;
  const franjas = resolverFranjas([...meals]);
  const ahora = franjaDeLaHora(hora);
  const candidatas = meals
    .map((m, i) => ({ m, franja: franjas[i] }))
    .filter(({ m, franja }) => franja >= ahora && !m.libre && m.target && (m.target.HC ?? 0) + (m.target.PROT ?? 0) + (m.target.GRASA ?? 0) > 0)
    .sort((a, b) => a.franja - b.franja);
  const siguiente = candidatas[0];
  if (!siguiente) return null;
  const t = siguiente.m.target!;
  return {
    titulo: `Encajan en tu ${NOMBRE_DE_FRANJA[siguiente.franja] ?? 'próxima comida'}`,
    cupo: { HC: t.HC ?? 0, PROT: t.PROT ?? 0, GRASA: t.GRASA ?? 0 },
  };
}
