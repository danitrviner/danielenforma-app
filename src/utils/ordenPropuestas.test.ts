import { describe, it, expect } from 'vitest';
import { ordenarPropuestasPorPlan, agruparPropuestasPorAtleta } from './ordenPropuestas';
import type { AiProposal } from '../types';

const p = (id: string, kind: AiProposal['kind'], createdAt: string): AiProposal =>
  ({ id, kind, createdAt, athleteId: 'a', status: 'proposed', chatId: 'c', summary: '', rationale: '', payload: {} } as unknown as AiProposal);

describe('ordenarPropuestasPorPlan', () => {
  it('pone el mesociclo antes que las sesiones, y la ficha al final, aunque llegaran al revés', () => {
    const orden = ordenarPropuestasPorPlan([
      p('ficha', 'dossier', '2026-09-11T10:00:00Z'),
      p('sesiones', 'workoutDays', '2026-09-11T10:01:00Z'),
      p('nutri', 'nutritionProgram', '2026-09-11T10:02:00Z'),
      p('meso', 'mesocycle', '2026-09-11T10:03:00Z'),
    ]).map(x => x.id);
    expect(orden).toEqual(['meso', 'sesiones', 'nutri', 'ficha']);
  });

  it('respeta la cadena de dependencias de un mes entero', () => {
    // Cada paso necesita que exista el anterior: las sesiones necesitan el
    // mesociclo, publicar necesita las sesiones, el calendario de comidas
    // necesita las dietas (las resuelve por nombre).
    const orden = ordenarPropuestasPorPlan([
      p('config', 'setupConfig', '2026-09-11T10:00:00Z'),
      p('reto', 'weeklyChallenge', '2026-09-11T10:01:00Z'),
      p('publicar', 'publishBlock', '2026-09-11T10:02:00Z'),
      p('nutri', 'nutritionProgram', '2026-09-11T10:03:00Z'),
      p('sesiones', 'workoutDays', '2026-09-11T10:04:00Z'),
      p('meso', 'mesocycle', '2026-09-11T10:05:00Z'),
      p('plantilla', 'mesocycleTemplate', '2026-09-11T10:06:00Z'),
    ]).map(x => x.id);
    expect(orden).toEqual(['meso', 'sesiones', 'publicar', 'nutri', 'config', 'reto', 'plantilla']);
  });

  it('dentro del mismo tipo conserva la antigüedad y no muta la entrada', () => {
    const entrada = [p('b', 'diet', '2026-09-11T10:05:00Z'), p('a', 'diet', '2026-09-11T10:00:00Z')];
    expect(ordenarPropuestasPorPlan(entrada).map(x => x.id)).toEqual(['a', 'b']);
    expect(entrada.map(x => x.id)).toEqual(['b', 'a']);
  });
});

describe('agruparPropuestasPorAtleta', () => {
  it('enseña también las de otros clientes, con el abierto primero', () => {
    // El fallo que arregla: el panel filtraba por el email de la URL, así que
    // una propuesta hecha para otro cliente (o desde un chat abierto fuera de
    // la ficha) no aparecía en ninguna parte.
    const grupos = agruparPropuestasPorAtleta([
      { ...p('a', 'mesocycle', '2026-09-12T10:00:00Z'), athleteId: 'zoe@x.com' },
      { ...p('b', 'diet', '2026-09-12T10:01:00Z'), athleteId: 'ana@x.com' },
      { ...p('c', 'workoutDays', '2026-09-12T10:02:00Z'), athleteId: 'zoe@x.com' },
    ], 'zoe@x.com');
    expect(grupos.map(g => g.email)).toEqual(['zoe@x.com', 'ana@x.com']);
    expect(grupos[0].lista.map(x => x.id)).toEqual(['a', 'c']);
  });

  it('sin cliente abierto no esconde nada: salen todos, por email', () => {
    const grupos = agruparPropuestasPorAtleta([
      { ...p('a', 'diet', '2026-09-12T10:00:00Z'), athleteId: 'zoe@x.com' },
      { ...p('b', 'diet', '2026-09-12T10:01:00Z'), athleteId: 'ana@x.com' },
    ], undefined);
    expect(grupos.map(g => g.email)).toEqual(['ana@x.com', 'zoe@x.com']);
  });
});
