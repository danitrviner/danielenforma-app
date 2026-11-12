import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Recipe, WeekDay } from '../types';
import { cargarIndiceRecetas } from '../dbService';
import { esPlatoDelRecetario } from '../db/recetasHidratacion';
import { recipeMatchesSlot, type FrutaEnIngesta, type MealSlotSpec } from '../utils/menuEngine';
import type { PaqueteDeRecetas } from '../utils/seleccionDeRecetas';
import { nombreDeAlimento, type AlimentoCatalogo } from '../utils/catalogoAlimentos';
import {
  DIAS_SEMANA, INICIAL_DE_DIA, avisoDeRecetas, conCantidad, conDiaAlternado, extraDeAlimento,
  kcalDeExtra, modoDeRecetas, pasoDeExtra, resumenDeRecetas, textoDeDias, textoDeExtraFijo, tocaElDia,
  type ExtraFijo, type RecetaDeIngesta, type RecetasDeIngesta,
} from '../utils/ingestaPersonalizada';
import { coincideBusqueda } from '../utils/busqueda';
import { fotoDeReceta } from '../utils/fotoDeReceta';
import { macrosDeReceta } from '../utils/macrosDeReceta';
import { etiquetaDeTiempo } from '../utils/tiempoDeReceta';
import FotoDeReceta from './FotoDeReceta';
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

type Vista = 'resumen' | 'recetas' | 'extra';

export default function IngestasDelMenu({ slots, onChange, paquetes, catalogo, kcalDelDia, diasConDieta, rotan }: Props) {
  const pctSum = slots.reduce((s, sl) => s + sl.pct, 0);
  const [panel, setPanel] = useState<{ i: number; vista: Vista; raiz: Vista } | null>(null);
  const cambiar = (i: number, parche: Partial<MealSlotSpec>) => onChange(slots.map((s, idx) => (idx === i ? { ...s, ...parche } : s)));
  const nombreDePaquete = (id: string) => paquetes.find(p => p.id === id)?.nombre;
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

                {!soloFruta && (
                  <div className="flex items-center justify-between gap-3 border-t border-hairline pt-2">
                    <p className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 font-sans text-caption text-ink-2">
                      <span className="inline-flex items-center gap-1">
                        <Icon name="skillet" size="s" className={modoDeRecetas(sl.recetas) === 'lista' ? 'text-ink-3' : 'text-accent-ink'} />
                        {resumenDeRecetas(sl.recetas, nombreDePaquete)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Icon name="cookie" size="s" className={sl.extra ? 'text-accent-ink' : 'text-ink-3'} />
                        {sl.extra ? `${textoDeExtraFijo(sl.extra)} · ${textoDeDias(sl.extra.dias, diasConDieta).toLowerCase()}` : 'Sin extra fijo'}
                      </span>
                    </p>
                    <button type="button" onClick={() => abrir(i, 'resumen')}
                      className="flex flex-shrink-0 items-center gap-1 font-sans text-caption font-bold text-accent-ink hover:text-ink">
                      <Icon name="tune" size="s" />A medida
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {panel && delPanel && (
        <PanelLateral open onClose={() => setPanel(null)}
          title={panel.vista === 'recetas' ? `Recetas de ${delPanel.name}` : panel.vista === 'extra' ? `Extra fijo de ${delPanel.name}` : `${delPanel.name} a medida`}>
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
                <BloqueRecetas sl={delPanel} paquetes={paquetes} dias={diasConDieta.length} rotan={rotan}
                  onChange={recetas => cambiar(panel.i, { recetas })} onAbrir={() => setPanel({ ...panel, vista: 'recetas' })} />
                <div className="border-t border-hairline" />
                <BloqueExtra sl={delPanel} kcalIngesta={kcalDe(delPanel)} diasConDieta={diasConDieta}
                  onChange={extra => cambiar(panel.i, { extra })} onAbrir={() => setPanel({ ...panel, vista: 'extra' })} />
              </>
            )}
            {panel.vista === 'recetas' && (
              <BuscadorDeRecetas slot={delPanel.slot} elegidas={delPanel.recetas?.recetas ?? []}
                onAlternar={r => {
                  const actuales = delPanel.recetas?.recetas ?? [];
                  const recetas = actuales.some(x => x.id === r.id) ? actuales.filter(x => x.id !== r.id) : [...actuales, r];
                  cambiar(panel.i, { recetas: { recetas } });
                }} />
            )}
            {panel.vista === 'extra' && (
              <BuscadorDeExtra catalogo={catalogo}
                onElegir={extra => {
                  cambiar(panel.i, { extra: { ...extra, ...(delPanel.extra?.dias ? { dias: delPanel.extra.dias } : {}) } });
                  if (panel.raiz === 'extra') setPanel(null); else setPanel({ ...panel, vista: panel.raiz });
                }} />
            )}
          </div>
          {panel.vista !== 'extra' && (
            <div className="border-t border-hairline p-4">
              <Button variant="primary" fullWidth onClick={() => (panel.vista === panel.raiz ? setPanel(null) : setPanel({ ...panel, vista: panel.raiz }))}>
                {panel.vista === 'recetas' ? `Listo · ${(delPanel.recetas?.recetas?.length ?? 0) === 1 ? '1 elegida' : `${delPanel.recetas?.recetas?.length ?? 0} elegidas`}` : 'Listo'}
              </Button>
            </div>
          )}
        </PanelLateral>
      )}
    </div>
  );
}

/* ── De qué recetas tira la comida ─────────────────────────────────────────── */

function BloqueRecetas({ sl, paquetes, dias, rotan, onChange, onAbrir }: {
  sl: MealSlotSpec; paquetes: PaqueteDeRecetas[]; dias: number; rotan: boolean;
  onChange: (r: RecetasDeIngesta | undefined) => void; onAbrir: () => void;
}) {
  const modo = modoDeRecetas(sl.recetas);
  const elegidas = sl.recetas?.recetas ?? [];
  const aviso = avisoDeRecetas(sl.recetas, dias, rotan);
  return (
    <div className="min-w-0 space-y-2">
      <p className={TITULILLO}>Recetas de {sl.name.toLowerCase()}</p>
      <div role="radiogroup" aria-label={`De qué recetas sale ${sl.name}`} className="flex flex-wrap gap-1.5">
        <button type="button" role="radio" aria-checked={modo === 'lista'} onClick={() => onChange(undefined)} className={pildora(modo === 'lista')}>
          De su lista
        </button>
        <button type="button" role="radio" aria-checked={modo === 'estas'} onClick={() => { if (modo !== 'estas') onChange({ recetas: [] }); }} className={pildora(modo === 'estas')}>
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
              {elegidas.map(r => (
                <li key={r.id} className="flex items-center gap-2 rounded-control border border-hairline bg-bg py-1 pl-1 pr-2">
                  <div className="h-8 w-8 flex-shrink-0 overflow-hidden rounded-control bg-raised">
                    <FotoDeReceta src={r.foto} alt="" className="h-full w-full object-cover"
                      fallback={<div className="flex h-full w-full items-center justify-center"><Icon name="skillet" size="s" className="text-ink-3" /></div>} />
                  </div>
                  <span className="min-w-0 flex-1 truncate font-sans text-label text-ink">{r.nombre}</span>
                  {r.kcal ? <span className="flex-shrink-0 font-mono text-caption text-ink-3">{fmt(r.kcal)} kcal</span> : null}
                  <button type="button" aria-label={`Quitar ${r.nombre}`} onClick={() => onChange({ recetas: elegidas.filter(x => x.id !== r.id) })}
                    className="flex-shrink-0 text-ink-3 hover:text-ink"><Icon name="close" size="s" /></button>
                </li>
              ))}
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

function BloqueExtra({ sl, kcalIngesta, diasConDieta, onChange, onAbrir }: {
  sl: MealSlotSpec; kcalIngesta: number | null; diasConDieta: WeekDay[];
  onChange: (e: ExtraFijo | undefined) => void; onAbrir: () => void;
}) {
  const extra = sl.extra;
  if (!extra) {
    return (
      <div className="min-w-0 space-y-2">
        <p className={TITULILLO}>Extra fijo</p>
        <button type="button" onClick={onAbrir}
          className="flex w-full items-center justify-center gap-1.5 rounded-control border border-dashed border-strong px-3 py-2.5 font-sans text-caption font-bold text-ink-2 hover:text-ink">
          <Icon name="cookie" size="s" />Añadir postre o capricho
        </button>
        <p className="font-sans text-caption text-ink-3">Algo que lleva siempre además del plato, los días que tú digas. Se descuenta antes de elegir el plato.</p>
      </div>
    );
  }
  const kcal = kcalDeExtra(extra);
  const cantidad = extra.piezas ?? extra.gramos ?? 0;
  const paso = pasoDeExtra(extra);
  const ponerDias = (dias: WeekDay[] | undefined) => {
    const { dias: _fuera, ...resto } = extra;
    const validos = dias?.filter(d => diasConDieta.includes(d));
    onChange(validos && validos.length < diasConDieta.length ? { ...resto, dias: validos } : resto);
  };
  return (
    <div className="min-w-0 space-y-2">
      <p className={TITULILLO}>Extra fijo</p>
      <div className="space-y-3 rounded-surface border border-hairline bg-bg p-3">
        <div className="flex items-start gap-2">
          <Icon name="cookie" size="m" className="mt-0.5 flex-shrink-0 text-accent-ink" />
          <div className="min-w-0 flex-1">
            <p className="font-sans text-label font-bold leading-tight text-ink">{extra.nombre}</p>
            <p className="font-mono text-caption text-ink-2">{fmt(kcal)} kcal · {textoDeDias(extra.dias, diasConDieta).toLowerCase()}</p>
          </div>
          <button type="button" onClick={onAbrir} className="flex-shrink-0 font-sans text-caption font-bold text-ink-2 hover:text-ink">Cambiar</button>
          <button type="button" aria-label="Quitar el extra" onClick={() => onChange(undefined)} className="flex-shrink-0 text-ink-3 hover:text-ink"><Icon name="close" size="s" /></button>
        </div>

        <div className="flex items-center gap-2" role="group" aria-label="Cantidad">
          <button type="button" aria-label="Menos" onClick={() => onChange(conCantidad(extra, cantidad - paso))}
            className="flex h-8 w-8 items-center justify-center rounded-control border border-hairline bg-raised text-ink-2 hover:text-ink"><Icon name="remove" size="s" /></button>
          <span className="min-w-[88px] text-center font-mono text-label font-bold tabular-nums text-ink">
            {extra.piezas != null ? `${fmt(extra.piezas)} ${extra.unidad ?? 'ud'}` : `${fmt(extra.gramos ?? 0)} g`}
          </span>
          <button type="button" aria-label="Más" onClick={() => onChange(conCantidad(extra, cantidad + paso))}
            className="flex h-8 w-8 items-center justify-center rounded-control border border-hairline bg-raised text-ink-2 hover:text-ink"><Icon name="add" size="s" /></button>
        </div>

        <div className="space-y-1.5">
          <div className="flex gap-1" role="group" aria-label="Días que toca">
            {DIAS_SEMANA.map(d => {
              const conDieta = diasConDieta.includes(d);
              const toca = conDieta && tocaElDia(extra, d);
              return (
                <button key={d} type="button" aria-pressed={toca} aria-label={DIA_CORTO[d]} disabled={!conDieta}
                  onClick={() => onChange(conDiaAlternado(extra, d, diasConDieta))}
                  className={`h-8 w-8 rounded-full border font-mono text-caption font-bold disabled:opacity-30 ${toca ? 'border-accent bg-accent text-on-accent' : 'border-hairline text-ink-2 hover:border-strong'}`}>
                  {INICIAL_DE_DIA[d]}
                </button>
              );
            })}
          </div>
          <div className="flex gap-3 font-sans text-caption text-ink-2">
            <button type="button" className="hover:text-ink" onClick={() => ponerDias(undefined)}>Todos</button>
            <button type="button" className="hover:text-ink" onClick={() => ponerDias(ENTRE_SEMANA)}>Entre semana</button>
            <button type="button" className="hover:text-ink" onClick={() => ponerDias(FINDE)}>Fin de semana</button>
          </div>
        </div>

        {kcalIngesta != null && kcalIngesta > kcal && (
          <p className="font-sans text-caption text-ink-3">
            Esos días el plato baja de {fmt(kcalIngesta)} a {fmt(kcalIngesta - kcal)} kcal para que el día siga cuadrando.
          </p>
        )}
      </div>
    </div>
  );
}

/* ── Buscadores (van dentro del panel) ─────────────────────────────────────── */

const aRecetaDeIngesta = (r: Recipe): RecetaDeIngesta => {
  const foto = fotoDeReceta(r);
  return { id: r.id, nombre: r.name, kcal: Math.round(macrosDeReceta(r).kcal), ...(foto ? { foto } : {}) };
};

function BuscadorDeRecetas({ slot, elegidas, onAlternar }: {
  /** Franja de la comida. */
  slot: number;
  elegidas: RecetaDeIngesta[];
  onAlternar: (r: RecetaDeIngesta) => void;
}) {
  const { data: indice = [], isLoading } = useQuery({ queryKey: ['indiceRecetas'], queryFn: cargarIndiceRecetas, staleTime: Infinity });
  const [q, setQ] = useState('');
  const ids = new Set(elegidas.map(r => r.id));
  const lista = useMemo(
    () => indice.filter(r => esPlatoDelRecetario(r) && recipeMatchesSlot(r, slot) && coincideBusqueda(r.name, q)).slice(0, 40),
    [indice, slot, q],
  );
  return (
    <div className="space-y-2">
      <SearchField label="Buscar receta" placeholder="Buscar receta…" value={q} onChange={setQ} onCancel={() => setQ('')} />
      {isLoading ? (
        <p className="py-6 text-center font-sans text-caption text-ink-3">Cargando el recetario…</p>
      ) : lista.length === 0 ? (
        <p className="py-6 text-center font-sans text-caption text-ink-3">Ninguna receta con ese nombre para esta comida.</p>
      ) : (
        <ul className="space-y-0.5">
          {lista.map(r => {
            const dentro = ids.has(r.id);
            const kcal = Math.round(macrosDeReceta(r).kcal);
            return (
              <li key={r.id}>
                <button type="button" aria-pressed={dentro} onClick={() => onAlternar(aRecetaDeIngesta(r))}
                  className={`flex w-full items-center gap-3 rounded-control px-2 py-2 text-left transition-colors ${dentro ? 'bg-accent/10' : 'hover:bg-surface'}`}>
                  <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-control bg-surface">
                    <FotoDeReceta src={fotoDeReceta(r)} alt="" className="h-full w-full object-cover"
                      fallback={<div className="flex h-full w-full items-center justify-center"><Icon name="skillet" size="m" className="text-ink-3" /></div>} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-sans text-label text-ink">{r.name}</p>
                    <p className="font-mono text-caption text-ink-3">{kcal > 0 ? `${fmt(kcal)} kcal · ` : ''}{etiquetaDeTiempo(r)}</p>
                  </div>
                  <Icon name={dentro ? 'check_circle' : 'radio_button_unchecked'} size="m" filled={dentro} className={dentro ? 'text-accent-ink' : 'text-ink-3'} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const DULCES = /chocolate|helado|galleta|miel|mermelada|natillas|flan|cacao|turr[oó]n|bizcocho|gominola/i;

function BuscadorDeExtra({ catalogo, onElegir }: { catalogo: AlimentoCatalogo[]; onElegir: (e: ExtraFijo) => void }) {
  const [q, setQ] = useState('');
  const lista = useMemo(() => {
    const coinciden = catalogo.filter(a => coincideBusqueda(a.nombre, q));
    // Sin buscar nada, primero lo que suele ser un capricho: es a lo que se viene.
    const orden = q.trim() === '' ? [...coinciden].sort((a, b) => Number(DULCES.test(b.nombre)) - Number(DULCES.test(a.nombre))) : coinciden;
    return orden.slice(0, 40);
  }, [catalogo, q]);
  return (
    <div className="space-y-2">
      <SearchField label="Buscar alimento" placeholder="Chocolate, helado, galletas…" value={q} onChange={setQ} onCancel={() => setQ('')} />
      {lista.length === 0 ? (
        <p className="py-6 text-center font-sans text-caption text-ink-3">Ningún alimento con ese nombre en el catálogo.</p>
      ) : (
        <ul className="space-y-0.5">
          {lista.map(a => (
            <li key={a.id}>
              <button type="button" onClick={() => onElegir(extraDeAlimento(a))}
                className="flex w-full items-center gap-3 rounded-control px-2 py-2 text-left transition-colors hover:bg-surface">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-sans text-label text-ink">{nombreDeAlimento(a)}</p>
                  <p className="font-mono text-caption text-ink-3">
                    {fmt(Math.round(a.porCien.kcal))} kcal/100 g{a.unidad ? ` · 1 ${a.unidad.nombre} = ${fmt(a.unidad.gramos)} g` : ''}
                  </p>
                </div>
                <Icon name="add" size="m" className="text-ink-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
