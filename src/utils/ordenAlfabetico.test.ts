import { describe, it, expect } from 'vitest';
import { compararNombres, porNombre } from './ordenAlfabetico';

const ordenar = (nombres: (string | null | undefined)[]) =>
  porNombre(nombres, n => n);

describe('orden alfabético en español', () => {
  it('las tildes no mandan al final de la lista', () => {
    // El caso de la auditoría: «Álvaro» va entre «Alba» y «Ana». Comparando por
    // código de carácter se iba detrás de la Z, porque 'Á' es U+00C1.
    expect(ordenar(['Ana', 'Álvaro', 'Alba'])).toEqual(['Alba', 'Álvaro', 'Ana']);
  });

  it('las mayúsculas no cambian el orden', () => {
    expect(ordenar(['beatriz', 'Ana', 'CARLOS'])).toEqual(['Ana', 'beatriz', 'CARLOS']);
  });

  it('un nombre compuesto no se cuela en otro sitio por el guion', () => {
    expect(ordenar(['Ana María', 'Ana-María', 'Ana Belén']))
      .toEqual(['Ana Belén', 'Ana María', 'Ana-María']);
  });

  it('los números van en orden humano, no de texto', () => {
    expect(ordenar(['Cliente 10', 'Cliente 2'])).toEqual(['Cliente 2', 'Cliente 10']);
  });

  it('los vacíos van al final, no arriba del todo', () => {
    expect(ordenar(['Bea', '', 'Ana'])).toEqual(['Ana', 'Bea', '']);
    expect(ordenar(['Bea', null, 'Ana'])).toEqual(['Ana', 'Bea', null]);
  });

  it('los espacios de más no cuentan', () => {
    expect(compararNombres('  Ana  ', 'Ana')).toBe(0);
  });

  it('la ñ va donde tiene que ir: entre la n y la o', () => {
    expect(ordenar(['Ozono', 'Ñoño', 'Nuria'])).toEqual(['Nuria', 'Ñoño', 'Ozono']);
  });

  it('no toca la lista original', () => {
    const original = ['Bea', 'Ana'];
    porNombre(original, n => n);
    expect(original).toEqual(['Bea', 'Ana']);
  });
});
