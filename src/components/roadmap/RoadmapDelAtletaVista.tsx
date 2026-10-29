import React from 'react';
import type { RoadmapDelAtleta, FaseDelCamino, HitoAutomatico } from '../../utils/roadmapDelAtleta';
import { COACH_NOMBRE } from '../../utils/coach';
import { Icon } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   El Road map del atleta — la vista (29-10-2026)

   Sobre los datos de `construirRoadmap`: el plan entero como una escalera
   vertical de fases, con la actual abierta (dónde estás, franja de peso,
   esta semana, próximo hito); debajo el reto de la semana y lo conseguido.
   Versión elegida por Dani el 29-10 entre tres. Nada de rojo, nada de
   «desvío», la fase actual destacada, el plan entero visible, los hitos que
   salen solos.

   Mejoras del 29-10 (tarde): abre con SU frase del alta en una tarjeta
   encima del plan (Dani eligió esta entre dos), nunca se queda vacío (fase «Tu arranque» sin fases del programa),
   los hitos del primer mes y la cifra de fuerza en «Esta semana».
   ═══════════════════════════════════════════════════════════════════════════ */

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
  /** Su objetivo con sus palabras (`goalFreeText` del alta). */
  frase?: string | null;
  /** La tarjeta del reto de la semana, que ya existe; va entre el plan y lo conseguido. */
  reto?: React.ReactNode;
  /** Logros que no salen del plan (retos conseguidos), para la tira de abajo. */
  logrosExtra?: HitoAutomatico[];
}

export default function RoadmapDelAtletaVista({ roadmap, frase, reto, logrosExtra = [] }: Props) {
  const logros = [...roadmap.hitos, ...logrosExtra].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 10);
  const laFrase = frase?.trim() || null;
  if (roadmap.camino.length === 0) {
    return (
      <div className="space-y-4">
        <CabeceraCita frase={laFrase} roadmap={roadmap} />
        <SinPlan />
        {reto}
        <Logros logros={logros} />
      </div>
    );
  }
  return <Camino roadmap={roadmap} frase={laFrase} reto={reto} logros={logros} />;
}

/* ── Cabecera: su frase, en una tarjeta encima del plan ─────────────────── */

function CabeceraCita({ frase, roadmap }: { frase: string | null; roadmap: RoadmapDelAtleta }) {
  if (!frase) return null;
  const meta = roadmap.dondeEstas?.fase.pesoMeta ?? null;
  return (
    <section className="rounded-canvas border border-accent-line bg-accent-bg/40 p-4 flex gap-3" aria-label="Lo que viniste a buscar">
      <Icon name="format_quote" size="l" className="text-accent-ink shrink-0" />
      <div className="min-w-0">
        <p className="font-mono text-caption uppercase tracking-widest text-ink-3">Lo que viniste a buscar</p>
        <p className="mt-1 font-display text-title-m font-black leading-tight text-ink text-pretty">{frase}</p>
        <p className="mt-1.5 font-sans text-caption text-ink-2">
          {meta != null ? `El camino hasta ahí pasa por ${kg(meta)} kg. Abajo, fase a fase.` : 'Abajo, el camino hasta ahí, fase a fase.'}
        </p>
      </div>
    </section>
  );
}

/* Solo sin plan publicado y sin bloque: con cualquiera de los dos, el camino
   arranca (`caminoDeArranque`). */
function SinPlan() {
  return (
    <section className="rounded-canvas border border-dashed border-accent/45 bg-surface p-5">
      <p className="font-sans font-bold text-title-s text-ink">Tu plan, fase a fase</p>
      <p className="mt-1 font-sans text-body-s text-ink-2">
        En cuanto {COACH_NOMBRE} publique tu plan, aquí verás en qué punto estás, qué viene y qué toca esta semana.
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

function EstaSemana({ roadmap }: { roadmap: RoadmapDelAtleta }) {
  const s = roadmap.estaSemana;
  if (!s) return null;
  const f = s.fuerza;
  // Fuerza (29-10, tarde): en recomposición o volumen el peso engaña; los kilos
  // levantados y los récords, no. Récord = 1RM estimado por encima de su mejor
  // marca anterior en ese ejercicio.
  const fuerzaValor = !f ? '—' : f.records > 0 ? `${f.records} ${f.records === 1 ? 'récord' : 'récords'}` : `${miles(f.tonelaje)} kg`;
  const fuerzaUnidad = !f ? 'sin sesiones aún'
    : f.records > 0 ? `${miles(f.tonelaje)} kg movidos`
    : f.deltaPct != null ? `${f.deltaPct > 0 ? '+' : ''}${f.deltaPct} % vs la pasada`
    : `${f.sesiones} ${f.sesiones === 1 ? 'sesión' : 'sesiones'}`;
  return (
    <div className="grid grid-cols-2 gap-2">
      <Dato etiqueta="Comida" valor={s.kcal != null ? `${miles(s.kcal)}` : '—'} unidad="kcal/día" />
      <Dato etiqueta="Pasos" valor={s.pasos != null ? miles(s.pasos) : '—'} unidad="al día" />
      <Dato etiqueta="Entreno" valor={roadmap.bloque ? `${roadmap.bloque.semana}/${roadmap.bloque.semanas}` : '—'} unidad={roadmap.bloque ? roadmap.bloque.nombre : 'sin bloque'} />
      <Dato etiqueta="Fuerza" valor={fuerzaValor} unidad={fuerzaUnidad} />
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

/* ── El camino ──────────────────────────────────────────────────────────── */

function Camino({ roadmap, frase, reto, logros }: { roadmap: RoadmapDelAtleta; frase: string | null; reto?: React.ReactNode; logros: HitoAutomatico[] }) {
  const d = roadmap.dondeEstas;
  const titulo = roadmap.arranque ? 'Tu arranque' : `Tu plan · ${roadmap.camino.length} ${roadmap.camino.length === 1 ? 'fase' : 'fases'}`;
  return (
    <div className="space-y-4">
      <CabeceraCita frase={frase} roadmap={roadmap} />
      <section className="rounded-canvas border border-hairline bg-surface p-5">
        <p className="font-sans text-caption uppercase tracking-widest text-ink-2 mb-4">{titulo}</p>
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
