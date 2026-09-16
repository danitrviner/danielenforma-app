import type { WorkoutAssignment, WorkoutLog } from '../types';

/* ═══════════════════════════════════════════════════════════════════════════
   Qué días están entrenados de verdad

   «Completado» vivía en dos sitios que podían contradecirse: el `WorkoutLog`
   —las series que el atleta apuntó— y `WorkoutAssignment.status`. Toda la UI
   leía el segundo, y el segundo se reescribía solo: al reasignar un mesociclo,
   `handleAssign` borraba TODAS las asignaciones —también las de días ya
   entrenados— y las recreaba en `pending`. El entreno seguía guardado, pero
   para la app era como si no se hubiera hecho (auditoría §4.1).

   La regla es la del hecho consumado: si hay un entreno guardado de ese atleta
   para esa fecha, ese día está hecho, diga lo que diga el campo. `status` pasa
   a ser una caché reconstruible; el log es el original.

   Por qué la clave es atleta+fecha y no la rutina: al regenerar, los `Workout`
   también se borran y se vuelven a crear con ids nuevos, así que el `workoutId`
   del log apunta a una rutina que ya no existe. Casar por rutina fallaría justo
   en el caso que esto viene a arreglar. La rutina solo se usa para desempatar
   cuando hay más de una sesión el mismo día.
   ═══════════════════════════════════════════════════════════════════════════ */

type Sesion = Pick<WorkoutAssignment, 'athleteId' | 'date'>;

/** Identifica una sesión por quién la hace y qué día. Ver arriba por qué no entra la rutina. */
export function claveDeSesion(s: Sesion): string {
  return `${s.athleteId}__${s.date}`;
}

/** Índice de los entrenos guardados, por atleta y día. */
function logsPorDia(logs: readonly WorkoutLog[]): Map<string, WorkoutLog[]> {
  const mapa = new Map<string, WorkoutLog[]>();
  for (const l of logs) {
    const clave = claveDeSesion(l);
    const lista = mapa.get(clave);
    if (lista) lista.push(l); else mapa.set(clave, [l]);
  }
  return mapa;
}

/**
 * Devuelve las asignaciones con el estado que de verdad les corresponde: las que
 * tienen un entreno guardado salen como `completed` aunque el campo diga otra cosa.
 *
 * Si no hay nada que corregir devuelve el MISMO array, para no provocar renders
 * inútiles en las pantallas que lo consumen.
 */
export function conEstadoReal(
  asignaciones: readonly WorkoutAssignment[],
  logs: readonly WorkoutLog[],
): WorkoutAssignment[] {
  if (logs.length === 0) return asignaciones as WorkoutAssignment[];

  const completadas = idsConEntreno(asignaciones, logs);
  const hayQueCorregir = asignaciones.some(a => a.status !== 'completed' && completadas.has(a.id));
  if (!hayQueCorregir) return asignaciones as WorkoutAssignment[];

  return asignaciones.map(a =>
    completadas.has(a.id) && a.status !== 'completed' ? { ...a, status: 'completed' as const } : a,
  );
}

/**
 * Qué asignaciones tienen detrás un entreno guardado, resuelto día a día.
 *
 * Casi siempre hay una sola sesión ese día y un solo log: correspondencia
 * directa. Cuando hay varias —fuerza por la mañana, cardio por la tarde— se
 * emparejan primero las que comparten rutina, y los logs que quedan sueltos
 * (porque su rutina se regeneró y ya no existe) se reparten entre las sesiones
 * que quedan libres. Nunca se marcan más sesiones que entrenos guardados hay.
 */
function idsConEntreno(
  asignaciones: readonly WorkoutAssignment[],
  logs: readonly WorkoutLog[],
): Set<string> {
  const porDia = logsPorDia(logs);
  const completadas = new Set<string>();

  for (const [clave, logsDelDia] of porDia) {
    const delDia = asignaciones.filter(a => claveDeSesion(a) === clave);
    if (delDia.length === 0) continue;

    const librePorRutina = [...delDia];
    const sueltos: WorkoutLog[] = [];

    for (const l of logsDelDia) {
      const i = librePorRutina.findIndex(a => a.workoutId === l.workoutId);
      if (i >= 0) completadas.add(librePorRutina.splice(i, 1)[0].id);
      else sueltos.push(l);
    }

    for (let i = 0; i < sueltos.length && i < librePorRutina.length; i++) {
      completadas.add(librePorRutina[i].id);
    }
  }

  return completadas;
}

/**
 * Cuáles de las asignaciones existentes se pueden borrar al reprogramar un
 * mesociclo. Lo que NO está aquí se conserva.
 *
 * Se conserva todo lo que ya es historia —días pasados, y hoy si el atleta ya
 * ha entrenado—, porque reprogramar es decidir qué se va a hacer, no reescribir
 * lo que se hizo. Un lunes que el atleta se saltó también es historia: forma
 * parte de su adherencia, y recrearlo como «pendiente» le inventa un entreno
 * que ya nadie le va a pedir.
 */
export function asignacionesABorrar(
  asignaciones: readonly WorkoutAssignment[],
  logs: readonly WorkoutLog[],
  hoy: string,
): WorkoutAssignment[] {
  const porDia = logsPorDia(logs);
  return asignaciones.filter(a => {
    if (a.date < hoy) return false;
    if (porDia.has(claveDeSesion(a))) return false;
    return true;
  });
}

/** Una asignación todavía sin id, tal y como la construyen las pantallas del coach. */
export type AsignacionNueva = Omit<WorkoutAssignment, 'id'>;

/**
 * Qué borrar y qué crear al reprogramar un mesociclo, conservando el historial.
 *
 * Antes, reprogramar era «borra todo y vuelve a crearlo». Esto lo convierte en
 * «cambia lo que todavía no ha pasado»: se borran las asignaciones futuras sin
 * entreno detrás, y de las nuevas solo se crean las que no pisan un día que se
 * conserva. Sin ese segundo filtro, el lunes entrenado que ya no se borra
 * aparecería DOS veces en el calendario del atleta.
 *
 * Un día que se conserva queda CERRADO: no se le añaden sesiones nuevas. No se
 * puede afinar más comparando rutinas, porque al regenerar se crean `Workout`
 * de cero y todos los `workoutId` son nuevos por definición — cualquier
 * comparación por rutina vería «hueco libre» y duplicaría el día entrenado,
 * que es justo lo que esto viene a evitar.
 */
export function planDeReprogramacion(
  existentes: readonly WorkoutAssignment[],
  logs: readonly WorkoutLog[],
  nuevas: readonly AsignacionNueva[],
  hoy: string,
): { borrar: WorkoutAssignment[]; crear: AsignacionNueva[] } {
  const borrar = asignacionesABorrar(existentes, logs, hoy);
  const idsABorrar = new Set(borrar.map(a => a.id));

  const conservadas = existentes.filter(a => !idsABorrar.has(a.id));
  return { borrar, crear: descartarDiasCerrados(nuevas, conservadas) };
}

/**
 * Quita de la programación nueva los días que ya están cubiertos por una
 * asignación conservada. Sin esto, el lunes entrenado que ya no se borra
 * aparecería DOS veces en el calendario del atleta.
 */
export function descartarDiasCerrados(
  nuevas: readonly AsignacionNueva[],
  conservadas: readonly WorkoutAssignment[],
): AsignacionNueva[] {
  if (conservadas.length === 0) return nuevas as AsignacionNueva[];
  const cerrados = new Set(conservadas.map(claveDeSesion));
  return nuevas.filter(n => !cerrados.has(claveDeSesion(n)));
}
