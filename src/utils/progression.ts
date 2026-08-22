import { WorkoutExercise, WeeklyProgressionRule } from '../types';
import { syncAggregateFromGroups } from './setGroups';
import { evaluateCondition, ConditionContext } from './conditions';

// Nº de semana (1-indexada) del mesociclo al que pertenece una fecha, dado el inicio del
// mesociclo. Semana 1 = los primeros 7 días desde `startDate` (inclusive), semana 2 los
// siguientes 7, etc. — no depende de lunes/domingo, solo de la distancia en días.
export function mesocycleWeekNumber(mesoStartDate: string, dateStr: string): number {
  const [sy, sm, sd] = mesoStartDate.split('-').map(Number);
  const [dy, dm, dd] = dateStr.split('-').map(Number);
  const start = Date.UTC(sy, sm - 1, sd);
  const date = Date.UTC(dy, dm - 1, dd);
  const daysSinceStart = Math.floor((date - start) / 86400000);
  return Math.max(1, Math.floor(daysSinceStart / 7) + 1);
}

// Contexto para evaluar condiciones (Bloque H2.2) — todo menos `exerciseId`,
// que se añade por dentro porque `resolveExerciseForWeek` ya lo tiene del
// propio `we` y así el caller no lo repite.
export type ProgressionConditionCtx = Omit<ConditionContext, 'exerciseId'>;

interface ResolvedRule { rule: WeeklyProgressionRule; halved: boolean }

// El escalón de progresión que aplica en `weekNumber`: el de mayor `atWeek` que sea
// <= weekNumber (las reglas son acumulativas — una vez que entra un escalón se
// mantiene hasta que uno posterior lo sustituye). `undefined` si la semana es anterior
// a la primera regla, o no hay reglas.
//
// `conditionCtx` (Bloque H2.2) — sin esto, una regla con condición nunca se
// considera activa (a lo seguro: no subir volumen sin poder comprobar que
// corresponde). Una regla cuya condición no se cumple:
//  - fallback 'mitad' → sigue activa, pero `resolveExerciseForWeek` aplicará
//    la mitad de `addSets` (ver más abajo).
//  - cualquier otro fallback ('mantener'/'posponer'/'avisar') → se descarta
//    y `activeRuleForWeek` cae a la regla anterior que sí aplique, exactamente
//    como si esta regla no existiera todavía esa semana.
function activeRuleForWeek(
  rules: WeeklyProgressionRule[] | undefined, weekNumber: number,
  exerciseId?: string, conditionCtx?: ProgressionConditionCtx,
): ResolvedRule | undefined {
  if (!rules || rules.length === 0) return undefined;
  const resolved: ResolvedRule[] = rules
    .filter(r => r.atWeek <= weekNumber)
    .map(r => {
      if (!r.condition) return { rule: r, halved: false };
      const met = !!(conditionCtx && exerciseId && evaluateCondition(r.condition, { ...conditionCtx, exerciseId }));
      if (met) return { rule: r, halved: false };
      if (r.condition.fallback === 'mitad') return { rule: r, halved: true };
      return null;
    })
    .filter((x): x is ResolvedRule => x !== null);
  return resolved.sort((a, b) => b.rule.atWeek - a.rule.atWeek)[0];
}

// Calcula el ejercicio "efectivo" para una semana concreta del mesociclo, aplicando el
// escalón de progresión que corresponda (si lo hay) sobre la prescripción base. Se llama
// en el momento de LEER/mostrar la sesión — nunca al generar, así que el `Workout` de
// base sigue siendo uno solo por día-tipo, reutilizado en todas las semanas.
//
// `addSets` se suma sobre el total base: al último bloque de `setGroups` si el ejercicio
// usa bloques, o sobre `we.sets` si es un rango uniforme. `addReps`/`setRir` sustituyen
// el valor a partir de esa semana, en el mismo sitio (último bloque o campo uniforme).
//
// `conditionCtx` es opcional (Bloque H2.2): sin él, el comportamiento es
// exactamente el de antes de este bloque — toda regla se aplica sin más desde
// su `atWeek`. Se pasa solo desde los sitios que ya tienen los datos del
// atleta a mano (sesión del propio atleta, cuadro de mando del coach).
export function resolveExerciseForWeek(we: WorkoutExercise, weekNumber: number, conditionCtx?: ProgressionConditionCtx): WorkoutExercise {
  const resolved = activeRuleForWeek(we.weeklyProgression, weekNumber, we.exerciseId, conditionCtx);
  if (!resolved) return we;
  const { rule, halved } = resolved;
  const addSets = halved ? Math.round((rule.addSets ?? 0) / 2) : (rule.addSets ?? 0);
  // A la mitad, reps/RIR no se tocan — "aplicar la mitad" se refiere al
  // volumen (series), no a redefinir a medias el rango de reps o el RIR.
  const addReps = halved ? undefined : rule.addReps;
  const setRir = halved ? undefined : rule.setRir;

  if (we.setGroups && we.setGroups.length > 0) {
    const lastIdx = we.setGroups.length - 1;
    const groups = we.setGroups.map((g, i) => i !== lastIdx ? g : {
      ...g,
      sets: Math.max(1, g.sets + addSets),
      reps: addReps ?? g.reps,
      rir: setRir ?? g.rir,
    });
    return syncAggregateFromGroups({ ...we, setGroups: groups });
  }

  return {
    ...we,
    sets: Math.max(1, we.sets + addSets),
    reps: addReps ?? we.reps,
    rir: setRir ?? we.rir,
  };
}
