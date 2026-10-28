// Qué dice el reto de la semana DENTRO del entreno, en el ejercicio al que
// afecta (28-10-2026). El reto deja de vivir solo en Inicio: al llegar a la
// prensa, el player recuerda «AMRAP en la última serie con 120 kg, récord 10».
//
// Puro, para poder probarlo sin pintar nada.

import type { WeeklyChallenge } from '../types.js';

export interface AvisoDeReto {
  etiqueta: string;   // «Reto de la semana · AMRAP»
  texto: string;
}

function kg(n: number): string {
  return `${n.toLocaleString('es-ES')} kg`;
}

export function avisoDeReto(
  reto: WeeklyChallenge | null | undefined,
  exerciseId: string,
  workoutId?: string,
): AvisoDeReto | null {
  if (!reto || reto.status !== 'activo') return null;
  const m = reto.metric;
  const esEste = m.exerciseId === exerciseId;
  const ref = m.referencias?.find(r => r.exerciseId === exerciseId);
  const etiqueta = (que: string) => `Reto de la semana · ${que}`;

  switch (reto.kind) {
    case 'amrap_serie':
      if (!esEste || m.atWeight == null) return null;
      return {
        etiqueta: etiqueta('AMRAP'),
        texto: `Última serie con ${kg(m.atWeight)}: todas las repeticiones que puedas con buena técnica. Récord: ${m.baseline ?? 0}. A por ${m.target}.`,
      };
    case 'doble_progresion':
      if (!esEste) return null;
      if (m.subirDe != null) {
        return { etiqueta: etiqueta('toca subir'), texto: `Más de ${kg(m.subirDe)} y al menos ${m.target} repeticiones.` };
      }
      if (m.atWeight == null) return null;
      return {
        etiqueta: etiqueta('doble progresión'),
        texto: `Saca ${m.target} con ${kg(m.atWeight)} (la última vez, ${m.baseline ?? '—'}).`,
      };
    case 'mas_reserva':
      if (!esEste || m.atWeight == null) return null;
      return {
        etiqueta: etiqueta('más reserva'),
        texto: `${kg(m.atWeight)} × ${m.baseline} dejando al menos ${m.minRir ?? 1} en reserva. Nada de fallo.`,
      };
    case 'reps_ejercicio':
      if (!esEste || m.atWeight == null) return null;
      return { etiqueta: etiqueta('repeticiones'), texto: `Saca ${m.target} con ${kg(m.atWeight)}.` };
    case 'carga_ejercicio':
      return esEste ? { etiqueta: etiqueta('carga'), texto: reto.title } : null;
    case 'record_reps':
      if (m.exerciseId && !esEste) return null;
      return {
        etiqueta: etiqueta('récord'),
        texto: m.exerciseId
          ? 'Bate un récord: más repeticiones que nunca con algún peso, o más kilos que nunca.'
          : `Semana de test: cada récord cuenta. Necesitas ${m.target}.`,
      };
    case 'supera_sesion':
      if (!ref || (m.workoutId && workoutId && m.workoutId !== workoutId)) return null;
      return {
        etiqueta: etiqueta('supera tu sesión'),
        texto: `La última vez: ${kg(ref.weight)} × ${ref.reps}. Más kilos o más repeticiones.`,
      };
    case 'grupo_estancado':
      if (!ref) return null;
      return {
        etiqueta: etiqueta(m.muscleLabel?.toLowerCase() ?? 'estancamiento'),
        texto: `La última vez: ${kg(ref.weight)} × ${ref.reps}. Rómpelo: +1 repetición o más kilos.`,
      };
    case 'rir_minimo':
      return {
        etiqueta: etiqueta(reto.contexto?.tipoSemana === 'paron' ? 'vuelta de parón' : 'descarga'),
        texto: `Ninguna serie por debajo de RIR ${m.minRir ?? 3} ni al fallo.`,
      };
    default:
      return null;
  }
}
