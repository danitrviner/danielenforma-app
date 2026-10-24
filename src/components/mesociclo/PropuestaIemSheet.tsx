import React, { useMemo, useState } from 'react';
import { Banner, Button, Icon, Select, Sheet } from '../ui';
import type { Mesocycle, MuscleGroup, WorkoutExercise, WorkoutLog } from '../../types';
import { useMotorCdg } from '../../hooks/useMotorCdg';
import { useAgujetasCdg } from '../../hooks/useAgujetasCdg';
import { resolverEjercicioDelMeso } from '../../utils/progression';
import { hoyIsoLocal } from '../../utils/trainingWeek';
import { semanasRealizadasDelMeso } from '../../utils/cdg/integracion';
import { ZONAS_IEM, iemPorZona, type ZonaIem } from '../../utils/cdg/zonas';
import { propuestaZona, tipoDeBloque, contextoDeLaSemana, agujetasVigentes } from '../../utils/cdg/agujetas';
import { proponerProgresionIem, iemProgramadoPorZona, type CambioIem, type OperacionIem } from '../../utils/cdg/progresionIem';

/* E-08 · «Proponer por IEM»: la semana a programar, sobre la de antes
   (realizada si tiene entrenos; si no, programada). Cuánto sube o baja cada zona
   lo dice el freno/acelerador (E-09); qué cambiar, el motor. El coach marca los
   cambios que quiere y se programan como cualquier otra casilla. */

export interface DiaParaIem {
  clave: string;
  name: string;
  dayIndex?: number;
  workoutIds: string[];
  exercises: WorkoutExercise[];
}

type Props = {
  open: boolean;
  onClose: () => void;
  meso: Mesocycle;
  dias: DiaParaIem[];
  vueltas: number;
  cicloDias: number;
  logs?: WorkoutLog[];
  semanaActual?: number;
  /** Claves `${dia}#${exIdx}` de los ejercicios elegidos en el planificador: solo esos se mueven. */
  elegidos: Set<string>;
  nombreDe: (id: string) => string;
  nombreCdgDe: (id: string) => string | undefined;
  grupoDe: (we: WorkoutExercise) => MuscleGroup | undefined;
  /** Operaciones marcadas por ejercicio (`${dia}#${exIdx}`) para la semana `semana`. */
  onAplicar: (semana: number, porEjercicio: Map<string, OperacionIem[]>) => void;
};

const n1 = (v: number) => v.toLocaleString('es-ES', { maximumFractionDigits: 1 });
const signo = (v: number) => `${v > 0 ? '+' : ''}${n1(v)}`;

export default function PropuestaIemSheet(p: Props) {
  const { meso, dias, logs, cicloDias, vueltas, nombreCdgDe, grupoDe, elegidos } = p;
  const { motor, cargando } = useMotorCdg();
  const { agujetas, sueño, estres, motivacion, fatigaPost } = useAgujetasCdg(p.meso.athleteId);
  const descargas = p.meso.semanasDescarga ?? [];
  const destinos = Array.from({ length: p.vueltas }, (_, i) => i + 1).filter(s => s >= 2 && !descargas.includes(s));
  const [semana, setSemana] = useState(() => {
    const siguiente = (p.semanaActual ?? 1) + 1;
    return destinos.includes(siguiente) ? siguiente : destinos[0] ?? 2;
  });
  const [palancas, setPalancas] = useState({ rir: true, series: true, tecnica: false });
  const [descartados, setDescartados] = useState<Set<number>>(new Set());
  // % por zona puesto a mano por el coach; sin él, el del freno/acelerador (E-09).
  const [pctManual, setPctManual] = useState<Partial<Record<ZonaIem, number>>>({});

  const referencia = useMemo(() => {
    if (!motor) return null;
    const ref = semana - 1;
    const sesionDeWorkout = (id: string) => {
      const i = dias.findIndex(d => d.workoutIds.includes(id));
      return i < 0 ? undefined : dias[i].dayIndex ?? i;
    };
    const realizadas = logs?.length
      ? semanasRealizadasDelMeso({ logs: logs, meso: meso, cicloDias: cicloDias, vueltas: vueltas, sesionDeWorkout, nombreCdgDe: nombreCdgDe, motor }).semanas
      : [];
    const hecha = realizadas.find(s => s.semana === ref);
    const iemBase: Record<ZonaIem, number> = hecha
      ? iemPorZona(motor, hecha.calculo.IEM.reduce((acc, d) => acc.map((v, i) => v + (d[i] ?? 0)), new Array<number>(motor.musculos.length).fill(0)))
      : iemProgramadoPorZona(motor, nombreCdgDe, dias.flatMap(d => d.exercises.map(we => resolverEjercicioDelMeso(we, meso, ref))));

    const tipo = tipoDeBloque(meso);
    const { contexto } = contextoDeLaSemana({ estres: estres?.value, sueñoHoras: sueño?.value, motivacion: motivacion?.value });
    const hoy = hoyIsoLocal();
    const sugerido: Partial<Record<ZonaIem, { pct: number; tono: string }>> = {};
    for (const z of ZONAS_IEM) {
      if ((iemBase[z.clave] ?? 0) <= 0.005) continue;
      const l = agujetas?.[z.clave];
      const vigente = !!l && agujetasVigentes(l.fecha, hoy);
      const pr = propuestaZona({
        agujetas: vigente ? l!.valor : undefined, anterior: vigente ? l!.anterior : undefined, sensible: z.sensible, tipo,
        esObjetivo: meso.cdgObjetivosIem?.[z.clave] != null, iem: iemBase[z.clave], contexto, fatigaPost: fatigaPost?.value,
      });
      sugerido[z.clave] = { pct: pr.pct ?? 0, tono: pr.tono };
    }

    const ejercicios = dias.flatMap(d => d.exercises.map((we, exIdx) => {
      const clave = `${d.clave}#${exIdx}`;
      return { clave, dia: d.name, we: resolverEjercicioDelMeso(we, meso, semana), grupo: grupoDe(we), movible: elegidos.has(clave) };
    }));
    // Zonas que trabajan los ejercicios elegidos: las únicas que se pueden mover.
    const movibles = ejercicios.filter(e => e.movible);
    const iemElegidos = iemProgramadoPorZona(motor, nombreCdgDe, movibles.map(e => e.we));
    // Solo las que trabajan de verdad (≥ 15 % de la zona más trabajada): un press
    // toca algo de trapecio, pero no se programa el trapecio con un press.
    const maxElegidos = Math.max(0, ...Object.values(iemElegidos));
    const zonas = ZONAS_IEM
      .filter(z => (iemBase[z.clave] ?? 0) > 0.005 && iemElegidos[z.clave] >= maxElegidos * 0.15 && iemElegidos[z.clave] > 0.005)
      .map(z => z.clave);
    return { iemBase, sugerido, ejercicios, zonas, hecha: !!hecha, ref };
  }, [motor, semana, dias, logs, meso, cicloDias, vueltas, nombreCdgDe, grupoDe, elegidos, agujetas, sueño, estres, motivacion, fatigaPost]);

  const pctDe = (z: ZonaIem) => pctManual[z] ?? referencia?.sugerido[z]?.pct ?? 0;
  const calculo = useMemo(() => {
    if (!motor || !referencia) return null;
    const pctPorZona = Object.fromEntries(referencia.zonas.map(z => [z, pctManual[z] ?? referencia.sugerido[z]?.pct ?? 0]));
    const r = proponerProgresionIem({ motor, nombreCdgDe: nombreCdgDe, ejercicios: referencia.ejercicios, iemBase: referencia.iemBase, pctPorZona, palancas });
    return { ...r, hecha: referencia.hecha, ref: referencia.ref };
  }, [motor, referencia, pctManual, palancas, nombreCdgDe]);

  const marcados = (calculo?.cambios ?? []).filter((_, i) => !descartados.has(i));
  const aplicar = () => {
    const porEjercicio = new Map<string, OperacionIem[]>();
    for (const c of marcados) porEjercicio.set(c.clave, [...(porEjercicio.get(c.clave) ?? []), c.op]);
    p.onAplicar(semana, porEjercicio);
  };
  const alternar = (i: number) => setDescartados(prev => {
    const n = new Set(prev);
    if (n.has(i)) n.delete(i); else n.add(i);
    return n;
  });
  const nombreZona = (z: ZonaIem) => ZONAS_IEM.find(x => x.clave === z)?.nombre ?? z;
  const textoCambio = (c: CambioIem) => `${c.de} → ${c.a}`;

  return (
    <Sheet open={p.open} onClose={p.onClose} title="Proponer por IEM" size="l"
      footer={<Button fullWidth icon="done" disabled={marcados.length === 0} onClick={aplicar}>
        Programar {marcados.length} cambio{marcados.length === 1 ? '' : 's'} en S{semana}
      </Button>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Select label="Semana a programar" value={String(semana)} onChange={v => { setSemana(Number(v)); setDescartados(new Set()); setPctManual({}); }}
            options={destinos.map(s => ({ value: String(s), label: `S${s}` }))} />
          <div className="flex flex-col justify-end pb-2">
            <p className="font-sans text-caption text-ink-2">
              Referencia: S{calculo?.ref ?? semana - 1} {calculo ? (calculo.hecha ? 'realizada' : 'programada (aún sin entrenos)') : ''}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Qué puede cambiar">
          {([['rir', 'Bajar RIR'], ['series', '+1 serie'], ['tecnica', 'Drop set (aislamiento)']] as const).map(([k, label]) => (
            <button key={k} type="button" aria-pressed={palancas[k]}
              onClick={() => { setPalancas(prev => ({ ...prev, [k]: !prev[k] })); setDescartados(new Set()); }}
              className={`rounded-chip border px-3 py-1.5 font-sans text-label font-bold transition-colors ${palancas[k] ? 'border-accent bg-accent text-on-accent' : 'border-hairline text-ink-2'}`}>
              {label}
            </button>
          ))}
        </div>

        {!motor && (
          <Banner tone="info">{cargando ? 'Cargando el catálogo CDG…' : 'Sin catálogo CDG cargado: no se puede calcular el IEM.'}</Banner>
        )}

        {calculo && (
          <>
            {referencia && referencia.zonas.length > 0 && (
              <div className="space-y-1.5">
                <p className="font-sans text-caption text-ink-2">Cuánto mover cada zona. Viene del freno/acelerador (agujetas de los últimos 7 días, contexto y cansancio); puedes cambiarlo.</p>
                {referencia.zonas.some(z => referencia.sugerido[z]?.tono === 'sin-dato') && (
                  <p className="font-sans text-caption text-warning">
                    Sin agujetas recientes en {referencia.zonas.filter(z => referencia.sugerido[z]?.tono === 'sin-dato').map(nombreZona).join(', ')}: decide tú.
                  </p>
                )}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {referencia.zonas.map(z => (
                    <div key={z}><Select label={nombreZona(z)}
                      value={String(pctDe(z))}
                      onChange={v => { setPctManual(prev => ({ ...prev, [z]: Number(v) })); setDescartados(new Set()); }}
                      options={[-30, -25, -20, -15, -10, -5, 0, 5, 10, 15, 20, 25, 30].map(n => ({ value: String(n), label: n === 0 ? 'Mantener' : `${signo(n)} %` }))} /></div>
                  ))}
                </div>
              </div>
            )}
            {calculo.zonas.length === 0 ? (
              <p className="font-sans text-label text-ink-2">Ninguna zona cambia: todas en «Mantener».</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full font-sans text-caption">
                  <thead>
                    <tr className="text-ink-3 uppercase tracking-wide">
                      <th className="py-1 text-left font-normal">Zona</th>
                      <th className="py-1 text-right font-normal">Ref.</th>
                      <th className="py-1 text-right font-normal">Cambio</th>
                      <th className="py-1 text-right font-normal">Objetivo</th>
                      <th className="py-1 text-right font-normal">S{semana}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calculo.zonas.map(z => (
                      <tr key={z.zona} className="border-t border-hairline align-top">
                        <td className="py-1 pr-2 text-ink">{z.nombre}{z.nota && <span className="block text-warning">{z.nota}</span>}</td>
                        <td className="py-1 px-2 text-right font-mono tabular-nums text-ink-2">{n1(z.base)}</td>
                        <td className={`py-1 px-2 text-right font-mono tabular-nums ${z.pct > 0 ? 'text-success' : 'text-danger'}`}>{signo(z.pct)} %</td>
                        <td className="py-1 px-2 text-right font-mono tabular-nums text-ink">{n1(z.objetivo)}</td>
                        <td className={`py-1 pl-2 text-right font-mono tabular-nums ${z.alcanzado ? 'text-success' : 'text-warning'}`}>{n1(z.antes)} → {n1(z.despues)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {calculo.cambios.length > 0 && (
              <ul className="space-y-2">
                {calculo.cambios.map((c, i) => {
                  const marcado = !descartados.has(i);
                  return (
                    <li key={`${c.clave}-${c.op.tipo}`}>
                      <button type="button" aria-pressed={marcado} onClick={() => alternar(i)}
                        className={`flex w-full items-start gap-3 rounded-control border p-3 text-left transition-colors ${marcado ? 'border-accent bg-accent/8' : 'border-hairline bg-surface'}`}>
                        <Icon name={marcado ? 'check_box' : 'check_box_outline_blank'} size="s" filled={marcado} className={marcado ? 'text-accent-ink' : 'text-ink-3'} />
                        <span className="flex-1 min-w-0">
                          <span className="block font-sans text-label font-bold text-ink">{p.nombreDe(c.exerciseId)} · <span className="font-mono">{textoCambio(c)}</span></span>
                          <span className="block font-sans text-caption text-ink-2">
                            {c.dia} · {nombreZona(c.zona)} {signo(c.deltaIemZona)} IEM · IF {signo(c.deltaIF)}
                          </span>
                          {c.superaMrv && (
                            <span className="mt-1 flex items-center gap-1 font-sans text-caption text-warning">
                              <Icon name="warning" size="s" />La zona pasa a {c.superaMrv.series} series: más que su máximo recuperable ({c.superaMrv.mrv}).
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="font-sans text-caption text-ink-3">
              Solo se mueven los ejercicios elegidos en el planificador; los demás cuentan para el IEM de la zona. Nada se guarda hasta «Aceptar cambios».
            </p>
          </>
        )}
      </div>
    </Sheet>
  );
}
