import React, { useState } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import type {
  FilaAgregada, ProgresionEjercicio, SemanaDelBloque, EstadoEjercicio,
} from '../../utils/progresionDelBloque';
import { Sexo } from '../../utils/athleteProfileSignals';
import { e1rmAlometrico } from '../../utils/allometricScore';
import { RUIDO_RM_PCT } from '../../utils/ruidoDeMedida';
import {
  Icon, Badge, Chip,
  MARGEN_GRAFICA, ANCHO_EJE_Y, REJILLA_GRAFICA, TICK_GRAFICA, EJE_GRAFICA, TOOLTIP_GRAFICA,
} from '../ui';
import TablaGruposPerf from '../training/TablaGruposPerf';

/* ═══════════════════════════════════════════════════════════════════════════
   Piezas del cierre de mesociclo, compartidas por las dos pantallas que lo
   enseñan: Plan › Entrenamiento › Cierre (MesocycleReviewPanel) y Revisión ›
   Cierre de bloque (revision/CierreDeBloque). Mismos números, misma forma.
   ═══════════════════════════════════════════════════════════════════════════ */

export const fmt = (n: number, dec = 1) => n.toLocaleString('es-ES', { maximumFractionDigits: dec });
export const conSigno = (n: number) => `${n > 0 ? '+' : ''}${fmt(n)}`;

// Verde o rojo solo cuando el cambio supera el ruido de medida del RM
// estimado (`ruidoDeMedida.ts`); por debajo es gris, ni mejora ni caída.
export function colorDelta(pct: number | null | undefined): string {
  if (pct == null) return 'var(--color-ink-3)';
  if (pct >= RUIDO_RM_PCT) return 'var(--color-success)';
  if (pct <= -RUIDO_RM_PCT) return 'var(--color-danger)';
  return 'var(--color-ink-2)';
}

export function Tile({ label, value, sub, color = 'var(--color-ink)', icon }: {
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

export function Seccion({ titulo, icon, extra, children }: {
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

// ── Semana a semana ─────────────────────────────────────────────────────────

export function SemanaASemana({ semanas }: { semanas: SemanaDelBloque[] }) {
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

export function Podio({ ejercicios }: { ejercicios: ProgresionEjercicio[] }) {
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

export function MiniLinea({ valores }: { valores: (number | null)[] }) {
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

export function ListaEjercicios({ ejercicios, sexo, pesoKg }: {
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

export function Agregado<K extends string>({ filas, vacio, anterior, comparacion }: {
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
