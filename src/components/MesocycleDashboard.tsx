import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { Mesocycle, MuscleGroup } from '../types';
import { getWorkoutAssignmentsByMesocycleIds } from '../dbService';

// ── Constants ─────────────────────────────────────────────────────────────────

const MUSCLE_GROUPS: MuscleGroup[] = [
  'pecho', 'dorsal', 'trapecio',
  'deltoide_ant', 'deltoide_lat', 'deltoide_post',
  'biceps', 'triceps', 'antebrazo',
  'cuadriceps', 'isquios', 'gluteo', 'gemelo', 'core',
];

const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  pecho: 'Pecho', dorsal: 'Dorsal', trapecio: 'Trapecio',
  deltoide_ant: 'Delt.Ant', deltoide_lat: 'Delt.Lat', deltoide_post: 'Delt.Post',
  biceps: 'Bíceps', triceps: 'Tríceps', antebrazo: 'Antebrazo',
  cuadriceps: 'Cuáds', isquios: 'Isquios', gluteo: 'Glúteo',
  gemelo: 'Gemelo', core: 'Core',
};

const PALETTE = [
  '#fbcb1a', '#00eefc', '#ff6b6b', '#ffa500', '#9d4edd',
  '#06d6a0', '#ff5e78', '#fb5607', '#8ac926', '#ffbe0b',
  '#3a86ff', '#f72585', '#43aa8b', '#f8961e',
];

const GROUP_COLOR: Record<MuscleGroup, string> = Object.fromEntries(
  MUSCLE_GROUPS.map((g, i) => [g, PALETTE[i % PALETTE.length]])
) as Record<MuscleGroup, string>;

// ── Recharts shared style ─────────────────────────────────────────────────────

const TOOLTIP_STYLE = {
  contentStyle: {
    backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a',
    borderRadius: '8px', fontFamily: 'monospace', fontSize: '11px', color: '#fff',
  },
  labelStyle: { color: '#c6c9ab', marginBottom: '4px', fontFamily: 'monospace', fontSize: '10px' },
  itemStyle: { fontFamily: 'monospace', fontSize: '11px' },
};

const AXIS_TICK = { fill: '#c6c9ab', fontSize: 9, fontFamily: 'monospace' };

// ── Helper: empty chart placeholder ──────────────────────────────────────────

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="h-36 flex items-center justify-center border border-dashed border-white/7 rounded-xl">
      <p className="font-mono text-xs text-[#c6c9ab]">{message}</p>
    </div>
  );
}

// ── Helper: chart card wrapper ────────────────────────────────────────────────

function ChartCard({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#181816] border border-white/7 rounded-2xl p-4 space-y-3">
      <p className="font-sans font-semibold text-white text-sm flex items-center gap-2">
        <span className="material-symbols-outlined text-[#fbcb1a]" style={{ fontSize: '16px' }}>{icon}</span>
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
        adherencia: total > 0 ? Math.round((completed / total) * 100) : null,
        total,
        completed,
      };
    });
  }, [sorted, assignments]);

  const hasAdherence = adherenceData.some(d => d.total > 0);

  // ── Guard ─────────────────────────────────────────────────────────────────
  if (sorted.length === 0) {
    return (
      <div className="text-center py-20 border border-dashed border-white/7 rounded-2xl">
        <span className="material-symbols-outlined text-5xl text-[#2a2a2a] block mb-3">bar_chart</span>
        <p className="text-[#c6c9ab] text-sm">Sin mesociclos para mostrar.</p>
        {/* Este dashboard vive arriba del todo en la pestaña Entrenamientos; la
            creación de mesociclos está más abajo (MesocycleManager) — sin esta
            pista el estado vacío no dice qué hacer ni dónde ir. */}
        <p className="text-[#555] text-xs font-mono mt-1.5">Créalo más abajo, en la sección de macrociclos.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-sans font-bold text-white text-base flex items-center gap-2">
          <span className="material-symbols-outlined text-[#fbcb1a]">dashboard</span>
          Dashboard · {sorted.length} meso{sorted.length !== 1 ? 's' : ''}
        </h3>
        {loadState === 'loading' && (
          <span className="font-mono text-[10px] text-[#c6c9ab] animate-pulse">Cargando datos…</span>
        )}
      </div>

      {/* ── Row 1: Series totales + Adherencia ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Chart 1 */}
        <ChartCard title="Series totales programadas" icon="bar_chart">
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={totalSeriesData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" vertical={false} />
              <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} />
              <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={32} />
              <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => [`${v} series`, 'Total']} />
              <Bar dataKey="series" fill="#fbcb1a" radius={[3, 3, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Chart 5 */}
        <ChartCard title="Adherencia por mesociclo" icon="task_alt">
          {!hasAdherence ? (
            <EmptyChart message="Sin sesiones asignadas todavía" />
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={adherenceData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" vertical={false} />
                <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={32} domain={[0, 100]} />
                <ReferenceLine y={100} stroke="#555" strokeDasharray="4 4" />
                <Tooltip
                  {...TOOLTIP_STYLE}
                  formatter={(v: number, _: string, props: { payload?: { completed?: number; total?: number } }) => {
                    const { completed = 0, total = 0 } = props.payload ?? {};
                    return [`${v}% (${completed}/${total})`, 'Adherencia'];
                  }}
                />
                <Bar dataKey="adherencia" fill="#06d6a0" radius={[3, 3, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* ── Row 2: Series por grupo muscular ── */}
      <ChartCard title="Series semanales por grupo muscular" icon="fitness_center">
        {activeGroups.length === 0 ? (
          <EmptyChart message="Sin grupos configurados" />
        ) : (
          <div className="space-y-3">
            {/* Group toggle pills */}
            <div className="flex flex-wrap gap-1.5">
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
                    className={`px-2 py-0.5 rounded font-mono text-[10px] uppercase font-bold border transition-all ${
                      hidden
                        ? 'bg-transparent border-white/7 text-[#555]'
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
                  className="px-2 py-0.5 rounded font-mono text-[9px] text-[#c6c9ab] hover:text-white border border-white/7 transition-colors"
                >
                  Mostrar todos
                </button>
              )}
            </div>

            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={groupSeriesData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" vertical={false} />
                <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={32} />
                <Tooltip
                  {...TOOLTIP_STYLE}
                  formatter={(v: number, key: string) => [`${v} series`, MUSCLE_LABELS[key as MuscleGroup] ?? key]}
                />
                {visibleGroups.map(g => (
                  <Line
                    key={g}
                    type="monotone"
                    dataKey={g}
                    stroke={GROUP_COLOR[g]}
                    strokeWidth={2}
                    dot={{ fill: GROUP_COLOR[g], stroke: '#121212', strokeWidth: 1.5, r: 3 }}
                    activeDot={{ r: 4 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

    </div>
  );
}
