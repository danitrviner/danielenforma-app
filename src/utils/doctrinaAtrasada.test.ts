import { describe, it, expect } from 'vitest';
import { huella, esElPorDefecto, lineasQueFaltan, doctrinaAtrasada } from './doctrinaAtrasada';

const V1 = '### 1. Volumen\n8-12 series por sesión\n\n### 2. Descanso\n2-3 min';
const V2 = '### 1. Volumen\nHasta 8 series por sesión\n\n### 2. Descanso\n2-3 min\nUsa la calculadora';

describe('doctrina guardada que se queda atrás', () => {
  it('la huella distingue versiones y es estable', () => {
    expect(huella(V1)).toBe(huella(V1));
    expect(huella(V1)).not.toBe(huella(V2));
  });

  it('el texto por defecto con espacios de más no es una copia', () => {
    expect(esElPorDefecto(`  ${V1}\n\n`, V1)).toBe(true);
    expect(esElPorDefecto(`${V1}\nUna regla mía`, V1)).toBe(false);
  });

  it('dice qué líneas del texto actual no tiene la copia', () => {
    expect(lineasQueFaltan(V1, V2)).toEqual(['Hasta 8 series por sesión', 'Usa la calculadora']);
  });

  it('una copia que parte de la versión actual está al día aunque le quite líneas', () => {
    const mia = V2.replace('\nUsa la calculadora', '\nUna regla mía');
    expect(doctrinaAtrasada({ text: mia, base: huella(V2) }, V2)).toBeNull();
  });

  it('si el texto por defecto cambió después de guardar, avisa con seguridad', () => {
    const r = doctrinaAtrasada({ text: `${V1}\nUna regla mía`, base: huella(V1), updatedAt: '2026-09-02T21:06:01.423Z' }, V2);
    expect(r).toMatchObject({ seguro: true, desde: '2026-09-02T21:06:01.423Z' });
    expect(r!.faltan).toHaveLength(2);
  });

  it('una copia antigua sin huella avisa, pero sin asegurar que no fuera a propósito', () => {
    expect(doctrinaAtrasada({ text: V1 }, V2)).toMatchObject({ seguro: false });
    expect(doctrinaAtrasada({ text: V2 }, V2)).toBeNull();
  });
});
