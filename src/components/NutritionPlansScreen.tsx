import React, { useState, useEffect } from 'react';
import { NutritionDayType, NutritionMeal, MealExchange, FoodCategory } from '../types';
import { getNutritionDayTypes, createNutritionDayType, updateNutritionDayType, deleteNutritionDayType } from '../dbService';

const CATEGORIES: { id: FoodCategory; label: string }[] = [
  { id: 'HC',        label: 'HC' },
  { id: 'PROT',      label: 'Proteína' },
  { id: 'GRASA',     label: 'Grasa' },
  { id: 'MIX_HC',    label: '½ Prot + ½ HC' },
  { id: 'MIX_GRASA', label: '½ Prot + ½ Grasa' },
];

const CAT_COLOR: Record<FoodCategory, string> = {
  HC:        'bg-amber-500/10 text-amber-300 border border-amber-500/20',
  PROT:      'bg-blue-500/10 text-blue-300 border border-blue-500/20',
  GRASA:     'bg-orange-500/10 text-orange-300 border border-orange-500/20',
  MIX_HC:    'bg-violet-500/10 text-violet-300 border border-violet-500/20',
  MIX_GRASA: 'bg-pink-500/10 text-pink-300 border border-pink-500/20',
};

function makeMealId() { return `meal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`; }
function mealDisplayName(name: string, n: number): string {
  const stripped = name.replace(/^Comida\s*\d+\s*/i, '').trim();
  return stripped || `Comida ${n}`;
}
function makeBlankExchange(): MealExchange { return { category: 'HC', count: 1 }; }
function makeBlankMeal(_n: number): NutritionMeal {
  return { id: makeMealId(), name: '', exchanges: [makeBlankExchange()] };
}

interface EditState {
  name: string;
  targetCalories: number;
  meals: NutritionMeal[];
}

function blankForm(): EditState {
  return { name: '', targetCalories: 1800, meals: [makeBlankMeal(1), makeBlankMeal(2), makeBlankMeal(3)] };
}

interface Props { coachId: string; }

export default function NutritionPlansScreen({ coachId }: Props) {
  const [dayTypes, setDayTypes] = useState<NutritionDayType[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'editor'>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EditState>(blankForm());
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setDayTypes(await getNutritionDayTypes());
      setLoading(false);
    })();
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(blankForm());
    setView('editor');
  };

  const openEdit = (dt: NutritionDayType) => {
    setEditingId(dt.id);
    setForm({
      name: dt.name,
      targetCalories: dt.targetCalories,
      meals: dt.meals.map(m => ({ ...m, exchanges: m.exchanges.map(e => ({ ...e })) })),
    });
    setView('editor');
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const data: Omit<NutritionDayType, 'id'> = {
        ownerId: coachId,
        name: form.name.trim(),
        targetCalories: form.targetCalories,
        meals: form.meals,
      };
      if (editingId) {
        await updateNutritionDayType(editingId, data);
        setDayTypes(prev => prev.map(dt => dt.id === editingId ? { ...dt, ...data } : dt));
      } else {
        const created = await createNutritionDayType(data);
        setDayTypes(prev => [...prev, created]);
      }
      setView('list');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteNutritionDayType(id);
    setDayTypes(prev => prev.filter(dt => dt.id !== id));
    setDeleteId(null);
  };

  // ── Meal mutations ─────────────────────────────────────────────────────────

  const setMealName = (mi: number, name: string) =>
    setForm(f => ({ ...f, meals: f.meals.map((m, i) => i === mi ? { ...m, name } : m) }));

  const addMeal = () => {
    const n = form.meals.length + 1;
    setForm(f => ({ ...f, meals: [...f.meals, makeBlankMeal(n)] }));
  };

  const removeMeal = (mi: number) => {
    if (form.meals.length <= 1) return;
    setForm(f => ({ ...f, meals: f.meals.filter((_, i) => i !== mi) }));
  };

  const addExchange = (mi: number) =>
    setForm(f => ({
      ...f,
      meals: f.meals.map((m, i) => i === mi ? { ...m, exchanges: [...m.exchanges, makeBlankExchange()] } : m),
    }));

  const removeExchange = (mi: number, ei: number) =>
    setForm(f => ({
      ...f,
      meals: f.meals.map((m, i) => i === mi ? { ...m, exchanges: m.exchanges.filter((_, j) => j !== ei) } : m),
    }));

  const updateExchange = (mi: number, ei: number, patch: Partial<MealExchange>) =>
    setForm(f => ({
      ...f,
      meals: f.meals.map((m, i) =>
        i === mi ? { ...m, exchanges: m.exchanges.map((e, j) => j === ei ? { ...e, ...patch } : e) } : m
      ),
    }));

  // ── List view ──────────────────────────────────────────────────────────────

  if (view === 'list') {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <p className="text-xs text-[#c6c9ab] font-mono">
            {dayTypes.length} tipo{dayTypes.length !== 1 ? 's' : ''} de día
          </p>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-[#e2ff00] text-black font-mono font-bold text-xs uppercase rounded-lg hover:bg-[#bad200] active:scale-95 transition-all shadow-md"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            Crear tipo de día
          </button>
        </div>

        {loading ? (
          <div className="text-center py-16 font-mono text-sm text-[#c6c9ab] animate-pulse">Cargando tipos de día...</div>
        ) : dayTypes.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-[#2a2a2a] rounded-2xl">
            <span className="material-symbols-outlined text-4xl text-[#2a2a2a] block mb-3">calendar_view_day</span>
            <p className="text-[#c6c9ab] text-sm font-sans">No hay tipos de día todavía.</p>
            <p className="text-[#c6c9ab] text-xs font-mono mt-1">Crea el primero (Día Alto, Día Bajo…) para asignarlo a tus atletas.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {dayTypes.map(dt => (
              <div key={dt.id} className="bg-[#121212] border border-[#2a2a2a] rounded-xl p-5 hover:border-[#3a3a3a] transition-colors flex flex-col justify-between gap-4">
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <h3 className="font-sans font-bold text-white text-lg leading-tight">{dt.name}</h3>
                    <span className="text-xs font-mono font-bold text-[#e2ff00] whitespace-nowrap">{dt.targetCalories} kcal</span>
                  </div>
                  <p className="text-[10px] font-mono text-[#c6c9ab] mb-2">
                    {dt.meals.length} comida{dt.meals.length !== 1 ? 's' : ''}
                  </p>
                  <div className="space-y-1.5">
                    {dt.meals.map((meal, mi) => (
                      <div key={mi} className="flex items-center gap-2 text-xs">
                        <span className="font-mono text-[#c6c9ab] w-28 truncate">{mealDisplayName(meal.name, mi + 1)}</span>
                        <div className="flex gap-1 flex-wrap">
                          {meal.exchanges.map((ex, ei) => (
                            <span key={ei} className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${CAT_COLOR[ex.category]}`}>
                              {ex.count}× {ex.category.replace('_', ' ')}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2 pt-3 border-t border-[#2a2a2a]">
                  <button
                    onClick={() => openEdit(dt)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1c1b1b] border border-[#2a2a2a] text-[#00eefc] hover:border-[#00eefc]/40 font-mono text-[10px] uppercase rounded-lg transition-all"
                  >
                    <span className="material-symbols-outlined text-sm">edit</span>
                    Editar
                  </button>
                  <button
                    onClick={() => setDeleteId(dt.id)}
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
              <h3 className="font-sans font-bold text-lg text-white">¿Eliminar tipo de día?</h3>
              <p className="text-sm text-[#c6c9ab]">Se quitará también de los atletas que lo tengan asignado.</p>
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

  // ── Editor ─────────────────────────────────────────────────────────────────

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
        <h2 className="font-sans font-bold text-xl text-white">
          {editingId ? 'Editar tipo de día' : 'Nuevo tipo de día'}
        </h2>
      </div>

      {/* Metadata */}
      <div className="bg-[#121212] border border-[#2a2a2a] rounded-xl p-5 space-y-4">
        <h3 className="font-mono text-xs text-[#c6c9ab] uppercase tracking-wider">Datos generales</h3>
        <div>
          <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase mb-1.5">
            Nombre del tipo de día *
          </label>
          <input
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Ej: Día Alto, Día Bajo, Día Libre"
            className="w-full bg-[#0e0e0e] border border-[#2a2a2a] rounded-lg px-3 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#e2ff00]"
          />
        </div>
        <div className="max-w-xs">
          <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase mb-1.5">Calorías objetivo</label>
          <input
            type="number"
            value={form.targetCalories}
            onChange={e => setForm(f => ({ ...f, targetCalories: Number(e.target.value) }))}
            className="w-full bg-[#0e0e0e] border border-[#2a2a2a] rounded-lg px-3 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#e2ff00]"
          />
        </div>
      </div>

      {/* Meals */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-mono text-xs text-[#c6c9ab] uppercase tracking-wider">
            Comidas ({form.meals.length})
          </h3>
          <button
            onClick={addMeal}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1c1b1b] border border-[#2a2a2a] text-[#e2ff00] hover:border-[#e2ff00]/40 font-mono text-[10px] uppercase rounded-lg transition-all"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            Añadir comida
          </button>
        </div>

        {form.meals.map((meal, mi) => (
          <div key={meal.id} className="bg-[#121212] border border-[#2a2a2a] rounded-xl p-4 space-y-3">
            {/* Meal header */}
            <div className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-[#e2ff00] text-black font-mono text-xs font-bold flex items-center justify-center flex-shrink-0">
                {mi + 1}
              </span>
              <input
                value={meal.name}
                onChange={e => setMealName(mi, e.target.value)}
                placeholder="Nombre libre: Desayuno, Pre-entreno, Cena..."
                className="flex-1 bg-[#0e0e0e] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#e2ff00]"
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

            {/* Exchanges */}
            <div className="pl-9 space-y-2">
              <p className="font-mono text-[9px] text-[#c6c9ab] uppercase tracking-wider">Intercambios requeridos</p>
              {meal.exchanges.map((ex, ei) => (
                <div key={ei} className="flex items-center gap-2 flex-wrap">
                  <select
                    value={ex.category}
                    onChange={e => updateExchange(mi, ei, { category: e.target.value as FoodCategory })}
                    className="bg-[#0e0e0e] border border-[#2a2a2a] rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#e2ff00] cursor-pointer"
                  >
                    {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                  <div className="flex items-center gap-1.5 bg-[#0e0e0e] border border-[#2a2a2a] rounded-lg px-2 py-1.5">
                    <button
                      onClick={() => updateExchange(mi, ei, { count: Math.max(1, ex.count - 1) })}
                      className="text-[#c6c9ab] hover:text-white w-4 h-4 flex items-center justify-center"
                    >−</button>
                    <span className="font-mono text-sm text-white w-5 text-center">{ex.count}</span>
                    <button
                      onClick={() => updateExchange(mi, ei, { count: ex.count + 1 })}
                      className="text-[#c6c9ab] hover:text-white w-4 h-4 flex items-center justify-center"
                    >+</button>
                  </div>
                  <span className={`text-[9px] font-mono px-2 py-1 rounded ${CAT_COLOR[ex.category]}`}>
                    {ex.count}× {ex.category.replace('_', ' ')}
                  </span>
                  {meal.exchanges.length > 1 && (
                    <button onClick={() => removeExchange(mi, ei)} className="text-[#c6c9ab] hover:text-red-400 transition-colors">
                      <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={() => addExchange(mi)}
                className="flex items-center gap-1 text-[10px] font-mono text-[#c6c9ab] hover:text-[#e2ff00] transition-colors mt-1"
              >
                <span className="material-symbols-outlined text-sm">add_circle</span>
                Añadir intercambio
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
          {saving
            ? <><span className="material-symbols-outlined text-sm animate-spin">refresh</span>Guardando...</>
            : <><span className="material-symbols-outlined text-sm">save</span>Guardar tipo de día</>
          }
        </button>
      </div>
    </div>
  );
}
