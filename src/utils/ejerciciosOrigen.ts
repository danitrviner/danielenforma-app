import origen from '../data/ejerciciosOrigen.json';
import { Exercise, MuscleGroup } from '../types';

// Nombre original en inglés y categoría de origen de los 1.681 ejercicios
// importados del banco de vídeos, indexados por su ID de Firestore. Ver
// scripts/generarOrigenEjercicios.mjs para cómo se genera y por qué vive en el
// bundle en vez de en Firestore.

interface OrigenJson {
  categorias: string[];
  ejercicios: Record<string, [string, number]>;
}

// Doble aserción: TypeScript infiere las tuplas del JSON como `(string |
// number)[]`, y no hay forma de decirle desde el propio JSON que cada fila mide
// exactamente dos. La forma la garantiza el generador
// (scripts/generarOrigenEjercicios.mjs), no el tipo.
const datos = origen as unknown as OrigenJson;

export interface OrigenEjercicio {
  nombreOriginal: string;  // 'Cable Hip Abduction'
  categoria: string;       // 'Abductores' — cómo lo clasificaba el banco de origen
}

export function getOrigen(exerciseId: string): OrigenEjercicio | null {
  const fila = datos.ejercicios[exerciseId];
  if (!fila) return null;
  return { nombreOriginal: fila[0], categoria: datos.categorias[fila[1]] };
}

// El importador dejó palabras sin traducir entre corchetes y lo marcó así en su
// momento; en producción ese corchete sigue en el nombre que ve el atleta. Es la
// señal más barata de "esto está mal traducido seguro".
export function tieneInglesSinTraducir(ex: Exercise): boolean {
  return /[[\]]/.test(ex.name);
}

// La categoría del banco de origen no es un MuscleGroup — es una taxonomía
// distinta y más gruesa (no separa los tres deltoides, y tiene 'Cuerpo
// Completo', que no existe como grupo). Solo se traduce lo que mapea sin
// ambigüedad; el resto queda en null a propósito, para que el coach lo decida
// mirando el vídeo en vez de heredar una equivalencia inventada.
const CATEGORIA_A_GRUPO: Record<string, MuscleGroup> = {
  'Aductores':      'aductores',
  'Antebrazos':     'antebrazo',
  'Bíceps':         'biceps',
  'Core':           'core',
  'Cuádriceps':     'cuadriceps',
  'Glúteos':        'gluteo',
  'Isquiotibiales': 'isquios',
  'Pantorrillas':   'gemelo',
  'Pecho':          'pecho',
  'Tríceps':        'triceps',
};

export function grupoSugeridoPorOrigen(exerciseId: string): MuscleGroup | null {
  const o = getOrigen(exerciseId);
  return o ? CATEGORIA_A_GRUPO[o.categoria] ?? null : null;
}

// ─── Orden de revisión ────────────────────────────────────────────────────────

// Revisar 1.721 fichas en orden alfabético es la peor manera posible: saltas de
// un grupo muscular a otro en cada ficha y el criterio se te va. El orden es:
//
//   1. Los que ya usas en rutinas — son los que más te importa tener bien, y
//      además te calibran el criterio antes de entrar en el bulto.
//   2. El resto agrupado por grupo muscular, en el orden del macrociclo, para
//      revisar todo el pecho seguido, luego toda la espalda, etc.
//   3. Los que no tienen grupo asignado, al final: son los que más tiempo
//      piden porque hay que decidirlo desde cero.
//
// Los ya revisados no se sacan de la lista — se cuentan para el progreso y se
// pueden volver a mirar — pero la pantalla arranca en el primero sin revisar.
export function ordenarParaRevision(
  exercises: Exercise[],
  usados: Set<string>,
  ordenGrupos: MuscleGroup[],
): Exercise[] {
  const rangoGrupo = (ex: Exercise): number => {
    if (!ex.muscleGroup) return ordenGrupos.length; // sin grupo, al final
    const i = ordenGrupos.indexOf(ex.muscleGroup);
    return i === -1 ? ordenGrupos.length : i;
  };

  return [...exercises].sort((a, b) => {
    const usadoA = usados.has(a.id) ? 0 : 1;
    const usadoB = usados.has(b.id) ? 0 : 1;
    if (usadoA !== usadoB) return usadoA - usadoB;

    const grupoA = rangoGrupo(a);
    const grupoB = rangoGrupo(b);
    if (grupoA !== grupoB) return grupoA - grupoB;

    return a.name.localeCompare(b.name, 'es');
  });
}
