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
 * El recetario importado clasifica muchos suplementos puros (creatina, glutamina,
 * beta-alanina, citrulina, arginina, cafeína en polvo/cápsulas…) como
 * «Platos salados / principales» o «Bebidas». No son platos: no se cocinan, no
 * llevan intakeType y ensuciaban la pestaña de principales del recetario. Se
 * reetiquetan por nombre a «Suplementos deportivos», que es donde el atleta
 * espera encontrarlos.
 */
const CAT_SUPLEMENTOS = 'Suplementos deportivos';
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

export function hidratarEntradaIndice(r: Recipe): Recipe {
  const categoria = esSuplementoPuroPorNombre(r.name) ? CAT_SUPLEMENTOS : r.categoria;
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
