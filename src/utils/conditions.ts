import { ConditionMetric, ConditionOperator, RuleCondition, WorkoutAssignment, WorkoutLog, BodyweightLog } from '../types';

// ─── Bloque H2.2 — periodización auto-regulada ─────────────────────────────
// Motor de evaluación de las condiciones que el coach construye en
// EventPlannerSheet ("+1 serie SOLO SI adherencia >= 85% Y RIR medio >= 2").
// Puro y sin efectos: recibe los datos ya cargados por el caller (no hace
// queries) y devuelve si la condición se cumple HOY — no hay estado
// persistido de "se aplicó / no se aplicó", se reevalúa en cada lectura con
// los datos más recientes. Ver la nota de alcance en `RuleCondition` (types.ts).

export interface ConditionContext {
  today: string; // YYYY-MM-DD — "hoy" para las ventanas de las últimas 2 semanas
  workoutAssignments: WorkoutAssignment[]; // del atleta, todas (se filtra aquí por ventana)
  workoutLogs: WorkoutLog[];               // del atleta, todos
  exerciseId: string;                      // acota el RIR medio al ejercicio de la regla
  dietAdherencePct?: number;               // ya calculado por el caller (weeklyDietAdherencePct u otro), 0-100
  bodyweightLogs: BodyweightLog[];
}

const WINDOW_DAYS = 14; // "las últimas 2 semanas" — ventana fija, no configurable por ahora

function daysAgo(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().split('T')[0];
}

// Métrica actual del atleta para una fila de condición — `undefined` si no
// hay datos suficientes en la ventana (p. ej. ningún entrenamiento asignado
// en las últimas 2 semanas). Sin dato, la condición de esa fila se trata
// como NO cumplida (fallar a lo seguro: no aplicar la subida sin evidencia).
export function getMetricValue(metric: ConditionMetric, ctx: ConditionContext): number | undefined {
  const windowStart = daysAgo(ctx.today, WINDOW_DAYS);

  if (metric === 'adherenciaEntreno') {
    const inWindow = ctx.workoutAssignments.filter(a => a.date >= windowStart && a.date <= ctx.today);
    if (inWindow.length === 0) return undefined;
    const done = inWindow.filter(a => a.status === 'completed').length;
    return (done / inWindow.length) * 100;
  }

  if (metric === 'rirMedio') {
    const relevantLogs = ctx.workoutLogs.filter(l => l.date >= windowStart && l.date <= ctx.today);
    const rirValues: number[] = [];
    for (const log of relevantLogs) {
      const entry = log.entries.find(e => e.exerciseId === ctx.exerciseId);
      if (!entry) continue;
      for (const set of entry.sets) {
        if (!set.alFallo) rirValues.push(set.rir);
      }
    }
    if (rirValues.length === 0) return undefined;
    return rirValues.reduce((s, v) => s + v, 0) / rirValues.length;
  }

  if (metric === 'adherenciaDieta') {
    return ctx.dietAdherencePct;
  }

  if (metric === 'peso') {
    const inWindow = ctx.bodyweightLogs.filter(l => l.date <= ctx.today).sort((a, b) => b.date.localeCompare(a.date));
    return inWindow[0]?.weight;
  }

  return undefined;
}

function compare(actual: number, operator: ConditionOperator, target: number): boolean {
  if (operator === '>=') return actual >= target;
  if (operator === '<=') return actual <= target;
  return actual === target;
}

// Todas las filas se encadenan con Y — el constructor de EventPlannerSheet no
// ofrece O, así que no hay ambigüedad que resolver aquí.
export function evaluateCondition(condition: RuleCondition, ctx: ConditionContext): boolean {
  if (condition.rows.length === 0) return true;
  return condition.rows.every(row => {
    const actual = getMetricValue(row.metric, ctx);
    if (actual === undefined) return false;
    return compare(actual, row.operator, row.value);
  });
}
