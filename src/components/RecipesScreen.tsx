import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  UserProfile, Recipe, RecipeFavorites, FoodCategory, DietMode,
} from '../types';
import {
  getRecipes, getRecipeFavorites, saveRecipeFavorites,
  getAthleteNutritionConfig, queryIndyaRecipes, getOnboarding,
} from '../dbService';
import type { IndyaRecipeCursor } from '../dbService';
import { classifyRecipe } from '../utils/foodPrefs';

// ── Exchange helpers ──────────────────────────────────────────────────────────

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
  if (recipe.exchanges) {
    const { HC, PROT, GRASA } = recipe.exchanges;
    const result: Partial<Record<FoodCategory, number>> = {};
    if (HC    > 0) result.HC    = HC;
    if (PROT  > 0) result.PROT  = PROT;
    if (GRASA > 0) result.GRASA = GRASA;
    return result;
  }
  const totals: Partial<Record<FoodCategory, number>> = {};
  for (const ing of recipe.ingredients ?? []) {
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

// ── Constants ─────────────────────────────────────────────────────────────────

const INDYA_CATS = [
  'Todas',
  'Platos salados / principales',
  'Desayuno y dulces',
  'Bebidas',
  'Suplementos deportivos',
];

const INTAKE_LABELS: Record<number, string> = {
  1: 'Desayuno',
  2: 'Media mañana',
  3: 'Comida',
  4: 'Merienda',
  5: 'Cena',
};

const PAGE_SIZE = 24;

// ── Sub-components ────────────────────────────────────────────────────────────

function RecipePlaceholder() {
  return (
    <div className="w-full h-full bg-gradient-to-br from-[#fbcb1a]/10 to-transparent flex items-center justify-center">
      <span className="material-symbols-outlined text-4xl text-[#c6c9ab]/30">skillet</span>
    </div>
  );
}

interface CardProps {
  recipe: Recipe;
  isFav: boolean;
  large?: boolean;
  isFeatured?: boolean;
  onOpen: (r: Recipe) => void;
  onToggleFav: (id: string) => Promise<void> | void;
  key?: React.Key;
}

function RecipeCard({ recipe, isFav, large = false, onOpen, onToggleFav }: CardProps) {
  const exchStr = formatExchanges(calcExchanges(recipe));
  const photo = recipe.image ?? recipe.photoUrl;
  const colSpan = large ? 'col-span-1 md:col-span-8' : 'col-span-1 md:col-span-4';
  const minH    = large ? 'min-h-[300px] md:min-h-[360px]' : 'min-h-[220px] md:min-h-[280px]';
  const tags = recipe.categoria ? [recipe.categoria] : recipe.categories.slice(0, 2);

  return (
    <article
      onClick={() => onOpen(recipe)}
      className={`${colSpan} group relative rounded-2xl overflow-hidden bg-[#1c1b1b] border border-white/7 ${minH} flex flex-col justify-end cursor-pointer hover:border-[#fbcb1a]/40 transition-all shadow-md`}
    >
      {photo
        ? <img src={photo} alt={recipe.name} className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:scale-105 transition-transform duration-500" />
        : <div className="absolute inset-0"><RecipePlaceholder /></div>
      }
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

      <button
        onClick={e => { e.stopPropagation(); onToggleFav(recipe.id); }}
        className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center hover:bg-black/70 transition-colors z-10"
      >
        <span
          className="material-symbols-outlined text-base"
          style={{ fontVariationSettings: isFav ? "'FILL' 1" : "'FILL' 0", color: isFav ? '#fbcb1a' : '#c6c9ab' }}
        >favorite</span>
      </button>

      <div className="relative z-10 p-4 space-y-2">
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tags.map(c => (
              <span key={c} className="px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-sm text-[#c6c9ab] font-mono text-[8px] uppercase tracking-wider border border-white/7">{c}</span>
            ))}
          </div>
        )}
        <h3 className={`font-sans font-black text-white group-hover:text-[#fbcb1a] transition-colors leading-tight ${large ? 'text-2xl' : 'text-base'}`}>
          {recipe.name}
        </h3>
        {exchStr !== '—' && (
          <p className="font-mono text-[10px] text-[#fbcb1a]/80 font-bold">{exchStr}</p>
        )}
      </div>
    </article>
  );
}

// Compact card used in the Indya paginated grid (image-forward, tighter)
function IndyaCard({ recipe, isFav, isFeatured, onOpen, onToggleFav }: Omit<CardProps, 'large'>) {
  const photo = recipe.image ?? recipe.photoUrl;
  const exch = recipe.exchanges;

  return (
    <article
      onClick={() => onOpen(recipe)}
      className={`group relative rounded-xl overflow-hidden bg-[#1c1b1b] border aspect-[4/5] flex flex-col justify-end cursor-pointer transition-all ${
        isFeatured
          ? 'border-amber-400/40 hover:border-amber-400/70'
          : 'border-white/7 hover:border-[#fbcb1a]/40'
      }`}
    >
      {photo
        ? <img src={photo} alt={recipe.name} className="absolute inset-0 w-full h-full object-cover opacity-70 group-hover:scale-105 transition-transform duration-500" />
        : <div className="absolute inset-0 bg-gradient-to-br from-[#1e1e1e] to-[#121212] flex items-center justify-center">
            <span className="material-symbols-outlined text-5xl text-[#2a2a2a]">skillet</span>
          </div>
      }
      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/50 to-transparent" />

      <button
        onClick={e => { e.stopPropagation(); onToggleFav(recipe.id); }}
        className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 flex items-center justify-center z-10"
      >
        <span className="material-symbols-outlined text-sm"
          style={{ fontVariationSettings: isFav ? "'FILL' 1" : "'FILL' 0", color: isFav ? '#fbcb1a' : '#c6c9ab' }}
        >favorite</span>
      </button>

      {/* kcal or featured badge */}
      {isFeatured ? (
        <div className="absolute top-2 left-2 bg-amber-400/90 rounded px-1.5 py-0.5 font-mono text-[9px] text-black font-bold z-10 flex items-center gap-0.5">
          <span className="material-symbols-outlined" style={{ fontSize: '9px', fontVariationSettings: "'FILL' 1" }}>star</span>
          Para ti
        </div>
      ) : recipe.kcal ? (
        <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm rounded px-1.5 py-0.5 font-mono text-[9px] text-[#c6c9ab] z-10">
          {recipe.kcal} kcal
        </div>
      ) : null}

      <div className="relative z-10 p-3 space-y-1">
        <p className="font-sans font-bold text-white text-xs leading-tight line-clamp-2">{recipe.name}</p>
        {exch && (exch.HC > 0 || exch.PROT > 0 || exch.GRASA > 0) && (
          <p className="font-mono text-[9px] text-[#fbcb1a]/75">
            {[exch.HC > 0 && `${exch.HC}HC`, exch.PROT > 0 && `${exch.PROT}P`, exch.GRASA > 0 && `${exch.GRASA}G`]
              .filter(Boolean).join(' · ')}
          </p>
        )}
        <div className="flex flex-wrap gap-1 pt-0.5">
          {recipe.cookingTime && (
            <span className="flex items-center gap-0.5 font-mono text-[9px] text-[#c6c9ab]">
              <span className="material-symbols-outlined" style={{ fontSize: '10px' }}>schedule</span>
              {recipe.cookingTime}min
            </span>
          )}
          {recipe.tupper && (
            <span className="font-mono text-[9px] text-[#00eefc]">tupper</span>
          )}
        </div>
      </div>
    </article>
  );
}

// ── Detail view ───────────────────────────────────────────────────────────────

interface DetailProps {
  recipe: Recipe;
  isFav: boolean;
  isDisliked: boolean;
  enabledModes: DietMode[];
  savingFav: boolean;
  onBack: () => void;
  onToggleFav: (id: string) => void;
  onToggleDislike: (id: string) => void;
  onAddToIntercambios?: (recipe: Recipe) => void;
}

function RecipeDetail({ recipe, isFav, isDisliked, enabledModes, savingFav, onBack, onToggleFav, onToggleDislike, onAddToIntercambios }: DetailProps) {
  const [checkedSteps, setCheckedSteps] = useState<Record<number, boolean>>({});
  const isIndya = recipe.ownerId === 'indya';
  const exch = calcExchanges(recipe);
  const photo = recipe.image ?? recipe.photoUrl;

  const visibleIngredients = isIndya
    ? []
    : (recipe.ingredients ?? []).filter(ing => enabledModes.includes(ing.mode));

  return (
    <div className="space-y-5">
      {/* Back bar */}
      <div className="flex items-center justify-between bg-[#1c1b1b] px-4 py-3 rounded-xl border border-white/7">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-[#c6c9ab] hover:text-[#fbcb1a] transition-colors font-mono text-xs uppercase tracking-wider"
        >
          <span className="material-symbols-outlined text-sm">arrow_back</span>
          Recetas
        </button>
        <div className="flex items-center gap-4">
          {onAddToIntercambios && (
            <button
              onClick={() => onAddToIntercambios(recipe)}
              className="flex items-center gap-1.5 text-xs font-mono font-bold uppercase tracking-wider text-[#00eefc] hover:text-white transition-all"
            >
              <span className="material-symbols-outlined text-xl">playlist_add</span>
              Añadir a Intercambios
            </button>
          )}
          <button
            onClick={() => onToggleFav(recipe.id)}
            disabled={savingFav}
            className="flex items-center gap-1.5 text-xs font-mono font-bold uppercase tracking-wider transition-all disabled:opacity-50"
            style={{ color: isFav ? '#fbcb1a' : '#c6c9ab' }}
          >
            <span
              className="material-symbols-outlined text-xl"
              style={{ fontVariationSettings: isFav ? "'FILL' 1" : "'FILL' 0", color: isFav ? '#fbcb1a' : '#c6c9ab' }}
            >favorite</span>
            {isFav ? 'Favorita' : 'Guardar'}
          </button>
          <button
            onClick={() => onToggleDislike(recipe.id)}
            disabled={savingFav}
            title={isDisliked ? 'Quitar el "no me gusta"' : 'No me gusta — que no salga en mis menús'}
            className="flex items-center gap-1.5 text-xs font-mono font-bold uppercase tracking-wider transition-all disabled:opacity-50"
            style={{ color: isDisliked ? '#f87171' : '#c6c9ab' }}
          >
            <span
              className="material-symbols-outlined text-xl"
              style={{ fontVariationSettings: isDisliked ? "'FILL' 1" : "'FILL' 0" }}
            >thumb_down</span>
          </button>
        </div>
      </div>

      {/* Photo */}
      <div className="w-full aspect-[16/7] rounded-2xl overflow-hidden bg-[#1c1b1b] border border-white/7">
        {photo
          ? <img src={photo} alt={recipe.name} className="w-full h-full object-cover" />
          : <RecipePlaceholder />
        }
      </div>

      {/* Title + metadata */}
      <div className="space-y-3">
        <h1 className="font-sans font-black text-2xl text-white tracking-tight">{recipe.name}</h1>

        {/* Indya metadata row */}
        {isIndya && (
          <div className="flex flex-wrap gap-3 text-[#c6c9ab] font-mono text-[10px]">
            {recipe.kcal != null && (
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[#fbcb1a]" style={{ fontSize: '12px' }}>local_fire_department</span>
                {recipe.kcal} kcal
              </span>
            )}
            {recipe.cookingTime != null && (
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>schedule</span>
                {recipe.cookingTime} min
              </span>
            )}
            {recipe.weight != null && (
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>scale</span>
                {recipe.weight} g
              </span>
            )}
            {recipe.difficulty != null && (
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>signal_cellular_alt</span>
                {'★'.repeat(recipe.difficulty)}{'☆'.repeat(3 - recipe.difficulty)}
              </span>
            )}
            {recipe.tupper && (
              <span className="flex items-center gap-1 text-[#00eefc]">
                <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>takeout_dining</span>
                apto tupper
              </span>
            )}
          </div>
        )}

        {/* Category tags */}
        {(recipe.categoria || recipe.categories.length > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {(recipe.categoria ? [recipe.categoria] : recipe.categories).map(c => (
              <span key={c} className="px-2.5 py-0.5 rounded-full bg-[#2a2a2a] text-[#c6c9ab] font-mono text-[10px] uppercase tracking-wider">{c}</span>
            ))}
          </div>
        )}

        {/* Intake type tags (Indya) */}
        {isIndya && recipe.intakeTypes && recipe.intakeTypes.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {recipe.intakeTypes.map(t => (
              <span key={t} className="px-2 py-0.5 rounded-full bg-[#1e1e1e] border border-white/7 text-[#c6c9ab] font-mono text-[9px]">
                {INTAKE_LABELS[t] ?? `Tipo ${t}`}
              </span>
            ))}
          </div>
        )}

        {/* Exchange badges */}
        <div className="flex flex-wrap gap-2">
          {(Object.entries(exch) as [FoodCategory, number][])
            .filter(([, v]) => v > 0)
            .map(([cat, val]) => (
              <span key={cat} className={`px-2.5 py-1 rounded-lg border font-mono text-xs font-bold ${CAT_COLORS[cat]}`}>
                {val} {CAT_LABELS[cat]}
              </span>
            ))}
        </div>

        {/* Indya macros breakdown */}
        {isIndya && recipe.macros && (
          <div className="grid grid-cols-3 gap-2 bg-[#1e1e1e] border border-white/7 rounded-lg p-3">
            {[
              { label: 'Carbos', val: recipe.macros.carb },
              { label: 'Proteína', val: recipe.macros.prot },
              { label: 'Grasa', val: recipe.macros.fat },
            ].map(({ label, val }) => (
              <div key={label} className="text-center">
                <span className="block font-mono text-[9px] text-[#c6c9ab] uppercase">{label}</span>
                <span className="block font-bold text-white text-sm font-mono">{val}g</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Ingredients */}
        <section className="bg-[#1c1b1b] border border-white/7 rounded-xl p-5 space-y-3">
          <h2 className="font-sans font-bold text-sm text-white uppercase tracking-wider flex items-center gap-2">
            <span className="material-symbols-outlined text-[#fbcb1a] text-base">recipe</span>
            Ingredientes
          </h2>

          {isIndya && recipe.ingredientsText && recipe.ingredientsText.length > 0 ? (
            <ul className="space-y-1.5">
              {recipe.ingredientsText.map((ing, idx) => (
                <li key={idx} className="flex items-center justify-between py-1.5 border-b border-white/50 last:border-0">
                  <span className="text-xs text-white font-sans flex-1 pr-2 leading-relaxed">{ing.name}</span>
                  <span className="font-mono text-[10px] text-[#c6c9ab] shrink-0">{ing.quantity}g</span>
                </li>
              ))}
            </ul>
          ) : !isIndya && visibleIngredients.length > 0 ? (
            <ul className="space-y-1.5">
              {visibleIngredients.map((ing, idx) => (
                <li key={idx} className="flex items-center justify-between py-1.5 border-b border-white/50 last:border-0">
                  <span className="text-xs text-white font-sans flex-1 pr-2 leading-relaxed">{ing.foodLabel}</span>
                  <span className={`font-mono text-[10px] font-bold shrink-0 ${CAT_COLORS[ing.category].split(' ')[0]}`}>
                    ×{ing.quantity}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="font-mono text-xs text-[#c6c9ab] italic">Sin ingredientes disponibles.</p>
          )}

          {!isIndya && recipe.extras.length > 0 && (
            <div className="pt-2 border-t border-white/60">
              <p className="font-mono text-[9px] text-[#c6c9ab] uppercase tracking-wider mb-1.5">Extras</p>
              <div className="flex flex-wrap gap-1.5">
                {recipe.extras.map((ex, idx) => (
                  <span key={idx} className="px-2.5 py-1 rounded-full bg-[#2a2a2a] text-[#c6c9ab] font-mono text-[10px]">{ex}</span>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Steps */}
        {((isIndya && recipe.stepsText && recipe.stepsText.length > 0) ||
          (!isIndya && recipe.steps.length > 0)) && (
          <section className="bg-[#1c1b1b] border border-white/7 rounded-xl p-5 space-y-4">
            <h2 className="font-sans font-bold text-sm text-white uppercase tracking-wider flex items-center gap-2">
              <span className="material-symbols-outlined text-[#fbcb1a] text-base">format_list_numbered</span>
              Preparación
            </h2>
            <div className="space-y-4">
              {(isIndya
                ? (recipe.stepsText ?? []).map((s, i) => ({ idx: i, text: s.description }))
                : recipe.steps.map((s, i) => ({ idx: i, text: s }))
              ).map(({ idx, text }) => {
                const done = !!checkedSteps[idx];
                return (
                  <div
                    key={idx}
                    onClick={() => setCheckedSteps(prev => ({ ...prev, [idx]: !prev[idx] }))}
                    className="flex gap-3 group cursor-pointer"
                  >
                    <div className="flex flex-col items-center shrink-0">
                      <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center font-mono text-[11px] font-bold transition-all ${done ? 'bg-[#fbcb1a] border-[#fbcb1a] text-black' : 'border-white/7 text-[#c6c9ab] group-hover:border-[#fbcb1a]/50'}`}>
                        {done ? <span className="material-symbols-outlined text-xs font-bold">check</span> : idx + 1}
                      </div>
                    </div>
                    <p className={`text-xs font-sans leading-relaxed pt-1 pb-3 transition-colors ${done ? 'text-[#c6c9ab]/50 line-through' : 'text-[#c6c9ab]'}`}>
                      {text}
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

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  profile: UserProfile;
  onAddToIntercambios?: (recipe: Recipe) => void;
}

export default function RecipesScreen({ profile, onAddToIntercambios }: Props) {
  // Coach/athlete recipes
  const [recipes, setRecipes]           = useState<Recipe[]>([]);
  const [favorites, setFavorites]       = useState<RecipeFavorites>({ athleteId: profile.email, recipeIds: [] });
  const [enabledModes, setEnabledModes] = useState<DietMode[]>(['OMNIVORO']);
  const [loading, setLoading]           = useState(true);
  const [selectedCat, setSelectedCat]   = useState<string>('all');

  // Food preferences (from onboarding)
  const [prefs, setPrefs] = useState<{ liked: string[]; disliked: string[]; allergies: string[] }>({
    liked: [], disliked: [], allergies: [],
  });
  const [showDislikedSection, setShowDislikedSection] = useState(false);

  // Indya browser
  const [indyaCat, setIndyaCat]         = useState<string>('Todas');
  const [indyaIntake, setIndyaIntake]   = useState<number | null>(null);
  const [indyaSearch, setIndyaSearch]   = useState('');
  const [indyaRecipes, setIndyaRecipes] = useState<Recipe[]>([]);
  const [indyaCursor, setIndyaCursor]   = useState<IndyaRecipeCursor | null>(null);
  const [indyaHasMore, setIndyaHasMore] = useState(false);
  const [indyaLoading, setIndyaLoading] = useState(true);
  const [indyaLoadingMore, setIndyaLoadingMore] = useState(false);
  const [indyaError, setIndyaError] = useState<string | null>(null);

  // Detail
  const [activeRecipe, setActiveRecipe] = useState<Recipe | null>(null);
  const [savingFav, setSavingFav]       = useState(false);

  // ── Initial load ────────────────────────────────────────────────────────────

  useEffect(() => {
    Promise.all([
      getRecipes(),
      getRecipeFavorites(profile.email),
      getAthleteNutritionConfig(profile.email),
      getOnboarding(profile.email),
    ]).then(([recs, favs, nutCfg, ob]) => {
      setRecipes(recs);
      setFavorites(favs);
      setEnabledModes(nutCfg.enabledModes);
      if (ob) {
        setPrefs({
          liked:     ob.likedFoods     ?? [],
          disliked:  ob.dislikedFoods  ?? [],
          allergies: ob.allergies      ?? [],
        });
      }
      setLoading(false);
    });
  }, [profile.email]);

  // ── Indya paginated load ────────────────────────────────────────────────────

  const loadIndya = useCallback(async (
    cat: string,
    intake: number | null,
    cursor: IndyaRecipeCursor | null,
    append: boolean,
  ) => {
    const filters = {
      categoria: cat === 'Todas' ? undefined : cat,
      intakeType: intake ?? undefined,
    };
    try {
      const result = await queryIndyaRecipes(filters, cursor);
      setIndyaRecipes(prev => append ? [...prev, ...result.recipes] : result.recipes);
      setIndyaCursor(result.cursor);
      setIndyaHasMore(result.hasMore);
      setIndyaError(null);
    } catch (err) {
      console.warn('queryIndyaRecipes failed:', err);
      setIndyaError('No se pudieron cargar las recetas. Reintenta.');
      // Keep hasMore true so the retry button stays visible; cursor is left
      // untouched so retrying repeats the same (failed) page.
      setIndyaHasMore(true);
    }
  }, []);

  // Reset and reload when filters change
  useEffect(() => {
    setIndyaLoading(true);
    setIndyaSearch('');
    loadIndya(indyaCat, indyaIntake, null, false).finally(() => setIndyaLoading(false));
  }, [indyaCat, indyaIntake, loadIndya]);

  const handleLoadMore = useCallback(async () => {
    setIndyaLoadingMore(true);
    await loadIndya(indyaCat, indyaIntake, indyaCursor, true);
    setIndyaLoadingMore(false);
  }, [loadIndya, indyaCat, indyaIntake, indyaCursor]);

  // ── Derived data ────────────────────────────────────────────────────────────

  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    for (const r of recipes) r.categories.forEach(c => set.add(c));
    return Array.from(set);
  }, [recipes]);

  const filteredRecipes = useMemo(() => {
    if (selectedCat === 'Favoritas') return recipes.filter(r => favorites.recipeIds.includes(r.id));
    if (selectedCat === 'MisRecetas') return recipes.filter(r => r.ownerId === profile.userId);
    if (selectedCat === 'all') return recipes;
    return recipes.filter(r => r.categories.includes(selectedCat));
  }, [recipes, favorites, selectedCat, profile.userId]);

  const { indyaFeatured, indyaNormal, indyaDisliked, indyaTotalVisible } = useMemo(() => {
    const searched = indyaSearch.trim()
      ? indyaRecipes.filter(r => r.name.toLowerCase().includes(indyaSearch.toLowerCase()))
      : indyaRecipes;

    const hasPrefs = prefs.liked.length > 0 || prefs.disliked.length > 0 || prefs.allergies.length > 0;
    if (!hasPrefs) {
      return { indyaFeatured: [], indyaNormal: searched, indyaDisliked: [], indyaTotalVisible: searched.length };
    }

    const featured: Recipe[] = [], normal: Recipe[] = [], disliked: Recipe[] = [];
    for (const r of searched) {
      const cls = classifyRecipe(r, prefs.liked, prefs.disliked, prefs.allergies);
      if (cls === 'allergy')   continue;
      if (cls === 'featured')  featured.push(r);
      else if (cls === 'disliked') disliked.push(r);
      else normal.push(r);
    }
    return {
      indyaFeatured: featured,
      indyaNormal:   normal,
      indyaDisliked: disliked,
      indyaTotalVisible: featured.length + normal.length + disliked.length,
    };
  }, [indyaRecipes, indyaSearch, prefs]);

  // ── Favorites ───────────────────────────────────────────────────────────────

  const toggleFavorite = async (recipeId: string) => {
    const isFav = favorites.recipeIds.includes(recipeId);
    const nextFavs: RecipeFavorites = {
      athleteId: profile.email,
      recipeIds: isFav ? favorites.recipeIds.filter(id => id !== recipeId) : [...favorites.recipeIds, recipeId],
      dislikedIds: (favorites.dislikedIds ?? []).filter(id => id !== recipeId), // favorite & dislike are mutually exclusive
    };
    setFavorites(nextFavs);
    setSavingFav(true);
    try { await saveRecipeFavorites(nextFavs); } finally { setSavingFav(false); }
  };

  const toggleDislike = async (recipeId: string) => {
    const wasDisliked = (favorites.dislikedIds ?? []).includes(recipeId);
    const nextFavs: RecipeFavorites = {
      athleteId: profile.email,
      recipeIds: favorites.recipeIds.filter(id => id !== recipeId),
      dislikedIds: wasDisliked
        ? (favorites.dislikedIds ?? []).filter(id => id !== recipeId)
        : [...(favorites.dislikedIds ?? []), recipeId],
    };
    setFavorites(nextFavs);
    setSavingFav(true);
    try { await saveRecipeFavorites(nextFavs); } finally { setSavingFav(false); }
  };

  const openRecipe = (recipe: Recipe) => {
    setActiveRecipe(recipe);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ── Detail view ─────────────────────────────────────────────────────────────

  if (activeRecipe) {
    return (
      <RecipeDetail
        recipe={activeRecipe}
        isFav={favorites.recipeIds.includes(activeRecipe.id)}
        isDisliked={(favorites.dislikedIds ?? []).includes(activeRecipe.id)}
        enabledModes={enabledModes}
        savingFav={savingFav}
        onBack={() => setActiveRecipe(null)}
        onToggleFav={toggleFavorite}
        onToggleDislike={toggleDislike}
        onAddToIntercambios={onAddToIntercambios}
      />
    );
  }

  // ── Gallery view ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-sans font-extrabold text-3xl tracking-tight text-white">Recetas</h1>
        <p className="text-[#c6c9ab] text-sm mt-1">Tus recetas y la biblioteca completa de recetas.</p>
      </div>

      {/* ── Coach / athlete recipes ─────────────────────────────────────────── */}
      {!loading && recipes.length > 0 && (
        <section className="space-y-4">
          <h2 className="font-sans font-bold text-sm text-white uppercase tracking-wider flex items-center gap-2">
            <span className="material-symbols-outlined text-[#fbcb1a] text-base">restaurant_menu</span>
            Recetas del programa
          </h2>

          <div className="w-full overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
            <div className="flex gap-2 w-max">
              {[
                { id: 'all',       name: 'Todas' },
                { id: 'Favoritas', name: '❤ Favoritas' },
                ...(recipes.some(r => r.ownerId === profile.userId) ? [{ id: 'MisRecetas', name: 'Mis recetas' }] : []),
                ...availableCategories.map(c => ({ id: c, name: c })),
              ].map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCat(cat.id)}
                  className={`px-4 py-2 rounded-full font-mono text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-all ${
                    selectedCat === cat.id
                      ? 'bg-[#fbcb1a] text-black shadow-md'
                      : 'bg-[#1c1b1b] border border-white/7 text-[#c6c9ab] hover:border-[#c6c9ab]/40 hover:text-white'
                  }`}
                >{cat.name}</button>
              ))}
            </div>
          </div>

          {filteredRecipes.length === 0 ? (
            <div className="text-center py-12 text-[#c6c9ab] font-mono text-xs uppercase tracking-widest">
              {selectedCat === 'Favoritas' ? 'Aún no tienes favoritas.'
                : selectedCat === 'MisRecetas' ? 'Aún no has guardado ninguna receta propia.'
                : 'No hay recetas en esta categoría.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
              <RecipeCard recipe={filteredRecipes[0]} isFav={favorites.recipeIds.includes(filteredRecipes[0].id)} large onOpen={openRecipe} onToggleFav={toggleFavorite} />
              {filteredRecipes.slice(1).map(r => (
                <RecipeCard key={r.id} recipe={r} isFav={favorites.recipeIds.includes(r.id)} onOpen={openRecipe} onToggleFav={toggleFavorite} />
              ))}
            </div>
          )}
        </section>
      )}

      {loading && (
        <div className="flex items-center justify-center py-10">
          <span className="font-mono text-xs text-[#c6c9ab] uppercase tracking-widest animate-pulse">Cargando…</span>
        </div>
      )}

      {/* ── Biblioteca de recetas (paginated, backed by the Indya dataset — never shown to the user) ──── */}
      <section className="space-y-4">
        <h2 className="font-sans font-bold text-sm text-white uppercase tracking-wider flex items-center gap-2">
          <span className="material-symbols-outlined text-[#00eefc] text-base">library_books</span>
          Biblioteca de recetas
          <span className="font-mono text-[10px] text-[#c6c9ab] normal-case font-normal">8 850 recetas</span>
        </h2>

        {/* Category filter */}
        <div className="w-full overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
          <div className="flex gap-2 w-max">
            {INDYA_CATS.map(cat => (
              <button
                key={cat}
                onClick={() => setIndyaCat(cat)}
                className={`px-4 py-2 rounded-full font-mono text-[10px] font-bold whitespace-nowrap transition-all ${
                  indyaCat === cat
                    ? 'bg-[#00eefc] text-black shadow-md'
                    : 'bg-[#1c1b1b] border border-white/7 text-[#c6c9ab] hover:border-[#c6c9ab]/40 hover:text-white'
                }`}
              >{cat}</button>
            ))}
          </div>
        </div>

        {/* Intake type filter */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setIndyaIntake(null)}
            className={`px-3 py-1.5 rounded-full font-mono text-[10px] uppercase tracking-wide transition-all ${
              indyaIntake === null
                ? 'bg-[#2a2a2a] text-[#fbcb1a] border border-[#fbcb1a]/40'
                : 'bg-[#1c1b1b] border border-white/7 text-[#c6c9ab] hover:text-white'
            }`}
          >Todos los momentos</button>
          {Object.entries(INTAKE_LABELS).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setIndyaIntake(Number(k))}
              className={`px-3 py-1.5 rounded-full font-mono text-[10px] uppercase tracking-wide transition-all ${
                indyaIntake === Number(k)
                  ? 'bg-[#2a2a2a] text-[#fbcb1a] border border-[#fbcb1a]/40'
                  : 'bg-[#1c1b1b] border border-white/7 text-[#c6c9ab] hover:text-white'
              }`}
            >{label}</button>
          ))}
        </div>

        {/* Name search */}
        <div className="relative">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#c6c9ab] text-base">search</span>
          <input
            type="text"
            value={indyaSearch}
            onChange={e => setIndyaSearch(e.target.value)}
            placeholder="Buscar en esta página…"
            className="w-full bg-[#1c1b1b] border border-white/7 rounded-lg pl-9 pr-4 py-2.5 text-xs text-white placeholder-[#c6c9ab]/50 focus:outline-none focus:border-[#00eefc]/50 font-mono"
          />
          {indyaSearch && (
            <button onClick={() => setIndyaSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#c6c9ab] hover:text-white">
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          )}
        </div>

        {/* Grid */}
        {indyaLoading ? (
          <div className="flex items-center justify-center py-16">
            <span className="font-mono text-xs text-[#c6c9ab] uppercase tracking-widest animate-pulse">Cargando recetas…</span>
          </div>
        ) : indyaTotalVisible === 0 && indyaError ? (
          <div className="flex flex-col items-center gap-3 py-16">
            <p className="font-mono text-xs text-red-300 uppercase tracking-widest text-center">{indyaError}</p>
            <button
              onClick={handleLoadMore}
              disabled={indyaLoadingMore}
              className="px-6 py-3 bg-[#1c1b1b] border border-white/7 hover:border-[#00eefc]/50 text-[#c6c9ab] hover:text-white font-mono text-xs uppercase tracking-wider rounded-xl transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {indyaLoadingMore
                ? <><span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>Cargando…</>
                : <><span className="material-symbols-outlined text-sm">refresh</span>Reintentar</>
              }
            </button>
          </div>
        ) : indyaTotalVisible === 0 ? (
          <div className="text-center py-16 text-[#c6c9ab] font-mono text-xs uppercase tracking-widest">
            {indyaSearch ? 'Sin resultados en esta página.' : 'Sin recetas para estos filtros.'}
          </div>
        ) : (
          <div className="space-y-6">
            <p className="font-mono text-[9px] text-[#c6c9ab] uppercase">
              {indyaSearch
                ? `${indyaTotalVisible} de ${indyaRecipes.length} resultados en esta página`
                : `${indyaRecipes.length} receta${indyaRecipes.length !== 1 ? 's' : ''} cargada${indyaRecipes.length !== 1 ? 's' : ''}${indyaHasMore ? ' · hay más' : ''}`
              }
            </p>

            {/* ── Destacadas (liked ingredients) ── */}
            {indyaFeatured.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-amber-400 text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                  <h3 className="font-mono text-[10px] text-amber-400 uppercase tracking-wider font-bold">
                    Destacadas para ti ({indyaFeatured.length})
                  </h3>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {indyaFeatured.map(r => (
                    <IndyaCard
                      key={r.id}
                      recipe={r}
                      isFav={favorites.recipeIds.includes(r.id)}
                      isFeatured
                      onOpen={openRecipe}
                      onToggleFav={toggleFavorite}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* ── Normal recipes ── */}
            {indyaNormal.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {indyaNormal.map(r => (
                  <IndyaCard
                    key={r.id}
                    recipe={r}
                    isFav={favorites.recipeIds.includes(r.id)}
                    onOpen={openRecipe}
                    onToggleFav={toggleFavorite}
                  />
                ))}
              </div>
            )}

            {/* ── With disliked ingredients (collapsible) ── */}
            {indyaDisliked.length > 0 && (
              <div className="space-y-2">
                <button
                  onClick={() => setShowDislikedSection(v => !v)}
                  className="flex items-center gap-2 w-full text-left group"
                >
                  <span className="material-symbols-outlined text-sm text-[#555] group-hover:text-[#c6c9ab] transition-colors">
                    {showDislikedSection ? 'expand_less' : 'expand_more'}
                  </span>
                  <span className="font-mono text-[10px] text-[#555] group-hover:text-[#c6c9ab] uppercase tracking-wider transition-colors">
                    Con ingredientes que no te gustan ({indyaDisliked.length})
                  </span>
                </button>
                {showDislikedSection && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 opacity-50">
                    {indyaDisliked.map(r => (
                      <IndyaCard
                        key={r.id}
                        recipe={r}
                        isFav={favorites.recipeIds.includes(r.id)}
                        onOpen={openRecipe}
                        onToggleFav={toggleFavorite}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {indyaError && (
              <div className="flex flex-col items-center gap-2 pt-2">
                <p className="font-mono text-[10px] text-red-300 uppercase tracking-wide">{indyaError}</p>
              </div>
            )}

            {indyaHasMore && !indyaSearch && (
              <div className="flex justify-center pt-2">
                <button
                  onClick={handleLoadMore}
                  disabled={indyaLoadingMore}
                  className="px-6 py-3 bg-[#1c1b1b] border border-white/7 hover:border-[#00eefc]/50 text-[#c6c9ab] hover:text-white font-mono text-xs uppercase tracking-wider rounded-xl transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  {indyaLoadingMore
                    ? <><span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>Cargando…</>
                    : <><span className="material-symbols-outlined text-sm">expand_more</span>{indyaError ? 'Reintentar' : 'Cargar más recetas'}</>
                  }
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
