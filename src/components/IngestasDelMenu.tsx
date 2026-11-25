import React, { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Recipe, WeekDay } from '../types';
import { cargarIndiceRecetas } from '../dbService';
import { esPlatoDelRecetario } from '../db/recetasHidratacion';
import { recipeMatchesSlot, type FrutaEnIngesta, type MealSlotSpec } from '../utils/menuEngine';
import type { PaqueteDeRecetas } from '../utils/seleccionDeRecetas';
import { nombreDeAlimento, type AlimentoCatalogo } from '../utils/catalogoAlimentos';
import {
  DIAS_SEMANA, INICIAL_DE_DIA, avisoDeRecetas, conCantidad, conDiaAlternado, extraDeAlimento,
  kcalDeExtra, modoDeRecetas, pasoDeExtra, resumenDeRecetas, resumenDeFrutas, conFrutaAlternada, frutasDelCatalogo,
  extrasDeIngesta, resumenDeExtras, textoDeDias, tocaElDia, claveDeIngesta, pegaDeReceta,
  type ExtraFijo, type GustosParaMarcar, type PegaDeReceta, type RecetaDeIngesta, type RecetasDeIngesta,
} from '../utils/ingestaPersonalizada';
import { coincideBusqueda, relevanciaDeBusqueda } from '../utils/busqueda';
import { estaEnSuPlan, type ListaDeMenu } from '../utils/accesoARecetas';
import { fotoDeReceta } from '../utils/fotoDeReceta';
import { macrosDeReceta } from '../utils/macrosDeReceta';
import { etiquetaDeTiempo } from '../utils/tiempoDeReceta';
import FotoDeReceta from './FotoDeReceta';
import { alimentoDelCapricho, buscarCaprichos, caprichosPorGrupo, textoDeRacion, type CaprichoDelAtleta } from '../utils/caprichos';
import { Button, Icon, PanelLateral, ProgressBar, SearchField } from './ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Generador de menús › Ingestas (11-2026)

   El bloque «Ingestas» del creador de menús: el reparto del día y qué lleva
   cada comida. Además del porcentaje y la fruta, cada comida puede ir «a
   medida» (ingestaPersonalizada.ts): recetas cerradas y un extra fijo. En la
   tarjeta se ve una línea de resumen y el detalle se edita en un panel
   (versión B de las maquetas, elegida por Dani el 12-11).
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  slots: MealSlotSpec[];
  onChange: (slots: MealSlotSpec[]) => void;
  paquetes: PaqueteDeRecetas[];
  catalogo: AlimentoCatalogo[];
  /** kcal de un día tipo, para decir cuánto le queda al plato. */
  kcalDelDia: number | null;
  /** Días con dieta asignada. */
  diasConDieta: WeekDay[];
  /** Falso con batch cooking o variedad 1–2: las recetas cerradas no rotan. */
  rotan: boolean;
  /** Los que apunta el atleta en Perfil › Preferencias (`OnboardingData.caprichos`). */
  caprichosDelAtleta?: CaprichoDelAtleta[];
  /** Lo que no le gusta o no puede comer: esas recetas salen en rojo al elegir. */
  gustos?: GustosParaMarcar;
  /** «En su plan» de Dietas › Información › Recetas del atleta (`listaMenu`):
   *  de ahí parte el buscador de recetas a medida. Ausente = todo el recetario. */
  listaDelAtleta?: ListaDeMenu;
  /** Sus filtros duros (`filtroDuro`): lo que no pasa no sale en «En su plan». */
  filtroDelAtleta?: (r: Recipe) => boolean;
  /** Las que se ha creado él en el diario: siempre en su plan (useRecetasDelAtleta). */
  recetasDelAtleta?: Recipe[];
}

/** Lo que puede llevar cada ingesta del menú (MealSlotSpec.fruta). */
const OPCIONES_FRUTA: { valor: FrutaEnIngesta | null; texto: string; icono: string }[] = [
  { valor: null, texto: 'Plato', icono: 'restaurant' },
  { valor: 'mas', texto: 'Plato + fruta', icono: 'nutrition' },
  { valor: 'solo', texto: 'Solo fruta', icono: 'nutrition' },
];

const DIA_CORTO: Record<WeekDay, string> = { mon: 'Lun', tue: 'Mar', wed: 'Mié', thu: 'Jue', fri: 'Vie', sat: 'Sáb', sun: 'Dom' };
const ENTRE_SEMANA: WeekDay[] = ['mon', 'tue', 'wed', 'thu', 'fri'];
const FINDE: WeekDay[] = ['sat', 'sun'];

const pildora = (activa: boolean) =>
  `flex items-center gap-1 rounded-chip border px-2.5 py-1 font-sans text-caption font-bold ${activa ? 'bg-accent border-accent text-on-accent' : 'border-hairline text-ink-2 hover:text-ink hover:border-strong'}`;
const TITULILLO = 'font-sans text-caption text-ink-3 uppercase';
const fmt = (n: number) => n.toLocaleString('es-ES');

type Vista = 'resumen' | 'recetas' | 'extra' | 'frutas';

export default function IngestasDelMenu({ slots, onChange, paquetes, catalogo, kcalDelDia, diasConDieta, rotan, caprichosDelAtleta = [], gustos, listaDelAtleta, filtroDelAtleta, recetasDelAtleta = SIN_RECETAS }: Props) {
  const pctSum = slots.reduce((s, sl) => s + sl.pct, 0);
  const [panel, setPanel] = useState<{ i: number; vista: Vista; raiz: Vista } | null>(null);
  const cambiar = (i: number, parche: Partial<MealSlotSpec>) => onChange(slots.map((s, idx) => (idx === i ? { ...s, ...parche } : s)));
  /* Las elegidas a mano se apartan al pasar a «De su lista» o a un paquete, y
     vuelven si el coach regresa a «Solo las que yo elija». Antes se perdían
     todas al cambiar de modo (Dani, 25-11). Clave: la de cada ingesta. */
  const apartadas = useRef<Record<string, RecetaDeIngesta[]>>({});
  const cambiarRecetas = (i: number, recetas: RecetasDeIngesta | undefined) => {
    const antes = slots[i].recetas;
    if (modoDeRecetas(antes) === 'estas' && modoDeRecetas(recetas) !== 'estas') apartadas.current[claveDeIngesta(slots[i], i)] = antes?.recetas ?? [];
    cambiar(i, { recetas });
  };
  const recuperarElegidas = (i: number) => cambiarRecetas(i, { recetas: apartadas.current[claveDeIngesta(slots[i], i)] ?? [] });
  const nombreDePaquete = (id: string) => paquetes.find(p => p.id === id)?.nombre;
  const nombreDeFruta = (id: string) => catalogo.find(a => a.id === id)?.nombre;
  const kcalDe = (sl: MealSlotSpec) => (kcalDelDia ? Math.round((kcalDelDia * sl.pct) / 100) : null);
  const abrir = (i: number, vista: Vista) => setPanel({ i, vista, raiz: vista });

  const delPanel = panel ? slots[panel.i] : null;

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between mb-2">
          <label htmlFor="weeklymenueditor-ingestas-de-la-anamnesis-ajustable" className="font-sans text-caption text-ink-2 uppercase">Ingestas (de la anamnesis, ajustable)</label>
          <span className={`font-mono text-caption font-bold ${pctSum === 100 ? 'text-success' : 'text-danger'}`}>Suma: {pctSum}%</span>
        </div>
        <div className="space-y-2">
          {slots.map((sl, i) => {
            const soloFruta = sl.fruta === 'solo';
            return (
              <div key={i} className="bg-surface border border-hairline rounded-surface px-4 py-3 space-y-2">
                <div className="flex items-center gap-3">
                  <span className="font-sans text-label text-ink w-32 flex-shrink-0 truncate">{sl.name}</span>
                  <ProgressBar value={sl.pct} label={`${sl.name}, ${sl.pct}%`} className="flex-1" />
                  <input id={i === 0 ? 'weeklymenueditor-ingestas-de-la-anamnesis-ajustable' : undefined}
                    aria-label={`Porcentaje del día para ${sl.name}`}
                    type="number" min={0} max={100} value={sl.pct}
                    onChange={e => cambiar(i, { pct: Number(e.target.value) })}
                    className="w-16 text-right bg-raised border border-control-line rounded-control px-2 py-1 text-title-s text-ink font-mono focus:outline-none focus:border-accent/50"
                  />
                  <span className="font-mono text-ink-3 text-label">%</span>
                </div>
                {/* Qué lleva esa ingesta: plato, plato + fruta obligatoria o solo fruta (Dani, 11-2026). */}
                <div role="radiogroup" aria-label={`Qué lleva ${sl.name}`} className="flex flex-wrap gap-1.5">
                  {OPCIONES_FRUTA.map(o => {
                    const activa = (sl.fruta ?? null) === o.valor;
                    return (
                      <button key={o.texto} type="button" role="radio" aria-checked={activa}
                        onClick={() => cambiar(i, { fruta: o.valor ?? undefined })}
                        className={pildora(activa)}>
                        <Icon name={o.icono} size="s" />{o.texto}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-hairline pt-2">
                    <p className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 font-sans text-caption text-ink-2">
                      {!soloFruta && (
                        <span className="inline-flex items-center gap-1">
                          <Icon name="skillet" size="s" className={modoDeRecetas(sl.recetas) === 'lista' ? 'text-ink-3' : 'text-accent-ink'} />
                          {resumenDeRecetas(sl.recetas, nombreDePaquete)}
                        </span>
                      )}
                      {sl.fruta && (
                        <span className="inline-flex items-center gap-1">
                          <Icon name="nutrition" size="s" className={sl.frutas?.length ? 'text-accent-ink' : 'text-ink-3'} />
                          {resumenDeFrutas(sl.frutas, nombreDeFruta)}
                        </span>
                      )}
                      {!soloFruta && (
                        <span className="inline-flex items-center gap-1">
                          <Icon name="cookie" size="s" className={extrasDeIngesta(sl).length > 0 ? 'text-accent-ink' : 'text-ink-3'} />
                          {resumenDeExtras(sl, diasConDieta)}
                        </span>
                      )}
                    </p>
                    <button type="button" onClick={() => abrir(i, 'resumen')}
                      className="flex flex-shrink-0 items-center gap-1 font-sans text-caption font-bold text-accent-ink hover:text-ink">
                      <Icon name="tune" size="s" />A medida
                    </button>
                  </div>
              </div>
            );
          })}
        </div>
      </div>

      {panel && delPanel && (
        <PanelLateral open onClose={() => setPanel(null)}
          title={panel.vista === 'recetas' ? `Recetas de ${delPanel.name}`
            : panel.vista === 'extra' ? `Extra fijo de ${delPanel.name}`
              : panel.vista === 'frutas' ? `Fruta de ${delPanel.name}`
                : `${delPanel.name} a medida`}>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
            {panel.vista === 'resumen' && (
              <p className="font-sans text-caption text-ink-3">Se queda guardado para este atleta al generar: sus próximos menús salen igual.</p>
            )}
            {panel.vista !== panel.raiz && (
              <button type="button" onClick={() => setPanel({ ...panel, vista: panel.raiz })}
                className="flex items-center gap-1 self-start font-sans text-caption font-bold text-ink-2 hover:text-ink">
                <Icon name="arrow_back" size="s" />Volver
              </button>
            )}
            {panel.vista === 'resumen' && (
              <>
                {delPanel.fruta !== 'solo' && (
                  <>
                    <BloqueRecetas sl={delPanel} paquetes={paquetes} dias={diasConDieta.length} rotan={rotan} gustos={gustos} suyas={recetasDelAtleta}
                      onChange={recetas => cambiarRecetas(panel.i, recetas)} onElegirAMano={() => recuperarElegidas(panel.i)}
                      onAbrir={() => setPanel({ ...panel, vista: 'recetas' })} />
                    <div className="border-t border-hairline" />
                  </>
                )}
                {delPanel.fruta && (
                  <>
                    <BloqueFrutas sl={delPanel} catalogo={catalogo}
                      onChange={frutas => cambiar(panel.i, { frutas })} onAbrir={() => setPanel({ ...panel, vista: 'frutas' })} />
                    {delPanel.fruta !== 'solo' && <div className="border-t border-hairline" />}
                  </>
                )}
                {delPanel.fruta !== 'solo' && (
                  <BloqueExtra sl={delPanel} kcalIngesta={kcalDe(delPanel)} diasConDieta={diasConDieta} caprichosDelAtleta={caprichosDelAtleta}
                    onChange={extras => cambiar(panel.i, { extras, extra: undefined })} onAbrir={() => setPanel({ ...panel, vista: 'extra' })} />
                )}
              </>
            )}
            {panel.vista === 'frutas' && (
              <BuscadorDeFrutas catalogo={catalogo} elegidas={delPanel.frutas ?? []}
                onAlternar={id => cambiar(panel.i, { frutas: conFrutaAlternada(delPanel.frutas, id) })} />
            )}
            {panel.vista === 'recetas' && (
              <BuscadorDeRecetas slot={delPanel.slot} elegidas={delPanel.recetas?.recetas ?? []} gustos={gustos}
                plan={listaDelAtleta} filtro={filtroDelAtleta} suyas={recetasDelAtleta}
                onAlternar={r => {
                  const actuales = delPanel.recetas?.recetas ?? [];
                  const recetas = actuales.some(x => x.id === r.id) ? actuales.filter(x => x.id !== r.id) : [...actuales, r];
                  cambiar(panel.i, { recetas: { recetas } });
                }} />
            )}
            {panel.vista === 'extra' && (
              <BuscadorDeExtra catalogo={catalogo} caprichosDelAtleta={caprichosDelAtleta}
                onElegir={extra => {
                  // Los días son los mismos para todos los caprichos de la comida.
                  const ya = extrasDeIngesta(delPanel);
                  const dias = ya[0]?.dias;
                  cambiar(panel.i, { extras: [...ya, { ...extra, ...(dias ? { dias } : {}) }], extra: undefined });
                  if (panel.raiz === 'extra') setPanel(null); else setPanel({ ...panel, vista: panel.raiz });
                }} />
            )}
          </div>
          {panel.vista !== 'extra' && (
            <div className="border-t border-hairline p-4">
              <Button variant="primary" fullWidth onClick={() => (panel.vista === panel.raiz ? setPanel(null) : setPanel({ ...panel, vista: panel.raiz }))}>
                {panel.vista === 'recetas' ? `Listo · ${(delPanel.recetas?.recetas?.length ?? 0) === 1 ? '1 elegida' : `${delPanel.recetas?.recetas?.length ?? 0} elegidas`}`
                  : panel.vista === 'frutas' ? `Listo · ${resumenDeFrutas(delPanel.frutas, nombreDeFruta).toLowerCase()}`
                    : 'Listo'}
              </Button>
            </div>
          )}
        </PanelLateral>
      )}
    </div>
  );
}

/* ── De qué recetas tira la comida ─────────────────────────────────────────── */

function BloqueRecetas({ sl, paquetes, dias, rotan, gustos, suyas, onChange, onElegirAMano, onAbrir }: {
  sl: MealSlotSpec; paquetes: PaqueteDeRecetas[]; dias: number; rotan: boolean; gustos?: GustosParaMarcar; suyas: Recipe[];
  onChange: (r: RecetasDeIngesta | undefined) => void; onElegirAMano: () => void; onAbrir: () => void;
}) {
  const modo = modoDeRecetas(sl.recetas);
  const elegidas = sl.recetas?.recetas ?? [];
  const aviso = avisoDeRecetas(sl.recetas, dias, rotan);
  const pegaDe = usePegas(gustos, suyas);
  return (
    <div className="min-w-0 space-y-2">
      <p className={TITULILLO}>Recetas de {sl.name.toLowerCase()}</p>
      <div role="radiogroup" aria-label={`De qué recetas sale ${sl.name}`} className="flex flex-wrap gap-1.5">
        <button type="button" role="radio" aria-checked={modo === 'lista'} onClick={() => onChange(undefined)} className={pildora(modo === 'lista')}>
          De su lista
        </button>
        <button type="button" role="radio" aria-checked={modo === 'estas'} onClick={() => { if (modo !== 'estas') onElegirAMano(); }} className={pildora(modo === 'estas')}>
          Solo las que yo elija
        </button>
        {paquetes.map(p => {
          const activo = sl.recetas?.paqueteId === p.id;
          return (
            <button key={p.id} type="button" role="radio" aria-checked={activo} onClick={() => onChange({ paqueteId: p.id })} className={pildora(activo)}>
              <Icon name="inventory_2" size="s" />{p.nombre}
            </button>
          );
        })}
      </div>
      {modo === 'lista' && <p className="font-sans text-caption text-ink-3">Como hasta ahora: cualquier receta de su lista que cuadre.</p>}
      {modo === 'paquete' && <p className="font-sans text-caption text-ink-3">Solo las recetas de ese paquete que sirvan para esta comida.</p>}
      {modo === 'estas' && (
        <>
          {elegidas.length > 0 && (
            <ul className="space-y-1">
              {elegidas.map(r => {
                const pega = pegaDe(r.id);
                return (
                  <li key={r.id} className={`flex items-center gap-2 rounded-control border py-1 pl-1 pr-2 ${pega ? 'border-danger/40 bg-danger/10' : 'border-hairline bg-bg'}`}>
                    <div className="h-8 w-8 flex-shrink-0 overflow-hidden rounded-control bg-raised">
                      <FotoDeReceta src={r.foto} alt="" className="h-full w-full object-cover"
                        fallback={<div className="flex h-full w-full items-center justify-center"><Icon name="skillet" size="s" className="text-ink-3" /></div>} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`truncate font-sans text-label ${pega ? 'text-danger' : 'text-ink'}`}>{r.nombre}</p>
                      {pega && <LineaDePega pega={pega} />}
                    </div>
                    {r.kcal ? <span className="flex-shrink-0 font-mono text-caption text-ink-3">{fmt(r.kcal)} kcal</span> : null}
                    <button type="button" aria-label={`Quitar ${r.nombre}`} onClick={() => onChange({ recetas: elegidas.filter(x => x.id !== r.id) })}
                      className="flex-shrink-0 text-ink-3 hover:text-ink"><Icon name="close" size="s" /></button>
                  </li>
                );
              })}
            </ul>
          )}
          <button type="button" onClick={onAbrir} className="flex items-center gap-1 font-sans text-caption font-bold text-accent-ink hover:text-ink">
            <Icon name="add" size="s" />{elegidas.length > 0 ? 'Añadir más recetas' : 'Elegir recetas'}
          </button>
          {aviso && <p className="font-sans text-caption text-ink-3">{aviso}</p>}
          {elegidas.length > 0 && <p className="font-sans text-caption text-ink-3">Al cambiar de comida, el atleta solo verá estas.</p>}
        </>
      )}
    </div>
  );
}

/* ── El extra fijo: postre, capricho, complemento ──────────────────────────── */

function BloqueExtra({ sl, kcalIngesta, diasConDieta, caprichosDelAtleta, onChange, onAbrir }: {
  sl: MealSlotSpec; kcalIngesta: number | null; diasConDieta: WeekDay[]; caprichosDelAtleta: CaprichoDelAtleta[];
  onChange: (e: ExtraFijo[]) => void; onAbrir: () => void;
}) {
  const extras = extrasDeIngesta(sl);
  if (extras.length === 0) {
    return (
      <div className="min-w-0 space-y-2">
        <p className={TITULILLO}>Extra fijo</p>
        <button type="button" onClick={onAbrir}
          className="flex w-full items-center justify-center gap-1.5 rounded-control border border-dashed border-strong px-3 py-2.5 font-sans text-caption font-bold text-ink-2 hover:text-ink">
          <Icon name="cookie" size="s" />Añadir postre o capricho
        </button>
        <p className="font-sans text-caption text-ink-3">Algo que lleva siempre además del plato, los días que tú digas. Se descuenta antes de elegir el plato.</p>
        {caprichosDelAtleta.length > 0 && (
          <p className="flex items-start gap-1 font-sans text-caption text-ink-2">
            <Icon name="favorite" size="s" className="mt-px flex-shrink-0 text-accent-ink" />
            <span>Le apetece: {caprichosDelAtleta.map(c => c.nombre).join(', ')}.</span>
          </p>
        )}
      </div>
    );
  }
  /* Los días son de la COMIDA, no de cada capricho: se editan una vez y van a
     todos. Lo que rota es qué capricho toca cada día (ingestaPersonalizada.ts). */
  const dias = extras[0].dias;
  const conDias = (nuevos: WeekDay[] | undefined) => {
    const validos = nuevos?.filter(d => diasConDieta.includes(d));
    const todos = !validos || validos.length >= diasConDieta.length;
    return extras.map(e => {
      const { dias: _fuera, ...resto } = e;
      return todos ? resto : { ...resto, dias: validos };
    });
  };
  const kcalMedia = Math.round(extras.reduce((t, e) => t + kcalDeExtra(e), 0) / extras.length);
  return (
    <div className="min-w-0 space-y-2">
      <p className={TITULILLO}>Extra fijo</p>
      <div className="space-y-3 rounded-surface border border-hairline bg-bg p-3">
        {extras.map((extra, n) => {
          const cantidad = extra.piezas ?? extra.gramos ?? 0;
          const paso = pasoDeExtra(extra);
          const cambiarUno = (e: ExtraFijo) => onChange(extras.map((x, i) => (i === n ? e : x)));
          return (
            <div key={`${extra.alimentoId}_${n}`} className={n > 0 ? 'space-y-2 border-t border-hairline pt-3' : 'space-y-2'}>
              <div className="flex items-start gap-2">
                <Icon name="cookie" size="m" className="mt-0.5 flex-shrink-0 text-accent-ink" />
                <div className="min-w-0 flex-1">
                  <p className="font-sans text-label font-bold leading-tight text-ink">{extra.nombre}</p>
                  <p className="font-mono text-caption text-ink-2">{fmt(kcalDeExtra(extra))} kcal</p>
                </div>
                <button type="button" aria-label={`Quitar ${extra.nombre}`} onClick={() => onChange(extras.filter((_, i) => i !== n))}
                  className="flex-shrink-0 text-ink-3 hover:text-ink"><Icon name="close" size="s" /></button>
              </div>
              <div className="flex items-center gap-2" role="group" aria-label={`Cantidad de ${extra.nombre}`}>
                <button type="button" aria-label="Menos" onClick={() => cambiarUno(conCantidad(extra, cantidad - paso))}
                  className="flex h-8 w-8 items-center justify-center rounded-control border border-hairline bg-raised text-ink-2 hover:text-ink"><Icon name="remove" size="s" /></button>
                <span className="min-w-[88px] text-center font-mono text-label font-bold tabular-nums text-ink">
                  {extra.piezas != null ? `${fmt(extra.piezas)} ${extra.unidad ?? 'ud'}` : `${fmt(extra.gramos ?? 0)} g`}
                </span>
                <button type="button" aria-label="Más" onClick={() => cambiarUno(conCantidad(extra, cantidad + paso))}
                  className="flex h-8 w-8 items-center justify-center rounded-control border border-hairline bg-raised text-ink-2 hover:text-ink"><Icon name="add" size="s" /></button>
              </div>
            </div>
          );
        })}

        <button type="button" onClick={onAbrir} className="flex items-center gap-1 font-sans text-caption font-bold text-accent-ink hover:text-ink">
          <Icon name="add" size="s" />Añadir otro capricho
        </button>

        <div className="space-y-1.5 border-t border-hairline pt-3">
          <p className="font-sans text-caption text-ink-3">{extras.length === 1 ? 'Qué días lo lleva' : 'Qué días lleva capricho'}</p>
          <div className="flex gap-1" role="group" aria-label="Días que toca">
            {DIAS_SEMANA.map(d => {
              const conDieta = diasConDieta.includes(d);
              const toca = conDieta && tocaElDia(extras[0], d);
              return (
                <button key={d} type="button" aria-pressed={toca} aria-label={DIA_CORTO[d]} disabled={!conDieta}
                  onClick={() => onChange(extras.map(e => conDiaAlternado(e, d, diasConDieta)))}
                  className={`h-8 w-8 rounded-full border font-mono text-caption font-bold disabled:opacity-30 ${toca ? 'border-accent bg-accent text-on-accent' : 'border-hairline text-ink-2 hover:border-strong'}`}>
                  {INICIAL_DE_DIA[d]}
                </button>
              );
            })}
          </div>
          <div className="flex gap-3 font-sans text-caption text-ink-2">
            <button type="button" className="hover:text-ink" onClick={() => onChange(conDias(undefined))}>Todos</button>
            <button type="button" className="hover:text-ink" onClick={() => onChange(conDias(ENTRE_SEMANA))}>Entre semana</button>
            <button type="button" className="hover:text-ink" onClick={() => onChange(conDias(FINDE))}>Fin de semana</button>
          </div>
        </div>

        {extras.length > 1 && (
          <p className="font-sans text-caption text-ink-3">
            Esos días va rotando entre los {extras.length}: no le toca el mismo dos veces seguidas.
          </p>
        )}
        {kcalIngesta != null && kcalIngesta > kcalMedia && (
          <p className="font-sans text-caption text-ink-3">
            Esos días el plato baja de {fmt(kcalIngesta)} a {fmt(kcalIngesta - kcalMedia)} kcal{extras.length > 1 ? ' de media' : ''} para que el día siga cuadrando.
          </p>
        )}
        <p className="sr-only">{textoDeDias(dias, diasConDieta)}</p>
      </div>
    </div>
  );
}

/* ── Buscadores (van dentro del panel) ─────────────────────────────────────── */

const aRecetaDeIngesta = (r: Recipe): RecetaDeIngesta => {
  const foto = fotoDeReceta(r);
  return { id: r.id, nombre: r.name, kcal: Math.round(macrosDeReceta(r).kcal), ...(foto ? { foto } : {}) };
};

const SIN_RECETAS: Recipe[] = [];

/** La pega de cada receta elegida, mirada en el índice (que trae los ingredientes). */
function usePegas(gustos: GustosParaMarcar | undefined, suyas: Recipe[]): (id: string) => PegaDeReceta | null {
  const { data: indice = SIN_RECETAS } = useQuery({ queryKey: ['indiceRecetas'], queryFn: cargarIndiceRecetas, staleTime: Infinity, enabled: !!gustos });
  return useMemo(() => {
    if (!gustos) return () => null;
    const porId = new Map([...indice, ...suyas].map(r => [r.id, r]));
    return (id: string) => {
      const r = porId.get(id);
      return r ? pegaDeReceta(r, gustos) : null;
    };
  }, [indice, suyas, gustos]);
}

function LineaDePega({ pega }: { pega: PegaDeReceta }) {
  return (
    <p className="flex items-start gap-1 font-sans text-caption font-bold text-danger">
      <Icon name={pega.grave ? 'block' : 'thumb_down'} size="s" className="mt-px flex-shrink-0" />
      <span className="min-w-0">{pega.texto}</span>
    </p>
  );
}

const TOPE_DE_FILAS = 60;
/** Lo que pesa en la relevancia ser de otra comida: unas pocas posiciones,
 *  no tanto como para esconder unos huevos revueltos al buscar «huevo». */
const CASTIGO_OTRA_COMIDA = 15;
const NOMBRE_DE_COMIDA: Record<number, string> = { 1: 'desayuno', 2: 'media mañana', 3: 'comida', 4: 'merienda', 5: 'cena' };
/** «comida y cena», «merienda». */
function comidasDeLaReceta(r: Recipe): string {
  const nombres = (r.intakeTypes ?? []).map(t => NOMBRE_DE_COMIDA[t] ?? `comida ${t}`);
  if (nombres.length === 0) return 'otra comida';
  return nombres.length === 1 ? nombres[0] : `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
}

/* El buscador parte de «En su plan» (Recetas del atleta, ya con sus filtros):
   el embudo es recetario → su plan → a medida (Dani, 25-11). «Todo el
   recetario» queda a un toque para buscar algo concreto. */
function BuscadorDeRecetas({ slot, elegidas, gustos, plan, filtro, suyas, onAlternar }: {
  /** Franja de la comida. */
  slot: number;
  elegidas: RecetaDeIngesta[];
  gustos?: GustosParaMarcar;
  plan?: ListaDeMenu;
  filtro?: (r: Recipe) => boolean;
  suyas: Recipe[];
  onAlternar: (r: RecetaDeIngesta) => void;
}) {
  const { data: indice = SIN_RECETAS, isLoading } = useQuery({ queryKey: ['indiceRecetas'], queryFn: cargarIndiceRecetas, staleTime: Infinity });
  const [q, setQ] = useState('');
  const conPlan = !!plan && plan.length > 0;
  const [ambito, setAmbito] = useState<'plan' | 'todo'>(conPlan ? 'plan' : 'todo');
  const ids = new Set(elegidas.map(r => r.id));
  // Las suyas (las del diario) van primero y están siempre en su plan.
  const idsSuyas = useMemo(() => new Set(suyas.map(r => r.id)), [suyas]);
  // De CUALQUIER comida: buscando se puede elegir una de otra (Dani, 25-11:
  // unos huevos revueltos con jamón, que son «de tupper», para desayunar).
  // Sin escribir nada se ven solo las de esta comida.
  const todas = useMemo(() => [...suyas, ...indice.filter(esPlatoDelRecetario)], [suyas, indice]);
  const todasDelPlan = useMemo(
    () => (conPlan ? todas.filter(r => idsSuyas.has(r.id) || (estaEnSuPlan(r, plan) && (!filtro || filtro(r)))) : todas),
    [todas, idsSuyas, conPlan, plan, filtro],
  );
  const delPlanEnEstaComida = useMemo(() => todasDelPlan.filter(r => recipeMatchesSlot(r, slot)), [todasDelPlan, slot]);
  const enPlan = useMemo(() => new Set(todasDelPlan.map(r => r.id)), [todasDelPlan]);
  const buscando = q.trim() !== '';
  const coinciden = useMemo(() => {
    const base = ambito === 'plan' ? todasDelPlan : todas;
    const candidatas = buscando ? base.filter(r => coincideBusqueda(r.name, q)) : base.filter(r => recipeMatchesSlot(r, slot));
    const filas = candidatas.map(r => {
      const otraComida = !recipeMatchesSlot(r, slot);
      // Lo que ES lo buscado primero; las de otra comida, un poco detrás.
      const orden = buscando ? relevanciaDeBusqueda(r.name, q) + (otraComida ? CASTIGO_OTRA_COMIDA : 0) : 0;
      return { r, otraComida, orden, pega: gustos ? pegaDeReceta(r, gustos) : null };
    });
    if (buscando) filas.sort((a, b) => a.orden - b.orden);
    // Las que chocan con el atleta, al final.
    return [...filas.filter(f => !f.pega), ...filas.filter(f => f.pega)];
  }, [ambito, todasDelPlan, todas, buscando, q, slot, gustos]);
  const filas = coinciden.slice(0, TOPE_DE_FILAS);
  return (
    <div className="space-y-2">
      {conPlan && (
        <div role="radiogroup" aria-label="Dónde buscar" className="flex flex-wrap gap-1.5">
          <button type="button" role="radio" aria-checked={ambito === 'plan'} onClick={() => setAmbito('plan')} className={pildora(ambito === 'plan')}>
            <Icon name="checklist" size="s" />En su plan{isLoading ? '' : ` · ${fmt(delPlanEnEstaComida.length)}`}
          </button>
          <button type="button" role="radio" aria-checked={ambito === 'todo'} onClick={() => setAmbito('todo')} className={pildora(ambito === 'todo')}>
            <Icon name="menu_book" size="s" />Todo el recetario
          </button>
        </div>
      )}
      <SearchField label="Buscar receta" placeholder={ambito === 'plan' ? 'Buscar en su plan…' : 'Buscar en todo el recetario…'} value={q} onChange={setQ} onCancel={() => setQ('')} />
      {!buscando && !isLoading && (
        <p className="font-sans text-caption text-ink-3">Escribe para buscar también entre las recetas de otras comidas.</p>
      )}
      {isLoading ? (
        <p className="py-6 text-center font-sans text-caption text-ink-3">Cargando el recetario…</p>
      ) : filas.length === 0 ? (
        <div className="space-y-2 py-6 text-center">
          <p className="font-sans text-caption text-ink-3">
            {ambito === 'plan' ? 'Nada con ese nombre en su plan.' : 'Ninguna receta con ese nombre.'}
          </p>
          {ambito === 'plan' && (
            <button type="button" onClick={() => setAmbito('todo')} className="font-sans text-caption font-bold text-accent-ink hover:text-ink">
              Buscar en todo el recetario
            </button>
          )}
        </div>
      ) : (
        <ul className="space-y-0.5">
          {filas.map(({ r, pega, otraComida }) => {
            const dentro = ids.has(r.id);
            const kcal = Math.round(macrosDeReceta(r).kcal);
            const fondo = dentro ? 'bg-accent/10' : pega ? 'bg-danger/10' : 'hover:bg-surface';
            return (
              <li key={r.id}>
                <button type="button" aria-pressed={dentro} onClick={() => onAlternar(aRecetaDeIngesta(r))}
                  className={`flex w-full items-center gap-3 rounded-control px-2 py-2 text-left transition-colors ${fondo} ${pega ? 'ring-1 ring-inset ring-danger/40' : ''}`}>
                  <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-control bg-surface">
                    <FotoDeReceta src={fotoDeReceta(r)} alt="" className="h-full w-full object-cover"
                      fallback={<div className="flex h-full w-full items-center justify-center"><Icon name="skillet" size="m" className="text-ink-3" /></div>} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`truncate font-sans text-label ${pega ? 'text-danger' : 'text-ink'}`}>{r.name}</p>
                    <p className="font-mono text-caption text-ink-3">
                      {kcal > 0 ? `${fmt(kcal)} kcal · ` : ''}{etiquetaDeTiempo(r)}
                      {idsSuyas.has(r.id)
                        ? <span className="font-sans font-bold text-accent-ink"> · suya, de su diario</span>
                        : ambito === 'todo' && conPlan && enPlan.has(r.id) && <span className="font-sans font-bold text-accent-ink"> · en su plan</span>}
                    </p>
                    {otraComida && <p className="font-sans text-caption text-ink-2">Es de {comidasDeLaReceta(r)} · sirve igual aquí</p>}
                    {pega && <LineaDePega pega={pega} />}
                  </div>
                  <Icon name={dentro ? 'check_circle' : 'radio_button_unchecked'} size="m" filled={dentro} className={dentro ? 'text-accent-ink' : 'text-ink-3'} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {coinciden.length > filas.length && (
        <p className="py-2 text-center font-sans text-caption text-ink-3">
          Hay {fmt(coinciden.length)}; se ven {filas.length}. Escribe para afinar.
        </p>
      )}
    </div>
  );
}

function BuscadorDeExtra({ catalogo, caprichosDelAtleta, onElegir }: {
  catalogo: AlimentoCatalogo[]; caprichosDelAtleta: CaprichoDelAtleta[]; onElegir: (e: ExtraFijo) => void;
}) {
  const [q, setQ] = useState('');
  const buscando = q.trim() !== '';
  const resultados = useMemo(() => (buscando ? buscarCaprichos(q, catalogo) : []), [buscando, q, catalogo]);
  const grupos = useMemo(() => caprichosPorGrupo(), []);

  const fila = (a: AlimentoCatalogo) => (
    <li key={a.id}>
      <button type="button" onClick={() => onElegir(extraDeAlimento(a))}
        className="flex w-full items-center gap-3 rounded-control px-2 py-2 text-left transition-colors hover:bg-surface">
        <div className="min-w-0 flex-1">
          <p className="font-sans text-label leading-tight text-ink">{nombreDeAlimento(a)}</p>
          <p className="font-mono text-caption text-ink-3">{textoDeRacion(a)}</p>
        </div>
        <Icon name="add" size="m" className="text-ink-3" />
      </button>
    </li>
  );

  return (
    <div className="space-y-3">
      <SearchField label="Buscar alimento" placeholder="Chocolate, helado, galletas…" value={q} onChange={setQ} onCancel={() => setQ('')} />

      {/* Lo que ha apuntado el atleta, siempre arriba. Con kcal se mete de un
          toque; escrito a su manera, el toque lo busca en la lista. */}
      {!buscando && caprichosDelAtleta.length > 0 && (
        <div className="space-y-1 rounded-surface border border-accent-line bg-accent/5 p-2">
          <p className="flex items-center gap-1 px-1 font-sans text-caption uppercase text-accent-ink">
            <Icon name="favorite" size="s" />Lo que ha pedido el atleta
          </p>
          <ul className="space-y-0.5">
            {caprichosDelAtleta.map(c => {
              const a = alimentoDelCapricho(c);
              return (
                <li key={c.id}>
                  <button type="button" onClick={() => (a ? onElegir(extraDeAlimento(a)) : setQ(c.nombre))}
                    className="flex w-full items-center gap-3 rounded-control px-2 py-2 text-left transition-colors hover:bg-surface">
                    <div className="min-w-0 flex-1">
                      <p className="font-sans text-label leading-tight text-ink">{c.nombre}</p>
                      <p className="font-mono text-caption text-ink-3">{a ? textoDeRacion(a) : 'Escrito a su manera · toca para buscarlo'}</p>
                      {c.nota && <p className="font-sans text-caption text-ink-2">«{c.nota}»</p>}
                    </div>
                    <Icon name={a ? 'add' : 'search'} size="m" className="text-ink-3" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {buscando ? (
        resultados.length === 0
          ? <p className="py-6 text-center font-sans text-caption text-ink-3">Nada con ese nombre en los caprichos ni en el catálogo.</p>
          : <ul className="space-y-0.5">{resultados.map(fila)}</ul>
      ) : (
        grupos.map(g => (
          <div key={g.id} className="space-y-1">
            <p className={TITULILLO}>{g.titulo}</p>
            <ul className="space-y-0.5">{g.caprichos.map(fila)}</ul>
          </div>
        ))
      )}
    </div>
  );
}

/* ── Qué fruta sale de postre ──────────────────────────────────────────────── */

function BloqueFrutas({ sl, catalogo, onChange, onAbrir }: {
  sl: MealSlotSpec; catalogo: AlimentoCatalogo[];
  onChange: (frutas: string[] | undefined) => void; onAbrir: () => void;
}) {
  const elegidas = sl.frutas ?? [];
  const nombre = (id: string) => catalogo.find(a => a.id === id)?.nombre ?? 'Fruta';
  return (
    <div className="min-w-0 space-y-2">
      <p className={TITULILLO}>Qué fruta</p>
      <div role="radiogroup" aria-label={`Qué fruta sale en ${sl.name}`} className="flex flex-wrap gap-1.5">
        <button type="button" role="radio" aria-checked={elegidas.length === 0} onClick={() => onChange(undefined)} className={pildora(elegidas.length === 0)}>
          Cualquiera
        </button>
        <button type="button" role="radio" aria-checked={elegidas.length > 0} onClick={onAbrir} className={pildora(elegidas.length > 0)}>
          <Icon name="nutrition" size="s" />Solo estas
        </button>
      </div>
      {elegidas.length === 0 ? (
        <p className="font-sans text-caption text-ink-3">Va rotando entre las frutas que le cuadran, sin repetir siempre la misma.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {elegidas.map(id => (
              <span key={id} className="flex items-center gap-1 rounded-chip border border-hairline bg-bg py-1 pl-2.5 pr-1.5 font-sans text-caption text-ink">
                {nombre(id)}
                <button type="button" aria-label={`Quitar ${nombre(id)}`} onClick={() => onChange(conFrutaAlternada(elegidas, id))} className="text-ink-3 hover:text-ink">
                  <Icon name="close" size="s" />
                </button>
              </span>
            ))}
          </div>
          <button type="button" onClick={onAbrir} className="flex items-center gap-1 font-sans text-caption font-bold text-accent-ink hover:text-ink">
            <Icon name="add" size="s" />Añadir más frutas
          </button>
          <p className="font-sans text-caption text-ink-3">
            {elegidas.length === 1 ? 'Siempre esta fruta.' : `Rota entre estas ${elegidas.length}.`} Si ninguna cuadra ese día, sale otra antes que quedarse sin fruta.
          </p>
        </>
      )}
    </div>
  );
}

function BuscadorDeFrutas({ catalogo, elegidas, onAlternar }: {
  catalogo: AlimentoCatalogo[]; elegidas: string[]; onAlternar: (id: string) => void;
}) {
  const [q, setQ] = useState('');
  const dentro = new Set(elegidas);
  const lista = useMemo(() => frutasDelCatalogo(catalogo).filter(a => coincideBusqueda(a.nombre, q)).slice(0, 60), [catalogo, q]);
  return (
    <div className="space-y-2">
      <SearchField label="Buscar fruta" placeholder="Plátano, manzana, kiwi…" value={q} onChange={setQ} onCancel={() => setQ('')} />
      {lista.length === 0 ? (
        <p className="py-6 text-center font-sans text-caption text-ink-3">Ninguna fruta con ese nombre en el catálogo.</p>
      ) : (
        <ul className="space-y-0.5">
          {lista.map(a => {
            const marcada = dentro.has(a.id);
            return (
              <li key={a.id}>
                <button type="button" aria-pressed={marcada} onClick={() => onAlternar(a.id)}
                  className={`flex w-full items-center gap-3 rounded-control px-2 py-2 text-left transition-colors ${marcada ? 'bg-accent/10' : 'hover:bg-surface'}`}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-sans text-label text-ink">{nombreDeAlimento(a)}</p>
                    <p className="font-mono text-caption text-ink-3">
                      {fmt(Math.round(a.porCien.kcal))} kcal/100 g{a.unidad ? ` · 1 ${a.unidad.nombre} = ${fmt(a.unidad.gramos)} g` : ''}
                    </p>
                  </div>
                  <Icon name={marcada ? 'check_circle' : 'radio_button_unchecked'} size="m" filled={marcada} className={marcada ? 'text-accent-ink' : 'text-ink-3'} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
