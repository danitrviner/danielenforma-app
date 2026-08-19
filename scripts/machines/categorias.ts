import type { MuscleGroup } from '../../src/types';

/**
 * Clasifica una máquina en un grupo muscular a partir de su nombre en inglés.
 *
 * Los catálogos de Life Fitness y Technogym no publican el grupo muscular en
 * ningún campo estructurado —lo comprobé página a página—, así que se deriva del
 * nombre. Es un heurístico honesto: cubre el vocabulario real de estas marcas y,
 * cuando no lo reconoce, devuelve null en vez de inventarse una categoría. El
 * pipeline lista lo no clasificado al terminar y el admin puede corregirlo desde
 * la app sin volver a importar.
 *
 * El orden importa: la primera regla que casa gana, así que lo específico va
 * antes que lo genérico ("leg curl" antes que "leg").
 */
const REGLAS: Array<[RegExp, MuscleGroup]> = [
  // Core y zona media
  [/abdominal|crunch|oblique|combo twist|lower back/i, 'core'],

  // Cuello y trapecio
  [/shrug|4-way neck|four-way neck/i, 'trapecio'],

  // Hombro
  [/lateral raise/i, 'deltoide_lat'],
  [/rear (delt|fly)|reverse fly/i, 'deltoide_post'],
  [/shoulder press|military/i, 'deltoide_ant'],

  // Brazo — antes que pecho, porque "seated dip" es tríceps y "dip" solo no basta
  [/gripper|wrist|forearm/i, 'antebrazo'],
  [/biceps|curl bench|scott|preacher/i, 'biceps'],
  [/triceps|dip\b/i, 'triceps'],

  // Espalda — "pulldown" y "row" antes que cualquier regla de pecho
  [/pulldown|pull-down|lat\b/i, 'dorsal'],
  [/\brow\b|pullover/i, 'dorsal'],

  // Pecho — "chest / back" es combinada; la clasifico en pecho, que es el gesto
  // principal de la estación, y el admin puede moverla
  [/chest|bench press|\bfly\b|super fly|pec deck/i, 'pecho'],

  // Pierna — lo específico primero
  [/calf|tibia|dorsi-flexion/i, 'gemelo'],
  [/leg curl|nordic ham|glute ham|deadlift|hamstring/i, 'isquios'],
  // T10 (18-08): adductor separado de abductor — la abducción es glúteo medio
  // (eso ya estaba bien), pero la aducción es su propio grupo. Va ANTES que
  // la regla de glúteo para que "adductor" no caiga en /glute|.../ primero.
  [/adductor|inner thigh/i, 'aductores'],
  [/glute|hip thrust|rear kick|abductor/i, 'gluteo'],
  [/leg extension/i, 'cuadriceps'],
  [/squat|leg press|hack|jammer|lunge|step/i, 'cuadriceps'],

  // Bancos sin resistencia propia: se usan sobre todo para press
  [/flat bench|incline bench|decline bench|adjustable bench/i, 'pecho'],

  // Último recurso: cualquier "press" que no sea de hombro ni de pierna (ya
  // capturados arriba) es un empuje de pecho — "Iso-Lateral Incline Press",
  // "Super Incline Press" y compañía caerían aquí.
  [/\bpress\b/i, 'pecho'],
];

export function categoriaDesdeNombre(nombre: string): MuscleGroup | null {
  for (const [patron, grupo] of REGLAS) {
    if (patron.test(nombre)) return grupo;
  }
  return null;
}
