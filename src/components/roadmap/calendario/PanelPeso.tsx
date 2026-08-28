import React, { useState } from 'react';
import { BodyweightLog, NutritionProgram } from '../../../types';
import { getWeekStart, addDays } from '../../../utils/trainingWeek';
import { tendenciaDePeso } from '../../../utils/tendenciaPeso';
import { Icon } from '../../ui';

const W = 360, H = 108, PAD = 12;

/** Alcance temporal del análisis. Va atado al nivel del calendario (Año/Mes)
 *  y al día seleccionado, pero se puede cambiar a mano sin salir del panel. */
export type AlcancePeso = 'semana' | 'mes' | 'anio' | 'todo';

const ETIQUETA: Record<AlcancePeso, string> = {
  semana: 'Semana', mes: 'Mes', anio: 'Año', todo: 'Todo',
};

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function fmtCorto(fecha: string): string {
  const [, m, d] = fecha.split('-');
  return `${Number(d)} ${MESES[Number(m) - 1].slice(0, 3)}`;
}

function diasEntre(a: string, b: string): number {
  return Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000);
}

interface Props {
  bodyweightLogs: BodyweightLog[];
  initialWeight?: number;
  nutritionProgram: NutritionProgram | null;
  /** Hoy en local (YYYY-MM-DD). */
  hoy: string;
  /** Año y mes que el calendario tiene abiertos ahora mismo. */
  anio: number;
  mes: number;
  /** Día seleccionado, si lo hay: ancla la semana analizada. */
  fechaRef: string | null;
  /** Alcance con el que abre, derivado del nivel del calendario. */
  alcanceInicial: AlcancePeso;
  onClose: () => void;
}

/**
 * Desplegable de peso real vs. plan — absorbe el carril "Peso" del timeline
 * horizontal (RoadmapTimeline.tsx) y le añade lo que el carril nunca dio: la
 * tendencia del periodo que estás mirando y su contraste con el ritmo que
 * pide la periodización de nutrición. Solo lectura.
 */
export default function PanelPeso({ bodyweightLogs, initialWeight, nutritionProgram, hoy, anio, mes, fechaRef, alcanceInicial, onClose }: Props) {
  const [alcance, setAlcance] = useState<AlcancePeso>(alcanceInicial);

  const sortedLogs = [...bodyweightLogs].sort((a, b) => a.date.localeCompare(b.date));

  // Serie proyectada por la periodización de nutrición: peso inicial + una
  // meta por fase que la declare. Es la misma que pintaba el timeline.
  const proyectado: { date: string; weight: number; esHito: boolean }[] = [];
  if (nutritionProgram) {
    const inicial = sortedLogs.length > 0 ? sortedLogs[0].weight : initialWeight;
    if (inicial !== undefined) {
      proyectado.push({ date: nutritionProgram.startDate, weight: inicial, esHito: false });
      let cursor = nutritionProgram.startDate;
      for (const fase of nutritionProgram.phases) {
        const fin = addDays(cursor, fase.weeks * 7);
        if (fase.targetWeight !== undefined) proyectado.push({ date: fin, weight: fase.targetWeight, esHito: true });
        cursor = fin;
      }
    }
  }

  /** Peso que el plan predice para una fecha, interpolando entre metas. */
  function pesoPlanEn(fecha: string): number | null {
    if (proyectado.length < 2) return null;
    if (fecha <= proyectado[0].date) return proyectado[0].weight;
    const ultimo = proyectado[proyectado.length - 1];
    if (fecha >= ultimo.date) return ultimo.weight;
    for (let i = 1; i < proyectado.length; i++) {
      const a = proyectado[i - 1], b = proyectado[i];
      if (fecha <= b.date) {
        const total = diasEntre(a.date, b.date);
        if (total === 0) return b.weight;
        return a.weight + (b.weight - a.weight) * (diasEntre(a.date, fecha) / total);
      }
    }
    return null;
  }

  // ── Rango analizado ────────────────────────────────────────────────────────
  const ancla = fechaRef ?? hoy;
  let inicio: string, fin: string, titulo: string;
  if (alcance === 'semana') {
    inicio = getWeekStart(ancla); fin = addDays(inicio, 6);
    titulo = `${fmtCorto(inicio)} — ${fmtCorto(fin)}`;
  } else if (alcance === 'mes') {
    inicio = `${anio}-${String(mes + 1).padStart(2, '0')}-01`;
    fin = `${anio}-${String(mes + 1).padStart(2, '0')}-${String(new Date(anio, mes + 1, 0).getDate()).padStart(2, '0')}`;
    titulo = `${MESES[mes]} ${anio}`;
  } else if (alcance === 'anio') {
    inicio = `${anio}-01-01`; fin = `${anio}-12-31`;
    titulo = String(anio);
  } else {
    const fechas = [...sortedLogs.map(l => l.date), ...proyectado.map(p => p.date)];
    inicio = fechas.length ? fechas.reduce((m, f) => f < m ? f : m) : hoy;
    fin = fechas.length ? fechas.reduce((m, f) => f > m ? f : m) : hoy;
    titulo = `${fmtCorto(inicio)} — ${fmtCorto(fin)}`;
  }

  const logsRango = sortedLogs.filter(l => l.date >= inicio && l.date <= fin);
  const planRango = proyectado.filter(p => p.date >= inicio && p.date <= fin);
  const tend = tendenciaDePeso(logsRango);

  // Ritmo que pide el plan en esta misma ventana — comparar contra otra cosa
  // (p. ej. la fase entera) daría una diferencia que no se ve en la gráfica.
  const planIni = pesoPlanEn(inicio), planFin = pesoPlanEn(fin);
  const semanasRango = Math.max(diasEntre(inicio, fin) / 7, 1 / 7);
  const ritmoPlan = planIni !== null && planFin !== null ? (planFin - planIni) / semanasRango : null;

  const actual = logsRango.at(-1) ?? sortedLogs.at(-1) ?? null;

  const ALCANCES: AlcancePeso[] = ['semana', 'mes', 'anio', 'todo'];

  const selector = (
    <div className="flex items-center gap-0.5 bg-raised rounded-control p-[3px]">
      {ALCANCES.map(a => (
        <button
          key={a} type="button" onClick={() => setAlcance(a)}
          className="rounded-control text-label font-sans px-3 py-1.5 transition-colors"
          style={{
            background: alcance === a ? 'var(--color-track)' : 'transparent',
            color: alcance === a ? 'var(--color-ink)' : 'var(--color-ink-3)',
            fontWeight: alcance === a ? 600 : 400,
          }}
        >
          {ETIQUETA[a]}
        </button>
      ))}
    </div>
  );

  const cerrar = (
    <button type="button" onClick={onClose} className="text-ink-3 hover:text-white transition-colors" aria-label="Cerrar panel de peso">
      <Icon name="close" size="m" />
    </button>
  );

  // Sin nada que dibujar en la ventana: se dice, no se pinta un cero.
  if (logsRango.length === 0 && planRango.length === 0) {
    return (
      <div className="bg-surface border border-hairline rounded-surface p-4 flex flex-wrap items-center gap-4" style={{ animation: 'fade-up 200ms cubic-bezier(0.2,0.8,0.2,1) both' }}>
        {selector}
        <p className="text-label text-ink-3 font-sans">Sin registros de peso en {titulo}.</p>
        <div className="flex-1" />
        {cerrar}
      </div>
    );
  }

  // ── Escalas de la gráfica, acotadas al rango ──────────────────────────────
  const valores = [...logsRango.map(l => l.weight), ...planRango.map(p => p.weight)];
  if (planIni !== null) valores.push(planIni);
  if (planFin !== null) valores.push(planFin);
  const min = Math.min(...valores), max = Math.max(...valores);
  const pad = Math.max(max - min, 1) * 0.18;
  const dMin = min - pad, dMax = max + pad;
  const totalDias = Math.max(1, diasEntre(inicio, fin));
  const x = (f: string) => PAD + (Math.min(Math.max(diasEntre(inicio, f), 0), totalDias) / totalDias) * (W - 2 * PAD);
  const y = (w: number) => H - PAD - ((w - dMin) / (dMax - dMin)) * (H - 2 * PAD);

  const lineaPlan = planIni !== null && planFin !== null
    ? [{ date: inicio, weight: planIni }, ...planRango, { date: fin, weight: planFin }]
      .sort((a, b) => a.date.localeCompare(b.date))
    : [];

  const signo = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(2)}`;
  // Verde = va como el plan (o no hay plan con el que discrepar).
  const desvio = tend && ritmoPlan !== null ? tend.kgPorSemana - ritmoPlan : null;
  const colorTend = desvio === null
    ? 'var(--color-ink)'
    : Math.abs(desvio) <= 0.15 ? 'var(--color-success)' : 'var(--color-warning)';

  return (
    <div className="bg-surface border border-hairline rounded-surface p-4 flex flex-wrap items-center gap-x-5 gap-y-3" style={{ animation: 'fade-up 200ms cubic-bezier(0.2,0.8,0.2,1) both' }}>
      {selector}

      <div className="flex flex-col gap-0.5">
        <span className="font-mono text-caption uppercase tracking-wider text-ink-4">Peso</span>
        <span className="font-mono text-title-m font-semibold text-white">{actual ? `${actual.weight} kg` : '—'}</span>
      </div>

      <div className="flex flex-col gap-0.5">
        <span className="font-mono text-caption uppercase tracking-wider text-ink-4">Tendencia · {titulo}</span>
        {tend
          ? <span className="font-mono text-title-s font-semibold" style={{ color: colorTend }}>{signo(tend.kgPorSemana)} kg/sem</span>
          : <span className="font-mono text-body-s text-ink-4">{logsRango.length === 0 ? 'sin registros' : `${logsRango.length} registro${logsRango.length === 1 ? '' : 's'} — hacen falta 3`}</span>}
      </div>

      {ritmoPlan !== null && (
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-caption uppercase tracking-wider text-ink-4">Ritmo del plan</span>
          <span className="font-mono text-title-s text-ink-2">{signo(ritmoPlan)} kg/sem</span>
        </div>
      )}

      {tend && desvio !== null && (
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-caption uppercase tracking-wider text-ink-4">Desvío</span>
          <span className="font-sans text-body-s font-semibold" style={{ color: colorTend }}>
            {Math.abs(desvio) <= 0.15 ? 'en línea con el plan' : `${signo(desvio)} kg/sem ${desvio > 0 ? 'por encima' : 'por debajo'}`}
          </span>
        </div>
      )}

      <svg width={W} height={H} style={{ flexShrink: 0 }} role="img" aria-label={`Peso en ${titulo}`}>
        {[dMin, (dMin + dMax) / 2, dMax].map(w => (
          <line key={w} x1={0} y1={y(w)} x2={W} y2={y(w)} stroke="var(--color-raised)" strokeWidth={1} />
        ))}
        {lineaPlan.length >= 2 && (
          <polyline points={lineaPlan.map(p => `${x(p.date)},${y(p.weight)}`).join(' ')} fill="none" stroke="var(--color-chart-3)" strokeWidth={2} strokeDasharray="6 3" />
        )}
        {tend && logsRango.length >= 3 && (
          <line
            x1={x(logsRango[0].date)} y1={y(tend.desde)}
            x2={x(logsRango[logsRango.length - 1].date)} y2={y(tend.hasta)}
            stroke={colorTend} strokeWidth={2} opacity={0.85}
          />
        )}
        {planRango.filter(p => p.esHito).map((p, i) => (
          <circle key={`m${i}`} cx={x(p.date)} cy={y(p.weight)} r={3.5} fill="var(--color-chart-3)"><title>Meta: {p.weight} kg</title></circle>
        ))}
        {logsRango.map((l, i) => (
          <circle key={i} cx={x(l.date)} cy={y(l.weight)} r={3} fill="var(--color-accent)" opacity={0.9}><title>{l.date}: {l.weight} kg</title></circle>
        ))}
      </svg>

      <div className="flex items-center gap-4 text-caption font-mono text-ink-3">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--color-accent)' }} />Real</span>
        {tend && <span className="flex items-center gap-1.5"><svg width="16" height="8"><line x1="0" y1="4" x2="16" y2="4" stroke={colorTend} strokeWidth="2" /></svg>Tendencia</span>}
        {lineaPlan.length >= 2 && <span className="flex items-center gap-1.5"><svg width="16" height="8"><line x1="0" y1="4" x2="16" y2="4" stroke="var(--color-chart-3)" strokeWidth="2" strokeDasharray="4 2" /></svg>Plan</span>}
      </div>

      <div className="flex-1" />
      {cerrar}
    </div>
  );
}
