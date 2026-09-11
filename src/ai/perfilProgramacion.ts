/* Cómo programa Dani, en un bloque de texto que va DENTRO del prompt.
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
 */
import { Exercise, MUSCLE_LABELS, MUSCLE_ORDER, MuscleGroup, Workout } from '../types';

const POR_GRUPO = 8;

interface Uso {
  nombre: string;
  material: string[];
  veces: number;
  series: number[];
  reps: string[];
  rir: number[];
  descanso: number[];
}

function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const orden = [...valores].sort((a, b) => a - b);
  const mitad = Math.floor(orden.length / 2);
  const m = orden.length % 2 ? orden[mitad] : (orden[mitad - 1] + orden[mitad]) / 2;
  return Math.round(m * 10) / 10;
}

function masFrecuente(valores: string[]): string | null {
  if (valores.length === 0) return null;
  const cuenta = new Map<string, number>();
  for (const v of valores) cuenta.set(v, (cuenta.get(v) ?? 0) + 1);
  return [...cuenta.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
}

export interface PerfilEjercicio {
  nombre: string;
  grupo: MuscleGroup;
  veces: number;
  series: number | null;
  reps: string | null;
  rir: number | null;
  descansoSeg: number | null;
  material: string[];
}

/** Los ejercicios que Dani programa de verdad, por grupo, con sus números. */
export function calcularPerfilProgramacion(workouts: Workout[], exercises: Exercise[]): Record<MuscleGroup, PerfilEjercicio[]> {
  const porId = new Map(exercises.map(e => [e.id, e]));
  const usos = new Map<string, Uso & { grupo: MuscleGroup }>();

  for (const w of workouts) {
    for (const ex of w.exercises) {
      const cat = porId.get(ex.exerciseId);
      const grupo = ex.muscleGroup ?? cat?.muscleGroup;
      if (!grupo || !cat) continue;
      const uso = usos.get(ex.exerciseId) ?? {
        nombre: cat.name, grupo, material: cat.equipment ?? [],
        veces: 0, series: [], reps: [], rir: [], descanso: [],
      };
      uso.veces += 1;
      uso.series.push(ex.sets);
      if (ex.reps) uso.reps.push(ex.reps);
      if (typeof ex.rir === 'number') uso.rir.push(ex.rir);
      if (ex.restSeconds) uso.descanso.push(ex.restSeconds);
      usos.set(ex.exerciseId, uso);
    }
  }

  const resultado = Object.fromEntries(MUSCLE_ORDER.map(g => [g, [] as PerfilEjercicio[]])) as Record<MuscleGroup, PerfilEjercicio[]>;
  for (const uso of usos.values()) {
    if (!resultado[uso.grupo]) continue;
    resultado[uso.grupo].push({
      nombre: uso.nombre, grupo: uso.grupo, veces: uso.veces,
      series: mediana(uso.series), reps: masFrecuente(uso.reps), rir: mediana(uso.rir),
      descansoSeg: mediana(uso.descanso), material: [...uso.material].sort(),
    });
  }
  for (const g of MUSCLE_ORDER) {
    resultado[g].sort((a, b) => b.veces - a.veces || a.nombre.localeCompare(b.nombre));
    resultado[g] = resultado[g].slice(0, POR_GRUPO);
  }
  return resultado;
}

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
