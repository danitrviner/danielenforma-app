import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AthleteDietConfig, AthleteNutritionConfig, Diet, OnboardingData, Recipe, WeekDay } from '../types';
import {
  cargarIndiceRecetas, getReglasDeReceta, saveReglasDeReceta, getAccesoGlobalARecetas, saveAccesoGlobalARecetas,
} from '../dbService';
import { accesoGlobalKey, reglasDeRecetaKey } from '../hooks/useReglasDeReceta';
import { useToast } from '../hooks/useToast';
import { useConfirm } from '../hooks/useConfirm';
import { athleteConditions } from '../utils/dietaryRestrictions';
import { dietTypeVigente } from '../utils/foodPrefs';
import { DISH_TYPES, dishTypeLabel, type DishType } from '../utils/dishTypes';
import { poolDelAtleta } from '../utils/poolDelAtleta';
import { slotsFromOnboarding } from '../utils/menuEngine';
import { kcalDeDieta } from '../utils/semanasNutricion';
import { DIAS_SEMANA } from '../utils/reglasDeReceta';
import { MIN_RECETAS_DE_LISTA } from '../utils/accesoARecetas';
import { normalizarTexto } from '../utils/busqueda';
import {
  compilarFiltro, conDiasConTiempo, conFiltro, filtroDeTarjeta, filtroVacio, idDePaquete, llevaAlimento,
  PLANTILLAS, resumenDeFiltro, sumarFiltro, TODAS_LAS_DIETAS,
  type FiltroDeRecetas, type PaqueteDeRecetas, type SeleccionDeRecetas,
} from '../utils/seleccionDeRecetas';
import { Icon, Sheet, Skeleton } from './ui';
import MenuDelAtletaPanel from './MenuDelAtletaPanel';

/* ═══════════════════════════════════════════════════════════════════════════
   Dietas › Información › Recetas del generador

   De qué recetas tira el generador de menús con cada dieta del atleta, en
   pocos toques: atajos, tipos de plato, «con» y «sin» alimentos, y paquetes de
   recetas que el coach monta una vez y reutiliza con cualquiera. Sus gustos
   salen ya marcados. La lógica está en utils/seleccionDeRecetas.ts.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  athleteEmail: string;
  diets: Diet[];
  dietConfig: AthleteDietConfig | null;
  onboarding: OnboardingData | null;
  nutritionConfig: AthleteNutritionConfig | null;
  /** Cómo se guarda. Por defecto, en Firestore; el banco de pruebas pasa uno
   *  que no escribe nada. */
  guardado?: {
    seleccion: (athleteEmail: string, sel: SeleccionDeRecetas, nombreDe: (id: string) => string | undefined) => Promise<void>;
    paquetes: (lista: PaqueteDeRecetas[]) => Promise<void>;
  };
}

const GUARDADO_REAL: NonNullable<Props['guardado']> = {
  seleccion: (athleteEmail, sel, nombreDe) => saveReglasDeReceta({ athleteId: athleteEmail, seleccion: sel }, nombreDe),
  paquetes: lista => saveAccesoGlobalARecetas({ paquetes: lista }),
};

const SIN_PAQUETES: PaqueteDeRecetas[] = [];
const PLATOS = DISH_TYPES.filter(d => d.id !== 'otro');
const SUGERENCIAS = [
  'Arroz', 'Pasta', 'Patata', 'Garbanzos', 'Lentejas', 'Alubias', 'Pollo', 'Pavo', 'Ternera', 'Cerdo', 'Atún',
  'Salmón', 'Merluza', 'Huevo', 'Avena', 'Yogur', 'Queso', 'Aguacate', 'Tofu', 'Quinoa', 'Pan', 'Plátano',
];
const NOMBRE_FRANJA: Record<number, string> = { 1: 'Desayuno', 2: 'Media mañana', 3: 'Comida', 4: 'Merienda', 5: 'Cena' };

const TONO = {
  on: 'border-accent-line bg-accent/15 text-accent-ink',
  off: 'border-hairline text-ink-2 hover:text-ink',
  gusta: 'border-success/50 bg-success/10 text-success',
  noGusta: 'border-danger/50 bg-danger/10 text-danger',
} as const;

/** Botón-ficha compacto: 32 px de alto, para que las filas de opciones no ocupen media pantalla. */
const Ficha: React.FC<{
  tono: keyof typeof TONO;
  onClick?: () => void;
  onQuitar?: () => void;
  icono?: string;
  titulo?: string;
  children: React.ReactNode;
  key?: React.Key;
}> = ({ tono, onClick, onQuitar, icono, titulo, children }) => {
  const clase = `inline-flex items-center gap-1 min-h-[32px] px-2.5 rounded-chip border font-sans text-caption transition-colors ${TONO[tono]}`;
  const dentro = <>{icono && <Icon name={icono} size="s" />}{children}</>;
  return (
    <span className={clase} title={titulo}>
      {onClick
        ? <button type="button" onClick={onClick} aria-pressed={tono === 'on'} className="inline-flex items-center gap-1">{dentro}</button>
        : <span className="inline-flex items-center gap-1">{dentro}</span>}
      {onQuitar && (
        <button type="button" onClick={onQuitar} aria-label={`Quitar ${typeof children === 'string' ? children : ''}`} className="-mr-1 ml-0.5 flex h-5 w-5 items-center justify-center rounded-full hover:bg-strong">
          <Icon name="close" size="s" />
        </button>
      )}
    </span>
  );
};

const Fila: React.FC<{ etiqueta: string; children: React.ReactNode }> = ({ etiqueta, children }) => (
  <div className="flex flex-wrap items-center gap-1.5">
    <span className="w-full sm:w-28 flex-shrink-0 font-mono text-caption text-ink-3">{etiqueta}</span>
    {children}
  </div>
);

/** Fichas de alimentos con un campo para añadir más (Enter o «+»). */
const Alimentos: React.FC<{
  etiqueta: string;
  tono: 'on' | 'noGusta';
  valor: string[];
  onCambiar: (v: string[]) => void;
  idLista: string;
}> = ({ etiqueta, tono, valor, onCambiar, idLista }) => {
  const [texto, setTexto] = useState('');
  const anadir = () => {
    const t = texto.trim();
    if (!t) return;
    if (!valor.some(v => normalizarTexto(v) === normalizarTexto(t))) onCambiar([...valor, t]);
    setTexto('');
  };
  return (
    <Fila etiqueta={etiqueta}>
      {valor.map(a => <Ficha key={a} tono={tono} onQuitar={() => onCambiar(valor.filter(x => x !== a))}>{a}</Ficha>)}
      <span className="inline-flex items-center min-h-[32px] rounded-chip border border-dashed border-hairline pl-2.5 pr-1">
        <input
          value={texto}
          onChange={e => setTexto(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); anadir(); } }}
          list={idLista}
          placeholder="Alimento"
          aria-label={`Añadir alimento a «${etiqueta}»`}
          className="w-24 bg-transparent font-sans text-caption text-ink placeholder:text-ink-3 focus:outline-none"
        />
        <button type="button" onClick={anadir} aria-label="Añadir" className="flex h-6 w-6 items-center justify-center text-ink-2 hover:text-ink">
          <Icon name="add" size="s" />
        </button>
      </span>
    </Fila>
  );
};

export default function RecetasDelGeneradorPanel({
  athleteEmail, diets, dietConfig, onboarding, nutritionConfig, guardado = GUARDADO_REAL,
}: Props) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();

  const { data: reglas, isPending: cargandoReglas } = useQuery({
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

  const seleccion: SeleccionDeRecetas = reglas?.seleccion ?? {};
  const paquetes = global?.paquetes ?? SIN_PAQUETES;
  const gustan = useMemo(() => onboarding?.likedFoods ?? [], [onboarding]);
  const noGustan = useMemo(() => onboarding?.dislikedFoods ?? [], [onboarding]);

  // Dietas que de verdad usa: sin borradores ni las que se monta él. Las que
  // están en su semana van primero, con los días en los que tocan.
  const dietas = useMemo(() => {
    const calendario = dietConfig?.weeklySchedule ?? {};
    const diasDe = (id: string) => DIAS_SEMANA.filter(d => calendario[d.dia] === id);
    return diets
      .filter(d => !d.selfManaged && !d.isDraft)
      .map(d => ({ dieta: d, dias: diasDe(d.id) }))
      .sort((a, b) => (b.dias.length > 0 ? 1 : 0) - (a.dias.length > 0 ? 1 : 0));
  }, [diets, dietConfig]);

  const [abierta, setAbierta] = useState<string>(TODAS_LAS_DIETAS);
  const filtroAbierto = filtroDeTarjeta(seleccion, abierta);
  const nombreDeTarjeta = (clave: string) =>
    clave === TODAS_LAS_DIETAS ? 'Todas las dietas' : diets.find(d => d.id === clave)?.name ?? 'Dieta';

  // Para que el historial de cambios diga «Pollo al curry», «Día A» o «Batch».
  const nombreDe = useMemo(() => {
    const m = new Map<string, string>(indice.map(r => [r.id, r.name]));
    for (const d of diets) m.set(d.id, d.name);
    for (const p of paquetes) m.set(p.id, p.nombre);
    return (id: string) => m.get(id);
  }, [indice, diets, paquetes]);

  const guardar = useMutation({
    mutationFn: (sel: SeleccionDeRecetas) => guardado.seleccion(athleteEmail, sel, nombreDe),
    onMutate: async sel => {
      // Optimista: la ficha responde al instante y se deshace si falla.
      await queryClient.cancelQueries({ queryKey: reglasDeRecetaKey(athleteEmail) });
      const previo = queryClient.getQueryData(reglasDeRecetaKey(athleteEmail));
      queryClient.setQueryData(reglasDeRecetaKey(athleteEmail), (p: object | undefined) =>
        ({ athleteId: athleteEmail, reglas: [], ...p, seleccion: sel }));
      return { previo };
    },
    onError: (_e, _v, ctx) => {
      queryClient.setQueryData(reglasDeRecetaKey(athleteEmail), ctx?.previo);
      showToast('No se pudo guardar el cambio. Inténtalo otra vez.');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: reglasDeRecetaKey(athleteEmail) }),
  });

  const guardarPaquetes = useMutation({
    mutationFn: (lista: PaqueteDeRecetas[]) => guardado.paquetes(lista),
    onMutate: async lista => {
      await queryClient.cancelQueries({ queryKey: accesoGlobalKey });
      const previo = queryClient.getQueryData(accesoGlobalKey);
      queryClient.setQueryData(accesoGlobalKey, (p: object | undefined) => ({ ...p, paquetes: lista }));
      return { previo };
    },
    onError: (_e, _v, ctx) => {
      queryClient.setQueryData(accesoGlobalKey, ctx?.previo);
      showToast('No se pudo guardar el paquete. Inténtalo otra vez.');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: accesoGlobalKey }),
  });

  const cambiarFiltro = (clave: string, siguiente: FiltroDeRecetas) => guardar.mutate(conFiltro(seleccion, clave, siguiente));
  const cambiarAbierto = (parcial: Partial<FiltroDeRecetas>) => cambiarFiltro(abierta, { ...filtroAbierto, ...parcial });
  const alternar = <T,>(lista: T[] | undefined, x: T) => (lista ?? []).includes(x) ? (lista ?? []).filter(y => y !== x) : [...(lista ?? []), x];

  // Lo que el generador ya tiene descartado para este atleta (alergias,
  // condiciones, dieta, su tiempo, lo que no le gusta). Los recuentos salen de
  // aquí para que digan lo que de verdad va a poder salir.
  const pool = useMemo(() => poolDelAtleta(indice, {
    allergies: onboarding?.allergies ?? [],
    conditions: athleteConditions(onboarding),
    dietType: dietTypeVigente(nutritionConfig?.dietType, onboarding?.dietType),
    excludedDishTypes: (nutritionConfig?.excludedDishTypes ?? onboarding?.excludedDishTypes ?? []) as DishType[],
  }).filter(r => !noGustan.some(a => llevaAlimento(r, a))), [indice, onboarding, nutritionConfig, noGustan]);

  const franjas = useMemo(() => {
    const slots = slotsFromOnboarding(onboarding, nutritionConfig?.hungerProfile, nutritionConfig?.mealCount);
    return [...new Set(slots.map(s => s.slot))];
  }, [onboarding, nutritionConfig]);

  const recuento = (f: FiltroDeRecetas) => {
    const pasa = compilarFiltro(f, paquetes);
    return franjas.map(slot => ({
      slot, total: pool.filter(r => (r.intakeTypes ?? []).includes(slot) && pasa(r)).length,
    }));
  };

  const [verRecetas, setVerRecetas] = useState(false);
  const [editando, setEditando] = useState<PaqueteDeRecetas | null>(null);
  const [copiarA, setCopiarA] = useState('');

  if (cargandoReglas || cargandoGlobal || cargandoIndice) return <Skeleton className="h-40 w-full" />;

  const tarjetas = [
    { clave: TODAS_LAS_DIETAS, nombre: 'Todas las dietas', sub: 'Las que no tengan filtros propios' },
    ...dietas.map(({ dieta, dias }) => ({
      clave: dieta.id,
      nombre: dieta.name,
      sub: `${kcalDeDieta(dieta).toLocaleString('es-ES')} kcal · ${dias.length ? dias.map(d => d.corto).join(' ') : 'sin días en su semana'}`,
    })),
  ];
  const resumen = (f: FiltroDeRecetas) => resumenDeFiltro(f, id => paquetes.find(p => p.id === id)?.nombre, dishTypeLabel);
  const diasConTiempo = seleccion.diasConTiempo ?? [];
  const idLista = `alimentos-${athleteEmail}`;
  const coincidencias: Recipe[] = verRecetas ? pool.filter(compilarFiltro(filtroAbierto, paquetes)) : [];

  const guardarComoPaquete = () => {
    const ids = pool.filter(compilarFiltro(filtroAbierto, paquetes)).map(r => r.id);
    setEditando({ id: '', nombre: resumen(filtroAbierto).slice(0, 40), recipeIds: ids });
  };

  return (
    <div className="bg-surface border border-hairline rounded-surface p-5 space-y-4">
      <datalist id={idLista}>
        {[...new Set([...gustan, ...SUGERENCIAS])].map(a => <option key={a} value={a} />)}
      </datalist>

      <div>
        <h3 className="font-sans font-bold text-title-s text-ink flex items-center gap-2">
          <Icon name="tune" size="m" className="text-accent-ink" />
          Recetas del generador
        </h3>
        <p className="font-sans text-label text-ink-2 mt-1">
          De qué recetas tira el generador de menús con cada dieta. Vale para el menú y para «cambiar comida»; su
          recetario no cambia. Cada cosa que marcas estrecha la lista.
        </p>
      </div>

      {/* Lo que ya sabe el generador de este atleta */}
      {(gustan.length > 0 || noGustan.length > 0) && (
        <div className="space-y-1.5">
          {gustan.length > 0 && (
            <Fila etiqueta="Le gusta">
              {gustan.map(a => {
                const puesto = (filtroAbierto.con ?? []).some(c => normalizarTexto(c) === normalizarTexto(a));
                return (
                  <Ficha
                    key={a}
                    tono={puesto ? 'on' : 'gusta'}
                    icono={puesto ? 'check' : 'favorite'}
                    titulo={puesto ? `Ya está en «con» de ${nombreDeTarjeta(abierta)}` : `Toca para pedir recetas con ${a} en ${nombreDeTarjeta(abierta)}`}
                    onClick={() => cambiarAbierto({ con: puesto ? (filtroAbierto.con ?? []).filter(c => normalizarTexto(c) !== normalizarTexto(a)) : [...(filtroAbierto.con ?? []), a] })}
                  >{a}</Ficha>
                );
              })}
            </Fila>
          )}
          {noGustan.length > 0 && (
            <Fila etiqueta="No le gusta">
              {noGustan.map(a => <Ficha key={a} tono="noGusta" icono="block" titulo="Ya excluido en todas sus dietas">{a}</Ficha>)}
            </Fila>
          )}
        </div>
      )}

      <Fila etiqueta="Días con tiempo">
        <div role="group" aria-label="Días con tiempo para cocinar" className="inline-flex border border-hairline rounded-control overflow-hidden">
          {DIAS_SEMANA.map(d => {
            const on = diasConTiempo.includes(d.dia);
            return (
              <button
                key={d.dia}
                type="button"
                onClick={() => guardar.mutate(conDiasConTiempo(seleccion, alternar(diasConTiempo, d.dia) as WeekDay[]))}
                aria-pressed={on}
                aria-label={`${d.largo}: ${on ? 'tiene tiempo' : 'sin tiempo extra'}`}
                className={`w-8 min-h-[32px] font-mono text-caption font-bold transition-colors ${on ? 'bg-accent text-on-accent' : 'text-ink-2 hover:text-ink'}`}
              >{d.corto}</button>
            );
          })}
        </div>
        <span className="font-mono text-caption text-ink-3">Esos días no se limita a rápidas ni a sus minutos.</span>
      </Fila>

      <Fila etiqueta="Atajos">
        {PLANTILLAS.map(p => (
          <Ficha key={p.id} tono="off" icono={p.icono} titulo={`Añadir a ${nombreDeTarjeta(abierta)}`}
            onClick={() => cambiarFiltro(abierta, sumarFiltro(filtroAbierto, p.filtro))}>{p.nombre}</Ficha>
        ))}
      </Fila>

      <Fila etiqueta="Mis paquetes">
        {paquetes.map(p => {
          const on = (filtroAbierto.paquetes ?? []).includes(p.id);
          return (
            <span key={p.id} className="inline-flex items-center">
              <Ficha tono={on ? 'on' : 'off'} icono="inventory_2" titulo={`${p.recipeIds.length} recetas`}
                onClick={() => cambiarAbierto({ paquetes: alternar(filtroAbierto.paquetes, p.id) })}>
                {p.nombre} · {p.recipeIds.length}
              </Ficha>
              <button type="button" onClick={() => setEditando(p)} aria-label={`Editar paquete ${p.nombre}`}
                className="flex h-8 w-7 items-center justify-center text-ink-3 hover:text-ink">
                <Icon name="edit" size="s" />
              </button>
            </span>
          );
        })}
        <button type="button" onClick={() => setEditando({ id: '', nombre: '', recipeIds: [] })}
          className="inline-flex items-center gap-1 min-h-[32px] px-2.5 rounded-chip border border-dashed border-hairline font-sans text-caption text-ink-2 hover:text-ink">
          <Icon name="add" size="s" /> Nuevo paquete
        </button>
      </Fila>

      <ul className="m-0 p-0 list-none space-y-2">
        {tarjetas.map(t => {
          const f = filtroDeTarjeta(seleccion, t.clave);
          const abiertaEsta = t.clave === abierta;
          const propio = !filtroVacio(f);
          const heredado = t.clave !== TODAS_LAS_DIETAS && !propio && !filtroVacio(seleccion.general);
          return (
            <li key={t.clave} className={`rounded-surface border ${abiertaEsta ? 'border-accent-line' : 'border-hairline'}`}>
              <button
                type="button"
                onClick={() => { setAbierta(t.clave); setVerRecetas(false); setCopiarA(''); }}
                aria-expanded={abiertaEsta}
                className="w-full flex items-center gap-2 px-3 min-h-[48px] text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="font-sans text-label font-bold text-ink">{t.nombre}</span>
                  <span className="ml-2 font-mono text-caption text-ink-3">{t.sub}</span>
                  {!abiertaEsta && (
                    <span className={`block truncate font-mono text-caption ${propio ? 'text-accent-ink' : 'text-ink-3'}`}>
                      {propio ? resumen(f) : heredado ? `Usa «Todas las dietas»: ${resumen(seleccion.general!)}` : 'Sin filtros · su lista de siempre'}
                    </span>
                  )}
                </span>
                <Icon name="expand_more" size="s" className={`text-ink-2 transition-transform ${abiertaEsta ? 'rotate-180' : ''}`} />
              </button>

              {abiertaEsta && (
                <div className="px-3 pb-3 pt-2 space-y-2.5 border-t border-hairline">
                  {heredado && (
                    <p className="font-mono text-caption text-ink-3">
                      Ahora usa los de «Todas las dietas». En cuanto marques algo aquí, esta dieta pasa a usar solo lo suyo.
                    </p>
                  )}
                  <Fila etiqueta="Tipo">
                    <Ficha tono={f.rapidas ? 'on' : 'off'} icono="bolt" onClick={() => cambiarAbierto({ rapidas: !f.rapidas })}>Rápidas</Ficha>
                    <Ficha tono={f.tupper ? 'on' : 'off'} icono="takeout_dining" onClick={() => cambiarAbierto({ tupper: !f.tupper })}>Tupper</Ficha>
                  </Fila>
                  <Fila etiqueta="Platos">
                    {PLATOS.map(p => (
                      <Ficha key={p.id} tono={(f.platos ?? []).includes(p.id) ? 'on' : 'off'} icono={p.icon}
                        onClick={() => cambiarAbierto({ platos: alternar(f.platos, p.id) })}>{p.label}</Ficha>
                    ))}
                  </Fila>
                  <Alimentos etiqueta="Con alguno de" tono="on" valor={f.con ?? []} idLista={idLista} onCambiar={v => cambiarAbierto({ con: v })} />
                  <Alimentos etiqueta="Sin" tono="noGusta" valor={f.sin ?? []} idLista={idLista} onCambiar={v => cambiarAbierto({ sin: v })} />

                  {propio && (
                    <div className="grid gap-2 grid-cols-[repeat(auto-fit,minmax(96px,1fr))] pt-1">
                      {recuento(f).map(({ slot, total }) => {
                        const pocas = total < MIN_RECETAS_DE_LISTA;
                        return (
                          <div key={slot} className={`rounded-control px-2.5 py-1.5 ${pocas ? 'bg-warning/10 text-warning' : 'bg-raised text-ink-2'}`}>
                            <p className="font-mono text-caption">{NOMBRE_FRANJA[slot]}</p>
                            <p className={`font-sans text-label font-bold ${pocas ? 'text-warning' : 'text-ink'}`}>{total.toLocaleString('es-ES')}</p>
                            {pocas && <p className="font-mono text-caption">Pocas: usará su lista</p>}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {propio && (
                      <>
                        <button type="button" onClick={() => setVerRecetas(v => !v)}
                          className="min-h-[36px] px-3 rounded-control border border-hairline font-sans text-caption text-ink-2 hover:text-ink">
                          {verRecetas ? 'Ocultar recetas' : 'Ver recetas'}
                        </button>
                        <button type="button" onClick={guardarComoPaquete}
                          className="min-h-[36px] px-3 rounded-control border border-hairline font-sans text-caption text-ink-2 hover:text-ink">
                          Guardar como paquete
                        </button>
                        {tarjetas.length > 1 && (
                          <span className="inline-flex items-center gap-1">
                            <select
                              value={copiarA}
                              onChange={e => setCopiarA(e.target.value)}
                              aria-label="Copiar estos filtros a otra dieta"
                              className="min-h-[36px] px-2 rounded-control border border-hairline bg-bg font-sans text-caption text-ink-2 focus:outline-none focus:border-accent"
                            >
                              <option value="">Copiar a…</option>
                              {tarjetas.filter(x => x.clave !== t.clave).map(x => <option key={x.clave} value={x.clave}>{x.nombre}</option>)}
                            </select>
                            {copiarA && (
                              <button type="button"
                                onClick={() => { cambiarFiltro(copiarA, f); showToast(`Copiado a ${nombreDeTarjeta(copiarA)}`, 'success'); setCopiarA(''); }}
                                className="min-h-[36px] px-3 rounded-control bg-accent text-on-accent font-sans text-caption font-bold">Copiar</button>
                            )}
                          </span>
                        )}
                        <button type="button" onClick={() => cambiarFiltro(t.clave, {})}
                          className="min-h-[36px] px-3 font-mono text-caption text-ink-3 hover:text-ink">Quitar filtros</button>
                      </>
                    )}
                  </div>

                  {verRecetas && propio && (
                    <ul className="m-0 p-0 list-none max-h-72 overflow-y-auto border border-hairline rounded-control">
                      {coincidencias.slice(0, 60).map(r => (
                        <li key={r.id} className="px-3 py-1.5 border-t first:border-t-0 border-hairline font-sans text-caption text-ink truncate">{r.name}</li>
                      ))}
                      {coincidencias.length > 60 && (
                        <li className="px-3 py-1.5 border-t border-hairline font-mono text-caption text-ink-3">y {coincidencias.length - 60} más</li>
                      )}
                      {coincidencias.length === 0 && <li className="px-3 py-2 font-mono text-caption text-ink-3">Ninguna receta encaja.</li>}
                    </ul>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <details className="border border-hairline rounded-surface">
        <summary className="px-3 min-h-[44px] flex items-center font-sans text-label font-bold text-ink cursor-pointer">
          Lista de siempre y recetario
        </summary>
        <div className="p-3 pt-0">
          <MenuDelAtletaPanel athleteEmail={athleteEmail} />
        </div>
      </details>

      <EditorDePaquete
        paquete={editando}
        recetas={indice}
        onCerrar={() => setEditando(null)}
        onGuardar={p => {
          const nuevo = !p.id;
          const conId = nuevo ? { ...p, id: idDePaquete(p.nombre, paquetes) } : p;
          guardarPaquetes.mutate(nuevo ? [...paquetes, conId] : paquetes.map(x => (x.id === p.id ? conId : x)));
          setEditando(null);
          showToast(nuevo ? `Paquete «${p.nombre}» creado` : 'Paquete guardado', 'success');
        }}
        onBorrar={async p => {
          if (!await confirm(`¿Borrar el paquete «${p.nombre}»? Las dietas que lo usen volverán a su lista de siempre si se quedan sin recetas.`)) return;
          guardarPaquetes.mutate(paquetes.filter(x => x.id !== p.id));
          // En este atleta se quita también de sus filtros.
          let sel = seleccion;
          for (const t of tarjetas) {
            const f = filtroDeTarjeta(sel, t.clave);
            if (f.paquetes?.includes(p.id)) sel = conFiltro(sel, t.clave, { ...f, paquetes: f.paquetes.filter(x => x !== p.id) });
          }
          if (sel !== seleccion) guardar.mutate(sel);
          setEditando(null);
        }}
      />
      <ConfirmDialog />
    </div>
  );
}

/** Crear o editar un paquete: nombre y recetas, buscando por nombre. */
function EditorDePaquete({ paquete, recetas, onCerrar, onGuardar, onBorrar }: {
  paquete: PaqueteDeRecetas | null;
  recetas: Recipe[];
  onCerrar: () => void;
  onGuardar: (p: PaqueteDeRecetas) => void;
  onBorrar: (p: PaqueteDeRecetas) => void;
}) {
  return paquete ? (
    <EditorAbierto key={paquete.id || 'nuevo'} paquete={paquete} recetas={recetas} onCerrar={onCerrar} onGuardar={onGuardar} onBorrar={onBorrar} />
  ) : null;
}

function EditorAbierto({ paquete, recetas, onCerrar, onGuardar, onBorrar }: {
  paquete: PaqueteDeRecetas;
  recetas: Recipe[];
  onCerrar: () => void;
  onGuardar: (p: PaqueteDeRecetas) => void;
  onBorrar: (p: PaqueteDeRecetas) => void;
  key?: React.Key;
}) {
  const [nombre, setNombre] = useState(paquete.nombre);
  const [ids, setIds] = useState<string[]>(paquete.recipeIds);
  const [busqueda, setBusqueda] = useState('');
  const porId = useMemo(() => new Map(recetas.map(r => [r.id, r])), [recetas]);
  const elegidas = new Set(ids);
  const resultados = useMemo(() => {
    const q = normalizarTexto(busqueda.trim());
    if (q.length < 2) return [];
    return recetas.filter(r => normalizarTexto(r.name).includes(q)).slice(0, 30);
  }, [busqueda, recetas]);
  const valido = nombre.trim().length > 0 && ids.length > 0;

  return (
    <Sheet
      open
      onClose={onCerrar}
      title={paquete.id ? 'Editar paquete' : 'Nuevo paquete'}
      footer={
        <div className="flex items-center gap-2">
          {paquete.id && (
            <button type="button" onClick={() => onBorrar(paquete)}
              className="min-h-[44px] px-3 font-sans text-caption font-bold text-danger">Borrar</button>
          )}
          <span className="ml-auto font-mono text-caption text-ink-3">{ids.length} recetas</span>
          <button type="button" disabled={!valido} onClick={() => onGuardar({ ...paquete, nombre: nombre.trim(), recipeIds: ids })}
            className="min-h-[44px] px-4 rounded-control bg-accent text-on-accent font-sans text-caption font-bold disabled:opacity-50">
            Guardar
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <input
          value={nombre}
          onChange={e => setNombre(e.target.value)}
          placeholder="Cenas en 10 minutos"
          aria-label="Nombre del paquete"
          className="w-full bg-bg border border-hairline rounded-control px-3 min-h-[44px] font-sans text-base text-ink focus:outline-none focus:border-accent"
        />
        <p className="font-mono text-caption text-ink-3">Sirve para cualquier atleta. Lo eliges en sus dietas con un toque.</p>
        <input
          type="search"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar receta para añadir"
          aria-label="Buscar receta para añadir al paquete"
          className="w-full bg-bg border border-hairline rounded-control px-3 min-h-[44px] font-sans text-base text-ink focus:outline-none focus:border-accent"
        />
        {resultados.length > 0 && (
          <ul className="m-0 p-0 list-none border border-hairline rounded-control">
            {resultados.map(r => {
              const dentro = elegidas.has(r.id);
              return (
                <li key={r.id} className="flex items-center gap-2 px-3 py-1.5 border-t first:border-t-0 border-hairline">
                  <span className="min-w-0 flex-1 truncate font-sans text-caption text-ink">{r.name}</span>
                  <button type="button" onClick={() => setIds(dentro ? ids.filter(x => x !== r.id) : [...ids, r.id])}
                    aria-label={`${dentro ? 'Quitar' : 'Añadir'} ${r.name}`}
                    className={`flex h-8 w-8 items-center justify-center rounded-control border ${dentro ? 'border-accent-line text-accent-ink' : 'border-hairline text-ink-2'}`}>
                    <Icon name={dentro ? 'check' : 'add'} size="s" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {ids.length > 0 && (
          <div>
            <p className="font-sans text-label font-bold text-ink mb-1">En el paquete</p>
            <ul className="m-0 p-0 list-none max-h-64 overflow-y-auto border border-hairline rounded-control">
              {ids.map(id => (
                <li key={id} className="flex items-center gap-2 px-3 py-1.5 border-t first:border-t-0 border-hairline">
                  <span className="min-w-0 flex-1 truncate font-sans text-caption text-ink">{porId.get(id)?.name ?? 'Receta retirada'}</span>
                  <button type="button" onClick={() => setIds(ids.filter(x => x !== id))} aria-label="Quitar del paquete"
                    className="flex h-8 w-8 items-center justify-center text-ink-3 hover:text-danger">
                    <Icon name="close" size="s" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Sheet>
  );
}
