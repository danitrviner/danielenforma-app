import { MUSCLE_LABELS, MUSCLE_ORDER, type MuscleGroup } from '../types';

/* ═══════════════════════════════════════════════════════════════════════════
   Clasificación muscular de un ejercicio (E-04)

   Principal + secundarios, tal y como están en el catálogo. Cambiarla afecta a
   las prescripciones NUEVAS y al volumen por secundarios de todas (se leen del
   catálogo); las prescripciones ya guardadas conservan su grupo principal
   (ver utils/programacion.ts › grupoDelEjercicio).
   ═══════════════════════════════════════════════════════════════════════════ */

export interface Clasificacion {
  muscleGroup?: MuscleGroup;
  secondaryMuscleGroups?: MuscleGroup[];
}

/** Secundarios sin el principal, sin repetidos y en el orden estándar de grupos. */
export function secundariosLimpios(principal: MuscleGroup | undefined, secundarios: MuscleGroup[] | undefined): MuscleGroup[] {
  const set = new Set(secundarios ?? []);
  if (principal) set.delete(principal);
  return MUSCLE_ORDER.filter(g => set.has(g));
}

const nombre = (g?: MuscleGroup) => (g ? MUSCLE_LABELS[g] : 'Sin asignar');
const lista = (gs: MuscleGroup[]) => (gs.length ? gs.map(g => MUSCLE_LABELS[g]).join(', ') : 'ninguno');

/** Qué cambia entre dos clasificaciones, en frases para enseñar antes de guardar. */
export function diferenciasDeClasificacion(antes: Clasificacion, despues: Clasificacion): { cambia: boolean; lineas: string[] } {
  const lineas: string[] = [];
  if (antes.muscleGroup !== despues.muscleGroup) {
    lineas.push(`Principal: ${nombre(antes.muscleGroup)} → ${nombre(despues.muscleGroup)}`);
  }
  const a = secundariosLimpios(antes.muscleGroup, antes.secondaryMuscleGroups);
  const d = secundariosLimpios(despues.muscleGroup, despues.secondaryMuscleGroups);
  if (a.join('|') !== d.join('|')) {
    lineas.push(`Secundarios: ${lista(a)} → ${lista(d)}`);
  }
  return { cambia: lineas.length > 0, lineas };
}
