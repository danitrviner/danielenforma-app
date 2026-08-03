import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Recipe, RecipeIngredient, MealItem, FoodCategory } from '../types';
import { getRecipes, createRecipe, updateRecipe, deleteRecipe, getFoodItems, queryIndyaRecipes } from '../dbService';
import type { IndyaRecipeCursor } from '../dbService';
import Skeleton from './Skeleton';

const RECIPE_CATEGORIES = ['Alta proteína', 'Rápida', 'Pre-entreno', 'Recuperación', 'Desayuno', 'Cena'];

// Categories/intake types as stored on Indya-imported recipes (see scripts/importIndya.mjs) —
// mirrors the athlete-facing browser in RecipesScreen.tsx.
const INDYA_CATS = [
  'Todas',
  'Platos salados / principales',
  'Desayuno y dulces',
  'Bebidas',
  'Suplementos deportivos',
];

const INTAKE_LABELS: Record<number, string> = {
  1: 'Desayuno', 2: 'Media mañana', 3: 'Comida', 4: 'Merienda', 5: 'Cena',
};

function IndyaCard({ recipe }: { recipe: Recipe; key?: React.Key }) {
  const photo = recipe.image ?? recipe.photoUrl;
  return (
    <article className="relative rounded-surface overflow-hidden bg-raised border border-hairline aspect-[4/5] flex flex-col justify-end">
      {photo
        ? <img src={photo} alt={recipe.name} className="absolute inset-0 w-full h-full object-cover opacity-70" />
        : <div className="absolute inset-0 bg-gradient-to-br from-raised to-bg flex items-center justify-center">
            <span className="material-symbols-outlined text-5xl text-ink-3">skillet</span>
          </div>
      }
      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/50 to-transparent" />
      {recipe.kcal ? (
        <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm rounded-control px-1.5 py-0.5 font-mono text-caption text-ink-2 z-10">
          {recipe.kcal} kcal
        </div>
      ) : null}
      <p className="relative z-10 p-2.5 text-label text-white font-sans font-bold leading-tight">{recipe.name}</p>
    </article>
  );
}

const CAT_LABELS: Record<FoodCategory, string> = {
  HC: 'HC', PROT: 'PROT', GRASA: 'GRASA', MIX_HC: 'MIX·HC', MIX_GRASA: 'MIX·GRASA',
};

const CAT_COLORS: Record<FoodCategory, string> = {
  HC:        'text-amber-400 border-amber-400/30 bg-amber-400/10',
  PROT:      'text-blue-400 border-blue-400/30 bg-blue-400/10',
  GRASA:     'text-orange-400 border-orange-400/30 bg-orange-400/10',
  MIX_HC:    'text-violet-400 border-violet-400/30 bg-violet-400/10',
  MIX_GRASA: 'text-pink-400 border-pink-400/30 bg-pink-400/10',
};

function calcExchanges(ingredients: RecipeIngredient[]): Partial<Record<FoodCategory, number>> {
  const totals: Partial<Record<FoodCategory, number>> = {};
  for (const ing of ingredients) {
    totals[ing.category] = (totals[ing.category] ?? 0) + ing.quantity;
  }
  return totals;
}

function formatExchanges(exch: Partial<Record<FoodCategory, number>>): string {
  const CATS: FoodCategory[] = ['HC', 'PROT', 'GRASA', 'MIX_HC', 'MIX_GRASA'];
  return CATS.filter(c => (exch[c] ?? 0) > 0)
    .map(c => `${exch[c]} ${CAT_LABELS[c]}`)
    .join(' · ') || '—';
}

interface FormState {
  name: string;
  photoUrl: string;
  categories: string[];
  ingredients: RecipeIngredient[];
  extras: string[];
  steps: string[];
}

const EMPTY_FORM: FormState = {
  name: '', photoUrl: '', categories: [], ingredients: [], extras: [], steps: [],
};

interface Props { coachId: string; }

const recipesQueryKey = ['recipes'] as const;

export default function RecipeBuilderScreen({ coachId }: Props) {
  const queryClient = useQueryClient();
  const { data: recipes = [], isPending: loadingRecipes } = useQuery({
    queryKey: recipesQueryKey,
    queryFn: getRecipes,
  });
  const { data: foodItems = [], isPending: loadingFoodItems } = useQuery({
    queryKey: ['foodItems'],
    queryFn: getFoodItems,
  });
  const loading = loadingRecipes || loadingFoodItems;
  const [showForm, setShowForm]             = useState(false);
  const [editingId, setEditingId]           = useState<string | null>(null);
  const [form, setForm]                     = useState<FormState>(EMPTY_FORM);
  const [ingredientSearch, setIngSearch]    = useState('');
  const [ingredientQty, setIngQty]          = useState(1);
  const [newExtra, setNewExtra]             = useState('');
  const [newStep, setNewStep]               = useState('');
  const [saving, setSaving]                 = useState(false);
  const [deleting, setDeleting]             = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete]   = useState<string | null>(null);

  // Indya library browser (read-only) — the coach's own recipes above come from
  // getRecipes(), which deliberately excludes the 8.850 Indya-imported recipes to
  // avoid downloading the full collection; browse those separately, paginated.
  const [indyaCat, setIndyaCat]             = useState<string>('Todas');
  const [indyaIntake, setIndyaIntake]       = useState<number | null>(null);
  const [indyaSearch, setIndyaSearch]       = useState('');
  const [indyaRecipes, setIndyaRecipes]     = useState<Recipe[]>([]);
  const [indyaCursor, setIndyaCursor]       = useState<IndyaRecipeCursor | null>(null);
  const [indyaHasMore, setIndyaHasMore]     = useState(false);
  const [indyaLoading, setIndyaLoading]     = useState(true);
  const [indyaLoadingMore, setIndyaLoadingMore] = useState(false);

  const loadIndya = useCallback(async (
    cat: string, intake: number | null, cursor: IndyaRecipeCursor | null, append: boolean,
  ) => {
    const filters = { categoria: cat === 'Todas' ? undefined : cat, intakeType: intake ?? undefined };
    const result = await queryIndyaRecipes(filters, cursor);
    setIndyaRecipes(prev => append ? [...prev, ...result.recipes] : result.recipes);
    setIndyaCursor(result.cursor);
    setIndyaHasMore(result.hasMore);
  }, []);

  useEffect(() => {
    setIndyaLoading(true);
    loadIndya(indyaCat, indyaIntake, null, false).finally(() => setIndyaLoading(false));
  }, [indyaCat, indyaIntake, loadIndya]);

  const handleIndyaLoadMore = async () => {
    setIndyaLoadingMore(true);
    await loadIndya(indyaCat, indyaIntake, indyaCursor, true);
    setIndyaLoadingMore(false);
  };

  const filteredIndya = useMemo(() =>
    indyaSearch.trim()
      ? indyaRecipes.filter(r => r.name.toLowerCase().includes(indyaSearch.toLowerCase()))
      : indyaRecipes,
    [indyaRecipes, indyaSearch]
  );

  const liveExchanges = useMemo(() => calcExchanges(form.ingredients), [form.ingredients]);

  const filteredFoods = useMemo(() =>
    ingredientSearch.trim().length < 2
      ? []
      : foodItems.filter(f => f.label.toLowerCase().includes(ingredientSearch.toLowerCase())).slice(0, 8),
    [foodItems, ingredientSearch]
  );

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setIngSearch('');
    setIngQty(1);
    setNewExtra('');
    setNewStep('');
    setShowForm(true);
  };

  const openEdit = (recipe: Recipe) => {
    setEditingId(recipe.id);
    setForm({
      name: recipe.name,
      photoUrl: recipe.photoUrl ?? '',
      categories: [...recipe.categories],
      ingredients: [...recipe.ingredients],
      extras: [...recipe.extras],
      steps: [...recipe.steps],
    });
    setIngSearch('');
    setIngQty(1);
    setNewExtra('');
    setNewStep('');
    setShowForm(true);
  };

  const addIngredient = (item: MealItem) => {
    const newIng: RecipeIngredient = {
      foodLabel: item.label,
      category: item.category,
      mode: item.mode,
      quantity: Math.max(0.25, ingredientQty),
    };
    setForm(f => ({ ...f, ingredients: [...f.ingredients, newIng] }));
    setIngSearch('');
  };

  const removeIngredient = (idx: number) =>
    setForm(f => ({ ...f, ingredients: f.ingredients.filter((_, i) => i !== idx) }));

  const adjustIngQty = (idx: number, delta: number) =>
    setForm(f => ({
      ...f,
      ingredients: f.ingredients.map((ing, i) =>
        i === idx ? { ...ing, quantity: Math.max(0.25, Math.round((ing.quantity + delta) * 4) / 4) } : ing
      ),
    }));

  const toggleCategory = (cat: string) =>
    setForm(f => ({
      ...f,
      categories: f.categories.includes(cat)
        ? f.categories.filter(c => c !== cat)
        : [...f.categories, cat],
    }));

  const addExtra = () => {
    const t = newExtra.trim();
    if (!t) return;
    setForm(f => ({ ...f, extras: [...f.extras, t] }));
    setNewExtra('');
  };

  const addStep = () => {
    const t = newStep.trim();
    if (!t) return;
    setForm(f => ({ ...f, steps: [...f.steps, t] }));
    setNewStep('');
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const data: Omit<Recipe, 'id'> = {
      ownerId: coachId,
      name: form.name.trim(),
      ...(form.photoUrl.trim() ? { photoUrl: form.photoUrl.trim() } : {}),
      categories: form.categories,
      ingredients: form.ingredients,
      extras: form.extras,
      steps: form.steps,
    };
    try {
      if (editingId) {
        await updateRecipe(editingId, data);
        queryClient.setQueryData<Recipe[]>(recipesQueryKey, prev =>
          prev?.map(r => r.id === editingId ? { id: editingId, ...data } : r));
      } else {
        const created = await createRecipe(data);
        queryClient.setQueryData<Recipe[]>(recipesQueryKey, prev => [...(prev ?? []), created]);
      }
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    setConfirmDelete(null);
    try {
      await deleteRecipe(id);
      queryClient.setQueryData<Recipe[]>(recipesQueryKey, prev => prev?.filter(r => r.id !== id));
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Skeleton className="h-32 w-full rounded-surface" />
        <Skeleton className="h-32 w-full rounded-surface" />
        <Skeleton className="h-32 w-full rounded-surface" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="font-mono text-label text-ink-2 uppercase tracking-wider">
          {recipes.length} receta{recipes.length !== 1 ? 's' : ''} propia{recipes.length !== 1 ? 's' : ''}
        </p>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-accent text-black font-sans text-label font-bold uppercase tracking-wider rounded-control hover:bg-accent-press active:scale-95 transition-all"
        >
          <span className="material-symbols-outlined text-body-s">add</span>
          Nueva receta
        </button>
      </div>

      {recipes.length === 0 ? (
        <div className="text-center py-10 text-ink-2 font-mono text-label uppercase tracking-widest">
          Aún no has creado ninguna receta propia. La biblioteca Indya de abajo tiene 8.850 más.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {recipes.map(recipe => {
            const exchStr = formatExchanges(calcExchanges(recipe.ingredients));
            return (
              <div key={recipe.id} className="bg-raised border border-hairline rounded-surface overflow-hidden flex flex-col">
                {recipe.photoUrl && (
                  <div className="w-full h-36 overflow-hidden shrink-0">
                    <img src={recipe.photoUrl} alt={recipe.name} className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="p-4 flex-1 space-y-2">
                  <h3 className="font-sans font-bold text-title-s text-white">{recipe.name}</h3>
                  {recipe.categories.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {recipe.categories.map(c => (
                        <span key={c} className="px-2 py-0.5 rounded-full bg-raised text-ink-2 font-mono text-caption uppercase tracking-wider">{c}</span>
                      ))}
                    </div>
                  )}
                  {exchStr !== '—' && (
                    <p className="font-mono text-caption text-accent font-bold">{exchStr}</p>
                  )}
                  <p className="font-mono text-caption text-ink-2">
                    {recipe.ingredients.length} ingredientes · {recipe.steps.length} pasos
                  </p>
                </div>
                <div className="flex gap-2 px-4 pb-4">
                  {confirmDelete === recipe.id ? (
                    <>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="flex-1 py-1.5 rounded-control bg-raised text-ink-2 font-mono text-label uppercase tracking-wider hover:text-white transition-all"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={() => handleDelete(recipe.id)}
                        disabled={deleting === recipe.id}
                        className="flex-1 py-1.5 rounded-control bg-red-600 text-white font-mono text-label uppercase tracking-wider font-bold hover:bg-red-700 transition-all disabled:opacity-40"
                      >
                        {deleting === recipe.id ? '...' : '¿Eliminar?'}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => openEdit(recipe)}
                        className="flex-1 py-1.5 rounded-control bg-raised text-ink-2 font-mono text-label uppercase tracking-wider hover:text-white hover:bg-raised transition-all flex items-center justify-center gap-1"
                      >
                        <span className="material-symbols-outlined text-label">edit</span>
                        Editar
                      </button>
                      <button
                        onClick={() => setConfirmDelete(recipe.id)}
                        className="flex-1 py-1.5 rounded-control bg-red-900/20 text-red-400 font-mono text-label uppercase tracking-wider hover:bg-red-900/40 transition-all flex items-center justify-center gap-1"
                      >
                        <span className="material-symbols-outlined text-label">delete</span>
                        Eliminar
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Biblioteca Indya (solo lectura) ─────────────────────────────── */}
      <section className="space-y-4 pt-4 border-t border-hairline">
        <h2 className="font-sans font-bold text-body-s text-white uppercase tracking-wider flex items-center gap-2">
          <span className="material-symbols-outlined text-data text-title-s">library_books</span>
          Biblioteca Indya
          <span className="font-mono text-caption text-ink-2 normal-case font-normal">8.850 recetas · solo lectura</span>
        </h2>

        <div className="w-full overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
          <div className="flex gap-2 w-max">
            {INDYA_CATS.map(cat => (
              <button
                key={cat}
                onClick={() => setIndyaCat(cat)}
                className={`px-4 py-2 rounded-full font-mono text-caption font-bold whitespace-nowrap transition-all ${
                  indyaCat === cat
                    ? 'bg-data text-black shadow-md'
                    : 'bg-raised border border-hairline text-ink-2 hover:border-ink-2/40 hover:text-white'
                }`}
              >{cat}</button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setIndyaIntake(null)}
            className={`px-3 py-1.5 rounded-full font-mono text-caption uppercase tracking-wide transition-all ${
              indyaIntake === null
                ? 'bg-raised text-accent border border-accent/40'
                : 'bg-raised border border-hairline text-ink-2 hover:text-white'
            }`}
          >Todos los momentos</button>
          {Object.entries(INTAKE_LABELS).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setIndyaIntake(Number(k))}
              className={`px-3 py-1.5 rounded-full font-mono text-caption uppercase tracking-wide transition-all ${
                indyaIntake === Number(k)
                  ? 'bg-raised text-accent border border-accent/40'
                  : 'bg-raised border border-hairline text-ink-2 hover:text-white'
              }`}
            >{label}</button>
          ))}
        </div>

        <div className="relative">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-ink-2 text-title-s">search</span>
          <input
            type="text"
            value={indyaSearch}
            onChange={e => setIndyaSearch(e.target.value)}
            placeholder="Buscar en esta página…"
            className="w-full bg-raised border border-hairline rounded-control pl-9 pr-4 py-2.5 text-label text-white placeholder-ink-2/50 focus:outline-none focus:border-data/50 font-mono"
          />
        </div>

        {indyaLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Skeleton className="h-32 w-full rounded-surface" />
            <Skeleton className="h-32 w-full rounded-surface" />
            <Skeleton className="h-32 w-full rounded-surface" />
          </div>
        ) : filteredIndya.length === 0 ? (
          <div className="text-center py-16 text-ink-2 font-mono text-label uppercase tracking-widest">
            {indyaSearch ? 'Sin resultados en esta página.' : 'Sin recetas para estos filtros.'}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="font-mono text-caption text-ink-2 uppercase">
              {indyaSearch
                ? `${filteredIndya.length} de ${indyaRecipes.length} resultados en esta página`
                : `${indyaRecipes.length} receta${indyaRecipes.length !== 1 ? 's' : ''} cargada${indyaRecipes.length !== 1 ? 's' : ''}${indyaHasMore ? ' · hay más' : ''}`
              }
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {filteredIndya.map(r => <IndyaCard key={r.id} recipe={r} />)}
            </div>
            {indyaHasMore && !indyaSearch && (
              <div className="flex justify-center pt-2">
                <button
                  onClick={handleIndyaLoadMore}
                  disabled={indyaLoadingMore}
                  className="px-6 py-3 bg-raised border border-hairline hover:border-data/50 text-ink-2 hover:text-white font-mono text-label uppercase tracking-wider rounded-control transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  {indyaLoadingMore
                    ? <><span className="material-symbols-outlined text-body-s animate-spin">progress_activity</span>Cargando…</>
                    : <><span className="material-symbols-outlined text-body-s">expand_more</span>Cargar más recetas</>
                  }
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── FORM MODAL ──────────────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-start justify-center overflow-y-auto p-4">
          <div className="w-full max-w-2xl bg-bg border border-hairline rounded-surface p-6 my-6 space-y-5">

            <div className="flex items-center justify-between">
              <h2 className="font-sans font-black text-title-m text-white uppercase tracking-tight">
                {editingId ? 'Editar receta' : 'Nueva receta'}
              </h2>
              <button onClick={() => setShowForm(false)} className="text-ink-2 hover:text-white transition-colors p-1">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Name */}
            <div className="space-y-1.5">
              <label className="font-mono text-caption text-ink-2 uppercase tracking-wider">Nombre *</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ej. Bowl de pollo y quinoa"
                className="w-full bg-raised border border-hairline rounded-control px-4 py-2.5 text-body-s text-white placeholder-ink-2/50 focus:border-accent/50 focus:outline-none"
              />
            </div>

            {/* Photo URL */}
            <div className="space-y-1.5">
              <label className="font-mono text-caption text-ink-2 uppercase tracking-wider">URL de foto (opcional)</label>
              <input
                type="url"
                value={form.photoUrl}
                onChange={e => setForm(f => ({ ...f, photoUrl: e.target.value }))}
                placeholder="https://..."
                className="w-full bg-raised border border-hairline rounded-control px-4 py-2.5 text-label text-white placeholder-ink-2/50 focus:border-accent/50 focus:outline-none font-mono"
              />
              {form.photoUrl && (
                <img
                  src={form.photoUrl}
                  alt="preview"
                  className="w-full h-28 object-cover rounded-surface border border-hairline mt-1"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              )}
            </div>

            {/* Categories */}
            <div className="space-y-2">
              <label className="font-mono text-caption text-ink-2 uppercase tracking-wider">Categorías</label>
              <div className="flex flex-wrap gap-2">
                {RECIPE_CATEGORIES.map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => toggleCategory(cat)}
                    className={`px-3 py-1 rounded-full font-mono text-label uppercase tracking-wider font-bold transition-all ${
                      form.categories.includes(cat)
                        ? 'bg-accent text-black'
                        : 'bg-raised text-ink-2 hover:text-white'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Live exchanges */}
            {form.ingredients.length > 0 && (
              <div className="bg-raised border border-accent/20 rounded-surface p-3">
                <p className="font-mono text-caption text-ink-2 uppercase tracking-wider mb-2">Intercambios totales</p>
                <div className="flex flex-wrap gap-2">
                  {(Object.entries(liveExchanges) as [FoodCategory, number][])
                    .filter(([, v]) => v > 0)
                    .map(([cat, val]) => (
                      <span key={cat} className={`px-2.5 py-1 rounded-surface border font-mono text-label font-bold ${CAT_COLORS[cat]}`}>
                        {val} {CAT_LABELS[cat]}
                      </span>
                    ))
                  }
                </div>
              </div>
            )}

            {/* Ingredients */}
            <div className="space-y-3">
              <label className="font-mono text-caption text-ink-2 uppercase tracking-wider">Ingredientes</label>

              <div className="flex gap-2 items-center">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-body-s text-ink-2">search</span>
                  <input
                    type="text"
                    value={ingredientSearch}
                    onChange={e => setIngSearch(e.target.value)}
                    placeholder="Buscar alimento..."
                    className="w-full bg-raised border border-hairline rounded-control pl-9 pr-4 py-2.5 text-body-s text-white placeholder-ink-2/50 focus:border-accent/50 focus:outline-none"
                  />
                  {filteredFoods.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-raised border border-hairline rounded-surface overflow-hidden z-10 shadow-2xl">
                      {filteredFoods.map(item => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => addIngredient(item)}
                          className="w-full text-left px-4 py-2.5 hover:bg-raised transition-colors flex items-center justify-between"
                        >
                          <span className="text-label text-white font-sans truncate pr-2">{item.label}</span>
                          <span className={`font-mono text-caption font-bold shrink-0 ${CAT_COLORS[item.category].split(' ')[0]}`}>
                            {CAT_LABELS[item.category]}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {/* Qty stepper */}
                <div className="flex items-center gap-1 shrink-0 bg-raised border border-hairline rounded-surface px-1">
                  <button type="button" onClick={() => setIngQty(q => Math.max(0.25, Math.round((q - 0.25) * 4) / 4))} className="w-7 h-9 text-white hover:text-accent transition-colors font-bold">-</button>
                  <span className="w-8 text-center font-mono text-body-s text-white select-none">{ingredientQty}</span>
                  <button type="button" onClick={() => setIngQty(q => Math.round((q + 0.25) * 4) / 4)} className="w-7 h-9 text-white hover:text-accent transition-colors font-bold">+</button>
                </div>
              </div>

              {form.ingredients.length > 0 && (
                <ul className="space-y-1.5">
                  {form.ingredients.map((ing, idx) => (
                    <li key={idx} className="flex items-center gap-2 px-3 py-2 bg-raised rounded-surface border border-hairline">
                      <span className="text-label text-white font-sans flex-1 truncate">{ing.foodLabel}</span>
                      <span className={`font-mono text-caption font-bold shrink-0 ${CAT_COLORS[ing.category].split(' ')[0]}`}>{CAT_LABELS[ing.category]}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        <button type="button" onClick={() => adjustIngQty(idx, -0.25)} className="w-6 h-6 bg-raised rounded-control text-white text-label hover:bg-raised transition-colors">-</button>
                        <span className="w-8 text-center font-mono text-label text-white select-none">{ing.quantity}</span>
                        <button type="button" onClick={() => adjustIngQty(idx, 0.25)} className="w-6 h-6 bg-raised rounded-control text-white text-label hover:bg-raised transition-colors">+</button>
                      </div>
                      <button type="button" onClick={() => removeIngredient(idx)} className="text-ink-2 hover:text-red-400 transition-colors">
                        <span className="material-symbols-outlined text-body-s">close</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Extras */}
            <div className="space-y-2">
              <label className="font-mono text-caption text-ink-2 uppercase tracking-wider">Extras (condimentos, sal…)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newExtra}
                  onChange={e => setNewExtra(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addExtra(); } }}
                  placeholder="Ej. Sal al gusto"
                  className="flex-1 bg-raised border border-hairline rounded-control px-4 py-2 text-body-s text-white placeholder-ink-2/50 focus:border-accent/50 focus:outline-none"
                />
                <button type="button" onClick={addExtra} className="px-4 py-2 bg-raised rounded-control text-ink-2 hover:text-white transition-colors font-mono text-label uppercase">Añadir</button>
              </div>
              {form.extras.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {form.extras.map((ex, idx) => (
                    <span key={idx} className="flex items-center gap-1 px-2.5 py-1 bg-raised rounded-full">
                      <span className="font-mono text-caption text-ink-2">{ex}</span>
                      <button type="button" onClick={() => setForm(f => ({ ...f, extras: f.extras.filter((_, i) => i !== idx) }))} className="text-ink-2 hover:text-red-400 transition-colors">
                        <span className="material-symbols-outlined text-label leading-none" style={{ fontSize: '14px' }}>close</span>
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Steps */}
            <div className="space-y-2">
              <label className="font-mono text-caption text-ink-2 uppercase tracking-wider">Pasos de preparación</label>
              <div className="flex gap-2 items-end">
                <textarea
                  value={newStep}
                  onChange={e => setNewStep(e.target.value)}
                  placeholder="Describe el paso..."
                  rows={2}
                  className="flex-1 bg-raised border border-hairline rounded-control px-4 py-2 text-body-s text-white placeholder-ink-2/50 focus:border-accent/50 focus:outline-none resize-none"
                />
                <button type="button" onClick={addStep} className="px-4 py-2 bg-raised rounded-control text-ink-2 hover:text-white transition-colors font-mono text-label uppercase self-end mb-0">Añadir</button>
              </div>
              {form.steps.length > 0 && (
                <ol className="space-y-2">
                  {form.steps.map((step, idx) => (
                    <li key={idx} className="flex items-start gap-3 px-3 py-2.5 bg-raised rounded-surface border border-hairline">
                      <span className="w-5 h-5 rounded-full bg-raised text-ink-2 font-mono text-caption font-bold flex items-center justify-center shrink-0 mt-0.5">{idx + 1}</span>
                      <p className="text-label text-ink-2 flex-1 leading-relaxed">{step}</p>
                      <button type="button" onClick={() => setForm(f => ({ ...f, steps: f.steps.filter((_, i) => i !== idx) }))} className="text-ink-2 hover:text-red-400 transition-colors shrink-0">
                        <span className="material-symbols-outlined text-body-s">close</span>
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <div className="flex gap-3 pt-2 border-t border-hairline">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="flex-1 py-2.5 rounded-control bg-raised text-ink-2 font-mono text-label uppercase tracking-wider hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !form.name.trim()}
                className="flex-1 py-2.5 rounded-control bg-accent text-black font-sans text-label uppercase tracking-wider font-bold hover:bg-accent-press disabled:opacity-40 transition-all active:scale-95"
              >
                {saving ? 'Guardando…' : editingId ? 'Actualizar' : 'Crear receta'}
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
