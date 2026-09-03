import { Recipe } from '../types';

/**
 * `ownerId` del recetario importado (8.850 recetas). Es un centinela, no un UID
 * de Firebase: distingue las recetas del catálogo de las que escribe un coach o
 * un atleta, que llevan su UID.
 *
 * Hay DOS valores a propósito, y NO es temporal: es el estado definitivo.
 *
 * Cuando se quitó el nombre antiguo del código (2026-08-08), los ~8.850
 * documentos ya escritos en Firestore seguían llevándolo. Migrarlos era posible
 * —el `ownerId` es el único campo a cambiar— pero se decidió no hacerlo: son
 * 8.850 escrituras en producción para renombrar una etiqueta que nadie ve, y
 * aceptar los dos valores sale gratis. Unos pocos documentos llevan ya el valor
 * nuevo, de una prueba del mecanismo; por eso la lectura tiene que cubrir ambos
 * de todas formas.
 *
 * Las ESCRITURAS usan solo `OWNER_RECETARIO`, así que todo lo que entre de aquí
 * en adelante nace limpio. Las LECTURAS usan `OWNER_RECETARIO_TODOS`, y quitar
 * el valor heredado dejaría invisible el recetario entero: si alguien lo hace,
 * la biblioteca de recetas se queda vacía.
 *
 * `in` con dos valores no cambia los índices que hacen falta: Firestore lo
 * resuelve como la unión de dos consultas de igualdad.
 */
export const OWNER_RECETARIO = 'recetas';
const OWNER_RECETARIO_LEGACY = 'indya';
export const OWNER_RECETARIO_TODOS = [OWNER_RECETARIO, OWNER_RECETARIO_LEGACY];

/**
 * Repone los campos que el documento de Firestore sí tiene pero que no vale la
 * pena guardar 8.850 veces en el fichero: o son constantes, o se derivan de otro
 * campo. Guardarlos costaría cientos de KB en cada instalación para no decir
 * nada nuevo.
 *
 * Vive en su propio fichero, sin importar nada de `../firebase`, a propósito:
 * `src/workers/recetasIndiceWorker.ts` la reutiliza dentro de un Web Worker, y
 * un Worker no tiene `window`/`document` — cualquier dependencia que los toque
 * en su inicialización (el SDK de Firebase lo hace) rompería el Worker entero
 * por una función que ni siquiera los necesita.
 */
/**
 * El recetario importado mete entre los «Platos salados / principales» un montón
 * de cosas que no son platos: agua, aloe vera, amilopectina, Anxistop, aceitunas,
 * aceite de oliva, barritas y geles de marca, proteína en polvo… No se cocinan y
 * no hay nada que leer en ellas, pero ocupaban sitio en la pestaña de principales.
 *
 * El primer intento (08-2026) fue una lista de nombres —creatina, glutamina,
 * beta-alanina…— y por eso se quedaron fuera el agua y compañía: son infinitas y
 * cada marca inventa la suya. La señal buena no está en el nombre sino en el
 * propio documento: una entrada que NO tiene ningún tipo de ingesta asignado y
 * que lleva como mucho un ingrediente no es un plato, es un producto o un
 * alimento suelto. Son 673 de 8.850, y con esa regla salen todas de una vez sin
 * mantener ninguna lista.
 *
 * La lista de nombres se conserva igualmente: pilla al suplemento puro que sí
 * viene con tipo de ingesta puesto, que la regla estructural dejaría pasar.
 *
 * OJO al tocar el umbral de ingredientes: hay platos de verdad con un solo
 * ingrediente (una pieza de fruta), pero esos SÍ traen tipo de ingesta, así que
 * las dos condiciones tienen que cumplirse a la vez.
 */
const CAT_SUPLEMENTOS = 'Suplementos deportivos';
const CAT_NO_PLATOS = 'Alimentos y suplementos';
const RE_SUPLEMENTO_PURO = /\b(creatina|glutamina|beta[\s-]?alanina|citrulina|arginina|taurina|bcaa|hmb)\b|^cafeina\b/;

export function esSuplementoPuroPorNombre(nombre: string | undefined | null): boolean {
  if (!nombre) return false;
  const n = nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
  return RE_SUPLEMENTO_PURO.test(n);
}

/**
 * Producto o alimento suelto, no un plato: sin tipo de ingesta y con un
 * ingrediente como mucho. Ver el comentario de arriba para el porqué.
 */
export function noEsUnPlato(r: Pick<Recipe, 'intakeTypes' | 'ingredientsText'>): boolean {
  return (r.intakeTypes ?? []).length === 0 && (r.ingredientsText ?? []).length <= 1;
}

export function hidratarEntradaIndice(r: Recipe): Recipe {
  const categoria = noEsUnPlato(r)
    ? CAT_NO_PLATOS
    : esSuplementoPuroPorNombre(r.name) ? CAT_SUPLEMENTOS : r.categoria;
  return {
    ...r,
    ownerId: OWNER_RECETARIO,
    categoria,
    // `categoria` es el campo real; `categories` es el array heredado con el que
    // filtran las pantallas antiguas y el motor de menús.
    categories: categoria ? [categoria] : [],
    // Vacíos en el documento real: una receta del recetario trae `ingredientsText`
    // y `stepsText`, no la estructura de ingredientes del constructor.
    ingredients: [],
    extras: [],
    steps: [],
  } as Recipe;
}
