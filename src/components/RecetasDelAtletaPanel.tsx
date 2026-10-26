import { grupoDeReceta } from '../utils/grupoDeReceta';
import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AthleteDietConfig, AthleteNutritionConfig, Diet, OnboardingData, Recipe } from '../types';
import {
  cargarIndiceRecetas, getAccesoGlobalARecetas, getRecipeById, getRecipeFavorites, getReglasDeReceta, saveAccesoGlobalARecetas, saveReglasDeReceta,
} from '../dbService';
import { accesoGlobalKey, reglasDeRecetaKey } from '../hooks/useReglasDeReceta';
import { useToast } from '../hooks/useToast';
import { useConfirm } from '../hooks/useConfirm';
import { esPlatoDelRecetario } from '../db/recetasHidratacion';
import { athleteConditions, HEALTH_CONDITIONS, restrictionLabel } from '../utils/dietaryRestrictions';
import { dietTypeVigente, ingredientMatch } from '../utils/foodPrefs';
import { type DishType } from '../utils/dishTypes';
import {
  poolDelAtleta, filtrarLista, categoriasDe, FILTRO_VACIO, TOPES_DE_TIEMPO, type FiltroDeLista, type AlimentosDelAtleta,
} from '../utils/poolDelAtleta';
import { etiquetaDeTiempo, minutosDeReceta, superaElTiempo } from '../utils/tiempoDeReceta';
import { slotsFromOnboarding } from '../utils/menuEngine';
import { listaDeMenuVigente, filtrarPorLista, modoRecetarioVigente, MIN_RECETAS_DE_LISTA, type ModoRecetario } from '../utils/accesoARecetas';
import {
  conFiltro, filtroVacio, idDePaquete, TODAS_LAS_DIETAS, type FiltroDeRecetas, type PaqueteDeRecetas, type SeleccionDeRecetas,
} from '../utils/seleccionDeRecetas';
import { recetasOcultas } from '../utils/reglasDeReceta';
import { Icon, Select, Sheet, Skeleton } from './ui';
import EditorDePaquete from './EditorDePaquete';
import { RecipeDetail } from './RecipesScreen';
import RecetasDelGeneradorPanel from './RecetasDelGeneradorPanel';
import ReglasDeRecetasPanel from './ReglasDeRecetasPanel';

/* ═══════════════════════════════════════════════════════════════════════════
   Dietas › Información › Recetas del atleta (10-2026)

   Un tablero con dos columnas: «Disponibles» (lo que el atleta puede comer
   según su alta) y «En su plan» (de lo que tiran el menú que genera la app y
   «cambiar comida»). El coach pasa recetas de un lado a otro arrastrando o con
   el botón de cada fila, y nada se guarda hasta «Aplicar al atleta».

   - «En su plan» es la lista del menú del atleta (`listaMenu`, accesoARecetas.ts).
     Sin lista propia, sigue la plantilla: la global, o las Rápidas.
   - La estrella es «recomendada»: sale arriba de su recetario.
   - Lo que casi nunca hace falta (filtros por dieta, días con tiempo, esconder
     una receta solo algunos días, qué navega en el recetario) vive plegado en
     «Ajustes finos», con los paneles de siempre.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  athleteEmail: string;
  diets: Diet[];
  dietConfig: AthleteDietConfig | null;
  onboarding: OnboardingData | null;
  nutritionConfig: AthleteNutritionConfig | null;
}

type Origen = 'rapidas' | 'indya' | 'todo';
type Columna = 'disp' | 'plan';

const ORIGENES: { id: Origen; etiqueta: string }[] = [
  { id: 'rapidas', etiqueta: 'Rápidas' },
  { id: 'indya', etiqueta: 'Indya ≤15 min' },
  { id: 'todo', etiqueta: 'Todo' },
];
const NOMBRE_FRANJA: Record<number, string> = { 1: 'Desayuno', 2: 'Media mañana', 3: 'Comida', 4: 'Merienda', 5: 'Cena' };
const POR_PAGINA = 40;
const SIN_PAQUETES: PaqueteDeRecetas[] = [];
const SIN_IDS: string[] = [];
/** Pasar de golpe más de esto pide confirmación. */
const MUCHAS = 40;

const enOrigen = (r: Recipe, o: Origen) => {
  if (o === 'rapidas') return r.basica === true;
  if (o === 'indya') {
    const min = minutosDeReceta(r);
    return r.basica !== true && min != null && min <= 15;
  }
  return true;
};

const mismoConjunto = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every(x => b.has(x));

/** Ficha pequeña de estado en la fila de una receta. */
const Marca: React.FC<{ tono: 'oro' | 'aviso' | 'neutro'; icono?: string; children: React.ReactNode }> = ({ tono, icono, children }) => (
  <span className={`inline-flex items-center gap-0.5 flex-shrink-0 px-2 py-0.5 rounded-chip font-sans text-caption ${
    tono === 'oro' ? 'bg-accent/15 text-accent-ink' : tono === 'aviso' ? 'bg-warning/10 text-warning' : 'bg-raised text-ink-2'
  }`}>
    {icono && <Icon name={icono} size="s" filled />}{children}
  </span>
);

const Fila: React.FC<{
  receta: Recipe;
  columna: Columna;
  marcas: React.ReactNode;
  recomendada?: boolean;
  onRecomendar?: () => void;
  onMover: () => void;
  onVer: () => void;
  onArrastrar: (id: string, desde: Columna) => void;
  onSoltarFuera: () => void;
  key?: React.Key;
}> = ({ receta, columna, marcas, recomendada, onRecomendar, onMover, onVer, onArrastrar, onSoltarFuera }) => (
  <li
    draggable
    onDragStart={(e: React.DragEvent) => {
      // Firefox no arrastra nada sin datos en el arrastre.
      try { e.dataTransfer.setData('text/plain', receta.id); } catch { /* sin datos de arrastre */ }
      onArrastrar(receta.id, columna);
    }}
    onDragEnd={onSoltarFuera}
    className={`flex items-center gap-2 pl-2 pr-1.5 py-1.5 rounded-control border border-hairline cursor-grab active:cursor-grabbing ${columna === 'plan' ? 'bg-raised/40' : 'bg-surface'}`}
  >
    <Icon name="drag_indicator" size="s" className="text-ink-3 flex-shrink-0 hidden sm:block" />
    <button type="button" onClick={onVer} aria-label={`Ver la receta: ${receta.name.trim()}`} className="min-w-0 flex-1 text-left group">
      <span className="block font-sans text-label font-bold text-ink truncate group-hover:text-accent-ink">{receta.name.trim()}</span>
      <span className="block font-mono text-caption text-ink-2 truncate">
        {grupoDeReceta(receta)} · {etiquetaDeTiempo(receta)}{receta.tupper ? ' · tupper' : ''}
      </span>
    </button>
    <span className="hidden sm:flex flex-wrap justify-end gap-1">{marcas}</span>
    {onRecomendar && (
      <button
        type="button"
        onClick={onRecomendar}
        aria-pressed={recomendada}
        aria-label={`${recomendada ? 'Dejar de recomendar' : 'Recomendar'}: ${receta.name}`}
        title={recomendada ? 'Recomendada: sale arriba de su recetario' : 'Recomendársela: saldrá arriba de su recetario'}
        className={`flex-shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-control border transition-colors ${
          recomendada ? 'border-accent text-accent-ink bg-accent-bg' : 'border-hairline text-ink-3 hover:text-ink hover:border-strong'
        }`}
      >
        <Icon name="star" size="m" filled={recomendada} />
      </button>
    )}
    <button
      type="button"
      onClick={onMover}
      aria-label={`${columna === 'disp' ? 'Añadir a su plan' : 'Quitar de su plan'}: ${receta.name}`}
      title={columna === 'disp' ? 'Añadir a su plan' : 'Quitar de su plan'}
      className="flex-shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-control border border-hairline text-ink-2 hover:text-ink hover:border-strong"
    >
      <Icon name={columna === 'disp' ? 'arrow_forward' : 'close'} size="m" />
    </button>
  </li>
);

/** Ficha-botón de 32 px para los filtros plegados. */
const Opcion: React.FC<{ on: boolean; onClick: () => void; titulo?: string; children: React.ReactNode; key?: React.Key }> = ({ on, onClick, titulo, children }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={on}
    title={titulo}
    className={`min-h-[32px] px-2.5 rounded-chip border font-sans text-caption transition-colors ${
      on ? 'border-accent bg-accent/15 text-ink' : 'border-hairline text-ink-2 hover:text-ink'
    }`}
  >{children}</button>
);

const Seccion: React.FC<{ titulo: string; sub: string; children: React.ReactNode }> = ({ titulo, sub, children }) => {
  const [abierta, setAbierta] = useState(false);
  return (
    <div className="border-t border-hairline first:border-t-0">
      <button
        type="button"
        onClick={() => setAbierta(v => !v)}
        aria-expanded={abierta}
        className="w-full flex items-center justify-between gap-2 min-h-[48px] text-left"
      >
        <span className="min-w-0">
          <span className="font-sans text-label font-bold text-ink">{titulo}</span>
          <span className="block font-mono text-caption text-ink-3">{sub}</span>
        </span>
        <Icon name="expand_more" size="s" className={`text-ink-2 flex-shrink-0 transition-transform ${abierta ? 'rotate-180' : ''}`} />
      </button>
      {abierta && <div className="pb-4">{children}</div>}
    </div>
  );
};

export default function RecetasDelAtletaPanel({ athleteEmail, diets, dietConfig, onboarding, nutritionConfig }: Props) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();

  const { data: doc, isPending: cargandoReglas } = useQuery({
    queryKey: reglasDeRecetaKey(athleteEmail),
    queryFn: () => getReglasDeReceta(athleteEmail),
    staleTime: 5 * 60_000,
  });
  const { data: global, isPending: cargandoGlobal } = useQuery({
    queryKey: accesoGlobalKey,
    queryFn: getAccesoGlobalARecetas,
    staleTime: 5 * 60_000,
  });
  const { data: indice = [], isPending: cargandoIndice } = useQuery({
    queryKey: ['recetarioIndice'],
    queryFn: cargarIndiceRecetas,
    staleTime: Infinity,
  });
  const { data: favoritos } = useQuery({
    queryKey: ['recipeFavorites', athleteEmail],
    queryFn: () => getRecipeFavorites(athleteEmail),
  });

  const paquetes = global?.paquetes ?? SIN_PAQUETES;
  const recsGuardadas = doc?.recomendadas ?? SIN_IDS;
  const reglas = useMemo(() => doc?.reglas ?? [], [doc]);
  const propia = (doc?.listaMenu?.length ?? 0) > 0;

  // La plantilla: lo que tiene un atleta sin plan propio (la lista global, o las Rápidas).
  const plantilla = useMemo(() => {
    const v = listaDeMenuVigente(undefined, global?.listaMenu);
    return new Set(v === 'rapidas' ? filtrarPorLista(indice, 'rapidas').map(r => r.id) : v);
  }, [global, indice]);
  const planGuardado = useMemo(
    () => (propia ? new Set(doc!.listaMenu) : plantilla),
    [propia, doc, plantilla],
  );

  // Borrador: `null` = sin tocar (manda lo guardado).
  const [planBorrador, setPlanBorrador] = useState<Set<string> | null>(null);
  const [recsBorrador, setRecsBorrador] = useState<string[] | null>(null);
  const plan = planBorrador ?? planGuardado;
  const recs = recsBorrador ?? recsGuardadas;
  const recsSet = useMemo(() => new Set(recs), [recs]);

  const cambios = useMemo(() => {
    let n = 0;
    for (const id of plan) if (!planGuardado.has(id)) n++;
    for (const id of planGuardado) if (!plan.has(id)) n++;
    const antes = new Set(recsGuardadas);
    for (const id of recs) if (!antes.has(id)) n++;
    for (const id of recsGuardadas) if (!recsSet.has(id)) n++;
    return n;
  }, [plan, planGuardado, recs, recsGuardadas, recsSet]);

  // Lo que el atleta puede recibir según su alta. El tiempo NO se aplica aquí:
  // los «días con tiempo» lo levantan, así que se avisa en la fila en vez de esconderla.
  const tiempoMax = nutritionConfig?.cookingMaxTime ?? onboarding?.cookingMaxTime;
  const pool = useMemo(() => poolDelAtleta(indice.filter(esPlatoDelRecetario), {
    allergies: onboarding?.allergies ?? [],
    conditions: athleteConditions(onboarding),
    dietType: dietTypeVigente(nutritionConfig?.dietType, onboarding?.dietType),
    excludedDishTypes: (nutritionConfig?.excludedDishTypes ?? onboarding?.excludedDishTypes ?? []) as DishType[],
    dislikedRecipeIds: favoritos?.dislikedIds ?? [],
  }), [indice, onboarding, nutritionConfig, favoritos]);
  const poolIds = useMemo(() => new Set(pool.map(r => r.id)), [pool]);
  const fueraPorAlta = indice.filter(esPlatoDelRecetario).length - pool.length;

  const alimentos: AlimentosDelAtleta = useMemo(() => ({
    gustan: onboarding?.likedFoods ?? [],
    noGustan: onboarding?.dislikedFoods ?? [],
  }), [onboarding]);
  const condiciones = useMemo(() => athleteConditions(onboarding), [onboarding]);
  const excluidoSiempre = [...condiciones.map(restrictionLabel), ...(onboarding?.allergies ?? [])];
  const escondidas = useMemo(() => recetasOcultas(reglas, 'menu'), [reglas]);

  const franjas = useMemo(() => {
    const slots = slotsFromOnboarding(onboarding, nutritionConfig?.hungerProfile, nutritionConfig?.mealCount);
    return [...new Set(slots.map(s => s.slot))].sort((a, b) => a - b);
  }, [onboarding, nutritionConfig]);

  // ── Columna izquierda: filtros ─────────────────────────────────────────────
  const [origen, setOrigen] = useState<Origen>('indya');
  const [filtro, setFiltro] = useState<FiltroDeLista>(FILTRO_VACIO);
  const [franja, setFranja] = useState<number | null>(null);
  const [soloTupper, setSoloTupper] = useState(false);
  const [verFiltros, setVerFiltros] = useState(false);
  const [visiblesDisp, setVisiblesDisp] = useState(POR_PAGINA);
  const [buscaPlan, setBuscaPlan] = useState('');
  const [visiblesPlan, setVisiblesPlan] = useState(POR_PAGINA);
  const [verAlta, setVerAlta] = useState(false);
  const cambiarFiltro = (parcial: Partial<FiltroDeLista>) => { setFiltro(f => ({ ...f, ...parcial })); setVisiblesDisp(POR_PAGINA); };
  const nFiltros = (filtro.categoria ? 1 : 0) + (filtro.tiempo ? 1 : 0) + (filtro.ingrediente.trim() ? 1 : 0)
    + filtro.condiciones.length + (filtro.alimentos ? 1 : 0) + (franja != null ? 1 : 0) + (soloTupper ? 1 : 0);
  const quitarFiltros = () => { setFiltro(f => ({ ...FILTRO_VACIO, texto: f.texto })); setFranja(null); setSoloTupper(false); setVisiblesDisp(POR_PAGINA); };
  const categorias = useMemo(() => categoriasDe(pool), [pool]);

  const disponibles = useMemo(() => {
    const base = pool.filter(r => !plan.has(r.id) && enOrigen(r, origen)
      && (franja == null || (r.intakeTypes ?? []).includes(franja)) && (!soloTupper || r.tupper));
    return filtrarLista(base, filtro, alimentos);
  }, [pool, plan, origen, franja, soloTupper, filtro, alimentos]);
  const porOrigen = useMemo(() => {
    const n: Record<Origen, number> = { rapidas: 0, indya: 0, todo: 0 };
    for (const r of pool) {
      if (plan.has(r.id)) continue;
      n.todo++;
      if (enOrigen(r, 'rapidas')) n.rapidas++;
      else if (enOrigen(r, 'indya')) n.indya++;
    }
    return n;
  }, [pool, plan]);

  // ── Columna derecha: su plan, por comidas ──────────────────────────────────
  const enPlan = useMemo(() => pool.filter(r => plan.has(r.id)), [pool, plan]);
  const fueraDeSuAlta = [...plan].filter(id => !poolIds.has(id)).length;
  const recuento = franjas.map(slot => ({ slot, total: enPlan.filter(r => (r.intakeTypes ?? []).includes(slot)).length }));
  const grupos = useMemo(() => {
    const q = buscaPlan.trim();
    const lista = (q ? filtrarLista(enPlan, { ...FILTRO_VACIO, texto: q }) : enPlan)
      .slice().sort((a, b) => (recsSet.has(b.id) ? 1 : 0) - (recsSet.has(a.id) ? 1 : 0) || a.name.localeCompare(b.name, 'es'));
    const visibles = lista.slice(0, visiblesPlan);
    const porFranja = new Map<number | 'otras', Recipe[]>();
    for (const r of visibles) {
      // Cada receta se enseña una vez, en la primera de sus comidas que use el atleta.
      const k = franjas.find(s => (r.intakeTypes ?? []).includes(s)) ?? 'otras';
      porFranja.set(k, [...(porFranja.get(k) ?? []), r]);
    }
    return {
      total: lista.length,
      lista: [...franjas, 'otras' as const].filter(k => porFranja.has(k)).map(k => ({
        clave: String(k), titulo: k === 'otras' ? 'Otras comidas' : NOMBRE_FRANJA[k] ?? `Comida ${k}`, recetas: porFranja.get(k)!,
      })),
    };
  }, [enPlan, buscaPlan, visiblesPlan, recsSet, franjas]);
  const hayFiltrosPorDieta = !filtroVacio(doc?.seleccion?.general) || Object.values(doc?.seleccion?.porDieta ?? {}).some(f => !filtroVacio(f));

  // ── Mover ──────────────────────────────────────────────────────────────────
  const anadir = (ids: string[]) => {
    const siguiente = new Set(plan);
    ids.forEach(id => siguiente.add(id));
    setPlanBorrador(siguiente);
  };
  const quitar = (id: string) => {
    const siguiente = new Set(plan);
    siguiente.delete(id);
    setPlanBorrador(siguiente);
    // Fuera de su plan no tiene sentido recomendarla.
    if (recsSet.has(id)) setRecsBorrador(recs.filter(x => x !== id));
  };
  const recomendar = (id: string) =>
    setRecsBorrador(recsSet.has(id) ? recs.filter(x => x !== id) : [id, ...recs]);

  const [arrastrando, setArrastrando] = useState<{ id: string; desde: Columna } | null>(null);
  const [encima, setEncima] = useState<Columna | null>(null);
  const zona = (col: Columna) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!arrastrando || arrastrando.desde === col) return;
      e.preventDefault();
      if (encima !== col) setEncima(col);
    },
    onDragLeave: () => setEncima(null),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      if (arrastrando && arrastrando.desde !== col) {
        if (col === 'plan') anadir([arrastrando.id]); else quitar(arrastrando.id);
      }
      setArrastrando(null);
      setEncima(null);
    },
  });
  const finArrastre = () => { setArrastrando(null); setEncima(null); };

  const pasarVisibles = async () => {
    const ids = disponibles.map(r => r.id);
    if (ids.length > MUCHAS && !await confirm(`¿Pasar las ${ids.length.toLocaleString('es-ES')} recetas que se ven a su plan?`)) return;
    anadir(ids);
  };

  // ── Guardar ────────────────────────────────────────────────────────────────
  const nombreDe = useMemo(() => {
    const m = new Map(indice.map(r => [r.id, r.name]));
    return (id: string) => m.get(id);
  }, [indice]);

  const guardar = useMutation({
    mutationFn: (cambio: Parameters<typeof saveReglasDeReceta>[0]) => saveReglasDeReceta(cambio, nombreDe),
    onSuccess: () => {
      setPlanBorrador(null);
      setRecsBorrador(null);
      showToast('Aplicado: su menú y sus cambios de comida ya usan este plan', 'success');
    },
    onError: () => showToast('No se pudo guardar. Tus cambios siguen en el borrador: inténtalo otra vez.'),
    onSettled: () => queryClient.invalidateQueries({ queryKey: reglasDeRecetaKey(athleteEmail) }),
  });

  const aplicar = () => {
    // Igual que la plantilla = sin plan propio: así le llegan los cambios de la plantilla.
    const listaMenu = mismoConjunto(plan, plantilla) ? [] : [...plan];
    // Recomendar una receta escondida la vuelve a permitir (ver conRecomendada);
    // solo con las que se recomiendan ahora, no con las de antes.
    const nuevas = new Set(recs.filter(id => !recsGuardadas.includes(id)));
    const reglasLimpias = reglas.filter(r => !nuevas.has(r.recipeId));
    guardar.mutate({
      athleteId: athleteEmail,
      listaMenu,
      recomendadas: recs,
      ...(reglasLimpias.length !== reglas.length ? { reglas: reglasLimpias } : {}),
    });
  };
  const descartar = () => { setPlanBorrador(null); setRecsBorrador(null); };

  const guardarGlobal = useMutation({
    mutationFn: (cambio: { listaMenu?: string[]; paquetes?: PaqueteDeRecetas[] }) => saveAccesoGlobalARecetas(cambio),
    onMutate: async cambio => {
      await queryClient.cancelQueries({ queryKey: accesoGlobalKey });
      const previo = queryClient.getQueryData(accesoGlobalKey);
      queryClient.setQueryData(accesoGlobalKey, (p: object | undefined) => ({ ...p, ...cambio }));
      return { previo };
    },
    onError: (_e, _v, ctx) => {
      queryClient.setQueryData(accesoGlobalKey, ctx?.previo);
      showToast('No se pudo guardar. Inténtalo otra vez.');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: accesoGlobalKey }),
  });

  const usarDePlantilla = async () => {
    const n = plan.size;
    if (!await confirm(`Los atletas sin plan propio pasarán a usar estas ${n.toLocaleString('es-ES')} recetas, y los nuevos empezarán con ellas. ¿Seguro?`)) return;
    guardarGlobal.mutate({ listaMenu: [...plan] }, { onSuccess: () => showToast('Plantilla actualizada', 'success') });
  };

  const modoRecetario = modoRecetarioVigente(doc?.recetario);
  const guardarModo = useMutation({
    mutationFn: (recetario: ModoRecetario) => saveReglasDeReceta({ athleteId: athleteEmail, recetario }, nombreDe),
    onError: () => showToast('No se pudo guardar el cambio. Inténtalo otra vez.'),
    onSettled: () => queryClient.invalidateQueries({ queryKey: reglasDeRecetaKey(athleteEmail) }),
  });

  // ── Ver una receta por dentro ──────────────────────────────────────────────
  // El índice no trae pasos ni cantidades: se lee la receta entera al abrirla
  // (como en el recetario del atleta) y mientras tanto se enseña lo que hay.
  const [viendo, setViendo] = useState<Recipe | null>(null);
  const ver = (r: Recipe) => {
    setViendo(r);
    if (r.stepsText) return;
    getRecipeById(r.id)
      .then(completa => { if (completa) setViendo(prev => (prev?.id === r.id ? completa : prev)); })
      .catch(() => { /* se queda con lo del índice */ });
  };

  // ── Paquetes ───────────────────────────────────────────────────────────────
  const [editando, setEditando] = useState<PaqueteDeRecetas | null>(null);
  const cargarPaquete = (p: PaqueteDeRecetas) => {
    const suyas = p.recipeIds.filter(id => poolIds.has(id) && !plan.has(id));
    const noLeValen = p.recipeIds.filter(id => !poolIds.has(id)).length;
    if (suyas.length === 0) {
      showToast(noLeValen ? `Las que faltan de «${p.nombre}» no le valen por su alta` : `«${p.nombre}» ya está entero en su plan`);
      return;
    }
    anadir(suyas);
    showToast(`«${p.nombre}»: ${suyas.length} a su plan${noLeValen ? ` (${noLeValen} no le valen por su alta)` : ''}`, 'success');
  };

  if (cargandoReglas || cargandoGlobal || cargandoIndice) return <Skeleton className="h-40 w-full" />;

  // Con poco tiempo (≤15 min) el menú no se fía de los minutos estimados del
  // recetario: esas recetas solo salen sus días con tiempo. Se avisa una vez
  // arriba de la lista, no en cada fila.
  const soloMinutosReales = superaElTiempo({ cookingTime: 4 }, tiempoMax);
  const recsFuera = recs.filter(id => !plan.has(id));
  const marcasDe = (r: Recipe) => (
    <>
      {r.basica && <Marca tono="oro" icono="bolt">Rápida</Marca>}
      {escondidas.has(r.id) && <Marca tono="aviso" icono="visibility_off">Escondida</Marca>}
      {superaElTiempo(r, tiempoMax) && !(soloMinutosReales && r.basica !== true) && <Marca tono="aviso">Pasa de sus {tiempoMax} min</Marca>}
      {alimentos.noGustan.some(a => ingredientMatch(r, a)) && <Marca tono="aviso">No le gusta algo</Marca>}
    </>
  );

  return (
    <div className="space-y-4">
      {/* Cabecera y borrador */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex-1 basis-80">
          <h3 className="font-sans font-bold text-title-s text-ink flex items-center gap-2">
            <Icon name="menu_book" size="m" className="text-accent-ink" />
            Recetas del atleta
          </h3>
          <p className="font-sans text-label text-ink-2 mt-1">
            Pasa recetas de un lado a otro. Lo que está en «En su plan» es de lo que tira el menú que genera la app y los
            cambios de comida.
          </p>
        </div>
        {cambios > 0 ? (
          <div className="flex items-center gap-1 pl-3 pr-1 py-1 rounded-surface border border-accent-line bg-surface">
            <span className="font-mono text-caption text-accent-ink">Borrador · {cambios} {cambios === 1 ? 'cambio' : 'cambios'}</span>
            <button type="button" onClick={descartar} disabled={guardar.isPending}
              className="min-h-[44px] px-3 font-sans text-caption text-ink-2 hover:text-ink disabled:opacity-50">Descartar</button>
            <button type="button" onClick={aplicar} disabled={guardar.isPending}
              className="min-h-[44px] px-4 rounded-control bg-accent text-on-accent font-sans text-caption font-bold disabled:opacity-50">
              {guardar.isPending ? 'Aplicando…' : 'Aplicar al atleta'}
            </button>
          </div>
        ) : (
          <span className="font-mono text-caption text-ink-3 py-3">
            {propia ? 'Plan propio' : 'Sigue la plantilla'} · sin cambios pendientes
          </span>
        )}
      </div>

      {/* Lo que ya viene de su alta, en una línea */}
      <div className="bg-surface border border-hairline rounded-surface px-3 py-2 space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-caption uppercase text-ink-2 mr-1">Ya aplicado por su alta</span>
          {excluidoSiempre.length > 0 && <Marca tono="aviso">Sin {excluidoSiempre.slice(0, 3).join(', ').toLowerCase()}{excluidoSiempre.length > 3 ? ` +${excluidoSiempre.length - 3}` : ''}</Marca>}
          {alimentos.noGustan.length > 0 && <Marca tono="aviso">No le gusta: {alimentos.noGustan.slice(0, 3).join(', ').toLowerCase()}{alimentos.noGustan.length > 3 ? ` +${alimentos.noGustan.length - 3}` : ''}</Marca>}
          {alimentos.gustan.length > 0 && <Marca tono="oro">Le gusta: {alimentos.gustan.slice(0, 3).join(', ').toLowerCase()}{alimentos.gustan.length > 3 ? ` +${alimentos.gustan.length - 3}` : ''}</Marca>}
          {tiempoMax != null && <Marca tono="neutro">Cocina hasta {tiempoMax} min</Marca>}
          {!excluidoSiempre.length && !alimentos.noGustan.length && !alimentos.gustan.length && tiempoMax == null && (
            <span className="font-sans text-caption text-ink-3">Nada indicado en su alta.</span>
          )}
          <span className="flex-1" />
          <span className="font-mono text-caption text-ink-2">{fueraPorAlta.toLocaleString('es-ES')} recetas fuera por esto</span>
          <button type="button" onClick={() => setVerAlta(v => !v)} aria-expanded={verAlta}
            className="min-h-[36px] px-3 rounded-control border border-hairline font-sans text-caption text-ink-2 hover:text-ink">
            {verAlta ? 'Cerrar' : 'Ver todo'}
          </button>
        </div>
        {verAlta && (
          <div className="pt-2 border-t border-hairline space-y-2">
            <p className="font-sans text-caption text-ink-2">
              Lo rellenó el atleta en su alta y la app ya lo respeta en todas partes: no hace falta tocarlo. Toca un alimento
              para ver qué recetas disponibles lo llevan.
            </p>
            {[
              { titulo: 'Excluido siempre', items: excluidoSiempre, tono: 'text-danger border-danger/40 bg-danger/10', filtrable: false },
              { titulo: 'No le gusta', items: alimentos.noGustan, tono: 'text-warning border-warning/40 bg-warning/10', filtrable: true },
              { titulo: 'Le gusta', items: alimentos.gustan, tono: 'text-accent-ink border-accent-line bg-accent/10', filtrable: true },
            ].filter(g => g.items.length > 0).map(g => (
              <div key={g.titulo} className="flex flex-wrap items-center gap-1.5">
                <span className="w-full sm:w-28 font-mono text-caption text-ink-3">{g.titulo}</span>
                {g.items.map(a => g.filtrable ? (
                  <button key={a} type="button" aria-label={`Ver recetas con ${a}`}
                    onClick={() => { cambiarFiltro({ ingrediente: a, modoIngrediente: 'con' }); setOrigen('todo'); setVerFiltros(true); }}
                    className={`min-h-[32px] px-2.5 rounded-chip border font-sans text-caption ${g.tono} hover:brightness-125`}>{a}</button>
                ) : (
                  <span key={a} className={`inline-flex items-center min-h-[32px] px-2.5 rounded-chip border font-sans text-caption ${g.tono}`}>{a}</span>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* El tablero */}
      <div className="grid gap-4 lg:grid-cols-2 items-start">
        {/* Disponibles */}
        <section
          aria-label="Recetas disponibles"
          {...zona('disp')}
          className={`min-w-0 bg-surface border rounded-surface p-4 space-y-3 transition-colors ${encima === 'disp' ? 'border-accent border-dashed' : 'border-hairline'}`}
        >
          <div className="flex items-baseline justify-between gap-2">
            <h4 className="font-sans font-bold text-label text-ink">Disponibles</h4>
            <span className="font-mono text-caption text-ink-2">{disponibles.length.toLocaleString('es-ES')} a la vista</span>
          </div>

          <div role="group" aria-label="De dónde salen" className="flex p-0.5 gap-0.5 rounded-control bg-raised">
            {ORIGENES.map(o => (
              <button
                key={o.id}
                type="button"
                onClick={() => { setOrigen(o.id); setVisiblesDisp(POR_PAGINA); }}
                aria-pressed={origen === o.id}
                className={`flex-1 min-h-[40px] px-2 rounded-control font-sans text-caption transition-colors ${
                  origen === o.id ? 'bg-surface text-ink font-bold shadow-sm' : 'text-ink-2 hover:text-ink'
                }`}
              >
                {o.etiqueta} <span className="font-mono font-normal text-ink-3">{porOrigen[o.id].toLocaleString('es-ES')}</span>
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              type="search"
              value={filtro.texto}
              onChange={e => cambiarFiltro({ texto: e.target.value })}
              placeholder="Buscar receta"
              aria-label="Buscar receta disponible por nombre"
              className="min-w-0 flex-1 bg-bg border border-hairline rounded-control px-3 min-h-[44px] font-sans text-base text-ink focus:outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={() => setVerFiltros(v => !v)}
              aria-expanded={verFiltros}
              className="flex-shrink-0 inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-control border border-hairline font-sans text-caption text-ink-2 hover:text-ink"
            >
              <Icon name="tune" size="s" />
              Filtros
              {nFiltros > 0 && (
                <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full bg-accent text-on-accent font-mono text-caption font-bold">{nFiltros}</span>
              )}
            </button>
          </div>

          {verFiltros && (
            <div className="rounded-control bg-bg border border-hairline p-3 space-y-3">
              {franjas.length > 1 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="w-full sm:w-24 font-mono text-caption text-ink-3">Comida</span>
                  {franjas.map(s => (
                    <Opcion key={s} on={franja === s} onClick={() => { setFranja(franja === s ? null : s); setVisiblesDisp(POR_PAGINA); }}>
                      {NOMBRE_FRANJA[s] ?? `Comida ${s}`}
                    </Opcion>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="w-full sm:w-24 font-mono text-caption text-ink-3">Más</span>
                <Opcion on={soloTupper} onClick={() => { setSoloTupper(v => !v); setVisiblesDisp(POR_PAGINA); }}>Aguanta en tupper</Opcion>
                {alimentos.gustan.length > 0 && (
                  <Opcion on={filtro.alimentos === 'gustan'} onClick={() => cambiarFiltro({ alimentos: filtro.alimentos === 'gustan' ? '' : 'gustan' })}>
                    Lleva algo que le gusta
                  </Opcion>
                )}
                {alimentos.noGustan.length > 0 && (
                  <Opcion on={filtro.alimentos === 'no_gustan'} onClick={() => cambiarFiltro({ alimentos: filtro.alimentos === 'no_gustan' ? '' : 'no_gustan' })}>
                    Lleva algo que NO le gusta
                  </Opcion>
                )}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Select
                  label="Categoría"
                  value={filtro.categoria}
                  onChange={v => cambiarFiltro({ categoria: v })}
                  options={[
                    { value: '', label: 'Todas las categorías' },
                    ...categorias.map(c => ({ value: c.nombre, label: `${c.nombre} (${c.total.toLocaleString('es-ES')})` })),
                  ]}
                />
                <Select
                  label="Tiempo"
                  value={filtro.tiempo}
                  onChange={v => cambiarFiltro({ tiempo: v as FiltroDeLista['tiempo'] })}
                  options={TOPES_DE_TIEMPO}
                />
              </div>
              <div className="flex gap-2">
                <input
                  type="search"
                  value={filtro.ingrediente}
                  onChange={e => cambiarFiltro({ ingrediente: e.target.value })}
                  placeholder="Ingrediente (atún, huevo…)"
                  aria-label="Filtrar por ingrediente"
                  className="min-w-0 flex-1 bg-surface border border-hairline rounded-control px-3 min-h-[44px] font-sans text-base text-ink focus:outline-none focus:border-accent"
                />
                <div role="group" aria-label="Con o sin ese ingrediente" className="flex flex-shrink-0 border border-hairline rounded-control overflow-hidden">
                  {(['con', 'sin'] as const).map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => cambiarFiltro({ modoIngrediente: m })}
                      aria-pressed={filtro.modoIngrediente === m}
                      className={`px-3 min-h-[44px] font-sans text-caption font-bold uppercase transition-colors ${
                        filtro.modoIngrediente === m ? 'bg-accent text-on-accent' : 'text-ink-2 hover:text-ink'
                      }`}
                    >{m}</button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="w-full font-mono text-caption text-ink-3">Apta para (todas las marcadas)</span>
                {HEALTH_CONDITIONS.map(c => {
                  const on = filtro.condiciones.includes(c.code);
                  const suya = condiciones.includes(c.code);
                  return (
                    <Opcion key={c.code} on={on} titulo={suya ? 'Ya la tiene: su lista ya cumple esta condición' : c.help}
                      onClick={() => cambiarFiltro({ condiciones: on ? filtro.condiciones.filter(x => x !== c.code) : [...filtro.condiciones, c.code] })}>
                      {c.label}{suya ? ' · suya' : ''}
                    </Opcion>
                  );
                })}
              </div>
              {nFiltros > 0 && (
                <button type="button" onClick={quitarFiltros} className="min-h-[32px] font-mono text-caption text-ink-2 hover:text-ink underline">
                  Quitar filtros
                </button>
              )}
            </div>
          )}

          {soloMinutosReales && origen !== 'rapidas' && (
            <p className="rounded-control bg-warning/10 px-3 py-2 font-sans text-caption text-warning">
              Cocina hasta {tiempoMax} min: las de Indya llevan minutos estimados, así que el menú solo se las pone sus días
              con tiempo (Ajustes finos).
            </p>
          )}

          {encima === 'disp' && (
            <p className="py-2 rounded-control border-2 border-dashed border-accent text-center font-sans text-caption text-accent-ink">
              Suelta aquí para quitarla de su plan
            </p>
          )}

          {disponibles.length === 0 ? (
            <p className="py-6 text-center font-sans text-label text-ink-3">
              {porOrigen[origen] === 0 ? 'Ya están todas en su plan.' : 'Ninguna receta coincide con esos filtros.'}
            </p>
          ) : (
            <ul className="m-0 p-0 list-none space-y-1.5 max-h-[560px] overflow-y-auto pr-0.5">
              {disponibles.slice(0, visiblesDisp).map(r => (
                <Fila key={r.id} receta={r} columna="disp" marcas={marcasDe(r)}
                  onMover={() => anadir([r.id])} onVer={() => ver(r)} onArrastrar={(id, desde) => setArrastrando({ id, desde })} onSoltarFuera={finArrastre} />
              ))}
              {disponibles.length > visiblesDisp && (
                <li>
                  <button type="button" onClick={() => setVisiblesDisp(v => v + POR_PAGINA)}
                    className="w-full min-h-[44px] font-mono text-caption text-accent-ink hover:underline">
                    Ver {Math.min(POR_PAGINA, disponibles.length - visiblesDisp)} más ({(disponibles.length - visiblesDisp).toLocaleString('es-ES')} sin mostrar)
                  </button>
                </li>
              )}
            </ul>
          )}

          {disponibles.length > 0 && (
            <button type="button" onClick={pasarVisibles}
              className="w-full min-h-[44px] rounded-control border border-dashed border-strong font-sans text-caption text-ink-2 hover:text-ink">
              Pasar las {disponibles.length.toLocaleString('es-ES')} que se ven a su plan
            </button>
          )}

          <div className="pt-3 border-t border-hairline space-y-2">
            <p className="font-mono text-caption uppercase text-ink-2">Mis paquetes · un toque y entran todas</p>
            <div className="flex flex-wrap items-center gap-1.5">
              {paquetes.map(p => (
                <span key={p.id} className="inline-flex items-center">
                  <button type="button" onClick={() => cargarPaquete(p)} aria-label={`Añadir el paquete ${p.nombre} a su plan`}
                    className="inline-flex items-center gap-1 min-h-[36px] pl-2.5 pr-2 rounded-chip border border-hairline font-sans text-caption text-ink hover:border-strong">
                    <Icon name="inventory_2" size="s" className="text-accent-ink" />
                    {p.nombre} <span className="font-mono text-ink-3">{p.recipeIds.length}</span>
                  </button>
                  <button type="button" onClick={() => setEditando(p)} aria-label={`Editar paquete ${p.nombre}`}
                    className="flex h-9 w-8 items-center justify-center text-ink-3 hover:text-ink">
                    <Icon name="edit" size="s" />
                  </button>
                </span>
              ))}
              <button type="button" onClick={() => setEditando({ id: '', nombre: '', recipeIds: [] })}
                className="inline-flex items-center gap-1 min-h-[36px] px-2.5 rounded-chip border border-dashed border-hairline font-sans text-caption text-ink-2 hover:text-ink">
                <Icon name="add" size="s" /> Nuevo paquete
              </button>
            </div>
          </div>
        </section>

        {/* En su plan */}
        <section
          aria-label="Recetas en su plan"
          {...zona('plan')}
          className={`min-w-0 bg-surface border rounded-surface p-4 space-y-3 transition-colors ${encima === 'plan' ? 'border-accent border-dashed' : 'border-accent-line'}`}
        >
          <div className="flex items-baseline justify-between gap-2">
            <h4 className="font-sans font-bold text-label text-ink">En su plan</h4>
            <span className="font-mono text-caption text-ink-2">{enPlan.length.toLocaleString('es-ES')} recetas · {recs.length} recomendadas</span>
          </div>
          <p className="font-sans text-caption text-ink-2">
            {propia || planBorrador ? 'Su plan propio.' : 'Empieza con tu plantilla.'} La estrella la pone arriba en su recetario.
          </p>

          {recuento.length > 0 && (
            <div className="grid gap-1.5 grid-cols-[repeat(auto-fit,minmax(88px,1fr))]">
              {recuento.map(({ slot, total }) => {
                const pocas = total < MIN_RECETAS_DE_LISTA;
                return (
                  <div key={slot} className={`rounded-control px-2.5 py-1.5 ${pocas ? 'bg-warning/10' : 'bg-raised'}`}
                    title={pocas ? `Con menos de ${MIN_RECETAS_DE_LISTA}, esa comida tira de todo lo disponible` : undefined}>
                    <p className="font-mono text-caption text-ink-2">{NOMBRE_FRANJA[slot] ?? `Comida ${slot}`}</p>
                    <p className={`font-sans text-label font-bold ${pocas ? 'text-warning' : 'text-ink'}`}>{total}</p>
                    {pocas && <p className="font-mono text-caption text-warning">Pocas: usará todas</p>}
                  </div>
                );
              })}
            </div>
          )}

          {hayFiltrosPorDieta && (
            <p className="rounded-control bg-warning/10 px-3 py-2 font-sans text-caption text-warning">
              Tiene filtros por dieta en «Ajustes finos»: esas dietas usan sus filtros en vez de este plan.
            </p>
          )}
          {recsFuera.length > 0 && (
            <p className="font-sans text-caption text-ink-2">
              {recsFuera.length} {recsFuera.length === 1 ? 'recomendada no está' : 'recomendadas no están'} en su plan: salen en su
              recetario, pero no en el menú.{' '}
              <button type="button" onClick={() => anadir(recsFuera.filter(id => poolIds.has(id)))} className="text-accent-ink hover:underline">
                Pasarlas a su plan
              </button>
              {' · '}
              <button type="button" onClick={() => setRecsBorrador(recs.filter(id => plan.has(id)))} className="text-accent-ink hover:underline">
                Dejar de recomendarlas
              </button>
            </p>
          )}
          {fueraDeSuAlta > 0 && (
            <p className="font-mono text-caption text-ink-3">
              {fueraDeSuAlta} {fueraDeSuAlta === 1 ? 'receta del plan no le vale' : 'recetas del plan no le valen'} por su alta: no se enseñan ni le saldrán.
            </p>
          )}

          {enPlan.length > 12 && (
            <input
              type="search"
              value={buscaPlan}
              onChange={e => { setBuscaPlan(e.target.value); setVisiblesPlan(POR_PAGINA); }}
              placeholder="Buscar en su plan"
              aria-label="Buscar receta en su plan"
              className="w-full bg-bg border border-hairline rounded-control px-3 min-h-[44px] font-sans text-base text-ink focus:outline-none focus:border-accent"
            />
          )}

          {encima === 'plan' && (
            <p className="py-2 rounded-control border-2 border-dashed border-accent bg-accent/10 text-center font-sans text-caption text-accent-ink">
              Suelta aquí para añadirla a su plan
            </p>
          )}

          {enPlan.length === 0 ? (
            <p className="py-6 text-center font-sans text-label text-ink-3">
              Su plan está vacío: el menú usará todas las disponibles. Arrastra recetas aquí o carga un paquete.
            </p>
          ) : (
            <div className="space-y-3 max-h-[640px] overflow-y-auto pr-0.5">
              {grupos.lista.map(g => (
                <div key={g.clave} className="space-y-1.5">
                  <p className="font-sans text-caption font-bold text-ink">
                    {g.titulo} <span className="font-mono font-normal text-ink-3">{g.recetas.length}</span>
                  </p>
                  <ul className="m-0 p-0 list-none space-y-1.5">
                    {g.recetas.map(r => (
                      <Fila key={r.id} receta={r} columna="plan" marcas={marcasDe(r)}
                        recomendada={recsSet.has(r.id)} onRecomendar={() => recomendar(r.id)}
                        onMover={() => quitar(r.id)} onVer={() => ver(r)} onArrastrar={(id, desde) => setArrastrando({ id, desde })} onSoltarFuera={finArrastre} />
                    ))}
                  </ul>
                </div>
              ))}
              {grupos.total > visiblesPlan && (
                <button type="button" onClick={() => setVisiblesPlan(v => v + POR_PAGINA)}
                  className="w-full min-h-[44px] font-mono text-caption text-accent-ink hover:underline">
                  Ver {Math.min(POR_PAGINA, grupos.total - visiblesPlan)} más ({grupos.total - visiblesPlan} sin mostrar)
                </button>
              )}
              {grupos.total === 0 && <p className="py-4 text-center font-sans text-label text-ink-3">Ninguna receta de su plan coincide.</p>}
            </div>
          )}

          <div className="pt-3 border-t border-hairline flex flex-wrap items-center gap-2">
            <button type="button" disabled={enPlan.length === 0}
              onClick={() => setEditando({ id: '', nombre: '', recipeIds: enPlan.map(r => r.id) })}
              className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-control border border-hairline font-sans text-caption text-ink hover:border-strong disabled:opacity-50">
              <Icon name="inventory_2" size="s" className="text-accent-ink" /> Guardar como paquete
            </button>
            {!mismoConjunto(plan, plantilla) && (
              <>
                <button type="button" onClick={usarDePlantilla} disabled={guardarGlobal.isPending || plan.size === 0}
                  className="min-h-[44px] px-3 rounded-control border border-hairline font-sans text-caption text-ink hover:border-strong disabled:opacity-50">
                  Usar de plantilla
                </button>
                <button type="button" onClick={() => setPlanBorrador(new Set(plantilla))}
                  className="min-h-[44px] px-2 font-mono text-caption text-ink-2 hover:text-ink underline">
                  Volver a la plantilla ({plantilla.size})
                </button>
              </>
            )}
          </div>
        </section>
      </div>

      {/* Ajustes finos */}
      <div className="bg-surface border border-hairline rounded-surface px-4">
        <p className="pt-3 font-sans text-label font-bold text-ink">
          Ajustes finos <span className="font-mono text-caption font-normal text-ink-3">· excepciones, casi nunca hace falta</span>
        </p>
        <Seccion titulo="Recetario que navega" sub={modoRecetario === 'recomendadas' ? 'Solo las recomendadas' : 'Todas las recetas'}>
          <p className="font-sans text-caption text-ink-2 mb-2">
            Cómo lo explora no cambia, solo cuántas hay dentro.
            {modoRecetario === 'recomendadas' && recsGuardadas.length === 0 ? ' Aún no le has recomendado ninguna: mientras tanto ve todas.' : ''}
          </p>
          <div role="group" aria-label="Recetas que ve en el recetario" className="inline-flex border border-hairline rounded-control overflow-hidden">
            {([['todas', 'Todas'], ['recomendadas', `Solo las recomendadas (${recsGuardadas.length})`]] as const).map(([v, texto]) => (
              <button key={v} type="button" onClick={() => guardarModo.mutate(v)} disabled={guardarModo.isPending} aria-pressed={modoRecetario === v}
                className={`px-3 min-h-[44px] font-sans text-caption font-bold transition-colors disabled:opacity-50 ${
                  modoRecetario === v ? 'bg-accent text-on-accent' : 'text-ink-2 hover:text-ink'
                }`}>{texto}</button>
            ))}
          </div>
        </Seccion>
        <Seccion titulo="Filtros por dieta y días con tiempo" sub={hayFiltrosPorDieta ? 'Con filtros' : 'Todas sus dietas usan su plan'}>
          <RecetasDelGeneradorPanel athleteEmail={athleteEmail} diets={diets} dietConfig={dietConfig} onboarding={onboarding} nutritionConfig={nutritionConfig} />
        </Seccion>
        <Seccion titulo="Esconder recetas por días o sitios" sub={reglas.length ? `${reglas.length} ${reglas.length === 1 ? 'escondida' : 'escondidas'}` : 'Ninguna escondida'}>
          <ReglasDeRecetasPanel athleteEmail={athleteEmail} onboarding={onboarding} nutritionConfig={nutritionConfig} enAjustes />
        </Seccion>
      </div>

      <Sheet
        open={!!viendo}
        onClose={() => setViendo(null)}
        title={viendo && plan.has(viendo.id) ? 'En su plan' : 'Disponible'}
        size="xl"
        footer={viendo && (
          <div className="flex items-center gap-2">
            {plan.has(viendo.id) && (
              <button type="button" onClick={() => recomendar(viendo.id)} aria-pressed={recsSet.has(viendo.id)}
                className={`inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-control border font-sans text-caption font-bold ${
                  recsSet.has(viendo.id) ? 'border-accent text-accent-ink bg-accent-bg' : 'border-hairline text-ink-2 hover:text-ink'
                }`}>
                <Icon name="star" size="s" filled={recsSet.has(viendo.id)} />
                {recsSet.has(viendo.id) ? 'Recomendada' : 'Recomendar'}
              </button>
            )}
            <span className="flex-1" />
            {plan.has(viendo.id) ? (
              <button type="button" onClick={() => { quitar(viendo.id); setViendo(null); }}
                className="min-h-[44px] px-4 rounded-control border border-hairline font-sans text-caption font-bold text-ink-2 hover:text-ink">
                Quitar de su plan
              </button>
            ) : poolIds.has(viendo.id) && (
              <button type="button" onClick={() => { anadir([viendo.id]); setViendo(null); }}
                className="min-h-[44px] px-4 rounded-control bg-accent text-on-accent font-sans text-caption font-bold">
                Añadir a su plan
              </button>
            )}
          </div>
        )}
      >
        {viendo && (
          <RecipeDetail
            recipe={viendo}
            soloLectura
            isFav={false}
            isDisliked={false}
            isOwn={false}
            enabledModes={nutritionConfig?.enabledModes ?? []}
            savingFav={false}
            deletingOwn={false}
            dailyBudgetTotal={null}
            onBack={() => setViendo(null)}
            onToggleFav={() => {}}
            onToggleDislike={() => {}}
            onDelete={() => {}}
          />
        )}
      </Sheet>

      <EditorDePaquete
        paquete={editando}
        recetas={indice}
        onCerrar={() => setEditando(null)}
        onGuardar={p => {
          const nuevo = !p.id;
          const conId = nuevo ? { ...p, id: idDePaquete(p.nombre, paquetes) } : p;
          guardarGlobal.mutate({ paquetes: nuevo ? [...paquetes, conId] : paquetes.map(x => (x.id === p.id ? conId : x)) });
          setEditando(null);
          showToast(nuevo ? `Paquete «${p.nombre}» creado` : 'Paquete guardado', 'success');
        }}
        onBorrar={async p => {
          if (!await confirm(`¿Borrar el paquete «${p.nombre}»? Lo que ya pasaste a los planes se queda; las dietas que lo usen en sus filtros dejan de usarlo.`)) return;
          guardarGlobal.mutate({ paquetes: paquetes.filter(x => x.id !== p.id) });
          // En este atleta se quita también de sus filtros por dieta.
          const sel = doc?.seleccion;
          const sinEl = (f?: FiltroDeRecetas) => (f?.paquetes?.includes(p.id) ? { ...f, paquetes: f.paquetes.filter(x => x !== p.id) } : f);
          if (sel && [sel.general, ...Object.values(sel.porDieta ?? {})].some(f => f?.paquetes?.includes(p.id))) {
            let limpia: SeleccionDeRecetas = sel;
            if (sel.general) limpia = conFiltro(limpia, TODAS_LAS_DIETAS, sinEl(sel.general)!);
            for (const [id, f] of Object.entries(sel.porDieta ?? {})) limpia = conFiltro(limpia, id, sinEl(f)!);
            saveReglasDeReceta({ athleteId: athleteEmail, seleccion: limpia }, nombreDe)
              .then(() => queryClient.invalidateQueries({ queryKey: reglasDeRecetaKey(athleteEmail) }))
              .catch(() => showToast('El paquete se borró, pero no se pudo quitar de sus filtros por dieta.'));
          }
          setEditando(null);
        }}
      />
      <ConfirmDialog />
    </div>
  );
}
