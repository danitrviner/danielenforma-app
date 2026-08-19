import { describe, it, expect } from 'vitest';
import { MUSCLE_ORDER } from '../types';
import { normalizeMuscleGroups } from './normalizeMuscleGroups';

describe('normalizeMuscleGroups', () => {
  it('un mesociclo antiguo sin la clave nueva se lee sin lanzar', () => {
    const sinAductores = Object.fromEntries(
      MUSCLE_ORDER.filter(g => g !== 'aductores').map(g => [g, { series: 4, priority: 'media' as const }])
    );
    const normalizado = normalizeMuscleGroups(sinAductores);
    expect(normalizado.aductores).toEqual({ series: 0, priority: 'media' });
    expect(normalizado.pecho).toEqual({ series: 4, priority: 'media' });
  });

  it('undefined se normaliza a todos los grupos en cero', () => {
    const normalizado = normalizeMuscleGroups(undefined);
    for (const g of MUSCLE_ORDER) {
      expect(normalizado[g]).toEqual({ series: 0, priority: 'media' });
    }
  });

  it('no toca los grupos que ya están completos', () => {
    const completo = Object.fromEntries(
      MUSCLE_ORDER.map(g => [g, { series: 7, priority: 'alta' as const }])
    );
    expect(normalizeMuscleGroups(completo)).toEqual(completo);
  });

  it('el resultado tiene exactamente las claves de MUSCLE_ORDER, sin huecos ni sobrantes', () => {
    const normalizado = normalizeMuscleGroups({ pecho: { series: 10, priority: 'alta' } });
    expect(Object.keys(normalizado).sort()).toEqual([...MUSCLE_ORDER].sort());
  });
});
