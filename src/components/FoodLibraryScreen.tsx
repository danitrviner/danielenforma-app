import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MealItem, FoodCategory, DietMode } from '../types';
import { getFoodItems, createFoodItem, updateFoodItem, deleteFoodItem, seedFoodItemsIfEmpty } from '../dbService';
import { SYSTEM_FOODS } from '../nutricion_seed_en_forma';
import Skeleton from './Skeleton';
import { EmptyState, Dialog, Button } from './ui';

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
    <div className="space-y-6">
      {/* Mode selector */}
      <div className="flex gap-2 flex-wrap">
        {MODES.map(m => (
          <button
            key={m.id}
            onClick={() => setFilterMode(m.id)}
            className={`px-4 py-2 rounded-control font-mono text-label font-bold uppercase tracking-wider transition-all ${
              filterMode === m.id
                ? 'bg-accent text-black'
                : 'bg-raised text-ink-2 border border-hairline hover:border-accent/40 hover:text-white'
            }`}
          >
            {m.label}
            <span className="ml-2 opacity-60 font-normal">
              {items.filter(f => f.mode === m.id).length}
            </span>
          </button>
        ))}
      </div>

      {/* Category + search + add button */}
      <div className="flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setFilterCat('all')}
            className={`px-3 py-1 rounded-full font-mono text-caption font-bold uppercase transition-all tracking-wider ${
              filterCat === 'all' ? 'bg-raised text-white' : 'text-ink-2 hover:text-white'
            }`}
          >
            Todos
          </button>
          {counts.map(cat => (
            <button
              key={cat.id}
              onClick={() => setFilterCat(cat.id)}
              className={`px-3 py-1 rounded-full font-mono text-caption font-bold uppercase transition-all tracking-wider ${
                filterCat === cat.id ? CAT_COLOR[cat.id] + '' : 'text-ink-2 hover:text-white'
              }`}
            >
              {cat.label}
              <span className="ml-1 opacity-60 font-normal">{cat.count}</span>
            </button>
          ))}
        </div>

        <div className="flex gap-2 items-center w-full md:w-auto">
          <div className="flex items-center gap-2 bg-raised border border-hairline rounded-surface px-3 py-2 flex-1 md:w-52">
            <span className="material-symbols-outlined text-ink-2 text-body-s">search</span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar alimento..."
              className="bg-transparent text-white text-title-s focus:outline-none w-full placeholder-ink-2/40"
            />
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-3 bg-accent text-black font-sans font-bold text-label uppercase rounded-control hover:bg-accent-press active:scale-95 transition-all whitespace-nowrap"
          >
            <span className="material-symbols-outlined text-body-s">add</span>
            Añadir
          </button>
        </div>
      </div>

      <p className="text-caption text-ink-2 font-mono">
        Mostrando {filtered.length} de {items.filter(f => f.mode === filterMode).length} alimentos en modo {MODES.find(m => m.id === filterMode)?.label}
      </p>

      {/* Food list */}
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-11 w-full rounded-surface" />
          <Skeleton className="h-11 w-full rounded-surface" />
          <Skeleton className="h-11 w-full rounded-surface" />
          <Skeleton className="h-11 w-full rounded-surface" />
          <Skeleton className="h-11 w-full rounded-surface" />
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(item => (
            <div key={item.id} className="bg-surface border border-hairline rounded-surface px-4 py-3 flex items-center justify-between gap-3 hover:border-hairline transition-colors group">
              <div className="flex items-center gap-3 min-w-0">
                <span className={`text-caption font-mono font-bold uppercase px-2 rounded-control flex-shrink-0 ${CAT_COLOR[item.category]}`}>
                  {item.category.replace('_', ' ')}
                </span>
                <p className="text-body-s text-white font-sans truncate">{item.label}</p>
              </div>
              {!isSystem(item) && (
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <button onClick={() => openEdit(item)} className="p-2 rounded-control hover:bg-data/10 text-ink-2 hover:text-data transition-colors">
                    <span className="material-symbols-outlined text-body-s">edit</span>
                  </button>
                  <button onClick={() => setDeleteId(item.id)} className="p-2 rounded-control hover:bg-red-500/10 text-ink-2 hover:text-red-400 transition-colors">
                    <span className="material-symbols-outlined text-body-s">delete</span>
                  </button>
                </div>
              )}
            </div>
          ))}
          {filtered.length === 0 && !loading && (
            <EmptyState icon="search_off" title="Ningún alimento coincide." />
          )}
        </div>
      )}

      {/* Create / Edit Modal */}
      {showModal && (
        <Dialog
          open
          onClose={() => setShowModal(false)}
          title={editingId ? 'Editar alimento' : 'Nuevo alimento'}
          footer={(
            <>
              <Button variant="secondary" onClick={() => setShowModal(false)} className="flex-1">
                Cancelar
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || !form.label.trim()}
                loading={saving}
                icon="save"
                className="flex-1"
              >
                {saving ? 'Guardando...' : 'Guardar'}
              </Button>
            </>
          )}
        >
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-mono text-caption text-ink-2 uppercase mb-2">Modo *</label>
                  <select
                    value={form.mode}
                    onChange={e => setForm(f => ({ ...f, mode: e.target.value as DietMode }))}
                    className="w-full bg-surface border border-hairline rounded-control px-3 py-3 text-title-s text-white focus:outline-none focus:ring-1 focus:ring-accent cursor-pointer"
                  >
                    {MODES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block font-mono text-caption text-ink-2 uppercase mb-2">Categoría *</label>
                  <select
                    value={form.category}
                    onChange={e => setForm(f => ({ ...f, category: e.target.value as FoodCategory }))}
                    className="w-full bg-surface border border-hairline rounded-control px-3 py-3 text-title-s text-white focus:outline-none focus:ring-1 focus:ring-accent cursor-pointer"
                  >
                    {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block font-sans text-caption text-ink-2 uppercase mb-2">Descripción (1 intercambio = ...) *</label>
                <textarea
                  value={form.label}
                  onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                  placeholder="Ej: 100g pechuga de pollo sin piel"
                  rows={3}
                  className="w-full bg-surface border border-hairline rounded-control px-3 py-3 text-title-s text-white focus:outline-none focus:ring-1 focus:ring-accent resize-none"
                />
              </div>
            </div>
        </Dialog>
      )}

      {/* Delete confirm */}
      {deleteId && (
        <Dialog
          open
          onClose={() => setDeleteId(null)}
          title="¿Eliminar alimento?"
          size="s"
          footer={(
            <>
              <Button variant="secondary" onClick={() => setDeleteId(null)} className="flex-1">Cancelar</Button>
              <Button variant="danger" onClick={() => handleDelete(deleteId)} className="flex-1">Eliminar</Button>
            </>
          )}
        >
          <p className="font-sans text-caption text-ink-2">
            «{items.find(f => f.id === deleteId)?.label}»
          </p>
        </Dialog>
      )}
    </div>
  );
}
