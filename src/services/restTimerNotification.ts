import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

/* ═══════════════════════════════════════════════════════════════════════════
   Avisos del descanso · notificaciones PROGRAMADAS por el sistema

   No son un `setTimeout`. El sistema las guarda y las dispara aunque la app
   esté cerrada, congelada o el móvil bloqueado — que es justo el momento en
   que el atleta las necesita. Un timer de JS no sobrevive a apagar la
   pantalla; esto sí.

   Dos ids fijos, no una cola: §3.4 del handoff, «un solo aviso por serie,
   nunca notificaciones apiladas». Reprogramar es cancelar + volver a
   programar los mismos ids, así que `+30 S` no deja huérfana la anterior.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Fin del descanso: «A por la serie 4». */
const ID_FIN_DESCANSO = 90001;
/** Tres minutos después sin tocar nada: «¿Sigues ahí?». Más suave. */
const ID_SIGUES_AHI = 90002;

const MS_SIGUES_AHI = 3 * 60 * 1000;

let permisoConcedido = false;

async function asegurarPermiso(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  if (permisoConcedido) return true;
  const { display } = await LocalNotifications.checkPermissions();
  if (display === 'granted') { permisoConcedido = true; return true; }
  const { display: despues } = await LocalNotifications.requestPermissions();
  permisoConcedido = despues === 'granted';
  return permisoConcedido;
}

export interface AvisoDescanso {
  exerciseName: string;
  /** Epoch ms del fin del descanso — NO segundos restantes. */
  enMs: number;
  /** 1-based, la que toca cuando suene. */
  siguienteSerie: number;
  /** Histórico para el cuerpo del aviso. Si no hay, no se inventa nada. */
  lastReps?: number;
  lastWeight?: number;
  lastRir?: number;
}

/** El «última: 8 × 60 kg, RIR 2» del §3.4. Se omite entero si no hay dato:
 *  el handoff prohíbe rellenarlo con nada inventado. */
function cuerpo(a: AvisoDescanso): string {
  if (a.lastReps == null || a.lastWeight == null) return a.exerciseName;
  const peso = a.lastWeight.toLocaleString('es-ES');
  const rir = a.lastRir == null ? '' : `, RIR ${a.lastRir}`;
  return `${a.exerciseName} · última: ${a.lastReps} × ${peso} kg${rir}`;
}

export async function programarAvisoDescanso(a: AvisoDescanso): Promise<void> {
  if (!(await asegurarPermiso())) return;
  await cancelarAvisosDescanso();
  if (a.enMs <= Date.now()) return;
  await LocalNotifications.schedule({
    notifications: [
      {
        id: ID_FIN_DESCANSO,
        title: `A por la serie ${a.siguienteSerie}`,
        body: cuerpo(a),
        schedule: { at: new Date(a.enMs) },
        sound: 'default',
      },
      {
        id: ID_SIGUES_AHI,
        title: '¿Sigues ahí?',
        body: 'Tu sesión está en pausa.',
        schedule: { at: new Date(a.enMs + MS_SIGUES_AHI) },
        // Sin sonido a propósito: es un recordatorio, no una orden.
      },
    ],
  });
}

export async function cancelarAvisosDescanso(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  await LocalNotifications.cancel({
    notifications: [{ id: ID_FIN_DESCANSO }, { id: ID_SIGUES_AHI }],
  });
}
