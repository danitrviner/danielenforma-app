import { WorkoutExercise, WeeklyProgressionRule } from '../types';
import { syncAggregateFromGroups } from './setGroups';
import { evaluateCondition, ConditionContext } from './conditions';

/**
 * Días que dura una vuelta completa del mesociclo.
 *
 * Sin `cycleDays` es la semana de siempre (o tantos días como sesiones, si son
 * más de 7). Con `cycleDays` el microciclo dura lo que diga: 5 días para
 * entrenar un grupo cada 5, 14 para las frecuencias de 1,5. Un único sitio
 * para esa cuenta:
 * la usan tanto el generador de sesiones como el resolutor de progresión, y si
 * se separaran, una sesión podría resolverse con el escalón de otra vuelta.
 */
export function diasDeCiclo(daysPerWeek: number, cycleDays?: number): number {
  if (cycleDays !== undefined && cycleDays > 0) return Math.max(cycleDays, daysPerWeek);
  return Math.max(7, daysPerWeek);
}

/**
 * Cuántas VUELTAS del microciclo caben en un mesociclo de `weeks` semanas.
 *
 * `Mesocycle.weeks` son semanas de calendario y siguen siéndolo: es lo que leen
 * la semana de descarga, la ventana del informe y el cierre del bloque. Lo que
 * cambia con un microciclo de 14 días es cuántas veces se repite el patrón
 * dentro de esas semanas — 8 semanas son 4 vueltas, no 8.
 */
export function vueltasDelCiclo(weeks: number, cicloDias: number): number {
  if (cicloDias <= 0) return Math.max(1, weeks);
  return Math.max(1, Math.round((weeks * 7) / cicloDias));
}

/**
 * En qué día del ciclo (0-based) cae cada sesión.
 *
 * El mecanismo es SIEMPRE el mismo, tenga el ciclo 5, 9 o 14 días: las
 * sesiones se reparten lo más iguales posible a lo largo de TODO el ciclo
 * declarado, sin anclarlas a semanas de 7 días. Es lo que hace que los días
 * de la semana vayan cambiando de una vuelta a otra en vez de caer siempre en
 * lunes/miércoles/viernes — y es justo ese desplazamiento el que produce
 * frecuencias como 1,5 o 1,56 por semana sin necesitar ningún caso especial:
 * un grupo que aparece 2 veces en un ciclo de 9 días cae 1,56 veces por
 * semana de media (2×7/9), y en una ventana de 7 días cualquiera a veces
 * caerá una vez, a veces dos, según por dónde ande el ciclo esa semana.
 *
 * Dos casos, por orden:
 *  1. El reparto elegido trae su propio patrón (`Push, Pull, Legs, Descanso`):
 *     manda él, porque el coach eligió exactamente dónde van los descansos y
 *     ya escribió la secuencia entera, con sus días sueltos incluidos.
 *  2. Sin patrón: se reparte uniforme a lo largo de `cicloDias`. Con
 *     `cicloDias` igual a las sesiones (o sin `repartirEnElCiclo`), esto da
 *     0,1,2…N-1 — el comportamiento de toda la vida para una semana normal.
 */
export function offsetsDeSesiones(params: {
  sesiones: number;
  cicloDias: number;
  offsetsDelSplit?: number[];
  repartirEnElCiclo?: boolean;
}): number[] {
  const { sesiones, cicloDias, offsetsDelSplit, repartirEnElCiclo } = params;
  if (sesiones <= 0) return [];
  if (offsetsDelSplit && offsetsDelSplit.length === sesiones) return offsetsDelSplit;

  if (repartirEnElCiclo && cicloDias > sesiones) {
    return Array.from({ length: sesiones }, (_, i) => Math.floor((i * cicloDias) / sesiones));
  }
  return Array.from({ length: sesiones }, (_, i) => i);
}

/**
 * Veces por semana que se entrena algo que aparece `veces` en un ciclo de
 * `cicloDias`. Dos decimales a propósito: 1,5 y 1,75 son cifras que un
 * entrenador dice tal cual y que significan programas distintos; redondearlas
 * a una sola las convertiría en la misma.
 */
export function frecuenciaPorSemana(veces: number, cicloDias: number): number {
  if (cicloDias <= 0) return 0;
  return Math.round((veces * 7 / cicloDias) * 100) / 100;
}

/** La frecuencia como la escribe un entrenador: «1,75», «1,5», «2». */
export function formateaFrecuencia(frecuencia: number): string {
  return frecuencia.toLocaleString('es-ES', { maximumFractionDigits: 2 });
}

// Nº de vuelta (1-indexada) del mesociclo al que pertenece una fecha, dado el inicio del
// mesociclo. Vuelta 1 = los primeros `cicloDias` días desde `startDate` (inclusive), la 2
// los siguientes, etc. — no depende de lunes/domingo, solo de la distancia en días.
// `cicloDias` por defecto 7 (una semana) para no cambiar el comportamiento de las llamadas
// que no conocen el mesociclo; ver `diasDeCiclo`.
export function mesocycleWeekNumber(mesoStartDate: string, dateStr: string, cicloDias = 7): number {
  const [sy, sm, sd] = mesoStartDate.split('-').map(Number);
  const [dy, dm, dd] = dateStr.split('-').map(Number);
  const start = Date.UTC(sy, sm - 1, sd);
  const date = Date.UTC(dy, dm - 1, dd);
  const daysSinceStart = Math.floor((date - start) / 86400000);
  return Math.max(1, Math.floor(daysSinceStart / Math.max(1, cicloDias)) + 1);
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
