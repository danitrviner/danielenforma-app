import { describe, it, expect } from 'vitest';
import { encajaCategoria, encajaRapidas, CAT_BASICAS } from './recetasHidratacion';

describe('encajaCategoria', () => {
  const basica = { categoria: 'Platos salados / principales', basica: true };
  const normal = { categoria: 'Platos salados / principales' };

  it('«Todas» y vacío dejan pasar cualquier receta', () => {
    expect(encajaCategoria(normal, 'Todas')).toBe(true);
    expect(encajaCategoria(normal, undefined)).toBe(true);
  });

  it('«Rápidas» no es una categoría: mira la marca, sea cual sea la categoría', () => {
    expect(encajaCategoria(basica, CAT_BASICAS)).toBe(true);
    expect(encajaCategoria(normal, CAT_BASICAS)).toBe(false);
    expect(encajaCategoria({ categoria: 'Desayuno y dulces', basica: true }, CAT_BASICAS)).toBe(true);
  });

  it('una básica sigue saliendo en su categoría de siempre', () => {
    expect(encajaCategoria(basica, 'Platos salados / principales')).toBe(true);
    expect(encajaCategoria(basica, 'Desayuno y dulces')).toBe(false);
  });
});

describe('encajaRapidas', () => {
  const inmediata = { categoria: 'Platos salados / principales', basica: true, cookingTime: 5, tupper: true };
  const doce = { categoria: 'Platos salados / principales', basica: true, cookingTime: 12, tupper: false };

  it('el tope de minutos usa los minutos reales', () => {
    expect(encajaRapidas(inmediata, '5')).toBe(true);
    expect(encajaRapidas(doce, '5')).toBe(false);
    expect(encajaRapidas(doce, '10')).toBe(false);
    expect(encajaRapidas(doce, '15')).toBe(true);
  });

  it('sin minutos no pasa un tope (no se promete «inmediata» sin dato)', () => {
    expect(encajaRapidas({}, '15')).toBe(false);
    expect(encajaRapidas({}, '')).toBe(true);
  });

  it('«Para tupper» mira la marca', () => {
    expect(encajaRapidas(inmediata, 'tupper')).toBe(true);
    expect(encajaRapidas(doce, 'tupper')).toBe(false);
  });

  it('el subfiltro solo cuenta dentro de la pestaña Rápidas', () => {
    expect(encajaCategoria(doce, CAT_BASICAS, '5')).toBe(false);
    expect(encajaCategoria(doce, 'Platos salados / principales', '5')).toBe(true);
    expect(encajaCategoria(doce, 'Todas', '5')).toBe(true);
  });
});
