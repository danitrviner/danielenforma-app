import { WorkoutExercise, WeeklyProgressionRule, CambiosDeSemana } from '../types.js';
import { syncAggregateFromGroups } from './setGroups.js';
import { evaluateCondition, ConditionContext } from './conditions.js';
import { REDUCCION_SEMANA_1_PCT } from './hipotesisDeBloque/cifras.js';

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
 * Dónde caen las sesiones dentro de una SEMANA (ciclo de 7 días).
 *
 * Antes esto no existía y la semana caía en el caso general: 4 sesiones daban
 * los días 0,1,2,3 — lunes, martes, miércoles y jueves seguidos, y luego tres
 * días libres del tirón. Nadie entrena así. El coach tenía que corregirlo a
 * mano en el calendario cada vez que creaba un bloque (Dani, 10-09-2026).
 *
 * Los patrones son los de siempre en una sala de pesas: los descansos van
 * INTERCALADOS y el domingo es el último día en usarse.
 *   2 → L, J          3 → L, X, V        4 → L, M, J, V
 *   5 → L, M, X, V, S 6 → L a S          7 → toda la semana
 *
 * Sigue siendo solo la propuesta de partida: el coach toca el calendario del
 * ciclo y su patrón a mano manda sobre esto (`Mesocycle.customOffsets`).
 */
const SEMANA_ESTANDAR: Record<number, number[]> = {
  2: [0, 3],
  3: [0, 2, 4],
  4: [0, 1, 3, 4],
  5: [0, 1, 2, 4, 5],
  6: [0, 1, 2, 3, 4, 5],
  7: [0, 1, 2, 3, 4, 5, 6],
};

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
 * Tres casos, por orden:
 *  1. El reparto elegido trae su propio patrón (`Push, Pull, Legs, Descanso`):
 *     manda él, porque el coach eligió exactamente dónde van los descansos y
 *     ya escribió la secuencia entera, con sus días sueltos incluidos.
 *  2. Ciclo semanal: el patrón de toda la vida en una sala de pesas, con los
 *     descansos INTERCALADOS y el domingo el último día en usarse.
 *  3. Cualquier otra duración: reparto uniforme a lo largo de `cicloDias`.
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

  const semanal = SEMANA_ESTANDAR[sesiones];
  if (cicloDias === 7 && semanal) return semanal;

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
    .filter(esEscalonClasico)
    .filter(r => r.atWeek <= weekNumber && (!r.soloEstaSemana || r.atWeek === weekNumber))
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
/** Un escalón de los de siempre (series/reps/RIR). Una regla que solo trae
 *  `cambios` no compite por ser «el último escalón». */
function esEscalonClasico(r: WeeklyProgressionRule): boolean {
  return r.addSets !== undefined || r.addReps !== undefined || r.setRir !== undefined;
}

/** Aplica los `cambios` de la barra de semanas, en orden, que tocan a
 *  `weekNumber`. Se acumulan: un cambio de la S3 sigue en la S7 salvo que
 *  otro posterior pise ese mismo campo. Dentro de una misma semana, el de
 *  «solo esta semana» va después, así que manda sobre el permanente. */
export function aplicarCambiosDeSemanas(we: WorkoutExercise, weekNumber: number): WorkoutExercise {
  const reglas = (we.weeklyProgression ?? [])
    .filter(r => r.cambios && r.atWeek <= weekNumber && (!r.soloEstaSemana || r.atWeek === weekNumber))
    .sort((a, b) => a.atWeek - b.atWeek || Number(!!a.soloEstaSemana) - Number(!!b.soloEstaSemana));
  if (reglas.length === 0) return we;
  const r: Record<string, unknown> = { ...we };
  for (const regla of reglas) {
    for (const [k, v] of Object.entries(regla.cambios as CambiosDeSemana)) {
      if (v === undefined) continue;
      if (v === null) delete r[k]; else r[k] = v;
    }
  }
  const out = r as unknown as WorkoutExercise;
  return out.setGroups && out.setGroups.length > 0 ? syncAggregateFromGroups(out) : out;
}

/** Semana de descarga: la mitad de series en cada bloque (redondeando hacia
 *  arriba, nunca menos de 1). Reps, RIR y descanso no se tocan. */
export function aplicarDescarga(we: WorkoutExercise): WorkoutExercise {
  const mitad = (n: number) => Math.max(1, Math.ceil(n / 2));
  if (we.setGroups && we.setGroups.length > 0) {
    return syncAggregateFromGroups({ ...we, setGroups: we.setGroups.map(g => ({ ...g, sets: mitad(g.sets) })) });
  }
  return { ...we, sets: mitad(we.sets) };
}

// ── Semana 1 reducida (17-11-2026) ───────────────────────────────────────────
// Empezar el bloque un poco por debajo de donde acabó el anterior: un 7 % menos
// de VOLUMEN, con las cargas y el RIR de siempre (en una descarga Dani quita
// series, nunca intensidad). Un 7 % de las 3 series de un ejercicio no es
// ninguna serie entera, así que la cuenta se hace por GRUPO muscular y sobre
// lo programado en la semana 1: 14 series de pecho → 13. Y como el recorte de
// un grupo cae en un ejercicio concreto, hace falta ver todas las rutinas del
// ciclo a la vez: `planDeSemana1Reducida` lo calcula con ellas delante (el
// editor del mesociclo) y lo deja en `Mesocycle.semana1Recorte`, que es lo
// único que necesita `resolverEjercicioDelMeso` —que resuelve ejercicio a
// ejercicio, sin ver a sus vecinos— para aplicarlo igual en todas las pantallas.

/** Series que pierde un grupo en la semana 1 reducida: el 7 % de las que tiene
 *  programadas, en series enteras. Un grupo con estrella pierde al menos una
 *  (con 6 series el 7 % redondea a ninguna), pero nunca se queda sin series. */
export function seriesQueSeQuitanEnSemana1(seriesDelGrupo: number, conEstrella: boolean): number {
  if (!(seriesDelGrupo > 0)) return 0;
  const quitar = seriesDelGrupo - Math.round(seriesDelGrupo * (1 - REDUCCION_SEMANA_1_PCT / 100));
  return Math.min(seriesDelGrupo - 1, Math.max(quitar, conEstrella ? 1 : 0));
}

/**
 * El recorte de la semana 1 reducida: cuántas series pierde cada ejercicio
 * (clave = `exerciseId`) en CADA sesión de la semana 1 en la que aparece.
 *
 * `rutinas` son las sesiones del ciclo tal y como quedan en la semana 1 sin el
 * recorte (cambios por semana y escalones ya aplicados). Por grupo:
 *
 *  · se quita el 7 % de sus series, en enteras (`seriesQueSeQuitanEnSemana1`);
 *  · sale del ejercicio con más series, y a igualdad del último de la semana:
 *    lo accesorio antes que lo principal;
 *  · ningún ejercicio baja de 1 serie;
 *  · un ejercicio que se repite en varias sesiones pierde la serie en todas
 *    (la clave es el ejercicio, no la sesión): solo se elige si esas series
 *    caben en lo que toca quitar. Si ninguno cabe, un grupo con estrella
 *    recorta el que menos se repite —pierde algo más del 7 %, que sigue dentro
 *    del «5-10 %» acordado en casi todos los repartos— y el resto no recorta.
 */
export function planDeSemana1Reducida(
  rutinas: readonly { exercises: readonly Pick<WorkoutExercise, 'exerciseId' | 'muscleGroup' | 'sets'>[] }[],
  groups: Partial<Record<string, { priority?: string }>> | undefined,
): Record<string, number> {
  interface Candidato { id: string; veces: number; minimo: number; total: number; ultima: number }
  const porGrupo = new Map<string, { series: number; ejercicios: Map<string, Candidato> }>();
  let posicion = 0;
  for (const rutina of rutinas) {
    for (const e of rutina.exercises) {
      posicion++;
      if (!e.muscleGroup || !(e.sets > 0)) continue;
      const g = porGrupo.get(e.muscleGroup) ?? { series: 0, ejercicios: new Map<string, Candidato>() };
      porGrupo.set(e.muscleGroup, g);
      g.series += e.sets;
      const c = g.ejercicios.get(e.exerciseId) ?? { id: e.exerciseId, veces: 0, minimo: Infinity, total: 0, ultima: 0 };
      g.ejercicios.set(e.exerciseId, { ...c, veces: c.veces + 1, minimo: Math.min(c.minimo, e.sets), total: c.total + e.sets, ultima: posicion });
    }
  }

  const plan: Record<string, number> = {};
  for (const [grupo, g] of porGrupo) {
    const conEstrella = groups?.[grupo]?.priority === 'alta';
    let quedan = seriesQueSeQuitanEnSemana1(g.series, conEstrella);
    if (quedan <= 0) continue;
    const candidatos = [...g.ejercicios.values()];
    // Lo que le queda por dar a un ejercicio en cada sesión sin bajar de 1 serie.
    const margen = (c: Candidato) => c.minimo - 1 - (plan[c.id] ?? 0);
    const elegir = (lista: Candidato[]) => lista.sort((a, b) =>
      (b.minimo - (plan[b.id] ?? 0)) - (a.minimo - (plan[a.id] ?? 0)) || b.ultima - a.ultima)[0];
    let quitadas = 0;
    while (quedan > 0) {
      const c = elegir(candidatos.filter(x => margen(x) > 0 && x.veces <= quedan));
      if (!c) break;
      plan[c.id] = (plan[c.id] ?? 0) + 1;
      quedan -= c.veces;
      quitadas += c.veces;
    }
    if (quitadas === 0 && conEstrella) {
      const c = candidatos.filter(x => margen(x) > 0).sort((a, b) => a.veces - b.veces || b.minimo - a.minimo || b.ultima - a.ultima)[0];
      if (c) plan[c.id] = 1;
    }
  }
  return plan;
}

/** Semana 1 reducida de UN ejercicio: le quita `quitar` series (del último
 *  bloque hacia atrás), nunca por debajo de 1. Reps, RIR, carga y descanso no
 *  se tocan. */
export function aplicarSemana1Reducida(we: WorkoutExercise, quitar: number): WorkoutExercise {
  let pendientes = Math.max(0, Math.floor(quitar));
  if (pendientes === 0) return we;
  if (we.setGroups && we.setGroups.length > 0) {
    const total = we.setGroups.reduce((s, g) => s + g.sets, 0);
    pendientes = Math.min(pendientes, total - 1);
    if (pendientes <= 0) return we;
    const bloques = we.setGroups.map(g => ({ ...g }));
    for (let i = bloques.length - 1; i >= 0 && pendientes > 0; i--) {
      const fuera = Math.min(bloques[i].sets, pendientes);
      bloques[i].sets -= fuera;
      pendientes -= fuera;
    }
    return syncAggregateFromGroups({ ...we, setGroups: bloques.filter(g => g.sets > 0) });
  }
  const sets = Math.max(1, we.sets - pendientes);
  return sets === we.sets ? we : { ...we, sets };
}

function conRirMinimo(we: WorkoutExercise, minimo: number): WorkoutExercise {
  const sube = (rir: number | undefined) => (rir == null ? rir : Math.max(rir, minimo));
  if (we.setGroups && we.setGroups.length > 0) {
    return syncAggregateFromGroups({ ...we, setGroups: we.setGroups.map(g => ({ ...g, rir: sube(g.rir) as number })) });
  }
  return { ...we, rir: sube(we.rir) as number };
}

/** Lo que el atleta hace de verdad en la semana de ciclo `semana` de este
 *  mesociclo: cambios por semana + escalones + descarga. Es la función a usar
 *  en cualquier sitio que pinte o cuente una sesión de un mesociclo. */
export function resolverEjercicioDelMeso(
  we: WorkoutExercise,
  meso: {
    semanasDescarga?: number[]; semanasTest?: number[]; semanasPivot?: number[];
    groups?: Partial<Record<string, { priority?: string }>>;
    vuelveDeParon?: boolean;
    semana1Reducida?: boolean; semana1Recorte?: Partial<Record<string, number>>;
  } | undefined,
  semana: number,
  conditionCtx?: ProgressionConditionCtx,
): WorkoutExercise {
  let r = resolveExerciseForWeek(we, semana, conditionCtx);
  if (meso?.semanasDescarga?.includes(semana)) r = aplicarDescarga(r);
  // Semana pivot (guía del IH): descarga CON objetivos. Baja la fatiga (mitad
  // de series) en todo menos los grupos de prioridad alta, que mantienen su
  // estímulo. Si la semana ya es de descarga, manda la descarga.
  else if (meso?.semanasPivot?.includes(semana) && !(r.muscleGroup && meso.groups?.[r.muscleGroup]?.priority === 'alta')) {
    r = aplicarDescarga(r);
  }
  // Semana 1 reducida: un 7 % menos de volumen, ya repartido por ejercicio en
  // `semana1Recorte` (ver `planDeSemana1Reducida`). Si la semana 1 es además
  // de descarga o puente, mandan ellas: no se recorta dos veces.
  else if (meso?.semana1Reducida && semana === 1) {
    r = aplicarSemana1Reducida(r, meso.semana1Recorte?.[r.exerciseId] ?? 0);
  }
  // Vuelve de un parón (guía del IH): la primera semana a RPE 6-7, o sea,
  // con al menos 3 repeticiones en reserva. Solo sube el RIR, nunca lo baja.
  if (meso?.vuelveDeParon && semana === 1) r = conRirMinimo(r, 3);
  // Semana de test: lo que no tenga ya una técnica va a AMRAP.
  if (meso?.semanasTest?.includes(semana) && !r.technique) r = { ...r, technique: 'amrap' };
  return r;
}

export function resolveExerciseForWeek(weBase: WorkoutExercise, weekNumber: number, conditionCtx?: ProgressionConditionCtx): WorkoutExercise {
  const we = aplicarCambiosDeSemanas(weBase, weekNumber);
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
