import { db, collection, doc, getDoc, setDoc, getDocs, addDoc, updateDoc, deleteDoc, query, where, orderBy, limit, startAfter } from '../firebase';
import { QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { Recipe, RecipeFavorites } from '../types';
import { forceLocalOnly, setLocalBypassMode, stripUndefined, esFalloDePermisos } from './core';

// ─── RECIPES ─────────────────────────────────────────────────────────────────

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
const OWNER_RECETARIO_TODOS = [OWNER_RECETARIO, OWNER_RECETARIO_LEGACY];

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

export type RecetasCursor = QueryDocumentSnapshot<DocumentData>;

export interface RecetasFilters {
  categoria?: string;
  intakeType?: number;
}

const recetasPageCache = new Map<string, { recipes: Recipe[]; cursor: RecetasCursor | null; hasMore: boolean }>();

export async function queryRecetas(
  filters: RecetasFilters,
  cursor: RecetasCursor | null,
  pageSize = 24,
): Promise<{ recipes: Recipe[]; cursor: RecetasCursor | null; hasMore: boolean }> {
  const cacheKey = `${filters.categoria ?? ''}|${filters.intakeType ?? ''}|${cursor?.id ?? ''}|${pageSize}`;
  const cached = recetasPageCache.get(cacheKey);
  if (cached) return cached;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const constraints: any[] = [where('ownerId', 'in', OWNER_RECETARIO_TODOS)];
  if (filters.categoria) constraints.push(where('categoria', '==', filters.categoria));
  if (filters.intakeType != null) constraints.push(where('intakeTypes', 'array-contains', filters.intakeType));
  constraints.push(orderBy('name'));
  if (cursor) constraints.push(startAfter(cursor));
  constraints.push(limit(pageSize + 1));

  const snap = await getDocs(query(collection(db, 'recipes'), ...constraints));
  const hasMore = snap.docs.length > pageSize;
  const docs = hasMore ? snap.docs.slice(0, pageSize) : snap.docs;
  const result = {
    recipes: docs.map(d => ({ id: d.id, ...d.data() } as Recipe)),
    cursor: docs[docs.length - 1] ?? null,
    hasMore,
  };
  recetasPageCache.set(cacheKey, result);
  return result;
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
  try {
    const q = query(
      collection(db, 'recipes'),
      where('ownerId', 'in', OWNER_RECETARIO_TODOS),
      where('intakeTypes', 'array-contains', intakeType),
      orderBy('name'),
      limit(maxResults),
    );
    const snap = await getDocs(q);
    // orderBy('name') biases toward the start of the alphabet; shuffle client-side
    // so the generator/swap picker don't always surface the same few recipes.
    const recipes = shuffle(snap.docs.map(d => ({ id: d.id, ...d.data() } as Recipe)));
    recetasGeneratorCache.set(intakeType, recipes);
    return recipes;
  } catch (err) {
    console.warn(`queryRecetasForGenerator(intakeType=${intakeType}) failed:`, err);
    return [];
  }
}

