import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Recipe, RecipeIngredient, MealItem, FoodCategory } from '../types';
import LimpiarRecetario from './recetario/LimpiarRecetario';
import { getRecipes, createRecipe, updateRecipe, deleteRecipe, getFoodItems, cargarIndiceRecetas, getRecipeById, cambiarComidasDeReceta, getAccesoGlobalARecetas, saveAccesoGlobalARecetas } from '../dbService';
import { accesoGlobalKey } from '../hooks/useReglasDeReceta';
import { idDePaquete, type PaqueteDeRecetas } from '../utils/seleccionDeRecetas';
import { listaDeMenuVigente, MIN_RECETAS_DE_LISTA, type AccesoGlobalARecetas } from '../utils/accesoARecetas';
import { useToast } from '../hooks/useToast';
import { useConfirm } from '../hooks/useConfirm';
import { CAT_BASICAS, encajaCategoria, FILTROS_RAPIDAS, type FiltroRapidas } from '../db/recetasHidratacion';
import { GRUPOS_DE_RECETA } from '../utils/grupoDeReceta';
import { roundQuarter } from '../utils/exchangeHelpers';
import { macrosDeIntercambios } from '../utils/macrosLegado';
import { parseBaseGrams } from '../utils/conversionNutricional';
import { Skeleton, Icon } from './ui';
import { EmptyState, Badge, Chip, Dialog, Button, Input } from './ui';
import { fotoDeReceta } from '../utils/fotoDeReceta';
import FotoDeReceta from './FotoDeReceta';
import { coincideBusqueda, normalizarTexto } from '../utils/busqueda';
import { useDebouncedValue } from '../hooks/useDebouncedValue';

const RECIPE_CATEGORIES = ['Alta proteína', 'Rápida', 'Pre-entreno', 'Recuperación', 'Desayuno', 'Cena'];

/** Tope de tarjetas que pinta el buscador del catálogo. Quien busca algo
 *  concreto lo encuentra igual; quien escribe una letra ve una muestra. */
const TOPE_RESULTADOS_BUSQUEDA = 200;
/** Tarjetas por tanda al navegar sin buscar. */
const POR_PAGINA = 48;

/** Qué parte del recetario se ve según el menú automático (11-2026). */
type VistaMenu = 'todas' | 'favoritas' | 'menu' | 'fuera';
const VISTAS_MENU: { value: VistaMenu; label: string }[] = [
  { value: 'todas', label: 'Todas' },
  { value: 'favoritas', label: 'Favoritas' },
  { value: 'menu', label: 'En el menú' },
  { value: 'fuera', label: 'Fuera del menú' },
];

// Categories/intake types as stored on imported imported recipes (see scripts/importRecetas.mjs) —
// mirrors the athlete-facing browser in RecipesScreen.tsx.
// Pestañas del recetario: los grupos finos (utils/grupoDeReceta.ts), no las
// cuatro categorías de origen, en las que «Platos salados» mezclaba batidos,
// fruta o frutos secos (Dani, 26-10-2026).
const RECETAS_CATS = ['Todas', CAT_BASICAS, ...GRUPOS_DE_RECETA];

const INTAKE_LABELS: Record<number, string> = {
  1: 'Desayuno', 2: 'Media mañana', 3: 'Comida', 4: 'Merienda', 5: 'Cena',
};

interface RecetaCardProps {
  recipe: Recipe;
  onOpen: (r: Recipe) => void;
  favorita: boolean;
  enMenu: boolean;
  onFavorita: (r: Recipe) => void;
  key?: React.Key;
}

function RecetaCard({ recipe, onOpen, favorita, enMenu, onFavorita }: RecetaCardProps) {
  const photo = fotoDeReceta(recipe);
  return (
    <div className="relative">
    {/* Antes era un <article> sin más: el coach veía el catálogo pero no podía
        abrir ninguna receta para leer sus ingredientes ni su preparación. */}
    <button
      type="button"
      onClick={() => onOpen(recipe)}
      aria-label={`Ver ${recipe.name}`}
      className="relative w-full rounded-surface overflow-hidden bg-raised border border-hairline hover:border-accent/40 transition-colors aspect-[4/5] flex flex-col justify-end text-left">
      {photo
        ? <FotoDeReceta src={photo} alt={recipe.name} className="absolute inset-0 w-full h-full object-cover opacity-70" fallback={null} />
        : <div className="absolute inset-0 bg-gradient-to-br from-raised to-bg flex items-center justify-center">
            <Icon name="skillet" size="xl" className="text-ink-3" />
          </div>
      }
      <div className="absolute inset-0 bg-gradient-to-t from-veil/95 via-veil/50 to-transparent" />
      {recipe.kcal ? (
        <div className="absolute top-2 left-2 bg-veil/60 backdrop-blur-sm rounded-control px-2 font-mono text-caption text-on-veil-2 z-10">
          {recipe.kcal} kcal
        </div>
      ) : null}
      <p className="relative z-10 p-3 text-label text-on-veil font-sans font-bold leading-tight">
        {enMenu && <span className="block font-mono text-caption font-normal text-on-veil-2 mb-1">En el menú</span>}
        {recipe.name}
      </p>
    </button>
    {/* Fuera del botón de la tarjeta: un botón dentro de otro no es válido. */}
    <button
      type="button"
      onClick={() => onFavorita(recipe)}
      aria-pressed={favorita}
      aria-label={favorita ? `Quitar ${recipe.name} de favoritas` : `Marcar ${recipe.name} como favorita`}
      className="absolute top-1 right-1 z-20 w-11 h-11 flex items-center justify-center rounded-full"
    >
      <span className="w-8 h-8 flex items-center justify-center rounded-full bg-veil/60 backdrop-blur-sm">
        <Icon name="star" size="s" filled={favorita} className={favorita ? 'text-accent-ink' : 'text-on-veil-2'} />
      </span>
    </button>
    </div>
  );
}

const CAT_LABELS: Record<FoodCategory, string> = {
  HC: 'HC', PROT: 'PROT', GRASA: 'GRASA', MIX_HC: 'MIX·HC', MIX_GRASA: 'MIX·GRASA',
};

const CAT_COLORS: Record<FoodCategory, string> = {
  HC:        'text-warning border-warning/30 bg-warning/10',
  PROT:      'text-info border-info/30 bg-info/10',
  GRASA:     'text-success border-success/30 bg-success/10',
  MIX_HC:    'text-data border-data/30 bg-data/10',
  MIX_GRASA: 'text-danger border-danger/30 bg-danger/10',
};

function calcExchanges(ingredients: RecipeIngredient[]): Partial<Record<FoodCategory, number>> {
  const totals: Partial<Record<FoodCategory, number>> = {};
  for (const ing of ingredients) {
    totals[ing.category] = (totals[ing.category] ?? 0) + ing.quantity;
  }
  return totals;
}

/** «352 kcal · P 28 g · HC 42 g · G 8 g» de unos ingredientes (10-2026). */
function textoMacros(ingredients: RecipeIngredient[]): string {
  const m = macrosDeIntercambios(calcExchanges(ingredients));
  if (m.kcal <= 0) return '—';
  return `${Math.round(m.kcal)} kcal · P ${Math.round(m.p)} · HC ${Math.round(m.hc)} · G ${Math.round(m.g)} g`;
}

/** Gramos y kcal de un ingrediente: «80 g · 200 kcal» (o la ración si no se pesa). */
function textoIngrediente(ing: RecipeIngredient): string {
  const base = parseBaseGrams(ing.foodLabel);
  const kcal = Math.round(macrosDeIntercambios({ [ing.category]: ing.quantity }).kcal);
  return `${base ? `${Math.round(base * ing.quantity)} g` : `${ing.quantity} rac.`} · ${kcal} kcal`;
}

interface FormState {
  name: string;
  photoUrl: string;
  categories: string[];
  ingredients: RecipeIngredient[];
  extras: string[];
  steps: string[];
}

const EMPTY_FORM: FormState = {
  name: '', photoUrl: '', categories: [], ingredients: [], extras: [], steps: [],
};

interface Props { coachId: string; }

// La clave lleva el dueño: la caché de recetas es por persona desde que cada
// uno solo ve las suyas (ver getRecipes) — sin el uid, coach y atleta que
// compartan dispositivo se leerían la lista del otro.
const recipesQueryKey = (ownerId: string) => ['recipes', ownerId] as const;

export default function RecipeBuilderScreen({ coachId }: Props) {
  const queryClient = useQueryClient();
  const { data: recipes = [], isPending: loadingRecipes } = useQuery({
    queryKey: recipesQueryKey(coachId),
    queryFn: () => getRecipes({ ownerId: coachId }),
  });
  const { data: foodItems = [], isPending: loadingFoodItems } = useQuery({
    queryKey: ['foodItems'],
    queryFn: getFoodItems,
  });
  const loading = loadingRecipes || loadingFoodItems;
  const [showForm, setShowForm]             = useState(false);
  const [editingId, setEditingId]           = useState<string | null>(null);
  const [form, setForm]                     = useState<FormState>(EMPTY_FORM);
  const [ingredientSearch, setIngSearch]    = useState('');
  const [ingredientQty, setIngQty]          = useState(1);
  const [newExtra, setNewExtra]             = useState('');
  const [newStep, setNewStep]               = useState('');
  const [saving, setSaving]                 = useState(false);
  const [deleting, setDeleting]             = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete]   = useState<string | null>(null);

  // Recetas library browser (read-only) — the coach's own recipes above come from
  // getRecipes(), which deliberately excludes the 8.850 imported imported recipes to
  // avoid downloading the full collection; browse those separately, paginated.
  const [recetasCat, setRecetasCat]             = useState<string>('Todas');
  const [recetasRapidas, setRecetasRapidas]     = useState<FiltroRapidas>('');
  const [recetasIntake, setRecetasIntake]       = useState<number | null>(null);
  const [recetasSearch, setRecetasSearch]       = useState('');
  const recetasSearchDebounced = useDebouncedValue(recetasSearch, 200);
  /* El catálogo ENTERO: filtros, buscador y menú automático miran sobre él.
     Antes se paginaba aparte y el buscador solo veía la página cargada:
     escribir el nombre de una receta que existe contestaba que no hay nada. */
  const [indiceRecetas, setIndiceRecetas]       = useState<Recipe[]>([]);
  const [indiceCargado, setIndiceCargado]       = useState(false);
  useEffect(() => {
    cargarIndiceRecetas().then(setIndiceRecetas).catch(() => {}).finally(() => setIndiceCargado(true));
  }, []);
  // Limpiador del recetario (29-10). Al cerrarlo se relee: lo retirado ya no sale.
  const [limpiando, setLimpiando] = useState(false);
  /* Comidas y paquetes de la receta abierta (11-2026): el coach decide para qué
     comidas vale (manda sobre lo que trae el recetario) y la mete en sus paquetes. */
  const { showToast } = useToast();
  const { data: accesoGlobal } = useQuery({ queryKey: accesoGlobalKey, queryFn: getAccesoGlobalARecetas });
  const paquetes = accesoGlobal?.paquetes ?? [];
  const [guardandoReceta, setGuardandoReceta] = useState(false);
  const cambiarComida = async (r: Recipe, franja: number) => {
    const actuales = r.intakeTypes ?? [];
    const nuevas = actuales.includes(franja) ? actuales.filter(x => x !== franja) : [...actuales, franja].sort((a, b) => a - b);
    // Sin ninguna, el generador la trataría como válida para todas (recipeMatchesSlot).
    if (nuevas.length === 0) { showToast('Deja al menos una comida. Para quitarla de todo, retírala con «Limpiar recetario».'); return; }
    setGuardandoReceta(true);
    try {
      await cambiarComidasDeReceta(r.id, nuevas);
      const conNuevas = (x: Recipe) => (x.id === r.id ? { ...x, intakeTypes: nuevas } : x);
      setRecetaAbierta(prev => (prev ? conNuevas(prev) : prev));
      setIndiceRecetas(prev => prev.map(conNuevas));
    } catch { showToast('No se pudo guardar. Inténtalo otra vez.'); }
    finally { setGuardandoReceta(false); }
  };
  /** Guarda un trozo de `recipeAccess/global` (paquetes, lista del menú, favoritas). */
  const guardarGlobal = async (cambio: AccesoGlobalARecetas, error: string): Promise<boolean> => {
    setGuardandoReceta(true);
    try {
      await saveAccesoGlobalARecetas(cambio);
      queryClient.setQueryData(accesoGlobalKey, (prev: object | undefined) => ({ ...prev, ...cambio }));
      return true;
    } catch { showToast(error); return false; }
    finally { setGuardandoReceta(false); }
  };
  const guardarPaquetes = (lista: PaqueteDeRecetas[]) => guardarGlobal({ paquetes: lista }, 'No se pudo guardar el paquete. Inténtalo otra vez.');
  const alternarPaquete = (r: Recipe, p: PaqueteDeRecetas) => guardarPaquetes(paquetes.map(x => x.id !== p.id ? x : {
    ...x, recipeIds: x.recipeIds.includes(r.id) ? x.recipeIds.filter(id => id !== r.id) : [...x.recipeIds, r.id],
  }));
  const [nombrePaquete, setNombrePaquete] = useState('');
  const crearPaquete = async (r: Recipe) => {
    const nombre = nombrePaquete.trim();
    if (!nombre) return;
    await guardarPaquetes([...paquetes, { id: idDePaquete(nombre, paquetes), nombre, recipeIds: [r.id] }]);
    setNombrePaquete('');
  };
  const cerrarLimpieza = () => {
    setLimpiando(false);
    cargarIndiceRecetas().then(setIndiceRecetas).catch(() => {});
  };
  /* La receta abierta. El índice empaquetado NO trae la preparación ni los
     gramos —se dejaron fuera a propósito, son 4,9 MB solo con lo demás—, así
     que al abrirla se pide el documento completo. Se pinta lo que ya se tiene y
     el resto entra cuando llega, igual que en el recetario del atleta. */
  const [recetaAbierta, setRecetaAbierta]       = useState<Recipe | null>(null);
  const abrirReceta = useCallback(async (r: Recipe) => {
    setRecetaAbierta(r);
    if (r.stepsText) return;
    const completa = await getRecipeById(r.id).catch(() => null);
    // Se suma, no se sustituye: 367 recetas del índice tienen en Firestore un
    // documento con solo macros (vincularTodas, merge sobre ids que no estaban)
    // y sin nombre; sustituir rompía el diálogo al leer `name` (11-2026).
    // Las comidas, las del índice: llevan ya las que haya elegido el coach.
    if (completa) setRecetaAbierta(prev => (prev?.id === r.id ? { ...prev, ...completa, intakeTypes: prev.intakeTypes } : prev));
  }, []);
  /** El nombre normalizado de cada receta, una sola vez y no en cada tecla. */
  const indiceBuscable = useMemo(
    () => indiceRecetas.map(r => ({ receta: r, nombre: normalizarTexto(r.name) })),
    [indiceRecetas],
  );

  /* Menú automático (11-2026). Antes era otra pestaña, «Menú», con su propio
     buscador; ahora se organiza aquí con los filtros del recetario: con qué
     recetas trabaja el generador y cuáles son las favoritas, que adelanta para
     todos los atletas. Quien tenga lista propia (su ficha › Dietas) no cambia. */
  const { confirm, ConfirmDialog } = useConfirm();
  const listaMenu = listaDeMenuVigente(undefined, accesoGlobal?.listaMenu);
  const idsDelMenu = useMemo(
    () => new Set<string>(listaMenu === 'rapidas' ? indiceRecetas.filter(r => r.basica === true).map(r => r.id) : listaMenu),
    [listaMenu, indiceRecetas],
  );
  const favoritas = useMemo(() => new Set(accesoGlobal?.favoritas ?? []), [accesoGlobal?.favoritas]);
  const [vistaMenu, setVistaMenu] = useState<VistaMenu>('todas');
  const [recetasVisibles, setRecetasVisibles] = useState(POR_PAGINA);
  useEffect(() => { setRecetasVisibles(POR_PAGINA); }, [recetasCat, recetasRapidas, recetasIntake, vistaMenu, recetasSearchDebounced]);

  /** Todas las que pasan los filtros, sin tope: con ellas se mete o se saca del menú de golpe. */
  const coincidencias = useMemo(() => {
    const termino = recetasSearchDebounced.trim();
    const out: Recipe[] = [];
    for (const { receta, nombre } of indiceBuscable) {
      if (!encajaCategoria(receta, recetasCat, recetasRapidas)) continue;
      if (recetasIntake != null && !(receta.intakeTypes ?? []).includes(recetasIntake)) continue;
      if (vistaMenu === 'favoritas' && !favoritas.has(receta.id)) continue;
      if (vistaMenu === 'menu' && !idsDelMenu.has(receta.id)) continue;
      if (vistaMenu === 'fuera' && idsDelMenu.has(receta.id)) continue;
      if (termino && !coincideBusqueda(nombre, termino)) continue;
      out.push(receta);
    }
    return out;
  }, [indiceBuscable, recetasCat, recetasRapidas, recetasIntake, vistaMenu, favoritas, idsDelMenu, recetasSearchDebounced]);

  // Con búsqueda, tope de resultados para no pintar miles de tarjetas si el
  // término es de una letra; sin ella, por tandas.
  const filteredRecetas = recetasSearch
    ? coincidencias.slice(0, TOPE_RESULTADOS_BUSQUEDA)
    : coincidencias.slice(0, recetasVisibles);
  const hayFiltro = recetasCat !== 'Todas' || recetasIntake != null || vistaMenu !== 'todas' || !!recetasSearchDebounced.trim();

  const aviso = 'Los atletas que no tengan lista propia usarán esta lista desde ahora; los que la tengan no cambian.';
  /** Guarda la lista del menú. Vacía = vuelve a las Rápidas. */
  const guardarLista = (ids: Set<string>) =>
    guardarGlobal({ listaMenu: [...ids] }, 'No se pudo guardar el menú. Inténtalo otra vez.');
  const cambiarMenu = async (recetas: Recipe[], meter: boolean) => {
    const nueva = new Set<string>(idsDelMenu);
    for (const r of recetas) { if (meter) nueva.add(r.id); else nueva.delete(r.id); }
    if (nueva.size === 0) { showToast('El menú no puede quedarse sin recetas. Para volver a las Rápidas, usa «Volver a las Rápidas».'); return; }
    const varias = recetas.length > 1;
    const deRapidas = listaMenu === 'rapidas';
    if (varias || deRapidas) {
      const que = varias
        ? `¿${meter ? 'Meter' : 'Sacar'} ${recetas.length.toLocaleString('es-ES')} recetas ${meter ? 'en el' : 'del'} menú? Quedará con ${nueva.size.toLocaleString('es-ES')}.`
        : `¿${meter ? 'Meter' : 'Sacar'} «${recetas[0].name.trim()}» ${meter ? 'en el' : 'del'} menú?`;
      const desdeRapidas = deRapidas ? ` Hasta ahora el menú usa las Rápidas; pasará a ser tu lista, con ellas de partida.` : '';
      if (!(await confirm(`${que}${desdeRapidas} ${aviso}`))) return;
    }
    await guardarLista(nueva);
  };
  const volverARapidas = async () => {
    if (await confirm(`¿Volver a las Rápidas? Se pierde tu lista del menú. ${aviso}`)) {
      await guardarGlobal({ listaMenu: [] }, 'No se pudo guardar el menú. Inténtalo otra vez.');
    }
  };
  const alternarFavorita = (r: Recipe) => {
    const lista = favoritas.has(r.id) ? [...favoritas].filter(id => id !== r.id) : [...favoritas, r.id];
    return guardarGlobal({ favoritas: lista }, 'No se pudo guardar la favorita. Inténtalo otra vez.');
  };
  const enMenuVisibles = coincidencias.filter(r => idsDelMenu.has(r.id)).length;


  const filteredFoods = useMemo(() =>
    ingredientSearch.trim().length < 2
      ? []
      : foodItems.filter(f => coincideBusqueda(f.label, ingredientSearch)).slice(0, 8),
    [foodItems, ingredientSearch]
  );

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setIngSearch('');
    setIngQty(1);
    setNewExtra('');
    setNewStep('');
    setShowForm(true);
  };

  const openEdit = (recipe: Recipe) => {
    setEditingId(recipe.id);
    setForm({
      name: recipe.name,
      photoUrl: recipe.photoUrl ?? '',
      categories: [...recipe.categories],
      ingredients: [...recipe.ingredients],
      extras: [...recipe.extras],
      steps: [...recipe.steps],
    });
    setIngSearch('');
    setIngQty(1);
    setNewExtra('');
    setNewStep('');
    setShowForm(true);
  };

  const addIngredient = (item: MealItem) => {
    const newIng: RecipeIngredient = {
      foodLabel: item.label,
      category: item.category,
      mode: item.mode,
      quantity: Math.max(0.25, ingredientQty),
    };
    setForm(f => ({ ...f, ingredients: [...f.ingredients, newIng] }));
    setIngSearch('');
  };

  const removeIngredient = (idx: number) =>
    setForm(f => ({ ...f, ingredients: f.ingredients.filter((_, i) => i !== idx) }));

  const adjustIngQty = (idx: number, delta: number) =>
    setForm(f => ({
      ...f,
      ingredients: f.ingredients.map((ing, i) =>
        i === idx ? { ...ing, quantity: Math.max(0.25, roundQuarter(ing.quantity + delta)) } : ing
      ),
    }));

  const toggleCategory = (cat: string) =>
    setForm(f => ({
      ...f,
      categories: f.categories.includes(cat)
        ? f.categories.filter(c => c !== cat)
        : [...f.categories, cat],
    }));

  const addExtra = () => {
    const t = newExtra.trim();
    if (!t) return;
    setForm(f => ({ ...f, extras: [...f.extras, t] }));
    setNewExtra('');
  };

  const addStep = () => {
    const t = newStep.trim();
    if (!t) return;
    setForm(f => ({ ...f, steps: [...f.steps, t] }));
    setNewStep('');
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const data: Omit<Recipe, 'id'> = {
      ownerId: coachId,
      name: form.name.trim(),
      ...(form.photoUrl.trim() ? { photoUrl: form.photoUrl.trim() } : {}),
      categories: form.categories,
      ingredients: form.ingredients,
      extras: form.extras,
      steps: form.steps,
      // kcal y gramos (10-2026); `exchanges` para el motor de menús y los binarios viejos.
      ...(() => {
        const exch = calcExchanges(form.ingredients);
        const m = macrosDeIntercambios(exch);
        if (m.kcal <= 0) return {};
        return {
          macros: { prot: Math.round(m.p * 10) / 10, carb: Math.round(m.hc * 10) / 10, fat: Math.round(m.g * 10) / 10 },
          kcal: Math.round(m.kcal),
        };
      })(),
    };
    try {
      if (editingId) {
        await updateRecipe(editingId, data);
        queryClient.setQueryData<Recipe[]>(recipesQueryKey(coachId), prev =>
          prev?.map(r => r.id === editingId ? { id: editingId, ...data } : r));
      } else {
        const created = await createRecipe(data);
        queryClient.setQueryData<Recipe[]>(recipesQueryKey(coachId), prev => [...(prev ?? []), created]);
      }
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    setConfirmDelete(null);
    try {
      await deleteRecipe(id);
      queryClient.setQueryData<Recipe[]>(recipesQueryKey(coachId), prev => prev?.filter(r => r.id !== id));
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Skeleton className="h-32 w-full rounded-surface" />
        <Skeleton className="h-32 w-full rounded-surface" />
        <Skeleton className="h-32 w-full rounded-surface" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="font-mono text-label text-ink-2 uppercase tracking-wider">
          {recipes.length} receta{recipes.length !== 1 ? 's' : ''} propia{recipes.length !== 1 ? 's' : ''}
        </p>
        <Button variant="primary" size="s" icon="add" onClick={openCreate}>
          Nueva receta
        </Button>
      </div>

      {recipes.length === 0 ? (
        <EmptyState icon="restaurant_menu" title="Aún no has creado ninguna receta propia. El recetario de abajo tiene 8.850." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {recipes.map(recipe => {
            const exchStr = textoMacros(recipe.ingredients);
            return (
              <div key={recipe.id} className="bg-raised border border-hairline rounded-surface overflow-hidden flex flex-col">
                {fotoDeReceta(recipe) && (
                  <div className="w-full h-36 overflow-hidden shrink-0">
                    <FotoDeReceta src={fotoDeReceta(recipe)} alt={recipe.name} className="w-full h-full object-cover" fallback={null} />
                  </div>
                )}
                <div className="p-4 flex-1 space-y-2">
                  <h3 className="font-sans font-bold text-title-s text-ink">{recipe.name}</h3>
                  {recipe.categories.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {recipe.categories.map(c => (
                        <Badge key={c} tone="neutral">{c}</Badge>
                      ))}
                    </div>
                  )}
                  {exchStr !== '—' && (
                    <p className="font-mono text-caption text-accent-ink font-bold">{exchStr}</p>
                  )}
                  <p className="font-mono text-caption text-ink-2">
                    {recipe.ingredients.length} ingredientes · {recipe.steps.length} pasos
                  </p>
                </div>
                <div className="flex items-center justify-end gap-1 px-4 pb-4">
                  <button onClick={() => openEdit(recipe)} aria-label="Editar" className="text-ink-2 hover:text-accent-ink p-2 rounded-control transition-[color,background-color,border-color,opacity,transform,box-shadow]">
                    <Icon name="edit" size="s" />
                  </button>
                  <button onClick={() => setConfirmDelete(recipe.id)} aria-label="Eliminar" className="text-ink-2 hover:text-danger p-2 rounded-control transition-[color,background-color,border-color,opacity,transform,box-shadow]">
                    <Icon name="delete" size="s" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Recetario importado (solo lectura) ────────────────────────────── */}
      <section className="space-y-4 pt-4 border-t border-hairline">
        <h2 className="font-sans font-bold text-body-s text-ink uppercase tracking-wider flex items-center gap-2">
          <Icon name="library_books" size="m" className="text-data" />
          Recetario
          <span className="font-sans text-caption text-ink-2 normal-case font-normal">{indiceRecetas.length ? indiceRecetas.length.toLocaleString('es-ES') : '8.850'} recetas</span>
          <button
            type="button"
            onClick={() => setLimpiando(true)}
            className="ml-auto inline-flex items-center gap-1.5 rounded-control border border-hairline px-3 py-1.5 font-sans text-caption font-bold normal-case tracking-normal text-ink-2 hover:border-strong hover:text-ink"
          >
            <Icon name="cleaning_services" size="s" />
            Limpiar recetario
          </button>
        </h2>

        {/* ── Menú automático: antes era la pestaña «Menú» ── */}
        <div className="bg-raised border border-hairline rounded-surface p-4 space-y-3">
          <div className="flex flex-wrap items-start gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="font-sans font-bold text-title-s text-ink flex items-center gap-2">
                <Icon name="checklist" size="m" className="text-accent-ink" />
                Menú automático
              </h3>
              <p className="font-sans text-label text-ink-2 mt-1">
                Trabaja con {listaMenu === 'rapidas'
                  ? <>las <strong className="text-ink">Rápidas</strong> ({idsDelMenu.size.toLocaleString('es-ES')})</>
                  : <><strong className="text-ink">tu lista</strong> de {idsDelMenu.size.toLocaleString('es-ES')} recetas</>}
                {' '}y saca más tus <strong className="text-ink">{favoritas.size.toLocaleString('es-ES')} favoritas</strong> (★, entran aunque no estén en la lista).
                {' '}Filtra abajo y mete o saca recetas del menú. Los atletas con lista propia (su ficha › Dietas) no cambian.
              </p>
            </div>
            {listaMenu !== 'rapidas' && (
              <Button variant="ghost" size="s" onClick={volverARapidas} disabled={guardandoReceta}>Volver a las Rápidas</Button>
            )}
          </div>
          {listaMenu !== 'rapidas' && idsDelMenu.size < MIN_RECETAS_DE_LISTA && (
            <p role="status" className="font-sans text-label text-warning">
              Con menos de {MIN_RECETAS_DE_LISTA} recetas el generador ignora la lista y usa todo el recetario, para no dejar menús vacíos.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {VISTAS_MENU.map(v => (
              <Chip key={v.value} selected={vistaMenu === v.value} icon={v.value === 'favoritas' ? 'star' : undefined}
                onClick={() => setVistaMenu(v.value)}>{v.label}</Chip>
            ))}
          </div>
        </div>

        <div className="w-full overflow-x-auto hide-scrollbar -mx-4 px-4 md:mx-0 md:px-0">
          <div className="flex gap-2 w-max">
            {RECETAS_CATS.map(cat => (
              <button
                key={cat}
                onClick={() => setRecetasCat(cat)}
                className={`px-4 py-2 rounded-full font-mono text-caption font-bold whitespace-nowrap transition-[color,background-color,border-color,opacity,transform,box-shadow] ${
                  recetasCat === cat
                    ? 'bg-data text-on-fill'
                    : 'bg-raised border border-hairline text-ink-2 hover:border-strong hover:text-ink'
                }`}
              >{cat}</button>
            ))}
          </div>
        </div>

        {recetasCat === CAT_BASICAS && (
          <div className="flex flex-wrap gap-2">
            {FILTROS_RAPIDAS.map(f => (
              <Chip key={f.value} selected={recetasRapidas === f.value} onClick={() => setRecetasRapidas(f.value)}>{f.label}</Chip>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Chip selected={recetasIntake === null} onClick={() => setRecetasIntake(null)}>Todos los momentos</Chip>
          {Object.entries(INTAKE_LABELS).map(([k, label]) => (
            <Chip key={k} selected={recetasIntake === Number(k)} onClick={() => setRecetasIntake(Number(k))}>{label}</Chip>
          ))}
        </div>

        <Input
          icon="search"
          value={recetasSearch}
          onChange={setRecetasSearch}
          placeholder="Buscar en las 8.850 recetas…"
        />

        {!indiceCargado ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Skeleton className="h-32 w-full rounded-surface" />
            <Skeleton className="h-32 w-full rounded-surface" />
            <Skeleton className="h-32 w-full rounded-surface" />
          </div>
        ) : filteredRecetas.length === 0 ? (
          <EmptyState icon="search_off" title={recetasSearch ? `Ninguna receta coincide con «${recetasSearch}».` : vistaMenu === 'favoritas' ? 'Aún no hay favoritas aquí. Toca la ★ de una receta.' : 'Sin recetas para estos filtros.'} />
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-sans text-caption text-ink-2 uppercase">
                {coincidencias.length.toLocaleString('es-ES')} receta{coincidencias.length !== 1 ? 's' : ''}
                {hayFiltro ? ` · ${enMenuVisibles.toLocaleString('es-ES')} en el menú` : ''}
                {recetasSearch && coincidencias.length > TOPE_RESULTADOS_BUSQUEDA ? ` · se ven ${TOPE_RESULTADOS_BUSQUEDA} (afina la búsqueda)` : ''}
              </p>
              {/* Organizar el menú desde los filtros: todas las que pasan, no solo las que se ven. */}
              {hayFiltro && (
                <span className="ml-auto flex flex-wrap gap-2">
                  {coincidencias.length > enMenuVisibles && (
                    <Button variant="secondary" size="s" icon="add" disabled={guardandoReceta}
                      onClick={() => cambiarMenu(coincidencias.filter(r => !idsDelMenu.has(r.id)), true)}>
                      Meter {(coincidencias.length - enMenuVisibles).toLocaleString('es-ES')} en el menú
                    </Button>
                  )}
                  {enMenuVisibles > 0 && (
                    <Button variant="ghost" size="s" icon="remove" disabled={guardandoReceta}
                      onClick={() => cambiarMenu(coincidencias.filter(r => idsDelMenu.has(r.id)), false)}>
                      Sacar {enMenuVisibles.toLocaleString('es-ES')} del menú
                    </Button>
                  )}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {filteredRecetas.map(r => (
                <RecetaCard key={r.id} recipe={r} onOpen={abrirReceta}
                  favorita={favoritas.has(r.id)} enMenu={idsDelMenu.has(r.id)} onFavorita={alternarFavorita} />
              ))}
            </div>
            {!recetasSearch && coincidencias.length > recetasVisibles && (
              <div className="flex justify-center pt-2">
                <Button variant="secondary" icon="expand_more" onClick={() => setRecetasVisibles(v => v + POR_PAGINA)}>
                  Cargar más recetas
                </Button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── DETALLE DE UNA RECETA DEL CATÁLOGO ──────────────────────────── */}
      {recetaAbierta && (
        <Dialog open onClose={() => setRecetaAbierta(null)} title={recetaAbierta.name.trim()}>
          <div className="space-y-5">
            {fotoDeReceta(recetaAbierta) && (
              <FotoDeReceta
                src={fotoDeReceta(recetaAbierta)}
                alt={recetaAbierta.name}
                className="w-full aspect-[16/9] object-cover rounded-surface"
                fallback={null}
              />
            )}

            <p className="font-mono text-caption text-ink-2">
              {[
                recetaAbierta.kcal ? `${recetaAbierta.kcal} kcal` : null,
                recetaAbierta.cookingTime ? `${recetaAbierta.cookingTime} min` : null,
                recetaAbierta.categoria,
              ].filter(Boolean).join(' · ')}
            </p>

            <div className="space-y-2">
              <p className="font-sans text-caption text-ink-2 uppercase tracking-wider">Menú automático</p>
              <div className="flex flex-wrap gap-1.5">
                <Chip icon="star" selected={favoritas.has(recetaAbierta.id)} disabled={guardandoReceta}
                  onClick={() => alternarFavorita(recetaAbierta)}>Favorita</Chip>
                <Chip selected={idsDelMenu.has(recetaAbierta.id)} disabled={guardandoReceta}
                  onClick={() => cambiarMenu([recetaAbierta], !idsDelMenu.has(recetaAbierta.id))}>En el menú</Chip>
              </div>
              <p className="font-sans text-caption text-ink-3">Las favoritas salen más en los menús de todos los atletas.</p>
            </div>

            <div className="space-y-2">
              <p className="font-sans text-caption text-ink-2 uppercase tracking-wider">Para qué comidas</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(INTAKE_LABELS).map(([k, label]) => (
                  <Chip key={k} selected={(recetaAbierta.intakeTypes ?? []).includes(Number(k))} disabled={guardandoReceta}
                    onClick={() => cambiarComida(recetaAbierta, Number(k))}>{label}</Chip>
                ))}
              </div>
              <p className="font-sans text-caption text-ink-3">Manda en el recetario, en los menús y en «Encajan en tu…».</p>
            </div>

            <div className="space-y-2">
              <p className="font-sans text-caption text-ink-2 uppercase tracking-wider">Paquetes</p>
              {paquetes.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {paquetes.map(p => (
                    <Chip key={p.id} selected={p.recipeIds.includes(recetaAbierta.id)} disabled={guardandoReceta}
                      onClick={() => alternarPaquete(recetaAbierta, p)}>{p.nombre} · {p.recipeIds.length}</Chip>
                  ))}
                </div>
              )}
              <form className="flex gap-2" onSubmit={e => { e.preventDefault(); crearPaquete(recetaAbierta); }}>
                <Input aria-label="Nombre del paquete nuevo" placeholder="Paquete nuevo (p. ej. Desayunos rápidos)" value={nombrePaquete} onChange={v => setNombrePaquete(v)} className="flex-1" />
                <Button type="submit" size="s" variant="ghost" disabled={!nombrePaquete.trim() || guardandoReceta}>Crear con esta</Button>
              </form>
            </div>

            {(recetaAbierta.ingredientsText ?? []).length > 0 && (
              <div>
                <p className="font-sans text-caption text-ink-2 uppercase tracking-wider mb-2">Ingredientes</p>
                <ul className="space-y-1">
                  {(recetaAbierta.ingredientsText ?? []).map((ing, i) => (
                    <li key={i} className="flex justify-between gap-3 text-label font-sans text-ink-2">
                      <span className="min-w-0">{ing.name}</span>
                      {ing.quantity ? <span className="font-mono text-ink-3 flex-shrink-0">{ing.quantity} g</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(recetaAbierta.stepsText ?? []).length > 0 ? (
              <div>
                <p className="font-sans text-caption text-ink-2 uppercase tracking-wider mb-2">Preparación</p>
                <ol className="space-y-3">
                  {(recetaAbierta.stepsText ?? []).map((paso, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="font-mono text-caption text-accent-ink flex-shrink-0">{paso.position ?? i + 1}</span>
                      <div className="min-w-0">
                        <p className="text-label font-sans text-ink-2">{paso.description}</p>
                        {(paso.items ?? []).length > 0 && (
                          <ul className="mt-1 space-y-0.5">
                            {(paso.items ?? []).map(sub => (
                              <li key={sub.position} className="flex gap-2 text-label font-sans text-ink-2">
                                <span aria-hidden="true" className="text-ink-3">·</span>
                                <span>{sub.description.trim()}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            ) : (
              <p className="font-mono text-caption text-ink-3">Cargando la preparación…</p>
            )}
          </div>
        </Dialog>
      )}

      {/* ── FORM MODAL ──────────────────────────────────────────────────── */}
      {showForm && (
        <Dialog
          open
          onClose={() => setShowForm(false)}
          title={editingId ? 'Editar receta' : 'Nueva receta'}
          size="xl"
          footer={(
            <>
              <Button variant="secondary" onClick={() => setShowForm(false)} className="flex-1">
                Cancelar
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || !form.name.trim()}
                loading={saving}
                className="flex-1"
              >
                {saving ? 'Guardando…' : editingId ? 'Actualizar' : 'Crear receta'}
              </Button>
            </>
          )}
        >
          <div className="space-y-5">

            {/* Name */}
            <Input
              label="Nombre"
              required
              value={form.name}
              onChange={v => setForm(f => ({ ...f, name: v }))}
              placeholder="Ej. Bowl de pollo y quinoa"
            />

            {/* Photo URL */}
            <div className="space-y-2">
              <Input
                label="URL de foto"
                hint="Opcional."
                type="url"
                value={form.photoUrl}
                onChange={v => setForm(f => ({ ...f, photoUrl: v }))}
                placeholder="https://..."
              />
              {form.photoUrl && (
                <img
                  src={form.photoUrl}
                  alt="preview"
                  className="w-full h-28 object-cover rounded-surface border border-hairline mt-1"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              )}
            </div>

            {/* Categories */}
            <div className="space-y-2">
              <span className="font-mono text-caption text-ink-2 uppercase tracking-wider">Categorías</span>
              <div className="flex flex-wrap gap-2">
                {RECIPE_CATEGORIES.map(cat => (
                  <Chip key={cat} selected={form.categories.includes(cat)} onClick={() => toggleCategory(cat)}>
                    {cat}
                  </Chip>
                ))}
              </div>
            </div>

            {/* Live exchanges */}
            {form.ingredients.length > 0 && (
              <div className="bg-raised border border-accent/20 rounded-surface p-3">
                <p className="font-mono text-caption text-ink-2 uppercase tracking-wider mb-2">Total de la receta</p>
                <p className="font-mono text-label font-bold text-ink">{textoMacros(form.ingredients)}</p>
              </div>
            )}

            {/* Ingredients */}
            <div className="space-y-3">
              <span className="font-mono text-caption text-ink-2 uppercase tracking-wider">Ingredientes</span>

              <div className="flex gap-2 items-center">
                <div className="relative flex-1">
                  <Input
                    icon="search"
                    value={ingredientSearch}
                    onChange={setIngSearch}
                    placeholder="Buscar alimento..."
                  />
                  {filteredFoods.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-raised border border-hairline rounded-surface overflow-hidden z-10 shadow-e2">
                      {filteredFoods.map(item => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => addIngredient(item)}
                          className="w-full text-left px-4 py-3 hover:bg-raised transition-colors flex items-center justify-between"
                        >
                          <span className="text-label text-ink font-sans truncate pr-2">{item.label}</span>
                          <span className={`font-sans text-caption font-bold shrink-0 ${CAT_COLORS[item.category].split(' ')[0]}`}>
                            {CAT_LABELS[item.category]}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {/* Qty stepper */}
                <div className="flex items-center gap-1 shrink-0 bg-raised border border-hairline rounded-surface px-1">
                  <button type="button" onClick={() => setIngQty(q => Math.max(0.25, roundQuarter(q - 0.25)))} className="w-7 h-9 text-ink hover:text-accent-ink transition-colors font-bold">-</button>
                  <span className="w-8 text-center font-mono text-body-s text-ink select-none">{ingredientQty}</span>
                  <button type="button" onClick={() => setIngQty(q => roundQuarter(q + 0.25))} className="w-7 h-9 text-ink hover:text-accent-ink transition-colors font-bold">+</button>
                </div>
              </div>

              {form.ingredients.length > 0 && (
                <ul className="space-y-2">
                  {form.ingredients.map((ing, idx) => (
                    <li key={idx} className="flex items-center gap-2 px-3 py-2 bg-raised rounded-surface border border-hairline">
                      <span className="text-label text-ink font-sans flex-1 truncate">{ing.foodLabel}</span>
                      <span className="font-mono text-caption text-ink-2 shrink-0">{textoIngrediente(ing)}</span>
                      <div className="flex items-center gap-1 shrink-0" aria-label="Raciones">
                        <button type="button" onClick={() => adjustIngQty(idx, -0.25)} className="w-6 h-6 bg-raised rounded-control text-ink text-label hover:bg-raised transition-colors">-</button>
                        <span className="w-8 text-center font-mono text-label text-ink select-none">{ing.quantity}</span>
                        <button type="button" onClick={() => adjustIngQty(idx, 0.25)} className="w-6 h-6 bg-raised rounded-control text-ink text-label hover:bg-raised transition-colors">+</button>
                      </div>
                      <button type="button" onClick={() => removeIngredient(idx)} className="text-ink-2 hover:text-danger transition-colors">
                        <Icon name="close" size="s" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Extras */}
            <div className="space-y-2">
              <label htmlFor="recipebuilderscreen-extras-condimentos-sal" className="font-sans text-caption text-ink-2 uppercase tracking-wider">Extras (condimentos, sal…)</label>
              <div className="flex gap-2">
                <input id="recipebuilderscreen-extras-condimentos-sal"
                  type="text"
                  value={newExtra}
                  onChange={e => setNewExtra(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addExtra(); } }}
                  placeholder="Ej. Sal al gusto"
                  className="flex-1 bg-raised border border-control-line rounded-control px-4 py-2 text-title-s text-ink placeholder-ink-2/50 focus:border-accent/50 focus:outline-none"
                />
                <button type="button" onClick={addExtra} className="px-4 py-2 bg-raised rounded-control text-ink-2 hover:text-ink transition-colors font-sans text-label uppercase">Añadir</button>
              </div>
              {form.extras.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {form.extras.map((ex, idx) => (
                    <span key={idx} className="flex items-center gap-1 px-3 py-1 bg-raised rounded-full">
                      <span className="font-mono text-caption text-ink-2">{ex}</span>
                      <button type="button" onClick={() => setForm(f => ({ ...f, extras: f.extras.filter((_, i) => i !== idx) }))} className="text-ink-2 hover:text-danger transition-colors">
                        <Icon name="close" size="s" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Steps */}
            <div className="space-y-2">
              <label htmlFor="recipebuilderscreen-pasos-de-preparacion" className="font-mono text-caption text-ink-2 uppercase tracking-wider">Pasos de preparación</label>
              <div className="flex gap-2 items-end">
                <textarea id="recipebuilderscreen-pasos-de-preparacion"
                  value={newStep}
                  onChange={e => setNewStep(e.target.value)}
                  placeholder="Describe el paso..."
                  rows={2}
                  className="flex-1 bg-raised border border-control-line rounded-control px-4 py-2 text-title-s text-ink placeholder-ink-2/50 focus:border-accent/50 focus:outline-none resize-none"
                />
                <button type="button" onClick={addStep} className="px-4 py-2 bg-raised rounded-control text-ink-2 hover:text-ink transition-colors font-sans text-label uppercase self-end mb-0">Añadir</button>
              </div>
              {form.steps.length > 0 && (
                <ol className="space-y-2">
                  {form.steps.map((step, idx) => (
                    <li key={idx} className="flex items-start gap-3 px-3 py-3 bg-raised rounded-surface border border-hairline">
                      <span className="w-5 h-5 rounded-full bg-raised text-ink-2 font-mono text-caption font-bold flex items-center justify-center shrink-0 ">{idx + 1}</span>
                      <p className="text-label text-ink-2 flex-1 leading-relaxed">{step}</p>
                      <button type="button" onClick={() => setForm(f => ({ ...f, steps: f.steps.filter((_, i) => i !== idx) }))} className="text-ink-2 hover:text-danger transition-colors shrink-0">
                        <Icon name="close" size="s" />
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </div>

          </div>
        </Dialog>
      )}

      {/* ── DELETE CONFIRM ──────────────────────────────────────────────── */}
      {confirmDelete && (
        <Dialog
          open
          onClose={() => setConfirmDelete(null)}
          title="¿Eliminar receta?"
          size="s"
          footer={(
            <>
              <Button variant="secondary" onClick={() => setConfirmDelete(null)} className="flex-1">Cancelar</Button>
              <Button
                variant="danger"
                onClick={() => handleDelete(confirmDelete)}
                disabled={deleting === confirmDelete}
                loading={deleting === confirmDelete}
                className="flex-1"
              >
                Eliminar
              </Button>
            </>
          )}
        >
          <p className="font-sans text-caption text-ink-2">
            «{recipes.find(r => r.id === confirmDelete)?.name}»
          </p>
        </Dialog>
      )}
      {limpiando && <LimpiarRecetario onCerrar={cerrarLimpieza} />}
      <ConfirmDialog />
    </div>
  );
}
