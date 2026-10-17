import React, { useMemo, useState } from 'react';
import type { BodyMetricKey, Exercise, Mesocycle, WorkoutExercise, WorkoutLog } from '../../types';
import { useMotorCdg } from '../../hooks/useMotorCdg';
import { useBodyMeasurements } from '../../hooks/useBodyMeasurements';
import { computeAnthropometricIndices, ANTHROPOMETRIC_INDEX_LABELS, type AnthropometricIndexKey } from '../../utils/anthropometricIndices';
import {
  semanasRealizadasDelMeso, cargaAgudaCronicaDelMeso, rendimientoDelCiclo, incrementoAntropometria,
  UMBRALES_CARGA_POR_DEFECTO, sinMusculos, SEMANAS_CARGA_CRONICA, type UmbralesCarga,
  ZONAS_IEM, iemPorZona, variacion, propuestaZona, ACTITUDES, ACTITUD_POR_DEFECTO, type ActitudBloque, type TonoPropuesta
} from '../../utils/cdg';
import { useAgujetasCdg } from '../../hooks/useAgujetasCdg';
import { Button, Collapsible, Select } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Seguimiento CDG (solo coach)

   Lo que la plantilla «Índice de hipertrofia» calcula DESPUÉS de entrenar:
   semana realizada, Gestión, carga aguda/crónica, rendimiento (RM y tonelaje)
   y antropometría. Todo se calcula al vuelo desde los logs del atleta, nada se
   guarda: no hay copias que se queden desactualizadas.

   La semana realizada agrupa las sesiones por `Workout.dayIndex`. El RM es el
   de CDG (reps + RIR hasta el fallo; Epley con 10-15 reps, media de tres
   fórmulas con el resto). Series a peso corporal (0 kg) no cuentan, como en la
   hoja.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  athleteEmail: string;
  logs: WorkoutLog[];
  meso: Mesocycle;
  cicloDias: number;
  vueltas: number;
  /** Rutinas del bloque agrupadas por día (con `dayIndex` y los ids de cada semana). */
  grupos: Array<{ dayIndex?: number; workoutIds: string[]; exercises: WorkoutExercise[] }>;
  allExercises: Exercise[];
  umbrales?: UmbralesCarga;
  onGuardarUmbrales: (u: UmbralesCarga) => void;
  /** Guarda la actitud del bloque (`Mesocycle.cdgActitud`). */
  onCambiarActitud?: (a: ActitudBloque) => void;
}

const TONO: Record<TonoPropuesta, string> = {
  freno: 'text-danger', vigilar: 'text-warning', mantener: 'text-ink-2', acelerar: 'text-success', 'sin-dato': 'text-ink-3'
};
const ETIQUETA_TONO: Record<TonoPropuesta, string> = {
  freno: 'Frenar', vigilar: 'Vigilar', mantener: 'Mantener', acelerar: 'Acelerar', 'sin-dato': 'Sin dato'
};

const n1 = (v: number) => (Math.round(v * 10) / 10).toLocaleString('es-ES');
const n2 = (v: number) => (Math.round(v * 100) / 100).toLocaleString('es-ES');
const pct = (v: number | null) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${(Math.round(v * 1000) / 10).toLocaleString('es-ES')} %`);

function Seccion ({ titulo, children, abierta = false }: { titulo: string; children: React.ReactNode; abierta?: boolean }) {
  return (
    <div className="bg-surface border border-hairline rounded-surface px-4">
      <Collapsible defaultOpen={abierta} trigger={<span className="font-sans font-bold text-body-s text-ink">{titulo}</span>}>
        <div className="pb-4 space-y-3">{children}</div>
      </Collapsible>
    </div>
  );
}

const Th = ({ children, derecha }: { children?: React.ReactNode; derecha?: boolean }) => (
  <th className={`py-1 font-normal uppercase tracking-wide text-ink-3 ${derecha ? 'text-right' : 'text-left'}`}>{children}</th>
);

export default function SeguimientoCdg ({ athleteEmail, logs, meso, cicloDias, vueltas, grupos, allExercises, umbrales, onGuardarUmbrales, onCambiarActitud }: Props) {
  const { agujetas, sueño } = useAgujetasCdg(athleteEmail);
  const actitud = meso.cdgActitud ?? ACTITUD_POR_DEFECTO;
  const { motor, cargando, noSubido, error } = useMotorCdg();
  const { all: medidas } = useBodyMeasurements(athleteEmail);
  const porId = useMemo(() => new Map(allExercises.map(e => [e.id, e])), [allExercises]);
  const nombreCdgDe = useMemo(() => (id: string) => porId.get(id)?.cdgNombre, [porId]);
  const sesionPorWorkout = useMemo(() => {
    const m = new Map<string, number>();
    grupos.forEach((g, i) => g.workoutIds.forEach(id => m.set(id, g.dayIndex ?? i)));
    return m;
  }, [grupos]);

  const datos = useMemo(() => {
    if (!motor) return null;
    const { semanas, descartados } = semanasRealizadasDelMeso({
      logs, meso, cicloDias, vueltas, motor, nombreCdgDe, sesionDeWorkout: id => sesionPorWorkout.get(id)
    });
    const carga = cargaAgudaCronicaDelMeso({ motor, semanas, grupos, meso, vueltas, nombreCdgDe, umbrales });
    return { semanas, descartados, carga, ciclo: rendimientoDelCiclo(motor, semanas) };
  }, [motor, logs, meso, cicloDias, vueltas, nombreCdgDe, sesionPorWorkout, grupos, umbrales]);

  const [semanaSel, setSemanaSel] = useState<string>('');
  const semanaActiva = datos?.semanas.find(s => String(s.semana) === semanaSel) ?? datos?.semanas[datos.semanas.length - 1];

  const [inf, setInf] = useState(String((umbrales ?? UMBRALES_CARGA_POR_DEFECTO).inferior));
  const [sup, setSup] = useState(String((umbrales ?? UMBRALES_CARGA_POR_DEFECTO).superior));
  const umbralesValidos = Number(inf) > 0 && Number(sup) > Number(inf);

  const antropometria = useMemo(() => {
    const primero: Partial<Record<BodyMetricKey, (typeof medidas)[number]>> = {};
    const ultimo: Partial<Record<BodyMetricKey, (typeof medidas)[number]>> = {};
    for (const m of medidas) { primero[m.metricKey] ??= m; ultimo[m.metricKey] = m; }
    const ini = computeAnthropometricIndices(primero);
    const fin = computeAnthropometricIndices(ultimo);
    return incrementoAntropometria(ini, fin).map(f => ({
      clave: f.medida as AnthropometricIndexKey, inicio: ini[f.medida as AnthropometricIndexKey], ultimo: fin[f.medida as AnthropometricIndexKey], incremento: f.incremento
    }));
  }, [medidas]);

  if (cargando) return <p className="font-sans text-caption text-ink-3">Cargando el catálogo CDG…</p>;
  if (error) return <p className="font-sans text-caption text-danger">No se pudo leer el catálogo CDG: {error.message}</p>;
  if (noSubido || !motor || !datos) {
    return (
      <p className="font-sans text-caption text-ink-3">
        El catálogo CDG aún no está en Firestore (se sube con <code>scripts/subirCatalogoCdg.mjs --aplicar</code>); sin él no hay seguimiento.
      </p>
    );
  }

  const { semanas, descartados, carga, ciclo } = datos;
  const sinVinculo = new Set<string>();
  for (const l of logs) if (l.mesocycleId === meso.id) for (const e of l.entries) if (!nombreCdgDe(e.exerciseId)) sinVinculo.add(e.exerciseId);

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="font-sans text-caption text-ink-2">
          {semanas.length === 0
            ? 'Todavía no hay sesiones registradas en este bloque.'
            : `${semanas.length} ${semanas.length === 1 ? 'semana realizada' : 'semanas realizadas'} en este bloque (${semanas.reduce((n, s) => n + s.logs, 0)} sesiones).`}
        </p>
        {(descartados.sinSesion > 0 || descartados.fueraDeSemana > 0) && (
          <p className="font-sans text-caption text-warning">
            No se han podido colocar {descartados.sinSesion} sesiones (rutina sin día del ciclo, o día 8-10 de un ciclo largo) y {descartados.fueraDeSemana} fuera de las fechas del bloque.
          </p>
        )}
        {sinVinculo.size > 0 && (
          <p className="font-sans text-caption text-warning">
            Sin vínculo CDG (no cuentan): {[...sinVinculo].map(id => porId.get(id)?.name ?? id).join(', ')}.
          </p>
        )}
      </div>

      {semanas.length > 0 && (
        <Select
          label="Semana"
          value={String(semanaActiva?.semana ?? '')}
          onChange={setSemanaSel}
          options={semanas.map(s => ({ value: String(s.semana), label: `Semana ${s.semana}` }))}
        />
      )}

      <Seccion titulo="Freno / acelerador por zona" abierta>
        {(() => {
          const sumaDias = (m: number[][]) => m.reduce((acc, d) => acc.map((v, i) => v + (d[i] ?? 0)), new Array<number>(motor.musculos.length).fill(0));
          const idx = semanaActiva ? semanas.indexOf(semanaActiva) : -1;
          const ahora = semanaActiva ? iemPorZona(motor, sumaDias(semanaActiva.calculo.IEM)) : null;
          const antes = idx > 0 ? iemPorZona(motor, sumaDias(semanas[idx - 1].calculo.IEM)) : null;
          const filas = ZONAS_IEM.map(z => {
            const lectura = agujetas?.[z.clave];
            const objetivo = meso.cdgObjetivosIem?.[z.clave];
            return {
              z, lectura, objetivo,
              iem: ahora?.[z.clave] ?? 0,
              vs: ahora && antes ? variacion(antes[z.clave], ahora[z.clave]) : null,
              propuesta: propuestaZona({ agujetas: lectura?.valor, anterior: lectura?.anterior, sensible: z.sensible, actitud, esObjetivo: objetivo != null })
            };
          }).filter(f => f.iem > 0.005 || f.lectura || f.objetivo != null);
          return (
            <>
              <div className="flex flex-wrap items-end gap-3">
                <div className="w-44">
                  <Select
                    label="Actitud del bloque"
                    value={actitud}
                    onChange={v => onCambiarActitud?.(v as ActitudBloque)}
                    options={ACTITUDES.map(a => ({ value: a.value, label: a.label }))}
                  />
                </div>
                <p className="font-sans text-caption text-ink-3 pb-2">{ACTITUDES.find(a => a.value === actitud)?.ayuda}</p>
              </div>
              <p className="font-sans text-caption text-ink-2">
                {sueño ? <>Sueño reciente: <b className="font-mono">{n1(sueño.value)} h</b> por noche. </> : 'Sin datos de sueño. '}
                Si descansa peor, cualquier subida de IEM sube también el riesgo por estrés articular.
              </p>
              {filas.length === 0 ? <p className="font-sans text-caption text-ink-3">Sin estímulo registrado ni agujetas todavía.</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full font-sans text-caption">
                    <thead><tr><Th>Zona</Th><Th derecha>Agujetas 48 h</Th><Th derecha>IEM S{semanaActiva?.semana ?? '—'}</Th><Th derecha>vs anterior</Th><Th derecha>Objetivo</Th><Th>Propuesta</Th></tr></thead>
                    <tbody>
                      {filas.map(f => (
                        <tr key={f.z.clave} className="border-t border-hairline align-top">
                          <td className={`py-1 pr-2 whitespace-nowrap ${f.objetivo != null ? 'font-bold text-ink' : 'text-ink-2'}`}>{f.z.nombre}</td>
                          <td className="py-1 px-2 text-right font-mono tabular-nums" title={f.lectura ? `${f.lectura.fecha}${f.lectura.deEscala10 ? ' · cuestionario 0-10 convertido' : ''}` : undefined}>
                            {f.lectura ? <>{f.lectura.anterior != null && <span className="text-ink-3">{f.lectura.anterior} → </span>}<b className={f.lectura.valor >= 5 ? 'text-danger' : f.lectura.valor >= 4 ? 'text-warning' : 'text-ink'}>{f.lectura.valor}</b>{f.lectura.deEscala10 ? '*' : ''}</> : <span className="text-ink-3">—</span>}
                          </td>
                          <td className="py-1 px-2 text-right font-mono tabular-nums text-ink">{f.iem > 0.005 ? n1(f.iem) : '·'}</td>
                          <td className="py-1 px-2 text-right font-mono tabular-nums text-ink-2">{pct(f.vs)}</td>
                          <td className="py-1 px-2 text-right font-mono tabular-nums text-ink-2">{f.objetivo != null ? n1(f.objetivo) : '—'}</td>
                          <td className={`py-1 pl-2 ${TONO[f.propuesta.tono]}`}><b>{ETIQUETA_TONO[f.propuesta.tono]}</b> · {f.propuesta.texto}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="font-sans text-caption text-ink-3">
                Agujetas en escala 1-5 del cuestionario «Agujetas a las 48 h»{ZONAS_IEM.some(z => agujetas?.[z.clave]?.deEscala10) ? ' (* = del DOM\'s 0-10, convertido)' : ''}. No se leen a ciegas: los ejercicios en estiramiento y los tempos excéntricos largos dan más agujetas con el mismo IEM.
              </p>
            </>
          );
        })()}
      </Seccion>

      <Seccion titulo="Gestión · IF por sesión" abierta>
        {!semanaActiva ? <p className="font-sans text-caption text-ink-3">Sin datos.</p> : (
          <table className="w-full font-sans text-caption">
            <thead><tr><Th>Sesión</Th><Th derecha>IF</Th><Th derecha>Músculos &gt; 0</Th><Th derecha>Zonas &gt; 0</Th></tr></thead>
            <tbody>
              {semanaActiva.gestion.map(f => (
                <tr key={f.sesion} className={`border-t ${f.sesion === 'Total' ? 'border-strong font-bold' : 'border-hairline'}`}>
                  <td className="py-1.5 text-ink">{f.sesion}</td>
                  <td className="py-1.5 text-right font-mono text-ink">{n1(f.IF)}</td>
                  <td className="py-1.5 text-right font-mono text-ink-2">{f.IEM.filter(v => v > 0.005).length}</td>
                  <td className="py-1.5 text-right font-mono text-ink-2">{f.estresArticular.filter(v => v > 0.005).length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Seccion>

      <Seccion titulo="Carga aguda / crónica">
        {carga.disponible === false ? (
          <p className="font-sans text-caption text-ink-2">{carga.motivo}</p>
        ) : (
          <>
            <p className="font-sans text-caption text-ink-2">
              Lo programado para la semana {carga.semanaReferencia} frente a la media de las {SEMANAS_CARGA_CRONICA} últimas realizadas (semanas {carga.semanasUsadas.slice().sort((a, b) => a - b).join(', ')}).
            </p>
            <table className="w-full font-sans text-caption">
              <thead><tr><Th>Sesión</Th><Th derecha>IF aguda / crónica</Th></tr></thead>
              <tbody>
                {carga.avisos.sesionesIF.map(s => (
                  <tr key={s.sesion} className="border-t border-hairline">
                    <td className="py-1.5 text-ink">{s.sesion}</td>
                    <td className={`py-1.5 text-right font-mono ${s.fuera ? 'text-warning font-bold' : 'text-ink'}`}>{n2(s.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(carga.avisos.musculos.length > 0 || carga.avisos.articulaciones.length > 0) && (
              <ul className="space-y-0.5 font-sans text-caption text-warning">
                {carga.avisos.musculos.map((a, i) => <li key={`m${i}`}>{a.sesion} · {a.nombre}: {n2(a.valor)}</li>)}
                {carga.avisos.articulaciones.map((a, i) => <li key={`a${i}`}>{a.sesion} · {a.nombre}: {n2(a.valor)}</li>)}
              </ul>
            )}
          </>
        )}
        <div className="flex flex-wrap items-end gap-2 pt-1">
          <label className="flex flex-col gap-1">
            <span className="text-caption font-sans uppercase tracking-wide text-ink-3">Aviso por debajo de</span>
            <input value={inf} onChange={e => setInf(e.target.value)} inputMode="decimal" aria-label="Umbral inferior" className="h-10 w-24 rounded-field border border-hairline bg-field px-2 font-mono text-body-s text-ink" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-caption font-sans uppercase tracking-wide text-ink-3">Aviso por encima de</span>
            <input value={sup} onChange={e => setSup(e.target.value)} inputMode="decimal" aria-label="Umbral superior" className="h-10 w-24 rounded-field border border-hairline bg-field px-2 font-mono text-body-s text-ink" />
          </label>
          <Button size="s" variant="secondary" disabled={!umbralesValidos} onClick={() => onGuardarUmbrales({ inferior: Number(inf.replace(',', '.')), superior: Number(sup.replace(',', '.')) })}>
            Guardar para este atleta
          </Button>
        </div>
      </Seccion>

      <Seccion titulo="Rendimiento · RM y tonelaje">
        {!semanaActiva || semanaActiva.rendimiento.length === 0 ? <p className="font-sans text-caption text-ink-3">Sin datos.</p> : (
          <table className="w-full font-sans text-caption">
            <thead><tr><Th>Sesión</Th><Th>Ejercicio</Th><Th derecha>RM</Th><Th derecha>Tonelaje</Th></tr></thead>
            <tbody>
              {semanaActiva.rendimiento.map((f, i) => (
                <tr key={i} className="border-t border-hairline">
                  <td className="py-1.5 text-ink-2 whitespace-nowrap pr-2">{f.sesion}</td>
                  <td className="py-1.5 text-ink">{sinMusculos(f.ejercicio)}</td>
                  <td className="py-1.5 text-right font-mono text-ink">{n1(f.rm)}</td>
                  <td className="py-1.5 text-right font-mono text-ink-2">{Math.round(f.tonelaje).toLocaleString('es-ES')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {semanas.length >= 2 && (
          <div className="space-y-3 pt-2">
            <p className="text-caption font-sans uppercase tracking-wide text-ink-3">Mejora del ciclo (RM, primera → última semana con ese ejercicio)</p>
            <table className="w-full font-sans text-caption">
              <thead><tr><Th>Categoría</Th><Th derecha>Mejora</Th></tr></thead>
              <tbody>
                {ciclo.categorias.map(c => (
                  <tr key={c.categoria} className="border-t border-hairline">
                    <td className="py-1.5 text-ink">{c.categoria} <span className="text-ink-3">({c.ejercicios})</span></td>
                    <td className="py-1.5 text-right font-mono text-ink">{pct(c.incremento)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <table className="w-full font-sans text-caption">
              <thead><tr><Th>Ejercicio</Th><Th derecha>Semanas</Th><Th derecha>Mejora</Th></tr></thead>
              <tbody>
                {ciclo.incrementos.map(c => (
                  <tr key={c.ejercicio} className="border-t border-hairline">
                    <td className="py-1.5 text-ink">{sinMusculos(c.ejercicio)}</td>
                    <td className="py-1.5 text-right font-mono text-ink-2">{c.semanas}</td>
                    <td className="py-1.5 text-right font-mono text-ink">{pct(c.incremento)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Seccion>

      <Seccion titulo="Antropometría · inicio → último">
        <table className="w-full font-sans text-caption">
          <thead><tr><Th>Índice</Th><Th derecha>Inicio</Th><Th derecha>Último</Th><Th derecha>Incremento</Th></tr></thead>
          <tbody>
            {antropometria.map(f => (
              <tr key={f.clave} className="border-t border-hairline">
                <td className="py-1.5 text-ink">{ANTHROPOMETRIC_INDEX_LABELS[f.clave]}</td>
                <td className="py-1.5 text-right font-mono text-ink-2">{f.inicio != null ? f.inicio.toLocaleString('es-ES', { maximumFractionDigits: 3 }) : '—'}</td>
                <td className="py-1.5 text-right font-mono text-ink">{f.ultimo != null ? f.ultimo.toLocaleString('es-ES', { maximumFractionDigits: 3 }) : '—'}</td>
                <td className="py-1.5 text-right font-mono text-ink">{pct(f.incremento)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="font-sans text-caption text-ink-3">Un índice sin dato en los dos extremos queda en «—». Inicio = primera medida de cada perímetro.</p>
      </Seccion>
    </div>
  );
}
