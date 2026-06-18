import React, { useState, useEffect } from 'react';
import { UserProfile, NutritionMenu, NutritionMenuItem, FoodCategory, DietMode, MealItem } from '../types';
import { getMenusForAthlete, createMenu, updateMenu, deleteMenu, getFoodItems, seedFoodItemsIfEmpty, getAthleteNutritionConfig } from '../dbService';

const CAT_LABEL: Record<FoodCategory, string> = {
  HC:        'HC',
  PROT:      'Proteína',
  GRASA:     'Grasa',
  MIX_HC:    '½ Prot + ½ HC',
  MIX_GRASA: '½ Prot + ½ Grasa',
};

const CAT_BG: Record<FoodCategory, string> = {
  HC:        'bg-amber-500/10 text-amber-300 border-amber-500/20',
  PROT:      'bg-blue-500/10 text-blue-300 border-blue-500/20',
  GRASA:     'bg-orange-500/10 text-orange-300 border-orange-500/20',
  MIX_HC:    'bg-violet-500/10 text-violet-300 border-violet-500/20',
  MIX_GRASA: 'bg-pink-500/10 text-pink-300 border-pink-500/20',
};

const MODE_LABEL: Record<DietMode, string> = {
  OMNIVORO:  'Omnívoro',
  VEGANO:    'Vegano',
  SIN_PESAR: 'Sin pesar',
};

const ALL_CATEGORIES: FoodCategory[] = ['HC', 'PROT', 'GRASA', 'MIX_HC', 'MIX_GRASA'];

interface FormState {
  name: string;
  items: NutritionMenuItem[];
  coachNote: string;
}

function blankForm(): FormState { return { name: '', items: [], coachNote: '' }; }

interface Props { profile: UserProfile; }

export default function NutritionMenusScreen({ profile }: Props) {
  const [menus, setMenus] = useState<NutritionMenu[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'editor'>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(blankForm());
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Food picker
  const [foodItems, setFoodItems] = useState<MealItem[]>([]);
  const [enabledModes, setEnabledModes] = useState<DietMode[]>(['OMNIVORO']);
  const [activeDietMode, setActiveDietMode] = useState<DietMode>('OMNIVORO');
  const [showPicker, setShowPicker] = useState(false);
  const [pickerCategory, setPickerCategory] = useState<FoodCategory>('HC');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      await seedFoodItemsIfEmpty();
      const [foods, config, fetchedMenus] = await Promise.all([
        getFoodItems(),
        getAthleteNutritionConfig(profile.email).catch(() => null),
        getMenusForAthlete(profile.email),
      ]);
      setFoodItems(foods);
      if (config && config.enabledModes.length > 0) {
        setEnabledModes(config.enabledModes);
        setActiveDietMode(config.enabledModes[0]);
      }
      setMenus(fetchedMenus);
      setLoading(false);
    })();
  }, [profile.email]);

  const openCreate = () => { setEditingId(null); setForm(blankForm()); setView('editor'); };
  const openEdit = (m: NutritionMenu) => {
    setEditingId(m.id);
    setForm({ name: m.name, items: m.items.map(i => ({ ...i })), coachNote: m.coachNote ?? '' });
    setView('editor');
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const data: Omit<NutritionMenu, 'id'> = {
        athleteId: profile.email,
        name: form.name.trim(),
        createdBy: 'athlete',
        items: form.items,
        coachNote: form.coachNote.trim() || undefined,
      };
      if (editingId) {
        await updateMenu(editingId, data);
        setMenus(prev => prev.map(m => m.id === editingId ? { ...m, ...data } : m));
      } else {
        const created = await createMenu(data);
        setMenus(prev => [...prev, created]);
      }
      setView('list');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteMenu(id);
    setMenus(prev => prev.filter(m => m.id !== id));
    setDeleteId(null);
  };

  const removeItem = (idx: number) =>
    setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));

  const addFoodFromPicker = (food: MealItem) => {
    setForm(f => ({ ...f, items: [...f.items, { category: food.category, foodLabel: food.label }] }));
    setShowPicker(false);
  };

  const openPicker = (cat: FoodCategory) => {
    setPickerCategory(cat);
    setSearchTerm('');
    setShowPicker(true);
  };

  const filteredFoods = foodItems.filter(f =>
    f.mode === activeDietMode &&
    f.category === pickerCategory &&
    (!searchTerm || f.label.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // ── List ──────────────────────────────────────────────────────────────────

  if (view === 'list') {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <p className="text-xs text-[#c6c9ab] font-mono">
            {menus.length} menú{menus.length !== 1 ? 's' : ''} guardado{menus.length !== 1 ? 's' : ''}
          </p>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-[#e2ff00] text-black font-mono font-bold text-xs uppercase rounded-lg hover:bg-[#bad200] active:scale-95 transition-all shadow-md"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            Nuevo menú
          </button>
        </div>

        {loading ? (
          <div className="text-center py-16 font-mono text-sm text-[#c6c9ab] animate-pulse">Cargando menús...</div>
        ) : menus.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-[#2a2a2a] rounded-2xl">
            <span className="material-symbols-outlined text-4xl text-[#2a2a2a] block mb-3">menu_book</span>
            <p className="text-[#c6c9ab] text-sm">Sin menús guardados todavía.</p>
            <p className="text-[#c6c9ab] text-xs font-mono mt-1">Crea uno para reutilizarlo en tu tracker.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {menus.map(menu => (
              <div key={menu.id} className="bg-[#121212] border border-[#2a2a2a] rounded-xl p-5 hover:border-[#3a3a3a] transition-colors flex flex-col gap-4">
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-sans font-bold text-white text-base leading-tight">{menu.name}</h3>
                    {menu.createdBy === 'coach' && (
                      <span className="text-[9px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-[#00eefc]/10 text-[#00eefc] border border-[#00eefc]/20 flex-shrink-0">
                        Coach
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {menu.items.map((item, i) => (
                      <span key={i} className={`text-[9px] font-mono px-2 py-0.5 rounded border ${CAT_BG[item.category]}`}>
                        {item.foodLabel}
                      </span>
                    ))}
                  </div>
                  {menu.coachNote && (
                    <div className="flex items-start gap-2 mt-2 bg-[#00eefc]/5 border border-[#00eefc]/15 rounded-lg px-3 py-2">
                      <span className="material-symbols-outlined text-[#00eefc] text-sm flex-shrink-0 mt-0.5">sticky_note_2</span>
                      <p className="text-[10px] text-[#00eefc] font-sans italic">{menu.coachNote}</p>
                    </div>
                  )}
                </div>
                <div className="flex gap-2 pt-3 border-t border-[#2a2a2a]">
                  <button
                    onClick={() => openEdit(menu)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1c1b1b] border border-[#2a2a2a] text-[#00eefc] hover:border-[#00eefc]/40 font-mono text-[10px] uppercase rounded-lg transition-all"
                  >
                    <span className="material-symbols-outlined text-sm">edit</span>
                    Editar
                  </button>
                  <button
                    onClick={() => setDeleteId(menu.id)}
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
              <h3 className="font-sans font-bold text-lg text-white">¿Eliminar menú?</h3>
              <p className="text-sm text-[#c6c9ab]">Esta acción no se puede deshacer.</p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteId(null)} className="flex-1 py-2.5 border border-[#2a2a2a] text-[#c6c9ab] font-mono text-xs uppercase rounded-xl">Cancelar</button>
                <button onClick={() => handleDelete(deleteId)} className="flex-1 py-2.5 bg-red-500/20 border border-red-500/30 text-red-300 font-mono font-bold text-xs uppercase rounded-xl hover:bg-red-500/30 transition-colors">Eliminar</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Editor ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <button onClick={() => setView('list')} className="p-1 px-3 bg-[#1c1b1b] hover:bg-[#2c2b2b] text-[#e2ff00] border border-[#2a2a2a] text-xs font-mono rounded flex items-center gap-1 active:scale-95 transition-all">
          <span className="material-symbols-outlined text-sm">arrow_back</span>Volver
        </button>
        <h2 className="font-sans font-bold text-xl text-white">{editingId ? 'Editar menú' : 'Nuevo menú'}</h2>
      </div>

      {/* Name */}
      <div className="bg-[#121212] border border-[#2a2a2a] rounded-xl p-5 space-y-4">
        <h3 className="font-mono text-xs text-[#c6c9ab] uppercase tracking-wider">Datos del menú</h3>
        <div>
          <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase mb-1.5">Nombre *</label>
          <input
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Ej: Desayuno avena+claras"
            className="w-full bg-[#0e0e0e] border border-[#2a2a2a] rounded-lg px-3 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#e2ff00]"
          />
        </div>
      </div>

      {/* Items */}
      <div className="bg-[#121212] border border-[#2a2a2a] rounded-xl p-5 space-y-4">
        <h3 className="font-mono text-xs text-[#c6c9ab] uppercase tracking-wider">
          Alimentos ({form.items.length})
        </h3>

        {/* Diet mode selector */}
        {enabledModes.length > 1 && (
          <div className="flex gap-2 flex-wrap">
            {enabledModes.map(mode => (
              <button
                key={mode}
                onClick={() => setActiveDietMode(mode)}
                className={`px-3 py-1.5 rounded-lg font-mono text-[10px] font-bold uppercase tracking-wider transition-all ${
                  activeDietMode === mode ? 'bg-[#e2ff00] text-black' : 'bg-[#1c1b1b] text-[#c6c9ab] border border-[#2a2a2a] hover:border-[#e2ff00]/40'
                }`}
              >
                {MODE_LABEL[mode]}
              </button>
            ))}
          </div>
        )}

        {/* Category buttons to add item */}
        <div>
          <p className="font-mono text-[9px] text-[#c6c9ab] uppercase mb-2">Añadir alimento por categoría:</p>
          <div className="flex gap-1.5 flex-wrap">
            {ALL_CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => openPicker(cat)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg font-mono text-[10px] font-bold border transition-all ${CAT_BG[cat]}`}
              >
                <span className="material-symbols-outlined text-sm">add</span>
                {cat.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        {/* Added items */}
        {form.items.length > 0 ? (
          <div className="space-y-2 pt-1">
            {form.items.map((item, i) => (
              <div key={i} className="flex items-center justify-between gap-3 px-3 py-2 bg-[#171717] border border-[#2a2a2a] rounded-lg">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border flex-shrink-0 ${CAT_BG[item.category]}`}>
                    {item.category.replace('_', ' ')}
                  </span>
                  <span className="text-xs text-white font-sans truncate">{item.foodLabel}</span>
                </div>
                <button onClick={() => removeItem(i)} className="text-[#c6c9ab] hover:text-red-400 transition-colors flex-shrink-0">
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[10px] font-mono text-[#c6c9ab] text-center py-4">Añade alimentos usando los botones de categoría.</p>
        )}
      </div>

      {/* Save */}
      <div className="flex gap-3 pt-2 sticky bottom-0 pb-4 bg-[#131313]">
        <button onClick={() => setView('list')} className="flex-1 py-3 border border-[#2a2a2a] text-[#c6c9ab] hover:text-white font-mono text-xs uppercase rounded-xl transition-all">
          Cancelar
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !form.name.trim()}
          className="flex-1 py-3 bg-[#e2ff00] text-black font-mono font-bold text-xs uppercase rounded-xl hover:bg-[#bad200] active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-2 shadow-[0_0_12px_rgba(226,255,0,0.2)]"
        >
          {saving
            ? <><span className="material-symbols-outlined text-sm animate-spin">refresh</span>Guardando...</>
            : <><span className="material-symbols-outlined text-sm">save</span>Guardar menú</>
          }
        </button>
      </div>

      {/* Food picker sheet */}
      {showPicker && (
        <div className="fixed inset-0 bg-black/85 z-[100] flex items-end justify-center p-0 md:p-4">
          <div className="bg-[#1c1b1b] border-t md:border border-[#2a2a2a] w-full max-w-lg rounded-t-2xl md:rounded-xl max-h-[80vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-[#2a2a2a] flex items-center justify-between bg-[#1c1b1b] sticky top-0 z-10">
              <div>
                <h3 className="font-sans font-bold text-lg text-white">Seleccionar alimento</h3>
                <span className="font-mono text-[10px] text-[#c6c9ab] uppercase">{CAT_LABEL[pickerCategory]} · {MODE_LABEL[activeDietMode]}</span>
              </div>
              <button onClick={() => setShowPicker(false)} className="text-white bg-[#2a2a2a] hover:bg-[#3e3e3e] p-1.5 h-8 w-8 rounded-full flex items-center justify-center transition-colors">
                <span className="material-symbols-outlined text-sm select-none">close</span>
              </button>
            </div>
            {enabledModes.length > 1 && (
              <div className="px-4 py-2 bg-[#111] border-b border-[#2a2a2a] flex gap-2 flex-wrap">
                {enabledModes.map(mode => (
                  <button key={mode} onClick={() => setActiveDietMode(mode)}
                    className={`px-3 py-1 rounded-full font-mono text-[10px] font-bold uppercase tracking-wider transition-all ${activeDietMode === mode ? 'bg-[#e2ff00] text-black' : 'bg-[#201f1f] text-[#c6c9ab] border border-[#2a2a2a]'}`}
                  >{MODE_LABEL[mode]}</button>
                ))}
              </div>
            )}
            <div className="p-3 bg-[#121212] border-b border-[#2a2a2a] flex gap-1.5 flex-wrap">
              {ALL_CATEGORIES.map(cat => (
                <button key={cat} onClick={() => setPickerCategory(cat)}
                  className={`px-3 py-1.5 rounded-full font-mono text-[10px] font-bold uppercase tracking-wider transition-all ${pickerCategory === cat ? 'bg-[#e2ff00] text-black shadow-md' : 'bg-[#201f1f] text-[#c6c9ab] border border-transparent hover:border-[#2a2a2a]'}`}
                >{cat.replace('_', ' ')}</button>
              ))}
            </div>
            <div className="px-4 py-2 bg-[#121212] flex items-center gap-2 border-b border-[#2a2a2a]">
              <span className="material-symbols-outlined text-[#c6c9ab] text-sm select-none">search</span>
              <input type="text" placeholder="Buscar alimento..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-transparent border-none text-white text-xs focus:ring-0 focus:outline-none p-2 placeholder-[#c6c9ab]/45"
              />
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
              {filteredFoods.length === 0 ? (
                <div className="text-center py-10 font-mono text-xs text-[#c6c9ab] italic">Ningún alimento coincide.</div>
              ) : filteredFoods.map(food => (
                <button key={food.id} onClick={() => addFoodFromPicker(food)}
                  className="w-full flex items-center justify-between p-3.5 bg-[#121212] hover:bg-[#201f1f] rounded-lg border border-[#2a2a2a] hover:border-[#e2ff00]/40 text-left transition-all group"
                >
                  <span className="block font-sans text-xs text-white group-hover:text-[#e2ff00] transition-colors leading-snug">{food.label}</span>
                  <span className="material-symbols-outlined text-[#c6c9ab] group-hover:text-[#e2ff00] transition-colors select-none text-base flex-shrink-0 ml-3">add_circle</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
