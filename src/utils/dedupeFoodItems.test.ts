import { describe, it, expect } from 'vitest';
import { MealItem } from '../types';
import { encontrarDuplicados } from './dedupeFoodItems';

function item(id: string, mode: MealItem['mode'], category: MealItem['category'], label: string): MealItem {
  return { id, mode, category, label };
}

describe('encontrarDuplicados', () => {
  it('dos docs con el mismo mode|category|label normalizado dejan uno', () => {
    const items = [
      item('abc123', 'OMNIVORO', 'GRASA', '200ml gazpacho'),
      item('def456', 'OMNIVORO', 'GRASA', '200ml gazpacho'),
    ];
    const grupos = encontrarDuplicados(items);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].eliminar).toHaveLength(1);
    expect(grupos[0].conservar.id + grupos[0].eliminar[0].id).toContain('abc123');
    expect(grupos[0].conservar.id + grupos[0].eliminar[0].id).toContain('def456');
  });

  it('etiquetas con acentos o espacios sobrantes se consideran la misma', () => {
    const items = [
      item('a', 'VEGANO', 'HC', '  Bebida de Avena  '),
      item('b', 'VEGANO', 'HC', 'bebida de avena'),
    ];
    const grupos = encontrarDuplicados(items);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].eliminar).toHaveLength(1);
  });

  it('no toca dos alimentos que solo comparten label pero difieren en mode', () => {
    const items = [
      item('a', 'OMNIVORO', 'PROT', 'gazpacho'),
      item('b', 'VEGANO', 'PROT', 'gazpacho'),
    ];
    expect(encontrarDuplicados(items)).toEqual([]);
  });

  it('sin duplicados no hay nada que borrar', () => {
    const items = [
      item('a', 'OMNIVORO', 'HC', 'pan'),
      item('b', 'OMNIVORO', 'HC', 'arroz'),
    ];
    expect(encontrarDuplicados(items)).toEqual([]);
  });

  it('conserva el de ID determinista (sys_…) aunque no sea el primero de la lista', () => {
    const items = [
      item('legacyAbc123', 'OMNIVORO', 'GRASA', 'gazpacho'),
      item('sys_OMNIVORO_GRASA_gazpacho', 'OMNIVORO', 'GRASA', 'gazpacho'),
    ];
    const grupos = encontrarDuplicados(items);
    expect(grupos[0].conservar.id).toBe('sys_OMNIVORO_GRASA_gazpacho');
    expect(grupos[0].eliminar.map(i => i.id)).toEqual(['legacyAbc123']);
  });

  it('sin ninguno determinista, conserva el primero de la lista (el más antiguo, según el orden de lectura)', () => {
    const items = [
      item('primero', 'OMNIVORO', 'GRASA', 'gazpacho'),
      item('segundo', 'OMNIVORO', 'GRASA', 'gazpacho'),
      item('tercero', 'OMNIVORO', 'GRASA', 'gazpacho'),
    ];
    const grupos = encontrarDuplicados(items);
    expect(grupos[0].conservar.id).toBe('primero');
    expect(grupos[0].eliminar.map(i => i.id).sort()).toEqual(['segundo', 'tercero']);
  });

  it('tres duplicados con tres categorías/modos distintos no se agrupan entre sí', () => {
    const items = [
      item('a', 'OMNIVORO', 'HC', 'leche'),
      item('b', 'OMNIVORO', 'PROT', 'leche'),
      item('c', 'VEGANO', 'HC', 'leche'),
    ];
    expect(encontrarDuplicados(items)).toEqual([]);
  });
});
