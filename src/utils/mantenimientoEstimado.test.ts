import { describe, it, expect } from 'vitest';
import { estimarMantenimiento, type SemanaObservada } from './mantenimientoEstimado';

/* El rediseño de §16-§18 y §23.
 *
 * El problema real, en palabras de Dani: la app estima que un atleta gasta
 * 4.100 kcal y él sabe que mantiene peso con 2.500. Con la fórmula mandando, la
 * gráfica leía un déficit enorme en alguien que ni perdía grasa ni bajaba de
 * peso.
 *
 * La estimación teórica (Mifflin-St Jeor) es un punto de partida, no la
 * realidad metabólica de ESE atleta. En cuanto hay semanas registradas, el peso
 * real y lo que come dicen mucho más que cualquier fórmula:
 *
 *     mantenimiento ≈ kcal que come − (cambio de peso × 7.700 / días)
 *
 * Con dos cautelas que la auditoría marca en negrita:
 *  · nunca con una sola semana suelta (§18);
 *  · y diciendo SIEMPRE cuánta confianza merece el número. */

const semana = (kcal: number, pesoInicio: number, pesoFin: number): SemanaObservada =>
  ({ kcalDiarias: kcal, pesoInicioKg: pesoInicio, pesoFinKg: pesoFin });

describe('sin datos suficientes no se inventa un número', () => {
  it('sin ninguna semana registrada', () => {
    const r = estimarMantenimiento([], { estimacionTeorica: 4100 });
    expect(r.kcal).toBeNull();
    expect(r.confianza).toBe('sin-datos');
  });

  it('con una sola semana tampoco: una retención de líquidos mandaría sobre todo', () => {
    const r = estimarMantenimiento([semana(2500, 80, 79.6)], { estimacionTeorica: 4100 });
    expect(r.kcal).toBeNull();
    expect(r.confianza).toBe('sin-datos');
  });

  it('lo dice con un motivo que se puede enseñar en pantalla', () => {
    const r = estimarMantenimiento([], { estimacionTeorica: 4100 });
    expect(r.motivo).toBeTruthy();
  });
});

describe('el caso de Dani: la fórmula dice 4.100 y la realidad dice otra cosa', () => {
  /* Un atleta que come 2.500 kcal y MANTIENE el peso: su mantenimiento son
   * 2.500, no los 4.100 que calcula Mifflin. Antes la gráfica leía un déficit
   * de 1.600 kcal/día en alguien que no bajaba ni un gramo. */
  const manteniendo = [
    semana(2500, 80.0, 80.0),
    semana(2500, 80.0, 80.1),
    semana(2500, 80.1, 79.9),
    semana(2500, 79.9, 80.0),
  ];

  it('estima el mantenimiento por lo que pasa, no por la fórmula', () => {
    const r = estimarMantenimiento(manteniendo, { estimacionTeorica: 4100 });
    expect(r.kcal).toBeGreaterThan(2350);
    expect(r.kcal).toBeLessThan(2650);
  });

  it('se aleja mucho de la teórica, y lo dice', () => {
    const r = estimarMantenimiento(manteniendo, { estimacionTeorica: 4100 });
    expect(r.difieresDeLaTeorica).toBe(true);
  });
});

describe('perder peso comiendo X implica un mantenimiento mayor que X', () => {
  it('2.500 kcal perdiendo 0,4 kg/semana → mantenimiento en torno a 2.940', () => {
    // 0,4 kg × 7.700 = 3.080 kcal en 7 días = 440 kcal/día de déficit.
    const bajando = [
      semana(2500, 80.0, 79.6),
      semana(2500, 79.6, 79.2),
      semana(2500, 79.2, 78.8),
      semana(2500, 78.8, 78.4),
    ];
    const r = estimarMantenimiento(bajando, { estimacionTeorica: 4100 });
    expect(r.kcal).toBeGreaterThan(2800);
    expect(r.kcal).toBeLessThan(3100);
  });

  it('ganar peso implica un mantenimiento menor que lo que come', () => {
    const subiendo = [
      semana(3000, 80.0, 80.3),
      semana(3000, 80.3, 80.6),
      semana(3000, 80.6, 80.9),
      semana(3000, 80.9, 81.2),
    ];
    const r = estimarMantenimiento(subiendo, { estimacionTeorica: 2000 });
    expect(r.kcal).toBeLessThan(3000);
  });
});

describe('la confianza crece con los datos', () => {
  const constante = (n: number) => Array.from({ length: n }, (_, i) =>
    semana(2500, 80 - i * 0.4, 80 - (i + 1) * 0.4));

  it('con dos semanas la confianza es baja', () => {
    expect(estimarMantenimiento(constante(2), { estimacionTeorica: 3000 }).confianza).toBe('baja');
  });

  it('con cuatro semanas coherentes, media', () => {
    expect(estimarMantenimiento(constante(4), { estimacionTeorica: 3000 }).confianza).toBe('media');
  });

  it('con seis semanas coherentes, alta', () => {
    expect(estimarMantenimiento(constante(6), { estimacionTeorica: 3000 }).confianza).toBe('alta');
  });

  it('muchos datos pero contradictorios NO dan confianza alta', () => {
    // Semanas que se disparan en direcciones opuestas: hay ruido, y decir «alta»
    // sobre esto sería una falsa precisión de las que avisa §16.
    const erraticas = [
      semana(2500, 80.0, 79.0),
      semana(2500, 79.0, 80.2),
      semana(2500, 80.2, 78.9),
      semana(2500, 78.9, 80.5),
      semana(2500, 80.5, 79.1),
      semana(2500, 79.1, 80.4),
    ];
    expect(estimarMantenimiento(erraticas, { estimacionTeorica: 3000 }).confianza).not.toBe('alta');
  });
});

describe('lo que no se debe hacer con este número', () => {
  it('una semana nueva no reescribe el histórico: cada llamada es independiente', () => {
    // §24.10 — un cambio de estimación no puede tocar los datos reales.
    const semanas = [semana(2500, 80, 79.6), semana(2500, 79.6, 79.2)];
    const copia = JSON.parse(JSON.stringify(semanas));
    estimarMantenimiento(semanas, { estimacionTeorica: 3000 });
    expect(semanas).toEqual(copia);
  });

  it('descarta semanas sin peso o sin kcal en vez de contarlas como cero', () => {
    const conHuecos: SemanaObservada[] = [
      semana(2500, 80.0, 79.6),
      { kcalDiarias: null, pesoInicioKg: 79.6, pesoFinKg: 79.2 },
      semana(2500, 79.2, 78.8),
      semana(2500, 78.8, 78.4),
    ];
    const r = estimarMantenimiento(conHuecos, { estimacionTeorica: 3000 });
    expect(r.semanasUsadas).toBe(3);
    expect(r.kcal).toBeGreaterThan(2800);
  });

  it('descuenta las kcal de los pasos cuando se conocen', () => {
    // El gasto por pasos ya se pauta aparte; si no se descuenta, se cuela dentro
    // del mantenimiento y lo infla.
    const semanas = [semana(2500, 80, 79.6), semana(2500, 79.6, 79.2), semana(2500, 79.2, 78.8)];
    const sinPasos = estimarMantenimiento(semanas, { estimacionTeorica: 3000 });
    const conPasos = estimarMantenimiento(semanas, { estimacionTeorica: 3000, kcalDiariasDePasos: 300 });
    expect(conPasos.kcal!).toBeLessThan(sinPasos.kcal!);
  });
});
