import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getOnboarding } from '../../dbService';
import { MUSCLE_LABELS, type Exercise, type Mesocycle, type MuscleGroup, type WorkoutExercise, type WorkoutLog } from '../../types';
import { VOLUME_LANDMARKS_DEFAULT, type VolumeLandmark } from '../../data/volumeLandmarks';
import { resolverEjercicioDelMeso } from '../../utils/progression';
import { useMotorCdg } from '../../hooks/useMotorCdg';
import { useAthleteWeight } from '../../hooks/useAthleteWeight';
import { contextoPesoCorporal } from '../../utils/pesoCorporal';
import { mesocycleWeekNumber } from '../../utils/progression';
import { hoyIsoLocal } from '../../utils/trainingWeek';
import {
  resumenSesion, sumarSesiones, formatearTiempo, ZONAS_IEM, iemPorZona, indicesDeZonas, avisosIemIea, variacion,
  bandaIF, consejosDeTiempo, type ZonaIem, type LecturaAgujetas,
  barraFrenteAlObjetivo, MARCA_OBJETIVO, ordenarConGrupos, grupoDeZona, nombreCortoDeMusculo, musculosSinZona, avisosDeSeries, type AvisoDeSeries,
  semanasRealizadasDelMeso, semanasAnterioresAlBloque, cargaAgudaCronicaDelMeso, UMBRALES_CARGA_POR_DEFECTO, SEMANAS_CARGA_CRONICA, type UmbralesCarga,
  articulacionesEnDiasSeguidos, UMBRAL_DIAS_SEGUIDOS
} from '../../utils/cdg';
import { seriesPorGrupo } from '../../utils/programacion';
import { nombresCortosDeSesiones } from '../../utils/nombresMeso';
import Collapsible from '../ui/Collapsible';
import { Icon } from '../ui';

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
   la semana anterior y las últimas agujetas (DOM's semanal, a 1-5) de esa zona.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  grupos: Array<{ name: string; exercises: WorkoutExercise[]; dayIndex?: number }>;
  meso: Pick<Mesocycle, 'semanasDescarga' | 'semanasTest' | 'semanasPivot'> & Partial<Pick<Mesocycle, 'groups' | 'startDate'>>;
  /** 0 = Base (sin progresión); 1+ = semana de ciclo. */
  semana: number;
  allExercises: Exercise[];
  /** IEM semanal objetivo por zona (`Mesocycle.cdgObjetivosIem`). */
  objetivos?: Partial<Record<string, number>>;
  /** Sin él los objetivos se ven pero no se editan (vista previa del generador). */
  onCambiarObjetivo?: (zona: ZonaIem, valor: number | undefined) => void;
  /** Últimas agujetas por zona (DOM's semanal convertido a 1-5). */
  agujetas?: Partial<Record<ZonaIem, LecturaAgujetas>>;
  /** Bloque de definición: el curso pide mantener el IEM y bajar el IF. */
  definicion?: boolean;
  /** Atleta del bloque: de su alta salen los minutos que tiene por sesión. */
  athleteEmail?: string;
  /** MEV/MRV por grupo (los editados por el coach). Sin ellos, los de por defecto. */
  landmarks?: Partial<Record<MuscleGroup, VolumeLandmark>>;
  /** Semanas de 7 días que dura una vuelta del ciclo (para pasar las series a semana). */
  semanasDelCiclo?: number;
  /** Para la tarjeta de carga aguda / crónica (11-a), lo mismo que usa Seguimiento.
   *  Sin ello la tarjeta no sale (vista previa del generador). */
  carga?: {
    logs: WorkoutLog[];
    meso: Mesocycle;
    cicloDias: number;
    vueltas: number;
    grupos: Array<{ dayIndex?: number; workoutIds: string[]; exercises: WorkoutExercise[] }>;
    umbrales?: Partial<UmbralesCarga>;
  };
}

const TONO_BANDA: Record<string, string> = {
  sencilla: 'text-ink-2', intermedia: 'text-ink', alta: 'text-warning', 'muy-alta': 'text-danger',
};

const n2 = (v: number) => v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const n1 = (v: number) => (Math.round(v * 10) / 10).toLocaleString('es-ES');
const celda = (v: number) => (v > 0.005 ? n1(v) : '·');
const pct = (v: number | null) => (v == null ? '—' : `${v > 0 ? '+' : ''}${Math.round(v * 100)} %`);
const leerNumero = (t: string) => { const n = Number(t.replace(',', '.').trim()); return t.trim() === '' || !(n > 0) ? undefined : n; };
const textoAvisoSeries = (a: AvisoDeSeries) =>
  `${MUSCLE_LABELS[a.grupo]}: ${a.series} series · ${a.tipo === 'bajo' ? `mínimo ${a.limite}` : `máximo recuperable ${a.limite}`}`;
const INICIAL_DIA = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
const TONO_BARRA = { llega: 'bg-success', cerca: 'bg-accent', lejos: 'bg-warning' } as const;
const TONO_AGUJETAS = (v: number) => (v >= 5 ? 'text-danger' : v >= 4 ? 'text-warning' : 'text-ink');

type Columna = { nombre: string; completo?: string; IF: number; tiempoSeg: number; compuestos: Record<string, number>; IEM: number[]; estresArticular: number[]; total?: boolean };

function Bloque ({ titulo, columnas, filas, marcada }: { titulo: string; columnas: Columna[]; filas: Array<{ nombre: string; valores: number[] }>; marcada?: (nombre: string, columna: number) => boolean }) {
  if (filas.length === 0) return null;
  return (
    <>
      <tr><th colSpan={columnas.length + 1} className="pt-4 pb-1 text-left font-normal text-caption font-sans uppercase tracking-wide text-ink-3">{titulo}</th></tr>
      {filas.map(f => (
        <tr key={f.nombre} className="border-t border-hairline">
          <td className="py-1 pr-3 text-ink-2 font-sans text-caption whitespace-nowrap">{f.nombre}</td>
          {f.valores.map((v, i) => (
            <td key={i} title={marcada?.(f.nombre, i) ? 'Cargada también el día anterior o el siguiente' : undefined} className={`py-1 px-2 text-right font-mono text-caption tabular-nums ${columnas[i].total ? 'font-bold text-ink' : v > 0.005 ? 'text-ink' : 'text-ink-3'} ${marcada?.(f.nombre, i) ? 'bg-warning/15 text-warning font-bold rounded-control' : ''}`}>{celda(v)}</td>
          ))}
        </tr>
      ))}
    </>
  );
}

function Tarjeta ({ titulo, valor, detalle, aviso }: { titulo: string; valor: string; detalle: React.ReactNode; aviso?: boolean; key?: React.Key }) {
  return (
    <div className={`rounded-control px-3 py-2.5 ${aviso ? 'bg-warning/10' : 'bg-raised'}`}>
      <p className={`font-mono text-caption uppercase tracking-wider ${aviso ? 'text-warning' : 'text-ink-3'}`}>{titulo}</p>
      <p className={`font-sans text-title-l font-bold tabular-nums ${aviso ? 'text-warning' : 'text-ink'}`}>{valor}</p>
      <p className={`font-sans text-body-s ${aviso ? 'text-warning' : 'text-ink-2'}`}>{detalle}</p>
    </div>
  );
}

export default function PanelIndicesCdg ({ grupos, meso, semana, allExercises, objetivos, onCambiarObjetivo, agujetas, definicion, athleteEmail, landmarks, semanasDelCiclo, carga }: Props) {
  const { motor, cargando, noSubido, error } = useMotorCdg();
  // Misma clave de caché que el resto de pantallas que leen el alta.
  const { data: alta } = useQuery({
    queryKey: ['onboarding', athleteEmail],
    queryFn: () => getOnboarding(athleteEmail!),
    enabled: !!athleteEmail,
  });
  const minutosDisponibles = alta?.sessionMaxMinutes && alta.sessionMaxMinutes > 0 ? alta.sessionMaxMinutes : undefined;
  // Peso del atleta: las series a peso corporal cuentan con él en la carga realizada (CR5).
  const { current: pesoKg } = useAthleteWeight(athleteEmail);
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
  // Cabeceras compactas (E-02): el nombre completo queda en el tooltip.
  const cortos = useMemo(() => nombresCortosDeSesiones(grupos.map(g => g.name)), [grupos]);
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
      ...sesiones.map((s, i) => ({ nombre: cortos[i] ?? s.nombre, completo: s.nombre, IF: s.r.IF, tiempoSeg: s.r.tiempoSeg, compuestos: s.r.compuestos, IEM: s.r.IEM, estresArticular: s.r.estresArticular })),
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
  }, [motor, sesiones, cortos]);

  const zonas = useMemo(() => {
    if (!motor || !tabla) return null;
    const porSesion = sesiones.map(se => iemPorZona(motor, se.r.IEM));
    const total = tabla.columnas[tabla.columnas.length - 1];
    const semanaZ = iemPorZona(motor, total.IEM);
    const antesZ = anterior ? iemPorZona(motor, anterior.IEM) : null;
    const series = seriesPorGrupo(sesiones.flatMap(se => se.ejercicios), allExercises);
    const musculosDe = new Map(indicesDeZonas(motor).zonas.map(d => [d.clave, d.iMusculos]));
    const opcionesSeries = {
      semanasDelCiclo: semanasDelCiclo ?? 1,
      descarga: semana > 0 && (meso.semanasDescarga ?? []).includes(semana),
      entrena: (g: MuscleGroup) => (meso.groups?.[g]?.series ?? 0) > 0,
    };
    const filas = ZONAS_IEM.map(z => {
      const objetivo = objetivos?.[z.clave];
      const valor = semanaZ[z.clave];
      return {
        z, valor, objetivo,
        porSesion: porSesion.map(p => p[z.clave]),
        falta: objetivo != null ? objetivo - valor : null,
        series: z.grupos.reduce((a, g) => a + (series.get(g) ?? 0), 0),
        vs: antesZ ? variacion(antesZ[z.clave], valor) : null,
        antes: antesZ ? antesZ[z.clave] : null,
        agujetas: agujetas?.[z.clave],
        iMusculos: musculosDe.get(z.clave) ?? [] as number[],
        avisosSeries: avisosDeSeries(z.grupos, series, landmarks ?? VOLUME_LANDMARKS_DEFAULT, opcionesSeries)
      };
    });
    const visibles = filas
      .filter(f => f.objetivo != null || f.valor > 0.005)
      .sort((a, b) => Number(b.objetivo != null) - Number(a.objetivo != null) || b.valor - a.valor);
    return { visibles, ocultas: filas.filter(f => !visibles.includes(f)) };
  }, [motor, tabla, sesiones, anterior, allExercises, objetivos, agujetas, landmarks, semanasDelCiclo, semana, meso]);

  const avisosArticulares = useMemo(() => {
    if (!motor || !tabla || !anterior) return [];
    const total = tabla.columnas[tabla.columnas.length - 1];
    return avisosIemIea(motor, anterior, total);
  }, [motor, tabla, anterior]);

  // P2: la misma articulación cargada en dos días seguidos del ciclo.
  const diasSeguidos = useMemo(() => {
    if (!motor) return [];
    return articulacionesEnDiasSeguidos(motor.articulaciones, sesiones.map((se, i) => ({ nombre: cortos[i] ?? se.nombre, dayIndex: grupos[i]?.dayIndex, estresArticular: se.r.estresArticular })));
  }, [motor, sesiones, cortos, grupos]);
  const celdaSeguida = useMemo(() => {
    const s = new Set<string>();
    for (const a of diasSeguidos) { s.add(`${a.j}:${a.sesiones[0]}`); s.add(`${a.j}:${a.sesiones[1]}`); }
    return s;
  }, [diasSeguidos]);

  // Aporte de cada ejercicio a las zonas (las objetivo primero).
  const aportes = useMemo(() => {
    if (!motor) return [];
    const { zonas: defs } = indicesDeZonas(motor);
    return sesiones.map((se, i) => ({
      nombre: cortos[i] ?? se.nombre,
      ejercicios: se.r.porEjercicio.map(pe => {
        const porZona = defs
          .map(z => ({ clave: z.clave, nombre: z.nombre, valor: z.iMusculos.reduce((a, i) => a + (pe.IEM[i] ?? 0), 0), objetivo: objetivos?.[z.clave] != null }))
          .filter(x => x.valor > 0.005)
          .sort((a, b) => Number(b.objetivo) - Number(a.objetivo) || b.valor - a.valor);
        return { exerciseId: pe.exerciseId, IF: pe.IF, porZona };
      })
    }));
  }, [motor, sesiones, cortos, objetivos]);

  const [verTodas, setVerTodas] = React.useState(false);
  const hayObjetivos = Object.keys(objetivos ?? {}).length > 0;
  // P1: las columnas de objetivo se pliegan para que las sesiones quepan sin
  // desplazar; se abren solas si el bloque ya tiene objetivos.
  const [verObjetivos, setVerObjetivos] = React.useState(hayObjetivos);
  React.useEffect(() => { if (hayObjetivos) setVerObjetivos(true); }, [hayObjetivos]);
  const conObjetivos = (!!onCambiarObjetivo || hayObjetivos) && verObjetivos;
  const puedeAbrirObjetivos = !!onCambiarObjetivo || hayObjetivos;

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

  // Series efectivas de la semana y su variación frente a la anterior: salen de
  // `seriesPorGrupo`, la misma cuenta que la tabla por zona (y que seriesPrincipales).
  const seriesSemana = useMemo(() => {
    if (sesiones.length === 0) return null;
    const suma = (ses: typeof sesiones) =>
      [...seriesPorGrupo(ses.flatMap(se => se.ejercicios), allExercises).values()].reduce((a, v) => a + v, 0);
    const actual = suma(sesiones);
    const previa = semana >= 2 ? suma(calcular(semana - 1)) : null;
    return { actual, delta: previa == null ? null : actual - previa };
  }, [sesiones, calcular, semana, allExercises]);

  const avisosTiempo = useMemo(() => (minutosDisponibles == null ? [] : sesiones.flatMap((se, i) => consejosDeTiempo({
    minutosDisponibles,
    tiempoSeg: se.r.tiempoSeg,
    unilaterales: se.ejercicios.filter(e => (nombreCdgDe(e.exerciseId) ?? '').toLowerCase().includes('unilateral')).length,
  }).map(t => `${cortos[i] ?? se.nombre}: ${t}`))), [sesiones, cortos, minutosDisponibles, nombreCdgDe]);

  const [soloConObjetivo, setSoloConObjetivo] = React.useState(false);
  // Desplegado (11-b): «g:espalda» abre el grupo; la clave de una zona, sus
  // músculos; «otros», los músculos sin zona. El grupo empieza abierto para que
  // Dorsal y Trapecio, con su objetivo, se vean como antes.
  const [abiertas, setAbiertas] = React.useState<Set<string>>(() => new Set(['g:espalda']));
  const alternar = (k: string) => setAbiertas(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const FILAS_INICIALES = 6;

  const filasZona = useMemo(() => {
    if (!zonas) return [];
    const base = soloConObjetivo ? zonas.visibles.filter(f => f.objetivo != null) : zonas.visibles;
    return verTodas ? [...base, ...(soloConObjetivo ? [] : zonas.ocultas)] : base.slice(0, FILAS_INICIALES);
  }, [zonas, soloConObjetivo, verTodas]);
  const zonasRestantes = zonas
    ? (soloConObjetivo ? zonas.visibles.filter(f => f.objetivo != null) : [...zonas.visibles, ...zonas.ocultas]).length - filasZona.length
    : 0;

  // Carga aguda / crónica de la semana que se mira (11-a): mismo cálculo que
  // Seguimiento, con los entrenos que la pantalla ya tiene (sin lecturas nuevas).
  const cargaSemana = useMemo(() => {
    if (!motor || !carga) return null;
    const sesionDe = new Map<string, number>();
    carga.grupos.forEach((g, i) => g.workoutIds.forEach(id => sesionDe.set(id, g.dayIndex ?? i)));
    const pesoCorporal = contextoPesoCorporal(allExercises, pesoKg);
    const { semanas } = semanasRealizadasDelMeso({
      logs: carga.logs, meso: carga.meso, cicloDias: carga.cicloDias, vueltas: carga.vueltas, motor, nombreCdgDe, sesionDeWorkout: id => sesionDe.get(id), pesoCorporal,
    });
    const anteriores = semanasAnterioresAlBloque({ logs: carga.logs.filter(l => l.mesocycleId !== carga.meso.id), inicio: carga.meso.startDate, motor, nombreCdgDe, pesoCorporal });
    const r = cargaAgudaCronicaDelMeso({
      motor, semanas, grupos: carga.grupos, meso: carga.meso, vueltas: carga.vueltas, nombreCdgDe,
      umbrales: carga.umbrales, semanasAnteriores: anteriores, semanaReferencia: semana,
      semanaEnCurso: mesocycleWeekNumber(carga.meso.startDate, hoyIsoLocal(), carga.cicloDias),
    });
    const u = { ...UMBRALES_CARGA_POR_DEFECTO, ...carga.umbrales };
    if (r.disponible === false) return { disponible: false as const, motivo: r.motivo, u };
    const totalIF = r.avisos.sesionesIF.find(x => x.sesion === 'Total de sesiones');
    const usadas = r.semanasUsadas.length + r.semanasDeOtrosBloques;
    return { disponible: true as const, valor: totalIF?.valor ?? 0, fuera: !!totalIF?.fuera, fiable: r.fiable, usadas, u };
  }, [motor, carga, semana, nombreCdgDe, allExercises, pesoKg]);

  // Resumen y avisos de la semana (tarjetas de arriba).
  const resumen = useMemo(() => {
    if (!tabla || !total || !zonas || !seriesSemana) return null;
    const iemTotal = total.IEM.reduce((a, v) => a + v, 0);
    const iemPrevio = anterior ? anterior.IEM.reduce((a, v) => a + v, 0) : null;
    const conObjetivo = zonas.visibles.filter(f => f.objetivo != null);
    const bajoObjetivo = conObjetivo.filter(f => f.falta != null && f.falta > 0.05);
    const sesionesIF = tabla.columnas.filter(c => !c.total);
    const mayor = sesionesIF.reduce<Columna | null>((m, c) => (m == null || c.IF > m.IF ? c : m), null);
    const sinContar = avisos.rir5.length + avisos.sinVinculo.length + avisos.fuera.length;
    // Series fuera de rango por grupo (11-c); lo de bajo objetivo va en la tarjeta del IEM.
    const deSeries = [...zonas.visibles, ...zonas.ocultas].flatMap(f => f.avisosSeries);
    const partes: string[] = [];
    if (deSeries.length > 2) partes.push(`${deSeries.length} grupos con series fuera de rango`);
    else deSeries.forEach(a => partes.push(`${MUSCLE_LABELS[a.grupo]} ${a.tipo === 'bajo' ? 'bajo mínimo' : 'sobre máximo'}`));
    if (cargaSemana?.disponible && cargaSemana.fuera) partes.push('carga aguda/crónica fuera de rango');
    if (avisosTiempo.length > 0) partes.push(`${avisosTiempo.length} de tiempo`);
    if (avisosArticulares.length > 0) partes.push(`${avisosArticulares.length} ${avisosArticulares.length === 1 ? 'articular' : 'articulares'}`);
    if (diasSeguidos.length > 0) partes.push(`${diasSeguidos.length} ${diasSeguidos.length === 1 ? 'articulación' : 'articulaciones'} en días seguidos`);
    if (sinContar > 0) partes.push(`${sinContar} ${sinContar === 1 ? 'ejercicio' : 'ejercicios'} sin contar`);
    return {
      iemTotal,
      dIEM: iemPrevio != null ? variacion(iemPrevio, iemTotal) : null,
      enObjetivo: conObjetivo.length - bajoObjetivo.length,
      conObjetivo: conObjetivo.length,
      // IEM de las zonas con objetivo frente a la suma de sus objetivos (11-e):
      // el total de la semana lleva también zonas sin objetivo y no se compara.
      iemConObjetivo: conObjetivo.reduce((a, f) => a + f.valor, 0),
      sumaObjetivos: conObjetivo.reduce((a, f) => a + (f.objetivo ?? 0), 0),
      mayor,
      sesionesIF: sesionesIF.length,
      nAvisos: deSeries.length + (cargaSemana?.disponible && cargaSemana.fuera ? 1 : 0) + avisosTiempo.length + avisosArticulares.length + diasSeguidos.length + sinContar,
      detalleAvisos: partes.join(' · '),
      ifMuyAlto: sesionesIF.some(c => bandaIF(c.IF).banda === 'muy-alta'),
    };
  }, [tabla, total, zonas, seriesSemana, anterior, avisos, avisosTiempo, avisosArticulares, diasSeguidos, cargaSemana]);

  // ── Filas de la tabla por zona (11-b): grupo → zona → músculo ───────────
  const todasLasZonas = zonas ? [...zonas.visibles, ...zonas.ocultas] : [];
  const sumarPorSesion = (xs: number[][]) => xs.reduce((acc, v) => acc.map((a, i) => a + (v[i] ?? 0)), new Array<number>(sesiones.length).fill(0));
  const otros = motor && total
    ? musculosSinZona(motor.musculos).filter(i => (total.IEM[i] ?? 0) > 0.005)
    : [];
  const desplegarTodo = () => setAbiertas(new Set([
    'g:espalda', 'otros', ...todasLasZonas.filter(f => f.iMusculos.length > 1).map(f => f.z.clave),
  ]));
  const desplegable = (k: string, texto: React.ReactNode) => (
    <button type="button" onClick={() => alternar(k)} aria-expanded={abiertas.has(k)} className="inline-flex items-center gap-0.5 min-h-[28px] text-left hover:text-ink">
      <Icon name="chevron_right" size="s" className={`text-ink-3 transition-transform ${abiertas.has(k) ? 'rotate-90' : ''}`} />{texto}
    </button>
  );
  const sinFlecha = (texto: React.ReactNode) => (
    <span className="inline-flex items-center gap-0.5 min-h-[28px]"><Icon name="chevron_right" size="s" className="invisible" />{texto}</span>
  );
  const celdasSesion = (porSesion: number[], tono: string) => porSesion.map((v, i) => (
    <td key={i} className={`py-1.5 px-2 text-right font-mono tabular-nums ${tono} ${v > 0.005 ? '' : 'text-ink-3'}`}>{celda(v)}</td>
  ));
  // Letra del día de la semana de cada sesión (11-d): inicio del bloque + su día del ciclo.
  const letraDia = (dayIndex?: number) => {
    if (dayIndex == null || !meso.startDate) return '';
    const [y, m, d] = meso.startDate.slice(0, 10).split('-').map(Number);
    return INICIAL_DIA[new Date(y, m - 1, d + dayIndex).getDay()];
  };
  const huecosObjetivo = () => (conObjetivos ? [<td key="o" />, <td key="b" />, <td key="f" />] : []);

  const filaMusculo = (i: number, deZona: number | null, clave: string, sangria: string) => {
    if (!motor || !total) return null;
    const valor = total.IEM[i] ?? 0;
    const nombre = motor.musculos[i];
    return (
      <tr key={clave} className="border-t border-dashed border-hairline bg-raised/40">
        <td className={`py-1 pr-3 ${sangria} font-sans text-caption text-ink-2 whitespace-nowrap`} title={nombre}>{nombreCortoDeMusculo(nombre)}</td>
        <td />
        <td className="py-1 px-2 text-right font-mono text-caption text-ink-2 tabular-nums">{celda(valor)}</td>
        {celdasSesion(sesiones.map(se => se.r.IEM[i] ?? 0), 'text-caption text-ink-2')}
        {anterior && <td className="py-1 px-2 text-right font-mono text-caption text-ink-3 tabular-nums whitespace-nowrap">{pct(variacion(anterior.IEM[i] ?? 0, valor))}</td>}
        {agujetas && <td />}
        {conObjetivos && <td />}
        {conObjetivos && <td className="py-1 px-2 font-sans text-caption text-ink-3 whitespace-nowrap">{deZona != null && deZona > 0.005 && valor > 0.005 ? `${Math.round((valor / deZona) * 100)} % de la zona` : ''}</td>}
        {conObjetivos && <td />}
      </tr>
    );
  };

  const filaGrupo = (clave: string, nombre: string) => {
    const k = `g:${clave}`;
    const miembros = todasLasZonas.filter(f => grupoDeZona(f.z.clave)?.clave === clave);
    const valor = miembros.reduce((a, f) => a + f.valor, 0);
    const antes = anterior ? miembros.reduce((a, f) => a + (f.antes ?? 0), 0) : null;
    return (
      <tr key={k} className="border-t border-hairline">
        <td className="py-1.5 pr-3 font-sans text-body-s font-bold text-ink whitespace-nowrap" title={`Suma de ${miembros.map(f => f.z.nombre).join(' y ')}`}>{desplegable(k, nombre)}</td>
        <td className="py-1.5 px-2 text-right font-mono text-body-s text-ink-2 tabular-nums">{miembros.reduce((a, f) => a + f.series, 0) || '·'}</td>
        <td className="py-1.5 px-2 text-right font-mono text-body-s font-bold text-ink tabular-nums">{celda(valor)}</td>
        {celdasSesion(sumarPorSesion(miembros.map(f => f.porSesion)), 'text-body-s text-ink')}
        {anterior && <td className="py-1.5 px-2 text-right font-mono text-body-s text-ink-2 tabular-nums whitespace-nowrap">{pct(antes != null ? variacion(antes, valor) : null)}</td>}
        {agujetas && <td />}
        {huecosObjetivo()}
      </tr>
    );
  };

  const filasOtros = () => {
    if (!motor || !total || otros.length === 0) return null;
    const abierta = abiertas.has('otros');
    return [
      <tr key="otros" className="border-t border-hairline">
        <td className="py-1.5 pr-3 font-sans text-body-s text-ink-2 whitespace-nowrap" title="Músculos que el motor cuenta pero no están en ninguna zona">{desplegable('otros', 'Otros músculos')}</td>
        <td />
        <td className="py-1.5 px-2 text-right font-mono text-body-s text-ink-2 tabular-nums">{celda(otros.reduce((a, i) => a + (total.IEM[i] ?? 0), 0))}</td>
        {celdasSesion(sumarPorSesion(otros.map(i => sesiones.map(se => se.r.IEM[i] ?? 0))), 'text-body-s text-ink-2')}
        {anterior && <td />}
        {agujetas && <td />}
        {huecosObjetivo()}
      </tr>,
      ...(abierta ? otros.map(i => filaMusculo(i, null, `otros:${i}`, 'pl-7')) : []),
    ];
  };

  type FilaZona = (typeof todasLasZonas)[number];
  const filaZona = (f: FilaZona, enGrupo: boolean) => {
    const bajo = f.falta != null && f.falta > 0.05;
    const tonoSeries = f.avisosSeries.some(a => a.tipo === 'sobre') ? 'sobre' : f.avisosSeries.length > 0 ? 'bajo' : null;
    const partes = f.iMusculos.length > 1;
    const abierta = partes && abiertas.has(f.z.clave);
    const fila = (
      <tr key={f.z.clave} className={`border-t border-hairline ${tonoSeries === 'sobre' ? 'bg-danger/10' : tonoSeries === 'bajo' ? 'bg-warning/10' : ''}`}>
        <td className={`py-1.5 pr-3 ${enGrupo ? 'pl-5' : ''} font-sans text-body-s whitespace-nowrap ${f.objetivo != null ? 'font-bold text-ink' : 'text-ink-2'}`}>
          {partes ? desplegable(f.z.clave, f.z.nombre) : sinFlecha(f.z.nombre)}
          {f.avisosSeries.map(a => (
            <span key={a.grupo} className={`block pl-[22px] font-sans text-caption font-normal ${a.tipo === 'sobre' ? 'text-danger' : 'text-warning'}`}>{textoAvisoSeries(a)}</span>
          ))}
        </td>
        <td className={`py-1.5 px-2 text-right font-mono text-body-s tabular-nums ${tonoSeries === 'sobre' ? 'text-danger font-bold' : tonoSeries === 'bajo' ? 'text-warning font-bold' : 'text-ink-2'}`}>{f.series || '·'}</td>
        <td className="py-1.5 px-2 text-right font-mono text-body-s font-bold text-ink tabular-nums">{celda(f.valor)}</td>
        {celdasSesion(f.porSesion, 'text-body-s text-ink')}
        {anterior && <td className="py-1.5 px-2 text-right font-mono text-body-s text-ink-2 tabular-nums whitespace-nowrap">{pct(f.vs)}</td>}
        {agujetas && (
          <td className="py-1.5 px-2 text-right font-mono text-body-s tabular-nums" title={f.agujetas ? `${f.agujetas.fecha} · del DOM's semanal 0-10, convertido a 1-5` : 'Sin respuesta'}>
            {f.agujetas ? <span className={TONO_AGUJETAS(f.agujetas.valor)}>{f.agujetas.valor}/5</span> : <span className="text-ink-3">—</span>}
          </td>
        )}
        {conObjetivos && <td className="py-1.5 px-2 text-right">
          {onCambiarObjetivo ? (
            <input
              key={`${f.z.clave}-${f.objetivo ?? ''}`}
              defaultValue={f.objetivo != null ? String(f.objetivo).replace('.', ',') : ''}
              placeholder="—"
              inputMode="decimal"
              aria-label={`IEM objetivo de ${f.z.nombre}`}
              className="w-16 bg-raised border border-control-line rounded-control px-1.5 py-1 text-right font-mono text-body-s text-ink"
              onBlur={e => { const v = leerNumero(e.currentTarget.value); if (v !== f.objetivo) onCambiarObjetivo(f.z.clave, v); }}
              onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            />
          ) : <span className="font-mono text-body-s text-ink-2">{f.objetivo != null ? n1(f.objetivo) : '—'}</span>}
        </td>}
        {conObjetivos && <td className="py-1.5 px-2">
          {f.objetivo != null && f.objetivo > 0 ? (() => {
            const b = barraFrenteAlObjetivo(f.valor, f.objetivo);
            return (
              <div className="flex items-center gap-2">
                <div className="relative h-2 w-28 rounded-chip bg-raised" role="img" aria-label={`${Math.round(b.ratio * 100)} % del objetivo (${n1(f.objetivo)})`}>
                  <div className={`absolute inset-y-0 left-0 rounded-chip ${TONO_BARRA[b.tono]}`} style={{ width: `${b.ancho * 100}%` }} />
                  <div className="absolute w-0.5 bg-ink" style={{ left: `calc(${MARCA_OBJETIVO * 100}% - 1px)`, top: -4, bottom: -4 }} aria-hidden />
                </div>
                <span className="w-10 text-right font-mono text-caption text-ink-3 tabular-nums">{Math.round(b.ratio * 100)} %</span>
              </div>
            );
          })() : <span className="font-mono text-body-s text-ink-3">—</span>}
        </td>}
        {conObjetivos && <td className={`py-1.5 px-2 text-right font-mono text-body-s tabular-nums ${f.falta == null ? 'text-ink-3' : bajo ? 'text-warning' : 'text-success'}`}>
          {f.falta == null ? '—' : bajo ? n1(f.falta) : f.falta < -0.05 ? <span title={`Pasa el objetivo en ${n1(-f.falta)}`}>✓ +{n1(-f.falta)}</span> : '✓'}
        </td>}
      </tr>
    );
    return [fila, ...(abierta ? f.iMusculos.map(i => filaMusculo(i, f.valor, `${f.z.clave}:${i}`, enGrupo ? 'pl-12' : 'pl-7')) : [])];
  };

  return (
    <div className="bg-surface border border-hairline rounded-surface px-4 py-3">
      <p className="font-mono text-caption font-bold uppercase tracking-wider text-ink-3">
        Resumen de la semana · {etiqueta}
      </p>

      {cargando && <p className="pt-2 font-sans text-body-s text-ink-3">Cargando el catálogo CDG…</p>}
      {error && <p className="pt-2 font-sans text-body-s text-danger">No se pudo leer el catálogo CDG: {error.message}</p>}
      {noSubido && (
        <p className="pt-2 font-sans text-body-s text-ink-3">
          El catálogo CDG aún no está en Firestore (se sube con <code>scripts/subirCatalogoCdg.mjs --aplicar</code>).
        </p>
      )}

      {tabla && total && (
        <div className="pt-2 space-y-3">
          {resumen && seriesSemana && (
            <div className={`grid grid-cols-2 gap-2.5 ${carga ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
              <Tarjeta
                titulo="Series efectivas de la semana"
                valor={n1(seriesSemana.actual)}
                detalle={seriesSemana.delta != null ? <><span className={seriesSemana.delta >= 0 ? 'text-success' : 'text-warning'}>{seriesSemana.delta > 0 ? '+' : ''}{n1(seriesSemana.delta)}</span> vs S{semana - 1}</> : 'Sin semana anterior'}
              />
              <Tarjeta
                titulo="IEM total de la semana"
                valor={n1(resumen.iemTotal)}
                detalle={<>
                  {resumen.dIEM != null && <><span className={resumen.dIEM >= 0 ? 'text-success' : 'text-warning'}>{pct(resumen.dIEM)}</span> vs S{semana - 1}</>}
                  {resumen.dIEM != null && ' · '}
                  {resumen.conObjetivo > 0 ? <>
                    {resumen.dIEM != null ? 'con' : 'Con'} objetivo: <span className={resumen.iemConObjetivo >= resumen.sumaObjetivos - 0.05 ? 'text-success' : ''}>{n1(resumen.iemConObjetivo)} de {n1(resumen.sumaObjetivos)}</span>
                    {` · ${resumen.enObjetivo} de ${resumen.conObjetivo} ${resumen.enObjetivo === 1 ? 'llega' : 'llegan'}`}
                  </> : resumen.dIEM != null ? 'sin objetivos puestos' : 'Sin objetivos puestos'}
                </>}
              />
              <Tarjeta
                titulo="IF de la semana"
                valor={n1(total.IF)}
                detalle={`${resumen.sesionesIF} ${resumen.sesionesIF === 1 ? 'sesión' : 'sesiones'}${resumen.mayor ? ` · máx. ${n1(resumen.mayor.IF)} (${resumen.mayor.nombre})` : ''} · ${formatearTiempo(total.tiempoSeg)}`}
              />
              {carga && (
                <Tarjeta
                  aviso={!!cargaSemana?.disponible && cargaSemana.fuera}
                  titulo="Carga aguda / crónica"
                  valor={cargaSemana?.disponible ? n2(cargaSemana.valor) : '—'}
                  detalle={!cargaSemana ? 'Cargando…' : !cargaSemana.disponible ? cargaSemana.motivo : <>
                    IF · {cargaSemana.valor > cargaSemana.u.superior
                      ? `sube más de lo tolerado (máx. ${n2(cargaSemana.u.superior)})`
                      : cargaSemana.valor < cargaSemana.u.inferior
                        ? `baja más de lo previsto (mín. ${n2(cargaSemana.u.inferior)})`
                        : <>rango {n2(cargaSemana.u.inferior)}–{n2(cargaSemana.u.superior)} <span className="text-success">✓</span></>}
                    {!cargaSemana.fiable && ` · orientativo (${cargaSemana.usadas} de ${SEMANAS_CARGA_CRONICA} semanas)`}
                  </>}
                />
              )}
              <Tarjeta
                aviso={resumen.nAvisos > 0}
                titulo="Avisos"
                valor={String(resumen.nAvisos)}
                detalle={resumen.nAvisos > 0 ? resumen.detalleAvisos : 'Todo en orden'}
              />
            </div>
          )}

          {zonas && (
            <div className="border border-hairline rounded-surface">
              <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                <p className="font-sans text-body-s font-bold text-ink">Por zona muscular
                  <span className="ml-2 font-normal text-ink-2">series + IEM{conObjetivos ? ' frente al objetivo' : ''}</span>
                </p>
                <span className="ml-auto flex flex-wrap gap-1.5">
                {puedeAbrirObjetivos && (
                  <button
                    type="button"
                    onClick={() => setVerObjetivos(v => !v)}
                    aria-pressed={verObjetivos}
                    className={`min-h-[36px] px-3 rounded-chip border font-sans text-label transition-colors ${verObjetivos ? 'bg-accent text-on-accent border-accent' : 'border-hairline text-ink-2 hover:text-ink'}`}
                  >{verObjetivos ? 'Ocultar objetivos' : hayObjetivos ? 'Ver objetivos' : 'Poner objetivos'}</button>
                )}
                {conObjetivos && (
                  <span className="flex gap-1.5">
                    {[{ v: true, t: 'Solo con objetivo' }, { v: false, t: `Todas (${zonas.visibles.length + zonas.ocultas.length})` }].map(o => (
                      <button
                        key={String(o.v)}
                        type="button"
                        onClick={() => setSoloConObjetivo(o.v)}
                        aria-pressed={soloConObjetivo === o.v}
                        className={`min-h-[36px] px-3 rounded-chip border font-sans text-label transition-colors ${
                          soloConObjetivo === o.v ? 'bg-accent text-on-accent border-accent' : 'border-hairline text-ink-2 hover:text-ink'
                        }`}
                      >{o.t}</button>
                    ))}
                  </span>
                )}
                </span>
              </div>
              {/* P3: en móvil, tarjetas por zona en vez de tabla. */}
              <ul className="sm:hidden px-3 pb-2 space-y-2">
                {filasZona.map(f => (
                  <li key={f.z.clave} className={`rounded-control border border-hairline px-3 py-2 ${f.avisosSeries.some(a => a.tipo === 'sobre') ? 'bg-danger/10' : f.avisosSeries.length ? 'bg-warning/10' : ''}`}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={`font-sans text-body-s ${f.objetivo != null ? 'font-bold text-ink' : 'text-ink-2'}`}>{f.z.nombre}</span>
                      <span className="font-mono text-body-s font-bold text-ink tabular-nums">{celda(f.valor)}</span>
                    </div>
                    <p className="font-mono text-caption text-ink-2 tabular-nums">
                      {f.series ? `${f.series} series` : 'sin series directas'}{f.vs != null ? ` · ${pct(f.vs)} vs S${semana - 1}` : ''}{f.agujetas ? ` · agujetas ${f.agujetas.valor}/5` : ''}
                      {f.objetivo != null ? ` · objetivo ${n1(f.objetivo)}${f.falta != null && f.falta > 0.05 ? ` (faltan ${n1(f.falta)})` : ' ✓'}` : ''}
                    </p>
                    <p className="flex flex-wrap gap-1 pt-1">
                      {f.porSesion.map((v, i) => v > 0.005 && <span key={i} className="rounded-control bg-raised px-1.5 font-mono text-caption text-ink-2">{cortos[i] ?? sesiones[i].nombre} {n1(v)}</span>)}
                    </p>
                    {f.avisosSeries.map(a => <p key={a.grupo} className={`font-sans text-caption ${a.tipo === 'sobre' ? 'text-danger' : 'text-warning'}`}>{textoAvisoSeries(a)}</p>)}
                  </li>
                ))}
              </ul>
              <div className="hidden sm:block overflow-x-auto px-3">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="text-ink-3 font-sans text-label">
                      <th className="py-1 pr-3 text-left font-normal">Zona</th>
                      <th className="py-1 px-2 text-right font-normal" title="Series efectivas de la semana en esta zona">Series</th>
                      <th className="py-1 px-2 text-right font-normal text-ink" title="IEM de la semana en esta zona">IEM semana</th>
                      {/* P1: las sesiones justo después del IEM, con la letra del día debajo (11-d); el objetivo, plegable, al final. */}
                      {sesiones.map((se, i) => (
                        <th key={`${i}-${se.nombre}`} title={se.nombre} className="py-1 px-2 text-right font-normal whitespace-nowrap">
                          {cortos[i] ?? se.nombre}
                          {letraDia(grupos[i]?.dayIndex) && <span className="block font-mono text-caption text-ink-3">{letraDia(grupos[i]?.dayIndex)}</span>}
                        </th>
                      ))}
                      {anterior && <th className="py-1 px-2 text-right font-normal whitespace-nowrap">vs S{semana - 1}</th>}
                      {agujetas && <th className="py-1 px-2 text-right font-normal whitespace-nowrap" title="Agujetas de la semana (DOM's 0-10 convertido a 1-5)">Agujetas</th>}
                      {conObjetivos && <th className="py-1 px-2 text-right font-normal" title="IEM semanal que te propones para esta zona en el bloque">Objetivo</th>}
                      {conObjetivos && <th className="py-1 px-2 text-left font-normal" title="Raya: el objetivo. Verde: llega · oro: del 80 al 99 % · marrón: menos del 80 %">Frente al objetivo</th>}
                      {conObjetivos && <th className="py-1 px-2 text-right font-normal">Falta</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {ordenarConGrupos(filasZona).flatMap(o => {
                      if (o.tipo === 'grupo') return [filaGrupo(o.clave, o.nombre)];
                      const g = o.enGrupo ? grupoDeZona(o.fila.z.clave) : undefined;
                      if (g && !abiertas.has(`g:${g.clave}`)) return [];
                      return filaZona(o.fila, o.enGrupo);
                    })}
                    {!soloConObjetivo && filasOtros()}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 border-t border-hairline font-sans text-body-s text-ink-3">
                {(zonasRestantes > 0 || verTodas) && (
                  <button type="button" className="text-accent-ink hover:underline min-h-[32px]" onClick={() => setVerTodas(v => !v)}>
                    {verTodas ? 'Ver menos zonas' : `Ver ${zonasRestantes} ${zonasRestantes === 1 ? 'zona más' : 'zonas más'}`}
                  </button>
                )}
                <button type="button" className="text-accent-ink hover:underline min-h-[32px]" onClick={desplegarTodo}>Desplegar todo</button>
                <button type="button" className="text-accent-ink hover:underline min-h-[32px]" onClick={() => setAbiertas(new Set())}>Plegar todo</button>
                {onCambiarObjetivo && conObjetivos && <span>Escribe el IEM semanal objetivo de cada zona; «Falta» es lo que queda por cubrir.</span>}
                {agujetas && <span>Agujetas: DOM's semanal (0-10) convertido a 1-5.</span>}
              </div>
            </div>
          )}

          {definicion && anterior && (() => {
            const dIEM = variacion(anterior.IEM.reduce((a, v) => a + v, 0), total.IEM.reduce((a, v) => a + v, 0));
            const dIF = variacion(anterior.IF, total.IF);
            return (
              <p className="font-sans text-body-s text-ink-2">
                Bloque de definición: mantener el IEM y bajar el IF. Frente a S{semana - 1}: IEM <b className="font-mono">{pct(dIEM)}</b> · IF <b className="font-mono">{pct(dIF)}</b>.
              </p>
            );
          })()}

          <div className="border border-hairline rounded-surface px-3">
            <Collapsible
              trigger={
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0 flex-1">
                  <span className="font-sans text-body-s font-bold text-ink">Fatiga por sesión (IF)</span>
                  <span className="font-sans text-body-s text-ink-2">
                    {tabla.columnas.filter(c => !c.total).map(c => `${c.nombre} ${Math.round(c.IF)}`).join(' · ')}
                  </span>
                  <span className={`ml-auto px-2 rounded-chip font-mono text-caption ${resumen?.ifMuyAlto ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'}`}>
                    {resumen?.ifMuyAlto ? 'Hay sesiones de IF muy alto' : 'Dentro de lo tolerado'}
                  </span>
                </span>
              }
            >
              <div className="space-y-3 pb-3">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="text-ink-3 font-sans text-label">
                        <th className="py-1 pr-3 text-left font-normal" />
                        {tabla.columnas.map((c, i) => (
                          <th key={`${i}-${c.nombre}`} title={c.completo} className={`py-1 px-2 text-right font-normal whitespace-nowrap ${c.total ? 'text-ink' : ''}`}>{c.nombre}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t border-strong">
                        <td className="py-1.5 pr-3 font-sans text-body-s font-bold text-ink">IF (fatiga)</td>
                        {tabla.columnas.map((c, i) => <td key={`${i}-${c.nombre}`} className="py-1.5 px-2 text-right font-mono text-body-s font-bold text-ink tabular-nums">{n1(c.IF)}</td>)}
                      </tr>
                      <tr className="border-t border-hairline" title="Referencia de la guía por sesión: <40 sencilla · 40-70 intermedia · 70-100 alta · >100 muy alta">
                        <td className="py-1 pr-3 font-sans text-body-s text-ink-2">Nivel de IF</td>
                        {tabla.columnas.map((c, i) => {
                          if (c.total) return <td key={`${i}-${c.nombre}`} />;
                          const b = bandaIF(c.IF);
                          return <td key={`${i}-${c.nombre}`} className={`py-1 px-2 text-right font-sans text-body-s whitespace-nowrap ${TONO_BANDA[b.banda]}`}>{c.IF > 0.005 ? b.etiqueta : '·'}</td>;
                        })}
                      </tr>
                      <tr className="border-t border-hairline">
                        <td className="py-1 pr-3 font-sans text-body-s text-ink-2">Tiempo{minutosDisponibles ? ` (tiene ${minutosDisponibles} min)` : ''}</td>
                        {tabla.columnas.map((c, i) => {
                          const pasa = !c.total && minutosDisponibles != null && c.tiempoSeg / 60 > minutosDisponibles;
                          return <td key={`${i}-${c.nombre}`} className={`py-1 px-2 text-right font-mono text-body-s tabular-nums ${pasa ? 'text-warning font-bold' : 'text-ink-2'}`}>{formatearTiempo(c.tiempoSeg)}</td>;
                        })}
                      </tr>
                      <tr className="border-t border-hairline">
                        <td className="py-1 pr-3 font-sans text-body-s text-ink-2">IEM total</td>
                        {tabla.columnas.map((c, i) => <td key={`${i}-${c.nombre}`} className="py-1 px-2 text-right font-mono text-body-s text-ink-2 tabular-nums">{celda(c.IEM.reduce((a, v) => a + v, 0))}</td>)}
                      </tr>
                      <tr className="border-t border-hairline" title="Estímulo por unidad de fatiga: cuánto IEM compra cada punto de IF">
                        <td className="py-1 pr-3 font-sans text-body-s text-ink-2">IEM por punto de IF</td>
                        {tabla.columnas.map((c, i) => <td key={`${i}-${c.nombre}`} className="py-1 px-2 text-right font-mono text-body-s text-ink-2 tabular-nums">{c.IF > 0.005 ? n1(c.IEM.reduce((a, v) => a + v, 0) / c.IF) : '·'}</td>)}
                      </tr>
                      <tr className="border-t border-hairline" title="Resultados por unidad de tiempo">
                        <td className="py-1 pr-3 font-sans text-body-s text-ink-2">IEM por minuto</td>
                        {tabla.columnas.map((c, i) => <td key={`${i}-${c.nombre}`} className="py-1 px-2 text-right font-mono text-body-s text-ink-2 tabular-nums">{c.tiempoSeg > 0 ? n1(c.IEM.reduce((a, v) => a + v, 0) / (c.tiempoSeg / 60)) : '·'}</td>)}
                      </tr>
                      <Bloque titulo="IEM · grupos (suma de porciones)" columnas={tabla.columnas} filas={tabla.compuestos} />
                      <Bloque titulo="IEM · por músculo" columnas={tabla.columnas} filas={tabla.musculos} />
                    </tbody>
                  </table>
                </div>
                {avisosTiempo.length > 0 && (
                  <ul className="font-sans text-body-s text-warning space-y-0.5">
                    {avisosTiempo.map((t, i) => <li key={i}>{t}</li>)}
                  </ul>
                )}
              </div>
            </Collapsible>
          </div>

          <div className="border border-hairline rounded-surface px-3">
            <Collapsible
              trigger={
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0 flex-1">
                  <span className="font-sans text-body-s font-bold text-ink">Estrés articular</span>
                  <span className="font-sans text-body-s text-ink-2">{tabla.articulaciones.length} zonas</span>
                  <span className={`ml-auto px-2 rounded-chip font-mono text-caption ${avisosArticulares.length + diasSeguidos.length > 0 ? 'bg-warning/10 text-warning' : 'bg-raised text-ink-2'}`}>
                    {diasSeguidos.length > 0 ? `${diasSeguidos.length} en días seguidos` : avisosArticulares.length > 0 ? 'Con avisos' : 'Sin avisos'}
                  </span>
                </span>
              }
            >
              <div className="space-y-3 pb-3">
                {diasSeguidos.length > 0 && (
                  <ul className="space-y-1 font-sans text-body-s text-warning">
                    {diasSeguidos.map(a => (
                      <li key={`ds-${a.j}-${a.sesiones[0]}`}>
                        {a.articulacion}: {cortos[a.sesiones[0]] ?? sesiones[a.sesiones[0]].nombre} ({n1(a.valores[0])}) y {cortos[a.sesiones[1]] ?? sesiones[a.sesiones[1]].nombre} ({n1(a.valores[1])}) en días seguidos, sin 48 h entre medias.
                      </li>
                    ))}
                    <li className="text-ink-3">Se marca cuando las dos sesiones pasan de {UMBRAL_DIAS_SEGUIDOS} en esa articulación (orientativo).</li>
                  </ul>
                )}
                {avisosArticulares.length > 0 && (
                  <ul className="space-y-1 font-sans text-body-s text-warning">
                    {avisosArticulares.map(a => (
                      <li key={`${a.zona}-${a.articulacion}`}>
                        {ZONAS_IEM.find(z => z.clave === a.zona)?.nombre}: el IEM sube {pct(a.dIEM)} y el estrés de {a.articulacion} sube más ({pct(a.dIEA)}). La carga extra va más al tejido pasivo que al músculo.
                      </li>
                    ))}
                  </ul>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="text-ink-3 font-sans text-label">
                        <th className="py-1 pr-3 text-left font-normal" />
                        {tabla.columnas.map((c, i) => (
                          <th key={`${i}-${c.nombre}`} title={c.completo} className={`py-1 px-2 text-right font-normal whitespace-nowrap ${c.total ? 'text-ink' : ''}`}>{c.nombre}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <Bloque titulo="Estrés articular (IEA)" columnas={tabla.columnas} filas={tabla.articulaciones} marcada={(nombre, col) => celdaSeguida.has(`${motor.articulaciones.indexOf(nombre)}:${col}`)} />
                    </tbody>
                  </table>
                </div>
              </div>
            </Collapsible>
          </div>

          <Collapsible trigger={<span className="font-sans text-body-s font-bold text-ink-2">Aporte de cada ejercicio</span>}>
            <div className="space-y-3 pb-1">
              {aportes.map((se, i) => (
                <div key={`${i}-${se.nombre}`}>
                  <p className="font-sans text-label text-ink-3">{se.nombre}</p>
                  <ul className="space-y-1">
                    {se.ejercicios.map((e, i) => (
                      <li key={`${e.exerciseId}-${i}`} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="font-sans text-body-s text-ink">{nombreDe(e.exerciseId)}</span>
                        <span className="font-mono text-label text-ink-3">IF {n1(e.IF)}</span>
                        {e.porZona.slice(0, 4).map(z => (
                          <span key={z.clave} className={`font-mono text-label px-1.5 rounded-control ${z.objetivo ? 'bg-raised text-ink border border-strong' : 'text-ink-2'}`}>
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
            <ul className="space-y-1 font-sans text-body-s text-warning">
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
