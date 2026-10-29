import { kcalDeGramos, macrosDesdeGramos } from './macros.js';
import type { Macros } from '../types.js';

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

   Puro y determinista. Desde 10-2026 trabaja en gramos enteros: el cupo en
   intercambios ya no se ajusta.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface AjusteDeObjetivo {
  objetivo: Macros;
  kcalAntes: number;
  kcalDespues: number;
  kcalSinColocar: number;
  nota: string;
}

/**
 * Lleva las kcal a `kcalObjetivo` moviendo solo hidratos y grasa, cada uno
 * con su peso relativo. La proteína no se toca. Gramos enteros.
 */
export function ajustarObjetivoSinTocarProteina(objetivo: Macros, kcalObjetivo: number): AjusteDeObjetivo | null {
  if (!Number.isFinite(kcalObjetivo) || kcalObjetivo <= 0) return null;
  const kcalAntes = kcalDeGramos(objetivo);
  if (kcalAntes <= 0) return null;
  const kcalProteina = objetivo.p * 4;
  const kcalParaElResto = kcalObjetivo - kcalProteina;
  if (kcalParaElResto <= 0) {
    const minimo = macrosDesdeGramos(objetivo.p, 0, 0);
    return {
      objetivo: minimo, kcalAntes, kcalDespues: minimo.kcal,
      kcalSinColocar: Math.round(kcalProteina - kcalObjetivo),
      nota: 'Solo con la proteína ya se pasa del objetivo. Se han dejado hidratos y grasa a cero sin tocarla: bajar de aquí es decisión tuya.',
    };
  }
  const kcalHc = objetivo.hc * 4;
  const kcalGrasa = objetivo.g * 9;
  const pesoHc = kcalHc + kcalGrasa > 0 ? kcalHc / (kcalHc + kcalGrasa) : 0.5;
  const nuevo = macrosDesdeGramos(
    Math.round(objetivo.p),
    Math.round((kcalParaElResto * pesoHc) / 4),
    Math.round((kcalParaElResto * (1 - pesoHc)) / 9),
  );
  return {
    objetivo: nuevo, kcalAntes, kcalDespues: nuevo.kcal, kcalSinColocar: 0,
    nota: kcalObjetivo > kcalAntes
      ? 'Las kcal de más se han repartido entre hidratos y grasa. La proteína no se toca.'
      : 'El recorte sale de hidratos y grasa. La proteína se queda igual: es lo que protege la masa magra en déficit.',
  };
}
