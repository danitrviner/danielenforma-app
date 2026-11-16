import { describe, it, expect } from 'vitest';
import { conNivel, conRetoque, libertadVigente, limitesDe, nivelDeFila, permisosDe, racionesPermitidas, resumenDeLibertad } from './libertadDelAtleta';

describe('nivel de libertad', () => {
  it('sin nada guardado, o con un dato roto, es Flexible', () => {
    expect(permisosDe(undefined)).toEqual({ platoConReajuste: true, pasoDeRacion: 0.5, caprichosPorSemana: 2, proteinaMinPct: 0.9 });
    expect(libertadVigente({ nivel: 'otro' } as never)).toEqual({ nivel: 'flexible' });
  });

  it('Guiado: solo equivalentes, un cuarto de ración, sin caprichos propios', () => {
    expect(permisosDe({ nivel: 'guiado' })).toEqual({ platoConReajuste: false, pasoDeRacion: 0.25, caprichosPorSemana: 0, proteinaMinPct: 0.95 });
  });

  it('Libre: sin topes de ración ni de caprichos', () => {
    const p = permisosDe({ nivel: 'libre' });
    expect(p.pasoDeRacion).toBe(Infinity);
    expect(p.caprichosPorSemana).toBe(Infinity);
    expect(limitesDe({ nivel: 'libre' }).proteinaMinPct).toBe(0.85);
  });

  it('una fila retocada va a su nivel y el resto no cambia', () => {
    const l = conRetoque({ nivel: 'flexible' }, 'racion', 'guiado');
    expect(nivelDeFila(l, 'racion')).toBe('guiado');
    expect(permisosDe(l)).toEqual({ platoConReajuste: true, pasoDeRacion: 0.25, caprichosPorSemana: 2, proteinaMinPct: 0.9 });
    expect(resumenDeLibertad(l)).toBe('Flexible · 1 retoque');
  });

  it('retocar al nivel del cliente quita el retoque; cambiar de nivel los borra', () => {
    const l = conRetoque({ nivel: 'flexible' }, 'racion', 'guiado');
    expect(conRetoque(l, 'racion', 'flexible')).toEqual({ nivel: 'flexible' });
    expect(conNivel('libre')).toEqual({ nivel: 'libre' });
  });

  it('raciones permitidas: a un paso de lo pautado, y la actual siempre', () => {
    const posibles = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
    expect(racionesPermitidas(posibles, 1, 1, 0.25)).toEqual([0.75, 1, 1.25]);
    expect(racionesPermitidas(posibles, 1, 2, 0.5)).toEqual([0.5, 0.75, 1, 1.25, 1.5, 2]);
    expect(racionesPermitidas(posibles, 1, 1, Infinity)).toEqual(posibles);
  });
});
