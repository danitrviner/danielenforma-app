import React, { useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { BodyMetricKey, BODY_METRIC_LABELS, BODY_METRIC_UNITS } from '../types';
import { useBodyMeasurements } from '../hooks/useBodyMeasurements';
import Skeleton from './Skeleton';

// Ficha de mediciones: última medida de cada perímetro + delta desde el
// primer registro + curva completa. Alimentada por bodyMeasurements
// (escrita desde preguntas 'metric' de un cuestionario, o manualmente).
// El peso corporal vive aparte en BodyweightPanel — esta ficha es solo
// perímetros (no incluye 'bodyweight').

interface Props {
  athleteEmail: string;
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

export default function BodyMeasurementsPanel({ athleteEmail }: Props) {
  const { all, loading } = useBodyMeasurements(athleteEmail);
  const [expanded, setExpanded] = useState<BodyMetricKey | null>(null);

  const byMetric = useMemo(() => {
    const map = new Map<BodyMetricKey, { date: string; value: number }[]>();
    for (const m of all) {
      if (m.metricKey === 'bodyweight') continue; // vive en BodyweightPanel
      if (!map.has(m.metricKey)) map.set(m.metricKey, []);
      map.get(m.metricKey)!.push({ date: m.date, value: m.value });
    }
    for (const pts of map.values()) pts.sort((a, b) => a.date.localeCompare(b.date));
    return map;
  }, [all]);

  const metricKeys = [...byMetric.keys()].sort((a, b) => BODY_METRIC_LABELS[a].localeCompare(BODY_METRIC_LABELS[b]));

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-20 rounded-2xl" />
      </div>
    );
  }

  if (metricKeys.length === 0) {
    return (
      <div className="py-10 text-center border border-dashed border-white/7 rounded-2xl px-6">
        <span className="material-symbols-outlined text-4xl text-[#2a2a2a] block mb-2">straighten</span>
        <p className="font-sans font-bold text-white text-sm mb-1">Sin mediciones todavía</p>
        <p className="text-[#c6c9ab] text-xs font-mono max-w-xs mx-auto">
          Asigna el cuestionario "Mediciones" para empezar a registrar perímetros.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {metricKeys.map(key => {
          const pts = byMetric.get(key)!;
          const first = pts[0];
          const last = pts[pts.length - 1];
          const delta = Math.round((last.value - first.value) * 10) / 10;
          const unit = BODY_METRIC_UNITS[key];
          const isOpen = expanded === key;
          return (
            <button
              key={key}
              onClick={() => setExpanded(isOpen ? null : key)}
              className={`text-left bg-[#1e1e1e] border rounded-2xl p-3 space-y-1 transition-all ${isOpen ? 'border-[#fbcb1a]/50' : 'border-white/7 hover:border-white/60'}`}
            >
              <p className="font-mono text-[9px] uppercase tracking-widest text-[#c6c9ab] truncate">{BODY_METRIC_LABELS[key]}</p>
              <p className="font-sans font-black text-lg text-white leading-none">
                {last.value} <span className="text-xs font-normal text-[#c6c9ab]">{unit}</span>
              </p>
              {pts.length > 1 && delta !== 0 && (
                <p className={`font-mono text-[10px] ${delta > 0 ? 'text-[#fb923c]' : 'text-[#86efac]'}`}>
                  {delta > 0 ? '+' : ''}{delta} {unit} desde {fmtDate(first.date)}
                </p>
              )}
            </button>
          );
        })}
      </div>

      {expanded && byMetric.get(expanded)!.length > 1 && (
        <div className="bg-[#181816] border border-white/7 rounded-3xl p-4">
          <p className="font-sans font-semibold text-white text-sm mb-2">{BODY_METRIC_LABELS[expanded]}</p>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={byMetric.get(expanded)} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={fmtDate}
                tick={{ fill: '#c6c9ab', fontSize: 9, fontFamily: 'monospace' }}
                axisLine={{ stroke: '#2a2a2a' }}
                tickLine={false}
                minTickGap={40}
              />
              <YAxis
                tick={{ fill: '#c6c9ab', fontSize: 9, fontFamily: 'monospace' }}
                axisLine={false}
                tickLine={false}
                width={36}
                domain={['auto', 'auto']}
              />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e1e1b', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, fontFamily: 'monospace', fontSize: 11 }}
                labelStyle={{ color: '#fbcb1a', marginBottom: 4 }}
                labelFormatter={(label) => fmtDate(String(label))}
                formatter={(value: number) => [`${value} ${BODY_METRIC_UNITS[expanded]}`, BODY_METRIC_LABELS[expanded]]}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#fbcb1a"
                strokeWidth={2}
                dot={{ fill: '#fbcb1a', stroke: '#121212', strokeWidth: 2, r: 3 }}
                activeDot={{ fill: '#fbcb1a', stroke: '#121212', strokeWidth: 2, r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
