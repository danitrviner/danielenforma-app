import { db, collection, doc, getDoc, setDoc, getDocs, addDoc, updateDoc, deleteDoc, query, where } from '../firebase';
import { Recipe, RecipeFavorites } from '../types';
import type { ReglasDeReceta } from '../utils/reglasDeReceta';
import { filtrarPorLista, type AccesoGlobalARecetas, type ListaDeMenu } from '../utils/accesoARecetas';
import { forceLocalOnly, setLocalBypassMode, stripUndefined, esFalloDePermisos } from './core';
import { OWNER_RECETARIO, OWNER_RECETARIO_TODOS, hidratarEntradaIndice, encajaCategoria, type FiltroRapidas, type AlimentosDelIndice } from './recetasHidratacion';
import { escribirLocal } from '../utils/almacenLocal';
import { registrarCambio } from './cambios';
import { resumirReglasDeReceta } from '../utils/cambiosAtleta';

export { OWNER_RECETARIO, OWNER_RECETARIO_TODOS };
export { CAT_BASICAS, encajaCategoria, FILTROS_RAPIDAS } from './recetasHidratacion';
export type { FiltroRapidas } from './recetasHidratacion';

// ─── RECIPES ─────────────────────────────────────────────────────────────────

const RECIPES_LOCAL_KEY = 'enforma_recipes_v1';

function getLocalRecipes(): Recipe[] {
  try {
    const raw = localStorage.getItem(RECIPES_LOCAL_KEY);
    return raw ? (JSON.parse(raw) as Recipe[]) : [];
  } catch { return []; }
}

function setLocalRecipes(recipes: Recipe[]): void {
  escribirLocal(RECIPES_LOCAL_KEY, JSON.stringify(recipes));
}

/**
 * Las recetas que puede ver `ownerId`: SOLO las suyas.
 *
 * `ownerId` es obligatorio, y eso es el arreglo. Antes era opcional y, sin él,
 * esto devolvía TODAS las recetas con dueño real —las del coach y las de todos
 * los atletas juntas—; cuatro pantallas lo llamaban así (Recetario, Mi plan, el
 * constructor de recetas y el editor de menú semanal), de modo que la receta que
 * se guardaba un atleta le aparecía a los demás. En 08-2026 se tapó solo el
 * buscador de "Intercambiar", que era el único que pasaba `ownerId`.
 *
 * El recetario importado (8.850) no sale por aquí: se lista desde el índice
 * empaquetado (`queryRecetas`), que es común a todo el mundo. Y una receta
 * concreta sigue abriéndose por `getRecipeById` venga de donde venga —así el
 * coach ve la receta que un atleta ha metido en su plan, y un menú semanal
 * puede llevar recetas de quien sea.
 */
export async function getRecipes(opts: { ownerId: string }): Promise<Recipe[]> {
  const propias = (list: Recipe[]) => list.filter(r => r.ownerId === opts.ownerId);
  if (forceLocalOnly) return propias(getLocalRecipes());
  try {
    const snap = await getDocs(query(collection(db, 'recipes'), where('ownerId', '==', opts.ownerId)));
    const recipes = snap.docs.map(d => ({ id: d.id, ...d.data() } as Recipe));
    // El espejo local es común a todos los dueños que hayan usado este
    // dispositivo, así que se reemplaza solo el tramo de ESTE dueño en vez de
    // machacarlo entero con un subconjunto.
    setLocalRecipes([...getLocalRecipes().filter(r => r.ownerId !== opts.ownerId), ...recipes]);
    return recipes;
  } catch (err) {
    console.warn('getRecipes Firestore failed, using local:', err);
    setLocalBypassMode(true, err);
    return propias(getLocalRecipes());
  }
}

// Single-recipe lookup by id — used by the weekly-menu viewer, which only
// stores a denormalized name/image on each MenuMeal and needs the full
// ingredients/steps on demand when the athlete opens a recipe's detail.
export async function getRecipeById(id: string): Promise<Recipe | null> {
  const local = getLocalRecipes().find(r => r.id === id);
  // Only use the local cache outright when it actually has this recipe. Recetas
  // recipes are never persisted to the local cache (getRecipes excludes them),
  // so in local mode `local` is usually undefined for a menu's recipes — falling
  // back to it would make the viewer always say "no se pudo cargar la receta".
  // A single-doc recipe read is cheap and world-readable to any authed user, so
  // try Firestore even in local mode, and DON'T flip global local mode if it
  // fails (one recipe read failing shouldn't poison the whole session).
  if (forceLocalOnly && local) return local;
  try {
    const snap = await getDoc(doc(db, 'recipes', id));
    if (snap.exists()) return { id: snap.id, ...snap.data() } as Recipe;
    return local ?? null;
  } catch (err) {
    console.warn(`getRecipeById(${id}) Firestore failed, using local:`, err);
    return local ?? null;
  }
}

/**
 * Posición dentro del índice empaquetado. Es opaco para quien lo usa: se
 * recibe de `queryRecetas` y se le devuelve tal cual para pedir la página
 * siguiente. Antes era un `QueryDocumentSnapshot` de Firestore (lo consumía
 * `startAfter`); al listar en local ya no hay snapshot que guardar.
 */
export type RecetasCursor = { offset: number };

export interface RecetasFilters {
  categoria?: string;
  intakeType?: number;
  /** Subfiltro de la pestaña Rápidas (minutos o tupper). */
  rapidas?: FiltroRapidas;
}

/**
 * El índice del recetario viaja dentro de la app (`public/recetas-indice.json`,
 * lo genera `scripts/generarIndiceRecetas.mjs`). Listar y filtrar recetas no
 * toca Firestore: son 8.850 documentos que no cambian casi nunca y que se
 * releían enteros en cada sesión de cada atleta, agotando la cuota diaria de
 * lecturas de la base de datos —y tirando la app a modo local cuando pasaba—
 * además de pagar un viaje a us-west1 por página.
 *
 * Lo que el índice NO trae son los pasos y las cantidades: eso llega con
 * `getRecipeById` al abrir una receta concreta, que es una lectura y solo
 * cuando de verdad se necesita.
 *
 * En la app nativa el fichero es local, así que esto no es una descarga.
 */
// El fetch se queda aquí, en el hilo principal (testable con un mock de
// `fetch` normal); lo único que cruza a un Web Worker es el parseo, que es lo
// que de verdad bloqueaba la pantalla — ver recetasIndiceWorker.ts.
function parsearIndiceEnPrincipal(texto: string): Recipe[] {
  const datos = JSON.parse(texto) as { recetas?: Recipe[]; alimentos?: AlimentosDelIndice };
  return (datos.recetas ?? []).map(r => hidratarEntradaIndice(r, datos.alimentos));
}

function parsearIndiceEnWorker(texto: string): Promise<Recipe[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/recetasIndiceWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (evento: MessageEvent<{ recetas: Recipe[] } | { error: string }>) => {
      worker.terminate();
      if ('error' in evento.data) reject(new Error(evento.data.error));
      else resolve(evento.data.recetas);
    };
    worker.onerror = err => {
      worker.terminate();
      reject(err);
    };
    worker.postMessage({ texto });
  });
}

let indicePromesa: Promise<Recipe[]> | null = null;

export function cargarIndiceRecetas(): Promise<Recipe[]> {
  // Se memoiza la promesa, no el resultado: si la lista y el generador de menús
  // lo piden a la vez durante el arranque, comparten la misma carga en lugar de
  // parsear 4,7 MB dos veces.
  indicePromesa ??= fetch('/recetas-indice.json')
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    })
    // Sin Worker disponible (navegador viejo, o los tests que corren en
    // Node) se cae al parseo normal en el hilo principal — mismo resultado,
    // solo que sin el ahorro de no congelar la pantalla.
    .then(texto => {
      if (typeof Worker === 'undefined') return parsearIndiceEnPrincipal(texto);
      // Si el Worker falla —no está soportado, lo bloquea una política, se queda
      // sin memoria en un móvil justo— se parsea aquí y ya está. Antes ese
      // rechazo caía en el `.catch` de abajo y el recetario ENTERO se quedaba
      // vacío para toda la sesión: el buscador contestaba "nada para X" sobre
      // las 8.850 recetas, indistinguible de que la receta no exista.
      return parsearIndiceEnWorker(texto).catch(err => {
        console.warn('El parseo en Worker falló; se parsea en el hilo principal:', err);
        return parsearIndiceEnPrincipal(texto);
      });
    })
    .catch(err => {
      console.warn('No se pudo cargar el índice del recetario:', err);
      indicePromesa = null;   // que el siguiente intento vuelva a probar
      return [];
    });
  return indicePromesa;
}

export async function queryRecetas(
  filters: RecetasFilters,
  cursor: RecetasCursor | null,
  pageSize = 48,
): Promise<{ recipes: Recipe[]; cursor: RecetasCursor | null; hasMore: boolean }> {
  const indice = await cargarIndiceRecetas();

  // El índice ya viene ordenado por nombre desde el generador —el mismo orden
  // que daba `orderBy('name')`—, así que filtrar conserva el orden y no hay que
  // reordenar 8.850 entradas en el móvil.
  const coincidencias = indice.filter(r =>
    encajaCategoria(r, filters.categoria, filters.rapidas) &&
    (filters.intakeType == null || (r.intakeTypes ?? []).includes(filters.intakeType)),
  );

  const desde = cursor?.offset ?? 0;
  const recipes = coincidencias.slice(desde, desde + pageSize);
  const siguiente = desde + recipes.length;

  return {
    recipes,
    cursor: { offset: siguiente },
    hasMore: siguiente < coincidencias.length,
  };
}

export async function createRecipe(data: Omit<Recipe, 'id'>): Promise<Recipe> {
  if (forceLocalOnly) {
    const recipe: Recipe = { id: `recipe_${Date.now()}`, ...data };
    setLocalRecipes([...getLocalRecipes(), recipe]);
    return recipe;
  }
  try {
    const ref = await addDoc(collection(db, 'recipes'), stripUndefined(data));
    const recipe: Recipe = { id: ref.id, ...data };
    setLocalRecipes([...getLocalRecipes(), recipe]);
    return recipe;
  } catch (err) {
    console.warn('createRecipe Firestore failed, saving local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    const recipe: Recipe = { id: `recipe_${Date.now()}`, ...data };
    setLocalRecipes([...getLocalRecipes(), recipe]);
    return recipe;
  }
}

export async function updateRecipe(id: string, updates: Partial<Omit<Recipe, 'id'>>): Promise<void> {
  const all = getLocalRecipes();
  const updated = all.map(r => r.id === id ? { ...r, ...updates } : r);
  if (forceLocalOnly) { setLocalRecipes(updated); return; }
  try {
    await updateDoc(doc(db, 'recipes', id), stripUndefined(updates) as Record<string, unknown>);
    setLocalRecipes(updated);
  } catch (err) {
    console.warn('updateRecipe Firestore failed, saving local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    setLocalRecipes(updated);
  }
}

export async function deleteRecipe(id: string): Promise<void> {
  const filtered = getLocalRecipes().filter(r => r.id !== id);
  if (forceLocalOnly) { setLocalRecipes(filtered); return; }
  try {
    await deleteDoc(doc(db, 'recipes', id));
    setLocalRecipes(filtered);
  } catch (err) {
    console.warn('deleteRecipe Firestore failed, deleting local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    setLocalRecipes(filtered);
  }
}

// ─── REGLAS DE RECETA DEL COACH ───────────────────────────────────────────────
// Doc id = email del atleta. Lo escribe solo el coach (firestore.rules); el
// atleta lo LEE para que sus pantallas apliquen el filtro. Sin copia local a
// propósito: es una decisión del coach y una copia vieja escondería recetas que
// ya se han vuelto a permitir.

export async function getReglasDeReceta(athleteEmail: string): Promise<ReglasDeReceta> {
  const vacio: ReglasDeReceta = { athleteId: athleteEmail, reglas: [] };
  if (forceLocalOnly) return vacio;
  try {
    const snap = await getDoc(doc(db, 'athleteRecipeRules', athleteEmail));
    return snap.exists() ? { ...vacio, ...(snap.data() as Partial<ReglasDeReceta>) } : vacio;
  } catch (err) {
    // Un fallo de lectura no puede dejar al atleta sin menú: sin reglas, se
    // genera con el pool normal. Se avisa, no se calla.
    console.warn('getReglasDeReceta failed:', err);
    return vacio;
  }
}

/* `merge`: las escondidas y las recomendadas viven en el mismo documento y se
   guardan por separado. Sin merge, guardar una regla de esconder borraba las
   recomendadas (y al revés), porque `setDoc` reemplaza el documento entero.
   Los arrays que sí se mandan se sustituyen enteros, que es lo que se quiere. */
export async function saveReglasDeReceta(
  reglas: Pick<ReglasDeReceta, 'athleteId'> & Partial<Pick<ReglasDeReceta, 'reglas' | 'recomendadas' | 'listaMenu' | 'recetario' | 'seleccion'>>,
  /** Para que el historial diga «Pollo al curry» y no «receta»; opcional. */
  nombreDe?: (id: string) => string | undefined,
): Promise<void> {
  if (forceLocalOnly) return;
  // El estado de ANTES, para el historial (N-09): una lectura de un solo documento
  // del atleta, solo cuando el coach guarda. Si falla, se guarda igual sin historial.
  let antes: ReglasDeReceta | undefined;
  try {
    const snap = await getDoc(doc(db, 'athleteRecipeRules', reglas.athleteId));
    antes = snap.exists() ? ({ reglas: [], ...(snap.data() as Partial<ReglasDeReceta>), athleteId: reglas.athleteId }) : undefined;
  } catch { /* sin «antes» no hay frase, pero el guardado no se frena */ }
  // `mergeFields` y no `merge`: con `merge` los mapas se mezclan campo a campo,
  // así que quitar el filtro de una dieta de `seleccion` no lo borraba nunca.
  // Así cada campo que se manda se sustituye entero y el resto no se toca.
  const datos = stripUndefined({ ...reglas, updatedAt: new Date().toISOString() });
  await setDoc(doc(db, 'athleteRecipeRules', reglas.athleteId), datos, { mergeFields: Object.keys(datos) });
  const despues: ReglasDeReceta = { reglas: [], ...antes, ...stripUndefined(reglas) };
  void registrarCambio<ReglasDeReceta>({
    athleteId: reglas.athleteId, area: 'nutricion', objeto: 'recetas', titulo: 'Recetas del atleta',
    antes, despues, resumir: (a, d) => resumirReglasDeReceta(a, d, nombreDe),
  });
}

/* Lista global de recetas «para el menú» (N-03): `recipeAccess/global`. La lee
   cualquier usuario con sesión y solo la escribe el coach. Sin copia local, por
   lo mismo que las reglas. Si falla la lectura se trabaja con todas las recetas. */
export async function getAccesoGlobalARecetas(): Promise<AccesoGlobalARecetas> {
  if (forceLocalOnly) return {};
  try {
    const snap = await getDoc(doc(db, 'recipeAccess', 'global'));
    return snap.exists() ? (snap.data() as AccesoGlobalARecetas) : {};
  } catch (err) {
    console.warn('getAccesoGlobalARecetas failed:', err);
    return {};
  }
}

export async function saveAccesoGlobalARecetas(acceso: AccesoGlobalARecetas): Promise<void> {
  if (forceLocalOnly) return;
  await setDoc(
    doc(db, 'recipeAccess', 'global'),
    stripUndefined({ ...acceso, updatedAt: new Date().toISOString() }),
    { merge: true },
  );
}

// ─── RECIPE FAVORITES ─────────────────────────────────────────────────────────

export async function getRecipeFavorites(athleteEmail: string): Promise<RecipeFavorites> {
  const defaultFav: RecipeFavorites = { athleteId: athleteEmail, recipeIds: [] };
  const localKey = `enforma_recipe_favorites_${athleteEmail}`;
  if (forceLocalOnly) {
    try {
      const raw = localStorage.getItem(localKey);
      return raw ? JSON.parse(raw) : defaultFav;
    } catch { return defaultFav; }
  }
  try {
    const snap = await getDoc(doc(db, 'recipeFavorites', athleteEmail));
    if (snap.exists()) {
      const data = snap.data() as RecipeFavorites;
      escribirLocal(localKey, JSON.stringify(data));
      return data;
    }
    try {
      const raw = localStorage.getItem(localKey);
      if (raw) return JSON.parse(raw);
    } catch {}
    return defaultFav;
  } catch (err) {
    console.warn('getRecipeFavorites Firestore failed, using local:', err);
    setLocalBypassMode(true, err);
    try {
      const raw = localStorage.getItem(localKey);
      return raw ? JSON.parse(raw) : defaultFav;
    } catch { return defaultFav; }
  }
}

export async function saveRecipeFavorites(favs: RecipeFavorites): Promise<void> {
  const localKey = `enforma_recipe_favorites_${favs.athleteId}`;
  if (forceLocalOnly) { escribirLocal(localKey, JSON.stringify(favs)); return; }
  try {
    await setDoc(doc(db, 'recipeFavorites', favs.athleteId), stripUndefined(favs));
    escribirLocal(localKey, JSON.stringify(favs));
  } catch (err) {
    console.warn('saveRecipeFavorites Firestore failed, saving local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    escribirLocal(localKey, JSON.stringify(favs));
  }
}


// Module-level cache: a weekly menu generation touches every used intakeType
// once (≤5 queries) instead of once per meal slot across 7 days (≤35 queries).
const recetasGeneratorCache = new Map<number, Recipe[]>();

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// La caché guarda la franja ENTERA ya barajada, y el recorte se aplica al
// devolverla. Guardar la lista ya recortada ataba el tamaño al de la primera
// llamada de la sesión: si el generador (300) se adelantaba al buscador de
// alternativas (todas), el buscador recibía las mismas 300 sin enterarse.
export async function queryRecetasForGenerator(
  intakeType: number, maxResults = 300, lista?: ListaDeMenu,
  /** Recetas que quiere alguna dieta del atleta (`quiereAlgunaDieta`): se suman
   *  a la muestra, hasta `maxResults` más, para que sus filtros tengan dónde elegir. */
  tambien?: (r: Recipe) => boolean,
): Promise<Recipe[]> {
  let franja = recetasGeneratorCache.get(intakeType);
  if (!franja) {
    const indice = await cargarIndiceRecetas();
    // Se baraja ANTES de recortar: el índice está ordenado por nombre, así que
    // quedarse con las primeras `maxResults` dejaría al generador proponiendo
    // siempre las mismas recetas del principio del alfabeto.
    franja = shuffle(indice.filter(r => (r.intakeTypes ?? []).includes(intakeType)));
    recetasGeneratorCache.set(intakeType, franja);
  }
  // La lista del coach se aplica ANTES de recortar: si no, las 300 elegidas al
  // azar podían no incluir ninguna de las suyas y la lista no tenía efecto.
  const delaLista = filtrarPorLista(franja, lista);
  const muestra = maxResults >= delaLista.length ? delaLista : delaLista.slice(0, maxResults);
  if (!tambien) return muestra;
  const ya = new Set(muestra.map(r => r.id));
  const extra = franja.filter(r => !ya.has(r.id) && tambien(r));
  return [...muestra, ...(maxResults >= extra.length ? extra : extra.slice(0, maxResults))];
}

