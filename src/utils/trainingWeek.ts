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
  return isoLocal(new Date());
}

/**
 * Un `Date` como día de calendario `YYYY-MM-DD`, en hora LOCAL.
 *
 * La otra mitad del mismo problema que `hoyIsoLocal`. `d.toISOString()` da el
 * día en UTC, así que una fecha construida en local —`new Date(2026, 8, 16)`,
 * o un `Date` restado con `- N * 86_400_000`— se formatea como el día
 * ANTERIOR durante las primeras horas del día en España. No lanza ningún
 * error: solo devuelve un día menos, en un sitio del que nadie sospecha.
 *
 * Cuando la fecha se construye a propósito en UTC (`Date.UTC(...)`), esto NO
 * es lo que quieres: ahí el par correcto es `Date.UTC` + `toISOString`, y hay
 * que dejarlo con un comentario.
 */
export function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${padDate(d.getMonth() + 1)}-${padDate(d.getDate())}`;
}

/**
 * ¿`s` es una fecha `YYYY-MM-DD` de calendario REAL? Año de exactamente 4
 * cifras y día que existe (ni 2026-02-30 ni 2026-13-01).
 *
 * Nació de un fallo en producción: al crear un mesociclo, el `<input
 * type="date">` de "Fecha inicio" suelta cadena vacía mientras se teclea y
 * admite años de 5+ cifras ("20026"). Ninguna de las dos la sabe parsear
 * `new Date(s + 'T00:00:00')` → `Invalid Date`, y el primer `.toISOString()`
 * que cae encima lanza «Invalid time value», que sube hasta el ErrorBoundary
 * y tumba la pantalla entera. Toda fecha que venga de un campo editable pasa
 * por aquí antes de guardarse o de convertirse en `Date`.
 */
export function esFechaIso(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${padDate(date.getMonth() + 1)}-${padDate(date.getDate())}`;
}

/**
 * Días naturales entre dos fechas ISO. Exclusivo: del 1 al 8 son 7.
 *
 * Se ancla a mediodía a propósito. Con `T00:00:00`, el cambio de hora de marzo
 * y octubre deja diferencias de 23 o 25 horas que `Math.round` convierte en un
 * día de más o de menos justo esas dos semanas del año.
 *
 * Esto mismo estaba copiado en `revisionCoach`, `caminoDelPlan`,
 * `accionesCalendario` y `tendenciaPeso`, cada una con su propio matiz. Las
 * cuatro deberían pasar a usar esta (queda para la fase 8 del plan); mientras,
 * lo nuevo se escribe contra esta.
 */
export function diasEntreFechas(desde: string, hasta: string): number {
  const ms = new Date(`${hasta}T12:00:00`).getTime() - new Date(`${desde}T12:00:00`).getTime();
  return Math.round(ms / 86_400_000);
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

export const DIAS_SEMANA_ES = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

/**
 * «5 sep», «vie 5 sep» o «5 sep 26». Sin ceros a la izquierda y siempre con
 * el mes de `MONTHS_ES`, no con `toLocaleDateString`: la Revisión tenía SEIS
 * copias de esto y tres formatos distintos («5 sep», «05 sept», «vie 5 sep»)
 * en la misma pantalla — la que Dani graba en vídeo. `undefined` → «—».
 */
export function fechaCorta(iso: string | undefined, opts: { dia?: boolean; anio?: boolean } = {}): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  const base = `${parseInt(d, 10)} ${MONTHS_ES[parseInt(m, 10) - 1]}`;
  const conDia = opts.dia ? `${DIAS_SEMANA_ES[new Date(`${iso}T12:00:00`).getDay()]} ${base}` : base;
  return opts.anio ? `${conDia} ${y.slice(2)}` : conDia;
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${parseInt(d)} ${MONTHS_ES[parseInt(m) - 1]} ${y}`;
}
