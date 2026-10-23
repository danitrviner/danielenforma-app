import { describe, it, expect } from 'vitest';
import { esCodigoValido, variantesDeCodigo, soloDigitos, encontrarPorCodigo } from './codigoBarras';

describe('esCodigoValido', () => {
  it('acepta códigos reales', () => {
    expect(esCodigoValido('3017620422003')).toBe(true); // EAN-13 (Nutella)
    expect(esCodigoValido('5449000000996')).toBe(true); // EAN-13 (Coca-Cola)
    expect(esCodigoValido('96385074')).toBe(true);      // EAN-8
    expect(esCodigoValido('036000291452')).toBe(true);  // UPC-A
  });
  it('rechaza dígito de control mal, longitudes raras y letras', () => {
    expect(esCodigoValido('3017620422004')).toBe(false);
    expect(esCodigoValido('301762042')).toBe(false);
    expect(esCodigoValido('30176204220AB')).toBe(false);
    expect(esCodigoValido('')).toBe(false);
  });
});

describe('variantesDeCodigo', () => {
  it('añade el EAN-13 con ceros delante a un UPC-A', () => {
    expect(variantesDeCodigo('036000291452')).toEqual(['036000291452', '0036000291452']);
  });
  it('limpia espacios y guiones', () => {
    expect(soloDigitos(' 3017-6204 22003 ')).toBe('3017620422003');
    expect(variantesDeCodigo('3017 6204 22003')).toEqual(['3017620422003']);
  });
});

describe('encontrarPorCodigo', () => {
  const propios = [
    { id: 'a', codigo: '0036000291452' },
    { id: 'b' },
    { id: 'c', codigo: '3017620422003' },
  ];
  it('encuentra por el código exacto o por su variante UPC-A / EAN-13', () => {
    expect(encontrarPorCodigo(propios, '3017620422003')?.id).toBe('c');
    expect(encontrarPorCodigo(propios, '036000291452')?.id).toBe('a');
  });
  it('sin coincidencia devuelve undefined y no confunde los que no tienen código', () => {
    expect(encontrarPorCodigo(propios, '5449000000996')).toBeUndefined();
  });
});
