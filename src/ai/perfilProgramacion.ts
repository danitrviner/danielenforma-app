/* El bloque «CÓMO PROGRAMA DANI» que va DENTRO del prompt.
 *
 * La IA ya podía preguntarlo con get_exercise_usage, y lo hacía: once veces
 * en un solo chat, una por grupo muscular, más otras once a get_exercise_library.
 * Veintidós rondas para averiguar algo que no cambia de un cliente a otro.
 *
 * Esto lo calcula una vez por sesión del panel, a partir de las rutinas del
 * coach, y lo mete como bloque de sistema cacheado (aiClient.ts). El texto es
 * determinista — mismo orden, mismos redondeos — para que el prefijo cacheado
 * sea idéntico byte a byte entre turnos; solo cambia cuando Dani cambia una
 * rutina, y entonces se reescribe la caché una vez.
 *
 * El CÁLCULO vive en `utils/perfilProgramacion.ts`: lo comparte con el
 * generador de rutinas del editor de mesociclos, que elige con el mismo
 * criterio. Aquí solo queda el texto.
 */
import { Exercise, MUSCLE_LABELS, MUSCLE_ORDER, MuscleGroup, Workout } from '../types';
import { calcularPerfilProgramacion } from '../utils/perfilProgramacion';

export { calcularPerfilProgramacion } from '../utils/perfilProgramacion';
export type { PerfilEjercicio } from '../utils/perfilProgramacion';

/** El bloque tal y como lo lee el modelo. Vacío si no hay rutinas todavía. */
export function renderPerfilProgramacion(workouts: Workout[], exercises: Exercise[]): string {
  if (workouts.length === 0) return '';
  const perfil = calcularPerfilProgramacion(workouts, exercises);
  const enCatalogo = new Map<MuscleGroup, number>();
  for (const e of exercises) if (e.muscleGroup) enCatalogo.set(e.muscleGroup, (enCatalogo.get(e.muscleGroup) ?? 0) + 1);

  const lineas: string[] = [];
  for (const g of MUSCLE_ORDER) {
    const lista = perfil[g];
    const total = enCatalogo.get(g) ?? 0;
    if (lista.length === 0) {
      lineas.push(`${MUSCLE_LABELS[g]}: Dani no programa nada directo (${total} en catálogo — pide get_exercise_library("${g}") solo si hace falta).`);
      continue;
    }
    const items = lista.map(e => {
      const esquema = [
        e.series != null ? `${e.series}×${e.reps ?? '?'}` : null,
        e.rir != null ? `RIR ${e.rir}` : null,
        e.descansoSeg != null ? `${e.descansoSeg}s` : null,
      ].filter(Boolean).join(' · ');
      return `${e.nombre} (×${e.veces}${esquema ? `; ${esquema}` : ''})`;
    });
    lineas.push(`${MUSCLE_LABELS[g]} [${total} en catálogo]: ${items.join(' | ')}`);
  }

  return `# CÓMO PROGRAMA DANI (sus ${workouts.length} rutinas)
Estos son los ejercicios que Dani pone de verdad, por grupo, del más usado al menos, con las series×reps, el RIR y el descanso que suele ponerles. Es SU criterio, no una recomendación de libro: elige de aquí salvo que el material o una lesión del atleta lo impidan, y si te sales, di por qué. Los nombres van tal cual están en el catálogo — úsalos literales en propose_workout_days. No llames a get_exercise_usage para lo que ya está aquí; get_exercise_library solo si un grupo no tiene nada usable.

${lineas.join('\n')}`;
}
