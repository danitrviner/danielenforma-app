/* ═══════════════════════════════════════════════════════════════════════════
   Peso objetivo y ritmo: la periodización del revés

   Hasta ahora una fase se definía por SEMANAS y CALORÍAS: «6 semanas a 2.200
   kcal». El entrenador no piensa así. Piensa «quiero que llegue a 82 kg
   subiendo 200 g por semana», y la duración sale sola de ahí.

   Es el rediseño que pedía la auditoría (§12-§15): las calorías pasan a ser la
   HERRAMIENTA para conseguir un ritmo, no el dato que define la fase. Y el
   ritmo objetivo se puede comparar con el real, que es lo que convierte la
   pantalla en una herramienta de decisión en vez de un gráfico bonito.

   Todo aquí es cálculo puro sobre kg y semanas. Nada de kcal: la estimación
   energética vive en `nutritionPeriodization.ts` y se alimenta de esto.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Cuántas semanas hacen falta para ir de un peso a otro a un ritmo dado.
 *
 * El signo del ritmo se deduce del objetivo: un entrenador que quiere bajar
 * escribe «0,5», no «−0,5», y exigirle el menos sería pedirle que acierte un
 * detalle que la app ya sabe mirando los dos pesos.
 *
 * Redondea hacia arriba: media semana de más es mejor que dar la fase por
 * terminada antes de llegar.
 */
export function semanasParaElObjetivo(
  pesoInicial: number | null | undefined,
  pesoObjetivo: number | null | undefined,
  ritmoKgSemana: number | null | undefined,
): number | null {
  if (pesoInicial == null || pesoObjetivo == null || ritmoKgSemana == null) return null;

  const diferencia = pesoObjetivo - pesoInicial;
  if (diferencia === 0) return 0;

  const ritmo = Math.abs(ritmoKgSemana);
  if (ritmo === 0) return null;   // a ritmo cero no se llega nunca: no es un número, es un aviso

  return Math.ceil(Math.abs(diferencia) / ritmo);
}

export interface FaseConRitmo {
  targetWeight?: number;
  targetRateKgWeek?: number;
  /** Semanas puestas a mano, para las fases que no traen ritmo. */
  weeks?: number;
}

export interface FaseConDuracion {
  pesoInicial: number;
  targetWeight?: number;
  targetRateKgWeek?: number;
  weeks: number;
  /** true si la duración la ha calculado la app desde el objetivo y el ritmo. */
  calculada: boolean;
}

/**
 * Duración de cada tramo de una definición por fases, encadenando los pesos:
 * cada fase empieza donde acabó la anterior.
 *
 * Permite ritmos DISTINTOS por tramo (§14) — 87→79 a −0,8, luego 79→74 a −0,5,
 * luego 74→70 a −0,4 —, que es como se planifica de verdad: cuanto más cerca
 * del objetivo, más despacio.
 *
 * Una fase sin ritmo conserva las semanas que tuviera puestas a mano, para que
 * los programas de antes de este cambio sigan funcionando igual.
 */
export function duracionDeLasFases(
  pesoInicial: number,
  fases: readonly FaseConRitmo[],
): FaseConDuracion[] {
  const salida: FaseConDuracion[] = [];
  let peso = pesoInicial;

  for (const fase of fases) {
    const calculadas = semanasParaElObjetivo(peso, fase.targetWeight, fase.targetRateKgWeek);
    const weeks = calculadas ?? fase.weeks ?? 0;

    salida.push({
      pesoInicial: peso,
      targetWeight: fase.targetWeight,
      targetRateKgWeek: fase.targetRateKgWeek,
      weeks,
      calculada: calculadas != null,
    });

    if (fase.targetWeight != null) peso = fase.targetWeight;
  }

  return salida;
}

/**
 * A qué ritmo está cambiando el peso de verdad, en kg/semana.
 *
 * Se mide entre el primer y el último peso de la serie, no con la última
 * semana suelta: una retención de líquidos o un día de más no pueden mandar
 * sobre la lectura (§18). La serie que se le pase debe ser de MEDIAS
 * semanales, no de pesajes sueltos.
 */
export function ritmoReal(pesosSemanales: readonly number[]): number | null {
  if (pesosSemanales.length < 2) return null;
  const primero = pesosSemanales[0];
  const ultimo = pesosSemanales[pesosSemanales.length - 1];
  const semanas = pesosSemanales.length - 1;
  return (ultimo - primero) / semanas;
}

export type EstadoDelRitmo = 'en-rumbo' | 'por-encima' | 'por-debajo' | 'sin-datos';

export interface DesviacionDelRitmo {
  estado: EstadoDelRitmo;
  /** Cuánto se separa el real del objetivo, en kg/semana. Siempre positivo. */
  diferencia: number;
}

/**
 * Margen por debajo del cual no se avisa de nada.
 *
 * El peso oscila solo entre 0,1 y 0,2 kg de una semana a otra por agua, sal y
 * glucógeno. Avisar por 50 g de desvío haría que el entrenador dejara de mirar
 * los avisos, que es peor que no tenerlos.
 */
const MARGEN_KG_SEMANA = 0.15;

/**
 * Compara el ritmo objetivo con el real (§19).
 *
 * «Por encima» y «por debajo» se leen siempre respecto a la INTENCIÓN, no al
 * signo: perder 0,9 cuando querías 0,5 es pasarse, y ganar 0,5 cuando querías
 * 0,2 también. Sin esto, un déficit y un superávit necesitarían lecturas
 * opuestas y el mensaje acabaría al revés en uno de los dos casos.
 */
export function desviacionDelRitmo(
  objetivo: number,
  real: number | null | undefined,
): DesviacionDelRitmo {
  if (real == null) return { estado: 'sin-datos', diferencia: 0 };

  // En magnitud y respecto a la dirección que se buscaba.
  const avanceObjetivo = Math.abs(objetivo);
  const avanceReal = objetivo === 0 ? Math.abs(real) : (real / objetivo) * Math.abs(objetivo);
  const diferencia = Math.abs(avanceReal - avanceObjetivo);

  if (diferencia <= MARGEN_KG_SEMANA) return { estado: 'en-rumbo', diferencia };
  return { estado: avanceReal > avanceObjetivo ? 'por-encima' : 'por-debajo', diferencia };
}
