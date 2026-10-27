import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getOnboarding } from '../../dbService';
import type { Mesocycle, MuscleGroup, WorkoutExercise, WorkoutLog } from '../../types';
import type { VolumeLandmark } from '../../data/volumeLandmarks';
import { useMotorCdg } from '../../hooks/useMotorCdg';
import { useAgujetasCdg } from '../../hooks/useAgujetasCdg';
import { resolverEjercicioDelMeso } from '../../utils/progression';
import { hoyIsoLocal } from '../../utils/trainingWeek';
import { ZONAS_IEM, type ZonaIem } from '../../utils/cdg/zonas';
import { resumenSesion } from '../../utils/cdg/programacion';
import {
  propuestaZona, tipoDeBloque, contextoDeLaSemana, agujetasVigentes, sensibilidadDeZona,
  type Propuesta, type Sensibilidad,
} from '../../utils/cdg/agujetas';
import {
  proponerProgresionIem, iemProgramadoPorZona, aplicarOperaciones, semanasSinMejorar,
  type CambioIem, type EjercicioProgramable, type OperacionIem, type ResumenZonaIem,
} from '../../utils/cdg/progresionIem';
import { borradorDeSemanas, tonelajePorSemana, etiquetaOperacion, type SemanaBorrador } from '../../utils/cdg/borradorIem';

/* ═══════════════════════════════════════════════════════════════════════════
   «Proponer por IEM» dentro de Planificar progresión (13-a, 13-d, 13-g, 13-h)

   Las reglas que decidió Dani el 25-10 (docs/.../decisiones-progresion.md):
   el % es semana a semana sobre lo PROGRAMADO la semana anterior; modo por
   zona (con objetivo, dinámico; el resto, estático); el objetivo de Volumen es
   la meta; con agujetas 5 nunca sube y decide el coach; la serie de más solo
   si cabe en su tiempo de sesión; la técnica solo para ahorrar tiempo; aviso
   si el rendimiento se estanca; la semana siguiente en firme y las demás en
   borrador. Nada se guarda hasta que el coach programa los cambios.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface DiaParaIem {
  clave: string;
  name: string;
  dayIndex?: number;
  workoutIds: string[];
  exercises: WorkoutExercise[];
}

export interface ZonaDeLaPropuesta {
  zona: ZonaIem;
  nombre: string;
  modo: Sensibilidad;
  propuesta: Propuesta;
  /** % que se usa (el del coach o el sugerido). */
  pct: number;
  sugerido: number;
  manual: boolean;
  objetivo?: number;
  resumen?: ResumenZonaIem;
  /** Subida acumulada desde la semana de partida del bloque (S1 o la pivote). */
  acumulado: number | null;
  semanaDePartida: number;
  /** Semanas seguidas sin mejorar el tonelaje con más carga (2 = vigilar, 3+ = bajar). */
  semanasSinMejorar: number;
  /** Agujetas vigentes de la zona (1-5, del DOM's semanal), si hay. */
  agujetas?: number;
}

export interface CasillaPropuesta { we: WorkoutExercise; motivos: string[]; incluida: boolean; porTiempo: boolean; superaMrv: boolean }

const claveDe = (dia: string, exIdx: number) => `${dia}#${exIdx}`;
const ZONA_DE = new Map(ZONAS_IEM.map(z => [z.clave, z]));

export function usePropuestaIem(p: {
  activo: boolean;
  meso: Mesocycle;
  dias: DiaParaIem[];
  vueltas: number;
  cicloDias: number;
  logs?: WorkoutLog[];
  semanaActual?: number;
  elegidos: Set<string>;
  nombreCdgDe?: (id: string) => string | undefined;
  grupoDe: (we: WorkoutExercise) => MuscleGroup | undefined;
  landmarks?: Partial<Record<MuscleGroup, VolumeLandmark>>;
}) {
  const { motor } = useMotorCdg();
  const { agujetas, sueño, estres, motivacion, fatigaPost } = useAgujetasCdg(p.activo ? p.meso.athleteId : undefined);
  const { data: alta } = useQuery({
    queryKey: ['onboarding', p.meso.athleteId],
    queryFn: () => getOnboarding(p.meso.athleteId),
    enabled: p.activo && !!p.meso.athleteId,
  });

  const descargas = p.meso.semanasDescarga ?? [];
  const destinos = Array.from({ length: p.vueltas }, (_, i) => i + 1).filter(s => s >= 2 && !descargas.includes(s));
  const [semana, setSemanaState] = useState(() => {
    const siguiente = (p.semanaActual ?? 1) + 1;
    return destinos.includes(siguiente) ? siguiente : destinos[0] ?? 2;
  });
  const [pctManual, setPctManual] = useState<Partial<Record<ZonaIem, number>>>({});
  const [modoLocal, setModoLocal] = useState<Partial<Record<ZonaIem, Sensibilidad>>>({});
  const [palancas, setPalancas] = useState({ rir: true, series: true, tecnica: true });
  const [descartados, setDescartados] = useState<Set<string>>(new Set());
  const setSemana = (s: number) => { setSemanaState(s); setPctManual({}); setDescartados(new Set()); };

  const { activo, meso, dias, vueltas, cicloDias, logs, semanaActual, elegidos, nombreCdgDe: nombreCdgDeP, grupoDe, landmarks } = p;
  const calculo = useMemo(() => {
    const descargas = meso.semanasDescarga ?? [];
    if (!activo || !motor || !nombreCdgDeP) return null;
    const nombreCdgDe = nombreCdgDeP;
    const ref = semana - 1;
    const resolver = (we: WorkoutExercise, s: number) => (s <= 0 ? we : resolverEjercicioDelMeso(we, meso, s));
    // Referencia: lo PROGRAMADO la semana anterior, se hiciera o no (Dani, 25-10).
    const iemBase = iemProgramadoPorZona(motor, nombreCdgDe, dias.flatMap(d => d.exercises.map(we => resolver(we, ref))));
    const velocidad = tipoDeBloque(meso).velocidad;
    const { contexto, motivos } = contextoDeLaSemana({ estres: estres?.value, sueñoHoras: sueño?.value, motivacion: motivacion?.value });
    const hoy = hoyIsoLocal();

    const ejercicios: EjercicioProgramable[] = dias.flatMap(d => d.exercises.map((we, exIdx) => ({
      clave: claveDe(d.clave, exIdx), dia: d.clave, we: resolver(we, semana), grupo: grupoDe(we), movible: elegidos.has(claveDe(d.clave, exIdx)),
    })));
    // Zonas que trabajan de verdad los ejercicios elegidos (≥ 15 % de la más trabajada).
    const iemElegidos = iemProgramadoPorZona(motor, nombreCdgDe, ejercicios.filter(e => e.movible).map(e => e.we));
    const maxElegidos = Math.max(0, ...Object.values(iemElegidos));
    const zonas = ZONAS_IEM.filter(z => (iemBase[z.clave] ?? 0) > 0.005 && iemElegidos[z.clave] >= maxElegidos * 0.15 && iemElegidos[z.clave] > 0.005);

    const semanaDePartida = Math.min(...(meso.semanasPivot?.length ? meso.semanasPivot : [1]));
    const iemPartida = iemProgramadoPorZona(motor, nombreCdgDe, dias.flatMap(d => d.exercises.map(we => resolver(we, semanaDePartida))));

    // Rendimiento: tonelaje de las semanas hechas frente a la carga programada.
    const hechas = Array.from({ length: Math.max(0, (semanaActual ?? 0)) }, (_, i) => i + 1);

    const porZona = zonas.map(z => {
      const lectura = agujetas?.[z.clave];
      const vigente = !!lectura && agujetasVigentes(lectura.fecha, hoy);
      const objetivo = meso.cdgObjetivosIem?.[z.clave];
      const modo = modoLocal[z.clave] ?? sensibilidadDeZona(meso, z.clave);
      const propuesta = propuestaZona({
        agujetas: vigente ? lectura!.valor : undefined, anterior: vigente ? lectura!.anterior : undefined, sensible: z.sensible,
        tipo: { sensibilidad: modo, velocidad }, esObjetivo: objetivo != null, iem: iemBase[z.clave], contexto, fatigaPost: fatigaPost?.value, objetivo,
      });
      const sugerido = propuesta.pct ?? 0;
      const manual = pctManual[z.clave] != null;
      const idsZona = new Set(dias.flatMap(d => d.exercises.filter(we => {
        const g = grupoDe(we); return !!g && (z.grupos as readonly string[]).includes(g);
      }).map(we => we.exerciseId)));
      const t = logs ? tonelajePorSemana(logs, meso, cicloDias, idsZona, hechas) : [];
      const conDatos = hechas.map((s, i) => ({ s, t: t[i] })).filter(x => x.t > 0);
      const cargas = conDatos.map(x => iemProgramadoPorZona(motor, nombreCdgDe, dias.flatMap(d => d.exercises.map(we => resolver(we, x.s))))[z.clave]);
      return {
        agujetas: vigente ? lectura!.valor : undefined,
        zona: z.clave, nombre: z.nombre, modo, propuesta, pct: pctManual[z.clave] ?? sugerido, sugerido, manual, objetivo,
        semanaDePartida, acumulado: null as number | null,
        semanasSinMejorar: semanasSinMejorar(conDatos.map(x => x.t), cargas),
        partida: iemPartida[z.clave] ?? 0,
      };
    });

    // Tiempo de sesión: el máximo del alta y lo que dura ya cada día esa semana.
    const limiteSeg = alta?.sessionMaxMinutes && alta.sessionMaxMinutes > 0 ? alta.sessionMaxMinutes * 60 : undefined;
    const tiempo = limiteSeg ? {
      limiteSeg,
      porDia: Object.fromEntries(dias.map(d => [d.clave, resumenSesion(motor, d.exercises.map(we => resolver(we, semana)), nombreCdgDe).tiempoSeg])),
    } : undefined;
    const mrvPorGrupo = landmarks ? Object.fromEntries(Object.entries(landmarks).map(([g, l]) => [g, l?.mrv])) as Partial<Record<MuscleGroup, number>> : undefined;
    const pctPorZona = Object.fromEntries(porZona.filter(z => z.pct !== 0).map(z => [z.zona, z.pct])) as Partial<Record<ZonaIem, number>>;
    const r = proponerProgresionIem({ motor, nombreCdgDe, ejercicios, iemBase, pctPorZona, palancas, tiempo, mrvPorGrupo });

    const claveCambio = (c: CambioIem) => `${c.clave}:${c.op.tipo}`;
    const marcados = r.cambios.filter(c => !descartados.has(claveCambio(c)));
    const opsDe = new Map<string, OperacionIem[]>();
    for (const c of marcados) opsDe.set(c.clave, [...(opsDe.get(c.clave) ?? []), c.op]);
    const aplicados = ejercicios.map(x => (opsDe.has(x.clave) ? { ...x, we: aplicarOperaciones(x.we, opsDe.get(x.clave)!) } : x));

    // Casillas de la semana programada: cada ejercicio elegido, con lo que cambia (o «= mantiene»).
    const casillas = new Map<string, CasillaPropuesta>();
    for (const x of aplicados.filter(e => e.movible)) {
      const suyos = r.cambios.filter(c => c.clave === x.clave);
      const incluidos = suyos.filter(c => !descartados.has(claveCambio(c)));
      casillas.set(x.clave, {
        we: x.we, motivos: incluidos.map(c => etiquetaOperacion(c.op)), incluida: suyos.length === 0 || incluidos.length > 0,
        porTiempo: incluidos.some(c => c.porTiempo), superaMrv: incluidos.some(c => !!c.superaMrv),
      });
    }

    const despues = iemProgramadoPorZona(motor, nombreCdgDe, aplicados.map(x => x.we));
    const zonasFinal: ZonaDeLaPropuesta[] = porZona.map(({ partida, ...z }) => ({
      ...z,
      resumen: r.zonas.find(x => x.zona === z.zona),
      acumulado: partida > 0.005 ? (despues[z.zona] ?? 0) / partida - 1 : null,
    }));

    // Borrador: de la semana siguiente hasta antes de la próxima descarga.
    const siguientes: number[] = [];
    for (let s = semana + 1; s <= vueltas && !descargas.includes(s) && siguientes.length < 4; s++) siguientes.push(s);
    const borrador: SemanaBorrador[] = siguientes.length ? borradorDeSemanas({
      motor, nombreCdgDe, ejercicios: aplicados, semanas: siguientes, palancas, tiempo, mrvPorGrupo,
      pctPorZona: Object.fromEntries(zonasFinal.filter(z => z.pct > 0).map(z => [z.zona, z.pct])) as Partial<Record<ZonaIem, number>>,
      objetivos: meso.cdgObjetivosIem,
    }) : [];

    // «Por qué» (13-e): el contexto y cómo responde cada zona.
    const porQue = {
      contexto, motivos, velocidad,
      sueño: sueño?.value, estres: estres?.value, motivacion: motivacion?.value,
      agujetasMedias: (() => { const v = zonasFinal.map(z => z.agujetas).filter((x): x is number => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; })(),
    };
    return { zonas: zonasFinal, cambios: r.cambios, marcados, casillas, borrador, tiempo, ref, porQue };
  }, [activo, motor, nombreCdgDeP, semana, dias, meso, grupoDe, elegidos, logs, cicloDias, vueltas, semanaActual, landmarks,
    agujetas, sueño, estres, motivacion, fatigaPost, alta, pctManual, modoLocal, palancas, descartados]);

  /** Incluir o quitar todos los cambios propuestos de un ejercicio (tocar su casilla). */
  const alternarEjercicio = (clave: string) => {
    if (!calculo) return;
    const suyos = calculo.cambios.filter(c => c.clave === clave).map(c => `${c.clave}:${c.op.tipo}`);
    if (suyos.length === 0) return;
    setDescartados(prev => {
      const n = new Set(prev);
      const todosFuera = suyos.every(k => n.has(k));
      for (const k of suyos) { if (todosFuera) n.delete(k); else n.add(k); }
      return n;
    });
  };

  /** Operaciones marcadas por ejercicio, para programarlas en `semana`. */
  const operacionesMarcadas = () => {
    const m = new Map<string, OperacionIem[]>();
    for (const c of calculo?.marcados ?? []) m.set(c.clave, [...(m.get(c.clave) ?? []), c.op]);
    return m;
  };

  return {
    motor, calculo, semana, setSemana, destinos,
    palancas, setPalancas: (k: keyof typeof palancas, v: boolean) => { setPalancas(prev => ({ ...prev, [k]: v })); setDescartados(new Set()); },
    setPct: (z: ZonaIem, v: number) => { setPctManual(prev => ({ ...prev, [z]: v })); setDescartados(new Set()); },
    setModo: (z: ZonaIem, m: Sensibilidad) => { setModoLocal(prev => ({ ...prev, [z]: m })); setPctManual(prev => { const n = { ...prev }; delete n[z]; return n; }); setDescartados(new Set()); },
    alternarEjercicio, operacionesMarcadas,
    nombreZona: (z: ZonaIem) => ZONA_DE.get(z)?.nombre ?? z,
  };
}
