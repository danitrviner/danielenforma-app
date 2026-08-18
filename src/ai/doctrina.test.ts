import { describe, it, expect } from 'vitest';
import {
  DOCTRINA_DEFAULTS,
  DOCTRINA_ENTRENAMIENTO_DEFAULT,
  DOCTRINA_NUTRICION_DEFAULT,
  buildDoctrinaBlock,
} from './doctrina';
import { MUSCLE_LABELS, type MuscleGroup } from '../types';

describe('buildDoctrinaBlock', () => {
  it('devuelve cadena vacía si no hay doctrina — el bloque no debe añadirse al system', () => {
    expect(buildDoctrinaBlock('', '')).toBe('');
    expect(buildDoctrinaBlock('   ', '\n')).toBe('');
  });

  it('incluye una sola doctrina si la otra está vacía', () => {
    const soloEntreno = buildDoctrinaBlock('criterio de entreno', '');
    expect(soloEntreno).toContain('criterio de entreno');
    expect(soloEntreno).toContain('CRITERIO DEL COACH');
  });

  it('deja claro que el criterio manda sobre la convención genérica', () => {
    const bloque = buildDoctrinaBlock('a', 'b');
    expect(bloque).toContain('prioridad');
  });
});

describe('doctrina por defecto', () => {
  it('no está vacía — el asistente nunca debe operar sin criterio', () => {
    expect(DOCTRINA_ENTRENAMIENTO_DEFAULT.length).toBeGreaterThan(500);
    expect(DOCTRINA_NUTRICION_DEFAULT.length).toBeGreaterThan(500);
    expect(DOCTRINA_DEFAULTS.entrenamiento).toBe(DOCTRINA_ENTRENAMIENTO_DEFAULT);
    expect(DOCTRINA_DEFAULTS.nutricion).toBe(DOCTRINA_NUTRICION_DEFAULT);
  });

  // La doctrina de entrenamiento da un rango de series por grupo usando las
  // claves REALES del enum. Si alguien renombra un grupo en types.ts y no toca
  // esto, el asistente pautaría volumen para una clave que ya no existe y
  // propose_mesocycle lo rechazaría — mejor que falle aquí.
  //
  // 'aductores' (T10, 18-08) es la única excepción deliberada: el plan pedía
  // el rango de series a Dani en vez de inventarlo, y no contestó — así que
  // se queda fuera de la línea a propósito hasta que lo dé. Si este test
  // falla por CUALQUIER OTRA clave, es el bug real que describe el comentario
  // de arriba.
  it('nombra las 15 claves de MuscleGroup tal y como las valida propose_mesocycle (salvo aductores, pendiente de Dani)', () => {
    const claves = Object.keys(MUSCLE_LABELS) as MuscleGroup[];
    expect(claves).toHaveLength(15);
    const faltan = claves.filter(k => k !== 'aductores' && !DOCTRINA_ENTRENAMIENTO_DEFAULT.includes(k));
    expect(faltan).toEqual([]);
  });

  it('la doctrina de nutrición fija la proteína en g/kg, no en gramos absolutos', () => {
    expect(DOCTRINA_NUTRICION_DEFAULT).toMatch(/g\/kg/);
  });
});
