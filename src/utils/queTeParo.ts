import type { WorkoutLog } from '../types.js';

/* ═══════════════════════════════════════════════════════════════════════════
   «¿Qué te paró?» (D2, 11-11-2026)

   La doctrina (§6) dice que un ejercicio vale para un grupo si, al llegar
   cerca del fallo, lo que limita la serie es el músculo objetivo. Hasta ahora
   eso no se preguntaba: el coach lo suponía. El atleta lo contesta en un toque
   al cerrar el ejercicio y queda en `WorkoutEntryLog.queParo`.

   Con que se repita, cada respuesta tiene un arreglo distinto, y casi ninguno
   es «más series».
   ═══════════════════════════════════════════════════════════════════════════ */

export type MotivoDeParada = 'musculo' | 'agarre' | 'aire' | 'ardor' | 'tecnica' | 'molestia';

/** En el orden en que se enseñan. La primera es la buena noticia. */
export const MOTIVOS_DE_PARADA: { clave: MotivoDeParada; etiqueta: string }[] = [
  { clave: 'musculo', etiqueta: 'El músculo' },
  { clave: 'agarre', etiqueta: 'El agarre' },
  { clave: 'aire', etiqueta: 'El aire' },
  { clave: 'ardor', etiqueta: 'El ardor' },
  { clave: 'tecnica', etiqueta: 'La técnica' },
  { clave: 'molestia', etiqueta: 'Una molestia' },
];

const CLAVES = new Set<string>(MOTIVOS_DE_PARADA.map(m => m.clave));
export function esMotivoDeParada(v: unknown): v is MotivoDeParada {
  return typeof v === 'string' && CLAVES.has(v);
}

/** Qué hacer cuando un motivo se repite. `musculo` no tiene: es lo que se busca. */
export const ARREGLO_POR_MOTIVO: Record<Exclude<MotivoDeParada, 'musculo'>, string> = {
  agarre: 'ponle straps o un agarre más cómodo',
  aire: 'baja el rango de repeticiones o que respire arriba entre repeticiones',
  ardor: 'baja el rango de repeticiones (más carga, menos reps)',
  tecnica: 'pasa a una variante más estable o sube las repeticiones con menos carga',
  molestia: 'pídele vídeo y revisa la técnica antes de cambiar el ejercicio',
};

/** Sesiones recientes del ejercicio (con respuesta) que se miran. */
export const RESPUESTAS_A_MIRAR = 4;
/** Cuántas tienen que coincidir en un motivo que no sea el músculo. */
export const RESPUESTAS_PARA_AVISAR = 2;

export interface AvisoDeLimitante {
  exerciseId: string;
  motivo: Exclude<MotivoDeParada, 'musculo'>;
  veces: number;
  de: number;
  arreglo: string;
}

/**
 * Ejercicios en los que, en las últimas sesiones con respuesta, lo que para la
 * serie no es el músculo objetivo. De más repetido a menos.
 */
export function avisosDeLimitante(logs: readonly WorkoutLog[], ejercicios?: readonly string[]): AvisoDeLimitante[] {
  const filtro = ejercicios ? new Set(ejercicios) : null;
  const respuestas = new Map<string, MotivoDeParada[]>();
  for (const log of [...logs].sort((a, b) => b.date.localeCompare(a.date))) {
    for (const entry of log.entries) {
      if (!esMotivoDeParada(entry.queParo)) continue;
      if (filtro && !filtro.has(entry.exerciseId)) continue;
      const lista = respuestas.get(entry.exerciseId) ?? [];
      if (lista.length < RESPUESTAS_A_MIRAR) { lista.push(entry.queParo); respuestas.set(entry.exerciseId, lista); }
    }
  }
  const avisos: AvisoDeLimitante[] = [];
  for (const [exerciseId, lista] of respuestas) {
    const cuenta = new Map<MotivoDeParada, number>();
    for (const m of lista) cuenta.set(m, (cuenta.get(m) ?? 0) + 1);
    const [motivo, veces] = [...cuenta.entries()].filter(([m]) => m !== 'musculo').sort((a, b) => b[1] - a[1])[0] ?? [];
    if (!motivo || motivo === 'musculo' || veces < RESPUESTAS_PARA_AVISAR) continue;
    avisos.push({ exerciseId, motivo, veces, de: lista.length, arreglo: ARREGLO_POR_MOTIVO[motivo] });
  }
  return avisos.sort((a, b) => b.veces - a.veces);
}

/** Sin ejercicios clave marcados en el mesociclo, se pregunta en los primeros de la sesión. */
export const SIN_CLAVES_PREGUNTAR_EN = 2;

/**
 * En qué ejercicios de la sesión se pregunta. Preguntarlo en todos cansa y se
 * acaba contestando sin pensar: solo en los ejercicios clave del mesociclo
 * (`Mesocycle.ejerciciosClave`, claves `d0::idDelEjercicio`) o, si no hay
 * ninguno en esta sesión, en los dos primeros, que son los prioritarios.
 */
export function dondePreguntar(exerciseIds: readonly string[], ejerciciosClave?: readonly string[]): boolean[] {
  const claves = new Set((ejerciciosClave ?? []).map(k => k.split('::').pop() ?? k));
  const hayClaves = exerciseIds.some(id => claves.has(id));
  return exerciseIds.map((id, i) => (hayClaves ? claves.has(id) : i < SIN_CLAVES_PREGUNTAR_EN));
}
