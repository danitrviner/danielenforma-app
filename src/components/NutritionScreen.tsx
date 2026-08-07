import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UserProfile, Diet, DietMeal, DietItem, FoodCategory, DietMode, MealItem, Recipe, RecipeFavorites, WeekDay } from '../types';
import { getDietsForAthlete, getAthleteDietConfig, saveAthleteDietConfig, createDiet, updateDiet, getFoodItems, seedFoodItemsIfEmpty, getAthleteNutritionConfig, getRecipes, getRecipeFavorites, getNutritionProgram, markNutritionPhaseSeen, computeActivePhase, createNotificationDeduped, getDietCompletionLog, saveDietCompletionLog, createRecipe } from '../dbService';
import { DietNumerosView } from './DietMealsView';
import { CATS, BUDGET_CATS, CAT_LABEL, CAT_COLOR, CAT_BG, MODE_LABEL, round2, fmtQty, itemWeightLabel, addToPlaced, recipeToDietItems, isDietPending } from '../utils/exchangeHelpers';
import { findSimilarRecipes } from '../utils/recipeMatch';
import { exchangeToKcal, GRAMS_PER_EXCHANGE } from '../utils/nutritionConstants';
import { useToast } from '../hooks/useToast';
import Coachmark from './Coachmark';
import { haptics } from '../services/haptics';
import { Skeleton } from './ui';
import { EmptyState, Sheet, Icon, Button, ProgressBar, RingSeal, Stepper } from './ui';

const COACH_EMAIL = 'danitrviner@gmail.com';
const makeId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;

function blankDiet(athleteId: string): Diet {
  return {
    id: `draft_${makeId()}`,
    athleteId,
    name: 'Mi menú',
    budget: { HC: 0, PROT: 0, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0 },
    meals: [{ id: makeId(), name: 'Comida 1', items: [] }],
    selfManaged: true,
  };
}

function dietSnapshot(dt: Pick<Diet, 'name' | 'budget' | 'meals'>): string {
  return JSON.stringify({ name: dt.name, budget: dt.budget, meals: dt.meals });
}

// ── Weekly schedule constants ──────────────────────────────────────────────────

const JS_TO_WD: Record<number, WeekDay> = { 0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat' };
const TODAY_WD: WeekDay = JS_TO_WD[new Date().getDay()];
const TODAY_DATE: string = new Date().toISOString().split('T')[0];
const WD_ORDER: WeekDay[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WD_SHORT: Record<WeekDay, string> = { mon: 'L', tue: 'M', wed: 'X', thu: 'J', fri: 'V', sat: 'S', sun: 'D' };
const WD_FULL: Record<WeekDay, string> = { mon: 'lunes', tue: 'martes', wed: 'miércoles', thu: 'jueves', fri: 'viernes', sat: 'sábado', sun: 'domingo' };

// ── Helpers ────────────────────────────────────────────────────────────────────

function mealLabel(name: string, n: number): string {
  const stripped = name.replace(/^Comida\s*\d+\s*/i, '').trim();
  return stripped || `Comida ${n}`;
}

// Etiquetas del tracker (panel 01): el handoff usa el nombre completo en mono
// para las tres barras de presupuesto, distinto del CAT_LABEL compartido
// ("Proteína") que usan el resto de pantallas de intercambios.
const BAR_LABEL: Record<'HC' | 'PROT' | 'GRASA', string> = { HC: 'HIDRATOS', PROT: 'PROTEÍNA', GRASA: 'GRASA' };
const CHIP_LABEL: Record<'HC' | 'PROT' | 'GRASA', string> = { HC: 'HC', PROT: 'PR', GRASA: 'GR' };

// ── Types ──────────────────────────────────────────────────────────────────────

type ItemState = { foodLabel: string; done: boolean };
// key = `${mealId}_${itemIdx}`

interface Props {
  profile: UserProfile;
  pendingRecipe?: Recipe | null;
  onConsumedPendingRecipe?: () => void;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function NutritionScreen({ profile, pendingRecipe, onConsumedPendingRecipe }: Props) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  // ── Queries: Phase 1 (diet/config) ──────────────────────────────────────────
  const dietsKey = ['dietsForAthlete', profile.email] as const;
  const { data: allDietsList = [], isPending: loadingDiets } = useQuery({
    queryKey: dietsKey,
    queryFn: () => getDietsForAthlete(profile.email),
  });
  const setAllDietsList = (updater: React.SetStateAction<Diet[]>) =>
    queryClient.setQueryData<Diet[]>(dietsKey, prev =>
      typeof updater === 'function' ? (updater as (p: Diet[]) => Diet[])(prev ?? []) : updater);

  const athleteDietConfigKey = ['athleteDietConfig', profile.email] as const;
  const { data: dietConfigRaw = null, isPending: loadingDietConfig } = useQuery({
    queryKey: athleteDietConfigKey,
    queryFn: () => getAthleteDietConfig(profile.email).catch(() => null),
  });

  const { data: nutConfig = null, isPending: loadingNutConfig } = useQuery({
    queryKey: ['athleteNutritionConfig', profile.email],
    queryFn: () => getAthleteNutritionConfig(profile.email).catch(() => null),
  });

  const { data: program = null, isPending: loadingProgram } = useQuery({
    queryKey: ['nutritionProgram', profile.email],
    queryFn: () => getNutritionProgram(profile.email).catch(() => null),
  });

  const loadingPhase1 = loadingDiets || loadingDietConfig || loadingNutConfig || loadingProgram;

  // ── Queries: Phase 2 (food library + recipes) ───────────────────────────────
  // Deliberately gated on Phase 1 (enabled: !loadingPhase1) — same reason the
  // original sequential load kept them apart: seedFoodItemsIfEmpty() flips a
  // global "local bypass" flag on Firestore failure, which would poison ANY
  // dbService call still in flight. Phase 1's diet/config reads must be fully
  // secured first.
  const { data: foodItems = [], isPending: loadingFoodItems } = useQuery({
    queryKey: ['foodItems'],
    queryFn: () => seedFoodItemsIfEmpty().catch(() => {}).then(getFoodItems),
    enabled: !loadingPhase1,
  });
  const { data: recipes = [], isPending: loadingRecipesQ } = useQuery({
    queryKey: ['recipes'],
    queryFn: () => getRecipes().catch(() => [] as Recipe[]),
    enabled: !loadingPhase1,
  });
  const setRecipes = (updater: React.SetStateAction<Recipe[]>) =>
    queryClient.setQueryData<Recipe[]>(['recipes'], prev =>
      typeof updater === 'function' ? (updater as (p: Recipe[]) => Recipe[])(prev ?? []) : updater);

  const { data: recipeFavorites = { athleteId: profile.email, recipeIds: [] }, isPending: loadingFavs } = useQuery({
    queryKey: ['recipeFavorites', profile.email],
    queryFn: () => getRecipeFavorites(profile.email).catch(() => ({ athleteId: profile.email, recipeIds: [] } as RecipeFavorites)),
    enabled: !loadingPhase1,
  });

  const loading = loadingPhase1 || loadingFoodItems || loadingRecipesQ || loadingFavs;

  // ── Local editor/draft state — seeded once from the queries above, then
  // mutated locally as the athlete edits (this is a live editor, not a
  // read-only view, so it can't just be the query data directly) ───────────
  const [selectedDiet, setSelectedDiet] = useState<Diet | null>(null);
  const [savedDietSnapshot, setSavedDietSnapshot] = useState('');
  const [saveChoiceOpen, setSaveChoiceOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [flashMsg, setFlashMsg] = useState('');

  // Per-item state (ephemeral, day-only)
  const [itemStates, setItemStates] = useState<Record<string, ItemState>>({});

  const [enabledModes, setEnabledModes] = useState<DietMode[]>(['OMNIVORO']);
  const [activeDietMode, setActiveDietMode] = useState<DietMode>('OMNIVORO');

  // Food picker — itemIdx null means "add a new item", a number means "swap that item"
  const [pickerItem, setPickerItem] = useState<{ mealId: string; itemIdx: number | null; category: FoodCategory } | null>(null);
  const [pickerCategory, setPickerCategory] = useState<FoodCategory>('HC');
  const [searchTerm, setSearchTerm] = useState('');

  // Recipe picker
  const [recipePickerMealId, setRecipePickerMealId] = useState<string | null>(null);
  const [recipeSearch, setRecipeSearch]             = useState('');
  const [recipeCatFilter, setRecipeCatFilter]       = useState<string>('all');
  // Tracks how many items each meal had originally (before any recipe was applied)
  const [origItemCounts, setOrigItemCounts]         = useState<Record<string, number>>({});

  // Recipe swap ("Cambiar comida")
  const [swapContext, setSwapContext] = useState<{ mealId: string; recipeId: string } | null>(null);

  // "Guardar como receta" — turns a meal built here into a reusable Recipe,
  // which then feeds both the manual recipe picker and the weekly-menu generator.
  const [savingMealAsRecipeId, setSavingMealAsRecipeId] = useState<string | null>(null);
  const [recipeNameDraft, setRecipeNameDraft] = useState('');
  const [savingRecipe, setSavingRecipe] = useState(false);

  // "Añadir a Intercambios" desde Recetas — primero elegir a qué dieta, luego (si
  // tiene varias comidas) a cuál comida
  const [chooseDietForRecipe, setChooseDietForRecipe] = useState<Recipe | null>(null);
  const [chooseMealForRecipe, setChooseMealForRecipe] = useState<Recipe | null>(null);

  // Weekly schedule
  const [weeklySchedule, setWeeklySchedule] = useState<Partial<Record<WeekDay, string | null>>>({});
  const [viewDay, setViewDay]               = useState<WeekDay>(TODAY_WD);

  // Nutrition periodization
  const [phaseBanner, setPhaseBanner] = useState<string | null>(null);

  // Hoja de ajuste (F3.8, panel 02) — ajustar los intercambios de una ingesta
  // por macro, sin elegir alimentos concretos.
  const [adjustMealId, setAdjustMealId] = useState<string | null>(null);
  const [adjustDraft, setAdjustDraft] = useState<{ HC: number; PROT: number; GRASA: number }>({ HC: 0, PROT: 0, GRASA: 0 });

  function flash(msg: string) {
    setFlashMsg(msg);
    setTimeout(() => setFlashMsg(''), 3000);
  }

  // ── One-time init once Phase 1 has loaded ───────────────────────────────────
  // Applies the active nutrition-program phase (writes + notifications), then
  // picks the diet to show by default and seeds the local editor state from
  // it. Runs once per athlete when Phase 1 settles, not on every background
  // refetch — same ref-guard pattern as StepsWidget/AthleteRoadmapScreen.
  const initFor = useRef<string | null>(null);
  useEffect(() => {
    if (loadingPhase1 || initFor.current === profile.email) return;
    initFor.current = profile.email;

    (async () => {
      if (nutConfig && nutConfig.enabledModes?.length > 0) {
        setEnabledModes(nutConfig.enabledModes);
        setActiveDietMode(nutConfig.enabledModes[0]);
      }

      // Apply nutrition program phase if active
      let dietConfig = dietConfigRaw;
      if (program && program.phases.length > 0) {
        const todayStr = new Date().toISOString().split('T')[0];
        const activePhase = computeActivePhase(program, todayStr);
        if (activePhase && activePhase.dietId) {
          const currentActive = new Set(dietConfig?.activeDietIds ?? []);
          if (!currentActive.has(activePhase.dietId) || currentActive.size !== 1) {
            const newConfig = {
              ...(dietConfig ?? { athleteId: profile.email }),
              activeDietIds: [activePhase.dietId],
            };
            await saveAthleteDietConfig(newConfig).catch(() => {});
            dietConfig = newConfig;
            queryClient.setQueryData(athleteDietConfigKey, newConfig);
          }
          if (program.lastSeenPhaseId !== activePhase.id) {
            setPhaseBanner(`Tu plan de nutrición cambió a: ${activePhase.name}`);
            // Merge parcial: reescribir el programa entero desde este snapshot
            // podía pisar ediciones concurrentes del coach en la periodización.
            await markNutritionPhaseSeen(profile.email, activePhase.id).catch(() => {});
            const phaseKey = `notif_np_${profile.email}_${activePhase.id}`;
            const phaseBody = `Plan de nutrición cambió a: ${activePhase.name}`;
            createNotificationDeduped(`${phaseKey}_athlete`, {
              recipientEmail: profile.email,
              type: 'nutrition_phase_change',
              title: 'Plan de nutrición actualizado',
              body: phaseBody,
              link: 'nutrition',
              createdAt: new Date().toISOString(),
              read: false,
            }).catch(console.error);
            createNotificationDeduped(`${phaseKey}_coach`, {
              recipientEmail: COACH_EMAIL,
              type: 'nutrition_phase_change',
              title: `Fase de nutrición cambiada (${profile.displayName})`,
              body: `${profile.displayName}: ${phaseBody}`,
              link: 'clients',
              createdAt: new Date().toISOString(),
              read: false,
            }).catch(console.error);
          }
        }
      }

      const activeIds = new Set(dietConfig?.activeDietIds ?? []);
      const active = allDietsList.filter(d => activeIds.has(d.id));
      const schedule = dietConfig?.weeklySchedule ?? {};
      setWeeklySchedule(schedule);

      const rememberedId = localStorage.getItem(`enforma_intercambios_diet_${profile.email}`);
      const todayId = schedule[TODAY_WD] ?? null;
      const initDiet: Diet | null =
        (todayId && allDietsList.find(d => d.id === todayId)) ||
        (rememberedId && allDietsList.find(d => d.id === rememberedId)) ||
        (active.length >= 1 ? active[0] : null) ||
        (allDietsList.length >= 1 ? allDietsList[0] : null);
      if (initDiet) {
        setSelectedDiet(initDiet);
        setSavedDietSnapshot(dietSnapshot(initDiet));
        const counts: Record<string, number> = {};
        initDiet.meals.forEach(m => { counts[m.id] = m.items.length; });
        setOrigItemCounts(counts);
      }
    })().catch(err => console.error('NutritionScreen init error:', err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingPhase1, profile.email]);

  // ── Init item states when diet changes ──────────────────────────────────────
  // Rebuilds the (done:false) shape synchronously, then merges in today's
  // persisted completion log so consumido/restante survives reloads.

  useEffect(() => {
    if (!selectedDiet) { setItemStates({}); return; }
    const initial: Record<string, ItemState> = {};
    for (const meal of selectedDiet.meals) {
      meal.items.forEach((item, idx) => {
        initial[`${meal.id}_${idx}`] = { foodLabel: item.foodLabel, done: false };
      });
    }
    setItemStates(initial);

    let cancelled = false;
    const dietId = selectedDiet.id;
    getDietCompletionLog(profile.email, TODAY_DATE).then(log => {
      if (cancelled || !log || log.dietId !== dietId) return;
      const doneSet = new Set(log.doneItemIds);
      setItemStates(prev => {
        const next = { ...prev };
        doneSet.forEach(key => {
          if (next[key]) next[key] = { ...next[key], done: true };
        });
        return next;
      });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [selectedDiet?.id, profile.email]);

  // ── Derived ──────────────────────────────────────────────────────────────────

  const { doneByCat, mealDoneByCat, totalItems, doneItems } = useMemo(() => {
    const doneByCat: Record<FoodCategory, number> = { HC: 0, PROT: 0, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0 };
    const mealDoneByCat: Record<string, Record<FoodCategory, number>> = {};
    let total = 0;
    let done = 0;
    if (selectedDiet) {
      for (const meal of selectedDiet.meals) {
        const mealBycat: Record<FoodCategory, number> = { HC: 0, PROT: 0, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0 };
        meal.items.forEach((item, idx) => {
          total++;
          const st = itemStates[`${meal.id}_${idx}`];
          if (st?.done) {
            done++;
            addToPlaced(doneByCat, item.category, item.quantity);
            addToPlaced(mealBycat,  item.category, item.quantity);
          }
        });
        mealDoneByCat[meal.id] = mealBycat;
      }
    }
    return { doneByCat, mealDoneByCat, totalItems: total, doneItems: done };
  }, [selectedDiet, itemStates]);

  // Composición de cada ingesta (todos sus alimentos, estén o no marcados) —
  // los chips del tracker ("3 HC · 2 PR · 1 GR") describen la comida, no lo
  // que ya se ha registrado; distinto de mealDoneByCat.
  const mealPlacedByCat = useMemo(() => {
    const map: Record<string, Record<FoodCategory, number>> = {};
    for (const meal of selectedDiet?.meals ?? []) {
      const bycat: Record<FoodCategory, number> = { HC: 0, PROT: 0, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0 };
      for (const item of meal.items) addToPlaced(bycat, item.category, item.quantity);
      map[meal.id] = bycat;
    }
    return map;
  }, [selectedDiet]);

  // "TE QUEDAN" del tracker — suma de las tres categorías de presupuesto,
  // igual que el handoff (nunca desglosa MIX_HC/MIX_GRASA en la cifra grande).
  const leftByCat = {
    HC: (selectedDiet?.budget.HC ?? 0) - doneByCat.HC,
    PROT: (selectedDiet?.budget.PROT ?? 0) - doneByCat.PROT,
    GRASA: (selectedDiet?.budget.GRASA ?? 0) - doneByCat.GRASA,
  };
  const totalBudget = BUDGET_CATS.reduce((s, c) => s + (selectedDiet?.budget[c] ?? 0), 0);
  const totalEaten = BUDGET_CATS.reduce((s, c) => s + doneByCat[c], 0);
  const leftExch = round2(totalBudget - totalEaten);
  const leftKcal = Math.round(exchangeToKcal(leftByCat)); // puede ser negativo si el día se pasa
  const dayClosed = totalItems > 0 && doneItems === totalItems;
  const mealsDoneCount = selectedDiet?.meals.filter(m => m.items.length > 0 && m.items.every((_, idx) => itemStates[`${m.id}_${idx}`]?.done)).length ?? 0;

  // Distinct coach diets scheduled across the week (the "día A/B/C" concept) that
  // still don't have enough food items placed to cover the budget the coach set.
  const pendingScheduledDiets = useMemo(() => {
    const scheduledIds = new Set(
      WD_ORDER.map(d => weeklySchedule[d]).filter((id): id is string => typeof id === 'string'),
    );
    return allDietsList.filter(d => scheduledIds.has(d.id) && !d.selfManaged && isDietPending(d));
  }, [weeklySchedule, allDietsList]);

  // While buscando, ignora la pestaña de categoría activa y busca en todas — así
  // el atleta no tiene que salir y volver a entrar cambiando de categoría para
  // encontrar un alimento que no sabía en qué grupo estaba.
  const isSearchingFoods = searchTerm.trim().length > 0;
  const filteredFoods = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return foodItems.filter(f =>
      f.mode === activeDietMode &&
      (term ? f.label.toLowerCase().includes(term) : f.category === pickerCategory)
    );
  }, [foodItems, activeDietMode, pickerCategory, searchTerm]);

  const availableRecipeCats = useMemo(() => {
    const s = new Set<string>();
    recipes.forEach(r => r.categories.forEach(c => s.add(c)));
    return Array.from(s).sort();
  }, [recipes]);

  const sortedPickerRecipes = useMemo(() => {
    const withIngredients = recipes.filter(r =>
      r.ingredients.some(ing => enabledModes.includes(ing.mode))
    );
    const filtered = withIngredients.filter(r => {
      const matchCat = recipeCatFilter === 'all' || r.categories.includes(recipeCatFilter);
      const matchSearch = !recipeSearch || r.name.toLowerCase().includes(recipeSearch.toLowerCase());
      return matchCat && matchSearch;
    });
    return filtered.sort((a, b) => {
      const aFav = recipeFavorites.recipeIds.includes(a.id);
      const bFav = recipeFavorites.recipeIds.includes(b.id);
      if (aFav !== bFav) return aFav ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [recipes, enabledModes, recipeCatFilter, recipeSearch, recipeFavorites]);

  const swapSourceRecipe = useMemo(() =>
    swapContext ? recipes.find(r => r.id === swapContext.recipeId) ?? null : null,
    [swapContext, recipes]
  );

  const swapCandidates = useMemo(() => {
    if (!swapSourceRecipe) return [];
    return findSimilarRecipes(swapSourceRecipe, recipes.filter(r => r.id !== swapSourceRecipe.id));
  }, [swapSourceRecipe, recipes]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const isDirty = selectedDiet ? dietSnapshot(selectedDiet) !== savedDietSnapshot : false;
  const isPersisted = selectedDiet ? allDietsList.some(d => d.id === selectedDiet.id) : true;

  const handleSelectDiet = (dt: Diet, opts?: { skipDirtyCheck?: boolean }) => {
    if (!opts?.skipDirtyCheck && isDirty && !window.confirm('Tienes cambios sin guardar en este menú. ¿Cambiar de dieta y descartarlos?')) {
      return;
    }
    // Build itemStates for the new diet immediately in the same event handler so
    // React batches both updates into one render. Relying only on a useEffect meant
    // the content rendered once with the new selectedDiet but stale itemStates.
    const initial: Record<string, ItemState> = {};
    const counts: Record<string, number> = {};
    for (const meal of dt.meals) {
      counts[meal.id] = meal.items.length;
      meal.items.forEach((item, idx) => {
        initial[`${meal.id}_${idx}`] = { foodLabel: item.foodLabel, done: false };
      });
    }
    setItemStates(initial);
    setOrigItemCounts(counts);
    setSelectedDiet(dt);
    setSavedDietSnapshot(dietSnapshot(dt));
    localStorage.setItem(`enforma_intercambios_diet_${profile.email}`, dt.id);
  };

  const handleStartBlank = () => {
    handleSelectDiet(blankDiet(profile.email));
  };

  const handleToggleDone = (mealId: string, itemIdx: number) => {
    const key = `${mealId}_${itemIdx}`;
    setItemStates(prev => {
      const cur = prev[key];
      if (!cur) return prev;
      const next = { ...prev, [key]: { ...cur, done: !cur.done } };
      if (selectedDiet) {
        const doneItemIds = (Object.entries(next) as [string, ItemState][]).filter(([, v]) => v.done).map(([k]) => k);
        saveDietCompletionLog({ athleteId: profile.email, date: TODAY_DATE, dietId: selectedDiet.id, doneItemIds }).catch(() => {});
      }
      return next;
    });
  };

  // Registrar/desregistrar una ingesta entera de un toque (handoff, panel 01):
  // marca (o desmarca) todos sus alimentos a la vez en vez de uno a uno.
  const handleToggleMealDone = (meal: DietMeal) => {
    const allDone = meal.items.length > 0 && meal.items.every((_, idx) => itemStates[`${meal.id}_${idx}`]?.done);
    const nextDone = !allDone;
    void haptics.light();
    setItemStates(prev => {
      const next = { ...prev };
      meal.items.forEach((_, idx) => {
        const key = `${meal.id}_${idx}`;
        const cur = next[key];
        if (cur) next[key] = { ...cur, done: nextDone };
      });
      if (selectedDiet) {
        const doneItemIds = (Object.entries(next) as [string, ItemState][]).filter(([, v]) => v.done).map(([k]) => k);
        saveDietCompletionLog({ athleteId: profile.email, date: TODAY_DATE, dietId: selectedDiet.id, doneItemIds }).catch(() => {});
      }
      return next;
    });
  };

  // Hoja de ajuste (panel 02): steppers por macro, seedeados con la
  // composición actual de la ingesta; confirmar sustituye sus alimentos por
  // intercambios genéricos en esas cantidades y la registra.
  const handleOpenAdjust = (meal: DietMeal) => {
    const bycat = mealPlacedByCat[meal.id] ?? { HC: 0, PROT: 0, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0 };
    setAdjustDraft({ HC: bycat.HC, PROT: bycat.PROT, GRASA: bycat.GRASA });
    setAdjustMealId(meal.id);
  };

  const handleConfirmAdjust = () => {
    if (!adjustMealId || !selectedDiet) return;
    const mealId = adjustMealId;
    const meal = selectedDiet.meals.find(m => m.id === mealId);
    if (!meal) { setAdjustMealId(null); return; }

    const newItems: DietItem[] = BUDGET_CATS
      .filter(cat => adjustDraft[cat] > 0)
      .map(cat => ({ category: cat, foodLabel: `${CAT_LABEL[cat]} (ajustado)`, quantity: adjustDraft[cat] }));

    setSelectedDiet(prev => prev ? { ...prev, meals: prev.meals.map(m => m.id !== mealId ? m : { ...m, items: newItems }) } : prev);

    setItemStates(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => { if (k.startsWith(`${mealId}_`)) delete next[k]; });
      newItems.forEach((item, i) => { next[`${mealId}_${i}`] = { foodLabel: item.foodLabel, done: true }; });
      const doneItemIds = (Object.entries(next) as [string, ItemState][]).filter(([, v]) => v.done).map(([k]) => k);
      saveDietCompletionLog({ athleteId: profile.email, date: TODAY_DATE, dietId: selectedDiet.id, doneItemIds }).catch(() => {});
      return next;
    });

    void haptics.medium();
    setAdjustMealId(null);
  };

  const handleOpenPicker = (mealId: string, itemIdx: number, category: FoodCategory) => {
    setPickerItem({ mealId, itemIdx, category });
    setPickerCategory(category);
    setSearchTerm('');
  };

  const handleOpenAddPicker = (mealId: string) => {
    setPickerItem({ mealId, itemIdx: null, category: 'HC' });
    setPickerCategory('HC');
    setSearchTerm('');
  };

  const handleSelectFood = (food: MealItem) => {
    if (!pickerItem || !selectedDiet) return;
    const { mealId, itemIdx } = pickerItem;

    if (itemIdx === null) {
      // Add a brand-new item to the meal — keep the picker open (just clear the
      // search) so the athlete can add HC, then proteína, then grasa... in one go
      // instead of opening/closing the picker for every single food.
      const meal = selectedDiet.meals.find(m => m.id === mealId);
      if (!meal) { setPickerItem(null); return; }
      const newIdx = meal.items.length;
      const newItem: DietItem = { category: food.category, foodLabel: food.label, quantity: 1 };
      setSelectedDiet(prev => {
        if (!prev) return prev;
        return { ...prev, meals: prev.meals.map(m => m.id !== mealId ? m : { ...m, items: [...m.items, newItem] }) };
      });
      setItemStates(prev => ({ ...prev, [`${mealId}_${newIdx}`]: { foodLabel: newItem.foodLabel, done: false } }));
      setSearchTerm('');
    } else {
      // Swap an existing item in place — a single replacement, so close afterwards.
      const key = `${mealId}_${itemIdx}`;
      setItemStates(prev => ({ ...prev, [key]: { foodLabel: food.label, done: false } }));
      setSelectedDiet(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          meals: prev.meals.map(m => m.id !== mealId ? m : {
            ...m,
            items: m.items.map((it, i) => i !== itemIdx ? it : { ...it, category: food.category, foodLabel: food.label }),
          }),
        };
      });
      setPickerItem(null);
    }
  };

  // ── Recipe picker handlers ─────────────────────────────────────────────────

  const handleOpenRecipePicker = (mealId: string) => {
    setRecipePickerMealId(mealId);
    setRecipeSearch('');
    setRecipeCatFilter('all');
  };

  // ── "Guardar como receta" ────────────────────────────────────────────────

  const openSaveMealAsRecipe = (meal: DietMeal) => {
    setSavingMealAsRecipeId(meal.id);
    setRecipeNameDraft(meal.name);
  };

  const confirmSaveMealAsRecipe = async (meal: DietMeal) => {
    const name = recipeNameDraft.trim();
    if (!name || meal.items.length === 0) return;
    setSavingRecipe(true);
    try {
      const placed: Record<FoodCategory, number> = { HC: 0, PROT: 0, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0 };
      for (const item of meal.items) addToPlaced(placed, item.category, item.quantity);
      const exchanges = { HC: placed.HC, PROT: placed.PROT, GRASA: placed.GRASA };
      const ingredients: Recipe['ingredients'] = meal.items.map(item => ({
        foodLabel: item.foodLabel, category: item.category, mode: activeDietMode, quantity: item.quantity,
      }));
      const saved = await createRecipe({
        ownerId: profile.userId,
        name,
        categories: [],
        ingredients,
        extras: [],
        steps: [],
        exchanges,
        kcal: Math.round(exchangeToKcal(exchanges)),
      });
      setRecipes(prev => [...prev, saved]);
      flash(`"${name}" guardada como receta — ya está disponible en Recetas.`);
      setSavingMealAsRecipeId(null);
    } finally {
      setSavingRecipe(false);
    }
  };

  const handleApplyRecipe = (recipe: Recipe) => {
    if (!recipePickerMealId || !selectedDiet) return;
    const meal = selectedDiet.meals.find(m => m.id === recipePickerMealId);
    if (!meal) return;

    const newItems: DietItem[] = recipe.ingredients
      .filter(ing => enabledModes.includes(ing.mode))
      .map(ing => ({ category: ing.category, foodLabel: ing.foodLabel, quantity: ing.quantity, originRecipeId: recipe.id }));

    if (newItems.length === 0) { setRecipePickerMealId(null); return; }

    const startIdx = meal.items.length;
    setSelectedDiet(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        meals: prev.meals.map(m =>
          m.id !== recipePickerMealId ? m : { ...m, items: [...m.items, ...newItems] }
        ),
      };
    });
    const newStates: Record<string, ItemState> = {};
    newItems.forEach((item, i) => {
      newStates[`${recipePickerMealId}_${startIdx + i}`] = { foodLabel: item.foodLabel, done: false };
    });
    setItemStates(prev => ({ ...prev, ...newStates }));
    setRecipePickerMealId(null);
  };

  const handleRemoveItem = (mealId: string, itemIdx: number) => {
    if (!selectedDiet) return;
    const meal = selectedDiet.meals.find(m => m.id === mealId);
    if (!meal) return;
    const oldLen = meal.items.length;

    setSelectedDiet(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        meals: prev.meals.map(m =>
          m.id !== mealId ? m : { ...m, items: m.items.filter((_, i) => i !== itemIdx) }
        ),
      };
    });

    // Rebuild itemStates for this meal with shifted indices
    setItemStates(prev => {
      const next: Record<string, ItemState> = {};
      // Keep all states that belong to other meals
      Object.keys(prev).forEach(k => {
        if (!k.startsWith(`${mealId}_`)) next[k] = prev[k];
      });
      // Re-index this meal's states (skip deleted idx, shift down above it)
      for (let i = 0; i < oldLen; i++) {
        if (i === itemIdx) continue;
        const oldState = prev[`${mealId}_${i}`] ?? { foodLabel: meal.items[i].foodLabel, done: false };
        next[`${mealId}_${i < itemIdx ? i : i - 1}`] = oldState;
      }
      return next;
    });
  };

  // ── Recipe swap ("Cambiar comida") ──────────────────────────────────────────

  const handleOpenSwapPicker = (mealId: string, recipeId: string) => {
    setSwapContext({ mealId, recipeId });
  };

  const handleApplySwap = (newRecipe: Recipe) => {
    if (!swapContext || !selectedDiet) return;
    const { mealId, recipeId } = swapContext;
    const meal = selectedDiet.meals.find(m => m.id === mealId);
    if (!meal) { setSwapContext(null); return; }

    const newIngredientItems: DietItem[] = newRecipe.ingredients
      .filter(ing => enabledModes.includes(ing.mode))
      .map(ing => ({ category: ing.category, foodLabel: ing.foodLabel, quantity: ing.quantity, originRecipeId: newRecipe.id }));

    const oldItems = meal.items;
    const keptIndices: number[] = [];
    oldItems.forEach((it, i) => { if (it.originRecipeId !== recipeId) keptIndices.push(i); });
    const keptItems = keptIndices.map(i => oldItems[i]);
    const newItems = [...keptItems, ...newIngredientItems];

    setSelectedDiet(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        meals: prev.meals.map(m => m.id !== mealId ? m : { ...m, items: newItems }),
      };
    });

    // Kept items keep their done-state (relative order preserved); swapped-in
    // items start fresh, same as a freshly-applied recipe.
    let nextStates: Record<string, ItemState> = {};
    setItemStates(prev => {
      const next: Record<string, ItemState> = {};
      Object.keys(prev).forEach(k => { if (!k.startsWith(`${mealId}_`)) next[k] = prev[k]; });
      keptItems.forEach((item, newIdx) => {
        const oldIdx = keptIndices[newIdx];
        next[`${mealId}_${newIdx}`] = prev[`${mealId}_${oldIdx}`] ?? { foodLabel: item.foodLabel, done: false };
      });
      newIngredientItems.forEach((item, i) => {
        next[`${mealId}_${keptItems.length + i}`] = { foodLabel: item.foodLabel, done: false };
      });
      nextStates = next;
      return next;
    });

    if (selectedDiet) {
      const doneItemIds = (Object.entries(nextStates) as [string, ItemState][]).filter(([, v]) => v.done).map(([k]) => k);
      saveDietCompletionLog({ athleteId: profile.email, date: TODAY_DATE, dietId: selectedDiet.id, doneItemIds }).catch(() => {});
    }

    setSwapContext(null);
  };

  // ── Menu building: meals + budget ───────────────────────────────────────────

  const renameDiet = (name: string) => {
    setSelectedDiet(prev => prev ? { ...prev, name } : prev);
  };

  const updateBudgetCat = (cat: FoodCategory, value: number) => {
    setSelectedDiet(prev => prev ? { ...prev, budget: { ...prev.budget, [cat]: value } } : prev);
  };

  const addMeal = () => {
    if (!selectedDiet) return;
    const newMeal: DietMeal = { id: makeId(), name: `Comida ${selectedDiet.meals.length + 1}`, items: [] };
    setSelectedDiet(prev => prev ? { ...prev, meals: [...prev.meals, newMeal] } : prev);
    setOrigItemCounts(prev => ({ ...prev, [newMeal.id]: 0 }));
  };

  const removeMeal = (mealId: string) => {
    setSelectedDiet(prev => prev ? { ...prev, meals: prev.meals.filter(m => m.id !== mealId) } : prev);
    setItemStates(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => { if (k.startsWith(`${mealId}_`)) delete next[k]; });
      return next;
    });
  };

  const renameMeal = (mealId: string, name: string) => {
    setSelectedDiet(prev => prev ? { ...prev, meals: prev.meals.map(m => m.id === mealId ? { ...m, name } : m) } : prev);
  };

  // ── Guardar ──────────────────────────────────────────────────────────────────

  const handleSaveDiet = async () => {
    if (!selectedDiet) return;
    if (!isPersisted) {
      setSaving(true);
      try {
        const created = await createDiet({
          athleteId: profile.email,
          name: selectedDiet.name.trim() || 'Mi menú',
          budget: selectedDiet.budget,
          meals: selectedDiet.meals,
          selfManaged: true,
        });
        setAllDietsList(prev => [...prev, created]);
        setSelectedDiet(created);
        setSavedDietSnapshot(dietSnapshot(created));
        localStorage.setItem(`enforma_intercambios_diet_${profile.email}`, created.id);
        // Re-point today's completion log from the temporary draft id to the real one,
        // so checkmarks made before the first save survive a reload.
        const doneItemIds = (Object.entries(itemStates) as [string, ItemState][]).filter(([, v]) => v.done).map(([k]) => k);
        if (doneItemIds.length > 0) {
          saveDietCompletionLog({ athleteId: profile.email, date: TODAY_DATE, dietId: created.id, doneItemIds }).catch(() => {});
        }
        flash('Menú guardado en Mis Dietas.');
      } catch (err) {
        console.error(err);
        showToast('No se pudo guardar el menú.');
      } finally {
        setSaving(false);
      }
      return;
    }
    if (selectedDiet.selfManaged) {
      setSaving(true);
      try {
        await updateDiet(selectedDiet.id, { name: selectedDiet.name, budget: selectedDiet.budget, meals: selectedDiet.meals });
        setAllDietsList(prev => prev.map(d => d.id === selectedDiet.id ? selectedDiet : d));
        setSavedDietSnapshot(dietSnapshot(selectedDiet));
        flash('Cambios guardados.');
      } catch (err) {
        console.error(err);
        showToast('No se pudieron guardar los cambios.');
      } finally {
        setSaving(false);
      }
      return;
    }
    setSaveChoiceOpen(true);
  };

  const handleUpdateInPlace = async () => {
    if (!selectedDiet) return;
    setSaving(true);
    try {
      await updateDiet(selectedDiet.id, { name: selectedDiet.name, budget: selectedDiet.budget, meals: selectedDiet.meals });
      setAllDietsList(prev => prev.map(d => d.id === selectedDiet.id ? selectedDiet : d));
      setSavedDietSnapshot(dietSnapshot(selectedDiet));
      flash('Dieta actualizada.');
    } catch (err) {
      console.error(err);
      showToast('No se pudo actualizar la dieta.');
    } finally {
      setSaving(false);
      setSaveChoiceOpen(false);
    }
  };

  const handleSaveAsNew = async () => {
    if (!selectedDiet) return;
    setSaving(true);
    try {
      const created = await createDiet({
        athleteId: profile.email,
        name: `${selectedDiet.name} (copia)`,
        budget: selectedDiet.budget,
        meals: selectedDiet.meals.map(m => ({ ...m, id: makeId() })),
        selfManaged: true,
      });
      setAllDietsList(prev => [...prev, created]);
      handleSelectDiet(created, { skipDirtyCheck: true });
      flash('Guardado como nueva dieta en Mis Dietas.');
    } catch (err) {
      console.error(err);
      showToast('No se pudo guardar la nueva dieta.');
    } finally {
      setSaving(false);
      setSaveChoiceOpen(false);
    }
  };

  // ── Recipe hand-off from Recetas (favoritos → "Añadir a Intercambios") ──────

  // Mirrors handleApplyRecipe, but takes an explicit mealId instead of reading it
  // from recipePickerMealId state — needed when the target meal is decided
  // programmatically (auto when there's a single meal, or via chooseMealForRecipe).
  const addRecipeToMeal = (recipe: Recipe, mealId: string, currentDiet: Diet) => {
    const meal = currentDiet.meals.find(m => m.id === mealId);
    if (!meal) return;
    const newItems: DietItem[] = recipeToDietItems(recipe, enabledModes);
    if (newItems.length === 0) {
      flash(`No se pudo añadir "${recipe.name}": no tiene datos de intercambios.`);
      return;
    }
    const startIdx = meal.items.length;
    setSelectedDiet(prev => {
      if (!prev) return prev;
      return { ...prev, meals: prev.meals.map(m => m.id !== mealId ? m : { ...m, items: [...m.items, ...newItems] }) };
    });
    const newStates: Record<string, ItemState> = {};
    newItems.forEach((item, i) => { newStates[`${mealId}_${startIdx + i}`] = { foodLabel: item.foodLabel, done: false }; });
    setItemStates(prev => ({ ...prev, ...newStates }));
    flash(`"${recipe.name}" añadida a ${mealLabel(meal.name, currentDiet.meals.indexOf(meal) + 1)}.`);
  };

  useEffect(() => {
    if (!pendingRecipe || loading) return;
    if (allDietsList.length === 0) {
      // Athlete has no diets at all yet — nothing to choose from, start a blank one
      const blank = blankDiet(profile.email);
      blank.meals[0].items = recipeToDietItems(pendingRecipe, enabledModes);
      handleSelectDiet(blank, { skipDirtyCheck: true });
      onConsumedPendingRecipe?.();
      return;
    }
    // Let the athlete choose which diet to add the recipe to (or start a new one)
    setChooseDietForRecipe(pendingRecipe);
    onConsumedPendingRecipe?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingRecipe, loading]);

  const handleChooseDietForRecipe = (target: Diet | 'new') => {
    const recipe = chooseDietForRecipe;
    setChooseDietForRecipe(null);
    if (!recipe) return;

    const newItems = recipeToDietItems(recipe, enabledModes);
    if (newItems.length === 0) {
      flash(`No se pudo añadir "${recipe.name}": no tiene datos de intercambios.`);
      return;
    }

    if (target === 'new') {
      const blank = blankDiet(profile.email);
      blank.meals[0].items = newItems;
      handleSelectDiet(blank, { skipDirtyCheck: true });
      flash(`"${recipe.name}" añadida a un nuevo menú.`);
      return;
    }

    if (target.meals.length === 1) {
      const meal = target.meals[0];
      const updated: Diet = { ...target, meals: [{ ...meal, items: [...meal.items, ...newItems] }] };
      handleSelectDiet(updated, { skipDirtyCheck: true });
      flash(`"${recipe.name}" añadida a ${mealLabel(meal.name, 1)}.`);
    } else {
      handleSelectDiet(target, { skipDirtyCheck: true });
      setChooseMealForRecipe(recipe);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="w-full space-y-6">
      <div>
        <h1 className="font-sans font-extrabold text-display text-white tracking-tight">Nutrición</h1>
        <p className="text-ink-2 text-body-s mt-1">Construye tu menú del día con intercambios y guárdalo en Mis Dietas.</p>
      </div>

      {flashMsg && (
        <div className="flex items-center gap-2 bg-accent/10 border border-accent/25 text-white px-4 py-3 rounded-surface text-body-s">
          <span className="material-symbols-outlined text-accent text-title-s">check_circle</span>
          {flashMsg}
        </div>
      )}

      {/* Phase change banner */}
      {phaseBanner && (
        <div className="flex items-center justify-between gap-3 bg-data/10 border border-data/30 rounded-surface px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-data text-title-m flex-shrink-0">swap_horiz</span>
            <p className="font-sans font-bold text-data text-body-s">{phaseBanner}</p>
          </div>
          <button
            onClick={() => setPhaseBanner(null)}
            className="text-data/60 hover:text-data transition-colors flex-shrink-0"
          >
            <span className="material-symbols-outlined text-title-s">close</span>
          </button>
        </div>
      )}

      {/* Pending coach diets banner — different days can carry different diets
          (día A/B/C); this flags the ones still missing food items to hit budget. */}
      {pendingScheduledDiets.length > 0 && (
        <div className="flex items-center gap-2 bg-amber-400/10 border border-amber-400/25 text-amber-300 px-4 py-3 rounded-surface text-body-s">
          <span className="material-symbols-outlined text-amber-400 text-title-s flex-shrink-0">pending_actions</span>
          <span>
            Tienes <strong>{pendingScheduledDiets.length}</strong> {pendingScheduledDiets.length === 1 ? 'dieta pendiente de generar' : 'dietas pendientes de generar'}
            {': '}
            {pendingScheduledDiets.map(d => d.name).join(', ')}
          </span>
        </div>
      )}

      {/* Diet mode selector */}
      {enabledModes.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {enabledModes.map(mode => (
            <button key={mode} onClick={() => setActiveDietMode(mode)}
              className={`px-4 py-2 rounded-control font-sans text-label font-bold uppercase tracking-wider transition-all ${
                activeDietMode === mode
                  ? 'bg-accent text-black'
                  : 'bg-raised text-ink-2 border border-hairline hover:border-accent/40 hover:text-white'
              }`}
            >{MODE_LABEL[mode]}</button>
          ))}
        </div>
      )}

      {/* Week schedule navigation */}
      {!loading && WD_ORDER.some(d => typeof weeklySchedule[d] === 'string') && (
        <div className="flex gap-2">
          {WD_ORDER.map(day => {
            const isToday = day === TODAY_WD;
            const isViewing = day === viewDay;
            const hasDiet = typeof weeklySchedule[day] === 'string';
            return (
              <button
                key={day}
                onClick={() => setViewDay(day)}
                className={`flex-1 flex flex-col items-center py-3 rounded-control font-mono text-caption font-bold uppercase tracking-wider border transition-all ${
                  isViewing
                    ? 'bg-accent/10 border-accent/50 text-accent'
                    : isToday
                    ? 'bg-raised border-hairline text-white'
                    : 'bg-raised border-hairline text-ink-2 hover:border-hairline hover:text-white'
                }`}
              >
                <span>{WD_SHORT[day]}</span>
                <span className={`w-1 h-1 rounded-full ${isToday ? 'bg-accent' : hasDiet ? 'bg-data/50' : 'bg-transparent'}`} />
              </button>
            );
          })}
        </div>
      )}

      {loading ? (
        // 05 · Carga — esqueletos con barrido 1,4 s y stagger 150 ms, nunca
        // spinner ni cifras falsas (handoff).
        <div className="bg-raised border border-hairline rounded-canvas p-4 space-y-5">
          <div className="flex items-end justify-between gap-3">
            <Skeleton className="stagger-child h-9 w-28" style={{ '--i': 0 } as React.CSSProperties} />
            <Skeleton className="stagger-child h-5 w-16" style={{ '--i': 1 } as React.CSSProperties} />
          </div>
          <div className="space-y-3">
            {[0, 1, 2].map(i => (
              <React.Fragment key={i}><Skeleton className="stagger-child h-6 w-full" style={{ '--i': i + 2 } as React.CSSProperties} /></React.Fragment>
            ))}
          </div>
          <div className="space-y-2 pt-2">
            {[0, 1, 2].map(i => (
              <React.Fragment key={i}><Skeleton className="stagger-child h-16 w-full" style={{ '--i': i + 5 } as React.CSSProperties} /></React.Fragment>
            ))}
          </div>
        </div>
      ) : allDietsList.length === 0 && !selectedDiet ? (
        // 04 · Vacío — sin dieta publicada. Ningún vacío culpa al atleta: dice
        // qué falta y quién lo tiene que hacer (handoff).
        <div className="flex flex-col items-center gap-4 px-6 py-10 text-center animate-fade-up">
          <span className="flex h-16 w-16 items-center justify-center rounded-field border border-dashed border-accent-line">
            <Icon name="nutrition" size="xl" className="text-accent" />
          </span>
          <div className="flex flex-col gap-2 max-w-[320px]">
            <p className="font-display font-black text-title-l uppercase leading-tight tracking-tight text-ink">
              Dani está montando<br />tu dieta
            </p>
            <p className="font-sans text-body-s text-ink-2">
              En cuanto tu entrenador publique tu plan de nutrición, lo verás aquí y te avisamos.
            </p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-field border border-accent-line bg-accent-bg px-4 py-3">
            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse-dot" />
            <span className="font-mono text-label font-semibold tracking-[.08em] text-accent">SIN PLAN PUBLICADO TODAVÍA</span>
          </span>
          <Button variant="ghost" onClick={handleStartBlank} className="mt-2">
            Empezar mi propio menú mientras tanto
          </Button>
        </div>
      ) : viewDay !== TODAY_WD ? (() => {
        const browseDietId = weeklySchedule[viewDay] ?? null;
        const browseDiet = browseDietId ? allDietsList.find(d => d.id === browseDietId) ?? null : null;
        return (
          <div className="space-y-4">
            <div className="bg-raised rounded-surface p-4 border border-hairline">
              <span className="block font-mono text-caption text-ink-2 uppercase tracking-widest font-bold mb-1">
                {WD_FULL[viewDay].charAt(0).toUpperCase() + WD_FULL[viewDay].slice(1)}
              </span>
              {browseDiet ? (
                <>
                  <span className="block font-sans font-bold text-title-m text-white leading-tight">{browseDiet.name}</span>
                  {browseDiet.coachNote && (
                    <span className="block text-label text-data italic mt-1">{browseDiet.coachNote}</span>
                  )}
                  <div className="flex gap-2 mt-3 flex-wrap">
                    {BUDGET_CATS.map(cat => {
                      const b = browseDiet.budget[cat];
                      return b > 0 ? (
                        <span key={cat} className={`text-caption font-mono font-bold px-3 py-1 rounded-surface border ${CAT_BG[cat]} ${CAT_COLOR[cat]}`}>
                          {cat}: {b} int.
                        </span>
                      ) : null;
                    })}
                  </div>
                </>
              ) : (
                <span className="block font-sans text-ink-2 text-body-s mt-1">Día libre — sin dieta programada.</span>
              )}
            </div>
            <button
              onClick={() => setViewDay(TODAY_WD)}
              className="w-full py-3 rounded-control border border-accent/30 text-accent font-sans text-label font-bold uppercase tracking-wider hover:bg-accent/10 transition-all"
            >
              ← Volver a hoy
            </button>
          </div>
        );
      })() : (
        <>
          {/* Diet selector — free choice among all of the athlete's diets (own + coach's) */}
          {allDietsList.length > 0 && (
            <div className="flex gap-2 flex-wrap items-center">
              {allDietsList.map(dt => (
                <button key={dt.id} onClick={() => handleSelectDiet(dt)}
                  className={`flex items-center gap-2 px-4 py-3 rounded-control font-sans text-label font-bold uppercase tracking-wider transition-all ${
                    selectedDiet?.id === dt.id
                      ? 'bg-accent text-black'
                      : 'bg-raised text-ink-2 border border-hairline hover:border-accent/40 hover:text-white'
                  }`}
                >
                  {!dt.selfManaged && (
                    <span className="material-symbols-outlined" style={{ fontSize: '13px' }} title="De tu entrenador">military_tech</span>
                  )}
                  {dt.name}
                </button>
              ))}
              <button
                onClick={handleStartBlank}
                className="flex items-center gap-1 px-3 py-3 rounded-control border border-dashed border-hairline text-ink-2 hover:border-accent/40 hover:text-accent font-sans text-label font-bold uppercase tracking-wider transition-all"
              >
                <span className="material-symbols-outlined text-body-s">add</span>
                Nuevo
              </button>
            </div>
          )}

          {selectedDiet && (
            <React.Fragment key={selectedDiet.id}>
              {/* ── 01 · Tracker del día (F3.8) ─────────────────────────────────── */}
              <div className="bg-raised border border-hairline rounded-canvas p-4">
                {dayClosed ? (
                  <div className="flex flex-col items-center py-4 text-center animate-fade-up">
                    <RingSeal percent={100} complete size={112} strokeWidth={8} label="Día cerrado en presupuesto" />
                    <p className="font-display font-black text-title-l uppercase leading-tight tracking-tight text-ink mt-5">
                      Día cerrado<br />en presupuesto
                    </p>
                    <p className="text-body-s text-ink-2 mt-2 max-w-[300px]">
                      Registraste tus {totalItems} ingesta{totalItems !== 1 ? 's' : ''} de hoy dentro de tu presupuesto de intercambios.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <span className="block font-mono text-caption text-ink-3 uppercase tracking-[.16em]">Te quedan</span>
                        <div className="flex items-baseline gap-2 mt-2">
                          <span className={`font-display font-black text-headline leading-none ${leftExch < 0 ? 'text-danger' : 'text-accent'}`}>
                            {fmtQty(leftExch)}
                          </span>
                          <span className="font-sans font-semibold text-body-s text-ink-3">intercambios</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="block font-mono text-caption text-ink-3 uppercase tracking-[.14em]">≈ kcal</span>
                        <span className="block font-mono text-title-s text-ink-2 mt-2">
                          {leftKcal < 0 ? '−' : '≈ '}{Math.abs(leftKcal).toLocaleString('es-ES')}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-3 mt-5">
                      {BUDGET_CATS.map(cat => {
                        const b = selectedDiet.budget[cat] ?? 0;
                        const d = doneByCat[cat];
                        const over = b > 0 && d > b;
                        const pct = b > 0 ? (d / b) * 100 : (d > 0 ? 100 : 0);
                        return (
                          <div key={cat}>
                            <div className="flex items-baseline justify-between mb-2">
                              <span className="font-mono text-caption font-semibold text-ink-2 tracking-[.1em]">{BAR_LABEL[cat]}</span>
                              <span className={`font-mono text-label font-bold ${over ? 'text-danger' : 'text-ink-2'}`}>
                                {fmtQty(d)}/{fmtQty(b)}{over ? `  +${fmtQty(round2(d - b))}` : ''}
                              </span>
                            </div>
                            <ProgressBar value={pct} label={`${BAR_LABEL[cat]}, ${fmtQty(d)} de ${fmtQty(b)} intercambios`} />
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}

                {selectedDiet.meals.length > 0 && (
                  <>
                    <div className="flex items-baseline justify-between mt-6 mb-2">
                      <span className="font-mono text-caption text-ink-3 uppercase tracking-[.16em]">Ingestas</span>
                      <span className="font-mono text-caption text-ink-4">{mealsDoneCount} DE {selectedDiet.meals.length}</span>
                    </div>
                    <div className="flex flex-col gap-2">
                      {selectedDiet.meals.map((meal, mi) => {
                        const mealDone = meal.items.length > 0 && meal.items.every((_, idx) => itemStates[`${meal.id}_${idx}`]?.done);
                        const bycat = mealPlacedByCat[meal.id] ?? { HC: 0, PROT: 0, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0 };
                        return (
                          <div
                            key={meal.id}
                            className={`flex items-center gap-3 rounded-surface border p-3 transition-colors duration-(--duration-state) ${
                              mealDone ? 'border-accent/20 bg-accent/6' : 'border-hairline bg-surface'
                            }`}
                          >
                            <button type="button" onClick={() => handleToggleMealDone(meal)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                              <span
                                className={`flex h-6 w-6 flex-none items-center justify-center rounded-control border-[1.5px] transition-all duration-(--duration-state) ${
                                  mealDone ? 'border-accent bg-accent' : 'border-strong'
                                }`}
                              >
                                {mealDone && <Icon name="check" size="s" className="text-on-accent" />}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className={`block truncate font-sans text-body-s font-bold transition-colors duration-(--duration-state) ${mealDone ? 'text-ink-2' : 'text-ink'}`}>
                                  {mealLabel(meal.name, mi + 1)}
                                </span>
                                {(bycat.HC > 0 || bycat.PROT > 0 || bycat.GRASA > 0) && (
                                  <span className="mt-2 flex flex-wrap gap-1">
                                    {(['HC', 'PROT', 'GRASA'] as const).filter(c => bycat[c] > 0).map(c => (
                                      <span
                                        key={c}
                                        className={`rounded-chip px-2 py-1 font-mono text-caption font-semibold ${mealDone ? 'bg-white/5 text-ink-3' : 'bg-accent-bg text-accent'}`}
                                      >
                                        {fmtQty(bycat[c])} {CHIP_LABEL[c]}
                                      </span>
                                    ))}
                                  </span>
                                )}
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenAdjust(meal)}
                              title="Ajustar intercambios"
                              aria-label={`Ajustar intercambios de ${mealLabel(meal.name, mi + 1)}`}
                              className="-m-2 flex-none p-2 text-ink-3 transition-colors hover:text-accent"
                            >
                              <Icon name="tune" size="s" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    <p className="mt-3 text-center font-mono text-caption tracking-[.08em] text-ink-4">
                      TOCA UNA INGESTA PARA REGISTRARLA
                    </p>
                  </>
                )}
              </div>

              {/* Diet header */}
              <div className="bg-raised rounded-surface p-4 border border-hairline">
                <div className="flex items-center justify-between ">
                  <span className="font-mono text-caption text-ink-2 uppercase tracking-widest font-bold">
                    {selectedDiet.selfManaged ? 'TU MENÚ' : 'DIETA DE TU ENTRENADOR'}
                  </span>
                  <span className="font-mono text-caption text-accent uppercase tracking-widest font-bold">Hoy, {WD_FULL[TODAY_WD]}</span>
                </div>
                <input
                  type="text"
                  value={selectedDiet.name}
                  onChange={e => renameDiet(e.target.value)}
                  className="block w-full bg-transparent border-none font-sans font-bold text-title-m text-white leading-tight focus:outline-none focus:ring-0 p-0"
                />
                {selectedDiet.coachNote && (
                  <span className="block font-sans text-label text-data italic mt-1">{selectedDiet.coachNote}</span>
                )}
                <span className="block font-mono text-caption text-ink-2 mt-2">
                  {selectedDiet.meals.length} comida{selectedDiet.meals.length !== 1 ? 's' : ''} · {selectedDiet.meals.reduce((s, m) => s + m.items.length, 0)} alimentos
                </span>
              </div>

              {/* Objetivo diario de intercambios — el atleta solo lo edita en menús propios;
                  en dietas del entrenador el cupo es fijo, solo se rellenan alimentos. */}
              <div className="bg-surface border border-hairline rounded-surface p-4">
                <p className="font-mono text-caption text-ink-2 uppercase tracking-wider mb-3">
                  {selectedDiet.selfManaged ? 'Objetivo diario de intercambios' : 'Cupo diario fijado por tu entrenador'}
                </p>
                <div className="grid grid-cols-3 gap-3">
                  {BUDGET_CATS.map(cat => (
                    <div key={cat}>
                      <label className={`block font-sans text-caption font-bold mb-1 ${CAT_COLOR[cat]}`}>{CAT_LABEL[cat]}</label>
                      {selectedDiet.selfManaged ? (
                        <input
                          type="number"
                          min={0}
                          step={0.25}
                          value={selectedDiet.budget[cat]}
                          onChange={e => updateBudgetCat(cat, parseFloat(e.target.value) || 0)}
                          className="w-full bg-raised border border-hairline rounded-control px-2 py-2 text-white text-title-s focus:outline-none focus:border-accent/50"
                        />
                      ) : (
                        <div className="w-full bg-raised/50 border border-hairline rounded-surface px-2 py-2 text-white text-label">
                          {fmtQty(selectedDiet.budget[cat])}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* El progreso por categoría y el total de completados hoy ya los
                  cubre el tracker de arriba (panel 01) — este dashboard duplicaba
                  las mismas cifras con otro estilo, de la versión pre-Fase 3. */}

              {/* Resumen numérico (colocado/objetivo por comida + total del día) — siempre visible */}
              <DietNumerosView meals={selectedDiet.meals} budget={selectedDiet.budget} />

              <Coachmark
                id="nutrition_swap_hint"
                email={profile.email}
                icon="swap_horiz"
                text="¿No te apetece algo? Toca el icono 🔁 junto a cualquier alimento para cambiarlo por un equivalente."
              />

              <div className="space-y-4">
                {selectedDiet.meals.map((meal, mi) => {
                  const mealDone = meal.items.length > 0 && meal.items.every((_, idx) => itemStates[`${meal.id}_${idx}`]?.done);
                  return (
                    <div key={meal.id}
                      className={`bg-raised rounded-surface overflow-hidden border transition-all ${mealDone ? 'border-accent/40' : 'border-hairline'}`}
                    >
                      {/* Meal header */}
                      <div className="px-4 py-3 bg-raised/80 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => handleToggleMealDone(meal)}
                            title={mealDone ? 'Desmarcar ingesta' : 'Registrar ingesta'}
                            aria-label={mealDone ? 'Desmarcar ingesta' : 'Registrar ingesta'}
                            className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${mealDone ? 'bg-accent border-accent' : 'border-hairline hover:border-accent/50'}`}
                          >
                            {mealDone && <span className="material-symbols-outlined text-black" style={{ fontSize: '13px' }}>check</span>}
                          </button>
                          <input
                            type="text"
                            value={meal.name}
                            onChange={e => renameMeal(meal.id, e.target.value)}
                            placeholder={`Comida ${mi + 1}`}
                            className="min-w-0 flex-1 bg-transparent border-none font-sans font-bold text-white text-title-s focus:outline-none focus:ring-0 p-0"
                          />
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="font-mono text-caption text-ink-2 hidden sm:block">
                            {meal.items.length} alimento{meal.items.length !== 1 ? 's' : ''}
                          </span>
                          {recipes.length > 0 && (
                            <button
                              onClick={() => handleOpenRecipePicker(meal.id)}
                              title="Usar receta"
                              className="flex items-center gap-1 px-2 py-1 rounded-control bg-raised border border-hairline hover:border-accent/50 hover:text-accent text-ink-2 transition-all"
                            >
                              <span className="material-symbols-outlined text-label select-none">skillet</span>
                              <span className="font-mono text-caption uppercase tracking-wider hidden sm:block">Receta</span>
                            </button>
                          )}
                          {meal.items.length > 0 && (
                            <button
                              onClick={() => openSaveMealAsRecipe(meal)}
                              title="Guardar como receta"
                              className="flex items-center gap-1 px-2 py-1 rounded-control bg-raised border border-hairline hover:border-data/50 hover:text-data text-ink-2 transition-all"
                            >
                              <span className="material-symbols-outlined text-label select-none">bookmark_add</span>
                              <span className="font-mono text-caption uppercase tracking-wider hidden sm:block">Guardar receta</span>
                            </button>
                          )}
                          {selectedDiet.meals.length > 1 && (
                            <button
                              onClick={() => removeMeal(meal.id)}
                              title="Quitar comida"
                              className="text-ink-2 hover:text-red-400 transition-colors p-1"
                            >
                              <span className="material-symbols-outlined text-body-s select-none">delete</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {savingMealAsRecipeId === meal.id && (
                        <div className="px-4 py-3 bg-bg/60 border-b border-hairline flex items-center gap-2">
                          <input
                            type="text"
                            autoFocus
                            value={recipeNameDraft}
                            onChange={e => setRecipeNameDraft(e.target.value)}
                            placeholder="Nombre de la receta"
                            className="flex-1 min-w-0 bg-raised border border-hairline rounded-control px-3 py-2 text-title-s text-white font-mono focus:outline-none focus:border-data/50"
                          />
                          <button
                            onClick={() => confirmSaveMealAsRecipe(meal)}
                            disabled={savingRecipe || !recipeNameDraft.trim()}
                            className="px-3 py-2 bg-data text-black font-mono text-caption font-bold uppercase rounded-control disabled:opacity-40 transition-all"
                          >
                            {savingRecipe ? 'Guardando…' : 'Guardar'}
                          </button>
                          <button
                            onClick={() => setSavingMealAsRecipeId(null)}
                            className="text-ink-2 hover:text-white p-1"
                          >
                            <span className="material-symbols-outlined text-body-s">close</span>
                          </button>
                        </div>
                      )}

                      {/* Per-meal target + progress (only when targets are set) */}
                      {CATS.some(c => (meal.target?.[c] ?? 0) > 0) && (() => {
                        const mDone = mealDoneByCat[meal.id] ?? {} as Record<FoodCategory, number>;
                        const targetCats = CATS.filter(c => (meal.target?.[c] ?? 0) > 0);
                        return (
                          <div className="px-4 py-2 bg-bg/60 border-b border-hairline flex flex-wrap gap-x-3 gap-y-2 items-center">
                            {targetCats.map(cat => {
                              const tgt = meal.target![cat]!;
                              const d = mDone[cat] ?? 0;
                              const isOk = round2(d) >= round2(tgt);
                              const isOver = d > tgt;
                              return (
                                <div key={cat} className="flex items-center gap-1">
                                  <span className={`font-mono text-caption font-bold ${CAT_COLOR[cat]}`}>
                                    {cat.replace('_', ' ')}
                                  </span>
                                  <span className={`font-mono text-caption ${isOver ? 'text-red-400' : isOk ? 'text-green-400' : 'text-ink-2'}`}>
                                    {fmtQty(d)}/{fmtQty(tgt)}{isOk ? ' ✓' : ''}
                                  </span>
                                  <div className="w-10 h-1 bg-raised rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full transition-all duration-300 ${isOver ? 'bg-red-500' : isOk ? 'bg-green-400' : 'bg-accent'}`}
                                      style={{ width: `${tgt > 0 ? Math.min(100, (d / tgt) * 100) : 0}%` }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}

                      {/* Item list */}
                      <div className="p-3 border-t border-hairline bg-bg/40 space-y-2">
                        {meal.items.length === 0 ? (
                          <button
                            onClick={() => handleOpenAddPicker(meal.id)}
                            className="w-full flex items-center gap-3 p-3 rounded-surface border border-dashed border-hairline text-ink-2 hover:border-accent/50 hover:text-accent transition-colors"
                          >
                            <span className="w-8 h-8 rounded-control bg-accent-bg flex items-center justify-center flex-shrink-0">
                              <Icon name="add" size="s" className="text-accent" />
                            </span>
                            <span className="font-sans text-body-s font-semibold">Añadir alimento del banco</span>
                          </button>
                        ) : meal.items.map((item, idx) => {
                          const key = `${meal.id}_${idx}`;
                          const st = itemStates[key] ?? { foodLabel: item.foodLabel, done: false };
                          // Toque en la fila = intercambiar (handoff, panel 02b); el
                          // checkbox y el botón "quitar" paran la propagación para no
                          // disparar el picker a la vez.
                          return (
                            <div key={key}
                              onClick={() => handleOpenPicker(meal.id, idx, item.category)}
                              className={`flex items-center gap-3 p-3 rounded-surface border cursor-pointer transition-colors duration-(--duration-state) ${st.done ? 'bg-surface border-accent/20 opacity-75' : 'bg-surface border-hairline hover:border-accent/30'}`}
                            >
                              {/* Checkbox */}
                              <button
                                onClick={e => { e.stopPropagation(); handleToggleDone(meal.id, idx); }}
                                title={st.done ? 'Desmarcar' : 'Marcar'}
                                className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center transition-all ${st.done ? 'bg-accent text-black border-transparent' : 'border border-ink-2/40 hover:border-accent'}`}
                              >
                                {st.done && <span className="material-symbols-outlined text-body-s font-bold">check</span>}
                              </button>

                              {/* Category tag — cuadro 44px del handoff */}
                              <span className="w-11 h-11 rounded-control bg-inset border border-hairline flex-shrink-0 flex items-center justify-center">
                                <span className="font-mono text-caption font-bold text-ink-3">{item.category.replace('_', '')}</span>
                              </span>

                              {/* Nombre + gramos en oro (los gramos SOLO viven aquí — el resto de la pantalla habla en intercambios) + equivalencia humana */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-baseline gap-2">
                                  <span className={`text-body-s font-sans font-semibold leading-snug truncate ${st.done ? 'line-through text-ink-2' : 'text-ink'}`}>
                                    {st.foodLabel}
                                  </span>
                                  <span className="font-mono text-body-s font-bold text-accent flex-shrink-0">
                                    {itemWeightLabel(item.foodLabel, item.quantity)}
                                  </span>
                                </div>
                                <span className="block font-sans text-caption text-ink-3 mt-1">
                                  {fmtQty(item.quantity)} intercambio{item.quantity !== 1 ? 's' : ''} de {CAT_LABEL[item.category].toLowerCase()}
                                </span>
                              </div>

                              {/* Cambiar comida — only on the first item of a recipe-derived group */}
                              {item.originRecipeId && meal.items.findIndex(it => it.originRecipeId === item.originRecipeId) === idx && (
                                <button
                                  onClick={e => { e.stopPropagation(); handleOpenSwapPicker(meal.id, item.originRecipeId!); }}
                                  title="Cambiar comida"
                                  className="text-ink-2 hover:text-accent transition-colors flex-shrink-0 p-2 -m-1.5"
                                >
                                  <span className="material-symbols-outlined text-body-s select-none">skillet</span>
                                </button>
                              )}
                              <Icon name="swap_horiz" size="s" className="text-accent/65 flex-shrink-0" />
                              {/* Delete button — only for recipe-added items */}
                              {idx >= (origItemCounts[meal.id] ?? Infinity) && (
                                <button
                                  onClick={e => { e.stopPropagation(); handleRemoveItem(meal.id, idx); }}
                                  title="Quitar"
                                  className="text-ink-2 hover:text-red-400 transition-colors flex-shrink-0 p-2 -m-1.5"
                                >
                                  <span className="material-symbols-outlined text-body-s select-none">close</span>
                                </button>
                              )}
                            </div>
                          );
                        })}
                        {meal.items.length > 0 && (
                          <button
                            onClick={() => handleOpenAddPicker(meal.id)}
                            className="w-full flex items-center gap-3 p-3 rounded-surface border border-dashed border-hairline text-ink-2 hover:border-accent/50 hover:text-accent transition-colors"
                          >
                            <span className="w-8 h-8 rounded-control bg-accent-bg flex items-center justify-center flex-shrink-0">
                              <Icon name="add" size="s" className="text-accent" />
                            </span>
                            <span className="font-sans text-body-s font-semibold">Añadir alimento del banco</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                <p className="flex items-start gap-2 bg-surface border border-hairline rounded-field px-4 py-3">
                  <Icon name="info" size="s" className="text-accent/70 flex-shrink-0 mt-1" />
                  <span className="font-sans text-caption text-ink-3 leading-relaxed">
                    Cambiar un alimento no toca tu presupuesto: la app ajusta los gramos para que valga los mismos intercambios.
                  </span>
                </p>
                <button
                  onClick={addMeal}
                  className="w-full py-3 rounded-control border border-dashed border-hairline text-ink-2 font-sans text-label font-bold uppercase tracking-wider hover:border-accent/40 hover:text-accent transition-all"
                >
                  + Añadir comida
                </button>
              </div>

              {/* Guardar */}
              <div className="sticky bottom-20 md:bottom-4 flex items-center justify-between gap-3 bg-raised border border-hairline rounded-surface p-3 shadow-e1">
                <span className="font-mono text-caption text-ink-2 uppercase tracking-wider pl-1">
                  {!isPersisted || isDirty ? 'Cambios sin guardar' : 'Todo guardado'}
                </span>
                <button
                  onClick={handleSaveDiet}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-accent text-black font-sans font-bold text-label uppercase rounded-control hover:bg-accent-press active:scale-95 transition-all disabled:opacity-40"
                >
                  <span className="material-symbols-outlined text-body-s">save</span>
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </React.Fragment>
          )}
        </>
      )}

      {/* Recipe picker sheet */}
      {recipePickerMealId && (() => {
        const targetMeal = selectedDiet?.meals.find(m => m.id === recipePickerMealId);
        return (
          <Sheet
            open
            onClose={() => setRecipePickerMealId(null)}
            title="Usar receta"
            toolbar={(
              <>
                {targetMeal && (
                  <div className="px-4 pb-2 font-mono text-caption text-ink-2 uppercase">
                    {mealLabel(targetMeal.name, (selectedDiet?.meals.indexOf(targetMeal) ?? 0) + 1)}
                  </div>
                )}

              {/* Search */}
              <div className="px-4 py-2 bg-surface flex items-center gap-2 border-b border-hairline">
                <Icon name="search" size="s" className="text-ink-2" />
                <input
                  type="text"
                  placeholder="Buscar receta..."
                  value={recipeSearch}
                  onChange={e => setRecipeSearch(e.target.value)}
                  className="w-full bg-transparent border-none text-white text-title-s focus:ring-0 focus:outline-none p-2 placeholder-ink-2/45"
                />
              </div>

              {/* Category filter */}
              {availableRecipeCats.length > 0 && (
                <div className="px-4 py-2 bg-surface border-b border-hairline flex gap-2 overflow-x-auto">
                  {[{ id: 'all', label: 'Todas' }, ...availableRecipeCats.map(c => ({ id: c, label: c }))].map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setRecipeCatFilter(cat.id)}
                      className={`px-3 py-2 rounded-full font-sans text-caption font-bold uppercase tracking-wider whitespace-nowrap transition-all flex-shrink-0 ${
                        recipeCatFilter === cat.id
                          ? 'bg-accent text-black'
                          : 'bg-raised text-ink-2 border border-transparent hover:border-hairline'
                      }`}
                    >{cat.label}</button>
                  ))}
                </div>
              )}
              </>
            )}
          >
              {/* Recipe list */}
              <div className="pt-4 space-y-2">
                {sortedPickerRecipes.length === 0 ? (
                  <div className="text-center py-10 font-mono text-label text-ink-2 italic">
                    {recipes.length === 0 ? 'El coach todavía no ha publicado recetas.' : 'Ninguna receta coincide.'}
                  </div>
                ) : sortedPickerRecipes.map(recipe => {
                  const isFav = recipeFavorites.recipeIds.includes(recipe.id);
                  // Exchange summary for this athlete's mode
                  const exchParts: string[] = [];
                  const totals: Partial<Record<FoodCategory, number>> = {};
                  recipe.ingredients
                    .filter(ing => enabledModes.includes(ing.mode))
                    .forEach(ing => { totals[ing.category] = (totals[ing.category] ?? 0) + ing.quantity; });
                  (['HC', 'PROT', 'GRASA', 'MIX_HC', 'MIX_GRASA'] as FoodCategory[])
                    .filter(c => (totals[c] ?? 0) > 0)
                    .forEach(c => exchParts.push(`${totals[c]} ${c.replace('_', ' ')}`));
                  const exchStr = exchParts.join(' · ') || '—';

                  return (
                    <button
                      key={recipe.id}
                      onClick={() => handleApplyRecipe(recipe)}
                      className="w-full flex items-center gap-3 p-4 bg-surface hover:bg-raised rounded-control border border-hairline hover:border-accent/40 text-left transition-all group"
                    >
                      {recipe.photoUrl ? (
                        <img src={recipe.photoUrl} alt={recipe.name} className="w-12 h-12 rounded-surface object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-12 h-12 rounded-surface bg-raised border border-hairline flex items-center justify-center flex-shrink-0">
                          <span className="material-symbols-outlined text-ink-2 text-title-m">skillet</span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 ">
                          {isFav && (
                            <span className="material-symbols-outlined text-accent text-label" style={{ fontVariationSettings: "'FILL' 1", fontSize: '12px' }}>favorite</span>
                          )}
                          <span className="font-sans font-bold text-body-s text-white group-hover:text-accent transition-colors truncate">{recipe.name}</span>
                        </div>
                        {recipe.categories.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-1">
                            {recipe.categories.slice(0, 3).map(c => (
                              <span key={c} className="px-2 rounded-control bg-raised font-mono text-caption text-ink-2 uppercase">{c}</span>
                            ))}
                          </div>
                        )}
                        <span className="font-mono text-caption text-accent/70">{exchStr}</span>
                      </div>
                      <span className="material-symbols-outlined text-ink-2 group-hover:text-accent transition-colors select-none text-title-s flex-shrink-0">add_circle</span>
                    </button>
                  );
                })}
              </div>
          </Sheet>
        );
      })()}

      {/* Cambiar comida sheet */}
      {swapContext && (
        <Sheet
          open
          onClose={() => setSwapContext(null)}
          title="Cambiar comida"
          toolbar={swapSourceRecipe ? (
            <div className="px-4 pb-2 font-sans text-caption text-ink-2 uppercase">
              Alternativas a {swapSourceRecipe.name} (±10% kcal)
            </div>
          ) : undefined}
        >
            <div className="pt-4 space-y-2">
              {swapCandidates.length === 0 ? (
                <div className="text-center py-10 font-sans text-label text-ink-2 italic">
                  Sin alternativas nutricionalmente similares disponibles.
                </div>
              ) : swapCandidates.map(recipe => (
                <button
                  key={recipe.id}
                  onClick={() => handleApplySwap(recipe)}
                  className="w-full flex items-center gap-3 p-4 bg-surface hover:bg-raised rounded-control border border-hairline hover:border-accent/40 text-left transition-all group"
                >
                  {recipe.photoUrl ? (
                    <img src={recipe.photoUrl} alt={recipe.name} className="w-12 h-12 rounded-surface object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-surface bg-raised border border-hairline flex items-center justify-center flex-shrink-0">
                      <span className="material-symbols-outlined text-ink-2 text-title-m">skillet</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <span className="font-sans font-bold text-body-s text-white group-hover:text-accent transition-colors truncate block">{recipe.name}</span>
                    <span className="font-mono text-caption text-accent/70">{recipe.kcal} kcal</span>
                  </div>
                  <span className="material-symbols-outlined text-ink-2 group-hover:text-accent transition-colors select-none text-title-s flex-shrink-0">swap_horiz</span>
                </button>
              ))}
            </div>
        </Sheet>
      )}

      {/* Food picker sheet */}
      {pickerItem && (
        <Sheet
          open
          onClose={() => setPickerItem(null)}
          title={pickerItem.itemIdx === null ? 'Añadir alimento' : 'Cambiar alimento'}
          toolbar={(
            <>
              <div className="px-4 pb-2 font-sans text-caption text-ink-2 uppercase">
                {isSearchingFoods ? `Todas las categorías · ${MODE_LABEL[activeDietMode]}` : `${CAT_LABEL[pickerCategory]} · ${MODE_LABEL[activeDietMode]}`}
              </div>

            {enabledModes.length > 1 && (
              <div className="px-4 py-2 bg-bg border-b border-hairline flex gap-2 flex-wrap">
                {enabledModes.map(mode => (
                  <button key={mode} onClick={() => setActiveDietMode(mode)}
                    className={`px-3 py-1 rounded-full font-sans text-caption font-bold uppercase tracking-wider transition-all ${activeDietMode === mode ? 'bg-accent text-black' : 'bg-raised text-ink-2 border border-hairline'}`}
                  >{MODE_LABEL[mode]}</button>
                ))}
              </div>
            )}

            <div className={`p-3 bg-surface border-b border-hairline flex gap-2 flex-wrap transition-opacity ${isSearchingFoods ? 'opacity-40' : ''}`}>
              {CATS.map(cat => (
                <button key={cat} onClick={() => { setPickerCategory(cat); setSearchTerm(''); }}
                  className={`px-3 py-2 rounded-full font-sans text-caption font-bold uppercase tracking-wider transition-all ${pickerCategory === cat && !isSearchingFoods ? 'bg-accent text-black' : 'bg-raised text-ink-2 border border-transparent hover:border-hairline'}`}
                >{cat.replace('_', ' ')}</button>
              ))}
            </div>

            <div className="px-4 py-2 bg-surface flex items-center gap-2 border-b border-hairline">
              <Icon name="search" size="s" className="text-ink-2" />
              <input type="text" placeholder="Buscar en todas las categorías..." value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-transparent border-none text-white text-title-s focus:ring-0 focus:outline-none p-2 placeholder-ink-2/45"
              />
            </div>
            </>
          )}
        >
            <div className="pt-4 space-y-2">
              {filteredFoods.length === 0 ? (
                <EmptyState
                  icon="search_off"
                  title={searchTerm ? `Nada para «${searchTerm}»` : 'Sin alimentos en esta categoría.'}
                  description={searchTerm ? 'Prueba con otra palabra o cambia de categoría.' : undefined}
                  actionLabel={searchTerm ? 'Quitar búsqueda' : undefined}
                  onAction={searchTerm ? () => setSearchTerm('') : undefined}
                />
              ) : filteredFoods.map(food => (
                <button key={food.id} onClick={() => handleSelectFood(food)}
                  className="w-full flex items-center gap-3 p-4 bg-surface hover:bg-raised rounded-control border border-hairline hover:border-accent/40 text-left transition-all group"
                >
                  {isSearchingFoods && (
                    <span className={`text-caption font-mono font-bold px-2 rounded-control border flex-shrink-0 ${CAT_BG[food.category]} ${CAT_COLOR[food.category]}`}>
                      {food.category.replace('_', ' ')}
                    </span>
                  )}
                  <span className="flex-1 block font-sans text-label text-white group-hover:text-accent transition-colors leading-snug">{food.label}</span>
                  <span className="material-symbols-outlined text-ink-2 group-hover:text-accent transition-colors select-none text-title-s flex-shrink-0">add_circle</span>
                </button>
              ))}
            </div>
        </Sheet>
      )}

      {/* Hoja de ajuste (F3.8, panel 02) — steppers por macro, píldora de encaje en vivo */}
      {adjustMealId && selectedDiet && (() => {
        const meal = selectedDiet.meals.find(m => m.id === adjustMealId);
        if (!meal) return null;
        const mi = selectedDiet.meals.indexOf(meal);
        // Intercambios que ya cuentan otras ingestas registradas (excluye esta,
        // que el ajuste va a sustituir por completo).
        const otherMealsEaten = BUDGET_CATS.reduce((s, c) => s + (doneByCat[c] - (mealDoneByCat[adjustMealId]?.[c] ?? 0)), 0);
        const draftTotal = adjustDraft.HC + adjustDraft.PROT + adjustDraft.GRASA;
        const after = round2(totalBudget - otherMealsEaten - draftTotal);
        const fits = after >= 0;
        return (
          <Sheet open onClose={() => setAdjustMealId(null)} label={`Ajustar ${mealLabel(meal.name, mi + 1)}`}>
            <div className="pt-2">
              <span className="inline-block px-2 py-1 rounded-control bg-accent-bg font-mono text-caption font-bold tracking-[.12em] text-accent">
                INGESTA {mi + 1}
              </span>
              <h2 className="font-display font-black text-title-l uppercase leading-tight tracking-tight text-ink mt-3">
                {mealLabel(meal.name, mi + 1)}
              </h2>

              <div className="flex flex-col gap-3 mt-5">
                {BUDGET_CATS.map(cat => (
                  <div key={cat} className="flex items-center justify-between gap-3 bg-field border border-hairline rounded-field px-3 py-3">
                    <div className="flex-1">
                      <span className="block font-mono text-caption font-semibold tracking-[.1em] text-ink-3">{BAR_LABEL[cat]}</span>
                      <span className="block font-sans text-body-s text-ink-3 mt-2">
                        {fmtQty(adjustDraft[cat] * GRAMS_PER_EXCHANGE[cat])} g aprox.
                      </span>
                    </div>
                    <Stepper
                      label={`Intercambios de ${BAR_LABEL[cat].toLowerCase()}`}
                      value={adjustDraft[cat]}
                      onChange={v => setAdjustDraft(prev => ({ ...prev, [cat]: v }))}
                      step={0.25}
                      min={0}
                      max={12}
                      dense
                    />
                  </div>
                ))}
              </div>

              <div className={`flex items-center gap-2 mt-5 px-4 py-3 rounded-field border transition-colors duration-(--duration-state) ${fits ? 'bg-success/10 border-success/30 text-success' : 'bg-danger/10 border-danger/30 text-danger'}`}>
                <span className={`h-1.5 w-1.5 rounded-full flex-none ${fits ? 'bg-success' : 'bg-danger'}`} />
                <span className="font-mono text-label font-semibold tracking-[.04em]">
                  {fits ? `CABE · TE QUEDARÍAN ${fmtQty(after)}` : `TE PASAS EN ${fmtQty(Math.abs(after))} INTERCAMBIOS`}
                </span>
              </div>

              <Button variant="primary" size="l" fullWidth onClick={handleConfirmAdjust} className="mt-3">
                Registrar ingesta
              </Button>
              <p className="text-center font-mono text-caption tracking-[.08em] text-ink-4 mt-4">
                CADA TOQUE = 1 INTERCAMBIO · {Math.round(exchangeToKcal({ HC: 1, PROT: 0, GRASA: 0 }))} KCAL
              </p>
            </div>
          </Sheet>
        );
      })()}

      {/* Save-choice sheet — only when saving edits to a diet the coach created */}
      {saveChoiceOpen && (
        <Sheet
          open
          onClose={() => setSaveChoiceOpen(false)}
          title="¿Cómo quieres guardar?"
          size="m"
          footer={<Button variant="ghost" onClick={() => setSaveChoiceOpen(false)} fullWidth>Cancelar</Button>}
        >
          <div className="space-y-3">
            <p className="text-label text-ink-2">
              Esta dieta la creó tu entrenador. Puedes actualizarla directamente o guardar tus
              cambios como una dieta nueva tuya, sin tocar la original.
            </p>
            <button
              onClick={handleUpdateInPlace}
              disabled={saving}
              className="w-full flex items-center gap-2 p-4 bg-surface hover:bg-raised rounded-control border border-hairline hover:border-accent/40 text-left transition-all disabled:opacity-40"
            >
              <Icon name="edit" size="m" className="text-accent" />
              <span className="text-body-s text-white font-sans">Actualizar esta dieta</span>
            </button>
            <button
              onClick={handleSaveAsNew}
              disabled={saving}
              className="w-full flex items-center gap-2 p-4 bg-surface hover:bg-raised rounded-control border border-hairline hover:border-accent/40 text-left transition-all disabled:opacity-40"
            >
              <Icon name="bookmark_add" size="m" className="text-data" />
              <span className="text-body-s text-white font-sans">Guardar como nueva dieta mía</span>
            </button>
          </div>
        </Sheet>
      )}

      {/* Choose which diet to add a recipe to (hand-off from Recetas, first step) */}
      {chooseDietForRecipe && (
        <Sheet
          open
          onClose={() => setChooseDietForRecipe(null)}
          title={`¿A qué dieta añadir "${chooseDietForRecipe.name}"?`}
          size="m"
          footer={<Button variant="ghost" onClick={() => setChooseDietForRecipe(null)} fullWidth>Cancelar</Button>}
        >
            <div className="space-y-2 pt-2">
              {allDietsList.map(dt => (
                <button
                  key={dt.id}
                  onClick={() => handleChooseDietForRecipe(dt)}
                  className="w-full flex items-center justify-between p-4 bg-surface hover:bg-raised rounded-control border border-hairline hover:border-accent/40 text-left transition-all"
                >
                  <span className="text-body-s text-white font-sans truncate">{dt.name}</span>
                  <span className="material-symbols-outlined text-ink-2 text-title-s flex-shrink-0">add_circle</span>
                </button>
              ))}
              <button
                onClick={() => handleChooseDietForRecipe('new')}
                className="w-full flex items-center justify-between p-4 bg-surface hover:bg-raised rounded-control border border-dashed border-accent/40 hover:border-accent text-left transition-all"
              >
                <span className="text-body-s text-accent font-sans font-bold">Nueva dieta</span>
                <span className="material-symbols-outlined text-accent text-title-s flex-shrink-0">add_circle</span>
              </button>
            </div>
        </Sheet>
      )}

      {/* Choose which meal to add a recipe to (hand-off from Recetas, multi-meal case) */}
      {chooseMealForRecipe && selectedDiet && (
        <Sheet
          open
          onClose={() => setChooseMealForRecipe(null)}
          title={`¿A qué comida añadir "${chooseMealForRecipe.name}"?`}
          size="m"
          footer={<Button variant="ghost" onClick={() => setChooseMealForRecipe(null)} fullWidth>Cancelar</Button>}
        >
            <div className="space-y-2 pt-2">
              {selectedDiet.meals.map((meal, mi) => (
                <button
                  key={meal.id}
                  onClick={() => { addRecipeToMeal(chooseMealForRecipe, meal.id, selectedDiet); setChooseMealForRecipe(null); }}
                  className="w-full flex items-center justify-between p-4 bg-surface hover:bg-raised rounded-control border border-hairline hover:border-accent/40 text-left transition-all"
                >
                  <span className="text-body-s text-white font-sans">{mealLabel(meal.name, mi + 1)}</span>
                  <span className="material-symbols-outlined text-ink-2 text-title-s">add_circle</span>
                </button>
              ))}
            </div>
        </Sheet>
      )}
    </div>
  );
}
