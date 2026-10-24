import { db, collection, addDoc } from '../firebase';
import type { Exercise, ExerciseChange, MuscleGroup } from '../types';
import { forceLocalOnly, stripUndefined } from './core';
import { updateExercise } from './training';
import { secundariosLimpios } from '../utils/clasificacionEjercicio';
import { MUSCLE_LABELS } from '../types';

/* Correcciones de clasificación muscular del catálogo (E-04).
   Se cambia el ejercicio del CATÁLOGO; las prescripciones ya guardadas no se
   tocan (guardan su propio grupo principal). Cada cambio deja un registro en
   `exerciseChanges`, solo legible por el coach. */

export interface NuevaClasificacion {
  muscleGroup: MuscleGroup | undefined;
  secondaryMuscleGroups: MuscleGroup[];
}

/**
 * Aplica la clasificación al ejercicio y deja el registro. Devuelve el
 * ejercicio ya actualizado y si el registro se pudo escribir: si el cambio se
 * guardó pero el registro falló, el llamante debe decirlo, no callarlo.
 */
export async function corregirClasificacion(
  ejercicio: Exercise, nueva: NuevaClasificacion, coachId: string,
): Promise<{ ejercicio: Exercise; registrado: boolean }> {
  const secundarios = secundariosLimpios(nueva.muscleGroup, nueva.secondaryMuscleGroups);
  const cambios: Partial<Exercise> = {
    muscleGroup: nueva.muscleGroup,
    secondaryMuscleGroups: secundarios,
    // El rótulo antiguo sigue la clasificación (compatibilidad con pantallas viejas).
    ...(nueva.muscleGroup ? { primaryFocus: MUSCLE_LABELS[nueva.muscleGroup] } : {}),
  };
  await updateExercise(ejercicio.id, cambios);

  let registrado = false;
  if (!forceLocalOnly) {
    const registro: Omit<ExerciseChange, 'id'> = {
      exerciseId: ejercicio.id,
      exerciseName: ejercicio.name,
      coachId,
      at: new Date().toISOString(),
      before: { muscleGroup: ejercicio.muscleGroup, secondaryMuscleGroups: ejercicio.secondaryMuscleGroups ?? [] },
      after: { muscleGroup: nueva.muscleGroup, secondaryMuscleGroups: secundarios },
    };
    try {
      await addDoc(collection(db, 'exerciseChanges'), stripUndefined(registro));
      registrado = true;
    } catch (err) {
      console.warn('corregirClasificacion: no se pudo registrar el cambio:', err);
    }
  }
  return { ejercicio: { ...ejercicio, ...cambios }, registrado };
}
