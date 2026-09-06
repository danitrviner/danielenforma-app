import React, { useState, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Questionnaire, QuestionnaireQuestion, QuestionnaireResponse } from '../types';
import {
  Icon, Badge,
  ALTURA_GRAFICA, MARGEN_GRAFICA, ANCHO_EJE_Y, REJILLA_GRAFICA, TICK_GRAFICA, EJE_GRAFICA,
} from './ui';
import { weekKey } from '../utils/seriesCorrelation';

interface Props {
  questionnaires: Questionnaire[];
  responses: QuestionnaireResponse[];
  /**
   * Deja fuera las series de agujetas (DOM's). Decisión de Dani: el atleta no
   * ve esas gráficas — las agujetas no son criterio de que una sesión haya
   * sido buena (ver `ai/doctrina.ts`) y enseñárselas invita justo a leerlas
   * así. El coach SÍ las ve (ClientBodyPanel), que es quien las usa para
   * ajustar volumen (`utils/volumeSuggestion.ts`).
   */
  ocultarDoms?: boolean;
}

/** Una serie de agujetas: por `signalKey` (`doms.<grupo>`) en los
 *  cuestionarios nuevos, y por el título en los que se crearon antes de que
 *  existieran las señales. */
export function esSerieDeAgujetas(question: QuestionnaireQuestion, qTitle: string): boolean {
  if (question.signalKey?.startsWith('doms.')) return true;
  // Con `\b`: sin los límites de palabra, "dom's" casaba dentro de cualquier
  // palabra que lo contuviera y habría escondido de las gráficas un
  // cuestionario que no tiene nada que ver con las agujetas.
  return /\bagujetas\b|\bdom['\u2019]?s\b/i.test(qTitle);
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

function toWeekly(pts: DataPoint[]): WeekPoint[] {
  const map = new Map<string, { sum: number; count: number }>();
  for (const p of pts) {
    const ws = weekKey(p.date);
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

/** ¿Le caen a esta serie dos o más respuestas en una misma semana? Es la
 *  única situación en la que la media semanal dibuja algo distinto a los
 *  puntos sueltos. */
export function serieAgregable(questionId: string, responses: QuestionnaireResponse[]): boolean {
  const raw = extractSeries(questionId, responses);
  return toWeekly(raw).length < raw.length;
}

// ── Custom tooltip ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltip({ active, payload, unit, weekly }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as (DataPoint | WeekPoint);
  const count = (p as WeekPoint).count;
  return (
    <div className="bg-raised border border-hairline rounded-surface px-3 py-2 text-label font-mono shadow-e1">
      <p className="text-ink-2 ">
        {weekly ? `Semana del ${fmtDate(p.date)}` : fmtDate(p.date)}
      </p>
      <p className="text-accent font-bold text-body-s">
        {p.value}{unit ? ` ${unit}` : ''}
      </p>
      {weekly && count > 1 && (
        <p className="text-ink-2 ">Media de {count} registros</p>
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
    <div className="bg-surface border border-hairline rounded-canvas p-4 space-y-3">
      <div>
        <p className="font-sans font-bold text-white text-body-s leading-tight">{question.label}</p>
        <div className="flex items-center gap-2 ">
          {question.unit && <Badge tone="neutral">{question.unit}</Badge>}
          <span className="font-mono text-caption text-ink-2">
            {weekly ? `${toWeekly(raw).length} semanas` : `${raw.length} registro${raw.length === 1 ? '' : 's'}`}
          </span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={ALTURA_GRAFICA.m}>
        <LineChart data={data} margin={MARGEN_GRAFICA}>
          <CartesianGrid {...REJILLA_GRAFICA} />
          <XAxis
            dataKey="date"
            tickFormatter={fmtDate}
            tick={TICK_GRAFICA}
            {...EJE_GRAFICA}
            minTickGap={40}
          />
          <YAxis
            domain={yMin !== undefined && yMax !== undefined ? [yMin, yMax] : ['auto', 'auto']}
            tick={TICK_GRAFICA}
            {...EJE_GRAFICA}
            width={ANCHO_EJE_Y}
          />
          <Tooltip
            content={(props) => (
              <ChartTooltip {...props} unit={question.unit} weekly={weekly} />
            )}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="var(--color-accent)"
            strokeWidth={2}
            dot={{ fill: 'var(--color-accent)', stroke: 'var(--color-bg)', strokeWidth: 2, r: 3 }}
            activeDot={{ fill: 'var(--color-accent)', stroke: 'var(--color-bg)', strokeWidth: 2, r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Scale end labels */}
      {question.type === 'scale' && (question.scaleMinLabel || question.scaleMaxLabel) && (
        <div className="flex justify-between px-10">
          <span className="font-mono text-caption text-ink-2">{yMin} – {question.scaleMinLabel}</span>
          <span className="font-mono text-caption text-ink-2">{question.scaleMaxLabel} – {yMax}</span>
        </div>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function QuestionnaireChartsPanel({ questionnaires, responses, ocultarDoms = false }: Props) {
  const [weekly, setWeekly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Collect all graphable questions that have at least one numeric answer
  const graphable = useMemo(() => {
    const result: { question: QuestionnaireQuestion; qTitle: string }[] = [];
    for (const q of questionnaires) {
      for (const question of q.questions) {
        if (question.type !== 'numeric' && question.type !== 'scale') continue;
        if (ocultarDoms && esSerieDeAgujetas(question, q.title)) continue;
        const hasData = responses.some(r =>
          r.answers.some(a => a.questionId === question.id && typeof a.value === 'number')
        );
        if (hasData) result.push({ question, qTitle: q.title });
      }
    }
    return result;
  }, [questionnaires, responses, ocultarDoms]);

  /* Una sola gráfica con selector, no una rejilla con todas. El cuestionario
     de agujetas solo ya trae 14 zonas (cuádriceps, pectoral, trapecio…): con
     una tarjeta por serie, la pestaña era un scroll infinito de gráficas
     diminutas donde no se leía ninguna. Se elige la serie y se ve grande. */
  const selected = useMemo(
    () => graphable.find(g => g.question.id === selectedId) ?? graphable[0] ?? null,
    [graphable, selectedId]
  );

  /* El interruptor "Puntos / Media semanal" solo aparece si de verdad cambia
     algo, es decir si a la serie elegida le caen DOS o más respuestas en una
     misma semana. Con un cuestionario semanal, quincenal o mensual —que es lo
     normal— la media semanal dibuja exactamente la misma curva, y era un
     botón que no hacía nada. */
  const puedeAgregar = useMemo(
    () => !!selected && serieAgregable(selected.question.id, responses),
    [selected, responses]
  );
  const agregado = weekly && puedeAgregar;

  // Agrupadas por cuestionario para el <select>: con varios asignados, dos
  // series pueden llamarse igual ("Energía") y venir de sitios distintos.
  const porCuestionario = useMemo(() => {
    const map = new Map<string, QuestionnaireQuestion[]>();
    for (const { question, qTitle } of graphable) {
      if (!map.has(qTitle)) map.set(qTitle, []);
      map.get(qTitle)!.push(question);
    }
    return [...map.entries()];
  }, [graphable]);

  if (graphable.length === 0 || !selected) return null;

  return (
    <div className="space-y-4">
      {/* Header + toggle */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-sans font-bold text-title-s text-white flex items-center gap-2">
          <Icon name="show_chart" size="m" className="text-accent" />
          Evolución
          <span className="font-mono text-caption text-ink-2 font-normal">
            {graphable.length} serie{graphable.length !== 1 ? 's' : ''}
          </span>
        </h3>
        {puedeAgregar && (
          <div className="flex bg-surface border border-hairline rounded-surface ">
            {(['Puntos', 'Media semanal'] as const).map((label, i) => (
              <button
                key={label}
                onClick={() => setWeekly(i === 1)}
                className={`px-3 min-h-[44px] rounded-control font-sans text-caption uppercase font-bold transition-all ${
                  weekly === (i === 1)
                    ? 'bg-accent text-black shadow'
                    : 'text-ink-2 hover:text-white'
                }`}
              >{label}</button>
            ))}
          </div>
        )}
      </div>

      {/* Selector de serie */}
      <label className="block">
        <span className="sr-only">Elige qué medida ver</span>
        <select
          value={selected.question.id}
          onChange={e => setSelectedId(e.target.value)}
          className="w-full bg-surface border border-hairline rounded-control px-3 min-h-[44px] font-sans text-body-s text-white focus:outline-none focus:border-accent"
        >
          {porCuestionario.map(([qTitle, preguntas]) => (
            <optgroup key={qTitle} label={qTitle}>
              {preguntas.map(question => (
                <option key={question.id} value={question.id}>{question.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      <div>
        <p className="font-sans text-caption text-ink-2/60 uppercase tracking-wider mb-2 px-1">
          {selected.qTitle}
        </p>
        <QuestionChart question={selected.question} responses={responses} weekly={agregado} />
      </div>
    </div>
  );
}
