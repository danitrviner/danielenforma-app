import type { Recipe } from '../types.js';
import { grupoDeReceta, esBocadilloOWrap, type GrupoDeReceta } from './grupoDeReceta.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Qué tipo de plato va en cada comida (Dani, 11-2026)

   El recetario trae cada receta marcada a mano para unas comidas, y muchas
   están mal: la hamburguesa con queso o los perritos valían para las cinco.
   Quitar las malas una a una no se acaba nunca, así que manda el TIPO de plato:
   una tabla tipo × comida que el coach puede editar en Biblioteca › Recetas
   (`recipeAccess/limpieza.porTipo`). Lo que marque en una receta concreta
   («Para qué comidas») sigue mandando sobre la tabla.

   La tabla decide entera: una receta de un tipo con regla vale justo para las
   comidas de su tipo, no para las que traía. Los tipos sin regla (salsas,
   alimentos sueltos, suplementos, otros) se quedan como vienen.
   ═══════════════════════════════════════════════════════════════════════════ */

/** 1 desayuno · 2 media mañana · 3 comida · 4 merienda · 5 cena. */
export const COMIDAS = [
  { id: 1, nombre: 'Desayuno', corto: 'Des.' },
  { id: 2, nombre: 'Media mañana', corto: 'M. mañ.' },
  { id: 3, nombre: 'Comida', corto: 'Comida' },
  { id: 4, nombre: 'Merienda', corto: 'Mer.' },
  { id: 5, nombre: 'Cena', corto: 'Cena' },
] as const;

/** Los grupos del recetario, con dos que se separan para poder tratarlos aparte. */
export type TipoParaComidas = GrupoDeReceta | 'Bocadillos' | 'Tortitas y crepes saladas';

export type TablaDeComidas = Partial<Record<TipoParaComidas, number[]>>;

const DESAYUNO_Y_MEDIAS: number[] = [1, 2, 4];
const MEDIAS: number[] = [2, 4];
const PLATOS: number[] = [3, 5];

/** Lo recomendado. El orden es el de la tabla en pantalla. */
export const COMIDAS_POR_TIPO_DEFECTO: TablaDeComidas = {
  'Desayunos: avena, tortitas y cereales': DESAYUNO_Y_MEDIAS,
  'Yogures, lácteos y bowls': DESAYUNO_Y_MEDIAS,
  'Batidos y smoothies': DESAYUNO_Y_MEDIAS,
  'Bebidas': DESAYUNO_Y_MEDIAS,
  'Fruta': DESAYUNO_Y_MEDIAS,
  'Tostadas y bocadillos': DESAYUNO_Y_MEDIAS,
  'Bocadillos': MEDIAS,
  'Tortitas y crepes saladas': MEDIAS,
  'Frutos secos y snacks': MEDIAS,
  'Dulces y postres': MEDIAS,
  'Wraps, tacos y burritos': [2, 4, 5],
  'Hamburguesas': [5],
  'Pizzas y masas': [5],
  'Huevos y tortillas': PLATOS,
  'Ensaladas': PLATOS,
  'Sopas, cremas y purés': PLATOS,
  'Arroces y granos': PLATOS,
  'Pastas': PLATOS,
  'Legumbres': PLATOS,
  'Pescados y marisco': PLATOS,
  'Carnes y aves': PLATOS,
  'Verduras': PLATOS,
};

/** Las filas de la tabla, en orden. */
export const TIPOS_CON_REGLA = Object.keys(COMIDAS_POR_TIPO_DEFECTO) as TipoParaComidas[];

/** Nombre corto para la tabla («Tostadas y bocadillos» ya sin bocadillos). */
export const NOMBRE_DE_TIPO: Partial<Record<TipoParaComidas, string>> = {
  'Desayunos: avena, tortitas y cereales': 'Avena, tortitas y cereales',
  'Tostadas y bocadillos': 'Tostadas y pan',
};

/** Lo que delata una tortita, crepe o gofre salado: «crepe de pollo» no es un desayuno. */
const SALADO = /(^|[^a-z])(pollo|pavo|atun|jamon|salmon|ternera|cerdo|lomo|bacon|beicon|chorizo|gambas?|merluza|carne|bacalao|york|salchichas?)([^a-z]|$)/;
const sinTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function tipoParaComidas(r: Partial<Pick<Recipe, 'name' | 'categoria'>>): TipoParaComidas {
  const g = grupoDeReceta(r);
  if (g === 'Tostadas y bocadillos') {
    const principal = sinTildes(r.name ?? '').split('/')[0];
    // «Pan pizza» es una pizza y un sándwich de hamburguesa, un bocadillo.
    if (/(^|[^a-z])pizzas?([^a-z]|$)/.test(principal)) return 'Pizzas y masas';
    if (esBocadilloOWrap(r) || /(^|[^a-z])(hamburguesas?|burgers?)([^a-z]|$)/.test(principal)) return 'Bocadillos';
  }
  if (g === 'Desayunos: avena, tortitas y cereales' && SALADO.test(sinTildes(r.name ?? '').split('/')[0])) return 'Tortitas y crepes saladas';
  return g;
}

/** La tabla que manda: lo recomendado con lo que haya cambiado el coach encima.
 *  Una fila vacía no cuenta (sin comidas, el generador la daría por válida para todas). */
export function tablaVigente(guardada?: TablaDeComidas): TablaDeComidas {
  const t: TablaDeComidas = { ...COMIDAS_POR_TIPO_DEFECTO };
  for (const [tipo, comidas] of Object.entries(guardada ?? {}) as [TipoParaComidas, number[]][]) {
    if (tipo in COMIDAS_POR_TIPO_DEFECTO && comidas?.length) t[tipo] = [...comidas].sort((a, b) => a - b);
  }
  return t;
}

/** Pone a cada receta las comidas de su tipo. Puro. */
export function conComidasPorTipo(recetas: Recipe[], guardada?: TablaDeComidas): Recipe[] {
  const tabla = tablaVigente(guardada);
  return recetas.map(r => {
    const comidas = tabla[tipoParaComidas(r)];
    if (!comidas) return r;
    const actuales = r.intakeTypes ?? [];
    if (actuales.length === comidas.length && actuales.every((x, i) => x === comidas[i])) return r;
    return { ...r, intakeTypes: [...comidas] };
  });
}

/** ¿Cambia la tabla respecto a lo recomendado? Solo se guardan las filas distintas. */
export function cambiosSobreDefecto(tabla: TablaDeComidas): TablaDeComidas {
  const out: TablaDeComidas = {};
  for (const tipo of TIPOS_CON_REGLA) {
    const a = [...(tabla[tipo] ?? [])].sort((x, y) => x - y);
    const b = COMIDAS_POR_TIPO_DEFECTO[tipo] ?? [];
    if (a.length && (a.length !== b.length || a.some((x, i) => x !== b[i]))) out[tipo] = a;
  }
  return out;
}
