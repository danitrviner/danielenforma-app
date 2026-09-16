import { describe, it, expect } from 'vitest';
import {
  semanasParaElObjetivo,
  duracionDeLasFases,
  ritmoReal,
  desviacionDelRitmo,
} from './ritmoDePeso';

/* El rediseño que pedía la auditoría (§12-§14, §19, §24).
 *
 * La periodización se definía por SEMANAS y CALORÍAS: «esta fase dura 6 semanas
 * a 2.200 kcal». El entrenador piensa al revés — «quiero que llegue a 82 kg
 * subiendo 200 g por semana»— y la duración sale sola de ahí.
 *
 * Las calorías pasan a ser la herramienta para conseguir ese ritmo, no el dato
 * que define la fase. */

describe('semanasParaElObjetivo', () => {
  it('el ejemplo de la auditoría: 80 → 82 kg a +0,2 kg/semana son 10 semanas', () => {
    expect(semanasParaElObjetivo(80, 82, 0.2)).toBe(10);
  });

  it('pérdida: 87 → 70 kg a −0,5 kg/semana son 34 semanas', () => {
    expect(semanasParaElObjetivo(87, 70, -0.5)).toBe(34);
  });

  it('el signo del ritmo se deduce del objetivo, no hace falta acertarlo', () => {
    // Un entrenador escribe «0,5» pensando en bajar. Exigirle el menos sería
    // pedirle que acierte un detalle que la app ya sabe.
    expect(semanasParaElObjetivo(87, 70, 0.5)).toBe(34);
  });

  it('redondea hacia arriba: media semana de más es mejor que llegar corto', () => {
    expect(semanasParaElObjetivo(80, 82.5, 0.2)).toBe(13);   // 12,5 → 13
  });

  it('sin diferencia de peso no hay fase que durar', () => {
    expect(semanasParaElObjetivo(80, 80, 0.2)).toBe(0);
  });

  it('un ritmo de cero no da infinito: no se puede calcular', () => {
    expect(semanasParaElObjetivo(80, 82, 0)).toBeNull();
  });

  it('sin los datos necesarios devuelve null en vez de inventarse un número', () => {
    expect(semanasParaElObjetivo(null, 82, 0.2)).toBeNull();
    expect(semanasParaElObjetivo(80, null, 0.2)).toBeNull();
  });
});

describe('duracionDeLasFases', () => {
  it('el ejemplo de la auditoría: tres tramos con ritmos distintos', () => {
    // 87→79 a −0,8 = 10 semanas · 79→74 a −0,5 = 10 · 74→70 a −0,4 = 10
    const fases = duracionDeLasFases(87, [
      { targetWeight: 79, targetRateKgWeek: -0.8 },
      { targetWeight: 74, targetRateKgWeek: -0.5 },
      { targetWeight: 70, targetRateKgWeek: -0.4 },
    ]);
    expect(fases.map(f => f.weeks)).toEqual([10, 10, 10]);
  });

  it('cada fase arranca donde acabó la anterior', () => {
    const fases = duracionDeLasFases(87, [
      { targetWeight: 79, targetRateKgWeek: -0.8 },
      { targetWeight: 74, targetRateKgWeek: -0.5 },
    ]);
    expect(fases[0].pesoInicial).toBe(87);
    expect(fases[1].pesoInicial).toBe(79);
  });

  it('no asume un ritmo único para toda la definición', () => {
    const fases = duracionDeLasFases(87, [
      { targetWeight: 79, targetRateKgWeek: -0.8 },
      { targetWeight: 74, targetRateKgWeek: -0.25 },
    ]);
    expect(fases[1].weeks).toBe(20);   // el mismo tramo, a la mitad de ritmo
  });

  it('una fase sin ritmo conserva las semanas que tuviera puestas a mano', () => {
    // Retrocompatible: los programas de antes no traen ritmo y no se tocan.
    const fases = duracionDeLasFases(87, [{ targetWeight: 79, weeks: 6 }]);
    expect(fases[0].weeks).toBe(6);
    expect(fases[0].calculada).toBe(false);
  });

  it('marca cuáles ha calculado ella, para poder decirlo en pantalla', () => {
    const fases = duracionDeLasFases(80, [{ targetWeight: 82, targetRateKgWeek: 0.2 }]);
    expect(fases[0].calculada).toBe(true);
  });
});

describe('ritmoReal', () => {
  it('el ejemplo de la auditoría: cinco semanas bajando dan su media', () => {
    // −0,4 −0,3 −0,2 −0,5 −0,6 sobre 5 semanas = −2,0 / 5 = −0,4 kg/semana
    expect(ritmoReal([80, 79.6, 79.3, 79.1, 78.6, 78.0])).toBeCloseTo(-0.4, 2);
  });

  it('usa la tendencia entre el primer y el último peso, no la última semana', () => {
    // Una semana de retención no puede mandar sobre el resto (§18).
    const conRetencion = ritmoReal([80, 79.5, 79.0, 78.5, 79.2]);
    const sinRetencion = ritmoReal([80, 79.5, 79.0, 78.5, 78.0]);
    expect(conRetencion).toBeGreaterThan(sinRetencion!);
    expect(conRetencion).toBeLessThan(0);   // sigue bajando pese al repunte
  });

  it('con un solo peso no hay ritmo que calcular', () => {
    expect(ritmoReal([80])).toBeNull();
    expect(ritmoReal([])).toBeNull();
  });
});

describe('desviacionDelRitmo', () => {
  it('detecta que se pierde MENOS de lo previsto', () => {
    const d = desviacionDelRitmo(-0.5, -0.2);
    expect(d.estado).toBe('por-debajo');
    expect(d.diferencia).toBeCloseTo(0.3, 2);
  });

  it('detecta que se pierde MÁS de lo previsto', () => {
    expect(desviacionDelRitmo(-0.5, -0.9).estado).toBe('por-encima');
  });

  it('en ganancia también: subir de más se detecta', () => {
    // +0,2 objetivo, +0,5 real → está ganando por encima (§22).
    expect(desviacionDelRitmo(0.2, 0.5).estado).toBe('por-encima');
  });

  it('una desviación pequeña es «en rumbo», no una alarma', () => {
    // El peso oscila solo; avisar por 50 g haría que nadie mire los avisos.
    expect(desviacionDelRitmo(-0.5, -0.45).estado).toBe('en-rumbo');
  });

  it('sin ritmo real todavía no se puede decir nada', () => {
    expect(desviacionDelRitmo(-0.5, null).estado).toBe('sin-datos');
  });
});
