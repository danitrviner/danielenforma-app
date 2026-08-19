import { MealItem } from '../types';
import { slugify } from './maquinaId';

/* T14 (18-08). La semilla en sí no tiene duplicados (comprobado parseando
   src/nutricion_seed_en_forma.ts: 310 entradas, 0 repetidas) — el problema es
   `seedFoodItemsIfEmpty` sembrando dos veces por una carrera sin transacción
   (ver src/db/nutrition.ts). Los 620 documentos duplicados ya existen en
   producción; este módulo es el deduplicador que los limpia, puro y testeado
   antes de tocar Firestore de verdad.

   Qué NO hay que borrar: `gazpacho` OMNÍVORO y `gazpacho` VEGANO son entradas
   legítimas que solo comparten `label` — la clave incluye `mode`, así que
   nunca se agrupan entre sí. */

export interface GrupoDuplicado {
  clave: string;
  conservar: MealItem;
  eliminar: MealItem[];
}

function normalizarEtiqueta(label: string): string {
  return slugify(label);
}

function claveDedupe(item: Pick<MealItem, 'mode' | 'category' | 'label'>): string {
  return `${item.mode}|${item.category}|${normalizarEtiqueta(item.label)}`;
}

/**
 * Agrupa por `mode|category|etiqueta normalizada` y, para cada grupo con más
 * de un documento, decide cuál conservar: el de ID determinista (`sys_…`,
 * ver idDeFoodItem) si hay uno, o si no el primero de la lista — el orden lo
 * decide quien llama, normalmente el orden de lectura de Firestore.
 */
export function encontrarDuplicados(items: MealItem[]): GrupoDuplicado[] {
  const grupos = new Map<string, MealItem[]>();
  for (const item of items) {
    const clave = claveDedupe(item);
    const lista = grupos.get(clave);
    if (lista) lista.push(item);
    else grupos.set(clave, [item]);
  }

  const resultado: GrupoDuplicado[] = [];
  for (const [clave, lista] of grupos) {
    if (lista.length < 2) continue;
    const determinista = lista.find(i => i.id.startsWith('sys_'));
    const conservar = determinista ?? lista[0];
    const eliminar = lista.filter(i => i.id !== conservar.id);
    resultado.push({ clave, conservar, eliminar });
  }
  return resultado;
}
