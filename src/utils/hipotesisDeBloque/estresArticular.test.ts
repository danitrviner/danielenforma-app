import { describe, expect, it } from 'vitest';
import type { WorkoutLog } from '../../types';
import catalogoPrueba from '../cdg/__fixtures__/catalogoPrueba.json';
import { crearMotor, expandirCatalogo, type CdgCatalogoCompacto } from '../cdg';
import { addDays } from '../trainingWeek';
import type { EstadoDelBloque } from './estadoDelBloqueAnterior';
import {
  articulacionesEnFrase, estresArticularMedioDelBloque, limitesEnLinea, limitesTrasAceptar, notaDeVigilancia,
  propuestaArticular, textoDeVigilar,
} from './estresArticular';

// Dani, 18-11-2026: «me parece bien; incluso que se controle el índice articular de la zona».

describe('la línea de vigilar', () => {
  it('junta las articulaciones por la parte del cuerpo', () => {
    expect(articulacionesEnFrase(['Hombro Articular', 'Hombro Tendinoso Compresivo', 'Hombro Tendinoso Tensil']))
      .toBe('hombro (articular, tendinoso compresivo y tendinoso tensil)');
    expect(articulacionesEnFrase(['Cadera Articular', 'Columna Cizalla'])).toBe('cadera (articular) y columna (cizalla)');
    expect(articulacionesEnFrase(['Hombro Articular'])).toBe('hombro (articular)');
  });

  it('usa las articulaciones que el método asigna a la zona; sin ninguna, no hay línea', () => {
    expect(textoDeVigilar('pectoral')).toBe('Vigilar el estrés articular de hombro (articular, tendinoso compresivo y tendinoso tensil)');
    expect(textoDeVigilar('gluteo')).toBe('Vigilar el estrés articular de cadera (articular)');
    expect(textoDeVigilar('isquios')).toBe('Vigilar el estrés articular de cadera (articular) y columna (cizalla)');
    expect(textoDeVigilar('biceps')).toBeNull();
  });
});

describe('propuestaArticular', () => {
  const molestias = [{ zona: 'pectoral' as const, veces: 2, maxima: 6 }];
  const medio = { 'Hombro Articular': 6.27, 'Hombro Tendinoso Compresivo': 2.04, 'Hombro Tendinoso Tensil': 3.19, 'Rodilla Articular': 9 };

  it('sin molestias no propone nada', () => {
    expect(propuestaArticular({ molestias: [], estresMedio: medio })).toEqual({ vigilar: [], limites: [] });
    expect(propuestaArticular({ molestias: [{ zona: 'pectoral', veces: 0, maxima: null }], estresMedio: medio }).vigilar).toEqual([]);
  });

  it('con molestia: la línea de la zona y, como límite, la media semanal del bloque, nunca más alta', () => {
    const p = propuestaArticular({ molestias, estresMedio: medio });
    expect(p.vigilar).toHaveLength(1);
    expect(p.vigilar[0].texto).toBe('Vigilar el estrés articular de hombro (articular, tendinoso compresivo y tendinoso tensil): molestia apuntada en pectoral (2 sesiones, hasta 6/10).');
    // Hacia abajo a un decimal: 6,27 → 6,2 (no 6,3). Solo las articulaciones de la zona: la rodilla no entra.
    expect(p.limites).toEqual([
      { articulacion: 'Hombro Articular', limite: 6.2 },
      { articulacion: 'Hombro Tendinoso Compresivo', limite: 2 },
      { articulacion: 'Hombro Tendinoso Tensil', limite: 3.1 },
    ]);
    for (const l of p.limites) expect(l.limite).toBeLessThanOrEqual(medio[l.articulacion as keyof typeof medio]);
  });

  it('sin poder calcular el estrés (sin motor CDG) deja solo la línea', () => {
    const p = propuestaArticular({ molestias });
    expect(p.vigilar).toHaveLength(1);
    expect(p.limites).toEqual([]);
  });

  it('una zona sin articulaciones asignadas no da línea ni límite', () => {
    expect(propuestaArticular({ molestias: [{ zona: 'biceps', veces: 3, maxima: 7 }], estresMedio: medio })).toEqual({ vigilar: [], limites: [] });
  });

  it('nunca sube un límite que el atleta ya tiene: si es igual o más bajo no se propone; si es más alto, se dice cuál tenía', () => {
    const p = propuestaArticular({
      molestias, estresMedio: medio,
      limitesActuales: { 'Hombro Articular': 3, 'Hombro Tendinoso Compresivo': 2, 'Hombro Tendinoso Tensil': 5, 'Rodilla Articular': 0 },
    });
    expect(p.limites).toEqual([{ articulacion: 'Hombro Tendinoso Tensil', limite: 3.1, actual: 5 }]);
    expect(limitesEnLinea(p.limites)).toBe('Hombro Tendinoso Tensil 3,1 (tenía 5)');
  });

  it('dos zonas que comparten articulación: se propone una sola vez', () => {
    const p = propuestaArticular({ molestias: [...molestias, { zona: 'deltoides', veces: 1, maxima: null }], estresMedio: medio });
    expect(p.vigilar.map(v => v.zona)).toEqual(['pectoral', 'deltoides']);
    expect(p.vigilar[1].texto).toContain('molestia apuntada en deltoides (1 sesión).');
    expect(p.limites.map(l => l.articulacion)).toEqual(['Hombro Articular', 'Hombro Tendinoso Compresivo', 'Hombro Tendinoso Tensil']);
    expect(notaDeVigilancia(p)).toBe(p.vigilar.map(v => v.texto).join(' '));
  });

  it('aceptar: se suman a los que tenía, sin subir ninguno', () => {
    const tras = limitesTrasAceptar({ 'Rodilla Articular': 4, 'Hombro Articular': 5, 'Columna Cizalla': 0 }, [
      { articulacion: 'Hombro Articular', limite: 6.2 }, { articulacion: 'Hombro Tendinoso Tensil', limite: 3.1 },
    ]);
    expect(tras).toEqual({ 'Rodilla Articular': 4, 'Hombro Articular': 5, 'Hombro Tendinoso Tensil': 3.1 });
  });
});

describe('estresArticularMedioDelBloque', () => {
  const motor = crearMotor(expandirCatalogo(catalogoPrueba as CdgCatalogoCompacto));
  const PRESS = 'Press banca plano con mancuernas (caja torácica amplia) - Pectoral, deltoides anterior, tríceps';
  const nombreCdgDe = (id: string) => (id === 'press' ? PRESS : undefined);
  const INICIO = '2026-08-24';
  const log = (date: string, series: number): WorkoutLog => ({
    id: date, athleteId: 'ana@x.com', workoutId: 'w', assignmentId: 'x', mesocycleId: 'm2', date, completedAt: `${date}T18:00:00.000Z`,
    entries: [{ exerciseId: 'press', sets: Array.from({ length: series }, () => ({ weight: 30, repsDone: 10, rir: 1 })) }],
  } as WorkoutLog);
  const semana = (i: number, o: Partial<EstadoDelBloque['semanas'][number]> = {}): EstadoDelBloque['semanas'][number] =>
    ({ semana: i + 1, inicio: addDays(INICIO, i * 7), cuenta: true, motivo: null, entrenada: true, ...o });

  it('la media de las semanas que cuentan y se entrenaron, por articulación', () => {
    // S1: 4 series; S2: 8 series; S3 sin entrenar; S4 descarga (no cuenta).
    const logs = [log(addDays(INICIO, 1), 4), log(addDays(INICIO, 8), 8), log(addDays(INICIO, 22), 20)];
    const semanas = [semana(0), semana(1), semana(2, { entrenada: false }), semana(3, { cuenta: false, motivo: 'descarga' })];
    const medio = estresArticularMedioDelBloque({ motor, logs, nombreCdgDe, semanas });
    const soloS1 = estresArticularMedioDelBloque({ motor, logs, nombreCdgDe, semanas: [semana(0)] });
    const soloS2 = estresArticularMedioDelBloque({ motor, logs, nombreCdgDe, semanas: [semana(1)] });
    const articulaciones = Object.keys(medio);
    expect(articulaciones.length).toBeGreaterThan(0);
    expect(articulaciones.every(a => motor.articulaciones.includes(a))).toBe(true);
    for (const a of articulaciones) {
      // Ni la semana sin entrenar ni la descarga entran en la media.
      expect(medio[a]).toBeCloseTo((soloS1[a] + soloS2[a]) / 2, 1);
      expect(soloS2[a]).toBeGreaterThan(soloS1[a]);
    }
  });

  it('sin semanas entrenadas o sin ejercicios vinculados al catálogo, vacío', () => {
    expect(estresArticularMedioDelBloque({ motor, logs: [], nombreCdgDe, semanas: [semana(0, { entrenada: false })] })).toEqual({});
    expect(estresArticularMedioDelBloque({ motor, logs: [log(addDays(INICIO, 1), 4)], nombreCdgDe: () => undefined, semanas: [semana(0)] })).toEqual({});
  });
});
