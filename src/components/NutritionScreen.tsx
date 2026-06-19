import React, { useState, useEffect, useMemo } from 'react';
import { UserProfile, Diet, DietItem, FoodCategory, DietMode, MealItem, Recipe, RecipeFavorites } from '../types';
import { getDietsForAthlete, getAthleteDietConfig, getFoodItems, seedFoodItemsIfEmpty, getAthleteNutritionConfig, getRecipes, getRecipeFavorites } from '../dbService';

// ── Constants ──────────────────────────────────────────────────────────────────

const CATS: FoodCategory[] = ['HC', 'PROT', 'GRASA', 'MIX_HC', 'MIX_GRASA'];

const CAT_LABEL: Record<FoodCategory, string> = {
  HC: 'HC', PROT: 'Proteína', GRASA: 'Grasa', MIX_HC: '½P+½HC', MIX_GRASA: '½P+½Grasa',
};

const CAT_COLOR: Record<FoodCategory, string> = {
  HC: 'text-amber-300', PROT: 'text-blue-300', GRASA: 'text-orange-300',
  MIX_HC: 'text-violet-300', MIX_GRASA: 'text-pink-300',
};

const CAT_BG: Record<FoodCategory, string> = {
  HC: 'bg-amber-500/10 border-amber-500/20',
  PROT: 'bg-blue-500/10 border-blue-500/20',
  GRASA: 'bg-orange-500/10 border-orange-500/20',
  MIX_HC: 'bg-violet-500/10 border-violet-500/20',
  MIX_GRASA: 'bg-pink-500/10 border-pink-500/20',
};

const MODE_LABEL: Record<DietMode, string> = {
  OMNIVORO: 'Omnívoro', VEGANO: 'Vegano', SIN_PESAR: 'Sin pesar',
};

// ── Helpers ────────────────────────────────────────────────────────────────────

const round2 = (n: number) => Math.round(n * 100) / 100;

function fmtQty(q: number): string {
  if (Number.isInteger(q)) return String(q);
  return q.toFixed(2).replace(/\.?0+$/, '');
}

function parseBaseGrams(label: string): number | null {
  const m = label.match(/(\d+(?:[.,]\d+)?)\s*(g|ml|cc|kg|l)\b/i);
  if (!m) return null;
  let val = parseFloat(m[1].replace(',', '.'));
  const u = m[2].toLowerCase();
  if (u === 'kg') val *= 1000;
  if (u === 'l') val *= 1000;
  return val;
}

function itemWeightLabel(foodLabel: string, qty: number): string {
  const base = parseBaseGrams(foodLabel);
  if (base == null) return `×${fmtQty(qty)}`;
  const g = Math.round(base * qty * 10) / 10;
  return g >= 1000 ? `${(g / 1000).toFixed(1)}kg` : `${g}g`;
}

function mealLabel(name: string, n: number): string {
  const stripped = name.replace(/^Comida\s*\d+\s*/i, '').trim();
  return stripped || `Comida ${n}`;
}

// ── Types ──────────────────────────────────────────────────────────────────────

type ItemState = { foodLabel: string; done: boolean };
// key = `${mealId}_${itemIdx}`

interface Props { profile: UserProfile; }

// ── Component ──────────────────────────────────────────────────────────────────

export default function NutritionScreen({ profile }: Props) {
  // Diets
  const [activeDiets, setActiveDiets] = useState<Diet[]>([]);
  const [selectedDiet, setSelectedDiet] = useState<Diet | null>(null);
  const [loading, setLoading] = useState(true);

  // Per-item state (ephemeral, day-only)
  const [itemStates, setItemStates] = useState<Record<string, ItemState>>({});

  // Food library + modes
  const [foodItems, setFoodItems] = useState<MealItem[]>([]);
  const [enabledModes, setEnabledModes] = useState<DietMode[]>(['OMNIVORO']);
  const [activeDietMode, setActiveDietMode] = useState<DietMode>('OMNIVORO');

  // Food picker (for swapping an item)
  const [pickerItem, setPickerItem] = useState<{ mealId: string; itemIdx: number; category: FoodCategory } | null>(null);
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
        const [config, allDiets, dietConfig] = await Promise.all([
          getAthleteNutritionConfig(profile.email).catch(() => null),
          getDietsForAthlete(profile.email),
          getAthleteDietConfig(profile.email).catch(() => null),
        ]);

        if (cancelled) return;

        if (config && config.enabledModes.length > 0) {
          setEnabledModes(config.enabledModes);
          setActiveDietMode(config.enabledModes[0]);
        }

        const activeIds = new Set(dietConfig?.activeDietIds ?? []);
        const active = allDiets.filter(d => activeIds.has(d.id));
        setActiveDiets(active);
        if (active.length >= 1) {
          setSelectedDiet(active[0]);
          const counts: Record<string, number> = {};
          active[0].meals.forEach(m => { counts[m.id] = m.items.length; });
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

  useEffect(() => {
    if (!selectedDiet) { setItemStates({}); return; }
    const initial: Record<string, ItemState> = {};
    for (const meal of selectedDiet.meals) {
      meal.items.forEach((item, idx) => {
        initial[`${meal.id}_${idx}`] = { foodLabel: item.foodLabel, done: false };
      });
    }
    setItemStates(initial);
  }, [selectedDiet?.id]);

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
            doneByCat[item.category] = round2(doneByCat[item.category] + item.quantity);
            mealBycat[item.category] = round2(mealBycat[item.category] + item.quantity);
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

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleSelectDiet = (dt: Diet) => {
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
  };

  const handleToggleDone = (mealId: string, itemIdx: number) => {
    const key = `${mealId}_${itemIdx}`;
    setItemStates(prev => {
      const cur = prev[key];
      if (!cur) return prev;
      return { ...prev, [key]: { ...cur, done: !cur.done } };
    });
  };

  const handleOpenPicker = (mealId: string, itemIdx: number, category: FoodCategory) => {
    setPickerItem({ mealId, itemIdx, category });
    setPickerCategory(category);
    setSearchTerm('');
  };

  const handleSelectFood = (food: MealItem) => {
    if (!pickerItem) return;
    const key = `${pickerItem.mealId}_${pickerItem.itemIdx}`;
    setItemStates(prev => ({ ...prev, [key]: { foodLabel: food.label, done: false } }));
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
      .map(ing => ({ category: ing.category, foodLabel: ing.foodLabel, quantity: ing.quantity }));

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

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h1 className="font-sans font-extrabold text-3xl text-white tracking-tight">Nutrición</h1>
        <p className="text-[#c6c9ab] text-sm mt-1">Registra los intercambios del día según tu dieta activa.</p>
      </div>

      {/* Diet mode selector */}
      {enabledModes.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {enabledModes.map(mode => (
            <button key={mode} onClick={() => setActiveDietMode(mode)}
              className={`px-4 py-2 rounded-xl font-mono text-xs font-bold uppercase tracking-wider transition-all ${
                activeDietMode === mode
                  ? 'bg-[#e2ff00] text-black shadow-md'
                  : 'bg-[#1c1b1b] text-[#c6c9ab] border border-[#2a2a2a] hover:border-[#e2ff00]/40 hover:text-white'
              }`}
            >{MODE_LABEL[mode]}</button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 font-mono text-sm text-[#c6c9ab] animate-pulse">Cargando dieta...</div>
      ) : activeDiets.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-[#2a2a2a] rounded-2xl">
          <span className="material-symbols-outlined text-4xl text-[#2a2a2a] block mb-3">nutrition</span>
          <p className="text-[#c6c9ab] text-sm font-sans">Sin dietas asignadas.</p>
          <p className="text-[#c6c9ab] text-xs font-mono mt-1">Tu entrenador aún no ha activado ninguna dieta para ti.</p>
        </div>
      ) : (
        <>
          {/* Diet selector (only when multiple active) */}
          {activeDiets.length > 1 && (
            <div className="flex gap-2 flex-wrap">
              {activeDiets.map(dt => (
                <button key={dt.id} onClick={() => handleSelectDiet(dt)}
                  className={`px-4 py-2.5 rounded-xl font-mono text-xs font-bold uppercase tracking-wider transition-all ${
                    selectedDiet?.id === dt.id
                      ? 'bg-[#e2ff00] text-black shadow-md'
                      : 'bg-[#1c1b1b] text-[#c6c9ab] border border-[#2a2a2a] hover:border-[#e2ff00]/40 hover:text-white'
                  }`}
                >{dt.name}</button>
              ))}
            </div>
          )}

          {selectedDiet && (
            <React.Fragment key={selectedDiet.id}>
              {/* Diet header */}
              <div className="bg-[#1c1b1b] rounded-xl p-4 border border-[#2a2a2a]">
                <span className="block font-mono text-[9px] text-[#c6c9ab] uppercase tracking-widest font-bold mb-0.5">DIETA ACTIVA</span>
                <span className="block font-sans font-bold text-lg text-white leading-tight">{selectedDiet.name}</span>
                {selectedDiet.coachNote && (
                  <span className="block font-sans text-xs text-[#00eefc] italic mt-1">{selectedDiet.coachNote}</span>
                )}
                <span className="block font-mono text-[9px] text-[#c6c9ab] mt-1.5">
                  {selectedDiet.meals.length} comida{selectedDiet.meals.length !== 1 ? 's' : ''} · {selectedDiet.meals.reduce((s, m) => s + m.items.length, 0)} alimentos
                </span>
              </div>

              {/* Budget dashboard */}
              <div className="bg-[#121212] border border-[#2a2a2a] rounded-xl p-4">
                <p className="font-mono text-[9px] text-[#c6c9ab] uppercase tracking-wider mb-3">
                  Progreso por categoría
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2.5">
                  {CATS.map(cat => {
                    const b = selectedDiet.budget[cat];
                    const d = doneByCat[cat];
                    const isOver = b > 0 && d > b;
                    const isOk = b > 0 && round2(d) === round2(b);
                    const pct = b > 0 ? Math.min(100, (d / b) * 100) : (d > 0 ? 100 : 0);
                    const barColor = isOver ? 'bg-red-500' : isOk ? 'bg-green-400' : 'bg-[#e2ff00]';
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
              <div className="bg-[#121212] border border-[#2a2a2a] p-4 rounded-xl">
                <div className="flex justify-between items-end mb-2">
                  <h2 className="font-sans font-bold text-sm text-[#e5e2e1] uppercase tracking-wide">Completados hoy</h2>
                  <span className="font-mono text-xs text-[#e2ff00] font-bold">{doneItems} / {totalItems}</span>
                </div>
                <div className="h-2 w-full bg-[#1c1b1b] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#e2ff00] rounded-full transition-all duration-500 volt-glow"
                    style={{ width: `${totalItems > 0 ? (doneItems / totalItems) * 100 : 0}%` }}
                  />
                </div>
              </div>

              {/* Meal blocks */}
              <div className="space-y-4">
                {selectedDiet.meals.map((meal, mi) => {
                  const mealDone = meal.items.length > 0 && meal.items.every((_, idx) => itemStates[`${meal.id}_${idx}`]?.done);
                  return (
                    <div key={meal.id}
                      className={`bg-[#201f1f] rounded-xl overflow-hidden border transition-all ${mealDone ? 'border-[#e2ff00]/40' : 'border-[#2a2a2a]'}`}
                    >
                      {/* Meal header */}
                      <div className="px-4 py-3 bg-[#1c1b1b]/80 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <span className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${mealDone ? 'bg-[#e2ff00] border-[#e2ff00]' : 'border-[#3a3a3a]'}`}>
                            {mealDone && <span className="material-symbols-outlined text-black" style={{ fontSize: '13px' }}>check</span>}
                          </span>
                          <span className="font-sans font-bold text-white text-base">{mealLabel(meal.name, mi + 1)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[9px] text-[#c6c9ab]">
                            {meal.items.length} alimento{meal.items.length !== 1 ? 's' : ''}
                          </span>
                          {recipes.length > 0 && (
                            <button
                              onClick={() => handleOpenRecipePicker(meal.id)}
                              title="Usar receta"
                              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] hover:border-[#e2ff00]/50 hover:text-[#e2ff00] text-[#c6c9ab] transition-all"
                            >
                              <span className="material-symbols-outlined text-xs select-none">skillet</span>
                              <span className="font-mono text-[9px] uppercase tracking-wider hidden sm:block">Receta</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Per-meal target + progress (only when targets are set) */}
                      {CATS.some(c => (meal.target?.[c] ?? 0) > 0) && (() => {
                        const mDone = mealDoneByCat[meal.id] ?? {} as Record<FoodCategory, number>;
                        const targetCats = CATS.filter(c => (meal.target?.[c] ?? 0) > 0);
                        return (
                          <div className="px-4 py-2 bg-[#0e0e0e]/60 border-b border-[#2a2a2a]/60 flex flex-wrap gap-x-3 gap-y-1.5 items-center">
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
                                      className={`h-full rounded-full transition-all duration-300 ${isOver ? 'bg-red-500' : isOk ? 'bg-green-400' : 'bg-[#e2ff00]'}`}
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
                      <div className="p-3 border-t border-[#2a2a2a]/60 bg-[#131313]/40 space-y-2">
                        {meal.items.length === 0 ? (
                          <p className="text-center py-3 font-mono text-[10px] text-[#c6c9ab] italic">Sin alimentos en esta comida.</p>
                        ) : meal.items.map((item, idx) => {
                          const key = `${meal.id}_${idx}`;
                          const st = itemStates[key] ?? { foodLabel: item.foodLabel, done: false };
                          return (
                            <div key={key}
                              className={`flex items-center gap-2.5 p-3 rounded-lg border transition-all ${st.done ? 'bg-[#121212] border-[#e2ff00]/20 opacity-75' : 'bg-[#121212] border-[#2a2a2a]'}`}
                            >
                              {/* Checkbox */}
                              <button
                                onClick={() => handleToggleDone(meal.id, idx)}
                                className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center transition-all ${st.done ? 'bg-[#e2ff00] text-black border-transparent' : 'border border-[#c6c9ab]/40 hover:border-[#e2ff00]'}`}
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

                              {/* Swap button */}
                              <button
                                onClick={() => handleOpenPicker(meal.id, idx, item.category)}
                                title="Cambiar alimento"
                                className="text-[#c6c9ab] hover:text-[#00eefc] transition-colors flex-shrink-0"
                              >
                                <span className="material-symbols-outlined text-sm select-none">swap_horiz</span>
                              </button>
                              {/* Delete button — only for recipe-added items */}
                              {idx >= (origItemCounts[meal.id] ?? Infinity) && (
                                <button
                                  onClick={() => handleRemoveItem(meal.id, idx)}
                                  title="Quitar"
                                  className="text-[#c6c9ab] hover:text-red-400 transition-colors flex-shrink-0"
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
            <div className="bg-[#1c1b1b] border-t md:border border-[#2a2a2a] w-full max-w-lg rounded-t-2xl md:rounded-xl max-h-[85vh] flex flex-col overflow-hidden">
              {/* Header */}
              <div className="p-4 border-b border-[#2a2a2a] flex items-center justify-between sticky top-0 bg-[#1c1b1b] z-10">
                <div>
                  <h3 className="font-sans font-bold text-lg text-white flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#e2ff00] text-base">skillet</span>
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
              <div className="px-4 py-2 bg-[#121212] flex items-center gap-2 border-b border-[#2a2a2a]">
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
                <div className="px-4 py-2 bg-[#121212] border-b border-[#2a2a2a] flex gap-1.5 overflow-x-auto">
                  {[{ id: 'all', label: 'Todas' }, ...availableRecipeCats.map(c => ({ id: c, label: c }))].map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setRecipeCatFilter(cat.id)}
                      className={`px-3 py-1.5 rounded-full font-mono text-[9px] font-bold uppercase tracking-wider whitespace-nowrap transition-all flex-shrink-0 ${
                        recipeCatFilter === cat.id
                          ? 'bg-[#e2ff00] text-black shadow-md'
                          : 'bg-[#201f1f] text-[#c6c9ab] border border-transparent hover:border-[#2a2a2a]'
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
                      className="w-full flex items-center gap-3 p-3.5 bg-[#121212] hover:bg-[#201f1f] rounded-xl border border-[#2a2a2a] hover:border-[#e2ff00]/40 text-left transition-all group"
                    >
                      {recipe.photoUrl ? (
                        <img src={recipe.photoUrl} alt={recipe.name} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-[#1c1b1b] border border-[#2a2a2a] flex items-center justify-center flex-shrink-0">
                          <span className="material-symbols-outlined text-[#c6c9ab] text-xl">skillet</span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          {isFav && (
                            <span className="material-symbols-outlined text-[#e2ff00] text-xs" style={{ fontVariationSettings: "'FILL' 1", fontSize: '12px' }}>favorite</span>
                          )}
                          <span className="font-sans font-bold text-sm text-white group-hover:text-[#e2ff00] transition-colors truncate">{recipe.name}</span>
                        </div>
                        {recipe.categories.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-1">
                            {recipe.categories.slice(0, 3).map(c => (
                              <span key={c} className="px-1.5 py-0.5 rounded bg-[#2a2a2a] font-mono text-[8px] text-[#c6c9ab] uppercase">{c}</span>
                            ))}
                          </div>
                        )}
                        <span className="font-mono text-[9px] text-[#e2ff00]/70">{exchStr}</span>
                      </div>
                      <span className="material-symbols-outlined text-[#c6c9ab] group-hover:text-[#e2ff00] transition-colors select-none text-base flex-shrink-0">add_circle</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Food picker sheet */}
      {pickerItem && (
        <div className="fixed inset-0 bg-black/85 z-[100] flex items-end justify-center p-0 md:p-4">
          <div className="bg-[#1c1b1b] border-t md:border border-[#2a2a2a] w-full max-w-lg rounded-t-2xl md:rounded-xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-[#2a2a2a] flex items-center justify-between sticky top-0 bg-[#1c1b1b] z-10">
              <div>
                <h3 className="font-sans font-bold text-lg text-white">Cambiar alimento</h3>
                <span className="font-mono text-[10px] text-[#c6c9ab] uppercase">
                  {CAT_LABEL[pickerCategory]} · {MODE_LABEL[activeDietMode]}
                </span>
              </div>
              <button onClick={() => setPickerItem(null)} className="text-white bg-[#2a2a2a] hover:bg-[#3e3e3e] p-1.5 h-8 w-8 rounded-full flex items-center justify-center transition-colors">
                <span className="material-symbols-outlined text-sm select-none">close</span>
              </button>
            </div>

            {enabledModes.length > 1 && (
              <div className="px-4 py-2 bg-[#111] border-b border-[#2a2a2a] flex gap-2 flex-wrap">
                {enabledModes.map(mode => (
                  <button key={mode} onClick={() => setActiveDietMode(mode)}
                    className={`px-3 py-1 rounded-full font-mono text-[10px] font-bold uppercase tracking-wider transition-all ${activeDietMode === mode ? 'bg-[#e2ff00] text-black' : 'bg-[#201f1f] text-[#c6c9ab] border border-[#2a2a2a]'}`}
                  >{MODE_LABEL[mode]}</button>
                ))}
              </div>
            )}

            <div className="p-3 bg-[#121212] border-b border-[#2a2a2a] flex gap-1.5 flex-wrap">
              {CATS.map(cat => (
                <button key={cat} onClick={() => setPickerCategory(cat)}
                  className={`px-3 py-1.5 rounded-full font-mono text-[10px] font-bold uppercase tracking-wider transition-all ${pickerCategory === cat ? 'bg-[#e2ff00] text-black shadow-md' : 'bg-[#201f1f] text-[#c6c9ab] border border-transparent hover:border-[#2a2a2a]'}`}
                >{cat.replace('_', ' ')}</button>
              ))}
            </div>

            <div className="px-4 py-2 bg-[#121212] flex items-center gap-2 border-b border-[#2a2a2a]">
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
                  className="w-full flex items-center justify-between p-3.5 bg-[#121212] hover:bg-[#201f1f] rounded-lg border border-[#2a2a2a] hover:border-[#e2ff00]/40 text-left transition-all group"
                >
                  <span className="block font-sans text-xs text-white group-hover:text-[#e2ff00] transition-colors leading-snug">{food.label}</span>
                  <span className="material-symbols-outlined text-[#c6c9ab] group-hover:text-[#e2ff00] transition-colors select-none text-base flex-shrink-0 ml-3">add_circle</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
