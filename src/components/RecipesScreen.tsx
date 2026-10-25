import { useReglasDeReceta } from '../hooks/useReglasDeReceta';
import { recetaPermitida } from '../utils/reglasDeReceta';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { superaElTiempo, minutosDeReceta } from '../utils/tiempoDeReceta';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  UserProfile, Recipe, RecipeFavorites, FoodCategory, DietMode, RecetaPendiente } from '../types';
import {
  getRecipes, getRecipeFavorites, saveRecipeFavorites, deleteRecipe,
  getAthleteNutritionConfig, cargarIndiceRecetas, getOnboarding,
  getDietsForAthlete, getAthleteDietConfig, OWNER_RECETARIO_TODOS, getRecipeById,
  getDietCompletionLogsForAthlete, getNutritionProgram,
} from '../dbService';
import { esPlatoDelRecetario } from '../db/recetasHidratacion';
import { useRecomendadasDelCoach, useModoRecetario } from '../hooks/useReglasDeReceta';
import { entraEnRecetario } from '../utils/accesoARecetas';
import RecetarioDescubrir, { type FilaPersonal } from './RecetarioDescubrir';
import { cupoDeLaProximaComida, recetasMasHechas } from '../utils/coleccionesRecetario';
import { resolveSlots } from '../utils/mealDistribution';
import { hoyIsoLocal } from '../utils/trainingWeek';
import { classifyRecipe, violatesDietType } from '../utils/foodPrefs';
import { athleteConditions } from '../utils/dietaryRestrictions';
import { dietTypeVigente } from '../utils/foodPrefs';
import { dishType } from '../utils/dishTypes';
import { BUDGET_CATS, roundQuarter, CAT_COLOR, CAT_BG } from '../utils/exchangeHelpers';
import { objetivoDelDia } from '../utils/objetivoDelDia';
import { fotoDeReceta } from '../utils/fotoDeReceta';
import { escalarRecetaEntera } from '../utils/escalarRecetaEntera';
import FotoDeReceta from './FotoDeReceta';
import { Skeleton } from './ui';
import { EmptyState, Badge, Chip, Button, ListRow } from './ui';
import { pulsable } from '../utils/a11y';

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

const INTAKE_LABELS: Record<number, string> = {
  1: 'Desayuno',
  2: 'Media mañana',
  3: 'Comida',
  4: 'Merienda',
  5: 'Cena',
};

// Días de registro que se miran para «Las que más haces».
const DIAS_MAS_HECHAS = 30;

// ── Sub-components ────────────────────────────────────────────────────────────

function RecipePlaceholder() {
  return (
    <div className="w-full h-full bg-gradient-to-br from-accent/10 to-transparent flex items-center justify-center">
      <span className="material-symbols-outlined text-display text-ink-5">skillet</span>
    </div>
  );
}

/* Fila compacta para una receta SIN foto. Las que el atleta guarda desde una
   comida de su plan (`confirmSaveMealAsRecipe`) nunca llevan foto por
   construcción, y la tarjeta grande les reservaba 220-360 px de alto para
   pintar un marcador de posición gris: tres dedos de pantalla para decir un
   nombre y tres intercambios (Dani, 10-09-2026). Con foto se mantiene la
   tarjeta, que ahí el espacio sí lo justifica la imagen. */
const RecetaFilaCompacta = React.memo(function RecetaFilaCompacta({ recipe, isFav, onOpen, onToggleFav }: CardProps) {
  const exchStr = formatExchanges(calcExchanges(recipe));
  return (
    /* El botón de favorita va FUERA de la ListRow, no en su `trailing`: con
       `onClick`, ListRow es ella misma un `<button>`, y un botón dentro de otro
       es HTML inválido — además el nombre que anuncia el lector de pantalla se
       calcula del texto de dentro, así que la fila se leía «Tortilla de patata,
       3 int., Marcar como favorita». Dos hermanos en una fila flex. */
    <div className="col-span-1 md:col-span-12 flex items-center bg-raised border border-hairline rounded-surface pr-1">
      <ListRow
        className="min-w-0 flex-1"
        title={recipe.name}
        subtitle={[exchStr, recipe.kcal != null ? `${recipe.kcal} kcal` : null].filter(Boolean).join(' · ')}
        leading={
          <span className="w-9 h-9 rounded-control bg-accent-bg border border-accent/20 flex items-center justify-center">
            <span className="material-symbols-outlined text-body-s text-accent-ink select-none">skillet</span>
          </span>
        }
        onClick={() => onOpen(recipe)}
      />
      <button
        type="button"
        onClick={() => onToggleFav(recipe.id)}
        aria-pressed={isFav}
        aria-label={`${recipe.name}, favorita`}
        className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center hover:bg-veil/30 transition-colors"
      >
        <span
          className="material-symbols-outlined text-title-s"
          style={{ fontVariationSettings: isFav ? "'FILL' 1" : "'FILL' 0", color: isFav ? 'var(--color-on-veil-accent)' : 'var(--color-on-veil-2)' }}
        >favorite</span>
      </button>
    </div>
  );
});

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
      {...pulsable(() => onOpen(recipe), `Abrir la receta ${recipe.name}`)}
      className={`${colSpan} group relative rounded-surface overflow-hidden bg-raised border border-hairline ${minH} flex flex-col justify-end cursor-pointer hover:border-accent/40 transition-all`}
    >
      <FotoDeReceta
        src={photo}
        alt={recipe.name}
        className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:scale-105 transition-transform duration-500"
        fallback={<div className="absolute inset-0"><RecipePlaceholder /></div>}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-veil/90 via-veil/40 to-transparent" />

      <button
        onClick={e => { e.stopPropagation(); onToggleFav(recipe.id); }}
        className="absolute top-3 right-3 w-8 h-8 rounded-full bg-veil/50 backdrop-blur-sm flex items-center justify-center hover:bg-veil/70 transition-colors z-10"
      >
        <span
          className="material-symbols-outlined text-title-s"
          style={{ fontVariationSettings: isFav ? "'FILL' 1" : "'FILL' 0", color: isFav ? 'var(--color-on-veil-accent)' : 'var(--color-on-veil-2)' }}
        >favorite</span>
      </button>

      <div className="relative z-10 p-4 space-y-2">
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tags.map(c => (
              <span key={c} className="px-2 rounded-full bg-veil/60 backdrop-blur-sm text-on-veil-2 font-mono text-caption uppercase tracking-wider border border-hairline">{c}</span>
            ))}
          </div>
        )}
        <h3 className={`font-sans font-bold text-on-veil group-hover:text-on-veil-accent transition-colors leading-tight ${large ? 'text-title-l' : 'text-title-s'}`}>
          {recipe.name}
        </h3>
        {exchStr !== '—' && (
          <p className="font-mono text-caption text-on-veil-accent/80 font-bold">{exchStr}</p>
        )}
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
  onAddToIntercambios?: (pendiente: RecetaPendiente) => void;
  /** Para mirarla desde otra pantalla (el tablero de recetas del coach): sin
   *  barra de volver, favorita, «no me gusta» ni borrar. */
  soloLectura?: boolean;
}


export function RecipeDetail({ recipe, isFav, isDisliked, isOwn, enabledModes, savingFav, deletingOwn, dailyBudgetTotal, onBack, onToggleFav, onToggleDislike, onDelete, onAddToIntercambios, soloLectura = false }: DetailProps) {
  const [checkedSteps, setCheckedSteps] = useState<Record<number, boolean>>({});
  const [scale, setScale] = useState(1);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Antes solo comparaba contra 'recetas' — las recetas importadas con el
  // ownerId heredado 'indya' (miles de ellas, ver comentario en db/recipes.ts)
  // caían por el hueco y se trataban como receta propia sin ingredientes.
  const isRecetas = OWNER_RECETARIO_TODOS.includes(recipe.ownerId);
  const scaledRecipe = useMemo(() => escalarRecetaEntera(recipe, scale), [recipe, scale]);
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
      {!soloLectura && <div className="flex items-center justify-between bg-raised px-4 py-3 rounded-surface border border-hairline">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-ink-2 hover:text-accent-ink transition-colors font-sans text-label uppercase tracking-wider"
        >
          <span className="material-symbols-outlined text-body-s">arrow_back</span>
          Recetas
        </button>
        <div className="flex items-center gap-4">
          <button
            onClick={() => onToggleFav(recipe.id)}
            disabled={savingFav}
            className="flex items-center gap-2 text-label font-mono font-bold uppercase tracking-wider transition-transform duration-(--duration-state) ease-brand active:scale-90 disabled:opacity-50"
            style={{ color: isFav ? 'var(--color-on-veil-accent)' : 'var(--color-on-veil-2)' }}
          >
            <span
              className="material-symbols-outlined text-title-m transition-colors duration-(--duration-state)"
              style={{ fontVariationSettings: isFav ? "'FILL' 1" : "'FILL' 0", color: isFav ? 'var(--color-on-veil-accent)' : 'var(--color-on-veil-2)' }}
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
      </div>}

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
                <span className="material-symbols-outlined text-accent-ink" style={{ fontSize: '12px' }}>local_fire_department</span>
                {recipe.kcal} kcal
              </span>
            )}
            {recipe.cookingTime != null && (
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>schedule</span>
                ~{minutosDeReceta(recipe)} min
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
            <span className="flex items-center gap-1 px-3 py-1 rounded-surface border font-mono text-label font-bold text-accent-ink border-accent/30 bg-accent/10">
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
              <span className="font-mono text-title-s font-bold text-accent-ink">×{String(scale).replace('.', ',')}</span>
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
              <div className={`flex items-center gap-2 mt-4 px-4 py-3 rounded-field border transition-colors duration-(--duration-state) ${fitsBudget ? 'bg-success/10 border-success/30 text-success' : 'bg-accent-bg border-accent-line text-accent-ink'}`}>
                <span className={`h-1.5 w-1.5 rounded-full flex-none ${fitsBudget ? 'bg-success' : 'bg-accent'}`} />
                <span className="font-mono text-label font-semibold tracking-[.04em]">
                  {fitsBudget ? 'CABE EN TU PRESUPUESTO DE HOY' : 'SE SALE DE TU PRESUPUESTO DE HOY'}
                </span>
              </div>
            )}

            {onAddToIntercambios && (
              <Button variant="primary" size="l" fullWidth onClick={() => onAddToIntercambios({ recipe: scaledRecipe })} className="mt-3">
                Añadir a la comida
              </Button>
            )}
            <p className="text-center font-mono text-caption tracking-[.08em] text-ink-4 mt-3">
              LA ESCALA RECALCULA EN VIVO · EL AJUSTE PARA EN ×0,25
            </p>
          </div>
        )}

        {/* Recetas macros breakdown — con la ESCALA aplicada, como las kcal y
            los ingredientes de arriba. Leía `recipe.macros` sin escalar, así
            que poner la receta a ×2 doblaba kcal e ingredientes y dejaba los
            gramos de macros clavados, justo debajo del renglón que promete que
            «la escala recalcula en vivo». */}
        {isRecetas && scaledRecipe.macros && (
          <div className="grid grid-cols-3 gap-2 bg-raised border border-hairline rounded-surface p-3">
            {[
              { label: 'Carbos', val: scaledRecipe.macros.carb },
              { label: 'Proteína', val: scaledRecipe.macros.prot },
              { label: 'Grasa', val: scaledRecipe.macros.fat },
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
            <span className="material-symbols-outlined text-accent-ink text-title-s">grocery</span>
            Ingredientes
          </h2>

          {isRecetas && scaledRecipe.ingredientsText && scaledRecipe.ingredientsText.length > 0 ? (
            <ul className="space-y-2">
              {scaledRecipe.ingredientsText.map((ing, idx) => (
                <li key={idx} className="flex items-center justify-between py-2 border-b border-hairline last:border-0">
                  <span className="text-label text-ink font-sans flex-1 pr-2 leading-relaxed">{ing.name}</span>
                  {/* El índice del recetario NO trae cantidades (pesa la mitad
                      del campo y solo hacen falta con la receta abierta): las
                      repone `getRecipeById` en `openRecipe`. Mientras esa
                      lectura viaja —y para siempre si falla, por ejemplo sin
                      conexión— aquí solo hay nombre, y pintar `{ing.quantity}g`
                      a secas ponía un «undefinedg» junto a cada ingrediente. */}
                  {ing.quantity != null && Number.isFinite(ing.quantity) && (
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
              <span className="material-symbols-outlined text-accent-ink text-title-s">format_list_numbered</span>
              Preparación
            </h2>
            <div className="space-y-4">
              {(isRecetas
                ? (recipe.stepsText ?? []).map((s, i) => ({ idx: i, text: s.description, items: s.items ?? [] }))
                : recipe.steps.map((s, i) => ({ idx: i, text: s, items: [] as { position: number; description: string }[] }))
              ).map(({ idx, text, items }) => {
                const done = !!checkedSteps[idx];
                return (
                  <div
                    key={idx}
                    {...pulsable(() => setCheckedSteps(prev => ({ ...prev, [idx]: !prev[idx] })), `Paso ${idx + 1}${done ? ', hecho' : ''}`)}
                    aria-pressed={done}
                    className="flex gap-3 group cursor-pointer"
                  >
                    <div className="flex flex-col items-center shrink-0">
                      <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center font-mono text-caption font-bold transition-all ${done ? 'bg-accent border-accent text-on-accent' : 'border-hairline text-ink-2 group-hover:border-accent/50'}`}>
                        {done ? <span className="material-symbols-outlined text-label font-bold">check</span> : idx + 1}
                      </div>
                    </div>
                    <div className="pt-1 pb-3 min-w-0">
                      <p className={`text-label font-sans leading-relaxed transition-colors ${done ? 'text-ink-5 line-through' : 'text-ink-2'}`}>
                        {text}
                      </p>
                      {/* Lo que cuelga del paso. Casi todos los pasos del
                          recetario son "Coloca en un bol y mezcla bien:" + una
                          lista, y sin esto la preparación se quedaba en la
                          frase acabada en dos puntos. */}
                      {items.length > 0 && (
                        <ul className={`mt-1 space-y-0.5 transition-colors ${done ? 'text-ink-5 line-through' : 'text-ink-2'}`}>
                          {items.map(sub => (
                            <li key={sub.position} className="text-label font-sans leading-relaxed flex gap-2">
                              <span aria-hidden="true" className="text-ink-3">·</span>
                              <span>{sub.description.trim()}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
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
  onAddToIntercambios?: (pendiente: RecetaPendiente) => void;
}

export default function RecipesScreen({ profile, onAddToIntercambios }: Props) {
  const queryClient = useQueryClient();

  // Coach/athlete recipes — shared cache keys with RecipeBuilderScreen/NutritionScreen
  // ('recipes'), WeeklyMenuEditor/MyMenuScreen ('recipeFavorites'), and
  // StepsWidget/NutritionAnalysisPanel/NutritionHubScreen ('athleteNutritionConfig').
  const { data: recipes = [], isPending: loadingRecipes } = useQuery({
    queryKey: ['recipes', profile.userId],
    queryFn: () => getRecipes({ ownerId: profile.userId }),
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
  // Lo que le toca hoy, resuelto como en Inicio y Nutrición (utils/objetivoDelDia.ts).
  const { data: programaNutri = null } = useQuery({
    queryKey: ['nutritionProgram', profile.email],
    queryFn: () => getNutritionProgram(profile.email).catch(() => null),
  });
  const objetivoHoy = useMemo(
    () => objetivoDelDia({ diets, config: dietConfig, program: programaNutri, fecha: hoyIsoLocal() }),
    [diets, dietConfig, programaNutri],
  );
  const dailyBudgetTotal = useMemo(() => {
    const d = objetivoHoy.dieta;
    if (!d) return null;
    return BUDGET_CATS.reduce((s, c) => s + (d.budget[c] ?? 0), 0);
  }, [objetivoHoy]);
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
  const recetasOcultas = useReglasDeReceta(profile.email);
  const modoRecetario = useModoRecetario(profile.email);
  const recomendadasDelCoach = useRecomendadasDelCoach(profile.email);
  const prefs = useMemo(() => ({
    liked:     onboardingData?.likedFoods     ?? [],
    disliked:  onboardingData?.dislikedFoods  ?? [],
    allergies: onboardingData?.allergies      ?? [],
    // Filtro duro por condición de salud: sin esto el recetario le ofrecía al
    // celíaco recetas con seitán aunque el menú generado ya no se las pusiera.
    conditions: athleteConditions(onboardingData),
    dietType:  dietTypeVigente(nutritionConfig?.dietType, onboardingData?.dietType),
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
  const excedeTiempoDeCocina = useCallback(
    (r: Recipe) => superaElTiempo(r, prefs.tiempoMaxCocina),
    [prefs.tiempoMaxCocina],
  );
  const [selectedCat, setSelectedCat]   = useState<string>('all');


  /* El recetario entero (8.850) en memoria: la portada «Descubrir» calcula sus
     colecciones y su buscador sobre él. `cargarIndiceRecetas` memoiza la
     promesa, así que no se descarga dos veces. Antes se paginaba de 48 en 48
     con dos desplegables, y para dar con algo había que saber qué buscar. */
  const [indiceRecetas, setIndiceRecetas] = useState<Recipe[]>([]);
  /* Y en qué estado está esa carga. Sin esto, mientras el índice no estaba (aún
     bajando, o porque falló) el buscador contestaba «Nada para X» — o sea, "esa
     receta no existe" — cuando lo que pasaba es que no había dónde buscar. Es
     la diferencia entre "no la tenemos" y "no he podido mirar". */
  const [indiceEstado, setIndiceEstado] = useState<'cargando' | 'listo' | 'error'>('cargando');
  const cargarIndice = useCallback(() => {
    setIndiceEstado('cargando');
    cargarIndiceRecetas()
      .then(rs => { setIndiceRecetas(rs); setIndiceEstado(rs.length > 0 ? 'listo' : 'error'); })
      .catch(() => setIndiceEstado('error'));
  }, []);
  useEffect(() => { cargarIndice(); }, [cargarIndice]);

  // Detail
  const [activeRecipe, setActiveRecipe] = useState<Recipe | null>(null);
  const [savingFav, setSavingFav]       = useState(false);
  const [deletingOwn, setDeletingOwn]   = useState(false);

  // Lo que de verdad acaba en pantalla. El filtrado por alergias, tipo de dieta
  // y presupuesto ocurre DESPUÉS de paginar, así que sin esto una página entera
  // podía quedarse en dos tarjetas: se pedían 24 recetas y las preferencias del
  // atleta descartaban 22 en silencio.
  const esVisible = useCallback((r: Recipe) => {
    if (onlyFitsBudget && !fitsBudget(r)) return false;
    if (violatesDietType(r, prefs.dietType)) return false;
    // El coach la ha escondido a este atleta (en el recetario, que no tiene día,
    // solo cuentan las reglas de todos los días).
    if (!recetaPermitida(r.id, recetasOcultas, 'recetario')) return false;
    // Recetario acotado por el coach a las recetas que le recomienda.
    if (!entraEnRecetario(r.id, modoRecetario, recomendadasDelCoach)) return false;
    // Un tipo de plato excluido es una decisión explícita del atleta, igual de
    // firme que una alergia a efectos de no enseñárselo.
    if (prefs.tiposExcluidos.size > 0 && prefs.tiposExcluidos.has(dishType(r))) return false;
    return classifyRecipe(r, prefs.liked, prefs.disliked, prefs.allergies, prefs.conditions) !== 'allergy';
  }, [onlyFitsBudget, fitsBudget, prefs, recetasOcultas, modoRecetario, recomendadasDelCoach]);

  // ── Derived data ────────────────────────────────────────────────────────────

  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    for (const r of recipes) r.categories.forEach(c => set.add(c));
    return Array.from(set);
  }, [recipes]);

  const filteredRecipes = useMemo(() => {
    // OJO: `recipes` son SOLO las del propio usuario (getRecipes filtra por
    // ownerId), así que "Todas" y "Mis recetas" enseñaban exactamente lo mismo
    // y las recetas propias salían siempre, empujando la biblioteca fuera de
    // la primera pantalla. Bajo "Todas" esta sección se queda vacía a
    // propósito: las propias viven en su chip (Dani, 10-09-2026).
    const base = selectedCat === 'Favoritas' ? recipes.filter(r => favoritosSet.has(r.id))
      : selectedCat === 'MisRecetas' ? recipes.filter(r => r.ownerId === profile.userId)
      : selectedCat === 'all' ? []
      : recipes.filter(r => r.categories.includes(selectedCat));
    // Filtro duro: esta lista (recetas del coach/atleta) no miraba alergias ni
    // tipo de dieta en absoluto — el propio autor de la receta puede verla
    // siempre en "Mis recetas", pero no se le ofrece como opción a comer si
    // contiene un alérgeno o rompe su régimen.
    const safe = base.filter(r =>
      selectedCat === 'MisRecetas' ||
      (classifyRecipe(r, [], [], prefs.allergies, prefs.conditions) !== 'allergy' && !violatesDietType(r, prefs.dietType))
    );
    return onlyFitsBudget ? safe.filter(fitsBudget) : safe;
  }, [recipes, favoritosSet, selectedCat, profile.userId, onlyFitsBudget, fitsBudget, prefs]);

  /* El pool de la portada: lo que este atleta puede ver, en el orden en que lo
     quiere. Primero sus favoritas —la señal más explícita que hay, la marcó
     receta a receta—, luego los tipos de plato que pidió tener más y los
     ingredientes que le gustan, el resto, y al final lo que lleva algo que no
     le gusta (no se esconde: puede que hoy le apetezca). */
  const poolDescubrir = useMemo(() => {
    const favs: Recipe[] = [], destacadas: Recipe[] = [], normales: Recipe[] = [], noGustan: Recipe[] = [];
    for (const r of indiceRecetas) {
      if (!esPlatoDelRecetario(r) || !esVisible(r)) continue;
      if (favoritosSet.has(r.id)) { favs.push(r); continue; }
      const cls = classifyRecipe(r, prefs.liked, prefs.disliked, prefs.allergies, prefs.conditions);
      if (cls === 'disliked') noGustan.push(r);
      else if (cls === 'featured' || prefs.tiposPreferidos.has(dishType(r))) destacadas.push(r);
      else normales.push(r);
    }
    return [...favs, ...destacadas, ...normales, ...noGustan];
  }, [indiceRecetas, esVisible, favoritosSet, prefs]);

  /* La fila «Encajan en tu comida»: el reparto que el coach puso a la próxima
     comida de hoy, en la dieta que toca hoy (la del calendario semanal o, sin
     calendario, la primera activa). Día libre o sin reparto = sin fila. */
  const cupoProxima = useMemo(() => {
    if (objetivoHoy.origen === 'libre') return null;
    const ahora = new Date();
    return cupoDeLaProximaComida(objetivoHoy.dieta?.meals, resolveSlots, ahora.getHours() + ahora.getMinutes() / 60);
  }, [objetivoHoy]);

  /* Lo que el atleta ha comido de verdad el último mes, para «Las que más
     haces». Una lectura por día registrado (~30 como mucho) y se guarda diez
     minutos: no se vuelve a pedir cada vez que entra en la pestaña. */
  const desdeMasHechas = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - DIAS_MAS_HECHAS);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);
  const { data: registrosRecientes = [] } = useQuery({
    queryKey: ['dietCompletionLogs', profile.email, 'desde', desdeMasHechas],
    queryFn: () => getDietCompletionLogsForAthlete(profile.email, desdeMasHechas),
    staleTime: 10 * 60_000,
  });
  const recomendadasIds = useRecomendadasDelCoach(profile.email);
  const filasPersonales = useMemo<FilaPersonal[]>(() => {
    const enPool = new Map(poolDescubrir.map(r => [r.id, r]));
    const propias = new Map(recipes.map(r => [r.id, r]));
    const buscar = (id: string) => enPool.get(id) ?? propias.get(id);
    return [
      {
        id: 'coach', titulo: 'Recomendadas por tu entrenador', icono: 'star',
        recetas: recomendadasIds.map(id => enPool.get(id)).filter((r): r is Recipe => !!r),
      },
      {
        id: 'mas_hechas', titulo: 'Las que más haces', icono: 'history', subtitulo: 'Lo que más has comido este último mes.',
        recetas: recetasMasHechas(registrosRecientes).map(x => buscar(x.recipeId)).filter((r): r is Recipe => !!r),
      },
    ];
  }, [poolDescubrir, recipes, recomendadasIds, registrosRecientes]);


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
      queryClient.setQueryData<Recipe[]>(['recipes', profile.userId], prev => prev?.filter(r => r.id !== recipeId));
      setActiveRecipe(null);
    } finally {
      setDeletingOwn(false);
    }
  };

  // ── Detail view ─────────────────────────────────────────────────────────────

  const detalle = activeRecipe && (
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


  // ── Gallery view ─────────────────────────────────────────────────────────────

  return (
    <>
    {detalle}
    {/* La portada sigue montada mientras se lee una receta: al volver, la
        colección que tenías abierta sigue ahí en vez de devolverte al principio. */}
    <div className="space-y-6" hidden={!!activeRecipe}>
      {/* Sin cabecera propia — ver NutritionScreen. */}

      {/* "Cabe en mi presupuesto" — primer chip, seleccionado por defecto (handoff, panel 03) */}
      {dailyBudgetTotal != null && (
        <Chip selected={onlyFitsBudget} onClick={() => setOnlyFitsBudget(v => !v)} icon="check_circle">
          Cabe en mi presupuesto
        </Chip>
      )}

      {/* ── Recetas propias ──────────────────────────────────────────────────
          Con "Todas" puesto (el estado de entrada) esto es UNA fila: al abrir
          Recetas lo primero que se ve es la biblioteca con su buscador, sus
          categorías y su momento del día, no la lista de recetas propias
          ocupando media pantalla (Dani, 10-09-2026). */}
      {!loading && recipes.length > 0 && selectedCat === 'all' && (
        <ListRow
          className="bg-raised border border-hairline rounded-surface"
          title="Mis recetas"
          subtitle={`${recipes.length} ${recipes.length === 1 ? 'receta guardada' : 'recetas guardadas'}`}
          leading={
            <span className="w-9 h-9 rounded-control bg-accent-bg border border-accent/20 flex items-center justify-center">
              <span className="material-symbols-outlined text-body-s text-accent-ink select-none">restaurant_menu</span>
            </span>
          }
          chevron
          onClick={() => setSelectedCat('MisRecetas')}
        />
      )}

      {!loading && recipes.length > 0 && selectedCat !== 'all' && (
        <section className="space-y-4">
          <h2 className="font-sans font-bold text-body-s text-ink uppercase tracking-wider flex items-center gap-2">
            <span className="material-symbols-outlined text-accent-ink text-title-s">restaurant_menu</span>
            Mis recetas
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
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              {filteredRecipes.map((r, i) => (
                fotoDeReceta(r)
                  // Solo la primera CON foto se pinta en grande: destacar una
                  // sin foto era estirar un marcador de posición a 360 px.
                  ? <RecipeCard key={r.id} recipe={r} isFav={favoritosSet.has(r.id)} large={i === 0} onOpen={openRecipe} onToggleFav={toggleFavorite} />
                  : <RecetaFilaCompacta key={r.id} recipe={r} isFav={favoritosSet.has(r.id)} onOpen={openRecipe} onToggleFav={toggleFavorite} />
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

      <RecetarioDescubrir
        pool={poolDescubrir}
        estado={indiceEstado}
        onReintentar={cargarIndice}
        favoritas={favoritosSet}
        onElegir={openRecipe}
        onFavorita={toggleFavorite}
        cupo={cupoProxima}
        filasPersonales={filasPersonales}
        excedeTiempo={excedeTiempoDeCocina}
      />
    </div>
    </>
  );
}
