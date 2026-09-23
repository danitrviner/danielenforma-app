import type { BodyweightLog, BodyMeasurement, NutritionProgram, NutritionPhaseType, WorkoutLog } from '../types.js';
import { addDays } from './trainingWeek.js';
import { computePhaseStartDate } from './fasesNutricion.js';
import { objetivoDeFase, phaseTypeDeObjetivo } from './objetivoDeFase.js';
import { ObjetivoCorporalTipo, OBJETIVO_LABEL, verificarObjetivo } from './verificacionObjetivo.js';

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

export interface PuntoHistorial {
  fecha: string;
  real: number | null;
  tendencia: number | null;
  franja: [number, number] | null;
  faseIdx: number;
}

export interface TramoHistorial {
  faseIdx: number;
  nombre: string;
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

    // La franja de «la semana que viene» solo tiene sentido en la fase en curso.
    const propios = enCurso ? v.puntos : v.puntos.filter(p => p.fecha <= finFase);
    for (const p of propios) {
      if (p.fecha < corte) continue;
      puntos.push({
        fecha: p.fecha, real: p.real, tendencia: p.tendencia,
        franja: objetivo ? p.franja : null, faseIdx: idx,
      });
    }
    const pintados = puntos.filter(p => p.faseIdx === idx);
    if (!pintados.length) return;
    tramos.push({
      faseIdx: idx,
      nombre: fase.name || (objetivo ? OBJETIVO_LABEL[objetivo] : `Fase ${idx + 1}`),
      objetivo,
      tipoColor: fase.phaseType ?? (objetivo ? phaseTypeDeObjetivo(objetivo) : null),
      desde: pintados[0].fecha,
      hasta: pintados[pintados.length - 1].fecha,
      enCurso,
    });
  });

  return { puntos, tramos };
}
