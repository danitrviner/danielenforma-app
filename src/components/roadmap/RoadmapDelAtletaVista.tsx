import React from 'react';
import type { RoadmapDelAtleta, FaseDelCamino, HitoAutomatico } from '../../utils/roadmapDelAtleta';
import { COACH_NOMBRE } from '../../utils/coach';
import { Icon } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   El Road map del atleta — la vista (29-10-2026)

   Tres variantes sobre los MISMOS datos (`construirRoadmap`), para que Dani
   elija una en `/dev/roadmap`:
   · 'camino'   — el plan entero como una escalera vertical de fases, con la
                  actual abierta (dónde estás, franja de peso, esta semana).
   · 'mapa'     — una barra del plan entero arriba (semana N de M, fases como
                  tramos) y debajo tarjetas: dónde estás, esta semana, bloque,
                  próximo hito.
   · 'compacta' — una sola tarjeta de «dónde estás» con el camino como
                  píldoras y el resto en filas; para quien abre y cierra.
   Lo que no cambia entre variantes: nada de rojo, nada de «desvío», la fase
   actual destacada, el plan entero visible, los hitos que salen solos.
   ═══════════════════════════════════════════════════════════════════════════ */

export type VarianteRoadmap = 'camino' | 'mapa' | 'compacta';

const kg = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const miles = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const fechaCorta = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

const COLOR_FASE: Record<NonNullable<FaseDelCamino['objetivo']> | 'null', string> = {
  deficit: 'var(--color-accent)', deficit_acelerado: 'var(--color-accent)', salida_deficit: 'var(--color-data)',
  mantenimiento: 'var(--color-data)', recomposicion: 'var(--color-data)', volumen: 'var(--color-chart-3)', null: 'var(--color-ink-3)',
};
const colorDe = (f: FaseDelCamino) => COLOR_FASE[f.objetivo ?? 'null'];

interface Props {
  roadmap: RoadmapDelAtleta;
  variante: VarianteRoadmap;
  /** La tarjeta del reto de la semana, que ya existe; se coloca donde cada variante la pide. */
  reto?: React.ReactNode;
  /** Logros que no salen del plan (retos conseguidos), para la tira de abajo. */
  logrosExtra?: HitoAutomatico[];
}

export default function RoadmapDelAtletaVista({ roadmap, variante, reto, logrosExtra = [] }: Props) {
  const logros = [...roadmap.hitos, ...logrosExtra].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 10);
  if (roadmap.camino.length === 0) {
    return (
      <div className="space-y-4">
        <SinPlan />
        {reto}
        <Logros logros={logros} />
      </div>
    );
  }
  if (variante === 'camino') return <Camino roadmap={roadmap} reto={reto} logros={logros} />;
  if (variante === 'mapa') return <Mapa roadmap={roadmap} reto={reto} logros={logros} />;
  return <Compacta roadmap={roadmap} reto={reto} logros={logros} />;
}

function SinPlan() {
  return (
    <section className="rounded-canvas border border-dashed border-accent/45 bg-surface p-5">
      <p className="font-sans font-bold text-title-s text-ink">Tu plan, fase a fase</p>
      <p className="mt-1 font-sans text-body-s text-ink-2">
        En cuanto {COACH_NOMBRE} te ponga el objetivo y las fases, aquí verás en qué punto estás, qué viene y qué toca esta semana.
      </p>
    </section>
  );
}

/* ── Piezas comunes ─────────────────────────────────────────────────────── */

function PesoYFranja({ roadmap }: { roadmap: RoadmapDelAtleta }) {
  const d = roadmap.dondeEstas;
  if (!d) return null;
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {d.pesoReal != null && (
          <span className="font-display text-title-l font-black text-ink">{kg(d.pesoReal)} <span className="font-mono text-caption text-ink-3">KG</span></span>
        )}
        {d.franja && (
          <span className="font-mono text-caption text-ink-2">esta semana entre {kg(d.franja[0])} y {kg(d.franja[1])}</span>
        )}
        {d.faltanKg != null && d.faltanKg > 0 && (
          <span className="font-mono text-caption text-accent-ink">quedan {kg(d.faltanKg)} kg</span>
        )}
        {d.faltanKg != null && d.faltanKg <= 0 && (
          <span className="font-mono text-caption text-success">objetivo conseguido</span>
        )}
      </div>
      <p className="font-sans text-body-s text-ink-2 text-pretty">{d.mensaje}</p>
    </div>
  );
}

function EstaSemana({ roadmap, compacta = false }: { roadmap: RoadmapDelAtleta; compacta?: boolean }) {
  const s = roadmap.estaSemana;
  if (!s) return null;
  const partes = [
    s.kcal != null ? `${miles(s.kcal)} kcal` : null,
    s.pasos != null ? `${miles(s.pasos)} pasos` : null,
    roadmap.bloque ? `${roadmap.bloque.nombre} · semana ${roadmap.bloque.semana} de ${roadmap.bloque.semanas}` : null,
  ].filter((x): x is string => !!x);
  if (compacta) return <p className="font-mono text-caption text-ink-2">{partes.join(' · ')}</p>;
  return (
    <div className="grid grid-cols-3 gap-2">
      <Dato etiqueta="Comida" valor={s.kcal != null ? `${miles(s.kcal)}` : '—'} unidad="kcal/día" />
      <Dato etiqueta="Pasos" valor={s.pasos != null ? miles(s.pasos) : '—'} unidad="al día" />
      <Dato etiqueta="Entreno" valor={roadmap.bloque ? `${roadmap.bloque.semana}/${roadmap.bloque.semanas}` : '—'} unidad={roadmap.bloque ? roadmap.bloque.nombre : 'sin bloque'} />
    </div>
  );
}

function Dato({ etiqueta, valor, unidad }: { etiqueta: string; valor: string; unidad: string }) {
  return (
    <div className="rounded-field border border-hairline bg-raised px-3 py-2">
      <p className="font-mono text-caption uppercase tracking-widest text-ink-3">{etiqueta}</p>
      <p className="font-sans text-title-s font-bold text-ink leading-tight">{valor}</p>
      <p className="truncate font-mono text-caption text-ink-2">{unidad}</p>
    </div>
  );
}

function ProximoHito({ roadmap }: { roadmap: RoadmapDelAtleta }) {
  const h = roadmap.proximoHito;
  if (!h) return null;
  return (
    <div className="flex items-center gap-2 rounded-field border border-accent-line bg-accent-bg/50 px-3 py-2">
      <Icon name="flag" size="s" className="text-accent-ink" />
      <p className="font-sans text-body-s text-ink flex-1">{h.texto}</p>
      <span className="font-mono text-caption text-ink-3">{fechaCorta(h.fecha)}</span>
    </div>
  );
}

function Logros({ logros }: { logros: HitoAutomatico[] }) {
  if (logros.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="font-mono text-caption uppercase tracking-widest text-ink-2 px-1">Conseguido</p>
      <div className="flex gap-3 overflow-x-auto hide-scrollbar pb-1 -mx-1 px-1">
        {logros.map(l => (
          <div key={l.id} className="flex-shrink-0 flex flex-col items-center gap-2 w-[96px] rounded-surface border border-hairline bg-surface p-3 text-center">
            <Icon name={l.icon} size="l" className="text-accent-ink" />
            <p className="text-ink text-caption font-sans font-bold leading-tight line-clamp-3">{l.titulo}</p>
            <p className="text-ink-2 text-caption font-mono">{fechaCorta(l.fecha)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Variante A · Camino ────────────────────────────────────────────────── */

function Camino({ roadmap, reto, logros }: { roadmap: RoadmapDelAtleta; reto?: React.ReactNode; logros: HitoAutomatico[] }) {
  const d = roadmap.dondeEstas;
  return (
    <div className="space-y-4">
      <section className="rounded-canvas border border-hairline bg-surface p-5">
        <p className="font-sans text-caption uppercase tracking-widest text-ink-2 mb-4">Tu plan · {roadmap.camino.length} fases</p>
        <div className="flex flex-col gap-0">
          {roadmap.camino.map((f, i) => {
            const actual = f.estado === 'actual';
            const pasada = f.estado === 'pasada';
            const ultima = i === roadmap.camino.length - 1;
            return (
              <div key={f.idx} className="flex gap-3">
                <div className="flex flex-col items-center flex-shrink-0">
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-full font-mono text-caption font-bold ${actual ? 'ring-2 ring-offset-2 ring-offset-surface' : ''}`}
                    style={{ backgroundColor: pasada || actual ? colorDe(f) : 'var(--color-raised)', color: pasada || actual ? 'var(--color-on-accent)' : 'var(--color-ink-3)', ['--tw-ring-color' as string]: colorDe(f) }}
                  >
                    {pasada ? <Icon name="check" size="s" /> : i + 1}
                  </span>
                  {!ultima && <span className="w-0.5 flex-1 min-h-[16px]" style={{ backgroundColor: pasada ? colorDe(f) : 'var(--color-hairline)' }} />}
                </div>
                <div className={`min-w-0 flex-1 ${ultima ? '' : 'pb-4'}`}>
                  <div className="flex items-baseline gap-2">
                    <p className={`font-sans font-bold ${actual ? 'text-title-s text-ink' : 'text-body-s ' + (pasada ? 'text-ink-2' : 'text-ink-3')}`}>{f.nombre}</p>
                    <span className="font-mono text-caption text-ink-3">{f.semanas} sem · {fechaCorta(f.desde)}–{fechaCorta(f.hasta)}</span>
                  </div>
                  <p className={`font-sans text-caption ${actual ? 'text-accent-ink' : 'text-ink-3'}`}>{f.objetivoTexto}</p>
                  {actual && d && (
                    <div className="mt-3 space-y-3 rounded-field border border-accent-line bg-accent-bg/40 p-3">
                      <p className="font-mono text-caption uppercase tracking-widest text-accent-ink">Estás aquí · semana {d.semanaDeFase} de {f.semanas}</p>
                      <PesoYFranja roadmap={roadmap} />
                      <EstaSemana roadmap={roadmap} />
                      <ProximoHito roadmap={roadmap} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
      {reto}
      <Logros logros={logros} />
    </div>
  );
}

/* ── Variante B · Mapa ──────────────────────────────────────────────────── */

function Mapa({ roadmap, reto, logros }: { roadmap: RoadmapDelAtleta; reto?: React.ReactNode; logros: HitoAutomatico[] }) {
  const d = roadmap.dondeEstas;
  const total = roadmap.camino.reduce((a, f) => a + f.semanas, 0);
  const hechas = roadmap.camino.reduce((a, f) => a + (f.estado === 'pasada' ? f.semanas : f.estado === 'actual' && d ? d.semanaDeFase - 1 : 0), 0);
  return (
    <div className="space-y-4">
      <section className="rounded-canvas border border-hairline bg-surface p-5 space-y-3">
        <div className="flex items-baseline justify-between">
          <p className="font-sans font-bold text-title-s text-ink">Semana {hechas + 1} de {total}</p>
          <p className="font-mono text-caption text-ink-3">{fechaCorta(roadmap.camino[0].desde)} → {fechaCorta(roadmap.camino[roadmap.camino.length - 1].hasta)}</p>
        </div>
        <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full">
          {roadmap.camino.map(f => (
            <div key={f.idx} className="relative h-full" style={{ flex: f.semanas, backgroundColor: f.estado === 'futura' ? 'var(--color-raised)' : colorDe(f), opacity: f.estado === 'pasada' ? 0.55 : 1 }}>
              {f.estado === 'actual' && d && (
                <span className="absolute top-0 bottom-0 w-0.5 bg-on-accent" style={{ left: `${((d.semanaDeFase - 0.5) / f.semanas) * 100}%` }} />
              )}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {roadmap.camino.map(f => (
            <span key={f.idx} className={`inline-flex items-center gap-1.5 font-mono text-caption ${f.estado === 'actual' ? 'text-ink font-bold' : 'text-ink-3'}`}>
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colorDe(f), opacity: f.estado === 'futura' ? 0.4 : 1 }} />
              {f.nombre}
            </span>
          ))}
        </div>
      </section>

      {d && (
        <section className="rounded-canvas border border-accent-line bg-surface p-5 space-y-3">
          <p className="font-mono text-caption uppercase tracking-widest text-accent-ink">Estás aquí · {d.fase.nombre} · semana {d.semanaDeFase} de {d.fase.semanas}</p>
          <p className="font-sans font-bold text-title-s text-ink">{d.fase.objetivoTexto}</p>
          <PesoYFranja roadmap={roadmap} />
        </section>
      )}

      <section className="rounded-canvas border border-hairline bg-surface p-5 space-y-3">
        <p className="font-mono text-caption uppercase tracking-widest text-ink-2">Esta semana</p>
        <EstaSemana roadmap={roadmap} />
        <ProximoHito roadmap={roadmap} />
      </section>

      {reto}

      <section className="rounded-canvas border border-hairline bg-surface p-5">
        <p className="font-mono text-caption uppercase tracking-widest text-ink-2 mb-3">Lo que viene</p>
        <ol className="space-y-2">
          {roadmap.camino.map(f => (
            <li key={f.idx} className={`flex items-baseline gap-2 ${f.estado === 'pasada' ? 'opacity-60' : ''}`}>
              <span className="h-2 w-2 rounded-full flex-shrink-0 translate-y-[-1px]" style={{ backgroundColor: colorDe(f) }} />
              <span className={`font-sans text-body-s ${f.estado === 'actual' ? 'font-bold text-ink' : 'text-ink-2'}`}>{f.nombre}</span>
              <span className="font-mono text-caption text-ink-3 ml-auto">{fechaCorta(f.desde)} · {f.semanas} sem</span>
            </li>
          ))}
        </ol>
      </section>
      <Logros logros={logros} />
    </div>
  );
}

/* ── Variante C · Compacta ──────────────────────────────────────────────── */

function Compacta({ roadmap, reto, logros }: { roadmap: RoadmapDelAtleta; reto?: React.ReactNode; logros: HitoAutomatico[] }) {
  const d = roadmap.dondeEstas;
  return (
    <div className="space-y-4">
      <section className="rounded-canvas border border-accent-line bg-surface p-5 space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {roadmap.camino.map(f => (
            <span
              key={f.idx}
              className={`rounded-chip px-2.5 py-1 font-mono text-caption font-bold uppercase ${f.estado === 'actual' ? 'text-on-accent' : f.estado === 'pasada' ? 'text-ink-2 bg-hairline line-through' : 'text-ink-3 bg-raised'}`}
              style={f.estado === 'actual' ? { backgroundColor: colorDe(f) } : undefined}
            >
              {f.nombre}
            </span>
          ))}
        </div>
        {d && (
          <div className="space-y-1">
            <p className="font-mono text-caption uppercase tracking-widest text-accent-ink">Semana {d.semanaDeFase} de {d.fase.semanas}</p>
            <p className="font-display text-title-l font-black uppercase tracking-tight text-ink">{d.fase.objetivoTexto}</p>
          </div>
        )}
        <PesoYFranja roadmap={roadmap} />
        <div className="border-t border-hairline pt-3 space-y-2">
          <EstaSemana roadmap={roadmap} compacta />
          <ProximoHito roadmap={roadmap} />
        </div>
      </section>
      {reto}
      <Logros logros={logros} />
    </div>
  );
}
