import { db, collection, doc, getDoc, setDoc, getDocs, addDoc, updateDoc, deleteDoc, query, where, orderBy, limit, startAfter } from '../firebase';
import { QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { Recipe, RecipeFavorites } from '../types';
import { forceLocalOnly, setLocalBypassMode, stripUndefined } from './core';

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

export async function getRecipes(): Promise<Recipe[]> {
  if (forceLocalOnly) return getLocalRecipes();
  try {
    // Exclude Indya recipes (8 850+) to avoid downloading the full collection
    const q = query(collection(db, 'recipes'), where('ownerId', 'not-in', ['indya']));
    const snap = await getDocs(q);
    const recipes = snap.docs.map(d => ({ id: d.id, ...d.data() } as Recipe));
    setLocalRecipes(recipes);
    return recipes;
  } catch (err) {
    console.warn('getRecipes Firestore failed, using local:', err);
    setLocalBypassMode(true);
    return getLocalRecipes();
  }
}

// Single-recipe lookup by id — used by the weekly-menu viewer, which only
// stores a denormalized name/image on each MenuMeal and needs the full
// ingredients/steps on demand when the athlete opens a recipe's detail.
export async function getRecipeById(id: string): Promise<Recipe | null> {
  const local = getLocalRecipes().find(r => r.id === id);
  // Only use the local cache outright when it actually has this recipe. Indya
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

export type IndyaRecipeCursor = QueryDocumentSnapshot<DocumentData>;

export interface IndyaRecipeFilters {
  categoria?: string;
  intakeType?: number;
}

const indyaPageCache = new Map<string, { recipes: Recipe[]; cursor: IndyaRecipeCursor | null; hasMore: boolean }>();

export async function queryIndyaRecipes(
  filters: IndyaRecipeFilters,
  cursor: IndyaRecipeCursor | null,
  pageSize = 24,
): Promise<{ recipes: Recipe[]; cursor: IndyaRecipeCursor | null; hasMore: boolean }> {
  const cacheKey = `${filters.categoria ?? ''}|${filters.intakeType ?? ''}|${cursor?.id ?? ''}|${pageSize}`;
  const cached = indyaPageCache.get(cacheKey);
  if (cached) return cached;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const constraints: any[] = [where('ownerId', '==', 'indya')];
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
  indyaPageCache.set(cacheKey, result);
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
    setLocalBypassMode(true);
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
    setLocalBypassMode(true);
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
    setLocalBypassMode(true);
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
    setLocalBypassMode(true);
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
    setLocalBypassMode(true);
    localStorage.setItem(localKey, JSON.stringify(favs));
  }
}

