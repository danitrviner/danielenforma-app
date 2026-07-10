import React, { useState, useEffect, useMemo } from 'react';
import {
  LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import { WorkoutLog, Exercise, Mesocycle } from '../types';
import { getMesocycles } from '../dbService';
import { epley } from '../utils/oneRepMax';
import { addDays } from '../utils/trainingWeek';

// ── Constants ──────────────────────────────────────────────────────────────────

const MONTHS_ES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

type Metric = 'tonnage' | 'orm' | 'reps' | 'sets';

const METRICS: Metric[] = ['tonnage', 'orm', 'reps', 'sets'];

const METRIC_COLOR: Record<Metric, string> = {
  tonnage: '#fbcb1a',
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

type Granularity = 'week' | 'day';

// Bucket de 1RM para el ejercicio activo — semanal o diario según `granularity`,
// usado para elegir qué tramos cuentan en el cálculo de progresión y (en modo
// semanal) para rellenar huecos sin registro.
interface ProgressBucket {
  id: string;                // clave de exclusión: 'w3' (semana 3) o la fecha ISO
  label: string;             // 'S3' o '22 jun'
  orm: number | null;        // mejor 1RM real registrado en el tramo (null = sin datos)
  filledOrm: number | null;  // orm, o valor estimado si el tramo está vacío (solo aplica en semanal)
  isFilled: boolean;         // true si filledOrm viene de una estimación, no de un registro real
}

interface Props {
  logs: WorkoutLog[];
  exercises: Exercise[];
  athleteId?: string; // si se pasa, permite acotar la progresión semanal a un macrociclo concreto
}

// ── Tooltip ────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltip({ active, payload, activeMetrics }: any) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as ChartPoint | undefined;
  if (!point) return null;
  return (
    <div className="bg-[#1c1b1b] border border-white/7 rounded-lg px-3 py-2 shadow-xl">
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

export default function LoadHistoryPanel({ logs, exercises, athleteId }: Props) {
  const [activeMetrics, setActiveMetrics] = useState<Set<Metric>>(new Set(['tonnage']));
  const [selectedExId, setSelectedExId]   = useState('');
  const [showMean, setShowMean]           = useState(false);
  const [showMedian, setShowMedian]       = useState(false);

  // Progresión de 1RM por ejercicio (semanas o días seleccionados + relleno de huecos)
  const [mesocycles, setMesocycles]       = useState<Mesocycle[]>([]);
  const [mesocycleFilter, setMesocycleFilter] = useState<string>(''); // '' = todo el historial
  const [granularity, setGranularity]     = useState<Granularity>('week');
  const [excludedBuckets, setExcludedBuckets] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!athleteId) return;
    let cancelled = false;
    getMesocycles(athleteId).then(ms => { if (!cancelled) setMesocycles(ms); }).catch(() => {});
    return () => { cancelled = true; };
  }, [athleteId]);

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
  const selectedMesocycle = useMemo(() => mesocycles.find(m => m.id === mesocycleFilter) ?? null, [mesocycles, mesocycleFilter]);

  // Cambiar de ejercicio, macrociclo o granularidad cambia qué tramos existen — reinicia la selección
  useEffect(() => {
    setExcludedBuckets(new Set());
  }, [activeExId, mesocycleFilter, granularity]);

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

  // ── Progresión semanal o diaria (solo 1RM) ──────────────────────────────────
  // Best 1RM real por fecha para el ejercicio activo, acotado al macrociclo si hay uno elegido.
  const ormByDate = useMemo(() => {
    const byDate = new Map<string, number>();
    if (!activeExId) return byDate;
    const mesoStart = selectedMesocycle?.startDate ?? null;
    const mesoEnd = selectedMesocycle ? addDays(selectedMesocycle.startDate, selectedMesocycle.weeks * 7 - 1) : null;
    for (const log of logs) {
      if (mesoStart && (log.date < mesoStart || log.date > mesoEnd!)) continue;
      for (const entry of log.entries) {
        if (entry.exerciseId !== activeExId) continue;
        for (const s of entry.sets) {
          const v = epley(s.weight, s.repsDone);
          if (v > (byDate.get(log.date) ?? 0)) byDate.set(log.date, v);
        }
      }
    }
    return byDate;
  }, [logs, activeExId, selectedMesocycle]);

  // Semana 1 = primera semana con datos de este ejercicio (o el inicio del
  // macrociclo elegido, si se acota uno). Huecos sin registro se rellenan con
  // la media de la semana anterior y posterior con dato real; si solo hay dato
  // anterior (aún no hay semanas futuras), se repite ese valor.
  const weekBuckets = useMemo<ProgressBucket[]>(() => {
    const dates = Array.from(ormByDate.keys()).sort();
    if (dates.length === 0) return [];

    const mesoStart = selectedMesocycle?.startDate ?? null;
    const anchor = mesoStart ?? dates[0];
    const lastDate = dates[dates.length - 1];
    const totalWeeks = selectedMesocycle
      ? selectedMesocycle.weeks
      : Math.floor((new Date(lastDate + 'T00:00:00').getTime() - new Date(anchor + 'T00:00:00').getTime()) / (7 * 86400000)) + 1;

    const buckets: ProgressBucket[] = [];
    for (let w = 1; w <= totalWeeks; w++) {
      const start = addDays(anchor, (w - 1) * 7);
      const end = addDays(anchor, w * 7 - 1);
      let best: number | null = null;
      for (const [date, v] of ormByDate) {
        if (date >= start && date <= end && v > (best ?? 0)) best = v;
      }
      buckets.push({ id: `w${w}`, label: `S${w}`, orm: best, filledOrm: best, isFilled: false });
    }

    // Relleno de huecos
    for (let i = 0; i < buckets.length; i++) {
      if (buckets[i].orm != null) continue;
      let prevIdx = -1;
      for (let j = i - 1; j >= 0; j--) { if (buckets[j].orm != null) { prevIdx = j; break; } }
      let nextIdx = -1;
      for (let j = i + 1; j < buckets.length; j++) { if (buckets[j].orm != null) { nextIdx = j; break; } }
      if (prevIdx >= 0 && nextIdx >= 0) {
        buckets[i].filledOrm = Math.round(((buckets[prevIdx].orm! + buckets[nextIdx].orm!) / 2) * 10) / 10;
        buckets[i].isFilled = true;
      } else if (prevIdx >= 0) {
        buckets[i].filledOrm = buckets[prevIdx].orm;
        buckets[i].isFilled = true;
      }
    }

    return buckets;
  }, [ormByDate, selectedMesocycle]);

  // Un tramo por sesión real registrada — sin relleno de huecos, cada día o tiene
  // dato o no existe como tramo (a diferencia de semanal, que sí rellena).
  const dayBuckets = useMemo<ProgressBucket[]>(() => {
    return Array.from(ormByDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, orm]) => ({ id: date, label: fmtDate(date), orm, filledOrm: orm, isFilled: false }));
  }, [ormByDate]);

  const progressBuckets = granularity === 'week' ? weekBuckets : dayBuckets;

  const toggleBucket = (id: string) => {
    setExcludedBuckets(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Progresión = primer vs último tramo incluido (con hueco relleno en semanal), solo con datos
  const progression = useMemo(() => {
    const included = progressBuckets.filter(b => !excludedBuckets.has(b.id) && b.filledOrm != null);
    if (included.length < 2) return null;
    const first = included[0];
    const last = included[included.length - 1];
    const delta = Math.round((last.filledOrm! - first.filledOrm!) * 10) / 10;
    const pct = first.filledOrm! > 0 ? Math.round((delta / first.filledOrm!) * 1000) / 10 : 0;
    return { first, last, delta, pct };
  }, [progressBuckets, excludedBuckets]);

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
      if (next.has(m)) next.delete(m); else next.add(m);
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
      <div className="bg-[#181816] border border-white/7 rounded-2xl p-5">
        <h3 className="font-sans font-bold text-base text-white flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-[#00eefc] text-sm">monitoring</span>
          Historial de carga
        </h3>
        <div className="py-8 text-center border border-dashed border-white/7 rounded-xl">
          <span className="material-symbols-outlined text-3xl text-[#2a2a2a] block mb-2">monitoring</span>
          <p className="text-xs text-[#c6c9ab] font-mono">Sin registros de carga aún.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#181816] border border-white/7 rounded-2xl p-5 space-y-5">
      <h3 className="font-sans font-bold text-base text-white flex items-center gap-2">
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
                className={`px-3 min-h-[44px] rounded-full font-mono text-xs uppercase tracking-wider transition-all border ${
                  activeMetrics.has(m)
                    ? 'text-black font-bold'
                    : 'bg-transparent text-[#c6c9ab] border-white/7 hover:border-[#555]'
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
                  className={`px-2.5 min-h-[44px] rounded-full font-mono text-xs uppercase tracking-wider transition-all border ${
                    active ? 'bg-white/10 border-white/30 text-white' : 'border-white/7 text-[#555] hover:text-[#c6c9ab]'
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
          <span className="font-mono text-[10px] uppercase tracking-wider flex-shrink-0" style={{ color: METRIC_COLOR.orm }}>
            Ejercicio (1RM):
          </span>
          <select
            value={activeExId}
            onChange={e => setSelectedExId(e.target.value)}
            className="min-w-0 flex-1 bg-[#1c1b1b] border border-white/7 text-white text-[11px] font-mono rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#00eefc]/50 cursor-pointer"
          >
            {loggedExercises.map(ex => (
              <option key={ex.id} value={ex.id}>{ex.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* ── Progresión semanal/diaria (qué tramos cuentan para el cálculo) ── */}
      {ormActive && progressBuckets.length > 0 && (
        <div className="bg-[#111] border border-white/7 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="font-mono text-[10px] uppercase tracking-wider" style={{ color: METRIC_COLOR.orm }}>
              Progresión {granularity === 'week' ? 'semanal' : 'diaria'} (1RM)
            </p>
            <div className="flex items-center gap-2">
              <div className="flex bg-[#1c1b1b] border border-white/7 rounded-lg p-0.5">
                {(['week', 'day'] as const).map(g => (
                  <button
                    key={g}
                    onClick={() => setGranularity(g)}
                    className={`px-2.5 py-1 rounded-md font-mono text-[10px] font-bold transition-all ${
                      granularity === g ? 'bg-[#00eefc]/15 text-[#00eefc]' : 'text-[#555] hover:text-[#c6c9ab]'
                    }`}
                  >
                    {g === 'week' ? 'Semana' : 'Día'}
                  </button>
                ))}
              </div>
              {mesocycles.length > 0 && (
                <select
                  value={mesocycleFilter}
                  onChange={e => setMesocycleFilter(e.target.value)}
                  className="bg-[#1c1b1b] border border-white/7 text-white text-[10px] font-mono rounded-lg px-2 py-1 focus:outline-none focus:border-[#00eefc]/50 cursor-pointer"
                >
                  <option value="">Todo el historial</option>
                  {[...mesocycles].sort((a, b) => b.startDate.localeCompare(a.startDate)).map(m => (
                    <option key={m.id} value={m.id}>Macrociclo {m.number} · {m.objective}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Bucket checkboxes */}
          <div className="flex flex-wrap gap-1.5">
            {progressBuckets.map(b => {
              const included = !excludedBuckets.has(b.id);
              return (
                <button
                  key={b.id}
                  onClick={() => toggleBucket(b.id)}
                  title={b.orm != null ? `${b.orm} kg` : b.filledOrm != null ? `${b.filledOrm} kg (estimado)` : 'Sin datos'}
                  className={`min-w-[44px] min-h-[44px] px-2 rounded-lg font-mono text-[10px] font-bold border transition-all flex flex-col items-center justify-center gap-0.5 ${
                    included
                      ? 'bg-[#00eefc]/10 border-[#00eefc]/40 text-[#00eefc]'
                      : 'bg-transparent border-white/7 text-[#555] opacity-50'
                  }`}
                >
                  <span>{b.label}</span>
                  {b.isFilled && <span className="text-[8px] opacity-70">~</span>}
                </button>
              );
            })}
          </div>

          {/* Progression summary */}
          {progression ? (
            <div className="flex items-center gap-2 text-xs font-mono flex-wrap">
              <span className="text-[#c6c9ab]">{progression.first.label}: <strong className="text-white">{progression.first.filledOrm}kg</strong></span>
              <span className="text-[#555]">→</span>
              <span className="text-[#c6c9ab]">{progression.last.label}: <strong className="text-white">{progression.last.filledOrm}kg</strong></span>
              <span className={`font-bold ${progression.delta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                ({progression.delta >= 0 ? '+' : ''}{progression.delta}kg · {progression.pct >= 0 ? '+' : ''}{progression.pct}%)
              </span>
            </div>
          ) : (
            <p className="font-mono text-[10px] text-[#555]">Marca al menos dos {granularity === 'week' ? 'semanas' : 'días'} con datos para calcular la progresión.</p>
          )}
          <p className="font-mono text-[9px] text-[#444]">
            Destilda {granularity === 'week' ? 'las semanas' : 'los días'} de adaptación que no quieres que cuenten (ej. las primeras del bloque).
            {granularity === 'week' && ' "~" = semana sin registro, estimada a partir de semanas cercanas.'}
          </p>
        </div>
      )}

      {/* ── Chart ── */}
      {activeMetrics.size === 0 ? (
        <div className="py-6 text-center border border-dashed border-white/7 rounded-xl">
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
            <div key={row.date} className="bg-[#111] border border-white/50 rounded-lg px-3 py-2.5 flex items-center justify-between gap-2">
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
        <div className="hidden sm:block overflow-x-auto rounded-lg border border-white/50">
          <table className="w-full text-left" style={{ minWidth: ormActive ? 460 : 360 }}>
            <thead>
              <tr className="bg-[#111] border-b border-white/40">
                {['Fecha', 'Series', 'Reps', 'Tonelaje', ...(ormActive ? ['1RM est.'] : [])].map(h => (
                  <th key={h} className="px-3 py-2 font-mono text-[9px] text-[#c6c9ab] uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...sessionRows].reverse().map((row, i) => (
                <tr
                  key={row.date}
                  className={`border-b border-white/20 ${i % 2 === 0 ? 'bg-[#0f0f0f]' : 'bg-[#111]'} hover:bg-[#1e1e1b] transition-colors`}
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
