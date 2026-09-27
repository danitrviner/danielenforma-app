import { describe, it, expect } from 'vitest';
import { ordenarFilas } from './orden';

const filas = [
  { id: 'a', fecha: '2026-07-06', cents: 9000 },
  { id: 'b', fecha: '2026-09-01', cents: 100000 },
  { id: 'c', fecha: '2026-01-15', cents: 25000 },
];
const ids = (xs: { id: string }[]) => xs.map(x => x.id);

describe('ordenarFilas', () => {
  it('ordena fechas ISO de más reciente a más antigua', () => {
    expect(ids(ordenarFilas(filas, f => f.fecha, 'desc'))).toEqual(['b', 'a', 'c']);
  });

  it('y al revés', () => {
    expect(ids(ordenarFilas(filas, f => f.fecha, 'asc'))).toEqual(['c', 'a', 'b']);
  });

  it('los números se comparan como números, no como texto', () => {
    expect(ids(ordenarFilas(filas, f => f.cents, 'asc'))).toEqual(['a', 'c', 'b']);
  });

  it('no toca el array original', () => {
    const copia = [...filas];
    ordenarFilas(filas, f => f.fecha, 'asc');
    expect(filas).toEqual(copia);
  });

  it('las filas sin dato caen al final en los dos sentidos', () => {
    const conHuecos = [
      { id: 'sin', fecha: undefined as string | undefined },
      { id: 'vacia', fecha: '' },
      { id: 'con', fecha: '2026-07-06' },
    ];
    expect(ids(ordenarFilas(conHuecos, f => f.fecha, 'desc'))[0]).toBe('con');
    expect(ids(ordenarFilas(conHuecos, f => f.fecha, 'asc'))[0]).toBe('con');
  });
});
