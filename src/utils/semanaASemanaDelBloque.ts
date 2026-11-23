import type { Exercise, Mesocycle, Workout, WorkoutExercise, WorkoutLog, WorkoutSetLog } from '../types.js';
import { resolverEjercicioDelMeso, vueltasDelCiclo, mesocycleWeekNumber } from './progression.js';
import { cicloDiasDeMeso } from './asignacionMesociclo.js';
import { describirCelda } from './planificadorProgresion.js';
import { expandSetGroups } from './setGroups.js';
import { rangoDeReps } from './cargaSugerida.js';
import { seriesPrincipales } from './seriesPrincipales.js';
import { rmDeSerie } from './oneRepMax.js';
import { RUIDO_RM_PCT } from './ruidoDeMedida.js';
import { finDeBloque } from './finDeBloque.js';
import { addDays } from './trainingWeek.js';
import { nombresCortosDeSesiones } from './nombresMeso.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Revisión › Bloque › «Cada ejercicio, semana a semana» (23-11-2026).

   Lo que Dani pidió: al mirar un bloque, ver de CADA ejercicio lo que tocaba
   cada semana (la planificación) y lo que hizo de verdad (peso y reps de cada
   serie), en todas las semanas: si el bloque tiene ocho, ocho medidas.

   Ordenado como el plan —sesión del ciclo → ejercicio en su orden→ semana—,
   porque es así como el coach piensa el bloque. Una semana es una VUELTA del
   microciclo (la S de la barra de semanas), no una semana de calendario: con
   un ciclo de 14 días, ocho semanas son cuatro vueltas.

   Qué registro va a qué casilla:
     · El registro es del bloque si lleva su `mesocycleId` o, sin él, si cae
       entre su inicio y su final.
     · La sesión sale del `workoutId`. Si la rutina ya no existe (el coach
       regeneró el bloque a mitad), se busca la sesión que tiene ese ejercicio.
     · El ejercicio, por su id contra lo PAUTADO esa semana (un cambio de
       ejercicio programado a partir de la S4 se busca como el nuevo).
     · Lo que no encaja con nada del plan no se pierde: va a «Fuera de la
       planificación».
   ═══════════════════════════════════════════════════════════════════════════ */

export type MarcaDeSemana = 'descarga' | 'test' | 'pivot';

export interface SemanaDelBloqueCol {
  /** Vuelta del microciclo, 1-indexada. */
  n: number;
  desde: string;
  hasta: string;
  marca: MarcaDeSemana | null;
  /** Empieza después de hoy: solo hay plan. */
  futura: boolean;
  /** Hoy cae dentro. */
  enCurso: boolean;
}

export interface SerieHecha {
  kg: number;
  reps: number;
  /** null = no lo apuntó. */
  rir: number | null;
  alFallo: boolean;
  /** Bajada o miniserie: cuenta como carga, no como serie. */
  segmento: boolean;
}

export interface VezEntrenada {
  fecha: string;
  series: SerieHecha[];
  /** Sesión hecha fuera de su gimnasio: la fuerza no se compara. */
  fuera: boolean;
  nota?: string;
}

export type EstadoDeCelda = 'cumple' | 'corto' | 'sin_hacer' | 'pendiente' | 'por_llegar';

export interface CeldaEjercicioSemana {
  semana: number;
  /** Lo pautado esa semana: «3×8-10» y «RIR 2». null si el ejercicio no estaba en el plan. */
  plan: { esquema: string; rir: string; series: number } | null;
  /** Nombre del ejercicio esa semana si un cambio programado lo sustituye. */
  otroEjercicio?: string;
  veces: VezEntrenada[];
  estado: EstadoDeCelda;
  seriesHechas: number;
  /** La serie con más fuerza estimada de la semana (sin las de fuera). */
  mejor: { kg: number; reps: number; e1rm: number } | null;
  /** Contra la última semana anterior con marca: más allá del ruido de medida. */
  vsAnterior: 'sube' | 'igual' | 'baja' | null;
}

export interface FilaEjercicioBloque {
  clave: string;
  exerciseId: string;
  nombre: string;
  semanas: CeldaEjercicioSemana[];
  /** De la primera semana con marca a la última, en % de fuerza estimada. */
  cambioPct: number | null;
  semanasConMarca: number;
}

export interface SesionDelBloqueFilas {
  clave: string;
  nombre: string;
  filas: FilaEjercicioBloque[];
}

export interface SemanaASemanaDelBloque {
  semanas: SemanaDelBloqueCol[];
  sesiones: SesionDelBloqueFilas[];
  /** Ejercicios registrados en el bloque que no están en ninguna sesión del plan. */
  fueraDelPlan: FilaEjercicioBloque[];
  /** Registros del bloque que se han leído (para el «sin datos»). */
  registros: number;
}

// ── Sesiones del plan ───────────────────────────────────────────────────────

interface SesionDelPlan {
  clave: string;
  nombre: string;
  workoutIds: Set<string>;
  ejercicios: WorkoutExercise[];
}

/** Una por día del ciclo, en su orden (mismo criterio que el editor del mesociclo). */
function sesionesDelPlan(workouts: Workout[], mesoId: string): SesionDelPlan[] {
  const porClave = new Map<string, SesionDelPlan & { dayIndex?: number }>();
  for (const w of workouts) {
    if (w.mesocycleId !== mesoId) continue;
    const clave = w.dayIndex != null ? `d${w.dayIndex}` : `n:${w.name}`;
    let s = porClave.get(clave);
    if (!s) {
      s = { clave, nombre: w.name, dayIndex: w.dayIndex, workoutIds: new Set(), ejercicios: [...(w.exercises ?? [])].sort((a, b) => a.order - b.order) };
      porClave.set(clave, s);
    }
    s.workoutIds.add(w.id);
  }
  const lista = [...porClave.values()].sort((a, b) => {
    if (a.dayIndex != null && b.dayIndex != null) return a.dayIndex - b.dayIndex;
    if (a.dayIndex != null) return -1;
    if (b.dayIndex != null) return 1;
    return a.nombre.localeCompare(b.nombre, undefined, { numeric: true });
  });
  const cortos = nombresCortosDeSesiones(lista.map(s => s.nombre));
  return lista.map((s, i) => ({ ...s, nombre: cortos[i] }));
}

// ── Series ──────────────────────────────────────────────────────────────────

function rirDe(s: WorkoutSetLog): number | null {
  if (s.alFallo) return 0;
  const n = Number(s.rir);
  return s.rir == null || !Number.isFinite(n) || n < 0 ? null : n;
}

function aSerieHecha(s: WorkoutSetLog): SerieHecha {
  return {
    kg: Number(s.weight) || 0,
    reps: Number(s.repsDone) || 0,
    rir: rirDe(s),
    alFallo: !!s.alFallo,
    segmento: !!s.segmento,
  };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

// ── Motor ───────────────────────────────────────────────────────────────────

export function semanaASemanaDelBloque(params: {
  meso: Mesocycle;
  workouts: Workout[];
  logs: WorkoutLog[];
  exercises: Exercise[];
  hoy: string;
}): SemanaASemanaDelBloque {
  const { meso, workouts, logs, exercises, hoy } = params;
  const nombreDe = new Map(exercises.map(e => [e.id, e.name]));
  const cicloDias = cicloDiasDeMeso(meso);
  const fin = finDeBloque(meso);
  const sesiones = sesionesDelPlan(workouts, meso.id);

  // Registros del bloque, con su vuelta.
  const delBloque = logs
    .filter(l => !!l.date && l.date >= meso.startDate
      && (l.mesocycleId ? l.mesocycleId === meso.id : l.date <= fin))
    .map(l => ({ log: l, semana: mesocycleWeekNumber(meso.startDate, l.date, cicloDias) }))
    .sort((a, b) => a.log.date.localeCompare(b.log.date));

  const vueltas = vueltasDelCiclo(meso.weeks, cicloDias);
  const totalSemanas = Math.max(vueltas, ...delBloque.map(r => r.semana), 1);

  const descarga = new Set([...(meso.semanasDescarga ?? []), ...(meso.deloadWeek ? [meso.deloadWeek] : [])]);
  const semanas: SemanaDelBloqueCol[] = Array.from({ length: totalSemanas }, (_, i) => {
    const n = i + 1;
    const desde = addDays(meso.startDate, i * cicloDias);
    const hasta = addDays(desde, cicloDias - 1);
    const marca: MarcaDeSemana | null = descarga.has(n) ? 'descarga'
      : meso.semanasTest?.includes(n) ? 'test'
        : meso.semanasPivot?.includes(n) ? 'pivot' : null;
    return { n, desde, hasta, marca, futura: desde > hoy, enCurso: desde <= hoy && hoy <= hasta };
  });

  // Lo pautado de cada ejercicio, cada semana (cambios + escalones + descarga).
  const pautado = sesiones.map(s => s.ejercicios.map(we =>
    semanas.map(sem => resolverEjercicioDelMeso(we, meso, sem.n))));

  // Casillas vacías: [sesión][ejercicio][semana] → veces.
  const veces: VezEntrenada[][][][] = sesiones.map(s => s.ejercicios.map(() => semanas.map(() => [])));
  const fuera = new Map<string, VezEntrenada[][]>();

  const sesionesConEjercicio = (exerciseId: string) => sesiones
    .map((s, i) => i)
    .filter(i => pautado[i].some(sem => sem.some(we => we.exerciseId === exerciseId)));

  for (const { log, semana } of delBloque) {
    const si = semana - 1;
    const sesionDelLog = sesiones.findIndex(s => s.workoutIds.has(log.workoutId));
    for (const entry of log.entries ?? []) {
      const sets = (entry.sets ?? []).filter(s => (Number(s.repsDone) || 0) > 0 || (Number(s.weight) || 0) > 0);
      if (sets.length === 0) continue;
      const vez: VezEntrenada = {
        fecha: log.date,
        series: sets.map(aSerieHecha),
        fuera: !!log.fuera || sets.some(s => s.fuera),
        ...(entry.note ? { nota: entry.note } : {}),
      };
      // Sesión: la del workoutId; si no está (rutina regenerada), la que
      // tenga el ejercicio.
      const candidatas = sesionDelLog >= 0 ? [sesionDelLog] : sesionesConEjercicio(entry.exerciseId);
      let colocada = false;
      for (const ses of candidatas) {
        // Lo pautado esa semana; si no, el ejercicio base (hecho antes o
        // después de un cambio de ejercicio programado).
        const ei = pautado[ses].findIndex(sem => sem[si]?.exerciseId === entry.exerciseId);
        const idx = ei >= 0 ? ei : sesiones[ses].ejercicios.findIndex(we => we.exerciseId === entry.exerciseId);
        if (idx >= 0) {
          veces[ses][idx][si].push(vez);
          colocada = true;
          break;
        }
      }
      if (!colocada) {
        const filas = fuera.get(entry.exerciseId) ?? semanas.map(() => []);
        filas[si].push(vez);
        fuera.set(entry.exerciseId, filas);
      }
    }
  }

  const construirFila = (
    clave: string, exerciseId: string, porSemana: VezEntrenada[][],
    planDe: (si: number) => WorkoutExercise | null,
  ): FilaEjercicioBloque => {
    let anterior: number | null = null;
    let primera: number | null = null;
    let ultima: number | null = null;
    let conMarca = 0;
    const celdas = semanas.map((sem, si): CeldaEjercicioSemana => {
      const we = planDe(si);
      const lasVeces = porSemana[si];
      const plan = we ? { ...describirCelda(we), series: we.setGroups?.length ? we.setGroups.reduce((s, g) => s + g.sets, 0) : we.sets } : null;
      // Series principales de la vez con más series (dos veces la misma
      // semana no suman: se mira la mejor de las dos).
      const seriesHechas = Math.max(0, ...lasVeces.map(v => seriesPrincipales(v.series).length));

      // Mejor serie para la fuerza: sin segmentos ni sesiones de fuera.
      let mejor: CeldaEjercicioSemana['mejor'] = null;
      for (const v of lasVeces) {
        if (v.fuera) continue;
        for (const s of v.series) {
          if (s.segmento || s.reps <= 0) continue;
          const e1rm = s.kg > 0 ? rmDeSerie({ weight: s.kg, repsDone: s.reps, rir: s.rir ?? undefined, alFallo: s.alFallo }) : 0;
          if (!mejor || e1rm > mejor.e1rm || (e1rm === mejor.e1rm && (s.kg > mejor.kg || (s.kg === mejor.kg && s.reps > mejor.reps)))) {
            mejor = { kg: s.kg, reps: s.reps, e1rm };
          }
        }
      }

      let vsAnterior: CeldaEjercicioSemana['vsAnterior'] = null;
      if (mejor && mejor.e1rm > 0) {
        if (anterior != null && anterior > 0) {
          const pct = ((mejor.e1rm - anterior) / anterior) * 100;
          vsAnterior = pct > RUIDO_RM_PCT ? 'sube' : pct < -RUIDO_RM_PCT ? 'baja' : 'igual';
        }
        anterior = mejor.e1rm;
        if (primera == null) primera = mejor.e1rm;
        ultima = mejor.e1rm;
      }
      if (lasVeces.length > 0) conMarca += 1;

      let estado: EstadoDeCelda;
      if (lasVeces.length === 0) {
        estado = sem.futura ? 'por_llegar' : sem.enCurso ? 'pendiente' : 'sin_hacer';
      } else if (!we) {
        estado = 'cumple';
      } else {
        // Cumple: todas las series pautadas, cada una llegando al mínimo del
        // rango (al fallo vale siempre). Mismo criterio que la tabla de
        // «Planificar progresión».
        const filasPlan = expandSetGroups(we);
        const mejorVez = lasVeces.reduce((m, v) => seriesPrincipales(v.series).length > seriesPrincipales(m.series).length ? v : m);
        const principales = seriesPrincipales(mejorVez.series);
        const buenas = principales.filter((s, i) => {
          const rango = rangoDeReps(filasPlan[Math.min(i, filasPlan.length - 1)]?.reps ?? '');
          return s.alFallo || !rango || s.reps >= rango.min;
        }).length;
        estado = buenas >= (plan?.series ?? 0) ? 'cumple' : 'corto';
      }

      const otroId = we && we.exerciseId !== exerciseId ? we.exerciseId : null;
      return {
        semana: sem.n,
        plan,
        ...(otroId ? { otroEjercicio: nombreDe.get(otroId) ?? 'Otro ejercicio' } : {}),
        veces: lasVeces,
        estado,
        seriesHechas,
        mejor: mejor ? { ...mejor, e1rm: r1(mejor.e1rm) } : null,
        vsAnterior,
      };
    });
    return {
      clave,
      exerciseId,
      nombre: nombreDe.get(exerciseId) ?? 'Ejercicio',
      semanas: celdas,
      cambioPct: primera != null && ultima != null && primera > 0 && conMarca > 1
        ? r1(((ultima - primera) / primera) * 100) : null,
      semanasConMarca: conMarca,
    };
  };

  return {
    semanas,
    sesiones: sesiones
      .map((s, ses) => ({
        clave: s.clave,
        nombre: s.nombre,
        filas: s.ejercicios.map((we, ei) => construirFila(
          `${s.clave}::${ei}::${we.exerciseId}`, we.exerciseId, veces[ses][ei], si => pautado[ses][ei][si],
        )),
      }))
      .filter(s => s.filas.length > 0),
    fueraDelPlan: [...fuera.entries()]
      .map(([exerciseId, porSemana]) => construirFila(`fuera::${exerciseId}`, exerciseId, porSemana, () => null))
      .sort((a, b) => a.nombre.localeCompare(b.nombre)),
    registros: delBloque.length,
  };
}

/** «80 × 10», «12 reps» (sin carga) — sin «kg» para que quepa en la casilla. */
export function textoSerieCorta(s: Pick<SerieHecha, 'kg' | 'reps'>): string {
  const kg = s.kg.toLocaleString('es-ES', { maximumFractionDigits: 2 });
  return s.kg > 0 ? `${kg} × ${s.reps}` : `${s.reps} reps`;
}

export const ETIQUETA_MARCA: Record<MarcaDeSemana, string> = {
  descarga: 'Descarga',
  test: 'Test',
  pivot: 'Puente',
};
