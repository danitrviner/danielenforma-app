import type { MuscleGroup, MuscleGroupConfig } from '../types.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Orden de los ejercicios dentro de una sesión (guía del Índice de Hipertrofia)

   1. Lo prioritario, al principio: los grupos con prioridad alta van primero.
   2. En un día de pierna, de menos a más fatiga por serie: los analíticos
      (pocos grupos secundarios) antes que los multiarticulares.
   3. En el resto, alternar patrones: empuje, tracción, empuje… para que un
      grupo descanse mientras trabaja el otro.
   El orden es estable: dentro de cada criterio se respeta el que traían.
   ═══════════════════════════════════════════════════════════════════════════ */

const PIERNA: MuscleGroup[] = ['cuadriceps', 'isquios', 'gluteo', 'aductores', 'gemelo'];
const EMPUJE: MuscleGroup[] = ['pecho', 'deltoide_ant', 'deltoide_lat', 'triceps'];
const TRACCION: MuscleGroup[] = ['dorsal', 'trapecio', 'deltoide_post', 'biceps', 'antebrazo'];

export interface EjercicioParaOrdenar {
  muscleGroup?: MuscleGroup;
  /** Grupos secundarios del ejercicio en el catálogo: cuantos más, más multiarticular. */
  secundarios: number;
}

const patron = (g?: MuscleGroup): 'empuje' | 'traccion' | 'otro' =>
  g && EMPUJE.includes(g) ? 'empuje' : g && TRACCION.includes(g) ? 'traccion' : 'otro';

/** Intercala empujes y tracciones conservando el orden relativo de cada uno. */
function alternar<T extends EjercicioParaOrdenar>(lista: T[]): T[] {
  const emp = lista.filter(e => patron(e.muscleGroup) === 'empuje');
  const tra = lista.filter(e => patron(e.muscleGroup) === 'traccion');
  if (emp.length === 0 || tra.length === 0) return lista;
  const out: T[] = [];
  // Empieza el patrón del primer ejercicio que ya traía la sesión.
  let turno: 'empuje' | 'traccion' = patron(lista.find(e => patron(e.muscleGroup) !== 'otro')!.muscleGroup) as 'empuje' | 'traccion';
  const otros = lista.filter(e => patron(e.muscleGroup) === 'otro');
  while (emp.length || tra.length) {
    const cola = turno === 'empuje' ? (emp.length ? emp : tra) : (tra.length ? tra : emp);
    out.push(cola.shift()!);
    turno = turno === 'empuje' ? 'traccion' : 'empuje';
  }
  return [...out, ...otros];
}

export function ordenarSesion<T extends EjercicioParaOrdenar>(
  ejercicios: T[],
  grupos: Partial<Record<MuscleGroup, Pick<MuscleGroupConfig, 'priority'>>>,
): T[] {
  const esAlta = (e: T) => !!e.muscleGroup && grupos[e.muscleGroup]?.priority === 'alta';
  const alta = ejercicios.filter(esAlta);
  const resto = ejercicios.filter(e => !esAlta(e));
  const dePierna = ejercicios.filter(e => e.muscleGroup && PIERNA.includes(e.muscleGroup)).length;
  const esDiaDePierna = dePierna * 2 > ejercicios.length;
  const ordenarResto = esDiaDePierna
    ? resto.map((e, i) => ({ e, i })).sort((a, b) => a.e.secundarios - b.e.secundarios || a.i - b.i).map(x => x.e)
    : alternar(resto);
  return [...alta, ...ordenarResto];
}
