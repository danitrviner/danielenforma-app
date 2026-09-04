import type { Mesocycle, Workout, WorkoutAssignment } from '../types';
import { diasDeCiclo, mesocycleWeekNumber } from './progression';
import { addDays, getWeekStart } from './trainingWeek';

/* ═══════════════════════════════════════════════════════════════════════════
   El microciclo del atleta: qué sesiones ve y en qué orden

   La pantalla de Rutinas agrupaba las sesiones por SEMANA DE CALENDARIO
   (lunes-domingo) y ordenaba por fecha. Con un mesociclo de 6 sesiones el
   ciclo no cae en semanas de 7 días, así que la semana natural partía la
   vuelta por la mitad y el atleta leía «Día 2, Día 3, Día 4, Día 5, Día 6,
   Día 1, Día 2» — el Día 1 en sexto lugar y el Día 2 repetido. Lo que él
   entiende por "su semana" no es lunes-domingo: es una VUELTA del microciclo,
   del Día 1 al Día N.

   Aquí se agrupa por eso: por vuelta del microciclo cuando la sesión viene de
   un mesociclo, y por semana natural cuando no (asignaciones sueltas del
   coach, que no pertenecen a ningún ciclo).

   Y el estado de cada día es una sola cosa —hecho, hoy, no hecho, aún por
   venir— en vez de un bloque «Atrasados» aparte al final: los que se pasaron
   salen en su sitio, en rojo. Decisión de Dani (2026-09-04): «si no se
   recupera dentro de la misma semana, ya no se va a poder recuperar».
   ═══════════════════════════════════════════════════════════════════════════ */

/** Cómo se pinta un día del ciclo. Un día tiene exactamente uno de estos. */
export type EstadoDeDia = 'completado' | 'saltado' | 'hoy' | 'perdido' | 'pendiente';

export interface DiaDelCiclo {
  assignment: WorkoutAssignment;
  estado: EstadoDeDia;
}

export interface BloqueDelCiclo {
  /** Identidad del bloque: `meso:<id>:<vuelta>` o `semana:<lunes>`. */
  clave: string;
  /** Primer y último día del microciclo, descansos incluidos. */
  inicio: string;
  fin: string;
  /** Fechas de la primera y la última SESIÓN — lo que se enseña como rango. */
  primeraFecha: string;
  ultimaFecha: string;
  /** Nº de vuelta (1-based) si el bloque es de un mesociclo. */
  vuelta?: number;
  dias: DiaDelCiclo[];
}

/**
 * El estado con el que se pinta una sesión.
 *
 * Ojo al orden: `completed`/`skipped` mandan sobre la fecha (una sesión hecha
 * hoy es verde, no amarilla) y una pendiente de ayer es «perdido» aunque
 * Firestore siga diciendo `pending` — el volcado a `perdido` solo ocurre a
 * los 7 días, y hasta entonces el atleta ya la ve como no hecha.
 */
export function estadoDeSesion(a: WorkoutAssignment, hoy: string): EstadoDeDia {
  if (a.status === 'completed') return 'completado';
  if (a.status === 'skipped') return 'saltado';
  if (a.status === 'perdido') return 'perdido';
  if (a.date === hoy) return 'hoy';
  return a.date < hoy ? 'perdido' : 'pendiente';
}

/** El mesociclo de una asignación, si lo tiene y sigue existiendo. */
function mesoDe(a: WorkoutAssignment, mesos: Mesocycle[]): Mesocycle | undefined {
  return a.mesocycleId ? mesos.find(m => m.id === a.mesocycleId) : undefined;
}

/**
 * Orden dentro del bloque: lo manda `dayIndex` de la rutina, no la fecha ni
 * el nombre (ver el comentario de `Workout.dayIndex`). Las rutinas antiguas
 * sin `dayIndex` caen a la fecha, que es lo único que se sabe de ellas.
 */
function comparaDias(
  a: WorkoutAssignment,
  b: WorkoutAssignment,
  diaDe: (a: WorkoutAssignment) => number | undefined,
): number {
  const da = diaDe(a);
  const db = diaDe(b);
  if (da != null && db != null && da !== db) return da - db;
  if (da != null && db == null) return -1;
  if (da == null && db != null) return 1;
  return a.date.localeCompare(b.date) || a.id.localeCompare(b.id);
}

/**
 * Todas las asignaciones repartidas en bloques de microciclo, ordenados de
 * antes a después, y cada bloque ordenado por día del ciclo.
 */
export function bloquesDelCiclo(
  assignments: WorkoutAssignment[],
  workouts: Workout[],
  mesos: Mesocycle[],
  hoy: string,
): BloqueDelCiclo[] {
  const diaDe = (a: WorkoutAssignment) => workouts.find(w => w.id === a.workoutId)?.dayIndex;
  const porClave = new Map<string, { meso?: Mesocycle; vuelta?: number; items: WorkoutAssignment[] }>();

  for (const a of assignments) {
    const meso = mesoDe(a, mesos);
    const vuelta = meso ? mesocycleWeekNumber(meso.startDate, a.date, diasDeCiclo(meso.daysPerWeek, meso.cycleDays)) : undefined;
    const clave = meso ? `meso:${meso.id}:${vuelta}` : `semana:${getWeekStart(a.date)}`;
    let grupo = porClave.get(clave);
    if (!grupo) {
      grupo = { meso, vuelta, items: [] };
      porClave.set(clave, grupo);
    }
    grupo.items.push(a);
  }

  const bloques: BloqueDelCiclo[] = [];
  for (const [clave, { meso, vuelta, items }] of porClave) {
    const fechas = items.map(a => a.date).sort();
    const primeraFecha = fechas[0];
    const ultimaFecha = fechas[fechas.length - 1];
    // La ventana del microciclo son sus días completos, descansos incluidos:
    // en un día de descanso el atleta sigue estando "en" su semana, y sin esto
    // la pantalla saltaría al ciclo siguiente en cuanto pasara la última sesión.
    let inicio: string;
    let fin: string;
    if (meso && vuelta != null) {
      const cicloDias = diasDeCiclo(meso.daysPerWeek, meso.cycleDays);
      inicio = addDays(meso.startDate, (vuelta - 1) * cicloDias);
      fin = addDays(inicio, cicloDias - 1);
      // Una asignación movida a mano fuera de su ventana no se queda huérfana.
      if (primeraFecha < inicio) inicio = primeraFecha;
      if (ultimaFecha > fin) fin = ultimaFecha;
    } else {
      inicio = getWeekStart(primeraFecha);
      fin = addDays(inicio, 6);
    }
    bloques.push({
      clave,
      inicio,
      fin,
      primeraFecha,
      ultimaFecha,
      vuelta,
      dias: [...items]
        .sort((a, b) => comparaDias(a, b, diaDe))
        .map(a => ({ assignment: a, estado: estadoDeSesion(a, hoy) })),
    });
  }

  return bloques.sort((a, b) => a.inicio.localeCompare(b.inicio) || a.clave.localeCompare(b.clave));
}

/**
 * El bloque que el atleta está viviendo hoy.
 *
 * Por orden: el ciclo que contiene hoy (aunque hoy sea descanso), el primero
 * que todavía no ha terminado (si hoy cae en un hueco entre bloques) y, si
 * todo está en el pasado, el último — mejor enseñar la vuelta recién acabada
 * que una pantalla vacía.
 */
export function bloqueActual(bloques: BloqueDelCiclo[], hoy: string): BloqueDelCiclo | null {
  if (bloques.length === 0) return null;
  return bloques.find(b => b.inicio <= hoy && hoy <= b.fin)
    ?? bloques.find(b => b.fin >= hoy)
    ?? bloques[bloques.length - 1];
}
