import type { Exercise, Mesocycle, WorkoutAssignment, WorkoutLog } from '../types.js';
import { bloqueCerradoRecientemente } from './cierreParaAtleta.js';
import { conEstadoReal } from './estadoDeAsignacion.js';
import { finDeBloque } from './finDeBloque.js';
import { textoSerie, type ProgresionEjercicio } from './progresionDelBloque.js';
import { progresionDelBloqueDelAtleta } from './progresoDelObjetivo.js';

/* ═══════════════════════════════════════════════════════════════════════════
   «Bloque terminado», para el atleta (A2, 17-11-2026)

   Cuando un bloque acaba, el atleta se quedaba con la última semana en
   pantalla y nada más: ni qué ha conseguido ni qué viene. La única baja
   medida (Pedro R.) se fue cinco días después de acabar un bloque sin cierre
   (ver `cierreParaAtleta.ts`). Esto es su cierre, sin esperar al mensaje del
   coach:

     · dos o tres «antes → después» REALES: la serie típica del principio del
       bloque contra la del final (kg × repeticiones), de los ejercicios que
       más han subido. Sale de la misma cuenta que el cierre del coach
       (`buildProgresionDelBloque`: dos semanas contra dos, sin descargas ni
       tests) y solo entran los que superan el ruido de medida (3 %);
     · su constancia: sesiones hechas de las que tocaban;
     · qué viene.

   Sin marcas no se opina de fuerza: la lista sale vacía y la tarjeta enseña
   solo la constancia. Y solo entran los cambios que el atleta ve a simple
   vista (más kilos, o los mismos con más repeticiones): un «menos peso pero
   mejor estimación» es verdad, pero aquí confunde.

   Se enseña mientras el bloque lleve terminado 14 días o menos
   (`bloqueCerradoRecientemente`), aunque el siguiente ya haya empezado.
   ═══════════════════════════════════════════════════════════════════════════ */

export const MAX_ANTES_DESPUES = 3;

export interface AntesDespues {
  exerciseId: string;
  nombre: string;
  /** «60 kg × 8». */
  antes: string;
  despues: string;
  /** «+7,5 kg» · «+2 reps» · «+5 kg y +1 rep». */
  cambio: string;
}

export interface BloqueTerminado {
  mesocycleId: string;
  nombre: string;
  /** Último día del bloque (YYYY-MM-DD). */
  fin: string;
  semanas: number;
  antesDespues: AntesDespues[];
  /** `null` si el bloque no tenía sesiones asignadas. */
  constancia: { hechas: number; tocaban: number; pct: number; texto: string } | null;
  /** El bloque que sigue, si ya está creado. */
  siguiente: { nombre: string; desde: string; empezado: boolean } | null;
  queViene: string;
}

const fmtKg = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 1 });
/** Corto, para que la fila no parta en un móvil estrecho. */
const reps = (n: number) => `${n} ${n === 1 ? 'rep' : 'reps'}`;
const fechaLarga = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

/** Los «antes → después» que se le enseñan al atleta, de más a menos subida. */
export function antesDespuesDelBloque(ejercicios: readonly ProgresionEjercicio[], max = MAX_ANTES_DESPUES): AntesDespues[] {
  const out: AntesDespues[] = [];
  // Ya vienen ordenados de más a menos subida.
  for (const e of ejercicios) {
    if (out.length >= max) break;
    if (e.estado !== 'mejora' || !e.inicio || !e.final) continue;
    const dKg = Math.round((e.final.kg - e.inicio.kg) * 10) / 10;
    const dReps = e.final.reps - e.inicio.reps;
    // Solo lo que se ve a simple vista: más kilos, o los mismos con más repeticiones.
    if (!(dKg > 0 || (dKg === 0 && dReps > 0))) continue;
    const partes = [
      ...(dKg > 0 ? [`+${fmtKg(dKg)} kg`] : []),
      ...(dReps > 0 ? [`+${reps(dReps)}`] : []),
    ];
    out.push({ exerciseId: e.exerciseId, nombre: e.nombre, antes: textoSerie(e.inicio), despues: textoSerie(e.final), cambio: partes.join(' y ') });
  }
  return out;
}

/** Sesiones hechas de las que tocaban en el bloque. */
export function constanciaDelBloque(
  meso: Pick<Mesocycle, 'id' | 'startDate'>, fin: string,
  assignments: readonly WorkoutAssignment[], logs: readonly WorkoutLog[],
): BloqueTerminado['constancia'] {
  const reales = conEstadoReal(assignments, logs);
  const conId = reales.filter(a => a.mesocycleId === meso.id);
  // Asignaciones antiguas sin `mesocycleId`: las de las fechas del bloque.
  const suyas = conId.length > 0 ? conId : reales.filter(a => !a.mesocycleId && a.date >= meso.startDate && a.date <= fin);
  if (suyas.length === 0) return null;
  const hechas = suyas.filter(a => a.status === 'completed').length;
  const tocaban = suyas.length;
  return {
    hechas, tocaban, pct: Math.round((hechas / tocaban) * 100),
    texto: hechas === tocaban ? `Has hecho las ${tocaban} sesiones del bloque. Todas.` : `Has hecho ${hechas} de las ${tocaban} sesiones del bloque.`,
  };
}

/**
 * El cierre del bloque recién terminado, o `null` si ninguno ha acabado en los
 * últimos 14 días.
 */
export function bloqueTerminadoParaElAtleta(o: {
  mesociclos: readonly Mesocycle[];
  assignments: readonly WorkoutAssignment[];
  logs: readonly WorkoutLog[];
  /** Sin catálogo no hay nombres de ejercicio: sale sin «antes → después». */
  exercises?: readonly Exercise[];
  hoy: string;
  pesoCorporalKg?: number | null;
}): BloqueTerminado | null {
  const meso = bloqueCerradoRecientemente(o.mesociclos, o.hoy);
  if (!meso) return null;
  const fin = finDeBloque(meso);
  const progresion = o.exercises
    ? progresionDelBloqueDelAtleta({ meso, logs: o.logs, exercises: o.exercises, assignments: o.assignments, hoy: o.hoy, pesoCorporalKg: o.pesoCorporalKg })
    : null;

  const posterior = o.mesociclos
    .filter(m => m.id !== meso.id && !!m.startDate && m.startDate > meso.startDate)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0] ?? null;
  const siguiente = posterior
    ? { nombre: posterior.name?.trim() || 'Siguiente bloque', desde: posterior.startDate, empezado: posterior.startDate <= o.hoy }
    : null;
  const queViene = !siguiente ? 'Tu entrenador está preparando el siguiente bloque.'
    : siguiente.empezado ? 'Tu siguiente bloque ya está en marcha.'
    : `Tu siguiente bloque empieza el ${fechaLarga(siguiente.desde)}.`;

  return {
    mesocycleId: meso.id,
    nombre: meso.name?.trim() || 'Bloque de entreno',
    fin, semanas: meso.weeks,
    antesDespues: progresion ? antesDespuesDelBloque(progresion.ejercicios) : [],
    constancia: constanciaDelBloque(meso, fin, o.assignments, o.logs),
    siguiente, queViene,
  };
}
