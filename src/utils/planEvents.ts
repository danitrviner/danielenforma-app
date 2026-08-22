import { TaskItem, WorkoutAssignment, Workout, Exercise, Mesocycle, NutritionProgram, WorkoutLog, BodyweightLog } from '../types';
import { addDays, getWeekStart } from './trainingWeek';
import { evaluateCondition, ConditionContext } from './conditions';

// ─── PlanEvent — modelo único de evento derivado para el cuadro de mando de
// periodización ("Pantalla 1"). Nunca se teclea a mano ni se guarda aparte:
// cada lane deriva sus PlanEvent a partir de los datos que YA existen
// (mesociclos, fases de nutrición, tareas...), así que programar algo en su
// sitio de origen (el editor de ejercicios, una tarea) hace que el marcador
// aparezca solo — nunca hay que anotarlo dos veces. Ver el Bloque H del plan.
export type PlanEventLane = 'entrenamiento' | 'nutricion' | 'revisiones' | 'objetivos';

export type PlanEventStatus = 'programado' | 'hecho' | 'vencido';

export interface PlanEvent {
  id: string;
  lane: PlanEventLane;
  date: string;      // YYYY-MM-DD
  title: string;
  status: PlanEventStatus;
  icon: string;       // nombre de icono Material Symbols
  // Solo en marcadores de subida de volumen: identifica la regla que hay que
  // mutar al arrastrar el marcador a otra semana (Bloque H, Pantalla 1).
  moveRef?: { workoutId: string; exerciseId: string; atWeek: number; mesocycleId: string };
  // Periodización auto-regulada (Bloque H2.2) — presente solo si la regla que
  // originó el marcador tiene condición. `met` se reevalúa en cada lectura
  // con los datos más recientes (nunca se persiste "se aplicó o no").
  conditional?: { met: boolean };
}

// Datos del atleta para evaluar condiciones (Bloque H2.2) — opcional en los
// derivadores: sin esto, un marcador condicional se marca como "no cumplida"
// (a lo seguro) en vez de intentar evaluarla sin datos.
export interface ConditionData {
  workoutAssignments: WorkoutAssignment[];
  workoutLogs: WorkoutLog[];
  bodyweightLogs: BodyweightLog[];
  dietAdherencePct?: number;
}

const TASK_ICON: Record<TaskItem['type'], string> = {
  revision: 'fact_check',
  cuestionario: 'quiz',
  foto: 'photo_camera',
  manual: 'flag',
  otro: 'event_note',
};

// Deriva los marcadores del carril "Revisiones" a partir de las TaskItem del
// atleta — check-ins, cuestionarios, fotos. `manual`/`otro` se excluyen: son
// tareas internas del coach, no un hito de revisión programado con el atleta.
export function deriveReviewEvents(tasks: TaskItem[], today: string): PlanEvent[] {
  return tasks
    .filter(t => t.dueDate && (t.type === 'revision' || t.type === 'cuestionario' || t.type === 'foto'))
    .map(t => ({
      id: t.id,
      lane: 'revisiones' as const,
      date: t.dueDate!,
      title: t.title,
      status: t.status === 'done' ? 'hecho' : t.dueDate! < today ? 'vencido' : 'programado',
      icon: TASK_ICON[t.type],
    }));
}

// Marcadores de subida de volumen en el carril "Entrenamiento" (Bloque F → H) —
// derivados directamente de las reglas `weeklyProgression` que el coach ya puso
// en el editor de ejercicios. Nunca se anota aparte: la regla ES el evento.
export function deriveVolumeIncreaseEvents(
  workouts: Workout[], exercises: Exercise[], mesocycle: Mesocycle, today: string,
  conditionData?: ConditionData,
): PlanEvent[] {
  const workoutsInMeso = workouts.filter(w => w.mesocycleId === mesocycle.id);
  const events: PlanEvent[] = [];
  for (const wo of workoutsInMeso) {
    for (const we of wo.exercises) {
      for (const rule of we.weeklyProgression ?? []) {
        const date = addDays(mesocycle.startDate, (rule.atWeek - 1) * 7);
        const exName = exercises.find(e => e.id === we.exerciseId)?.name ?? we.exerciseId;
        const parts: string[] = [];
        if (rule.addSets) parts.push(`${rule.addSets > 0 ? '+' : ''}${rule.addSets} serie${Math.abs(rule.addSets) === 1 ? '' : 's'}`);
        if (rule.addReps) parts.push(rule.addReps);
        if (rule.setRir !== undefined) parts.push(`RIR ${rule.setRir}`);
        // Bloque H2.2 — sin `conditionData` (p. ej. vista de solo lectura del
        // atleta que no lo pasa) se marca como no cumplida, a lo seguro.
        const conditional = rule.condition ? {
          met: conditionData ? evaluateCondition(rule.condition, {
            today, exerciseId: we.exerciseId,
            workoutAssignments: conditionData.workoutAssignments,
            workoutLogs: conditionData.workoutLogs,
            bodyweightLogs: conditionData.bodyweightLogs,
            dietAdherencePct: conditionData.dietAdherencePct,
          } satisfies ConditionContext) : false,
        } : undefined;
        events.push({
          id: `${wo.id}-${we.exerciseId}-${rule.atWeek}`,
          lane: 'entrenamiento',
          date,
          title: `${parts.join(' · ')}: ${exName}`,
          conditional,
          status: date < today ? 'hecho' : 'programado',
          icon: 'trending_up',
          moveRef: { workoutId: wo.id, exerciseId: we.exerciseId, atWeek: rule.atWeek, mesocycleId: mesocycle.id },
        });
      }
    }
  }
  return events;
}

// Marcador de semana de descarga en el carril "Entrenamiento" (Bloque H) —
// derivado de `Mesocycle.deloadWeek`, el campo que el coach marca a mano en el
// editor del mesociclo (no hay forma de inferirlo de los datos de
// entrenamiento en sí). Un mesociclo sin `deloadWeek` no genera marcador.
export function deriveDeloadEvents(mesocycles: Mesocycle[], today: string): PlanEvent[] {
  const events: PlanEvent[] = [];
  for (const m of mesocycles) {
    if (m.deloadWeek === undefined) continue;
    const date = addDays(m.startDate, (m.deloadWeek - 1) * 7);
    events.push({
      id: `deload-${m.id}`,
      lane: 'entrenamiento',
      date,
      title: `Descarga: Mes. ${m.number}`,
      status: date < today ? 'hecho' : 'programado',
      icon: 'trending_down',
    });
  }
  return events;
}

// Marcadores de cambio de kcal en el carril "Nutrición" (Bloque H) — derivados
// de comparar el `targetKcal` de cada fase con el de la anterior. Solo se
// anota cuando ambas fases tienen `targetKcal` explícito y distinto: si una
// fase no lo define (hereda del presupuesto de intercambios de la dieta
// enlazada), no hay número que comparar y no se genera marcador — no se
// inventa un salto que no está realmente configurado.
export function deriveKcalChangeEvents(program: NutritionProgram | null, today: string): PlanEvent[] {
  if (!program) return [];
  const events: PlanEvent[] = [];
  let cursor = program.startDate;
  let prevKcal: number | undefined;
  for (const ph of program.phases) {
    if (prevKcal !== undefined && ph.targetKcal !== undefined && ph.targetKcal !== prevKcal) {
      const delta = ph.targetKcal - prevKcal;
      events.push({
        id: `kcal-${ph.id}`,
        lane: 'nutricion',
        date: cursor,
        title: `${delta > 0 ? '+' : ''}${delta} kcal: ${ph.name}`,
        status: cursor < today ? 'hecho' : 'programado',
        icon: delta > 0 ? 'trending_up' : 'trending_down',
      });
    }
    if (ph.targetKcal !== undefined) prevKcal = ph.targetKcal;
    cursor = addDays(cursor, ph.weeks * 7);
  }
  return events;
}

export type WeekAdherence = 'sin-datos' | 'baja' | 'media' | 'alta' | 'futuro';

// Adherencia de entrenamiento de una semana (lunes de esa semana → weekStart) —
// % de assignments completados sobre el total programado esa semana. La tira
// semanal del cuadro de mando (Bloque H) la pinta como una celda de color, para
// leer el pasado de un vistazo sin abrir nada.
export function weekAdherence(assignments: WorkoutAssignment[], weekStart: string, weekEndExclusive: string, today: string): WeekAdherence {
  if (weekStart >= today) return 'futuro';
  const inWeek = assignments.filter(a => a.date >= weekStart && a.date < weekEndExclusive);
  if (inWeek.length === 0) return 'sin-datos';
  const done = inWeek.filter(a => a.status === 'completed').length;
  const pct = done / inWeek.length;
  if (pct >= 0.8) return 'alta';
  if (pct >= 0.5) return 'media';
  return 'baja';
}

export interface PlanConflict {
  weekStart: string;
  message: string;
}

// Avisos de conflicto del cuadro de mando (Bloque H) — las 4 reglas del brief.
export function detectConflicts(
  volumeEvents: PlanEvent[], reviewEvents: PlanEvent[], mesocycles: Mesocycle[], kcalEvents: PlanEvent[] = [],
  deloadEvents: PlanEvent[] = [],
): PlanConflict[] {
  const conflicts: PlanConflict[] = [];

  // Regla: dos subidas de volumen en semanas consecutivas.
  const volumeWeeks = [...new Set(volumeEvents.map(ev => getWeekStart(ev.date)))].sort();
  for (const wk of volumeWeeks) {
    if (volumeWeeks.includes(addDays(wk, 7))) {
      conflicts.push({ weekStart: addDays(wk, 7), message: 'Dos subidas de volumen en semanas seguidas — puede no dar tiempo a recuperar.' });
    }
  }

  // Regla: fin de mesociclo sin revisión programada (±7 días del final).
  for (const m of mesocycles) {
    const end = addDays(m.startDate, m.weeks * 7);
    const hasReview = reviewEvents.some(ev => Math.abs(daysBetween(ev.date, end)) <= 7);
    if (!hasReview) {
      conflicts.push({ weekStart: getWeekStart(end), message: `Fin del mesociclo #${m.number} sin revisión programada.` });
    }
  }

  // Regla: subida de volumen la misma semana que un recorte de kcal — el
  // atleta absorbe dos estímulos de estrés a la vez (más trabajo, menos
  // energía disponible para recuperarlo).
  const kcalCutWeeks = new Set(
    kcalEvents.filter(ev => ev.title.startsWith('-')).map(ev => getWeekStart(ev.date)),
  );
  for (const wk of volumeWeeks) {
    if (kcalCutWeeks.has(wk)) {
      conflicts.push({ weekStart: wk, message: 'Subida de volumen la misma semana que un recorte de kcal — el atleta entrena más con menos energía disponible.' });
    }
  }

  // Regla: revisión programada en semana de descarga — el dato de esa
  // revisión sale sesgado (menos volumen que una semana normal).
  for (const dl of deloadEvents) {
    const weekEnd = addDays(dl.date, 7);
    const hasReviewThatWeek = reviewEvents.some(ev => ev.date >= dl.date && ev.date < weekEnd);
    if (hasReviewThatWeek) {
      conflicts.push({ weekStart: getWeekStart(dl.date), message: 'Revisión programada en semana de descarga — el dato puede salir sesgado.' });
    }
  }

  return conflicts;
}

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}
