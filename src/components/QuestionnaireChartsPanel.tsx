import React, { useState, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Questionnaire, QuestionnaireQuestion, QuestionnaireResponse } from '../types';

interface Props {
  questionnaires: Questionnaire[];
  responses: QuestionnaireResponse[];
}

// ── Data helpers ──────────────────────────────────────────────────────────────

interface DataPoint {
  date: string;   // YYYY-MM-DD
  value: number;
  ts: number;
}

interface WeekPoint {
  date: string;   // Monday YYYY-MM-DD
  value: number;  // average
  count: number;
}

function extractSeries(questionId: string, responses: QuestionnaireResponse[]): DataPoint[] {
  const pts: DataPoint[] = [];
  for (const r of responses) {
    const ans = r.answers.find(a => a.questionId === questionId);
    if (ans === undefined || typeof ans.value !== 'number') continue;
    pts.push({ date: r.submittedAt.slice(0, 10), value: ans.value, ts: new Date(r.submittedAt).getTime() });
  }
  return pts.sort((a, b) => a.ts - b.ts);
}

function weekStart(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return d.toISOString().slice(0, 10);
}

function toWeekly(pts: DataPoint[]): WeekPoint[] {
  const map = new Map<string, { sum: number; count: number }>();
  for (const p of pts) {
    const ws = weekStart(p.date);
    const e = map.get(ws) ?? { sum: 0, count: 0 };
    map.set(ws, { sum: e.sum + p.value, count: e.count + 1 });
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { sum, count }]) => ({
      date,
      value: Math.round((sum / count) * 100) / 100,
      count,
    }));
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

// ── Custom tooltip ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltip({ active, payload, unit, weekly }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as (DataPoint | WeekPoint);
  const count = (p as WeekPoint).count;
  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-xs font-mono shadow-xl">
      <p className="text-[#c6c9ab] mb-0.5">
        {weekly ? `Semana del ${fmtDate(p.date)}` : fmtDate(p.date)}
      </p>
      <p className="text-[#e2ff00] font-bold text-sm">
        {p.value}{unit ? ` ${unit}` : ''}
      </p>
      {weekly && count > 1 && (
        <p className="text-[#c6c9ab] mt-0.5">Media de {count} registros</p>
      )}
    </div>
  );
}

// ── Single chart card ─────────────────────────────────────────────────────────

function QuestionChart({
  question, responses, weekly,
}: {
  question: QuestionnaireQuestion;
  responses: QuestionnaireResponse[];
  weekly: boolean;
}) {
  const raw = useMemo(() => extractSeries(question.id, responses), [question.id, responses]);
  const data: (DataPoint | WeekPoint)[] = weekly ? toWeekly(raw) : raw;

  const yMin = question.type === 'scale' ? (question.scaleMin ?? 1) : undefined;
  const yMax = question.type === 'scale' ? (question.scaleMax ?? 10) : undefined;

  if (raw.length === 0) return null;

  return (
    <div className="bg-[#121212] border border-[#2a2a2a] rounded-xl p-4 space-y-3">
      <div>
        <p className="font-sans font-semibold text-white text-sm leading-tight">{question.label}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {question.unit && (
            <span className="font-mono text-[9px] text-[#c6c9ab] bg-[#1a1a1a] border border-[#2a2a2a] px-1.5 py-0.5 rounded">
              {question.unit}
            </span>
          )}
          <span className="font-mono text-[9px] text-[#e2ff00] bg-[#e2ff00]/10 border border-[#e2ff00]/20 px-1.5 py-0.5 rounded flex items-center gap-0.5">
            <span className="material-symbols-outlined" style={{ fontSize: '10px' }}>show_chart</span>
            {question.type}
          </span>
          <span className="font-mono text-[9px] text-[#c6c9ab]">
            {weekly ? `${toWeekly(raw).length} semanas` : `${raw.length} puntos`}
          </span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
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
            domain={yMin !== undefined && yMax !== undefined ? [yMin, yMax] : ['auto', 'auto']}
            tick={{ fill: '#c6c9ab', fontSize: 9, fontFamily: 'monospace' }}
            axisLine={false}
            tickLine={false}
            width={36}
          />
          <Tooltip
            content={(props) => (
              <ChartTooltip {...props} unit={question.unit} weekly={weekly} />
            )}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#e2ff00"
            strokeWidth={2}
            dot={{ fill: '#e2ff00', stroke: '#121212', strokeWidth: 2, r: 3 }}
            activeDot={{ fill: '#e2ff00', stroke: '#121212', strokeWidth: 2, r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Scale end labels */}
      {question.type === 'scale' && (question.scaleMinLabel || question.scaleMaxLabel) && (
        <div className="flex justify-between px-9">
          <span className="font-mono text-[9px] text-[#c6c9ab]">{yMin} – {question.scaleMinLabel}</span>
          <span className="font-mono text-[9px] text-[#c6c9ab]">{question.scaleMaxLabel} – {yMax}</span>
        </div>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function QuestionnaireChartsPanel({ questionnaires, responses }: Props) {
  const [weekly, setWeekly] = useState(false);

  // Collect all graphable questions that have at least one numeric answer
  const graphable = useMemo(() => {
    const result: { question: QuestionnaireQuestion; qTitle: string }[] = [];
    for (const q of questionnaires) {
      for (const question of q.questions) {
        if (question.type !== 'numeric' && question.type !== 'scale') continue;
        const hasData = responses.some(r =>
          r.answers.some(a => a.questionId === question.id && typeof a.value === 'number')
        );
        if (hasData) result.push({ question, qTitle: q.title });
      }
    }
    return result;
  }, [questionnaires, responses]);

  if (graphable.length === 0) return null;

  return (
    <div className="space-y-4">
      {/* Header + toggle */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-sans font-bold text-sm text-white flex items-center gap-2">
          <span className="material-symbols-outlined text-[#e2ff00] text-base">show_chart</span>
          Evolución ({graphable.length} serie{graphable.length !== 1 ? 's' : ''})
        </h3>
        <div className="flex bg-[#121212] border border-[#2a2a2a] rounded-lg p-0.5 gap-0.5">
          {(['Puntos', 'Media semanal'] as const).map((label, i) => (
            <button
              key={label}
              onClick={() => setWeekly(i === 1)}
              className={`px-3 min-h-[44px] rounded-md font-mono text-[10px] uppercase font-bold transition-all ${
                weekly === (i === 1)
                  ? 'bg-[#e2ff00] text-black shadow'
                  : 'text-[#c6c9ab] hover:text-white'
              }`}
            >{label}</button>
          ))}
        </div>
      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {graphable.map(({ question, qTitle }) => (
          <div key={question.id}>
            <p className="font-mono text-[9px] text-[#c6c9ab]/60 uppercase tracking-wider mb-1.5 px-1">
              {qTitle}
            </p>
            <QuestionChart question={question} responses={responses} weekly={weekly} />
          </div>
        ))}
      </div>
    </div>
  );
}
