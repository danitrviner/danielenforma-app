import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import { WorkoutLog, Exercise, QuestionnaireResponse, Questionnaire, BodyweightLog, WorkoutAssignment, BodyMetricKey, BODY_METRIC_LABELS } from '../types';
import { epley } from '../utils/oneRepMax';
import { getStepsForAthlete } from '../dbService';
import { useBodyMeasurements } from '../hooks/useBodyMeasurements';
import { DataPoint, Aggregation, Granularity, weekKey, toWeeklyBuckets, pearsonAligned } from '../utils/seriesCorrelation';
import { computeAnthropometricIndices, ANTHROPOMETRIC_INDEX_LABELS } from '../utils/anthropometricIndices';
import { pctGrasaUSNavy, masaMagraEstimadaKg, computeIRC } from '../utils/bodyFatUSNavy';
import { e1rmAlometrico, pesoCorporalEn } from '../utils/allometricScore';
import { ewmaDeSeñal } from '../utils/wellnessTrend';
import { historialIRP } from '../utils/readinessIndex';
import { Sexo } from '../utils/athleteProfileSignals';
import {
  EmptyState, Icon,
  ALTURA_GRAFICA, MARGEN_GRAFICA, REJILLA_GRAFICA, TICK_GRAFICA, EJE_GRAFICA,
  TOOLTIP_GRAFICA, LEYENDA_GRAFICA, colorSerie, SegmentedControl,
} from './ui';

interface Props {
  athleteEmail: string;
  logs: WorkoutLog[];
  exercises: Exercise[];
  responses: QuestionnaireResponse[];
  questionnaires: Questionnaire[];
  bodyweightLogs: BodyweightLog[];
  assignments: WorkoutAssignment[];
  sexo: Sexo | null; // de la anamnesis — alimenta %grasa US Navy y el e1RM alométrico
}

type Series = { id: string; label: string; points: DataPoint[]; unit?: string; agg: Aggregation };

/* F10: la lista local de 8 colores tenía tres repetidos —warning, chart-3 y
   data salían dos veces—, así que dos series distintas podían pintarse igual en
   la misma gráfica. Ahora usa `colorSerie`, los 5 tokens del DS. */

function fmtDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' });
  } catch {
    return dateStr;
  }
}

export default function CorrelationPanel({
  athleteEmail, logs, exercises, responses, questionnaires, bodyweightLogs, assignments, sexo,
}: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectorOpen, setSelectorOpen] = useState(false);
  // Semanal por defecto: un cuestionario semanal vs. entrenos diarios casi
  // nunca cae en la misma fecha exacta — a nivel semana sí se puede cruzar.
  const [granularity, setGranularity] = useState<Granularity>('week');

  const { data: stepLogs = [] } = useQuery({
    queryKey: ['stepsForAthlete', athleteEmail],
    queryFn: () => getStepsForAthlete(athleteEmail),
  });
  const { all: bodyMeasurements, latest: latestBodyMeasurements } = useBodyMeasurements(athleteEmail);

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
        agg: 'avg',
      });

      // Weekly average
      const weekPoints = toWeeklyBuckets(sorted.map(b => ({ date: b.date, value: b.weight })), 'avg');
      if (weekPoints.length > 0) {
        result.push({ id: 'bw_weekly', label: 'Peso corporal (media sem.)', points: weekPoints, unit: 'kg', agg: 'avg' });
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
        result.push({ id: 'tonnage', label: 'Tonelaje total', points, unit: 'kg', agg: 'sum' });
      }
    }

    // 3. 1RM estimado per exercise
    const orm1Map: Record<string, Record<string, number>> = {};
    for (const log of logs) {
      for (const entry of log.entries) {
        const eid = entry.exerciseId;
        for (const set of entry.sets) {
          if (!set.weight || !set.repsDone) continue;
          const orm = epley(set.weight, set.repsDone);
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
        result.push({ id: `orm_${eid}`, label: `1RM: ${ex?.name ?? eid}`, points, unit: 'kg', agg: 'avg' });

        // 1RM alométrico (/Peso^b) — corrige el sesgo cuadrado-cubo del 1RM
        // crudo frente al peso corporal. Solo si se conoce el sexo (anamnesis).
        if (sexo) {
          const alomPoints: DataPoint[] = [];
          for (const p of points) {
            const pesoEnFecha = pesoCorporalEn(p.date, bodyweightLogs);
            if (pesoEnFecha == null) continue;
            const alom = e1rmAlometrico(p.value, pesoEnFecha, sexo);
            if (alom != null) alomPoints.push({ date: p.date, value: alom });
          }
          if (alomPoints.length > 0) {
            result.push({ id: `orm_alom_${eid}`, label: `1RM alom.: ${ex?.name ?? eid}`, points: alomPoints, agg: 'avg' });
          }
        }
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
          result.push({ id: `q_${question.id}`, label: `${q.title} › ${question.label}`, points, unit: question.unit, agg: 'avg' });
        }
      }
    }

    // 5. Medidas corporales — una serie por perímetro con datos
    const byMetric = new Map<string, DataPoint[]>();
    for (const m of bodyMeasurements) {
      if (!byMetric.has(m.metricKey)) byMetric.set(m.metricKey, []);
      byMetric.get(m.metricKey)!.push({ date: m.date, value: m.value });
    }
    for (const [metricKey, pts] of byMetric) {
      const sorted = [...pts].sort((a, b) => a.date.localeCompare(b.date));
      result.push({
        id: `metric_${metricKey}`,
        label: BODY_METRIC_LABELS[metricKey as keyof typeof BODY_METRIC_LABELS] ?? metricKey,
        points: sorted,
        unit: 'cm',
        agg: 'avg',
      });
    }

    // 6. Pasos diarios
    if (stepLogs.length > 0) {
      const points = [...stepLogs]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(s => ({ date: s.date, value: s.steps }));
      result.push({ id: 'steps', label: 'Pasos diarios', points, unit: 'pasos', agg: 'sum' });
    }

    // 7. Adherencia semanal (% de entrenos asignados completados esa semana)
    if (assignments.length > 0) {
      const byWeek = new Map<string, { completed: number; total: number }>();
      for (const a of assignments) {
        const wk = weekKey(a.date);
        const entry = byWeek.get(wk) ?? { completed: 0, total: 0 };
        entry.total += 1;
        if (a.status === 'completed') entry.completed += 1;
        byWeek.set(wk, entry);
      }
      const points = [...byWeek.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, { completed, total }]) => ({ date, value: Math.round((completed / total) * 1000) / 10 }));
      if (points.length > 0) {
        result.push({ id: 'adherence_weekly', label: 'Adherencia semanal a entrenos', points, unit: '%', agg: 'avg' });
      }
    }

    // 8. Índices antropométricos + composición corporal (US Navy) por fecha —
    // agrupando bodyMeasurements por fecha de envío (el cuestionario
    // "Mediciones" pide todo el protocolo de una vez, así que un mismo día
    // trae cuello/cintura/cadera/etc. juntos). La altura no se repite (se
    // pregunta una vez en la anamnesis), así que se superpone como valor fijo.
    {
      const alturaCm = latestBodyMeasurements.altura?.value;
      const porFecha = new Map<string, Partial<Record<BodyMetricKey, number>>>();
      for (const m of bodyMeasurements) {
        if (m.metricKey === 'bodyweight' || m.metricKey === 'altura') continue;
        if (!porFecha.has(m.date)) porFecha.set(m.date, {});
        porFecha.get(m.date)![m.metricKey] = m.value;
      }
      const indexSeries: Record<string, DataPoint[]> = {};
      const composicionSeries: Record<'pctGrasa' | 'masaMagra' | 'irc', DataPoint[]> = { pctGrasa: [], masaMagra: [], irc: [] };
      for (const [date, vals] of [...porFecha.entries()].sort(([a], [b]) => a.localeCompare(b))) {
        const latestSnapshot: Partial<Record<BodyMetricKey, { value: number }>> = {};
        for (const [k, v] of Object.entries(vals)) latestSnapshot[k as BodyMetricKey] = { value: v! };
        if (alturaCm != null) latestSnapshot.altura = { value: alturaCm };
        const indices = computeAnthropometricIndices(latestSnapshot as Parameters<typeof computeAnthropometricIndices>[0]);
        for (const [key, v] of Object.entries(indices)) {
          if (v == null) continue;
          if (!indexSeries[key]) indexSeries[key] = [];
          indexSeries[key].push({ date, value: v });
        }

        if (sexo && alturaCm != null && vals.cuello != null && vals.cintura != null) {
          const pesoEnFecha = pesoCorporalEn(date, bodyweightLogs);
          const pctGrasa = pctGrasaUSNavy({ sexo, cuelloCm: vals.cuello, cinturaCm: vals.cintura, caderaCm: vals.cadera, alturaCm });
          if (pctGrasa != null) {
            composicionSeries.pctGrasa.push({ date, value: pctGrasa });
            if (pesoEnFecha != null) {
              const masaMagraKg = masaMagraEstimadaKg(pesoEnFecha, pctGrasa);
              if (masaMagraKg != null) {
                composicionSeries.masaMagra.push({ date, value: masaMagraKg });
                const whtr = indices.whtr;
                if (whtr != null) {
                  const irc = computeIRC(masaMagraKg, whtr);
                  if (irc != null) composicionSeries.irc.push({ date, value: irc });
                }
              }
            }
          }
        }
      }
      for (const [key, points] of Object.entries(indexSeries)) {
        if (points.length > 0) {
          result.push({ id: `idx_${key}`, label: ANTHROPOMETRIC_INDEX_LABELS[key as keyof typeof ANTHROPOMETRIC_INDEX_LABELS], points, agg: 'avg' });
        }
      }
      if (composicionSeries.pctGrasa.length > 0) {
        result.push({ id: 'us_navy_pct_grasa', label: '% Grasa estimado (US Navy)', points: composicionSeries.pctGrasa, unit: '%', agg: 'avg' });
      }
      if (composicionSeries.masaMagra.length > 0) {
        result.push({ id: 'us_navy_masa_magra', label: 'Masa magra estimada', points: composicionSeries.masaMagra, unit: 'kg', agg: 'avg' });
      }
      if (composicionSeries.irc.length > 0) {
        result.push({ id: 'irc', label: 'IRC (recomposición)', points: composicionSeries.irc, agg: 'avg' });
      }
    }

    // 9. Sueño / estrés suavizados (EWMA) — alternativa a la respuesta cruda
    // de la sección 4, amortigua una mala semana suelta.
    const sueñoEwma = ewmaDeSeñal('wellness.sleep_hours_weekly', responses, questionnaires);
    if (sueñoEwma.length > 0) {
      result.push({ id: 'sueño_ewma', label: 'Horas de sueño (EWMA)', points: sueñoEwma, unit: 'h', agg: 'avg' });
    }
    const estresEwma = ewmaDeSeñal('wellness.stress_weekly', responses, questionnaires);
    if (estresEwma.length > 0) {
      result.push({ id: 'estres_ewma', label: 'Estrés semanal (EWMA)', points: estresEwma, agg: 'avg' });
    }

    // 10. IRP (Índice de Readiness) — sueño × (10 − estrés − DOMS crónico) / 10.
    const irpPoints = historialIRP({ responses, questionnaires });
    if (irpPoints.length > 0) {
      result.push({ id: 'irp', label: 'IRP (readiness)', points: irpPoints, agg: 'avg' });
    }

    return result;
  }, [logs, exercises, responses, questionnaires, bodyweightLogs, bodyMeasurements, latestBodyMeasurements, stepLogs, assignments, sexo]);

  const toggleSeries = (id: string) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      return [...prev, id];
    });
  };

  const rawSelectedSeries = allSeries.filter(s => selectedIds.includes(s.id));

  // Series efectivamente graficadas/correlacionadas — a granularidad 'week'
  // se agregan según la semántica propia de cada serie (suma para
  // tonelaje/pasos, media para el resto) antes de dibujar y de correlacionar,
  // así el gráfico y el Pearson de abajo siempre muestran lo mismo.
  const selectedSeries = useMemo<Series[]>(() => {
    if (granularity === 'day') return rawSelectedSeries;
    return rawSelectedSeries.map(s => ({ ...s, points: toWeeklyBuckets(s.points, s.agg) }));
  }, [rawSelectedSeries, granularity]);

  // Build chart data
  const chartData = useMemo(() => {
    if (selectedSeries.length === 0) return [];

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

  // Pearson para exactamente 2 series — sobre los puntos RAW (agrega él
  // mismo según granularidad/agg), no sobre los ya agregados por el gráfico,
  // para no perder precisión ni acoplar el cálculo a la vista.
  const correlationResult = useMemo(() => {
    if (rawSelectedSeries.length !== 2) return null;
    const [a, b] = rawSelectedSeries;
    const result = pearsonAligned(a.points, a.agg, b.points, b.agg, granularity);
    if (result === null) {
      return {
        r: null, n: 0,
        label: `Datos insuficientes (mínimo 3 puntos en común) a granularidad ${granularity === 'week' ? 'semanal' : 'diaria'}${granularity === 'day' ? ' — prueba semanal' : ''}`,
      };
    }
    const abs = Math.abs(result.r);
    let strength: string;
    if (abs > 0.7) strength = 'Correlación fuerte';
    else if (abs >= 0.4) strength = 'Correlación moderada';
    else strength = 'Correlación débil o nula';
    return { r: result.r, n: result.n, label: strength };
  }, [rawSelectedSeries, granularity]);

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
      <div className="border border-dashed border-hairline rounded-surface">
        {/* El texto anterior decía "completa más registros", una instrucción
            dirigida al atleta pero mostrada al coach — se cambia a algo que el
            coach sí puede accionar: asignar/pedir lo que falta. */}
        <EmptyState
          icon="insights"
          title="Sin datos suficientes"
          description="Aún no hay suficientes entrenamientos, pesos o respuestas de cuestionario registrados de este atleta. Asígnale un cuestionario periódico o pídele que registre peso/entrenos para poder calcular correlaciones."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-sans font-bold text-title-m tracking-tight text-white uppercase flex items-center gap-2">
            <Icon name="insights" size="l" filled className="text-accent" />
            Análisis de correlaciones
          </h2>
          <p className="font-sans text-label text-ink-2 mt-1">Selecciona 1 o más series para visualizar. Con 2 series exactas se calcula Pearson r.</p>
        </div>
        {/* Granularidad — semanal por defecto para poder cruzar cuestionarios
            semanales con datos diarios (entrenos, pasos); diaria disponible
            para cuando ambas series son diarias de verdad. */}
        <div className="flex-shrink-0">
          <SegmentedControl
            options={[{ value: 'week', label: 'Semana' }, { value: 'day', label: 'Día' }]}
            value={granularity}
            onChange={v => setGranularity(v as Granularity)}
            label="Granularidad"
          />
        </div>
      </div>

      {/* Series selector — accordion on mobile, flat on desktop */}
      <div className="bg-surface border border-hairline rounded-surface overflow-hidden sm:bg-transparent sm:border-0 sm:rounded-none sm:overflow-visible">
        {/* Mobile accordion header */}
        <button
          className="sm:hidden w-full flex items-center justify-between px-4 py-3 min-h-[44px]"
          onClick={() => setSelectorOpen(v => !v)}
        >
          <span className="font-sans text-label text-ink-2 uppercase tracking-wider">
            Series disponibles
            {selectedIds.length > 0 && (
              <span className="ml-2 text-accent font-bold">{selectedIds.length} seleccionada{selectedIds.length !== 1 ? 's' : ''}</span>
            )}
          </span>
          <span className="material-symbols-outlined text-ink-2 text-body-s transition-transform" style={{ transform: selectorOpen ? 'rotate(180deg)' : 'none' }}>
            expand_more
          </span>
        </button>

        {/* Chips — always visible on desktop, collapsible on mobile */}
        <div className={`flex flex-wrap gap-2 px-4 pb-4 sm:px-0 sm:pb-0 ${selectorOpen ? 'block' : 'hidden sm:flex'}`}>
          {allSeries.map((s, i) => {
            const color = colorSerie(i);
            const active = selectedIds.includes(s.id);
            return (
              <button
                key={s.id}
                onClick={() => toggleSeries(s.id)}
                className={`flex items-center gap-2 px-3 py-2 min-h-[44px] sm:min-h-0 rounded-full font-mono text-label font-bold border transition-all ${
                  active
                    ? 'text-black'
                    : 'bg-transparent text-ink-2 border-hairline hover:border-hairline hover:text-white'
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
        <div className="py-10 text-center border border-dashed border-hairline rounded-surface">
          <p className="font-sans text-label text-ink-2">Selecciona una o más series para visualizar.</p>
        </div>
      ) : (
        <>
          {/* Chart */}
          <div className="bg-surface border border-hairline rounded-canvas p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="font-sans text-caption text-ink-2 uppercase tracking-wider">
                {multiNorm
                  ? '% relativo por serie (mín=0 % · máx=100 %)'
                  : (selectedSeries[0].unit ? `Valor en ${selectedSeries[0].unit}` : 'Valor')}
                {granularity === 'week' ? ' · agregado por semana' : ''}
              </p>
            </div>
            <ResponsiveContainer width="100%" height={ALTURA_GRAFICA.l}>
              <LineChart data={chartData} margin={MARGEN_GRAFICA}>
                <CartesianGrid {...REJILLA_GRAFICA} />
                <XAxis
                  dataKey="date"
                  tick={TICK_GRAFICA}
                  {...EJE_GRAFICA}
                  tickFormatter={fmtDate}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={TICK_GRAFICA}
                  {...EJE_GRAFICA}
                  unit={multiNorm ? '%' : (selectedSeries[0]?.unit ? ` ${selectedSeries[0].unit}` : '')}
                  width={multiNorm ? 40 : 55}
                  domain={multiNorm ? [0, 100] : (singleDomain ?? ['auto', 'auto'])}
                />
                <Tooltip
                  {...TOOLTIP_GRAFICA}
                  labelFormatter={(label) => fmtDate(String(label))}
                  formatter={(value: number, name: string, item: { payload?: Record<string, number> }) => {
                    const s = selectedSeries.find(s => s.id === name);
                    if (!s) return [null, name];
                    if (multiNorm) {
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
                      return <span style={LEYENDA_GRAFICA}>{s?.label ?? value}</span>;
                    }}
                  />
                )}
                {selectedSeries.map((s, i) => (
                  <Line
                    key={s.id}
                    dataKey={s.id}
                    stroke={colorSerie(allSeries.findIndex(a => a.id === s.id))}
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
            <div className={`bg-surface border rounded-canvas p-5 space-y-2 ${
              correlationResult.r === null
                ? 'border-hairline'
                : Math.abs(correlationResult.r) > 0.7
                  ? 'border-accent/30'
                  : Math.abs(correlationResult.r) >= 0.4
                    ? 'border-warning/30'
                    : 'border-hairline'
            }`}>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-accent text-body-s">functions</span>
                <p className="font-sans font-bold text-body-s text-white">Correlación de Pearson</p>
              </div>
              {correlationResult.r === null ? (
                <p className="font-sans text-label text-ink-2">{correlationResult.label}</p>
              ) : (
                <>
                  <div className="flex items-baseline gap-3">
                    <span className="font-mono font-extrabold text-display" style={{
                      color: Math.abs(correlationResult.r) > 0.7
                        ? 'var(--color-accent)'
                        : Math.abs(correlationResult.r) >= 0.4
                          ? 'var(--color-warning)'
                          : 'var(--color-ink-2)',
                    }}>
                      r = {correlationResult.r.toFixed(2)}
                    </span>
                    <span className="font-sans text-label text-ink-2">{correlationResult.label} · n = {correlationResult.n}</span>
                  </div>
                  <p className="font-mono text-caption text-ink-3">Correlación ≠ causalidad</p>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
