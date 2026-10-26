import { normalizarTexto } from './busqueda';
import { leerCsv, type AlimentoCatalogo } from './catalogoAlimentos';
import { DIETARY_RESTRICTIONS } from './dietaryRestrictions';
import type { Palanca, IngredienteVinculado, VinculoDeReceta, MacrosCrudos } from '../types';

/* ═══════════════════════════════════════════════════════════════════════════
   Recetas con ingredientes vinculados al catálogo (N-05)

   Las Rápidas viven en `public/recetas/recetas_05_basicas_p01.json` (formato
   del recetario original). De ese archivo salen el índice que usa el generador
   (`generarIndiceRecetas.mjs`) y el documento de Firestore (`importarBasicas.mjs`
   → `mapRecipe`). Por eso el vínculo se escribe EN ESE ARCHIVO, en un campo
   `vinculo` de cada receta, y sus macros/kcal/peso se recalculan ahí: el
   generador y la ficha siguen leyendo lo de siempre, ya calculado.

   - Un ingrediente vinculado aporta gramos × porCien / 100.
   - `alimentoId: null` = no cuenta (sal, especias, agua): aporta 0.
   - Si un `alimentoId` no está en el catálogo, la receta queda «sin calcular»
     y conserva sus macros: nunca se estima.

   Aquí solo hay lógica pura; los scripts son `scripts/vincularRecetas.ts` y
   `scripts/recetasNuevas.ts`.
   ═══════════════════════════════════════════════════════════════════════════ */

export type { Palanca, IngredienteVinculado, VinculoDeReceta, MacrosCrudos };
export const PALANCAS: readonly Palanca[] = ['hc', 'proteina', 'grasa'];

/** Receta tal como está en `public/recetas/*.json` (solo lo que se usa aquí). */
export interface RecetaCruda {
  id: string;
  name: string;
  ingredients: Array<{ id?: string; name: string; quantity: number }>;
  macros?: MacrosCrudos | null;
  kcal?: number | null;
  weight?: number | null;
  vinculo?: VinculoDeReceta;
  [k: string]: unknown;
}

/* ── Cálculo ─────────────────────────────────────────────────────────────── */

export type ResultadoCalculo =
  | { ok: true; kcal: number; p: number; hc: number; g: number; gramos: number }
  | { ok: false; faltan: string[] };

const r1 = (n: number) => Math.round(n * 10) / 10;

export function calcularIngredientes(ings: IngredienteVinculado[], catalogo: Map<string, AlimentoCatalogo>): ResultadoCalculo {
  const faltan = ings.filter(i => i.alimentoId !== null && !catalogo.has(i.alimentoId)).map(i => i.alimentoId as string);
  if (faltan.length > 0) return { ok: false, faltan: [...new Set(faltan)] };
  let kcal = 0, p = 0, hc = 0, g = 0, gramos = 0;
  for (const i of ings) {
    gramos += i.gramos;
    if (i.alimentoId === null) continue;
    const a = catalogo.get(i.alimentoId)!;
    const f = i.gramos / 100;
    kcal += a.porCien.kcal * f; p += a.porCien.p * f; hc += a.porCien.hc * f; g += a.porCien.g * f;
  }
  return { ok: true, kcal: Math.round(kcal), p: r1(p), hc: r1(hc), g: r1(g), gramos: Math.round(gramos) };
}

/** Porcentajes por energía (4/4/9), enteros que suman 100. */
export function macrosCrudos(p: number, hc: number, g: number): MacrosCrudos {
  const e = { c: hc * 4, p: p * 4, f: g * 9 };
  const total = e.c + e.p + e.f;
  const pc = total > 0 ? Math.round((e.c / total) * 100) : 0;
  const pp = total > 0 ? Math.round((e.p / total) * 100) : 0;
  const pf = total > 0 ? 100 - pc - pp : 0;
  return {
    carbohydrate: { grams: Math.round(hc), percentage: pc },
    protein: { grams: Math.round(p), percentage: pp },
    fat: { grams: Math.round(g), percentage: pf },
  };
}

/**
 * Aplica un vínculo a una receta y recalcula. Devuelve la receta nueva (no muta)
 * y si se ha podido calcular. Sin calcular: guarda el vínculo pero deja macros,
 * kcal y peso como estaban.
 */
export function aplicarVinculo(
  receta: RecetaCruda,
  ingredientes: IngredienteVinculado[],
  catalogo: Map<string, AlimentoCatalogo>,
  ahora: string,
): { receta: RecetaCruda; calculo: ResultadoCalculo } {
  const calculo = calcularIngredientes(ingredientes, catalogo);
  if (calculo.ok) {
    ingredientes = ingredientes.map(i => {
      const sinCopia = { ...i };
      delete sinCopia.porCien;
      if (i.alimentoId === null) return sinCopia;
      const { kcal, p, hc, g } = catalogo.get(i.alimentoId)!.porCien;
      return { ...sinCopia, porCien: { kcal, p, hc, g } };
    });
  }
  // El «antes» se guarda la PRIMERA vez y no se pisa: si no, recalcular dos
  // veces perdería los macros originales.
  const antes = receta.vinculo?.antes ?? { macros: receta.macros ?? null, kcal: receta.kcal ?? null, weight: receta.weight ?? null };
  const vinculo: VinculoDeReceta = { ingredientes, calculadoEn: ahora, antes };
  if (!calculo.ok) return { receta: { ...receta, vinculo }, calculo };
  return {
    receta: {
      ...receta,
      macros: macrosCrudos(calculo.p, calculo.hc, calculo.g),
      kcal: calculo.kcal,
      weight: calculo.gramos,
      vinculo,
    },
    calculo,
  };
}

/** ¿Cambiaría algo? (para no reescribir el archivo ni contar como cambio lo que ya está igual). */
export function mismoResultado(a: RecetaCruda, b: RecetaCruda): boolean {
  const sinFecha = (r: RecetaCruda) => JSON.stringify({ ...r, vinculo: r.vinculo ? { ...r.vinculo, calculadoEn: '' } : undefined });
  return sinFecha(a) === sinFecha(b);
}

/* ── Emparejado y propuesta ──────────────────────────────────────────────── */

const VACIAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'con', 'sin', 'en', 'al', 'a', 'y', 'o', 'para', 'tipo', 'un', 'una']);
const ESTADOS_EN_TEXTO: Record<string, AlimentoCatalogo['estado']> = { crudo: 'crudo', cruda: 'crudo', cocido: 'cocido', cocida: 'cocido', seco: 'seco', seca: 'seco', escurrido: 'escurrido', escurrida: 'escurrido' };

function palabras(s: string): string[] {
  return normalizarTexto(s).replace(/[^a-z0-9 ]+/g, ' ').split(' ')
    .filter(w => w.length >= 2 && !VACIAS.has(w))
    // Singular sencillo: «tomates» casa con «tomate».
    .map(w => (w.length > 4 && w.endsWith('es') && !w.endsWith('ses') ? w.slice(0, -1) : w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w));
}

export type Confianza = 'alta' | 'media' | 'baja' | 'ninguna';

/** Ingredientes que no aportan nada que contar: se proponen como «no cuenta».
 *  La segunda parte son los 46 que Dani dio por buenos el 26-10-2026
 *  (especias, hierbas, café, té, vino de cocinar y cantidades mínimas). */
const NO_CUENTA = new RegExp('^(' + [
  'sal', 'pimienta', 'agua', 'especias?', 'oregano', 'perejil', 'ajo en polvo', 'comino', 'pimenton', 'canela',
  'edulcorante', 'vinagre', 'limon \\(zumo\\)', 'zumo de limon', 'hielo',
  'albahaca', 'cebollino', 'curry en polvo', 'cilantro', 'hojas de cilantro', 'romero', 'laurel', 'menta', 'hierbabuena',
  'tomillo', 'hierbas provenzales', 'eneldo', 'estragon', 'nuez moscada', 'azafran', 'cardamomo', 'semillas de comino',
  'curcuma', 'raiz de curcuma', 'raiz de jengibre', 'chile en polvo', 'chile verde', 'cebolla en polvo', 'tabasco', 'wasabi',
  'extracto de vainilla', 'piel de limon', 'piel de naranja', 'vino', 'cafe solo', 'cafe soluble', 'cafe descafeinado',
  'cafe espresso', 'te', 'te matcha', 'bicarbonato', 'electrolitos', 'trufa negra', 'sacarina',
].join('|') + ')\\b');

export function esIngredienteQueNoCuenta(nombre: string): boolean {
  return NO_CUENTA.test(normalizarTexto(nombre));
}

/**
 * El alimento del catálogo que más se parece al nombre del ingrediente.
 * Puntúa cuántas palabras del alimento aparecen en el ingrediente; el estado
 * escrito («(en crudo)») desempata y, si contradice al del alimento, baja la confianza.
 */
export function emparejar(nombre: string, catalogo: AlimentoCatalogo[]): { alimento?: AlimentoCatalogo; confianza: Confianza } {
  const ps = palabras(nombre);
  const estadoEscrito = ps.map(w => ESTADOS_EN_TEXTO[w]).find(Boolean);
  const del = new Set(ps.filter(w => !(w in ESTADOS_EN_TEXTO)));
  let mejor: { alimento: AlimentoCatalogo; puntos: number; cubre: number; explica: number } | undefined;
  for (const a of catalogo) {
    const pa = palabras(a.nombre);
    if (pa.length === 0) continue;
    const comunes = pa.filter(w => del.has(w)).length;
    if (comunes === 0) continue;
    // `cubre`: cuánto del nombre del alimento está en el ingrediente.
    // `explica`: cuánto del ingrediente queda explicado por el alimento.
    const cubre = comunes / pa.length;
    const explica = comunes / Math.max(1, del.size);
    const estado = estadoEscrito && a.estado ? (estadoEscrito === a.estado ? 0.2 : -0.5) : 0;
    const puntos = cubre + explica + estado;
    if (!mejor || puntos > mejor.puntos) mejor = { alimento: a, puntos, cubre, explica };
  }
  if (!mejor) return { confianza: 'ninguna' };
  const estadoChoca = !!estadoEscrito && !!mejor.alimento.estado && estadoEscrito !== mejor.alimento.estado;
  // «Pechuga de pavo» → «Pechuga de pollo» comparte la mitad en los dos
  // sentidos: es otro alimento, así que baja. «Arroz» → «Arroz blanco» explica
  // todo el ingrediente: probable, pero a mirar (media).
  const confianza: Confianza = estadoChoca ? 'baja'
    : mejor.cubre === 1 && mejor.explica === 1 ? 'alta'
    : (mejor.explica === 1 && mejor.cubre >= 0.5) || (mejor.cubre === 1 && mejor.explica >= 0.5) ? 'media'
    : 'baja';
  return { alimento: mejor.alimento, confianza };
}

const redondear5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);

/**
 * Palanca y rango propuestos para que Dani los revise: palanca = el macro que
 * da al menos el 60 % de las kcal del alimento; rango de la mitad al doble.
 * Lo que no es palanca queda fijo en sus gramos.
 */
export function propuestaDeRango(gramos: number, alimento?: AlimentoCatalogo): Pick<IngredienteVinculado, 'min' | 'max' | 'palanca' | 'fijo'> {
  if (!alimento) return { min: gramos, max: gramos, fijo: true };
  const { p, hc, g } = alimento.porCien;
  const e = { proteina: p * 4, hc: hc * 4, grasa: g * 9 };
  const total = e.proteina + e.hc + e.grasa;
  const dominante = total > 0 ? (Object.entries(e) as [Palanca, number][]).find(([, v]) => v / total >= 0.6)?.[0] : undefined;
  if (!dominante) return { min: gramos, max: gramos, fijo: true };
  return { min: redondear5(gramos * 0.5), max: redondear5(gramos * 2), palanca: dominante };
}

/* ── CSV de vínculos ─────────────────────────────────────────────────────── */

export const COLUMNAS_VINCULOS = [
  'receta_id', 'receta', 'n', 'ingrediente', 'cantidad_receta', 'alimento_id', 'alimento_catalogo',
  'confianza', 'gramos', 'min', 'max', 'palanca', 'fijo', 'nota',
] as const;

/** Valor de `alimento_id` para «no cuenta» (sal, especias…). */
export const NO_CUENTA_ID = '-';

/** Filas del CSV para que Dani revise el emparejado de una receta. */
export function filasDePropuesta(receta: RecetaCruda, catalogo: AlimentoCatalogo[]): string[][] {
  return receta.ingredients.map((ing, n) => {
    const previo = receta.vinculo?.ingredientes.find(i => i.n === n);
    if (previo) {
      const a = previo.alimentoId ? catalogo.find(c => c.id === previo.alimentoId) : undefined;
      return [receta.id, receta.name, String(n), ing.name, String(ing.quantity), previo.alimentoId ?? NO_CUENTA_ID,
        a?.nombre ?? (previo.alimentoId ? '¡NO ESTÁ EN EL CATÁLOGO!' : 'no cuenta'), 'ya vinculado',
        String(previo.gramos), String(previo.min), String(previo.max), previo.palanca ?? '', previo.fijo ? 'sí' : '', ''];
    }
    if (esIngredienteQueNoCuenta(ing.name)) {
      return [receta.id, receta.name, String(n), ing.name, String(ing.quantity), NO_CUENTA_ID, 'no cuenta', 'alta',
        String(ing.quantity), String(ing.quantity), String(ing.quantity), '', 'sí', ''];
    }
    const { alimento, confianza } = emparejar(ing.name, catalogo);
    let gramos = ing.quantity;
    let nota = '';
    // Cantidades pequeñas con un alimento que tiene medida casera: probablemente son unidades.
    if (alimento?.unidad && ing.quantity > 0 && ing.quantity <= 10) {
      gramos = Math.round(ing.quantity * alimento.unidad.gramos);
      nota = `¿${ing.quantity} = unidades? Pasado a ${gramos} g (1 ${alimento.unidad.nombre} = ${alimento.unidad.gramos} g)`;
    }
    const r = propuestaDeRango(gramos, alimento);
    return [receta.id, receta.name, String(n), ing.name, String(ing.quantity), alimento?.id ?? '', alimento?.nombre ?? '',
      confianza, String(gramos), String(r.min), String(r.max), r.palanca ?? '', r.fijo ? 'sí' : '', nota];
  });
}

const numero = (v: string | undefined) => {
  const t = (v ?? '').trim();
  return t === '' ? NaN : Number(t.replace(',', '.'));
};
const esSi = (v: string | undefined) => ['si', 'x', '1', 'true'].includes(normalizarTexto(v ?? ''));

export interface VinculosLeidos {
  /** Por id de receta, los ingredientes vinculados en orden. */
  porReceta: Map<string, IngredienteVinculado[]>;
  /** Mensajes por fila (número de fila del CSV, la cabecera es la 1). */
  errores: Array<{ fila: number; receta: string; mensaje: string }>;
}

/** Lee el CSV revisado. Una receta con cualquier fila errónea no se vincula. */
export function leerVinculos(texto: string, catalogo: Map<string, AlimentoCatalogo>): VinculosLeidos {
  const [cab = [], ...filas] = leerCsv(texto);
  const cabecera = cab.map(c => normalizarTexto(c).replace(/ /g, '_'));
  const col = (celdas: string[], nombre: string) => (celdas[cabecera.indexOf(nombre)] ?? '').trim();
  const porReceta = new Map<string, IngredienteVinculado[]>();
  const conError = new Set<string>();
  const errores: VinculosLeidos['errores'] = [];
  filas.forEach((celdas, i) => {
    const fila = i + 2;
    const recetaId = col(celdas, 'receta_id');
    const receta = col(celdas, 'receta') || recetaId;
    const mal = (mensaje: string) => { errores.push({ fila, receta, mensaje }); conError.add(recetaId); };
    if (!recetaId) return mal('Falta receta_id.');
    const n = numero(col(celdas, 'n'));
    const idTexto = col(celdas, 'alimento_id');
    const gramos = numero(col(celdas, 'gramos'));
    const min = numero(col(celdas, 'min'));
    const max = numero(col(celdas, 'max'));
    const palancaTexto = normalizarTexto(col(celdas, 'palanca'));
    if (!Number.isInteger(n) || n < 0) return mal('«n» no es válido.');
    if (!idTexto) return mal(`Ingrediente ${n}: falta alimento_id (pon «${NO_CUENTA_ID}» si no cuenta).`);
    const alimentoId = idTexto === NO_CUENTA_ID ? null : idTexto;
    if (alimentoId && !catalogo.has(alimentoId)) return mal(`Ingrediente ${n}: «${alimentoId}» no está en el catálogo.`);
    if (!(gramos >= 0)) return mal(`Ingrediente ${n}: gramos no válidos.`);
    if (!(min >= 0) || !(max >= min) || gramos < min || gramos > max) return mal(`Ingrediente ${n}: hace falta min ≤ gramos ≤ max.`);
    if (palancaTexto && !(PALANCAS as readonly string[]).includes(palancaTexto)) return mal(`Ingrediente ${n}: palanca «${palancaTexto}» no válida (hc, proteina, grasa).`);
    const ing: IngredienteVinculado = { n, alimentoId, gramos, min, max };
    if (palancaTexto) ing.palanca = palancaTexto as Palanca;
    if (esSi(col(celdas, 'fijo'))) ing.fijo = true;
    if (ing.palanca && ing.fijo) return mal(`Ingrediente ${n}: no puede ser palanca y fijo a la vez.`);
    const lista = porReceta.get(recetaId) ?? [];
    if (lista.some(x => x.n === n)) return mal(`Ingrediente ${n} repetido.`);
    lista.push(ing);
    porReceta.set(recetaId, lista);
  });
  for (const id of conError) porReceta.delete(id);
  for (const lista of porReceta.values()) lista.sort((a, b) => a.n - b.n);
  return { porReceta, errores };
}

/* ── Recetas nuevas por CSV ──────────────────────────────────────────────── */

export const COLUMNAS_RECETAS_NUEVAS = [
  'receta', 'momentos', 'minutos', 'tupper', 'no_apta_para', 'foto', 'pasos',
  'ingrediente', 'alimento_id', 'gramos', 'min', 'max', 'palanca', 'fijo',
] as const;

const MOMENTOS: Record<string, number> = { desayuno: 1, 'media manana': 2, comida: 3, merienda: 4, cena: 5 };

/** Nombres que se aceptan en `no_apta_para`, además del texto exacto de la leyenda y del código. */
const ALIAS_RESTRICCION: Record<string, number> = {
  vegano: 55, 'sin gluten': 66, celiaco: 66, celiaca: 66, vegetariano: 67, lactosa: 87, 'sin lactosa': 87,
  fructosa: 86, histamina: 89, colesterol: 92, 'sin carne': 112, halal: 60, musulman: 60,
};

function codigoDeRestriccion(texto: string): number | undefined {
  const t = normalizarTexto(texto);
  if (/^\d+$/.test(t) && Number(t) in DIETARY_RESTRICTIONS) return Number(t);
  const exacto = Object.entries(DIETARY_RESTRICTIONS).find(([, nombre]) => normalizarTexto(nombre) === t);
  return exacto ? Number(exacto[0]) : ALIAS_RESTRICCION[t];
}

export interface RecetaNuevaLeida {
  nombre: string;
  intakeTypes: number[];
  minutos?: number;
  tupper: boolean;
  forbiddenFor: number[];
  foto?: string;
  pasos: string[];
  ingredientes: Array<{ nombre: string } & Omit<IngredienteVinculado, 'n'>>;
}

export interface RecetasNuevasLeidas {
  recetas: RecetaNuevaLeida[];
  errores: Array<{ fila: number; receta: string; mensaje: string }>;
  avisos: Array<{ receta: string; mensaje: string }>;
}

/**
 * Una fila por ingrediente. Los datos de la receta (momentos, minutos, tupper,
 * no_apta_para, foto, pasos) se escriben en su primera fila; los pasos separados por « | ».
 */
export function leerRecetasNuevas(texto: string, catalogo: Map<string, AlimentoCatalogo>): RecetasNuevasLeidas {
  const [cab = [], ...filas] = leerCsv(texto);
  const cabecera = cab.map(c => normalizarTexto(c).replace(/ /g, '_'));
  const col = (celdas: string[], nombre: string) => (celdas[cabecera.indexOf(nombre)] ?? '').trim();
  const porNombre = new Map<string, RecetaNuevaLeida>();
  const conError = new Set<string>();
  const errores: RecetasNuevasLeidas['errores'] = [];
  const avisos: RecetasNuevasLeidas['avisos'] = [];
  filas.forEach((celdas, i) => {
    const fila = i + 2;
    const nombre = col(celdas, 'receta');
    const mal = (mensaje: string) => { errores.push({ fila, receta: nombre, mensaje }); conError.add(nombre); };
    if (!nombre) return mal('Falta el nombre de la receta.');
    let r = porNombre.get(nombre);
    if (!r) {
      r = { nombre, intakeTypes: [], tupper: false, forbiddenFor: [], pasos: [], ingredientes: [] };
      porNombre.set(nombre, r);
    }
    const momentos = col(celdas, 'momentos');
    if (momentos) {
      for (const m of momentos.split(',').map(x => normalizarTexto(x)).filter(Boolean)) {
        const codigo = MOMENTOS[m];
        if (codigo === undefined) mal(`Momento «${m}» no válido (${Object.keys(MOMENTOS).join(', ')}).`);
        else if (!r.intakeTypes.includes(codigo)) r.intakeTypes.push(codigo);
      }
    }
    const minutos = col(celdas, 'minutos');
    if (minutos) {
      const m = numero(minutos);
      if (!(m > 0)) mal('Minutos no válidos.'); else r.minutos = m;
    }
    if (col(celdas, 'tupper')) r.tupper = esSi(col(celdas, 'tupper'));
    const noApta = col(celdas, 'no_apta_para');
    if (noApta) {
      for (const t of noApta.split(',').map(x => x.trim()).filter(Boolean)) {
        const c = codigoDeRestriccion(t);
        if (c === undefined) mal(`«${t}» no es una restricción conocida.`);
        else if (!r.forbiddenFor.includes(c)) r.forbiddenFor.push(c);
      }
    }
    const foto = col(celdas, 'foto');
    if (foto) {
      if (!/^https:\/\//.test(foto)) mal('La foto tiene que ser un enlace https.'); else r.foto = foto;
    }
    const pasos = col(celdas, 'pasos');
    if (pasos) r.pasos.push(...pasos.split('|').map(p => p.trim()).filter(Boolean));

    const idTexto = col(celdas, 'alimento_id');
    if (!idTexto) return mal('Falta alimento_id (pon «-» si no cuenta).');
    const alimentoId = idTexto === NO_CUENTA_ID ? null : idTexto;
    const alimento = alimentoId ? catalogo.get(alimentoId) : undefined;
    if (alimentoId && !alimento) return mal(`«${alimentoId}» no está en el catálogo.`);
    const gramos = numero(col(celdas, 'gramos'));
    if (!(gramos > 0)) return mal('Gramos no válidos.');
    const propuesta = propuestaDeRango(gramos, alimento);
    const minT = col(celdas, 'min'); const maxT = col(celdas, 'max'); const palT = normalizarTexto(col(celdas, 'palanca'));
    const min = minT ? numero(minT) : propuesta.min;
    const max = maxT ? numero(maxT) : propuesta.max;
    if (!(min >= 0) || !(max >= min) || gramos < min || gramos > max) return mal('Hace falta min ≤ gramos ≤ max.');
    if (palT && !(PALANCAS as readonly string[]).includes(palT)) return mal(`Palanca «${palT}» no válida.`);
    const fijo = col(celdas, 'fijo') ? esSi(col(celdas, 'fijo')) : (!palT && !minT && !maxT ? propuesta.fijo : undefined);
    const palanca = palT ? (palT as Palanca) : (!col(celdas, 'fijo') && !minT && !maxT ? propuesta.palanca : undefined);
    if (palanca && fijo) return mal('No puede ser palanca y fijo a la vez.');
    r.ingredientes.push({
      nombre: col(celdas, 'ingrediente') || alimento?.nombre || 'Ingrediente',
      alimentoId, gramos, min, max,
      ...(palanca ? { palanca } : {}),
      ...(fijo ? { fijo: true } : {}),
    });
  });
  for (const n of conError) porNombre.delete(n);
  const recetas = [...porNombre.values()];
  for (const r of recetas) {
    if (r.intakeTypes.length === 0) avisos.push({ receta: r.nombre, mensaje: 'Sin momentos: no la usará el generador de menús.' });
    if (r.forbiddenFor.length === 0) avisos.push({ receta: r.nombre, mensaje: 'Sin «no apta para»: saldrá a veganos, celíacos, etc.' });
    if (!r.foto) avisos.push({ receta: r.nombre, mensaje: 'Sin foto: importarBasicas no la publicará hasta que tenga una.' });
    if (r.pasos.length === 0) avisos.push({ receta: r.nombre, mensaje: 'Sin pasos.' });
    if (!r.ingredientes.some(i => i.palanca)) avisos.push({ receta: r.nombre, mensaje: 'Ningún ingrediente palanca: el ajuste (N-06) no podrá moverla.' });
  }
  return { recetas, errores, avisos };
}

/** Receta en el formato del recetario. `idDe` da ids estables (UUID v5 en el script). */
export function recetaCrudaNueva(
  r: RecetaNuevaLeida,
  catalogo: Map<string, AlimentoCatalogo>,
  idDe: (clave: string) => string,
  ahora: string,
): { receta: RecetaCruda; calculo: ResultadoCalculo } {
  const id = idDe(`base:${normalizarTexto(r.nombre)}`);
  const esDulce = r.intakeTypes.length > 0 && r.intakeTypes.every(t => t === 1 || t === 4);
  const base: RecetaCruda = {
    id,
    name: r.nombre,
    ...(r.foto ? { image: r.foto } : {}),
    ingredients: r.ingredientes.map((i, n) => ({ id: idDe(`${id}:${n}`), name: i.nombre, quantity: i.gramos })),
    steps: r.pasos.map((description, k) => ({ position: k + 1, description, items: [] })),
    nutritionalWhy: null,
    difficulty: 1,
    ...(r.minutos ? { cookingTime: r.minutos } : {}),
    tupper: r.tupper,
    concepts: [], conceptGroups: [],
    intakeTypes: [...r.intakeTypes].sort(),
    mealTypes: [],
    forbiddenFor: [...r.forbiddenFor].sort((a, b) => a - b),
    macros: null, kcal: null, weight: null,
    categoria: esDulce ? 'Desayuno y dulces' : 'Platos salados / principales',
    basica: true,
  };
  const ingredientes: IngredienteVinculado[] = r.ingredientes.map(({ nombre: _nombre, ...resto }, n) => ({ n, ...resto }));
  const out = aplicarVinculo(base, ingredientes, catalogo, ahora);
  // En una receta nueva no hay «antes».
  if (out.receta.vinculo) delete out.receta.vinculo.antes;
  return out;
}
