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
  // Revisión de motores 26-10-2026: la levadura química (2-3 g) y la infusión
  // no suman; la nutricional y la de cerveza sí son alimento.
  'levadura(?! nutricional| de cerveza)', 'infusion', 'semillas de cilantro', 'planta de clavo', 'clavo de olor',
].join('|') + ')\\b');

export function esIngredienteQueNoCuenta(nombre: string): boolean {
  return NO_CUENTA.test(normalizarTexto(nombre));
}

/** Estado de un alimento del catálogo: el campo o, si no lo trae, la palabra
 *  de estado de su nombre («Pistachos crudos», «Jamón cocido»). */
function estadoDelAlimento(a: AlimentoCatalogo): AlimentoCatalogo['estado'] {
  return a.estado ?? palabras(a.nombre).map(w => ESTADOS_EN_TEXTO[w]).find(Boolean);
}

/**
 * Cereales y legumbres: sin estado escrito, un «Arroz basmati 60 g» o unas
 * «Lentejas 70 g» son el alimento SECO. Emparejarlos con la entrada «cocido»
 * del catálogo (la única que a veces existe) divide sus kcal por 2,5. Medido
 * el 26-10-2026 en 134 recetas de arroz (−118 kcal de mediana). Con estas
 * palabras y un candidato cocido, el emparejado se queda en `baja`.
 */
const SECOS_POR_DEFECTO = /\b(arroz|pasta|quinoa|cuscus|couscous|bulgur|mijo|espelta|trigo|avena|lenteja|garbanzo|alubia|judia(?! verde)|judion|frijol|fideo|macarron|espagueti|noodle|tallarin|soja texturizada)\b/;

/**
 * El alimento del catálogo que más se parece al nombre del ingrediente.
 * Puntúa cuántas palabras del alimento aparecen en el ingrediente; el estado
 * escrito («(en crudo)») desempata y, si contradice al del alimento, baja la confianza.
 *
 * Qué significa cada confianza (revisión de motores, 26-10-2026):
 *  · `alta`: las mismas palabras en los dos sentidos («Pechugas de pollo» →
 *    «Pechuga de pollo»).
 *  · `media`: el ingrediente lleva descriptores de más y el alimento entero
 *    está dentro («Almendras al natural» → «Almendras», «Garbanzo cocido
 *    envasado» → «Garbanzos (cocido)»). Casi siempre acierta.
 *  · `baja`: el ALIMENTO lleva palabras que el ingrediente no tiene. Antes era
 *    `media` y por ahí entraron «Calabaza» → «Pipas de calabaza» (144 recetas,
 *    +533 kcal de mediana), «Tomate seco» → «Lechuga y tomate» (47) y «Avena» →
 *    «Bebida de avena». También cuando el estado choca, cuando dos candidatos
 *    empatan con estados de peso distinto («Lentejas» seco/cocido) y cuando un
 *    cereal o legumbre sin estado solo casa con su versión cocida.
 * Los sinónimos buenos que caen en `baja` por esta regla van en
 * `SINONIMOS_REVISADOS`, que manda sobre la puntuación.
 */
export interface CandidatoDeAlimento {
  alimento: AlimentoCatalogo;
  puntos: number;
  /** Cuánto del nombre del alimento está en el ingrediente (1 = entero). */
  cubre: number;
  /** Cuánto del ingrediente queda explicado por el alimento (1 = entero). */
  explica: number;
  estado?: AlimentoCatalogo['estado'];
}

/** Palabras significativas de un nombre (sin vacías ni estado, en singular). */
export function palabrasDe(nombre: string): string[] {
  return palabras(nombre).filter(w => !(w in ESTADOS_EN_TEXTO));
}

/** Los alimentos del catálogo que comparten alguna palabra con el ingrediente,
 *  de mejor a peor. Es lo que `emparejar` puntúa; se expone para que el
 *  revinculado pueda desempatar por las kcal de la receta. */
export function candidatosDe(nombre: string, catalogo: AlimentoCatalogo[]): CandidatoDeAlimento[] {
  const ps = palabras(nombre);
  const estadoEscrito = ps.map(w => ESTADOS_EN_TEXTO[w]).find(Boolean);
  const del = new Set(ps.filter(w => !(w in ESTADOS_EN_TEXTO)));
  const candidatos: CandidatoDeAlimento[] = [];
  for (const a of catalogo) {
    const estadoCat = estadoDelAlimento(a);
    const pa = palabras(a.nombre).filter(w => !(w in ESTADOS_EN_TEXTO));
    if (pa.length === 0) continue;
    const comunes = pa.filter(w => del.has(w)).length;
    if (comunes === 0) continue;
    const cubre = comunes / pa.length;
    const explica = comunes / Math.max(1, del.size);
    const estado = estadoEscrito && estadoCat ? (estadoEscrito === estadoCat ? 0.2 : -0.5) : 0;
    candidatos.push({ alimento: a, puntos: cubre + explica + estado, cubre, explica, estado: estadoCat });
  }
  const cocido = (c: CandidatoDeAlimento) => (c.estado === 'cocido' ? 1 : 0);
  candidatos.sort((a, b) => b.puntos - a.puntos || (estadoEscrito ? 0 : cocido(a) - cocido(b)));
  return candidatos;
}

export function emparejar(nombre: string, catalogo: AlimentoCatalogo[]): { alimento?: AlimentoCatalogo; confianza: Confianza } {
  const ps = palabras(nombre);
  const estadoEscrito = ps.map(w => ESTADOS_EN_TEXTO[w]).find(Boolean);
  type Candidato = CandidatoDeAlimento;
  const candidatos = candidatosDe(nombre, catalogo);
  if (candidatos.length === 0) return { confianza: 'ninguna' };
  const mejor = candidatos[0];
  const estadoChoca = !!estadoEscrito && !!mejor.estado && estadoEscrito !== mejor.estado;
  // Sin estado escrito, una entrada «seco» y otra «cocido» con las mismas
  // palabras («Lentejas», «Garbanzos») no se pueden distinguir: a revisar.
  const empatados = candidatos.filter(c => c.puntos === mejor.puntos);
  const ambiguo = !estadoEscrito && empatados.some(c => c.estado === 'seco') && empatados.some(c => c.estado === 'cocido');
  const secoComoCocido = !estadoEscrito && mejor.estado === 'cocido' && SECOS_POR_DEFECTO.test(normalizarTexto(nombre));
  const confianza: Confianza = estadoChoca || ambiguo || secoComoCocido ? 'baja'
    : mejor.cubre === 1 && mejor.explica === 1 ? 'alta'
    : mejor.cubre === 1 && mejor.explica >= 0.5 ? 'media'
    : 'baja';
  return { alimento: mejor.alimento, confianza };
}

/**
 * Sinónimos revisados a mano (26-10-2026) sobre los 209 ingredientes que
 * salían con confianza `media` en el recetario: ingrediente normalizado →
 * id del alimento. Mandan sobre la puntuación de `emparejar` y son lo único,
 * además de `alta`, que acepta la vinculación automática. Lo que no está aquí
 * ni es `alta` queda como duda para que Dani lo decida (añadir el alimento al
 * catálogo o este sinónimo).
 */
export const SINONIMOS_REVISADOS: Readonly<Record<string, string>> = {
  'aceituna negra': 'aceitunas-escurrido', 'aceituna verde': 'aceitunas-escurrido',
  'ajo negro': 'ajo', 'almendra molida': 'almendras-listo', 'almendras al natural': 'almendras-listo',
  'alubia blanca cocida': 'alubias-cocido', 'anchoa': 'anchoa-en-lata', 'arroz cocido': 'arroz-en-vasito-cocido',
  'arroz salvaje': 'arroz-seco', 'atun': 'atun-al-natural-escurrido', 'atun en lata (aceite)': 'atun-en-aceite-escurrido',
  'atun en lata (al natural)': 'atun-al-natural-escurrido', 'azucar glas': 'azucar-listo', 'azucar moreno': 'azucar-listo',
  'bacalao atlantico': 'bacalao-crudo', 'bacalao pacifico': 'bacalao-crudo', 'bebida de almendra': 'bebida-de-almendras-sin-azucar-listo',
  'bebida de soja': 'bebida-de-soja-sin-azucar-listo', 'bebida de soja con chocolate': 'bebida-de-soja-sabor-chocolate-listo',
  'boniato rojo': 'boniato-crudo', 'brocoli congelado': 'brocoli', 'cacao puro en polvo': 'cacao-en-polvo',
  'carne picada mixta (ternera-cerdo)': 'carne-picada-de-cerdo', 'castanas': 'castanas-peladas-listo',
  'cereales integrales': 'cereales-integrales-0-azucares', 'cereales weetabix minis': 'cereales-weetabix',
  'chocolate negro 70%': 'chocolate-negro-70-85', 'chuleta de lomo de cerdo': 'lomo-de-cerdo-crudo',
  'ciclodextrina en polvo': 'ciclodextrina-listo', 'compota de manzana': 'manzana-listo',
  'contramuslo de pollo con piel': 'contramuslo-de-pollo-crudo', 'contramuslo de pollo sin piel': 'contramuslo-de-pollo-crudo',
  'copos de trigo sarraceno': 'trigo-sarraceno', 'crema de arroz': 'arroz-seco', 'crema de cacahuete (226ers)': 'crema-de-cacahuete-listo',
  'esparrago en conserva': 'esparragos-cocido', 'esparrago triguero': 'esparragos-cocido', 'espinacas congeladas': 'espinacas',
  'fiambre de pavo': 'fiambre-de-pechuga-de-pavo-listo', 'fideos de arroz': 'arroz-seco', 'filete de ternera magra': 'ternera-magra-crudo',
  'frankfurt de seitan': 'seitan-listo', 'fructosa': 'fructosa-en-polvo', 'gambas': 'gambas-peladas-crudo',
  'gambas peladas congeladas': 'gambas-peladas-crudo', 'garbanzo cocido envasado': 'garbanzos-cocido', 'garbanzos cocidos de bote': 'garbanzos-cocido',
  'gazpacho envasado': 'gazpacho-listo', 'gnocchis de patata': 'gnocchi-listo', 'gnocchis de queso': 'gnocchi-listo',
  'guisante crudo': 'guisante-cocido', 'guisante verde': 'guisantes-listo', 'guisantes congelados': 'guisantes-congelados-cocidos',
  'guisantes en lata': 'guisantes-listo', 'haba': 'haba-cocida', 'hamburguesa de pollo (super)': 'hamburguesa-de-pollo-crudo',
  'hamburguesa de pollo y espinacas': 'hamburguesa-de-pollo-crudo', 'harina de arroz hidrolizada (hsn)': 'harina-de-arroz-listo',
  'harina de avena sabores': 'harina-de-avena-listo', 'harina de espelta': 'espelta', 'harina de maiz amarillo': 'harina-de-maiz-listo',
  'harina de trigo integral': 'harina-de-trigo-listo', 'harina de trigo sarraceno': 'harina-de-trigo-listo', 'heura': 'heura-albondigas-listo',
  'higado de pollo': 'higado-crudo', 'higado de ternera': 'higado-crudo', 'huevo de codorniz': 'huevo-crudo',
  'kefir': 'kefir-sin-grasa-listo', 'kiwi amarillo': 'kiwi-listo', 'langostino': 'langostinos-cocidos-listo',
  'leche semidesnatada sin lactosa': 'leche-semidesnatada-listo', 'lentejas cocidas de bote': 'lentejas-cocido',
  'lomo alto de cerdo': 'lomo-de-cerdo-crudo', 'lomo de cerdo (magro)': 'lomo-de-cerdo-crudo', 'lomo de cerdo fresco': 'lomo-de-cerdo-crudo',
  'lomo de ternera lechal': 'lomo-de-ternera', 'lomo embuchado extra': 'lomo-embuchado-listo', 'maiz dulce': 'maiz-dulce-en-lata-escurrido',
  'mantequilla sin sal': 'mantequilla-listo', 'melon cantaloupe': 'melon-listo', 'membrillo': 'dulce-de-membrillo',
  'merluza congelada': 'merluza-crudo', 'mermelada de albaricoque': 'mermelada-listo', 'mermelada de frambuesa': 'mermelada-listo',
  'mermelada de fresa': 'mermelada-listo', 'mermelada de mora': 'mermelada-listo', 'mermelada de naranja': 'mermelada-listo',
  'mermelada light': 'mermelada-light-de-fresa', 'migas de bacalao': 'bacalao-crudo', 'mijo inflado': 'mijo',
  'mozzarella fresca': 'mozzarella-listo', 'mozzarella fresca light': 'mozzarella-light-listo', 'nata': 'nata-para-cocinar-listo',
  'nata ligera para cocinar': 'nata-para-cocinar-listo', 'noodle de arroz': 'arroz-seco', 'nueces de macadamia': 'nueces-listo',
  'nueces pecanas': 'nueces-listo', 'palomitas': 'maiz-para-palomitas-seco', 'pan bagel': 'pan-listo', 'pan blanco': 'pan-listo',
  'pan de avena': 'pan-listo', 'pan de barra': 'pan-listo', 'pan de centeno': 'pan-listo', 'pan de hamburguesa': 'pan-listo',
  'pan de leche': 'pan-listo', 'pan de molde integral': 'pan-de-molde-listo', 'pan de molde sin gluten': 'pan-de-molde-listo',
  'pan de perrito': 'pan-listo', 'pan de pita': 'pan-listo', 'pan integral': 'pan-integral-sin-gluten', 'pan multicereal': 'pan-listo',
  'pan sin gluten': 'pan-integral-sin-gluten', 'pan thins': 'pan-listo', 'pan tostado blanco': 'pan-tostado-listo',
  'pan tostado integral': 'pan-tostado-listo', 'pan tostado sin gluten': 'pan-tostado-listo', 'pan wasa': 'pan-listo',
  'pasas deshidratadas': 'pasas-listo', 'pasta de arroz': 'arroz-seco', 'pasta de espelta en seco': 'pasta-seco',
  'pasta de sarraceno en seco': 'pasta-seco', 'pasta en seco de maiz': 'pasta-seco', 'pasta integral en seco': 'pasta-seco',
  'pasta sin gluten en seco': 'pasta-seco', 'patata en bote': 'patata-cocido', 'pechuga de pavo en lonchas': 'pechuga-de-pavo-crudo',
  'pechuga de pollo con piel': 'pechuga-de-pollo-crudo', 'pechuga de pollo en lata al natural': 'pechuga-de-pollo-crudo',
  'placas de pasta': 'pasta-seco', 'platano macho': 'platano-listo', 'proteina whey (crown)': 'proteina-whey',
  'queso cheddar en lonchas': 'queso-cheddar-listo', 'queso cottage': 'queso-cottage-light-listo', 'queso cottage 0%': 'queso-cottage-light-listo',
  'queso crema light (tipo philadelphia)': 'queso-crema-light-listo', 'queso de cabra curado': 'queso-curado-listo',
  'queso de cabra semicurado': 'queso-de-cabra-listo', 'queso de cabra tierno': 'queso-de-cabra-listo',
  'queso manchego curado': 'queso-curado-listo', 'queso manchego semicurado': 'queso-semicurado-listo', 'queso mozzarella': 'mozzarella-listo',
  'quinoa cocida': 'quinoa-en-vasito-cocido', 'quinoa hinchada': 'quinoa-seco', 'salsa de soja (tamari)': 'salsa-de-soja-listo',
  'salsa de soja y trigo (shoyu)': 'salsa-de-soja-listo', 'salvado de avena': 'salvado-de-avena-crujiente', 'sardinas en lata': 'sardina-crudo',
  'soja texturizada fina': 'soja-texturizada-seco', 'soja texturizada gruesa': 'soja-texturizada-seco', 'tofu firme': 'tofu-listo',
  'tortilla de trigo (wrap)': 'tortilla-tipo-wrap-listo', 'tortilla wrap de maiz': 'tortilla-tipo-wrap-listo', 'tortita de arroz y quinoa': 'tortitas-de-arroz-listo',
  'yogur bebido yopro danone': 'yogur-yopro-danone-listo', 'yogur de cabra desnatado': 'yogur-de-cabra', 'yogur de oveja natural': 'yogur-natural-listo',
  'yogur de soja': 'yogur-de-soja-natural-listo', 'yogur desnatado': 'yogur-natural-desnatado-0-listo', 'yogur griego ligero': 'yogur-griego-0-listo',
  'zumo de mandarina': 'mandarina-listo',
};

/** Emparejado con la lista blanca delante: un sinónimo revisado es `alta`
 *  (si su alimento está en el catálogo); si no, la puntuación de siempre. */
export function emparejarRevisado(nombre: string, catalogo: AlimentoCatalogo[]): { alimento?: AlimentoCatalogo; confianza: Confianza } {
  const id = SINONIMOS_REVISADOS[normalizarTexto(nombre)];
  if (id) {
    const alimento = catalogo.find(a => a.id === id);
    if (alimento) return { alimento, confianza: 'alta' };
  }
  return emparejar(nombre, catalogo);
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
  // El rango siempre contiene los gramos de la receta: con `redondear5` solo,
  // 3 g de aceite daban {min 5, max 5} y el ajuste subía el aceite a 5 g sin
  // que nadie lo pidiera (1.100 palancas del índice, revisión 26-10-2026).
  return { min: Math.min(gramos, redondear5(gramos * 0.5)), max: Math.max(gramos, redondear5(gramos * 2)), palanca: dominante };
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
    const { alimento, confianza } = emparejarRevisado(ing.name, catalogo);
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

/* ── Vinculación automática (bloque B, 26-10-2026) ───────────────────────── */

/** Por debajo de esto (kcal por 100 g) un alimento no se mueve al ajustar:
 *  verduras, caldos, salsas ligeras. Dani: «verduras, especias y salsas fijas». */
export const KCAL_MIN_PALANCA = 70;

export type VinculoAutomatico =
  | { ok: true; ingredientes: IngredienteVinculado[] }
  | { ok: false; dudosos: string[] };

/**
 * El vínculo de una receta sin revisión manual: solo si TODO lo que cuenta
 * empareja con el catálogo con confianza alta o es un sinónimo revisado
 * (`SINONIMOS_REVISADOS`); lo dudoso se deja para revisar y la receta sigue
 * escalándose entera. Hasta el 26-10-2026 también entraba `media`, y por ahí
 * se colaron 144 recetas con «Calabaza» → «Pipas de calabaza». Palanca: el macro que da al
 * menos el 60 % de sus kcal, rango de la mitad al doble; lo de pocas kcal y lo
 * que no cuenta, fijo.
 */
export function vinculoAutomatico(
  receta: Pick<RecetaCruda, 'ingredients'>,
  catalogo: AlimentoCatalogo[],
  /** Pares ya decididos (p. ej. por las kcal de la receta): posición del ingrediente → alimento. */
  forzados?: ReadonlyMap<number, AlimentoCatalogo>,
): VinculoAutomatico {
  const dudosos: string[] = [];
  const ingredientes: IngredienteVinculado[] = receta.ingredients.map((ing, n) => {
    const gramos = Number(ing.quantity) || 0;
    if (esIngredienteQueNoCuenta(ing.name) || gramos <= 0) {
      return { n, alimentoId: null, gramos, min: gramos, max: gramos, fijo: true };
    }
    const forzado = forzados?.get(n);
    const { alimento, confianza } = forzado ? { alimento: forzado, confianza: 'alta' as Confianza } : emparejarRevisado(ing.name, catalogo);
    if (!alimento || confianza !== 'alta') {
      dudosos.push(ing.name);
      return { n, alimentoId: null, gramos, min: gramos, max: gramos, fijo: true };
    }
    const rango = alimento.porCien.kcal < KCAL_MIN_PALANCA
      ? { min: gramos, max: gramos, fijo: true }
      : propuestaDeRango(gramos, alimento);
    return { n, alimentoId: alimento.id, gramos, ...rango };
  });
  return dudosos.length > 0 ? { ok: false, dudosos } : { ok: true, ingredientes };
}
