import { describe, it, expect } from 'vitest';
import { racionesDe } from './FichaAlimentoCalorias';

describe('racionesDe', () => {
  it('manda la ración propia del atleta', () => {
    const r = racionesDe({ propia: 37.6, racion: 40, ultimos: 60 });
    expect(r[0]).toMatchObject({ gramos: 37.6, recomendada: true, origen: 'propia' });
    expect(r[1]).toMatchObject({ gramos: 60, nota: 'Última vez' });
  });
  it('sin propia, la del producto', () => {
    expect(racionesDe({ racion: 40, ultimos: 60 })[0]).toMatchObject({ gramos: 40, origen: 'producto' });
    expect(racionesDe({ unidad: { nombre: 'rebanada', gramos: 30 } })[0]).toMatchObject({ gramos: 30, etiqueta: '1 rebanada · 30 g' });
  });
  it('sin ración de producto, la ración es lo de la última vez (y no se repite como atajo)', () => {
    const r = racionesDe({ ultimos: 20 });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ gramos: 20, recomendada: true, origen: 'ultima' });
  });
  it('sin nada, ningún atajo ni 100 g', () => {
    expect(racionesDe({})).toEqual([]);
  });
});
