import { WorkoutLog } from '../types';

/* ═══════════════════════════════════════════════════════════════════════════
   Mezcla de entrenamientos del servidor con los que siguen solo en el móvil

   `03-6`. `getWorkoutLogs` guardaba `[...locales, ...servidor]` y devolvía SOLO
   `servidor`. Un entrenamiento registrado sin conexión existía en el
   dispositivo, no aparecía en ninguna pantalla y nunca llegaba al coach:
   desaparecía sin más.

   Vive aparte del módulo de Firestore porque tiene dos reglas que conviene
   poder probar sin montar una base de datos, y una de ellas es un guardarraíl
   de privacidad: la copia local es una lista ÚNICA para todo el dispositivo, no
   una por atleta. Sin el filtro, la ficha de un atleta enseñaría los
   entrenamientos pendientes de otro — y en el móvil del coach, que es quien
   abre varias fichas seguidas, eso pasa el primer día.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface LogsCombinados {
  /** Lo que se enseña: pendientes de subir primero, luego lo confirmado. */
  visibles: WorkoutLog[];
  /** Lo que se reescribe en la copia local: todo, sin filtrar por atleta. */
  paraGuardar: WorkoutLog[];
}

export function combinarLogs(
  delServidor: WorkoutLog[],
  enElMóvil: WorkoutLog[],
  athleteId?: string,
): LogsCombinados {
  const idsDelServidor = new Set(delServidor.map(l => l.id));

  // Lo que el servidor ya confirmó manda: si un id está en las dos listas, la
  // copia local es la vieja.
  const soloLocales = enElMóvil.filter(l => !idsDelServidor.has(l.id));

  const pendientes = athleteId
    ? soloLocales.filter(l => l.athleteId === athleteId)
    : soloLocales;

  return {
    visibles: [...pendientes, ...delServidor],
    // La copia local conserva los de TODOS los atletas: filtrarla aquí borraría
    // del móvil del coach los pendientes de las otras fichas que tenga abiertas.
    paraGuardar: [...soloLocales, ...delServidor],
  };
}
