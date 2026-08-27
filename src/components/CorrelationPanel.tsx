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
import { seriesIEAPorGrupo, seriesTonelajePorPatron } from '../utils/stimulusSeries';
import { resumirSerie, ResumenMetrica } from '../utils/progressSummary';
import { mdcDeMetrica } from '../utils/mdc';
import { Sexo } from '../utils/athleteProfileSignals';
import {
  EmptyState, Icon, Select, Sparkline,
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

/* Una FAMILIA es una serie con muchas variantes que antes se pintaban como
   chips sueltos: "1RM: press banca", "1RM: sentadilla", "1RM: peso muerto"…
   Con 30 ejercicios en la biblioteca eso llenaba el selector de decenas de
   chips y hacía la pantalla inservible. Ahora la familia ocupa UN chip y la
   variante se elige en un desplegable. */
type Familia = {
  id: string;
  label: string;
  unit?: string;
  agg: Aggregation;
  variantes: { value: string; label: string; points: DataPoint[] }[];
};

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

/* El resumen es lo que el coach graba y le enseña al atleta. El orden importa:
   lo primero que se ve arriba es lo que más le dice a una persona que lleva
   tres meses entrenando. `mejorSiSube: null` = se muestra el cambio sin
   pintarlo de verde ni de rojo (el peso baja o sube según el objetivo, y la
   app ya no conoce el objetivo — lo decide el coach). */
const TITULARES: { id: string; mejorSiSube: boolean | null }[] = [
  { id: 'us_navy_pct_grasa', mejorSiSube: false },
  { id: 'us_navy_masa_magra', mejorSiSube: true },
  { id: 'metric_cintura',     mejorSiSube: false },
  { id: 'bw_weekly',          mejorSiSube: null },
  { id: 'irc',                mejorSiSube: true },
  { id: 'adherence_weekly',   mejorSiSube: true },
  { id: 'irp',                mejorSiSube: true },
];

const TONO_DIRECCION: Record<ResumenMetrica['direccion'], string> = {
  mejora:  'text-success',
  empeora: 'text-warning',
  neutro:  'text-ink-2',
};

/* Sin `@types/react` en el repo, TS no excluye `key` por su cuenta (mismo
   apaño que Badge/ListRow en el DS). */
function TarjetaTitular({ r }: { r: ResumenMetrica; key?: React.Key }) {
  const signo = r.delta > 0 ? '+' : '';
  return (
    <div className="bg-surface border border-hairline rounded-canvas p-4 flex flex-col gap-3">
      <p className="font-sans text-caption text-ink-2 uppercase tracking-wider truncate">{r.label}</p>
      <div className="flex items-baseline gap-2">
        <span className="font-mono font-extrabold text-display text-white leading-none">{r.ultimo}</span>
        {r.unit && <span className="font-sans text-label text-ink-2">{r.unit}</span>}
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className={`font-mono text-body-s font-bold ${TONO_DIRECCION[r.direccion]}`}>
          {signo}{r.delta}{r.unit ? ` ${r.unit}` : ''}
          {r.deltaPct != null && <span className="opacity-70"> ({signo}{r.deltaPct}%)</span>}
        </div>
        {r.chispa.length > 1 && <Sparkline values={r.chispa} label={`Evolución de ${r.label}`} />}
      </div>
      <p className="font-mono text-caption text-ink-3">
        Desde {fmtDate(r.desde)} · {r.puntos} medicion{r.puntos === 1 ? '' : 'es'}
      </p>
    </div>
  );
}

export default function CorrelationPanel({
  athleteEmail, logs, exercises, responses, questionnaires, bodyweightLogs, assignments, sexo,
}: Props) {
  const [vista, setVista] = useState<'resumen' | 'explorar'>('resumen');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectorOpen, setSelectorOpen] = useState(false);
  // Variante elegida de cada familia (familiaId -> value). Se conserva al
  // deseleccionar/reseleccionar la familia: si el coach estaba mirando el
  // press banca, al volver sigue en press banca.
  const [variantePorFamilia, setVariantePorFamilia] = useState<Record<string, string>>({});
  // Semanal por defecto: un cuestionario semanal vs. entrenos diarios casi
  // nunca cae en la misma fecha exacta — a nivel semana sí se puede cruzar.
  const [granularity, setGranularity] = useState<Granularity>('week');

  const { data: stepLogs = [] } = useQuery({
    queryKey: ['stepsForAthlete', athleteEmail],
    queryFn: () => getStepsForAthlete(athleteEmail),
  });
  const { all: bodyMeasurements, latest: latestBodyMeasurements } = useBodyMeasurements(athleteEmail);

  // ── Series simples (un chip cada una) ────────────────────────────────────
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

    // 3. Questionnaire numeric/scale graphable questions
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

    // 4. Medidas corporales — una serie por perímetro con datos
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

    // 5. Pasos diarios
    if (stepLogs.length > 0) {
      const points = [...stepLogs]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(s => ({ date: s.date, value: s.steps }));
      result.push({ id: 'steps', label: 'Pasos diarios', points, unit: 'pasos', agg: 'sum' });
    }

    // 6. Adherencia semanal (% de entrenos asignados completados esa semana)
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

    // 7. Índices antropométricos + composición corporal (US Navy) por fecha —
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

    // 8. Sueño / estrés suavizados (EWMA) — alternativa a la respuesta cruda
    // de la sección 3, amortigua una mala semana suelta.
    const sueñoEwma = ewmaDeSeñal('wellness.sleep_hours_weekly', responses, questionnaires);
    if (sueñoEwma.length > 0) {
      result.push({ id: 'sueño_ewma', label: 'Horas de sueño (EWMA)', points: sueñoEwma, unit: 'h', agg: 'avg' });
    }
    const estresEwma = ewmaDeSeñal('wellness.stress_weekly', responses, questionnaires);
    if (estresEwma.length > 0) {
      result.push({ id: 'estres_ewma', label: 'Estrés semanal (EWMA)', points: estresEwma, agg: 'avg' });
    }

    // 9. IRP (Índice de Readiness) — sueño × (10 − estrés − DOMS crónico) / 10.
    const irpPoints = historialIRP({ responses, questionnaires });
    if (irpPoints.length > 0) {
      result.push({ id: 'irp', label: 'IRP (readiness)', points: irpPoints, agg: 'avg' });
    }

    return result;
  }, [logs, exercises, responses, questionnaires, bodyweightLogs, bodyMeasurements, latestBodyMeasurements, stepLogs, assignments, sexo]);

  // ── Familias (un chip + desplegable de variante) ─────────────────────────
  const familias = useMemo<Familia[]>(() => {
    const result: Familia[] = [];

    // 1RM estimado por ejercicio. Antes cada ejercicio era su propio chip:
    // con una biblioteca real son decenas de chips que nadie lee.
    const ormMap: Record<string, Record<string, number>> = {};
    for (const log of logs) {
      for (const entry of log.entries) {
        const eid = entry.exerciseId;
        for (const set of entry.sets) {
          if (!set.weight || !set.repsDone) continue;
          const orm = epley(set.weight, set.repsDone);
          if (!ormMap[eid]) ormMap[eid] = {};
          const prev = ormMap[eid][log.date] ?? 0;
          if (orm > prev) ormMap[eid][log.date] = orm;
        }
      }
    }
    const ormVariantes: Familia['variantes'] = [];
    const alomVariantes: Familia['variantes'] = [];
    for (const [eid, byDate] of Object.entries(ormMap)) {
      const nombre = exercises.find(e => e.id === eid)?.name ?? eid;
      const points = Object.entries(byDate)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, value]) => ({ date, value: Math.round(value * 10) / 10 }));
      if (points.length === 0) continue;
      ormVariantes.push({ value: eid, label: nombre, points });

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
        if (alomPoints.length > 0) alomVariantes.push({ value: eid, label: nombre, points: alomPoints });
      }
    }
    // Más sesiones registradas primero: el ejercicio que más se ha hecho es el
    // que mejor cuenta la progresión, y queda preseleccionado por defecto.
    ormVariantes.sort((a, b) => b.points.length - a.points.length || a.label.localeCompare(b.label));
    alomVariantes.sort((a, b) => b.points.length - a.points.length || a.label.localeCompare(b.label));
    if (ormVariantes.length > 0) {
      result.push({ id: 'orm', label: '1RM estimado', unit: 'kg', agg: 'avg', variantes: ormVariantes });
    }
    if (alomVariantes.length > 0) {
      result.push({ id: 'orm_alom', label: '1RM alométrico', agg: 'avg', variantes: alomVariantes });
    }

    // IEA semanal por grupo muscular — estímulo real recibido, no tonelaje
    // bruto (que miente cuando cambia el rango de repeticiones).
    const iea = seriesIEAPorGrupo(logs, exercises);
    if (iea.length > 0) {
      result.push({
        id: 'iea', label: 'Estímulo (IEA)', agg: 'sum',
        variantes: iea.map(s => ({ value: s.group, label: s.label, points: s.points })),
      });
    }

    // Tonelaje semanal por patrón de movimiento.
    const patrones = seriesTonelajePorPatron(logs, exercises);
    if (patrones.length > 0) {
      result.push({
        id: 'patron', label: 'Tonelaje por patrón', unit: 'kg', agg: 'sum',
        variantes: patrones.map(s => ({ value: s.pattern, label: s.label, points: s.points })),
      });
    }

    return result;
  }, [logs, exercises, bodyweightLogs, sexo]);

  const varianteDe = (f: Familia) => variantePorFamilia[f.id] ?? f.variantes[0].value;

  /** La familia, resuelta a la serie concreta que está mirando el coach. */
  const serieDeFamilia = (f: Familia): Series => {
    const v = f.variantes.find(x => x.value === varianteDe(f)) ?? f.variantes[0];
    return { id: f.id, label: `${f.label}: ${v.label}`, points: v.points, unit: f.unit, agg: f.agg };
  };

  // ── Resumen (vista por defecto, cero clics) ──────────────────────────────
  const titulares = useMemo<ResumenMetrica[]>(() => {
    const porId = new Map<string, Series>(allSeries.map(s => [s.id, s]));
    const out: ResumenMetrica[] = [];
    for (const { id, mejorSiSube } of TITULARES) {
      const serie = porId.get(id);
      if (!serie) continue;
      // Los perímetros tienen MDC: un cambio por debajo del umbral es ruido de
      // medición (presión de la cinta, hidratación), no progreso — el resumen
      // no debe cantar victoria por 3 mm.
      const metricKey = id.startsWith('metric_') ? id.slice('metric_'.length) : null;
      const umbralRuido = metricKey ? (mdcDeMetrica(metricKey as BodyMetricKey) ?? 0) : 0;
      const r = resumirSerie({ id, label: serie.label, unit: serie.unit, points: serie.points, mejorSiSube, umbralRuido });
      if (r) out.push(r);
    }

    // Fuerza: el ejercicio con más sesiones registradas, que ya viene primero
    // en las variantes. Es el que mejor cuenta la progresión sin pedirle al
    // coach que elija nada antes de enseñar la pantalla.
    const ormFam = familias.find(f => f.id === 'orm');
    if (ormFam) {
      const v = ormFam.variantes[0];
      const r = resumirSerie({ id: 'orm_destacado', label: `1RM: ${v.label}`, unit: 'kg', points: v.points, mejorSiSube: true });
      if (r) out.push(r);
    }
    return out;
  }, [allSeries, familias]);

  const toggleSeries = (id: string) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      return [...prev, id];
    });
  };

  // Todo lo seleccionable: series simples + familias resueltas a su variante.
  const seleccionables = useMemo<Series[]>(
    () => [...allSeries, ...familias.map(serieDeFamilia)],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allSeries, familias, variantePorFamilia],
  );

  const rawSelectedSeries = seleccionables.filter(s => selectedIds.includes(s.id));

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

  const hasData = seleccionables.length > 0;
  const multiNorm = selectedSeries.length > 1;

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
            Progreso y correlaciones
          </h2>
          <p className="font-sans text-label text-ink-2 mt-1">
            {vista === 'resumen'
              ? 'El avance del atleta de un vistazo — listo para enseñárselo.'
              : 'Selecciona 1 o más series para visualizar. Con 2 series exactas se calcula Pearson r.'}
          </p>
        </div>
        <div className="flex-shrink-0">
          <SegmentedControl
            options={[{ value: 'resumen', label: 'Resumen' }, { value: 'explorar', label: 'Explorar' }]}
            value={vista}
            onChange={v => setVista(v as 'resumen' | 'explorar')}
            label="Vista"
          />
        </div>
      </div>

      {/* ── RESUMEN ─────────────────────────────────────────────────────── */}
      {vista === 'resumen' && (
        titulares.length === 0 ? (
          <div className="border border-dashed border-hairline rounded-surface">
            <EmptyState
              icon="timeline"
              title="Todavía no hay progreso que enseñar"
              description="Hace falta al menos dos mediciones de la misma métrica para poder mostrar un cambio. En cuanto el atleta rellene «Mediciones» por segunda vez, esta pantalla se llena sola."
            />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {titulares.map(r => <TarjetaTitular key={r.id} r={r} />)}
            </div>
            <p className="font-mono text-caption text-ink-3">
              Cambio desde la primera medición registrada de cada métrica. Los perímetros solo se
              marcan como cambio real cuando superan su margen de error de medición.
            </p>
          </>
        )
      )}

      {/* ── EXPLORAR ────────────────────────────────────────────────────── */}
      {vista === 'explorar' && (
        <>
          <div className="flex justify-end">
            {/* Granularidad — semanal por defecto para poder cruzar cuestionarios
                semanales con datos diarios (entrenos, pasos); diaria disponible
                para cuando ambas series son diarias de verdad. */}
            <SegmentedControl
              options={[{ value: 'week', label: 'Semana' }, { value: 'day', label: 'Día' }]}
              value={granularity}
              onChange={v => setGranularity(v as Granularity)}
              label="Granularidad"
            />
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

            <div className={`px-4 pb-4 sm:px-0 sm:pb-0 space-y-3 ${selectorOpen ? 'block' : 'hidden sm:block'}`}>
              {/* Familias: un chip + su desplegable de variante cuando está activa */}
              {familias.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  {familias.map(f => {
                    const active = selectedIds.includes(f.id);
                    const color = colorSerie(seleccionables.findIndex(s => s.id === f.id));
                    return (
                      <div key={f.id} className="flex items-center gap-2">
                        <button
                          onClick={() => toggleSeries(f.id)}
                          className={`flex items-center gap-2 px-3 py-2 min-h-[44px] sm:min-h-0 rounded-full font-mono text-label font-bold border transition-all ${
                            active ? 'text-black' : 'bg-transparent text-ink-2 border-hairline hover:border-hairline hover:text-white'
                          }`}
                          style={active ? { backgroundColor: color, borderColor: color } : {}}
                        >
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: active ? 'rgba(0,0,0,0.4)' : color }} />
                          {f.label}
                          {f.unit && <span className="opacity-60">({f.unit})</span>}
                        </button>
                        {active && f.variantes.length > 1 && (
                          <div className="w-48">
                            <Select
                              value={varianteDe(f)}
                              onChange={v => setVariantePorFamilia(prev => ({ ...prev, [f.id]: v }))}
                              options={f.variantes.map(v => ({ value: v.value, label: v.label }))}
                              label={f.label}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Series simples */}
              <div className="flex flex-wrap gap-2">
                {allSeries.map(s => {
                  const color = colorSerie(seleccionables.findIndex(x => x.id === s.id));
                  const active = selectedIds.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      onClick={() => toggleSeries(s.id)}
                      className={`flex items-center gap-2 px-3 py-2 min-h-[44px] sm:min-h-0 rounded-full font-mono text-label font-bold border transition-all ${
                        active ? 'text-black' : 'bg-transparent text-ink-2 border-hairline hover:border-hairline hover:text-white'
                      }`}
                      style={active ? { backgroundColor: color, borderColor: color } : {}}
                    >
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: active ? 'rgba(0,0,0,0.4)' : color }} />
                      {s.label}
                      {s.unit && <span className="opacity-60">({s.unit})</span>}
                    </button>
                  );
                })}
              </div>
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
                    {selectedSeries.map(s => (
                      <Line
                        key={s.id}
                        dataKey={s.id}
                        stroke={colorSerie(seleccionables.findIndex(a => a.id === s.id))}
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
        </>
      )}
    </div>
  );
}
