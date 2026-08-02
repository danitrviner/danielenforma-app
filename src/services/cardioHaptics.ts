import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

// @capacitor/haptics tiene implementación web (cae a navigator.vibrate), así
// que no hace falta comprobar Capacitor.isNativePlatform() — pero algunos
// navegadores en desktop no soportan vibración en absoluto, de ahí el
// try/catch: un aviso háptico que falla nunca debe romper la sesión en vivo.

export async function hapticZoneAlert(): Promise<void> {
  try {
    await Haptics.notification({ type: NotificationType.Warning });
  } catch {
    // sin vibración disponible — el aviso por voz sigue funcionando igual.
  }
}

export async function hapticTick(): Promise<void> {
  try {
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    // idem
  }
}
