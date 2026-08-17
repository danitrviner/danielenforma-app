import { registerPlugin, Capacitor } from '@capacitor/core';

// Puente a la sesión de cardio en segundo plano (F5 del plan de réplica
// FITIV) — misma forma que services/restTimer.ts, pero con un tercer
// método `update` real: el descanso tiene un valor fijo al arrancar, cardio
// necesita refrescar BPM y zona muchas veces durante la misma sesión.
//
// El throttle ("cada 2 s como mucho, y solo si cambió el segundo o la
// zona") vive en quien llama a esto — el store de useCardioSession.tsx, que
// es donde ya está el tick de la sesión — no aquí ni en el lado nativo.

export interface CardioActivityState {
  sessionTitle: string;
  elapsedSec: number;
  bpm: number;
  zoneLabel: string;
  /** "#RRGGBB" — se manda tal cual desde ZONE_COLOR (cardioZones.ts), la
   * fuente de verdad; ni Swift ni Kotlin mantienen una copia de la paleta. */
  zoneColorHex: string;
  /** "Bloque 2/4 · Sprint", "Objetivo: Z2 Base aeróbica", o vacío en libre. */
  phaseText: string;
}

interface CardioActivityPlugin {
  start(options: CardioActivityState): Promise<void>;
  update(options: CardioActivityState): Promise<void>;
  stop(): Promise<void>;
}

interface CardioSessionPlugin {
  start(options: CardioActivityState): Promise<void>;
  update(options: CardioActivityState): Promise<void>;
  stop(): Promise<void>;
}

// iOS — Live Activity (ios/App/App/CardioActivityPlugin.swift).
const CardioActivity = registerPlugin<CardioActivityPlugin>('CardioActivity');
// Android — foreground service (android/.../CardioSessionPlugin.kt).
const CardioSession = registerPlugin<CardioSessionPlugin>('CardioSession');

export async function startCardioActivity(state: CardioActivityState): Promise<void> {
  if (Capacitor.getPlatform() === 'ios') {
    await CardioActivity.start(state).catch(() => undefined);
  } else if (Capacitor.getPlatform() === 'android') {
    await CardioSession.start(state).catch(() => undefined);
  }
  // Web: nada. Una notificación puntual no representa una sesión en curso
  // como sí lo hace la del descanso (un solo instante futuro) — aquí no hay
  // equivalente razonable sin la infraestructura nativa.
}

export async function updateCardioActivity(state: CardioActivityState): Promise<void> {
  if (Capacitor.getPlatform() === 'ios') {
    await CardioActivity.update(state).catch(() => undefined);
  } else if (Capacitor.getPlatform() === 'android') {
    await CardioSession.update(state).catch(() => undefined);
  }
}

export async function stopCardioActivity(): Promise<void> {
  if (Capacitor.getPlatform() === 'ios') {
    await CardioActivity.stop().catch(() => undefined);
  } else if (Capacitor.getPlatform() === 'android') {
    await CardioSession.stop().catch(() => undefined);
  }
}
