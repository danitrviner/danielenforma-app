import { HungerProfile } from '../types';
import { normalizarTexto } from './busqueda';

/**
 * Deduce el perfil de hambre a partir de lo que el atleta escribió en el alta.
 *
 * El alta le pregunta «¿En qué momento del día tienes más hambre?» (paso 13) y
 * lo guarda como TEXTO LIBRE en `OnboardingData.appetitePeakTime`. El repartidor
 * de intercambios (`utils/mealDistribution`) trabaja con `HungerProfile`, que
 * solo se rellena si el atleta entra a Perfil › Preferencias y lo elige a mano.
 *
 * Resultado: casi nadie tenía `hungerProfile`, así que «Repartir objetivos»
 * repartía uniforme y le dejaba con hambre justo a su peor hora — que es
 * exactamente lo que la pregunta del alta prometía evitar (Dani, 10-09-2026).
 *
 * Se mira primero la noche porque es la respuesta más frecuente y la que más
 * cambia el reparto; «por la mañana no, por la noche sí» tiene que dar `noche`.
 * `normalizarTexto` quita las tildes: la gente escribe «manana» tan a menudo
 * como «mañana».
 */
export function perfilDeHambreDelTexto(texto?: string): HungerProfile | undefined {
  if (!texto) return undefined;
  const t = normalizarTexto(texto);
  if (/noche|cena|nocturn|madrugada|tarde-noche/.test(t)) return 'noche';
  if (/manana|desayun|temprano|al levantarme|nada mas levantar/.test(t)) return 'manana';
  if (/tarde|mediodia|comida|almuerzo|merienda|todo el dia|siempre/.test(t)) return 'equilibrado';
  return undefined;
}

/**
 * El perfil de hambre que hay que usar para repartir: manda lo que el atleta
 * haya elegido a mano en Preferencias, y la ficha de iniciación es el valor de
 * partida. Misma precedencia que el resto de preferencias de menú.
 */
export function perfilDeHambreVigente(
  elegido: HungerProfile | undefined,
  textoDelAlta: string | undefined,
): HungerProfile | undefined {
  return elegido ?? perfilDeHambreDelTexto(textoDelAlta);
}
