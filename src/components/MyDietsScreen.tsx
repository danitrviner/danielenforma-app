import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UserProfile, Diet, DietItem, FoodCategory, DietMode, MealItem, Recipe } from '../types';
import { getDietsForAthlete, createDiet, updateDiet, deleteDiet, getFoodItems, seedFoodItemsIfEmpty, getAthleteNutritionConfig, getRecipes } from '../dbService';
import { CATS, BUDGET_CATS, CAT_LABEL, CAT_BG, MODE_LABEL, fmtQty, itemWeightLabel, computeDietPlaced } from '../utils/exchangeHelpers';
import { useToast } from '../hooks/useToast';
import Skeleton from './Skeleton';
import { EmptyState, Sheet, Icon } from './ui';

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
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const dietsKey = ['dietsForAthlete', profile.email] as const;
  const { data: diets = [], isPending: loadingDiets } = useQuery({
    queryKey: dietsKey,
    queryFn: () => getDietsForAthlete(profile.email),
  });
  const { data: recipes = [], isPending: loadingRecipes } = useQuery({
    queryKey: ['recipes'],
    queryFn: () => getRecipes().catch(() => [] as Recipe[]),
  });
  const { data: nutConfig, isPending: loadingConfig } = useQuery({
    queryKey: ['athleteNutritionConfig', profile.email],
    queryFn: () => getAthleteNutritionConfig(profile.email).catch(() => null),
  });
  const { data: foodItems = [], isPending: loadingFoodItems } = useQuery({
    queryKey: ['foodItems'],
    queryFn: async () => {
      await seedFoodItemsIfEmpty().catch(() => {});
      return getFoodItems();
    },
  });
  const loading = loadingDiets || loadingRecipes || loadingConfig || loadingFoodItems;

  const [enabledModes, setEnabledModes] = useState<DietMode[]>(['OMNIVORO']);
  const [activeDietMode, setActiveDietMode] = useState<DietMode>('OMNIVORO');

  // Igual que el Promise.all().then() original: enabledModes/activeDietMode
  // se inicializan desde la config una sola vez por atleta, no en cada
  // refetch de fondo — mismo patrón de guard con ref que StepsWidget.
  const configInitFor = useRef<string | null>(null);
  useEffect(() => {
    if (loadingConfig || configInitFor.current === profile.email) return;
    configInitFor.current = profile.email;
    if (nutConfig && nutConfig.enabledModes?.length > 0) {
      setEnabledModes(nutConfig.enabledModes);
      setActiveDietMode(nutConfig.enabledModes[0]);
    }
  }, [loadingConfig, nutConfig, profile.email]);

  const [view, setView] = useState<'list' | 'editor'>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<Diet, 'id'>>(() => blankDiet(profile.email));

  // Food/recipe picker for adding to a meal
  const [pickerMealId, setPickerMealId] = useState<string | null>(null);
  const [pickerCategory, setPickerCategory] = useState<FoodCategory>('HC');
  const [pickerTab, setPickerTab] = useState<'alimentos' | 'recetas'>('alimentos');
  const [searchTerm, setSearchTerm] = useState('');

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
    await queryClient.invalidateQueries({ queryKey: dietsKey });
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
    try {
      await deleteDiet(id);
      await refresh();
    } catch (err) {
      console.error(err);
      showToast('No se pudo eliminar la dieta.');
    }
  };

  const handleDuplicate = async (dt: Diet) => {
    try {
      await createDiet({
        athleteId: profile.email,
        name: `${dt.name} (copia)`,
        budget: dt.budget,
        meals: dt.meals.map(m => ({ ...m, id: makeId() })),
        selfManaged: true,
      });
      await refresh();
    } catch (err) {
      console.error(err);
      showToast('No se pudo duplicar la dieta.');
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    try {
      if (editingId) {
        await updateDiet(editingId, form);
      } else {
        await createDiet(form);
      }
      setView('list');
      await refresh();
    } catch (err) {
      console.error(err);
      showToast('No se pudo guardar la dieta.');
    }
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
    return (
      <div className="space-y-6">
        <Skeleton className="h-24 w-full rounded-surface" />
        <Skeleton className="h-24 w-full rounded-surface" />
      </div>
    );
  }

  if (view === 'editor') {
    return (
      <div className="w-full space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="font-sans font-bold text-title-m text-white">{editingId ? 'Editar dieta' : 'Nueva dieta'}</h2>
            {editingId && !form.selfManaged && (
              <span className="text-caption font-sans font-bold uppercase px-2 rounded-control border bg-accent/10 text-accent border-accent/20">
                De tu entrenador
              </span>
            )}
          </div>
          <button onClick={() => setView('list')} className="font-mono text-caption text-ink-2 hover:text-white uppercase tracking-wider">
            ← Volver
          </button>
        </div>

        <input
          type="text"
          placeholder="Nombre de la dieta"
          value={form.name}
          onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
          className="w-full bg-surface border border-hairline rounded-control px-4 py-3 text-white text-title-s focus:outline-none focus:border-accent/50"
        />

        {/* Budget — fijo cuando la dieta viene del entrenador; el atleta solo rellena alimentos */}
        <div className="bg-surface border border-hairline rounded-surface p-4 space-y-3">
          <p className="font-mono text-caption text-ink-2 uppercase tracking-wider">
            {form.selfManaged ? 'Objetivo diario de intercambios' : 'Cupo diario fijado por tu entrenador'}
          </p>
          <div className="grid grid-cols-3 gap-3">
            {BUDGET_CATS.map(cat => (
              <div key={cat}>
                <label className="block font-sans text-caption text-ink-2 mb-1">{CAT_LABEL[cat]}</label>
                {form.selfManaged ? (
                  <input
                    type="number"
                    min={0}
                    step={0.25}
                    value={form.budget[cat]}
                    onChange={e => setForm(prev => ({ ...prev, budget: { ...prev.budget, [cat]: parseFloat(e.target.value) || 0 } }))}
                    className="w-full bg-raised border border-hairline rounded-control px-2 py-2 text-white text-title-s focus:outline-none focus:border-accent/50"
                  />
                ) : (
                  <div className="w-full bg-raised/50 border border-hairline rounded-surface px-2 py-2 text-white text-label">
                    {fmtQty(form.budget[cat])}
                  </div>
                )}
                <span className="block font-mono text-caption text-ink-2/70 ">Colocado: {fmtQty(placed[cat])}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Meals */}
        <div className="space-y-3">
          {form.meals.map((meal, mi) => (
            <div key={meal.id} className="bg-raised rounded-surface border border-hairline overflow-hidden">
              <div className="px-4 py-3 bg-raised/80 flex items-center gap-2">
                <input
                  type="text"
                  value={meal.name}
                  onChange={e => renameMeal(meal.id, e.target.value)}
                  className="flex-1 bg-transparent border-none text-white text-title-s font-sans font-bold focus:outline-none"
                />
                {form.meals.length > 1 && (
                  <button onClick={() => removeMeal(meal.id)} className="text-ink-2 hover:text-red-400 transition-colors">
                    <span className="material-symbols-outlined text-body-s select-none">delete</span>
                  </button>
                )}
              </div>
              <div className="p-3 space-y-2 border-t border-hairline">
                {meal.items.length === 0 ? (
                  <p className="text-center py-2 font-sans text-caption text-ink-2 italic">Sin alimentos.</p>
                ) : meal.items.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-3 rounded-surface bg-surface border border-hairline">
                    <span className={`text-caption font-mono font-bold px-2 rounded-control border flex-shrink-0 ${CAT_BG[item.category]}`}>
                      {item.category.replace('_', ' ')}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="block text-label font-sans text-white leading-snug">{item.foodLabel}</span>
                      <span className="block font-mono text-caption text-ink-2 ">
                        ×{fmtQty(item.quantity)} · {itemWeightLabel(item.foodLabel, item.quantity)}
                      </span>
                    </div>
                    <button onClick={() => removeItem(meal.id, idx)} className="text-ink-2 hover:text-red-400 transition-colors flex-shrink-0 p-2 -m-1.5">
                      <span className="material-symbols-outlined text-body-s select-none">close</span>
                    </button>
                  </div>
                ))}
                <div className="flex gap-2 flex-wrap pt-1">
                  {CATS.map(cat => (
                    <button
                      key={cat}
                      onClick={() => openPicker(meal.id, cat)}
                      className="px-3 py-1 rounded-full font-mono text-caption font-bold uppercase tracking-wider bg-raised border border-hairline text-ink-2 hover:border-accent/50 hover:text-accent transition-all"
                    >+ {cat.replace('_', ' ')}</button>
                  ))}
                </div>
              </div>
            </div>
          ))}
          <button
            onClick={addMeal}
            className="w-full py-3 rounded-control border border-dashed border-hairline text-ink-2 font-sans text-label font-bold uppercase tracking-wider hover:border-accent/40 hover:text-accent transition-all"
          >+ Añadir comida</button>
        </div>

        <button
          onClick={handleSave}
          disabled={!form.name.trim()}
          className="w-full py-3 rounded-control bg-accent text-black font-sans font-bold text-body-s disabled:opacity-40 hover:bg-accent-press transition-all"
        >Guardar dieta</button>

        {/* Food picker sheet */}
        {pickerMealId && (
          <Sheet
            open
            onClose={() => setPickerMealId(null)}
            title="Añadir a la comida"
            toolbar={(
              <>
                {pickerTab === 'alimentos' && (
                  <div className="px-4 pb-2 font-sans text-caption text-ink-2 uppercase">
                    {isSearchingFoods ? `Todas las categorías · ${MODE_LABEL[activeDietMode]}` : `${CAT_LABEL[pickerCategory]} · ${MODE_LABEL[activeDietMode]}`}
                  </div>
                )}

                <div className="px-4 pt-3 bg-raised flex gap-1 border-b border-hairline">
                  {(['alimentos', 'recetas'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setPickerTab(tab)}
                      className={`flex-1 py-2 rounded-t-control font-mono text-caption font-bold uppercase tracking-wider transition-all ${
                        pickerTab === tab ? 'bg-surface text-accent' : 'text-ink-2 hover:text-white'
                      }`}
                    >{tab === 'alimentos' ? 'Alimentos' : 'Recetas'}</button>
                  ))}
                </div>

                {pickerTab === 'alimentos' && enabledModes.length > 1 && (
                  <div className="px-4 py-2 bg-bg border-b border-hairline flex gap-2 flex-wrap">
                    {enabledModes.map(mode => (
                      <button key={mode} onClick={() => setActiveDietMode(mode)}
                        className={`px-3 py-1 rounded-full font-sans text-caption font-bold uppercase tracking-wider transition-all ${activeDietMode === mode ? 'bg-accent text-black' : 'bg-raised text-ink-2 border border-hairline'}`}
                      >{MODE_LABEL[mode]}</button>
                    ))}
                  </div>
                )}

                <div className="px-4 py-2 bg-surface flex items-center gap-2 border-b border-hairline">
                  <Icon name="search" size="s" className="text-ink-2" />
                  <input type="text" placeholder={pickerTab === 'alimentos' ? 'Buscar alimento...' : 'Buscar receta...'} value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full bg-transparent border-none text-white text-title-s focus:ring-0 focus:outline-none p-2 placeholder-ink-2/45"
                  />
                </div>
              </>
            )}
          >
              <div className="pt-4 space-y-2">
                {pickerTab === 'alimentos' ? (
                  filteredFoods.length === 0 ? (
                    <div className="text-center py-10 font-sans text-label text-ink-2 italic">Ningún alimento coincide.</div>
                  ) : filteredFoods.map(food => (
                    <button key={food.id} onClick={() => addItem(food)}
                      className="w-full flex items-center gap-3 p-4 bg-surface hover:bg-raised rounded-control border border-hairline hover:border-accent/40 text-left transition-all group"
                    >
                      {isSearchingFoods && (
                        <span className={`text-caption font-mono font-bold px-2 rounded-control border flex-shrink-0 ${CAT_BG[food.category]}`}>
                          {food.category.replace('_', ' ')}
                        </span>
                      )}
                      <span className="flex-1 block font-sans text-label text-white group-hover:text-accent transition-colors leading-snug">{food.label}</span>
                      <span className="material-symbols-outlined text-ink-2 group-hover:text-accent transition-colors select-none text-title-s flex-shrink-0">add_circle</span>
                    </button>
                  ))
                ) : (
                  filteredRecipes.length === 0 ? (
                    <div className="text-center py-10 font-mono text-label text-ink-2 italic">
                      {recipes.length === 0 ? 'El coach todavía no ha publicado recetas.' : 'Ninguna receta coincide.'}
                    </div>
                  ) : filteredRecipes.map(recipe => (
                    <button key={recipe.id} onClick={() => addRecipe(recipe)}
                      className="w-full flex items-center gap-3 p-4 bg-surface hover:bg-raised rounded-control border border-hairline hover:border-accent/40 text-left transition-all group"
                    >
                      {recipe.photoUrl ? (
                        <img src={recipe.photoUrl} alt={recipe.name} className="w-10 h-10 rounded-surface object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-surface bg-raised border border-hairline flex items-center justify-center flex-shrink-0">
                          <span className="material-symbols-outlined text-ink-2 text-title-s">skillet</span>
                        </div>
                      )}
                      <span className="block font-sans text-label text-white group-hover:text-accent transition-colors leading-snug flex-1">{recipe.name}</span>
                      <span className="material-symbols-outlined text-ink-2 group-hover:text-accent transition-colors select-none text-title-s flex-shrink-0">add_circle</span>
                    </button>
                  ))
                )}
              </div>
          </Sheet>
        )}
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-sans font-bold text-title-l text-white tracking-tight">Mis Dietas</h1>
          <p className="text-ink-2 text-body-s mt-1">Tus dietas propias y las que te asigna tu entrenador — edítalas o duplícalas para partir de una ya creada.</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 px-4 py-2 bg-accent text-black font-sans text-caption font-bold uppercase rounded-control hover:bg-accent-press active:scale-95 transition-all flex-shrink-0"
        >
          <span className="material-symbols-outlined text-body-s">add</span>
          Nueva
        </button>
      </div>

      {diets.length === 0 ? (
        <div className="border border-dashed border-hairline rounded-surface">
          <EmptyState
            icon="bookmark"
            title="Aún no tienes ninguna dieta guardada."
            description='Créala aquí con "Nueva", o desde Nutrición → Intercambios para partir de tu día a día.'
          />
        </div>
      ) : (
        <div className="space-y-2">
          {diets.map(dt => {
            const dPlaced = computeDietPlaced(dt.meals);
            return (
              <div key={dt.id} className="bg-surface border border-hairline rounded-surface p-4 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="block font-sans font-bold text-body-s text-white truncate">{dt.name}</span>
                    {!dt.selfManaged && (
                      <span className="flex-shrink-0 text-caption font-sans font-bold uppercase px-2 rounded-control border bg-accent/10 text-accent border-accent/20">
                        De tu entrenador
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {BUDGET_CATS.map(cat => dt.budget[cat] > 0 && (
                      <span key={cat} className={`text-caption font-mono font-bold px-2 rounded-control border ${CAT_BG[cat]}`}>
                        {cat}: {fmtQty(dPlaced[cat])}/{fmtQty(dt.budget[cat])}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => openEdit(dt)} title="Editar" className="text-ink-2 hover:text-accent transition-colors p-2">
                    <span className="material-symbols-outlined text-title-s select-none">edit</span>
                  </button>
                  <button onClick={() => handleDuplicate(dt)} title="Duplicar" className="text-ink-2 hover:text-data transition-colors p-2">
                    <span className="material-symbols-outlined text-title-s select-none">content_copy</span>
                  </button>
                  {dt.selfManaged && (
                  <button onClick={() => handleDelete(dt.id)} title="Eliminar" className="text-ink-2 hover:text-red-400 transition-colors p-2">
                    <span className="material-symbols-outlined text-title-s select-none">delete</span>
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
