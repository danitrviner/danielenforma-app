// "Mover a mañana" (Cardio 01 del handoff): saltar el cardio de hoy es
// legítimo, no un fallo — no crea ninguna sesión ni toca el objetivo
// semanal, solo oculta la tarjeta primaria por lo que queda de hoy. Vive
// solo en este dispositivo a propósito: es un gesto de "hoy no", no un dato
// de negocio que el coach necesite ver ni que deba sincronizarse entre
// dispositivos — el contrato no define una colección para esto y crear una
// sesión de cardio en blanco para representarlo ensuciaría el historial y
// las métricas de carga.

const KEY = 'enforma_cardio_skip_today_v1';

function read(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}

export function isCardioSkippedToday(athleteId: string, todayIso: string): boolean {
  return read()[athleteId] === todayIso;
}

export function skipCardioToday(athleteId: string, todayIso: string): void {
  const map = read();
  map[athleteId] = todayIso;
  localStorage.setItem(KEY, JSON.stringify(map));
}
