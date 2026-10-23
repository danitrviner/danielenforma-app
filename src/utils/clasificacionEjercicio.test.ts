import { describe, it, expect } from 'vitest';
import { diferenciasDeClasificacion, secundariosLimpios } from './clasificacionEjercicio';

describe('secundariosLimpios', () => {
  it('quita el principal y los repetidos', () => {
    expect(secundariosLimpios('pecho', ['pecho', 'triceps', 'triceps'])).toEqual(['triceps']);
  });
  it('sin datos devuelve vacío', () => {
    expect(secundariosLimpios(undefined, undefined)).toEqual([]);
  });
});

describe('diferenciasDeClasificacion', () => {
  it('sin cambios no hay nada que guardar', () => {
    expect(diferenciasDeClasificacion(
      { muscleGroup: 'pecho', secondaryMuscleGroups: ['triceps'] },
      { muscleGroup: 'pecho', secondaryMuscleGroups: ['triceps'] },
    )).toEqual({ cambia: false, lineas: [] });
  });
  it('describe el cambio de principal', () => {
    const r = diferenciasDeClasificacion({ muscleGroup: 'pecho' }, { muscleGroup: 'deltoide_ant' });
    expect(r.cambia).toBe(true);
    expect(r.lineas).toHaveLength(1);
    expect(r.lineas[0]).toMatch(/^Principal: .* → /);
  });
  it('describe el cambio de secundarios', () => {
    const r = diferenciasDeClasificacion(
      { muscleGroup: 'pecho', secondaryMuscleGroups: [] },
      { muscleGroup: 'pecho', secondaryMuscleGroups: ['triceps'] },
    );
    expect(r.lineas[0]).toMatch(/^Secundarios: ninguno → /);
  });
  it('un secundario igual al principal no cuenta como cambio', () => {
    expect(diferenciasDeClasificacion(
      { muscleGroup: 'pecho', secondaryMuscleGroups: [] },
      { muscleGroup: 'pecho', secondaryMuscleGroups: ['pecho'] },
    ).cambia).toBe(false);
  });
});
