import React, { useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import { WorkoutLog, Exercise, QuestionnaireResponse, Questionnaire, BodyweightLog } from '../types';

interface Props {
  athleteEmail: string;
  logs: WorkoutLog[];
  exercises: Exercise[];
  responses: QuestionnaireResponse[];
  questionnaires: Questionnaire[];
  bodyweightLogs: BodyweightLog[];
}

type DataPoint = { date: string; value: number };
type Series = { id: string; label: string; points: DataPoint[]; unit?: string };

const COLORS = [
  '#e2ff00', '#00eefc', '#ff8c69', '#a78bfa', '#86efac', '#fb923c', '#f472b6', '#67e8f9',
];

function pearson(a: DataPoint[], b: DataPoint[]): number | null {
  const dateSet = new Set(a.map(p => p.date));
  const common = b.filter(p => dateSet.has(p.date));
  const aAligned = common.map(p => a.find(x => x.date === p.date)!.value);
  const bAligned = common.map(p => p.value);
  if (aAligned.length < 3) return null;
  const n = aAligned.length;
  const meanA = aAligned.reduce((s, v) => s + v, 0) / n;
  const meanB = bAligned.reduce((s, v) => s + v, 0) / n;
  const num = aAligned.reduce((s, v, i) => s + (v - meanA) * (bAligned[i] - meanB), 0);
  const denA = Math.sqrt(aAligned.reduce((s, v) => s + (v - meanA) ** 2, 0));
  const denB = Math.sqrt(bAligned.reduce((s, v) => s + (v - meanB) ** 2, 0));
  if (denA === 0 || denB === 0) return null;
  return num / (denA * denB);
}

function fmtDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' });
  } catch {
    return dateStr;
  }
}

function weekKey(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setDate(d.getDate() + diff);
  return mon.toISOString().split('T')[0];
}

export default function CorrelationPanel({
  logs, exercises, responses, questionnaires, bodyweightLogs,
}: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectorOpen, setSelectorOpen] = useState(false);

  const allSeries = useMemo<Series[]>(() => {
    const result: Series[] = [];

    // 1. Bodyweight
    if (bodyweightLogs.length > 0) {
      const sorted = [...bodyweightLogs].sort((a, b) => a.date.localeCompare(b.date));
      result.push({
        id: 'bw',
        label: 'Peso corporal',
        points: sorted.map(b => ({ date: b.date, value: b.weight })),
        unit: 'kg',
      });

      // Weekly average
      const byWeek: Record<string, number[]> = {};
      for (const b of sorted) {
        const wk = weekKey(b.date);
        if (!byWeek[wk]) byWeek[wk] = [];
        byWeek[wk].push(b.weight);
      }
      const weekPoints: DataPoint[] = Object.entries(byWeek)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, vals]) => ({
          date,
          value: Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10,
        }));
      if (weekPoints.length > 0) {
        result.push({
          id: 'bw_weekly',
          label: 'Peso corporal (media sem.)',
          points: weekPoints,
          unit: 'kg',
        });
      }
    }

    // 2. Tonelaje total from workout logs
    if (logs.length > 0) {
      const byDate: Record<string, number> = {};
      for (const log of logs) {
        let tonnage = 0;
        for (const entry of log.entries) {
          for (const set of entry.sets) {
            tonnage += (set.weight || 0) * (set.repsDone || 0);
          }
        }
        if (!byDate[log.date]) byDate[log.date] = 0;
        byDate[log.date] += tonnage;
      }
      const points = Object.entries(byDate)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, value]) => ({ date, value: Math.round(value) }));
      if (points.length > 0) {
        result.push({ id: 'tonnage', label: 'Tonelaje total', points, unit: 'kg' });
      }
    }

    // 3. 1RM estimado per exercise
    const orm1Map: Record<string, Record<string, number>> = {};
    for (const log of logs) {
      for (const entry of log.entries) {
        const eid = entry.exerciseId;
        for (const set of entry.sets) {
          if (!set.weight || !set.repsDone) continue;
          const orm = set.weight * (1 + set.repsDone / 30);
          if (!orm1Map[eid]) orm1Map[eid] = {};
          const prev = orm1Map[eid][log.date] ?? 0;
          if (orm > prev) orm1Map[eid][log.date] = orm;
        }
      }
    }
    for (const [eid, byDate] of Object.entries(orm1Map)) {
      const ex = exercises.find(e => e.id === eid);
      const points = Object.entries(byDate)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, value]) => ({ date, value: Math.round(value * 10) / 10 }));
      if (points.length > 0) {
        result.push({
          id: `orm_${eid}`,
          label: `1RM: ${ex?.name ?? eid}`,
          points,
          unit: 'kg',
        });
      }
    }

    // 4. Questionnaire numeric/scale graphable questions
    for (const q of questionnaires) {
      for (const question of q.questions) {
        const graphable = question.graphable || question.type === 'numeric' || question.type === 'scale';
        if (!graphable) continue;
        const points: DataPoint[] = [];
        for (const r of responses) {
          if (r.questionnaireId !== q.id) continue;
          const ans = r.answers.find(a => a.questionId === question.id);
          if (ans === undefined || ans.value === undefined) continue;
          const val = Number(ans.value);
          if (isNaN(val)) continue;
          const date = r.submittedAt.split('T')[0];
          points.push({ date, value: val });
        }
        if (points.length > 0) {
          points.sort((a, b) => a.date.localeCompare(b.date));
          result.push({
            id: `q_${question.id}`,
            label: `${q.title} › ${question.label}`,
            points,
            unit: question.unit,
          });
        }
      }
    }

    return result;
  }, [logs, exercises, responses, questionnaires, bodyweightLogs]);

  const toggleSeries = (id: string) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      return [...prev, id];
    });
  };

  const selectedSeries = allSeries.filter(s => selectedIds.includes(s.id));

  // Build chart data
  const chartData = useMemo(() => {
    if (selectedSeries.length === 0) return [];

    // Gather all unique dates across selected series
    const allDates = new Set<string>();
    for (const s of selectedSeries) {
      for (const p of s.points) allDates.add(p.date);
    }
    const sortedDates = [...allDates].sort();

    const multiSeries = selectedSeries.length > 1;

    return sortedDates.map(date => {
      const row: Record<string, number | string | null> = { date };
      for (const s of selectedSeries) {
        const point = s.points.find(p => p.date === date);
        if (point === undefined) {
          row[s.id] = null;
        } else if (multiSeries) {
          // Normalize 0-100
          const vals = s.points.map(p => p.value);
          const min = Math.min(...vals);
          const max = Math.max(...vals);
          if (max === min) {
            row[s.id] = 50;
          } else {
            row[s.id] = Math.round(((point.value - min) / (max - min)) * 1000) / 10;
          }
          row[`${s.id}_raw`] = point.value;
        } else {
          row[s.id] = point.value;
        }
      }
      return row;
    });
  }, [selectedSeries]);

  // Pearson for exactly 2 series
  const correlationResult = useMemo(() => {
    if (selectedSeries.length !== 2) return null;
    const [a, b] = selectedSeries;
    const r = pearson(a.points, b.points);
    if (r === null) return { r: null, label: 'Datos insuficientes para calcular correlación' };
    const abs = Math.abs(r);
    let strength = '';
    if (abs > 0.7) strength = 'Correlación fuerte';
    else if (abs >= 0.4) strength = 'Correlación moderada';
    else strength = 'Correlación débil o nula';
    return { r, label: strength };
  }, [selectedSeries]);

  const hasData = allSeries.length > 0;
  const multiNorm = selectedSeries.length > 1;
  const yUnit = !multiNorm && selectedSeries.length === 1 ? (selectedSeries[0].unit ?? '') : '';

  // Y-axis domain for single-series: M = max(range×10%, mean×3%), never starting at 0
  const singleDomain = useMemo<[number, number] | undefined>(() => {
    if (multiNorm || selectedSeries.length !== 1) return undefined;
    const vals = selectedSeries[0].points.map(p => p.value);
    if (vals.length === 0) return undefined;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const range = max - min;
    const pad = Math.max(range * 0.1, mean * 0.03);
    return [
      Math.floor((min - pad) * 10) / 10,
      Math.ceil((max + pad) * 10) / 10,
    ];
  }, [selectedSeries, multiNorm]);

  if (!hasData) {
    return (
      <div className="py-20 text-center border border-dashed border-[#2a2a2a] rounded-2xl">
        <span className="material-symbols-outlined text-5xl text-[#2a2a2a] block mb-3">insights</span>
        <p className="font-sans font-bold text-white text-sm mb-1">Sin datos suficientes</p>
        <p className="text-[#c6c9ab] text-xs font-mono">Completa más registros para ver correlaciones.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-sans font-black text-xl tracking-tight text-white uppercase flex items-center gap-2">
          <span className="material-symbols-outlined text-[#e2ff00]" style={{ fontVariationSettings: "'FILL' 1" }}>insights</span>
          Análisis de correlaciones
        </h2>
        <p className="font-mono text-xs text-[#c6c9ab] mt-1">Selecciona 1 o más series para visualizar. Con 2 series exactas se calcula Pearson r.</p>
      </div>

      {/* Series selector — accordion on mobile, flat on desktop */}
      <div className="bg-[#121212] border border-[#2a2a2a] rounded-xl overflow-hidden sm:bg-transparent sm:border-0 sm:rounded-none sm:overflow-visible">
        {/* Mobile accordion header */}
        <button
          className="sm:hidden w-full flex items-center justify-between px-4 py-3 min-h-[44px]"
          onClick={() => setSelectorOpen(v => !v)}
        >
          <span className="font-mono text-xs text-[#c6c9ab] uppercase tracking-wider">
            Series disponibles
            {selectedIds.length > 0 && (
              <span className="ml-2 text-[#e2ff00] font-bold">{selectedIds.length} seleccionada{selectedIds.length !== 1 ? 's' : ''}</span>
            )}
          </span>
          <span className="material-symbols-outlined text-[#c6c9ab] text-sm transition-transform" style={{ transform: selectorOpen ? 'rotate(180deg)' : 'none' }}>
            expand_more
          </span>
        </button>

        {/* Chips — always visible on desktop, collapsible on mobile */}
        <div className={`flex flex-wrap gap-2 px-4 pb-4 sm:px-0 sm:pb-0 ${selectorOpen ? 'block' : 'hidden sm:flex'}`}>
          {allSeries.map((s, i) => {
            const color = COLORS[i % COLORS.length];
            const active = selectedIds.includes(s.id);
            return (
              <button
                key={s.id}
                onClick={() => toggleSeries(s.id)}
                className={`flex items-center gap-2 px-3 py-1.5 min-h-[44px] sm:min-h-0 rounded-full font-mono text-xs font-bold border transition-all ${
                  active
                    ? 'text-black'
                    : 'bg-transparent text-[#c6c9ab] border-[#2a2a2a] hover:border-[#3a3a3a] hover:text-white'
                }`}
                style={active ? { backgroundColor: color, borderColor: color } : {}}
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: active ? 'rgba(0,0,0,0.4)' : color }}
                />
                {s.label}
                {s.unit && <span className="opacity-60">({s.unit})</span>}
              </button>
            );
          })}
        </div>
      </div>

      {selectedSeries.length === 0 ? (
        <div className="py-10 text-center border border-dashed border-[#2a2a2a] rounded-xl">
          <p className="font-mono text-xs text-[#c6c9ab]">Selecciona una o más series para visualizar.</p>
        </div>
      ) : (
        <>
          {/* Chart */}
          <div className="bg-[#121212] border border-[#2a2a2a] rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider">
                {multiNorm
                  ? '% relativo por serie (mín=0 % · máx=100 %)'
                  : (selectedSeries[0].unit ? `Valor en ${selectedSeries[0].unit}` : 'Valor')}
              </p>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#c6c9ab', fontSize: 10, fontFamily: 'monospace' }}
                  tickFormatter={fmtDate}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fill: '#c6c9ab', fontSize: 10, fontFamily: 'monospace' }}
                  unit={multiNorm ? '%' : (selectedSeries[0]?.unit ? ` ${selectedSeries[0].unit}` : '')}
                  width={multiNorm ? 40 : 55}
                  domain={multiNorm ? [0, 100] : (singleDomain ?? ['auto', 'auto'])}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#181818', border: '1px solid #2a2a2a', borderRadius: 8, fontFamily: 'monospace', fontSize: 11 }}
                  labelStyle={{ color: '#e2ff00', marginBottom: 4 }}
                  labelFormatter={(label) => fmtDate(String(label))}
                  formatter={(value: number, name: string, item: { payload?: Record<string, number> }) => {
                    const s = selectedSeries.find(s => s.id === name);
                    if (!s) return [null, name];
                    if (multiNorm) {
                      // Show real value, not normalised %
                      const raw = item.payload?.[`${name}_raw`] ?? value;
                      return [`${Number(raw).toFixed(1)}${s.unit ? ` ${s.unit}` : ''}`, s.label];
                    }
                    return [`${Number(value).toFixed(1)}${s.unit ? ` ${s.unit}` : ''}`, s.label];
                  }}
                />
                {selectedSeries.length > 1 && (
                  <Legend
                    formatter={(value) => {
                      const s = selectedSeries.find(s => s.id === value);
                      return <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#c6c9ab' }}>{s?.label ?? value}</span>;
                    }}
                  />
                )}
                {selectedSeries.map((s, i) => (
                  <Line
                    key={s.id}
                    dataKey={s.id}
                    stroke={COLORS[allSeries.findIndex(a => a.id === s.id) % COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 3, strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                    connectNulls={false}
                    name={s.id}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Pearson result */}
          {correlationResult && (
            <div className={`bg-[#121212] border rounded-xl p-5 space-y-2 ${
              correlationResult.r === null
                ? 'border-[#2a2a2a]'
                : Math.abs(correlationResult.r) > 0.7
                  ? 'border-[#e2ff00]/30'
                  : Math.abs(correlationResult.r) >= 0.4
                    ? 'border-[#fb923c]/30'
                    : 'border-[#2a2a2a]'
            }`}>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#e2ff00] text-sm">functions</span>
                <p className="font-sans font-bold text-sm text-white">Correlación de Pearson</p>
              </div>
              {correlationResult.r === null ? (
                <p className="font-mono text-xs text-[#c6c9ab]">{correlationResult.label}</p>
              ) : (
                <>
                  <div className="flex items-baseline gap-3">
                    <span className="font-mono font-black text-3xl" style={{
                      color: Math.abs(correlationResult.r) > 0.7
                        ? '#e2ff00'
                        : Math.abs(correlationResult.r) >= 0.4
                          ? '#fb923c'
                          : '#c6c9ab',
                    }}>
                      r = {correlationResult.r.toFixed(2)}
                    </span>
                    <span className="font-mono text-xs text-[#c6c9ab]">{correlationResult.label}</span>
                  </div>
                  <p className="font-mono text-[10px] text-[#555]">Correlación ≠ causalidad</p>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
