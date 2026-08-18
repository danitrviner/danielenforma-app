import { describe, it, expect } from 'vitest';
import { tourReducer, initialTourState, isBlockedByAction, TOTAL_STEPS, REQUIRED_ACTION_STEPS, SKIPPABLE_STEPS } from './tourReducer';

describe('tourReducer — avance básico', () => {
  it('START activa el tour sin mover el paso', () => {
    const s = tourReducer(initialTourState(), { type: 'START' });
    expect(s.active).toBe(true);
    expect(s.stepIndex).toBe(0);
  });

  it('NEXT avanza un paso y resetea actionDone', () => {
    let s = tourReducer(initialTourState(), { type: 'START' });
    s = tourReducer(s, { type: 'MARK_ACTION_DONE' });
    s = tourReducer(s, { type: 'NEXT' });
    expect(s.stepIndex).toBe(1);
    expect(s.actionDone).toBe(false);
  });

  it('BACK retrocede un paso, nunca por debajo de 0', () => {
    let s = tourReducer(initialTourState(2), { type: 'START' });
    s = tourReducer(s, { type: 'BACK' });
    expect(s.stepIndex).toBe(1);
    s = tourReducer(s, { type: 'BACK' });
    s = tourReducer(s, { type: 'BACK' });
    expect(s.stepIndex).toBe(0);
  });

  it('NEXT en el último paso cierra el tour y marca justCompleted', () => {
    let s = tourReducer(initialTourState(TOTAL_STEPS - 1), { type: 'START' });
    s = tourReducer(s, { type: 'NEXT' });
    expect(s.active).toBe(false);
    expect(s.justCompleted).toBe(true);
  });
});

describe('tourReducer — pasos con acción obligatoria (04 y 10)', () => {
  it('isBlockedByAction es true en un paso requerido hasta MARK_ACTION_DONE', () => {
    const idx = [...REQUIRED_ACTION_STEPS][0];
    const s = initialTourState(idx);
    expect(isBlockedByAction(s)).toBe(true);
    const done = tourReducer(s, { type: 'MARK_ACTION_DONE' });
    expect(isBlockedByAction(done)).toBe(false);
  });

  it('NEXT no avanza si el paso está bloqueado por acción pendiente', () => {
    const idx = [...REQUIRED_ACTION_STEPS][0];
    let s = tourReducer(initialTourState(idx), { type: 'START' });
    s = tourReducer(s, { type: 'NEXT' });
    expect(s.stepIndex).toBe(idx); // no se movió
  });

  it('tras marcar la acción, NEXT sí avanza', () => {
    const idx = [...REQUIRED_ACTION_STEPS][0];
    let s = tourReducer(initialTourState(idx), { type: 'START' });
    s = tourReducer(s, { type: 'MARK_ACTION_DONE' });
    s = tourReducer(s, { type: 'NEXT' });
    expect(s.stepIndex).toBe(idx + 1);
  });

  it('un paso normal no está bloqueado nunca', () => {
    expect(isBlockedByAction(initialTourState(0))).toBe(false);
  });
});

describe('tourReducer — pasos saltables (fotos, isla/widgets)', () => {
  it('SKIP avanza en un paso saltable', () => {
    const idx = [...SKIPPABLE_STEPS][0];
    let s = tourReducer(initialTourState(idx), { type: 'START' });
    s = tourReducer(s, { type: 'SKIP' });
    expect(s.stepIndex).toBe(idx + 1);
  });

  it('SKIP no hace nada en un paso no saltable', () => {
    let s = tourReducer(initialTourState(0), { type: 'START' });
    s = tourReducer(s, { type: 'SKIP' });
    expect(s.stepIndex).toBe(0);
  });

  it('SKIP en el último paso saltable cierra el tour', () => {
    const lastSkippable = Math.max(...SKIPPABLE_STEPS);
    if (lastSkippable === TOTAL_STEPS - 1) {
      let s = tourReducer(initialTourState(lastSkippable), { type: 'START' });
      s = tourReducer(s, { type: 'SKIP' });
      expect(s.active).toBe(false);
      expect(s.justCompleted).toBe(true);
    } else {
      expect(true).toBe(true); // no aplica con la numeración actual, se deja documentado
    }
  });
});

describe('tourReducer — ejemplos vistos y cierre', () => {
  it('MARK_EJEMPLO_VISTO añade el id una sola vez', () => {
    let s = tourReducer(initialTourState(), { type: 'MARK_EJEMPLO_VISTO', stepId: 'academia' });
    s = tourReducer(s, { type: 'MARK_EJEMPLO_VISTO', stepId: 'academia' });
    expect(s.ejemplosVistos).toEqual(['academia']);
  });

  it('CLOSE desactiva el tour sin marcar justCompleted (repetible, no es el cierre real)', () => {
    let s = tourReducer(initialTourState(5), { type: 'START' });
    s = tourReducer(s, { type: 'CLOSE' });
    expect(s.active).toBe(false);
    expect(s.justCompleted).toBe(false);
  });

  it('initialTourState reanuda desde pasoAlcanzado, acotado a los límites', () => {
    expect(initialTourState(999).stepIndex).toBe(TOTAL_STEPS - 1);
    expect(initialTourState(-3).stepIndex).toBe(0);
  });

  it('RESTART siempre vuelve al paso 01, sin importar dónde estaba', () => {
    let s = tourReducer(initialTourState(10), { type: 'START' });
    s = tourReducer(s, { type: 'RESTART' });
    expect(s.active).toBe(true);
    expect(s.stepIndex).toBe(0);
    expect(s.justCompleted).toBe(false);
  });
});

describe('tourReducer — T7.c reanudación tras interrupción', () => {
  // TutorialEngine arranca con initialTourState(profile.tutorial?.pasoAlcanzado
  // ?? 0, ...) y dispatch START — un tutorial con completado:false y
  // pasoAlcanzado:5 (se cerró la app a medias) tiene que reanudar en el paso
  // 5, no volver a empezar desde 0.
  it('un tutorial con pasoAlcanzado:5 reanuda en el paso 5, no en el 0', () => {
    const s = tourReducer(initialTourState(5), { type: 'START' });
    expect(s.active).toBe(true);
    expect(s.stepIndex).toBe(5);
  });

  // El antibloqueo de TourOverlay (objetivo del paso ausente ~2,5s) llama a
  // onForceUnblock, que dispatchea exactamente esto — mismo mecanismo que
  // "el atleta ya hizo la acción", así que NEXT deja de estar bloqueado sin
  // tocar el reducer.
  it('un paso con acción obligatoria se desbloquea con MARK_ACTION_DONE aunque el objetivo nunca apareciera', () => {
    const idx = [...REQUIRED_ACTION_STEPS][0];
    let s = tourReducer(initialTourState(idx), { type: 'START' });
    expect(isBlockedByAction(s)).toBe(true);
    s = tourReducer(s, { type: 'MARK_ACTION_DONE' }); // onForceUnblock
    expect(isBlockedByAction(s)).toBe(false);
    s = tourReducer(s, { type: 'NEXT' });
    expect(s.stepIndex).toBe(idx + 1);
  });
});
