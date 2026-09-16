import { Exercise, MUSCLE_ORDER, MuscleGroup, Workout } from '../types';

/* ═══════════════════════════════════════════════════════════════════════════
   CÓMO PROGRAMA DANI — lo que de verdad pone, por grupo, con sus números.

   Sale de sus propias rutinas: qué ejercicios usa, cuántas veces, y las
   medianas de series, reps, RIR y descanso que les pone. No es una
   recomendación de libro, es su criterio medido.

   Vivía en `ai/perfilProgramacion.ts` porque de momento solo alimentaba el
   prompt del asistente. Pero el generador de rutinas del editor de mesociclos
   necesita exactamente lo mismo —y hasta ahora elegía los ejercicios por el
   orden en que Firestore devolvía el catálogo, con `8-12 / RIR 2 / 90s`
   clavados a fuego—, así que el CÁLCULO baja a utils y el render del bloque de
   texto se queda en `ai/`. Dos consumidores, un solo criterio.
   ═══════════════════════════════════════════════════════════════════════════ */

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

export function mediana(valores: number[]): number | null {
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
