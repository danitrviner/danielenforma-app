import { registerPlugin, Capacitor } from '@capacitor/core';
import { scheduleRestEndNotification, cancelRestEndNotification } from './restTimerNotification';

interface RestTimerPlugin {
  start(options: { exerciseName: string; seconds: number }): Promise<void>;
  stop(): Promise<void>;
}

interface LiveActivityPlugin {
  start(options: { exerciseName: string; seconds: number }): Promise<void>;
  stop(): Promise<void>;
}

// Plugin nativo propio (android/app/.../RestTimerPlugin.kt) — foreground
// service con notificación persistente y cuenta atrás en vivo, el "widget de
// bloqueo" real de Android (§6.1 del plan).
const RestTimer = registerPlugin<RestTimerPlugin>('RestTimer');

// Puente a la Live Activity (ios/App/App/LiveActivityPlugin.swift). Solo
// responde una vez el target de Widget Extension exista en Xcode (ver
// docs/WIDGET_BLOQUEO_TODO.md) — hasta entonces el registerPlugin no
// encuentra implementación nativa y las llamadas rechazan, así que se cae a
// la notificación local puntual sin romper nada mientras tanto.
const LiveActivity = registerPlugin<LiveActivityPlugin>('LiveActivity');

export async function startRestTimer(exerciseName: string, seconds: number): Promise<void> {
  if (Capacitor.getPlatform() === 'android') {
    await RestTimer.start({ exerciseName, seconds });
  } else if (Capacitor.getPlatform() === 'ios') {
    try {
      await LiveActivity.start({ exerciseName, seconds });
    } catch {
      await scheduleRestEndNotification(exerciseName, seconds);
    }
  } else {
    await scheduleRestEndNotification(exerciseName, seconds);
  }
}

export async function stopRestTimer(): Promise<void> {
  if (Capacitor.getPlatform() === 'android') {
    await RestTimer.stop();
  } else if (Capacitor.getPlatform() === 'ios') {
    try {
      await LiveActivity.stop();
    } catch {
      await cancelRestEndNotification();
    }
  } else {
    await cancelRestEndNotification();
  }
}
