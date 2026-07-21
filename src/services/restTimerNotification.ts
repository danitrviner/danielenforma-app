import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

// Un id fijo — solo hay un descanso activo a la vez, así que reprogramar
// (cancel + schedule) es siempre seguro sin acumular notificaciones huérfanas.
const REST_NOTIFICATION_ID = 90001;
let permissionRequested = false;

async function ensurePermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  if (permissionRequested) return true;
  const { display } = await LocalNotifications.checkPermissions();
  if (display === 'granted') { permissionRequested = true; return true; }
  const { display: after } = await LocalNotifications.requestPermissions();
  permissionRequested = after === 'granted';
  return permissionRequested;
}

// Programa una notificación local para dentro de `seconds` segundos — sigue
// disparándose aunque la pestaña quede en segundo plano o la pantalla se
// bloquee, a diferencia de un setTimeout de JS. Backbone del "modo sesión en
// vivo" (§6.2 del plan) hasta que exista el widget nativo real (Live Activity/
// foreground service, §6.3 — pendiente, requiere código Swift/Kotlin).
export async function scheduleRestEndNotification(exerciseName: string, seconds: number): Promise<void> {
  const ok = await ensurePermission();
  if (!ok) return;
  await LocalNotifications.cancel({ notifications: [{ id: REST_NOTIFICATION_ID }] });
  await LocalNotifications.schedule({
    notifications: [{
      id: REST_NOTIFICATION_ID,
      title: '¡Descanso terminado!',
      body: `Toca para volver a ${exerciseName}`,
      schedule: { at: new Date(Date.now() + seconds * 1000) },
      sound: 'default',
    }],
  });
}

export async function cancelRestEndNotification(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  await LocalNotifications.cancel({ notifications: [{ id: REST_NOTIFICATION_ID }] });
}
