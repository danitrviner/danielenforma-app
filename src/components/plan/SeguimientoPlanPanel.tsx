import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea,
} from 'recharts';
import type { UserProfile } from '../../types';
import {
  getNutritionProgram, getDietsForAthlete, getDietCompletionLogsForAthlete, getStepsForAthlete,
  getAthleteNutritionConfig, saveNutritionProgram,
} from '../../dbService';
import { getDecisionesPlan, guardarDecisionPlan, type DecisionesPlan } from '../../db/decisionesPlan';
import { useAthleteWeight } from '../../hooks/useAthleteWeight';
import { useConfirm } from '../../hooks/useConfirm';
import { useToast } from '../../hooks/useToast';
import { hoyIsoLocal } from '../../utils/trainingWeek';
import { semanasDelPlan, evaluarPlan, calcularGastoReal, type SemanaDelPlan, type EstadoSemana, type OpcionDeAjuste } from '../../utils/seguimientoPlan';
import { colorFaseNutricion } from '../../utils/roadmapCalendar';
import { phaseTypeDeObjetivo, objetivoDeFase } from '../../utils/objetivoDeFase';
import {
  Icon, Button, Collapsible, EmptyState, Skeleton,
  MARGEN_GRAFICA, ANCHO_EJE_Y, REJILLA_GRAFICA, TICK_GRAFICA, EJE_GRAFICA, TOOLTIP_GRAFICA,
} from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Plan › Objetivo — seguimiento del plan semana a semana (28-10-2026)

   Versión «simplificada» que eligió Dani entre tres maquetas: la decisión de
   la semana arriba (con dos salidas calculadas que no se aplican solas), 4
   datos, la gráfica real vs esperado, una casilla por semana con su detalle y
   la decisión del coach, el porqué del desvío (solo si lo hay) y la tabla
   completa plegada. Todos los números salen de utils/seguimientoPlan.ts.
   ═══════════════════════════════════════════════════════════════════════════ */

const ReferenceAreaAny = ReferenceArea as unknown as React.FC<Record<string, unknown>>;
const DEFAULT_STEP_GOAL = 8000;

const fmt = (n: number, d = 1) => n.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
const sign = (n: number, d = 1) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt(Math.abs(n), d)}`;
const miles = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const fechaCorta = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

const COLOR_ESTADO: Record<EstadoSemana, string> = {
  'en-plan': 'var(--color-success)',
  'por-encima': 'var(--color-danger)',
  'por-debajo': 'var(--color-warning)',
};
const TEXTO_ESTADO: Record<EstadoSemana, string> = {
  'en-plan': 'en plan', 'por-encima': 'por encima', 'por-debajo': 'por debajo',
};

function EstadoTag({ estado }: { estado: EstadoSemana }) {
  return (
    <span className="whitespace-nowrap rounded-control border px-2 py-0.5 font-mono text-caption font-bold uppercase" style={{ color: COLOR_ESTADO[estado], borderColor: COLOR_ESTADO[estado] }}>
      {TEXTO_ESTADO[estado]}
    </span>
  );
}

function Dato({ etiqueta, valor, pie, color }: { etiqueta: string; valor: string; pie?: string; color?: string }) {
  return (
    <div className="rounded-control border border-hairline bg-surface p-3">
      <p className="font-mono text-caption uppercase text-ink-3">{etiqueta}</p>
      <p className="mt-1 font-mono text-title-m font-bold tabular-nums" style={color ? { color } : undefined}>{valor}</p>
      {pie && <p className="font-mono text-caption text-ink-3">{pie}</p>}
    </div>
  );
}

export default function SeguimientoPlanPanel({ athlete }: { athlete: UserProfile }) {
  const email = athlete.email;
  const hoy = hoyIsoLocal();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();

  // Mismas claves que el panel de rendimiento: si ya se abrió, no se lee nada más.
  const { data: program = null, isPending: cargandoPrograma } = useQuery({ queryKey: ['nutritionProgram', email], queryFn: () => getNutritionProgram(email) });
  const { data: dietsRaw = [] } = useQuery({ queryKey: ['dietsForAthlete', email], queryFn: () => getDietsForAthlete(email) });
  const diets = useMemo(() => dietsRaw.filter(d => !d.selfManaged), [dietsRaw]);
  const { data: registros = [] } = useQuery({ queryKey: ['dietCompletionLogsForAthlete', email], queryFn: () => getDietCompletionLogsForAthlete(email) });
  const { data: pasos = [] } = useQuery({ queryKey: ['stepsForAthlete', email], queryFn: () => getStepsForAthlete(email) });
  const { data: config = null } = useQuery({ queryKey: ['athleteNutritionConfig', email], queryFn: () => getAthleteNutritionConfig(email).catch(() => null) });
  const { data: decisiones = {} } = useQuery<DecisionesPlan>({ queryKey: ['decisionesPlan', email], queryFn: () => getDecisionesPlan(email).catch(() => ({})) });
  const { logs: pesos } = useAthleteWeight(email);

  const semanas = useMemo(() => (program ? semanasDelPlan({
    program, diets, pesos, registros, pasos, pasosBase: config?.stepGoal ?? DEFAULT_STEP_GOAL, hoy,
  }) : []), [program, diets, pesos, registros, pasos, config?.stepGoal, hoy]);
  // El gasto real de la app (4 semanas, días suficientes, aviso de infra-registro).
  const gasto = useMemo(() => calcularGastoReal({ pesos, registros, diets, hasta: hoy }), [pesos, registros, diets, hoy]);
  const ev = useMemo(() => (program ? evaluarPlan(program, semanas, gasto) : null), [program, semanas, gasto]);

  const semanaPorDefecto = semanas.find(s => s.enCurso)?.semana ?? ev?.semana.semana ?? 1;
  const [elegida, setElegida] = useState<number | null>(null);
  const semana = semanas.find(s => s.semana === (elegida ?? semanaPorDefecto));
  const [opcion, setOpcion] = useState(0);
  const [aplicando, setAplicando] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [texto, setTexto] = useState('');

  if (cargandoPrograma) return <Skeleton className="h-64 w-full rounded-surface" />;
  if (!program || semanas.length === 0) {
    return (
      <div className="rounded-surface border border-dashed border-hairline">
        <EmptyState icon="timeline" title="Sin periodización." description="Crea el plan en Dietas › Información y aquí verás su seguimiento semana a semana." />
      </div>
    );
  }

  const colorDe = (s: SemanaDelPlan) => {
    const tipo = s.fase.phaseType ?? (() => { const o = objetivoDeFase(program, s.faseIdx)?.tipo; return o ? phaseTypeDeObjetivo(o) : null; })();
    return colorFaseNutricion(tipo);
  };

  const guardarDecision = async (desde: string, t: string) => {
    try {
      const d = await guardarDecisionPlan(email, desde, t);
      queryClient.setQueryData<DecisionesPlan>(['decisionesPlan', email], prev => {
        const next = { ...(prev ?? {}) };
        if (d) next[desde] = d; else delete next[desde];
        return next;
      });
      setEditando(null);
    } catch (err) {
      console.error(err);
      showToast('No se pudo guardar la decisión.', 'error');
    }
  };

  const aplicar = async (op: OpcionDeAjuste) => {
    if (!ev || !await confirm(`¿Aplicar «${op.titulo}»? ${op.detalle}. Se cambia la periodización de ${athlete.displayName}.`)) return;
    setAplicando(true);
    try {
      await saveNutritionProgram(op.programa);
      queryClient.setQueryData(['nutritionProgram', email], op.programa);
      await guardarDecision(ev.semana.desde, op.decision);
      showToast('Plan actualizado.', 'success');
    } catch (err) {
      console.error(err);
      showToast('No se pudo aplicar el cambio.', 'error');
    } finally {
      setAplicando(false);
    }
  };

  // ── Gráfica: una fila por semana ──────────────────────────────────────
  const filas = semanas.map(s => ({
    semana: s.semana,
    esperado: s.esperado,
    franja: s.franja,
    real: s.real,
    ritmo: null as number | null,
  }));
  if (ev?.ritmo != null && ev.finAlRitmo != null) {
    const desde = ev.semana.semana;
    filas.forEach(f => {
      if (f.semana >= desde && f.semana <= ev.semanaFinFase) f.ritmo = Math.round((ev.semana.real! + ev.ritmo! * (f.semana - desde)) * 100) / 100;
    });
  }
  const valores = filas.flatMap(f => [f.real, f.esperado, f.ritmo, ...(f.franja ?? [])]).filter((n): n is number => n != null);
  const dominio: [number, number] = [Math.floor(Math.min(...valores) - 0.5), Math.ceil(Math.max(...valores) + 0.5)];
  const tramos = program.phases.map((f, i) => {
    const s = semanas.filter(x => x.faseIdx === i);
    return { nombre: f.name.split(' — ')[0], desde: s[0]?.semana ?? 0, hasta: s.at(-1)?.semana ?? 0, color: s[0] ? colorDe(s[0]) : 'var(--color-ink-3)' };
  });
  const semanaHoy = semanas.find(s => s.enCurso)?.semana;

  const anterior = semana ? semanas.find(s => s.semana === semana.semana - 1) : undefined;
  const decisionSemana = semana ? decisiones[semana.desde] : undefined;
  const inicio = semanas.find(s => s.real != null)?.real ?? null;
  const objetivoActual = ev?.objetivoFase ?? semanas.at(-1)?.esperado ?? null;

  return (
    <div className="space-y-4">
      <ConfirmDialog />

      {/* 1 · Evaluación de la semana */}
      {ev && (ev.estado === 'en-plan' ? (
        <div className="flex items-center justify-between gap-3 rounded-surface border border-hairline border-l-[3px] border-l-success bg-surface px-4 py-3">
          <p className="font-sans text-body-s font-bold text-ink">
            <span className="font-mono text-caption uppercase text-success">Semana {ev.semana.semana} · </span>
            Dentro del plan{ev.ritmo != null ? ` · ${sign(ev.ritmo, 2)} kg/sem` : ''}
          </p>
          <span className="font-mono text-caption text-ink-3">nada que decidir</span>
        </div>
      ) : (
        <div className="space-y-3 rounded-surface border border-hairline border-l-[3px] bg-surface p-4" style={{ borderLeftColor: COLOR_ESTADO[ev.estado] }}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-mono text-caption uppercase" style={{ color: COLOR_ESTADO[ev.estado] }}>Evaluación · semana {ev.semana.semana}</p>
              <p className="mt-1 font-sans text-title-s font-bold text-ink">
                Va {sign(ev.desvio)} kg {ev.desvio > 0 ? 'por encima' : 'por debajo'} del plan
                {ev.ritmo != null && ev.objetivoFase != null && Math.sign(ev.ritmo) === Math.sign(ev.objetivoFase - ev.semana.real!) ? ', pero va en buena dirección' : ''}
              </p>
            </div>
            {ev.ritmo != null && (
              <span className="rounded-control border px-2 py-0.5 font-mono text-caption font-bold text-ink-2 border-strong">{sign(ev.ritmo, 2)} kg/sem · {Math.min(4, semanas.filter(s => s.real != null).length)} sem</span>
            )}
          </div>
          <p className="font-sans text-body-s leading-relaxed text-ink-2">{ev.explicacion}</p>
          {ev.opciones.length > 0 ? (
            <>
              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Opciones de ajuste">
                {ev.opciones.map((op, i) => (
                  <button
                    key={op.tipo}
                    type="button"
                    role="radio"
                    aria-checked={opcion === i}
                    onClick={() => setOpcion(i)}
                    className={`rounded-control border p-3 text-left transition-colors ${opcion === i ? 'border-accent-line bg-accent-bg' : 'border-hairline bg-raised hover:border-strong'}`}
                  >
                    <p className="font-mono text-caption uppercase text-ink-3">Opción {i + 1} · {op.titulo}</p>
                    <p className="mt-1 font-sans text-body-s text-ink">{op.detalle}</p>
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-caption text-ink-3">Nada cambia hasta que elijas · queda apuntado como decisión de la S{ev.semana.semana}</span>
                <Button size="s" loading={aplicando} loadingLabel="Aplicando" onClick={() => { const op = ev.opciones[opcion] ?? ev.opciones[0]; void aplicar(op); }}>
                  Aplicar opción {Math.min(opcion, ev.opciones.length - 1) + 1}
                </Button>
              </div>
            </>
          ) : (
            <p className="font-mono text-caption text-ink-3">Sin propuesta automática: todavía no hay ritmo suficiente para calcularla.</p>
          )}
        </div>
      ))}

      {/* 2 · Cuatro datos */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Dato
          etiqueta="Objetivo"
          valor={inicio != null && objetivoActual != null ? `${fmt(inicio)} → ${fmt(objetivoActual)}` : '—'}
          pie={ev && inicio != null ? `hoy ${fmt(ev.semana.real!)} · ${sign(ev.semana.real! - inicio)} desde el inicio` : undefined}
        />
        <Dato
          etiqueta="Ritmo real"
          valor={ev?.ritmo != null ? sign(ev.ritmo, 2) : '—'}
          pie={`kg/sem${ev?.ritmoPlan != null ? ` · plan ${sign(ev.ritmoPlan, 2)}` : ''}`}
          color={ev?.ritmo != null && ev.ritmoPlan != null && Math.sign(ev.ritmo) === Math.sign(ev.ritmoPlan) ? 'var(--color-success)' : undefined}
        />
        <Dato
          etiqueta="Dieta"
          valor={ev?.adherencia != null ? `${ev.adherencia} %` : '—'}
          pie="días en kcal · 4 sem"
          color={ev?.adherencia != null && ev.adherencia < 70 ? 'var(--color-warning)' : undefined}
        />
        <Dato
          etiqueta="Pasos"
          valor={ev?.pasosMedios != null ? miles(ev.pasosMedios) : '—'}
          pie={ev?.pasosPlan ? `meta ${miles(ev.pasosPlan)}${ev.pasosMedios != null ? ` · ${Math.round((ev.pasosMedios / ev.pasosPlan) * 100)} %` : ''}` : undefined}
          color={ev?.pasosMedios != null && ev.pasosPlan && ev.pasosMedios < ev.pasosPlan * 0.9 ? 'var(--color-warning)' : undefined}
        />
      </div>

      {/* 3 · Gráfica */}
      <div className="rounded-surface border border-hairline bg-surface p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="flex items-center gap-2 font-sans text-title-s font-bold text-ink"><Icon name="monitoring" size="m" className="text-accent-ink" />Evolución vs plan</p>
          <span className="font-mono text-caption text-ink-3">media semanal</span>
        </div>
        <div style={{ height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={filas} margin={MARGEN_GRAFICA}>
              <CartesianGrid {...REJILLA_GRAFICA} />
              {tramos.map(t => (
                <ReferenceAreaAny key={t.nombre + t.desde} x1={t.desde} x2={t.hasta} fill={t.color} fillOpacity={0.05} ifOverflow="hidden"
                  label={{ value: t.nombre.toUpperCase(), position: 'insideTopLeft', fill: t.color, fontSize: 10 }} />
              ))}
              <XAxis dataKey="semana" tickFormatter={(s: number) => `S${s}`} tick={TICK_GRAFICA} {...EJE_GRAFICA} minTickGap={16} />
              <YAxis domain={dominio} width={ANCHO_EJE_Y} tick={TICK_GRAFICA} {...EJE_GRAFICA} />
              <Tooltip
                {...TOOLTIP_GRAFICA}
                labelFormatter={(s: unknown) => `Semana ${s}`}
                formatter={(v: unknown, n: unknown) => (Array.isArray(v) ? [`${fmt(v[0])}–${fmt(v[1])} kg`, 'Margen'] : [typeof v === 'number' ? `${fmt(v)} kg` : '—', String(n)])}
              />
              <Area dataKey="franja" name="Margen" stroke="none" fill="var(--color-success)" fillOpacity={0.16} isAnimationActive={false} />
              <Line dataKey="esperado" name="Esperado" stroke="var(--color-ink-3)" strokeDasharray="5 4" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              <Line dataKey="ritmo" name="Al ritmo actual" stroke="var(--color-accent-ink)" strokeDasharray="2 4" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
              <Line dataKey="real" name="Real" stroke="var(--color-accent-ink)" strokeWidth={2.5} dot={{ r: 3, fill: 'var(--color-accent-ink)', stroke: 'none' }} connectNulls isAnimationActive={false} />
              {semanaHoy != null && <ReferenceLine x={semanaHoy} stroke="var(--color-ink-3)" strokeDasharray="2 3" label={{ value: 'HOY', position: 'insideBottomRight', fill: 'var(--color-ink-3)', fontSize: 10 }} />}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-caption text-ink-2">
          <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-3.5 rounded-full bg-accent" />Peso real</span>
          <span className="flex items-center gap-1.5"><span className="inline-block w-3.5 border-t border-dashed border-ink-3" />Esperado</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-3.5 rounded-sm bg-success/40" />Margen del plan</span>
          <span className="flex items-center gap-1.5"><span className="inline-block w-3.5 border-t-2 border-dotted border-accent" />Al ritmo actual</span>
        </div>
      </div>

      {/* 4 · Semanas */}
      <div className="space-y-3 rounded-surface border border-hairline bg-surface p-4">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2 font-sans text-title-s font-bold text-ink"><Icon name="calendar_view_week" size="m" className="text-accent-ink" />Semanas</p>
          <span className="font-mono text-caption text-ink-3">toca una para ver su detalle</span>
        </div>
        <div className="overflow-x-auto pb-1">
          <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${semanas.length}, minmax(44px, 1fr))` }}>
            {tramos.map(t => (
              <div key={t.nombre + t.desde} className="truncate rounded-control border px-2 py-0.5 font-sans text-caption font-bold"
                style={{ gridColumn: `span ${t.hasta - t.desde + 1}`, color: t.color, borderColor: t.color, background: `color-mix(in oklab, ${t.color} 14%, transparent)` }}>
                {t.nombre}
              </div>
            ))}
            {semanas.map(s => {
              const puesta = s.semana === semana?.semana;
              const c = s.estado ? COLOR_ESTADO[s.estado] : undefined;
              return (
                <button
                  key={s.semana}
                  type="button"
                  aria-pressed={puesta}
                  onClick={() => setElegida(s.semana)}
                  className={`rounded-control border px-0.5 py-1.5 text-center transition-colors ${puesta ? 'ring-2 ring-accent' : ''} ${c ? '' : 'border-hairline bg-raised'}`}
                  style={c ? { borderColor: c, background: `color-mix(in oklab, ${c} 22%, transparent)` } : undefined}
                >
                  <span className="block font-mono text-[10px] text-ink-3">S{s.semana}</span>
                  <span className={`block font-mono text-caption font-bold tabular-nums ${s.real != null || s.futura ? 'text-ink' : 'text-ink-3'}`}>{s.real != null ? fmt(s.real) : s.futura && s.esperado != null ? fmt(s.esperado) : '—'}</span>
                  <span className="block font-mono text-[10px] text-ink-3">{s.real != null && s.esperado != null ? sign(s.real - s.esperado) : s.futura ? 'plan' : 'sin peso'}</span>
                </button>
              );
            })}
          </div>
        </div>

        {semana && (
          <div className="space-y-3 border-t border-hairline pt-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-sans text-body-s font-bold text-ink">Semana {semana.semana} · {fechaCorta(semana.desde)} – {fechaCorta(semana.hasta)} <span className="font-normal text-ink-3">· {semana.fase.name.split(' — ')[0]}</span></p>
              {semana.estado ? <EstadoTag estado={semana.estado} /> : <span className="font-mono text-caption text-ink-3">{semana.futura ? 'por venir' : 'sin peso'}</span>}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Dato etiqueta="Peso" valor={semana.real != null ? fmt(semana.real) : '—'} pie={semana.esperado != null ? `esperado ${fmt(semana.esperado)}` : undefined} />
              <Dato etiqueta="Cambio" valor={semana.real != null && anterior?.real != null ? sign(semana.real - anterior.real) : '—'} pie="vs semana anterior" />
              <Dato
                etiqueta="kcal"
                valor={semana.kcalRegistradas != null ? miles(semana.kcalRegistradas) : '—'}
                pie={semana.kcalRegistradas != null && !semana.kcalFiables
                  ? `solo ${semana.diasRegistrados} ${semana.diasRegistrados === 1 ? 'día' : 'días'} · poco fiable`
                  : `plan ${semana.kcalPlan ? miles(semana.kcalPlan) : '—'}${semana.adherencia != null ? ` · ${semana.adherencia} %` : ''}`}
                color={semana.kcalRegistradas != null && !semana.kcalFiables ? 'var(--color-ink-3)' : undefined}
              />
              <Dato etiqueta="Pasos" valor={semana.pasosReales != null ? miles(semana.pasosReales) : '—'} pie={semana.pasosPlan ? `meta ${miles(semana.pasosPlan)}` : undefined} />
            </div>
            {editando === semana.desde ? (
              <div className="space-y-2">
                <textarea
                  autoFocus rows={2} value={texto} onChange={e => setTexto(e.target.value)}
                  placeholder="Qué decides esta semana y por qué…"
                  aria-label={`Decisión de la semana ${semana.semana}`}
                  className="w-full resize-none rounded-control border border-control-line bg-field p-3 font-sans text-body-s text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
                />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="s" onClick={() => setEditando(null)}>Cancelar</Button>
                  <Button size="s" onClick={() => { void guardarDecision(semana.desde, texto); }}>Guardar</Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => { setTexto(decisionSemana?.texto ?? ''); setEditando(semana.desde); }}
                className="flex w-full items-center justify-between gap-3 rounded-control bg-raised px-3 py-2.5 text-left"
              >
                <span className="font-sans text-body-s text-ink">
                  <span className="font-mono text-caption uppercase text-ink-3">Decisión · </span>
                  {decisionSemana?.texto ?? <span className="text-ink-3">Sin apuntar</span>}
                </span>
                <span className="flex-shrink-0 font-mono text-caption text-accent-ink">{decisionSemana ? 'editar' : 'apuntar'}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* 5 · Por qué se desvía (solo si se desvía) */}
      {ev && ev.estado !== 'en-plan' && (
        <div className="space-y-2 rounded-surface border border-hairline bg-surface p-4">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-2 font-sans text-title-s font-bold text-ink"><Icon name="fact_check" size="m" className="text-accent-ink" />Por qué se desvía</p>
            <span className="font-mono text-caption text-ink-3">últimas 4 semanas</span>
          </div>
          <div className="grid gap-x-6 gap-y-1.5 font-mono text-label sm:grid-cols-2">
            <div className="flex justify-between"><span className="text-ink-2">kcal registradas</span><b className="text-ink">{ev.kcalRegistradas != null ? miles(ev.kcalRegistradas) : '—'}{ev.kcalRegistradas != null && ev.kcalPlan ? <span className={ev.kcalRegistradas > ev.kcalPlan ? 'text-danger' : 'text-success'}> ({sign(ev.kcalRegistradas - ev.kcalPlan, 0)})</span> : null}</b></div>
            <div className="flex justify-between"><span className="text-ink-2">kcal pautadas</span><b className="text-ink">{ev.kcalPlan ? miles(ev.kcalPlan) : '—'}</b></div>
            <div className="flex justify-between"><span className="text-ink-2">Adherencia dieta</span><b className="text-ink">{ev.adherencia != null ? `${ev.adherencia} %` : '—'}</b></div>
            <div className="flex justify-between"><span className="text-ink-2">Mantenimiento observado</span><b className="text-ink">{ev.mantenimientoObservado != null ? `~${miles(ev.mantenimientoObservado)}` : '—'}</b></div>
            <div className="flex justify-between"><span className="text-ink-2">Pasos vs meta</span><b className="text-ink">{ev.pasosMedios != null && ev.pasosPlan ? `${Math.round((ev.pasosMedios / ev.pasosPlan) * 100)} %` : '—'}</b></div>
            <div className="flex justify-between"><span className="text-ink-2">Días registrados</span><b className="text-ink">{semanas.filter(x => !x.futura).slice(-4).reduce((t, x) => t + x.diasRegistrados, 0)} de 28</b></div>
          </div>
          <p className="font-mono text-caption text-ink-3">
            {gasto.sospechaInfraRegistro
              ? 'Parece que registra de menos: el mantenimiento sale muy por debajo de la fórmula, así que no se enseña como real.'
              : ev.mantenimientoObservado == null
                ? 'Faltan semanas con 5 días registrados para calcular el mantenimiento real.'
                : 'Mantenimiento observado = lo que come menos lo que explica el cambio de peso (7.700 kcal/kg), con semanas de 5 días registrados o más.'}
          </p>
        </div>
      )}

      {/* 6 · Tabla completa, plegada */}
      <div className="rounded-surface border border-hairline bg-surface p-4">
        <Collapsible trigger={<span className="flex items-center gap-2 font-sans text-title-s font-bold text-ink"><Icon name="list" size="m" className="text-accent-ink" />Tabla completa semana a semana</span>}>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse font-mono text-label">
              <thead>
                <tr className="text-caption uppercase text-ink-3">
                  {['Semana', 'kcal plan', 'kcal reg.', 'Pasos plan', 'Pasos', 'Esperado', 'Real', 'Δ', 'Dieta', 'Estado', 'Decisión'].map((h, i) => (
                    <th key={h} className={`border-b border-hairline px-1.5 py-1.5 font-medium ${i === 0 || i === 10 ? 'text-left' : 'text-right'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {semanas.map(s => (
                  <tr key={s.semana} className={`${s.enCurso ? 'bg-accent-bg' : ''} ${s.futura ? 'text-ink-3' : 'text-ink-2'}`}>
                    <td className="whitespace-nowrap border-b border-hairline px-1.5 py-1.5"><span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: colorDe(s) }} />S{s.semana}</td>
                    <td className="border-b border-hairline px-1.5 py-1.5 text-right">{s.kcalPlan ? miles(s.kcalPlan) : '—'}</td>
                    <td className="border-b border-hairline px-1.5 py-1.5 text-right">{s.kcalRegistradas != null ? miles(s.kcalRegistradas) : '—'}</td>
                    <td className="border-b border-hairline px-1.5 py-1.5 text-right">{s.pasosPlan ? miles(s.pasosPlan) : '—'}</td>
                    <td className="border-b border-hairline px-1.5 py-1.5 text-right">{s.pasosReales != null ? miles(s.pasosReales) : '—'}</td>
                    <td className="border-b border-hairline px-1.5 py-1.5 text-right">{s.esperado != null ? fmt(s.esperado) : '—'}</td>
                    <td className="border-b border-hairline px-1.5 py-1.5 text-right font-bold text-ink">{s.real != null ? fmt(s.real) : '—'}</td>
                    <td className="border-b border-hairline px-1.5 py-1.5 text-right" style={s.estado ? { color: COLOR_ESTADO[s.estado] } : undefined}>{s.real != null && s.esperado != null ? sign(s.real - s.esperado) : '—'}</td>
                    <td className="border-b border-hairline px-1.5 py-1.5 text-right">{s.adherencia != null ? `${s.adherencia} %` : '—'}</td>
                    <td className="border-b border-hairline px-1.5 py-1.5 text-right">{s.estado ? <EstadoTag estado={s.estado} /> : ''}</td>
                    <td className="border-b border-hairline px-1.5 py-1.5 text-left font-sans text-ink">{decisiones[s.desde]?.texto ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Collapsible>
      </div>
    </div>
  );
}
