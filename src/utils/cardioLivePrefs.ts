// Preferencias de la pantalla en vivo de cardio (F8 del plan de réplica
// FITIV) — en localStorage, no en Firestore: `athleteCardioProfile` es de
// escritura exclusiva del coach (firestore.rules), y el layout/voz/auto-lock
// son preferencia del dispositivo, no del entrenamiento en sí.

const KEY = 'enforma.cardio.livePrefs.v1';

export interface CardioLivePrefs {
  /** Avisos por voz al cambiar de bloque o salir de zona. FITIV lo trae ON por defecto. */
  voiceEnabled: boolean;
  /** Bloquea los controles tras un rato sin tocar la pantalla — FITIV lo trae OFF por defecto (§4bis.2 del análisis). */
  autoLockEnabled: boolean;
  /** Segundos de inactividad antes de bloquear, si autoLockEnabled. */
  autoLockDelaySec: number;
  /** Claves del catálogo (`cardioLiveMetrics.ts`) para las 7 posiciones fijas del layout Avanzado (F9). */
  advancedLayout: string[];
}

export const DEFAULT_ADVANCED_LAYOUT = ['duration', 'bpm', 'avgHR', 'zone', 'intensity', 'caloriesActive', 'mets'];

export const DEFAULT_LIVE_PREFS: CardioLivePrefs = {
  voiceEnabled: true,
  autoLockEnabled: false,
  autoLockDelaySec: 20,
  advancedLayout: DEFAULT_ADVANCED_LAYOUT,
};

export function loadLivePrefs(): CardioLivePrefs {
  if (typeof window === 'undefined') return DEFAULT_LIVE_PREFS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_LIVE_PREFS;
    return { ...DEFAULT_LIVE_PREFS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_LIVE_PREFS;
  }
}

export function saveLivePrefs(prefs: CardioLivePrefs): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Cuota de localStorage llena o modo privado sin persistencia — la
    // preferencia se queda solo para esta sesión, no es un error que romper
    // el flujo por él.
  }
}
