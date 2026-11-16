import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AthleteNutritionConfig, OnboardingData, Recipe, RecipeFavorites } from '../../types';
import {
  getAthleteNutritionConfig, getOnboarding, getRecipeFavorites, queryRecetasForGenerator,
  guardarGustosDePlato, saveRecipeFavorites, updateOnboardingFoods,
} from '../../dbService';
import { useListaDeMenu, useReglasDeReceta, useSeleccionDeRecetas } from '../../hooks/useReglasDeReceta';
import { useDiaActual } from '../../hooks/useDiaActual';
import { useToast } from '../../hooks/useToast';
import { filtroDuro } from '../../utils/menuEngine';
import { aplicarSeleccion } from '../../utils/seleccionDeRecetas';
import { recetasOcultas } from '../../utils/reglasDeReceta';
import { athleteConditions } from '../../utils/dietaryRestrictions';
import { dietTypeVigente } from '../../utils/foodPrefs';
import { fotoDeReceta } from '../../utils/fotoDeReceta';
import { minutosDeReceta } from '../../utils/tiempoDeReceta';
import {
  TANDAS, TANDA_EXTRA, elegirRecetasDeArranque, motivoDeGusto, patronesDeArranque, resultadoDeArranque,
  type AccionDePatron, type RecetaDeArranque, type RespuestaDeArranque, type ResultadoDeArranque, type TandaId,
} from '../../utils/arranqueDeGustos';
import FotoDeReceta from '../FotoDeReceta';
import { Button, Dialog, Icon } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Arranque de gustos: 40 recetas «sí / no» y las preguntas de confirmación
   (11-2026, Dani). La lógica está en utils/arranqueDeGustos.ts.

   Se abre desde «Mi menú» (mientras no lo haya hecho) y desde Perfil ›
   Preferencias (para repetirlo). Lo que lleva contestado se queda en el
   dispositivo, así que puede dejarlo a medias y seguir luego.
   ═══════════════════════════════════════════════════════════════════════════ */

const SLOTS = [1, 2, 3, 4, 5];
/** `ronda`: las 40 de la primera vez (o empezar de cero). `mas`: diez platos
 *  que todavía no ha visto, para seguir afinando cuando quiera. */
export type ModoDeArranque = 'ronda' | 'mas';
const claveDeBorrador = (email: string, modo: ModoDeArranque = 'ronda') => `enforma_arranque_${email}${modo === 'mas' ? '_mas' : ''}`;

interface Borrador { orden: { id: string; tanda: TandaId; gustos: string[] }[]; respuestas: RespuestaDeArranque[] }

export function leerBorrador(email: string, modo: ModoDeArranque = 'ronda'): Borrador | null {
  try {
    const raw = localStorage.getItem(claveDeBorrador(email, modo));
    const b = raw ? (JSON.parse(raw) as Borrador) : null;
    return b && Array.isArray(b.orden) && Array.isArray(b.respuestas) ? b : null;
  } catch { return null; }
}
function escribirBorrador(email: string, b: Borrador | null, modo: ModoDeArranque = 'ronda') {
  try {
    if (b) localStorage.setItem(claveDeBorrador(email, modo), JSON.stringify(b));
    else localStorage.removeItem(claveDeBorrador(email, modo));
  } catch { /* sin almacenamiento, simplemente no se puede seguir luego */ }
}

function macrosDe(r: Recipe): string {
  const m = r.macros;
  const kcal = r.kcal != null ? `${Math.round(r.kcal)} kcal` : '';
  return m ? `${kcal} · P ${Math.round(m.prot)} · HC ${Math.round(m.carb)} · G ${Math.round(m.fat)} g` : kcal;
}

interface Props {
  email: string;
  onCerrar: () => void;
  modo?: ModoDeArranque;
  /** Solo para el banco de pruebas: en la app se guarda en Firestore. */
  guardar?: (r: ResultadoDeArranque) => Promise<void>;
}

/** El recetario de cada franja (el índice ya está en memoria; misma clave que
 *  «Intercambiar»). Lo comparten el arranque y la ficha «Tus gustos». */
export function useRecetasDeArranque() {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ['recetasDeArranque'],
    queryFn: async () => Promise.all(SLOTS.map(slot => queryClient.fetchQuery({
      queryKey: ['recetasDeFranja', slot], queryFn: () => queryRecetasForGenerator(slot, Infinity), staleTime: 5 * 60_000,
    }).catch(() => [] as Recipe[]))),
    staleTime: 5 * 60_000,
  });
}

export default function ArranqueDeGustos({ email, onCerrar, modo = 'ronda', guardar }: Props) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { fecha: hoy } = useDiaActual();
  const { data: onboarding = null, isPending: c1 } = useQuery({ queryKey: ['onboarding', email], queryFn: () => getOnboarding(email) });
  const { data: config = null, isPending: c2 } = useQuery({ queryKey: ['athleteNutritionConfig', email], queryFn: () => getAthleteNutritionConfig(email) });
  const { data: favoritos, isPending: c3 } = useQuery({ queryKey: ['recipeFavorites', email], queryFn: () => getRecipeFavorites(email) });
  const reglas = useReglasDeReceta(email);
  const listaMenu = useListaDeMenu(email);
  const { seleccion, paquetes, favoritasDelCoach } = useSeleccionDeRecetas(email);

  const { data: porSlot, isPending: c4 } = useRecetasDeArranque();
  const cargando = c1 || c2 || c3 || c4;

  const liked = onboarding?.likedFoods ?? [];
  const disliked = onboarding?.dislikedFoods ?? [];
  const preferidos = (config?.preferredDishTypes ?? onboarding?.preferredDishTypes ?? []) as string[];
  const excluidos = (config?.excludedDishTypes ?? onboarding?.excludedDishTypes ?? []) as string[];
  const quiereRapidas = config?.quiereRapidas ?? onboarding?.quiereRapidas;

  /* Solo recetas que de verdad pueden salirle: alergias, salud y tipo de dieta
     fuera, lo que el coach le esconde fuera, y dentro de la lista del coach. */
  const pools = useMemo(() => {
    if (!porSlot) return null;
    const pasa = filtroDuro({
      allergies: onboarding?.allergies ?? [],
      conditions: athleteConditions(onboarding),
      dietType: dietTypeVigente(config?.dietType, onboarding?.dietType),
    });
    const ocultas = recetasOcultas(reglas, 'menu');
    const deSlot = (slot: number) => {
      const aptas = (porSlot[SLOTS.indexOf(slot)] ?? []).filter(r => pasa(r) && !ocultas.has(r.id));
      return aplicarSeleccion(aptas, { listaMenu, seleccion, paquetes, favoritasDelCoach }, { ambito: 'menu' }).pool;
    };
    const out = {} as Record<TandaId, Recipe[]>;
    for (const t of TANDAS) {
      const vistos = new Set<string>();
      out[t.id] = t.slots.flatMap(deSlot).filter(r => (vistos.has(r.id) ? false : (vistos.add(r.id), true)));
    }
    return out;
  }, [porSlot, onboarding, config?.dietType, reglas, listaMenu, seleccion, paquetes, favoritasDelCoach]);

  // En «ver más», lo que ya contestó otras veces no vuelve a salir.
  const yaContestadas = modo === 'mas' ? [...(favoritos?.arranque?.si ?? []), ...(favoritos?.arranque?.no ?? [])] : [];
  const [recetas, setRecetas] = useState<RecetaDeArranque[] | null>(null);
  const [respuestas, setRespuestas] = useState<RespuestaDeArranque[]>([]);
  // Qué opción ha tocado en cada pregunta (su posición: dos opciones pueden no cambiar nada).
  const [elegidas, setElegidas] = useState<Record<string, number>>({});
  const [guardando, setGuardando] = useState(false);

  // Al abrir: sigue donde lo dejó si las recetas siguen valiendo; si no, ronda nueva.
  useEffect(() => {
    if (recetas || cargando || !pools) return;
    const prefs = { liked, disliked, excludedDishTypes: excluidos, dislikedRecipeIds: favoritos?.dislikedIds ?? [] };
    const borrador = leerBorrador(email, modo);
    if (borrador && borrador.orden.length > 0) {
      const porId = new Map<string, Recipe>(TANDAS.flatMap(t => pools[t.id]).map(r => [r.id, r]));
      const recuperadas = borrador.orden.map(o => (porId.has(o.id) ? { recipe: porId.get(o.id)!, tanda: o.tanda, gustos: o.gustos } : null));
      if (recuperadas.every(Boolean)) {
        setRecetas(recuperadas as RecetaDeArranque[]);
        setRespuestas(borrador.respuestas.filter(r => porId.has(r.recipeId)));
        return;
      }
    }
    setRecetas(modo === 'mas'
      ? elegirRecetasDeArranque(pools, prefs, { porTanda: TANDA_EXTRA, yaVistas: new Set(yaContestadas), azar: Math.random })
      : elegirRecetasDeArranque(pools, prefs, { azar: Math.random }));
  // Solo al terminar de cargar: lo que el atleta cambie después no rehace la ronda.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargando, pools]);

  useEffect(() => {
    if (!recetas) return;
    if (recetas.length === 0) return;
    escribirBorrador(email, { orden: recetas.map(r => ({ id: r.recipe.id, tanda: r.tanda, gustos: r.gustos })), respuestas }, modo);
  }, [email, modo, recetas, respuestas]);

  const actual = recetas?.[respuestas.length] ?? null;
  const patrones = useMemo(
    () => (recetas && !actual ? patronesDeArranque(recetas, respuestas, { liked, preferredDishTypes: preferidos, quiereRapidas }) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recetas, respuestas, actual],
  );
  const si = respuestas.filter(r => r.gusta).length;

  function contestar(gusta: boolean) {
    if (actual) setRespuestas(prev => [...prev, { recipeId: actual.recipe.id, gusta }]);
  }

  function verMas() {
    if (!pools || !recetas) return;
    const prefs = { liked, disliked, excludedDishTypes: excluidos, dislikedRecipeIds: favoritos?.dislikedIds ?? [] };
    const mas = elegirRecetasDeArranque(pools, prefs, { porTanda: TANDA_EXTRA, yaVistas: new Set([...yaContestadas, ...recetas.map(r => r.recipe.id)]), azar: Math.random });
    if (mas.length === 0) { showToast('No quedan más platos nuevos que enseñarte.', 'success'); return; }
    setRecetas([...recetas, ...mas]);
  }

  async function terminar() {
    const decisiones: Record<string, AccionDePatron> = {};
    for (const p of patrones) { const o = p.opciones[elegidas[p.id]]; if (o) decisiones[p.id] = o.accion; }
    const r = resultadoDeArranque(respuestas, patrones, decisiones, {
      arranque: favoritos?.arranque, likedFoods: liked, dislikedFoods: disliked,
      preferredDishTypes: preferidos, excludedDishTypes: excluidos, quiereRapidas,
    }, hoy);
    const favs: RecipeFavorites = { athleteId: email, recipeIds: [], ...favoritos, arranque: r.arranque };
    const cfg: AthleteNutritionConfig = {
      ...(config ?? { athleteId: email, enabledModes: ['OMNIVORO'] }),
      preferredDishTypes: r.preferredDishTypes, excludedDishTypes: r.excludedDishTypes,
      ...(r.quiereRapidas != null ? { quiereRapidas: r.quiereRapidas } : {}),
    };
    setGuardando(true);
    try {
      if (guardar) await guardar(r);
      else {
        await saveRecipeFavorites(favs);
        if (r.cambianAlimentos) await updateOnboardingFoods(email, r.likedFoods, r.dislikedFoods);
        // Solo sus campos y con merge: `config` puede venir de una caché vieja.
        if (r.cambiaConfig) await guardarGustosDePlato(email, { preferredDishTypes: r.preferredDishTypes, excludedDishTypes: r.excludedDishTypes, ...(r.quiereRapidas != null ? { quiereRapidas: r.quiereRapidas } : {}) });
      }
      queryClient.setQueryData<RecipeFavorites>(['recipeFavorites', email], favs);
      if (r.cambianAlimentos) queryClient.setQueryData<OnboardingData | null>(['onboarding', email], prev => (prev ? { ...prev, likedFoods: r.likedFoods, dislikedFoods: r.dislikedFoods } : prev));
      if (r.cambiaConfig) queryClient.setQueryData<AthleteNutritionConfig>(['athleteNutritionConfig', email], cfg);
      escribirBorrador(email, null, modo);
      showToast('Guardado. Tu próximo menú ya lo tiene en cuenta.', 'success');
      onCerrar();
    } catch {
      showToast('No se ha podido guardar. Inténtalo otra vez.');
    } finally {
      setGuardando(false);
    }
  }

  const tandaActual = actual?.tanda ?? null;
  const tandasDeLaRonda = TANDAS.filter(t => recetas?.some(r => r.tanda === t.id));
  const indiceDe = (t: TandaId) => TANDAS.findIndex(x => x.id === t);
  const minutos = actual ? minutosDeReceta(actual.recipe) : null;
  const motivo = actual ? motivoDeGusto(actual.gustos) : null;

  return (
    <Dialog open onClose={onCerrar} size="l" title={modo === 'mas' ? 'Más platos' : 'Tus gustos'}>
      {cargando || !recetas ? (
        <div className="flex items-center justify-center py-16"><Icon name="progress_activity" size="l" className="text-accent-ink animate-spin" /></div>
      ) : recetas.length === 0 ? (
        <p className="font-sans text-label text-ink-3 text-center py-10">
          {modo === 'mas' ? 'Ya has visto todos los platos que te pueden tocar ahora mismo.' : 'Ahora mismo no hay recetas que enseñarte. Inténtalo más tarde.'}
        </p>
      ) : actual ? (
        <div className="space-y-3">
          <div className="flex flex-wrap justify-center gap-1.5">
            {tandasDeLaRonda.map(t => {
              const hecha = tandaActual != null && indiceDe(t.id) < indiceDe(tandaActual);
              const es = t.id === tandaActual;
              return (
                <span key={t.id} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-control border font-sans text-caption font-bold ${es ? 'bg-accent border-accent-press text-on-accent' : 'bg-raised border-hairline text-ink-2'}`}>
                  {hecha && <Icon name="check" size="s" className="text-success" />}{t.titulo}
                </span>
              );
            })}
          </div>

          <div className="bg-surface border border-hairline rounded-surface overflow-hidden">
            <div className="relative w-full aspect-[16/10] bg-raised">
              <FotoDeReceta
                src={fotoDeReceta(actual.recipe)} alt={actual.recipe.name} className="absolute inset-0 w-full h-full object-cover"
                fallback={<div className="absolute inset-0 flex items-center justify-center"><Icon name="restaurant" size="xl" className="text-ink-3" /></div>}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-veil/85 via-veil/15 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-3">
                <span className="font-sans text-caption text-on-veil-2 uppercase tracking-wider">
                  {TANDAS.find(t => t.id === actual.tanda)!.una}{minutos != null ? ` · ${minutos} min` : ''}
                </span>
                <p className="font-sans font-bold text-title-s text-on-veil leading-tight">{actual.recipe.name}</p>
              </div>
            </div>
            <div className="p-3">
              <p className="font-mono text-caption text-ink-2">{macrosDe(actual.recipe)}</p>
              {motivo && <p className="font-mono text-caption text-accent-ink mt-1">{motivo}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => contestar(false)}>No es para mí</Button>
            <Button variant="primary" onClick={() => contestar(true)}>Me la comería</Button>
          </div>

          <div>
            <div className="h-1.5 rounded-full bg-raised overflow-hidden">
              <div className="h-full rounded-full bg-accent transition-[width] duration-(--duration-state)" style={{ width: `${Math.round((respuestas.length / recetas.length) * 100)}%` }} />
            </div>
            <div className="flex items-center justify-between mt-2">
              <button onClick={() => setRespuestas(prev => prev.slice(0, -1))} disabled={respuestas.length === 0} className="font-sans text-caption text-info hover:text-ink disabled:opacity-0">Atrás</button>
<span className="font-mono text-caption text-ink-3">{respuestas.length} de {recetas.length}</span>
              <button onClick={onCerrar} className="font-sans text-caption text-ink-3 hover:text-ink">Seguir luego</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="font-mono text-caption text-ink-3 uppercase tracking-wider">
            {patrones.length > 0 ? `Antes de terminar · ${patrones.length} pregunta${patrones.length === 1 ? '' : 's'}` : 'Ya está'}
          </p>
          {patrones.length === 0 && (
            <p className="font-sans text-label text-ink-2">No he visto nada tan claro como para preguntártelo. Tus respuestas ya cuentan para tu próximo menú.</p>
          )}
          {patrones.map(p => (
            <div key={p.id} className="p-3 bg-bg border border-hairline rounded-control">
              <p className="font-sans text-body-s text-ink">{p.titulo}</p>
              <p className="font-mono text-caption text-ink-3">{p.detalle}</p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {p.opciones.map((o, i) => {
                  const sel = elegidas[p.id] === i;
                  return (
                    <button
                      key={o.texto}
                      onClick={() => setElegidas(prev => ({ ...prev, [p.id]: i }))}
                      aria-pressed={sel}
                      className={`px-3 py-2 rounded-control border font-sans text-label font-bold transition-colors ${sel ? 'bg-accent border-accent-press text-on-accent' : 'bg-raised border-strong text-ink-2 hover:text-ink'}`}
                    >{o.texto}</button>
                  );
                })}
              </div>
            </div>
          ))}
          <p className="font-mono text-caption text-ink-3 text-center pt-1">{si} te gustan · {respuestas.length - si} no</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={verMas} disabled={guardando}>Ver 10 más</Button>
            <Button variant="primary" onClick={() => void terminar()} disabled={guardando}>{guardando ? 'Guardando…' : 'Listo'}</Button>
          </div>
          <button onClick={() => setRespuestas(prev => prev.slice(0, -1))} className="w-full font-sans text-caption text-info hover:text-ink">Volver a la última receta</button>
        </div>
      )}
    </Dialog>
  );
}
