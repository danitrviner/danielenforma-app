import type { Recipe } from '../types.js';
import { ingredientMatch, normalizeStr } from './foodPrefs.js';
import { dishType, dishTypeLabel, type DishType } from './dishTypes.js';
import { minutosDeReceta } from './tiempoDeReceta.js';
import { fotoDeReceta } from './fotoDeReceta.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Arranque de gustos: 40 recetas «sí / no» (11-2026, Dani)

   El primer menú salía casi a ciegas: solo sabía lo que el atleta escribió en
   el alta. Aquí ve 40 platos en cuatro tandas de 10 (desayunos, comidas, cenas
   y snacks) y dice si se los comería. Decisiones de Dani (16-11-2026):

     · Más de 20, para que vea variedad.
     · Elegidas según los alimentos que marcó que quiere y que no quiere: nada
       con lo que no quiere; seis de cada diez llevan algo que le gusta y las
       otras cuatro son tipos de plato que aún no ha visto.
     · Al acabar se buscan patrones en lo que acepta y en lo que rechaza y se
       le PREGUNTAN para confirmarlos, en vez de darlos por buenos.

   Lo confirmado se guarda como dato firme (alimentos, tipos de plato, platos
   rápidos); cada «sí» y cada «no» queda además como pista suave para el
   generador (`RecipeFavorites.arranque`).

   Lógica pura: sin Firestore ni React.
   ═══════════════════════════════════════════════════════════════════════════ */

export type TandaId = 'desayuno' | 'comida' | 'cena' | 'snack';
export const TANDAS: { id: TandaId; titulo: string; una: string; slots: number[] }[] = [
  { id: 'desayuno', titulo: 'Desayunos', una: 'Desayuno', slots: [1] },
  { id: 'comida', titulo: 'Comidas', una: 'Comida', slots: [3] },
  { id: 'cena', titulo: 'Cenas', una: 'Cena', slots: [5] },
  { id: 'snack', titulo: 'Snacks', una: 'Snack', slots: [2, 4] },
];
export const POR_TANDA = 10;
/** De cada tanda, cuántas llevan algo que le gusta (el resto es para descubrir). */
export const PARTE_CON_GUSTO = 0.6;
/** Como mucho, platos del mismo tipo en una tanda. */
const MAX_DEL_MISMO_TIPO = 2;
/** «Ver 10 más»: cuántas de cada tanda. */
export const TANDA_EXTRA: Record<TandaId, number> = { desayuno: 2, comida: 3, cena: 3, snack: 2 };

export interface PrefsDeArranque {
  liked: readonly string[];
  disliked: readonly string[];
  /** Tipos de plato que ya dijo que no quiere. */
  excludedDishTypes?: readonly string[];
  /** Recetas que ya marcó «no me gusta». */
  dislikedRecipeIds?: readonly string[];
}

export interface RecetaDeArranque {
  recipe: Recipe;
  tanda: TandaId;
  /** Alimentos de los que le gustan que lleva este plato. */
  gustos: string[];
}

const enLista = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`);

/** «Lleva huevo y calabacín, que te gustan». */
export function motivoDeGusto(gustos: readonly string[]): string | null {
  if (gustos.length === 0) return null;
  const dos = gustos.slice(0, 2).map(g => g.toLowerCase());
  return `Lleva ${enLista(dos)}, que te gusta${dos.length > 1 ? 'n' : ''}`;
}

/**
 * Las recetas de una ronda. `pools` ya viene con los filtros duros del atleta
 * (alergias, salud, tipo de dieta y la lista del coach): aquí se quita lo que
 * lleva algo que NO quiere y se reparte entre lo que le gusta y lo nuevo.
 */
export function elegirRecetasDeArranque(
  pools: Partial<Record<TandaId, readonly Recipe[]>>,
  prefs: PrefsDeArranque,
  opciones: { porTanda?: number | Record<TandaId, number>; yaVistas?: ReadonlySet<string>; azar?: () => number } = {},
): RecetaDeArranque[] {
  const vistas = new Set(opciones.yaVistas ?? []);
  const fuera = new Set(prefs.dislikedRecipeIds ?? []);
  const tiposFuera = new Set(prefs.excludedDishTypes ?? []);
  const azar = opciones.azar;
  const out: RecetaDeArranque[] = [];

  for (const tanda of TANDAS) {
    const cuantas = typeof opciones.porTanda === 'object' ? opciones.porTanda[tanda.id] : opciones.porTanda ?? POR_TANDA;
    if (cuantas <= 0) continue;
    const aptas = (pools[tanda.id] ?? [])
      .filter(r => !vistas.has(r.id) && !fuera.has(r.id) && !tiposFuera.has(dishType(r)))
      .filter(r => !prefs.disliked.some(f => ingredientMatch(r, f)))
      .map(recipe => ({ recipe, gustos: prefs.liked.filter(f => ingredientMatch(recipe, f)), orden: azar ? azar() : 0 }))
      // Con foto primero (la tarjeta es la foto); después, el azar o el nombre.
      .sort((a, b) => Number(!!fotoDeReceta(b.recipe)) - Number(!!fotoDeReceta(a.recipe)) || a.orden - b.orden || a.recipe.name.localeCompare(b.recipe.name, 'es'));

    const elegidas: typeof aptas = [];
    const porTipo = new Map<DishType, number>();
    const porGusto = new Map<string, number>();
    const coger = (c: (typeof aptas)[number]) => {
      elegidas.push(c);
      vistas.add(c.recipe.id);
      porTipo.set(dishType(c.recipe), (porTipo.get(dishType(c.recipe)) ?? 0) + 1);
      for (const g of c.gustos) porGusto.set(g, (porGusto.get(g) ?? 0) + 1);
    };
    const libre = (c: (typeof aptas)[number]) => !vistas.has(c.recipe.id);
    const cabeDeTipo = (c: (typeof aptas)[number]) => (porTipo.get(dishType(c.recipe)) ?? 0) < MAX_DEL_MISMO_TIPO;

    // 1. Con algo que le gusta, repartiendo entre sus alimentos y entre tipos
    //    de plato (que no sean seis platos de pollo).
    const conGusto = Math.round(cuantas * PARTE_CON_GUSTO);
    while (elegidas.length < conGusto) {
      const candidatas = aptas.filter(c => libre(c) && c.gustos.length > 0 && cabeDeTipo(c));
      if (candidatas.length === 0) break;
      const peso = (c: (typeof aptas)[number]) => Math.min(...c.gustos.map(g => porGusto.get(g) ?? 0)) * 10 + (porTipo.get(dishType(c.recipe)) ?? 0);
      coger(candidatas.reduce((mejor, c) => (peso(c) < peso(mejor) ? c : mejor)));
    }
    // 2. Para descubrir: tipos de plato que aún no han salido en la tanda.
    while (elegidas.length < cuantas) {
      const nuevas = aptas.filter(c => libre(c) && !porTipo.has(dishType(c.recipe)));
      if (nuevas.length === 0) break;
      coger(nuevas.find(c => c.gustos.length === 0) ?? nuevas[0]);
    }
    // 3. Lo que falte, de lo que quede (primero sin repetir tipo de más).
    for (const paso of [cabeDeTipo, () => true]) {
      for (const c of aptas) {
        if (elegidas.length >= cuantas) break;
        if (libre(c) && paso(c)) coger(c);
      }
    }
    // Mezcladas: que no salgan primero todas las de «te gusta».
    const con = elegidas.filter(c => c.gustos.length > 0);
    const sin = elegidas.filter(c => c.gustos.length === 0);
    const mezcla: typeof aptas = [];
    while (con.length > 0 || sin.length > 0) {
      if (con.length > 0) mezcla.push(con.shift()!);
      if (con.length > 0 && sin.length < con.length) mezcla.push(con.shift()!);
      if (sin.length > 0) mezcla.push(sin.shift()!);
    }
    for (const c of mezcla) out.push({ recipe: c.recipe, tanda: tanda.id, gustos: c.gustos });
  }
  return out;
}

// ─── Patrones ────────────────────────────────────────────────────────────────

export interface RespuestaDeArranque { recipeId: string; gusta: boolean }

/** Alimentos y familias que se buscan en lo que acepta y rechaza. `alimentos`
 *  son los nombres que se guardan si confirma («no quiero»). */
const VOCABULARIO: { nombre: string; alimentos: string[]; dentroDe?: string }[] = [
  { nombre: 'Pollo', alimentos: ['pollo'] },
  { nombre: 'Pavo', alimentos: ['pavo'] },
  { nombre: 'Ternera', alimentos: ['ternera', 'vacuno'] },
  { nombre: 'Cerdo', alimentos: ['cerdo', 'lomo'] },
  { nombre: 'Huevo', alimentos: ['huevo', 'claras'] },
  // El grupo general primero: con 40 platos, el pescado azul o el blanco por
  // separado casi nunca llegan a repetirse lo bastante para preguntar.
  { nombre: 'Pescado', alimentos: ['salmón', 'atún', 'sardina', 'caballa', 'boquerón', 'bonito', 'merluza', 'bacalao', 'lubina', 'dorada', 'rape', 'lenguado'] },
  { nombre: 'Pescado azul', alimentos: ['salmón', 'atún', 'sardina', 'caballa', 'boquerón', 'bonito'], dentroDe: 'Pescado' },
  { nombre: 'Pescado blanco', alimentos: ['merluza', 'bacalao', 'lubina', 'dorada', 'rape', 'lenguado'], dentroDe: 'Pescado' },
  { nombre: 'Marisco', alimentos: ['gamba', 'langostino', 'mejillón', 'calamar', 'sepia', 'pulpo'] },
  { nombre: 'Legumbres', alimentos: ['lenteja', 'garbanzo', 'alubia'] },
  { nombre: 'Tofu', alimentos: ['tofu', 'tempeh', 'seitán'] },
  { nombre: 'Arroz', alimentos: ['arroz'] },
  { nombre: 'Pasta', alimentos: ['pasta', 'espagueti', 'macarr', 'tallar'] },
  { nombre: 'Patata', alimentos: ['patata', 'boniato'] },
  { nombre: 'Avena', alimentos: ['avena'] },
  { nombre: 'Yogur', alimentos: ['yogur', 'skyr', 'kéfir'] },
  { nombre: 'Queso', alimentos: ['queso', 'requesón', 'mozzarella'] },
  { nombre: 'Aguacate', alimentos: ['aguacate'] },
  { nombre: 'Setas', alimentos: ['champiñ', 'seta'] },
  { nombre: 'Calabacín', alimentos: ['calabacín'] },
  { nombre: 'Berenjena', alimentos: ['berenjena'] },
  { nombre: 'Espinacas', alimentos: ['espinaca'] },
  { nombre: 'Brócoli', alimentos: ['brócoli', 'coliflor'] },
  { nombre: 'Plátano', alimentos: ['plátano'] },
  { nombre: 'Frutos rojos', alimentos: ['fresa', 'arándano', 'frambuesa'] },
  { nombre: 'Chocolate', alimentos: ['chocolate', 'cacao'] },
  { nombre: 'Frutos secos', alimentos: ['nuez', 'nueces', 'almendra', 'cacahuete', 'anacardo', 'avellana', 'pistacho'] },
];

/** Lo que tiene que repetirse algo para preguntarlo, y lo claro que tiene que ser. */
export const MIN_APARICIONES = 4;
export const CLARIDAD = 0.8;
export const MAX_PREGUNTAS = 5;
/** Un patrón solo dice algo si se sale de lo que hace en general: a quien dice
 *  «sí» a casi todo no se le pregunta por lo que acepta, ni al revés. */
const TASA_QUE_NO_DICE_NADA = 0.7;
/** Dos patrones que salen de casi los mismos platos son la misma pregunta. */
const SOLAPE_MISMA_PREGUNTA = 0.75;
const MINUTOS_LARGA = 30;

export type AccionDePatron = 'noQuiero' | 'meGusta' | 'tipoPreferido' | 'tipoExcluido' | 'rapidas' | 'nada';

export interface PatronDeArranque {
  id: string;
  tipo: 'alimento' | 'plato' | 'tiempo';
  sentido: 'si' | 'no';
  /** Cuántos eligió, de cuántos vio. */
  si: number;
  total: number;
  titulo: string;
  detalle: string;
  opciones: { texto: string; accion: AccionDePatron }[];
  /** Lo que se guarda si confirma: alimentos, o el tipo de plato. */
  alimentos?: string[];
  tipoDePlato?: DishType;
}

const mismoAlimento = (a: string, b: string) => { const x = normalizeStr(a); const y = normalizeStr(b); return !!x && !!y && (x.includes(y) || y.includes(x)); };

/** Patrones claros en las respuestas, listos para preguntar. Como mucho cinco. */
export function patronesDeArranque(
  vistas: readonly RecetaDeArranque[],
  respuestas: readonly RespuestaDeArranque[],
  ya: { liked: readonly string[]; preferredDishTypes?: readonly string[]; quiereRapidas?: boolean },
): PatronDeArranque[] {
  const gusta = new Map(respuestas.map(r => [r.recipeId, r.gusta]));
  const contestadas = vistas.filter(v => gusta.has(v.recipe.id));
  const cuenta = (rs: readonly RecetaDeArranque[]) => ({ total: rs.length, si: rs.filter(r => gusta.get(r.recipe.id)).length });
  const tasa = contestadas.length > 0 ? cuenta(contestadas).si / contestadas.length : 0.5;
  const claro = (c: { si: number; total: number }): 'si' | 'no' | null => {
    if (c.total < MIN_APARICIONES) return null;
    if (c.si / c.total >= CLARIDAD) return tasa > TASA_QUE_NO_DICE_NADA ? null : 'si';
    if (c.si / c.total <= 1 - CLARIDAD) return tasa < 1 - TASA_QUE_NO_DICE_NADA ? null : 'no';
    return null;
  };
  const out: (PatronDeArranque & { recetas: Set<string> })[] = [];

  // Por tipo de plato.
  const porTipo = new Map<DishType, RecetaDeArranque[]>();
  for (const v of contestadas) { const t = dishType(v.recipe); if (t !== 'otro') porTipo.set(t, [...(porTipo.get(t) ?? []), v]); }
  for (const [t, rs] of porTipo) {
    const c = cuenta(rs);
    const s = claro(c);
    if (!s || (s === 'si' && ya.preferredDishTypes?.includes(t))) continue;
    const nombre = dishTypeLabel(t);
    out.push({
      id: `plato:${t}`, tipo: 'plato', sentido: s, ...c, tipoDePlato: t, recetas: new Set(rs.map(r => r.recipe.id)),
      titulo: s === 'si' ? `${nombre}: ${c.si === c.total ? 'los has elegido todos' : 'has elegido casi todos'}` : `${nombre}: ${c.si === 0 ? 'no has elegido ninguno' : 'has dejado fuera casi todos'}`,
      detalle: `${c.si} de ${c.total} platos`,
      opciones: s === 'si'
        ? [{ texto: 'Quiero más de estos', accion: 'tipoPreferido' }, { texto: 'Solo a veces', accion: 'nada' }]
        : [{ texto: 'No me gustan', accion: 'tipoExcluido' }, { texto: 'Depende del plato', accion: 'nada' }],
    });
  }

  // Por alimento.
  for (const voc of VOCABULARIO) {
    const rs = contestadas.filter(v => voc.alimentos.some(a => ingredientMatch(v.recipe, a)));
    const c = cuenta(rs);
    const s = claro(c);
    if (!s) continue;
    // Si ya se pregunta por el grupo general en el mismo sentido, sobra el fino.
    if (voc.dentroDe && out.some(p => p.id === `alimento:${normalizeStr(voc.dentroDe!)}` && p.sentido === s)) continue;
    const leGusta = ya.liked.some(l => mismoAlimento(l, voc.nombre) || voc.alimentos.some(a => mismoAlimento(l, a)));
    if (s === 'si' && leGusta) continue; // ya lo sabíamos
    const ids = new Set(rs.map(r => r.recipe.id));
    const n = voc.nombre;
    out.push({
      id: `alimento:${normalizeStr(n)}`, tipo: 'alimento', sentido: s, ...c, alimentos: voc.alimentos, recetas: ids,
      titulo: s === 'si' ? `${n}: ${c.si === c.total ? 'los has elegido todos' : 'has elegido casi todos'}`
        : leGusta ? `${n}: dijiste que te gusta, pero ${c.si === 0 ? 'no has elegido ninguno' : 'has dejado fuera casi todos'}`
          : `${n}: ${c.si === 0 ? 'no has elegido ninguno' : 'has dejado fuera casi todos'}`,
      detalle: `${c.si} de ${c.total} platos`,
      opciones: s === 'si'
        ? [{ texto: 'Me gusta mucho', accion: 'meGusta' }, { texto: 'Solo a veces', accion: 'nada' }]
        : [{ texto: 'No me gusta', accion: 'noQuiero' }, { texto: 'Depende del plato', accion: 'nada' }, { texto: 'Sí me gusta', accion: 'nada' }],
    });
  }

  // Por tiempo: deja fuera lo largo y se queda lo rápido.
  if (!ya.quiereRapidas) {
    const conTiempo = contestadas.filter(v => minutosDeReceta(v.recipe) != null);
    const largas = cuenta(conTiempo.filter(v => minutosDeReceta(v.recipe)! > MINUTOS_LARGA));
    const cortas = cuenta(conTiempo.filter(v => minutosDeReceta(v.recipe)! <= MINUTOS_LARGA));
    if (claro(largas) === 'no' && cortas.total >= MIN_APARICIONES && cortas.si / cortas.total >= 0.5) {
      out.push({
        id: 'tiempo:largas', tipo: 'tiempo', sentido: 'no', ...largas, recetas: new Set(),
        titulo: `Platos de más de ${MINUTOS_LARGA} minutos: ${largas.si === 0 ? 'no has elegido ninguno' : 'has dejado fuera casi todos'}`,
        detalle: `${largas.si} de ${largas.total} platos`,
        opciones: [{ texto: 'Prefiero platos rápidos', accion: 'rapidas' }, { texto: 'No es por el tiempo', accion: 'nada' }],
      });
    }
  }

  // «Pescado» (alimento) y «Pescados» (tipo de plato) salen de casi los mismos
  // platos: se pregunta una vez, por el que más platos abarca (a igualdad, el
  // alimento, que es lo que luego filtra de verdad).
  const sobra = new Set<string>();
  for (const a of out) for (const b of out) {
    if (a === b || a.sentido !== b.sentido || a.tipo === b.tipo || a.tipo === 'tiempo' || b.tipo === 'tiempo') continue;
    const comunes = [...a.recetas].filter(id => b.recetas.has(id)).length;
    if (comunes / Math.min(a.recetas.size, b.recetas.size) < SOLAPE_MISMA_PREGUNTA) continue;
    const pierde = a.total !== b.total ? (a.total < b.total ? a : b) : (a.tipo === 'plato' ? a : b);
    sobra.add(pierde.id);
  }

  // Lo que más se ha repetido primero; a igualdad, lo que rechaza.
  return out
    .filter(p => !sobra.has(p.id))
    .sort((a, b) => b.total - a.total || Number(a.sentido === 'si') - Number(b.sentido === 'si') || a.id.localeCompare(b.id))
    .slice(0, MAX_PREGUNTAS)
    .map(({ recetas: _r, ...p }) => { void _r; return p; });
}

// ─── Resultado ───────────────────────────────────────────────────────────────

/** Lo que queda guardado del arranque (`RecipeFavorites.arranque`). */
export interface ArranqueGuardado {
  /** Recetas que se comería y que no: pista suave para el generador. */
  si: string[];
  no: string[];
  /** YYYY-MM-DD de la última vez. */
  hechoEn: string;
}

const MAX_GUARDADAS = 300;
const unicos = (xs: Iterable<string>) => [...new Set(xs)];

export interface ResultadoDeArranque {
  arranque: ArranqueGuardado;
  likedFoods: string[];
  dislikedFoods: string[];
  preferredDishTypes: string[];
  excludedDishTypes: string[];
  quiereRapidas: boolean | undefined;
  cambianAlimentos: boolean;
  cambiaConfig: boolean;
}

/** Junta las respuestas y lo que ha confirmado con lo que ya había guardado. */
export function resultadoDeArranque(
  respuestas: readonly RespuestaDeArranque[],
  patrones: readonly PatronDeArranque[],
  decisiones: Readonly<Record<string, AccionDePatron>>,
  actual: { arranque?: ArranqueGuardado; likedFoods: readonly string[]; dislikedFoods: readonly string[]; preferredDishTypes?: readonly string[]; excludedDishTypes?: readonly string[]; quiereRapidas?: boolean },
  hoy: string,
): ResultadoDeArranque {
  const nuevasSi = respuestas.filter(r => r.gusta).map(r => r.recipeId);
  const nuevasNo = respuestas.filter(r => !r.gusta).map(r => r.recipeId);
  const contestadas = new Set(respuestas.map(r => r.recipeId));
  // Repetir el arranque corrige lo que vuelve a ver y conserva lo demás.
  const si = unicos([...(actual.arranque?.si ?? []).filter(id => !contestadas.has(id)), ...nuevasSi]).slice(-MAX_GUARDADAS);
  const no = unicos([...(actual.arranque?.no ?? []).filter(id => !contestadas.has(id)), ...nuevasNo]).slice(-MAX_GUARDADAS);

  let liked = [...actual.likedFoods];
  let disliked = [...actual.dislikedFoods];
  let preferidos = [...(actual.preferredDishTypes ?? [])];
  let excluidos = [...(actual.excludedDishTypes ?? [])];
  let rapidas = actual.quiereRapidas;
  for (const p of patrones) {
    const accion = decisiones[p.id];
    if (!accion || accion === 'nada') continue;
    if (accion === 'noQuiero' && p.alimentos) {
      liked = liked.filter(l => !p.alimentos!.some(a => mismoAlimento(l, a)));
      disliked = unicos([...disliked, ...p.alimentos]);
    }
    if (accion === 'meGusta' && p.alimentos) {
      const principal = p.alimentos[0];
      disliked = disliked.filter(d => !p.alimentos!.some(a => mismoAlimento(d, a)));
      if (!liked.some(l => mismoAlimento(l, principal))) liked = [...liked, principal];
    }
    if (accion === 'tipoPreferido' && p.tipoDePlato) {
      excluidos = excluidos.filter(t => t !== p.tipoDePlato);
      preferidos = unicos([...preferidos, p.tipoDePlato]);
    }
    if (accion === 'tipoExcluido' && p.tipoDePlato) {
      preferidos = preferidos.filter(t => t !== p.tipoDePlato);
      excluidos = unicos([...excluidos, p.tipoDePlato]);
    }
    if (accion === 'rapidas') rapidas = true;
  }
  const igual = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
  return {
    arranque: { si, no, hechoEn: hoy },
    likedFoods: liked, dislikedFoods: disliked, preferredDishTypes: preferidos, excludedDishTypes: excluidos, quiereRapidas: rapidas,
    cambianAlimentos: !igual(liked, actual.likedFoods) || !igual(disliked, actual.dislikedFoods),
    cambiaConfig: !igual(preferidos, actual.preferredDishTypes ?? []) || !igual(excluidos, actual.excludedDishTypes ?? []) || rapidas !== actual.quiereRapidas,
  };
}
