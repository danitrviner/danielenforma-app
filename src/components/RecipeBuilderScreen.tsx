import React, { useState, useEffect, useMemo } from 'react';
import { Recipe, RecipeIngredient, MealItem, FoodCategory } from '../types';
import { getRecipes, createRecipe, updateRecipe, deleteRecipe, getFoodItems } from '../dbService';

const RECIPE_CATEGORIES = ['Alta proteína', 'Rápida', 'Pre-entreno', 'Recuperación', 'Desayuno', 'Cena'];

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

export default function RecipeBuilderScreen({ coachId }: Props) {
  const [recipes, setRecipes]               = useState<Recipe[]>([]);
  const [foodItems, setFoodItems]           = useState<MealItem[]>([]);
  const [loading, setLoading]               = useState(true);
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

  useEffect(() => {
    Promise.all([getRecipes(), getFoodItems()]).then(([recs, foods]) => {
      setRecipes(recs);
      setFoodItems(foods);
      setLoading(false);
    });
  }, []);

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
        setRecipes(prev => prev.map(r => r.id === editingId ? { id: editingId, ...data } : r));
      } else {
        const created = await createRecipe(data);
        setRecipes(prev => [...prev, created]);
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
      setRecipes(prev => prev.filter(r => r.id !== id));
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <span className="font-mono text-xs text-[#c6c9ab] uppercase tracking-widest animate-pulse">Cargando recetas...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="font-mono text-xs text-[#c6c9ab] uppercase tracking-wider">
          {recipes.length} receta{recipes.length !== 1 ? 's' : ''} en biblioteca
        </p>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-[#e2ff00] text-black font-mono text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-[#bad200] active:scale-95 transition-all"
        >
          <span className="material-symbols-outlined text-sm">add</span>
          Nueva receta
        </button>
      </div>

      {recipes.length === 0 ? (
        <div className="text-center py-24 text-[#c6c9ab] font-mono text-xs uppercase tracking-widest">
          No hay recetas todavía. Crea la primera.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {recipes.map(recipe => {
            const exchStr = formatExchanges(calcExchanges(recipe.ingredients));
            return (
              <div key={recipe.id} className="bg-[#1c1b1b] border border-[#2a2a2a] rounded-xl overflow-hidden flex flex-col">
                {recipe.photoUrl && (
                  <div className="w-full h-36 overflow-hidden shrink-0">
                    <img src={recipe.photoUrl} alt={recipe.name} className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="p-4 flex-1 space-y-2">
                  <h3 className="font-sans font-bold text-sm text-white">{recipe.name}</h3>
                  {recipe.categories.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {recipe.categories.map(c => (
                        <span key={c} className="px-2 py-0.5 rounded-full bg-[#2a2a2a] text-[#c6c9ab] font-mono text-[9px] uppercase tracking-wider">{c}</span>
                      ))}
                    </div>
                  )}
                  {exchStr !== '—' && (
                    <p className="font-mono text-[10px] text-[#e2ff00] font-bold">{exchStr}</p>
                  )}
                  <p className="font-mono text-[10px] text-[#c6c9ab]">
                    {recipe.ingredients.length} ingredientes · {recipe.steps.length} pasos
                  </p>
                </div>
                <div className="flex gap-2 px-4 pb-4">
                  {confirmDelete === recipe.id ? (
                    <>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="flex-1 py-1.5 rounded-lg bg-[#2a2a2a] text-[#c6c9ab] font-mono text-[10px] uppercase tracking-wider hover:text-white transition-all"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={() => handleDelete(recipe.id)}
                        disabled={deleting === recipe.id}
                        className="flex-1 py-1.5 rounded-lg bg-red-600 text-white font-mono text-[10px] uppercase tracking-wider font-bold hover:bg-red-700 transition-all disabled:opacity-40"
                      >
                        {deleting === recipe.id ? '...' : '¿Eliminar?'}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => openEdit(recipe)}
                        className="flex-1 py-1.5 rounded-lg bg-[#2a2a2a] text-[#c6c9ab] font-mono text-[10px] uppercase tracking-wider hover:text-white hover:bg-[#3a3a3a] transition-all flex items-center justify-center gap-1"
                      >
                        <span className="material-symbols-outlined text-xs">edit</span>
                        Editar
                      </button>
                      <button
                        onClick={() => setConfirmDelete(recipe.id)}
                        className="flex-1 py-1.5 rounded-lg bg-red-900/20 text-red-400 font-mono text-[10px] uppercase tracking-wider hover:bg-red-900/40 transition-all flex items-center justify-center gap-1"
                      >
                        <span className="material-symbols-outlined text-xs">delete</span>
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

      {/* ── FORM MODAL ──────────────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-start justify-center overflow-y-auto p-4">
          <div className="w-full max-w-2xl bg-[#131313] border border-[#2a2a2a] rounded-2xl p-6 my-6 space-y-5">

            <div className="flex items-center justify-between">
              <h2 className="font-sans font-black text-xl text-white uppercase tracking-tight">
                {editingId ? 'Editar receta' : 'Nueva receta'}
              </h2>
              <button onClick={() => setShowForm(false)} className="text-[#c6c9ab] hover:text-white transition-colors p-1">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Name */}
            <div className="space-y-1.5">
              <label className="font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider">Nombre *</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ej. Bowl de pollo y quinoa"
                className="w-full bg-[#1c1b1b] border border-[#2a2a2a] rounded-lg px-4 py-2.5 text-sm text-white placeholder-[#c6c9ab]/50 focus:border-[#e2ff00]/50 focus:outline-none"
              />
            </div>

            {/* Photo URL */}
            <div className="space-y-1.5">
              <label className="font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider">URL de foto (opcional)</label>
              <input
                type="url"
                value={form.photoUrl}
                onChange={e => setForm(f => ({ ...f, photoUrl: e.target.value }))}
                placeholder="https://..."
                className="w-full bg-[#1c1b1b] border border-[#2a2a2a] rounded-lg px-4 py-2.5 text-xs text-white placeholder-[#c6c9ab]/50 focus:border-[#e2ff00]/50 focus:outline-none font-mono"
              />
              {form.photoUrl && (
                <img
                  src={form.photoUrl}
                  alt="preview"
                  className="w-full h-28 object-cover rounded-lg border border-[#2a2a2a] mt-1"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              )}
            </div>

            {/* Categories */}
            <div className="space-y-2">
              <label className="font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider">Categorías</label>
              <div className="flex flex-wrap gap-2">
                {RECIPE_CATEGORIES.map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => toggleCategory(cat)}
                    className={`px-3 py-1 rounded-full font-mono text-[10px] uppercase tracking-wider font-bold transition-all ${
                      form.categories.includes(cat)
                        ? 'bg-[#e2ff00] text-black'
                        : 'bg-[#2a2a2a] text-[#c6c9ab] hover:text-white'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Live exchanges */}
            {form.ingredients.length > 0 && (
              <div className="bg-[#1a1a1a] border border-[#e2ff00]/20 rounded-xl p-3">
                <p className="font-mono text-[9px] text-[#c6c9ab] uppercase tracking-wider mb-2">Intercambios totales</p>
                <div className="flex flex-wrap gap-2">
                  {(Object.entries(liveExchanges) as [FoodCategory, number][])
                    .filter(([, v]) => v > 0)
                    .map(([cat, val]) => (
                      <span key={cat} className={`px-2.5 py-1 rounded-lg border font-mono text-xs font-bold ${CAT_COLORS[cat]}`}>
                        {val} {CAT_LABELS[cat]}
                      </span>
                    ))
                  }
                </div>
              </div>
            )}

            {/* Ingredients */}
            <div className="space-y-3">
              <label className="font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider">Ingredientes</label>

              <div className="flex gap-2 items-center">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-sm text-[#c6c9ab]">search</span>
                  <input
                    type="text"
                    value={ingredientSearch}
                    onChange={e => setIngSearch(e.target.value)}
                    placeholder="Buscar alimento..."
                    className="w-full bg-[#1c1b1b] border border-[#2a2a2a] rounded-lg pl-9 pr-4 py-2.5 text-sm text-white placeholder-[#c6c9ab]/50 focus:border-[#e2ff00]/50 focus:outline-none"
                  />
                  {filteredFoods.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-[#1c1b1b] border border-[#2a2a2a] rounded-xl overflow-hidden z-10 shadow-2xl">
                      {filteredFoods.map(item => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => addIngredient(item)}
                          className="w-full text-left px-4 py-2.5 hover:bg-[#2a2a2a] transition-colors flex items-center justify-between"
                        >
                          <span className="text-xs text-white font-sans truncate pr-2">{item.label}</span>
                          <span className={`font-mono text-[9px] font-bold shrink-0 ${CAT_COLORS[item.category].split(' ')[0]}`}>
                            {CAT_LABELS[item.category]}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {/* Qty stepper */}
                <div className="flex items-center gap-1 shrink-0 bg-[#1c1b1b] border border-[#2a2a2a] rounded-lg px-1">
                  <button type="button" onClick={() => setIngQty(q => Math.max(0.25, Math.round((q - 0.25) * 4) / 4))} className="w-7 h-9 text-white hover:text-[#e2ff00] transition-colors font-bold">-</button>
                  <span className="w-8 text-center font-mono text-sm text-white select-none">{ingredientQty}</span>
                  <button type="button" onClick={() => setIngQty(q => Math.round((q + 0.25) * 4) / 4)} className="w-7 h-9 text-white hover:text-[#e2ff00] transition-colors font-bold">+</button>
                </div>
              </div>

              {form.ingredients.length > 0 && (
                <ul className="space-y-1.5">
                  {form.ingredients.map((ing, idx) => (
                    <li key={idx} className="flex items-center gap-2 px-3 py-2 bg-[#1c1b1b] rounded-lg border border-[#2a2a2a]">
                      <span className="text-xs text-white font-sans flex-1 truncate">{ing.foodLabel}</span>
                      <span className={`font-mono text-[9px] font-bold shrink-0 ${CAT_COLORS[ing.category].split(' ')[0]}`}>{CAT_LABELS[ing.category]}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        <button type="button" onClick={() => adjustIngQty(idx, -0.25)} className="w-6 h-6 bg-[#2a2a2a] rounded text-white text-xs hover:bg-[#3a3a3a] transition-colors">-</button>
                        <span className="w-8 text-center font-mono text-xs text-white select-none">{ing.quantity}</span>
                        <button type="button" onClick={() => adjustIngQty(idx, 0.25)} className="w-6 h-6 bg-[#2a2a2a] rounded text-white text-xs hover:bg-[#3a3a3a] transition-colors">+</button>
                      </div>
                      <button type="button" onClick={() => removeIngredient(idx)} className="text-[#c6c9ab] hover:text-red-400 transition-colors">
                        <span className="material-symbols-outlined text-sm">close</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Extras */}
            <div className="space-y-2">
              <label className="font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider">Extras (condimentos, sal…)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newExtra}
                  onChange={e => setNewExtra(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addExtra(); } }}
                  placeholder="Ej. Sal al gusto"
                  className="flex-1 bg-[#1c1b1b] border border-[#2a2a2a] rounded-lg px-4 py-2 text-sm text-white placeholder-[#c6c9ab]/50 focus:border-[#e2ff00]/50 focus:outline-none"
                />
                <button type="button" onClick={addExtra} className="px-4 py-2 bg-[#2a2a2a] rounded-lg text-[#c6c9ab] hover:text-white transition-colors font-mono text-xs uppercase">Añadir</button>
              </div>
              {form.extras.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {form.extras.map((ex, idx) => (
                    <span key={idx} className="flex items-center gap-1 px-2.5 py-1 bg-[#2a2a2a] rounded-full">
                      <span className="font-mono text-[10px] text-[#c6c9ab]">{ex}</span>
                      <button type="button" onClick={() => setForm(f => ({ ...f, extras: f.extras.filter((_, i) => i !== idx) }))} className="text-[#c6c9ab] hover:text-red-400 transition-colors">
                        <span className="material-symbols-outlined text-xs leading-none" style={{ fontSize: '14px' }}>close</span>
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Steps */}
            <div className="space-y-2">
              <label className="font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider">Pasos de preparación</label>
              <div className="flex gap-2 items-end">
                <textarea
                  value={newStep}
                  onChange={e => setNewStep(e.target.value)}
                  placeholder="Describe el paso..."
                  rows={2}
                  className="flex-1 bg-[#1c1b1b] border border-[#2a2a2a] rounded-lg px-4 py-2 text-sm text-white placeholder-[#c6c9ab]/50 focus:border-[#e2ff00]/50 focus:outline-none resize-none"
                />
                <button type="button" onClick={addStep} className="px-4 py-2 bg-[#2a2a2a] rounded-lg text-[#c6c9ab] hover:text-white transition-colors font-mono text-xs uppercase self-end mb-0">Añadir</button>
              </div>
              {form.steps.length > 0 && (
                <ol className="space-y-2">
                  {form.steps.map((step, idx) => (
                    <li key={idx} className="flex items-start gap-3 px-3 py-2.5 bg-[#1c1b1b] rounded-lg border border-[#2a2a2a]">
                      <span className="w-5 h-5 rounded-full bg-[#2a2a2a] text-[#c6c9ab] font-mono text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{idx + 1}</span>
                      <p className="text-xs text-[#c6c9ab] flex-1 leading-relaxed">{step}</p>
                      <button type="button" onClick={() => setForm(f => ({ ...f, steps: f.steps.filter((_, i) => i !== idx) }))} className="text-[#c6c9ab] hover:text-red-400 transition-colors shrink-0">
                        <span className="material-symbols-outlined text-sm">close</span>
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <div className="flex gap-3 pt-2 border-t border-[#2a2a2a]">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="flex-1 py-2.5 rounded-xl bg-[#2a2a2a] text-[#c6c9ab] font-mono text-xs uppercase tracking-wider hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !form.name.trim()}
                className="flex-1 py-2.5 rounded-xl bg-[#e2ff00] text-black font-mono text-xs uppercase tracking-wider font-bold hover:bg-[#bad200] disabled:opacity-40 transition-all active:scale-95"
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
