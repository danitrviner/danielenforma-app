import { describe, it, expect } from 'vitest';
import { calcularPerfilProgramacion, renderPerfilProgramacion } from './perfilProgramacion';
import type { Exercise, Workout } from '../types';

const ej = (id: string, name: string, muscleGroup: Exercise['muscleGroup'], equipment?: string[]): Exercise =>
  ({ id, ownerId: 'c', name, primaryFocus: '', muscleGroup, type: 'fuerza', equipment } as Exercise);

const rutina = (id: string, exercises: Array<[string, number, string, number, number]>): Workout => ({
  id, ownerId: 'c', name: id,
  exercises: exercises.map(([exerciseId, sets, reps, rir, restSeconds], order) => ({ exerciseId, order, sets, reps, rir, restSeconds })),
});

const catalogo = [
  ej('pb', 'Press banca', 'pecho', ['barra']),
  ej('pi', 'Press inclinado mancuernas', 'pecho', ['mancuernas']),
  ej('ap', 'Aperturas', 'pecho'),
  ej('rb', 'Remo con barra', 'dorsal'),
];

describe('calcularPerfilProgramacion', () => {
  it('ordena por veces programado y saca la mediana de series y el esquema más frecuente', () => {
    const perfil = calcularPerfilProgramacion([
      rutina('a', [['pb', 4, '6-8', 1, 180], ['pi', 3, '8-10', 1, 120]]),
      rutina('b', [['pi', 3, '10-12', 0, 120], ['pb', 3, '6-8', 2, 180]]),
      rutina('c', [['pi', 4, '8-10', 1, 90], ['rb', 4, '8-10', 1, 150]]),
    ], catalogo);
    expect(perfil.pecho.map(e => e.nombre)).toEqual(['Press inclinado mancuernas', 'Press banca']);
    expect(perfil.pecho[0]).toMatchObject({ veces: 3, series: 3, reps: '8-10', rir: 1, descansoSeg: 120 });
    expect(perfil.dorsal[0]).toMatchObject({ nombre: 'Remo con barra', veces: 1 });
    expect(perfil.biceps).toEqual([]);
  });

  it('ignora ejercicios que ya no están en el catálogo', () => {
    const perfil = calcularPerfilProgramacion([rutina('a', [['borrado', 3, '10', 1, 60]])], catalogo);
    expect(Object.values(perfil).every(l => l.length === 0)).toBe(true);
  });
});

describe('renderPerfilProgramacion', () => {
  it('es vacío sin rutinas, para no meter un bloque hueco en el prompt', () => {
    expect(renderPerfilProgramacion([], catalogo)).toBe('');
  });

  it('es determinista: el mismo dato produce el mismo texto byte a byte (prefijo cacheado)', () => {
    const rutinas = [rutina('a', [['pb', 4, '6-8', 1, 180]]), rutina('b', [['rb', 4, '8-10', 1, 150]])];
    const uno = renderPerfilProgramacion(rutinas, catalogo);
    const dos = renderPerfilProgramacion([...rutinas].reverse(), [...catalogo].reverse());
    expect(uno).toBe(dos);
    expect(uno).toContain('CÓMO PROGRAMA DANI');
    expect(uno).toContain('Press banca (×1; 4×6-8 · RIR 1 · 180s)');
    expect(uno).toMatch(/Bíceps: Dani no programa nada directo/);
  });
});
