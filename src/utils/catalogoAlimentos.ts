import { normalizarTexto } from './busqueda.js';
import type { OffProducto } from './productoOff.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Catálogo de alimentos por 100 g (N-04)

   Banco aparte de los 310 `foodItems`: aquellos son los intercambios y se
   quedan como están (Dani, 23-10). Este lo carga Dani con un CSV
   (`scripts/importarCatalogoAlimentos.ts`) y lo usan el Diario en el modo
   «Calorías y macros» y, después, las recetas con ingredientes (N-05).

   Se guarda en `catalogoAlimentos` en trozos (`trozo_000`, `trozo_001`…) con
   la lista dentro: se lee entero en pocas lecturas en vez de una por alimento,
   y con el sello de `catalogos/catalogoAlimentos` (db/catalogoVersionado) el
   móvil no lo vuelve a bajar mientras no cambie.

   Aquí solo hay lógica pura: leer y validar el CSV, repartir en trozos y buscar.
   ═══════════════════════════════════════════════════════════════════════════ */

export const ESTADOS_DE_ALIMENTO = ['crudo', 'cocido', 'seco', 'escurrido', 'listo'] as const;
export type EstadoDeAlimento = typeof ESTADOS_DE_ALIMENTO[number];

export interface AlimentoCatalogo {
  id: string;
  nombre: string;
  estado?: EstadoDeAlimento;
  /** Por 100 g (o 100 ml). Los cuatro primeros son obligatorios. */
  porCien: {
    kcal: number; p: number; hc: number; g: number;
    fibra?: number; azucares?: number; saturada?: number; sal?: number;
  };
  /** Medida casera: «1 rebanada = 30 g». */
  unidad?: { nombre: string; gramos: number };
  /** De dónde sale el dato, tal cual lo escribe Dani («etiqueta Hacendado», «USDA 171287»…). */
  fuente?: string;
}

export interface TrozoCatalogo { alimentos: AlimentoCatalogo[]; actualizadoEn?: string }

export const COLECCION_CATALOGO = 'catalogoAlimentos';
/** Un documento de Firestore admite 1 MB; 400 alimentos son ~80 KB. */
export const ALIMENTOS_POR_TROZO = 400;
export const idDeTrozo = (i: number) => `trozo_${String(i).padStart(3, '0')}`;

/* ── CSV ─────────────────────────────────────────────────────────────────── */

/** Columnas de la plantilla, en orden. Solo nombre y los cuatro macros son obligatorias. */
export const COLUMNAS_CSV = [
  'id', 'nombre', 'estado', 'kcal', 'proteina', 'hidratos', 'grasa',
  'fibra', 'azucares', 'grasa_saturada', 'sal', 'unidad_nombre', 'unidad_gramos', 'fuente',
] as const;

/** CSV con `;` (lo que guarda Excel en español), comillas y BOM opcional. */
export function leerCsv(texto: string): string[][] {
  const t = texto.replace(/^\uFEFF/, '');
  const filas: string[][] = [];
  let fila: string[] = [];
  let cur = '';
  let comillas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (comillas) {
      if (c === '"' && t[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') comillas = false; else cur += c;
    } else if (c === '"') comillas = true;
    else if (c === ';') { fila.push(cur); cur = ''; }
    else if (c === '\n') { fila.push(cur.replace(/\r$/, '')); filas.push(fila); fila = []; cur = ''; }
    else cur += c;
  }
  if (cur || fila.length) { fila.push(cur.replace(/\r$/, '')); filas.push(fila); }
  return filas.filter(f => f.some(c => c.trim() !== ''));
}

/** «12,5» o «12.5» → 12.5; vacío → undefined; texto → NaN. */
function numero(v: string | undefined): number | undefined {
  const t = (v ?? '').trim();
  if (t === '') return undefined;
  return Number(t.replace(',', '.'));
}

/** Id estable a partir del nombre y el estado: «Arroz blanco» crudo → `arroz-blanco-crudo`. */
export function idDeAlimento(nombre: string, estado?: string): string {
  return normalizarTexto(`${nombre} ${estado ?? ''}`)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export interface FilaValidada {
  /** Número de fila en el CSV (la cabecera es la 1). */
  fila: number;
  nombre: string;
  alimento?: AlimentoCatalogo;
  /** Impiden cargar la fila. */
  errores: string[];
  /** Se carga, pero conviene mirarla. */
  avisos: string[];
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Valida una fila ya separada en celdas según `cabecera`. */
export function validarFila(cabecera: string[], celdas: string[], fila: number): FilaValidada {
  const col = (nombre: string) => {
    const i = cabecera.indexOf(nombre);
    return i >= 0 ? (celdas[i] ?? '').trim() : '';
  };
  const errores: string[] = [];
  const avisos: string[] = [];
  const nombre = col('nombre');
  if (!nombre) errores.push('Falta el nombre.');

  const estadoTexto = normalizarTexto(col('estado'));
  let estado: EstadoDeAlimento | undefined;
  if (estadoTexto) {
    if ((ESTADOS_DE_ALIMENTO as readonly string[]).includes(estadoTexto)) estado = estadoTexto as EstadoDeAlimento;
    else errores.push(`Estado «${col('estado')}» no válido (${ESTADOS_DE_ALIMENTO.join(', ')}).`);
  }

  const obligatorios = { kcal: numero(col('kcal')), p: numero(col('proteina')), hc: numero(col('hidratos')), g: numero(col('grasa')) };
  const nombresObligatorios = { kcal: 'kcal', p: 'proteína', hc: 'hidratos', g: 'grasa' } as const;
  for (const k of ['kcal', 'p', 'hc', 'g'] as const) {
    const v = obligatorios[k];
    if (v === undefined) errores.push(`Falta ${nombresObligatorios[k]}.`);
    else if (!Number.isFinite(v) || v < 0) errores.push(`${nombresObligatorios[k]} no es un número válido.`);
  }

  const opcionales = { fibra: numero(col('fibra')), azucares: numero(col('azucares')), saturada: numero(col('grasa_saturada')), sal: numero(col('sal')) };
  for (const [k, v] of Object.entries(opcionales)) {
    if (v !== undefined && (!Number.isFinite(v) || v < 0)) errores.push(`${k} no es un número válido.`);
  }

  const unidadNombre = col('unidad_nombre');
  const unidadGramos = numero(col('unidad_gramos'));
  if ((unidadNombre && unidadGramos === undefined) || (!unidadNombre && unidadGramos !== undefined)) {
    errores.push('La medida casera necesita nombre y gramos a la vez.');
  } else if (unidadGramos !== undefined && (!Number.isFinite(unidadGramos) || unidadGramos <= 0)) {
    errores.push('Los gramos de la medida casera no son válidos.');
  }

  if (errores.length > 0) return { fila, nombre, errores, avisos };

  const { kcal, p, hc, g } = obligatorios as { kcal: number; p: number; hc: number; g: number };
  if (p + hc + g > 100.5) errores.push(`Proteína + hidratos + grasa suman ${r1(p + hc + g)} g en 100 g.`);
  if (opcionales.azucares !== undefined && opcionales.azucares > hc + 0.5) avisos.push('Tiene más azúcares que hidratos.');
  if (opcionales.saturada !== undefined && opcionales.saturada > g + 0.5) avisos.push('Tiene más grasa saturada que grasa.');
  // Mismo criterio que con los productos de supermercado: las kcal tienen que
  // cuadrar con 4/4/9. Se avisa, no se rechaza: alcohol, polioles y fibra lo descuadran.
  const calculadas = p * 4 + hc * 4 + g * 9;
  if (Math.abs(calculadas - kcal) > Math.max(20, kcal * 0.15)) {
    avisos.push(`Las kcal (${kcal}) no cuadran con los macros (${Math.round(calculadas)}).`);
  }
  if (errores.length > 0) return { fila, nombre, errores, avisos };

  const porCien: AlimentoCatalogo['porCien'] = { kcal, p, hc, g };
  if (opcionales.fibra !== undefined) porCien.fibra = opcionales.fibra;
  if (opcionales.azucares !== undefined) porCien.azucares = opcionales.azucares;
  if (opcionales.saturada !== undefined) porCien.saturada = opcionales.saturada;
  if (opcionales.sal !== undefined) porCien.sal = opcionales.sal;

  const alimento: AlimentoCatalogo = { id: col('id') || idDeAlimento(nombre, estado), nombre, porCien };
  if (estado) alimento.estado = estado;
  if (unidadNombre && unidadGramos !== undefined) alimento.unidad = { nombre: unidadNombre, gramos: unidadGramos };
  const fuente = col('fuente');
  if (fuente) alimento.fuente = fuente;
  return { fila, nombre, alimento, errores, avisos };
}

export interface ResultadoCsv {
  filas: FilaValidada[];
  /** Solo las filas sin errores, y sin ids repetidos. */
  alimentos: AlimentoCatalogo[];
  /** Errores de todo el archivo (cabecera). */
  erroresGenerales: string[];
}

export function validarCsv(texto: string): ResultadoCsv {
  const [cabeceraCruda, ...resto] = leerCsv(texto);
  const cabecera = (cabeceraCruda ?? []).map(c => normalizarTexto(c).replace(/ /g, '_'));
  const faltan = ['nombre', 'kcal', 'proteina', 'hidratos', 'grasa'].filter(c => !cabecera.includes(c));
  if (faltan.length > 0) {
    return { filas: [], alimentos: [], erroresGenerales: [`Faltan columnas: ${faltan.join(', ')}.`] };
  }
  const filas = resto.map((celdas, i) => validarFila(cabecera, celdas, i + 2));
  const primeraVez = new Map<string, number>();
  for (const f of filas) {
    if (!f.alimento) continue;
    const antes = primeraVez.get(f.alimento.id);
    if (antes !== undefined) {
      f.errores.push(`Repetido: mismo alimento que la fila ${antes}.`);
      delete f.alimento;
    } else primeraVez.set(f.alimento.id, f.fila);
  }
  return { filas, alimentos: filas.flatMap(f => (f.alimento ? [f.alimento] : [])), erroresGenerales: [] };
}

/* ── Guardado ────────────────────────────────────────────────────────────── */

export interface DiferenciaCatalogo {
  nuevos: AlimentoCatalogo[];
  cambiados: Array<{ antes: AlimentoCatalogo; despues: AlimentoCatalogo }>;
  iguales: number;
  /** Están en Firestore y no en el CSV. NO se borran: se conservan y se listan. */
  ausentes: AlimentoCatalogo[];
}

/** Comparación canónica: mismas claves en el mismo orden. */
function firma(a: AlimentoCatalogo): string {
  const ordenar = (o: unknown): unknown =>
    o && typeof o === 'object' && !Array.isArray(o)
      ? Object.fromEntries(Object.keys(o as object).sort().map(k => [k, ordenar((o as Record<string, unknown>)[k])]))
      : o;
  return JSON.stringify(ordenar(a));
}

export function compararCatalogo(actual: AlimentoCatalogo[], csv: AlimentoCatalogo[]): DiferenciaCatalogo {
  const porId = new Map(actual.map(a => [a.id, a]));
  const enCsv = new Set(csv.map(a => a.id));
  const out: DiferenciaCatalogo = { nuevos: [], cambiados: [], iguales: 0, ausentes: [] };
  for (const a of csv) {
    const antes = porId.get(a.id);
    if (!antes) out.nuevos.push(a);
    else if (firma(antes) !== firma(a)) out.cambiados.push({ antes, despues: a });
    else out.iguales++;
  }
  out.ausentes = actual.filter(a => !enCsv.has(a.id));
  return out;
}

/** Catálogo final: lo de Firestore con lo del CSV encima (los ausentes se quedan). Orden por nombre. */
export function fusionarCatalogo(actual: AlimentoCatalogo[], csv: AlimentoCatalogo[]): AlimentoCatalogo[] {
  const porId = new Map(actual.map(a => [a.id, a]));
  for (const a of csv) porId.set(a.id, a);
  return [...porId.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es') || a.id.localeCompare(b.id));
}

export function repartirEnTrozos(alimentos: AlimentoCatalogo[], tam = ALIMENTOS_POR_TROZO): AlimentoCatalogo[][] {
  const trozos: AlimentoCatalogo[][] = [];
  for (let i = 0; i < alimentos.length; i += tam) trozos.push(alimentos.slice(i, i + tam));
  return trozos;
}

/* ── Búsqueda y uso en el Diario ─────────────────────────────────────────── */

export const MIN_LETRAS_BUSQUEDA_CATALOGO = 2;

/** Palabra a palabra, sin tildes; delante los que empiezan por lo buscado. */
export function buscarEnCatalogo(alimentos: AlimentoCatalogo[], termino: string, limite = 12): AlimentoCatalogo[] {
  const t = normalizarTexto(termino);
  if (t.length < MIN_LETRAS_BUSQUEDA_CATALOGO) return [];
  const palabras = t.split(' ');
  const empiezan: AlimentoCatalogo[] = [];
  const contienen: AlimentoCatalogo[] = [];
  for (const a of alimentos) {
    const texto = normalizarTexto(`${a.nombre} ${a.estado ?? ''}`);
    if (!palabras.every(p => texto.includes(p))) continue;
    (texto.startsWith(palabras[0]) ? empiezan : contienen).push(a);
  }
  return [...empiezan, ...contienen].slice(0, limite);
}

/** Nombre para enseñar: «Arroz blanco (cocido)». */
export function nombreDeAlimento(a: AlimentoCatalogo): string {
  return a.estado && a.estado !== 'listo' ? `${a.nombre} (${a.estado})` : a.nombre;
}

/** Mismo formato que un producto de supermercado, para reusar su ficha de gramos. */
export function comoProducto(a: AlimentoCatalogo): OffProducto {
  const { kcal, p, hc, g, fibra, azucares, saturada, sal } = a.porCien;
  return {
    c: a.id, n: nombreDeAlimento(a), b: '',
    ...(a.unidad ? { s: a.unidad.gramos, q: `1 ${a.unidad.nombre} = ${a.unidad.gramos} g` } : {}),
    k: kcal, p, h: hc, g,
    ...(fibra !== undefined ? { f: fibra } : {}),
    ...(azucares !== undefined ? { az: azucares } : {}),
    ...(saturada !== undefined ? { sat: saturada } : {}),
    ...(sal !== undefined ? { sal } : {}),
  };
}
