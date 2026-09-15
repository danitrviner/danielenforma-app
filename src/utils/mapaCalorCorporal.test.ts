import { describe, it, expect } from 'vitest';
import { MuscleGroup, MuscleGroupConfig, MUSCLE_ORDER } from '../types';
import { VOLUME_LANDMARKS_DEFAULT } from '../data/volumeLandmarks';
import { construirMapaCalor, hayVolumenProgramado, gruposQueDestacar } from './mapaCalorCorporal';

/** `Mesocycle.groups` es un Record COMPLETO: los grupos que no se entrenan van a 0. */
function groups(parcial: Partial<Record<MuscleGroup, MuscleGroupConfig>>): Record<MuscleGroup, MuscleGroupConfig> {
  const base = {} as Record<MuscleGroup, MuscleGroupConfig>;
  for (const g of MUSCLE_ORDER) base[g] = { series: 0, priority: 'media' };
  return { ...base, ...parcial } as Record<MuscleGroup, MuscleGroupConfig>;
}

const celda = (celdas: ReturnType<typeof construirMapaCalor>, g: MuscleGroup) =>
  celdas.find(c => c.group === g)!;

describe('construirMapaCalor · normalización a series por semana (R1)', () => {
  // El fallo que este bloque existe para impedir: los landmarks son semanales
  // (dorsal MRV = 25) y lo realizado llega como total de la ventana. Un meso de
  // 5 semanas con 50 series de dorsal son 10/semana — zona productiva — no 50.
  const realizadas = new Map<MuscleGroup, number>([['dorsal', 50]]);

  it('divide el total de la ventana entre sus semanas', () => {
    const c = celda(construirMapaCalor({ realizadas, semanasDeLaVentana: 5 }), 'dorsal');
    expect(c.realizadasSemana).toBe(10);
    expect(c.zona).toBe('productivo');
  });

  it('sin normalizar, las mismas series caerían en MRV — la ventana de 1 semana lo demuestra', () => {
    const c = celda(construirMapaCalor({ realizadas, semanasDeLaVentana: 1 }), 'dorsal');
    expect(c.realizadasSemana).toBe(50);
    expect(c.zona).toBe('mrv');
  });

  it('una ventana de 0 semanas no produce Infinity', () => {
    const c = celda(construirMapaCalor({ realizadas, semanasDeLaVentana: 0 }), 'dorsal');
    expect(Number.isFinite(c.realizadasSemana)).toBe(true);
    expect(c.realizadasSemana).toBe(50);
  });

  it('redondea a un decimal en vez de escupir 3,3333333', () => {
    const c = celda(construirMapaCalor({
      realizadas: new Map([['pecho', 10]]), semanasDeLaVentana: 3,
    }), 'pecho');
    expect(c.realizadasSemana).toBe(3.3);
  });
});

describe('construirMapaCalor · lo planificado y la prioridad', () => {
  it('lee series y prioridad de `groups`, que ya es semanal', () => {
    const c = celda(construirMapaCalor({
      realizadas: new Map([['pecho', 48]]),
      groups: groups({ pecho: { series: 12, priority: 'alta' } }),
      semanasDeLaVentana: 4,
    }), 'pecho');
    expect(c.planificadasSemana).toBe(12);
    expect(c.prioridad).toBe('alta');
    expect(c.cumplimientoPct).toBe(100); // 48/4 = 12
  });

  it('detecta que se ha quedado corto', () => {
    const c = celda(construirMapaCalor({
      realizadas: new Map([['pecho', 36]]),
      groups: groups({ pecho: { series: 12, priority: 'alta' } }),
      semanasDeLaVentana: 4,
    }), 'pecho');
    expect(c.cumplimientoPct).toBe(75);
  });

  it('un grupo programado a 0 series es «sin plan», no «0 % cumplido»', () => {
    const c = celda(construirMapaCalor({
      realizadas: new Map([['gemelo', 8]]),
      groups: groups({ gemelo: { series: 0, priority: 'baja' } }),
      semanasDeLaVentana: 4,
    }), 'gemelo');
    expect(c.planificadasSemana).toBeNull();
    expect(c.cumplimientoPct).toBeNull();
  });

  it('sin mesociclo no hay ni plan ni prioridad, pero sí zona', () => {
    const c = celda(construirMapaCalor({
      realizadas: new Map([['biceps', 40]]), semanasDeLaVentana: 4,
    }), 'biceps');
    expect(c.planificadasSemana).toBeNull();
    expect(c.prioridad).toBeNull();
    expect(c.zona).toBe('mav'); // 10/sem, bíceps mavMin 8 mavMax 14
  });

  it('`planificadasSemana` explícito gana a `groups`', () => {
    const c = celda(construirMapaCalor({
      realizadas: new Map([['dorsal', 20]]),
      planificadasSemana: new Map([['dorsal', 16]]),
      groups: groups({ dorsal: { series: 12, priority: 'alta' } }),
      semanasDeLaVentana: 2,
    }), 'dorsal');
    expect(c.planificadasSemana).toBe(16);
    expect(c.prioridad).toBe('alta'); // la prioridad se sigue leyendo de groups
  });
});

describe('construirMapaCalor · forma de la salida', () => {
  it('devuelve los 17 grupos en MUSCLE_ORDER, también los que están a cero', () => {
    const celdas = construirMapaCalor({ realizadas: new Map(), semanasDeLaVentana: 4 });
    expect(celdas).toHaveLength(MUSCLE_ORDER.length);
    expect(celdas.map(c => c.group)).toEqual(MUSCLE_ORDER);
    expect(celdas.every(c => c.realizadasSemana === 0 && c.zona === 'sin_volumen')).toBe(true);
  });

  it('trae etiqueta, zona en texto y colores como variables del tema, sin hex', () => {
    const c = celda(construirMapaCalor({
      realizadas: new Map([['cuadriceps', 48]]), semanasDeLaVentana: 4,
    }), 'cuadriceps');
    expect(c.label).toBe('Cuádriceps');
    expect(c.labelCorto).toBe('Cuáds');
    expect(c.zonaLabel).toBe('MAV');
    expect(c.colorTexto.startsWith('var(--')).toBe(true);
    expect(c.fill).not.toMatch(/#[0-9a-f]{3,6}/i);
  });

  it('usa el landmark del GRUPO, no un umbral genérico', () => {
    // 7 series/semana: MEV para dorsal (mev 10), productivo para antebrazo (mev 0).
    const celdas = construirMapaCalor({
      realizadas: new Map<MuscleGroup, number>([['dorsal', 7], ['antebrazo', 7]]),
      semanasDeLaVentana: 1,
    });
    expect(celda(celdas, 'dorsal').zona).toBe('mev');
    expect(celda(celdas, 'antebrazo').zona).toBe('mrv'); // antebrazo mavMax 6
    expect(celda(celdas, 'dorsal').landmark).toEqual(VOLUME_LANDMARKS_DEFAULT.dorsal);
  });

  it('acepta landmarks editados por el coach', () => {
    const propios = { ...VOLUME_LANDMARKS_DEFAULT, pecho: { mv: 0, mev: 2, mavMin: 3, mavMax: 4, mrv: 5 } };
    const c = celda(construirMapaCalor({
      realizadas: new Map([['pecho', 6]]), landmarks: propios, semanasDeLaVentana: 1,
    }), 'pecho');
    expect(c.zona).toBe('mrv');
  });
});

describe('hayVolumenProgramado', () => {
  it('distingue «no había plan» de «no lo ha cumplido»', () => {
    const sinPlan = construirMapaCalor({ realizadas: new Map([['pecho', 10]]), semanasDeLaVentana: 1 });
    expect(hayVolumenProgramado(sinPlan)).toBe(false);

    const conPlan = construirMapaCalor({
      realizadas: new Map(), groups: groups({ pecho: { series: 12, priority: 'alta' } }), semanasDeLaVentana: 1,
    });
    expect(hayVolumenProgramado(conPlan)).toBe(true);
  });

  it('un mesociclo con todos los grupos a 0 cuenta como sin volumen programado', () => {
    const celdas = construirMapaCalor({ realizadas: new Map(), groups: groups({}), semanasDeLaVentana: 4 });
    expect(hayVolumenProgramado(celdas)).toBe(false);
  });
});

describe('gruposQueDestacar', () => {
  it('pone delante el grupo prioritario que no se está entrenando', () => {
    const celdas = construirMapaCalor({
      realizadas: new Map<MuscleGroup, number>([['gemelo', 40], ['pecho', 40]]),
      groups: groups({
        dorsal: { series: 16, priority: 'alta' },   // programado y a CERO
        pecho:  { series: 10, priority: 'media' },  // cumplido
        gemelo: { series: 10, priority: 'baja' },   // pasado de rosca, pero da igual
      }),
      semanasDeLaVentana: 4,
    });
    expect(gruposQueDestacar(celdas, 1)[0].group).toBe('dorsal');
  });

  it('no saca grupos que ni se programaron ni se entrenaron', () => {
    const celdas = construirMapaCalor({
      realizadas: new Map([['pecho', 10]]), semanasDeLaVentana: 1,
    });
    const destacados = gruposQueDestacar(celdas, 17);
    expect(destacados).toHaveLength(1);
    expect(destacados[0].group).toBe('pecho');
  });
});
