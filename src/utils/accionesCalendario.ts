/**
 * Lógica de las acciones que el coach puede lanzar SIN salir del calendario
 * del roadmap: importar un bloque de entrenamiento, insertar un evento de
 * nutrición y leer el volumen planificado semana a semana.
 *
 * Vive fuera de React y con tests al lado, como el resto del cálculo del
 * roadmap (`roadmapCalendar.ts`, `planEvents.ts`, `adherence.ts`). Las
 * escrituras a Firestore las hace quien llama — aquí solo se decide QUÉ se va
 * a escribir, que es lo que se puede equivocar en silencio.
 */
import {
  Mesocycle, MesocycleTemplate, TaskItem, TaskType, NutritionProgram, NutritionPhase,
  NutritionPhaseType, WorkoutAssignment, Workout, Exercise, MuscleGroup, RefeedDay,
} from '../types';
import { addDays } from './trainingWeek';
import { mesocycleWeekNumber, diasDeCiclo, resolveExerciseForWeek } from './progression';

function diasEntre(a: string, b: string): number {
  return Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000);
}

// ─── Importar un bloque de entrenamiento ──────────────────────────────────────

export interface PlanDePlantilla {
  mesociclos: Omit<Mesocycle, 'id'>[];
  revisiones: Omit<TaskItem, 'id'>[];
}

/**
 * Convierte una plantilla de mesociclos en los mesociclos y revisiones que hay
 * que crear, empezando en `inicio` (no en "hoy": el calendario deja elegir el
 * día, que es el motivo de existir de esta función).
 *
 * Ojo con las fechas: el avance entre etapas usa `addDays`, que trabaja en
 * local. La versión que vivía dentro de MesocycleManager avanzaba con
 * `new Date(...).toISOString().split('T')[0]`, y eso en UTC+1 resta un día en
 * cada salto — con una plantilla de 4 etapas, la última empezaba 3 días antes
 * de lo que decía la suma de semanas. Mismo motivo por el que existe
 * `hoyIsoLocal` en trainingWeek.ts.
 */
export function planificarPlantillaMeso(
  tpl: MesocycleTemplate,
  athleteId: string,
  inicio: string,
  numeroInicial: number,
  programId: string,
): PlanDePlantilla {
  const mesociclos: Omit<Mesocycle, 'id'>[] = [];
  const revisiones: Omit<TaskItem, 'id'>[] = [];
  const creadoEn = new Date().toISOString();
  let cursor = inicio;

  tpl.stages.forEach((stage, i) => {
    const inicioEtapa = cursor;
    mesociclos.push({
      athleteId,
      number: numeroInicial + i,
      weeks: stage.weeks,
      startDate: inicioEtapa,
      objective: stage.name,
      daysPerWeek: stage.daysPerWeek,
      groups: { ...stage.groups },
      ...(stage.days && stage.days.length > 0
        ? { days: stage.days.map(d => ({ ...d, exercises: d.exercises.map(e => ({ ...e })) })) }
        : {}),
      programId,
      programOrder: i,
      ...(stage.deloadWeek !== undefined ? { deloadWeek: stage.deloadWeek } : {}),
    });

    if (stage.reviewCadenceWeeks && stage.reviewCadenceWeeks > 0) {
      const cuantas = Math.max(1, Math.floor(stage.weeks / stage.reviewCadenceWeeks));
      const tipo: TaskType = stage.reviewType ?? 'revision';
      const rotulo = tipo === 'revision' ? 'Revisión' : tipo === 'cuestionario' ? 'Cuestionario' : 'Fotos de check-in';
      for (let r = 1; r <= cuantas; r++) {
        revisiones.push({
          athleteId, type: tipo,
          title: `${rotulo} — ${stage.name}`,
          dueDate: addDays(inicioEtapa, r * stage.reviewCadenceWeeks * 7),
          status: 'pending', createdBy: 'coach', createdAt: creadoEn,
        });
      }
    }

    cursor = addDays(inicioEtapa, stage.weeks * 7);
  });

  return { mesociclos, revisiones };
}

/** Fecha en la que acabaría la plantilla si empieza en `inicio`. */
export function finDePlantilla(tpl: MesocycleTemplate, inicio: string): string {
  const semanas = tpl.stages.reduce((s, st) => s + st.weeks, 0);
  return addDays(inicio, semanas * 7 - 1);
}

// ─── Insertar un evento de nutrición ──────────────────────────────────────────

export interface FaseNueva {
  name: string;
  weeks: number;
  dietId: string;
  targetKcal?: number;
  targetWeight?: number;
  phaseType?: NutritionPhaseType;
}

export interface InsercionDeFase {
  programa: NutritionProgram;
  /** Día en el que la fase empieza DE VERDAD. Las fases del programa van por
   *  semanas completas desde `startDate`, así que un martes cualquiera se
   *  redondea al lunes de su semana del programa. Se devuelve para poder
   *  decírselo al coach en vez de que lo descubra después en el calendario. */
  inicioReal: string;
}

/**
 * Mete una fase nueva en la periodización de nutrición a partir de una fecha,
 * partiendo la fase que la contenga. Devuelve un programa nuevo — nunca muta
 * el que recibe.
 *
 * Si la fecha cae después de todas las fases, la nueva se añade al final: no
 * se rellena el hueco con una fase inventada, porque no hay forma de saber qué
 * debería comer el atleta en esos días.
 */
export function insertarFaseNutricion(programa: NutritionProgram, fecha: string, nueva: FaseNueva): InsercionDeFase {
  const id = `np_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const faseNueva: NutritionPhase = {
    id,
    name: nueva.name,
    weeks: nueva.weeks,
    dietId: nueva.dietId,
    ...(nueva.targetKcal !== undefined ? { targetKcal: nueva.targetKcal } : {}),
    ...(nueva.targetWeight !== undefined ? { targetWeight: nueva.targetWeight } : {}),
    ...(nueva.phaseType !== undefined ? { phaseType: nueva.phaseType } : {}),
  };

  const dias = diasEntre(programa.startDate, fecha);
  // Antes del programa: la fase nueva pasa a ser la primera y el programa
  // arranca ese día. Es lo único coherente — no existe "semana -2".
  if (dias < 0) {
    return { programa: { ...programa, startDate: fecha, phases: [faseNueva, ...programa.phases] }, inicioReal: fecha };
  }

  const semanaObjetivo = Math.floor(dias / 7);
  let acumuladas = 0;
  const fases: NutritionPhase[] = [];

  for (let i = 0; i < programa.phases.length; i++) {
    const fase = programa.phases[i];
    const finFase = acumuladas + fase.weeks;
    if (semanaObjetivo >= finFase) { fases.push(fase); acumuladas = finFase; continue; }

    const dentro = semanaObjetivo - acumuladas;
    if (dentro > 0) fases.push({ ...fase, weeks: dentro });
    fases.push(faseNueva);
    const resto = fase.weeks - dentro;
    if (resto > 0) fases.push({ ...fase, id: `${fase.id}_resto_${id}`, weeks: resto });
    fases.push(...programa.phases.slice(i + 1));
    return { programa: { ...programa, phases: fases }, inicioReal: addDays(programa.startDate, semanaObjetivo * 7) };
  }

  // Más allá del final del programa: se añade al final, sin rellenar el hueco.
  return {
    programa: { ...programa, phases: [...programa.phases, faseNueva] },
    inicioReal: addDays(programa.startDate, acumuladas * 7),
  };
}

// ─── Días de recarga (refeed) ─────────────────────────────────────────────────

export interface OpcionesRefeed {
  dietId?: string;
  note?: string;
}

/**
 * Marca o desmarca días de recarga. Devuelve un programa nuevo, con los
 * refeeds siempre ordenados por fecha y sin duplicados — volver a marcar un
 * día que ya era refeed actualiza su dieta y su nota en vez de añadir otro.
 *
 * `activar: false` los quita. Si al quitarlos no queda ninguno, el campo
 * desaparece del documento en vez de quedarse como array vacío: es lo que
 * espera `stripUndefined` y evita escribir ruido en Firestore.
 */
export function alternarRefeeds(
  programa: NutritionProgram,
  fechas: string[],
  activar: boolean,
  opciones: OpcionesRefeed = {},
): NutritionProgram {
  const aTocar = new Set(fechas);
  const resto = (programa.refeedDays ?? []).filter(r => !aTocar.has(r.date));

  if (!activar) {
    const { refeedDays: _viejos, ...sinCampo } = programa;
    return resto.length > 0 ? { ...programa, refeedDays: resto } : sinCampo;
  }

  const nuevos: RefeedDay[] = [...fechas].sort().map(date => ({
    date,
    ...(opciones.dietId ? { dietId: opciones.dietId } : {}),
    ...(opciones.note?.trim() ? { note: opciones.note.trim() } : {}),
  }));
  return { ...programa, refeedDays: [...resto, ...nuevos].sort((a, b) => a.date.localeCompare(b.date)) };
}

/** La recarga de una fecha, si la hay. */
export function refeedDe(programa: NutritionProgram | null, fecha: string): RefeedDay | null {
  return programa?.refeedDays?.find(r => r.date === fecha) ?? null;
}

// ─── Volumen planificado, semana a semana ─────────────────────────────────────

export interface SemanaDelCarril {
  /** Lunes de la semana. */
  inicio: string;
  fin: string;
  /** Etiqueta corta: "1-7 sep". */
  etiqueta: string;
}

export interface CarrilVolumen {
  semanas: SemanaDelCarril[];
  /** Grupo muscular → series planificadas en cada semana (misma longitud que `semanas`). */
  porGrupo: { grupo: MuscleGroup; series: number[]; total: number }[];
}

const MESES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export interface DatosVolumen {
  semanas: SemanaDelCarril[];
  workoutAssignments: WorkoutAssignment[];
  workouts: Workout[];
  exercises: Exercise[];
  mesocycles: Mesocycle[];
}

/**
 * Series planificadas por grupo muscular en cada semana, resolviendo la
 * progresión del mesociclo (`resolveExerciseForWeek`) para que una subida de
 * volumen programada se VEA subir, en vez de repetir el número base.
 *
 * Se cuenta el grupo PRINCIPAL de cada ejercicio (el del `WorkoutExercise` si
 * lo trae, si no el del catálogo). No usa el reparto fraccionado 1.0/0.5 de
 * `trainingReport.ts` a propósito: aquí la pregunta es "cuántas series le he
 * programado a cada grupo", que es lo que el coach fija en el mesociclo, no
 * "cuánto estímulo efectivo recibe cada grupo".
 */
export function construirCarrilVolumen({ semanas, workoutAssignments, workouts, exercises, mesocycles }: DatosVolumen): CarrilVolumen {
  const porGrupoMap = new Map<MuscleGroup, number[]>();
  const grupoDeEjercicio = new Map<string, MuscleGroup | undefined>();
  for (const e of exercises) grupoDeEjercicio.set(e.id, e.muscleGroup);
  const workoutPorId = new Map(workouts.map(w => [w.id, w]));

  semanas.forEach((semana, si) => {
    const delaSemana = workoutAssignments.filter(a => a.date >= semana.inicio && a.date <= semana.fin);
    for (const asignacion of delaSemana) {
      const workout = workoutPorId.get(asignacion.workoutId);
      if (!workout) continue;
      const meso = mesocycles.find(m => m.id === (workout.mesocycleId ?? asignacion.mesocycleId));
      const semanaDelMeso = meso
        ? mesocycleWeekNumber(meso.startDate, asignacion.date, diasDeCiclo(meso.daysPerWeek, meso.cycleDays))
        : 1;
      for (const we of workout.exercises) {
        const resuelto = resolveExerciseForWeek(we, semanaDelMeso);
        const grupo = we.muscleGroup ?? grupoDeEjercicio.get(we.exerciseId);
        if (!grupo) continue;
        const fila = porGrupoMap.get(grupo) ?? new Array(semanas.length).fill(0);
        fila[si] += resuelto.sets;
        porGrupoMap.set(grupo, fila);
      }
    }
  });

  const porGrupo = [...porGrupoMap.entries()]
    .map(([grupo, series]) => ({ grupo, series, total: series.reduce((a, b) => a + b, 0) }))
    .filter(f => f.total > 0)
    .sort((a, b) => b.total - a.total);

  return { semanas, porGrupo };
}

/** Semanas lunes-domingo que tocan un mes, para alimentar el carril. */
export function semanasDelMes(anio: number, mes: number): SemanaDelCarril[] {
  const primero = `${anio}-${String(mes + 1).padStart(2, '0')}-01`;
  const ultimoDia = new Date(anio, mes + 1, 0).getDate();
  const ultimo = `${anio}-${String(mes + 1).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;
  const dow = new Date(primero + 'T00:00:00').getDay();
  let cursor = addDays(primero, -(dow === 0 ? 6 : dow - 1));
  const semanas: SemanaDelCarril[] = [];
  while (cursor <= ultimo) {
    const fin = addDays(cursor, 6);
    const [, mi, di] = cursor.split('-');
    const [, mf, df] = fin.split('-');
    semanas.push({
      inicio: cursor,
      fin,
      etiqueta: mi === mf ? `${Number(di)}-${Number(df)} ${MESES_CORTO[Number(mi) - 1]}` : `${Number(di)} ${MESES_CORTO[Number(mi) - 1]}-${Number(df)} ${MESES_CORTO[Number(mf) - 1]}`,
    });
    cursor = addDays(cursor, 7);
  }
  return semanas;
}
