import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  UserProfile, Recipe, RecipeFavorites, FoodCategory, DietMode,
} from '../types';
import {
  getRecipes, getRecipeFavorites, saveRecipeFavorites, deleteRecipe,
  getAthleteNutritionConfig, queryRecetas, cargarIndiceRecetas, getOnboarding,
  getDietsForAthlete, getAthleteDietConfig, OWNER_RECETARIO_TODOS, getRecipeById,
} from '../dbService';
import type { RecetasCursor } from '../dbService';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { classifyRecipe, violatesDietType } from '../utils/foodPrefs';
import { dishType } from '../utils/dishTypes';
import { BUDGET_CATS, roundQuarter, CAT_COLOR, CAT_BG } from '../utils/exchangeHelpers';
import { exchangeToKcal } from '../utils/nutritionConstants';
import { fotoDeReceta } from '../utils/fotoDeReceta';
import FotoDeReceta from './FotoDeReceta';
import { Skeleton } from './ui';
import { EmptyState, Badge, Chip, SearchField, Button, Select } from './ui';

// ── Exchange helpers ──────────────────────────────────────────────────────────

const CAT_LABELS: Record<FoodCategory, string> = {
  HC: 'HC', PROT: 'PROT', GRASA: 'GRASA', MIX_HC: 'MIX·HC', MIX_GRASA: 'MIX·GRASA',
};

// Antes tenía su propio mapa de color (-400 en todo) distinto del que ya
// usaba NutritionScreen.tsx (-300 texto / -500 fondo) para las mismas 5
// categorías — la misma categoría se veía de un tono distinto según la
// pantalla. Se reutiliza el mapa compartido en vez de mantener un segundo.
const CAT_COLORS: Record<FoodCategory, string> = {
  HC:        `${CAT_COLOR.HC} ${CAT_BG.HC}`,
  PROT:      `${CAT_COLOR.PROT} ${CAT_BG.PROT}`,
  GRASA:     `${CAT_COLOR.GRASA} ${CAT_BG.GRASA}`,
  MIX_HC:    `${CAT_COLOR.MIX_HC} ${CAT_BG.MIX_HC}`,
  MIX_GRASA: `${CAT_COLOR.MIX_GRASA} ${CAT_BG.MIX_GRASA}`,
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

const RECETAS_CATS = [
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

// Cuántas recetas visibles intenta juntar cada clic de «Cargar más recetas», y
// cuántas lecturas como mucho se encadenan para lograrlo.
const RECETAS_VISIBLES_POR_CLIC = 12;
const MAX_PAGINAS_POR_CLIC = 3;

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
  /** Tarda más de lo que el atleta dijo poder cocinar. No se le oculta —puede
   *  tener un día libre— pero se marca para que lo vea antes de meterse. */
  excedeTiempo?: boolean;
  onOpen: (r: Recipe) => void;
  onToggleFav: (id: string) => Promise<void> | void;
  key?: React.Key;
}

// Envuelta en React.memo: la rejilla pinta 48+ tarjetas a la vez y solo la
// que de verdad cambió (se marcó/desmarcó favorita, o cambió de posición)
// tiene que volver a renderizar — sin esto, cualquier estado de RecipesScreen
// (el propio buscador, activeRecipe...) repintaba las 48 igual. Depende de
// que `onOpen`/`onToggleFav` tengan identidad estable (useCallback más abajo)
// y de que `recipe` no se reconstruya en cada render (ya sale de un useMemo).
const RecipeCard = React.memo(function RecipeCard({ recipe, isFav, large = false, onOpen, onToggleFav }: CardProps) {
  const exchStr = formatExchanges(calcExchanges(recipe));
  const photo = fotoDeReceta(recipe);
  const colSpan = large ? 'col-span-1 md:col-span-8' : 'col-span-1 md:col-span-4';
  const minH    = large ? 'min-h-[300px] md:min-h-[360px]' : 'min-h-[220px] md:min-h-[280px]';
  const tags = recipe.categoria ? [recipe.categoria] : recipe.categories.slice(0, 2);

  return (
    <article
      onClick={() => onOpen(recipe)}
      className={`${colSpan} group relative rounded-surface overflow-hidden bg-raised border border-hairline ${minH} flex flex-col justify-end cursor-pointer hover:border-accent/40 transition-all`}
    >
      <FotoDeReceta
        src={photo}
        alt={recipe.name}
        className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:scale-105 transition-transform duration-500"
        fallback={<div className="absolute inset-0"><RecipePlaceholder /></div>}
      />
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
        <h3 className={`font-sans font-bold text-ink group-hover:text-accent transition-colors leading-tight ${large ? 'text-title-l' : 'text-title-s'}`}>
          {recipe.name}
        </h3>
        {exchStr !== '—' && (
          <p className="font-mono text-caption text-accent/80 font-bold">{exchStr}</p>
        )}
      </div>
    </article>
  );
});

// Compact card used in the Recetas paginated grid (image-forward, tighter)
const RecetaCard = React.memo(function RecetaCard({ recipe, isFav, isFeatured, excedeTiempo, onOpen, onToggleFav }: Omit<CardProps, 'large'>) {
  const photo = fotoDeReceta(recipe);
  const exch = recipe.exchanges;

  return (
    <article
      onClick={() => onOpen(recipe)}
      className={`group relative rounded-surface overflow-hidden bg-raised border aspect-[4/5] flex flex-col justify-end cursor-pointer transition-all ${
        isFeatured
          ? 'border-accent/40 hover:border-accent/70'
          : 'border-hairline hover:border-accent/40'
      }`}
    >
      <FotoDeReceta
        src={photo}
        alt={recipe.name}
        className="absolute inset-0 w-full h-full object-cover opacity-70 group-hover:scale-105 transition-transform duration-500"
        fallback={
          <div className="absolute inset-0 bg-gradient-to-br from-raised to-bg flex items-center justify-center">
            <span className="material-symbols-outlined text-display text-ink-3">skillet</span>
          </div>
        }
      />
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
        <p className="font-sans font-bold text-ink text-label leading-tight line-clamp-2">{recipe.name}</p>
        {exch && (exch.HC > 0 || exch.PROT > 0 || exch.GRASA > 0) && (
          <p className="font-mono text-caption text-accent/75">
            {[exch.HC > 0 && `${exch.HC}HC`, exch.PROT > 0 && `${exch.PROT}P`, exch.GRASA > 0 && `${exch.GRASA}G`]
              .filter(Boolean).join(' · ')}
          </p>
        )}
        <div className="flex flex-wrap gap-1 ">
          {recipe.cookingTime && (
            <span
              className={`flex items-center font-mono text-caption ${excedeTiempo ? 'text-amber-400' : 'text-ink-2'}`}
              title={excedeTiempo ? 'Tarda más de lo que sueles tener para cocinar' : undefined}
            >
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
});

// ── Detail view ───────────────────────────────────────────────────────────────

interface DetailProps {
  recipe: Recipe;
  isFav: boolean;
  isDisliked: boolean;
  /** Solo el propio dueño puede borrarla — recetas del catálogo o de otro usuario no muestran el botón. */
  isOwn: boolean;
  enabledModes: DietMode[];
  savingFav: boolean;
  deletingOwn: boolean;
  /** Cupo diario total del atleta (suma HC+PROT+GRASA); null si no tiene dieta activa. */
  dailyBudgetTotal: number | null;
  onBack: () => void;
  onToggleFav: (id: string) => void;
  onToggleDislike: (id: string) => void;
  onDelete: (id: string) => void;
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

function RecipeDetail({ recipe, isFav, isDisliked, isOwn, enabledModes, savingFav, deletingOwn, dailyBudgetTotal, onBack, onToggleFav, onToggleDislike, onDelete, onAddToIntercambios }: DetailProps) {
  const [checkedSteps, setCheckedSteps] = useState<Record<number, boolean>>({});
  const [scale, setScale] = useState(1);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Antes solo comparaba contra 'recetas' — las recetas importadas con el
  // ownerId heredado 'indya' (miles de ellas, ver comentario en db/recipes.ts)
  // caían por el hueco y se trataban como receta propia sin ingredientes.
  const isRecetas = OWNER_RECETARIO_TODOS.includes(recipe.ownerId);
  const scaledRecipe = useMemo(() => scaleRecipe(recipe, scale), [recipe, scale]);
  const exch = calcExchanges(scaledRecipe);
  const scaledTotal = BUDGET_CATS.reduce((s, c) => s + (exch[c] ?? 0), 0);
  const fitsBudget = dailyBudgetTotal == null || scaledTotal <= dailyBudgetTotal;
  const photo = fotoDeReceta(recipe);

  const visibleIngredients = isRecetas
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
          {isOwn && !confirmingDelete && (
            <button
              onClick={() => setConfirmingDelete(true)}
              title="Eliminar esta receta"
              className="flex items-center gap-2 text-label font-mono font-bold uppercase tracking-wider text-ink-2 hover:text-danger transition-colors"
            >
              <span className="material-symbols-outlined text-title-m">delete</span>
            </button>
          )}
        </div>
      </div>

      {isOwn && confirmingDelete && (
        <div className="flex items-start gap-2 bg-danger/10 border border-danger/25 text-danger px-4 py-3 rounded-surface text-body-s">
          <span className="material-symbols-outlined text-title-s flex-shrink-0">warning</span>
          <div className="flex-1 space-y-2">
            <span className="block">
              Vas a eliminar esta receta. Las comidas ya guardadas que la usan la conservarán, pero no podrás volver a añadirla.
            </span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setConfirmingDelete(false)}
                className="text-label font-mono uppercase tracking-wider text-ink-2 hover:text-ink transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => onDelete(recipe.id)}
                disabled={deletingOwn}
                className="text-label font-mono font-bold uppercase tracking-wider text-danger disabled:opacity-50"
              >
                {deletingOwn ? 'Eliminando…' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Photo */}
      <div className="w-full aspect-[16/7] rounded-surface overflow-hidden bg-raised border border-hairline">
        <FotoDeReceta
          src={photo}
          alt={recipe.name}
          className="w-full h-full object-cover"
          fallback={<RecipePlaceholder />}
        />
      </div>

      {/* Title + metadata */}
      <div className="space-y-3">
        <h1 className="font-sans font-bold text-title-l text-ink tracking-tight">{recipe.name}</h1>

        {/* Recetas metadata row */}
        {isRecetas && (
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

        {/* Intake type tags (Recetas) */}
        {isRecetas && recipe.intakeTypes && recipe.intakeTypes.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {recipe.intakeTypes.map(t => (
              <span key={t} className="px-2 rounded-full bg-raised border border-hairline text-ink-2 font-mono text-caption">
                {INTAKE_LABELS[t] ?? `Tipo ${t}`}
              </span>
            ))}
          </div>
        )}

        {/* Exchange badges — kcal al lado y NO en la fila de metadata de más
            arriba (14-08, tarea 24): esa de arriba usa `recipe.kcal` sin
            escalar, fijo aunque se mueva ESCALA; aquí, junto a los
            intercambios (que sí ya usan `scaledRecipe` vía calcExchanges),
            se mueve con el mismo slider — las dos cifras que cambian juntas
            quedan juntas, en vez de una viva y otra congelada en la ración
            original. */}
        <div className="flex flex-wrap gap-2">
          {scaledRecipe.kcal != null && (
            <span className="flex items-center gap-1 px-3 py-1 rounded-surface border font-mono text-label font-bold text-accent border-accent/30 bg-accent/10">
              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>local_fire_department</span>
              {scaledRecipe.kcal} kcal
            </span>
          )}
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

        {/* Recetas macros breakdown */}
        {isRecetas && recipe.macros && (
          <div className="grid grid-cols-3 gap-2 bg-raised border border-hairline rounded-surface p-3">
            {[
              { label: 'Carbos', val: recipe.macros.carb },
              { label: 'Proteína', val: recipe.macros.prot },
              { label: 'Grasa', val: recipe.macros.fat },
            ].map(({ label, val }) => (
              <div key={label} className="text-center">
                <span className="block font-sans text-caption text-ink-2 uppercase">{label}</span>
                <span className="block font-bold text-ink text-body-s font-mono">{val}g</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Ingredients */}
        <section className="bg-raised border border-hairline rounded-surface p-5 space-y-3">
          <h2 className="font-sans font-bold text-body-s text-ink uppercase tracking-wider flex items-center gap-2">
            <span className="material-symbols-outlined text-accent text-title-s">grocery</span>
            Ingredientes
          </h2>

          {isRecetas && recipe.ingredientsText && recipe.ingredientsText.length > 0 ? (
            <ul className="space-y-2">
              {recipe.ingredientsText.map((ing, idx) => (
                <li key={idx} className="flex items-center justify-between py-2 border-b border-hairline last:border-0">
                  <span className="text-label text-ink font-sans flex-1 pr-2 leading-relaxed">{ing.name}</span>
                  {/* El índice del recetario NO trae cantidades (pesa la mitad
                      del campo y solo hacen falta con la receta abierta): las
                      repone `getRecipeById` en `openRecipe`. Mientras esa
                      lectura viaja —y para siempre si falla, por ejemplo sin
                      conexión— aquí solo hay nombre, y pintar `{ing.quantity}g`
                      a secas ponía un «undefinedg» junto a cada ingrediente. */}
                  {ing.quantity != null && (
                    <span className="font-mono text-caption text-ink-2 shrink-0">{ing.quantity}g</span>
                  )}
                </li>
              ))}
            </ul>
          ) : !isRecetas && visibleIngredients.length > 0 ? (
            <ul className="space-y-2">
              {visibleIngredients.map((ing, idx) => (
                <li key={idx} className="flex items-center justify-between py-2 border-b border-hairline last:border-0">
                  <span className="text-label text-ink font-sans flex-1 pr-2 leading-relaxed">{ing.foodLabel}</span>
                  <span className={`font-mono text-caption font-bold shrink-0 ${CAT_COLORS[ing.category].split(' ')[0]}`}>
                    ×{ing.quantity}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="font-sans text-label text-ink-2 italic">Sin ingredientes disponibles.</p>
          )}

          {!isRecetas && recipe.extras.length > 0 && (
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
        {((isRecetas && recipe.stepsText && recipe.stepsText.length > 0) ||
          (!isRecetas && recipe.steps.length > 0)) && (
          <section className="bg-raised border border-hairline rounded-surface p-5 space-y-4">
            <h2 className="font-sans font-bold text-body-s text-ink uppercase tracking-wider flex items-center gap-2">
              <span className="material-symbols-outlined text-accent text-title-s">format_list_numbered</span>
              Preparación
            </h2>
            <div className="space-y-4">
              {(isRecetas
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

  // Coach/athlete recipes — shared cache keys with RecipeBuilderScreen/NutritionScreen
  // ('recipes'), WeeklyMenuEditor/MyMenuScreen ('recipeFavorites'), and
  // StepsWidget/NutritionAnalysisPanel/NutritionHubScreen ('athleteNutritionConfig').
  const { data: recipes = [], isPending: loadingRecipes } = useQuery({
    queryKey: ['recipes'],
    queryFn: () => getRecipes(),
  });
  const favoritesKey = ['recipeFavorites', profile.email] as const;
  const { data: favoritesData, isPending: loadingFavorites } = useQuery({
    queryKey: favoritesKey,
    queryFn: () => getRecipeFavorites(profile.email),
  });
  const favorites = favoritesData ?? { athleteId: profile.email, recipeIds: [] };
  // `.has()` en vez de `.includes()` dentro de bucles sobre miles de recetas
  // (el índice completo, en la búsqueda por nombre) — O(1) en vez de O(n).
  const favoritosSet = useMemo(() => new Set(favorites.recipeIds), [favorites.recipeIds]);
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
  // Los tipos de plato (arroces, ensaladas, tortillas…) se preguntan en la ficha
  // de iniciación y el motor de menús ya los respetaba, pero el recetario que
  // navega el atleta los ignoraba: le seguía ofreciendo justo lo que había
  // marcado como excluido y no le adelantaba lo que había pedido tener más.
  const prefs = useMemo(() => ({
    liked:     onboardingData?.likedFoods     ?? [],
    disliked:  onboardingData?.dislikedFoods  ?? [],
    allergies: onboardingData?.allergies      ?? [],
    dietType:  onboardingData?.dietType,
    // Misma precedencia que MenuPreferencesPanel: manda lo que el atleta haya
    // editado luego en su perfil, y la ficha de iniciación es el valor de
    // partida. Leer solo el onboarding dejaría el recetario obedeciendo a
    // respuestas que el atleta ya cambió.
    tiposPreferidos: new Set(nutritionConfig?.preferredDishTypes ?? onboardingData?.preferredDishTypes ?? []),
    tiposExcluidos:  new Set(nutritionConfig?.excludedDishTypes  ?? onboardingData?.excludedDishTypes  ?? []),
    tiempoMaxCocina: nutritionConfig?.cookingMaxTime ?? onboardingData?.cookingMaxTime,
  }), [onboardingData, nutritionConfig]);

  // El generador de menús descarta lo que no cabe en el tiempo de cocina del
  // atleta; aquí no se descarta —navegando puede querer algo para un domingo—
  // pero sí se avisa, para que no abra una receta de hora y media creyendo que
  // le encaja entre semana.
  const excedeTiempoDeCocina = useCallback((r: Recipe) => (
    prefs.tiempoMaxCocina != null && r.cookingTime != null && r.cookingTime > prefs.tiempoMaxCocina
  ), [prefs.tiempoMaxCocina]);
  const [selectedCat, setSelectedCat]   = useState<string>('all');

  const [showDislikedSection, setShowDislikedSection] = useState(false);

  // Recetas browser
  const [recetasCat, setRecetasCat]         = useState<string>('Todas');
  const [recetasIntake, setRecetasIntake]   = useState<number | null>(null);
  const [recetasSearch, setRecetasSearch]   = useState('');
  const recetasSearchDebounced = useDebouncedValue(recetasSearch, 200);
  const [recetasRecipes, setRecetasRecipes] = useState<Recipe[]>([]);
  // Índice completo (8.850 recetas) para que buscar por nombre no se quede
  // mirando solo la página ya paginada (`recetasRecipes`, 48 a la vez) — sin
  // esto, una receta que encaja pero no cayó en las primeras páginas cargadas
  // era invisible para el buscador aunque el índice entero ya estuviera en
  // memoria. `cargarIndiceRecetas` memoiza la promesa: `queryRecetas` (arriba)
  // pide el mismo índice, así que esto no duplica la descarga.
  const [indiceRecetas, setIndiceRecetas] = useState<Recipe[]>([]);
  useEffect(() => { cargarIndiceRecetas().then(setIndiceRecetas); }, []);
  const [recetasCursor, setRecetasCursor]   = useState<RecetasCursor | null>(null);
  const [recetasHasMore, setRecetasHasMore] = useState(false);
  const [recetasLoading, setRecetasLoading] = useState(true);
  const [recetasLoadingMore, setRecetasLoadingMore] = useState(false);
  const [recetasError, setRecetasError] = useState<string | null>(null);

  // Detail
  const [activeRecipe, setActiveRecipe] = useState<Recipe | null>(null);
  const [savingFav, setSavingFav]       = useState(false);
  const [deletingOwn, setDeletingOwn]   = useState(false);

  // ── Recetas paginated load ────────────────────────────────────────────────────

  // Cada carga que NO es "cargar más" (append=false) es una selección de
  // filtro nueva. Sin esto, dos toques rápidos en distintas categorías podían
  // acabar con la respuesta de la PRIMERA pisando a la segunda si llegaba más
  // tarde — no hay AbortController real aquí (queryRecetas filtra en memoria
  // sobre el índice ya cargado, no hay petición de red que cancelar), pero el
  // resultado tardío se puede simplemente descartar en vez de aplicarse.
  const recetasGenRef = useRef(0);

  const loadRecetas = useCallback(async (
    cat: string,
    intake: number | null,
    cursor: RecetasCursor | null,
    append: boolean,
  ) => {
    const generacion = append ? recetasGenRef.current : ++recetasGenRef.current;
    const filters = {
      categoria: cat === 'Todas' ? undefined : cat,
      intakeType: intake ?? undefined,
    };
    try {
      const result = await queryRecetas(filters, cursor);
      if (generacion !== recetasGenRef.current) return null; // el filtro cambió mientras cargaba
      setRecetasRecipes(prev => append ? [...prev, ...result.recipes] : result.recipes);
      setRecetasCursor(result.cursor);
      setRecetasHasMore(result.hasMore);
      setRecetasError(null);
      // Se devuelve además de guardarse en estado: `handleLoadMore` encadena
      // páginas dentro de un mismo clic y no puede esperar al re-render para
      // saber con qué cursor sigue ni cuántas recetas le han valido.
      return result;
    } catch (err) {
      if (generacion !== recetasGenRef.current) return null;
      console.warn('queryRecetas failed:', err);
      setRecetasError('No se pudieron cargar las recetas. Reintenta.');
      // Keep hasMore true so the retry button stays visible; cursor is left
      // untouched so retrying repeats the same (failed) page.
      setRecetasHasMore(true);
      return null;
    }
  }, []);

  // Reset and reload when filters change
  useEffect(() => {
    setRecetasLoading(true);
    setRecetasSearch('');
    loadRecetas(recetasCat, recetasIntake, null, false).finally(() => setRecetasLoading(false));
  }, [recetasCat, recetasIntake, loadRecetas]);

  // Lo que de verdad acaba en pantalla. El filtrado por alergias, tipo de dieta
  // y presupuesto ocurre DESPUÉS de paginar, así que sin esto una página entera
  // podía quedarse en dos tarjetas: se pedían 24 recetas y las preferencias del
  // atleta descartaban 22 en silencio.
  const esVisible = useCallback((r: Recipe) => {
    if (onlyFitsBudget && !fitsBudget(r)) return false;
    if (violatesDietType(r, prefs.dietType)) return false;
    // Un tipo de plato excluido es una decisión explícita del atleta, igual de
    // firme que una alergia a efectos de no enseñárselo.
    if (prefs.tiposExcluidos.size > 0 && prefs.tiposExcluidos.has(dishType(r))) return false;
    return classifyRecipe(r, prefs.liked, prefs.disliked, prefs.allergies) !== 'allergy';
  }, [onlyFitsBudget, fitsBudget, prefs]);

  const handleLoadMore = useCallback(async () => {
    setRecetasLoadingMore(true);
    // Se encadenan páginas hasta juntar recetas visibles de verdad, no hasta
    // completar una lectura. El tope evita quemar lecturas en cadena cuando el
    // recetario se acaba o las preferencias descartan casi todo.
    let cursor = recetasCursor;
    let visibles = 0;
    for (let intento = 0; intento < MAX_PAGINAS_POR_CLIC && visibles < RECETAS_VISIBLES_POR_CLIC; intento++) {
      const result = await loadRecetas(recetasCat, recetasIntake, cursor, true);
      if (!result) break;                       // error: el aviso ya está puesto
      visibles += result.recipes.filter(esVisible).length;
      cursor = result.cursor;
      if (!result.hasMore) break;
    }
    setRecetasLoadingMore(false);
  }, [loadRecetas, recetasCat, recetasIntake, recetasCursor, esVisible]);

  // ── Derived data ────────────────────────────────────────────────────────────

  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    for (const r of recipes) r.categories.forEach(c => set.add(c));
    return Array.from(set);
  }, [recipes]);

  const filteredRecipes = useMemo(() => {
    const base = selectedCat === 'Favoritas' ? recipes.filter(r => favoritosSet.has(r.id))
      : selectedCat === 'MisRecetas' ? recipes.filter(r => r.ownerId === profile.userId)
      : selectedCat === 'all' ? recipes
      : recipes.filter(r => r.categories.includes(selectedCat));
    // Filtro duro: esta lista (recetas del coach/atleta) no miraba alergias ni
    // tipo de dieta en absoluto — el propio autor de la receta puede verla
    // siempre en "Mis recetas", pero no se le ofrece como opción a comer si
    // contiene un alérgeno o rompe su régimen.
    const safe = base.filter(r =>
      selectedCat === 'MisRecetas' ||
      (classifyRecipe(r, [], [], prefs.allergies) !== 'allergy' && !violatesDietType(r, prefs.dietType))
    );
    return onlyFitsBudget ? safe.filter(fitsBudget) : safe;
  }, [recipes, favoritosSet, selectedCat, profile.userId, onlyFitsBudget, fitsBudget, prefs]);

  const { recetasFeatured, recetasNormal, recetasDisliked, recetasTotalVisible } = useMemo(() => {
    const termino = recetasSearchDebounced.trim().toLowerCase();
    // Con término de búsqueda se filtra el ÍNDICE COMPLETO (mismos filtros de
    // categoría/momento que ya aplica queryRecetas para paginar), no solo lo
    // ya paginado — de lo contrario solo aparecían coincidencias que hubieran
    // caído en alguna de las páginas ya cargadas.
    const bySearch = termino
      ? indiceRecetas.filter(r =>
          (recetasCat === 'Todas' || r.categoria === recetasCat) &&
          (recetasIntake == null || (r.intakeTypes ?? []).includes(recetasIntake)) &&
          r.name.toLowerCase().includes(termino))
      : recetasRecipes;
    const searched = onlyFitsBudget ? bySearch.filter(fitsBudget) : bySearch;

    const hasPrefs = prefs.liked.length > 0 || prefs.disliked.length > 0 || prefs.allergies.length > 0 ||
      prefs.tiposPreferidos.size > 0 || prefs.tiposExcluidos.size > 0 || favoritosSet.size > 0 ||
      (!!prefs.dietType && prefs.dietType !== 'omnivoro' && prefs.dietType !== 'otro');
    if (!hasPrefs) {
      return { recetasFeatured: [], recetasNormal: searched, recetasDisliked: [], recetasTotalVisible: searched.length };
    }

    // «Destacadas» reúne, por este orden, lo que el atleta ha dicho que quiere:
    // primero sus favoritas —es la señal más explícita que existe, la marcó
    // receta a receta—, después los tipos de plato que pidió tener más y los
    // ingredientes que le gustan. Antes esta sección solo miraba ingredientes,
    // así que una receta marcada como favorita podía aparecer enterrada entre
    // cientos.
    const favoritas: Recipe[] = [], featured: Recipe[] = [], normal: Recipe[] = [], disliked: Recipe[] = [];
    for (const r of searched) {
      if (!esVisible(r)) continue;
      if (favoritosSet.has(r.id)) { favoritas.push(r); continue; }
      const cls = classifyRecipe(r, prefs.liked, prefs.disliked, prefs.allergies);
      if (cls === 'disliked') { disliked.push(r); continue; }
      if (cls === 'featured' || prefs.tiposPreferidos.has(dishType(r))) featured.push(r);
      else normal.push(r);
    }
    featured.unshift(...favoritas);
    return {
      recetasFeatured: featured,
      recetasNormal:   normal,
      recetasDisliked: disliked,
      recetasTotalVisible: featured.length + normal.length + disliked.length,
    };
  }, [recetasRecipes, indiceRecetas, recetasSearchDebounced, recetasCat, recetasIntake, prefs, onlyFitsBudget, fitsBudget, esVisible, favoritosSet]);

  // ── Favorites ───────────────────────────────────────────────────────────────

  // `useCallback` aquí no es cosmético: RecipeCard/RecetaCard van envueltas
  // en React.memo más abajo, y sin una identidad estable en `onToggleFav`
  // cada tecla en el buscador (o cualquier otro estado de esta pantalla)
  // habría invalidado el memo de las 48+ tarjetas visibles igual que si no
  // estuviera. `favoritesKey` no entra en las dependencias — es un array
  // literal nuevo cada render, así que se reconstruye igual dentro del
  // cuerpo con `profile.email` (que sí es estable).
  const toggleFavorite = useCallback(async (recipeId: string) => {
    const isFav = favoritosSet.has(recipeId);
    const nextFavs: RecipeFavorites = {
      athleteId: profile.email,
      recipeIds: isFav ? favorites.recipeIds.filter(id => id !== recipeId) : [...favorites.recipeIds, recipeId],
      dislikedIds: (favorites.dislikedIds ?? []).filter(id => id !== recipeId), // favorite & dislike are mutually exclusive
    };
    queryClient.setQueryData(['recipeFavorites', profile.email], nextFavs);
    setSavingFav(true);
    try { await saveRecipeFavorites(nextFavs); } finally { setSavingFav(false); }
  }, [favoritosSet, favorites.recipeIds, favorites.dislikedIds, profile.email, queryClient]);

  const toggleDislike = useCallback(async (recipeId: string) => {
    const wasDisliked = (favorites.dislikedIds ?? []).includes(recipeId);
    const nextFavs: RecipeFavorites = {
      athleteId: profile.email,
      recipeIds: favorites.recipeIds.filter(id => id !== recipeId),
      dislikedIds: wasDisliked
        ? (favorites.dislikedIds ?? []).filter(id => id !== recipeId)
        : [...(favorites.dislikedIds ?? []), recipeId],
    };
    queryClient.setQueryData(['recipeFavorites', profile.email], nextFavs);
    setSavingFav(true);
    try { await saveRecipeFavorites(nextFavs); } finally { setSavingFav(false); }
  }, [favorites.recipeIds, favorites.dislikedIds, profile.email, queryClient]);

  // Las recetas del recetario llegan del índice que viaja con la app, y ese
  // índice trae lo justo para la lista: no lleva pasos, cantidades ni macros.
  // Se piden al abrir la receta —una sola lectura, y solo de la que de verdad
  // se va a leer— en vez de traerlas para las 8.850 por si acaso.
  //
  // Se pinta primero lo que ya se tiene (nombre, foto, intercambios) y el resto
  // entra cuando llega: así abrir una receta es inmediato. Si la lectura falla,
  // se queda la versión del índice en lugar de una pantalla de error.
  const openRecipe = useCallback(async (recipe: Recipe) => {
    setActiveRecipe(recipe);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (!OWNER_RECETARIO_TODOS.includes(recipe.ownerId) || recipe.stepsText) return;
    const completa = await getRecipeById(recipe.id);
    // Puede haber cambiado de receta —o cerrado el detalle— mientras se leía.
    if (completa) setActiveRecipe(prev => (prev?.id === recipe.id ? completa : prev));
  }, []);

  // Las comidas ya guardadas que usan esta receta quedan tal cual (los datos
  // se copiaron al añadirla, no referencian la receta en vivo) — solo deja de
  // poder añadirse de nuevo. Se avisa de esto en el propio botón de confirmar.
  const handleDeleteRecipe = async (recipeId: string) => {
    setDeletingOwn(true);
    try {
      await deleteRecipe(recipeId);
      queryClient.setQueryData<Recipe[]>(['recipes'], prev => prev?.filter(r => r.id !== recipeId));
      setActiveRecipe(null);
    } finally {
      setDeletingOwn(false);
    }
  };

  // ── Detail view ─────────────────────────────────────────────────────────────

  if (activeRecipe) {
    return (
      <RecipeDetail
        recipe={activeRecipe}
        isFav={favoritosSet.has(activeRecipe.id)}
        isDisliked={(favorites.dislikedIds ?? []).includes(activeRecipe.id)}
        isOwn={activeRecipe.ownerId === profile.userId}
        enabledModes={enabledModes}
        savingFav={savingFav}
        deletingOwn={deletingOwn}
        dailyBudgetTotal={dailyBudgetTotal}
        onBack={() => setActiveRecipe(null)}
        onToggleFav={toggleFavorite}
        onToggleDislike={toggleDislike}
        onDelete={handleDeleteRecipe}
        onAddToIntercambios={onAddToIntercambios}
      />
    );
  }

  // ── Gallery view ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-sans font-extrabold text-display tracking-tight text-ink">Recetas</h1>
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
          <h2 className="font-sans font-bold text-body-s text-ink uppercase tracking-wider flex items-center gap-2">
            <span className="material-symbols-outlined text-accent text-title-s">restaurant_menu</span>
            Recetas del programa
          </h2>

          <div className="w-full overflow-x-auto hide-scrollbar -mx-4 px-4 md:mx-0 md:px-0">
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
              <RecipeCard recipe={filteredRecipes[0]} isFav={favoritosSet.has(filteredRecipes[0].id)} large onOpen={openRecipe} onToggleFav={toggleFavorite} />
              {filteredRecipes.slice(1).map(r => (
                <RecipeCard key={r.id} recipe={r} isFav={favoritosSet.has(r.id)} onOpen={openRecipe} onToggleFav={toggleFavorite} />
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

      {/* ── Biblioteca de recetas (paginated, backed by the Recetas dataset — never shown to the user) ──── */}
      <section className="space-y-4">
        <h2 className="font-sans font-bold text-body-s text-ink uppercase tracking-wider flex items-center gap-2">
          <span className="material-symbols-outlined text-data text-title-s">library_books</span>
          Biblioteca de recetas
          <span className="font-mono text-caption text-ink-2 normal-case font-normal">8 850 recetas</span>
        </h2>

        {/* Category filter */}
        {/* Dos desplegables en vez de dos filas de chips (petición de Dani,
            14-08). Entre la tira de categorías —que además se cortaba a la
            derecha con su barra de scroll— y los seis chips de momento se iba
            media pantalla del móvil antes de enseñar una sola receta. Con
            `Select` la lista la dibuja iOS como rueda a pantalla completa, que
            para elegir una de seis opciones va mejor que una fila que hay que
            arrastrar. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select
            label="Categoría"
            value={recetasCat}
            onChange={setRecetasCat}
            options={RECETAS_CATS.map(cat => ({ value: cat, label: cat }))}
          />
          <Select
            label="Momento del día"
            value={recetasIntake === null ? '' : String(recetasIntake)}
            onChange={v => setRecetasIntake(v === '' ? null : Number(v))}
            options={[
              { value: '', label: 'Todos los momentos' },
              ...Object.entries(INTAKE_LABELS).map(([k, label]) => ({ value: k, label })),
            ]}
          />
        </div>

        {/* Name search */}
        <SearchField
          value={recetasSearch}
          onChange={setRecetasSearch}
          placeholder="Buscar entre 8.850 recetas…"
          label="Buscar en la biblioteca de recetas"
        />

        {/* Grid */}
        {recetasLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            <Skeleton className="h-40 w-full rounded-surface" />
            <Skeleton className="h-40 w-full rounded-surface" />
            <Skeleton className="h-40 w-full rounded-surface" />
            <Skeleton className="h-40 w-full rounded-surface" />
          </div>
        ) : recetasTotalVisible === 0 && recetasError ? (
          <div className="flex flex-col items-center gap-3 py-10">
            <p className="font-sans text-label text-red-300 uppercase tracking-widest text-center">{recetasError}</p>
            <button
              onClick={handleLoadMore}
              disabled={recetasLoadingMore}
              className="px-6 py-3 bg-raised border border-hairline hover:border-accent/50 text-ink-2 hover:text-ink font-sans text-label uppercase tracking-wider rounded-control transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {recetasLoadingMore
                ? <><span className="material-symbols-outlined text-body-s animate-spin">progress_activity</span>Cargando…</>
                : <><span className="material-symbols-outlined text-body-s">refresh</span>Reintentar</>
              }
            </button>
          </div>
        ) : recetasTotalVisible === 0 ? (
          <EmptyState
            icon="search_off"
            title={recetasSearch ? `Nada para «${recetasSearch}»` : 'Sin recetas para estos filtros.'}
            description={onlyFitsBudget ? 'Prueba con otro término, o quita el filtro de presupuesto.' : undefined}
            actionLabel={onlyFitsBudget ? 'Quitar presupuesto' : undefined}
            onAction={onlyFitsBudget ? () => setOnlyFitsBudget(false) : undefined}
          />
        ) : (
          <div className="space-y-6">
            <p className="font-sans text-caption text-ink-2 uppercase">
              {recetasSearch
                ? `${recetasTotalVisible} de ${recetasRecipes.length} resultados en esta página`
                : `${recetasRecipes.length} receta${recetasRecipes.length !== 1 ? 's' : ''} cargada${recetasRecipes.length !== 1 ? 's' : ''}${recetasHasMore ? ' · hay más' : ''}`
              }
            </p>

            {/* ── Destacadas: favoritas primero, luego tipos de plato pedidos e
                   ingredientes que le gustan ── */}
            {recetasFeatured.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-amber-400 text-body-s" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                  <h3 className="font-sans text-caption text-amber-400 uppercase tracking-wider font-bold">
                    Destacadas para ti ({recetasFeatured.length})
                  </h3>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {recetasFeatured.map(r => (
                    <RecetaCard
                      key={r.id}
                      recipe={r}
                      isFav={favoritosSet.has(r.id)}
                      isFeatured
                      onOpen={openRecipe}
                      excedeTiempo={excedeTiempoDeCocina(r)}
                      onToggleFav={toggleFavorite}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* ── Normal recipes ── */}
            {recetasNormal.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {recetasNormal.map(r => (
                  <RecetaCard
                    key={r.id}
                    recipe={r}
                    isFav={favoritosSet.has(r.id)}
                    onOpen={openRecipe}
                    excedeTiempo={excedeTiempoDeCocina(r)}
                    onToggleFav={toggleFavorite}
                  />
                ))}
              </div>
            )}

            {/* ── With disliked ingredients (collapsible) ── */}
            {recetasDisliked.length > 0 && (
              <div className="space-y-2">
                <button
                  onClick={() => setShowDislikedSection(v => !v)}
                  className="flex items-center gap-2 w-full text-left group"
                >
                  <span className="material-symbols-outlined text-body-s text-ink-3 group-hover:text-ink-2 transition-colors">
                    {showDislikedSection ? 'expand_less' : 'expand_more'}
                  </span>
                  <span className="font-sans text-caption text-ink-3 group-hover:text-ink-2 uppercase tracking-wider transition-colors">
                    Con ingredientes que no te gustan ({recetasDisliked.length})
                  </span>
                </button>
                {showDislikedSection && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 opacity-50">
                    {recetasDisliked.map(r => (
                      <RecetaCard
                        key={r.id}
                        recipe={r}
                        isFav={favoritosSet.has(r.id)}
                        onOpen={openRecipe}
                        excedeTiempo={excedeTiempoDeCocina(r)}
                        onToggleFav={toggleFavorite}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {recetasError && (
              <div className="flex flex-col items-center gap-2 pt-2">
                <p className="font-sans text-caption text-red-300 uppercase tracking-wide">{recetasError}</p>
              </div>
            )}

            {recetasHasMore && !recetasSearch && (
              <div className="flex justify-center pt-2">
                <button
                  onClick={handleLoadMore}
                  disabled={recetasLoadingMore}
                  className="px-6 py-3 bg-raised border border-hairline hover:border-accent/50 text-ink-2 hover:text-ink font-sans text-label uppercase tracking-wider rounded-control transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  {recetasLoadingMore
                    ? <><span className="material-symbols-outlined text-body-s animate-spin">progress_activity</span>Cargando…</>
                    : <><span className="material-symbols-outlined text-body-s">expand_more</span>{recetasError ? 'Reintentar' : 'Cargar más recetas'}</>
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
