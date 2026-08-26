import { describe, expect, it } from 'vitest';
import { BodyweightLog } from '../types';
import { coefAlometrico, e1rmAlometrico, pesoCorporalEn } from './allometricScore';

describe('coefAlometrico', () => {
  it('0.55 hombres, 0.50 mujeres', () => {
    expect(coefAlometrico('hombre')).toBe(0.55);
    expect(coefAlometrico('mujer')).toBe(0.50);
  });
});

describe('e1rmAlometrico', () => {
  it('un cliente más pesado con el mismo e1RM saca un score menor (corrige el sesgo del peso)', () => {
    const ligero = e1rmAlometrico(100, 70, 'hombre')!;
    const pesado = e1rmAlometrico(100, 100, 'hombre')!;
    expect(pesado).toBeLessThan(ligero);
  });

  it('valores <= 0 devuelven null', () => {
    expect(e1rmAlometrico(0, 70, 'hombre')).toBeNull();
    expect(e1rmAlometrico(100, 0, 'hombre')).toBeNull();
  });
});

describe('pesoCorporalEn', () => {
  const logs: BodyweightLog[] = [
    { id: '1', athleteId: 'a', date: '2026-07-01', weight: 80, createdAt: '' },
    { id: '2', athleteId: 'a', date: '2026-08-01', weight: 78, createdAt: '' },
  ];

  it('devuelve el último log con date <= fecha', () => {
    expect(pesoCorporalEn('2026-08-15', logs)).toBe(78);
    expect(pesoCorporalEn('2026-07-15', logs)).toBe(80);
  });

  it('nunca mira al futuro: sin logs anteriores a la fecha, null', () => {
    expect(pesoCorporalEn('2026-06-01', logs)).toBeNull();
  });
});
