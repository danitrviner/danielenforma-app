import React, { useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { MuscleGroup, MUSCLE_LABELS, MUSCLE_ORDER } from '../types';
import {
  SerieDeAgujetas, fechasDeMedicion, gruposMasCargados, ultimasMediciones,
} from '../utils/agujetasConjuntas';
import {
  ALTURA_GRAFICA, MARGEN_GRAFICA, ANCHO_EJE_Y, REJILLA_GRAFICA, TICK_GRAFICA, EJE_GRAFICA,
} from './ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Agujetas de todos los grupos juntas (vista del coach)

   Una línea por grupo en la MISMA gráfica, con leyenda que se enciende y se
   apaga, y una ventana de «últimas N mediciones» para ver de dónde viene el
   atleta y hacia dónde va. Al abrir solo salen los grupos con más agujetas
   ahora: catorce líneas a la vez no se leen.
   ═══════════════════════════════════════════════════════════════════════════ */

const VENTANAS: { n: number; label: string }[] = [
  { n: 4, label: '4' },
  { n: 10, label: '10' },
  { n: 20, label: '20' },
  { n: 0, label: 'Todas' },
];
const VISIBLES_AL_ABRIR = 5;
// 5 colores de serie × 3 trazos = 15 combinaciones distintas (hay 14 grupos).
const TRAZOS = ['0', '6 3', '2 3'] as const;

function estiloDe(grupo: MuscleGroup) {
  const i = MUSCLE_ORDER.indexOf(grupo);
  return { color: `var(--color-chart-${(i % 5) + 1})`, trazo: TRAZOS[Math.floor(i / 5) % TRAZOS.length] };
}

function fmtFecha(fecha: string): string {
  return new Date(fecha + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

interface Props {
  series: SerieDeAgujetas[];
}

export default function AgujetasConjuntasChart({ series }: Props) {
  const [ventana, setVentana] = useState(10);
  const [elegidos, setElegidos] = useState<Set<MuscleGroup> | null>(null);

  const enVentana = useMemo(() => ultimasMediciones(series, ventana), [series, ventana]);
  const visibles = useMemo(
    () => elegidos ?? new Set(gruposMasCargados(series, VISIBLES_AL_ABRIR)),
    [elegidos, series],
  );

  const filas = useMemo(() => {
    const porFecha = new Map<string, Record<string, number | string>>();
    for (const f of fechasDeMedicion(enVentana)) porFecha.set(f, { date: f });
    for (const s of enVentana) for (const p of s.puntos) porFecha.get(p.date)![s.grupo] = p.value;
    return [...porFecha.values()];
  }, [enVentana]);

  const totalMediciones = useMemo(() => fechasDeMedicion(series).length, [series]);

  const alternar = (g: MuscleGroup) => {
    const siguiente = new Set(visibles);
    if (siguiente.has(g)) siguiente.delete(g); else siguiente.add(g);
    setElegidos(siguiente);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-caption text-ink-2">
          {filas.length} de {totalMediciones} {totalMediciones === 1 ? 'medición' : 'mediciones'}
        </p>
        <div role="group" aria-label="Cuántas mediciones ver" className="flex bg-surface border border-hairline rounded-surface">
          {VENTANAS.map(v => (
            <button
              key={v.label}
              type="button"
              onClick={() => setVentana(v.n)}
              aria-pressed={ventana === v.n}
              className={`px-3 min-h-[44px] rounded-control font-sans text-caption uppercase font-bold transition-all ${
                ventana === v.n ? 'bg-accent text-on-accent shadow' : 'text-ink-2 hover:text-ink'
              }`}
            >{v.label}</button>
          ))}
        </div>
      </div>

      <div role="img" aria-label="Agujetas por grupo muscular a lo largo de las mediciones">
        <ResponsiveContainer width="100%" height={ALTURA_GRAFICA.l}>
          <LineChart data={filas} margin={MARGEN_GRAFICA}>
            <CartesianGrid {...REJILLA_GRAFICA} />
            <XAxis dataKey="date" tickFormatter={fmtFecha} tick={TICK_GRAFICA} {...EJE_GRAFICA} minTickGap={32} />
            <YAxis domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} tick={TICK_GRAFICA} {...EJE_GRAFICA} width={ANCHO_EJE_Y} />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const filasTooltip = [...payload].sort((a, b) => Number(b.value) - Number(a.value));
                return (
                  <div className="bg-raised border border-hairline rounded-surface px-3 py-2 text-label font-mono shadow-e1">
                    <p className="text-ink-2">{fmtFecha(String(label))}</p>
                    {filasTooltip.map(p => (
                      <p key={String(p.dataKey)} className="flex items-center gap-2 text-ink">
                        <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
                        {MUSCLE_LABELS[p.dataKey as MuscleGroup]}
                        <span className="ml-auto font-bold">{p.value}</span>
                      </p>
                    ))}
                  </div>
                );
              }}
            />
            {series.filter(s => visibles.has(s.grupo)).map(s => {
              const { color, trazo } = estiloDe(s.grupo);
              return (
                <Line
                  key={s.grupo}
                  type="monotone"
                  dataKey={s.grupo}
                  stroke={color}
                  strokeWidth={2}
                  strokeDasharray={trazo}
                  connectNulls
                  dot={{ r: 2.5, fill: color, stroke: 'var(--color-bg)', strokeWidth: 1 }}
                  activeDot={{ r: 4.5 }}
                  isAnimationActive={false}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <ul className="m-0 p-0 list-none flex flex-wrap gap-1.5" aria-label="Grupos musculares">
        {series.map(s => {
          const { color, trazo } = estiloDe(s.grupo);
          const on = visibles.has(s.grupo);
          return (
            <li key={s.grupo}>
              <button
                type="button"
                onClick={() => alternar(s.grupo)}
                aria-pressed={on}
                className={`flex items-center gap-1.5 min-h-[32px] px-2.5 rounded-chip border font-sans text-caption transition-colors ${
                  on ? 'border-strong text-ink bg-raised' : 'border-hairline text-ink-3 hover:text-ink-2'
                }`}
              >
                <svg width="16" height="6" aria-hidden className="flex-shrink-0">
                  <line x1="0" y1="3" x2="16" y2="3" stroke={on ? color : 'currentColor'} strokeWidth="2" strokeDasharray={trazo} />
                </svg>
                {MUSCLE_LABELS[s.grupo]}
                <span className="font-mono text-ink-3">{s.ultimo}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
