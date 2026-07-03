import React, { useState, useMemo } from 'react';
import { FOOD_GROUPS, FoodGroup } from '../data/alimentos_anamnesis';
import { updateOnboardingFoods } from '../dbService';

// ── Types ─────────────────────────────────────────────────────────────────────

type FoodPref = 'neutral' | 'dislike' | 'favorite';

interface Props {
  athleteEmail: string;
  initialLiked: string[];
  initialDisliked: string[];
  allergies?: string[];
  onSaved?: (liked: string[], disliked: string[]) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function FoodPreferencesPanel({
  athleteEmail,
  initialLiked,
  initialDisliked,
  allergies = [],
  onSaved,
}: Props) {
  const [prefs, setPrefs] = useState<Record<string, FoodPref>>(() => {
    const init: Record<string, FoodPref> = {};
    for (const f of initialLiked)   init[f] = 'favorite';
    for (const f of initialDisliked) init[f] = 'dislike';
    return init;
  });
  const [activeGroup, setActiveGroup] = useState<FoodGroup | null>(null);
  const [search,      setSearch]      = useState('');
  const [saving,      setSaving]      = useState(false);
  const [saved,       setSaved]       = useState(false);

  const totalFav      = Object.values(prefs).filter(v => v === 'favorite').length;
  const totalDislike  = Object.values(prefs).filter(v => v === 'dislike').length;

  const filteredFoods = useMemo(() => {
    if (!activeGroup) return [];
    const q = search.toLowerCase().trim();
    return q
      ? activeGroup.foods.filter(f => f.toLowerCase().includes(q))
      : activeGroup.foods;
  }, [activeGroup, search]);

  const toggle = (food: string, state: 'dislike' | 'favorite') => {
    setPrefs(prev => {
      const cur = prev[food] ?? 'neutral';
      return { ...prev, [food]: cur === state ? 'neutral' : state };
    });
    setSaved(false);
  };

  const handleSave = async () => {
    const liked    = Object.entries(prefs).filter(([, v]) => v === 'favorite').map(([k]) => k);
    const disliked = Object.entries(prefs).filter(([, v]) => v === 'dislike').map(([k]) => k);
    setSaving(true);
    try {
      await updateOnboardingFoods(athleteEmail, liked, disliked);
      setSaved(true);
      onSaved?.(liked, disliked);
    } finally {
      setSaving(false);
    }
  };

  // ── RENDER: Screen A — Group grid ─────────────────────────────────────────

  if (!activeGroup) {
    return (
      <div className="space-y-4">
        {/* Global counter */}
        <div className="flex items-center justify-between">
          <div className="flex gap-3 font-mono text-xs">
            <span className="flex items-center gap-1 text-amber-400">
              <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
              Favoritos ({totalFav})
            </span>
            <span className="flex items-center gap-1 text-red-400">
              <span className="material-symbols-outlined text-sm">thumb_down</span>
              No quiero ({totalDislike})
            </span>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#fbcb1a] text-black font-mono font-bold text-[10px] uppercase rounded-lg hover:bg-[#d4a800] active:scale-95 transition-all disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-sm">{saving ? 'progress_activity' : saved ? 'check' : 'save'}</span>
            {saving ? 'Guardando…' : saved ? 'Guardado' : 'Guardar'}
          </button>
        </div>

        {/* Allergies reminder */}
        {allergies.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 bg-amber-400/10 border border-amber-400/30 rounded-lg">
            <span className="material-symbols-outlined text-sm text-amber-400">warning</span>
            <p className="font-mono text-[10px] text-amber-300">
              Alergias/intolerancias: {allergies.join(', ')} — gestionadas en la ficha.
            </p>
          </div>
        )}

        {/* Group tiles */}
        <div className="grid grid-cols-3 gap-2.5">
          {FOOD_GROUPS.map(g => {
            const gFav     = g.foods.filter(f => prefs[f] === 'favorite').length;
            const gDislike = g.foods.filter(f => prefs[f] === 'dislike').length;
            const hasAny   = gFav > 0 || gDislike > 0;

            return (
              <button
                key={g.id}
                onClick={() => { setActiveGroup(g); setSearch(''); }}
                className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all active:scale-95 ${
                  hasAny
                    ? 'bg-[#1a1c12] border-[#fbcb1a]/30 hover:border-[#fbcb1a]/60'
                    : 'bg-[#181816] border-white/7 hover:border-[#3a3a3a]'
                }`}
              >
                <span className={`material-symbols-outlined text-2xl ${hasAny ? 'text-[#fbcb1a]' : 'text-[#555]'}`}>
                  {g.icon}
                </span>
                <span className="font-mono text-[9px] text-[#c6c9ab] text-center leading-tight">{g.name}</span>
                {hasAny && (
                  <div className="flex gap-1.5">
                    {gFav > 0 && (
                      <span className="font-mono text-[8px] text-amber-400 flex items-center gap-0.5">
                        <span className="material-symbols-outlined" style={{ fontSize: '9px', fontVariationSettings: "'FILL' 1" }}>star</span>
                        {gFav}
                      </span>
                    )}
                    {gDislike > 0 && (
                      <span className="font-mono text-[8px] text-red-400 flex items-center gap-0.5">
                        <span className="material-symbols-outlined" style={{ fontSize: '9px' }}>thumb_down</span>
                        {gDislike}
                      </span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── RENDER: Screen B — Food list for a group ──────────────────────────────

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setActiveGroup(null)}
          className="text-[#c6c9ab] hover:text-white transition-colors"
        >
          <span className="material-symbols-outlined text-base">arrow_back</span>
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#fbcb1a] text-base">{activeGroup.icon}</span>
            <h3 className="font-sans font-bold text-sm text-white">{activeGroup.name}</h3>
          </div>
          <div className="flex gap-3 font-mono text-[10px] mt-0.5">
            <span className="text-amber-400">⭐ {totalFav}</span>
            <span className="text-red-400">➖ {totalDislike}</span>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#fbcb1a] text-black font-mono font-bold text-[10px] uppercase rounded-lg hover:bg-[#d4a800] active:scale-95 transition-all disabled:opacity-50 flex-shrink-0"
        >
          <span className="material-symbols-outlined text-sm">{saving ? 'progress_activity' : saved ? 'check' : 'save'}</span>
          {saving ? '…' : saved ? 'OK' : 'Guardar'}
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#c6c9ab] text-base pointer-events-none">search</span>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar alimento…"
          className="w-full bg-[#1c1b1b] border border-white/7 rounded-lg pl-9 pr-4 py-2 text-xs text-white placeholder-[#555] focus:outline-none focus:border-[#fbcb1a]/50 font-mono"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#555] hover:text-white"
          >
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        )}
      </div>

      {/* Food list */}
      <div className="divide-y divide-[#1e1e1e] rounded-xl overflow-hidden border border-white/7">
        {filteredFoods.length === 0 ? (
          <p className="py-6 text-center font-mono text-xs text-[#555]">Sin resultados</p>
        ) : (
          filteredFoods.map(food => {
            const pref    = prefs[food] ?? 'neutral';
            const isAllergen = allergies.some(
              a => a.toLowerCase().includes(food.toLowerCase()) || food.toLowerCase().includes(a.toLowerCase()),
            );

            return (
              <div
                key={food}
                className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                  pref === 'favorite' ? 'bg-amber-400/5' :
                  pref === 'dislike'  ? 'bg-red-500/5' : 'bg-[#181816]'
                }`}
              >
                <span className={`flex-1 font-mono text-xs ${
                  isAllergen ? 'text-amber-400 line-through' :
                  pref === 'favorite' ? 'text-white' :
                  pref === 'dislike'  ? 'text-[#888]' : 'text-[#c6c9ab]'
                }`}>
                  {food}
                  {isAllergen && (
                    <span className="ml-1.5 font-mono text-[9px] text-amber-400 no-underline not-italic">⚠ alergia</span>
                  )}
                </span>

                {!isAllergen && (
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      onClick={() => toggle(food, 'dislike')}
                      className={`w-11 h-11 rounded-lg flex items-center justify-center transition-all active:scale-90 ${
                        pref === 'dislike'
                          ? 'bg-red-500/20 border border-red-500/50 text-red-400'
                          : 'bg-[#1c1b1b] border border-white/7 text-[#444] hover:text-red-400 hover:border-red-500/30'
                      }`}
                      title="No me gusta"
                    >
                      <span className="material-symbols-outlined text-sm">thumb_down</span>
                    </button>
                    <button
                      onClick={() => toggle(food, 'favorite')}
                      className={`w-11 h-11 rounded-lg flex items-center justify-center transition-all active:scale-90 ${
                        pref === 'favorite'
                          ? 'bg-amber-400/20 border border-amber-400/50 text-amber-400'
                          : 'bg-[#1c1b1b] border border-white/7 text-[#444] hover:text-amber-400 hover:border-amber-400/30'
                      }`}
                      title="Favorito"
                    >
                      <span
                        className="material-symbols-outlined text-sm"
                        style={{ fontVariationSettings: pref === 'favorite' ? "'FILL' 1" : "'FILL' 0" }}
                      >star</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
