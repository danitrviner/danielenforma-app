import { describe, expect, it } from 'vitest';
import { medirViewport, ALTURA_MINIMA_TECLADO } from './anclajeViewport';

describe('medirViewport', () => {
  it('viewports iguales: sin hueco ni zoom', () => {
    expect(medirViewport({ offsetTop: 0, height: 812, scale: 1 }, 812)).toEqual({ hueco: 0, ampliada: false });
  });

  it('teclado abierto en iOS: el hueco supera el umbral de teclado', () => {
    const { hueco, ampliada } = medirViewport({ offsetTop: 0, height: 476, scale: 1 }, 812);
    expect(hueco).toBe(336);
    expect(hueco).toBeGreaterThan(ALTURA_MINIMA_TECLADO);
    expect(ampliada).toBe(false);
  });

  it('rebote del scroll arriba del todo (offsetTop negativo): sin hueco', () => {
    expect(medirViewport({ offsetTop: -40, height: 812, scale: 1 }, 812).hueco).toBe(0);
  });

  it('hueco pequeño sin zoom (barra de Safari animándose): se mide pero no cuenta como ampliada', () => {
    expect(medirViewport({ offsetTop: 0, height: 760, scale: 1 }, 812)).toEqual({ hueco: 52, ampliada: false });
  });

  it('página ampliada con el visual arriba: hueco y ampliada', () => {
    expect(medirViewport({ offsetTop: 0, height: 406, scale: 2 }, 812)).toEqual({ hueco: 406, ampliada: true });
  });

  it('redondeo de viewports fraccionarios: menos de 1 px no es hueco', () => {
    expect(medirViewport({ offsetTop: 0, height: 811.4, scale: 1.004 }, 812)).toEqual({ hueco: 0, ampliada: false });
  });
});
