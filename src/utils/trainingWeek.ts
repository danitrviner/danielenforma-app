// Shared week-boundary helpers for the athlete training schedule (Monday-start weeks).
// Used by TrainingScreen (full program view) and HomeScreen (dashboard summary) so both
// agree on what counts as "esta semana" vs "atrasado".

function padDate(n: number): string { return String(n).padStart(2, '0'); }

/**
 * "Hoy" en YYYY-MM-DD, en la hora LOCAL del dispositivo — no `toISOString()`,
 * que da la fecha en UTC. Para España (UTC+1/+2) eso desplaza la fecha en la
 * ventana de 1-2h tras la medianoche local: una sesión de cardio puntual
 * programada para "hoy" podía no coincidir, o coincidir un día antes/después
 * de lo previsto, justo cuando `pickActiveZona2Assignment`/
 * `pickActiveIntervalAssignment` (utils/cardioSession.ts) empezaron a
 * comparar la fecha exacta de la asignación contra "hoy" (26-08).
 */
export function hoyIsoLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${padDate(d.getMonth() + 1)}-${padDate(d.getDate())}`;
}

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${padDate(date.getMonth() + 1)}-${padDate(date.getDate())}`;
}

export function getWeekRange(): { start: string; end: string } {
  const today = new Date();
  const day = today.getDay();
  const daysFromMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(today);
  monday.setDate(today.getDate() - daysFromMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: `${monday.getFullYear()}-${padDate(monday.getMonth() + 1)}-${padDate(monday.getDate())}`,
    end:   `${sunday.getFullYear()}-${padDate(sunday.getMonth() + 1)}-${padDate(sunday.getDate())}`,
  };
}

export function getWeekStart(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const dow = date.getDay();
  const daysFromMon = dow === 0 ? 6 : dow - 1;
  date.setDate(date.getDate() - daysFromMon);
  return `${date.getFullYear()}-${padDate(date.getMonth() + 1)}-${padDate(date.getDate())}`;
}

export const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${parseInt(d)} ${MONTHS_ES[parseInt(m) - 1]} ${y}`;
}
