import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { Mesocycle, MuscleGroup, WorkoutAssignment, WorkoutLog, Exercise } from '../types';
import { getWorkoutAssignmentsByMesocycleIds, getWorkoutLogs, getExercises } from '../dbService';

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
  const [assignments, setAssignments] = useState<WorkoutAssignment[]>([]);
  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'done'>('loading');

  // Group-filter state for Chart 2
  const [hiddenGroups, setHiddenGroups] = useState<Set<MuscleGroup>>(new Set());
  // 1RM exercise selection for Chart 4 (up to 5 shown)
  const [shownExIds, setShownExIds] = useState<string[]>([]);

  useEffect(() => {
    if (!athleteEmail || mesocycles.length === 0) return;
    setLoadState('loading');
    const mesoIds = mesocycles.map(m => m.id);
    Promise.all([
      getWorkoutAssignmentsByMesocycleIds(mesoIds), // query by mesocycleId — avoids UID vs email mismatch
      getWorkoutLogs(athleteEmail),
      getExercises(),
    ]).then(([a, l, e]) => {
      setAssignments(a);
      setLogs(l);
      setExercises(e);
      setLoadState('done');
    }).catch(err => {
      console.error(err);
      setLoadState('done');
    });
  }, [athleteEmail, mesocycles]);

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

  // ── Charts 3–5: derived from logs + assignments ────────────────────────────
  const hasLogs = logs.length > 0;

  // Map assignmentId → mesocycleId (built from loaded assignments)
  const assignToMeso = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of assignments) {
      if (a.mesocycleId) map.set(a.id, a.mesocycleId);
    }
    return map;
  }, [assignments]);

  // Resolve the mesocycleId for a log: prefer log.mesocycleId (new logs),
  // fall back to the assignment map (old logs that lack the field).
  const logMesoId = (log: { assignmentId: string; mesocycleId?: string }): string | undefined =>
    log.mesocycleId ?? assignToMeso.get(log.assignmentId);

  // ── Chart 3: Tonelaje por mesociclo ───────────────────────────────────────
  const tonnageData = useMemo(() => {
    const byMeso: Record<string, number> = {};
    for (const m of sorted) byMeso[m.id] = 0;
    for (const log of logs) {
      const mesoId = logMesoId(log);
      if (!mesoId || !(mesoId in byMeso)) continue;
      for (const entry of log.entries) {
        for (const set of entry.sets) {
          byMeso[mesoId] = (byMeso[mesoId] ?? 0) + set.weight * set.repsDone;
        }
      }
    }
    return sorted.map(m => ({
      label: `#${m.number}`,
      tonelaje: Math.round(byMeso[m.id] ?? 0),
    }));
  }, [sorted, logs, assignToMeso]);

  const hasTonnage = tonnageData.some(d => d.tonelaje > 0);

  // ── Chart 4: 1RM estimado (Epley) ─────────────────────────────────────────
  const { oneRMData, topExercises } = useMemo(() => {
    // max 1RM per (exerciseId, mesoId)
    const maxByExMeso: Record<string, Record<string, number>> = {};
    const setCountByEx: Record<string, number> = {};

    for (const log of logs) {
      const mesoId = logMesoId(log);
      if (!mesoId) continue;
      for (const entry of log.entries) {
        const exId = entry.exerciseId;
        setCountByEx[exId] = (setCountByEx[exId] ?? 0) + entry.sets.length;
        if (!maxByExMeso[exId]) maxByExMeso[exId] = {};
        for (const set of entry.sets) {
          if (set.repsDone < 1 || set.weight <= 0) continue;
          const oneRM = Math.round(set.weight * (1 + set.repsDone / 30) * 10) / 10;
          if (oneRM > (maxByExMeso[exId][mesoId] ?? 0)) {
            maxByExMeso[exId][mesoId] = oneRM;
          }
        }
      }
    }

    // Top 5 exercises by set count (that have any 1RM data)
    const top5 = Object.entries(setCountByEx)
      .filter(([exId]) => Object.keys(maxByExMeso[exId] ?? {}).length > 0)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([id]) => id);

    const data = sorted.map(m => {
      const point: Record<string, string | number | null> = { label: `#${m.number}` };
      for (const exId of top5) {
        point[exId] = maxByExMeso[exId]?.[m.id] ?? null;
      }
      return point;
    });

    return { oneRMData: data, topExercises: top5 };
  }, [sorted, logs, assignToMeso]);

  // Initialise shownExIds once top exercises are known
  useEffect(() => {
    if (topExercises.length > 0 && shownExIds.length === 0) {
      setShownExIds(topExercises);
    }
  }, [topExercises]);

  const exName = (id: string) =>
    exercises.find(e => e.id === id)?.name ?? id.slice(-6);

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

      {/* ── Row 3: Carga real (Charts 3 + 4) ── */}
      {!hasLogs ? (
        <div className="bg-[#181816] border border-dashed border-white/7 rounded-2xl p-6 flex items-center gap-3">
          <span className="material-symbols-outlined text-2xl text-[#2a2a2a]">fitness_center</span>
          <p className="font-mono text-xs text-[#c6c9ab]">
            Sin datos de carga registrados — las gráficas de tonelaje y 1RM aparecerán aquí cuando el atleta complete sesiones.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Chart 3: Tonelaje */}
          <ChartCard title="Tonelaje total por mesociclo" icon="weight">
            {!hasTonnage ? (
              <EmptyChart message="Sin datos de carga registrados" />
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={tonnageData} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" vertical={false} />
                  <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={AXIS_TICK} axisLine={false} tickLine={false} width={44}
                    tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}t` : `${v}`}
                  />
                  <Tooltip
                    {...TOOLTIP_STYLE}
                    formatter={(v: number) => [`${v.toLocaleString('es-ES')} kg`, 'Tonelaje']}
                  />
                  <Bar dataKey="tonelaje" fill="#00eefc" radius={[3, 3, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* Chart 4: 1RM estimado */}
          <ChartCard title="1RM estimado (Epley)" icon="show_chart">
            {topExercises.length === 0 ? (
              <EmptyChart message="Sin datos de carga registrados" />
            ) : (
              <div className="space-y-2">
                {/* Exercise toggle */}
                <div className="flex flex-wrap gap-1.5">
                  {topExercises.map((exId, i) => {
                    const shown = shownExIds.includes(exId);
                    const color = PALETTE[i % PALETTE.length];
                    return (
                      <button
                        key={exId}
                        onClick={() => setShownExIds(prev =>
                          prev.includes(exId) ? prev.filter(id => id !== exId) : [...prev, exId]
                        )}
                        className={`px-2 py-0.5 rounded font-mono text-[9px] border transition-all truncate max-w-[120px] ${
                          shown
                            ? 'border-transparent text-black'
                            : 'bg-transparent border-white/7 text-[#555]'
                        }`}
                        style={shown ? { backgroundColor: color } : {}}
                        title={exName(exId)}
                      >
                        {exName(exId)}
                      </button>
                    );
                  })}
                </div>

                <ResponsiveContainer width="100%" height={148}>
                  <LineChart data={oneRMData} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" vertical={false} />
                    <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                    <YAxis
                      tick={AXIS_TICK} axisLine={false} tickLine={false} width={40}
                      tickFormatter={(v: number) => `${v}kg`}
                    />
                    <Tooltip
                      {...TOOLTIP_STYLE}
                      formatter={(v: number, key: string) => [`${v} kg`, exName(key)]}
                    />
                    {shownExIds.map((exId, i) => (
                      <Line
                        key={exId}
                        type="monotone"
                        dataKey={exId}
                        stroke={PALETTE[topExercises.indexOf(exId) % PALETTE.length]}
                        strokeWidth={2}
                        dot={{ fill: PALETTE[topExercises.indexOf(exId) % PALETTE.length], stroke: '#121212', strokeWidth: 1.5, r: 3 }}
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
      )}
    </div>
  );
}
