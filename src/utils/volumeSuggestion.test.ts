import { describe, expect, it } from 'vitest';
import { MuscleGroup, MUSCLE_ORDER } from '../types';
import { VOLUME_LANDMARKS_DEFAULT } from '../data/volumeLandmarks';
import { suggestVolume, VolumeSuggestionInput, SERIES_POR_DIA_TOPE } from './volumeSuggestion';
import type { VolumeHistory } from './volumeHistory';

type Prioridad = 'alta' | 'media' | 'baja';

const prioridades = (parcial: Partial<Record<MuscleGroup, Prioridad>> = {}) =>
  Object.fromEntries(MUSCLE_ORDER.map(g => [g, parcial[g] ?? 'media'])) as Record<MuscleGroup, Prioridad>;

/**
 * Todo en «baja» menos el grupo que se está mirando. Sin esto el total de los
 * 17 grupos se pasa del tope semanal y el recorte proporcional tapa justo lo
 * que quiere comprobar cada caso.
 */
const soloUno = (group: MuscleGroup, prio: Prioridad = 'media') =>
  Object.fromEntries(MUSCLE_ORDER.map(g => [g, g === group ? prio : 'baja'])) as Record<MuscleGroup, Prioridad>;

const base = (over: Partial<VolumeSuggestionInput> = {}): VolumeSuggestionInput => ({
  landmarks: VOLUME_LANDMARKS_DEFAULT,
  daysPerWeek: 6,
  level: 'intermedio',
  intent: 'estandar',
  priorities: prioridades(),
  ...over,
});

const L = VOLUME_LANDMARKS_DEFAULT;
const mid = (g: MuscleGroup) => Math.round((L[g].mavMin + L[g].mavMax) / 2);

describe('suggestVolume · base por nivel', () => {
  it('un principiante arranca en el mínimo efectivo del grupo', () => {
    const r = suggestVolume(base({ level: 'principiante', priorities: soloUno('pecho') }));
    expect(r.groups.pecho.series).toBe(L.pecho.mev);
  });

  it('un intermedio arranca en la entrada del rango adaptativo', () => {
    const r = suggestVolume(base({ level: 'intermedio', priorities: soloUno('pecho') }));
    expect(r.groups.pecho.series).toBe(L.pecho.mavMin);
  });

  it('un avanzado arranca en la mitad del rango adaptativo', () => {
    const r = suggestVolume(base({ level: 'avanzado', priorities: soloUno('pecho') }));
    expect(r.groups.pecho.series).toBe(mid('pecho'));
  });

  it('usa el rango de CADA grupo, no un número único para los 17', () => {
    const pecho = suggestVolume(base({ priorities: soloUno('pecho') })).groups.pecho.series;
    const antebrazo = suggestVolume(base({ priorities: soloUno('antebrazo') })).groups.antebrazo.series;
    expect(pecho).toBe(L.pecho.mavMin);
    expect(antebrazo).toBe(L.antebrazo.mavMin);
    expect(pecho).not.toBe(antebrazo);
  });
});

describe('suggestVolume · la prioridad por fin significa algo', () => {
  it('prioridad alta sube un escalón dentro del rango del grupo', () => {
    const media = suggestVolume(base({ priorities: soloUno('pecho', 'media') })).groups.pecho.series;
    const alta  = suggestVolume(base({ priorities: soloUno('pecho', 'alta') })).groups.pecho.series;
    expect(alta).toBe(mid('pecho'));
    expect(alta).toBeGreaterThan(media);
  });

  it('prioridad baja cae al volumen de mantenimiento', () => {
    const r = suggestVolume(base({ priorities: soloUno('pecho', 'baja') }));
    expect(r.groups.pecho.series).toBe(L.pecho.mv);
  });

  it('especialización: el grupo prioritario queda por encima de los relegados', () => {
    const r = suggestVolume(base({ priorities: soloUno('pecho', 'alta') }));
    expect(r.groups.pecho.series).toBeGreaterThan(r.groups.dorsal.series);
    expect(r.groups.dorsal.series).toBe(L.dorsal.mv);
  });

  it('conserva la prioridad recibida en el resultado', () => {
    const r = suggestVolume(base({ priorities: prioridades({ pecho: 'alta', gemelo: 'baja' }) }));
    expect(r.groups.pecho.priority).toBe('alta');
    expect(r.groups.gemelo.priority).toBe('baja');
  });
});

describe('suggestVolume · dial de intención', () => {
  it('conservador propone menos que estándar y agresivo más', () => {
    const p = soloUno('pecho');
    const conservador = suggestVolume(base({ intent: 'conservador', priorities: p })).groups.pecho.series;
    const estandar    = suggestVolume(base({ intent: 'estandar',    priorities: p })).groups.pecho.series;
    const agresivo    = suggestVolume(base({ intent: 'agresivo',    priorities: p })).groups.pecho.series;
    expect(conservador).toBeLessThan(estandar);
    expect(agresivo).toBeGreaterThan(estandar);
  });
});

describe('suggestVolume · historial', () => {
  const historial = (over: Partial<VolumeHistory> = {}): VolumeHistory => ({
    adherencePct: null, meanRir: null, groups: {}, ...over,
  });

  it('premia un bloque cumplido y entrenado cerca del fallo', () => {
    const p = soloUno('pecho', 'alta');
    const sin = suggestVolume(base({ priorities: p }));
    const con = suggestVolume(base({ priorities: p, history: historial({ adherencePct: 95, meanRir: 1.5 }) }));
    expect(con.groups.pecho.series).toBe(sin.groups.pecho.series + 2);
  });

  it('los grupos en prioridad media suben solo una serie', () => {
    const p = soloUno('pecho', 'media');
    const sin = suggestVolume(base({ priorities: p }));
    const con = suggestVolume(base({ priorities: p, history: historial({ adherencePct: 95, meanRir: 1.5 }) }));
    expect(con.groups.pecho.series).toBe(sin.groups.pecho.series + 1);
  });

  it('no premia si cumplió pero entrenó lejos del fallo', () => {
    const p = soloUno('pecho');
    const sin = suggestVolume(base({ priorities: p }));
    const con = suggestVolume(base({ priorities: p, history: historial({ adherencePct: 95, meanRir: 4 }) }));
    expect(con.groups.pecho.series).toBe(sin.groups.pecho.series);
  });

  it('con adherencia baja pone el techo en lo que de verdad completó', () => {
    const r = suggestVolume(base({
      priorities: soloUno('pecho'),
      history: historial({ adherencePct: 45, groups: { pecho: { planned: 12, performed: 5, deltaPct: -58 } } }),
    }));
    expect(r.groups.pecho.series).toBe(5);
    expect(r.reasons.pecho.join(' ')).toContain('45%');
  });

  it('un grupo muy por debajo de lo programado no sube por encima de lo que ya tenía', () => {
    const r = suggestVolume(base({
      level: 'avanzado', priorities: soloUno('pecho'),
      history: historial({ adherencePct: 85, groups: { pecho: { planned: 8, performed: 4, deltaPct: -50 } } }),
    }));
    expect(r.groups.pecho.series).toBe(8);
  });

  it('sin historial propone solo por reglas, sin romperse', () => {
    const r = suggestVolume(base());
    expect(r.totalSeries).toBeGreaterThan(0);
  });
});

describe('suggestVolume · feedback del atleta', () => {
  const conFeedback = (fb: Partial<NonNullable<VolumeHistory['feedback']>>): VolumeHistory => ({
    adherencePct: null, meanRir: null, groups: {},
    feedback: { priorityGroups: [], overloadGroups: [], doms: {}, ...fb },
  });

  it('sube el grupo que el atleta pidió priorizar', () => {
    const p = soloUno('pecho');
    const sin = suggestVolume(base({ priorities: p }));
    const con = suggestVolume(base({ priorities: p, history: conFeedback({ priorityGroups: ['pecho'] }) }));
    expect(con.groups.pecho.series).toBeGreaterThan(sin.groups.pecho.series);
  });

  it('baja el grupo en el que dijo que le sobró volumen', () => {
    const p = soloUno('pecho');
    const sin = suggestVolume(base({ priorities: p }));
    const con = suggestVolume(base({ priorities: p, history: conFeedback({ overloadGroups: ['pecho'] }) }));
    expect(con.groups.pecho.series).toBeLessThan(sin.groups.pecho.series);
  });

  it('unas agujetas de 8+ bajan el grupo un escalón', () => {
    const p = soloUno('pecho');
    const sin = suggestVolume(base({ priorities: p }));
    const con = suggestVolume(base({ priorities: p, history: conFeedback({ doms: { pecho: 9 } }) }));
    expect(con.groups.pecho.series).toBeLessThan(sin.groups.pecho.series);
  });

  it('una recuperación de 4 o menos fuerza el dial a conservador y lo avisa', () => {
    const r = suggestVolume(base({ intent: 'agresivo', history: conFeedback({ recovery: 3 }) }));
    expect(r.intentAplicado).toBe('conservador');
    expect(r.warnings.join(' ')).toContain('recuperación');
  });
});

describe('suggestVolume · topes', () => {
  it('nunca pasa del MRV de un grupo', () => {
    const r = suggestVolume(base({
      level: 'avanzado', intent: 'agresivo', priorities: soloUno('isquios', 'alta'),
      history: { adherencePct: 100, meanRir: 0.5, groups: {} },
    }));
    expect(r.groups.isquios.series).toBeLessThanOrEqual(L.isquios.mrv);
  });

  it('respeta el techo de series por sesión y lo dice', () => {
    const r = suggestVolume(base({ daysPerWeek: 3, level: 'avanzado', intent: 'agresivo' }));
    expect(r.totalSeries).toBeLessThanOrEqual(3 * SERIES_POR_DIA_TOPE);
    expect(r.warnings.join(' ')).toContain('no cabe');
  });

  it('avisa cuando el total va a disparar el sobrevolumen de la distribución', () => {
    const r = suggestVolume(base({ daysPerWeek: 3, level: 'avanzado', intent: 'agresivo' }));
    expect(r.warnings.join(' ')).toContain('sobrevolumen');
  });

  it('al recortar protege primero a los grupos prioritarios', () => {
    const r = suggestVolume(base({
      daysPerWeek: 4, level: 'avanzado', intent: 'agresivo',
      priorities: prioridades({ pecho: 'alta', dorsal: 'alta' }),
    }));
    expect(r.totalSeries).toBeLessThanOrEqual(4 * SERIES_POR_DIA_TOPE);
    expect(r.groups.pecho.series).toBeGreaterThan(r.groups.gemelo.series);
  });

  it('el recorte mantiene la forma del reparto, no lo aplana', () => {
    // Dorsal parte de la mitad de 12-20 y gemelo de la de 8-15: tras el recorte
    // dorsal tiene que seguir por encima, no acabar los dos en el mismo número.
    const r = suggestVolume(base({ daysPerWeek: 5, level: 'avanzado' }));
    expect(r.groups.dorsal.series).toBeGreaterThan(r.groups.gemelo.series);
  });

  it('acota por la frecuencia real que permite el reparto elegido', () => {
    // Torso/Pierna a 4 días: la pierna solo entrena 2 veces → tope de 2 × 8.
    const r = suggestVolume(base({
      daysPerWeek: 4, splitId: '4-torso-pierna-x2', level: 'avanzado', intent: 'agresivo',
      priorities: soloUno('cuadriceps', 'alta'),
    }));
    expect(r.groups.cuadriceps.series).toBeLessThanOrEqual(16);
  });

  it('devuelve los 17 grupos siempre, aunque alguno quede a 0', () => {
    const r = suggestVolume(base({ daysPerWeek: 2, priorities: prioridades({ antebrazo: 'baja' }) }));
    expect(Object.keys(r.groups).sort()).toEqual([...MUSCLE_ORDER].sort());
    expect(r.reasons.antebrazo.length).toBeGreaterThan(0);
  });
});

describe('suggestVolume · determinismo y trazabilidad', () => {
  it('dos llamadas idénticas dan exactamente el mismo resultado', () => {
    const input = base({ daysPerWeek: 5, level: 'avanzado', priorities: prioridades({ pecho: 'alta' }) });
    expect(suggestVolume(input)).toEqual(suggestVolume(input));
  });

  it('cada grupo explica de dónde sale su número', () => {
    const r = suggestVolume(base({ level: 'avanzado', priorities: soloUno('pecho', 'alta') }));
    expect(r.reasons.pecho[0]).toContain('avanzado');
    expect(r.reasons.pecho.join(' ')).toContain('Prioridad alta');
  });
});
