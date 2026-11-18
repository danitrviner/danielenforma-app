import type {
  BodyweightLog, Diet, DietCompletionLog, Mesocycle, NutritionProgram, StepLog, WorkoutAssignment, WorkoutLog,
} from '../../types.js';
import { construirComidaDeLaSemana } from '../comidaDeLaSemana.js';
import { pesoRepresentativo, verificarObjetivo, RANGO_PCT_SEMANA, type EstadoVerificacion } from '../verificacionObjetivo.js';
import { faseEnCurso } from '../objetivoDeFase.js';
import { semanaDeRevision, enRango, num, type SemanaDeRevision } from './ventana.js';

/* ═══════════════════════════════════════════════════════════════════════════
   «Tu semana de un vistazo» — lo primero que sale en el vídeo (18-11-2026)

   Cuatro cosas y solo con lo que está medido: sesiones hechas de las que
   tocaban, lo que comió de media frente a su objetivo, los pasos y el peso con
   su ritmo frente al que pide la fase. Cada una con la semana anterior al lado.
   Si una no tiene dato, sale `null` y la pantalla no la pinta: un «0» donde no
   hay registro diría algo que no ha pasado.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface SesionesDeLaSemana {
  hechas: number;
  /** Las que tocaban: las asignadas en la semana o, sin asignaciones, los días
   *  por semana del bloque. `null` si no hay forma de saberlo. */
  tocaban: number | null;
  anterior: number;
}

export interface ComidaDeLaSemanaResumen {
  kcalMedia: number;
  kcalObjetivo: number;
  /** Gramos de proteína de media y su objetivo. */
  protMedia: number;
  protObjetivo: number;
  diasRegistrados: number;
  /** La misma media la semana anterior, si registró algún día. */
  kcalMediaAnterior: number | null;
}

export interface PasosDeLaSemana {
  media: number;
  objetivo: number | null;
  dias: number;
  mediaAnterior: number | null;
}

export interface RitmoDePeso {
  /** Lo que se mueve el peso por semana (últimas 4), con signo. */
  kgSemana: number;
  /** Lo que pide la fase, en kg/semana (del suave al fuerte), o la franja de
   *  mantenimiento (`franja`). `null` si la fase no tiene ritmo. */
  rangoKg: [number, number] | null;
  estado: EstadoVerificacion;
  fase: string;
  /** Ajuste orientativo de kcal/día para volver al centro del rango. */
  ajusteKcal: number | null;
}

export interface PesoDeLaSemana {
  media: number;
  anterior: number | null;
  deltaKg: number | null;
  ritmo: RitmoDePeso | null;
}

export interface VistazoDeLaSemana {
  semana: SemanaDeRevision;
  sesiones: SesionesDeLaSemana;
  comida: ComidaDeLaSemanaResumen | null;
  pasos: PasosDeLaSemana | null;
  peso: PesoDeLaSemana | null;
}

const redondear = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function sesionesDeLaSemana(o: {
  logs: readonly Pick<WorkoutLog, 'date'>[];
  assignments?: readonly Pick<WorkoutAssignment, 'date' | 'status'>[];
  meso?: Pick<Mesocycle, 'daysPerWeek' | 'startDate' | 'weeks'> | null;
  semana: SemanaDeRevision;
}): SesionesDeLaSemana {
  const { semana } = o;
  const hechas = o.logs.filter(l => enRango(l.date, semana.desde, semana.hasta)).length;
  const anterior = o.logs.filter(l => enRango(l.date, semana.anteriorDesde, semana.anteriorHasta)).length;
  const asignadas = (o.assignments ?? []).filter(a => enRango(a.date, semana.desde, semana.hasta));
  // Asignadas de la semana, menos las que el coach quitó (saltadas a propósito
  // siguen contando: tocaban y no se hicieron).
  const tocabanAsignadas = asignadas.length;
  const tocaban = tocabanAsignadas > 0
    ? Math.max(tocabanAsignadas, hechas)
    : o.meso?.daysPerWeek && o.meso.startDate <= semana.hasta ? o.meso.daysPerWeek : null;
  return { hechas, tocaban, anterior };
}

export function comidaResumen(o: {
  registros: DietCompletionLog[];
  dietas: Diet[];
  semana: SemanaDeRevision;
}): ComidaDeLaSemanaResumen | null {
  const { semana } = o;
  const esta = construirComidaDeLaSemana({ logs: o.registros, diets: o.dietas, desde: semana.desde, hasta: semana.hasta });
  const registrados = esta.dias.filter(d => d.registrado);
  if (registrados.length === 0) return null;
  const antes = construirComidaDeLaSemana({ logs: o.registros, diets: o.dietas, desde: semana.anteriorDesde, hasta: semana.anteriorHasta });
  const kcalAntes = antes.patrones.diasRegistrados > 0 ? Math.round(antes.patrones.kcalMediaComido) : null;
  return {
    kcalMedia: Math.round(esta.patrones.kcalMediaComido),
    kcalObjetivo: Math.round(esta.patrones.kcalMediaCupo),
    protMedia: Math.round(media(registrados.map(d => d.comido.p)) ?? 0),
    protObjetivo: Math.round(media(registrados.map(d => d.cupo.p)) ?? 0),
    diasRegistrados: registrados.length,
    kcalMediaAnterior: kcalAntes,
  };
}

export function pasosDeLaSemana(o: {
  pasos: readonly Pick<StepLog, 'date' | 'steps'>[];
  objetivo?: number | null;
  semana: SemanaDeRevision;
}): PasosDeLaSemana | null {
  const { semana } = o;
  const de = (desde: string, hasta: string) => o.pasos.filter(p => enRango(p.date, desde, hasta) && p.steps > 0).map(p => p.steps);
  const esta = de(semana.desde, semana.hasta);
  if (esta.length === 0) return null;
  const antes = de(semana.anteriorDesde, semana.anteriorHasta);
  const m = media(antes);
  return {
    media: Math.round(media(esta)!),
    objetivo: o.objetivo ?? null,
    dias: esta.length,
    mediaAnterior: m == null ? null : Math.round(m),
  };
}

/**
 * El ritmo del peso frente al que pide la fase en curso. Usa la verificación
 * del objetivo de siempre (`verificarObjetivo`, últimas 4 semanas) para que
 * esta pantalla y la de Objetivo no digan cosas distintas. `null` sin fase
 * con objetivo o sin pesos suficientes para un ritmo.
 */
export function ritmoDePeso(o: {
  programa: NutritionProgram | null | undefined;
  pesos: readonly Pick<BodyweightLog, 'date' | 'weight'>[];
  hasta: string;
}): RitmoDePeso | null {
  const fase = faseEnCurso(o.programa ?? null, o.hasta);
  const tipo = fase?.objetivo?.tipo;
  if (!fase || !tipo) return null;
  const v = verificarObjetivo({ objetivo: { tipo, desde: fase.desde }, pesos: o.pesos, hoy: o.hasta });
  if (v.ritmoKg == null || v.estado === 'sin-datos') return null;
  const r = RANGO_PCT_SEMANA[tipo];
  const ref = v.pesoActual ?? v.pesoReferencia;
  const rangoKg: [number, number] | null = r && ref != null
    ? (Math.abs(r.min) <= Math.abs(r.max)
      ? [redondear((r.min / 100) * ref, 2), redondear((r.max / 100) * ref, 2)]
      : [redondear((r.max / 100) * ref, 2), redondear((r.min / 100) * ref, 2)])
    : null;
  return { kgSemana: redondear(v.ritmoKg, 2), rangoKg, estado: v.estado, fase: fase.fase.name, ajusteKcal: v.ajusteKcal };
}

export function pesoDeLaSemana(o: {
  pesos: readonly Pick<BodyweightLog, 'date' | 'weight'>[];
  programa?: NutritionProgram | null;
  semana: SemanaDeRevision;
}): PesoDeLaSemana | null {
  const { semana } = o;
  const de = (desde: string, hasta: string) => o.pesos.filter(p => enRango(p.date, desde, hasta)).map(p => p.weight);
  const esta = de(semana.desde, semana.hasta);
  if (esta.length === 0) return null;
  const antes = de(semana.anteriorDesde, semana.anteriorHasta);
  const m = redondear(pesoRepresentativo(esta));
  const a = antes.length ? redondear(pesoRepresentativo(antes)) : null;
  return {
    media: m,
    anterior: a,
    deltaKg: a == null ? null : redondear(m - a),
    ritmo: ritmoDePeso({ programa: o.programa, pesos: o.pesos, hasta: semana.hasta }),
  };
}

export function vistazoDeLaSemana(o: {
  hasta: string;
  logs: readonly Pick<WorkoutLog, 'date'>[];
  assignments?: readonly Pick<WorkoutAssignment, 'date' | 'status'>[];
  meso?: Pick<Mesocycle, 'daysPerWeek' | 'startDate' | 'weeks'> | null;
  registros: DietCompletionLog[];
  dietas: Diet[];
  pasos: readonly Pick<StepLog, 'date' | 'steps'>[];
  objetivoPasos?: number | null;
  pesos: readonly Pick<BodyweightLog, 'date' | 'weight'>[];
  programa?: NutritionProgram | null;
}): VistazoDeLaSemana {
  const semana = semanaDeRevision(o.hasta);
  return {
    semana,
    sesiones: sesionesDeLaSemana({ logs: o.logs, assignments: o.assignments, meso: o.meso, semana }),
    comida: comidaResumen({ registros: o.registros, dietas: o.dietas, semana }),
    pasos: pasosDeLaSemana({ pasos: o.pasos, objetivo: o.objetivoPasos, semana }),
    peso: pesoDeLaSemana({ pesos: o.pesos, programa: o.programa, semana }),
  };
}

/** ¿El ritmo de peso está fuera de lo que pide la fase? (para «Lo que pide decisión»). */
export function ritmoFueraDeFase(r: RitmoDePeso | null | undefined): boolean {
  return !!r && r.estado !== 'en-rango' && r.estado !== 'parcial' && r.estado !== 'sin-datos';
}

/** «Bajas 240 g a la semana; en esta fase buscamos de 320 a 480 g.» En su idioma. */
export function fraseDelRitmo(r: RitmoDePeso): string {
  const g = (x: number) => num(Math.abs(x) * 1000, 0);
  const mueve = Math.abs(r.kgSemana) < 0.05 ? 'Te mantienes' : `${r.kgSemana < 0 ? 'Bajas' : 'Subes'} ${g(r.kgSemana)} g a la semana`;
  if (!r.rangoKg) return `${mueve}.`;
  return `${mueve}; en esta fase buscamos de ${g(r.rangoKg[0])} a ${g(r.rangoKg[1])} g.`;
}
