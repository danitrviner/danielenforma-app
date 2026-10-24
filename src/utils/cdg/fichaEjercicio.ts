import { parsearEsfuerzo, parsearReps, type MotorCdg } from './motor'

/* ═══════════════════════════════════════════════════════════════════════════
   Valores de UNA serie de un ejercicio, para su ficha (E-05)

   Serie de referencia fija: 8-12 repeticiones a RIR 1 (la de la lámina 12). No
   son totales de sesión ni de semana: es lo que el catálogo CDG dice que aporta
   una sola serie. Sin fórmulas propias: todo sale de `motor.calcularSerie`.
   ═══════════════════════════════════════════════════════════════════════════ */

export const SERIE_DE_REFERENCIA = { reps: '8-12', rir: 1 } as const;

export interface FichaCdg {
  /** `false` = el nombre CDG no está en el catálogo (o no hay vínculo). */
  encontrado: boolean;
  IF: number;
  /** IEM total de una serie (suma de los 33 músculos). */
  IEMTotal: number;
  /** Músculos con estímulo, de mayor a menor. */
  musculos: Array<{ nombre: string; valor: number }>;
  /** La articulación más cargada, o `null` si ninguna. */
  articulacion: { nombre: string; valor: number } | null;
}

const VACIA: FichaCdg = { encontrado: false, IF: 0, IEMTotal: 0, musculos: [], articulacion: null };

/** Por debajo de este IEM un músculo no merece barra (ruido de la matriz). */
const IEM_MINIMO = 0.05;

export function fichaPorSerie(motor: MotorCdg, cdgNombre: string | undefined): FichaCdg {
  if (!cdgNombre || !motor.existe(cdgNombre)) return VACIA;
  const r = motor.calcularSerie({
    exerciseName: cdgNombre,
    rpe: parsearEsfuerzo(1, `1x${SERIE_DE_REFERENCIA.rir}`, 'RIR')[0],
    repetitions: parsearReps(SERIE_DE_REFERENCIA.reps),
  });
  const musculos = motor.musculos
    .map((nombre, i) => ({ nombre, valor: r.IEM[i] ?? 0 }))
    .filter(m => m.valor > IEM_MINIMO)
    .sort((a, b) => b.valor - a.valor);
  let articulacion: FichaCdg['articulacion'] = null;
  motor.articulaciones.forEach((nombre, i) => {
    const valor = r.estresArticular[i] ?? 0;
    if (valor > 0.005 && (!articulacion || valor > articulacion.valor)) articulacion = { nombre, valor };
  });
  return {
    encontrado: r.encontrado,
    IF: r.IF,
    IEMTotal: r.IEM.reduce((a, v) => a + v, 0),
    musculos,
    articulacion,
  };
}
