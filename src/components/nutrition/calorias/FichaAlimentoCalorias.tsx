import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Sheet, Icon, Banner, Select } from '../../ui';
import { getProductoOff } from '../../../services/openFoodFacts';
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
export interface Racion { etiqueta: string; gramos: number }

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
  comidas: { id: string; nombre: string }[];
  mealId: string;
  textoBoton?: string;
  /** Solo al abrirla desde una fila del día: cambiar ese alimento por otro. */
  onCambiar?: () => void;
  onConfirm: (gramos: number, mealId: string) => void;
  onClose: () => void;
}

const fmt = (n: number) => (Math.round(n * 10) / 10).toLocaleString('es-ES');

/** Donut de kcal partido por energía de cada macro (4/4/9). */
export function DonutMacros({ kcal, p, hc, g, size = 96 }: { kcal: number; p: number; hc: number; g: number; size?: number }) {
  const total = hc * 4 + g * 9 + p * 4;
  const r = 42;
  const c = 2 * Math.PI * r;
  const tramos = total > 0
    ? [
      { v: (hc * 4) / total, color: 'var(--color-macro-hc)' },
      { v: (g * 9) / total, color: 'var(--color-macro-grasa)' },
      { v: (p * 4) / total, color: 'var(--color-macro-prot)' },
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
  nombre, marca, porCien, extrasPorCien, raciones, aproximado, nota, comidas, mealId: mealInicial, textoBoton = 'Añadir', onCambiar, onConfirm, onClose,
}: FichaProps) {
  const [racionIdx, setRacionIdx] = useState(0);
  const [numTexto, setNumTexto] = useState('1');
  const [mealId, setMealId] = useState(mealInicial);
  // Siempre cerrada al abrir la ficha (Dani, 26-10-2026).
  const [verTabla, setVerTabla] = useState(false);

  const racion = raciones[racionIdx] ?? raciones[0];
  const num = parseFloat(numTexto.replace(',', '.'));
  const gramos = racion && Number.isFinite(num) && num > 0 ? Math.round(racion.gramos * num * 10) / 10 : 0;
  const valido = gramos > 0 && gramos <= 5000;

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
                <span className="font-sans text-body font-bold text-ink">Información nutricional</span>
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
                      <div key={etq} className="flex justify-between gap-3 font-sans text-body">
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
          <p className="font-sans text-body-s text-ink-3">Escribe cuántas raciones para ver lo que aporta.</p>
        )}

        {/* Lo que se apunta, debajo de la información (Dani, 26-10-2026). */}
        <div className="space-y-3 border-t border-hairline pt-5">
          <div className="flex items-center justify-between gap-3">
            <span className="font-sans text-body text-ink">Ración</span>
            <Select
              className="w-52"
              value={String(racionIdx)}
              onChange={v => setRacionIdx(Number(v))}
              options={raciones.map((r, i) => ({ value: String(i), label: r.etiqueta }))}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="ficha-num" className="font-sans text-body text-ink">Nº de raciones</label>
            <input
              id="ficha-num"
              inputMode="decimal"
              value={numTexto}
              onChange={e => setNumTexto(e.target.value)}
              onFocus={e => e.target.select()}
              className="h-[54px] w-24 rounded-field border border-hairline bg-field px-4 text-right font-mono text-title-s text-ink focus:border-accent focus:outline-none"
            />
          </div>
          {comidas.length > 1 && (
            <div className="flex items-center justify-between gap-3">
              <span className="font-sans text-body text-ink">Comida</span>
              <Select
                className="w-52"
                value={mealId}
                onChange={setMealId}
                options={comidas.map(c => ({ value: c.id, label: c.nombre }))}
              />
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

/** Raciones de un producto: lo de la última vez, la ración declarada, 100 g y 1 g. */
export function racionesDe(opc: { ultimos?: number; racion?: number; unidad?: { nombre: string; gramos: number } }): Racion[] {
  const out: Racion[] = [];
  if (opc.ultimos && opc.ultimos > 0) out.push({ etiqueta: `${opc.ultimos} g (última vez)`, gramos: opc.ultimos });
  if (opc.unidad && opc.unidad.gramos > 0) out.push({ etiqueta: `1 ${opc.unidad.nombre} (${opc.unidad.gramos} g)`, gramos: opc.unidad.gramos });
  else if (opc.racion && opc.racion > 0) out.push({ etiqueta: `1 ración (${opc.racion} g)`, gramos: opc.racion });
  out.push({ etiqueta: '100 g', gramos: 100 });
  out.push({ etiqueta: '1 g', gramos: 1 });
  return out;
}

/** La ficha de un producto de supermercado: se descarga y, si está completo, se enseña. */
export function FichaProductoOff({ codigo, nombre, marca, ultimos, onIncompleto, ...resto }: Omit<FichaProps, 'porCien' | 'raciones' | 'nombre'> & {
  codigo: string; nombre: string; ultimos?: number; onIncompleto?: (p: { n: string; c: string }) => void;
}) {
  const { data, isPending, isError } = useQuery({ queryKey: ['offProducto', codigo], queryFn: () => getProductoOff(codigo), staleTime: Infinity });
  if (data && !esIncompleto(data)) {
    return (
      <FichaAlimentoCalorias
        {...resto}
        nombre={data.n || nombre}
        marca={data.b || marca}
        porCien={{ kcal: data.k, p: data.p, hc: data.h, g: data.g }}
        extrasPorCien={{ f: data.f, az: data.az, sat: data.sat, sal: data.sal }}
        raciones={racionesDe({ ultimos, racion: data.s })}
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
