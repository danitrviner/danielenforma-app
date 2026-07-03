import React, { useState, useEffect, useMemo } from 'react';
import { UserProfile, Diet, DietMeal, DietItem, FoodCategory, DietMode, MealItem, Recipe, RecipeFavorites, WeekDay, NutritionProgram } from '../types';
import { getDietsForAthlete, getAthleteDietConfig, saveAthleteDietConfig, createDiet, updateDiet, getFoodItems, seedFoodItemsIfEmpty, getAthleteNutritionConfig, getRecipes, getRecipeFavorites, getNutritionProgram, saveNutritionProgram, computeActivePhase, createNotificationDeduped, getDietCompletionLog, saveDietCompletionLog } from '../dbService';
import { DietNumerosView } from './DietMealsView';
import { CATS, BUDGET_CATS, CAT_LABEL, CAT_COLOR, CAT_BG, MODE_LABEL, round2, fmtQty, itemWeightLabel, addToPlaced } from '../utils/exchangeHelpers';
import { findSimilarRecipes } from '../utils/recipeMatch';

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
  // Diets
  const [selectedDiet, setSelectedDiet] = useState<Diet | null>(null);
  const [savedDietSnapshot, setSavedDietSnapshot] = useState('');
  const [loading, setLoading] = useState(true);
  const [saveChoiceOpen, setSaveChoiceOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [flashMsg, setFlashMsg] = useState('');

  // Per-item state (ephemeral, day-only)
  const [itemStates, setItemStates] = useState<Record<string, ItemState>>({});

  // Food library + modes
  const [foodItems, setFoodItems] = useState<MealItem[]>([]);
  const [enabledModes, setEnabledModes] = useState<DietMode[]>(['OMNIVORO']);
  const [activeDietMode, setActiveDietMode] = useState<DietMode>('OMNIVORO');

  // Food picker — itemIdx null means "add a new item", a number means "swap that item"
  const [pickerItem, setPickerItem] = useState<{ mealId: string; itemIdx: number | null; category: FoodCategory } | null>(null);
  const [pickerCategory, setPickerCategory] = useState<FoodCategory>('HC');
  const [searchTerm, setSearchTerm] = useState('');

  // Recipe picker
  const [recipes, setRecipes]                       = useState<Recipe[]>([]);
  const [recipeFavorites, setRecipeFavorites]       = useState<RecipeFavorites>({ athleteId: profile.email, recipeIds: [] });
  const [recipePickerMealId, setRecipePickerMealId] = useState<string | null>(null);
  const [recipeSearch, setRecipeSearch]             = useState('');
  const [recipeCatFilter, setRecipeCatFilter]       = useState<string>('all');
  // Tracks how many items each meal had originally (before any recipe was applied)
  const [origItemCounts, setOrigItemCounts]         = useState<Record<string, number>>({});

  // Recipe swap ("Cambiar comida")
  const [swapContext, setSwapContext] = useState<{ mealId: string; recipeId: string } | null>(null);

  // "Añadir a Intercambios" desde Recetas — con varias comidas, hay que elegir a cuál
  const [chooseMealForRecipe, setChooseMealForRecipe] = useState<Recipe | null>(null);

  // Weekly schedule
  const [allDietsList, setAllDietsList]     = useState<Diet[]>([]);
  const [weeklySchedule, setWeeklySchedule] = useState<Partial<Record<WeekDay, string | null>>>({});
  const [viewDay, setViewDay]               = useState<WeekDay>(TODAY_WD);

  // Nutrition periodization
  const [phaseBanner, setPhaseBanner] = useState<string | null>(null);
  const [nutritionProgram, setNutritionProgram] = useState<NutritionProgram | null>(null);

  function flash(msg: string) {
    setFlashMsg(msg);
    setTimeout(() => setFlashMsg(''), 3000);
  }

  // ── Load on mount ────────────────────────────────────────────────────────────
  // Phase 1: diets + config BEFORE seedFoodItemsIfEmpty, which on Firestore failure
  // calls setLocalBypassMode(true) internally — poisoning subsequent queries.
  // Phase 2: food library seeding runs independently, after diet data is secured.

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        // Phase 1 — diet/config always queries Firestore with a clean bypass flag
        const [config, allDiets, dietConfigRaw, program] = await Promise.all([
          getAthleteNutritionConfig(profile.email).catch(() => null),
          getDietsForAthlete(profile.email),
          getAthleteDietConfig(profile.email).catch(() => null),
          getNutritionProgram(profile.email).catch(() => null),
        ]);

        if (cancelled) return;

        if (config && config.enabledModes.length > 0) {
          setEnabledModes(config.enabledModes);
          setActiveDietMode(config.enabledModes[0]);
        }

        // Apply nutrition program phase if active
        let dietConfig = dietConfigRaw;
        if (program && program.phases.length > 0) {
          setNutritionProgram(program);
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
            }
            if (program.lastSeenPhaseId !== activePhase.id) {
              setPhaseBanner(`Tu plan de nutrición cambió a: ${activePhase.name}`);
              await saveNutritionProgram({ ...program, lastSeenPhaseId: activePhase.id }).catch(() => {});
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
        const active = allDiets.filter(d => activeIds.has(d.id));
        const schedule = dietConfig?.weeklySchedule ?? {};
        setAllDietsList(allDiets);
        setWeeklySchedule(schedule);

        const rememberedId = localStorage.getItem(`enforma_intercambios_diet_${profile.email}`);
        const todayId = schedule[TODAY_WD] ?? null;
        const initDiet: Diet | null =
          (todayId && allDiets.find(d => d.id === todayId)) ||
          (rememberedId && allDiets.find(d => d.id === rememberedId)) ||
          (active.length >= 1 ? active[0] : null) ||
          (allDiets.length >= 1 ? allDiets[0] : null);
        if (initDiet) {
          setSelectedDiet(initDiet);
          setSavedDietSnapshot(dietSnapshot(initDiet));
          const counts: Record<string, number> = {};
          initDiet.meals.forEach(m => { counts[m.id] = m.items.length; });
          setOrigItemCounts(counts);
        }

        // Phase 2 — food library + recipes; seed failure must not affect diet data already set
        await seedFoodItemsIfEmpty().catch(() => {});
        if (cancelled) return;

        const [foods, recs, favs] = await Promise.all([
          getFoodItems(),
          getRecipes().catch(() => [] as Recipe[]),
          getRecipeFavorites(profile.email).catch(() => ({ athleteId: profile.email, recipeIds: [] } as RecipeFavorites)),
        ]);
        if (!cancelled) {
          setFoodItems(foods);
          setRecipes(recs);
          setRecipeFavorites(favs);
        }
      } catch (err) {
        if (!cancelled) console.error('NutritionScreen load error:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [profile.email]);

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

  const filteredFoods = useMemo(() =>
    foodItems.filter(f =>
      f.mode === activeDietMode &&
      f.category === pickerCategory &&
      (!searchTerm || f.label.toLowerCase().includes(searchTerm.toLowerCase()))
    ),
    [foodItems, activeDietMode, pickerCategory, searchTerm]
  );

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
      // Add a brand-new item to the meal
      const meal = selectedDiet.meals.find(m => m.id === mealId);
      if (!meal) { setPickerItem(null); return; }
      const newIdx = meal.items.length;
      const newItem: DietItem = { category: food.category, foodLabel: food.label, quantity: 1 };
      setSelectedDiet(prev => {
        if (!prev) return prev;
        return { ...prev, meals: prev.meals.map(m => m.id !== mealId ? m : { ...m, items: [...m.items, newItem] }) };
      });
      setItemStates(prev => ({ ...prev, [`${mealId}_${newIdx}`]: { foodLabel: newItem.foodLabel, done: false } }));
    } else {
      // Swap an existing item in place
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
    }
    setPickerItem(null);
  };

  // ── Recipe picker handlers ─────────────────────────────────────────────────

  const handleOpenRecipePicker = (mealId: string) => {
    setRecipePickerMealId(mealId);
    setRecipeSearch('');
    setRecipeCatFilter('all');
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
    const newItems: DietItem[] = recipe.ingredients
      .filter(ing => enabledModes.includes(ing.mode))
      .map(ing => ({ category: ing.category, foodLabel: ing.foodLabel, quantity: ing.quantity, originRecipeId: recipe.id }));
    if (newItems.length === 0) return;
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
    if (!selectedDiet) {
      // No menu loaded yet — start a blank one and add the recipe to its first meal
      const blank = blankDiet(profile.email);
      const newItems: DietItem[] = pendingRecipe.ingredients
        .filter(ing => enabledModes.includes(ing.mode))
        .map(ing => ({ category: ing.category, foodLabel: ing.foodLabel, quantity: ing.quantity, originRecipeId: pendingRecipe.id }));
      blank.meals[0].items = newItems;
      handleSelectDiet(blank, { skipDirtyCheck: true });
      onConsumedPendingRecipe?.();
      return;
    }
    if (selectedDiet.meals.length === 1) {
      addRecipeToMeal(pendingRecipe, selectedDiet.meals[0].id, selectedDiet);
      onConsumedPendingRecipe?.();
    } else {
      setChooseMealForRecipe(pendingRecipe);
      onConsumedPendingRecipe?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingRecipe, loading]);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="w-full space-y-6">
      <div>
        <h1 className="font-sans font-extrabold text-3xl text-white tracking-tight">Nutrición</h1>
        <p className="text-[#c6c9ab] text-sm mt-1">Construye tu menú del día con intercambios y guárdalo en Mis Dietas.</p>
      </div>

      {flashMsg && (
        <div className="flex items-center gap-2 bg-[#fbcb1a]/10 border border-[#fbcb1a]/25 text-white px-4 py-3 rounded-xl text-sm">
          <span className="material-symbols-outlined text-[#fbcb1a] text-base">check_circle</span>
          {flashMsg}
        </div>
      )}

      {/* Phase change banner */}
      {phaseBanner && (
        <div className="flex items-center justify-between gap-3 bg-[#00eefc]/10 border border-[#00eefc]/30 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#00eefc] text-lg flex-shrink-0">swap_horiz</span>
            <p className="font-sans font-bold text-[#00eefc] text-sm">{phaseBanner}</p>
          </div>
          <button
            onClick={() => setPhaseBanner(null)}
            className="text-[#00eefc]/60 hover:text-[#00eefc] transition-colors flex-shrink-0"
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>
      )}

      {/* Diet mode selector */}
      {enabledModes.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {enabledModes.map(mode => (
            <button key={mode} onClick={() => setActiveDietMode(mode)}
              className={`px-4 py-2 rounded-xl font-mono text-xs font-bold uppercase tracking-wider transition-all ${
                activeDietMode === mode
                  ? 'bg-[#fbcb1a] text-black shadow-md'
                  : 'bg-[#1c1b1b] text-[#c6c9ab] border border-white/7 hover:border-[#fbcb1a]/40 hover:text-white'
              }`}
            >{MODE_LABEL[mode]}</button>
          ))}
        </div>
      )}

      {/* Week schedule navigation */}
      {!loading && WD_ORDER.some(d => typeof weeklySchedule[d] === 'string') && (
        <div className="flex gap-1.5">
          {WD_ORDER.map(day => {
            const isToday = day === TODAY_WD;
            const isViewing = day === viewDay;
            const hasDiet = typeof weeklySchedule[day] === 'string';
            return (
              <button
                key={day}
                onClick={() => setViewDay(day)}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 rounded-xl font-mono text-[11px] font-bold uppercase tracking-wider border transition-all ${
                  isViewing
                    ? 'bg-[#fbcb1a]/10 border-[#fbcb1a]/50 text-[#fbcb1a]'
                    : isToday
                    ? 'bg-[#1c1b1b] border-[#3a3a3a] text-white'
                    : 'bg-[#1e1e1b] border-white/7 text-[#c6c9ab] hover:border-[#3a3a3a] hover:text-white'
                }`}
              >
                <span>{WD_SHORT[day]}</span>
                <span className={`w-1 h-1 rounded-full ${isToday ? 'bg-[#fbcb1a]' : hasDiet ? 'bg-[#00eefc]/50' : 'bg-transparent'}`} />
              </button>
            );
          })}
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 font-mono text-sm text-[#c6c9ab] animate-pulse">Cargando dieta...</div>
      ) : allDietsList.length === 0 && !selectedDiet ? (
        <div className="text-center py-16 border border-dashed border-white/7 rounded-2xl">
          <span className="material-symbols-outlined text-4xl text-[#2a2a2a] block mb-3">nutrition</span>
          <p className="text-[#c6c9ab] text-sm font-sans">Aún no tienes ningún menú.</p>
          <p className="text-[#c6c9ab] text-xs font-mono mt-1 mb-4">Crea tu propio menú con alimentos y recetas hasta completar tus intercambios.</p>
          <button
            onClick={handleStartBlank}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#fbcb1a] text-black font-sans font-bold text-xs uppercase rounded-lg hover:bg-[#d4a800] active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            Crear mi primer menú
          </button>
        </div>
      ) : viewDay !== TODAY_WD ? (() => {
        const browseDietId = weeklySchedule[viewDay] ?? null;
        const browseDiet = browseDietId ? allDietsList.find(d => d.id === browseDietId) ?? null : null;
        return (
          <div className="space-y-4">
            <div className="bg-[#1c1b1b] rounded-xl p-4 border border-white/7">
              <span className="block font-mono text-[9px] text-[#c6c9ab] uppercase tracking-widest font-bold mb-1">
                {WD_FULL[viewDay].charAt(0).toUpperCase() + WD_FULL[viewDay].slice(1)}
              </span>
              {browseDiet ? (
                <>
                  <span className="block font-sans font-bold text-lg text-white leading-tight">{browseDiet.name}</span>
                  {browseDiet.coachNote && (
                    <span className="block text-xs text-[#00eefc] italic mt-1">{browseDiet.coachNote}</span>
                  )}
                  <div className="flex gap-2 mt-3 flex-wrap">
                    {BUDGET_CATS.map(cat => {
                      const b = browseDiet.budget[cat];
                      return b > 0 ? (
                        <span key={cat} className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded-lg border ${CAT_BG[cat]} ${CAT_COLOR[cat]}`}>
                          {cat}: {b} int.
                        </span>
                      ) : null;
                    })}
                  </div>
                </>
              ) : (
                <span className="block font-sans text-[#c6c9ab] text-sm mt-1">Día libre — sin dieta programada.</span>
              )}
            </div>
            <button
              onClick={() => setViewDay(TODAY_WD)}
              className="w-full py-2.5 rounded-xl border border-[#fbcb1a]/30 text-[#fbcb1a] font-mono text-xs font-bold uppercase tracking-wider hover:bg-[#fbcb1a]/10 transition-all"
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
                  className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-mono text-xs font-bold uppercase tracking-wider transition-all ${
                    selectedDiet?.id === dt.id
                      ? 'bg-[#fbcb1a] text-black shadow-md'
                      : 'bg-[#1c1b1b] text-[#c6c9ab] border border-white/7 hover:border-[#fbcb1a]/40 hover:text-white'
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
                className="flex items-center gap-1 px-3 py-2.5 rounded-xl border border-dashed border-white/7 text-[#c6c9ab] hover:border-[#fbcb1a]/40 hover:text-[#fbcb1a] font-mono text-xs font-bold uppercase tracking-wider transition-all"
              >
                <span className="material-symbols-outlined text-sm">add</span>
                Nuevo
              </button>
            </div>
          )}

          {selectedDiet && (
            <React.Fragment key={selectedDiet.id}>
              {/* Diet header */}
              <div className="bg-[#1c1b1b] rounded-xl p-4 border border-white/7">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="font-mono text-[9px] text-[#c6c9ab] uppercase tracking-widest font-bold">
                    {selectedDiet.selfManaged ? 'TU MENÚ' : 'DIETA DE TU ENTRENADOR'}
                  </span>
                  <span className="font-mono text-[9px] text-[#fbcb1a] uppercase tracking-widest font-bold">Hoy, {WD_FULL[TODAY_WD]}</span>
                </div>
                <input
                  type="text"
                  value={selectedDiet.name}
                  onChange={e => renameDiet(e.target.value)}
                  className="block w-full bg-transparent border-none font-sans font-bold text-lg text-white leading-tight focus:outline-none focus:ring-0 p-0"
                />
                {selectedDiet.coachNote && (
                  <span className="block font-sans text-xs text-[#00eefc] italic mt-1">{selectedDiet.coachNote}</span>
                )}
                <span className="block font-mono text-[9px] text-[#c6c9ab] mt-1.5">
                  {selectedDiet.meals.length} comida{selectedDiet.meals.length !== 1 ? 's' : ''} · {selectedDiet.meals.reduce((s, m) => s + m.items.length, 0)} alimentos
                </span>
              </div>

              {/* Objetivo diario de intercambios (editable) */}
              <div className="bg-[#181816] border border-white/7 rounded-2xl p-4">
                <p className="font-mono text-[9px] text-[#c6c9ab] uppercase tracking-wider mb-3">
                  Objetivo diario de intercambios
                </p>
                <div className="grid grid-cols-3 gap-3">
                  {BUDGET_CATS.map(cat => (
                    <div key={cat}>
                      <label className={`block font-mono text-[9px] font-bold mb-1 ${CAT_COLOR[cat]}`}>{CAT_LABEL[cat]}</label>
                      <input
                        type="number"
                        min={0}
                        step={0.25}
                        value={selectedDiet.budget[cat]}
                        onChange={e => updateBudgetCat(cat, parseFloat(e.target.value) || 0)}
                        className="w-full bg-[#1e1e1b] border border-white/7 rounded-xl px-2 py-1.5 text-white text-xs focus:outline-none focus:border-[#fbcb1a]/50"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Budget dashboard */}
              <div className="bg-[#181816] border border-white/7 rounded-2xl p-4">
                <p className="font-mono text-[9px] text-[#c6c9ab] uppercase tracking-wider mb-3">
                  Progreso por categoría
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2.5">
                  {BUDGET_CATS.map(cat => {
                    const b = selectedDiet.budget[cat];
                    const d = doneByCat[cat];
                    const isOver = b > 0 && d > b;
                    const isOk = b > 0 && round2(d) === round2(b);
                    const pct = b > 0 ? Math.min(100, (d / b) * 100) : (d > 0 ? 100 : 0);
                    const barColor = isOver ? 'bg-red-500' : isOk ? 'bg-green-400' : 'bg-[#fbcb1a]';
                    return (
                      <div key={cat}>
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-[9px] font-mono font-bold ${CAT_COLOR[cat]}`}>
                            {cat.replace('_', ' ')}
                          </span>
                          <span className={`text-[9px] font-mono font-bold ${isOver ? 'text-red-400' : isOk ? 'text-green-400' : 'text-white'}`}>
                            {fmtQty(d)}{b > 0 ? `/${fmtQty(b)}` : ''}{isOk ? ' ✓' : isOver ? ' !' : ''}
                          </span>
                        </div>
                        <div className="h-1 w-full bg-[#1c1b1b] rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all duration-300 ${barColor}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Overall progress bar */}
              <div className="bg-[#181816] border border-white/7 p-4 rounded-2xl">
                <div className="flex justify-between items-end mb-2">
                  <h2 className="font-sans font-bold text-sm text-[#e5e2e1] uppercase tracking-wide">Completados hoy</h2>
                  <span className="font-mono text-xs text-[#fbcb1a] font-bold">{doneItems} / {totalItems}</span>
                </div>
                <div className="h-2 w-full bg-[#1c1b1b] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#fbcb1a] rounded-full transition-all duration-500 volt-glow"
                    style={{ width: `${totalItems > 0 ? (doneItems / totalItems) * 100 : 0}%` }}
                  />
                </div>
              </div>

              {/* Resumen numérico (colocado/objetivo por comida + total del día) — siempre visible */}
              <DietNumerosView meals={selectedDiet.meals} budget={selectedDiet.budget} />

              <div className="space-y-4">
                {selectedDiet.meals.map((meal, mi) => {
                  const mealDone = meal.items.length > 0 && meal.items.every((_, idx) => itemStates[`${meal.id}_${idx}`]?.done);
                  return (
                    <div key={meal.id}
                      className={`bg-[#201f1f] rounded-xl overflow-hidden border transition-all ${mealDone ? 'border-[#fbcb1a]/40' : 'border-white/7'}`}
                    >
                      {/* Meal header */}
                      <div className="px-4 py-3 bg-[#1c1b1b]/80 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <span className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${mealDone ? 'bg-[#fbcb1a] border-[#fbcb1a]' : 'border-[#3a3a3a]'}`}>
                            {mealDone && <span className="material-symbols-outlined text-black" style={{ fontSize: '13px' }}>check</span>}
                          </span>
                          <input
                            type="text"
                            value={meal.name}
                            onChange={e => renameMeal(meal.id, e.target.value)}
                            placeholder={`Comida ${mi + 1}`}
                            className="min-w-0 flex-1 bg-transparent border-none font-sans font-bold text-white text-base focus:outline-none focus:ring-0 p-0"
                          />
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="font-mono text-[9px] text-[#c6c9ab] hidden sm:block">
                            {meal.items.length} alimento{meal.items.length !== 1 ? 's' : ''}
                          </span>
                          <button
                            onClick={() => handleOpenAddPicker(meal.id)}
                            title="Añadir alimento"
                            className="flex items-center gap-1 px-2 py-1 rounded-xl bg-[#1e1e1b] border border-white/7 hover:border-[#fbcb1a]/50 hover:text-[#fbcb1a] text-[#c6c9ab] transition-all"
                          >
                            <span className="material-symbols-outlined text-xs select-none">add_circle</span>
                            <span className="font-mono text-[10px] uppercase tracking-wider hidden sm:block">Alimento</span>
                          </button>
                          {recipes.length > 0 && (
                            <button
                              onClick={() => handleOpenRecipePicker(meal.id)}
                              title="Usar receta"
                              className="flex items-center gap-1 px-2 py-1 rounded-xl bg-[#1e1e1b] border border-white/7 hover:border-[#fbcb1a]/50 hover:text-[#fbcb1a] text-[#c6c9ab] transition-all"
                            >
                              <span className="material-symbols-outlined text-xs select-none">skillet</span>
                              <span className="font-mono text-[10px] uppercase tracking-wider hidden sm:block">Receta</span>
                            </button>
                          )}
                          {selectedDiet.meals.length > 1 && (
                            <button
                              onClick={() => removeMeal(meal.id)}
                              title="Quitar comida"
                              className="text-[#c6c9ab] hover:text-red-400 transition-colors p-1"
                            >
                              <span className="material-symbols-outlined text-sm select-none">delete</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Per-meal target + progress (only when targets are set) */}
                      {CATS.some(c => (meal.target?.[c] ?? 0) > 0) && (() => {
                        const mDone = mealDoneByCat[meal.id] ?? {} as Record<FoodCategory, number>;
                        const targetCats = CATS.filter(c => (meal.target?.[c] ?? 0) > 0);
                        return (
                          <div className="px-4 py-2 bg-[#0e0e0e]/60 border-b border-white/60 flex flex-wrap gap-x-3 gap-y-1.5 items-center">
                            {targetCats.map(cat => {
                              const tgt = meal.target![cat]!;
                              const d = mDone[cat] ?? 0;
                              const isOk = round2(d) >= round2(tgt);
                              const isOver = d > tgt;
                              return (
                                <div key={cat} className="flex items-center gap-1">
                                  <span className={`font-mono text-[9px] font-bold ${CAT_COLOR[cat]}`}>
                                    {cat.replace('_', ' ')}
                                  </span>
                                  <span className={`font-mono text-[9px] ${isOver ? 'text-red-400' : isOk ? 'text-green-400' : 'text-[#c6c9ab]'}`}>
                                    {fmtQty(d)}/{fmtQty(tgt)}{isOk ? ' ✓' : ''}
                                  </span>
                                  <div className="w-10 h-1 bg-[#1c1b1b] rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full transition-all duration-300 ${isOver ? 'bg-red-500' : isOk ? 'bg-green-400' : 'bg-[#fbcb1a]'}`}
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
                      <div className="p-3 border-t border-white/60 bg-[#111110]/40 space-y-2">
                        {meal.items.length === 0 ? (
                          <p className="text-center py-3 font-mono text-[10px] text-[#c6c9ab] italic">Sin alimentos en esta comida.</p>
                        ) : meal.items.map((item, idx) => {
                          const key = `${meal.id}_${idx}`;
                          const st = itemStates[key] ?? { foodLabel: item.foodLabel, done: false };
                          return (
                            <div key={key}
                              className={`flex items-center gap-2.5 p-3 rounded-lg border transition-all ${st.done ? 'bg-[#181816] border-[#fbcb1a]/20 opacity-75' : 'bg-[#181816] border-white/7'}`}
                            >
                              {/* Checkbox */}
                              <button
                                onClick={() => handleToggleDone(meal.id, idx)}
                                className={`w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center transition-all ${st.done ? 'bg-[#fbcb1a] text-black border-transparent' : 'border border-[#c6c9ab]/40 hover:border-[#fbcb1a]'}`}
                              >
                                {st.done && <span className="material-symbols-outlined text-sm font-black">check</span>}
                              </button>

                              {/* Category badge */}
                              <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border flex-shrink-0 ${CAT_BG[item.category]} ${CAT_COLOR[item.category]}`}>
                                {item.category.replace('_', ' ')}
                              </span>

                              {/* Food label + qty + weight */}
                              <div className="flex-1 min-w-0">
                                <span className={`block text-xs font-sans leading-snug ${st.done ? 'line-through text-[#c6c9ab]' : 'text-white'}`}>
                                  {st.foodLabel}
                                </span>
                                <span className="block font-mono text-[9px] text-[#c6c9ab] mt-0.5">
                                  ×{fmtQty(item.quantity)} · {itemWeightLabel(item.foodLabel, item.quantity)}
                                </span>
                              </div>

                              {/* Cambiar comida — only on the first item of a recipe-derived group */}
                              {item.originRecipeId && meal.items.findIndex(it => it.originRecipeId === item.originRecipeId) === idx && (
                                <button
                                  onClick={() => handleOpenSwapPicker(meal.id, item.originRecipeId!)}
                                  title="Cambiar comida"
                                  className="text-[#c6c9ab] hover:text-[#fbcb1a] transition-colors flex-shrink-0 p-1.5 -m-1.5"
                                >
                                  <span className="material-symbols-outlined text-sm select-none">skillet</span>
                                </button>
                              )}
                              {/* Swap button */}
                              <button
                                onClick={() => handleOpenPicker(meal.id, idx, item.category)}
                                title="Cambiar alimento"
                                className="text-[#c6c9ab] hover:text-[#00eefc] transition-colors flex-shrink-0 p-1.5 -m-1.5"
                              >
                                <span className="material-symbols-outlined text-sm select-none">swap_horiz</span>
                              </button>
                              {/* Delete button — only for recipe-added items */}
                              {idx >= (origItemCounts[meal.id] ?? Infinity) && (
                                <button
                                  onClick={() => handleRemoveItem(meal.id, idx)}
                                  title="Quitar"
                                  className="text-[#c6c9ab] hover:text-red-400 transition-colors flex-shrink-0 p-1.5 -m-1.5"
                                >
                                  <span className="material-symbols-outlined text-sm select-none">close</span>
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                <button
                  onClick={addMeal}
                  className="w-full py-2.5 rounded-xl border border-dashed border-white/7 text-[#c6c9ab] font-mono text-xs font-bold uppercase tracking-wider hover:border-[#fbcb1a]/40 hover:text-[#fbcb1a] transition-all"
                >
                  + Añadir comida
                </button>
              </div>

              {/* Guardar */}
              <div className="sticky bottom-20 md:bottom-4 flex items-center justify-between gap-3 bg-[#1c1b1b] border border-white/7 rounded-xl p-3 shadow-2xl">
                <span className="font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider pl-1">
                  {!isPersisted || isDirty ? 'Cambios sin guardar' : 'Todo guardado'}
                </span>
                <button
                  onClick={handleSaveDiet}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[#fbcb1a] text-black font-sans font-bold text-xs uppercase rounded-lg hover:bg-[#d4a800] active:scale-95 transition-all disabled:opacity-40"
                >
                  <span className="material-symbols-outlined text-sm">save</span>
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
          <div className="fixed inset-0 bg-black/85 z-[100] flex items-end justify-center p-0 md:p-4">
            <div className="bg-[#1c1b1b] border-t md:border border-white/7 w-full max-w-lg rounded-t-2xl md:rounded-xl max-h-[85vh] flex flex-col overflow-hidden">
              {/* Header */}
              <div className="p-4 border-b border-white/7 flex items-center justify-between sticky top-0 bg-[#1c1b1b] z-10">
                <div>
                  <h3 className="font-sans font-bold text-lg text-white flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#fbcb1a] text-base">skillet</span>
                    Usar receta
                  </h3>
                  {targetMeal && (
                    <span className="font-mono text-[10px] text-[#c6c9ab] uppercase">
                      {mealLabel(targetMeal.name, (selectedDiet?.meals.indexOf(targetMeal) ?? 0) + 1)}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setRecipePickerMealId(null)}
                  className="text-white bg-[#2a2a2a] hover:bg-[#3e3e3e] p-1.5 h-8 w-8 rounded-full flex items-center justify-center transition-colors"
                >
                  <span className="material-symbols-outlined text-sm select-none">close</span>
                </button>
              </div>

              {/* Search */}
              <div className="px-4 py-2 bg-[#181816] flex items-center gap-2 border-b border-white/7">
                <span className="material-symbols-outlined text-[#c6c9ab] text-sm select-none">search</span>
                <input
                  type="text"
                  placeholder="Buscar receta..."
                  value={recipeSearch}
                  onChange={e => setRecipeSearch(e.target.value)}
                  className="w-full bg-transparent border-none text-white text-xs focus:ring-0 focus:outline-none p-2 placeholder-[#c6c9ab]/45"
                />
              </div>

              {/* Category filter */}
              {availableRecipeCats.length > 0 && (
                <div className="px-4 py-2 bg-[#181816] border-b border-white/7 flex gap-1.5 overflow-x-auto">
                  {[{ id: 'all', label: 'Todas' }, ...availableRecipeCats.map(c => ({ id: c, label: c }))].map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setRecipeCatFilter(cat.id)}
                      className={`px-3 py-1.5 rounded-full font-mono text-[9px] font-bold uppercase tracking-wider whitespace-nowrap transition-all flex-shrink-0 ${
                        recipeCatFilter === cat.id
                          ? 'bg-[#fbcb1a] text-black shadow-md'
                          : 'bg-[#201f1f] text-[#c6c9ab] border border-transparent hover:border-white/7'
                      }`}
                    >{cat.label}</button>
                  ))}
                </div>
              )}

              {/* Recipe list */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                {sortedPickerRecipes.length === 0 ? (
                  <div className="text-center py-10 font-mono text-xs text-[#c6c9ab] italic">
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
                      className="w-full flex items-center gap-3 p-3.5 bg-[#181816] hover:bg-[#201f1f] rounded-2xl border border-white/7 hover:border-[#fbcb1a]/40 text-left transition-all group"
                    >
                      {recipe.photoUrl ? (
                        <img src={recipe.photoUrl} alt={recipe.name} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-[#1c1b1b] border border-white/7 flex items-center justify-center flex-shrink-0">
                          <span className="material-symbols-outlined text-[#c6c9ab] text-xl">skillet</span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          {isFav && (
                            <span className="material-symbols-outlined text-[#fbcb1a] text-xs" style={{ fontVariationSettings: "'FILL' 1", fontSize: '12px' }}>favorite</span>
                          )}
                          <span className="font-sans font-bold text-sm text-white group-hover:text-[#fbcb1a] transition-colors truncate">{recipe.name}</span>
                        </div>
                        {recipe.categories.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-1">
                            {recipe.categories.slice(0, 3).map(c => (
                              <span key={c} className="px-1.5 py-0.5 rounded bg-[#2a2a2a] font-mono text-[8px] text-[#c6c9ab] uppercase">{c}</span>
                            ))}
                          </div>
                        )}
                        <span className="font-mono text-[9px] text-[#fbcb1a]/70">{exchStr}</span>
                      </div>
                      <span className="material-symbols-outlined text-[#c6c9ab] group-hover:text-[#fbcb1a] transition-colors select-none text-base flex-shrink-0">add_circle</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Cambiar comida sheet */}
      {swapContext && (
        <div className="fixed inset-0 bg-black/85 z-[100] flex items-end justify-center p-0 md:p-4">
          <div className="bg-[#1c1b1b] border-t md:border border-white/7 w-full max-w-lg rounded-t-2xl md:rounded-xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-white/7 flex items-center justify-between sticky top-0 bg-[#1c1b1b] z-10">
              <div>
                <h3 className="font-sans font-bold text-lg text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#fbcb1a] text-base">skillet</span>
                  Cambiar comida
                </h3>
                {swapSourceRecipe && (
                  <span className="font-mono text-[10px] text-[#c6c9ab] uppercase">
                    Alternativas a {swapSourceRecipe.name} (±10% kcal)
                  </span>
                )}
              </div>
              <button
                onClick={() => setSwapContext(null)}
                className="text-white bg-[#2a2a2a] hover:bg-[#3e3e3e] p-1.5 h-8 w-8 rounded-full flex items-center justify-center transition-colors"
              >
                <span className="material-symbols-outlined text-sm select-none">close</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
              {swapCandidates.length === 0 ? (
                <div className="text-center py-10 font-mono text-xs text-[#c6c9ab] italic">
                  Sin alternativas nutricionalmente similares disponibles.
                </div>
              ) : swapCandidates.map(recipe => (
                <button
                  key={recipe.id}
                  onClick={() => handleApplySwap(recipe)}
                  className="w-full flex items-center gap-3 p-3.5 bg-[#181816] hover:bg-[#201f1f] rounded-2xl border border-white/7 hover:border-[#fbcb1a]/40 text-left transition-all group"
                >
                  {recipe.photoUrl ? (
                    <img src={recipe.photoUrl} alt={recipe.name} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-[#1c1b1b] border border-white/7 flex items-center justify-center flex-shrink-0">
                      <span className="material-symbols-outlined text-[#c6c9ab] text-xl">skillet</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <span className="font-sans font-bold text-sm text-white group-hover:text-[#fbcb1a] transition-colors truncate block">{recipe.name}</span>
                    <span className="font-mono text-[9px] text-[#fbcb1a]/70">{recipe.kcal} kcal</span>
                  </div>
                  <span className="material-symbols-outlined text-[#c6c9ab] group-hover:text-[#fbcb1a] transition-colors select-none text-base flex-shrink-0">swap_horiz</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Food picker sheet */}
      {pickerItem && (
        <div className="fixed inset-0 bg-black/85 z-[100] flex items-end justify-center p-0 md:p-4">
          <div className="bg-[#1c1b1b] border-t md:border border-white/7 w-full max-w-lg rounded-t-2xl md:rounded-xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-white/7 flex items-center justify-between sticky top-0 bg-[#1c1b1b] z-10">
              <div>
                <h3 className="font-sans font-bold text-lg text-white">{pickerItem.itemIdx === null ? 'Añadir alimento' : 'Cambiar alimento'}</h3>
                <span className="font-mono text-[10px] text-[#c6c9ab] uppercase">
                  {CAT_LABEL[pickerCategory]} · {MODE_LABEL[activeDietMode]}
                </span>
              </div>
              <button onClick={() => setPickerItem(null)} className="text-white bg-[#2a2a2a] hover:bg-[#3e3e3e] p-1.5 h-8 w-8 rounded-full flex items-center justify-center transition-colors">
                <span className="material-symbols-outlined text-sm select-none">close</span>
              </button>
            </div>

            {enabledModes.length > 1 && (
              <div className="px-4 py-2 bg-[#111] border-b border-white/7 flex gap-2 flex-wrap">
                {enabledModes.map(mode => (
                  <button key={mode} onClick={() => setActiveDietMode(mode)}
                    className={`px-3 py-1 rounded-full font-sans text-[10px] font-bold uppercase tracking-wider transition-all ${activeDietMode === mode ? 'bg-[#fbcb1a] text-black' : 'bg-[#201f1f] text-[#c6c9ab] border border-white/7'}`}
                  >{MODE_LABEL[mode]}</button>
                ))}
              </div>
            )}

            <div className="p-3 bg-[#181816] border-b border-white/7 flex gap-1.5 flex-wrap">
              {CATS.map(cat => (
                <button key={cat} onClick={() => setPickerCategory(cat)}
                  className={`px-3 py-1.5 rounded-full font-sans text-[10px] font-bold uppercase tracking-wider transition-all ${pickerCategory === cat ? 'bg-[#fbcb1a] text-black shadow-md' : 'bg-[#201f1f] text-[#c6c9ab] border border-transparent hover:border-white/7'}`}
                >{cat.replace('_', ' ')}</button>
              ))}
            </div>

            <div className="px-4 py-2 bg-[#181816] flex items-center gap-2 border-b border-white/7">
              <span className="material-symbols-outlined text-[#c6c9ab] text-sm select-none">search</span>
              <input type="text" placeholder="Buscar alimento..." value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-transparent border-none text-white text-xs focus:ring-0 focus:outline-none p-2 placeholder-[#c6c9ab]/45"
              />
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
              {filteredFoods.length === 0 ? (
                <div className="text-center py-10 font-mono text-xs text-[#c6c9ab] italic">Ningún alimento coincide.</div>
              ) : filteredFoods.map(food => (
                <button key={food.id} onClick={() => handleSelectFood(food)}
                  className="w-full flex items-center justify-between p-3.5 bg-[#181816] hover:bg-[#201f1f] rounded-lg border border-white/7 hover:border-[#fbcb1a]/40 text-left transition-all group"
                >
                  <span className="block font-sans text-xs text-white group-hover:text-[#fbcb1a] transition-colors leading-snug">{food.label}</span>
                  <span className="material-symbols-outlined text-[#c6c9ab] group-hover:text-[#fbcb1a] transition-colors select-none text-base flex-shrink-0 ml-3">add_circle</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Save-choice sheet — only when saving edits to a diet the coach created */}
      {saveChoiceOpen && (
        <div className="fixed inset-0 bg-black/85 z-[100] flex items-end justify-center p-0 md:p-4">
          <div className="bg-[#1c1b1b] border-t md:border border-white/7 w-full max-w-md rounded-t-2xl md:rounded-xl p-5 space-y-3">
            <h3 className="font-sans font-bold text-lg text-white">¿Cómo quieres guardar?</h3>
            <p className="text-xs text-[#c6c9ab]">
              Esta dieta la creó tu entrenador. Puedes actualizarla directamente o guardar tus
              cambios como una dieta nueva tuya, sin tocar la original.
            </p>
            <button
              onClick={handleUpdateInPlace}
              disabled={saving}
              className="w-full flex items-center gap-2 p-3.5 bg-[#181816] hover:bg-[#201f1f] rounded-xl border border-white/7 hover:border-[#fbcb1a]/40 text-left transition-all disabled:opacity-40"
            >
              <span className="material-symbols-outlined text-[#fbcb1a] text-base">edit</span>
              <span className="text-sm text-white font-sans">Actualizar esta dieta</span>
            </button>
            <button
              onClick={handleSaveAsNew}
              disabled={saving}
              className="w-full flex items-center gap-2 p-3.5 bg-[#181816] hover:bg-[#201f1f] rounded-xl border border-white/7 hover:border-[#fbcb1a]/40 text-left transition-all disabled:opacity-40"
            >
              <span className="material-symbols-outlined text-[#00eefc] text-base">bookmark_add</span>
              <span className="text-sm text-white font-sans">Guardar como nueva dieta mía</span>
            </button>
            <button
              onClick={() => setSaveChoiceOpen(false)}
              className="w-full py-2 text-center font-mono text-[10px] text-[#c6c9ab] hover:text-white uppercase tracking-wider"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Choose which meal to add a recipe to (hand-off from Recetas, multi-meal case) */}
      {chooseMealForRecipe && selectedDiet && (
        <div className="fixed inset-0 bg-black/85 z-[100] flex items-end justify-center p-0 md:p-4">
          <div className="bg-[#1c1b1b] border-t md:border border-white/7 w-full max-w-md rounded-t-2xl md:rounded-xl p-5 space-y-3">
            <h3 className="font-sans font-bold text-lg text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-[#fbcb1a] text-base">skillet</span>
              ¿A qué comida añadir "{chooseMealForRecipe.name}"?
            </h3>
            <div className="space-y-2">
              {selectedDiet.meals.map((meal, mi) => (
                <button
                  key={meal.id}
                  onClick={() => { addRecipeToMeal(chooseMealForRecipe, meal.id, selectedDiet); setChooseMealForRecipe(null); }}
                  className="w-full flex items-center justify-between p-3.5 bg-[#181816] hover:bg-[#201f1f] rounded-xl border border-white/7 hover:border-[#fbcb1a]/40 text-left transition-all"
                >
                  <span className="text-sm text-white font-sans">{mealLabel(meal.name, mi + 1)}</span>
                  <span className="material-symbols-outlined text-[#c6c9ab] text-base">add_circle</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setChooseMealForRecipe(null)}
              className="w-full py-2 text-center font-mono text-[10px] text-[#c6c9ab] hover:text-white uppercase tracking-wider"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
