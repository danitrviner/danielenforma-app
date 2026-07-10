import React, { useState, useEffect, useMemo } from 'react';
import { UserProfile, Diet, DietItem, FoodCategory, DietMode, MealItem, Recipe } from '../types';
import { getDietsForAthlete, createDiet, updateDiet, deleteDiet, getFoodItems, seedFoodItemsIfEmpty, getAthleteNutritionConfig, getRecipes } from '../dbService';
import { CATS, BUDGET_CATS, CAT_LABEL, CAT_BG, MODE_LABEL, fmtQty, itemWeightLabel, computeDietPlaced } from '../utils/exchangeHelpers';

const makeId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;

function blankDiet(athleteId: string): Omit<Diet, 'id'> {
  return {
    athleteId,
    name: '',
    budget: { HC: 0, PROT: 0, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0 },
    meals: [{ id: makeId(), name: 'Comida 1', items: [] }],
    selfManaged: true,
  };
}

interface Props { profile: UserProfile; }

export default function MyDietsScreen({ profile }: Props) {
  const [diets, setDiets] = useState<Diet[]>([]);
  const [loading, setLoading] = useState(true);
  const [foodItems, setFoodItems] = useState<MealItem[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [enabledModes, setEnabledModes] = useState<DietMode[]>(['OMNIVORO']);
  const [activeDietMode, setActiveDietMode] = useState<DietMode>('OMNIVORO');

  const [view, setView] = useState<'list' | 'editor'>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<Diet, 'id'>>(() => blankDiet(profile.email));

  // Food/recipe picker for adding to a meal
  const [pickerMealId, setPickerMealId] = useState<string | null>(null);
  const [pickerCategory, setPickerCategory] = useState<FoodCategory>('HC');
  const [pickerTab, setPickerTab] = useState<'alimentos' | 'recetas'>('alimentos');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [allDiets, config, recs] = await Promise.all([
          getDietsForAthlete(profile.email),
          getAthleteNutritionConfig(profile.email).catch(() => null),
          getRecipes().catch(() => [] as Recipe[]),
        ]);
        if (cancelled) return;
        setDiets(allDiets);
        setRecipes(recs);
        if (config && config.enabledModes?.length > 0) {
          setEnabledModes(config.enabledModes);
          setActiveDietMode(config.enabledModes[0]);
        }
        await seedFoodItemsIfEmpty().catch(() => {});
        if (cancelled) return;
        const foods = await getFoodItems();
        if (!cancelled) setFoodItems(foods);
      } catch (err) {
        if (!cancelled) console.error('MyDietsScreen load error:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [profile.email]);

  const placed = useMemo(() => computeDietPlaced(form.meals), [form.meals]);

  // Buscando, ignora la categoría del botón que abrió el picker y busca en todas.
  const isSearchingFoods = pickerTab === 'alimentos' && searchTerm.trim().length > 0;
  const filteredFoods = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return foodItems.filter(f =>
      f.mode === activeDietMode &&
      (term ? f.label.toLowerCase().includes(term) : f.category === pickerCategory)
    );
  }, [foodItems, activeDietMode, pickerCategory, searchTerm]);

  const filteredRecipes = useMemo(() =>
    recipes.filter(r => r.ingredients.some(ing => enabledModes.includes(ing.mode)))
      .filter(r => !searchTerm || r.name.toLowerCase().includes(searchTerm.toLowerCase())),
    [recipes, enabledModes, searchTerm]
  );

  const refresh = async () => {
    const all = await getDietsForAthlete(profile.email);
    setDiets(all);
  };

  const openNew = () => {
    setEditingId(null);
    setForm(blankDiet(profile.email));
    setView('editor');
  };

  const openEdit = (dt: Diet) => {
    setEditingId(dt.id);
    setForm({ ...dt });
    setView('editor');
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Eliminar esta dieta?')) return;
    await deleteDiet(id);
    await refresh();
  };

  const handleDuplicate = async (dt: Diet) => {
    await createDiet({
      athleteId: profile.email,
      name: `${dt.name} (copia)`,
      budget: dt.budget,
      meals: dt.meals.map(m => ({ ...m, id: makeId() })),
      selfManaged: true,
    });
    await refresh();
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    if (editingId) {
      await updateDiet(editingId, form);
    } else {
      await createDiet(form);
    }
    setView('list');
    await refresh();
  };

  const addMeal = () => {
    setForm(prev => ({
      ...prev,
      meals: [...prev.meals, { id: makeId(), name: `Comida ${prev.meals.length + 1}`, items: [] }],
    }));
  };

  const removeMeal = (mealId: string) => {
    setForm(prev => ({ ...prev, meals: prev.meals.filter(m => m.id !== mealId) }));
  };

  const renameMeal = (mealId: string, name: string) => {
    setForm(prev => ({ ...prev, meals: prev.meals.map(m => m.id === mealId ? { ...m, name } : m) }));
  };

  const openPicker = (mealId: string, category: FoodCategory) => {
    setPickerMealId(mealId);
    setPickerCategory(category);
    setPickerTab('alimentos');
    setSearchTerm('');
  };

  const addItem = (food: MealItem) => {
    if (!pickerMealId) return;
    const newItem: DietItem = { category: food.category, foodLabel: food.label, quantity: 1 };
    setForm(prev => ({
      ...prev,
      meals: prev.meals.map(m => m.id !== pickerMealId ? m : { ...m, items: [...m.items, newItem] }),
    }));
    // Deja el picker abierto (solo limpia la búsqueda) para poder seguir añadiendo
    // HC, proteína, grasa... sin cerrar y reabrir por cada alimento.
    setSearchTerm('');
  };

  const addRecipe = (recipe: Recipe) => {
    if (!pickerMealId) return;
    const newItems: DietItem[] = recipe.ingredients
      .filter(ing => enabledModes.includes(ing.mode))
      .map(ing => ({ category: ing.category, foodLabel: ing.foodLabel, quantity: ing.quantity, originRecipeId: recipe.id }));
    if (newItems.length === 0) { setPickerMealId(null); return; }
    setForm(prev => ({
      ...prev,
      meals: prev.meals.map(m => m.id !== pickerMealId ? m : { ...m, items: [...m.items, ...newItems] }),
    }));
    setPickerMealId(null);
  };

  const removeItem = (mealId: string, idx: number) => {
    setForm(prev => ({
      ...prev,
      meals: prev.meals.map(m => m.id !== mealId ? m : { ...m, items: m.items.filter((_, i) => i !== idx) }),
    }));
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="text-center py-16 font-mono text-sm text-[#c6c9ab] animate-pulse">Cargando tus dietas...</div>;
  }

  if (view === 'editor') {
    return (
      <div className="w-full space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="font-sans font-bold text-lg text-white">{editingId ? 'Editar dieta' : 'Nueva dieta'}</h2>
            {editingId && !form.selfManaged && (
              <span className="text-[9px] font-sans font-bold uppercase px-1.5 py-0.5 rounded border bg-[#fbcb1a]/10 text-[#fbcb1a] border-[#fbcb1a]/20">
                De tu entrenador
              </span>
            )}
          </div>
          <button onClick={() => setView('list')} className="font-mono text-[10px] text-[#c6c9ab] hover:text-white uppercase tracking-wider">
            ← Volver
          </button>
        </div>

        <input
          type="text"
          placeholder="Nombre de la dieta"
          value={form.name}
          onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
          className="w-full bg-[#181816] border border-white/7 rounded-2xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#fbcb1a]/50"
        />

        {/* Budget — fijo cuando la dieta viene del entrenador; el atleta solo rellena alimentos */}
        <div className="bg-[#181816] border border-white/7 rounded-2xl p-4 space-y-3">
          <p className="font-mono text-[9px] text-[#c6c9ab] uppercase tracking-wider">
            {form.selfManaged ? 'Objetivo diario de intercambios' : 'Cupo diario fijado por tu entrenador'}
          </p>
          <div className="grid grid-cols-3 gap-3">
            {BUDGET_CATS.map(cat => (
              <div key={cat}>
                <label className="block font-mono text-[9px] text-[#c6c9ab] mb-1">{CAT_LABEL[cat]}</label>
                {form.selfManaged ? (
                  <input
                    type="number"
                    min={0}
                    step={0.25}
                    value={form.budget[cat]}
                    onChange={e => setForm(prev => ({ ...prev, budget: { ...prev.budget, [cat]: parseFloat(e.target.value) || 0 } }))}
                    className="w-full bg-[#1e1e1b] border border-white/7 rounded-xl px-2 py-1.5 text-white text-xs focus:outline-none focus:border-[#fbcb1a]/50"
                  />
                ) : (
                  <div className="w-full bg-[#1e1e1b]/50 border border-white/7 rounded-xl px-2 py-1.5 text-white text-xs">
                    {fmtQty(form.budget[cat])}
                  </div>
                )}
                <span className="block font-mono text-[9px] text-[#c6c9ab]/70 mt-0.5">Colocado: {fmtQty(placed[cat])}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Meals */}
        <div className="space-y-3">
          {form.meals.map((meal, mi) => (
            <div key={meal.id} className="bg-[#201f1f] rounded-xl border border-white/7 overflow-hidden">
              <div className="px-4 py-3 bg-[#1c1b1b]/80 flex items-center gap-2">
                <input
                  type="text"
                  value={meal.name}
                  onChange={e => renameMeal(meal.id, e.target.value)}
                  className="flex-1 bg-transparent border-none text-white text-sm font-sans font-bold focus:outline-none"
                />
                {form.meals.length > 1 && (
                  <button onClick={() => removeMeal(meal.id)} className="text-[#c6c9ab] hover:text-red-400 transition-colors">
                    <span className="material-symbols-outlined text-sm select-none">delete</span>
                  </button>
                )}
              </div>
              <div className="p-3 space-y-2 border-t border-white/60">
                {meal.items.length === 0 ? (
                  <p className="text-center py-2 font-mono text-[10px] text-[#c6c9ab] italic">Sin alimentos.</p>
                ) : meal.items.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2.5 p-2.5 rounded-lg bg-[#181816] border border-white/7">
                    <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border flex-shrink-0 ${CAT_BG[item.category]}`}>
                      {item.category.replace('_', ' ')}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="block text-xs font-sans text-white leading-snug">{item.foodLabel}</span>
                      <span className="block font-mono text-[9px] text-[#c6c9ab] mt-0.5">
                        ×{fmtQty(item.quantity)} · {itemWeightLabel(item.foodLabel, item.quantity)}
                      </span>
                    </div>
                    <button onClick={() => removeItem(meal.id, idx)} className="text-[#c6c9ab] hover:text-red-400 transition-colors flex-shrink-0 p-1.5 -m-1.5">
                      <span className="material-symbols-outlined text-sm select-none">close</span>
                    </button>
                  </div>
                ))}
                <div className="flex gap-1.5 flex-wrap pt-1">
                  {CATS.map(cat => (
                    <button
                      key={cat}
                      onClick={() => openPicker(meal.id, cat)}
                      className="px-2.5 py-1 rounded-full font-mono text-[9px] font-bold uppercase tracking-wider bg-[#1e1e1b] border border-white/7 text-[#c6c9ab] hover:border-[#fbcb1a]/50 hover:text-[#fbcb1a] transition-all"
                    >+ {cat.replace('_', ' ')}</button>
                  ))}
                </div>
              </div>
            </div>
          ))}
          <button
            onClick={addMeal}
            className="w-full py-2.5 rounded-xl border border-dashed border-white/7 text-[#c6c9ab] font-mono text-xs font-bold uppercase tracking-wider hover:border-[#fbcb1a]/40 hover:text-[#fbcb1a] transition-all"
          >+ Añadir comida</button>
        </div>

        <button
          onClick={handleSave}
          disabled={!form.name.trim()}
          className="w-full py-3 rounded-xl bg-[#fbcb1a] text-black font-sans font-bold text-sm disabled:opacity-40 hover:bg-[#d4a800] transition-all"
        >Guardar dieta</button>

        {/* Food picker sheet */}
        {pickerMealId && (
          <div className="fixed inset-0 bg-black/85 z-[100] flex items-end justify-center p-0 md:p-4">
            <div className="bg-[#1c1b1b] border-t md:border border-white/7 w-full max-w-lg rounded-t-2xl md:rounded-xl max-h-[85vh] flex flex-col overflow-hidden">
              <div className="p-4 border-b border-white/7 flex items-center justify-between sticky top-0 bg-[#1c1b1b] z-10">
                <div>
                  <h3 className="font-sans font-bold text-lg text-white">Añadir a la comida</h3>
                  {pickerTab === 'alimentos' && (
                    <span className="font-mono text-[10px] text-[#c6c9ab] uppercase">
                      {isSearchingFoods ? `Todas las categorías · ${MODE_LABEL[activeDietMode]}` : `${CAT_LABEL[pickerCategory]} · ${MODE_LABEL[activeDietMode]}`}
                    </span>
                  )}
                </div>
                <button onClick={() => setPickerMealId(null)} className="text-white bg-[#2a2a2a] hover:bg-[#3e3e3e] p-1.5 h-8 w-8 rounded-full flex items-center justify-center transition-colors">
                  <span className="material-symbols-outlined text-sm select-none">close</span>
                </button>
              </div>

              <div className="px-4 pt-3 bg-[#1c1b1b] flex gap-1 border-b border-white/7">
                {(['alimentos', 'recetas'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setPickerTab(tab)}
                    className={`flex-1 py-2 rounded-t-lg font-mono text-[10px] font-bold uppercase tracking-wider transition-all ${
                      pickerTab === tab ? 'bg-[#181816] text-[#fbcb1a]' : 'text-[#c6c9ab] hover:text-white'
                    }`}
                  >{tab === 'alimentos' ? 'Alimentos' : 'Recetas'}</button>
                ))}
              </div>

              {pickerTab === 'alimentos' && enabledModes.length > 1 && (
                <div className="px-4 py-2 bg-[#111] border-b border-white/7 flex gap-2 flex-wrap">
                  {enabledModes.map(mode => (
                    <button key={mode} onClick={() => setActiveDietMode(mode)}
                      className={`px-3 py-1 rounded-full font-sans text-[10px] font-bold uppercase tracking-wider transition-all ${activeDietMode === mode ? 'bg-[#fbcb1a] text-black' : 'bg-[#201f1f] text-[#c6c9ab] border border-white/7'}`}
                    >{MODE_LABEL[mode]}</button>
                  ))}
                </div>
              )}

              <div className="px-4 py-2 bg-[#181816] flex items-center gap-2 border-b border-white/7">
                <span className="material-symbols-outlined text-[#c6c9ab] text-sm select-none">search</span>
                <input type="text" placeholder={pickerTab === 'alimentos' ? 'Buscar alimento...' : 'Buscar receta...'} value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full bg-transparent border-none text-white text-xs focus:ring-0 focus:outline-none p-2 placeholder-[#c6c9ab]/45"
                />
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                {pickerTab === 'alimentos' ? (
                  filteredFoods.length === 0 ? (
                    <div className="text-center py-10 font-mono text-xs text-[#c6c9ab] italic">Ningún alimento coincide.</div>
                  ) : filteredFoods.map(food => (
                    <button key={food.id} onClick={() => addItem(food)}
                      className="w-full flex items-center gap-3 p-3.5 bg-[#181816] hover:bg-[#201f1f] rounded-lg border border-white/7 hover:border-[#fbcb1a]/40 text-left transition-all group"
                    >
                      {isSearchingFoods && (
                        <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border flex-shrink-0 ${CAT_BG[food.category]}`}>
                          {food.category.replace('_', ' ')}
                        </span>
                      )}
                      <span className="flex-1 block font-sans text-xs text-white group-hover:text-[#fbcb1a] transition-colors leading-snug">{food.label}</span>
                      <span className="material-symbols-outlined text-[#c6c9ab] group-hover:text-[#fbcb1a] transition-colors select-none text-base flex-shrink-0">add_circle</span>
                    </button>
                  ))
                ) : (
                  filteredRecipes.length === 0 ? (
                    <div className="text-center py-10 font-mono text-xs text-[#c6c9ab] italic">
                      {recipes.length === 0 ? 'El coach todavía no ha publicado recetas.' : 'Ninguna receta coincide.'}
                    </div>
                  ) : filteredRecipes.map(recipe => (
                    <button key={recipe.id} onClick={() => addRecipe(recipe)}
                      className="w-full flex items-center gap-3 p-3.5 bg-[#181816] hover:bg-[#201f1f] rounded-lg border border-white/7 hover:border-[#fbcb1a]/40 text-left transition-all group"
                    >
                      {recipe.photoUrl ? (
                        <img src={recipe.photoUrl} alt={recipe.name} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-[#1c1b1b] border border-white/7 flex items-center justify-center flex-shrink-0">
                          <span className="material-symbols-outlined text-[#c6c9ab] text-base">skillet</span>
                        </div>
                      )}
                      <span className="block font-sans text-xs text-white group-hover:text-[#fbcb1a] transition-colors leading-snug flex-1">{recipe.name}</span>
                      <span className="material-symbols-outlined text-[#c6c9ab] group-hover:text-[#fbcb1a] transition-colors select-none text-base flex-shrink-0">add_circle</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-sans font-extrabold text-2xl text-white tracking-tight">Mis Dietas</h1>
          <p className="text-[#c6c9ab] text-sm mt-1">Tus dietas propias y las que te asigna tu entrenador — edítalas o duplícalas para partir de una ya creada.</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-[#fbcb1a] text-black font-sans text-[10px] font-bold uppercase rounded-lg hover:bg-[#d4a800] active:scale-95 transition-all flex-shrink-0"
        >
          <span className="material-symbols-outlined text-sm">add</span>
          Nueva
        </button>
      </div>

      {diets.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-white/7 rounded-2xl">
          <span className="material-symbols-outlined text-4xl text-[#2a2a2a] block mb-3">bookmark</span>
          <p className="text-[#c6c9ab] text-sm font-sans">Aún no tienes ninguna dieta guardada.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {diets.map(dt => {
            const dPlaced = computeDietPlaced(dt.meals);
            return (
              <div key={dt.id} className="bg-[#181816] border border-white/7 rounded-2xl p-4 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="block font-sans font-bold text-sm text-white truncate">{dt.name}</span>
                    {!dt.selfManaged && (
                      <span className="flex-shrink-0 text-[9px] font-sans font-bold uppercase px-1.5 py-0.5 rounded border bg-[#fbcb1a]/10 text-[#fbcb1a] border-[#fbcb1a]/20">
                        De tu entrenador
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2 mt-1.5 flex-wrap">
                    {BUDGET_CATS.map(cat => dt.budget[cat] > 0 && (
                      <span key={cat} className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded border ${CAT_BG[cat]}`}>
                        {cat}: {fmtQty(dPlaced[cat])}/{fmtQty(dt.budget[cat])}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => openEdit(dt)} title="Editar" className="text-[#c6c9ab] hover:text-[#fbcb1a] transition-colors p-2">
                    <span className="material-symbols-outlined text-base select-none">edit</span>
                  </button>
                  <button onClick={() => handleDuplicate(dt)} title="Duplicar" className="text-[#c6c9ab] hover:text-[#00eefc] transition-colors p-2">
                    <span className="material-symbols-outlined text-base select-none">content_copy</span>
                  </button>
                  {dt.selfManaged && (
                  <button onClick={() => handleDelete(dt.id)} title="Eliminar" className="text-[#c6c9ab] hover:text-red-400 transition-colors p-2">
                    <span className="material-symbols-outlined text-base select-none">delete</span>
                  </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
