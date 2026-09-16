import { exchangeToKcal, GRAMS_PER_EXCHANGE } from './nutritionConstants';
import { roundQuarter } from './exchangeHelpers';

/* ═══════════════════════════════════════════════════════════════════════════
   AJUSTAR EL CUPO A UNAS KCAL — sin tocar la proteína.

   «Ajustar dieta al tramo» escalaba las tres categorías por el mismo factor:

       HC: budget.HC * escala, PROT: budget.PROT * escala, GRASA: ...

   Para un déficit eso RECORTA LA PROTEÍNA, que es exactamente lo contrario de
   lo que hay que hacer. En déficit la proteína se sostiene o se sube: es lo que
   protege la masa magra cuando faltan calorías. Bajar de 2.450 a 2.050 kcal con
   un escalado plano se llevaba por delante un 16 % de la proteína del atleta, y
   el botón que lo hacía se llamaba «ajustar», no «recortar de todo».

   Aquí la proteína se queda donde está y la diferencia sale de los hidratos y
   la grasa, repartida en proporción a lo que cada uno pesa en las kcal
   actuales. Si hay que recortar más de lo que suman los dos, se bajan hasta
   cero y se avisa: llegado ahí, el problema no es la dieta, es el objetivo.

   Puro y determinista. Trabaja en intercambios, redondeando a cuartos, que es
   la unidad real del sistema.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface CupoDeMacros { HC: number; PROT: number; GRASA: number }

export interface AjusteDeCupo {
  cupo: CupoDeMacros;
  kcalAntes: number;
  kcalDespues: number;
  /** Lo que no se ha podido recortar sin tocar la proteína. 0 si cuadró. */
  kcalSinColocar: number;
  /** Qué se hizo, para poder contarlo en la interfaz. */
  nota: string;
}

/** kcal que aporta un intercambio de cada categoría. */
const KCAL_POR_INTERCAMBIO: Record<keyof CupoDeMacros, number> = {
  HC: GRAMS_PER_EXCHANGE.HC * 4,
  PROT: GRAMS_PER_EXCHANGE.PROT * 4,
  GRASA: GRAMS_PER_EXCHANGE.GRASA * 9,
};

/**
 * Lleva el cupo a `kcalObjetivo` moviendo solo hidratos y grasa.
 *
 * `null` si no hay nada que hacer: sin objetivo, o con un cupo vacío.
 */
export function ajustarCupoSinTocarProteina(
  cupo: CupoDeMacros,
  kcalObjetivo: number,
): AjusteDeCupo | null {
  if (!Number.isFinite(kcalObjetivo) || kcalObjetivo <= 0) return null;
  const kcalAntes = exchangeToKcal(cupo);
  if (kcalAntes <= 0) return null;

  const kcalProteina = cupo.PROT * KCAL_POR_INTERCAMBIO.PROT;
  // Lo que les queda a hidratos y grasa después de respetar la proteína.
  const kcalParaElResto = kcalObjetivo - kcalProteina;

  const kcalHcAntes = cupo.HC * KCAL_POR_INTERCAMBIO.HC;
  const kcalGrasaAntes = cupo.GRASA * KCAL_POR_INTERCAMBIO.GRASA;
  const kcalRestoAntes = kcalHcAntes + kcalGrasaAntes;

  if (kcalParaElResto <= 0) {
    // La proteína sola ya pasa del objetivo. No se toca igualmente: recortarla
    // es la decisión que este ajuste existe para no tomar sola.
    const cupoMinimo = { HC: 0, PROT: cupo.PROT, GRASA: 0 };
    return {
      cupo: cupoMinimo,
      kcalAntes,
      kcalDespues: exchangeToKcal(cupoMinimo),
      kcalSinColocar: Math.round(kcalProteina - kcalObjetivo),
      nota: 'Solo con la proteína ya se pasa del objetivo. Se han dejado hidratos y grasa a cero sin tocarla: bajar de aquí es decisión tuya.',
    };
  }

  // Cada uno mantiene su peso relativo. Si uno de los dos está a cero, el otro
  // absorbe todo el ajuste — que es lo que quiere quien montó la dieta así.
  const pesoHc = kcalRestoAntes > 0 ? kcalHcAntes / kcalRestoAntes : 0.5;
  const nuevoCupo: CupoDeMacros = {
    HC: roundQuarter((kcalParaElResto * pesoHc) / KCAL_POR_INTERCAMBIO.HC),
    PROT: cupo.PROT,
    GRASA: roundQuarter((kcalParaElResto * (1 - pesoHc)) / KCAL_POR_INTERCAMBIO.GRASA),
  };

  const kcalDespues = exchangeToKcal(nuevoCupo);
  const sube = kcalObjetivo > kcalAntes;
  return {
    cupo: nuevoCupo,
    kcalAntes,
    kcalDespues,
    kcalSinColocar: 0,
    nota: sube
      ? 'Las kcal de más se han repartido entre hidratos y grasa. La proteína no se toca.'
      : 'El recorte sale de hidratos y grasa. La proteína se queda igual: es lo que protege la masa magra en déficit.',
  };
}
