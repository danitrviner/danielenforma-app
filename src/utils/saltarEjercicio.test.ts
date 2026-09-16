import { describe, it, expect } from 'vitest';
import { conMotivo, esNotaDeSaltado, textoDeMotivo, motivoDeLaNota, MOTIVOS_SALTAR } from './saltarEjercicio';

describe('saltarEjercicio', () => {
  it('escribe el motivo en cristiano', () => {
    expect(textoDeMotivo('ocupada')).toBe('No lo hice: máquina ocupada');
    expect(textoDeMotivo('molestia')).toBe('No lo hice: me molestaba');
  });

  it('todos los motivos generan una nota reconocible', () => {
    for (const m of MOTIVOS_SALTAR) expect(esNotaDeSaltado(textoDeMotivo(m.clave))).toBe(true);
  });

  it('no pisa lo que el atleta ya había escrito', () => {
    expect(conMotivo('El banco estaba roto', 'ocupada'))
      .toBe('No lo hice: máquina ocupada\nEl banco estaba roto');
  });

  it('tocar otro motivo lo cambia en vez de acumularlo', () => {
    const primera = conMotivo('', 'ocupada');
    expect(conMotivo(primera, 'molestia')).toBe('No lo hice: me molestaba');
  });

  it('tocar el mismo motivo lo quita: si acaba haciéndolo, la nota no puede mentir', () => {
    const primera = conMotivo('Probé con mancuernas', 'ocupada');
    expect(conMotivo(primera, 'ocupada')).toBe('Probé con mancuernas');
    expect(conMotivo(conMotivo('', 'tiempo'), 'tiempo')).toBe('');
  });

  it('sabe qué motivo está marcado', () => {
    expect(motivoDeLaNota(conMotivo('', 'cansado'))).toBe('cansado');
    expect(motivoDeLaNota('Hombro regular')).toBeNull();
  });

  it('cambiar de motivo conserva el texto libre', () => {
    const primera = conMotivo('Probé con mancuernas', 'ocupada');
    expect(conMotivo(primera, 'tiempo')).toBe('No lo hice: sin tiempo\nProbé con mancuernas');
  });

  it('una nota normal no se confunde con un saltado', () => {
    expect(esNotaDeSaltado('Molestia leve en el hombro')).toBe(false);
    expect(esNotaDeSaltado(undefined)).toBe(false);
  });
});
