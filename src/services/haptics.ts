import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

// @capacitor/haptics tiene implementación web (cae a navigator.vibrate), así
// que no hace falta comprobar Capacitor.isNativePlatform() — pero algunos
// navegadores en desktop no soportan vibración en absoluto, de ahí el
// try/catch: un aviso háptico que falla nunca debe romper la interacción.
async function safe(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch {
    // sin vibración disponible — la app sigue funcionando igual.
  }
}

/**
 * Mapa háptico transversal del handoff de Fase 3 (docs/design/fase3/README.md):
 *   light   — cada toque de stepper, muesca de escala/RIR, marcar serie,
 *             registrar ingesta, seleccionar en lista múltiple, segundo de
 *             cuenta atrás.
 *   medium  — botón primario, añadir receta, confirmar selección.
 *   heavy   — cambio de intervalo en HIIT.
 *   success — cerrar día de nutrición en presupuesto, cerrar semana de
 *             cardio, terminar sesión.
 *   warning — superar el presupuesto de una categoría, salirse de zona FC
 *             más de 30 s (una sola vez, no en bucle — el llamador decide
 *             cuándo, este servicio no debounce).
 */
export const haptics = {
  light: () => safe(() => Haptics.impact({ style: ImpactStyle.Light })),
  medium: () => safe(() => Haptics.impact({ style: ImpactStyle.Medium })),
  heavy: () => safe(() => Haptics.impact({ style: ImpactStyle.Heavy })),
  success: () => safe(() => Haptics.notification({ type: NotificationType.Success })),
  warning: () => safe(() => Haptics.notification({ type: NotificationType.Warning })),
};
