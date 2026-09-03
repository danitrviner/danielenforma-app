/* ═══════════════════════════════════════════════════════════════════════════
   Sesión en vivo · actividad persistente y pantalla de bloqueo

   Handoff «Notificaciones, actividad en vivo y pantalla de bloqueo» (03-09).
   Sustituye a `restTimer.ts`, que solo sabía arrancar y parar un cronómetro.

   REGLA QUE MANDA SOBRE TODO LO DEMÁS
   ───────────────────────────────────
   El descanso es `restEndsAt: timestamp`, NUNCA un contador de segundos que
   alguien decrementa. Ni aquí, ni en Swift, ni en Kotlin.

   El motivo no es de estilo. Un `secondsLeft: Int` empujado desde la app
   obliga a que la app esté viva para refrescarlo: con la pantalla bloqueada
   iOS y Android congelan el proceso, así que la cifra de la pantalla de
   bloqueo se quedaba clavada en el segundo en que apagaste la pantalla. Es
   exactamente el bug que reportó Dani. Mandando el INSTANTE de fin, la cuenta
   atrás la pinta el sistema (`Text(timerInterval:)` en iOS, `Chronometer` en
   Android) sin una sola actualización nuestra: corre con el móvil bloqueado,
   en otra app y con el proceso muerto.

   `restEndsAt = 0` significa «sin descanso corriendo» — la actividad NO se
   cierra, pasa a «a por la serie N» contando hacia arriba (§3.2 del handoff).

   EL BUZÓN
   ────────
   Los botones de la pantalla de bloqueo se ejecutan en el proceso de la
   extensión (iOS) o del servicio (Android), no en el WebView. No pueden tocar
   el `localStorage` del borrador. Escriben en un almacén compartido
   (App Group en iOS, SharedPreferences en Android) y la app lo vacía al
   volver a primer plano con `leerBuzon()`. Lo apuntado desde el bloqueo es la
   verdad: se aplica encima del estado local, no al revés.
   ═══════════════════════════════════════════════════════════════════════════ */

import { registerPlugin, Capacitor } from '@capacitor/core';
import {
  programarAvisoDescanso, cancelarAvisosDescanso,
} from './restTimerNotification';

/** Foto completa de lo que se ve en la isla y en la tarjeta de bloqueo. Se
 *  manda entera en cada actualización: son cuatro campos y evita que el
 *  nativo tenga que fusionar estados parciales. */
export interface EstadoEnVivo {
  /** Identifica la sesión para que un toque del buzón no se aplique a otra. */
  assignmentId: string;
  exerciseName: string;
  /** Coordenadas de la serie en curso dentro de `playerSets`. Vuelven tal
   *  cual en el buzón: es lo que permite aplicar el toque sin adivinar. */
  exIdx: number;
  setIdx: number;
  /** 1-based, solo para pintar «serie 3 de 4». */
  setNumber: number;
  setTotal: number;
  /** Epoch ms del fin del descanso. 0 = no hay descanso corriendo. */
  restEndsAt: number;
  /** Segundos prescritos, para la barra de progreso y el «DE 2:00». */
  restTotalSeconds: number;
  /** Lo que se está apuntando ahora mismo. */
  reps: number;
  weight: number;
  rir: number;
  /** Histórico de la última vez. Ausente = no hay histórico: la línea
   *  «arranca desde lo de la última vez» se OMITE, no se inventa (§3.3). */
  lastReps?: number;
  lastWeight?: number;
}

/** Un toque registrado desde la pantalla de bloqueo. Idempotente: describe el
 *  valor final de la celda, no un incremento, así que reaplicarlo dos veces
 *  da el mismo resultado. */
export interface ToqueEnVivo {
  exIdx: number;
  setIdx: number;
  reps?: number;
  weight?: number;
  rir?: number;
  /** `HECHA` desde el bloqueo. */
  done?: boolean;
  /** Nuevo fin de descanso tras `+30 S` o `EMPEZAR YA` desde el bloqueo. */
  restEndsAt?: number;
  /** Epoch ms. Ordena los toques y descarta los anteriores al estado local. */
  updatedAt: number;
}

interface SesionEnVivoPlugin {
  /** Arranca la actividad, o la actualiza si ya hay una viva. Nunca abre una
   *  segunda: encadenar series no puede dejar seis cronómetros. */
  start(estado: EstadoEnVivo): Promise<void>;
  update(estado: EstadoEnVivo): Promise<void>;
  stop(): Promise<void>;
  /** Vacía el buzón y devuelve lo apuntado desde el bloqueo, en orden. */
  leerBuzon(): Promise<{ toques: ToqueEnVivo[] }>;
}

/**
 * Un único nombre de plugin para las dos plataformas
 * (`ios/App/App/SesionEnVivoPlugin.swift` y
 * `android/.../SesionEnVivoPlugin.kt`). Antes había dos (`LiveActivity` y
 * `RestTimer`) con APIs distintas y un `if (platform)` en cada llamada.
 */
const SesionEnVivo = registerPlugin<SesionEnVivoPlugin>('SesionEnVivo');

const esNativo = () => Capacitor.isNativePlatform();

/** ¿Está la actividad viva? Se recuerda para no llamar a `update` sobre nada
 *  y para saber si un `start` es realmente un arranque. */
let activa = false;

/** Última foto publicada, para no repetirla.
 *
 *  El player recalcula el estado en cada render, y sin esto cada tecla
 *  pulsada en la tabla cruzaría el puente a Swift/Kotlin y reprogramaría dos
 *  notificaciones. En un móvil eso es batería y parpadeo en la pantalla de
 *  bloqueo a cambio de nada: el estado suele ser idéntico. */
let ultimoPublicado = '';

/**
 * Arranca o actualiza la actividad en vivo y (re)programa el aviso del
 * sistema. Se llama en cada cambio: marcar una serie, `+30 S`, cambiar de
 * ejercicio o teclear un peso dentro de la app.
 *
 * El aviso de fin de descanso es una notificación PROGRAMADA, no un timer:
 * es lo que hace que vibre con la app cerrada. Se reprograma en cada llamada
 * porque `+30 S` mueve la hora a la que tiene que sonar.
 */
export async function publicarEstado(estado: EstadoEnVivo): Promise<void> {
  if (!esNativo()) return;
  const foto = JSON.stringify(estado);
  if (foto === ultimoPublicado) return;
  ultimoPublicado = foto;
  try {
    if (activa) await SesionEnVivo.update(estado);
    else { await SesionEnVivo.start(estado); activa = true; }
  } catch {
    // Sin actividad en vivo (iOS 16 sin permiso, plugin ausente en web) el
    // entreno no puede quedarse sin aviso: la notificación programada de
    // abajo es la red de seguridad y va igualmente.
  }
  if (estado.restEndsAt > Date.now()) {
    await programarAvisoDescanso({
      exerciseName: estado.exerciseName,
      enMs: estado.restEndsAt,
      siguienteSerie: estado.setNumber + 1,
      lastReps: estado.lastReps,
      lastWeight: estado.lastWeight,
      lastRir: estado.rir,
    });
  } else {
    await cancelarAvisosDescanso();
  }
}

/** Cierra la actividad y todos los avisos pendientes. Solo al terminar,
 *  saltar o abandonar la sesión — nunca al acabar un descanso. */
export async function cerrarSesionEnVivo(): Promise<void> {
  activa = false;
  ultimoPublicado = '';
  if (!esNativo()) return;
  try { await SesionEnVivo.stop(); } catch { /* no había actividad */ }
  await cancelarAvisosDescanso();
}

/**
 * Lo apuntado desde la pantalla de bloqueo desde la última lectura. Vacía el
 * buzón: cada toque se aplica una sola vez. Devuelve [] en web y si el plugin
 * nativo no responde.
 */
export async function leerToquesDelBloqueo(): Promise<ToqueEnVivo[]> {
  if (!esNativo()) return [];
  try {
    const { toques } = await SesionEnVivo.leerBuzon();
    return Array.isArray(toques) ? toques : [];
  } catch {
    return [];
  }
}
