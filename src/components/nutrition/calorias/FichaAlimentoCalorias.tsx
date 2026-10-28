import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Sheet, Icon, Banner } from '../../ui';
import { resolverProducto } from '../../../services/openFoodFacts';
import { esIncompleto, motivoDeIncompleto } from '../../../utils/productoOff';
import { nutrientesDeRacion } from '../../../utils/productoAIntercambios';

/* ═══════════════════════════════════════════════════════════════════════════
   Ficha de un alimento en «Calorías y macros» (Dani, 25-10-2026)

   Calcada de la que enseñó Dani (la del «Protein crunchy»): nombre y ✓ arriba;
   ración, número de raciones y comida en tres filas; un donut con las kcal y el
   reparto de hidratos, grasa y proteína; y la tabla de información nutricional
   plegable. Sirve para cualquier origen (banco, propio, catálogo por 100 g,
   supermercado): quien la abre la alimenta con sus valores por 100 g.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface PorCien { kcal: number; p: number; hc: number; g: number }
export interface ExtrasPorCien { f?: number; az?: number; sat?: number; sal?: number }
export interface Racion {
  etiqueta: string;
  gramos: number;
  /** La ración del alimento (su unidad o su ración de referencia): sale marcada. */
  recomendada?: boolean;
  /** Rótulo pequeño encima de la cantidad («Última vez», «Apuntado»). */
  nota?: string;
  /** De dónde sale la ración recomendada: la que fijó el atleta, la del
   *  producto (unidad o etiqueta) o, sin ninguna, lo de la última vez. */
  origen?: 'propia' | 'producto' | 'ultima';
}

export interface FichaProps {
  nombre: string;
  marca?: string;
  porCien: PorCien;
  extrasPorCien?: ExtrasPorCien;
  /** La primera es la que sale elegida. */
  raciones: Racion[];
  /** Los valores salen de intercambios del banco, no de una etiqueta. */
  aproximado?: boolean;
  nota?: string;
  /** Ya no se pinta (28-10-2026: no hay selector de comida en la ficha); se
   *  acepta para no tocar a quien la abre. */
  comidas?: { id: string; nombre: string }[];
  mealId: string;
  textoBoton?: string;
  /** Solo al abrirla desde una fila del día: cambiar ese alimento por otro. */
  onCambiar?: () => void;
  /** Guardar «1 ración = X g» para este alimento (null = volver a la del producto). */
  onGuardarRacion?: (gramos: number | null) => void;
  onConfirm: (gramos: number, mealId: string) => void;
  onClose: () => void;
}

const fmt = (n: number) => (Math.round(n * 10) / 10).toLocaleString('es-ES');
/** Para los campos: hasta dos decimales, con coma y sin ceros de más («1,5»). */
const numTexto = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

/** Donut de kcal partido por energía de cada macro (4/4/9). */
export function DonutMacros({ kcal, p, hc, g, size = 96 }: { kcal: number; p: number; hc: number; g: number; size?: number }) {
  const total = hc * 4 + g * 9 + p * 4;
  const r = 42;
  const c = 2 * Math.PI * r;
  const tramos = total > 0
    ? [
      { v: (hc * 4) / total, color: 'var(--color-macro-hc-fill)' },
      { v: (g * 9) / total, color: 'var(--color-macro-grasa-fill)' },
      { v: (p * 4) / total, color: 'var(--color-macro-prot-fill)' },
    ]
    : [];
  let acumulado = 0;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={`${Math.round(kcal)} kilocalorías`}>
      <circle cx="50" cy="50" r={r} fill="none" stroke="var(--color-hairline)" strokeWidth="9" />
      {tramos.map((t, i) => {
        const largo = Math.max(0, t.v * c - (t.v > 0.02 ? 2 : 0));
        const el = (
          <circle
            key={i}
            cx="50" cy="50" r={r} fill="none" stroke={t.color} strokeWidth="9"
            strokeDasharray={`${largo} ${c - largo}`}
            strokeDashoffset={-acumulado * c}
            transform="rotate(-90 50 50)"
            style={{ transition: 'stroke-dasharray var(--duration-bar) var(--ease-brand), stroke-dashoffset var(--duration-bar) var(--ease-brand)' }}
          />
        );
        acumulado += t.v;
        return el;
      })}
      <text x="50" y="49" textAnchor="middle" className="font-mono" style={{ fontSize: 20, fontWeight: 700, fill: 'var(--color-ink)' }}>{Math.round(kcal)}</text>
      <text x="50" y="66" textAnchor="middle" className="font-sans" style={{ fontSize: 11, fill: 'var(--color-ink-2)' }}>kcal</text>
    </svg>
  );
}

export default function FichaAlimentoCalorias({
  nombre, marca, porCien, extrasPorCien, raciones, aproximado, nota, mealId: mealInicial, textoBoton = 'Añadir', onCambiar, onGuardarRacion, onConfirm, onClose,
}: FichaProps) {
  /* Cantidad (Dani, 28-10-2026): los gramos de manera libre; si el producto
     tiene ración, cuánto es una ración y el número de raciones para
     escribirlo; y lo que comiste la última vez. Nada más: sin 100 g, sin
     «Otra cantidad» y sin selector de comida. */
  const racionInicial = raciones.find(r => r.recomendada);
  /** La ración vigente: la de las props o la que el atleta acaba de fijar aquí. */
  const [racionFijada, setRacionFijada] = useState<number | null>(null);
  const racionRef = racionFijada != null ? { ...racionInicial, gramos: racionFijada, origen: 'propia' as const } : racionInicial;
  const [editandoRacion, setEditandoRacion] = useState(false);
  const [racionTexto, setRacionTexto] = useState('');
  const [gramosTexto, setGramosTexto] = useState(() => (raciones[0] ? numTexto(raciones[0].gramos) : ''));
  const [racionesTexto, setRacionesTexto] = useState(() =>
    (racionRef && raciones[0] ? numTexto(raciones[0].gramos / racionRef.gramos) : ''));
  // Sin selector de comida (Dani, 28-10-2026): va a la comida desde la que se abrió.
  const [mealId] = useState(mealInicial);
  // Siempre cerrada al abrir la ficha (Dani, 26-10-2026).
  const [verTabla, setVerTabla] = useState(false);

  const leido = parseFloat(gramosTexto.replace(',', '.'));
  const gramos = Number.isFinite(leido) && leido > 0 ? Math.round(leido * 10) / 10 : 0;
  const valido = gramos > 0 && gramos <= 5000;

  // Gramos y raciones van enlazados: 2 raciones de 40 g son 80 g, y 60 g son 1,5.
  const cambiarGramos = (texto: string) => {
    setGramosTexto(texto);
    if (!racionRef) return;
    const g = parseFloat(texto.replace(',', '.'));
    setRacionesTexto(Number.isFinite(g) && g > 0 ? numTexto(g / racionRef.gramos) : '');
  };
  const cambiarRaciones = (texto: string) => {
    setRacionesTexto(texto);
    const n = parseFloat(texto.replace(',', '.'));
    if (racionRef && Number.isFinite(n) && n > 0) setGramosTexto(numTexto(n * racionRef.gramos));
  };
  // La ración ya se ve en su campo; de atajo queda lo de la última vez.
  const atajos = raciones.filter(r => !r.recomendada && r.gramos !== racionRef?.gramos);

  const guardarRacion = () => {
    const g = Math.round(parseFloat(racionTexto.replace(',', '.')) * 10) / 10;
    setEditandoRacion(false);
    if (!Number.isFinite(g) || g <= 0 || g > 5000) return;
    setRacionFijada(g);
    onGuardarRacion?.(g);
    // Las raciones escritas se mantienen; cambian los gramos que suponen.
    const n = parseFloat(racionesTexto.replace(',', '.'));
    setGramosTexto(numTexto((Number.isFinite(n) && n > 0 ? n : 1) * g));
    if (!(Number.isFinite(n) && n > 0)) setRacionesTexto('1');
  };

  const n = useMemo(() => (valido ? nutrientesDeRacion(porCien, gramos) : null), [porCien, gramos, valido]);
  const f = gramos / 100;
  const extra = (v?: number) => (v === undefined ? undefined : Math.round(v * f * 10) / 10);
  const energiaTotal = n ? n.hc * 4 + n.g * 9 + n.p * 4 : 0;
  const pct = (v: number) => (energiaTotal > 0 ? Math.round((v / energiaTotal) * 100) : 0);

  const confirmar = () => { if (valido && n) onConfirm(gramos, mealId); };

  const filas: [string, number | undefined, string][] = n ? [
    ['Calorías', n.kcal, ''],
    ['Proteína', n.p, 'g'],
    ['Hidratos', n.hc, 'g'],
    ['Grasa', n.g, 'g'],
    ['Fibra', extra(extrasPorCien?.f), 'g'],
    ['Azúcares', extra(extrasPorCien?.az), 'g'],
    ['Grasa saturada', extra(extrasPorCien?.sat), 'g'],
    ['Sal', extra(extrasPorCien?.sal), 'g'],
  ] : [];

  return (
    <Sheet open onClose={onClose} label={nombre} size="m">
      <div className="space-y-5 pb-4">
        <div className="flex items-start gap-3 pt-1">
          <div className="min-w-0 flex-1">
            <h2 className="font-sans text-title-m font-bold leading-tight text-ink">{nombre}</h2>
            {marca && <p className="mt-0.5 font-sans text-body-s text-ink-2">{marca}</p>}
          </div>
          <button
            type="button"
            onClick={confirmar}
            disabled={!valido || !n}
            aria-label={textoBoton}
            className="-mr-1 flex h-11 w-11 flex-none items-center justify-center rounded-full text-accent-ink transition-colors hover:bg-accent-bg disabled:opacity-30"
          >
            <Icon name="check" size="l" />
          </button>
        </div>

        {n ? (
          <>
            <div className="flex items-center gap-4">
              <DonutMacros kcal={n.kcal} p={n.p} hc={n.hc} g={n.g} />
              <div className="grid flex-1 grid-cols-3 gap-2 text-center">
                {([
                  ['Hidratos', n.hc, n.hc * 4, 'var(--color-macro-hc)'],
                  ['Grasa', n.g, n.g * 9, 'var(--color-macro-grasa)'],
                  ['Proteína', n.p, n.p * 4, 'var(--color-macro-prot)'],
                ] as const).map(([etq, gr, kc, color]) => (
                  <div key={etq}>
                    <span className="block font-mono text-label font-bold" style={{ color }}>{pct(kc)}%</span>
                    <span className="block font-mono text-title-s font-bold text-ink">{fmt(gr)} g</span>
                    <span className="block font-sans text-caption text-ink-2">{etq}</span>
                  </div>
                ))}
              </div>
            </div>
            {aproximado && (
              <p className="font-sans text-caption text-ink-3">Valores aproximados: este alimento del banco se cuenta por su equivalencia.</p>
            )}

            <div className="border-t border-hairline pt-4">
              <button type="button" onClick={() => setVerTabla(v => !v)} aria-expanded={verTabla} className="flex w-full items-center justify-between">
                <span className="font-sans text-body-s font-semibold text-ink">Información nutricional</span>
                <span className="flex items-center gap-1 font-sans text-body-s text-accent-ink">
                  {verTabla ? 'Ocultar' : 'Ver'}
                  <Icon name="expand_more" size="s" className={`transition-transform duration-(--duration-base) ease-(--ease-brand) motion-reduce:transition-none ${verTabla ? 'rotate-180' : ''}`} />
                </span>
              </button>
              {/* Se despliega animando la altura (grid 0fr → 1fr) y la hoja,
                  que mide lo que su contenido, crece con ella. */}
              <div
                className={`grid transition-[grid-template-rows,opacity] duration-(--duration-slide) ease-(--ease-brand) motion-reduce:transition-none ${verTabla ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
                aria-hidden={!verTabla}
              >
                <div className="overflow-hidden">
                  <dl className="space-y-2 pt-3">
                    {filas.map(([etq, v, u]) => (
                      <div key={etq} className="flex justify-between gap-3 font-sans text-body-s">
                        <dt className="text-ink">{etq}</dt>
                        <dd className="font-mono text-ink-2">{v === undefined ? <span className="text-ink-3">—</span> : `${fmt(v)}${u ? ` ${u}` : ''}`}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>
            </div>
          </>
        ) : (
          <p className="font-sans text-body-s text-ink-3">Escribe los gramos para ver lo que aporta.</p>
        )}

        {/* Lo que se apunta, debajo de la información (Dani, 26-10-2026). */}
        <div className="space-y-3 border-t border-hairline pt-5">
          <span className="block font-sans text-body-s font-semibold text-ink">Cantidad</span>
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <label htmlFor="ficha-gramos" className="mb-1.5 block font-sans text-caption text-ink-2">Gramos</label>
              <div className="relative">
                <input
                  id="ficha-gramos"
                  inputMode="decimal"
                  value={gramosTexto}
                  onChange={e => cambiarGramos(e.target.value)}
                  onFocus={e => e.target.select()}
                  autoFocus={!raciones.length}
                  placeholder="0"
                  className="h-[54px] w-full rounded-field border border-control-line bg-field pl-4 pr-10 font-mono text-title-s text-ink focus:border-accent focus:outline-none"
                />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 font-mono text-body-s text-ink-3">g</span>
              </div>
            </div>
            {racionRef && (
              <div className="w-[52%] flex-none">
                {editandoRacion ? (
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <label htmlFor="ficha-racion-g" className="font-sans text-caption text-ink-2">1 ración =</label>
                    <input
                      id="ficha-racion-g"
                      inputMode="decimal"
                      autoFocus
                      value={racionTexto}
                      onChange={e => setRacionTexto(e.target.value)}
                      // Sale seleccionado: se escribe encima, no detrás («40» + «37,6»).
                      onFocus={e => e.target.select()}
                      onKeyDown={e => { if (e.key === 'Enter') guardarRacion(); if (e.key === 'Escape') setEditandoRacion(false); }}
                      onBlur={guardarRacion}
                      className="h-7 w-16 rounded-control border border-accent bg-field px-2 text-right font-mono text-caption text-ink focus:outline-none"
                    />
                    <span className="font-sans text-caption text-ink-2">g</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setRacionTexto(numTexto(racionRef.gramos)); setEditandoRacion(true); }}
                    className="mb-1.5 flex items-center gap-1 whitespace-nowrap font-sans text-caption text-ink-2 hover:text-accent-ink"
                    aria-label={`Cambiar cuánto es una ración, ahora ${fmt(racionRef.gramos)} gramos`}
                  >
                    1 ración = {fmt(racionRef.gramos)} g
                    <Icon name="edit" size="s" className="text-accent-ink" />
                  </button>
                )}
                <input
                  id="ficha-raciones"
                  aria-label="Número de raciones"
                  inputMode="decimal"
                  value={racionesTexto}
                  onChange={e => cambiarRaciones(e.target.value)}
                  onFocus={e => e.target.select()}
                  className="h-[54px] w-full rounded-field border border-control-line bg-field px-4 text-right font-mono text-title-s text-ink focus:border-accent focus:outline-none"
                />
                {racionRef.origen === 'ultima' && (
                  <p className="mt-1 font-sans text-caption text-ink-3">Lo de la última vez</p>
                )}
              </div>
            )}
          </div>
          {/* Atajo: lo de la última vez. */}
          {atajos.length > 0 && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Atajos de cantidad">
              {atajos.map((r, i) => {
                const elegida = gramos === r.gramos;
                return (
                  <button
                    key={`${r.etiqueta}_${i}`}
                    type="button"
                    aria-pressed={elegida}
                    onClick={() => cambiarGramos(numTexto(r.gramos))}
                    className={`flex min-h-11 flex-col items-start justify-center gap-0.5 rounded-surface border px-3.5 py-2 text-left font-sans transition-colors duration-(--duration-state) ${elegida ? 'bg-accent border-accent-press text-on-accent' : 'border-hairline bg-field hover:border-accent/40'}`}
                  >
                    {r.nota ? (
                      <span className={`font-mono text-caption font-semibold uppercase tracking-wider ${elegida ? 'text-on-accent' : 'text-ink-3'}`}>{r.nota}</span>
                    ) : null}
                    <span className={`text-body-s font-semibold ${elegida ? 'text-on-accent' : 'text-ink'}`}>{r.etiqueta}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {nota && <p className="font-sans text-caption text-ink-3">{nota}</p>}

        {onCambiar && (
          <button
            type="button"
            onClick={onCambiar}
            className="flex w-full items-center justify-center gap-2 rounded-surface border border-hairline py-3.5 font-sans text-body-s font-bold text-ink-2 hover:border-accent/50 hover:text-accent-ink"
          >
            <Icon name="swap_horiz" size="s" />
            Cambiar por otro alimento
          </button>
        )}
      </div>
    </Sheet>
  );
}

/** Atajos de un producto. La ración, por este orden: la que fijó el atleta,
 *  la del producto (su unidad o la ración de la etiqueta) y, si no tiene,
 *  lo de la última vez (Dani, 28-10-2026: «si no tiene ración, que la ración
 *  sea lo último consumido»). Lo de la última vez sale además como atajo si
 *  es otra cantidad. Sin «100 g»: los gramos se escriben a mano. El primero
 *  es el que sale puesto. */
export function racionesDe(opc: { ultimos?: number; racion?: number; unidad?: { nombre: string; gramos: number }; propia?: number }): Racion[] {
  const out: Racion[] = [];
  if (opc.propia && opc.propia > 0) out.push({ etiqueta: `1 ración · ${fmt(opc.propia)} g`, gramos: opc.propia, recomendada: true, origen: 'propia' });
  else if (opc.unidad && opc.unidad.gramos > 0) out.push({ etiqueta: `1 ${opc.unidad.nombre} · ${opc.unidad.gramos} g`, gramos: opc.unidad.gramos, recomendada: true, origen: 'producto' });
  else if (opc.racion && opc.racion > 0) out.push({ etiqueta: `1 ración · ${opc.racion} g`, gramos: opc.racion, recomendada: true, origen: 'producto' });
  else if (opc.ultimos && opc.ultimos > 0) out.push({ etiqueta: `1 ración · ${fmt(opc.ultimos)} g`, gramos: opc.ultimos, recomendada: true, origen: 'ultima' });
  // La última vez, solo si no es ya la ración: dos iguales confunden.
  if (opc.ultimos && opc.ultimos > 0 && !out.some(r => r.gramos === opc.ultimos)) out.push({ etiqueta: `${fmt(opc.ultimos)} g`, gramos: opc.ultimos, nota: 'Última vez' });
  return out;
}

/** La ficha de un producto de supermercado: se descarga y, si está completo, se enseña. */
export function FichaProductoOff({ codigo, nombre, marca, ultimos, racionPropia, onIncompleto, ...resto }: Omit<FichaProps, 'porCien' | 'raciones' | 'nombre'> & {
  codigo: string; nombre: string; ultimos?: number; racionPropia?: number; onIncompleto?: (p: { n: string; c: string }) => void;
}) {
  const { data, isPending, isError } = useQuery({ queryKey: ['offProducto', codigo], queryFn: () => resolverProducto(codigo), staleTime: Infinity });
  if (data && !esIncompleto(data)) {
    return (
      <FichaAlimentoCalorias
        {...resto}
        nombre={data.n || nombre}
        marca={data.b || marca}
        porCien={{ kcal: data.k, p: data.p, hc: data.h, g: data.g }}
        extrasPorCien={{ f: data.f, az: data.az, sat: data.sat, sal: data.sal }}
        raciones={racionesDe({ ultimos, racion: data.s, propia: racionPropia })}
      />
    );
  }
  return (
    <Sheet open onClose={resto.onClose} title={nombre}>
      <div className="space-y-4 pt-2">
        {isPending && <p className="font-sans text-body-s text-ink-3">Cargando producto…</p>}
        {data && esIncompleto(data) && (
          <>
            <Banner tone="info">{motivoDeIncompleto(data)} Complétalo desde la etiqueta para poder apuntarlo.</Banner>
            {onIncompleto && (
              <button type="button" onClick={() => onIncompleto(data)} className="font-sans text-body-s font-bold text-accent-ink">
                Completar desde la etiqueta
              </button>
            )}
          </>
        )}
        {(isError || (!isPending && !data)) && (
          <Banner tone="danger">No se han podido cargar los datos de este producto. Comprueba la conexión o créalo desde su etiqueta.</Banner>
        )}
      </div>
    </Sheet>
  );
}
