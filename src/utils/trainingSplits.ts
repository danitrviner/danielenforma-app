import { MuscleGroup, MuscleGroupConfig } from '../types';
import { frecuenciaPorSemana, offsetsDeSesiones } from './progression';

// Catálogo de repartos de entrenamiento estándar (torso/pierna, push/pull,
// full body...) — Dani los definió como la forma "correcta" de repartir los
// días según cuántos entrena el atleta a la semana. El número de días de
// cada reparto es simplemente la longitud de `dayTypes`, así que un reparto
// siempre encaja exacto con `daysPerWeek` sin tener que declararlo aparte.
/** Día del ciclo sin entrenamiento. No es un tipo de día como los demás: no tiene grupos. */
export const DESCANSO = 'Descanso';

export interface TrainingSplit {
  id: string;
  label: string;       // texto corto para el selector, p.ej. "Torso - Pierna - Full body"
  /**
   * Una entrada por DÍA DEL CICLO —no por sesión—, en orden, usando `DESCANSO`
   * para los días libres. Que el descanso sea explícito es lo que permite
   * ciclos que no duran 7 días: un "Push, Pull, Legs, Descanso" es un ciclo de
   * 4 días con 3 sesiones, y eso da una frecuencia de 1,75 por grupo y semana,
   * que dentro de una semana no se puede expresar.
   */
  dayTypes: string[];
}

/** Reparto semanal clásico: los días que sobran hasta 7 son de descanso. */
function semanal(id: string, label: string, tipos: string[]): TrainingSplit {
  return { id, label, dayTypes: [...tipos, ...Array(Math.max(0, 7 - tipos.length)).fill(DESCANSO)] };
}

/** Reparto rotativo: el ciclo dura lo que diga `dayTypes`, descansos incluidos. */
function rotativo(id: string, label: string, dayTypes: string[]): TrainingSplit {
  return { id, label, dayTypes };
}

/**
 * Reparto rotativo con las sesiones repartidas UNIFORMES a lo largo de todo
 * el ciclo, en vez de escritas casilla a casilla como `rotativo()`.
 *
 * `tipos` es la secuencia de sesiones en el orden en que se repiten (p. ej.
 * `['Torso', 'Pierna', 'Torso', 'Pierna', 'Torso', 'Pierna']`); esta función
 * decide en qué día de los `cicloDias` cae cada una, usando el mismo reparto
 * que el calendario del ciclo calcula solo (`offsetsDeSesiones`), y rellena
 * el resto con `DESCANSO`. Así el patrón real es siempre "Torso, Pierna,
 * Descanso, Torso, Pierna, Descanso…" —con los descansos INTERCALADOS, nunca
 * los seis días de trabajo seguidos y luego una semana entera libre— que es
 * justo lo que hace que los días de la semana vayan cambiando de vuelta en
 * vuelta en lugar de quedarse fijos.
 */
function rotativoUniforme(id: string, label: string, tipos: string[], cicloDias: number): TrainingSplit {
  const offsets = offsetsDeSesiones({ sesiones: tipos.length, cicloDias, repartirEnElCiclo: true });
  const dayTypes = Array<string>(cicloDias).fill(DESCANSO);
  offsets.forEach((dia, i) => { dayTypes[dia] = tipos[i]; });
  return { id, label, dayTypes };
}

export const TRAINING_SPLITS: TrainingSplit[] = [
  // ── Semanales (el ciclo dura 7 días) ───────────────────────────────────────
  // 2 días — full body es el estándar para principiantes/poco tiempo (ACSM);
  // torso-pierna como alternativa si prefiere no repetir el mismo día dos veces.
  semanal('2-full',                'Full body',                         ['Full body', 'Full body']),
  semanal('2-torso-pierna',        'Torso - Pierna',                    ['Torso', 'Pierna']),

  // 3 días
  semanal('3-torso-pierna-full',   'Torso - Pierna - Full body',        ['Torso', 'Pierna', 'Full body']),
  semanal('3-full',                'Full body',                         ['Full body', 'Full body', 'Full body']),
  semanal('3-push-pull-full',      'Push - Pull - Full body',           ['Push', 'Pull', 'Full body']),
  semanal('3-push-pull-legs',      'Push - Pull - Legs',                ['Push', 'Pull', 'Legs']),

  // 4 días
  semanal('4-torso-pierna-x2',     'Torso - Pierna - Torso - Pierna',   ['Torso', 'Pierna', 'Torso', 'Pierna']),
  semanal('4-push-pull-x2',        'Push - Pull - Push - Pull',         ['Push', 'Pull', 'Push', 'Pull']),
  semanal('4-push-pull-legs-torso','Push - Pull - Legs - Torso',        ['Push', 'Pull', 'Legs', 'Torso']),
  semanal('4-torso-pierna-brazo-full', 'Torso - Pierna - Brazo/Hombro - Full body', ['Torso', 'Pierna', 'Brazo/Hombro', 'Full body']),
  semanal('4-push-pull-legs-full', 'Push - Pull - Legs - Full body',    ['Push', 'Pull', 'Legs', 'Full body']),

  // 5 días
  semanal('5-torso-pierna-x2-brazo', 'Torso - Pierna - Torso - Pierna - Brazo/Hombro', ['Torso', 'Pierna', 'Torso', 'Pierna', 'Brazo/Hombro']),
  semanal('5-push-pull-leg-brazo-full', 'Push - Pull - Leg - Brazo - Full body', ['Push', 'Pull', 'Leg', 'Brazo', 'Full body']),
  semanal('5-empujes-tirones-pierna-hombro', 'Empujes torso - Tirones torso - Pierna/Hombro - Torso - Pierna/Hombro', ['Empujes torso', 'Tirones torso', 'Pierna/Hombro', 'Torso', 'Pierna/Hombro']),
  semanal('5-push-pull-cuad-torso-gluteo', 'Push - Pull - Cuádriceps - Torso - Glúteo/Isquios', ['Push', 'Pull', 'Cuádriceps', 'Torso', 'Glúteo/Isquios']),

  // 6 días
  semanal('6-torso-pierna-brazo-x2', 'Torso - Pierna - Brazo/Hombro x2', ['Torso', 'Pierna', 'Brazo/Hombro', 'Torso', 'Pierna', 'Brazo/Hombro']),
  semanal('6-empujes-tiron-pierna-hombro-x2', 'Empujes torso - Tirón torso - Pierna/Hombro x2', ['Empujes torso', 'Tirón torso', 'Pierna/Hombro', 'Empujes torso', 'Tirón torso', 'Pierna/Hombro']),
  // PPL x2 — el reparto de 6 días más usado en programación de hipertrofia
  // (Push/Pull/Legs repetido), 2x/semana por grupo con recuperación entre medias.
  semanal('6-ppl-x2', 'Push - Pull - Legs x2', ['Push', 'Pull', 'Legs', 'Push', 'Pull', 'Legs']),

  // 7 días
  semanal('7-ppl-x2-full', 'Push - Pull - Legs x2 + Full body', ['Push', 'Pull', 'Legs', 'Push', 'Pull', 'Legs', 'Full body']),

  // ── Rotativos (el ciclo NO dura 7 días) ────────────────────────────────────
  // Aquí está la razón de ser de los ciclos largos: las frecuencias que no caen
  // en un número entero de veces por semana. Entrenar un grupo cada 5 días son
  // 1,4 veces por semana; cada 4 días, 1,75. La frecuencia de 1,5 —tres sesiones
  // por grupo cada dos semanas— es literalmente imposible dentro de un ciclo de
  // 7 días, y es el motivo por el que un microciclo puede durar 3, 5, 9 o 14.
  //
  // A cambio, los días de entrenamiento se mueven por el calendario: no se
  // entrena "los lunes", se entrena "el día 1 del ciclo". Es la pega conocida de
  // los rotativos y hay que contársela al atleta.
  // ── Rotativos: el mecanismo general de las frecuencias «y media» ─────────
  // Un único mecanismo para todo, sin casos especiales: el ciclo dura los
  // días que haga falta (no tiene que ser múltiplo de 7) y las sesiones se
  // reparten uniformes a lo largo — así que los días de la semana van
  // cambiando de una vuelta a otra, no se quedan fijos en "lunes y jueves".
  // Eso es justo lo que produce frecuencias como 1,5 o 1,75: un grupo que
  // aparece 2 veces en un ciclo de 9 días cae de media 1,56 veces por semana,
  // y en una ventana de 7 días concreta a veces le toca una vez, a veces dos.
  rotativo('rot-3-torso-pierna',   'Torso - Pierna (rotativo 3 d)',     ['Torso', 'Pierna', DESCANSO]),
  rotativo('rot-4-ppl',            'Push - Pull - Legs (rotativo 4 d)', ['Push', 'Pull', 'Legs', DESCANSO]),
  rotativo('rot-5-ppl',            'Push - Pull - Legs (rotativo 5 d)', ['Push', 'Pull', DESCANSO, 'Legs', DESCANSO]),
  rotativo('rot-5-torso-pierna',   'Torso - Pierna (rotativo 5 d)',     ['Torso', 'Pierna', DESCANSO, DESCANSO, DESCANSO]),
  rotativo('rot-8-ppl-x2',         'Push - Pull - Legs x2 (rotativo 8 d)',  ['Push', 'Pull', 'Legs', DESCANSO, 'Push', 'Pull', 'Legs', DESCANSO]),
  rotativo('rot-9-ppl-x2',         'Push - Pull - Legs x2 (rotativo 9 d)',  ['Push', 'Pull', 'Legs', DESCANSO, 'Push', 'Pull', 'Legs', DESCANSO, DESCANSO]),
  rotativo('rot-10-torso-pierna-x3', 'Torso - Pierna x3 (rotativo 10 d)', ['Torso', 'Pierna', DESCANSO, 'Torso', 'Pierna', DESCANSO, 'Torso', 'Pierna', DESCANSO, DESCANSO]),
  rotativo('rot-14-ppl-x3',        'Push - Pull - Legs x3 (rotativo 14 d)', ['Push', 'Pull', 'Legs', DESCANSO, 'Push', 'Pull', 'Legs', DESCANSO, 'Push', 'Pull', 'Legs', DESCANSO, DESCANSO, DESCANSO]),

  // El ejemplo exacto de Dani: Torso, Pierna, Full body, Descanso, Brazo,
  // Torso, Descanso, Pierna, Descanso — un ciclo de 9 días con 6 sesiones,
  // ninguna anclada a un día de la semana fijo.
  rotativo('rot-9-torso-pierna-full-brazo', 'Torso - Pierna - Full - Brazo (rotativo 9 d)',
    ['Torso', 'Pierna', 'Full body', DESCANSO, 'Brazo/Hombro', 'Torso', DESCANSO, 'Pierna', DESCANSO]),

  // Frecuencias «y media» construidas con el reparto uniforme: incluso en un
  // ciclo de 14 días, nada agrupa las sesiones en "primera quincena llena,
  // segunda con huecos" — se intercalan los descansos por todo el ciclo.
  rotativoUniforme('rot14-torso-pierna-3d', 'Torso - Pierna alternos · 3 días/sem (14 d)',
    ['Torso', 'Pierna', 'Torso', 'Pierna', 'Torso', 'Pierna'], 14),
  rotativoUniforme('rot14-push-pull-3d', 'Push - Pull alternos · 3 días/sem (14 d)',
    ['Push', 'Pull', 'Push', 'Pull', 'Push', 'Pull'], 14),
  rotativoUniforme('rot14-torso-pierna-5d', 'Torso - Pierna alternos · 5 días/sem (14 d)',
    ['Torso', 'Pierna', 'Torso', 'Pierna', 'Torso', 'Pierna', 'Torso', 'Pierna', 'Torso', 'Pierna'], 14),
  rotativoUniforme('rot14-ppl-4d', 'Push - Pull - Legs rotando · 4 días/sem (14 d)',
    ['Push', 'Pull', 'Legs', 'Push', 'Pull', 'Legs', 'Push', 'Pull'], 14),
  rotativoUniforme('rot14-ppl-5d', 'Push - Pull - Legs rotando · 5 días/sem (14 d)',
    ['Push', 'Pull', 'Legs', 'Push', 'Pull', 'Legs', 'Push', 'Pull', 'Legs', 'Push'], 14),
];

/** Días del ciclo, contando los de descanso. */
export function cicloDeSplit(split: TrainingSplit): number {
  return split.dayTypes.length;
}

/** Tipos de los días en los que SÍ se entrena, en orden. */
export function tiposDeEntrenamiento(split: TrainingSplit): string[] {
  return split.dayTypes.filter(t => t !== DESCANSO);
}

/** Cuántas sesiones tiene el ciclo. */
export function sesionesDeSplit(split: TrainingSplit): number {
  return tiposDeEntrenamiento(split).length;
}

/** Posición (0-based) dentro del ciclo de cada sesión, en orden. */
export function offsetsDeSplit(split: TrainingSplit): number[] {
  const offsets: number[] = [];
  split.dayTypes.forEach((t, i) => { if (t !== DESCANSO) offsets.push(i); });
  return offsets;
}

/**
 * Veces por SEMANA que este reparto toca un grupo muscular.
 *
 * Es la cifra que de verdad decide un entrenador, y la única comparable entre
 * ciclos de distinta duración: dos veces en un ciclo de 9 días no son dos veces
 * por semana, son 1,56.
 */
export function frecuenciaSemanalDeSplit(split: TrainingSplit, group: MuscleGroup): number {
  const veces = split.dayTypes.filter(t => t !== DESCANSO && (DAY_TYPE_MUSCLES[t] ?? []).includes(group)).length;
  return frecuenciaPorSemana(veces, cicloDeSplit(split));
}

/** Repartos cuyo número de SESIONES coincide con las que tiene el mesociclo. */
export function getSplitsForDays(sesiones: number): TrainingSplit[] {
  return TRAINING_SPLITS.filter(s => sesionesDeSplit(s) === sesiones);
}

// Sesiones/semana "ideales" para un grupo según su volumen — mismo criterio
// que sessionCount() en MesocycleManager, sin el tope de no-consecutivos
// (aquí solo sirve para puntuar repartos, no para colocar series).
function idealSessions(series: number): number {
  if (series <= 5)  return 1;
  if (series <= 14) return 2;
  return 3;
}

const PRIORITY_WEIGHT: Record<MuscleGroupConfig['priority'], number> = { alta: 3, media: 2, baja: 1 };

// De entre los repartos que encajan con daysPerWeek, cuál cubre mejor la
// frecuencia que pide el volumen ya configurado (más series/prioridad alta
// en un grupo → más días de ese tipo debería tener el reparto). Es una
// sugerencia, no una imposición — el coach elige libremente cualquiera de
// los que se listan.
export function recommendSplit(
  groups: Record<MuscleGroup, MuscleGroupConfig>,
  daysPerWeek: number,
): TrainingSplit | null {
  const candidates = getSplitsForDays(daysPerWeek);
  if (candidates.length === 0) return null;

  let best: TrainingSplit | null = null;
  let bestPenalty = Infinity;

  for (const split of candidates) {
    let penalty = 0;
    for (const [group, cfg] of Object.entries(groups) as [MuscleGroup, MuscleGroupConfig][]) {
      if (cfg.series <= 0) continue;
      // Se compara la FRECUENCIA por semana, no el número de días del ciclo:
      // dos veces en un ciclo de 9 días no compiten de tú a tú con dos veces
      // en una semana.
      penalty += PRIORITY_WEIGHT[cfg.priority] * Math.abs(frecuenciaSemanalDeSplit(split, group) - idealSessions(cfg.series));
    }
    if (penalty < bestPenalty) { bestPenalty = penalty; best = split; }
  }

  return best;
}

// Qué grupos musculares entran en cada tipo de día. 'core' se puede colocar
// cualquier día (no tiene un día propio en ningún reparto).
export const DAY_TYPE_MUSCLES: Record<string, MuscleGroup[]> = {
  'Torso':           ['pecho', 'dorsal', 'trapecio', 'deltoide_ant', 'deltoide_lat', 'deltoide_post', 'biceps', 'triceps', 'antebrazo', 'core', 'lumbares', 'rotadores'],
  'Pierna':          ['cuadriceps', 'isquios', 'gluteo', 'aductores', 'gemelo', 'core', 'lumbares', 'rotadores'],
  'Full body':       ['pecho', 'dorsal', 'trapecio', 'deltoide_ant', 'deltoide_lat', 'deltoide_post', 'biceps', 'triceps', 'antebrazo', 'cuadriceps', 'isquios', 'gluteo', 'aductores', 'gemelo', 'core', 'lumbares', 'rotadores'],
  'Push':            ['pecho', 'deltoide_ant', 'deltoide_lat', 'triceps', 'core', 'lumbares', 'rotadores'],
  'Pull':            ['dorsal', 'trapecio', 'deltoide_post', 'biceps', 'antebrazo', 'core', 'lumbares', 'rotadores'],
  'Legs':            ['cuadriceps', 'isquios', 'gluteo', 'aductores', 'gemelo', 'core', 'lumbares', 'rotadores'],
  'Leg':             ['cuadriceps', 'isquios', 'gluteo', 'aductores', 'gemelo', 'core', 'lumbares', 'rotadores'],
  'Brazo/Hombro':    ['biceps', 'triceps', 'antebrazo', 'deltoide_ant', 'deltoide_lat', 'deltoide_post', 'core', 'lumbares', 'rotadores'],
  'Brazo':           ['biceps', 'triceps', 'antebrazo', 'core', 'lumbares', 'rotadores'],
  'Empujes torso':   ['pecho', 'deltoide_ant', 'deltoide_lat', 'triceps', 'core', 'lumbares', 'rotadores'],
  'Tirones torso':   ['dorsal', 'trapecio', 'deltoide_post', 'biceps', 'antebrazo', 'core', 'lumbares', 'rotadores'],
  'Tirón torso':     ['dorsal', 'trapecio', 'deltoide_post', 'biceps', 'antebrazo', 'core', 'lumbares', 'rotadores'],
  'Pierna/Hombro':   ['cuadriceps', 'isquios', 'gluteo', 'aductores', 'gemelo', 'deltoide_ant', 'deltoide_lat', 'deltoide_post', 'core', 'lumbares', 'rotadores'],
  'Cuádriceps':      ['cuadriceps', 'aductores', 'gemelo', 'core', 'lumbares', 'rotadores'],
  'Glúteo/Isquios':  ['gluteo', 'isquios', 'gemelo', 'core', 'lumbares', 'rotadores'],
};
