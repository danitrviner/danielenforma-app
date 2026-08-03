import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MealItem, FoodCategory, DietMode } from '../types';
import { getFoodItems, createFoodItem, updateFoodItem, deleteFoodItem, seedFoodItemsIfEmpty } from '../dbService';
import { SYSTEM_FOODS } from '../nutricion_seed_en_forma';
import Skeleton from './Skeleton';

const SYSTEM_LABELS = new Set(SYSTEM_FOODS.map(f => f.label));

const MODES: { id: DietMode; label: string }[] = [
  { id: 'OMNIVORO',  label: 'Omnívoro' },
  { id: 'VEGANO',    label: 'Vegano' },
  { id: 'SIN_PESAR', label: 'Sin pesar' },
];

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

const MODE_COLOR: Record<DietMode, string> = {
  OMNIVORO:  'bg-accent/10 text-accent border border-accent/20',
  VEGANO:    'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20',
  SIN_PESAR: 'bg-data/10 text-data border border-data/20',
};

const EMPTY_FORM: Omit<MealItem, 'id'> = { mode: 'OMNIVORO', category: 'HC', label: '' };

interface Props { coachId: string; }

const foodItemsQueryKey = ['foodItems'] as const;

export default function FoodLibraryScreen({ coachId: _coachId }: Props) {
  const queryClient = useQueryClient();
  const { data: items = [], isPending: loading } = useQuery({
    queryKey: foodItemsQueryKey,
    queryFn: async () => {
      await seedFoodItemsIfEmpty();
      return getFoodItems();
    },
  });
  const [filterMode, setFilterMode] = useState<DietMode>('OMNIVORO');
  const [filterCat, setFilterCat] = useState<FoodCategory | 'all'>('all');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<MealItem, 'id'>>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const isSystem = (item: MealItem) => SYSTEM_LABELS.has(item.label);

  const filtered = items.filter(f => {
    if (f.mode !== filterMode) return false;
    if (filterCat !== 'all' && f.category !== filterCat) return false;
    if (search && !f.label.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const counts = CATEGORIES.map(cat => ({
    ...cat,
    count: items.filter(f => f.mode === filterMode && f.category === cat.id).length,
  }));

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, mode: filterMode, category: filterCat === 'all' ? 'HC' : filterCat });
    setShowModal(true);
  };

  const openEdit = (item: MealItem) => {
    setEditingId(item.id);
    setForm({ mode: item.mode, category: item.category, label: item.label });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.label.trim()) return;
    setSaving(true);
    try {
      if (editingId) {
        await updateFoodItem(editingId, form);
        queryClient.setQueryData<MealItem[]>(foodItemsQueryKey, prev =>
          prev?.map(f => f.id === editingId ? { ...f, ...form } : f));
      } else {
        const newItem = await createFoodItem(form);
        queryClient.setQueryData<MealItem[]>(foodItemsQueryKey, prev => [...(prev ?? []), newItem]);
      }
      setShowModal(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteFoodItem(id);
    queryClient.setQueryData<MealItem[]>(foodItemsQueryKey, prev => prev?.filter(f => f.id !== id));
    setDeleteId(null);
  };

  return (
    <div className="space-y-5">
      {/* Mode selector */}
      <div className="flex gap-2 flex-wrap">
        {MODES.map(m => (
          <button
            key={m.id}
            onClick={() => setFilterMode(m.id)}
            className={`px-4 py-2 rounded-control font-mono text-label font-bold uppercase tracking-wider transition-all ${
              filterMode === m.id
                ? 'bg-accent text-black shadow-md'
                : 'bg-raised text-ink-2 border border-hairline hover:border-accent/40 hover:text-white'
            }`}
          >
            {m.label}
            <span className="ml-1.5 opacity-60 font-normal">
              {items.filter(f => f.mode === m.id).length}
            </span>
          </button>
        ))}
      </div>

      {/* Category + search + add button */}
      <div className="flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setFilterCat('all')}
            className={`px-2.5 py-1 rounded-full font-mono text-caption font-bold uppercase transition-all tracking-wider ${
              filterCat === 'all' ? 'bg-raised text-white' : 'text-ink-2 hover:text-white'
            }`}
          >
            Todos
          </button>
          {counts.map(cat => (
            <button
              key={cat.id}
              onClick={() => setFilterCat(cat.id)}
              className={`px-2.5 py-1 rounded-full font-mono text-caption font-bold uppercase transition-all tracking-wider ${
                filterCat === cat.id ? CAT_COLOR[cat.id] + ' shadow-sm' : 'text-ink-2 hover:text-white'
              }`}
            >
              {cat.label}
              <span className="ml-1 opacity-60 font-normal">{cat.count}</span>
            </button>
          ))}
        </div>

        <div className="flex gap-2 items-center w-full md:w-auto">
          <div className="flex items-center gap-2 bg-raised border border-hairline rounded-surface px-3 py-2 flex-1 md:w-52">
            <span className="material-symbols-outlined text-ink-2 text-sm">search</span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar alimento..."
              className="bg-transparent text-white text-label focus:outline-none w-full placeholder-ink-2/40"
            />
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2.5 bg-accent text-black font-sans font-bold text-label uppercase rounded-control hover:bg-accent-press active:scale-95 transition-all whitespace-nowrap shadow-md"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            Añadir
          </button>
        </div>
      </div>

      <p className="text-caption text-ink-2 font-mono">
        Mostrando {filtered.length} de {items.filter(f => f.mode === filterMode).length} alimentos en modo {MODES.find(m => m.id === filterMode)?.label}
      </p>

      {/* Food list */}
      {loading ? (
        <div className="space-y-1.5">
          <Skeleton className="h-11 w-full rounded-surface" />
          <Skeleton className="h-11 w-full rounded-surface" />
          <Skeleton className="h-11 w-full rounded-surface" />
          <Skeleton className="h-11 w-full rounded-surface" />
          <Skeleton className="h-11 w-full rounded-surface" />
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map(item => (
            <div key={item.id} className="bg-surface border border-hairline rounded-surface px-4 py-3 flex items-center justify-between gap-3 hover:border-hairline transition-colors group">
              <div className="flex items-center gap-3 min-w-0">
                <span className={`text-caption font-mono font-bold uppercase px-2 py-0.5 rounded-control flex-shrink-0 ${CAT_COLOR[item.category]}`}>
                  {item.category.replace('_', ' ')}
                </span>
                <p className="text-sm text-white font-sans truncate">{item.label}</p>
              </div>
              {!isSystem(item) && (
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <button onClick={() => openEdit(item)} className="p-1.5 rounded-control hover:bg-data/10 text-ink-2 hover:text-data transition-colors">
                    <span className="material-symbols-outlined text-sm">edit</span>
                  </button>
                  <button onClick={() => setDeleteId(item.id)} className="p-1.5 rounded-control hover:bg-red-500/10 text-ink-2 hover:text-red-400 transition-colors">
                    <span className="material-symbols-outlined text-sm">delete</span>
                  </button>
                </div>
              )}
            </div>
          ))}
          {filtered.length === 0 && !loading && (
            <div className="text-center py-12 text-ink-2 font-mono text-label italic">
              Ningún alimento coincide.
            </div>
          )}
        </div>
      )}

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-raised border border-hairline rounded-surface p-6 max-w-md w-full shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-sans font-black text-xl text-white uppercase tracking-tight">
                {editingId ? 'Editar alimento' : 'Nuevo alimento'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-ink-2 hover:text-white">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-mono text-caption text-ink-2 uppercase mb-1.5">Modo *</label>
                  <select
                    value={form.mode}
                    onChange={e => setForm(f => ({ ...f, mode: e.target.value as DietMode }))}
                    className="w-full bg-surface border border-hairline rounded-control px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-accent cursor-pointer"
                  >
                    {MODES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block font-mono text-caption text-ink-2 uppercase mb-1.5">Categoría *</label>
                  <select
                    value={form.category}
                    onChange={e => setForm(f => ({ ...f, category: e.target.value as FoodCategory }))}
                    className="w-full bg-surface border border-hairline rounded-control px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-accent cursor-pointer"
                  >
                    {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block font-mono text-caption text-ink-2 uppercase mb-1.5">Descripción (1 intercambio = ...) *</label>
                <textarea
                  value={form.label}
                  onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                  placeholder="Ej: 100g pechuga de pollo sin piel"
                  rows={3}
                  className="w-full bg-surface border border-hairline rounded-control px-3 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-accent resize-none"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowModal(false)} className="flex-1 py-3 border border-hairline text-ink-2 hover:text-white font-mono text-label uppercase rounded-control transition-all">
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.label.trim()}
                className="flex-1 py-3 bg-accent text-black font-sans font-bold text-label uppercase rounded-control hover:bg-accent-press active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {saving ? <><span className="material-symbols-outlined text-sm animate-spin">refresh</span>Guardando...</> : <><span className="material-symbols-outlined text-sm">save</span>Guardar</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-raised border border-red-500/30 rounded-surface p-6 max-w-sm w-full shadow-2xl space-y-4">
            <h3 className="font-sans font-bold text-lg text-white">¿Eliminar alimento?</h3>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 py-2.5 border border-hairline text-ink-2 font-mono text-label uppercase rounded-control">Cancelar</button>
              <button onClick={() => handleDelete(deleteId)} className="flex-1 py-2.5 bg-red-500/20 border border-red-500/30 text-red-300 font-sans font-bold text-label uppercase rounded-control hover:bg-red-500/30 transition-colors">Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
