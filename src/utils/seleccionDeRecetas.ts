import type { Recipe, WeekDay } from '../types.js';
import { dishType, type DishType } from './dishTypes.js';
import { normalizeStr } from './foodPrefs.js';
import { filtrarPorLista, MIN_RECETAS_DE_LISTA, type ListaDeMenu } from './accesoARecetas.js';
import type { AmbitoDeRegla } from './reglasDeReceta.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Qué recetas usa el generador con cada dieta de un atleta

   El coach elige, dieta a dieta, de qué recetas tira el generador de menús:
   solo Rápidas, para tupper, ciertos tipos de plato, con alguno de estos
   alimentos, sin estos otros, o solo las de sus paquetes. Cada cosa que marca
   ESTRECHA la lista (se cumplen todas a la vez); dentro de cada cosa basta con
   una (con arroz O garbanzos, de este paquete O de ese).

   - Una dieta sin filtros propios usa los de «Todas las dietas»; sin ninguno,
     la lista del menú de siempre (accesoARecetas.ts).
   - Los «días con tiempo» levantan el límite de rápidas: el atleta que no
     tiene tiempo entre semana pero el jueves sí.
   - Si los filtros dejaran menos de `MIN_RECETAS_DE_LISTA` recetas para una
     comida, esa comida vuelve a la lista de siempre: un menú con opciones es
     mejor que una comida vacía. El panel del coach lo avisa antes.

   Afecta al menú generado y a «cambiar comida», no al recetario que navega.
   Aquí solo vive la lógica pura; se guarda en `athleteRecipeRules/{email}`
   (`seleccion`) y los paquetes en `recipeAccess/global` (`paquetes`).
   ═══════════════════════════════════════════════════════════════════════════ */

export interface FiltroDeRecetas {
  /** Solo recetas Rápidas (minutos de verdad, ver tiempoDeReceta.ts). */
  rapidas?: boolean;
  /** Solo recetas que aguantan en tupper. */
  tupper?: boolean;
  /** Solo estos tipos de plato. */
  platos?: DishType[];
  /** Que lleven al menos uno de estos alimentos. */
  con?: string[];
  /** Que no lleven ninguno de estos alimentos. */
  sin?: string[];
  /** Solo recetas de estos paquetes del coach. */
  paquetes?: string[];
}

export interface SeleccionDeRecetas {
  /** Para las dietas que no tienen filtros propios. */
  general?: FiltroDeRecetas;
  /** Filtros propios, por id de dieta. */
  porDieta?: Record<string, FiltroDeRecetas>;
  /** Días en los que el atleta sí tiene tiempo: no se limita a rápidas. */
  diasConTiempo?: WeekDay[];
}

/** Conjunto de recetas con nombre que el coach monta a mano. */
export interface PaqueteDeRecetas {
  id: string;
  nombre: string;
  recipeIds: string[];
}

/** Clave de la tarjeta «Todas las dietas» en el panel. */
export const TODAS_LAS_DIETAS = 'general';

export function filtroVacio(f: FiltroDeRecetas | null | undefined): boolean {
  return !f || (!f.rapidas && !f.tupper && !f.platos?.length && !f.con?.length && !f.sin?.length && !f.paquetes?.length);
}

/** Filtro que manda para una dieta: el suyo, si no el general, si no ninguno. */
export function filtroDeDieta(sel: SeleccionDeRecetas | undefined, dietId?: string | null): FiltroDeRecetas | null {
  const propio = dietId ? sel?.porDieta?.[dietId] : undefined;
  if (!filtroVacio(propio)) return propio!;
  return filtroVacio(sel?.general) ? null : sel!.general!;
}

/** El filtro guardado en una tarjeta (`TODAS_LAS_DIETAS` o el id de una dieta). */
export function filtroDeTarjeta(sel: SeleccionDeRecetas | undefined, clave: string): FiltroDeRecetas {
  return (clave === TODAS_LAS_DIETAS ? sel?.general : sel?.porDieta?.[clave]) ?? {};
}

/** ¿Todos los días de la elección son «con tiempo»? En una tanda (varios días)
 *  se cocina una sola vez, así que basta con que uno no lo sea para limitarla. */
export function esDiaConTiempo(sel: SeleccionDeRecetas | undefined, dias?: readonly WeekDay[]): boolean {
  const conTiempo = sel?.diasConTiempo ?? [];
  return !!dias?.length && conTiempo.length > 0 && dias.every(d => conTiempo.includes(d));
}

/** Palabras de familia: «sin pescado» tiene que quitar la merluza aunque
 *  ningún ingrediente se llame «pescado». */
const FAMILIAS: Record<string, string[]> = {
  pescado: ['pescado', 'salmon', 'atun', 'merluza', 'bacalao', 'lubina', 'dorada', 'sardina', 'trucha', 'boqueron',
    'caballa', 'rape', 'emperador', 'lenguado', 'panga', 'anchoa', 'bonito', 'abadejo', 'gallo'],
  marisco: ['marisco', 'gamba', 'langostino', 'mejillon', 'calamar', 'pulpo', 'sepia', 'almeja', 'cangrejo', 'surimi', 'chipiron'],
  carne: ['carne', 'pollo', 'ternera', 'cerdo', 'pavo', 'lomo', 'jamon', 'chorizo', 'cordero', 'conejo', 'buey',
    'hamburguesa', 'salchicha', 'bacon', 'beicon', 'solomillo', 'pechuga', 'muslo', 'fiambre'],
  legumbre: ['legumbre', 'garbanzo', 'lenteja', 'alubia', 'judia blanca', 'judion', 'frijol', 'hummus', 'edamame'],
  lacteo: ['lacteo', 'leche', 'yogur', 'queso', 'nata', 'mantequilla', 'kefir', 'requeson', 'cuajada'],
};

/** Formas en las que puede aparecer un alimento escrito por el coach: con y sin
 *  plural («garbanzos» tiene que encontrar «Garbanzo cocido»), y la familia
 *  entera si es una palabra de familia («pescado», «lácteos»). */
function formasDe(alimento: string): string[] {
  const n = normalizeStr(alimento).trim();
  if (!n) return [];
  const familia = FAMILIAS[n] ?? FAMILIAS[n.replace(/es$/, '')] ?? FAMILIAS[n.replace(/s$/, '')];
  if (familia) return familia;
  const formas = new Set([n]);
  if (n.endsWith('es') && n.length > 4) formas.add(n.slice(0, -2));
  if (n.endsWith('s') && n.length > 3) formas.add(n.slice(0, -1));
  return [...formas];
}

/** ¿Lleva la receta este alimento? Tolera plurales y tildes. */
export function llevaAlimento(recipe: Pick<Recipe, 'ingredientsText'>, alimento: string): boolean {
  const formas = formasDe(alimento);
  if (formas.length === 0) return false;
  return (recipe.ingredientsText ?? []).some(ing => {
    const n = normalizeStr(ing.name);
    return formas.some(f => n.includes(f));
  });
}

/** Comprueba un filtro contra una receta. Se compila una vez por llamada para
 *  no reconstruir los ids de los paquetes receta a receta. */
export function compilarFiltro(
  f: FiltroDeRecetas, paquetes: readonly PaqueteDeRecetas[] = [], conTiempo = false,
): (r: Recipe) => boolean {
  const deLosPaquetes = f.paquetes?.length
    ? new Set(paquetes.filter(p => f.paquetes!.includes(p.id)).flatMap(p => p.recipeIds))
    : null;
  const platos = f.platos?.length ? new Set(f.platos) : null;
  const con = f.con ?? [];
  const sin = f.sin ?? [];
  return r => {
    if (deLosPaquetes && !deLosPaquetes.has(r.id)) return false;
    if (f.rapidas && !conTiempo && !r.basica) return false;
    if (f.tupper && !r.tupper) return false;
    if (platos && !platos.has(dishType(r))) return false;
    if (con.length > 0 && !con.some(a => llevaAlimento(r, a))) return false;
    if (sin.some(a => llevaAlimento(r, a))) return false;
    return true;
  };
}

export interface ConSeleccion {
  listaMenu?: ListaDeMenu;
  seleccion?: SeleccionDeRecetas;
  paquetes?: PaqueteDeRecetas[];
}

/**
 * Recetas de las que puede tirar el generador para una dieta y unos días.
 *
 * Con filtro y suficientes recetas, manda el filtro (gana a la lista del menú:
 * es más concreto). Sin filtro, o si se queda corto, la lista de siempre. El
 * recetario que navega el atleta no se toca. `conTiempo` sale para que quien
 * llama tampoco aplique el tope de minutos del atleta ese día.
 */
export function aplicarSeleccion<T extends Recipe>(
  pool: T[], prefs: ConSeleccion,
  ctx: { dietId?: string | null; dias?: readonly WeekDay[]; ambito?: AmbitoDeRegla },
): { pool: T[]; conTiempo: boolean } {
  if (ctx.ambito === 'recetario') return { pool, conTiempo: false };
  const conTiempo = esDiaConTiempo(prefs.seleccion, ctx.dias);
  const filtro = filtroDeDieta(prefs.seleccion, ctx.dietId);
  if (filtro) {
    const dentro = pool.filter(compilarFiltro(filtro, prefs.paquetes, conTiempo));
    if (dentro.length >= MIN_RECETAS_DE_LISTA) return { pool: dentro, conTiempo };
  }
  return { pool: filtrarPorLista(pool, prefs.listaMenu), conTiempo };
}

/**
 * Para montar el pool de una comida: ¿quiere ALGUNA dieta del atleta esta
 * receta? El generador baraja una muestra de 300 recetas por comida; sin esto,
 * «con garbanzos» buscaría solo entre esas 300 y saldrían dos o tres.
 * `undefined` si no hay ningún filtro.
 */
export function quiereAlgunaDieta(
  sel: SeleccionDeRecetas | undefined, paquetes: readonly PaqueteDeRecetas[] = [],
): ((r: Recipe) => boolean) | undefined {
  const filtros = [sel?.general, ...Object.values(sel?.porDieta ?? {})].filter(f => !filtroVacio(f)) as FiltroDeRecetas[];
  if (filtros.length === 0) return undefined;
  const pasan = filtros.map(f => compilarFiltro(f, paquetes, false));
  return r => pasan.some(p => p(r));
}

/** Suma lo de una plantilla a un filtro: los «solo» se encienden y las listas se juntan. */
export function sumarFiltro(base: FiltroDeRecetas, extra: FiltroDeRecetas): FiltroDeRecetas {
  const junta = <T,>(a?: T[], b?: T[]) => {
    const r = [...new Set([...(a ?? []), ...(b ?? [])])];
    return r.length ? r : undefined;
  };
  return limpiarFiltro({
    rapidas: base.rapidas || extra.rapidas,
    tupper: base.tupper || extra.tupper,
    platos: junta(base.platos, extra.platos),
    con: junta(base.con, extra.con),
    sin: junta(base.sin, extra.sin),
    paquetes: junta(base.paquetes, extra.paquetes),
  });
}

/** Quita lo vacío para no guardar `false` ni listas vacías. */
export function limpiarFiltro(f: FiltroDeRecetas): FiltroDeRecetas {
  const r: FiltroDeRecetas = {};
  if (f.rapidas) r.rapidas = true;
  if (f.tupper) r.tupper = true;
  if (f.platos?.length) r.platos = [...new Set(f.platos)];
  if (f.con?.length) r.con = [...new Set(f.con)];
  if (f.sin?.length) r.sin = [...new Set(f.sin)];
  if (f.paquetes?.length) r.paquetes = [...new Set(f.paquetes)];
  return r;
}

/** Pone (o quita, con un filtro vacío) el filtro de una tarjeta. */
export function conFiltro(sel: SeleccionDeRecetas | undefined, clave: string, filtro: FiltroDeRecetas): SeleccionDeRecetas {
  const limpio = limpiarFiltro(filtro);
  const vacio = filtroVacio(limpio);
  const siguiente: SeleccionDeRecetas = { ...sel };
  if (clave === TODAS_LAS_DIETAS) {
    if (vacio) delete siguiente.general; else siguiente.general = limpio;
  } else {
    const porDieta = { ...sel?.porDieta };
    if (vacio) delete porDieta[clave]; else porDieta[clave] = limpio;
    if (Object.keys(porDieta).length) siguiente.porDieta = porDieta; else delete siguiente.porDieta;
  }
  return siguiente;
}

/** Cambia los días con tiempo (los siete o ninguno se guardan como ninguno). */
export function conDiasConTiempo(sel: SeleccionDeRecetas | undefined, dias: WeekDay[]): SeleccionDeRecetas {
  const siguiente: SeleccionDeRecetas = { ...sel };
  const unicos = [...new Set(dias)];
  if (unicos.length === 0 || unicos.length === 7) delete siguiente.diasConTiempo;
  else siguiente.diasConTiempo = unicos;
  return siguiente;
}

/** Atajos de un toque. Se SUMAN a lo que ya tenga la dieta. */
export const PLANTILLAS: { id: string; nombre: string; icono: string; filtro: FiltroDeRecetas }[] = [
  { id: 'rapidas', nombre: 'Solo rápidas', icono: 'bolt', filtro: { rapidas: true } },
  { id: 'tupper', nombre: 'Para tupper', icono: 'takeout_dining', filtro: { tupper: true } },
  { id: 'legumbres', nombre: 'Legumbres', icono: 'grain', filtro: { con: ['Garbanzos', 'Lentejas', 'Alubias'] } },
  { id: 'arroz-pasta', nombre: 'Arroces y pastas', icono: 'rice_bowl', filtro: { platos: ['arroz', 'pasta'] } },
  { id: 'ligeras', nombre: 'Ensaladas y cremas', icono: 'grass', filtro: { platos: ['ensalada', 'sopa'] } },
  { id: 'huevos', nombre: 'Huevos', icono: 'egg', filtro: { con: ['Huevo'] } },
];

/** «Rápidas · arroces · con arroz, garbanzos · sin atún», o «Sin filtros». */
export function resumenDeFiltro(
  f: FiltroDeRecetas | null | undefined,
  nombreDePaquete: (id: string) => string | undefined = () => undefined,
  etiquetaDePlato: (d: DishType) => string = d => d,
): string {
  if (filtroVacio(f)) return 'Sin filtros';
  const partes: string[] = [];
  if (f!.rapidas) partes.push('Rápidas');
  if (f!.tupper) partes.push('Tupper');
  if (f!.platos?.length) partes.push(f!.platos.map(etiquetaDePlato).join(', ').toLowerCase());
  if (f!.paquetes?.length) partes.push(`paquete ${f!.paquetes.map(id => nombreDePaquete(id) ?? 'borrado').join(', ')}`);
  if (f!.con?.length) partes.push(`con ${f!.con.join(', ').toLowerCase()}`);
  if (f!.sin?.length) partes.push(`sin ${f!.sin.join(', ').toLowerCase()}`);
  return partes.join(' · ');
}

/** Id nuevo para un paquete: legible y sin colisiones con los que ya hay. */
export function idDePaquete(nombre: string, existentes: readonly PaqueteDeRecetas[]): string {
  const base = normalizeStr(nombre).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'paquete';
  let id = base;
  for (let i = 2; existentes.some(p => p.id === id); i++) id = `${base}-${i}`;
  return id;
}
