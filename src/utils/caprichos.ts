import { normalizarTexto, coincideBusqueda } from './busqueda.js';
import type { AlimentoCatalogo } from './catalogoAlimentos.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Caprichos (11-2026, Dani)

   Dos cosas:

   1. La lista de caprichos que se enseña al poner el «extra fijo» de una
      comida. Antes salía el catálogo entero con una regex de dulces delante,
      y entraban alubias, ajos tiernos o mermelada de tomate y albahaca. Ahora,
      sin buscar nada, solo salen caprichos de verdad: los dulces del lead
      magnet del súper (Mercadona, Lidl, Carrefour; datos de etiqueta vía Open
      Food Facts) y los de toda la vida con valores genéricos. Buscando, se
      busca en esta lista y en el catálogo.

   2. Los caprichos del atleta (`OnboardingData.caprichos`): los apunta él como
      quiera —de la lista, o escrito a su manera con una nota de cuándo le
      gusta— y el coach los ve arriba del todo al elegir el extra.

   Lógica pura: sin Firestore ni React.
   ═══════════════════════════════════════════════════════════════════════════ */

export type GrupoDeCapricho = 'proteina' | 'chocolate' | 'helado' | 'ligero' | 'clasico' | 'salado';

export const GRUPOS_DE_CAPRICHO: { id: GrupoDeCapricho; titulo: string }[] = [
  { id: 'proteina', titulo: 'Con proteína' },
  { id: 'chocolate', titulo: 'Chocolate y cacao' },
  { id: 'helado', titulo: 'Helados' },
  { id: 'ligero', titulo: 'Casi sin kcal' },
  { id: 'clasico', titulo: 'De toda la vida' },
  { id: 'salado', titulo: 'Salado' },
];

export interface CaprichoSugerido extends AlimentoCatalogo {
  grupo: GrupoDeCapricho;
}

const OFF = 'Etiqueta (Open Food Facts)';
const GENERICO = 'Valor genérico';

type Fila = [id: string, nombre: string, grupo: GrupoDeCapricho, kcal: number, p: number, hc: number, g: number, unidad: string | null, gramos: number, fuente: string];

/* Por 100 g (o 100 ml). La unidad es la ración que se come de verdad: la
   tarrina, la onza, la bola. Los del súper salen del lead magnet «Super
   rápido» (catalogo.json, 05-11-2026). */
const FILAS: Fila[] = [
  // Con proteína
  ['mousse-chocolate-proteinas-hacendado', 'Mousse sabor chocolate +Proteínas (Mercadona)', 'proteina', 74, 10, 4.5, 1.5, 'tarrina', 100, OFF],
  ['natillas-chocolate-proteinas-hacendado', 'Natillas con chocolate +Proteínas (Mercadona)', 'proteina', 81, 8.4, 8.7, 1.1, 'tarrina', 120, OFF],
  ['natillas-vainilla-proteinas-hacendado', 'Natillas sabor vainilla +Proteínas (Mercadona)', 'proteina', 77, 10, 5.8, 1.5, 'tarrina', 120, OFF],
  ['pudding-caramelo-proteinas-hacendado', 'Pudding sabor caramelo +Proteínas (Mercadona)', 'proteina', 79, 10, 6.3, 1.5, 'tarrina', 120, OFF],
  ['gelatina-proteinas-hacendado', 'Gelatina de frutos silvestres +Proteínas (Mercadona)', 'proteina', 40, 10, 0, 0, 'tarrina', 100, OFF],
  ['pudding-vainilla-high-protein-lidl', 'Pudding de vainilla High Protein (Lidl)', 'proteina', 74, 10, 4.8, 1.5, 'tarrina', 200, OFF],
  ['pudding-cacahuete-proteina-carrefour', 'Pudding sabor cacahuete PROteína (Carrefour)', 'proteina', 74, 10, 5.1, 1.5, 'tarrina', 100, OFF],
  ['batido-chocolate-high-protein-lidl', 'Batido de chocolate High Protein (Lidl)', 'proteina', 67, 10.6, 5.3, 0.3, 'brik', 250, OFF],
  ['bebida-cacao-proteina-carrefour', 'Bebida láctea al cacao Proteína Plus (Carrefour)', 'proteina', 78, 11, 5.1, 1.7, 'brik', 250, OFF],
  ['helado-high-protein-cookies-lidl', 'Helado High Protein cookies & cream (Lidl)', 'proteina', 124, 7.2, 19.7, 3.7, 'tarrina', 265, OFF],

  // Chocolate y cacao
  ['chocolate-85-porciones-hacendado', 'Chocolate negro 85 % en porciones (Mercadona)', 'chocolate', 608, 11, 18, 52, 'porción', 10, OFF],
  ['chocolate-72-porciones-hacendado', 'Chocolate negro 72 % en porciones (Mercadona)', 'chocolate', 563, 10, 32, 42, 'porción', 10, OFF],
  ['chocolate-85-sin-azucar-hacendado', 'Chocolate negro 85 % sin azúcares añadidos (Mercadona)', 'chocolate', 583, 11, 18, 51, 'onza', 10, OFF],
  ['chocolate-99-hacendado', 'Chocolate 99 % cacao (Mercadona)', 'chocolate', 610, 15, 8, 54, 'onza', 10, OFF],
  ['chocolate-negro-sin-azucar-lidl', 'Chocolate negro 0 % azúcares añadidos (Lidl)', 'chocolate', 452, 6, 48, 32, 'onza', 10, OFF],
  ['chocolate-con-leche', 'Chocolate con leche', 'chocolate', 535, 7.6, 59, 30, 'onza', 10, GENERICO],
  ['crema-cacao-avellanas', 'Crema de cacao y avellanas', 'chocolate', 539, 6.3, 57.5, 30.9, 'cucharada', 15, GENERICO],
  ['batido-chocolate-sin-azucar-hacendado', 'Batido de chocolate 0 % azúcares añadidos (Mercadona)', 'chocolate', 45, 2.2, 6, 1.3, 'brik', 200, OFF],
  ['bebida-avena-chocolate-hacendado', 'Bebida de avena con chocolate sin azúcares añadidos (Mercadona)', 'chocolate', 44, 1.2, 5.1, 1.9, 'vaso', 250, OFF],

  // Helados
  ['helado-vainilla', 'Helado de vainilla', 'helado', 207, 3.5, 24, 11, 'bola', 60, GENERICO],
  ['helado-bombon', 'Helado bombón (tipo Magnum)', 'helado', 330, 4, 30, 21, 'helado', 70, GENERICO],
  ['mini-bombon-sin-azucar-hacendado', 'Mini bombón helado sin azúcares añadidos (Mercadona)', 'helado', 295, 6, 31.5, 19.7, 'mini bombón', 40, OFF],
  ['mini-sorbetes-hacendado', 'Mini sorbetes de hielo (Mercadona)', 'helado', 87, 0.5, 20, 0.3, 'ración (100 ml)', 100, OFF],
  ['helado-hielo-limon-hacendado', 'Helado de hielo con limón (Mercadona)', 'helado', 71, 0, 17, 0, 'ración (100 ml)', 100, OFF],
  ['granizado-limon-sin-azucar-hacendado', 'Granizado de limón sin azúcares añadidos (Mercadona)', 'helado', 35, 0.1, 9, 0.1, 'vaso', 200, OFF],

  // Casi sin kcal
  ['gelatina-0-hacendado', 'Gelatina 0 % azúcar (Mercadona)', 'ligero', 1, 0, 0.2, 0, 'tarrina', 100, OFF],
  ['gelatina-0-lidl', 'Gelatina 0 % (Lidl)', 'ligero', 7, 1.8, 0.5, 0, 'tarrina', 100, OFF],
  ['jellies-light-carrefour', 'Jellies light 0 % limón (Carrefour)', 'ligero', 9, 0, 2.2, 0, 'tarrina', 100, OFF],

  // De toda la vida
  ['natillas', 'Natillas', 'clasico', 120, 3.5, 18, 3.8, 'tarrina', 125, GENERICO],
  ['flan-de-huevo', 'Flan de huevo', 'clasico', 130, 4, 22, 3, 'flan', 100, GENERICO],
  ['tarta-de-queso', 'Tarta de queso', 'clasico', 320, 6, 26, 22, 'porción', 100, GENERICO],
  ['brownie', 'Brownie', 'clasico', 450, 5.5, 53, 24, 'porción', 50, GENERICO],
  ['bizcocho-casero', 'Bizcocho casero', 'clasico', 370, 6, 55, 14, 'porción', 50, GENERICO],
  ['magdalena', 'Magdalena', 'clasico', 430, 6, 52, 22, 'magdalena', 30, GENERICO],
  ['galletas-maria', 'Galletas tipo María', 'clasico', 436, 7, 73, 13, 'galleta', 6, GENERICO],
  ['galletas-con-chocolate', 'Galletas con chocolate', 'clasico', 490, 6.5, 63, 23, 'galleta', 17, GENERICO],
  ['croissant', 'Croissant', 'clasico', 406, 8, 46, 21, 'croissant', 60, GENERICO],
  ['palmera-de-chocolate', 'Palmera de chocolate', 'clasico', 520, 6, 50, 33, 'palmera', 70, GENERICO],
  ['donut-glaseado', 'Donut glaseado', 'clasico', 420, 6, 50, 22, 'donut', 50, GENERICO],
  ['turron-de-jijona', 'Turrón de Jijona', 'clasico', 535, 12, 44, 34, 'porción', 25, GENERICO],
  ['gominolas', 'Gominolas', 'clasico', 340, 6, 78, 0, 'puñado', 25, GENERICO],

  // Salado
  ['patatas-fritas-bolsa', 'Patatas fritas de bolsa', 'salado', 536, 6.5, 53, 34, 'bolsa pequeña', 40, GENERICO],
  ['palomitas-microondas', 'Palomitas de microondas', 'salado', 480, 8, 58, 24, 'bol', 30, GENERICO],
  ['nachos', 'Nachos de maíz', 'salado', 490, 7, 62, 23, 'puñado', 30, GENERICO],
];

export const CAPRICHOS_SUGERIDOS: CaprichoSugerido[] = FILAS.map(([id, nombre, grupo, kcal, p, hc, g, unidad, gramos, fuente]) => ({
  id: `capricho-${id}`, nombre, grupo, estado: 'listo',
  porCien: { kcal, p, hc, g },
  ...(unidad ? { unidad: { nombre: unidad, gramos } } : {}),
  fuente,
}));

/* ── Los caprichos del atleta ─────────────────────────────────────────────── */

/** Lo justo del alimento para que el coach lo meta de un toque como extra. */
export type AlimentoDeCapricho = Pick<AlimentoCatalogo, 'id' | 'nombre' | 'unidad'> & {
  porCien: { kcal: number; p: number; hc: number; g: number };
};

export interface CaprichoDelAtleta {
  id: string;
  /** Como lo llama él: «Magnum de almendras», «dos onzas de chocolate». */
  nombre: string;
  /** Cuándo o cómo le gusta: «el viernes con la peli», «después de cenar». */
  nota?: string;
  /** Si lo eligió de la lista o del catálogo. Sin esto, es texto libre y el
   *  coach tiene que buscarlo él. */
  alimento?: AlimentoDeCapricho;
  /** YYYY-MM-DD */
  creadoEn: string;
}

export const MAX_CAPRICHOS = 20;
export const MAX_LARGO_NOMBRE = 60;
export const MAX_LARGO_NOTA = 120;

export function alimentoDeCapricho(a: AlimentoCatalogo): AlimentoDeCapricho {
  const { kcal, p, hc, g } = a.porCien;
  return { id: a.id, nombre: a.nombre, porCien: { kcal, p, hc, g }, ...(a.unidad ? { unidad: a.unidad } : {}) };
}

/** Un capricho nuevo. `null` si no hay nombre. El id no depende de la hora
 *  sola: dos apuntados en el mismo milisegundo no chocan. */
export function nuevoCapricho(
  datos: { nombre: string; nota?: string; alimento?: AlimentoCatalogo },
  hoy: string,
  azar: () => number = Math.random,
): CaprichoDelAtleta | null {
  const nombre = datos.nombre.trim().replace(/\s+/g, ' ').slice(0, MAX_LARGO_NOMBRE);
  if (!nombre) return null;
  const nota = datos.nota?.trim().replace(/\s+/g, ' ').slice(0, MAX_LARGO_NOTA);
  return {
    id: `c_${Date.now().toString(36)}${Math.floor(azar() * 1e6).toString(36)}`,
    nombre,
    ...(nota ? { nota } : {}),
    ...(datos.alimento ? { alimento: alimentoDeCapricho(datos.alimento) } : {}),
    creadoEn: hoy,
  };
}

/** Añade al principio; si ya estaba (mismo alimento, o mismo nombre en texto
 *  libre) lo sustituye en vez de duplicarlo. Tope `MAX_CAPRICHOS`. */
export function conCapricho(lista: readonly CaprichoDelAtleta[], nuevo: CaprichoDelAtleta): CaprichoDelAtleta[] {
  const mismo = (c: CaprichoDelAtleta) => (nuevo.alimento && c.alimento
    ? c.alimento.id === nuevo.alimento.id
    : !nuevo.alimento && !c.alimento && normalizarTexto(c.nombre) === normalizarTexto(nuevo.nombre));
  return [nuevo, ...lista.filter(c => !mismo(c))].slice(0, MAX_CAPRICHOS);
}

export function sinCapricho(lista: readonly CaprichoDelAtleta[], id: string): CaprichoDelAtleta[] {
  return lista.filter(c => c.id !== id);
}

/** El capricho como alimento del catálogo, para `extraDeAlimento`. */
export function alimentoDelCapricho(c: CaprichoDelAtleta): AlimentoCatalogo | null {
  if (!c.alimento) return null;
  return { ...c.alimento, estado: 'listo' };
}

/** kcal de una ración (la unidad, o 100 g si no tiene). */
export function kcalDeRacion(a: Pick<AlimentoCatalogo, 'porCien' | 'unidad'>): number {
  const gramos = a.unidad?.gramos ?? 100;
  return Math.round((a.porCien.kcal * gramos) / 100);
}

/** «1 bola · 124 kcal», o «207 kcal/100 g» si no tiene medida casera. */
export function textoDeRacion(a: Pick<AlimentoCatalogo, 'porCien' | 'unidad'>): string {
  const fmt = (n: number) => n.toLocaleString('es-ES');
  return a.unidad ? `1 ${a.unidad.nombre} · ${fmt(kcalDeRacion(a))} kcal` : `${fmt(Math.round(a.porCien.kcal))} kcal/100 g`;
}

/* ── Buscar ───────────────────────────────────────────────────────────────── */

/** Sin texto: solo la lista de caprichos. Con texto: primero los caprichos que
 *  coinciden y luego el catálogo, sin repetir nombre. */
export function buscarCaprichos(q: string, catalogo: readonly AlimentoCatalogo[], max = 40): AlimentoCatalogo[] {
  if (q.trim() === '') return CAPRICHOS_SUGERIDOS.slice(0, max);
  const vistos = new Set<string>();
  const todos: AlimentoCatalogo[] = [];
  for (const a of [...CAPRICHOS_SUGERIDOS, ...catalogo]) {
    const clave = normalizarTexto(a.nombre);
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    todos.push(a);
  }
  const exactos = todos.filter(a => coincideBusqueda(a.nombre, q));
  if (exactos.length > 0) return exactos.slice(0, max);

  /* Lo que escribe el atleta a su manera («un Magnum almendrado») casi nunca
     casa entero: entonces vale cualquier palabra con chicha, y primero lo que
     casa con más palabras. */
  const palabras = normalizarTexto(q).split(' ').filter(p => p.length >= 4 && !RELLENO.has(p));
  if (palabras.length === 0) return [];
  return todos
    .map(a => ({ a, n: palabras.filter(p => normalizarTexto(a.nombre).includes(p)).length }))
    .filter(x => x.n > 0)
    .sort((x, y) => y.n - x.n)
    .slice(0, max)
    .map(x => x.a);
}

const RELLENO = new Set(['unas', 'unos', 'algo', 'poco', 'poquito', 'despues', 'antes', 'cena', 'cenar', 'comer', 'para', 'como', 'cada', 'veces', 'dias', 'semana', 'finde', 'noche', 'tarde', 'mucho', 'tipo']);

/** Los sugeridos repartidos por grupo, en el orden de `GRUPOS_DE_CAPRICHO`. */
export function caprichosPorGrupo(): { id: GrupoDeCapricho; titulo: string; caprichos: CaprichoSugerido[] }[] {
  return GRUPOS_DE_CAPRICHO.map(gr => ({ ...gr, caprichos: CAPRICHOS_SUGERIDOS.filter(c => c.grupo === gr.id) }));
}
