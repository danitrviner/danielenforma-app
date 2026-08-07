import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  UserProfile, Recipe, RecipeFavorites, FoodCategory, DietMode,
} from '../types';
import {
  getRecipes, getRecipeFavorites, saveRecipeFavorites,
  getAthleteNutritionConfig, queryIndyaRecipes, getOnboarding,
  getDietsForAthlete, getAthleteDietConfig,
} from '../dbService';
import type { IndyaRecipeCursor } from '../dbService';
import { classifyRecipe } from '../utils/foodPrefs';
import { BUDGET_CATS, roundQuarter } from '../utils/exchangeHelpers';
import { exchangeToKcal } from '../utils/nutritionConstants';
import { Skeleton } from './ui';
import { EmptyState, Badge, Chip, SearchField, Button } from './ui';

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
    <div className="w-full h-full bg-gradient-to-br from-accent/10 to-transparent flex items-center justify-center">
      <span className="material-symbols-outlined text-display text-ink-2/30">skillet</span>
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
      className={`${colSpan} group relative rounded-surface overflow-hidden bg-raised border border-hairline ${minH} flex flex-col justify-end cursor-pointer hover:border-accent/40 transition-all`}
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
          className="material-symbols-outlined text-title-s"
          style={{ fontVariationSettings: isFav ? "'FILL' 1" : "'FILL' 0", color: isFav ? 'var(--color-accent)' : 'var(--color-ink-2)' }}
        >favorite</span>
      </button>

      <div className="relative z-10 p-4 space-y-2">
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tags.map(c => (
              <span key={c} className="px-2 rounded-full bg-black/60 backdrop-blur-sm text-ink-2 font-mono text-caption uppercase tracking-wider border border-hairline">{c}</span>
            ))}
          </div>
        )}
        <h3 className={`font-sans font-bold text-white group-hover:text-accent transition-colors leading-tight ${large ? 'text-title-l' : 'text-title-s'}`}>
          {recipe.name}
        </h3>
        {exchStr !== '—' && (
          <p className="font-mono text-caption text-accent/80 font-bold">{exchStr}</p>
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
      className={`group relative rounded-surface overflow-hidden bg-raised border aspect-[4/5] flex flex-col justify-end cursor-pointer transition-all ${
        isFeatured
          ? 'border-amber-400/40 hover:border-amber-400/70'
          : 'border-hairline hover:border-accent/40'
      }`}
    >
      {photo
        ? <img src={photo} alt={recipe.name} className="absolute inset-0 w-full h-full object-cover opacity-70 group-hover:scale-105 transition-transform duration-500" />
        : <div className="absolute inset-0 bg-gradient-to-br from-raised to-bg flex items-center justify-center">
            <span className="material-symbols-outlined text-display text-ink-3">skillet</span>
          </div>
      }
      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/50 to-transparent" />

      <button
        onClick={e => { e.stopPropagation(); onToggleFav(recipe.id); }}
        className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 flex items-center justify-center z-10"
      >
        <span className="material-symbols-outlined text-body-s"
          style={{ fontVariationSettings: isFav ? "'FILL' 1" : "'FILL' 0", color: isFav ? 'var(--color-accent)' : 'var(--color-ink-2)' }}
        >favorite</span>
      </button>

      {/* kcal or featured badge */}
      {isFeatured ? (
        <div className="absolute top-2 left-2 bg-amber-400/90 rounded-control px-2 font-mono text-caption text-black font-bold z-10 flex items-center ">
          <span className="material-symbols-outlined" style={{ fontSize: '9px', fontVariationSettings: "'FILL' 1" }}>star</span>
          Para ti
        </div>
      ) : recipe.kcal ? (
        <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm rounded-control px-2 font-mono text-caption text-ink-2 z-10">
          {recipe.kcal} kcal
        </div>
      ) : null}

      <div className="relative z-10 p-3 space-y-1">
        <p className="font-sans font-bold text-white text-label leading-tight line-clamp-2">{recipe.name}</p>
        {exch && (exch.HC > 0 || exch.PROT > 0 || exch.GRASA > 0) && (
          <p className="font-mono text-caption text-accent/75">
            {[exch.HC > 0 && `${exch.HC}HC`, exch.PROT > 0 && `${exch.PROT}P`, exch.GRASA > 0 && `${exch.GRASA}G`]
              .filter(Boolean).join(' · ')}
          </p>
        )}
        <div className="flex flex-wrap gap-1 ">
          {recipe.cookingTime && (
            <span className="flex items-center font-mono text-caption text-ink-2">
              <span className="material-symbols-outlined" style={{ fontSize: '10px' }}>schedule</span>
              {recipe.cookingTime}min
            </span>
          )}
          {recipe.tupper && (
            <span className="font-mono text-caption text-data">tupper</span>
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
  /** Cupo diario total del atleta (suma HC+PROT+GRASA); null si no tiene dieta activa. */
  dailyBudgetTotal: number | null;
  onBack: () => void;
  onToggleFav: (id: string) => void;
  onToggleDislike: (id: string) => void;
  onAddToIntercambios?: (recipe: Recipe) => void;
}

// Escala una receta ×0,25–×3 (handoff, panel 03): intercambios e ingredientes
// se redondean al cuarto más cercano, kcal recalcula proporcional.
function scaleRecipe(recipe: Recipe, scale: number): Recipe {
  if (scale === 1) return recipe;
  return {
    ...recipe,
    ingredients: (recipe.ingredients ?? []).map(ing => ({ ...ing, quantity: roundQuarter(ing.quantity * scale) })),
    exchanges: recipe.exchanges ? {
      HC: roundQuarter(recipe.exchanges.HC * scale),
      PROT: roundQuarter(recipe.exchanges.PROT * scale),
      GRASA: roundQuarter(recipe.exchanges.GRASA * scale),
    } : undefined,
    kcal: recipe.kcal != null ? Math.round(recipe.kcal * scale) : recipe.kcal,
  };
}

const SCALE_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3];

function RecipeDetail({ recipe, isFav, isDisliked, enabledModes, savingFav, dailyBudgetTotal, onBack, onToggleFav, onToggleDislike, onAddToIntercambios }: DetailProps) {
  const [checkedSteps, setCheckedSteps] = useState<Record<number, boolean>>({});
  const [scale, setScale] = useState(1);
  const isIndya = recipe.ownerId === 'indya';
  const scaledRecipe = useMemo(() => scaleRecipe(recipe, scale), [recipe, scale]);
  const exch = calcExchanges(scaledRecipe);
  const scaledTotal = BUDGET_CATS.reduce((s, c) => s + (exch[c] ?? 0), 0);
  const fitsBudget = dailyBudgetTotal == null || scaledTotal <= dailyBudgetTotal;
  const photo = recipe.image ?? recipe.photoUrl;

  const visibleIngredients = isIndya
    ? []
    : (scaledRecipe.ingredients ?? []).filter(ing => enabledModes.includes(ing.mode));

  return (
    <div className="space-y-6">
      {/* Back bar */}
      <div className="flex items-center justify-between bg-raised px-4 py-3 rounded-surface border border-hairline">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-ink-2 hover:text-accent transition-colors font-sans text-label uppercase tracking-wider"
        >
          <span className="material-symbols-outlined text-body-s">arrow_back</span>
          Recetas
        </button>
        <div className="flex items-center gap-4">
          <button
            onClick={() => onToggleFav(recipe.id)}
            disabled={savingFav}
            className="flex items-center gap-2 text-label font-mono font-bold uppercase tracking-wider transition-transform duration-(--duration-state) ease-brand active:scale-90 disabled:opacity-50"
            style={{ color: isFav ? 'var(--color-accent)' : 'var(--color-ink-2)' }}
          >
            <span
              className="material-symbols-outlined text-title-m transition-colors duration-(--duration-state)"
              style={{ fontVariationSettings: isFav ? "'FILL' 1" : "'FILL' 0", color: isFav ? 'var(--color-accent)' : 'var(--color-ink-2)' }}
            >favorite</span>
            {isFav ? 'Favorita' : 'Guardar'}
          </button>
          <button
            onClick={() => onToggleDislike(recipe.id)}
            disabled={savingFav}
            title={isDisliked ? 'Quitar el "no me gusta"' : 'No me gusta — que no salga en mis menús'}
            className="flex items-center gap-2 text-label font-mono font-bold uppercase tracking-wider transition-all disabled:opacity-50"
            style={{ color: isDisliked ? 'var(--color-danger)' : 'var(--color-ink-2)' }}
          >
            <span
              className="material-symbols-outlined text-title-m"
              style={{ fontVariationSettings: isDisliked ? "'FILL' 1" : "'FILL' 0" }}
            >thumb_down</span>
          </button>
        </div>
      </div>

      {/* Photo */}
      <div className="w-full aspect-[16/7] rounded-surface overflow-hidden bg-raised border border-hairline">
        {photo
          ? <img src={photo} alt={recipe.name} className="w-full h-full object-cover" />
          : <RecipePlaceholder />
        }
      </div>

      {/* Title + metadata */}
      <div className="space-y-3">
        <h1 className="font-sans font-bold text-title-l text-white tracking-tight">{recipe.name}</h1>

        {/* Indya metadata row */}
        {isIndya && (
          <div className="flex flex-wrap gap-3 text-ink-2 font-mono text-caption">
            {recipe.kcal != null && (
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-accent" style={{ fontSize: '12px' }}>local_fire_department</span>
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
              <span className="flex items-center gap-1 text-data">
                <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>takeout_dining</span>
                apto tupper
              </span>
            )}
          </div>
        )}

        {/* Category tags */}
        {(recipe.categoria || recipe.categories.length > 0) && (
          <div className="flex flex-wrap gap-2">
            {(recipe.categoria ? [recipe.categoria] : recipe.categories).map(c => (
              <Badge key={c} tone="neutral">{c}</Badge>
            ))}
          </div>
        )}

        {/* Intake type tags (Indya) */}
        {isIndya && recipe.intakeTypes && recipe.intakeTypes.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {recipe.intakeTypes.map(t => (
              <span key={t} className="px-2 rounded-full bg-raised border border-hairline text-ink-2 font-mono text-caption">
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
              <span key={cat} className={`px-3 py-1 rounded-surface border font-mono text-label font-bold ${CAT_COLORS[cat]}`}>
                {val} {CAT_LABELS[cat]}
              </span>
            ))}
        </div>

        {/* Escala — panel 03 del handoff: ×0,25–×3, recalcula en vivo */}
        {(recipe.exchanges || (recipe.ingredients?.length ?? 0) > 0) && (
          <div className="bg-surface border border-hairline rounded-surface p-4">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-caption font-semibold tracking-[.14em] text-ink-3">ESCALA</span>
              <span className="font-mono text-title-s font-bold text-accent">×{String(scale).replace('.', ',')}</span>
            </div>
            <input
              type="range"
              min={0.25}
              max={3}
              step={0.25}
              value={scale}
              onChange={e => setScale(roundQuarter(parseFloat(e.target.value)))}
              aria-label="Escala de la receta"
              className="w-full mt-3 accent-accent"
            />
            <div className="flex justify-between font-mono text-caption text-ink-4">
              <span>×0,25</span><span>×3</span>
            </div>

            {dailyBudgetTotal != null && (
              <div className={`flex items-center gap-2 mt-4 px-4 py-3 rounded-field border transition-colors duration-(--duration-state) ${fitsBudget ? 'bg-success/10 border-success/30 text-success' : 'bg-accent-bg border-accent-line text-accent'}`}>
                <span className={`h-1.5 w-1.5 rounded-full flex-none ${fitsBudget ? 'bg-success' : 'bg-accent'}`} />
                <span className="font-mono text-label font-semibold tracking-[.04em]">
                  {fitsBudget ? 'CABE EN TU PRESUPUESTO DE HOY' : 'SE SALE DE TU PRESUPUESTO DE HOY'}
                </span>
              </div>
            )}

            {onAddToIntercambios && (
              <Button variant="primary" size="l" fullWidth onClick={() => onAddToIntercambios(scaledRecipe)} className="mt-3">
                Añadir a la comida
              </Button>
            )}
            <p className="text-center font-mono text-caption tracking-[.08em] text-ink-4 mt-3">
              LA ESCALA RECALCULA EN VIVO · EL AJUSTE PARA EN ×0,25
            </p>
          </div>
        )}

        {/* Indya macros breakdown */}
        {isIndya && recipe.macros && (
          <div className="grid grid-cols-3 gap-2 bg-raised border border-hairline rounded-surface p-3">
            {[
              { label: 'Carbos', val: recipe.macros.carb },
              { label: 'Proteína', val: recipe.macros.prot },
              { label: 'Grasa', val: recipe.macros.fat },
            ].map(({ label, val }) => (
              <div key={label} className="text-center">
                <span className="block font-sans text-caption text-ink-2 uppercase">{label}</span>
                <span className="block font-bold text-white text-body-s font-mono">{val}g</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Ingredients */}
        <section className="bg-raised border border-hairline rounded-surface p-5 space-y-3">
          <h2 className="font-sans font-bold text-body-s text-white uppercase tracking-wider flex items-center gap-2">
            <span className="material-symbols-outlined text-accent text-title-s">recipe</span>
            Ingredientes
          </h2>

          {isIndya && recipe.ingredientsText && recipe.ingredientsText.length > 0 ? (
            <ul className="space-y-2">
              {recipe.ingredientsText.map((ing, idx) => (
                <li key={idx} className="flex items-center justify-between py-2 border-b border-hairline last:border-0">
                  <span className="text-label text-white font-sans flex-1 pr-2 leading-relaxed">{ing.name}</span>
                  <span className="font-mono text-caption text-ink-2 shrink-0">{ing.quantity}g</span>
                </li>
              ))}
            </ul>
          ) : !isIndya && visibleIngredients.length > 0 ? (
            <ul className="space-y-2">
              {visibleIngredients.map((ing, idx) => (
                <li key={idx} className="flex items-center justify-between py-2 border-b border-hairline last:border-0">
                  <span className="text-label text-white font-sans flex-1 pr-2 leading-relaxed">{ing.foodLabel}</span>
                  <span className={`font-mono text-caption font-bold shrink-0 ${CAT_COLORS[ing.category].split(' ')[0]}`}>
                    ×{ing.quantity}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="font-sans text-label text-ink-2 italic">Sin ingredientes disponibles.</p>
          )}

          {!isIndya && recipe.extras.length > 0 && (
            <div className="pt-2 border-t border-hairline">
              <p className="font-mono text-caption text-ink-2 uppercase tracking-wider mb-2">Extras</p>
              <div className="flex flex-wrap gap-2">
                {recipe.extras.map((ex, idx) => (
                  <span key={idx} className="px-3 py-1 rounded-full bg-raised text-ink-2 font-mono text-caption">{ex}</span>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Steps */}
        {((isIndya && recipe.stepsText && recipe.stepsText.length > 0) ||
          (!isIndya && recipe.steps.length > 0)) && (
          <section className="bg-raised border border-hairline rounded-surface p-5 space-y-4">
            <h2 className="font-sans font-bold text-body-s text-white uppercase tracking-wider flex items-center gap-2">
              <span className="material-symbols-outlined text-accent text-title-s">format_list_numbered</span>
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
                      <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center font-mono text-caption font-bold transition-all ${done ? 'bg-accent border-accent text-black' : 'border-hairline text-ink-2 group-hover:border-accent/50'}`}>
                        {done ? <span className="material-symbols-outlined text-label font-bold">check</span> : idx + 1}
                      </div>
                    </div>
                    <p className={`text-label font-sans leading-relaxed pt-1 pb-3 transition-colors ${done ? 'text-ink-2/50 line-through' : 'text-ink-2'}`}>
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
  const queryClient = useQueryClient();

  // Coach/athlete recipes — shared cache keys with RecipeBuilderScreen/MyDietsScreen
  // ('recipes'), WeeklyMenuEditor/MyMenuScreen ('recipeFavorites'), and
  // StepsWidget/NutritionAnalysisPanel/NutritionHubScreen ('athleteNutritionConfig').
  const { data: recipes = [], isPending: loadingRecipes } = useQuery({
    queryKey: ['recipes'],
    queryFn: getRecipes,
  });
  const favoritesKey = ['recipeFavorites', profile.email] as const;
  const { data: favoritesData, isPending: loadingFavorites } = useQuery({
    queryKey: favoritesKey,
    queryFn: () => getRecipeFavorites(profile.email),
  });
  const favorites = favoritesData ?? { athleteId: profile.email, recipeIds: [] };
  const { data: nutritionConfig, isPending: loadingNutConfig } = useQuery({
    queryKey: ['athleteNutritionConfig', profile.email],
    queryFn: () => getAthleteNutritionConfig(profile.email),
  });
  const enabledModes = nutritionConfig?.enabledModes ?? ['OMNIVORO'];
  const { data: onboardingData, isPending: loadingOnboarding } = useQuery({
    queryKey: ['onboarding', profile.email],
    queryFn: () => getOnboarding(profile.email),
  });
  const loading = loadingRecipes || loadingFavorites || loadingNutConfig || loadingOnboarding;

  // Presupuesto diario del atleta — solo para el chip "Cabe en mi presupuesto"
  // (panel 03 del handoff). Compara contra el cupo total del día, no contra lo
  // que queda por comer ahora mismo: ese cálculo vive en NutritionScreen y
  // duplicarlo aquí (con su propio itemStates) se sale del alcance de F3.8.
  const { data: diets = [] } = useQuery({
    queryKey: ['dietsForAthlete', profile.email],
    queryFn: () => getDietsForAthlete(profile.email),
  });
  const { data: dietConfig = null } = useQuery({
    queryKey: ['athleteDietConfig', profile.email],
    queryFn: () => getAthleteDietConfig(profile.email).catch(() => null),
  });
  const dailyBudgetTotal = useMemo(() => {
    const activeIds = new Set(dietConfig?.activeDietIds ?? []);
    const active = diets.filter(d => activeIds.has(d.id));
    if (active.length === 0) return null;
    return active.reduce((sum, d) => sum + BUDGET_CATS.reduce((s, c) => s + (d.budget[c] ?? 0), 0), 0);
  }, [diets, dietConfig]);
  const [onlyFitsBudget, setOnlyFitsBudget] = useState(true);
  const fitsBudget = useCallback((r: Recipe) => {
    if (dailyBudgetTotal == null) return true; // sin dieta activa — no hay presupuesto que aplicar
    const exch = calcExchanges(r);
    const total = BUDGET_CATS.reduce((s, c) => s + (exch[c] ?? 0), 0);
    return total <= dailyBudgetTotal;
  }, [dailyBudgetTotal]);
  const prefs = useMemo(() => ({
    liked:     onboardingData?.likedFoods     ?? [],
    disliked:  onboardingData?.dislikedFoods  ?? [],
    allergies: onboardingData?.allergies      ?? [],
  }), [onboardingData]);
  const [selectedCat, setSelectedCat]   = useState<string>('all');

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
    const base = selectedCat === 'Favoritas' ? recipes.filter(r => favorites.recipeIds.includes(r.id))
      : selectedCat === 'MisRecetas' ? recipes.filter(r => r.ownerId === profile.userId)
      : selectedCat === 'all' ? recipes
      : recipes.filter(r => r.categories.includes(selectedCat));
    return onlyFitsBudget ? base.filter(fitsBudget) : base;
  }, [recipes, favorites, selectedCat, profile.userId, onlyFitsBudget, fitsBudget]);

  const { indyaFeatured, indyaNormal, indyaDisliked, indyaTotalVisible } = useMemo(() => {
    const bySearch = indyaSearch.trim()
      ? indyaRecipes.filter(r => r.name.toLowerCase().includes(indyaSearch.toLowerCase()))
      : indyaRecipes;
    const searched = onlyFitsBudget ? bySearch.filter(fitsBudget) : bySearch;

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
  }, [indyaRecipes, indyaSearch, prefs, onlyFitsBudget, fitsBudget]);

  // ── Favorites ───────────────────────────────────────────────────────────────

  const toggleFavorite = async (recipeId: string) => {
    const isFav = favorites.recipeIds.includes(recipeId);
    const nextFavs: RecipeFavorites = {
      athleteId: profile.email,
      recipeIds: isFav ? favorites.recipeIds.filter(id => id !== recipeId) : [...favorites.recipeIds, recipeId],
      dislikedIds: (favorites.dislikedIds ?? []).filter(id => id !== recipeId), // favorite & dislike are mutually exclusive
    };
    queryClient.setQueryData(favoritesKey, nextFavs);
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
    queryClient.setQueryData(favoritesKey, nextFavs);
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
        dailyBudgetTotal={dailyBudgetTotal}
        onBack={() => setActiveRecipe(null)}
        onToggleFav={toggleFavorite}
        onToggleDislike={toggleDislike}
        onAddToIntercambios={onAddToIntercambios}
      />
    );
  }

  // ── Gallery view ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-sans font-extrabold text-display tracking-tight text-white">Recetas</h1>
        <p className="text-ink-2 text-body-s mt-1">Tus recetas y la biblioteca completa de recetas.</p>
      </div>

      {/* "Cabe en mi presupuesto" — primer chip, seleccionado por defecto (handoff, panel 03) */}
      {dailyBudgetTotal != null && (
        <Chip selected={onlyFitsBudget} onClick={() => setOnlyFitsBudget(v => !v)} icon="check_circle">
          Cabe en mi presupuesto
        </Chip>
      )}

      {/* ── Coach / athlete recipes ─────────────────────────────────────────── */}
      {!loading && recipes.length > 0 && (
        <section className="space-y-4">
          <h2 className="font-sans font-bold text-body-s text-white uppercase tracking-wider flex items-center gap-2">
            <span className="material-symbols-outlined text-accent text-title-s">restaurant_menu</span>
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
                <Chip key={cat.id} selected={selectedCat === cat.id} onClick={() => setSelectedCat(cat.id)}>{cat.name}</Chip>
              ))}
            </div>
          </div>

          {filteredRecipes.length === 0 ? (
            <EmptyState
              icon="restaurant_menu"
              title={
                selectedCat === 'Favoritas' ? 'Aún no tienes favoritas.'
                  : selectedCat === 'MisRecetas' ? 'Aún no has guardado ninguna receta propia.'
                  : 'No hay recetas en esta categoría.'
              }
            />
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
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
          <Skeleton className="md:col-span-12 h-48 w-full rounded-surface" />
        </div>
      )}

      {/* ── Biblioteca de recetas (paginated, backed by the Indya dataset — never shown to the user) ──── */}
      <section className="space-y-4">
        <h2 className="font-sans font-bold text-body-s text-white uppercase tracking-wider flex items-center gap-2">
          <span className="material-symbols-outlined text-data text-title-s">library_books</span>
          Biblioteca de recetas
          <span className="font-mono text-caption text-ink-2 normal-case font-normal">8 850 recetas</span>
        </h2>

        {/* Category filter */}
        <div className="w-full overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
          <div className="flex gap-2 w-max">
            {INDYA_CATS.map(cat => (
              <button
                key={cat}
                onClick={() => setIndyaCat(cat)}
                className={`px-4 py-2 rounded-full font-mono text-caption font-bold whitespace-nowrap transition-all ${
                  indyaCat === cat
                    ? 'bg-data text-black'
                    : 'bg-raised border border-hairline text-ink-2 hover:border-ink-2/40 hover:text-white'
                }`}
              >{cat}</button>
            ))}
          </div>
        </div>

        {/* Intake type filter */}
        <div className="flex flex-wrap gap-2">
          <Chip selected={indyaIntake === null} onClick={() => setIndyaIntake(null)}>Todos los momentos</Chip>
          {Object.entries(INTAKE_LABELS).map(([k, label]) => (
            <Chip key={k} selected={indyaIntake === Number(k)} onClick={() => setIndyaIntake(Number(k))}>{label}</Chip>
          ))}
        </div>

        {/* Name search */}
        <SearchField
          value={indyaSearch}
          onChange={setIndyaSearch}
          placeholder="Buscar entre 8.850 recetas…"
          label="Buscar en la biblioteca de recetas"
        />

        {/* Grid */}
        {indyaLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            <Skeleton className="h-40 w-full rounded-surface" />
            <Skeleton className="h-40 w-full rounded-surface" />
            <Skeleton className="h-40 w-full rounded-surface" />
            <Skeleton className="h-40 w-full rounded-surface" />
          </div>
        ) : indyaTotalVisible === 0 && indyaError ? (
          <div className="flex flex-col items-center gap-3 py-10">
            <p className="font-sans text-label text-red-300 uppercase tracking-widest text-center">{indyaError}</p>
            <button
              onClick={handleLoadMore}
              disabled={indyaLoadingMore}
              className="px-6 py-3 bg-raised border border-hairline hover:border-data/50 text-ink-2 hover:text-white font-sans text-label uppercase tracking-wider rounded-control transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {indyaLoadingMore
                ? <><span className="material-symbols-outlined text-body-s animate-spin">progress_activity</span>Cargando…</>
                : <><span className="material-symbols-outlined text-body-s">refresh</span>Reintentar</>
              }
            </button>
          </div>
        ) : indyaTotalVisible === 0 ? (
          <EmptyState icon="search_off" title={indyaSearch ? 'Sin resultados en esta página.' : 'Sin recetas para estos filtros.'} />
        ) : (
          <div className="space-y-6">
            <p className="font-sans text-caption text-ink-2 uppercase">
              {indyaSearch
                ? `${indyaTotalVisible} de ${indyaRecipes.length} resultados en esta página`
                : `${indyaRecipes.length} receta${indyaRecipes.length !== 1 ? 's' : ''} cargada${indyaRecipes.length !== 1 ? 's' : ''}${indyaHasMore ? ' · hay más' : ''}`
              }
            </p>

            {/* ── Destacadas (liked ingredients) ── */}
            {indyaFeatured.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-amber-400 text-body-s" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                  <h3 className="font-sans text-caption text-amber-400 uppercase tracking-wider font-bold">
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
                  <span className="material-symbols-outlined text-body-s text-ink-3 group-hover:text-ink-2 transition-colors">
                    {showDislikedSection ? 'expand_less' : 'expand_more'}
                  </span>
                  <span className="font-sans text-caption text-ink-3 group-hover:text-ink-2 uppercase tracking-wider transition-colors">
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
                <p className="font-sans text-caption text-red-300 uppercase tracking-wide">{indyaError}</p>
              </div>
            )}

            {indyaHasMore && !indyaSearch && (
              <div className="flex justify-center pt-2">
                <button
                  onClick={handleLoadMore}
                  disabled={indyaLoadingMore}
                  className="px-6 py-3 bg-raised border border-hairline hover:border-data/50 text-ink-2 hover:text-white font-sans text-label uppercase tracking-wider rounded-control transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  {indyaLoadingMore
                    ? <><span className="material-symbols-outlined text-body-s animate-spin">progress_activity</span>Cargando…</>
                    : <><span className="material-symbols-outlined text-body-s">expand_more</span>{indyaError ? 'Reintentar' : 'Cargar más recetas'}</>
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
