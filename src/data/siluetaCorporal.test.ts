import { describe, it, expect } from 'vitest';
import { MUSCLE_ORDER, MuscleGroup } from '../types';
import {
  REGIONES_SILUETA, gruposDeVista, VIEWBOX_SILUETA, CONTORNO_SILUETA, EJE_X, espejo,
} from './siluetaCorporal';

const [, , ANCHO, ALTO] = VIEWBOX_SILUETA.split(' ').map(Number);

/** Todos los puntos de un path. Vale porque solo se usan comandos absolutos. */
function puntos(d: string): [number, number][] {
  const out: [number, number][] = [];
  for (const [, cmd, nums] of d.matchAll(/([MLCZ])([^MLCZ]*)/g)) {
    if (cmd === 'Z') continue;
    const vals = nums.trim().split(/[\s,]+/).filter(Boolean).map(Number);
    for (let i = 0; i + 1 < vals.length; i += 2) out.push([vals[i], vals[i + 1]]);
  }
  return out;
}

function caja(paths: string[]) {
  const pts = paths.flatMap(puntos);
  return {
    x0: Math.min(...pts.map(p => p[0])), x1: Math.max(...pts.map(p => p[0])),
    y0: Math.min(...pts.map(p => p[1])), y1: Math.max(...pts.map(p => p[1])),
  };
}

describe('espejo', () => {
  it('refleja cada coordenada X respecto al eje del cuerpo y deja la Y intacta', () => {
    expect(espejo('M60 100 L80 200 Z')).toBe('M140 100 L120 200 Z');
  });

  it('reflejar dos veces devuelve el original — la comprobación que caza un comando no soportado', () => {
    for (const g of MUSCLE_ORDER) {
      for (const d of REGIONES_SILUETA[g].paths) {
        const ida = espejo(d);
        const vuelta = espejo(ida);
        // Se comparan los PUNTOS, no la cadena: el reflejo normaliza espacios.
        expect(puntos(vuelta), `${g} no sobrevive al doble reflejo`).toEqual(puntos(d));
      }
    }
  });

  it('maneja las curvas con sus tres pares de control', () => {
    expect(espejo('M60 10 C50 20 55 30 70 40 Z')).toBe('M140 10 C150 20 145 30 130 40 Z');
  });

  it('todos los paths usan solo comandos absolutos M/L/C/Z', () => {
    const todos = [
      ...MUSCLE_ORDER.flatMap(g => REGIONES_SILUETA[g].paths),
      ...CONTORNO_SILUETA.frente, ...CONTORNO_SILUETA.espalda,
    ];
    for (const d of todos) {
      expect(d.replace(/[-\d.,\s]/g, ''), `comando no soportado en «${d.slice(0, 40)}…»`)
        .toMatch(/^[MLCZ]+$/);
    }
  });
});

describe('siluetaCorporal · cobertura', () => {
  it('los 17 grupos musculares tienen región: ninguno se queda sin sitio', () => {
    expect(Object.keys(REGIONES_SILUETA).sort()).toEqual([...MUSCLE_ORDER].sort());
  });

  it('cada grupo está en UNA sola vista, así que las dos listas no se solapan', () => {
    const frente = gruposDeVista('frente');
    const espalda = gruposDeVista('espalda');
    expect(frente.length + espalda.length).toBe(MUSCLE_ORDER.length);
    expect(frente.filter(g => espalda.includes(g))).toEqual([]);
  });

  it('cada grupo se dibuja en la vista desde la que se ve', () => {
    for (const g of ['pecho', 'deltoide_ant', 'deltoide_lat', 'biceps', 'core', 'cuadriceps', 'aductores', 'antebrazo'] as MuscleGroup[]) {
      expect(REGIONES_SILUETA[g].vista, g).toBe('frente');
    }
    for (const g of ['dorsal', 'trapecio', 'deltoide_post', 'triceps', 'lumbares', 'gluteo', 'isquios', 'gemelo', 'rotadores'] as MuscleGroup[]) {
      expect(REGIONES_SILUETA[g].vista, g).toBe('espalda');
    }
  });

  it('los tres «difíciles» tienen sitio, y solo los rotadores van marcados como profundos', () => {
    expect(REGIONES_SILUETA.core.vista).toBe('frente');
    expect(REGIONES_SILUETA.lumbares.vista).toBe('espalda');
    expect(REGIONES_SILUETA.rotadores.profundo).toBe(true);
    expect(MUSCLE_ORDER.filter(g => REGIONES_SILUETA[g].profundo)).toEqual(['rotadores']);
  });
});

describe('siluetaCorporal · geometría', () => {
  it('ninguna región se sale del lienzo', () => {
    for (const g of MUSCLE_ORDER) {
      const c = caja(REGIONES_SILUETA[g].paths);
      expect(c.x0, `${g} se sale por la izquierda`).toBeGreaterThanOrEqual(0);
      expect(c.y0, `${g} se sale por arriba`).toBeGreaterThanOrEqual(0);
      expect(c.x1, `${g} se sale por la derecha`).toBeLessThanOrEqual(ANCHO);
      expect(c.y1, `${g} se sale por abajo`).toBeLessThanOrEqual(ALTO);
    }
  });

  it('el contorno tampoco se sale', () => {
    const c = caja(CONTORNO_SILUETA.frente);
    expect(c.x0).toBeGreaterThanOrEqual(0);
    expect(c.y0).toBeGreaterThanOrEqual(0);
    expect(c.x1).toBeLessThanOrEqual(ANCHO);
    expect(c.y1).toBeLessThanOrEqual(ALTO);
  });

  it('cada región es simétrica respecto al eje del cuerpo', () => {
    for (const g of MUSCLE_ORDER) {
      const c = caja(REGIONES_SILUETA[g].paths);
      // El centro de la caja cae en el eje: es lo que garantiza `espejo()` y lo
      // que se rompería si alguien añadiera a mano solo un lado.
      expect((c.x0 + c.x1) / 2, `${g} está descentrado`).toBeCloseTo(EJE_X, 4);
    }
  });

  it('el ancla de la etiqueta cae dentro del lienzo y sobre el eje', () => {
    for (const g of MUSCLE_ORDER) {
      const [x, y] = REGIONES_SILUETA[g].centro;
      expect(x).toBe(EJE_X);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(ALTO);
    }
  });

  it('el contorno trae cabeza, cuello, tronco, brazos, manos, piernas y pies', () => {
    expect(CONTORNO_SILUETA.frente).toHaveLength(11);
    expect(CONTORNO_SILUETA.espalda).toEqual(CONTORNO_SILUETA.frente);
  });

  it('cada grupo se dibuja con sus vientres, no con una sola mancha', () => {
    // Lo que separa una lámina de anatomía de un montón de manchas. Los números
    // son por LADO × 2 salvo los centrados: recto abdominal en seis + oblicuos +
    // vértice púbico; cuádriceps con sus tres vastos; tríceps con dos cabezas;
    // trapecio en cúpula, fibras medias y punta lumbar.
    expect(REGIONES_SILUETA.core.paths).toHaveLength(9);
    expect(REGIONES_SILUETA.cuadriceps.paths).toHaveLength(6);
    expect(REGIONES_SILUETA.isquios.paths).toHaveLength(6);
    expect(REGIONES_SILUETA.gemelo.paths).toHaveLength(6);
    expect(REGIONES_SILUETA.trapecio.paths).toHaveLength(4);
    expect(REGIONES_SILUETA.pecho.paths).toHaveLength(4);

    // Y ningún grupo se queda en un óvalo suelto.
    for (const g of MUSCLE_ORDER) {
      expect(REGIONES_SILUETA[g].paths.length, `${g} es una sola mancha`).toBeGreaterThanOrEqual(2);
    }
  });

  it('la lámina entera tiene el detalle de un esquema anatómico', () => {
    const total = MUSCLE_ORDER.reduce((n, g) => n + REGIONES_SILUETA[g].paths.length, 0);
    expect(total).toBeGreaterThanOrEqual(60);
  });
});
