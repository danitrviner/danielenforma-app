/**
 * Agujetas a las 48 h, por sesión (D7, 17-11-2026).
 *
 * El curso decide con las agujetas de cada zona unas 48 h después de entrenarla.
 * El cuestionario semanal las pregunta de memoria, todas a la vez y sin mirar
 * cuánto hace de cada sesión. Aquí se pregunta por UNA sesión, cuando toca:
 * terminada hace entre 36 y 72 horas y todavía sin contestar. Pasadas las 72 h
 * ya no se pregunta: lo que se contestara sería otra vez un recuerdo.
 *
 * Solo las zonas que se trabajaron en esa sesión (grupo principal de cada
 * ejercicio → zona del IEM) y, como mucho, las cinco con más series: la
 * tarjeta se contesta en un toque por zona, no es otro cuestionario.
 *
 * Todo puro: recibe los registros, las rutinas, el catálogo y «ahora».
 */
import type { Exercise, MuscleGroup, Workout, WorkoutLog } from '../types.js';
import { ZONAS_IEM, esZonaIem, type ZonaIem } from './cdg/zonas.js';
import { seriesPrincipales } from './seriesPrincipales.js';

/** La ventana en la que se pregunta y el tope de zonas por sesión. */
export const VENTANA_AGUJETAS_48H = { desdeHoras: 36, hastaHoras: 72, maxZonas: 5 } as const;
/** Tras un «ahora no», la tarjeta se calla estas horas y vuelve a salir si la ventana sigue abierta. */
export const HORAS_DE_PAUSA_AHORA_NO = 4;

const HORA_MS = 3_600_000;

export interface ZonaTrabajada { zona: ZonaIem; series: number }

export interface PreguntaAgujetas48h {
  logId: string;
  workoutId: string;
  /** Día de la sesión, `YYYY-MM-DD`. */
  fecha: string;
  completedAt: string;
  /** Nombre de la rutina, si se conoce («Pierna A»). */
  sesion?: string;
  /** Las zonas por las que se pregunta, de más a menos series. */
  zonas: ZonaTrabajada[];
  /** Instante (ISO) en que se deja de preguntar: 72 h después de terminar. */
  caduca: string;
}

type RutinaMinima = Pick<Workout, 'id' | 'name' | 'exercises'>;
type EjercicioMinimo = Pick<Exercise, 'id' | 'muscleGroup'>;
type RegistroMinimo = Pick<WorkoutLog, 'id' | 'workoutId' | 'date' | 'completedAt' | 'entries' | 'agujetas48h' | 'agujetas48hAt'>;

const ms = (ahora: Date | number | string) => (ahora instanceof Date ? ahora.getTime() : typeof ahora === 'number' ? ahora : Date.parse(ahora));

const zonaDeGrupo = (grupo: MuscleGroup | undefined) =>
  grupo ? ZONAS_IEM.find(z => (z.grupos as readonly string[]).includes(grupo)) : undefined;

/** ¿Ya contestó las agujetas de esta sesión? */
export function agujetasContestadas (log: Pick<WorkoutLog, 'agujetas48h' | 'agujetas48hAt'>): boolean {
  return !!log.agujetas48hAt || (log.agujetas48h != null && Object.keys(log.agujetas48h).length > 0);
}

/**
 * Zonas del IEM trabajadas en una sesión, de más a menos series (a igualdad,
 * en el orden de `ZONAS_IEM`). El grupo de cada ejercicio es el que le puso el
 * coach en la rutina o, si no, el principal del catálogo. Las bajadas y
 * miniseries no cuentan como serie, ni las filas sin repeticiones.
 */
export function zonasTrabajadas (
  log: Pick<WorkoutLog, 'entries'>,
  rutina: Pick<Workout, 'exercises'> | undefined,
  ejercicios: readonly EjercicioMinimo[] | ReadonlyMap<string, EjercicioMinimo>,
): ZonaTrabajada[] {
  const porId = ejercicios instanceof Map ? ejercicios as ReadonlyMap<string, EjercicioMinimo> : new Map((ejercicios as readonly EjercicioMinimo[]).map(e => [e.id, e]));
  const series = new Map<ZonaIem, number>();
  for (const entry of log.entries ?? []) {
    const grupo = rutina?.exercises.find(we => we.exerciseId === entry.exerciseId)?.muscleGroup ?? porId.get(entry.exerciseId)?.muscleGroup;
    const zona = zonaDeGrupo(grupo);
    if (!zona) continue;
    const hechas = seriesPrincipales(entry.sets ?? []).filter(s => s.repsDone > 0).length;
    if (hechas > 0) series.set(zona.clave, (series.get(zona.clave) ?? 0) + hechas);
  }
  return ZONAS_IEM.filter(z => series.has(z.clave))
    .map(z => ({ zona: z.clave, series: series.get(z.clave)! }))
    .sort((a, b) => b.series - a.series); // estable: a igualdad queda el orden de ZONAS_IEM
}

/**
 * La sesión por la que toca preguntar ahora, o `null`. Terminada hace entre 36
 * y 72 horas, sin contestar y con alguna zona reconocible. Si hay varias en la
 * ventana, la más antigua primero: es a la que antes se le acaba el plazo.
 */
export function sesionParaAgujetas48h (params: {
  logs: readonly RegistroMinimo[]
  workouts: readonly RutinaMinima[]
  exercises: readonly EjercicioMinimo[]
  ahora: Date | number | string
}): PreguntaAgujetas48h | null {
  const ahora = ms(params.ahora);
  if (!Number.isFinite(ahora)) return null;
  const { desdeHoras, hastaHoras, maxZonas } = VENTANA_AGUJETAS_48H;
  const candidatas = params.logs
    .map(log => ({ log, fin: Date.parse(log.completedAt) }))
    .filter(({ log, fin }) => Number.isFinite(fin)
      && ahora - fin >= desdeHoras * HORA_MS && ahora - fin <= hastaHoras * HORA_MS
      && !agujetasContestadas(log))
    .sort((a, b) => a.fin - b.fin);
  if (candidatas.length === 0) return null;
  const porId = new Map(params.exercises.map(e => [e.id, e]));
  for (const { log, fin } of candidatas) {
    const rutina = params.workouts.find(w => w.id === log.workoutId);
    const zonas = zonasTrabajadas(log, rutina, porId).slice(0, maxZonas);
    if (zonas.length === 0) continue; // solo cardio, movilidad o ejercicios sin grupo: nada que preguntar
    return {
      logId: log.id, workoutId: log.workoutId, fecha: log.date, completedAt: log.completedAt,
      sesion: rutina?.name?.trim() || undefined, zonas,
      caduca: new Date(fin + hastaHoras * HORA_MS).toISOString(),
    };
  }
  return null;
}

/** ¿Sigue callada la tarjeta tras un «ahora no»? `descartadaEn` es el instante del toque. */
export function enPausaTrasAhoraNo (descartadaEn: Date | number | string | null | undefined, ahora: Date | number | string): boolean {
  if (descartadaEn == null) return false;
  const d = ms(descartadaEn); const a = ms(ahora);
  return Number.isFinite(d) && Number.isFinite(a) && a >= d && a - d < HORAS_DE_PAUSA_AHORA_NO * HORA_MS;
}

/**
 * Lo que se guarda en el `workoutLog` cuando están TODAS las zonas contestadas
 * (1-5). Con alguna sin contestar o fuera de escala, `null`: no se guarda a medias.
 */
export function respuestaDeAgujetas (
  pregunta: Pick<PreguntaAgujetas48h, 'zonas'>,
  notas: Partial<Record<string, number>>,
  ahora: Date | number | string,
): Pick<WorkoutLog, 'agujetas48h' | 'agujetas48hAt'> | null {
  const agujetas48h: Partial<Record<string, number>> = {};
  for (const { zona } of pregunta.zonas) {
    const v = notas[zona];
    if (!esZonaIem(zona) || typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 5) return null;
    agujetas48h[zona] = v;
  }
  if (pregunta.zonas.length === 0) return null;
  return { agujetas48h, agujetas48hAt: new Date(ms(ahora)).toISOString() };
}
