import type { Mesocycle, Workout, WorkoutAssignment } from '../types.js';
import { bloquesDelCiclo, bloqueActual, type BloqueDelCiclo } from './cicloDelAtleta.js';
import { cicloDiasDeMeso } from './asignacionMesociclo.js';
import { vueltasDelCiclo } from './progression.js';
import { addDays, esFechaIso } from './trainingWeek.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Qué bloque está viendo el atleta — contado desde el lado del coach

   Un mesociclo no tiene un campo «activo». Lo que el atleta ve lo deciden sus
   ASIGNACIONES: la app agrupa sus sesiones por vuelta del microciclo y enseña
   la vuelta que contiene hoy (`cicloDelAtleta.bloqueActual`). Hasta el 28-10 el
   coach no tenía forma de ver eso, y cada pantalla suya decidía «el bloque
   actual» con otra regla (el panel del cliente por fechas del meso, el
   asistente por la fecha de inicio más reciente). Con dos bloques solapados
   —el de Dani: «Hipertrofia 1» más 70 sesiones de un «Meso #1» borrado— cada
   pantalla contaba una historia distinta.

   Aquí está la única respuesta, calculada con la MISMA función que la app del
   atleta, más lo que el coach necesita para no llevarse sorpresas: en qué
   estado está cada bloque, qué sesiones de otros bloques se le cruzan y desde
   cuándo verá el nuevo.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface VistaDelAtleta {
  /** La vuelta que el atleta tiene en pantalla, o null si no tiene sesiones. */
  bloque: BloqueDelCiclo | null;
  /** El mesociclo de esa vuelta; null si son sesiones sueltas o de un bloque borrado. */
  meso: Mesocycle | null;
  /** Semana (vuelta) del bloque y cuántas tiene. */
  semana: number | null;
  semanasTotal: number | null;
  /** Sesiones de esa vuelta (lo que el atleta ve en Rutinas). */
  sesiones: number;
  /** Sesiones de OTROS bloques en los mismos días: el calendario sí las cuenta. */
  otras: number;
}

/** Cuántas vueltas tiene un mesociclo. */
export function semanasDelMeso(meso: Mesocycle): number {
  return vueltasDelCiclo(meso.weeks, cicloDiasDeMeso(meso));
}

/** Primer y último día del bloque según su fecha de inicio y su duración. */
export function rangoDelMeso(meso: Mesocycle): { desde: string; hasta: string } | null {
  if (!esFechaIso(meso.startDate)) return null;
  const dias = semanasDelMeso(meso) * cicloDiasDeMeso(meso);
  return { desde: meso.startDate, hasta: addDays(meso.startDate, Math.max(1, dias) - 1) };
}

export function vistaDelAtleta(
  assignments: WorkoutAssignment[],
  mesos: Mesocycle[],
  hoy: string,
  workouts: Workout[] = [],
): VistaDelAtleta {
  const bloque = bloqueActual(bloquesDelCiclo(assignments, workouts, mesos, hoy), hoy);
  if (!bloque) return { bloque: null, meso: null, semana: null, semanasTotal: null, sesiones: 0, otras: 0 };
  const mesoId = bloque.dias[0]?.assignment.mesocycleId;
  const meso = mesoId ? mesos.find(m => m.id === mesoId) ?? null : null;
  const ids = new Set(bloque.dias.map(d => d.assignment.id));
  const otras = assignments.filter(a => !ids.has(a.id) && a.date >= bloque.inicio && a.date <= bloque.fin).length;
  return {
    bloque,
    meso,
    semana: meso ? bloque.vuelta ?? null : null,
    semanasTotal: meso ? semanasDelMeso(meso) : null,
    sesiones: bloque.dias.length,
    otras,
  };
}

/**
 * El mesociclo «actual» del atleta para cualquier pantalla del coach: el que
 * el atleta tiene en pantalla; si no tiene sesiones, el que contiene hoy por
 * fechas; y si ninguno, el que empieza más tarde.
 */
export function mesoQueVeElAtleta(
  assignments: WorkoutAssignment[],
  mesos: Mesocycle[],
  hoy: string,
): Mesocycle | null {
  if (mesos.length === 0) return null;
  const visto = vistaDelAtleta(assignments, mesos, hoy).meso;
  if (visto) return visto;
  const porFechas = mesos.find(m => {
    const r = rangoDelMeso(m);
    return !!r && r.desde <= hoy && hoy <= r.hasta;
  });
  return porFechas ?? [...mesos].sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
}

/**
 * En qué punto está un bloque, por sus fechas. `visible` dice además si es lo
 * que el atleta tiene hoy en pantalla: un bloque que empieza el lunes ya sale
 * como «su próxima semana» si no tiene nada más, y uno recién terminado sigue
 * a la vista hasta que haya otro.
 */
export type EstadoDelMeso =
  /** Sin ninguna sesión asignada: el atleta no ve nada de él. */
  | { tipo: 'borrador' }
  /** Asignado, pero su primera sesión es futura. */
  | { tipo: 'programado'; desde: string; visible: boolean }
  /** Asignado y vivo. */
  | { tipo: 'en_curso'; visible: boolean; semana: number | null }
  /** Todas sus sesiones han pasado. */
  | { tipo: 'terminado'; hasta: string; visible: boolean };

export function estadoDelMeso(
  meso: Mesocycle,
  assignments: WorkoutAssignment[],
  mesos: Mesocycle[],
  hoy: string,
): EstadoDelMeso {
  const suyas = assignments.filter(a => a.mesocycleId === meso.id).map(a => a.date).sort();
  if (suyas.length === 0) return { tipo: 'borrador' };
  const vista = vistaDelAtleta(assignments, mesos, hoy);
  const visible = vista.meso?.id === meso.id;
  if (hoy < suyas[0]) return { tipo: 'programado', desde: suyas[0], visible };
  // La última vuelta dura hasta su último día, descanso incluido.
  const rango = rangoDelMeso(meso);
  const ultima = suyas[suyas.length - 1];
  const fin = rango && rango.hasta > ultima ? rango.hasta : ultima;
  if (hoy > fin) return { tipo: 'terminado', hasta: fin, visible };
  return { tipo: 'en_curso', visible, semana: visible ? vista.semana : null };
}

export interface SesionesQueEstorban {
  /** `mesocycleId` del grupo; null = sesiones sueltas, sin bloque. */
  mesocycleId: string | null;
  /** El bloque, si sigue existiendo. */
  meso: Mesocycle | null;
  asignaciones: WorkoutAssignment[];
}

/**
 * Sesiones PENDIENTES de otros bloques que se cruzan con este, desde la
 * semana que el atleta tiene en pantalla. Son las que hacen que el atleta tenga 11 sesiones en una semana de
 * 5. Las de un bloque borrado se cuentan todas (no tienen ningún bloque que
 * las justifique); las de otro bloque vivo o las sueltas, solo las que caen
 * dentro de las fechas de este.
 *
 * `desde` permite contar a partir del inicio de un bloque que todavía no ha
 * empezado (cambio de bloque: lo que estorba es lo que cae desde que empieza
 * el nuevo, no lo de esta semana).
 */
export function sesionesQueEstorban(
  meso: Mesocycle,
  assignments: WorkoutAssignment[],
  mesos: Mesocycle[],
  hoy: string,
): SesionesQueEstorban[] {
  const rango = rangoDelMeso(meso);
  if (!rango) return [];
  // Lo pendiente que ya pasó dentro de la semana que el atleta tiene en
  // pantalla también estorba: le sale en rojo en el calendario de esa semana.
  // Lo de semanas anteriores es historial y no se toca.
  const inicioSemana = vistaDelAtleta(assignments, mesos, hoy).bloque?.inicio;
  const limite = inicioSemana && inicioSemana < hoy ? inicioSemana : hoy;
  const desde = rango.desde > limite ? rango.desde : limite;
  const grupos = new Map<string, SesionesQueEstorban>();
  for (const a of assignments) {
    if (a.status !== 'pending' || a.date < limite || a.mesocycleId === meso.id) continue;
    const otro = a.mesocycleId ? mesos.find(m => m.id === a.mesocycleId) ?? null : null;
    const borrado = !!a.mesocycleId && !otro;
    if (!borrado && (a.date < desde || a.date > rango.hasta)) continue;
    const clave = a.mesocycleId ?? '';
    let g = grupos.get(clave);
    if (!g) {
      g = { mesocycleId: a.mesocycleId ?? null, meso: otro, asignaciones: [] };
      grupos.set(clave, g);
    }
    g.asignaciones.push(a);
  }
  return [...grupos.values()]
    .map(g => ({ ...g, asignaciones: g.asignaciones.sort((x, y) => x.date.localeCompare(y.date)) }))
    .sort((x, y) => x.asignaciones[0].date.localeCompare(y.asignaciones[0].date));
}

/** Sesiones pendientes de un bloque de hoy en adelante: lo que se quita al borrarlo. */
export function pendientesDesde(mesoId: string, assignments: WorkoutAssignment[], hoy: string): WorkoutAssignment[] {
  return assignments.filter(a => a.mesocycleId === mesoId && a.status === 'pending' && a.date >= hoy);
}
