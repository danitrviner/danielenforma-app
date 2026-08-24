import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { Mesocycle, MuscleGroup, MUSCLE_ORDER, MUSCLE_LABELS_SHORT } from '../types';
import { getWorkoutAssignmentsByMesocycleIds } from '../dbService';
import { adherenciaDeMesociclo } from '../utils/adherence';
import {
  Icon, EmptyState, SegmentedControl,
  ALTURA_GRAFICA, MARGEN_GRAFICA, ANCHO_EJE_Y, REJILLA_GRAFICA, TICK_GRAFICA, EJE_GRAFICA,
  TOOLTIP_GRAFICA,
} from './ui';

// ── Constants ─────────────────────────────────────────────────────────────────

const MUSCLE_GROUPS: MuscleGroup[] = MUSCLE_ORDER;
const MUSCLE_LABELS: Record<MuscleGroup, string> = MUSCLE_LABELS_SHORT;

const PALETTE = [
  'var(--color-accent)', 'var(--color-data)', 'var(--color-danger)', 'var(--color-warning)', 'var(--color-chart-3)',
  'var(--color-success)', 'var(--color-danger)', 'var(--color-warning)', 'var(--color-success)', 'var(--color-warning)',
  'var(--color-info)', 'var(--color-chart-3)', 'var(--color-success)', 'var(--color-warning)',
];

const GROUP_COLOR: Record<MuscleGroup, string> = Object.fromEntries(
  MUSCLE_GROUPS.map((g, i) => [g, PALETTE[i % PALETTE.length]])
) as Record<MuscleGroup, string>;

// ── Recharts shared style ─────────────────────────────────────────────────────

/* F10: TOOLTIP_STYLE y AXIS_TICK vivían aquí. Eran los más trabajados de los
   cuatro tratamientos que había en la app, así que son la base de
   `TOOLTIP_GRAFICA` y `TICK_GRAFICA` en `ui/chart.ts`. */

// ── Helper: empty chart placeholder ──────────────────────────────────────────

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="h-36 flex items-center justify-center border border-dashed border-hairline rounded-surface">
      <p className="font-sans text-label text-ink-2">{message}</p>
    </div>
  );
}

// ── Helper: chart card wrapper ────────────────────────────────────────────────

function ChartCard({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-hairline rounded-surface p-4 space-y-3">
      <p className="font-sans font-bold text-white text-body-s flex items-center gap-2">
        <Icon name={icon} size="s" className="text-accent" />
        {title}
      </p>
      {children}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  mesocycles: Mesocycle[];
  athleteEmail: string;
}

export default function MesocycleDashboard({ mesocycles, athleteEmail }: Props) {
  const mesoIds = useMemo(() => mesocycles.map(m => m.id), [mesocycles]);
  // query by mesocycleId — avoids UID vs email mismatch
  const { data: assignments = [], isPending: loading } = useQuery({
    queryKey: ['workoutAssignmentsByMesocycleIds', mesoIds],
    queryFn: () => getWorkoutAssignmentsByMesocycleIds(mesoIds),
    enabled: !!athleteEmail && mesoIds.length > 0,
  });
  const loadState: 'loading' | 'done' = loading ? 'loading' : 'done';

  // Group-filter state for Chart 2
  const [hiddenGroups, setHiddenGroups] = useState<Set<MuscleGroup>>(new Set());

  // Rastreo móvil 17-08, a petición de Dani: las 3 gráficas de este
  // dashboard vivían apiladas por separado; ahora comparten una sola
  // tarjeta con un selector para verlas de una en una. Mismo patrón a
  // extender más adelante al resto de pantallas con varias gráficas — hoy
  // solo se aplica aquí, que es la pantalla que pidió.
  const [chartView, setChartView] = useState<'series' | 'adherencia' | 'grupo'>('series');
  const CHART_VIEW_META: Record<typeof chartView, { label: string; icon: string; title: string }> = {
    series:     { label: 'Series',    icon: 'bar_chart',     title: 'Series totales programadas' },
    adherencia: { label: 'Adherencia', icon: 'task_alt',      title: 'Adherencia por mesociclo' },
    grupo:      { label: 'Por grupo', icon: 'fitness_center', title: 'Series semanales por grupo muscular' },
  };

  // ── Sorted mesocycles ──────────────────────────────────────────────────────
  const sorted = useMemo(
    () => [...mesocycles].sort((a, b) => a.number - b.number),
    [mesocycles]
  );

  // ── Chart 1: Total series por mesociclo (from definition) ─────────────────
  const totalSeriesData = useMemo(() => sorted.map(m => ({
    label: `#${m.number}`,
    series: MUSCLE_GROUPS.reduce((s, g) => s + (m.groups[g]?.series ?? 0), 0),
  })), [sorted]);

  // ── Chart 2: Series por grupo muscular ─────────────────────────────────────
  const activeGroups = useMemo(() =>
    MUSCLE_GROUPS.filter(g => sorted.some(m => (m.groups[g]?.series ?? 0) > 0)),
    [sorted]
  );

  const groupSeriesData = useMemo(() => sorted.map(m => {
    const point: Record<string, string | number> = { label: `#${m.number}` };
    activeGroups.forEach(g => { point[g] = m.groups[g]?.series ?? 0; });
    return point;
  }), [sorted, activeGroups]);

  const visibleGroups = activeGroups.filter(g => !hiddenGroups.has(g));

  // ── Chart 5: Adherencia por mesociclo ─────────────────────────────────────
  const adherenceData = useMemo(() => {
    const byMeso: Record<string, { total: number; completed: number }> = {};
    for (const m of sorted) byMeso[m.id] = { total: 0, completed: 0 };
    for (const a of assignments) {
      if (!a.mesocycleId || !(a.mesocycleId in byMeso)) continue;
      byMeso[a.mesocycleId].total++;
      if (a.status === 'completed') byMeso[a.mesocycleId].completed++;
    }
    return sorted.map(m => {
      const { total, completed } = byMeso[m.id] ?? { total: 0, completed: 0 };
      return {
        label: `#${m.number}`,
        // El % sale de la función compartida (utils/adherence), no de una
        // división repetida aquí: es la misma cifra que enseñan el panel de
        // entrenamientos, el cierre de mesociclo y el sugeridor de volumen.
        adherencia: adherenciaDeMesociclo(assignments, m.id),
        total,
        completed,
      };
    });
  }, [sorted, assignments]);

  const hasAdherence = adherenceData.some(d => d.total > 0);

  // ── Guard ─────────────────────────────────────────────────────────────────
  if (sorted.length === 0) {
    return (
      <div className="border border-dashed border-hairline rounded-surface">
        {/* Este dashboard vive arriba del todo en la pestaña Entrenamientos; la
            creación de mesociclos está más abajo (MesocycleManager) — sin esta
            pista el estado vacío no dice qué hacer ni dónde ir. */}
        <EmptyState icon="bar_chart" title="Sin mesociclos para mostrar." description="Créalo más abajo, en la sección de macrociclos." />
      </div>
    );
  }

  // KPI hero — la cifra grande de la pantalla 01 del mockup de Fase 3: el
  // último mesociclo y su delta frente al anterior, coherente con lo que ya
  // pinta el gráfico "Series" debajo (misma fuente de datos, sin recalcular).
  const lastPoint = totalSeriesData[totalSeriesData.length - 1];
  const prevPoint  = totalSeriesData[totalSeriesData.length - 2];
  const kpiDelta = prevPoint ? lastPoint.series - prevPoint.series : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-sans font-bold text-white text-title-s flex items-center gap-2">
          <Icon name="dashboard" size="m" className="text-accent" />
          Dashboard · {sorted.length} meso{sorted.length !== 1 ? 's' : ''}
        </h3>
        {loadState === 'loading' && (
          <span className="font-sans text-caption text-ink-2 animate-pulse">Cargando datos…</span>
        )}
      </div>

      {lastPoint && (
        <div className="flex flex-col gap-1">
          <span className="font-mono text-caption text-ink-2 uppercase tracking-[.1em]">
            Series semanales · meso {lastPoint.label}
          </span>
          <div className="flex items-baseline gap-2">
            <span className="font-mono font-semibold text-hero text-ink tabular-nums">{lastPoint.series}</span>
            {kpiDelta !== null && (
              <span className={`font-mono text-label font-bold rounded-full px-2 py-0.5 border ${
                kpiDelta > 0 ? 'text-accent bg-accent/12 border-accent-line' :
                kpiDelta < 0 ? 'text-danger bg-danger/12 border-danger/25' :
                'text-ink-3 bg-transparent border-hairline'
              }`}>
                {kpiDelta > 0 ? `▲+${kpiDelta}` : kpiDelta < 0 ? `▼${kpiDelta}` : '='}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Las 3 gráficas comparten una tarjeta con un selector en vez de ir
          apiladas por separado — se ve una a la vez, la que interese. */}
      <ChartCard title={CHART_VIEW_META[chartView].title} icon={CHART_VIEW_META[chartView].icon}>
        <SegmentedControl
          label="Gráfica del dashboard"
          value={chartView}
          onChange={v => setChartView(v as typeof chartView)}
          options={(Object.keys(CHART_VIEW_META) as (typeof chartView)[]).map(id => ({ value: id, label: CHART_VIEW_META[id].label }))}
        />

        {chartView === 'series' && (
          <ResponsiveContainer width="100%" height={ALTURA_GRAFICA.s}>
            <BarChart data={totalSeriesData} margin={MARGEN_GRAFICA}>
              <CartesianGrid {...REJILLA_GRAFICA} />
              <XAxis dataKey="label" tick={TICK_GRAFICA} {...EJE_GRAFICA} />
              <YAxis tick={TICK_GRAFICA} {...EJE_GRAFICA} width={ANCHO_EJE_Y} />
              <Tooltip {...TOOLTIP_GRAFICA} formatter={(v: number) => [`${v} series`, 'Total']} />
              <Bar dataKey="series" fill="var(--color-accent)" radius={[3, 3, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        )}

        {chartView === 'adherencia' && (
          !hasAdherence ? (
            <EmptyChart message="Sin sesiones asignadas todavía" />
          ) : (
            <ResponsiveContainer width="100%" height={ALTURA_GRAFICA.s}>
              <BarChart data={adherenceData} margin={MARGEN_GRAFICA}>
                <CartesianGrid {...REJILLA_GRAFICA} />
                <XAxis dataKey="label" tick={TICK_GRAFICA} {...EJE_GRAFICA} />
                <YAxis tick={TICK_GRAFICA} {...EJE_GRAFICA} width={ANCHO_EJE_Y} domain={[0, 100]} />
                <ReferenceLine y={100} stroke="var(--color-ink-3)" strokeDasharray="4 4" />
                <Tooltip
                  {...TOOLTIP_GRAFICA}
                  formatter={(v: number, _: string, props: { payload?: { completed?: number; total?: number } }) => {
                    const { completed = 0, total = 0 } = props.payload ?? {};
                    return [`${v}% (${completed}/${total})`, 'Adherencia'];
                  }}
                />
                <Bar dataKey="adherencia" fill="var(--color-success)" radius={[3, 3, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          )
        )}

        {chartView === 'grupo' && (
          activeGroups.length === 0 ? (
            <EmptyChart message="Sin grupos configurados" />
          ) : (
            <div className="space-y-3">
              {/* Group toggle pills */}
              <div className="flex flex-wrap gap-2">
                {activeGroups.map(g => {
                  const hidden = hiddenGroups.has(g);
                  return (
                    <button
                      key={g}
                      onClick={() => setHiddenGroups(prev => {
                        const next = new Set(prev);
                        if (next.has(g)) next.delete(g); else next.add(g);
                        return next;
                      })}
                      className={`px-2 rounded-control font-sans text-caption uppercase font-bold border transition-all ${
                        hidden
                          ? 'bg-transparent border-hairline text-ink-3'
                          : 'border-transparent text-black'
                      }`}
                      style={hidden ? {} : { backgroundColor: GROUP_COLOR[g] }}
                    >
                      {MUSCLE_LABELS[g]}
                    </button>
                  );
                })}
                {hiddenGroups.size > 0 && (
                  <button
                    onClick={() => setHiddenGroups(new Set())}
                    className="px-2 rounded-control font-mono text-caption text-ink-2 hover:text-white border border-hairline transition-colors"
                  >
                    Mostrar todos
                  </button>
                )}
              </div>

              <ResponsiveContainer width="100%" height={ALTURA_GRAFICA.m}>
                <LineChart data={groupSeriesData} margin={MARGEN_GRAFICA}>
                  <CartesianGrid {...REJILLA_GRAFICA} />
                  <XAxis dataKey="label" tick={TICK_GRAFICA} {...EJE_GRAFICA} />
                  <YAxis tick={TICK_GRAFICA} {...EJE_GRAFICA} width={ANCHO_EJE_Y} />
                  <Tooltip
                    {...TOOLTIP_GRAFICA}
                    formatter={(v: number, key: string) => [`${v} series`, MUSCLE_LABELS[key as MuscleGroup] ?? key]}
                  />
                  {visibleGroups.map(g => (
                    <Line
                      key={g}
                      type="monotone"
                      dataKey={g}
                      stroke={GROUP_COLOR[g]}
                      strokeWidth={2}
                      dot={{ fill: GROUP_COLOR[g], stroke: 'var(--color-bg)', strokeWidth: 1.5, r: 3 }}
                      activeDot={{ r: 4 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )
        )}
      </ChartCard>

    </div>
  );
}
