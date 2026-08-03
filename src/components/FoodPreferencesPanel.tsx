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
          <div className="flex gap-3 font-mono text-label">
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
            className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-black font-sans font-bold text-caption uppercase rounded-control hover:bg-accent-press active:scale-95 transition-all disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-sm">{saving ? 'progress_activity' : saved ? 'check' : 'save'}</span>
            {saving ? 'Guardando…' : saved ? 'Guardado' : 'Guardar'}
          </button>
        </div>

        {/* Allergies reminder */}
        {allergies.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 bg-amber-400/10 border border-amber-400/30 rounded-surface">
            <span className="material-symbols-outlined text-sm text-amber-400">warning</span>
            <p className="font-mono text-caption text-amber-300">
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
                className={`flex flex-col items-center gap-2 p-3 rounded-control border transition-all active:scale-95 ${
                  hasAny
                    ? 'bg-accent-bg border-accent/30 hover:border-accent/60'
                    : 'bg-surface border-hairline hover:border-hairline'
                }`}
              >
                <span className={`material-symbols-outlined text-2xl ${hasAny ? 'text-accent' : 'text-ink-3'}`}>
                  {g.icon}
                </span>
                <span className="font-mono text-caption text-ink-2 text-center leading-tight">{g.name}</span>
                {hasAny && (
                  <div className="flex gap-1.5">
                    {gFav > 0 && (
                      <span className="font-mono text-caption text-amber-400 flex items-center gap-0.5">
                        <span className="material-symbols-outlined" style={{ fontSize: '9px', fontVariationSettings: "'FILL' 1" }}>star</span>
                        {gFav}
                      </span>
                    )}
                    {gDislike > 0 && (
                      <span className="font-mono text-caption text-red-400 flex items-center gap-0.5">
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
          className="text-ink-2 hover:text-white transition-colors"
        >
          <span className="material-symbols-outlined text-base">arrow_back</span>
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-accent text-base">{activeGroup.icon}</span>
            <h3 className="font-sans font-bold text-base text-white">{activeGroup.name}</h3>
          </div>
          <div className="flex gap-3 font-mono text-caption mt-0.5">
            <span className="text-amber-400">⭐ {totalFav}</span>
            <span className="text-red-400">➖ {totalDislike}</span>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-black font-sans font-bold text-caption uppercase rounded-control hover:bg-accent-press active:scale-95 transition-all disabled:opacity-50 flex-shrink-0"
        >
          <span className="material-symbols-outlined text-sm">{saving ? 'progress_activity' : saved ? 'check' : 'save'}</span>
          {saving ? '…' : saved ? 'OK' : 'Guardar'}
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-ink-2 text-base pointer-events-none">search</span>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar alimento…"
          className="w-full bg-raised border border-hairline rounded-control pl-9 pr-4 py-2 text-label text-white placeholder-ink-3 focus:outline-none focus:border-accent/50 font-mono"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-3 hover:text-white"
          >
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        )}
      </div>

      {/* Food list */}
      <div className="divide-y divide-hairline rounded-surface overflow-hidden border border-hairline">
        {filteredFoods.length === 0 ? (
          <p className="py-6 text-center font-mono text-label text-ink-3">Sin resultados</p>
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
                  pref === 'dislike'  ? 'bg-red-500/5' : 'bg-surface'
                }`}
              >
                <span className={`flex-1 font-mono text-label ${
                  isAllergen ? 'text-amber-400 line-through' :
                  pref === 'favorite' ? 'text-white' :
                  pref === 'dislike'  ? 'text-ink-3' : 'text-ink-2'
                }`}>
                  {food}
                  {isAllergen && (
                    <span className="ml-1.5 font-mono text-caption text-amber-400 no-underline not-italic">⚠ alergia</span>
                  )}
                </span>

                {!isAllergen && (
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      onClick={() => toggle(food, 'dislike')}
                      className={`w-11 h-11 rounded-control flex items-center justify-center transition-all active:scale-90 ${
                        pref === 'dislike'
                          ? 'bg-red-500/20 border border-red-500/50 text-red-400'
                          : 'bg-raised border border-hairline text-ink-3 hover:text-red-400 hover:border-red-500/30'
                      }`}
                      title="No me gusta"
                    >
                      <span className="material-symbols-outlined text-sm">thumb_down</span>
                    </button>
                    <button
                      onClick={() => toggle(food, 'favorite')}
                      className={`w-11 h-11 rounded-control flex items-center justify-center transition-all active:scale-90 ${
                        pref === 'favorite'
                          ? 'bg-amber-400/20 border border-amber-400/50 text-amber-400'
                          : 'bg-raised border border-hairline text-ink-3 hover:text-amber-400 hover:border-amber-400/30'
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
