import { describe, expect, it } from 'vitest';
import { BodyMeasurement, BodyMetricKey } from '../types';
import { computeAnthropometricIndices } from './anthropometricIndices';

const m = (metricKey: BodyMetricKey, value: number): BodyMeasurement => ({
  id: `x_${metricKey}`, athleteId: 'a@b.c', date: '2026-08-26', metricKey, value,
  unit: 'cm', source: 'manual', createdAt: '2026-08-26T10:00:00.000Z',
});

describe('computeAnthropometricIndices', () => {
  it('calcula los 5 índices cuando están las dos medidas de cada par', () => {
    const latest = {
      pecho: m('pecho', 100),
      cintura: m('cintura', 80),
      biceps_der_contraido: m('biceps_der_contraido', 36),
      cadera: m('cadera', 96),
      muslo_der_relajado: m('muslo_der_relajado', 56),
      altura: m('altura', 160),
    };
    const idx = computeAnthropometricIndices(latest);
    expect(idx.ipc).toBe(1.25);       // 100/80
    expect(idx.ibc).toBe(0.45);       // 36/80
    expect(idx.icac).toBe(1.2);       // 96/80
    expect(idx.imc_muslo).toBe(0.7);  // 56/80
    expect(idx.whtr).toBe(0.5);       // 80/160
  });

  it('devuelve null cuando falta alguna de las dos medidas del par', () => {
    const idx = computeAnthropometricIndices({ pecho: m('pecho', 100) }); // sin cintura
    expect(idx.ipc).toBeNull();
    expect(idx.ibc).toBeNull();
    expect(idx.icac).toBeNull();
    expect(idx.imc_muslo).toBeNull();
    expect(idx.whtr).toBeNull();
  });

  it('no mezcla las claves legacy (biceps_der) con las del protocolo completo (biceps_der_contraido)', () => {
    const idx = computeAnthropometricIndices({
      biceps_der: m('biceps_der', 36), // legacy, no debe usarse para IBC
      cintura: m('cintura', 80),
    });
    expect(idx.ibc).toBeNull();
  });
});
