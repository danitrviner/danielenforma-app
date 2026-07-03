import React, { useState, useEffect, useMemo } from 'react';
import { Diet, DietItem, DietMeal, FoodCategory, DietMode, MealItem, UserProfile, OnboardingData } from '../types';
import { getDietsForAthlete, createDiet, updateDiet, deleteDiet, getFoodItems, seedFoodItemsIfEmpty, getAthleteNutritionConfig, getAllUserProfiles } from '../dbService';
import { DietViewSelector, DietFotosView, DietNumerosView, useDietViewMode } from './DietMealsView';
import { CATS, BUDGET_CATS, CAT_LABEL, CAT_COLOR, MODE_LABEL, round2, fmtQty, parseBaseGrams, addToPlaced } from '../utils/exchangeHelpers';

// ── Constants ──────────────────────────────────────────────────────────────────

// Local CAT_BG bakes in the text color class (unlike the shared exchangeHelpers
// version) because every usage site in this file renders it standalone.
const CAT_BG: Record<FoodCategory, string> = {
  HC: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
  PROT: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
  GRASA: 'bg-orange-500/10 text-orange-300 border-orange-500/20',
  MIX_HC: 'bg-violet-500/10 text-violet-300 border-violet-500/20',
  MIX_GRASA: 'bg-pink-500/10 text-pink-300 border-pink-500/20',
};

// ── Helpers ────────────────────────────────────────────────────────────────────

const makeId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;

function computeGrams(label: string, qty: number): number | undefined {
  const base = parseBaseGrams(label);
  return base != null ? Math.round(base * qty * 10) / 10 : undefined;
}

function itemWeightLabel(foodLabel: string, qty: number): string {
  const g = computeGrams(foodLabel, qty);
  if (g == null) return `×${fmtQty(qty)}`;
  if (g >= 1000) return `${(g / 1000).toFixed(1)}kg`;
  return `${g}g`;
}

function computePlaced(meals: DietMeal[]): Record<FoodCategory, number> {
  const p: Record<FoodCategory, number> = { HC: 0, PROT: 0, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0 };
  for (const meal of meals)
    for (const item of meal.items) addToPlaced(p, item.category, item.quantity);
  return p;
}

function computeMealPlaced(meal: DietMeal): Record<FoodCategory, number> {
  const p: Record<FoodCategory, number> = { HC: 0, PROT: 0, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0 };
  for (const item of meal.items) addToPlaced(p, item.category, item.quantity);
  return p;
}

// Distributes `total` across `n` slots in 0.25 steps; extras go to the first slots
function distributeEvenly(total: number, n: number): number[] {
  if (n === 0) return [];
  const units = Math.round(total / 0.25);
  const base = Math.floor(units / n);
  const extra = units - base * n;
  return Array.from({ length: n }, (_, i) => round2((base + (i < extra ? 1 : 0)) * 0.25));
}

function blankBudget(): Record<FoodCategory, number> {
  return { HC: 0, PROT: 0, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0 };
}

// Grams of pure macronutrient per 1 intercambio (exchange).
// System rule: 1 intercambio = 100 kcal.
// HC:    100 kcal / 4 kcal·g⁻¹ = 25 g
// PROT:  100 kcal / 4 kcal·g⁻¹ = 25 g
// GRASA: 100 kcal / 9 kcal·g⁻¹ ≈ 11 g
const G_PER_EXCH = { HC: 25, PROT: 25, GRASA: 11 } as const;

const roundHalf = (n: number) => Math.round(n * 2) / 2;

// ── Types ──────────────────────────────────────────────────────────────────────

interface FormState {
  name: string;
  coachNote: string;
  budget: Record<FoodCategory, number>;
  meals: DietMeal[];
}

function blankForm(): FormState {
  return {
    name: '',
    coachNote: '',
    budget: blankBudget(),
    meals: [{ id: makeId(), name: '', items: [] }],
  };
}

interface Props {
  coachId: string;
  // Embedded mode (used from ClientHub):
  athleteEmail?: string;        // pre-select athlete, hide selector
  embeddedDiet?: Diet | null;   // undefined=standalone; null=new diet; Diet=edit diet
  onSaved?: (diet: Diet) => void;
  onCancelled?: () => void;
  onboardingData?: OnboardingData | null; // athlete intake data for reference panel
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function NutritionPlansScreen({ coachId: _coachId, athleteEmail, embeddedDiet, onSaved, onCancelled, onboardingData }: Props) {
  const isEmbedded = athleteEmail !== undefined;

  // Athlete selector
  const [athletes, setAthletes] = useState<UserProfile[]>([]);
  const [selectedEmail, setSelectedEmail] = useState(athleteEmail ?? '');

  // Diet list
  const [diets, setDiets] = useState<Diet[]>([]);
  const [loadingDiets, setLoadingDiets] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Editor — start in editor mode when embedded
  const [view, setView] = useState<'list' | 'editor'>(isEmbedded ? 'editor' : 'list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(blankForm());
  const [saving, setSaving] = useState(false);

  // Preview view mode (shared localStorage key with athlete)
  const [previewMode, setPreviewMode] = useDietViewMode();
  const [showPreview, setShowPreview] = useState(false);

  // Food picker
  const [foodItems, setFoodItems] = useState<MealItem[]>([]);
  const [enabledModes, setEnabledModes] = useState<DietMode[]>(['OMNIVORO']);
  const [activeDietMode, setActiveDietMode] = useState<DietMode>('OMNIVORO');
  const [pickerMealId, setPickerMealId] = useState<string | null>(null);
  const [pickerCategory, setPickerCategory] = useState<FoodCategory>('HC');
  const [searchTerm, setSearchTerm] = useState('');

  // In embedded mode, initialise the form from the diet passed by the parent
  useEffect(() => {
    if (!isEmbedded) return;
    if (embeddedDiet) {
      setEditingId(embeddedDiet.id);
      setForm({
        name: embeddedDiet.name,
        coachNote: embeddedDiet.coachNote ?? '',
        budget: { ...embeddedDiet.budget },
        meals: embeddedDiet.meals.map(m => ({ ...m, items: m.items.map(i => ({ ...i })) })),
      });
    } else {
      setEditingId(null);
      setForm(blankForm());
    }
    setView('editor');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally runs once on mount

  // Load athletes on mount (standalone only)
  useEffect(() => {
    if (isEmbedded) return;
    getAllUserProfiles()
      .then(list => setAthletes(list.filter(p => p.role === 'client')))
      .catch(console.error);
  }, [isEmbedded]);

  // Load diets + food config when athlete selected
  useEffect(() => {
    if (!selectedEmail) return;
    setLoadingDiets(true);
    if (!isEmbedded) setDiets([]);
    if (!isEmbedded) setView('list');
    Promise.all([
      getDietsForAthlete(selectedEmail),
      (async () => {
        await seedFoodItemsIfEmpty();
        return getFoodItems();
      })(),
      getAthleteNutritionConfig(selectedEmail).catch(() => null),
    ]).then(([fetchedDiets, foods, config]) => {
      // Self-managed diets ("Mis Dietas") are private to the athlete — the coach's
      // editor only lists/assigns diets the coach itself authored.
      setDiets(fetchedDiets.filter(d => !d.selfManaged));
      setFoodItems(foods);
      if (config && config.enabledModes.length > 0) {
        setEnabledModes(config.enabledModes);
        setActiveDietMode(config.enabledModes[0]);
      } else {
        setEnabledModes(['OMNIVORO']);
        setActiveDietMode('OMNIVORO');
      }
    }).catch(console.error).finally(() => setLoadingDiets(false));
  }, [selectedEmail, isEmbedded]);

  // ── Live dashboard ───────────────────────────────────────────────────────────
  const placed = useMemo(() => computePlaced(form.meals), [form.meals]);

  // Per-category mismatch: sum of meal targets ≠ day budget (only when targets are set)
  const targetMismatches = useMemo(() => {
    return CATS.flatMap(cat => {
      if (form.budget[cat] === 0) return [];
      const sum = form.meals.reduce((s, m) => s + (m.target?.[cat] ?? 0), 0);
      if (sum === 0) return []; // targets not yet set — no mismatch
      return round2(sum) !== round2(form.budget[cat])
        ? [{ cat, sum: round2(sum), budget: form.budget[cat] }]
        : [];
    });
  }, [form.meals, form.budget]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const openCreate = () => {
    setEditingId(null);
    setForm(blankForm());
    setView('editor');
  };

  const openEdit = (dt: Diet) => {
    setEditingId(dt.id);
    setForm({
      name: dt.name,
      coachNote: dt.coachNote ?? '',
      budget: { ...dt.budget },
      meals: dt.meals.map(m => ({ ...m, items: m.items.map(i => ({ ...i })) })),
    });
    setView('editor');
  };

  const handleSave = async () => {
    if (!selectedEmail || !form.name.trim()) return;
    setSaving(true);
    try {
      const data: Omit<Diet, 'id'> = {
        athleteId: selectedEmail,
        name: form.name.trim(),
        budget: form.budget,
        meals: form.meals,
        coachNote: form.coachNote.trim() || undefined,
      };

      let savedDiet: Diet;
      if (editingId) {
        await updateDiet(editingId, { ...data, isDraft: false });
        savedDiet = { id: editingId, ...data };
      } else {
        savedDiet = await createDiet(data);
      }

      setDiets(prev =>
        editingId
          ? prev.map(d => d.id === savedDiet.id ? savedDiet : d)
          : [...prev, savedDiet],
      );
      if (onSaved) {
        onSaved(savedDiet);
      } else {
        setView('list');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    if (onCancelled) onCancelled();
    else setView('list');
  };

  const handleDelete = async (id: string) => {
    await deleteDiet(id);
    setDiets(prev => prev.filter(d => d.id !== id));
    setDeleteId(null);
  };

  // ── Meal mutations ───────────────────────────────────────────────────────────

  const addMeal = () =>
    setForm(f => ({ ...f, meals: [...f.meals, { id: makeId(), name: '', items: [] }] }));

  const removeMeal = (mealId: string) =>
    setForm(f => ({ ...f, meals: f.meals.filter(m => m.id !== mealId) }));

  const setMealName = (mealId: string, name: string) =>
    setForm(f => ({ ...f, meals: f.meals.map(m => m.id === mealId ? { ...m, name } : m) }));

  const removeItem = (mealId: string, idx: number) =>
    setForm(f => ({
      ...f,
      meals: f.meals.map(m => m.id === mealId ? { ...m, items: m.items.filter((_, i) => i !== idx) } : m),
    }));

  const updateQuantity = (mealId: string, idx: number, delta: number) =>
    setForm(f => ({
      ...f,
      meals: f.meals.map(m => {
        if (m.id !== mealId) return m;
        return {
          ...m,
          items: m.items.map((item, i) => {
            if (i !== idx) return item;
            const newQty = round2(Math.max(0.25, item.quantity + delta));
            return { ...item, quantity: newQty, grams: computeGrams(item.foodLabel, newQty) };
          }),
        };
      }),
    }));

  const setBudget = (cat: FoodCategory, val: number) =>
    setForm(f => ({ ...f, budget: { ...f.budget, [cat]: Math.max(0, round2(val)) } }));

  const setMealTarget = (mealId: string, cat: FoodCategory, delta: number) =>
    setForm(f => ({
      ...f,
      meals: f.meals.map(m => {
        if (m.id !== mealId) return m;
        const cur = m.target ?? blankBudget();
        return { ...m, target: { ...cur, [cat]: Math.max(0, round2(cur[cat] + delta)) } };
      }),
    }));

  const autoDistribute = () => {
    const n = form.meals.length;
    if (n === 0) return;
    setForm(f => ({
      ...f,
      meals: f.meals.map((meal, idx) => {
        const target = blankBudget();
        for (const cat of CATS) {
          if (f.budget[cat] > 0) {
            target[cat] = distributeEvenly(f.budget[cat], n)[idx];
          }
        }
        return { ...meal, target };
      }),
    }));
  };

  // ── Food picker ──────────────────────────────────────────────────────────────

  const openPicker = (mealId: string) => {
    setPickerMealId(mealId);
    setPickerCategory('HC');
    setSearchTerm('');
  };

  const handleSelectFood = (food: MealItem) => {
    if (!pickerMealId) return;
    const newItem: DietItem = {
      category: food.category,
      foodLabel: food.label,
      quantity: 1,
      grams: computeGrams(food.label, 1),
    };
    setForm(f => ({
      ...f,
      meals: f.meals.map(m => m.id === pickerMealId ? { ...m, items: [...m.items, newItem] } : m),
    }));
    setPickerMealId(null);
  };

  const filteredFoods = foodItems.filter(f =>
    f.mode === activeDietMode &&
    f.category === pickerCategory &&
    (!searchTerm || f.label.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // ── Selected athlete ─────────────────────────────────────────────────────────
  const selectedAthlete = athletes.find(a => a.email === selectedEmail);

  // ── Render: list ─────────────────────────────────────────────────────────────

  if (view === 'list') {
    return (
      <div className="space-y-5">
        {/* Athlete selector — hidden in embedded mode */}
        {!isEmbedded && (
          <div className="bg-[#181816] border border-white/7 rounded-2xl p-4">
            <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider mb-2">
              Atleta
            </label>
            <select
              value={selectedEmail}
              onChange={e => setSelectedEmail(e.target.value)}
              className="w-full bg-[#0e0e0e] border border-white/7 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#fbcb1a] cursor-pointer"
            >
              <option value="">— Seleccionar atleta —</option>
              {athletes.map(a => (
                <option key={a.email} value={a.email}>{a.displayName}</option>
              ))}
            </select>
          </div>
        )}

        {selectedEmail && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-[#c6c9ab] font-mono">
              {diets.length} dieta{diets.length !== 1 ? 's' : ''} para {selectedAthlete?.displayName}
            </p>
            <button
              onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#fbcb1a] text-black font-sans font-bold text-xs uppercase rounded-lg hover:bg-[#d4a800] active:scale-95 transition-all shadow-md"
            >
              <span className="material-symbols-outlined text-sm">add</span>
              Crear dieta
            </button>
          </div>
        )}

        {!selectedEmail ? (
          <div className="text-center py-16 border border-dashed border-white/7 rounded-2xl">
            <span className="material-symbols-outlined text-4xl text-[#2a2a2a] block mb-3">person_search</span>
            <p className="text-[#c6c9ab] text-sm">Selecciona un atleta para ver y crear sus dietas.</p>
          </div>
        ) : loadingDiets ? (
          <div className="text-center py-16 font-mono text-sm text-[#c6c9ab] animate-pulse">Cargando dietas...</div>
        ) : diets.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-white/7 rounded-2xl">
            <span className="material-symbols-outlined text-4xl text-[#2a2a2a] block mb-3">nutrition</span>
            <p className="text-[#c6c9ab] text-sm">Sin dietas. Crea la primera para este atleta.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {diets.map(dt => {
              const dtPlaced = computePlaced(dt.meals);
              return (
                <div key={dt.id} className="bg-[#181816] border border-white/7 rounded-2xl p-5 hover:border-[#3a3a3a] transition-colors flex flex-col gap-4">
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="font-sans font-bold text-white text-lg leading-tight">{dt.name}</h3>
                    </div>
                    {dt.coachNote && (
                      <p className="text-[10px] text-[#00eefc] italic font-sans mb-2">{dt.coachNote}</p>
                    )}
                    {/* Budget summary */}
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {CATS.filter(c => dt.budget[c] > 0).map(c => (
                        <span key={c} className={`text-[9px] font-mono px-2 py-0.5 rounded border ${CAT_BG[c]}`}>
                          {c.replace('_', ' ')} {fmtQty(dtPlaced[c])}/{fmtQty(dt.budget[c])}
                        </span>
                      ))}
                    </div>
                    {/* Meals preview */}
                    <p className="text-[10px] font-mono text-[#c6c9ab]">
                      {dt.meals.length} comida{dt.meals.length !== 1 ? 's' : ''} ·{' '}
                      {dt.meals.reduce((s, m) => s + m.items.length, 0)} alimentos
                    </p>
                  </div>
                  <div className="flex gap-2 pt-3 border-t border-white/7">
                    <button
                      onClick={() => openEdit(dt)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1c1b1b] border border-white/7 text-[#00eefc] hover:border-[#00eefc]/40 font-mono text-[10px] uppercase rounded-lg transition-all"
                    >
                      <span className="material-symbols-outlined text-sm">edit</span>Editar
                    </button>
                    <button
                      onClick={() => setDeleteId(dt.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1c1b1b] border border-white/7 text-[#c6c9ab] hover:text-red-400 hover:border-red-500/30 font-mono text-[10px] uppercase rounded-lg transition-all"
                    >
                      <span className="material-symbols-outlined text-sm">delete</span>Eliminar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {deleteId && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#1e1e1b] border border-red-500/30 rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4">
              <h3 className="font-sans font-bold text-lg text-white">¿Eliminar dieta?</h3>
              <p className="text-sm text-[#c6c9ab]">Se quitará también de los atletas que la tengan activa.</p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteId(null)} className="flex-1 py-2.5 border border-white/7 text-[#c6c9ab] font-mono text-xs uppercase rounded-xl">Cancelar</button>
                <button onClick={() => handleDelete(deleteId)} className="flex-1 py-2.5 bg-red-500/20 border border-red-500/30 text-red-300 font-sans font-bold text-xs uppercase rounded-xl hover:bg-red-500/30 transition-colors">Eliminar</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Render: editor ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleBack}
          className="p-1 px-3 bg-[#1c1b1b] hover:bg-[#2c2b2b] text-[#fbcb1a] border border-white/7 text-xs font-mono rounded flex items-center gap-1 active:scale-95 transition-all"
        >
          <span className="material-symbols-outlined text-sm">arrow_back</span>Volver
        </button>
        <div>
          <h2 className="font-sans font-bold text-xl text-white">
            {editingId ? 'Editar dieta' : 'Nueva dieta'}
          </h2>
          {!isEmbedded && selectedAthlete && (
            <p className="text-[10px] font-mono text-[#c6c9ab]">Atleta: {selectedAthlete.displayName}</p>
          )}
          {isEmbedded && (
            <p className="text-[10px] font-mono text-[#c6c9ab]">{athleteEmail}</p>
          )}
        </div>
      </div>

      {/* Live dashboard */}
      <div className="bg-[#0e0e0e] border border-white/7 rounded-xl p-4 sticky top-0 z-10">
        <p className="font-mono text-[9px] text-[#c6c9ab] uppercase tracking-wider mb-3">Distribución en vivo</p>
        <div className="grid grid-cols-3 gap-x-2 gap-y-2.5">
          {BUDGET_CATS.map(cat => {
            const b = form.budget[cat];
            const p = placed[cat];
            const isOver = b > 0 && p > b;
            const isOk = b > 0 && round2(p) === round2(b);
            const pct = b > 0 ? Math.min(100, (p / b) * 100) : (p > 0 ? 100 : 0);
            const barColor = isOver ? 'bg-red-500' : isOk ? 'bg-green-400' : 'bg-[#fbcb1a]';
            return (
              <div key={cat}>
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-[9px] font-mono font-bold ${CAT_COLOR[cat]}`}>
                    {cat.replace('_', ' ')}
                  </span>
                  <span className={`text-[9px] font-mono font-bold ${isOver ? 'text-red-400' : isOk ? 'text-green-400' : 'text-white'}`}>
                    {fmtQty(p)}{b > 0 ? `/${fmtQty(b)}` : ''}{isOk ? ' ✓' : isOver ? ' !' : ''}
                  </span>
                </div>
                <div className="h-1 w-full bg-[#1c1b1b] rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-300 ${barColor}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>

        {targetMismatches.length > 0 && (
          <div className="mt-3 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 flex flex-wrap gap-x-3 gap-y-1">
            <span className="font-mono text-[9px] text-amber-400 uppercase tracking-wider w-full mb-0.5">
              ⚠ Objetivos por comida no cuadran con el presupuesto
            </span>
            {targetMismatches.map(({ cat, sum, budget: b }) => (
              <span key={cat} className="font-mono text-[9px] text-amber-300">
                {cat.replace('_', ' ')}: suma {fmtQty(sum)} ≠ {fmtQty(b)}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Metadata */}
      <div className="bg-[#181816] border border-white/7 rounded-2xl p-5 space-y-4">
        <h3 className="font-mono text-xs text-[#c6c9ab] uppercase tracking-wider">Datos generales</h3>
        <div>
          <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase mb-1.5">Nombre *</label>
          <input
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Ej: Día Alto, Día Bajo, Día Libre"
            className="w-full bg-[#0e0e0e] border border-white/7 rounded-lg px-3 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#fbcb1a]"
          />
        </div>
        <div>
          <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase mb-1.5">
            Nota del coach
          </label>
          <textarea
            value={form.coachNote}
            onChange={e => setForm(f => ({ ...f, coachNote: e.target.value }))}
            rows={3}
            placeholder="Indicaciones para el atleta: objetivos, recomendaciones, contexto…"
            className="w-full bg-[#0e0e0e] border border-white/7 rounded-lg px-3 py-3 text-sm text-white placeholder:text-[#444] focus:outline-none focus:ring-1 focus:ring-[#fbcb1a] resize-none"
          />
        </div>
      </div>

      {/* Onboarding reference panel */}
      {onboardingData && (
        <div className="bg-[#0e0e0e] border border-[#fbcb1a]/15 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[10px] text-[#fbcb1a] uppercase tracking-wider flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm">person_check</span>
              Referencia del atleta
            </p>
          </div>

          {/* Macros */}
          <div className="flex flex-wrap gap-3 text-xs font-mono">
            <span className="text-[#c6c9ab]">
              {onboardingData.dietType === 'omnivoro' ? 'Omnívoro' : onboardingData.dietType === 'vegano' ? 'Vegano' : onboardingData.dietType === 'vegetariano' ? 'Vegetariano' : 'Otro'}
              {' · '}<span className="text-white font-bold">{onboardingData.targetCalories} kcal</span>
            </span>
          </div>
          <div className="flex gap-2 flex-wrap">
            {([
              { label: 'HC',    g: onboardingData.macroGrams.hc,    pct: onboardingData.macroSplit.hc,    color: 'text-amber-300',  bg: 'bg-amber-500/10 border-amber-500/20' },
              { label: 'PROT',  g: onboardingData.macroGrams.prot,  pct: onboardingData.macroSplit.prot,  color: 'text-blue-300',   bg: 'bg-blue-500/10 border-blue-500/20' },
              { label: 'GRASA', g: onboardingData.macroGrams.grasa, pct: onboardingData.macroSplit.grasa, color: 'text-orange-300', bg: 'bg-orange-500/10 border-orange-500/20' },
            ]).map(m => (
              <div key={m.label} className={`border rounded-lg px-3 py-1.5 text-center ${m.bg}`}>
                <p className={`font-mono text-[10px] uppercase font-bold ${m.color}`}>{m.label}</p>
                <p className="font-mono font-bold text-white text-sm">{m.g}g</p>
                <p className="font-mono text-[9px] text-[#555]">{m.pct}%</p>
              </div>
            ))}
          </div>

          {/* Warnings */}
          {onboardingData.dislikedFoods.length > 0 && (
            <p className="font-mono text-[10px] text-[#c6c9ab]">
              <span className="text-[#555] mr-1">No le gusta:</span>
              {onboardingData.dislikedFoods.join(', ')}
            </p>
          )}
          {onboardingData.allergies.length > 0 && (
            <p className="font-mono text-[10px] text-amber-400">
              <span className="material-symbols-outlined text-xs align-middle mr-1">warning</span>
              Alergias: <span className="font-bold">{onboardingData.allergies.join(', ')}</span>
            </p>
          )}
        </div>
      )}

      {/* Budget */}
      <div className="bg-[#181816] border border-white/7 rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-mono text-xs text-[#c6c9ab] uppercase tracking-wider">
            Presupuesto diario (intercambios por categoría)
          </h3>
          {onboardingData && (
            <button
              onClick={() => {
                setBudget('HC',    roundHalf(onboardingData.macroGrams.hc    / G_PER_EXCH.HC));
                setBudget('PROT',  roundHalf(onboardingData.macroGrams.prot  / G_PER_EXCH.PROT));
                setBudget('GRASA', roundHalf(onboardingData.macroGrams.grasa / G_PER_EXCH.GRASA));
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#fbcb1a]/10 border border-[#fbcb1a]/30 text-[#fbcb1a] hover:bg-[#fbcb1a]/20 font-mono text-[10px] uppercase tracking-wide rounded-lg transition-all"
            >
              <span className="material-symbols-outlined text-sm">auto_fix_high</span>
              Prefijar desde macros
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {BUDGET_CATS.map(cat => (
            <div key={cat}>
              <label className={`block font-mono text-[10px] uppercase mb-1.5 ${CAT_COLOR[cat]}`}>
                {cat}
              </label>
              <div className="flex items-center bg-[#0e0e0e] border border-white/7 rounded-lg overflow-hidden">
                <button
                  onClick={() => setBudget(cat, form.budget[cat] - 0.5)}
                  className="px-2.5 py-2 text-[#c6c9ab] hover:text-white hover:bg-[#1c1b1b] transition-colors text-sm font-bold"
                >−</button>
                <span className="flex-1 text-center font-mono text-sm text-white">{fmtQty(form.budget[cat])}</span>
                <button
                  onClick={() => setBudget(cat, form.budget[cat] + 0.5)}
                  className="px-2.5 py-2 text-[#c6c9ab] hover:text-white hover:bg-[#1c1b1b] transition-colors text-sm font-bold"
                >+</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Meals */}
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-mono text-xs text-[#c6c9ab] uppercase tracking-wider">
            Comidas ({form.meals.length})
          </h3>
          <div className="flex gap-2">
            {CATS.some(c => form.budget[c] > 0) && form.meals.length > 1 && (
              <button
                onClick={autoDistribute}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1c1b1b] border border-[#00eefc]/40 text-[#00eefc] hover:border-[#00eefc]/70 font-mono text-[10px] uppercase rounded-lg transition-all"
              >
                <span className="material-symbols-outlined text-sm">auto_fix_high</span>
                Repartir
              </button>
            )}
            <button
              onClick={addMeal}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1c1b1b] border border-white/7 text-[#fbcb1a] hover:border-[#fbcb1a]/40 font-mono text-[10px] uppercase rounded-lg transition-all"
            >
              <span className="material-symbols-outlined text-sm">add</span>Añadir comida
            </button>
          </div>
        </div>

        {form.meals.map((meal, mi) => (
          <div key={meal.id} className="bg-[#181816] border border-white/7 rounded-2xl overflow-hidden">
            {/* Meal header */}
            <div className="flex items-center gap-3 px-4 py-3 bg-[#1c1b1b]/60 border-b border-white/7">
              <span className="w-6 h-6 rounded-full bg-[#fbcb1a] text-black font-sans text-xs font-bold flex items-center justify-center flex-shrink-0">
                {mi + 1}
              </span>
              <input
                value={meal.name}
                onChange={e => setMealName(meal.id, e.target.value)}
                placeholder="Nombre libre: Desayuno, Pre-entreno…"
                className="flex-1 bg-transparent text-sm text-white focus:outline-none placeholder:text-[#c6c9ab]/40"
              />
              {form.meals.length > 1 && (
                <button onClick={() => removeMeal(meal.id)} className="text-[#c6c9ab] hover:text-red-400 transition-colors">
                  <span className="material-symbols-outlined text-sm">remove_circle</span>
                </button>
              )}
            </div>

            {/* Per-meal target steppers (only if day has any budget) */}
            {CATS.some(c => form.budget[c] > 0) && (() => {
              const activeCats = CATS.filter(c => form.budget[c] > 0);
              const mPlaced = computeMealPlaced(meal);
              return (
                <div className="px-4 py-3 bg-[#0e0e0e]/50 border-b border-[#1c1b1b]">
                  <p className="font-mono text-[9px] text-[#c6c9ab] uppercase tracking-wider mb-2">Objetivo comida</p>
                  <div className="flex flex-wrap gap-2">
                    {activeCats.map(cat => {
                      const tgt = meal.target?.[cat] ?? 0;
                      const p = mPlaced[cat];
                      const isOk = tgt > 0 && round2(p) === round2(tgt);
                      const isOver = tgt > 0 && p > tgt;
                      return (
                        <div key={cat} className="flex items-center gap-1">
                          <span className={`font-mono text-[9px] w-14 ${CAT_COLOR[cat]}`}>
                            {cat.replace('_', ' ')}
                          </span>
                          <div className="flex items-center bg-[#1c1b1b] rounded border border-white/7">
                            <button
                              onClick={() => setMealTarget(meal.id, cat, -0.25)}
                              className="w-5 h-5 flex items-center justify-center text-[#c6c9ab] hover:text-white text-xs font-bold"
                            >−</button>
                            <span className="w-7 text-center font-mono text-[10px] text-white">{fmtQty(tgt)}</span>
                            <button
                              onClick={() => setMealTarget(meal.id, cat, 0.25)}
                              className="w-5 h-5 flex items-center justify-center text-[#c6c9ab] hover:text-white text-xs font-bold"
                            >+</button>
                          </div>
                          {tgt > 0 && (
                            <span className={`font-mono text-[9px] ml-1 ${isOver ? 'text-red-400' : isOk ? 'text-green-400' : 'text-[#c6c9ab]'}`}>
                              {fmtQty(p)}{isOk ? ' ✓' : isOver ? ' !' : ''}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Items */}
            <div className="p-3 space-y-2">
              {meal.items.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-[#0e0e0e] border border-[#1c1b1b] rounded-lg px-3 py-2">
                  {/* Category */}
                  <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border flex-shrink-0 ${CAT_BG[item.category]}`}>
                    {item.category.replace('_', ' ')}
                  </span>
                  {/* Label */}
                  <span className="flex-1 text-xs text-white font-sans truncate min-w-0">
                    {item.foodLabel}
                  </span>
                  {/* Qty stepper */}
                  <div className="flex items-center gap-1 bg-[#1c1b1b] rounded border border-white/7 flex-shrink-0">
                    <button
                      onClick={() => updateQuantity(meal.id, idx, -0.25)}
                      className="w-6 h-6 flex items-center justify-center text-[#c6c9ab] hover:text-white font-bold text-sm"
                    >−</button>
                    <span className="w-8 text-center font-mono text-xs text-white">{fmtQty(item.quantity)}</span>
                    <button
                      onClick={() => updateQuantity(meal.id, idx, 0.25)}
                      className="w-6 h-6 flex items-center justify-center text-[#c6c9ab] hover:text-white font-bold text-sm"
                    >+</button>
                  </div>
                  {/* Weight */}
                  <span className="text-[9px] font-mono text-[#c6c9ab] flex-shrink-0 w-12 text-right">
                    {itemWeightLabel(item.foodLabel, item.quantity)}
                  </span>
                  {/* Remove */}
                  <button onClick={() => removeItem(meal.id, idx)} className="text-[#c6c9ab] hover:text-red-400 transition-colors flex-shrink-0">
                    <span className="material-symbols-outlined text-sm">close</span>
                  </button>
                </div>
              ))}

              {/* Add food button */}
              <button
                onClick={() => openPicker(meal.id)}
                className="w-full flex items-center justify-center gap-2 border border-dashed border-white/7 hover:border-[#fbcb1a]/40 py-2.5 rounded-lg text-[10px] font-mono text-[#c6c9ab] hover:text-[#fbcb1a] transition-colors"
              >
                <span className="material-symbols-outlined text-sm">add_circle</span>
                Añadir alimento
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Vista previa del atleta */}
      <div className="bg-[#0e0e0e] border border-white/7 rounded-xl overflow-hidden">
        <button
          onClick={() => setShowPreview(p => !p)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#111] transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#555] text-sm">visibility</span>
            <span className="font-mono text-[10px] text-[#555] uppercase tracking-wide">Vista previa del atleta</span>
          </div>
          <span className={`material-symbols-outlined text-[#555] text-sm transition-transform ${showPreview ? 'rotate-180' : ''}`}>expand_more</span>
        </button>
        {showPreview && (
          <div className="px-4 pb-4 space-y-3 border-t border-[#1e1e1e]">
            <div className="pt-3">
              <DietViewSelector mode={previewMode} onChange={setPreviewMode} />
            </div>
            {previewMode === 'fotos' && (
              <DietFotosView meals={form.meals} recipes={[]} />
            )}
            {previewMode === 'numeros' && (
              <DietNumerosView meals={form.meals} budget={form.budget} />
            )}
            {previewMode === 'lista' && (
              <div className="space-y-2">
                {form.meals.map((meal, mi) => (
                  <div key={meal.id} className="bg-[#181816] border border-white/7 rounded-2xl px-4 py-3">
                    <p className="font-sans font-bold text-white text-sm mb-1.5">{meal.name || `Comida ${mi + 1}`}</p>
                    {meal.items.length === 0 ? (
                      <p className="font-mono text-[10px] text-[#444] italic">Sin alimentos</p>
                    ) : (
                      <div className="space-y-1">
                        {meal.items.map((it, idx) => (
                          <div key={idx} className="flex items-center gap-2 font-mono text-[10px] text-[#c6c9ab]">
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                              it.category === 'HC' ? 'bg-amber-500/10 border-amber-500/20 text-amber-300' :
                              it.category === 'PROT' ? 'bg-blue-500/10 border-blue-500/20 text-blue-300' :
                              'bg-orange-500/10 border-orange-500/20 text-orange-300'
                            }`}>{it.category.replace('_', ' ')}</span>
                            <span>{it.foodLabel}</span>
                            <span className="text-[#444]">×{it.quantity}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Save */}
      <div className="flex gap-3 pt-2 sticky bottom-0 pb-4 bg-[#111110]">
        <button onClick={handleBack} className="flex-1 py-3 border border-white/7 text-[#c6c9ab] hover:text-white font-mono text-xs uppercase rounded-xl transition-all">
          Cancelar
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !form.name.trim()}
          className="flex-1 py-3 bg-[#fbcb1a] text-black font-sans font-bold text-xs uppercase rounded-xl hover:bg-[#d4a800] active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-2 shadow-[0_0_12px_rgba(251,203,26,0.2)]"
        >
          {saving
            ? <><span className="material-symbols-outlined text-sm animate-spin">refresh</span>Guardando...</>
            : <><span className="material-symbols-outlined text-sm">save</span>Guardar dieta</>
          }
        </button>
      </div>

      {/* Food picker sheet */}
      {pickerMealId && (
        <div className="fixed inset-0 bg-black/85 z-[100] flex items-end justify-center p-0 md:p-4">
          <div className="bg-[#1c1b1b] border-t md:border border-white/7 w-full max-w-lg rounded-t-2xl md:rounded-xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-white/7 flex items-center justify-between sticky top-0 bg-[#1c1b1b] z-10">
              <div>
                <h3 className="font-sans font-bold text-lg text-white">Añadir alimento</h3>
                <span className="font-mono text-[10px] text-[#c6c9ab] uppercase">{CAT_LABEL[pickerCategory]} · {MODE_LABEL[activeDietMode]}</span>
              </div>
              <button onClick={() => setPickerMealId(null)} className="text-white bg-[#2a2a2a] hover:bg-[#3e3e3e] p-1.5 h-8 w-8 rounded-full flex items-center justify-center transition-colors">
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
    </div>
  );
}
