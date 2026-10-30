import type { Recipe } from '../types';
import { coincideBusqueda, normalizarTexto } from './busqueda';
import { ingredientMatch } from './foodPrefs';
import type { LimpiezaRecetario } from '../db/recipes';

/* ═══════════════════════════════════════════════════════════════════════════
   Filtros del limpiador del recetario (29-10). Puro: la pantalla
   (components/recetario/LimpiarRecetario) solo pinta lo que sale de aquí.

   Los «atajos» son lo que suele sobrar en un recetario importado. Entre ellos
   se SUMAN (batidos + barritas = las dos cosas); el resto de filtros se
   cruzan (batidos Y de desayuno Y sin revisar).
   ═══════════════════════════════════════════════════════════════════════════ */

export type Atajo = 'producto' | 'suplementos' | 'geles' | 'barritas' | 'batidos' | 'duplicados';
export type EstadoFiltro = 'sin_revisar' | 'mantenidas' | 'retiradas' | 'todas';
export type TramoIngredientes = '' | '1' | '2-4' | '5+';

export const ATAJOS: { id: Atajo; label: string }[] = [
  { id: 'producto', label: 'Productos de marca' },
  { id: 'suplementos', label: 'Suplementos' },
  { id: 'geles', label: 'Geles' },
  { id: 'barritas', label: 'Barritas' },
  { id: 'batidos', label: 'Batidos' },
  { id: 'duplicados', label: 'Duplicados (mismo nombre)' },
];

export interface FiltroLimpieza {
  texto: string;
  ingrediente: string;
  atajos: Atajo[];
  /** Tipos de ingesta (1 desayuno … 5 cena); 0 = sin momento. */
  momentos: number[];
  categorias: string[];
  ingredientes: TramoIngredientes;
  estado: EstadoFiltro;
}

export const FILTRO_LIMPIEZA_VACIO: FiltroLimpieza = {
  texto: '', ingrediente: '', atajos: [], momentos: [], categorias: [], ingredientes: '', estado: 'sin_revisar',
};

/** Nombre para comparar duplicados: sin tildes, mayúsculas ni espacios de más. */
export const claveDeNombre = (nombre: string) => normalizarTexto(nombre);

/** Cuántas recetas comparten cada nombre. */
export function repeticionesPorNombre(recetas: Recipe[]): Map<string, number> {
  const n = new Map<string, number>();
  for (const r of recetas) {
    const k = claveDeNombre(r.name);
    n.set(k, (n.get(k) ?? 0) + 1);
  }
  return n;
}

export function cumpleAtajo(r: Recipe, a: Atajo, repeticiones: Map<string, number>): boolean {
  const nombre = normalizarTexto(r.name);
  switch (a) {
    case 'producto': return r.categoria === 'Alimentos y suplementos';
    case 'suplementos': return r.categoria === 'Suplementos deportivos';
    case 'geles': return /(^|\s)gel(\s|$|es\b)/.test(nombre);
    case 'barritas': return nombre.includes('barrita');
    // Que EMPIECE por «batido»: «queso batido» es un ingrediente, no un batido.
    case 'batidos': return /^(batido|smoothie)\b/.test(nombre) || /\bsmoothie\b/.test(nombre);
    case 'duplicados': return (repeticiones.get(claveDeNombre(r.name)) ?? 0) > 1;
  }
}

export function estadoDe(id: string, limpieza: LimpiezaRecetario): 'retirada' | 'mantenida' | 'sin_revisar' {
  if (limpieza.retiradas?.[id]) return 'retirada';
  if (limpieza.mantenidas?.[id]) return 'mantenida';
  return 'sin_revisar';
}

function pasaTramo(n: number, t: TramoIngredientes): boolean {
  if (t === '1') return n <= 1;
  if (t === '2-4') return n >= 2 && n <= 4;
  if (t === '5+') return n >= 5;
  return true;
}

export function filtrarParaLimpiar(
  recetas: Recipe[],
  f: FiltroLimpieza,
  limpieza: LimpiezaRecetario,
  repeticiones: Map<string, number> = repeticionesPorNombre(recetas),
): Recipe[] {
  const texto = f.texto.trim();
  const ingrediente = f.ingrediente.trim();
  return recetas.filter(r => {
    const estado = estadoDe(r.id, limpieza);
    if (f.estado === 'sin_revisar' && estado !== 'sin_revisar') return false;
    if (f.estado === 'mantenidas' && estado !== 'mantenida') return false;
    if (f.estado === 'retiradas' && estado !== 'retirada') return false;
    if (texto && !coincideBusqueda(r.name, texto)) return false;
    if (ingrediente && !ingredientMatch(r, ingrediente)) return false;
    if (f.atajos.length && !f.atajos.some(a => cumpleAtajo(r, a, repeticiones))) return false;
    if (f.momentos.length) {
      const it = r.intakeTypes ?? [];
      if (!f.momentos.some(m => (m === 0 ? it.length === 0 : it.includes(m)))) return false;
    }
    if (f.categorias.length && !f.categorias.includes(r.categoria ?? '')) return false;
    if (!pasaTramo((r.ingredientsText ?? []).length, f.ingredientes)) return false;
    return true;
  });
}

/** Grupos de recetas con el mismo nombre (sin las retiradas), los más grandes primero. */
export function gruposDuplicados(recetas: Recipe[], limpieza: LimpiezaRecetario): Recipe[][] {
  const porNombre = new Map<string, Recipe[]>();
  for (const r of recetas) {
    if (limpieza.retiradas?.[r.id]) continue;
    const k = claveDeNombre(r.name);
    porNombre.set(k, [...(porNombre.get(k) ?? []), r]);
  }
  return [...porNombre.values()].filter(g => g.length > 1).sort((a, b) => b.length - a.length || a[0].name.localeCompare(b[0].name, 'es'));
}

// ── Comparar duplicados (29-10) ─────────────────────────────────────────────
// Con el mismo nombre casi nunca son la misma receta: de 300 grupos, 4 eran
// idénticos, 199 la misma receta en otra cantidad (sirven para encajar en
// menús de distintas kcal), 58 con los pasos cambiados y 39 con algún
// ingrediente distinto. Esto es lo que lo dice grupo a grupo.

export type TipoDuplicado = 'identicas' | 'otra_cantidad' | 'otros_pasos' | 'distintas';

export const TIPOS_DUPLICADO: { id: TipoDuplicado; label: string; nota: string }[] = [
  { id: 'identicas', label: 'Idénticas', nota: 'mismos ingredientes, gramos y pasos: sobran' },
  { id: 'otra_cantidad', label: 'Misma receta, otra cantidad', nota: 'mismos pasos, cambian los gramos: ojo, dan raciones distintas' },
  { id: 'otros_pasos', label: 'Mismos ingredientes, otros pasos', nota: 'se cocinan distinto' },
  { id: 'distintas', label: 'Cambia algún ingrediente', nota: 'en realidad son recetas distintas' },
];

const nombreIng = (s: string) => normalizarTexto(s);
const textoPasos = (r: Recipe) => (r.stepsText ?? [])
  .map(p => normalizarTexto(p.description) + (p.items?.length ? `[${p.items.map(i => normalizarTexto(i.description)).join(',')}]` : ''))
  .join(' / ');

export interface FilaComparada { ingrediente: string; gramos: (number | null)[]; distinta: boolean }
export interface ComparacionDuplicado {
  tipo: TipoDuplicado;
  filas: FilaComparada[];
  mismosPasos: boolean;
}

/** Compara recetas COMPLETAS (con cantidades y pasos) que comparten nombre. */
export function compararDuplicados(recetas: Recipe[]): ComparacionDuplicado {
  const orden: string[] = [];
  const etiqueta = new Map<string, string>();
  const gramos = recetas.map(r => {
    const m = new Map<string, number>();
    for (const i of r.ingredientsText ?? []) {
      const k = nombreIng(i.name);
      if (!etiqueta.has(k)) { etiqueta.set(k, i.name); orden.push(k); }
      m.set(k, (m.get(k) ?? 0) + Math.round(Number(i.quantity) || 0));
    }
    return m;
  });
  const filas = orden.map(k => {
    const g = gramos.map(m => (m.has(k) ? m.get(k)! : null));
    return { ingrediente: etiqueta.get(k)!, gramos: g, distinta: new Set(g.map(String)).size > 1 };
  });
  const mismaLista = filas.every(f => f.gramos.every(x => x != null));
  const mismasCantidades = filas.every(f => !f.distinta);
  const mismosPasos = new Set(recetas.map(textoPasos)).size === 1;
  const tipo: TipoDuplicado = !mismaLista ? 'distintas'
    : !mismosPasos ? 'otros_pasos'
    : mismasCantidades ? 'identicas' : 'otra_cantidad';
  return { tipo, filas, mismosPasos };
}
