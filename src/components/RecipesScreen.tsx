import React, { useState, useEffect, useMemo } from 'react';
import { UserProfile, Recipe, RecipeFavorites, FoodCategory, DietMode } from '../types';
import { getRecipes, getRecipeFavorites, saveRecipeFavorites, getAthleteNutritionConfig } from '../dbService';

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

function calcExchanges(recipe: Recipe): Partial<Record<FoodCategory, number>> {
  const totals: Partial<Record<FoodCategory, number>> = {};
  for (const ing of recipe.ingredients) {
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

function RecipePlaceholder({ name, categories }: { name: string; categories: string[] }) {
  const colors = ['from-[#e2ff00]/20', 'from-blue-500/20', 'from-orange-500/20', 'from-violet-500/20'];
  const idx = name.charCodeAt(0) % colors.length;
  return (
    <div className={`w-full h-full bg-gradient-to-br ${colors[idx]} to-transparent flex items-center justify-center`}>
      <span className="material-symbols-outlined text-4xl text-[#c6c9ab]/40">skillet</span>
    </div>
  );
}

interface Props {
  profile: UserProfile;
}

export default function RecipesScreen({ profile }: Props) {
  const [recipes, setRecipes]           = useState<Recipe[]>([]);
  const [favorites, setFavorites]       = useState<RecipeFavorites>({ athleteId: profile.email, recipeIds: [] });
  const [enabledModes, setEnabledModes] = useState<DietMode[]>(['OMNIVORO']);
  const [loading, setLoading]           = useState(true);
  const [selectedCat, setSelectedCat]   = useState<string>('all');
  const [activeRecipe, setActiveRecipe] = useState<Recipe | null>(null);
  const [checkedSteps, setCheckedSteps] = useState<Record<number, boolean>>({});
  const [savingFav, setSavingFav]       = useState(false);

  useEffect(() => {
    Promise.all([
      getRecipes(),
      getRecipeFavorites(profile.email),
      getAthleteNutritionConfig(profile.email),
    ]).then(([recs, favs, nutCfg]) => {
      setRecipes(recs);
      setFavorites(favs);
      setEnabledModes(nutCfg.enabledModes);
      setLoading(false);
    });
  }, [profile.email]);

  // Deduplicate categories present across all recipes
  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    for (const r of recipes) r.categories.forEach(c => set.add(c));
    return Array.from(set);
  }, [recipes]);

  const filteredRecipes = useMemo(() => {
    if (selectedCat === 'Favoritas') return recipes.filter(r => favorites.recipeIds.includes(r.id));
    if (selectedCat === 'all') return recipes;
    return recipes.filter(r => r.categories.includes(selectedCat));
  }, [recipes, favorites, selectedCat]);

  const openRecipe = (recipe: Recipe) => {
    setActiveRecipe(recipe);
    setCheckedSteps({});
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleFavorite = async (recipeId: string) => {
    const isFav = favorites.recipeIds.includes(recipeId);
    const nextIds = isFav
      ? favorites.recipeIds.filter(id => id !== recipeId)
      : [...favorites.recipeIds, recipeId];
    const nextFavs: RecipeFavorites = { athleteId: profile.email, recipeIds: nextIds };
    setFavorites(nextFavs);
    setSavingFav(true);
    try { await saveRecipeFavorites(nextFavs); } finally { setSavingFav(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <span className="font-mono text-xs text-[#c6c9ab] uppercase tracking-widest animate-pulse">Cargando recetas…</span>
      </div>
    );
  }

  // ── DETAIL VIEW ────────────────────────────────────────────────────────────
  if (activeRecipe) {
    const exch = calcExchanges(activeRecipe);
    const isFav = favorites.recipeIds.includes(activeRecipe.id);
    // Filter ingredients by athlete's enabled modes
    const visibleIngredients = activeRecipe.ingredients.filter(ing =>
      enabledModes.includes(ing.mode)
    );

    return (
      <div className="space-y-5">
        {/* Back bar */}
        <div className="flex items-center justify-between bg-[#1c1b1b] px-4 py-3 rounded-xl border border-[#2a2a2a]">
          <button
            onClick={() => setActiveRecipe(null)}
            className="flex items-center gap-2 text-[#c6c9ab] hover:text-[#e2ff00] transition-colors font-mono text-xs uppercase tracking-wider"
          >
            <span className="material-symbols-outlined text-sm">arrow_back</span>
            Recetas
          </button>
          <button
            onClick={() => toggleFavorite(activeRecipe.id)}
            disabled={savingFav}
            className="flex items-center gap-1.5 text-xs font-mono font-bold uppercase tracking-wider transition-all disabled:opacity-50"
            style={{ color: isFav ? '#e2ff00' : '#c6c9ab' }}
          >
            <span
              className="material-symbols-outlined text-xl"
              style={{ fontVariationSettings: isFav ? "'FILL' 1" : "'FILL' 0", color: isFav ? '#e2ff00' : '#c6c9ab' }}
            >
              favorite
            </span>
            {isFav ? 'Favorita' : 'Guardar'}
          </button>
        </div>

        {/* Photo */}
        <div className="w-full aspect-[16/7] rounded-2xl overflow-hidden bg-[#1c1b1b] border border-[#2a2a2a]">
          {activeRecipe.photoUrl
            ? <img src={activeRecipe.photoUrl} alt={activeRecipe.name} className="w-full h-full object-cover" />
            : <RecipePlaceholder name={activeRecipe.name} categories={activeRecipe.categories} />
          }
        </div>

        {/* Title + exchanges */}
        <div className="space-y-3">
          <h1 className="font-sans font-black text-2xl text-white tracking-tight">{activeRecipe.name}</h1>
          {activeRecipe.categories.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {activeRecipe.categories.map(c => (
                <span key={c} className="px-2.5 py-0.5 rounded-full bg-[#2a2a2a] text-[#c6c9ab] font-mono text-[9px] uppercase tracking-wider">{c}</span>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {(Object.entries(exch) as [FoodCategory, number][])
              .filter(([, v]) => v > 0)
              .map(([cat, val]) => (
                <span key={cat} className={`px-2.5 py-1 rounded-lg border font-mono text-xs font-bold ${CAT_COLORS[cat]}`}>
                  {val} {CAT_LABELS[cat]}
                </span>
              ))
            }
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Ingredients */}
          <section className="bg-[#1c1b1b] border border-[#2a2a2a] rounded-xl p-5 space-y-3">
            <h2 className="font-sans font-bold text-sm text-white uppercase tracking-wider flex items-center gap-2">
              <span className="material-symbols-outlined text-[#e2ff00] text-base">recipe</span>
              Ingredientes
            </h2>
            {visibleIngredients.length === 0 ? (
              <p className="font-mono text-xs text-[#c6c9ab] italic">Sin ingredientes para tu modo de alimentación.</p>
            ) : (
              <ul className="space-y-1.5">
                {visibleIngredients.map((ing, idx) => (
                  <li key={idx} className="flex items-center justify-between py-1.5 border-b border-[#2a2a2a]/50 last:border-0">
                    <span className="text-xs text-white font-sans flex-1 pr-2 leading-relaxed">{ing.foodLabel}</span>
                    <span className={`font-mono text-[10px] font-bold shrink-0 ${CAT_COLORS[ing.category].split(' ')[0]}`}>
                      ×{ing.quantity}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {activeRecipe.extras.length > 0 && (
              <div className="pt-2 border-t border-[#2a2a2a]/60">
                <p className="font-mono text-[9px] text-[#c6c9ab] uppercase tracking-wider mb-1.5">Extras</p>
                <div className="flex flex-wrap gap-1.5">
                  {activeRecipe.extras.map((ex, idx) => (
                    <span key={idx} className="px-2.5 py-1 rounded-full bg-[#2a2a2a] text-[#c6c9ab] font-mono text-[10px]">{ex}</span>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Steps */}
          {activeRecipe.steps.length > 0 && (
            <section className="bg-[#1c1b1b] border border-[#2a2a2a] rounded-xl p-5 space-y-4">
              <h2 className="font-sans font-bold text-sm text-white uppercase tracking-wider flex items-center gap-2">
                <span className="material-symbols-outlined text-[#e2ff00] text-base">format_list_numbered</span>
                Preparación
              </h2>
              <div className="space-y-4">
                {activeRecipe.steps.map((step, idx) => {
                  const done = !!checkedSteps[idx];
                  return (
                    <div
                      key={idx}
                      onClick={() => setCheckedSteps(prev => ({ ...prev, [idx]: !prev[idx] }))}
                      className="flex gap-3 group cursor-pointer"
                    >
                      <div className="flex flex-col items-center shrink-0">
                        <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center font-mono text-[11px] font-bold transition-all ${done ? 'bg-[#e2ff00] border-[#e2ff00] text-black' : 'border-[#2a2a2a] text-[#c6c9ab] group-hover:border-[#e2ff00]/50'}`}>
                          {done ? <span className="material-symbols-outlined text-xs font-bold">check</span> : idx + 1}
                        </div>
                        {idx < activeRecipe.steps.length - 1 && (
                          <div className="w-px flex-1 bg-[#2a2a2a] mt-1.5"></div>
                        )}
                      </div>
                      <p className={`text-xs font-sans leading-relaxed pt-1 pb-3 transition-colors ${done ? 'text-[#c6c9ab]/50 line-through' : 'text-[#c6c9ab]'}`}>
                        {step}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </div>
    );
  }

  // ── GALLERY VIEW ───────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-sans font-extrabold text-3xl tracking-tight text-white">Recetas</h1>
        <p className="text-[#c6c9ab] text-sm mt-1">
          {recipes.length === 0
            ? 'Tu entrenador todavía no ha publicado recetas.'
            : `${recipes.length} receta${recipes.length !== 1 ? 's' : ''} disponible${recipes.length !== 1 ? 's' : ''}`
          }
        </p>
      </div>

      {/* Category filter pills */}
      {recipes.length > 0 && (
        <div className="w-full overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
          <div className="flex gap-2 w-max">
            {[
              { id: 'all',       name: 'Todas' },
              { id: 'Favoritas', name: '❤ Favoritas' },
              ...availableCategories.map(c => ({ id: c, name: c })),
            ].map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCat(cat.id)}
                className={`px-4 py-2 rounded-full font-mono text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-all ${
                  selectedCat === cat.id
                    ? 'bg-[#e2ff00] text-black shadow-md'
                    : 'bg-[#1c1b1b] border border-[#2a2a2a] text-[#c6c9ab] hover:border-[#c6c9ab]/40 hover:text-white'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Gallery */}
      {filteredRecipes.length === 0 ? (
        <div className="text-center py-24 text-[#c6c9ab] font-mono text-xs uppercase tracking-widest select-none">
          {selectedCat === 'Favoritas' ? 'Aún no tienes favoritas.' : 'No hay recetas en esta categoría.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
          {/* Featured card */}
          <RecipeCard
            recipe={filteredRecipes[0]}
            isFav={favorites.recipeIds.includes(filteredRecipes[0].id)}
            onOpen={openRecipe}
            onToggleFav={toggleFavorite}
            large
          />
          {/* Rest */}
          {filteredRecipes.slice(1).map(recipe => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              isFav={favorites.recipeIds.includes(recipe.id)}
              onOpen={openRecipe}
              onToggleFav={toggleFavorite}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Card subcomponent ────────────────────────────────────────────────────────

interface CardProps {
  recipe: Recipe;
  isFav: boolean;
  large?: boolean;
  onOpen: (r: Recipe) => void;
  onToggleFav: (id: string) => void;
  key?: React.Key;
}

function RecipeCard({ recipe, isFav, large = false, onOpen, onToggleFav }: CardProps) {
  const exchStr = formatExchanges(calcExchanges(recipe));
  const colSpan = large ? 'col-span-1 md:col-span-8' : 'col-span-1 md:col-span-4';
  const minH    = large ? 'min-h-[300px] md:min-h-[360px]' : 'min-h-[220px] md:min-h-[280px]';

  return (
    <article
      onClick={() => onOpen(recipe)}
      className={`${colSpan} group relative rounded-2xl overflow-hidden bg-[#1c1b1b] border border-[#2a2a2a] ${minH} flex flex-col justify-end cursor-pointer hover:border-[#e2ff00]/40 transition-all shadow-md`}
    >
      {/* Background */}
      {recipe.photoUrl
        ? <img src={recipe.photoUrl} alt={recipe.name} className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:scale-105 transition-transform duration-500" />
        : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#e2ff00]/10 to-[#1c1b1b] flex items-center justify-center">
            <span className="material-symbols-outlined text-6xl text-[#c6c9ab]/20">skillet</span>
          </div>
        )
      }
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent"></div>

      {/* Favorite button */}
      <button
        onClick={e => { e.stopPropagation(); onToggleFav(recipe.id); }}
        className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center hover:bg-black/70 transition-colors z-10"
      >
        <span
          className="material-symbols-outlined text-base"
          style={{ fontVariationSettings: isFav ? "'FILL' 1" : "'FILL' 0", color: isFav ? '#e2ff00' : '#c6c9ab' }}
        >
          favorite
        </span>
      </button>

      {/* Content */}
      <div className="relative z-10 p-4 space-y-2">
        {recipe.categories.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {recipe.categories.slice(0, 2).map(c => (
              <span key={c} className="px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-sm text-[#c6c9ab] font-mono text-[8px] uppercase tracking-wider border border-[#2a2a2a]">{c}</span>
            ))}
          </div>
        )}
        <h3 className={`font-sans font-black text-white group-hover:text-[#e2ff00] transition-colors leading-tight ${large ? 'text-2xl' : 'text-base'}`}>
          {recipe.name}
        </h3>
        {exchStr !== '—' && (
          <p className="font-mono text-[10px] text-[#e2ff00]/80 font-bold">{exchStr}</p>
        )}
      </div>
    </article>
  );
}
