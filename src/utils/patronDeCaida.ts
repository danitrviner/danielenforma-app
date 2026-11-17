import type { Exercise, MuscleGroup } from '../types.js';
import { MUSCLE_LABELS } from '../types.js';
import { RUIDO_RM_PCT } from './ruidoDeMedida.js';

/* ═══════════════════════════════════════════════════════════════════════════
   El patrón de la caída (S2, 11-11-2026)

   Que algo baje no dice qué hay que tocar. Lo dice DÓNDE baja:

     · local       — un ejercicio suelto. Es cosa de ese ejercicio (técnica,
                     máquina, el puesto que ocupa), no del plan.
     · regional    — varios que comparten músculo, o que tiran todos del
                     agarre. Es fatiga de esa zona: se mira su volumen y su
                     orden, no el resto.
     · transversal — varios sin relación entre sí, con el sueño o el estrés
                     mal (o cayendo casi todo). Es recuperación general: no se
                     arregla tocando ejercicios.

   Cuenta como caída un ejercicio que baja más que el ruido de medida (3 %,
   `ruidoDeMedida.ts`; antes un 2,5 %, que es lo que mueve una sola repetición)
   frente a la ventana anterior siendo la misma tarea (S3), o que lleva dos
   sesiones seguidas empezando peor (F1).

   La bajada se mide con la marca de cada ventana: el RM de su mejor serie
   VÁLIDA (`marcaDeSesion.ts`, D2 17-11-2026). Un ejercicio sin marca en
   alguna de las dos ventanas no «cae»: no tiene dato (`deltaOrmPct` nulo en
   `trainingReport.ts`), y aquí no llega.
   ═══════════════════════════════════════════════════════════════════════════ */

export type TipoDeCaida = 'local' | 'regional' | 'transversal';

/** Bajada de 1RM, en %, a partir de la cual un ejercicio cuenta como caída:
 *  el ruido de medida del RM estimado (17-11-2026). */
export const CAIDA_PCT = RUIDO_RM_PCT;
/** Ejercicios cayendo sin relación a partir de los cuales se mira el contexto. */
const SIN_RELACION_MINIMO = 3;

const AGARRE: MuscleGroup[] = ['dorsal', 'trapecio', 'biceps', 'antebrazo', 'deltoide_post'];

type Ej = Pick<Exercise, 'id' | 'muscleGroup' | 'secondaryMuscleGroups'>;

export interface PatronDeCaida {
  tipo: TipoDeCaida;
  /** Ejercicios que caen (en el regional, solo los de la zona). */
  ejercicios: string[];
  /** Lo que comparten, en el regional: un músculo o el agarre. */
  zona?: MuscleGroup | 'agarre';
  /** Qué hacer, para el coach. */
  lectura: string;
}

const musculos = (e: Ej | undefined): MuscleGroup[] => (e ? [...(e.muscleGroup ? [e.muscleGroup] : []), ...(e.secondaryMuscleGroups ?? [])] : []);

/**
 * Clasifica la caída. `caen` son los ejercicios que bajan; `enLaVentana`,
 * cuántos ejercicios distintos se han entrenado (para saber si cae casi todo).
 */
export function clasificarCaida(
  caen: readonly string[], catalogo: readonly Ej[], opciones: { enLaVentana?: number; contextoMalo?: boolean } = {},
): PatronDeCaida | null {
  if (caen.length === 0) return null;
  const porId = new Map(catalogo.map(e => [e.id, e]));
  if (caen.length === 1) {
    return { tipo: 'local', ejercicios: [...caen], lectura: 'Solo cae este ejercicio: mira su técnica, la máquina y el puesto que ocupa en la sesión, no el plan' };
  }

  // La zona que más ejercicios caídos comparten: un músculo o el agarre.
  const cuenta = new Map<MuscleGroup | 'agarre', string[]>();
  const sumar = (z: MuscleGroup | 'agarre', id: string) => cuenta.set(z, [...(cuenta.get(z) ?? []), id]);
  for (const id of caen) {
    const e = porId.get(id);
    for (const m of new Set(musculos(e))) sumar(m, id);
    if (e?.muscleGroup && AGARRE.includes(e.muscleGroup)) sumar('agarre', id);
  }
  const [zona, deLaZona] = [...cuenta.entries()].sort((a, b) => b[1].length - a[1].length || (a[0] === 'agarre' ? 1 : -1))[0] ?? [undefined, []];
  const casiTodo = opciones.enLaVentana != null && opciones.enLaVentana >= 4 && caen.length * 2 > opciones.enLaVentana;

  // Regional: la mayoría de lo que cae comparte zona (y no es que caiga casi todo).
  if (zona && deLaZona.length >= 2 && deLaZona.length * 2 > caen.length && !(casiTodo && opciones.contextoMalo)) {
    const nombre = zona === 'agarre' ? 'el agarre' : MUSCLE_LABELS[zona].toLowerCase();
    return {
      tipo: 'regional', ejercicios: deLaZona, zona,
      lectura: `Lo que cae comparte ${nombre}: es fatiga de esa zona. Revisa su volumen semanal y qué va antes en la sesión, no todo el plan`,
    };
  }

  if (casiTodo || (caen.length >= SIN_RELACION_MINIMO && opciones.contextoMalo)) {
    return {
      tipo: 'transversal', ejercicios: [...caen],
      lectura: opciones.contextoMalo
        ? 'Caen ejercicios sin relación entre sí y el sueño o el estrés van mal: es recuperación general. No añadas nada y valora una descarga'
        : 'Cae más de la mitad de lo que entrena: es recuperación general. Pregunta por sueño, estrés y comida antes de tocar el plan',
    };
  }

  // Varios sin relación y con el contexto en orden: son casos sueltos.
  return { tipo: 'local', ejercicios: [...caen], lectura: 'Caen ejercicios sin relación entre sí y el contexto está en orden: míralos uno a uno' };
}
