import type {
  CierreDeHipotesis, ExperienceLevel, Mesocycle, Questionnaire, QuestionnaireResponse, WorkoutLog,
} from '../../types.js';
import type { NombreCdgDe } from '../cdg/adaptadores.js';
import {
  agujetasPorZona, contextoDeLaSemana, propuestaZona, sensibilidadDeZona, tipoDeBloque,
} from '../cdg/agujetas.js';
import { iemSemanalPorZona } from '../cdg/iemSemanal.js';
import type { MotorCdg } from '../cdg/motor.js';
import { cansancioDeSesiones } from '../cdg/senalesPorSemana.js';
import { ZONAS_IEM, type ZonaIem } from '../cdg/zonas.js';
import type { ProgresionEjercicio } from '../progresionDelBloque.js';
import { historialDeSeñal } from '../signalReading.js';
import { addDays } from '../trainingWeek.js';
import {
  estadoDeLosEjercicios, estadoDelBloqueAnterior, iniciosDeSemanaDelBloque,
  type EstadoDeEjercicio, type EstadoDelBloque,
} from './estadoDelBloqueAnterior.js';
import { RM_RUIDO_PCT } from './cifras.js';
import { ordenarBloques } from './historial.js';
import { estrellasDe, nombreCortoDeZona } from './tiposDeBloque.js';
import { franjaDeResultado, veredictosDelBloque, zonaPrincipalDeEjercicios, type VeredictoCalculado } from './veredicto.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Los veredictos del bloque, montados para el cierre (17-11-2026)

   `veredicto.ts` decide; esto le junta la entrada con lo que el cierre ya
   tiene (`cierreCompleto.ts`): los registros del atleta, la progresión por
   ejercicio, la adherencia y los cuestionarios. De aquí sale también la ficha
   de cierre del método (contexto medio, cansancio medio, molestias).

   El PROCESO necesita el motor CDG (el IEM realizado por zona), que solo
   existe en la vista del coach. Sin motor no hay veredictos (`sinMotor`): dar
   una lectura solo con el resultado diría «confirmada» de un bloque del que
   no se sabe si se hizo. El resto del cierre no depende de esto.

   Puro: no lee ni escribe nada.
   ═══════════════════════════════════════════════════════════════════════════ */

export type ContextoMedio = 'favorable' | 'neutro' | 'desfavorable';

export interface VeredictosDelCierre {
  /** Las zonas con hipótesis, en el orden de las zonas. */
  estrellas: ZonaIem[];
  /** Uno por hipótesis. Vacío si falta el motor CDG (`sinMotor`). */
  veredictos: VeredictoCalculado[];
  /** El bloque tiene hipótesis pero no hay motor CDG con el que medir el proceso. */
  sinMotor: boolean;
  /** Cómo acaba el bloque por zona: de aquí arranca la hipótesis del siguiente. */
  estado: EstadoDelBloque | null;
  /** Parones y molestias por ejercicio (para los candidatos a cambio). */
  ejercicios: EstadoDeEjercicio[];
  /** Ejercicio → zona a la que más estímulo reparte. Vacío sin motor. */
  zonaDe: Record<string, ZonaIem>;
  cansancioMedio: number | null;
  /** Contexto medio del bloque (estrés, sueño y motivación de los cuestionarios). `null` sin datos. */
  contexto: ContextoMedio | null;
  adherenciaPct: number | null;
  /** Semanas del bloque en las que las agujetas frenaron cada zona con estrella. */
  semanasFrenadasPorZona: Partial<Record<ZonaIem, number>>;
  /** Los bloques ANTERIORES del atleta, del más antiguo al más reciente. */
  anteriores: Mesocycle[];
  /** Última sesión registrada del bloque (`YYYY-MM-DD`), si hay alguna. */
  ultimaSesion: string | null;
}

export interface EntradaDeVeredictosDelCierre {
  meso: Mesocycle;
  /** Todos los bloques del atleta (de ellos salen los anteriores con su cierre firmado). */
  mesocycles: readonly Mesocycle[];
  /** TODOS los registros del atleta, no solo los del bloque. */
  logs: readonly WorkoutLog[];
  /** Último día real del bloque (`finDeBloque`). */
  fin: string;
  hoy: string;
  /** La progresión por ejercicio que ya calcula el cierre. */
  progresion: ReadonlyArray<Pick<ProgresionEjercicio, 'exerciseId' | 'nombre' | 'deltaPct' | 'metrica'>>;
  adherenciaPct?: number | null;
  motor?: MotorCdg | null;
  nombreCdgDe?: NombreCdgDe;
  nivel?: ExperienceLevel;
  responses?: QuestionnaireResponse[];
  questionnaires?: Questionnaire[];
}

const media = (v: readonly number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined);
const r1 = (v: number) => Math.round(v * 10) / 10;

/** Los registros de un bloque: los que llevan su id o, sin id (antiguos), los de sus fechas. */
export function logsDelBloque(logs: readonly WorkoutLog[], meso: Pick<Mesocycle, 'id' | 'startDate'>, fin: string): WorkoutLog[] {
  return logs.filter(l => l.date <= fin && (l.mesocycleId ? l.mesocycleId === meso.id : l.date >= meso.startDate));
}

/**
 * El contexto medio del bloque: la media de estrés, sueño y motivación de los
 * cuestionarios contestados entre el inicio y el final, leída con los mismos
 * umbrales del protocolo semanal (`contextoDeLaSemana`).
 */
export function contextoMedioDelBloque(o: {
  inicio: string; fin: string; responses?: QuestionnaireResponse[]; questionnaires?: Questionnaire[];
}): ContextoMedio | null {
  if (!o.responses?.length || !o.questionnaires?.length) return null;
  const de = (clave: string) => media(historialDeSeñal(clave, o.responses!, o.questionnaires!)
    .filter(p => p.date >= o.inicio && p.date <= o.fin).map(p => p.value));
  const estres = de('wellness.stress_weekly');
  const sueño = de('wellness.sleep_hours_weekly');
  const motivacion = de('wellness.motivation_weekly');
  const { contexto } = contextoDeLaSemana({
    estres: estres == null ? undefined : r1(estres),
    sueñoHoras: sueño == null ? undefined : r1(sueño),
    motivacion: motivacion == null ? undefined : r1(motivacion),
  });
  return contexto === 'sin-dato' ? null : contexto;
}

/**
 * Semanas del bloque (de las que cuentan) en las que las agujetas frenaron
 * cada zona: la última lectura de ESA semana, pasada por el mismo freno del
 * protocolo (`propuestaZona`: un 5, un 4 en zona no propensa o dos semanas
 * seguidas en 4).
 */
export function semanasFrenadasPorAgujetas(o: {
  meso: Mesocycle;
  zonas: readonly ZonaIem[];
  semanas: EstadoDelBloque['semanas'];
  logs: readonly WorkoutLog[];
  responses?: QuestionnaireResponse[];
  questionnaires?: Questionnaire[];
}): Partial<Record<ZonaIem, number>> {
  const out: Partial<Record<ZonaIem, number>> = {};
  const r = o.responses ?? []; const q = o.questionnaires ?? [];
  const tipo = tipoDeBloque(o.meso);
  for (const s of o.semanas) {
    if (!s.cuenta) continue;
    const finSemana = addDays(s.inicio, 6);
    const lecturas = agujetasPorZona(k => historialDeSeñal(k, r, q).filter(p => p.date <= finSemana), o.logs, finSemana);
    for (const zona of o.zonas) {
      const l = lecturas[zona];
      if (!l || l.fecha < s.inicio) continue;
      const def = ZONAS_IEM.find(z => z.clave === zona)!;
      const p = propuestaZona({
        agujetas: l.valor, anterior: l.anterior, sensible: def.sensible, esObjetivo: true,
        tipo: { ...tipo, sensibilidad: sensibilidadDeZona(o.meso, zona) },
        primeraSemanaTrasParon: !!o.meso.vuelveDeParon && s.semana === 1,
      });
      if (p.tono === 'freno') out[zona] = (out[zona] ?? 0) + 1;
    }
  }
  return out;
}

export function veredictosDelCierre(e: EntradaDeVeredictosDelCierre): VeredictosDelCierre {
  const { meso, fin } = e;
  const estrellas = estrellasDe(meso);
  const delBloque = logsDelBloque(e.logs, meso, fin);
  const anteriores = ordenarBloques(e.mesocycles.filter(m => m.id !== meso.id && m.startDate < meso.startDate));
  const cansancioMedio = cansancioDeSesiones(delBloque)?.media ?? null;
  const contexto = contextoMedioDelBloque({ inicio: meso.startDate, fin, responses: e.responses, questionnaires: e.questionnaires });
  const idsDelBloque = [...new Set(delBloque.flatMap(l => (l.entries ?? []).map(x => x.exerciseId)))];
  const ejercicios = estadoDeLosEjercicios({ logs: e.logs, meso, hasta: fin, ejercicios: idsDelBloque });
  const ultimaSesion = delBloque.reduce<string | null>((u, l) => (u == null || l.date > u ? l.date : u), null);
  const base = {
    estrellas, cansancioMedio, contexto, adherenciaPct: e.adherenciaPct ?? null, anteriores, ejercicios, ultimaSesion,
  };

  if (!e.motor || !e.nombreCdgDe) {
    return { ...base, veredictos: [], sinMotor: estrellas.length > 0, estado: null, zonaDe: {}, semanasFrenadasPorZona: {} };
  }

  // Con el bloque a medias solo se miran las semanas que ya han empezado (las
  // que faltan no son estímulo sin dar) y la que está en curso no cuenta.
  const enCurso = e.hoy <= fin ? e.hoy : undefined;
  const iem = iemSemanalPorZona(e.motor, delBloque, e.nombreCdgDe, iniciosDeSemanaDelBloque(meso, enCurso ?? fin), enCurso);
  const estado = estadoDelBloqueAnterior({ iem, meso });
  const zonaDe = zonaPrincipalDeEjercicios(e.motor, e.nombreCdgDe, [...new Set([...idsDelBloque, ...e.progresion.map(p => p.exerciseId)])]);
  const semanasFrenadasPorZona = estrellas.length === 0 ? {} : semanasFrenadasPorAgujetas({
    meso, zonas: estrellas, semanas: estado.semanas, logs: delBloque, responses: e.responses, questionnaires: e.questionnaires,
  });
  const veredictos = veredictosDelBloque({
    hipotesis: meso.hipotesis, estado, progresion: e.progresion, zonaDe, ejercicios, cansancioMedio,
    nivel: e.nivel, historial: anteriores,
    contexto: { adherenciaPct: e.adherenciaPct ?? null, ...(contexto ? { contexto } : {}) },
    semanasFrenadasPorZona,
  });
  return { ...base, veredictos, sinMotor: false, estado, zonaDe, semanasFrenadasPorZona };
}

// ── La ficha de cierre del método ────────────────────────────────────────────

export interface DatosDeFicha {
  contexto: ContextoMedio | null;
  cansancioMedio: number | null;
  /** Ejercicios con molestia apuntada en el bloque. */
  ejercicios: readonly Pick<EstadoDeEjercicio, 'exerciseId' | 'molestia'>[];
  nombreDe?: (exerciseId: string) => string | undefined;
  /** Nombre de la fase de nutrición que regía al cerrar. */
  faseNutricional?: string | null;
  pesoDeltaKg?: number | null;
}

/** Las molestias del bloque en una frase («Press militar (2 sesiones, hasta 6/10)»). Vacía si no hubo. */
export function molestiasEnFrase(ejercicios: DatosDeFicha['ejercicios'], nombreDe?: DatosDeFicha['nombreDe']): string {
  return ejercicios.filter(x => x.molestia).map(x => {
    const m = x.molestia!;
    const veces = `${m.veces} ${m.veces === 1 ? 'sesión' : 'sesiones'}`;
    return `${nombreDe?.(x.exerciseId) ?? x.exerciseId} (${veces}${m.maxima != null ? `, hasta ${m.maxima}/10` : ''})`;
  }).join(', ');
}

/** Lo que se guarda en `CierreDeHipotesis.ficha`. Los huecos no se escriben (`cierreParaGuardar` los quita). */
export function fichaDeCierre(d: DatosDeFicha): NonNullable<CierreDeHipotesis['ficha']> {
  const molestias = molestiasEnFrase(d.ejercicios, d.nombreDe);
  return {
    ...(d.contexto ? { contexto: d.contexto } : {}),
    ...(d.cansancioMedio != null ? { cansancioMedio: d.cansancioMedio } : {}),
    ...(molestias ? { molestias } : {}),
    ...(d.faseNutricional?.trim() ? { faseNutricional: d.faseNutricional.trim() } : {}),
    ...(d.pesoDeltaKg != null ? { pesoDeltaKg: r1(d.pesoDeltaKg) } : {}),
  };
}

const fmt = (v: number) => r1(v).toLocaleString('es-ES');

/** La ficha en una línea compacta, para debajo de los veredictos. */
export function fichaEnLinea(f: CierreDeHipotesis['ficha'] | undefined): string {
  if (!f) return '';
  return [
    f.contexto ? `Contexto ${f.contexto}` : null,
    f.cansancioMedio != null ? `cansancio medio al salir ${fmt(f.cansancioMedio)}/10` : null,
    f.molestias ? `molestias: ${f.molestias}` : 'sin molestias apuntadas',
    f.faseNutricional ? `nutrición: ${f.faseNutricional}` : null,
    f.pesoDeltaKg != null ? `peso ${f.pesoDeltaKg > 0 ? '+' : f.pesoDeltaKg < 0 ? '−' : ''}${fmt(Math.abs(f.pesoDeltaKg))} kg` : null,
  ].filter((x): x is string => !!x).join(' · ');
}

// ── Lo que enseña la ficha de cada zona ──────────────────────────────────────

export type TonoDeLectura = 'bien' | 'atencion' | 'neutro';

export interface FilaDeVeredicto {
  /** «Cumplido», «No», «Sí», «Sin dato»… La palabra que abre la fila. */
  estado: string;
  tono: TonoDeLectura;
  texto: string;
}

export interface LecturaDeVeredicto {
  zona: string;
  nombre: string;
  sello: { texto: string; tono: TonoDeLectura };
  proceso: FilaDeVeredicto;
  resultado: FilaDeVeredicto;
  limites: { texto: string; pasado: boolean };
  /** La propuesta del motor para el bloque siguiente; `null` en un veredicto guardado sin recalcular. */
  siguiente: string | null;
}

const SELLO: Record<VeredictoCalculado['lectura'], { texto: string; tono: TonoDeLectura }> = {
  confirmada: { texto: 'Apuesta confirmada', tono: 'bien' },
  // Ni a favor ni en contra: mejora de verdad, pero no lo que se buscaba (auditoría de cifras, 17-11-2026).
  mejora_parcial: { texto: 'Mejora, menos de lo buscado', tono: 'neutro' },
  no_responde: { texto: 'No responde a esto', tono: 'atencion' },
  responde_con_menos: { texto: 'Responde con menos', tono: 'bien' },
  sin_probar: { texto: 'Sin probar', tono: 'neutro' },
};

/** El sello de una lectura (también para los veredictos ya guardados). */
export const selloDeLectura = (lectura: VeredictoCalculado['lectura']) => SELLO[lectura];

type VeredictoParaLeer = Pick<VeredictoCalculado,
  'zona' | 'palanca' | 'iemMedio' | 'iemMedioObjetivo' | 'procesoCumplido' | 'rmPct' | 'rmObjetivoPct' | 'resultadoCumplido' | 'lectura'>
  & Partial<Pick<VeredictoCalculado, 'ejerciciosQueCuentan' | 'resultado' | 'mejoraSinLlegar' | 'rmPctAcumulado' | 'limites' | 'propuesta' | 'causa'>>;

const conSigno = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt(Math.abs(v))}`;

/**
 * Las tres filas de la ficha de una zona (proceso, resultado y límites), con
 * sus cifras. Vale para el veredicto recién calculado y para el guardado: lo
 * que el guardado no trae (límites, propuesta) sale como «sin dato».
 */
export function lecturaDeVeredicto(v: VeredictoParaLeer, o: {
  /** Techo de la hipótesis y estado realizado de la zona, para decir dónde acabó. */
  techo?: number;
  iemFinal?: number;
  /** Semanas frenadas por agujetas en la zona. */
  semanasFrenadas?: number;
  /** Duración media de las sesiones del bloque, en minutos. */
  duracionMediaMin?: number | null;
} = {}): LecturaDeVeredicto {
  const zona = v.zona as ZonaIem;
  const nombre = ZONAS_IEM.some(z => z.clave === zona) ? nombreCortoDeZona(zona) : v.zona;

  // Proceso
  let proceso: FilaDeVeredicto;
  if (v.iemMedio == null) {
    proceso = { estado: 'Sin dato.', tono: 'neutro', texto: 'No hay estímulo registrado de la zona en las semanas que cuentan.' };
  } else if (v.procesoCumplido == null) {
    proceso = { estado: 'Sin objetivo.', tono: 'neutro', texto: `IEM medio ${fmt(v.iemMedio)}. El bloque no tenía cifra de proceso: se juzga solo por el resultado.` };
  } else {
    const bajar = v.palanca === 'recuperar';
    const pedia = bajar && o.techo != null ? `tope de ${fmt(o.techo)}` : v.iemMedioObjetivo != null ? `pedía ${fmt(v.iemMedioObjetivo)} o más` : null;
    const extras = [
      o.iemFinal != null && o.iemFinal > 0 ? `Acabó en ${fmt(o.iemFinal)}${!bajar && o.techo != null ? ` con techo de ${fmt(o.techo)}` : ''}.` : null,
      o.semanasFrenadas ? `Las agujetas la frenaron ${o.semanasFrenadas} ${o.semanasFrenadas === 1 ? 'semana' : 'semanas'}.` : null,
    ].filter(Boolean).join(' ');
    proceso = {
      estado: v.procesoCumplido ? 'Cumplido.' : 'No cumplido.',
      tono: v.procesoCumplido ? 'bien' : 'atencion',
      texto: `IEM medio ${fmt(v.iemMedio)}${pedia ? ` (${pedia})` : ''}.${extras ? ` ${extras}` : ''}`,
    };
  }

  // Resultado
  let resultado: FilaDeVeredicto;
  const n = v.ejerciciosQueCuentan;
  const enCuantos = n ? ` en ${n} ${n === 1 ? 'ejercicio' : 'ejercicios'}` : '';
  if (v.rmPct == null) {
    resultado = { estado: 'Sin medida.', tono: 'neutro', texto: 'Ningún ejercicio de la zona tiene marcas suficientes para comparar el RM.' };
  } else {
    const objetivo = v.rmObjetivoPct > 0 ? `objetivo +${fmt(v.rmObjetivoPct)} %` : 'objetivo: no perder';
    const acumulado = v.rmPctAcumulado != null ? ` ${conSigno(v.rmPctAcumulado)} % sumando el bloque anterior.` : '';
    // Las tres franjas. Un veredicto guardado no trae la franja: se deduce de
    // sus cifras (en un avanzado, de lo sumado a dos bloques si lo trae).
    const parcial = v.resultadoCumplido === false
      && (v.resultado ?? franjaDeResultado(v.rmPctAcumulado ?? v.rmPct, v.rmObjetivoPct)) === 'parcial';
    const matiz = parcial ? ` Supera el ruido de medida (${RM_RUIDO_PCT} %) sin llegar al objetivo.`
      : v.mejoraSinLlegar && v.resultadoCumplido == null ? ' Mejora, pero menos de lo buscado.' : '';
    resultado = {
      estado: v.resultadoCumplido == null ? 'A dos bloques.' : v.resultadoCumplido ? 'Sí.' : parcial ? 'Mejora, sin llegar.' : 'No.',
      tono: v.resultadoCumplido == null || parcial ? 'neutro' : v.resultadoCumplido ? 'bien' : 'atencion',
      texto: `RM estimado medio ${conSigno(v.rmPct)} %${enCuantos} (${objetivo}).${acumulado}${matiz}`,
    };
  }

  // Límites
  const l = v.limites;
  const partes: string[] = [];
  if (l) {
    partes.push(l.cansancio.valor != null ? `Cansancio medio ${fmt(l.cansancio.valor)}/10${l.cansancio.pasado ? ` (límite ${l.cansancio.limite})` : ''}` : 'Sin cansancio apuntado al salir');
    partes.push(l.molestia.veces > 0
      ? `molestia en ${l.molestia.veces} ${l.molestia.veces === 1 ? 'sesión' : 'sesiones'}${l.molestia.maxima != null ? ` (hasta ${fmt(l.molestia.maxima)}/10)` : ''}`
      : 'sin molestias en la zona');
    if (o.duracionMediaMin != null) partes.push(`${Math.round(o.duracionMediaMin)} min de media`);
    if (l.propio) partes.push(`tu límite: ${l.propio}`);
  }
  return {
    zona: v.zona, nombre, sello: SELLO[v.lectura], proceso, resultado,
    limites: { texto: partes.length ? `${partes.join(' · ')}.` : 'Sin dato de límites en lo guardado.', pasado: !!l?.algunoPasado },
    siguiente: v.propuesta?.texto ?? null,
  };
}
