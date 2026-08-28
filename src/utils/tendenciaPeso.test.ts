import { describe, it, expect } from 'vitest';
import { tendenciaDePeso } from './tendenciaPeso';

const log = (date: string, weight: number) => ({ date, weight });

describe('tendenciaDePeso', () => {
  it('devuelve null con menos de 3 registros — no hay tendencia que calcular', () => {
    expect(tendenciaDePeso([])).toBeNull();
    expect(tendenciaDePeso([log('2026-08-01', 80)])).toBeNull();
    expect(tendenciaDePeso([log('2026-08-01', 80), log('2026-08-08', 79)])).toBeNull();
  });

  it('devuelve null si todos los registros son del mismo día (pendiente indefinida)', () => {
    expect(tendenciaDePeso([log('2026-08-01', 80), log('2026-08-01', 80.5), log('2026-08-01', 79.5)])).toBeNull();
  });

  it('mide una bajada limpia de 0,5 kg por semana', () => {
    const t = tendenciaDePeso([log('2026-08-01', 80), log('2026-08-08', 79.5), log('2026-08-15', 79), log('2026-08-22', 78.5)]);
    expect(t).not.toBeNull();
    expect(t!.kgPorSemana).toBeCloseTo(-0.5, 6);
    expect(t!.desde).toBeCloseTo(80, 6);
    expect(t!.hasta).toBeCloseTo(78.5, 6);
  });

  it('mide una subida y devuelve pendiente positiva', () => {
    const t = tendenciaDePeso([log('2026-08-01', 70), log('2026-08-15', 70.5), log('2026-08-29', 71)]);
    expect(t!.kgPorSemana).toBeCloseTo(0.25, 6);
  });

  it('un pico aislado no da la vuelta a la tendencia ni la exagera', () => {
    // Bajada real con un pico de agua de +2 kg en la tercera medición.
    const logs = [log('2026-08-01', 80), log('2026-08-08', 79.5), log('2026-08-15', 82), log('2026-08-22', 78.5)];
    const t = tendenciaDePeso(logs)!;
    expect(t.kgPorSemana).toBeLessThan(0);
    // Y es más prudente que restar el primero del último, que aquí daría -0,5.
    const primeroContraUltimo = (logs[3].weight - logs[0].weight) / 3;
    expect(Math.abs(t.kgPorSemana)).toBeLessThan(Math.abs(primeroContraUltimo));
  });

  it('es plana cuando el peso no se mueve', () => {
    const t = tendenciaDePeso([log('2026-08-01', 75), log('2026-08-08', 75), log('2026-08-15', 75)]);
    expect(t!.kgPorSemana).toBeCloseTo(0, 6);
  });

  it('aguanta registros con separación irregular', () => {
    const t = tendenciaDePeso([log('2026-08-01', 80), log('2026-08-03', 79.8), log('2026-08-20', 78.1)]);
    expect(t!.kgPorSemana).toBeLessThan(0);
    expect(t!.kgPorSemana).toBeGreaterThan(-1);
  });
});
