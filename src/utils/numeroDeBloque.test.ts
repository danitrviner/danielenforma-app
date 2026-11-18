import { describe, expect, it } from 'vitest';
import { siguienteNumeroDeBloque } from './numeroDeBloque';

describe('siguienteNumeroDeBloque', () => {
  it('el primer bloque de un atleta es el #1', () => {
    expect(siguienteNumeroDeBloque([])).toBe(1);
  });

  it('sin huecos coincide con length + 1', () => {
    expect(siguienteNumeroDeBloque([{ number: 1 }, { number: 2 }, { number: 3 }])).toBe(4);
  });

  it('tras borrar un bloque del medio no repite número (con length + 1 salía otro #3)', () => {
    expect(siguienteNumeroDeBloque([{ number: 1 }, { number: 3 }])).toBe(4);
  });

  it('manda el más alto, vengan en el orden que vengan', () => {
    expect(siguienteNumeroDeBloque([{ number: 7 }, { number: 2 }])).toBe(8);
  });

  it('un bloque sin número o con uno roto no cuenta', () => {
    expect(siguienteNumeroDeBloque([{}, { number: Number.NaN }, { number: 2 }])).toBe(3);
  });
});
