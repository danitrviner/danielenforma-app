import React, { useEffect, useMemo, useState } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { Exercise, Mesocycle, WorkoutAssignment, WorkoutLog, BodyweightLog } from '../types';
import { buildCierreMesociclo, FilaVolumenGrupo } from '../utils/cierreMesociclo';
import type {
  FilaAgregada, ProgresionEjercicio, SemanaDelBloque, EstadoEjercicio,
} from '../utils/progresionDelBloque';
import { useMotorCdg } from '../hooks/useMotorCdg';
import { iemDeLogs, filasIEM, type FilaIEM } from '../utils/cdg';
import { Sexo } from '../utils/athleteProfileSignals';
import { e1rmAlometrico, pesoCorporalEn } from '../utils/allometricScore';
import { useToast } from '../hooks/useToast';
import { addDays } from '../utils/trainingWeek';
import {
  Icon, EmptyState, Badge, SegmentedControl, BarraCumplimiento, Chip,
  MARGEN_GRAFICA, ANCHO_EJE_Y, REJILLA_GRAFICA, TICK_GRAFICA, EJE_GRAFICA, TOOLTIP_GRAFICA,
} from './ui';
import TablaGruposPerf from './training/TablaGruposPerf';

/* ═══════════════════════════════════════════════════════════════════════════
   Cierre del mesociclo — solo para el entrenador.

   Responde a las preguntas que se hacen al terminar un bloque: ¿está más
   fuerte?, ¿en qué y cuánto?, ¿lo hizo?, ¿cómo ha ido semana a semana?, ¿qué
   se ha quedado parado? Y deja escrito lo que hay que contarle al cliente.

   Rehecho el 16-11-2026: antes solo comparaba con el mesociclo ANTERIOR, y
   como casi todos los atletas están en su primer bloque, no salía ningún %.
   Ahora la referencia principal es el propio bloque —la primera semana de
   cada ejercicio frente a las últimas— (utils/progresionDelBloque.ts), y la
   comparación con el bloque anterior queda como capa extra cuando existe.

   Todo son cuentas locales sobre los logs del atleta. Sin IA.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  meso: Mesocycle;
  mesocycles: Mesocycle[];
  logs: WorkoutLog[];
  assignments: WorkoutAssignment[];
  exercises: Exercise[];
  athleteName?: string;
  cargando?: boolean;
  // Para el 1RM alométrico y el lastre de dominadas/fondos — null-tolerante.
  sexo?: Sexo | null;
  pesoLogs?: BodyweightLog[];
}

const fmt = (n: number, dec = 1) => n.toLocaleString('es-ES', { maximumFractionDigits: dec });
const conSigno = (n: number) => `${n > 0 ? '+' : ''}${fmt(n)}`;

function colorDelta(pct: number | null | undefined): string {
  if (pct == null) return 'var(--color-ink-3)';
  if (pct >= 2) return 'var(--color-success)';
  if (pct <= -2) return 'var(--color-danger)';
  return 'var(--color-ink-2)';
}

function Tile({ label, value, sub, color = 'var(--color-ink)', icon }: {
  label: string; value: React.ReactNode; sub?: React.ReactNode; color?: string; icon?: string;
}) {
  return (
    <div className="bg-surface border border-hairline rounded-surface px-4 py-3 flex-1 min-w-[150px]">
      <span className="flex items-center gap-1.5 font-mono text-caption text-ink-2 uppercase tracking-[.1em]">
        {icon && <Icon name={icon} size="s" className="text-ink-3" />}
        {label}
      </span>
      <span className="font-mono font-semibold text-title-l tabular-nums block leading-tight mt-0.5" style={{ color }}>{value}</span>
      {sub && <span className="font-mono text-caption text-ink-3 block mt-0.5">{sub}</span>}
    </div>
  );
}

function Seccion({ titulo, icon, extra, children }: {
  titulo: string; icon: string; extra?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section className="bg-surface border border-hairline rounded-surface p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="flex items-center gap-2 font-sans text-title-s font-bold text-ink">
          <Icon name={icon} size="m" className="text-accent-ink" />{titulo}
        </p>
        {extra}
      </div>
      {children}
    </section>
  );
}

type Vista = 'ejercicios' | 'patrones' | 'grupos' | 'volumen' | 'estimulo';

export default function MesocycleReviewPanel({
  meso, mesocycles, logs, assignments, exercises, athleteName, cargando = false,
  sexo = null, pesoLogs = [],
}: Props) {
  const { showToast } = useToast();
  const [vista, setVista] = useState<Vista>('ejercicios');
  const { motor, cargando: cargandoCdg, noSubido } = useMotorCdg();

  // Peso corporal al final del bloque (última medida conocida hasta esa fecha):
  // suma a las series de dominadas/fondos y alimenta el 1RM alométrico.
  const finBloque = useMemo(() => addDays(meso.startDate, meso.weeks * 7 - 1), [meso.startDate, meso.weeks]);
  const pesoEnCierre = useMemo(() => pesoCorporalEn(finBloque, pesoLogs), [finBloque, pesoLogs]);

  const cierre = useMemo(
    () => buildCierreMesociclo({ meso, mesocycles, logs, assignments, exercises, athleteName, pesoCorporalKg: pesoEnCierre }),
    [meso, mesocycles, logs, assignments, exercises, athleteName, pesoEnCierre],
  );
  const prog = cierre.progresion;
  const res = prog.resumen;

  // El borrador se edita aquí mismo antes de copiarlo; vuelve al generado si
  // cambian los datos (otro bloque, logs nuevos).
  const [borrador, setBorrador] = useState(cierre.resumenParaCliente);
  useEffect(() => { setBorrador(cierre.resumenParaCliente); }, [cierre.resumenParaCliente]);

  // Estímulo (IEM de CDG) de las sesiones del bloque.
  const estimulo = useMemo(() => {
    if (!motor) return null;
    const delBloque = logs.filter(l => l.date >= cierre.inicio && l.date <= cierre.fin);
    const nombreCdgDe = (id: string) => exercises.find(e => e.id === id)?.cdgNombre;
    const r = iemDeLogs(motor, delBloque, nombreCdgDe);
    return { filas: filasIEM(motor, r.IEM), sinVinculo: r.sinVinculo.map(id => exercises.find(e => e.id === id)?.name ?? id) };
  }, [motor, logs, cierre.inicio, cierre.fin, exercises]);

  const copiar = async (texto: string, queEs: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      showToast(`${queEs} copiado al portapapeles.`, 'success');
    } catch {
      showToast('El navegador no ha dejado copiar. Selecciona el texto a mano.');
    }
  };

  if (cargando) {
    return <p className="font-mono text-caption text-ink-2">Cargando sesiones registradas…</p>;
  }

  const sinDatos = cierre.informe.sessions === 0;
  const hayAnterior = cierre.comparacion !== 'sin mesociclo previo';
  const adh = cierre.sesiones.adherenciaPct;
  const vol = cierre.volumen.pct;

  return (
    <div className="space-y-4">
      {/* Cabecera */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="font-sans font-bold text-ink text-body-s">
            Cierre del mesociclo #{cierre.numero}{cierre.objetivo ? ` · ${cierre.objetivo}` : ''}
          </p>
          <p className="font-mono text-caption text-ink-2">
            {cierre.inicio} → {cierre.fin} · {cierre.semanas} sem × {cierre.diasSemana} días ·{' '}
            progresión del inicio al final del bloque{hayAnterior ? ` y comparado con ${cierre.comparacion}` : ''}
          </p>
        </div>
        <Badge tone={cierre.enCurso ? 'warning' : 'success'}>
          {cierre.enCurso ? 'En curso' : 'Terminado'}
        </Badge>
      </div>

      {cierre.enCurso && !sinDatos && (
        <div className="flex items-start gap-2 bg-warning/10 border border-warning/30 rounded-surface px-3 py-2.5">
          <Icon name="warning" size="s" className="text-warning flex-shrink-0 mt-px" />
          <p className="font-sans text-caption text-warning leading-relaxed">
            El mesociclo todavía no ha terminado ({cierre.fin}). La progresión compara lo que va registrado hasta hoy
            con su primera semana.
          </p>
        </div>
      )}

      {sinDatos ? (
        <div className="border border-dashed border-hairline rounded-surface">
          <EmptyState
            icon="bar_chart"
            title="Sin sesiones registradas en este mesociclo."
            description="El cierre se calcula con lo que el atleta registra al entrenar. En cuanto haya sesiones aparecerán aquí la progresión de cada ejercicio, el volumen y la adherencia."
          />
        </div>
      ) : (
        <>
          {/* ── Los números de cabecera ── */}
          <div className="flex flex-wrap gap-3">
            <Tile
              icon="trending_up"
              label="Fuerza"
              value={res.medianaPct != null ? `${conSigno(res.medianaPct)}%` : '—'}
              sub={res.comparables > 0
                ? `mejora en ${res.mejoran} de ${res.comparables} ejercicios`
                : 'falta una segunda semana para comparar'}
              color={colorDelta(res.medianaPct)}
            />
            <Tile
              icon="event_available"
              label="Adherencia"
              value={adh != null ? `${adh}%` : '—'}
              sub={cierre.sesiones.programadas > 0
                ? `${cierre.sesiones.completadas}/${cierre.sesiones.programadas} sesiones`
                : `${cierre.sesiones.registradas} sesiones registradas`}
              color={adh == null ? 'var(--color-ink-3)' : adh >= 85 ? 'var(--color-success)' : adh >= 65 ? 'var(--color-warning)' : 'var(--color-danger)'}
            />
            <Tile
              icon="fitness_center"
              label="Volumen hecho"
              value={vol != null ? `${vol}%` : '—'}
              sub={`${cierre.volumen.totalRealizadas} de ${cierre.volumen.totalProgramadas} series`}
              color={vol == null ? 'var(--color-ink-3)' : vol >= 90 ? 'var(--color-success)' : vol >= 70 ? 'var(--color-warning)' : 'var(--color-danger)'}
            />
            <Tile
              icon="monitoring"
              label="Kg por semana"
              value={res.tonelajeSemanal?.deltaPct != null ? `${conSigno(res.tonelajeSemanal.deltaPct)}%` : '—'}
              sub={res.tonelajeSemanal
                ? `${fmt(Math.round(res.tonelajeSemanal.inicio), 0)} → ${fmt(Math.round(res.tonelajeSemanal.final), 0)} kg`
                : `${fmt(cierre.informe.tonnage.current, 0)} kg en total`}
              color={colorDelta(res.tonelajeSemanal?.deltaPct)}
            />
            <Tile
              icon="speed"
              label="RIR medio"
              value={res.rir ? `${fmt(res.rir.inicio)} → ${fmt(res.rir.final)}` : '—'}
              sub={res.rir
                ? res.rir.final < res.rir.inicio - 0.2 ? 'más cerca del fallo'
                  : res.rir.final > res.rir.inicio + 0.2 ? 'más lejos del fallo' : 'esfuerzo parecido'
                : 'sin RIR suficiente'}
            />
          </div>

          {/* ── Lo que hay que contarle ── */}
          {cierre.titulares.length > 0 && (
            <Seccion
              titulo="Lo que hay que contarle"
              icon="campaign"
              extra={(
                <button
                  onClick={() => copiar(cierre.titulares.map(t => `· ${t}`).join('\n'), 'Resumen')}
                  className="flex items-center gap-1 font-sans text-caption font-bold text-accent-ink hover:text-ink transition-colors"
                >
                  <Icon name="content_copy" size="s" />Copiar
                </button>
              )}
            >
              <ul className="space-y-1.5">
                {cierre.titulares.map((t, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-accent-ink font-mono text-caption mt-0.5 flex-shrink-0">·</span>
                    <span className="font-sans text-label text-ink leading-relaxed">{t}</span>
                  </li>
                ))}
              </ul>
            </Seccion>
          )}

          {/* ── Semana a semana ── */}
          <SemanaASemana semanas={prog.semanas} />

          {/* ── Lo mejor / lo que se queda parado ── */}
          <Podio ejercicios={prog.ejercicios} />

          {/* ── Detalle ── */}
          <SegmentedControl
            label="Detalle del cierre"
            value={vista}
            onChange={v => setVista(v as Vista)}
            options={[
              { value: 'ejercicios', label: 'Ejercicios' },
              { value: 'patrones',   label: 'Patrones' },
              { value: 'grupos',     label: 'Grupos' },
              { value: 'volumen',    label: 'Volumen' },
              { value: 'estimulo',   label: 'Estímulo' },
            ]}
          />

          {vista === 'ejercicios' && <ListaEjercicios ejercicios={prog.ejercicios} sexo={sexo} pesoKg={pesoEnCierre} />}
          {vista === 'patrones' && (
            <Agregado
              filas={prog.porPatron}
              vacio="Ningún ejercicio del bloque cae en un patrón de movimiento (empujes, tracciones, brazo, pierna, cadera)."
              anterior={hayAnterior ? cierre.patrones : null}
              comparacion={cierre.comparacion}
            />
          )}
          {vista === 'grupos' && (
            <Agregado
              filas={prog.porGrupo}
              vacio="Los ejercicios del bloque no tienen grupo muscular asignado."
              anterior={hayAnterior ? cierre.informe.muscleGroups : null}
              comparacion={cierre.comparacion}
            />
          )}
          {vista === 'volumen'  && <TablaVolumen filas={cierre.volumen.filas} comparacion={cierre.comparacion} />}
          {vista === 'estimulo' && <TablaEstimulo estimulo={estimulo} cargando={cargandoCdg} noSubido={noSubido} />}

          {/* ── Borrador para el cliente ── */}
          <Seccion
            titulo="Mensaje para el cliente"
            icon="chat"
            extra={(
              <div className="flex items-center gap-3">
                {borrador !== cierre.resumenParaCliente && (
                  <button
                    onClick={() => setBorrador(cierre.resumenParaCliente)}
                    className="font-sans text-caption font-bold text-ink-2 hover:text-ink transition-colors"
                  >
                    Restaurar
                  </button>
                )}
                <button
                  onClick={() => copiar(borrador, 'Mensaje')}
                  className="flex items-center gap-1 font-sans text-caption font-bold text-accent-ink hover:text-ink transition-colors"
                >
                  <Icon name="content_copy" size="s" />Copiar
                </button>
              </div>
            )}
          >
            <textarea
              value={borrador}
              onChange={e => setBorrador(e.target.value)}
              rows={Math.min(16, Math.max(6, borrador.split('\n').length + 1))}
              aria-label="Mensaje para el cliente"
              className="w-full font-sans text-label text-ink leading-relaxed bg-bg border border-hairline rounded-control p-3 resize-y focus:outline-none focus:border-accent"
            />
            <p className="font-mono text-caption text-ink-3">
              Escrito con sus propios datos. Edítalo aquí antes de copiarlo.
            </p>
          </Seccion>
        </>
      )}
    </div>
  );
}

// ── Semana a semana ─────────────────────────────────────────────────────────

function SemanaASemana({ semanas }: { semanas: SemanaDelBloque[] }) {
  const datos = semanas.map(s => ({
    semana: s.semana,
    tonelaje: s.tonelaje > 0 ? Math.round(s.tonelaje) : null,
    fuerza: s.indiceFuerza,
  }));
  const hayFuerza = semanas.some(s => s.indiceFuerza != null);
  const fuerzas = semanas.map(s => s.indiceFuerza).filter((x): x is number => x != null);
  const dominioFuerza: [number, number] = fuerzas.length
    ? [Math.floor(Math.min(95, ...fuerzas) / 5) * 5, Math.ceil(Math.max(105, ...fuerzas) / 5) * 5]
    : [90, 110];

  return (
    <Seccion titulo="Semana a semana" icon="monitoring">
      {semanas.length >= 2 && (
        <>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={datos} margin={{ ...MARGEN_GRAFICA, right: 4 }}>
                <CartesianGrid {...REJILLA_GRAFICA} />
                <XAxis dataKey="semana" tickFormatter={(s: number) => `S${s}`} tick={TICK_GRAFICA} {...EJE_GRAFICA} />
                <YAxis
                  yAxisId="t" width={ANCHO_EJE_Y + 6} tick={TICK_GRAFICA} {...EJE_GRAFICA}
                  tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                />
                {hayFuerza && (
                  <YAxis yAxisId="f" orientation="right" width={ANCHO_EJE_Y} domain={dominioFuerza} tick={TICK_GRAFICA} {...EJE_GRAFICA} />
                )}
                <Tooltip
                  {...TOOLTIP_GRAFICA}
                  labelFormatter={(s: unknown) => `Semana ${s}`}
                  formatter={(v: unknown, n: unknown) => (
                    n === 'tonelaje'
                      ? [typeof v === 'number' ? `${fmt(v, 0)} kg` : '—', 'Kg movidos']
                      : [typeof v === 'number' ? `${fmt(v)} (${conSigno(v - 100)}%)` : '—', 'Índice de fuerza']
                  )}
                />
                <Bar yAxisId="t" dataKey="tonelaje" fill="var(--color-track)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                {hayFuerza && <ReferenceLine yAxisId="f" y={100} stroke="var(--color-ink-3)" strokeDasharray="3 3" />}
                {hayFuerza && (
                  <Line
                    yAxisId="f" dataKey="fuerza" stroke="var(--color-accent-ink)" strokeWidth={2.5}
                    dot={{ r: 3, fill: 'var(--color-accent-ink)', stroke: 'none' }} connectNulls isAnimationActive={false}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-caption text-ink-2">
            <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-3 rounded-sm bg-track" />Kg movidos en la semana</span>
            {hayFuerza && (
              <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-3.5 rounded-full bg-accent" />Índice de fuerza (100 = semana 1 de cada ejercicio)</span>
            )}
          </div>
        </>
      )}

      {/* Tira de semanas: sesiones, RIR y duración */}
      <div className="overflow-x-auto -mx-1 px-1">
        <div className="flex gap-1.5 min-w-max">
          {semanas.map(s => {
            const completa = s.sesionesProgramadas > 0 && s.sesionesHechas >= s.sesionesProgramadas;
            const vacia = s.sesionesHechas === 0 && !s.enCurso;
            return (
              <div
                key={s.semana}
                className={`w-[84px] flex-shrink-0 rounded-control border px-2 py-1.5 ${vacia ? 'border-danger/40 bg-danger/5' : 'border-hairline bg-bg'}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-caption font-bold text-ink">S{s.semana}</span>
                  {s.esDescarga
                    ? <span className="font-mono text-[11px] text-ink-3">desc.</span>
                    : s.enCurso && <span className="font-mono text-[11px] text-warning">hoy</span>}
                </div>
                <span className={`block font-mono text-caption tabular-nums ${vacia ? 'text-danger' : completa ? 'text-success' : 'text-ink'}`}>
                  {s.sesionesHechas}{s.sesionesProgramadas > 0 ? `/${s.sesionesProgramadas}` : ''} ses.
                </span>
                <span className="block font-mono text-caption text-ink-3 tabular-nums">
                  RIR {s.rirMedio != null ? fmt(s.rirMedio) : '—'}
                </span>
                {s.duracionMediaMin != null && (
                  <span className="block font-mono text-caption text-ink-3 tabular-nums">{s.duracionMediaMin} min</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Seccion>
  );
}

// ── Podio: lo mejor y lo que se queda parado ───────────────────────────────

function Podio({ ejercicios }: { ejercicios: ProgresionEjercicio[] }) {
  const mejores = ejercicios.filter(e => e.estado === 'mejora').slice(0, 5);
  const parados = ejercicios
    .filter(e => e.estado === 'baja' || (e.estado === 'estable' && e.semanasConDatos >= 3))
    .sort((a, b) => (a.deltaPct ?? 0) - (b.deltaPct ?? 0))
    .slice(0, 5);
  if (mejores.length === 0 && parados.length === 0) return null;

  const fila = (e: ProgresionEjercicio) => (
    <li key={e.exerciseId} className="flex items-start justify-between gap-3 py-2 border-b border-hairline last:border-b-0">
      <div className="min-w-0">
        <p className="font-sans text-label text-ink truncate">{e.nombre}</p>
        <p className="font-mono text-caption text-ink-2 tabular-nums">{e.lectura}</p>
        {e.comoMejora && <p className="font-sans text-caption text-ink-3">{e.comoMejora}</p>}
      </div>
      <span className="font-mono text-label font-bold tabular-nums flex-shrink-0" style={{ color: colorDelta(e.deltaPct) }}>
        {e.deltaPct != null ? `${conSigno(e.deltaPct)}%` : '—'}
      </span>
    </li>
  );

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Seccion titulo="Lo que más ha subido" icon="military_tech">
        {mejores.length > 0
          ? <ul>{mejores.map(fila)}</ul>
          : <p className="font-sans text-caption text-ink-3">Ningún ejercicio sube más de un 2 % todavía.</p>}
      </Seccion>
      <Seccion titulo="Parado o a la baja" icon="report">
        {parados.length > 0
          ? <ul>{parados.map(fila)}</ul>
          : <p className="font-sans text-caption text-ink-3">Nada parado: todo lo que se ha repetido varias semanas ha subido.</p>}
      </Seccion>
    </div>
  );
}

// ── Lista de ejercicios ─────────────────────────────────────────────────────

function MiniLinea({ valores }: { valores: (number | null)[] }) {
  const puntos = valores.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v != null);
  if (puntos.length < 2) return <span className="block w-[88px] h-6" />;
  const W = 88, H = 24, pad = 2;
  const min = Math.min(...puntos.map(p => p.v));
  const max = Math.max(...puntos.map(p => p.v));
  const rango = max - min || 1;
  const x = (i: number) => pad + (i / Math.max(1, valores.length - 1)) * (W - pad * 2);
  const y = (v: number) => H - pad - ((v - min) / rango) * (H - pad * 2);
  const d = puntos.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const ultimo = puntos[puntos.length - 1];
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" className="flex-shrink-0">
      <path d={d} fill="none" stroke="var(--color-accent-ink)" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(ultimo.i)} cy={y(ultimo.v)} r={2.5} fill="var(--color-accent-ink)" />
    </svg>
  );
}

const FILTROS: { valor: EstadoEjercicio | 'todos'; label: string }[] = [
  { valor: 'todos', label: 'Todos' },
  { valor: 'mejora', label: 'Mejoran' },
  { valor: 'estable', label: 'Estables' },
  { valor: 'baja', label: 'Bajan' },
  { valor: 'sin_referencia', label: 'Sin comparar' },
];

function ListaEjercicios({ ejercicios, sexo, pesoKg }: {
  ejercicios: ProgresionEjercicio[]; sexo: Sexo | null; pesoKg: number | null;
}) {
  const [filtro, setFiltro] = useState<EstadoEjercicio | 'todos'>('todos');
  if (ejercicios.length === 0) {
    return <p className="font-sans text-caption text-ink-3">Sin ejercicios registrados en la ventana del mesociclo.</p>;
  }
  const cuenta = (v: EstadoEjercicio | 'todos') => (v === 'todos' ? ejercicios.length : ejercicios.filter(e => e.estado === v).length);
  const visibles = filtro === 'todos' ? ejercicios : ejercicios.filter(e => e.estado === filtro);
  const alometrico = sexo != null && pesoKg != null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {FILTROS.filter(f => f.valor === 'todos' || cuenta(f.valor) > 0).map(f => (
          <Chip key={f.valor} selected={filtro === f.valor} onClick={() => setFiltro(f.valor)}>
            {f.label} · {cuenta(f.valor)}
          </Chip>
        ))}
      </div>

      <ul className="rounded-surface border border-hairline divide-y divide-hairline bg-surface">
        {visibles.map(e => (
          <li key={e.exerciseId} className="px-3 py-3 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 min-w-0">
                <p className="font-sans text-label font-bold text-ink truncate">{e.nombre}</p>
                {e.pico && e.final && e.pico.fecha !== e.final.fecha && e.estado !== 'mejora' && (
                  <Badge tone="neutral">pico S{e.pico.semana}</Badge>
                )}
              </div>
              <p className="font-mono text-caption text-ink-3">
                {e.grupoLabel} · {e.sesiones} ses. · {e.series} series · {e.semanasConDatos} sem.
              </p>
              {e.lectura ? (
                <p className="font-mono text-caption text-ink tabular-nums mt-0.5">
                  {e.lectura}
                  {e.metrica === 'e1rm' && e.inicio && e.final && (
                    <span className="text-ink-3"> · 1RM est. {fmt(e.inicio.e1rm)} → {fmt(e.final.e1rm)} kg</span>
                  )}
                  {alometrico && e.metrica === 'e1rm' && e.final && (
                    <span className="text-ink-3"> · alom. {e1rmAlometrico(e.final.e1rm, pesoKg!, sexo!) ?? '—'}</span>
                  )}
                </p>
              ) : (
                <p className="font-mono text-caption text-ink-3 mt-0.5">Sin series con peso y repeticiones válidas.</p>
              )}
              {e.comoMejora && <p className="font-sans text-caption text-ink-2">{e.comoMejora}</p>}
            </div>
            <MiniLinea valores={e.semanal} />
            <div className="w-[64px] text-right flex-shrink-0">
              {e.deltaPct != null ? (
                <span className="font-mono text-label font-bold tabular-nums" style={{ color: colorDelta(e.deltaPct) }}>
                  {conSigno(e.deltaPct)}%
                </span>
              ) : (
                <span className="font-mono text-caption text-ink-3" title="Hace falta que aparezca en dos semanas distintas">1 sem.</span>
              )}
              <span className="block font-mono text-caption text-ink-3">{e.metrica === 'e1rm' ? '1RM est.' : 'reps'}</span>
            </div>
          </li>
        ))}
      </ul>
      <p className="font-mono text-caption text-ink-3">
        Se compara la mejor serie de la primera semana en que aparece cada ejercicio con la mejor de sus dos últimas
        semanas (sin contar descargas). 1RM estimado con la fórmula CDG, que tiene en cuenta el RIR: subir reps o
        dejar más margen con el mismo peso también cuenta como mejora.
        {alometrico ? ` 1RM alométrico con ${pesoKg} kg de peso corporal.` : ''}
      </p>
    </div>
  );
}

// ── Patrones y grupos ──────────────────────────────────────────────────────

function Agregado<K extends string>({ filas, vacio, anterior, comparacion }: {
  filas: FilaAgregada<K>[];
  vacio: string;
  anterior: React.ComponentProps<typeof TablaGruposPerf>['grupos'] | null;
  comparacion: string;
}) {
  if (filas.length === 0) return <p className="font-sans text-caption text-ink-3">{vacio}</p>;
  const maxAbs = Math.max(5, ...filas.map(f => Math.abs(f.deltaMedioPct ?? 0)));
  return (
    <div className="space-y-4">
      <ul className="rounded-surface border border-hairline divide-y divide-hairline bg-surface">
        {filas.map(f => {
          const d = f.deltaMedioPct;
          const ancho = d != null ? (Math.abs(d) / maxAbs) * 50 : 0;
          return (
            <li key={f.clave} className="px-3 py-3 space-y-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-sans text-label font-bold text-ink">{f.label}</span>
                <span className="font-mono text-label font-bold tabular-nums" style={{ color: colorDelta(d) }}>
                  {d != null ? `${conSigno(d)}%` : '—'}
                </span>
              </div>
              {/* Barra divergente: el centro es «igual que al empezar». */}
              <div className="relative h-1.5 rounded-full bg-track">
                <span className="absolute inset-y-[-2px] left-1/2 w-px bg-ink-3" />
                {d != null && (
                  <span
                    className="absolute inset-y-0 rounded-full"
                    style={{
                      width: `${ancho}%`,
                      left: d >= 0 ? '50%' : `${50 - ancho}%`,
                      backgroundColor: colorDelta(d),
                    }}
                  />
                )}
              </div>
              <p className="font-mono text-caption text-ink-3">
                {f.mejoran} de {f.ejercicios} ejercicios mejoran
                {f.mejor ? ` · tira de ${f.mejor.nombre} (${conSigno(f.mejor.deltaPct)}%)` : ''}
              </p>
            </li>
          );
        })}
      </ul>
      <p className="font-mono text-caption text-ink-3">
        Media de la variación de 1RM estimado de sus ejercicios, del inicio al final del bloque.
      </p>
      {anterior && anterior.length > 0 && (
        <div className="space-y-2">
          <p className="font-mono text-caption text-ink-2 uppercase tracking-wider">Contra {comparacion}</p>
          <TablaGruposPerf grupos={anterior} comparacion={comparacion} />
        </div>
      )}
    </div>
  );
}

// ── Tablas de detalle ────────────────────────────────────────────────────────

function TablaVolumen({ filas, comparacion }: { filas: FilaVolumenGrupo[]; comparacion: string }) {
  if (filas.length === 0) {
    return <p className="font-sans text-caption text-ink-3">Este mesociclo no tenía volumen configurado por grupo.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-surface border border-hairline">
      <table className="w-full border-collapse" style={{ minWidth: '520px' }}>
        <thead>
          <tr className="bg-bg">
            <th className="text-left px-3 py-2.5 font-mono text-caption text-ink-2 uppercase tracking-wider border-b border-hairline">Grupo</th>
            <th className="text-right px-3 py-2.5 font-mono text-caption text-ink-2 uppercase tracking-wider border-b border-hairline">Sem. ({comparacion})</th>
            <th className="text-right px-3 py-2.5 font-mono text-caption text-ink-2 uppercase tracking-wider border-b border-hairline">Programadas</th>
            <th className="text-right px-3 py-2.5 font-mono text-caption text-ink-2 uppercase tracking-wider border-b border-hairline">Hechas</th>
            <th className="text-left px-3 py-2.5 font-mono text-caption text-ink-2 uppercase tracking-wider border-b border-hairline w-[130px]">Cumplimiento</th>
          </tr>
        </thead>
        <tbody>
          {filas.map(f => (
            <tr key={f.group} className="border-b border-hairline last:border-b-0">
              <td className="px-3 py-2.5 font-sans text-label text-ink whitespace-nowrap">{f.label}</td>
              <td className="px-3 py-2.5 text-right font-mono text-caption text-ink-2 tabular-nums whitespace-nowrap">
                {f.semanalesPrevias != null ? `${f.semanalesPrevias} → ` : ''}<span className="text-ink">{f.semanales}</span>
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-label text-ink-2 tabular-nums">{f.programadas}</td>
              <td className="px-3 py-2.5 text-right font-mono text-label font-bold text-ink tabular-nums">{f.realizadas}</td>
              <td className="px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <BarraCumplimiento pct={f.pct} />
                  <span className="font-mono text-caption text-ink-2 tabular-nums w-10 text-right flex-shrink-0">
                    {f.pct != null ? `${f.pct}%` : '—'}
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


function TablaEstimulo({ estimulo, cargando, noSubido }: {
  estimulo: { filas: FilaIEM[]; sinVinculo: string[] } | null;
  cargando: boolean;
  noSubido: boolean;
}) {
  if (cargando) return <p className="font-sans text-caption text-ink-3">Cargando el catálogo CDG…</p>;
  if (!estimulo) {
    return (
      <p className="font-sans text-caption text-ink-3">
        {noSubido
          ? 'El catálogo CDG aún no está en Firestore (se sube con scripts/subirCatalogoCdg.mjs --aplicar): sin él no se puede calcular el estímulo.'
          : 'El estímulo (IEM) solo se calcula en la vista del entrenador, con el catálogo CDG cargado.'}
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {estimulo.filas.length === 0 ? (
        <p className="font-sans text-caption text-ink-3">Ninguna serie del bloque cuenta en el índice (hacen falta ejercicios con vínculo CDG, con kg y con RIR entre 0 y 4).</p>
      ) : (
        <div className="overflow-x-auto rounded-surface border border-hairline">
          <table className="w-full border-collapse" style={{ minWidth: '320px' }}>
            <thead>
              <tr className="bg-bg">
                <th className="text-left px-3 py-2.5 font-mono text-caption text-ink-2 uppercase tracking-wider border-b border-hairline">Músculo</th>
                <th className="text-right px-3 py-2.5 font-mono text-caption text-ink-2 uppercase tracking-wider border-b border-hairline">IEM</th>
              </tr>
            </thead>
            <tbody>
              {estimulo.filas.map(f => (
                <tr key={`${f.compuesto ? 'c' : 'm'}-${f.nombre}`} className="border-b border-hairline last:border-b-0">
                  <td className={`px-3 py-2.5 font-sans text-label whitespace-nowrap ${f.compuesto ? 'font-bold text-ink' : 'text-ink-2'}`}>{f.nombre}{f.compuesto ? ' (grupo)' : ''}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-label font-bold text-ink tabular-nums">{Math.round(f.valor * 100) / 100}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {estimulo.sinVinculo.length > 0 && (
        <p className="font-sans text-caption text-warning">Sin vínculo CDG (no cuentan): {estimulo.sinVinculo.join(', ')}.</p>
      )}
      <p className="font-mono text-caption text-ink-3">
        IEM = estímulo muscular de la plantilla CDG, sumado sobre las series del bloque (cada músculo según el ejercicio, el RIR y las
        repeticiones). Los «grupos» suman sus porciones. Las series sin kg y las de RIR 5 no cuentan.
      </p>
    </div>
  );
}
