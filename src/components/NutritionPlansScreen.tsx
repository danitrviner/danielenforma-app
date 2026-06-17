import React, { useState, useEffect } from 'react';
import { NutritionPlan, NutritionMeal, NutritionMealSlot } from '../types';
import { getNutritionPlans, createNutritionPlan, updateNutritionPlan, deleteNutritionPlan } from '../dbService';

type SlotCat = NutritionMealSlot['category'];

const SLOT_LABEL: Record<SlotCat, string> = {
  HC:       'HC',
  proteina: 'Proteína',
  grasa:    'Grasa',
  verdura:  'Verdura',
};

const SLOT_COLOR: Record<SlotCat, string> = {
  HC:       'bg-amber-500/10 text-amber-300 border border-amber-500/20',
  proteina: 'bg-blue-500/10 text-blue-300 border border-blue-500/20',
  grasa:    'bg-orange-500/10 text-orange-300 border border-orange-500/20',
  verdura:  'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20',
};

function makeDefaultMeals(): NutritionMeal[] {
  return [1, 2, 3, 4, 5].map(n => ({
    id: `meal_${Date.now()}_${n}`,
    name: `Comida ${n}`,
    slots: [{ category: 'HC' as SlotCat, portions: 2 }],
  }));
}

interface EditableState {
  name: string;
  targetCalories: number;
  macros: { carbs: number; protein: number; fats: number };
  meals: NutritionMeal[];
}

function blankPlan(): EditableState {
  return {
    name: '',
    targetCalories: 1800,
    macros: { carbs: 200, protein: 150, fats: 60 },
    meals: makeDefaultMeals(),
  };
}

interface Props {
  coachId: string;
}

export default function NutritionPlansScreen({ coachId }: Props) {
  const [plans, setPlans] = useState<NutritionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'editor'>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EditableState>(blankPlan());
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const data = await getNutritionPlans();
      setPlans(data);
      setLoading(false);
    })();
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(blankPlan());
    setView('editor');
  };

  const openEdit = (plan: NutritionPlan) => {
    setEditingId(plan.id);
    setForm({
      name: plan.name,
      targetCalories: plan.targetCalories,
      macros: { ...plan.macros },
      meals: plan.meals.map(m => ({ ...m, slots: m.slots.map(s => ({ ...s })) })),
    });
    setView('editor');
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const data: Omit<NutritionPlan, 'id'> = {
        ownerId: coachId,
        name: form.name.trim(),
        targetCalories: form.targetCalories,
        macros: form.macros,
        meals: form.meals,
      };
      if (editingId) {
        await updateNutritionPlan(editingId, data);
        setPlans(prev => prev.map(p => p.id === editingId ? { ...p, ...data } : p));
      } else {
        const created = await createNutritionPlan(data);
        setPlans(prev => [...prev, created]);
      }
      setView('list');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteNutritionPlan(id);
    setPlans(prev => prev.filter(p => p.id !== id));
    setDeleteId(null);
  };

  // ── Meal mutations ──────────────────────────────────────────────────────────

  const setMealName = (mealIdx: number, name: string) => {
    setForm(f => {
      const meals = f.meals.map((m, i) => i === mealIdx ? { ...m, name } : m);
      return { ...f, meals };
    });
  };

  const addSlot = (mealIdx: number) => {
    setForm(f => {
      const meals = f.meals.map((m, i) => {
        if (i !== mealIdx) return m;
        return { ...m, slots: [...m.slots, { category: 'HC' as SlotCat, portions: 1 }] };
      });
      return { ...f, meals };
    });
  };

  const removeSlot = (mealIdx: number, slotIdx: number) => {
    setForm(f => {
      const meals = f.meals.map((m, i) => {
        if (i !== mealIdx) return m;
        const slots = m.slots.filter((_, si) => si !== slotIdx);
        return { ...m, slots };
      });
      return { ...f, meals };
    });
  };

  const updateSlot = (mealIdx: number, slotIdx: number, patch: Partial<NutritionMealSlot>) => {
    setForm(f => {
      const meals = f.meals.map((m, i) => {
        if (i !== mealIdx) return m;
        const slots = m.slots.map((s, si) => si === slotIdx ? { ...s, ...patch } : s);
        return { ...m, slots };
      });
      return { ...f, meals };
    });
  };

  const addMeal = () => {
    if (form.meals.length >= 5) return;
    const n = form.meals.length + 1;
    setForm(f => ({
      ...f,
      meals: [...f.meals, { id: `meal_${Date.now()}`, name: `Comida ${n}`, slots: [{ category: 'HC' as SlotCat, portions: 2 }] }],
    }));
  };

  const removeMeal = (mealIdx: number) => {
    if (form.meals.length <= 1) return;
    setForm(f => ({ ...f, meals: f.meals.filter((_, i) => i !== mealIdx) }));
  };

  // ── List view ───────────────────────────────────────────────────────────────

  if (view === 'list') {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <p className="text-xs text-[#c6c9ab] font-mono">{plans.length} plan{plans.length !== 1 ? 'es' : ''} nutricional{plans.length !== 1 ? 'es' : ''}</p>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-[#e2ff00] text-black font-mono font-bold text-xs uppercase rounded-lg hover:bg-[#bad200] active:scale-95 transition-all shadow-md"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            Crear plan
          </button>
        </div>

        {loading ? (
          <div className="text-center py-16 font-mono text-sm text-[#c6c9ab] animate-pulse">Cargando planes...</div>
        ) : plans.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-[#2a2a2a] rounded-2xl">
            <span className="material-symbols-outlined text-4xl text-[#2a2a2a] block mb-3">menu_book</span>
            <p className="text-[#c6c9ab] text-sm font-sans">No hay planes todavía.</p>
            <p className="text-[#c6c9ab] text-xs font-mono mt-1">Crea el primero para asignarlo a tus atletas.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {plans.map(plan => (
              <div key={plan.id} className="bg-[#121212] border border-[#2a2a2a] rounded-xl p-5 hover:border-[#3a3a3a] transition-colors group flex flex-col justify-between gap-4">
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <h3 className="font-sans font-bold text-white text-lg leading-tight">{plan.name}</h3>
                    <span className="text-xs font-mono font-bold text-[#e2ff00] whitespace-nowrap">{plan.targetCalories} kcal</span>
                  </div>
                  <div className="flex gap-3 text-[10px] font-mono text-[#c6c9ab] mb-3">
                    <span>CH: <strong className="text-amber-300">{plan.macros.carbs}g</strong></span>
                    <span>Prot: <strong className="text-blue-300">{plan.macros.protein}g</strong></span>
                    <span>Gras: <strong className="text-orange-300">{plan.macros.fats}g</strong></span>
                  </div>
                  <div className="space-y-1.5">
                    {plan.meals.map((meal, mi) => (
                      <div key={mi} className="flex items-center gap-2 text-xs">
                        <span className="font-mono text-[#c6c9ab] w-20 truncate">{meal.name}</span>
                        <div className="flex gap-1 flex-wrap">
                          {meal.slots.map((slot, si) => (
                            <span key={si} className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${SLOT_COLOR[slot.category]}`}>
                              {slot.portions} {SLOT_LABEL[slot.category]}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2 pt-3 border-t border-[#2a2a2a]">
                  <button
                    onClick={() => openEdit(plan)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1c1b1b] border border-[#2a2a2a] text-[#00eefc] hover:border-[#00eefc]/40 font-mono text-[10px] uppercase rounded-lg transition-all"
                  >
                    <span className="material-symbols-outlined text-sm">edit</span>
                    Editar
                  </button>
                  <button
                    onClick={() => setDeleteId(plan.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1c1b1b] border border-[#2a2a2a] text-[#c6c9ab] hover:text-red-400 hover:border-red-500/30 font-mono text-[10px] uppercase rounded-lg transition-all"
                  >
                    <span className="material-symbols-outlined text-sm">delete</span>
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {deleteId && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#191919] border border-red-500/30 rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4">
              <h3 className="font-sans font-bold text-lg text-white">¿Eliminar plan?</h3>
              <p className="text-sm text-[#c6c9ab]">Se eliminarán también sus asignaciones activas.</p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteId(null)} className="flex-1 py-2.5 border border-[#2a2a2a] text-[#c6c9ab] font-mono text-xs uppercase rounded-xl">
                  Cancelar
                </button>
                <button
                  onClick={() => handleDelete(deleteId)}
                  className="flex-1 py-2.5 bg-red-500/20 border border-red-500/30 text-red-300 font-mono font-bold text-xs uppercase rounded-xl hover:bg-red-500/30 transition-colors"
                >
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Editor view ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setView('list')}
          className="p-1 px-3 bg-[#1c1b1b] hover:bg-[#2c2b2b] text-[#e2ff00] border border-[#2a2a2a] text-xs font-mono rounded flex items-center gap-1 active:scale-95 transition-all"
        >
          <span className="material-symbols-outlined text-sm">arrow_back</span>
          Volver
        </button>
        <h2 className="font-sans font-bold text-xl text-white">{editingId ? 'Editar plan' : 'Nuevo plan'}</h2>
      </div>

      {/* Plan metadata */}
      <div className="bg-[#121212] border border-[#2a2a2a] rounded-xl p-5 space-y-4">
        <h3 className="font-mono text-xs text-[#c6c9ab] uppercase tracking-wider">Datos generales</h3>
        <div>
          <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase mb-1.5">Nombre del plan *</label>
          <input
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Ej: Plan de Definición Fase 1"
            className="w-full bg-[#0e0e0e] border border-[#2a2a2a] rounded-lg px-3 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#e2ff00]"
          />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="col-span-2 md:col-span-1">
            <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase mb-1.5">Calorías objetivo</label>
            <input
              type="number"
              value={form.targetCalories}
              onChange={e => setForm(f => ({ ...f, targetCalories: Number(e.target.value) }))}
              className="w-full bg-[#0e0e0e] border border-[#2a2a2a] rounded-lg px-3 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#e2ff00]"
            />
          </div>
          <div>
            <label className="block font-mono text-[10px] text-amber-400 uppercase mb-1.5">CH (g)</label>
            <input
              type="number"
              value={form.macros.carbs}
              onChange={e => setForm(f => ({ ...f, macros: { ...f.macros, carbs: Number(e.target.value) } }))}
              className="w-full bg-[#0e0e0e] border border-amber-500/30 rounded-lg px-3 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>
          <div>
            <label className="block font-mono text-[10px] text-blue-400 uppercase mb-1.5">Prot (g)</label>
            <input
              type="number"
              value={form.macros.protein}
              onChange={e => setForm(f => ({ ...f, macros: { ...f.macros, protein: Number(e.target.value) } }))}
              className="w-full bg-[#0e0e0e] border border-blue-500/30 rounded-lg px-3 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block font-mono text-[10px] text-orange-400 uppercase mb-1.5">Grasas (g)</label>
            <input
              type="number"
              value={form.macros.fats}
              onChange={e => setForm(f => ({ ...f, macros: { ...f.macros, fats: Number(e.target.value) } }))}
              className="w-full bg-[#0e0e0e] border border-orange-500/30 rounded-lg px-3 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>
        </div>
      </div>

      {/* Meals */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-mono text-xs text-[#c6c9ab] uppercase tracking-wider">Comidas ({form.meals.length}/5)</h3>
          {form.meals.length < 5 && (
            <button
              onClick={addMeal}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1c1b1b] border border-[#2a2a2a] text-[#e2ff00] hover:border-[#e2ff00]/40 font-mono text-[10px] uppercase rounded-lg transition-all"
            >
              <span className="material-symbols-outlined text-sm">add</span>
              Añadir comida
            </button>
          )}
        </div>

        {form.meals.map((meal, mi) => (
          <div key={meal.id} className="bg-[#121212] border border-[#2a2a2a] rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-[#e2ff00] text-black font-mono text-xs font-bold flex items-center justify-center flex-shrink-0">
                {mi + 1}
              </span>
              <input
                value={meal.name}
                onChange={e => setMealName(mi, e.target.value)}
                className="flex-1 bg-[#0e0e0e] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#e2ff00]"
                placeholder="Nombre de la comida"
              />
              {form.meals.length > 1 && (
                <button
                  onClick={() => removeMeal(mi)}
                  className="text-[#c6c9ab] hover:text-red-400 p-1 rounded transition-colors flex-shrink-0"
                >
                  <span className="material-symbols-outlined text-sm">remove_circle</span>
                </button>
              )}
            </div>

            <div className="space-y-2 pl-9">
              {meal.slots.map((slot, si) => (
                <div key={si} className="flex items-center gap-2">
                  <select
                    value={slot.category}
                    onChange={e => updateSlot(mi, si, { category: e.target.value as SlotCat })}
                    className="bg-[#0e0e0e] border border-[#2a2a2a] rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#e2ff00] cursor-pointer"
                  >
                    {(['HC', 'proteina', 'grasa', 'verdura'] as SlotCat[]).map(cat => (
                      <option key={cat} value={cat}>{SLOT_LABEL[cat]}</option>
                    ))}
                  </select>
                  <div className="flex items-center gap-1.5 bg-[#0e0e0e] border border-[#2a2a2a] rounded-lg px-2 py-1.5">
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={slot.portions}
                      onChange={e => updateSlot(mi, si, { portions: Math.max(1, Number(e.target.value)) })}
                      className="w-10 bg-transparent text-xs text-white focus:outline-none text-center"
                    />
                    <span className="text-[10px] text-[#c6c9ab] font-mono">porción{slot.portions !== 1 ? 'es' : ''}</span>
                  </div>
                  <span className={`text-[9px] font-mono px-2 py-1 rounded ${SLOT_COLOR[slot.category]}`}>
                    {slot.portions} {slot.category === 'HC' ? 'HC' : slot.category === 'proteina' ? 'Prot' : slot.category === 'grasa' ? 'Gras' : 'Verd'}
                  </span>
                  {meal.slots.length > 1 && (
                    <button onClick={() => removeSlot(mi, si)} className="text-[#c6c9ab] hover:text-red-400 transition-colors">
                      <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={() => addSlot(mi)}
                className="flex items-center gap-1 text-[10px] font-mono text-[#c6c9ab] hover:text-[#e2ff00] transition-colors"
              >
                <span className="material-symbols-outlined text-sm">add_circle</span>
                Añadir slot
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Save */}
      <div className="flex gap-3 pt-2 sticky bottom-0 pb-4 bg-[#131313]">
        <button
          onClick={() => setView('list')}
          className="flex-1 py-3 border border-[#2a2a2a] text-[#c6c9ab] hover:text-white font-mono text-xs uppercase rounded-xl transition-all"
        >
          Cancelar
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !form.name.trim()}
          className="flex-1 py-3 bg-[#e2ff00] text-black font-mono font-bold text-xs uppercase rounded-xl hover:bg-[#bad200] active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-2 shadow-[0_0_12px_rgba(226,255,0,0.2)]"
        >
          {saving ? (
            <><span className="material-symbols-outlined text-sm animate-spin">refresh</span>Guardando...</>
          ) : (
            <><span className="material-symbols-outlined text-sm">save</span>Guardar plan</>
          )}
        </button>
      </div>
    </div>
  );
}
