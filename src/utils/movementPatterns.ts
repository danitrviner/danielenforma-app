import { WorkoutLog, Exercise, Mesocycle, MuscleGroup } from '../types.js';
import { aggregate, weightedGroupsOf, resolveWindows, ComparisonMode, Agg } from './trainingReport.js';
import { ultimaReferenciaPorEjercicio } from './referenciaDeEjercicio.js';

// Bloque "Rendimiento" del protocolo de mediciones de Dani: variación de 1RM
// estimado y tonelaje agrupada por PATRÓN DE MOVIMIENTO (empuje torso,
// tracción, brazo, empuje pierna, empuje cadera) en vez de por grupo
// muscular — la app solo tenía lo segundo (MuscleGroup, trainingReport.ts).
//
// F17 (17-11-2026): el patrón lo decide el EJERCICIO, no su grupo muscular.
// Por grupo, el curl de bíceps contaba en «Tracciones» y la elevación lateral
// y la extensión de tríceps en «Empujes torso»; el método compara por cinco
// patrones y ahí «Brazo» va aparte. Ver `patronPropioDeEjercicio`. Lo que el
// nombre y el grupo no dejan claro sigue cayendo en el reparto por grupo de
// siempre (`patronesDeGrupo`), secundarios incluidos.

export type MovementPattern =
  | 'empuje_torso' | 'traccion' | 'brazo' | 'empuje_pierna' | 'empuje_cadera';

export const PATTERN_LABELS: Record<MovementPattern, string> = {
  empuje_torso:  'Empujes torso',
  traccion:      'Tracciones',
  brazo:         'Brazo',
  empuje_pierna: 'Empujes pierna',
  empuje_cadera: 'Empujes cadera',
};

const ALL_PATTERNS: MovementPattern[] = ['empuje_torso', 'traccion', 'brazo', 'empuje_pierna', 'empuje_cadera'];

// Un grupo muscular puede caer en más de un patrón (el tríceps empuja Y es
// brazo) — cuenta entero en cada uno, no se reparte el peso entre patrones.
// core, gemelo, lumbares y rotadores quedan sin patrón: el protocolo de Dani
// solo trackea estos 5.
// Desde F17 esto es solo el RESPALDO: lo usa un ejercicio cuando no se puede
// decidir por él mismo (sin grupo, o con un nombre que no dice qué es).
const MUSCLE_TO_PATTERNS: Partial<Record<MuscleGroup, MovementPattern[]>> = {
  pecho:         ['empuje_torso'],
  deltoide_ant:  ['empuje_torso'],
  deltoide_lat:  ['empuje_torso'],
  triceps:       ['empuje_torso', 'brazo'],
  dorsal:        ['traccion'],
  trapecio:      ['traccion'],
  deltoide_post: ['traccion'],
  biceps:        ['traccion', 'brazo'],
  antebrazo:     ['brazo'],
  cuadriceps:    ['empuje_pierna'],
  gluteo:        ['empuje_cadera'],
  isquios:       ['empuje_cadera'],
  aductores:     ['empuje_cadera'],
};

/** Patrones en los que cae un grupo muscular — lista vacía si el grupo no entra en ninguno (core, gemelo, lumbares, rotadores). */
export function patronesDeGrupo(g: MuscleGroup): MovementPattern[] {
  return MUSCLE_TO_PATTERNS[g] ?? [];
}

function mapToPatterns(g: MuscleGroup): MovementPattern[] {
  return patronesDeGrupo(g);
}

// ── Patrón por ejercicio (F17) ───────────────────────────────────────────────

/** Lo que se mira de un ejercicio para decidir su patrón. El catálogo no dice
 *  si es multiarticular o de aislamiento: sale del nombre y del grupo principal. */
export type DatosDePatron = Pick<Exercise, 'name' | 'muscleGroup'> & Partial<Pick<Exercise, 'secondaryMuscleGroups' | 'type'>>;

const BRAZO: MuscleGroup[] = ['biceps', 'triceps', 'antebrazo'];
const DELTOIDES: MuscleGroup[] = ['deltoide_ant', 'deltoide_lat', 'deltoide_post'];

/** Minúsculas, sin tildes y sin signos: «Pull-up» y «Jalón» se leen «pull up» y «jalon». */
const normalizar = (t: string) =>
  t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// Cada familia de nombres solo vale si el grupo principal es coherente con
// ella: «Press Pallof» lleva «press» y es de core, y un «jalón de tríceps» no
// es una tracción. Sin esa segunda comprobación el nombre solo no es fiable.
const NOMBRES: Array<{ patron: MovementPattern; re: RegExp; grupos: MuscleGroup[] }> = [
  // Peso muerto, hip thrust, curl femoral e hiperextensiones: empujes de cadera.
  {
    patron: 'empuje_cadera',
    re: /\b(peso muerto|deadlifts?|rdl|hip thrusts?|puente de gluteos?|glute bridge|curl (de )?(femoral(es)?|isquio\w*|piernas?)|curl nordico|leg curls?|femoral (tumbado|sentado|de pie)|hiperextension(es)?|hyperextensions?|extension(es)? (lumbar(es)?|de espalda|de tronco)|buenos dias|good mornings?|pull through)\b/,
    grupos: ['gluteo', 'isquios', 'lumbares', 'aductores', 'cuadriceps', 'dorsal', 'trapecio'],
  },
  // Sentadilla, prensa y extensiones: empujes de pierna.
  {
    patron: 'empuje_pierna',
    re: /\b(sentadillas?|squats?|prensa|leg press|press de piernas?|hack|extension(es)? de (cuadriceps|rodillas?|piernas?)|leg extensions?)\b/,
    grupos: ['cuadriceps', 'gluteo', 'aductores', 'isquios'],
  },
  { patron: 'empuje_pierna', re: /\bextension(es)?\b/, grupos: ['cuadriceps'] },
  // Remos, jalones y dominadas: tracciones.
  {
    patron: 'traccion',
    re: /\b(remos?|rows?|jalon(es)?|pull ?downs?|dominadas?|pull ?ups?|chin ?ups?|face ?pulls?)\b/,
    grupos: ['dorsal', 'trapecio', 'deltoide_post', 'deltoide_lat', 'biceps'],
  },
  // Press y fondos: empujes de torso.
  {
    patron: 'empuje_torso',
    re: /\b(press|fondos?|dips?|flexiones|push ?ups?|lagartijas?)\b/,
    grupos: ['pecho', 'deltoide_ant', 'deltoide_lat', 'triceps'],
  },
];

// Aislamientos de brazo cuyo nombre lleva una palabra de multiarticular: el
// «press francés» es una extensión de codo y el «jalón de tríceps», también.
const AISLAMIENTO_DE_BRAZO = /\b(curl|extension(es)?|patadas?|kick ?backs?|frances|rompecraneos|skull\w*|push ?downs?|press ?down|press de triceps)\b/;
// Elevaciones (laterales, frontales) y aperturas o pájaros de deltoides.
const AISLAMIENTO_DE_DELTOIDES = /\b(elevacion(es)?|raises?|aperturas?|pajaros?|vuelos?|fly|flyes|flys|laterales?|frontales?|abduccion(es)?|cruces?|reverse|invertid[oa]s?)\b/;

/**
 * El patrón que decide el propio ejercicio, o `null` si no hay dato fiable
 * (entonces manda el reparto por grupo, como antes de F17).
 *
 *  - press y fondos → empujes de torso; remos, jalones y dominadas → tracciones;
 *    sentadilla, prensa y extensiones → empujes de pierna; peso muerto, hip
 *    thrust, curl femoral e hiperextensiones → empujes de cadera;
 *  - lo que tiene de grupo principal bíceps, tríceps o antebrazo y no es uno de
 *    esos multiarticulares (press cerrado, fondos, dominada supina) es un
 *    aislamiento → «Brazo», y solo «Brazo»;
 *  - las elevaciones y aperturas de deltoides TAMBIÉN van a «Brazo». De los
 *    cinco patrones es donde encajan: son monoarticulares de la extremidad
 *    superior, con cargas del orden de un curl y sin empuje ni tracción del
 *    tronco. En «Empujes torso» bajaban la media de 1RM de los press (10 kg
 *    de elevación lateral promediados con 80 de banca) y dejarlas fuera de los
 *    cinco las haría desaparecer de la comparación. Las aperturas de PECHO se
 *    quedan en empujes de torso, por grupo: no son de deltoides.
 *
 * Un ejercicio con patrón propio cuenta ENTERO en ese patrón y en ninguno más:
 * el press de banca ya no suma medio press a «Brazo» por su tríceps secundario.
 */
export function patronPropioDeEjercicio(ex: DatosDePatron | undefined | null): MovementPattern | null {
  const g = ex?.muscleGroup;
  // Sin grupo no hay con qué contrastar el nombre; y el remo de cardio no es una tracción.
  if (!ex || !g || (ex.type && ex.type !== 'fuerza')) return null;
  const n = normalizar(ex.name ?? '');
  if (!n) return null;
  // El catálogo CDG lo dice en el propio nombre («… (dominante cadera)»).
  if (/\bdominante (de )?cadera\b/.test(n)) return 'empuje_cadera';
  if (/\bdominante (de )?rodilla\b/.test(n)) return 'empuje_pierna';
  const esDeBrazo = BRAZO.includes(g);
  if (esDeBrazo && AISLAMIENTO_DE_BRAZO.test(n)) return 'brazo';
  for (const f of NOMBRES) if (f.grupos.includes(g) && f.re.test(n)) return f.patron;
  if (esDeBrazo) return 'brazo';
  if (DELTOIDES.includes(g) && AISLAMIENTO_DE_DELTOIDES.test(n)) return 'brazo';
  return null;
}

/**
 * Patrones de un ejercicio, para las listas «ejercicios de cada patrón»: el
 * suyo si lo tiene; si no, los de su grupo principal. Es el sustituto de
 * `patronesDeGrupo(ex.muscleGroup)` allí donde se tiene el ejercicio delante.
 */
export function patronesDeEjercicio(ex: DatosDePatron | undefined | null): MovementPattern[] {
  const propio = patronPropioDeEjercicio(ex);
  if (propio) return [propio];
  return ex?.muscleGroup ? patronesDeGrupo(ex.muscleGroup) : [];
}

/**
 * Lo mismo con su peso, para sumar tonelaje y series: patrón propio = 1; sin
 * él, el reparto por grupo de `weightedGroupsOf` (principal 1, secundarios 0,5).
 */
export function patronesPonderados(
  exerciseId: string, exercises: Exercise[],
): { group: MovementPattern | 'none'; weight: number }[] {
  const propio = patronPropioDeEjercicio(exercises.find(e => e.id === exerciseId));
  if (propio) return [{ group: propio, weight: 1 }];
  return weightedGroupsOf(exerciseId, exercises, mapToPatterns);
}

function round1(n: number): number { return Math.round(n * 10) / 10; }
function deltaPct(cur: number, prev: number | null): number | null {
  if (prev == null || prev === 0) return null;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}

interface PatternBucket { tonnage: number; sets: number; orms: number[] }

function patternAgg(agg: Agg, exercises: Exercise[]): Map<MovementPattern, PatternBucket> {
  const byPattern = new Map<MovementPattern, PatternBucket>();
  for (const [exerciseId, row] of agg.perExercise) {
    for (const { group, weight } of patronesPonderados(exerciseId, exercises)) {
      if (group === 'none') continue; // ejercicio sin patrón asignado (o sin grupo muscular)
      let bucket = byPattern.get(group);
      if (!bucket) { bucket = { tonnage: 0, sets: 0, orms: [] }; byPattern.set(group, bucket); }
      bucket.tonnage = round1(bucket.tonnage + row.tonnage * weight);
      bucket.sets = round1(bucket.sets + row.sets * weight);
      // El 1RM estimado, igual que en trainingReport, solo cuenta para el patrón principal del ejercicio.
      if (weight === 1 && row.bestOrm > 0) bucket.orms.push(row.bestOrm);
    }
  }
  return byPattern;
}

// Misma forma que MuscleGroupPerf (trainingReport.ts) para que
// MesocycleReviewPanel pueda reutilizar la misma tabla de UI sin acoplarse al
// tipo — solo cambia `group` de MuscleGroup a MovementPattern.
export interface PatternPerf {
  group: MovementPattern;
  label: string;
  tonnage: number;
  tonnageDeltaPct: number | null;
  sets: number;
  setsDeltaPct: number | null;
  meanOrm: number | null;
  ormDeltaPct: number | null;
}

export interface MovementPatternReport {
  comparisonLabel: string;
  patterns: PatternPerf[];
}

export function buildMovementPatternReport(params: {
  logs: WorkoutLog[];
  exercises: Exercise[];
  mesocycles: Mesocycle[];
  periodStart: string;
  periodEnd: string;
  comparison: ComparisonMode;
}): MovementPatternReport {
  const { logs, exercises, mesocycles, periodStart, periodEnd, comparison } = params;
  const w = resolveWindows(periodStart, periodEnd, comparison, mesocycles);

  const inRange = (date: string, start: string, end: string) => date >= start && date <= end;
  const curLogs = logs.filter(l => inRange(l.date, w.curStart, w.curEnd));
  const prevLogs = w.prevStart && w.prevEnd ? logs.filter(l => inRange(l.date, w.prevStart!, w.prevEnd!)) : [];

  // D3: el 1RM de antes de una referencia nueva no cuenta (ver referenciaDeEjercicio.ts).
  const refs = ultimaReferenciaPorEjercicio(logs);
  const curP = patternAgg(aggregate(curLogs, undefined, refs), exercises);
  const prevP = patternAgg(aggregate(prevLogs, undefined, refs), exercises);
  const meanOf = (arr: number[]) => arr.length ? round1(arr.reduce((s, v) => s + v, 0) / arr.length) : null;

  const ordered = [...ALL_PATTERNS].sort((a, b) => (curP.get(b)?.tonnage ?? 0) - (curP.get(a)?.tonnage ?? 0));

  const patterns: PatternPerf[] = ordered.map(pattern => {
    const c = curP.get(pattern) ?? { tonnage: 0, sets: 0, orms: [] };
    const p = prevP.get(pattern) ?? null;
    const meanOrm = meanOf(c.orms);
    const prevMeanOrm = p ? meanOf(p.orms) : null;
    return {
      group: pattern,
      label: PATTERN_LABELS[pattern],
      tonnage: c.tonnage,
      tonnageDeltaPct: p ? deltaPct(c.tonnage, p.tonnage) : null,
      sets: c.sets,
      setsDeltaPct: p ? deltaPct(c.sets, p.sets) : null,
      meanOrm,
      ormDeltaPct: meanOrm != null && prevMeanOrm != null ? deltaPct(meanOrm, prevMeanOrm) : null,
    };
  });

  return { comparisonLabel: w.comparisonLabel, patterns };
}
