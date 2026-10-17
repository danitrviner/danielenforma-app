import React, { useMemo } from 'react';
import type { Exercise, Mesocycle, WorkoutExercise } from '../../types';
import { resolverEjercicioDelMeso } from '../../utils/progression';
import { useMotorCdg } from '../../hooks/useMotorCdg';
import {
  resumenSesion, sumarSesiones, formatearTiempo, ZONAS_IEM, iemPorZona, indicesDeZonas, avisosIemIea, variacion,
  type ZonaIem, type LecturaAgujetas
} from '../../utils/cdg';
import { seriesPorGrupo } from '../../utils/programacion';
import Collapsible from '../ui/Collapsible';

/* ═══════════════════════════════════════════════════════════════════════════
   Índices CDG de la programación (solo coach)

   IF (fatiga), IEM (estímulo muscular, 33 músculos) y estrés articular (IEA, 11
   zonas), con los mismos números que la plantilla «Índice de hipertrofia».

   Las sesiones van en COLUMNAS, una al lado de otra: es como se programa con la
   plantilla («en horizontal»). Para decidir hay que mirar a la vez la fatiga de
   cada día, si el músculo objetivo recibe su estímulo y, sobre todo, cuánta
   carga articular (columna, hombro, rodilla) cae en días pegados — dos sesiones
   seguidas no pueden cargar los mismos tejidos pasivos sin las ~48 h de descanso.

   La semana se resuelve con `resolverEjercicioDelMeso` (cambios por semana,
   escalones, descarga, test); en «Base» (semana 0) se calcula sin progresión.
   Sin `cdgNombre` un ejercicio cuenta 0 y se avisa: no se calla.

   Arriba va la tabla por ZONAS (utils/cdg/zonas.ts) con el IEM objetivo de la
   semana: es la premisa del bloque. El método del curso es montar el esqueleto
   y dejar los últimos ejercicios para cubrir el IEM que falte; «Falta» dice
   cuánto. Al lado, las series efectivas (lo de siempre), la variación frente a
   la semana anterior y las últimas agujetas a las 48 h de esa zona.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  grupos: Array<{ name: string; exercises: WorkoutExercise[] }>;
  meso: Pick<Mesocycle, 'semanasDescarga' | 'semanasTest'>;
  /** 0 = Base (sin progresión); 1+ = semana de ciclo. */
  semana: number;
  allExercises: Exercise[];
  /** IEM semanal objetivo por zona (`Mesocycle.cdgObjetivosIem`). */
  objetivos?: Partial<Record<string, number>>;
  /** Sin él los objetivos se ven pero no se editan (vista previa del generador). */
  onCambiarObjetivo?: (zona: ZonaIem, valor: number | undefined) => void;
  /** Últimas agujetas a las 48 h por zona (escala 1-5). */
  agujetas?: Partial<Record<ZonaIem, LecturaAgujetas>>;
  /** Bloque de definición: el curso pide mantener el IEM y bajar el IF. */
  definicion?: boolean;
}

const n1 = (v: number) => (Math.round(v * 10) / 10).toLocaleString('es-ES');
const celda = (v: number) => (v > 0.005 ? n1(v) : '·');
const pct = (v: number | null) => (v == null ? '—' : `${v > 0 ? '+' : ''}${Math.round(v * 100)} %`);
const leerNumero = (t: string) => { const n = Number(t.replace(',', '.').trim()); return t.trim() === '' || !(n > 0) ? undefined : n; };
const TONO_AGUJETAS = (v: number) => (v >= 5 ? 'text-danger' : v >= 4 ? 'text-warning' : 'text-ink');

type Columna = { nombre: string; IF: number; tiempoSeg: number; compuestos: Record<string, number>; IEM: number[]; estresArticular: number[]; total?: boolean };

function Bloque ({ titulo, columnas, filas }: { titulo: string; columnas: Columna[]; filas: Array<{ nombre: string; valores: number[] }> }) {
  if (filas.length === 0) return null;
  return (
    <>
      <tr><th colSpan={columnas.length + 1} className="pt-4 pb-1 text-left font-normal text-caption font-sans uppercase tracking-wide text-ink-3">{titulo}</th></tr>
      {filas.map(f => (
        <tr key={f.nombre} className="border-t border-hairline">
          <td className="py-1 pr-3 text-ink-2 font-sans text-caption whitespace-nowrap">{f.nombre}</td>
          {f.valores.map((v, i) => (
            <td key={i} className={`py-1 px-2 text-right font-mono text-caption tabular-nums ${columnas[i].total ? 'font-bold text-ink' : v > 0.005 ? 'text-ink' : 'text-ink-3'}`}>{celda(v)}</td>
          ))}
        </tr>
      ))}
    </>
  );
}

export default function PanelIndicesCdg ({ grupos, meso, semana, allExercises, objetivos, onCambiarObjetivo, agujetas, definicion }: Props) {
  const { motor, cargando, noSubido, error } = useMotorCdg();
  const porId = useMemo(() => new Map(allExercises.map(e => [e.id, e])), [allExercises]);
  const nombreCdgDe = useMemo(() => (id: string) => porId.get(id)?.cdgNombre, [porId]);
  const nombreDe = (id: string) => porId.get(id)?.name ?? 'Ejercicio';

  const calcular = useMemo(() => (sem: number) => {
    if (!motor) return [];
    return grupos.map(g => {
      const ejercicios = sem === 0 ? g.exercises : g.exercises.map(we => resolverEjercicioDelMeso(we, meso, sem));
      return { nombre: g.name, ejercicios, r: resumenSesion(motor, ejercicios, nombreCdgDe) };
    });
  }, [motor, grupos, meso, nombreCdgDe]);
  const sesiones = useMemo(() => calcular(semana), [calcular, semana]);
  // Semana anterior, para «vs S-1» y el aviso IEM ↔ estrés articular.
  const anterior = useMemo(() => {
    if (!motor || semana < 2) return null;
    return sumarSesiones(motor, calcular(semana - 1).map(s => s.r));
  }, [motor, calcular, semana]);

  const tabla = useMemo(() => {
    if (!motor || sesiones.length === 0) return null;
    const t = sumarSesiones(motor, sesiones.map(s => s.r));
    const columnas: Columna[] = [
      ...sesiones.map(s => ({ nombre: s.nombre, IF: s.r.IF, tiempoSeg: s.r.tiempoSeg, compuestos: s.r.compuestos, IEM: s.r.IEM, estresArticular: s.r.estresArticular })),
      { nombre: 'Semana', IF: t.IF, tiempoSeg: t.tiempoSeg, compuestos: t.compuestos, IEM: t.IEM, estresArticular: t.estresArticular, total: true }
    ];
    const conValor = (nombres: string[], de: (c: Columna) => number[]) =>
      nombres.map((nombre, i) => ({ nombre, valores: columnas.map(c => de(c)[i] ?? 0) })).filter(f => f.valores.some(v => v > 0.005));
    return {
      columnas,
      compuestos: Object.keys(t.compuestos).map(k => ({ nombre: k, valores: columnas.map(c => c.compuestos[k] ?? 0) })).filter(f => f.valores.some(v => v > 0.005)),
      musculos: conValor(motor.musculos, c => c.IEM),
      articulaciones: conValor(motor.articulaciones, c => c.estresArticular)
    };
  }, [motor, sesiones]);

  const zonas = useMemo(() => {
    if (!motor || !tabla) return null;
    const porSesion = sesiones.map(se => iemPorZona(motor, se.r.IEM));
    const total = tabla.columnas[tabla.columnas.length - 1];
    const semanaZ = iemPorZona(motor, total.IEM);
    const antesZ = anterior ? iemPorZona(motor, anterior.IEM) : null;
    const series = seriesPorGrupo(sesiones.flatMap(se => se.ejercicios), allExercises);
    const filas = ZONAS_IEM.map(z => {
      const objetivo = objetivos?.[z.clave];
      const valor = semanaZ[z.clave];
      return {
        z, valor, objetivo,
        porSesion: porSesion.map(p => p[z.clave]),
        falta: objetivo != null ? objetivo - valor : null,
        series: z.grupos.reduce((a, g) => a + (series.get(g) ?? 0), 0),
        vs: antesZ ? variacion(antesZ[z.clave], valor) : null,
        agujetas: agujetas?.[z.clave]
      };
    });
    const visibles = filas
      .filter(f => f.objetivo != null || f.valor > 0.005)
      .sort((a, b) => Number(b.objetivo != null) - Number(a.objetivo != null) || b.valor - a.valor);
    return { visibles, ocultas: filas.filter(f => !visibles.includes(f)) };
  }, [motor, tabla, sesiones, anterior, allExercises, objetivos, agujetas]);

  const avisosArticulares = useMemo(() => {
    if (!motor || !tabla || !anterior) return [];
    const total = tabla.columnas[tabla.columnas.length - 1];
    return avisosIemIea(motor, anterior, total);
  }, [motor, tabla, anterior]);

  // Aporte de cada ejercicio a las zonas (las objetivo primero).
  const aportes = useMemo(() => {
    if (!motor) return [];
    const { zonas: defs } = indicesDeZonas(motor);
    return sesiones.map(se => ({
      nombre: se.nombre,
      ejercicios: se.r.porEjercicio.map(pe => {
        const porZona = defs
          .map(z => ({ clave: z.clave, nombre: z.nombre, valor: z.iMusculos.reduce((a, i) => a + (pe.IEM[i] ?? 0), 0), objetivo: objetivos?.[z.clave] != null }))
          .filter(x => x.valor > 0.005)
          .sort((a, b) => Number(b.objetivo) - Number(a.objetivo) || b.valor - a.valor);
        return { exerciseId: pe.exerciseId, IF: pe.IF, porZona };
      })
    }));
  }, [motor, sesiones, objetivos]);

  const [verTodas, setVerTodas] = React.useState(false);
  const conObjetivos = !!onCambiarObjetivo || Object.keys(objetivos ?? {}).length > 0;

  const avisos = useMemo(() => {
    const rir5 = new Set<string>(); const sinVinculo = new Set<string>(); const fuera = new Set<string>();
    for (const s of sesiones) {
      s.r.rir5.forEach((id: string) => rir5.add(id));
      s.r.sinVinculo.forEach((id: string) => sinVinculo.add(id));
      s.r.fueraDeCatalogo.forEach((id: string) => fuera.add(id));
    }
    return { rir5: [...rir5], sinVinculo: [...sinVinculo], fuera: [...fuera] };
  }, [sesiones]);

  const etiqueta = semana === 0 ? 'Base' : `Semana ${semana}`;
  const total = tabla?.columnas[tabla.columnas.length - 1];

  return (
    <div className="bg-surface border border-hairline rounded-surface px-4 py-3">
      <p className="font-sans font-bold text-body-s text-ink">
        Índices CDG · {etiqueta}
        {total && <span className="ml-2 font-mono font-normal text-ink-2">IF {n1(total.IF)} · {formatearTiempo(total.tiempoSeg)}</span>}
      </p>

      {cargando && <p className="pt-2 font-sans text-caption text-ink-3">Cargando el catálogo CDG…</p>}
      {error && <p className="pt-2 font-sans text-caption text-danger">No se pudo leer el catálogo CDG: {error.message}</p>}
      {noSubido && (
        <p className="pt-2 font-sans text-caption text-ink-3">
          El catálogo CDG aún no está en Firestore (se sube con <code>scripts/subirCatalogoCdg.mjs --aplicar</code>).
        </p>
      )}

      {tabla && (
        <div className="pt-2 space-y-3">
          {zonas && (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="text-ink-3 font-sans text-caption uppercase tracking-wide">
                    <th className="py-1 pr-3 text-left font-normal">IEM por zona</th>
                    {sesiones.map(se => <th key={se.nombre} className="py-1 px-2 text-right font-normal whitespace-nowrap">{se.nombre}</th>)}
                    <th className="py-1 px-2 text-right font-normal text-ink">Semana</th>
                    {conObjetivos && <th className="py-1 px-2 text-right font-normal" title="IEM semanal que te propones para esta zona en el bloque">Objetivo</th>}
                    {conObjetivos && <th className="py-1 px-2 text-right font-normal">Falta</th>}
                    <th className="py-1 px-2 text-right font-normal" title="Series efectivas de la semana en esta zona">Series</th>
                    {anterior && <th className="py-1 px-2 text-right font-normal whitespace-nowrap">vs S{semana - 1}</th>}
                    {agujetas && <th className="py-1 px-2 text-right font-normal whitespace-nowrap" title="Últimas agujetas a las 48 h (1-5)">Agujetas</th>}
                  </tr>
                </thead>
                <tbody>
                  {[...zonas.visibles, ...(verTodas ? zonas.ocultas : [])].map(f => (
                    <tr key={f.z.clave} className="border-t border-hairline">
                      <td className={`py-1 pr-3 font-sans text-caption whitespace-nowrap ${f.objetivo != null ? 'font-bold text-ink' : 'text-ink-2'}`}>{f.z.nombre}</td>
                      {f.porSesion.map((v, i) => <td key={i} className={`py-1 px-2 text-right font-mono text-caption tabular-nums ${v > 0.005 ? 'text-ink' : 'text-ink-3'}`}>{celda(v)}</td>)}
                      <td className="py-1 px-2 text-right font-mono text-caption font-bold text-ink tabular-nums">{celda(f.valor)}</td>
                      {conObjetivos && <td className="py-1 px-2 text-right">
                        {onCambiarObjetivo ? (
                          <input
                            key={`${f.z.clave}-${f.objetivo ?? ''}`}
                            defaultValue={f.objetivo != null ? String(f.objetivo).replace('.', ',') : ''}
                            placeholder="—"
                            inputMode="decimal"
                            aria-label={`IEM objetivo de ${f.z.nombre}`}
                            className="w-14 bg-raised border border-hairline rounded-control px-1.5 py-0.5 text-right font-mono text-caption text-ink"
                            onBlur={e => { const v = leerNumero(e.currentTarget.value); if (v !== f.objetivo) onCambiarObjetivo(f.z.clave, v); }}
                            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                          />
                        ) : <span className="font-mono text-caption text-ink-2">{f.objetivo != null ? n1(f.objetivo) : '—'}</span>}
                      </td>}
                      {conObjetivos && <td className={`py-1 px-2 text-right font-mono text-caption tabular-nums ${f.falta == null ? 'text-ink-3' : f.falta > 0.05 ? 'text-warning' : 'text-success'}`}>
                        {f.falta == null ? '—' : f.falta > 0.05 ? n1(f.falta) : f.falta < -0.05 ? <span title={`Pasa el objetivo en ${n1(-f.falta)}`}>✓ +{n1(-f.falta)}</span> : '✓'}
                      </td>}
                      <td className="py-1 px-2 text-right font-mono text-caption text-ink-2 tabular-nums">{f.series || '·'}</td>
                      {anterior && <td className="py-1 px-2 text-right font-mono text-caption text-ink-2 tabular-nums">{pct(f.vs)}</td>}
                      {agujetas && (
                        <td className="py-1 px-2 text-right font-mono text-caption tabular-nums" title={f.agujetas ? `${f.agujetas.fecha}${f.agujetas.deEscala10 ? ' · del cuestionario 0-10, convertido' : ''}` : 'Sin respuesta'}>
                          {f.agujetas ? <span className={TONO_AGUJETAS(f.agujetas.valor)}>{f.agujetas.valor}/5{f.agujetas.deEscala10 ? '*' : ''}</span> : <span className="text-ink-3">—</span>}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1.5 font-sans text-caption text-ink-3">
                {zonas.ocultas.length > 0 && (
                  <button type="button" className="underline hover:text-ink" onClick={() => setVerTodas(v => !v)}>
                    {verTodas ? 'Ocultar zonas sin estímulo' : `Ver las ${zonas.ocultas.length} zonas sin estímulo`}
                  </button>
                )}
                {onCambiarObjetivo && <span>Escribe el IEM semanal objetivo de cada zona; «Falta» es lo que queda por cubrir.</span>}
                {agujetas && Object.values(agujetas).some(a => a?.deEscala10) && <span>* del cuestionario antiguo de 0-10, convertido a 1-5.</span>}
              </div>
            </div>
          )}

          {definicion && anterior && total && (() => {
            const dIEM = variacion(anterior.IEM.reduce((a, v) => a + v, 0), total.IEM.reduce((a, v) => a + v, 0));
            const dIF = variacion(anterior.IF, total.IF);
            return (
              <p className="font-sans text-caption text-ink-2">
                Bloque de definición: mantener el IEM y bajar el IF. Frente a S{semana - 1}: IEM <b className="font-mono">{pct(dIEM)}</b> · IF <b className="font-mono">{pct(dIF)}</b>.
              </p>
            );
          })()}

          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="text-ink-3 font-sans text-caption uppercase tracking-wide">
                  <th className="py-1 pr-3 text-left font-normal" />
                  {tabla.columnas.map(c => (
                    <th key={c.nombre} className={`py-1 px-2 text-right font-normal whitespace-nowrap ${c.total ? 'text-ink' : ''}`}>{c.nombre}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-strong">
                  <td className="py-1.5 pr-3 font-sans text-caption font-bold text-ink">IF (fatiga)</td>
                  {tabla.columnas.map(c => <td key={c.nombre} className="py-1.5 px-2 text-right font-mono text-caption font-bold text-ink tabular-nums">{n1(c.IF)}</td>)}
                </tr>
                <tr className="border-t border-hairline">
                  <td className="py-1 pr-3 font-sans text-caption text-ink-2">Tiempo</td>
                  {tabla.columnas.map(c => <td key={c.nombre} className="py-1 px-2 text-right font-mono text-caption text-ink-2 tabular-nums">{formatearTiempo(c.tiempoSeg)}</td>)}
                </tr>
                <tr className="border-t border-hairline">
                  <td className="py-1 pr-3 font-sans text-caption text-ink-2">IEM total</td>
                  {tabla.columnas.map(c => <td key={c.nombre} className="py-1 px-2 text-right font-mono text-caption text-ink-2 tabular-nums">{celda(c.IEM.reduce((a, v) => a + v, 0))}</td>)}
                </tr>
                <tr className="border-t border-hairline" title="Estímulo por unidad de fatiga: cuánto IEM compra cada punto de IF">
                  <td className="py-1 pr-3 font-sans text-caption text-ink-2">IEM por punto de IF</td>
                  {tabla.columnas.map(c => <td key={c.nombre} className="py-1 px-2 text-right font-mono text-caption text-ink-2 tabular-nums">{c.IF > 0.005 ? n1(c.IEM.reduce((a, v) => a + v, 0) / c.IF) : '·'}</td>)}
                </tr>
                <tr className="border-t border-hairline" title="Resultados por unidad de tiempo">
                  <td className="py-1 pr-3 font-sans text-caption text-ink-2">IEM por minuto</td>
                  {tabla.columnas.map(c => <td key={c.nombre} className="py-1 px-2 text-right font-mono text-caption text-ink-2 tabular-nums">{c.tiempoSeg > 0 ? n1(c.IEM.reduce((a, v) => a + v, 0) / (c.tiempoSeg / 60)) : '·'}</td>)}
                </tr>
                <Bloque titulo="IEM · grupos (suma de porciones)" columnas={tabla.columnas} filas={tabla.compuestos} />
                <Bloque titulo="IEM · por músculo" columnas={tabla.columnas} filas={tabla.musculos} />
                <Bloque titulo="Estrés articular (IEA)" columnas={tabla.columnas} filas={tabla.articulaciones} />
              </tbody>
            </table>
          </div>

          {avisosArticulares.length > 0 && (
            <ul className="space-y-1 font-sans text-caption text-warning">
              {avisosArticulares.map(a => (
                <li key={`${a.zona}-${a.articulacion}`}>
                  {ZONAS_IEM.find(z => z.clave === a.zona)?.nombre}: el IEM sube {pct(a.dIEM)} y el estrés de {a.articulacion} sube más ({pct(a.dIEA)}). La carga extra va más al tejido pasivo que al músculo.
                </li>
              ))}
            </ul>
          )}

          <Collapsible trigger={<span className="font-sans text-caption font-bold text-ink-2">Aporte de cada ejercicio</span>}>
            <div className="space-y-3 pb-1">
              {aportes.map(se => (
                <div key={se.nombre}>
                  <p className="font-sans text-caption uppercase tracking-wide text-ink-3">{se.nombre}</p>
                  <ul className="space-y-1">
                    {se.ejercicios.map((e, i) => (
                      <li key={`${e.exerciseId}-${i}`} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="font-sans text-caption text-ink">{nombreDe(e.exerciseId)}</span>
                        <span className="font-mono text-caption text-ink-3">IF {n1(e.IF)}</span>
                        {e.porZona.slice(0, 4).map(z => (
                          <span key={z.clave} className={`font-mono text-caption px-1.5 rounded-control ${z.objetivo ? 'bg-raised text-ink border border-strong' : 'text-ink-2'}`}>
                            {z.nombre.split(' (')[0]} +{n1(z.valor)}
                          </span>
                        ))}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Collapsible>

          {(avisos.rir5.length > 0 || avisos.sinVinculo.length > 0 || avisos.fuera.length > 0) && (
            <ul className="space-y-1 font-sans text-caption text-warning">
              {avisos.rir5.map(id => <li key={`r5-${id}`}>RIR 5 no cuenta en el índice: {nombreDe(id)}</li>)}
              {avisos.sinVinculo.map(id => <li key={`sv-${id}`}>Sin vínculo CDG (cuenta 0): {nombreDe(id)}</li>)}
              {avisos.fuera.map(id => <li key={`fc-${id}`}>Su nombre CDG no está en el catálogo (cuenta 0): {nombreDe(id)}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
