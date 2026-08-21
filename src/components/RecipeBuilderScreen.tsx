import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Recipe, RecipeIngredient, MealItem, FoodCategory } from '../types';
import { getRecipes, createRecipe, updateRecipe, deleteRecipe, getFoodItems, queryRecetas } from '../dbService';
import type { RecetasCursor } from '../dbService';
import { roundQuarter } from '../utils/exchangeHelpers';
import { Skeleton, Icon } from './ui';
import { EmptyState, Badge, Chip, Dialog, Button, Input } from './ui';

const RECIPE_CATEGORIES = ['Alta proteína', 'Rápida', 'Pre-entreno', 'Recuperación', 'Desayuno', 'Cena'];

// Categories/intake types as stored on imported imported recipes (see scripts/importRecetas.mjs) —
// mirrors the athlete-facing browser in RecipesScreen.tsx.
const RECETAS_CATS = [
  'Todas',
  'Platos salados / principales',
  'Desayuno y dulces',
  'Bebidas',
  'Suplementos deportivos',
];

const INTAKE_LABELS: Record<number, string> = {
  1: 'Desayuno', 2: 'Media mañana', 3: 'Comida', 4: 'Merienda', 5: 'Cena',
};

function RecetaCard({ recipe }: { recipe: Recipe; key?: React.Key }) {
  const photo = recipe.image ?? recipe.photoUrl;
  return (
    <article className="relative rounded-surface overflow-hidden bg-raised border border-hairline aspect-[4/5] flex flex-col justify-end">
      {photo
        ? <img src={photo} alt={recipe.name} className="absolute inset-0 w-full h-full object-cover opacity-70" />
        : <div className="absolute inset-0 bg-gradient-to-br from-raised to-bg flex items-center justify-center">
            <Icon name="skillet" size="xl" className="text-ink-3" />
          </div>
      }
      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/50 to-transparent" />
      {recipe.kcal ? (
        <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm rounded-control px-2 font-mono text-caption text-ink-2 z-10">
          {recipe.kcal} kcal
        </div>
      ) : null}
      <p className="relative z-10 p-3 text-label text-white font-sans font-bold leading-tight">{recipe.name}</p>
    </article>
  );
}

const CAT_LABELS: Record<FoodCategory, string> = {
  HC: 'HC', PROT: 'PROT', GRASA: 'GRASA', MIX_HC: 'MIX·HC', MIX_GRASA: 'MIX·GRASA',
};

const CAT_COLORS: Record<FoodCategory, string> = {
  HC:        'text-warning border-warning/30 bg-warning/10',
  PROT:      'text-info border-info/30 bg-info/10',
  GRASA:     'text-success border-success/30 bg-success/10',
  MIX_HC:    'text-data border-data/30 bg-data/10',
  MIX_GRASA: 'text-danger border-danger/30 bg-danger/10',
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
    queryFn: () => getRecipes(),
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

  // Recetas library browser (read-only) — the coach's own recipes above come from
  // getRecipes(), which deliberately excludes the 8.850 imported imported recipes to
  // avoid downloading the full collection; browse those separately, paginated.
  const [recetasCat, setRecetasCat]             = useState<string>('Todas');
  const [recetasIntake, setRecetasIntake]       = useState<number | null>(null);
  const [recetasSearch, setRecetasSearch]       = useState('');
  const [recetasRecipes, setRecetasRecipes]     = useState<Recipe[]>([]);
  const [recetasCursor, setRecetasCursor]       = useState<RecetasCursor | null>(null);
  const [recetasHasMore, setRecetasHasMore]     = useState(false);
  const [recetasLoading, setRecetasLoading]     = useState(true);
  const [recetasLoadingMore, setRecetasLoadingMore] = useState(false);

  const loadRecetas = useCallback(async (
    cat: string, intake: number | null, cursor: RecetasCursor | null, append: boolean,
  ) => {
    const filters = { categoria: cat === 'Todas' ? undefined : cat, intakeType: intake ?? undefined };
    const result = await queryRecetas(filters, cursor);
    setRecetasRecipes(prev => append ? [...prev, ...result.recipes] : result.recipes);
    setRecetasCursor(result.cursor);
    setRecetasHasMore(result.hasMore);
  }, []);

  useEffect(() => {
    setRecetasLoading(true);
    loadRecetas(recetasCat, recetasIntake, null, false).finally(() => setRecetasLoading(false));
  }, [recetasCat, recetasIntake, loadRecetas]);

  const handleRecetasLoadMore = async () => {
    setRecetasLoadingMore(true);
    await loadRecetas(recetasCat, recetasIntake, recetasCursor, true);
    setRecetasLoadingMore(false);
  };

  const filteredRecetas = useMemo(() =>
    recetasSearch.trim()
      ? recetasRecipes.filter(r => r.name.toLowerCase().includes(recetasSearch.toLowerCase()))
      : recetasRecipes,
    [recetasRecipes, recetasSearch]
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
        i === idx ? { ...ing, quantity: Math.max(0.25, roundQuarter(ing.quantity + delta)) } : ing
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
        <Button variant="primary" size="s" icon="add" onClick={openCreate}>
          Nueva receta
        </Button>
      </div>

      {recipes.length === 0 ? (
        <EmptyState icon="restaurant_menu" title="Aún no has creado ninguna receta propia. El recetario de abajo tiene 8.850." />
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
                        <Badge key={c} tone="neutral">{c}</Badge>
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
                <div className="flex items-center justify-end gap-1 px-4 pb-4">
                  <button onClick={() => openEdit(recipe)} aria-label="Editar" className="text-ink-2 hover:text-accent p-2 rounded-control transition-all">
                    <Icon name="edit" size="s" />
                  </button>
                  <button onClick={() => setConfirmDelete(recipe.id)} aria-label="Eliminar" className="text-ink-2 hover:text-danger p-2 rounded-control transition-all">
                    <Icon name="delete" size="s" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Recetario importado (solo lectura) ────────────────────────────── */}
      <section className="space-y-4 pt-4 border-t border-hairline">
        <h2 className="font-sans font-bold text-body-s text-white uppercase tracking-wider flex items-center gap-2">
          <Icon name="library_books" size="m" className="text-data" />
          Recetario
          <span className="font-sans text-caption text-ink-2 normal-case font-normal">8.850 recetas · solo lectura</span>
        </h2>

        <div className="w-full overflow-x-auto hide-scrollbar -mx-4 px-4 md:mx-0 md:px-0">
          <div className="flex gap-2 w-max">
            {RECETAS_CATS.map(cat => (
              <button
                key={cat}
                onClick={() => setRecetasCat(cat)}
                className={`px-4 py-2 rounded-full font-mono text-caption font-bold whitespace-nowrap transition-all ${
                  recetasCat === cat
                    ? 'bg-data text-black'
                    : 'bg-raised border border-hairline text-ink-2 hover:border-ink-2/40 hover:text-white'
                }`}
              >{cat}</button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Chip selected={recetasIntake === null} onClick={() => setRecetasIntake(null)}>Todos los momentos</Chip>
          {Object.entries(INTAKE_LABELS).map(([k, label]) => (
            <Chip key={k} selected={recetasIntake === Number(k)} onClick={() => setRecetasIntake(Number(k))}>{label}</Chip>
          ))}
        </div>

        <Input
          icon="search"
          value={recetasSearch}
          onChange={setRecetasSearch}
          placeholder="Buscar en esta página…"
        />

        {recetasLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Skeleton className="h-32 w-full rounded-surface" />
            <Skeleton className="h-32 w-full rounded-surface" />
            <Skeleton className="h-32 w-full rounded-surface" />
          </div>
        ) : filteredRecetas.length === 0 ? (
          <EmptyState icon="search_off" title={recetasSearch ? 'Sin resultados en esta página.' : 'Sin recetas para estos filtros.'} />
        ) : (
          <div className="space-y-3">
            <p className="font-sans text-caption text-ink-2 uppercase">
              {recetasSearch
                ? `${filteredRecetas.length} de ${recetasRecipes.length} resultados en esta página`
                : `${recetasRecipes.length} receta${recetasRecipes.length !== 1 ? 's' : ''} cargada${recetasRecipes.length !== 1 ? 's' : ''}${recetasHasMore ? ' · hay más' : ''}`
              }
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {filteredRecetas.map(r => <RecetaCard key={r.id} recipe={r} />)}
            </div>
            {recetasHasMore && !recetasSearch && (
              <div className="flex justify-center pt-2">
                <Button
                  variant="secondary"
                  icon="expand_more"
                  onClick={handleRecetasLoadMore}
                  loading={recetasLoadingMore}
                  loadingLabel="Cargando…"
                >
                  Cargar más recetas
                </Button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── FORM MODAL ──────────────────────────────────────────────────── */}
      {showForm && (
        <Dialog
          open
          onClose={() => setShowForm(false)}
          title={editingId ? 'Editar receta' : 'Nueva receta'}
          size="xl"
          footer={(
            <>
              <Button variant="secondary" onClick={() => setShowForm(false)} className="flex-1">
                Cancelar
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || !form.name.trim()}
                loading={saving}
                className="flex-1"
              >
                {saving ? 'Guardando…' : editingId ? 'Actualizar' : 'Crear receta'}
              </Button>
            </>
          )}
        >
          <div className="space-y-5">

            {/* Name */}
            <Input
              label="Nombre"
              required
              value={form.name}
              onChange={v => setForm(f => ({ ...f, name: v }))}
              placeholder="Ej. Bowl de pollo y quinoa"
            />

            {/* Photo URL */}
            <div className="space-y-2">
              <Input
                label="URL de foto"
                hint="Opcional."
                type="url"
                value={form.photoUrl}
                onChange={v => setForm(f => ({ ...f, photoUrl: v }))}
                placeholder="https://..."
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
                  <Chip key={cat} selected={form.categories.includes(cat)} onClick={() => toggleCategory(cat)}>
                    {cat}
                  </Chip>
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
                      <span key={cat} className={`px-3 py-1 rounded-surface border font-mono text-label font-bold ${CAT_COLORS[cat]}`}>
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
                  <Input
                    icon="search"
                    value={ingredientSearch}
                    onChange={setIngSearch}
                    placeholder="Buscar alimento..."
                  />
                  {filteredFoods.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-raised border border-hairline rounded-surface overflow-hidden z-10 shadow-e2">
                      {filteredFoods.map(item => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => addIngredient(item)}
                          className="w-full text-left px-4 py-3 hover:bg-raised transition-colors flex items-center justify-between"
                        >
                          <span className="text-label text-white font-sans truncate pr-2">{item.label}</span>
                          <span className={`font-sans text-caption font-bold shrink-0 ${CAT_COLORS[item.category].split(' ')[0]}`}>
                            {CAT_LABELS[item.category]}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {/* Qty stepper */}
                <div className="flex items-center gap-1 shrink-0 bg-raised border border-hairline rounded-surface px-1">
                  <button type="button" onClick={() => setIngQty(q => Math.max(0.25, roundQuarter(q - 0.25)))} className="w-7 h-9 text-white hover:text-accent transition-colors font-bold">-</button>
                  <span className="w-8 text-center font-mono text-body-s text-white select-none">{ingredientQty}</span>
                  <button type="button" onClick={() => setIngQty(q => roundQuarter(q + 0.25))} className="w-7 h-9 text-white hover:text-accent transition-colors font-bold">+</button>
                </div>
              </div>

              {form.ingredients.length > 0 && (
                <ul className="space-y-2">
                  {form.ingredients.map((ing, idx) => (
                    <li key={idx} className="flex items-center gap-2 px-3 py-2 bg-raised rounded-surface border border-hairline">
                      <span className="text-label text-white font-sans flex-1 truncate">{ing.foodLabel}</span>
                      <span className={`font-sans text-caption font-bold shrink-0 ${CAT_COLORS[ing.category].split(' ')[0]}`}>{CAT_LABELS[ing.category]}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        <button type="button" onClick={() => adjustIngQty(idx, -0.25)} className="w-6 h-6 bg-raised rounded-control text-white text-label hover:bg-raised transition-colors">-</button>
                        <span className="w-8 text-center font-mono text-label text-white select-none">{ing.quantity}</span>
                        <button type="button" onClick={() => adjustIngQty(idx, 0.25)} className="w-6 h-6 bg-raised rounded-control text-white text-label hover:bg-raised transition-colors">+</button>
                      </div>
                      <button type="button" onClick={() => removeIngredient(idx)} className="text-ink-2 hover:text-danger transition-colors">
                        <Icon name="close" size="s" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Extras */}
            <div className="space-y-2">
              <label className="font-sans text-caption text-ink-2 uppercase tracking-wider">Extras (condimentos, sal…)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newExtra}
                  onChange={e => setNewExtra(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addExtra(); } }}
                  placeholder="Ej. Sal al gusto"
                  className="flex-1 bg-raised border border-hairline rounded-control px-4 py-2 text-title-s text-white placeholder-ink-2/50 focus:border-accent/50 focus:outline-none"
                />
                <button type="button" onClick={addExtra} className="px-4 py-2 bg-raised rounded-control text-ink-2 hover:text-white transition-colors font-sans text-label uppercase">Añadir</button>
              </div>
              {form.extras.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {form.extras.map((ex, idx) => (
                    <span key={idx} className="flex items-center gap-1 px-3 py-1 bg-raised rounded-full">
                      <span className="font-mono text-caption text-ink-2">{ex}</span>
                      <button type="button" onClick={() => setForm(f => ({ ...f, extras: f.extras.filter((_, i) => i !== idx) }))} className="text-ink-2 hover:text-danger transition-colors">
                        <Icon name="close" size="s" />
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
                  className="flex-1 bg-raised border border-hairline rounded-control px-4 py-2 text-title-s text-white placeholder-ink-2/50 focus:border-accent/50 focus:outline-none resize-none"
                />
                <button type="button" onClick={addStep} className="px-4 py-2 bg-raised rounded-control text-ink-2 hover:text-white transition-colors font-sans text-label uppercase self-end mb-0">Añadir</button>
              </div>
              {form.steps.length > 0 && (
                <ol className="space-y-2">
                  {form.steps.map((step, idx) => (
                    <li key={idx} className="flex items-start gap-3 px-3 py-3 bg-raised rounded-surface border border-hairline">
                      <span className="w-5 h-5 rounded-full bg-raised text-ink-2 font-mono text-caption font-bold flex items-center justify-center shrink-0 ">{idx + 1}</span>
                      <p className="text-label text-ink-2 flex-1 leading-relaxed">{step}</p>
                      <button type="button" onClick={() => setForm(f => ({ ...f, steps: f.steps.filter((_, i) => i !== idx) }))} className="text-ink-2 hover:text-danger transition-colors shrink-0">
                        <Icon name="close" size="s" />
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </div>

          </div>
        </Dialog>
      )}

      {/* ── DELETE CONFIRM ──────────────────────────────────────────────── */}
      {confirmDelete && (
        <Dialog
          open
          onClose={() => setConfirmDelete(null)}
          title="¿Eliminar receta?"
          size="s"
          footer={(
            <>
              <Button variant="secondary" onClick={() => setConfirmDelete(null)} className="flex-1">Cancelar</Button>
              <Button
                variant="danger"
                onClick={() => handleDelete(confirmDelete)}
                disabled={deleting === confirmDelete}
                loading={deleting === confirmDelete}
                className="flex-1"
              >
                Eliminar
              </Button>
            </>
          )}
        >
          <p className="font-sans text-caption text-ink-2">
            «{recipes.find(r => r.id === confirmDelete)?.name}»
          </p>
        </Dialog>
      )}
    </div>
  );
}
