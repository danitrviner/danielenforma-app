import type { BodyweightLog, BodyMeasurement, NutritionProgram, NutritionPhaseType, WorkoutLog } from '../types.js';
import { addDays } from './trainingWeek.js';
import { computePhaseStartDate } from './fasesNutricion.js';
import { objetivoDeFase, phaseTypeDeObjetivo } from './objetivoDeFase.js';
import { ObjetivoCorporalTipo, OBJETIVO_LABEL, verificarObjetivo, RANGO_PCT_SEMANA, FRANJA_MANTENIMIENTO_KG } from './verificacionObjetivo.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Todas las fases en una gráfica

   Cada fase se verifica con SU objetivo y desde SU inicio: la franja de un
   volumen sube, la de un déficit baja, la de un mantenimiento es plana, y la
   tendencia se recalcula al empezar cada fase (por eso hay un escalón en el
   cambio: es el momento en que cambió el plan). La fase en curso añade la
   franja de la semana que viene.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Cuánto hacia atrás se pinta. Más de medio año no se lee en un móvil. */
export const SEMANAS_HISTORIAL = 26;

const r2 = (n: number) => Math.round(n * 100) / 100;
function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(hasta + 'T12:00:00Z') - Date.parse(desde + 'T12:00:00Z')) / 86_400_000);
}

export interface PuntoHistorial {
  fecha: string;
  real: number | null;
  tendencia: number | null;
  franja: [number, number] | null;
  /** Plan FIJO de la fase (28-10-2026): del peso con el que empezó hasta el
   *  objetivo, sin re-anclarse en el peso de cada semana. Es lo que se pinta;
   *  `franja` sigue siendo la del veredicto. */
  plan: number | null;
  franjaPlan: [number, number] | null;
  faseIdx: number;
}

export interface TramoHistorial {
  faseIdx: number;
  nombre: string;
  /** Peso al que llega el plan al final de la fase (el objetivo del coach si lo puso). */
  pesoObjetivo: number | null;
  semanas: number;
  inicioFase: string;
  objetivo: ObjetivoCorporalTipo | null;
  tipoColor: NutritionPhaseType | null;
  desde: string;
  hasta: string; // último día pintado
  enCurso: boolean;
}

export function historialDeObjetivos(params: {
  program: NutritionProgram;
  pesos: readonly Pick<BodyweightLog, 'date' | 'weight'>[];
  hoy: string;
  medidas?: readonly Pick<BodyMeasurement, 'date' | 'metricKey' | 'value'>[];
  entrenos?: readonly Pick<WorkoutLog, 'date' | 'entries'>[];
  semanas?: number;
}): { puntos: PuntoHistorial[]; tramos: TramoHistorial[] } {
  const { program, pesos, hoy } = params;
  const corte = addDays(hoy, -7 * (params.semanas ?? SEMANAS_HISTORIAL));
  const puntos: PuntoHistorial[] = [];
  const tramos: TramoHistorial[] = [];
  if (!program.startDate) return { puntos, tramos };

  program.phases.forEach((fase, idx) => {
    const desde = computePhaseStartDate(program, idx);
    const finFase = addDays(desde, fase.weeks * 7 - 1);
    if (desde > hoy || finFase < corte) return;
    const enCurso = hoy <= finFase;
    const hastaLectura = enCurso ? hoy : finFase;

    const objetivo = objetivoDeFase(program, idx)?.tipo ?? null;
    // Sin objetivo se pinta el peso y su tendencia, pero no hay franja que inventar.
    const v = verificarObjetivo({
      objetivo: { tipo: objetivo ?? 'mantenimiento', desde },
      pesos, hoy: hastaLectura, medidas: params.medidas, entrenos: params.entrenos,
    });

    // Plan fijo: sale del peso con el que empezó la fase y llega al objetivo
    // que puso el coach; sin objetivo, sigue el centro del ritmo pautado. El
    // margen se abre con las semanas, como el propio rango de ritmo.
    const ref = v.pesoReferencia;
    const rango = objetivo ? RANGO_PCT_SEMANA[objetivo] : undefined;
    const semanasFase = fase.weeks;
    const planEn = (fecha: string): { plan: number; franja: [number, number] } | null => {
      if (ref == null || !objetivo) return null;
      const k = Math.max(0, diasEntre(desde, fecha) / 7);
      if (!rango) return { plan: r2(ref), franja: [r2(ref - FRANJA_MANTENIMIENTO_KG), r2(ref + FRANJA_MANTENIMIENTO_KG)] };
      const plan = fase.targetWeight
        // El último día de la fase es el día 7·semanas − 1: ahí llega justo al objetivo.
        ? ref + (fase.targetWeight - ref) * Math.min(1, diasEntre(desde, fecha) / Math.max(1, semanasFase * 7 - 1))
        : ref * (1 + ((rango.min + rango.max) / 2 / 100) * k);
      const margen = Math.max(0.5, ref * ((rango.max - rango.min) / 2 / 100) * Math.min(k, semanasFase));
      return { plan: r2(plan), franja: [r2(plan - margen), r2(plan + margen)] };
    };

    // La franja de «la semana que viene» solo tiene sentido en la fase en curso.
    const propios = enCurso ? v.puntos : v.puntos.filter(p => p.fecha <= finFase);
    for (const p of propios) {
      if (p.fecha < corte) continue;
      const pl = planEn(p.fecha);
      puntos.push({
        fecha: p.fecha, real: p.real, tendencia: p.tendencia,
        franja: objetivo ? p.franja : null, plan: pl?.plan ?? null, franjaPlan: pl?.franja ?? null, faseIdx: idx,
      });
    }
    // En la fase en curso el plan sigue hasta su final: así se ve a dónde va.
    if (enCurso && ref != null && objetivo) {
      const ultima = puntos.filter(p => p.faseIdx === idx).at(-1)?.fecha ?? hoy;
      for (let f = addDays(ultima, 7); f <= finFase; f = addDays(f, 7)) {
        const pl = planEn(f)!;
        puntos.push({ fecha: f, real: null, tendencia: null, franja: null, plan: pl.plan, franjaPlan: pl.franja, faseIdx: idx });
      }
      const ultimoPlan = puntos.at(-1)!;
      if (ultimoPlan.fecha < finFase) {
        const pl = planEn(finFase)!;
        puntos.push({ fecha: finFase, real: null, tendencia: null, franja: null, plan: pl.plan, franjaPlan: pl.franja, faseIdx: idx });
      }
    }
    const pintados = puntos.filter(p => p.faseIdx === idx);
    if (!pintados.length) return;
    tramos.push({
      faseIdx: idx,
      nombre: fase.name || (objetivo ? OBJETIVO_LABEL[objetivo] : `Fase ${idx + 1}`),
      objetivo,
      tipoColor: fase.phaseType ?? (objetivo ? phaseTypeDeObjetivo(objetivo) : null),
      pesoObjetivo: planEn(finFase)?.plan ?? null,
      semanas: fase.weeks,
      inicioFase: desde,
      desde: pintados[0].fecha,
      hasta: pintados[pintados.length - 1].fecha,
      enCurso,
    });
  });

  return { puntos, tramos };
}
