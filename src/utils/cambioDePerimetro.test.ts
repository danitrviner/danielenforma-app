import { describe, it, expect } from 'vitest';
import { BODY_METRIC_LABELS, type BodyMetricKey } from '../types';
import { cambioDePerimetro, cm, esPerimetro, medidaAnterior, ruidoDeMetrica, textoDeCambio } from './cambioDePerimetro';
import { ruidoDePerimetro } from './evolucionDelBloque';
import { RUIDO_PERIMETRO_CM } from './ruidoDeMedida';

describe('cambioDePerimetro', () => {
  it('brazo: por debajo de 0,5 cm no hay cambio medible', () => {
    expect(cambioDePerimetro('biceps_der_contraido', 38, 38.4)).toEqual({ delta: 0.4, estado: 'sin_cambio' });
    expect(cambioDePerimetro('biceps_der_contraido', 38, 38.5)).toEqual({ delta: 0.5, estado: 'sube' });
    expect(cambioDePerimetro('biceps_izq_relajado', 35, 34.4)).toEqual({ delta: -0.6, estado: 'baja' });
  });

  it('el resto: por debajo de 1 cm no hay cambio medible', () => {
    expect(cambioDePerimetro('cintura', 82, 81.2)).toEqual({ delta: -0.8, estado: 'sin_cambio' });
    expect(cambioDePerimetro('cintura', 82, 81)).toEqual({ delta: -1, estado: 'baja' });
    expect(cambioDePerimetro('muslo_der_relajado', 58, 59.5)).toEqual({ delta: 1.5, estado: 'sube' });
    expect(cambioDePerimetro('pecho', 100, 100)).toEqual({ delta: 0, estado: 'sin_cambio' });
  });

  it('no se deja engañar por los decimales del ordenador', () => {
    // 38,5 − 38 = 0,5 exacto; 81,1 − 80,1 da 0,9999999999999858 sin redondear.
    expect(cambioDePerimetro('cintura', 80.1, 81.1).estado).toBe('sube');
  });

  it('usa las constantes de ruidoDeMedida y el mismo reparto que el cierre', () => {
    expect(ruidoDeMetrica('biceps_der_relajado')).toBe(RUIDO_PERIMETRO_CM.brazo);
    expect(ruidoDeMetrica('cadera')).toBe(RUIDO_PERIMETRO_CM.resto);
    for (const clave of Object.keys(BODY_METRIC_LABELS)) {
      expect(ruidoDeMetrica(clave)).toBe(ruidoDePerimetro(clave));
    }
  });

  it('el texto no lleva flecha cuando no hay cambio medible', () => {
    expect(textoDeCambio(cambioDePerimetro('cintura', 82, 81.5))).toBe('Sin cambio medible');
    expect(textoDeCambio(cambioDePerimetro('cintura', 82, 80.5))).toBe('−1,5 cm');
    expect(textoDeCambio(cambioDePerimetro('biceps_der_contraido', 38, 39))).toBe('+1 cm');
    expect(cm(34.5)).toBe('34,5');
  });
});

describe('medidaAnterior', () => {
  const m = (date: string, metricKey: BodyMetricKey, value: number) => ({ date, metricKey, value });
  const todas = [
    m('2026-09-01', 'cintura', 84), m('2026-10-01', 'cintura', 82.5), m('2026-11-17', 'cintura', 82),
    m('2026-10-01', 'pecho', 101),
  ];

  it('la última de ese perímetro antes de hoy', () => {
    expect(medidaAnterior(todas, 'cintura', '2026-11-17')).toEqual({ value: 82.5, date: '2026-10-01' });
    expect(medidaAnterior(todas, 'pecho', '2026-11-17')).toEqual({ value: 101, date: '2026-10-01' });
  });

  it('la de hoy no cuenta, y sin medidas previas no hay con qué comparar', () => {
    expect(medidaAnterior(todas, 'cintura', '2026-09-01')).toBeNull();
    expect(medidaAnterior(todas, 'cadera', '2026-11-17')).toBeNull();
    expect(medidaAnterior([], 'cintura', '2026-11-17')).toBeNull();
  });
});

describe('esPerimetro', () => {
  it('ni el peso ni la altura lo son', () => {
    expect(esPerimetro('cintura')).toBe(true);
    expect(esPerimetro('bodyweight')).toBe(false);
    expect(esPerimetro('altura')).toBe(false);
    expect(esPerimetro(undefined)).toBe(false);
  });
});
