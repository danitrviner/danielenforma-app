import { db, collection, doc, getDoc, setDoc, getDocs, addDoc, updateDoc, deleteDoc, query, where } from '../firebase';
import { Recipe, RecipeFavorites } from '../types';
import { forceLocalOnly, setLocalBypassMode, stripUndefined, esFalloDePermisos } from './core';
import { OWNER_RECETARIO, OWNER_RECETARIO_TODOS, hidratarEntradaIndice } from './recetasHidratacion';

export { OWNER_RECETARIO, OWNER_RECETARIO_TODOS };

// ─── RECIPES ─────────────────────────────────────────────────────────────────

const RECIPES_LOCAL_KEY = 'enforma_recipes_v1';

function getLocalRecipes(): Recipe[] {
  try {
    const raw = localStorage.getItem(RECIPES_LOCAL_KEY);
    return raw ? (JSON.parse(raw) as Recipe[]) : [];
  } catch { return []; }
}

function setLocalRecipes(recipes: Recipe[]): void {
  localStorage.setItem(RECIPES_LOCAL_KEY, JSON.stringify(recipes));
}

export async function getRecipes(opts?: { ownerId?: string }): Promise<Recipe[]> {
  if (forceLocalOnly) {
    const local = getLocalRecipes();
    return opts?.ownerId ? local.filter(r => r.ownerId === opts.ownerId) : local;
  }
  try {
    // Excluye el recetario importado (8.850+) para no bajarse la colección entera.
    // Con `ownerId` se acota además a las recetas propias de ese dueño — usado por
    // el buscador de "Intercambiar" para que la receta guardada de un atleta no
    // aparezca como sugerencia para otro (antes no había ningún filtro por dueño).
    const q = opts?.ownerId
      ? query(collection(db, 'recipes'), where('ownerId', '==', opts.ownerId))
      : query(collection(db, 'recipes'), where('ownerId', 'not-in', OWNER_RECETARIO_TODOS));
    const snap = await getDocs(q);
    const recipes = snap.docs.map(d => ({ id: d.id, ...d.data() } as Recipe));
    // El caché local es la lista completa sin acotar — una llamada acotada por
    // dueño no debe sobrescribirlo con un subconjunto parcial.
    if (!opts?.ownerId) setLocalRecipes(recipes);
    return recipes;
  } catch (err) {
    console.warn('getRecipes Firestore failed, using local:', err);
    setLocalBypassMode(true, err);
    const local = getLocalRecipes();
    return opts?.ownerId ? local.filter(r => r.ownerId === opts.ownerId) : local;
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
  const datos = JSON.parse(texto) as { recetas?: Recipe[] };
  return (datos.recetas ?? []).map(hidratarEntradaIndice);
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
    .then(texto => (typeof Worker !== 'undefined' ? parsearIndiceEnWorker(texto) : parsearIndiceEnPrincipal(texto)))
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
    (!filters.categoria || r.categoria === filters.categoria) &&
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
      localStorage.setItem(localKey, JSON.stringify(data));
      return data;
    }
    try {
      const raw = localStorage.getItem(localKey);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
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
  if (forceLocalOnly) { localStorage.setItem(localKey, JSON.stringify(favs)); return; }
  try {
    await setDoc(doc(db, 'recipeFavorites', favs.athleteId), stripUndefined(favs));
    localStorage.setItem(localKey, JSON.stringify(favs));
  } catch (err) {
    console.warn('saveRecipeFavorites Firestore failed, saving local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    localStorage.setItem(localKey, JSON.stringify(favs));
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

export async function queryRecetasForGenerator(intakeType: number, maxResults = 300): Promise<Recipe[]> {
  const cached = recetasGeneratorCache.get(intakeType);
  if (cached) return cached;

  const indice = await cargarIndiceRecetas();
  const candidatas = indice.filter(r => (r.intakeTypes ?? []).includes(intakeType));

  // Se baraja ANTES de recortar: el índice está ordenado por nombre, así que
  // quedarse con las primeras `maxResults` dejaría al generador proponiendo
  // siempre las mismas recetas del principio del alfabeto.
  const recipes = shuffle(candidatas).slice(0, maxResults);
  recetasGeneratorCache.set(intakeType, recipes);
  return recipes;
}

