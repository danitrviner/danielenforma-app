import { describe, it, expect } from 'vitest';
import { normalizarDni, esDniValido, formatDni, enlaceWhatsApp, normalizarPrefijo } from './identidad';

describe('normalizarDni', () => {
  it('deja el mismo valor escriba como escriba el coach', () => {
    const esperado = '12345678Z';
    expect(normalizarDni('12345678z')).toBe(esperado);
    expect(normalizarDni('12345678-Z')).toBe(esperado);
    expect(normalizarDni(' 12345678 z ')).toBe(esperado);
    expect(normalizarDni('12.345.678-Z')).toBe(esperado);
  });
});

describe('esDniValido', () => {
  it('valida la letra de control del DNI', () => {
    expect(esDniValido('12345678Z')).toBe(true);   // 12345678 % 23 = 14 → Z
    expect(esDniValido('12345678A')).toBe(false);
  });

  it('valida NIE con prefijo X/Y/Z', () => {
    expect(esDniValido('X1234567L')).toBe(true);
    expect(esDniValido('Y1234567X')).toBe(true);
    expect(esDniValido('Z1234567R')).toBe(true);
    expect(esDniValido('X1234567A')).toBe(false);
  });

  it('rechaza formatos que no son ni DNI ni NIE', () => {
    expect(esDniValido('')).toBe(false);
    expect(esDniValido('1234567Z')).toBe(false);   // 7 dígitos
    expect(esDniValido('123456789Z')).toBe(false); // 9 dígitos
    expect(esDniValido('ABCDEFGHZ')).toBe(false);
  });
});

describe('formatDni', () => {
  it('añade el guion solo para mostrar', () => {
    expect(formatDni('12345678Z')).toBe('12345678-Z');
    expect(formatDni('X1234567L')).toBe('X1234567-L');
  });
});

describe('normalizarPrefijo', () => {
  it('normaliza a formato +NN', () => {
    expect(normalizarPrefijo('34')).toBe('+34');
    expect(normalizarPrefijo('+34')).toBe('+34');
    expect(normalizarPrefijo('0034')).toBe('+34');
    expect(normalizarPrefijo(' +34 ')).toBe('+34');
  });
});

describe('enlaceWhatsApp', () => {
  it('quita el + y los separadores', () => {
    expect(enlaceWhatsApp({ prefijo: '+34', numero: '600 00 00 00' }))
      .toBe('https://wa.me/34600000000');
    expect(enlaceWhatsApp({ prefijo: '34', numero: '600-000-000' }))
      .toBe('https://wa.me/34600000000');
  });

  it('null sin número, para no pintar un enlace muerto', () => {
    expect(enlaceWhatsApp(undefined)).toBeNull();
    expect(enlaceWhatsApp({ prefijo: '+34', numero: '' })).toBeNull();
  });
});
