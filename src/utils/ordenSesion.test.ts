import { describe, it, expect } from 'vitest';
import { ordenarSesion } from './ordenSesion';
import type { MuscleGroup } from '../types';

const e = (id: string, muscleGroup: MuscleGroup, secundarios = 0) => ({ id, muscleGroup, secundarios });
const ids = (l: { id: string }[]) => l.map(x => x.id);

describe('ordenarSesion (guía del IH)', () => {
  it('lo de prioridad alta va primero', () => {
    const r = ordenarSesion([e('remo', 'dorsal'), e('curl', 'biceps'), e('banca', 'pecho')], { biceps: { priority: 'alta' } });
    expect(ids(r)[0]).toBe('curl');
  });
  it('en torso alterna empuje y tracción, empezando por el patrón que traía', () => {
    const r = ordenarSesion([e('banca', 'pecho'), e('inclinado', 'pecho'), e('remo', 'dorsal'), e('jalon', 'dorsal'), e('crunch', 'core')], {});
    expect(ids(r)).toEqual(['banca', 'remo', 'inclinado', 'jalon', 'crunch']);
  });
  it('en pierna, de menos a más multiarticular (analíticos primero)', () => {
    const r = ordenarSesion([e('sentadilla', 'cuadriceps', 3), e('extension', 'cuadriceps', 0), e('curl', 'isquios', 0), e('peso_muerto', 'isquios', 4)], {});
    expect(ids(r)).toEqual(['extension', 'curl', 'sentadilla', 'peso_muerto']);
  });
  it('si no hay los dos patrones, no toca el orden', () => {
    expect(ids(ordenarSesion([e('a', 'pecho'), e('b', 'triceps')], {}))).toEqual(['a', 'b']);
  });
});
