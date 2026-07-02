import React, { useState, useMemo } from 'react';
import {
  LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import { WorkoutLog, Exercise } from '../types';

// ── Constants ──────────────────────────────────────────────────────────────────

const MONTHS_ES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

type Metric = 'tonnage' | 'orm' | 'reps' | 'sets';

const METRICS: Metric[] = ['tonnage', 'orm', 'reps', 'sets'];

const METRIC_COLOR: Record<Metric, string> = {
  tonnage: '#e2ff00',
  orm:     '#00eefc',
  reps:    '#ff8c69',
  sets:    '#a78bfa',
};

const METRIC_LABEL: Record<Metric, string> = {
  tonnage: 'Tonelaje',
  orm:     '1RM est.',
  reps:    'Reps',
  sets:    'Series',
};

const METRIC_UNIT: Record<Metric, string> = {
  tonnage: ' kg',
  orm:     ' kg',
  reps:    '',
  sets:    '',
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${parseInt(d)} ${MONTHS_ES[parseInt(m) - 1]} '${y.slice(2)}`;
}

function epley(weight: number | string, reps: number | string): number {
  const w = Number(weight);
  const r = Number(reps);
  if (!r || !w) return 0;
  return Math.round(w * (1 + r / 30) * 10) / 10;
}

function avg(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function med(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function pct(v: number, max: number): number {
  return max === 0 ? 0 : Math.round((v / max) * 100);
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface SessionRow {
  date: string;
  label: string;
  sets: number;
  reps: number;
  tonnage: number;
  orm: number | null;
}

interface ChartPoint extends SessionRow {
  tonnagePct: number;
  repsPct: number;
  setsPct: number;
  ormPct: number | null;
}

interface Props {
  logs: WorkoutLog[];
  exercises: Exercise[];
}

// ── Tooltip ────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltip({ active, payload, activeMetrics }: any) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as ChartPoint | undefined;
  if (!point) return null;
  return (
    <div className="bg-[#1c1b1b] border border-[#2a2a2a] rounded-lg px-3 py-2 shadow-xl">
      <p className="font-mono text-[10px] text-[#c6c9ab] mb-1.5">{point.label}</p>
      {METRICS.filter(m => (activeMetrics as Set<Metric>).has(m)).map(m => {
        const raw = m === 'tonnage' ? point.tonnage : m === 'reps' ? point.reps : m === 'sets' ? point.sets : point.orm;
        if (raw == null) return null;
        return (
          <p key={m} className="font-mono text-xs font-bold" style={{ color: METRIC_COLOR[m] }}>
            {METRIC_LABEL[m]}: {m === 'tonnage' ? raw.toLocaleString() : raw}{METRIC_UNIT[m]}
          </p>
        );
      })}
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function LoadHistoryPanel({ logs, exercises }: Props) {
  const [activeMetrics, setActiveMetrics] = useState<Set<Metric>>(new Set(['tonnage']));
  const [selectedExId, setSelectedExId]   = useState('');
  const [showMean, setShowMean]           = useState(false);
  const [showMedian, setShowMedian]       = useState(false);

  // Exercise IDs that appear in logs — no dependency on exercises prop for visibility
  const loggedExerciseIds = useMemo<string[]>(() => {
    const ids = new Set<string>(logs.flatMap(l => l.entries.map(e => e.exerciseId)));
    return Array.from(ids);
  }, [logs]);

  // Augment with names where available; fall back to shortened ID so 1RM section always shows
  const loggedExercises = useMemo<{ id: string; name: string }[]>(() =>
    loggedExerciseIds.map(id => {
      const found = exercises.find(ex => ex.id === id);
      return found ? { id: found.id, name: found.name } : { id, name: `Ejercicio (…${id.slice(-6)})` };
    }),
  [loggedExerciseIds, exercises]);

  const activeExId = selectedExId || loggedExerciseIds[0] || '';

  // Per-date session aggregation (with best Epley 1RM for activeExId)
  const sessionRows = useMemo<SessionRow[]>(() => {
    const byDate = new Map<string, SessionRow>();
    for (const log of logs) {
      let row = byDate.get(log.date);
      if (!row) {
        row = { date: log.date, label: fmtDate(log.date), sets: 0, reps: 0, tonnage: 0, orm: null };
        byDate.set(log.date, row);
      }
      for (const entry of log.entries) {
        for (const s of entry.sets) {
          row.sets++;
          row.reps    += Number(s.repsDone);
          row.tonnage  = Math.round((row.tonnage + Number(s.weight) * Number(s.repsDone)) * 10) / 10;
          if (entry.exerciseId === activeExId) {
            const v = epley(s.weight, s.repsDone);
            if (v > (row.orm ?? 0)) row.orm = v;
          }
        }
      }
    }
    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [logs, activeExId]);

  // Normalised chart points (0-100 per metric)
  const chartData = useMemo<ChartPoint[]>(() => {
    const maxT    = Math.max(...sessionRows.map(r => r.tonnage), 1);
    const maxR    = Math.max(...sessionRows.map(r => r.reps), 1);
    const maxS    = Math.max(...sessionRows.map(r => r.sets), 1);
    const ormVals = sessionRows.map(r => r.orm ?? 0).filter(v => v > 0);
    const maxO    = ormVals.length ? Math.max(...ormVals) : 1;
    return sessionRows.map(r => ({
      ...r,
      tonnagePct: pct(r.tonnage, maxT),
      repsPct:    pct(r.reps, maxR),
      setsPct:    pct(r.sets, maxS),
      ormPct:     r.orm != null && r.orm > 0 ? pct(r.orm, maxO) : null,
    }));
  }, [sessionRows]);

  // Stats for reference lines — raw (single-metric) and pct (multi-metric)
  const stats = useMemo(() => {
    const extract = (m: Metric) => {
      const raw = sessionRows.map(r =>
        m === 'tonnage' ? r.tonnage : m === 'reps' ? r.reps : m === 'sets' ? r.sets : (r.orm ?? 0)
      ).filter(v => v > 0);
      const ps = chartData.map(p =>
        m === 'tonnage' ? p.tonnagePct : m === 'reps' ? p.repsPct : m === 'sets' ? p.setsPct : (p.ormPct ?? 0)
      ).filter(v => v > 0);
      return { rawMean: avg(raw), rawMedian: med(raw), pctMean: avg(ps), pctMedian: med(ps) };
    };
    return Object.fromEntries(METRICS.map(m => [m, extract(m)])) as Record<
      Metric, { rawMean: number; rawMedian: number; pctMean: number; pctMedian: number }
    >;
  }, [sessionRows, chartData]);

  // X-axis tick: show "mmm 'yy" only at month transitions
  const xTickFormatter = (value: string, index: number): string => {
    const [y, m] = (value ?? '').split('-');
    if (!y || !m) return '';
    if (index === 0) return `${MONTHS_ES[parseInt(m) - 1]} '${y.slice(2)}`;
    const prev = chartData[index - 1]?.date ?? '';
    const [py, pm] = prev.split('-');
    return (y !== py || m !== pm) ? `${MONTHS_ES[parseInt(m) - 1]} '${y.slice(2)}` : '';
  };

  function toggleMetric(m: Metric) {
    setActiveMetrics(prev => {
      const next = new Set(prev);
      next.has(m) ? next.delete(m) : next.add(m);
      return next;
    });
  }

  const isMulti   = activeMetrics.size > 1;
  const ormActive = activeMetrics.has('orm');

  const lineKey = (m: Metric): string =>
    isMulti
      ? (m === 'tonnage' ? 'tonnagePct' : m === 'reps' ? 'repsPct' : m === 'sets' ? 'setsPct' : 'ormPct')
      : (m === 'tonnage' ? 'tonnage'    : m === 'reps' ? 'reps'    : m === 'sets' ? 'sets'    : 'orm');

  const refY = (m: Metric, stat: 'mean' | 'median'): number =>
    isMulti
      ? (stat === 'mean' ? stats[m].pctMean   : stats[m].pctMedian)
      : (stat === 'mean' ? stats[m].rawMean   : stats[m].rawMedian);

  // ── Empty state ──────────────────────────────────────────────────────────────

  if (logs.length === 0) {
    return (
      <div className="bg-[#121212] border border-[#2a2a2a] rounded-xl p-5">
        <h3 className="font-sans font-bold text-sm text-white flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-[#00eefc] text-sm">monitoring</span>
          Historial de carga
        </h3>
        <div className="py-8 text-center border border-dashed border-[#2a2a2a] rounded-xl">
          <span className="material-symbols-outlined text-3xl text-[#2a2a2a] block mb-2">monitoring</span>
          <p className="text-xs text-[#c6c9ab] font-mono">Sin registros de carga aún.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#121212] border border-[#2a2a2a] rounded-xl p-5 space-y-5">
      <h3 className="font-sans font-bold text-sm text-white flex items-center gap-2">
        <span className="material-symbols-outlined text-[#00eefc] text-sm">monitoring</span>
        Historial de carga
      </h3>

      {/* ── Metric toggles + overlay buttons ── */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
        <div className="overflow-x-auto -mx-1 px-1">
          <div className="flex items-center gap-2 min-w-max">
            {METRICS.map(m => (
              <button
                key={m}
                onClick={() => toggleMetric(m)}
                className={`px-3 min-h-[44px] rounded-full font-mono text-[10px] uppercase tracking-wider transition-all border ${
                  activeMetrics.has(m)
                    ? 'text-black font-bold'
                    : 'bg-transparent text-[#c6c9ab] border-[#2a2a2a] hover:border-[#555]'
                }`}
                style={activeMetrics.has(m) ? { backgroundColor: METRIC_COLOR[m], borderColor: METRIC_COLOR[m] } : {}}
              >
                {METRIC_LABEL[m]}
              </button>
            ))}
            <div className="w-px h-4 bg-[#2a2a2a] mx-1" />
            {(['mean', 'median'] as const).map(s => {
              const active = s === 'mean' ? showMean : showMedian;
              const toggle = s === 'mean' ? () => setShowMean(v => !v) : () => setShowMedian(v => !v);
              return (
                <button
                  key={s}
                  onClick={toggle}
                  className={`px-2.5 min-h-[44px] rounded-full font-mono text-[10px] uppercase tracking-wider transition-all border ${
                    active ? 'bg-white/10 border-white/30 text-white' : 'border-[#2a2a2a] text-[#555] hover:text-[#c6c9ab]'
                  }`}
                >
                  {s === 'mean' ? 'Media' : 'Mediana'}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Exercise selector (only when 1RM metric is active) ── */}
      {ormActive && loggedExercises.length > 0 && (
        <div className="flex items-center gap-3">
          <span className="font-mono text-[9px] uppercase tracking-wider flex-shrink-0" style={{ color: METRIC_COLOR.orm }}>
            Ejercicio (1RM):
          </span>
          <select
            value={activeExId}
            onChange={e => setSelectedExId(e.target.value)}
            className="min-w-0 flex-1 bg-[#1c1b1b] border border-[#2a2a2a] text-white text-[11px] font-mono rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#00eefc]/50 cursor-pointer"
          >
            {loggedExercises.map(ex => (
              <option key={ex.id} value={ex.id}>{ex.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* ── Chart ── */}
      {activeMetrics.size === 0 ? (
        <div className="py-6 text-center border border-dashed border-[#2a2a2a] rounded-xl">
          <p className="font-mono text-[10px] text-[#555]">Selecciona al menos una métrica.</p>
        </div>
      ) : (
        <div>
          {isMulti && (
            <p className="font-mono text-[8px] text-[#555] uppercase tracking-wider mb-1 text-right">
              % del máximo
            </p>
          )}
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -28 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={xTickFormatter}
                interval={0}
                tick={{ fill: '#c6c9ab', fontSize: 9, fontFamily: 'monospace' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={isMulti ? [0, 100] : ['auto', 'auto']}
                tick={{ fill: '#c6c9ab', fontSize: 9, fontFamily: 'monospace' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                content={<ChartTooltip activeMetrics={activeMetrics} />}
                cursor={{ stroke: '#3a3a3a', strokeWidth: 1 }}
              />

              {METRICS.filter(m => activeMetrics.has(m)).map(m => (
                <Line
                  key={m}
                  type="monotone"
                  dataKey={lineKey(m)}
                  stroke={METRIC_COLOR[m]}
                  strokeWidth={2}
                  dot={{ fill: METRIC_COLOR[m], r: 3, strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: METRIC_COLOR[m] }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              ))}

              {showMean && METRICS.filter(m => activeMetrics.has(m)).map(m => (
                <ReferenceLine
                  key={`mean-${m}`}
                  y={refY(m, 'mean')}
                  stroke={METRIC_COLOR[m]}
                  strokeOpacity={0.5}
                  strokeDasharray="5 3"
                  strokeWidth={1.5}
                />
              ))}

              {showMedian && METRICS.filter(m => activeMetrics.has(m)).map(m => (
                <ReferenceLine
                  key={`median-${m}`}
                  y={refY(m, 'median')}
                  stroke={METRIC_COLOR[m]}
                  strokeOpacity={0.3}
                  strokeDasharray="2 4"
                  strokeWidth={1.5}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Session table (desktop) / cards (mobile) ── */}
      <div className="space-y-1.5">
        <p className="font-mono text-[9px] text-[#c6c9ab] uppercase tracking-wider">Sesiones</p>

        {/* Mobile cards */}
        <div className="flex flex-col gap-2 sm:hidden">
          {[...sessionRows].reverse().map(row => (
            <div key={row.date} className="bg-[#111] border border-[#2a2a2a]/50 rounded-lg px-3 py-2.5 flex items-center justify-between gap-2">
              <span className="font-mono text-[11px] text-[#c6c9ab] flex-shrink-0">{row.label}</span>
              <div className="flex items-center gap-3 flex-shrink-0 font-mono text-[11px]">
                <span className="text-[#c6c9ab]"><span className="text-white font-bold">{row.sets}</span>s</span>
                <span className="text-[#c6c9ab]"><span className="text-white">{row.reps}</span>r</span>
                <span className="font-bold" style={{ color: METRIC_COLOR.tonnage }}>{row.tonnage.toLocaleString()}kg</span>
                {ormActive && (
                  <span className="font-bold" style={{ color: row.orm ? METRIC_COLOR.orm : '#555' }}>
                    {row.orm ? `${row.orm}kg` : '—'}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Desktop table */}
        <div className="hidden sm:block overflow-x-auto rounded-lg border border-[#2a2a2a]/50">
          <table className="w-full text-left" style={{ minWidth: ormActive ? 460 : 360 }}>
            <thead>
              <tr className="bg-[#111] border-b border-[#2a2a2a]/40">
                {['Fecha', 'Series', 'Reps', 'Tonelaje', ...(ormActive ? ['1RM est.'] : [])].map(h => (
                  <th key={h} className="px-3 py-2 font-mono text-[9px] text-[#c6c9ab] uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...sessionRows].reverse().map((row, i) => (
                <tr
                  key={row.date}
                  className={`border-b border-[#2a2a2a]/20 ${i % 2 === 0 ? 'bg-[#0f0f0f]' : 'bg-[#111]'} hover:bg-[#1a1a1a] transition-colors`}
                >
                  <td className="px-3 py-2.5 font-mono text-[11px] text-[#c6c9ab]">{row.label}</td>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-white font-bold">{row.sets}</td>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-white">{row.reps}</td>
                  <td className="px-3 py-2.5 font-mono text-[11px] font-bold" style={{ color: METRIC_COLOR.tonnage }}>
                    {row.tonnage.toLocaleString()} kg
                  </td>
                  {ormActive && (
                    <td className="px-3 py-2.5 font-mono text-[11px] font-bold" style={{ color: row.orm ? METRIC_COLOR.orm : '#555' }}>
                      {row.orm ? `${row.orm} kg` : '—'}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
