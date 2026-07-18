import { db, collection, doc, getDoc, setDoc, getDocs, addDoc, updateDoc, deleteDoc, query, where } from '../firebase';
import { MealItem, AthleteNutritionConfig, Diet, AthleteDietConfig, DietCompletionLog, WeeklyMenu, MenuCompletionLog, NutritionProgram, NutritionPhase } from '../types';
import { forceLocalOnly, setLocalBypassMode, stripUndefined, authReady, withAuthRetry } from './core';
import { SYSTEM_FOODS } from '../nutricion_seed_en_forma';

// ─── FOOD ITEMS ───────────────────────────────────────────────────────────────

const FOOD_ITEMS_LOCAL_KEY = 'enforma_food_items_v2';

function getLocalFoodItems(): MealItem[] {
  try {
    const raw = localStorage.getItem(FOOD_ITEMS_LOCAL_KEY);
    return raw ? (JSON.parse(raw) as MealItem[]) : [];
  } catch (e) {
    return [];
  }
}

function saveLocalFoodItems(items: MealItem[]) {
  try {
    localStorage.setItem(FOOD_ITEMS_LOCAL_KEY, JSON.stringify(items));
  } catch (e) {}
}

let foodItemsCache: MealItem[] | null = null;

export async function getFoodItems(): Promise<MealItem[]> {
  if (forceLocalOnly) return getLocalFoodItems();
  if (foodItemsCache) return foodItemsCache;
  try {
    const snap = await getDocs(collection(db, 'foodItems'));
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as MealItem));
    saveLocalFoodItems(items);
    foodItemsCache = items;
    return items;
  } catch (err) {
    console.warn('getFoodItems Firestore failed, using local:', err);
    setLocalBypassMode(true);
    return getLocalFoodItems();
  }
}

export async function createFoodItem(data: Omit<MealItem, 'id'>): Promise<MealItem> {
  foodItemsCache = null;
  if (forceLocalOnly) {
    const newItem: MealItem = { ...data, id: `local_food_${Date.now()}` };
    saveLocalFoodItems([...getLocalFoodItems(), newItem]);
    return newItem;
  }
  try {
    const ref = await addDoc(collection(db, 'foodItems'), stripUndefined(data));
    const newItem: MealItem = { ...data, id: ref.id };
    saveLocalFoodItems([...getLocalFoodItems(), newItem]);
    return newItem;
  } catch (err) {
    console.warn('createFoodItem Firestore failed, saving local:', err);
    setLocalBypassMode(true);
    const newItem: MealItem = { ...data, id: `local_food_${Date.now()}` };
    saveLocalFoodItems([...getLocalFoodItems(), newItem]);
    return newItem;
  }
}

export async function updateFoodItem(id: string, updates: Partial<MealItem>): Promise<void> {
  foodItemsCache = null;
  if (forceLocalOnly) {
    saveLocalFoodItems(getLocalFoodItems().map(f => (f.id === id ? { ...f, ...updates } : f)));
    return;
  }
  try {
    await updateDoc(doc(db, 'foodItems', id), stripUndefined(updates) as Record<string, unknown>);
    saveLocalFoodItems(getLocalFoodItems().map(f => (f.id === id ? { ...f, ...updates } : f)));
  } catch (err) {
    console.warn('updateFoodItem Firestore failed, updating local:', err);
    setLocalBypassMode(true);
    saveLocalFoodItems(getLocalFoodItems().map(f => (f.id === id ? { ...f, ...updates } : f)));
  }
}

export async function deleteFoodItem(id: string): Promise<void> {
  foodItemsCache = null;
  if (forceLocalOnly) {
    saveLocalFoodItems(getLocalFoodItems().filter(f => f.id !== id));
    return;
  }
  try {
    await deleteDoc(doc(db, 'foodItems', id));
    saveLocalFoodItems(getLocalFoodItems().filter(f => f.id !== id));
  } catch (err) {
    console.warn('deleteFoodItem Firestore failed, deleting local:', err);
    setLocalBypassMode(true);
    saveLocalFoodItems(getLocalFoodItems().filter(f => f.id !== id));
  }
}

export async function seedFoodItemsIfEmpty(): Promise<void> {
  foodItemsCache = null;
  const seeded: MealItem[] = SYSTEM_FOODS.map((f, i) => ({
    id: `system_food_${i + 1}`,
    mode: f.mode,
    category: f.category,
    label: f.label,
  }));

  if (forceLocalOnly) {
    if (getLocalFoodItems().length === 0) {
      saveLocalFoodItems(seeded);
    }
    return;
  }
  try {
    const snap = await getDocs(collection(db, 'foodItems'));
    if (snap.empty) {
      for (const item of seeded) {
        const { id, ...data } = item;
        await addDoc(collection(db, 'foodItems'), stripUndefined(data));
      }
    }
    const after = await getDocs(collection(db, 'foodItems'));
    saveLocalFoodItems(after.docs.map(d => ({ id: d.id, ...d.data() } as MealItem)));
  } catch (err) {
    console.warn('seedFoodItems Firestore failed, seeding local:', err);
    setLocalBypassMode(true);
    if (getLocalFoodItems().length === 0) {
      saveLocalFoodItems(seeded);
    }
  }
}

// ─── ATHLETE NUTRITION CONFIG ─────────────────────────────────────────────────

export async function getAthleteNutritionConfig(athleteEmail: string): Promise<AthleteNutritionConfig> {
  const defaultConfig: AthleteNutritionConfig = { athleteId: athleteEmail, enabledModes: ['OMNIVORO'] };
  const localKey = `enforma_nutri_config_${athleteEmail}`;
  // Stored docs can predate fields (or be flat-out `{}` from an old write) — merge
  // over the defaults and force athleteId so a later save never targets `undefined`.
  const normalize = (data: Partial<AthleteNutritionConfig>): AthleteNutritionConfig =>
    ({ ...defaultConfig, ...data, athleteId: athleteEmail });
  if (forceLocalOnly) {
    try {
      const raw = localStorage.getItem(localKey);
      return raw ? normalize(JSON.parse(raw)) : defaultConfig;
    } catch (e) { return defaultConfig; }
  }
  await authReady;
  try {
    return await withAuthRetry(async () => {
      const docRef = doc(db, 'athleteNutritionConfigs', athleteEmail);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = normalize(snap.data() as Partial<AthleteNutritionConfig>);
        localStorage.setItem(localKey, JSON.stringify(data));
        return data;
      }
      try {
        const raw = localStorage.getItem(localKey);
        if (raw) return normalize(JSON.parse(raw));
      } catch (_) {}
      return defaultConfig;
    });
  } catch (err) {
    console.warn('getAthleteNutritionConfig Firestore failed, using local:', err);
    // Do NOT call setLocalBypassMode(true) here: a rules failure on this collection
    // must not poison writes for unrelated collections (onboarding, workouts, etc.).
    try {
      const raw = localStorage.getItem(localKey);
      return raw ? normalize(JSON.parse(raw)) : defaultConfig;
    } catch (e) { return defaultConfig; }
  }
}

export async function saveAthleteNutritionConfig(config: AthleteNutritionConfig): Promise<void> {
  const localKey = `enforma_nutri_config_${config.athleteId}`;
  const data = { ...config };
  if (forceLocalOnly) {
    localStorage.setItem(localKey, JSON.stringify(data));
    return;
  }
  try {
    await setDoc(doc(db, 'athleteNutritionConfigs', config.athleteId), stripUndefined(data));
    localStorage.setItem(localKey, JSON.stringify(data));
  } catch (err) {
    console.warn('saveAthleteNutritionConfig Firestore failed, saving local:', err);
    setLocalBypassMode(true);
    localStorage.setItem(localKey, JSON.stringify(data));
  }
}

// ─── DIETS ────────────────────────────────────────────────────────────────────

const DIETS_LOCAL_KEY = 'enforma_diets_v1';

function getDietsFromLocal(): Diet[] {
  try {
    const raw = localStorage.getItem(DIETS_LOCAL_KEY);
    return raw ? (JSON.parse(raw) as Diet[]) : [];
  } catch { return []; }
}

function setDietsToLocal(diets: Diet[]): void {
  localStorage.setItem(DIETS_LOCAL_KEY, JSON.stringify(diets));
}

export async function getDietsForAthlete(athleteEmail: string): Promise<Diet[]> {
  if (forceLocalOnly) {
    return getDietsFromLocal().filter(d => d.athleteId === athleteEmail);
  }
  try {
    const q = query(collection(db, 'diets'), where('athleteId', '==', athleteEmail));
    const snap = await getDocs(q);
    const diets = snap.docs.map(d => ({ id: d.id, ...d.data() } as Diet));
    const others = getDietsFromLocal().filter(d => d.athleteId !== athleteEmail);
    setDietsToLocal([...others, ...diets]);
    return diets;
  } catch (err) {
    console.warn('getDietsForAthlete Firestore failed, using local:', err);
    setLocalBypassMode(true);
    return getDietsFromLocal().filter(d => d.athleteId === athleteEmail);
  }
}

export async function createDiet(data: Omit<Diet, 'id'>): Promise<Diet> {
  if (forceLocalOnly) {
    const diet: Diet = { id: `diet_${Date.now()}`, ...data };
    setDietsToLocal([...getDietsFromLocal(), diet]);
    return diet;
  }
  try {
    const ref = await addDoc(collection(db, 'diets'), stripUndefined(data));
    const diet: Diet = { id: ref.id, ...data };
    setDietsToLocal([...getDietsFromLocal(), diet]);
    return diet;
  } catch (err) {
    console.warn('createDiet Firestore failed, saving local:', err);
    setLocalBypassMode(true);
    const diet: Diet = { id: `diet_${Date.now()}`, ...data };
    setDietsToLocal([...getDietsFromLocal(), diet]);
    return diet;
  }
}

export async function updateDiet(id: string, updates: Partial<Diet>): Promise<void> {
  const all = getDietsFromLocal();
  const updated = all.map(d => d.id === id ? { ...d, ...updates } : d);
  if (forceLocalOnly) { setDietsToLocal(updated); return; }
  try {
    await updateDoc(doc(db, 'diets', id), stripUndefined(updates) as Record<string, unknown>);
    setDietsToLocal(updated);
  } catch (err) {
    console.warn('updateDiet Firestore failed, saving local:', err);
    setLocalBypassMode(true);
    setDietsToLocal(updated);
  }
}

export async function deleteDiet(id: string): Promise<void> {
  const filtered = getDietsFromLocal().filter(d => d.id !== id);
  if (forceLocalOnly) { setDietsToLocal(filtered); return; }
  try {
    await deleteDoc(doc(db, 'diets', id));
    setDietsToLocal(filtered);
  } catch (err) {
    console.warn('deleteDiet Firestore failed, deleting local:', err);
    setLocalBypassMode(true);
    setDietsToLocal(filtered);
  }
}

// ─── WEEKLY MENUS ─────────────────────────────────────────────────────────────
// Recipe-first weekly menu generated by the coach (see utils/menuEngine.ts).
// Draft until the coach publishes it; only the published one is athlete-visible
// (mirrors the coachReports draft/sent pattern).

const WEEKLY_MENUS_LOCAL_KEY = 'enforma_weekly_menus_v1';

function getWeeklyMenusFromLocal(): WeeklyMenu[] {
  try {
    const raw = localStorage.getItem(WEEKLY_MENUS_LOCAL_KEY);
    return raw ? (JSON.parse(raw) as WeeklyMenu[]) : [];
  } catch { return []; }
}

function setWeeklyMenusToLocal(menus: WeeklyMenu[]): void {
  localStorage.setItem(WEEKLY_MENUS_LOCAL_KEY, JSON.stringify(menus));
}

// Coach view: all menus (draft/published/archived) for a client. Coach-only —
// the rules let isCoach() read every status, but an athlete calling this would
// have its query rejected (their rule only allows status == 'published'), so
// athletes must use getPublishedMenu instead.
export async function getWeeklyMenusForAthlete(athleteEmail: string): Promise<WeeklyMenu[]> {
  if (forceLocalOnly) {
    return getWeeklyMenusFromLocal().filter(m => m.athleteId === athleteEmail);
  }
  try {
    const q = query(collection(db, 'weeklyMenus'), where('athleteId', '==', athleteEmail));
    const snap = await getDocs(q);
    const menus = snap.docs.map(d => ({ id: d.id, ...d.data() } as WeeklyMenu));
    const others = getWeeklyMenusFromLocal().filter(m => m.athleteId !== athleteEmail);
    setWeeklyMenusToLocal([...others, ...menus]);
    return menus;
  } catch (err) {
    console.warn('getWeeklyMenusForAthlete Firestore failed, using local:', err);
    setLocalBypassMode(true);
    return getWeeklyMenusFromLocal().filter(m => m.athleteId === athleteEmail);
  }
}

// Athlete view: only the currently published menu, if any. Must filter by status
// in the QUERY (not in memory) — the athlete's read rule requires status ==
// 'published', so a query that could surface a draft is rejected wholesale by
// Firestore, which would flip the whole app into offline/local mode.
export async function getPublishedMenu(athleteEmail: string): Promise<WeeklyMenu | null> {
  if (forceLocalOnly) {
    return getWeeklyMenusFromLocal().find(m => m.athleteId === athleteEmail && m.status === 'published') ?? null;
  }
  try {
    const q = query(collection(db, 'weeklyMenus'), where('athleteId', '==', athleteEmail), where('status', '==', 'published'));
    const snap = await getDocs(q);
    const menu = snap.docs.map(d => ({ id: d.id, ...d.data() } as WeeklyMenu))[0] ?? null;
    if (menu) setWeeklyMenusToLocal([...getWeeklyMenusFromLocal().filter(m => m.id !== menu.id), menu]);
    return menu;
  } catch (err) {
    console.warn('getPublishedMenu Firestore failed, using local:', err);
    setLocalBypassMode(true);
    return getWeeklyMenusFromLocal().find(m => m.athleteId === athleteEmail && m.status === 'published') ?? null;
  }
}

export async function createWeeklyMenu(data: Omit<WeeklyMenu, 'id'>): Promise<WeeklyMenu> {
  if (forceLocalOnly) {
    const menu: WeeklyMenu = { id: `menu_${Date.now()}`, ...data };
    setWeeklyMenusToLocal([...getWeeklyMenusFromLocal(), menu]);
    return menu;
  }
  try {
    const ref = await addDoc(collection(db, 'weeklyMenus'), stripUndefined(data));
    const menu: WeeklyMenu = { id: ref.id, ...data };
    setWeeklyMenusToLocal([...getWeeklyMenusFromLocal(), menu]);
    return menu;
  } catch (err) {
    console.warn('createWeeklyMenu Firestore failed, saving local:', err);
    setLocalBypassMode(true);
    const menu: WeeklyMenu = { id: `menu_${Date.now()}`, ...data };
    setWeeklyMenusToLocal([...getWeeklyMenusFromLocal(), menu]);
    return menu;
  }
}

export async function updateWeeklyMenu(id: string, updates: Partial<WeeklyMenu>): Promise<void> {
  const all = getWeeklyMenusFromLocal();
  const updated = all.map(m => m.id === id ? { ...m, ...updates } : m);
  if (forceLocalOnly) { setWeeklyMenusToLocal(updated); return; }
  try {
    await updateDoc(doc(db, 'weeklyMenus', id), stripUndefined(updates) as Record<string, unknown>);
    setWeeklyMenusToLocal(updated);
  } catch (err) {
    console.warn('updateWeeklyMenu Firestore failed, saving local:', err);
    setLocalBypassMode(true);
    setWeeklyMenusToLocal(updated);
  }
}

export async function deleteWeeklyMenu(id: string): Promise<void> {
  const filtered = getWeeklyMenusFromLocal().filter(m => m.id !== id);
  if (forceLocalOnly) { setWeeklyMenusToLocal(filtered); return; }
  try {
    await deleteDoc(doc(db, 'weeklyMenus', id));
    setWeeklyMenusToLocal(filtered);
  } catch (err) {
    console.warn('deleteWeeklyMenu Firestore failed, deleting local:', err);
    setLocalBypassMode(true);
    setWeeklyMenusToLocal(filtered);
  }
}

// Publishing swaps the athlete-visible menu: the previous published menu (if any)
// is archived rather than deleted, so its swapHistory stays available to the coach.
// Archived menus older than 4 weeks are pruned to keep the collection small.
export async function publishWeeklyMenu(menu: WeeklyMenu): Promise<void> {
  const all = await getWeeklyMenusForAthlete(menu.athleteId);
  const now = new Date();
  const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);

  for (const other of all) {
    if (other.id === menu.id) continue;
    if (other.status === 'published') {
      await updateWeeklyMenu(other.id, { status: 'archived' });
    } else if (other.status === 'archived' && new Date(other.createdAt) < fourWeeksAgo) {
      await deleteWeeklyMenu(other.id);
    }
  }

  await updateWeeklyMenu(menu.id, { status: 'published', publishedAt: now.toISOString() });
}

// ─── DIET COMPLETION LOGS (per-athlete-per-day, doc id = `${athleteId}_${date}`) ──

const LOCAL_DIET_COMPLETION_LOGS = 'enforma_diet_completion_logs_v1';

function getLocalDietCompletionLogs(): DietCompletionLog[] {
  try { return JSON.parse(localStorage.getItem(LOCAL_DIET_COMPLETION_LOGS) || '[]'); } catch { return []; }
}
function saveLocalDietCompletionLogs(list: DietCompletionLog[]): void {
  localStorage.setItem(LOCAL_DIET_COMPLETION_LOGS, JSON.stringify(list));
}

export async function getDietCompletionLog(athleteId: string, date: string): Promise<DietCompletionLog | null> {
  const docId = `${athleteId}_${date}`;
  if (forceLocalOnly) return getLocalDietCompletionLogs().find(l => l.id === docId) ?? null;
  try {
    const snap = await getDoc(doc(db, 'dietCompletionLogs', docId));
    if (!snap.exists()) return null;
    const log = { id: snap.id, ...snap.data() } as DietCompletionLog;
    saveLocalDietCompletionLogs([...getLocalDietCompletionLogs().filter(l => l.id !== docId), log]);
    return log;
  } catch (err) {
    console.warn('getDietCompletionLog Firestore failed, using local:', err);
    setLocalBypassMode(true);
    return getLocalDietCompletionLogs().find(l => l.id === docId) ?? null;
  }
}

// Bulk range read for the AI nutrition dashboard's adherence computation.
export async function getDietCompletionLogsForAthlete(athleteId: string): Promise<DietCompletionLog[]> {
  if (forceLocalOnly) {
    return getLocalDietCompletionLogs().filter(l => l.athleteId === athleteId).sort((a, b) => a.date.localeCompare(b.date));
  }
  try {
    const snap = await getDocs(query(collection(db, 'dietCompletionLogs'), where('athleteId', '==', athleteId)));
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as DietCompletionLog)).sort((a, b) => a.date.localeCompare(b.date));
    saveLocalDietCompletionLogs([...getLocalDietCompletionLogs().filter(l => l.athleteId !== athleteId), ...list]);
    return list;
  } catch (err) {
    console.warn('getDietCompletionLogsForAthlete Firestore failed, using local:', err);
    setLocalBypassMode(true);
    return getLocalDietCompletionLogs().filter(l => l.athleteId === athleteId).sort((a, b) => a.date.localeCompare(b.date));
  }
}

export async function saveDietCompletionLog(data: Omit<DietCompletionLog, 'id'>): Promise<DietCompletionLog> {
  const docId = `${data.athleteId}_${data.date}`;
  const log: DietCompletionLog = { ...data, id: docId };
  if (forceLocalOnly) {
    saveLocalDietCompletionLogs([...getLocalDietCompletionLogs().filter(l => l.id !== docId), log]);
    return log;
  }
  try {
    await setDoc(doc(db, 'dietCompletionLogs', docId), stripUndefined(data));
    saveLocalDietCompletionLogs([...getLocalDietCompletionLogs().filter(l => l.id !== docId), log]);
    return log;
  } catch (err) {
    console.warn('saveDietCompletionLog Firestore failed, saving local:', err);
    setLocalBypassMode(true);
    saveLocalDietCompletionLogs([...getLocalDietCompletionLogs().filter(l => l.id !== docId), log]);
    return log;
  }
}

// ─── MENU COMPLETION LOGS (per-athlete-per-day, doc id = `${athleteId}_${date}`) ──
// Separate from dietCompletionLogs so menu tick-offs never mix with the
// Intercambios tracker (see MenuCompletionLog docstring in types.ts).

const LOCAL_MENU_COMPLETION_LOGS = 'enforma_menu_completion_logs_v1';

function getLocalMenuCompletionLogs(): MenuCompletionLog[] {
  try { return JSON.parse(localStorage.getItem(LOCAL_MENU_COMPLETION_LOGS) || '[]'); } catch { return []; }
}
function saveLocalMenuCompletionLogs(list: MenuCompletionLog[]): void {
  localStorage.setItem(LOCAL_MENU_COMPLETION_LOGS, JSON.stringify(list));
}

export async function getMenuCompletionLog(athleteId: string, date: string): Promise<MenuCompletionLog | null> {
  const docId = `${athleteId}_${date}`;
  if (forceLocalOnly) return getLocalMenuCompletionLogs().find(l => l.id === docId) ?? null;
  try {
    const snap = await getDoc(doc(db, 'menuCompletionLogs', docId));
    if (!snap.exists()) return null;
    const log = { id: snap.id, ...snap.data() } as MenuCompletionLog;
    saveLocalMenuCompletionLogs([...getLocalMenuCompletionLogs().filter(l => l.id !== docId), log]);
    return log;
  } catch (err) {
    console.warn('getMenuCompletionLog Firestore failed, using local:', err);
    setLocalBypassMode(true);
    return getLocalMenuCompletionLogs().find(l => l.id === docId) ?? null;
  }
}

// Bulk range read for menu adherence.
export async function getMenuCompletionLogsForAthlete(athleteId: string): Promise<MenuCompletionLog[]> {
  if (forceLocalOnly) {
    return getLocalMenuCompletionLogs().filter(l => l.athleteId === athleteId).sort((a, b) => a.date.localeCompare(b.date));
  }
  try {
    const snap = await getDocs(query(collection(db, 'menuCompletionLogs'), where('athleteId', '==', athleteId)));
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as MenuCompletionLog)).sort((a, b) => a.date.localeCompare(b.date));
    saveLocalMenuCompletionLogs([...getLocalMenuCompletionLogs().filter(l => l.athleteId !== athleteId), ...list]);
    return list;
  } catch (err) {
    console.warn('getMenuCompletionLogsForAthlete Firestore failed, using local:', err);
    setLocalBypassMode(true);
    return getLocalMenuCompletionLogs().filter(l => l.athleteId === athleteId).sort((a, b) => a.date.localeCompare(b.date));
  }
}

export async function saveMenuCompletionLog(data: Omit<MenuCompletionLog, 'id'>): Promise<MenuCompletionLog> {
  const docId = `${data.athleteId}_${data.date}`;
  const log: MenuCompletionLog = { ...data, id: docId };
  if (forceLocalOnly) {
    saveLocalMenuCompletionLogs([...getLocalMenuCompletionLogs().filter(l => l.id !== docId), log]);
    return log;
  }
  try {
    await setDoc(doc(db, 'menuCompletionLogs', docId), stripUndefined(data));
    saveLocalMenuCompletionLogs([...getLocalMenuCompletionLogs().filter(l => l.id !== docId), log]);
    return log;
  } catch (err) {
    console.warn('saveMenuCompletionLog Firestore failed, saving local:', err);
    setLocalBypassMode(true);
    saveLocalMenuCompletionLogs([...getLocalMenuCompletionLogs().filter(l => l.id !== docId), log]);
    return log;
  }
}

// ─── ATHLETE DIET CONFIG ──────────────────────────────────────────────────────

export async function getAthleteDietConfig(athleteEmail: string): Promise<AthleteDietConfig> {
  const defaultCfg: AthleteDietConfig = { athleteId: athleteEmail, activeDietIds: [] };
  const localKey = `enforma_athlete_diet_config_${athleteEmail}`;
  if (forceLocalOnly) {
    try {
      const raw = localStorage.getItem(localKey);
      return raw ? JSON.parse(raw) : defaultCfg;
    } catch { return defaultCfg; }
  }
  try {
    const snap = await getDoc(doc(db, 'athleteDietConfigs', athleteEmail));
    if (snap.exists()) {
      const data = snap.data() as AthleteDietConfig;
      localStorage.setItem(localKey, JSON.stringify(data));
      return data;
    }
    try {
      const raw = localStorage.getItem(localKey);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return defaultCfg;
  } catch (err) {
    console.warn('getAthleteDietConfig Firestore failed, using local:', err);
    setLocalBypassMode(true);
    try {
      const raw = localStorage.getItem(localKey);
      return raw ? JSON.parse(raw) : defaultCfg;
    } catch { return defaultCfg; }
  }
}

export async function saveAthleteDietConfig(config: AthleteDietConfig): Promise<void> {
  const localKey = `enforma_athlete_diet_config_${config.athleteId}`;
  if (forceLocalOnly) { localStorage.setItem(localKey, JSON.stringify(config)); return; }
  try {
    await setDoc(doc(db, 'athleteDietConfigs', config.athleteId), stripUndefined(config));
    localStorage.setItem(localKey, JSON.stringify(config));
  } catch (err) {
    console.warn('saveAthleteDietConfig Firestore failed, saving local:', err);
    setLocalBypassMode(true);
    localStorage.setItem(localKey, JSON.stringify(config));
  }
}

// ─── NUTRITION PROGRAMS ───────────────────────────────────────────────────────

const LOCAL_NUTPROG = 'enforma_nutrition_programs_v1';

function getLocalNutProgs(): NutritionProgram[] {
  try { return JSON.parse(localStorage.getItem(LOCAL_NUTPROG) || '[]'); } catch { return []; }
}
function saveLocalNutProgs(list: NutritionProgram[]): void {
  localStorage.setItem(LOCAL_NUTPROG, JSON.stringify(list));
}

export async function getNutritionProgram(athleteEmail: string): Promise<NutritionProgram | null> {
  if (forceLocalOnly) {
    return getLocalNutProgs().find(p => p.athleteId === athleteEmail) ?? null;
  }
  try {
    const snap = await getDoc(doc(db, 'nutritionPrograms', athleteEmail));
    if (!snap.exists()) return null;
    return { athleteId: athleteEmail, ...snap.data() } as NutritionProgram;
  } catch (err) {
    console.warn('getNutritionProgram Firestore failed:', err);
    setLocalBypassMode(true);
    return getLocalNutProgs().find(p => p.athleteId === athleteEmail) ?? null;
  }
}

export async function saveNutritionProgram(program: NutritionProgram): Promise<void> {
  const { athleteId, ...rest } = program;
  const data = stripUndefined(rest);
  if (forceLocalOnly) {
    const list = getLocalNutProgs().filter(p => p.athleteId !== athleteId);
    saveLocalNutProgs([...list, program]);
    return;
  }
  try {
    await setDoc(doc(db, 'nutritionPrograms', athleteId), data);
    const list = getLocalNutProgs().filter(p => p.athleteId !== athleteId);
    saveLocalNutProgs([...list, program]);
  } catch (err) {
    console.warn('saveNutritionProgram Firestore failed:', err);
    setLocalBypassMode(true);
    const list = getLocalNutProgs().filter(p => p.athleteId !== athleteId);
    saveLocalNutProgs([...list, program]);
  }
}

// Escritura parcial para el atleta: solo marca la fase vista, sin reescribir el
// programa entero desde su snapshot (que podía revertir ediciones concurrentes
// del coach en la periodización — last-writer-wins sobre el doc completo).
export async function markNutritionPhaseSeen(athleteEmail: string, phaseId: string): Promise<void> {
  const patchLocal = () => {
    const list = getLocalNutProgs();
    const prog = list.find(p => p.athleteId === athleteEmail);
    if (prog) saveLocalNutProgs([...list.filter(p => p.athleteId !== athleteEmail), { ...prog, lastSeenPhaseId: phaseId }]);
  };
  if (forceLocalOnly) { patchLocal(); return; }
  try {
    await setDoc(doc(db, 'nutritionPrograms', athleteEmail), { lastSeenPhaseId: phaseId }, { merge: true });
    patchLocal();
  } catch (err) {
    // Solo afecta al banner de "nueva fase" — si falla, volverá a mostrarse.
    console.warn('markNutritionPhaseSeen Firestore failed:', err);
    patchLocal();
  }
}

export async function deleteNutritionProgram(athleteEmail: string): Promise<void> {
  if (forceLocalOnly) {
    saveLocalNutProgs(getLocalNutProgs().filter(p => p.athleteId !== athleteEmail));
    return;
  }
  try {
    await deleteDoc(doc(db, 'nutritionPrograms', athleteEmail));
    saveLocalNutProgs(getLocalNutProgs().filter(p => p.athleteId !== athleteEmail));
  } catch (err) {
    console.warn('deleteNutritionProgram Firestore failed:', err);
    setLocalBypassMode(true);
    saveLocalNutProgs(getLocalNutProgs().filter(p => p.athleteId !== athleteEmail));
  }
}


export function computeActivePhase(program: NutritionProgram, today: string): NutritionPhase | null {
  if (!program.phases.length || !program.startDate) return null;
  let cursor = new Date(program.startDate + 'T00:00:00');
  for (const phase of program.phases) {
    const phaseEnd = new Date(cursor);
    phaseEnd.setDate(phaseEnd.getDate() + phase.weeks * 7);
    const todayDate = new Date(today + 'T00:00:00');
    if (todayDate >= cursor && todayDate < phaseEnd) return phase;
    cursor = phaseEnd;
  }
  return null;
}

export function computePhaseStartDate(program: NutritionProgram, phaseIdx: number): string {
  const cursor = new Date(program.startDate + 'T00:00:00');
  for (let i = 0; i < phaseIdx; i++) {
    cursor.setDate(cursor.getDate() + program.phases[i].weeks * 7);
  }
  return cursor.toISOString().split('T')[0];
}

