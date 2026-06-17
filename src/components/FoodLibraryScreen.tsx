import React, { useState, useEffect } from 'react';
import { MealItem } from '../types';
import { FOOD_ITEMS } from '../data';
import { getFoodItems, createFoodItem, updateFoodItem, deleteFoodItem, seedFoodItemsIfEmpty } from '../dbService';

const SYSTEM_IDS = new Set(FOOD_ITEMS.map(f => f.id));

const CAT_LABEL: Record<MealItem['category'], string> = {
  carbs:   'HC',
  protein: 'Proteína',
  fat:     'Grasa',
  veg:     'Verdura',
};

const CAT_COLOR: Record<MealItem['category'], string> = {
  carbs:   'bg-amber-500/10 text-amber-300 border border-amber-500/20',
  protein: 'bg-blue-500/10 text-blue-300 border border-blue-500/20',
  fat:     'bg-orange-500/10 text-orange-300 border border-orange-500/20',
  veg:     'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20',
};

const CATEGORIES: Array<MealItem['category'] | 'all'> = ['all', 'carbs', 'protein', 'fat', 'veg'];

const EMPTY_FORM: Omit<MealItem, 'id'> = {
  name: '',
  category: 'carbs',
  portionSize: '',
  exchangeInfo: '',
  calories: undefined,
};

interface Props {
  coachId: string;
}

export default function FoodLibraryScreen({ coachId: _coachId }: Props) {
  const [items, setItems] = useState<MealItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCat, setFilterCat] = useState<MealItem['category'] | 'all'>('all');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<MealItem, 'id'>>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await seedFoodItemsIfEmpty();
      const data = await getFoodItems();
      setItems(data);
      setLoading(false);
    })();
  }, []);

  const filtered = items.filter(f => {
    if (filterCat !== 'all' && f.category !== filterCat) return false;
    if (search && !f.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEdit = (item: MealItem) => {
    setEditingId(item.id);
    setForm({ name: item.name, category: item.category, portionSize: item.portionSize, exchangeInfo: item.exchangeInfo, calories: item.calories });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.portionSize.trim() || !form.exchangeInfo.trim()) return;
    setSaving(true);
    try {
      if (editingId) {
        await updateFoodItem(editingId, form);
        setItems(prev => prev.map(f => f.id === editingId ? { ...f, ...form } : f));
      } else {
        const newItem = await createFoodItem(form);
        setItems(prev => [...prev, newItem]);
      }
      setShowModal(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteFoodItem(id);
    setItems(prev => prev.filter(f => f.id !== id));
    setDeleteId(null);
  };

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setFilterCat(cat)}
              className={`px-3 py-1.5 rounded-full font-mono text-[10px] font-bold uppercase transition-all tracking-wider ${
                filterCat === cat ? 'bg-[#e2ff00] text-black shadow-md' : 'bg-[#1c1b1b] text-[#c6c9ab] border border-[#2a2a2a] hover:border-[#e2ff00]/40'
              }`}
            >
              {cat === 'all' ? 'Todos' : CAT_LABEL[cat as MealItem['category']]}
            </button>
          ))}
        </div>
        <div className="flex gap-2 items-center w-full md:w-auto">
          <div className="flex items-center gap-2 bg-[#1c1b1b] border border-[#2a2a2a] rounded-lg px-3 py-2 flex-1 md:w-48">
            <span className="material-symbols-outlined text-[#c6c9ab] text-sm">search</span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="bg-transparent text-white text-xs focus:outline-none w-full placeholder-[#c6c9ab]/40"
            />
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-[#e2ff00] text-black font-mono font-bold text-xs uppercase rounded-lg hover:bg-[#bad200] active:scale-95 transition-all whitespace-nowrap shadow-md"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            Nuevo alimento
          </button>
        </div>
      </div>

      {/* Summary */}
      <p className="text-xs text-[#c6c9ab] font-mono">
        {filtered.length} alimento{filtered.length !== 1 ? 's' : ''} · {items.filter(f => !SYSTEM_IDS.has(f.id)).length} personalizados
      </p>

      {/* Food grid */}
      {loading ? (
        <div className="text-center py-16 font-mono text-sm text-[#c6c9ab] animate-pulse">Cargando biblioteca...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map(item => {
            const isSystem = SYSTEM_IDS.has(item.id);
            return (
              <div key={item.id} className="bg-[#121212] border border-[#2a2a2a] rounded-xl p-4 flex items-start justify-between gap-3 hover:border-[#3a3a3a] transition-colors group">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className={`text-[9px] font-mono font-bold uppercase px-2 py-0.5 rounded ${CAT_COLOR[item.category]}`}>
                      {CAT_LABEL[item.category]}
                    </span>
                    {isSystem && (
                      <span className="text-[9px] font-mono text-[#c6c9ab] bg-[#1c1b1b] px-1.5 py-0.5 rounded border border-[#2a2a2a]">Sistema</span>
                    )}
                  </div>
                  <p className="font-sans font-bold text-sm text-white truncate">{item.name}</p>
                  <p className="font-mono text-[10px] text-[#c6c9ab] mt-0.5">{item.portionSize} = {item.exchangeInfo}</p>
                  {item.calories && (
                    <p className="font-mono text-[10px] text-[#e2ff00] mt-0.5">{item.calories} kcal</p>
                  )}
                </div>
                {!isSystem && (
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button
                      onClick={() => openEdit(item)}
                      className="p-1.5 rounded bg-[#1c1b1b] hover:bg-[#00eefc]/10 text-[#c6c9ab] hover:text-[#00eefc] transition-colors"
                    >
                      <span className="material-symbols-outlined text-sm">edit</span>
                    </button>
                    <button
                      onClick={() => setDeleteId(item.id)}
                      className="p-1.5 rounded bg-[#1c1b1b] hover:bg-red-500/10 text-[#c6c9ab] hover:text-red-400 transition-colors"
                    >
                      <span className="material-symbols-outlined text-sm">delete</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-full text-center py-12 text-[#c6c9ab] font-mono text-xs italic">
              Ningún alimento coincide.
            </div>
          )}
        </div>
      )}

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#191919] border border-[#2a2a2a] rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-sans font-black text-xl text-white uppercase tracking-tight">
                {editingId ? 'Editar alimento' : 'Nuevo alimento'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-[#c6c9ab] hover:text-white transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider mb-1.5">Nombre *</label>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Ej: Quinoa cocida"
                  className="w-full bg-[#121212] border border-[#2a2a2a] rounded-lg px-3 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#e2ff00]"
                />
              </div>
              <div>
                <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider mb-1.5">Categoría *</label>
                <select
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value as MealItem['category'] }))}
                  className="w-full bg-[#121212] border border-[#2a2a2a] rounded-lg px-3 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#e2ff00] cursor-pointer"
                >
                  <option value="carbs">HC</option>
                  <option value="protein">Proteína</option>
                  <option value="fat">Grasa</option>
                  <option value="veg">Verdura</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider mb-1.5">Porción *</label>
                  <input
                    value={form.portionSize}
                    onChange={e => setForm(f => ({ ...f, portionSize: e.target.value }))}
                    placeholder="Ej: 100g"
                    className="w-full bg-[#121212] border border-[#2a2a2a] rounded-lg px-3 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#e2ff00]"
                  />
                </div>
                <div>
                  <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider mb-1.5">Calorías</label>
                  <input
                    type="number"
                    value={form.calories ?? ''}
                    onChange={e => setForm(f => ({ ...f, calories: e.target.value ? Number(e.target.value) : undefined }))}
                    placeholder="Ej: 350"
                    className="w-full bg-[#121212] border border-[#2a2a2a] rounded-lg px-3 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#e2ff00]"
                  />
                </div>
              </div>
              <div>
                <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider mb-1.5">Equivalencia *</label>
                <input
                  value={form.exchangeInfo}
                  onChange={e => setForm(f => ({ ...f, exchangeInfo: e.target.value }))}
                  placeholder="Ej: 2 HC · 1 Prot"
                  className="w-full bg-[#121212] border border-[#2a2a2a] rounded-lg px-3 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#e2ff00]"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-3 border border-[#2a2a2a] text-[#c6c9ab] hover:text-white font-mono text-xs uppercase rounded-xl transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.name.trim() || !form.portionSize.trim() || !form.exchangeInfo.trim()}
                className="flex-1 py-3 bg-[#e2ff00] text-black font-mono font-bold text-xs uppercase rounded-xl hover:bg-[#bad200] active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {saving ? (
                  <><span className="material-symbols-outlined text-sm animate-spin">refresh</span>Guardando...</>
                ) : (
                  <><span className="material-symbols-outlined text-sm">save</span>Guardar</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#191919] border border-red-500/30 rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4">
            <h3 className="font-sans font-bold text-lg text-white">¿Eliminar alimento?</h3>
            <p className="text-sm text-[#c6c9ab]">Esta acción no se puede deshacer.</p>
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
