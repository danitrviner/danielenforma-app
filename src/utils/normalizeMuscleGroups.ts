import { MuscleGroup, MuscleGroupConfig, MUSCLE_ORDER } from '../types';

/* T10 (18-08). `Mesocycle.groups` es un `Record<MuscleGroup, MuscleGroupConfig>`
   y el código lo lee sin comprobar (`groups[g].series` directo, en varios
   sitios de MesocycleManager). Los mesociclos que ya están en Firestore desde
   ANTES de un grupo nuevo (p. ej. "aductores") no tienen esa clave —
   `undefined.series` sería un TypeError y pantalla en blanco en la ficha de
   cualquier cliente con un mesociclo antiguo.

   Se aplica en la capa de datos (getMesocycles/createMesocycle/updateMesocycle
   en db/training.ts) para que NADA salga de ahí con huecos — el resto del
   código puede seguir asumiendo que `groups` está completo. */
export function normalizeMuscleGroups(
  groups: Partial<Record<MuscleGroup, MuscleGroupConfig>> | undefined
): Record<MuscleGroup, MuscleGroupConfig> {
  const result = {} as Record<MuscleGroup, MuscleGroupConfig>;
  for (const g of MUSCLE_ORDER) {
    result[g] = groups?.[g] ?? { series: 0, priority: 'media' };
  }
  return result;
}
