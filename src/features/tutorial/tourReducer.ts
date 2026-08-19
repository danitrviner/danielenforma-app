// Reducer puro del motor de tutorial (F3.12, "Bienvenida guiada").
// Sin efectos secundarios ni DOM: la persistencia (Firestore) y el overlay
// visual leen este estado, nunca lo calculan ellos mismos. Así el avance de
// pasos —incluida la regla de "acción obligatoria" de los pasos 04 y 10— se
// puede testear sin React ni un navegador real.

// 16 pasos reales (decisión de Dani, 2026-08-07: se quita el paso 14 de chat
// de los 17 del README). Los índices de abajo son 0-based DESPUÉS de quitar
// ese paso — no coinciden con la numeración del README a partir de aquí:
// README 15 (fotos) → índice 13, README 16 (isla/widgets) → índice 14.
export const TOTAL_STEPS = 16;
export const REQUIRED_ACTION_STEPS = new Set([3, 9]); // índices 0-based de los pasos 04 y 10 (no se mueven: el 14 removido va después de ambos)
export const SKIPPABLE_STEPS = new Set([13, 14]);      // fotos de progreso · isla dinámica y widgets

export interface TourState {
  active: boolean;
  stepIndex: number;      // 0-based
  actionDone: boolean;    // acción del paso actual (solo aplica si REQUIRED_ACTION_STEPS lo exige)
  ejemplosVistos: string[];
  justCompleted: boolean; // true un único ciclo: el paso 17 (cierre) se acaba de disparar
}

export const initialTourState = (resumeFromStep = 0, ejemplosVistos: string[] = []): TourState => ({
  active: false,
  stepIndex: Math.max(0, Math.min(TOTAL_STEPS - 1, resumeFromStep)),
  actionDone: false,
  ejemplosVistos,
  justCompleted: false,
});

export type TourAction =
  | { type: 'START' }
  | { type: 'NEXT' }
  | { type: 'BACK' }
  | { type: 'SKIP' }           // solo válido en SKIPPABLE_STEPS; se comporta como NEXT
  | { type: 'MARK_ACTION_DONE' }
  | { type: 'MARK_EJEMPLO_VISTO'; stepId: string }
  | { type: 'CLOSE' }          // "Saltar" (solo repetible, no en el primer pase) o cierre manual
  | { type: 'RESTART' };       // "Repetir el tour" desde Perfil›Ajustes — siempre vuelve al paso 01

/** Si el paso actual exige acción de verdad, y todavía no se ha hecho. */
export function isBlockedByAction(state: TourState): boolean {
  return REQUIRED_ACTION_STEPS.has(state.stepIndex) && !state.actionDone;
}

export function tourReducer(state: TourState, action: TourAction): TourState {
  switch (action.type) {
    case 'START':
      return { ...state, active: true, actionDone: false, justCompleted: false };

    case 'NEXT': {
      if (isBlockedByAction(state)) return state; // el primario está deshabilitado, no debería llegar aquí igualmente
      const nextIndex = state.stepIndex + 1;
      if (nextIndex >= TOTAL_STEPS) {
        return { ...state, active: false, justCompleted: true };
      }
      return { ...state, stepIndex: nextIndex, actionDone: false };
    }

    case 'SKIP': {
      if (!SKIPPABLE_STEPS.has(state.stepIndex)) return state;
      const nextIndex = state.stepIndex + 1;
      if (nextIndex >= TOTAL_STEPS) return { ...state, active: false, justCompleted: true };
      return { ...state, stepIndex: nextIndex, actionDone: false };
    }

    case 'BACK':
      if (state.stepIndex === 0) return state;
      return { ...state, stepIndex: state.stepIndex - 1, actionDone: false };

    case 'MARK_ACTION_DONE':
      return { ...state, actionDone: true };

    case 'MARK_EJEMPLO_VISTO':
      return state.ejemplosVistos.includes(action.stepId)
        ? state
        : { ...state, ejemplosVistos: [...state.ejemplosVistos, action.stepId] };

    case 'CLOSE':
      return { ...state, active: false };

    case 'RESTART':
      return { ...state, active: true, stepIndex: 0, actionDone: false, justCompleted: false };

    default:
      return state;
  }
}
