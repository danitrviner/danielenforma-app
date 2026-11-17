import { describe, it, expect } from 'vitest';
import { intervalosEntreSeries, descansoEstimado, descansoRealDelEjercicio } from './tiemposDeSerie';

const a = (min: number, seg = 0) => new Date(Date.UTC(2026, 10, 11, 18, min, seg)).toISOString();

describe('intervalosEntreSeries', () => {
  it('da los segundos entre cada serie y la anterior; la primera no tiene', () => {
    const sets = [{ hechaEn: a(0) }, { hechaEn: a(3) }, { hechaEn: a(5, 30) }];
    expect(intervalosEntreSeries(sets)).toEqual([null, 180, 150]);
  });

  it('las bajadas y miniseries no cuentan: se mide entre series principales', () => {
    const sets = [{ hechaEn: a(0) }, { hechaEn: a(0, 20), segmento: true }, { hechaEn: a(3) }];
    expect(intervalosEntreSeries(sets)).toEqual([null, 180]);
  });

  it('sin hora (registro antiguo) no inventa nada', () => {
    expect(intervalosEntreSeries([{}, {}, {}])).toEqual([null, null, null]);
    expect(intervalosEntreSeries([{ hechaEn: a(0) }, {}, { hechaEn: a(6) }])).toEqual([null, null, null]);
  });

  it('series marcadas de golpe al acabar el ejercicio no son un descanso', () => {
    const sets = [{ hechaEn: a(10, 0) }, { hechaEn: a(10, 3) }, { hechaEn: a(10, 5) }];
    expect(intervalosEntreSeries(sets)).toEqual([null, null, null]);
  });

  it('una pausa de más de un cuarto de hora no es un descanso', () => {
    expect(intervalosEntreSeries([{ hechaEn: a(0) }, { hechaEn: a(40) }])).toEqual([null, null]);
  });

  it('una hora ilegible o anterior a la serie previa tampoco vale', () => {
    expect(intervalosEntreSeries([{ hechaEn: a(5) }, { hechaEn: 'ayer' }])).toEqual([null, null]);
    expect(intervalosEntreSeries([{ hechaEn: a(5) }, { hechaEn: a(2) }])).toEqual([null, null]);
  });
});

describe('descanso real', () => {
  it('al intervalo se le quita lo que dura la serie', () => {
    expect(descansoEstimado(180)).toBe(135);
    expect(descansoEstimado(30)).toBe(0);
  });

  it('el del ejercicio es la mediana de los que se pueden calcular', () => {
    const sets = [{ hechaEn: a(0) }, { hechaEn: a(3) }, { hechaEn: a(5, 30) }, { hechaEn: a(9, 30) }];
    // intervalos 180, 150, 240 → descansos 135, 105, 195 → mediana 135
    expect(descansoRealDelEjercicio(sets)).toBe(135);
  });

  it('sin ningún intervalo creíble, no hay dato', () => {
    expect(descansoRealDelEjercicio([{ hechaEn: a(0) }])).toBeNull();
    expect(descansoRealDelEjercicio([{}, {}])).toBeNull();
  });
});
