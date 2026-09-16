import { NutritionProgram, NutritionPhase } from '../types';
import { addDays, esFechaIso } from './trainingWeek';

/* ═══════════════════════════════════════════════════════════════════════════
   LAS FASES DE LA PERIODIZACIÓN — dónde empieza cada tramo y cuál está activo.

   Vivían dentro de `src/db/nutrition.ts` aunque no tocan Firestore para nada.
   Eso obligaba a `utils/nutritionPeriodization.ts` a importar `dbService`
   entero —y con él el SDK de Firebase y el espejo en localStorage— solo para
   sumar semanas, lo que dejaba a esa parte de la periodización fuera del
   alcance de cualquier cosa que no sea un navegador: un test, un script, o el
   latido diario que corre en el servidor.

   `db/nutrition.ts` las sigue exportando, así que ningún sitio que las use
   tiene que cambiar.
   ═══════════════════════════════════════════════════════════════════════════ */

/** La fase que le toca a `today`, o null si el programa aún no ha empezado o ya terminó. */
export function computeActivePhase(program: NutritionProgram, today: string): NutritionPhase | null {
  if (!program.phases.length || !program.startDate) return null;
  let cursor = new Date(program.startDate + 'T00:00:00');
  for (const phase of program.phases) {
    const phaseEnd = new Date(cursor);
    phaseEnd.setDate(phaseEnd.getDate() + phase.weeks * 7);
    const todayDate = new Date(today + 'T00:00:00');
    if (todayDate >= cursor && todayDate < phaseEnd) return phase;
    cursor = phaseEnd;
  }
  return null;
}

/**
 * En qué día empieza la fase número `phaseIdx`.
 *
 * ── El día que faltaba ─────────────────────────────────────────────────────
 * La versión anterior construía la fecha en hora LOCAL
 * (`new Date(startDate + 'T00:00:00')`) y la formateaba en UTC
 * (`.toISOString().split('T')[0]`). En España eso NO es un caso raro de
 * medianoche: la medianoche local del 1 de septiembre son las 22:00 UTC del 31
 * de agosto, así que la función devolvía SIEMPRE el día anterior al real, para
 * todas las fases y para cualquier huso por delante de UTC.
 *
 * Se veía en siete sitios a la vez —las fechas de inicio de cada tramo en el
 * panel de periodización, los cortes del rendimiento frente al peso real, el
 * reparto energético por fase— todos corridos un día. Sumando días con
 * `addDays`, que trabaja en local de punta a punta, no hay conversión que
 * pueda perderla.
 */
export function computePhaseStartDate(program: NutritionProgram, phaseIdx: number): string {
  if (!esFechaIso(program.startDate)) return program.startDate;
  let fecha = program.startDate;
  for (let i = 0; i < phaseIdx && i < program.phases.length; i++) {
    fecha = addDays(fecha, program.phases[i].weeks * 7);
  }
  return fecha;
}
