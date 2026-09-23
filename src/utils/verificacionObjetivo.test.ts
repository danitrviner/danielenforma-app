import { describe, it, expect } from 'vitest';
import {
  clasificarRitmo, mediasSemanales, pendiente, senalCintura, senalFuerza,
  verificarObjetivo, RANGO_PCT_SEMANA,
} from './verificacionObjetivo';

/** Un peso diario que cambia `kgSemana` por semana, desde `desde`, durante `dias`. */
function serie(desde: string, pesoInicial: number, kgSemana: number, dias: number) {
  const base = Date.UTC(+desde.slice(0, 4), +desde.slice(5, 7) - 1, +desde.slice(8, 10));
  return Array.from({ length: dias }, (_, i) => ({
    date: new Date(base + i * 86400000).toISOString().slice(0, 10),
    weight: pesoInicial + (kgSemana / 7) * i,
  }));
}

describe('clasificarRitmo', () => {
  const deficit = RANGO_PCT_SEMANA.deficit!;
  it('dentro del rango, bordes incluidos', () => {
    expect(clasificarRitmo(-0.5, deficit)).toBe('en-rango');
    expect(clasificarRitmo(-0.6, deficit)).toBe('en-rango');
    expect(clasificarRitmo(-0.4000000001, deficit)).toBe('en-rango');
  });
  it('lento, rápido y contrario se leen respecto a la intención', () => {
    expect(clasificarRitmo(-0.2, deficit)).toBe('lento');
    expect(clasificarRitmo(-0.9, deficit)).toBe('rapido');
    expect(clasificarRitmo(0.3, deficit)).toBe('contrario');
    const volumen = RANGO_PCT_SEMANA.volumen!;
    expect(clasificarRitmo(0.1, volumen)).toBe('lento');
    expect(clasificarRitmo(0.7, volumen)).toBe('rapido');
    expect(clasificarRitmo(-0.2, volumen)).toBe('contrario');
  });
  it('salida de déficit: bajar ya es ir en contra', () => {
    const salida = RANGO_PCT_SEMANA.salida_deficit!;
    expect(clasificarRitmo(0, salida)).toBe('en-rango');
    expect(clasificarRitmo(-0.1, salida)).toBe('contrario');
    expect(clasificarRitmo(0.35, salida)).toBe('rapido');
  });
});

describe('mediasSemanales y pendiente', () => {
  it('agrupa por semanas desde el inicio e ignora lo anterior', () => {
    const m = mediasSemanales(
      [{ date: '2026-08-31', weight: 90 }, { date: '2026-09-01', weight: 80 },
       { date: '2026-09-03', weight: 82 }, { date: '2026-09-08', weight: 79 }],
      '2026-09-01', '2026-09-20');
    expect(m.get(0)).toBe(81);
    expect(m.get(1)).toBe(79);
    expect(m.size).toBe(2);
  });
  it('la pendiente no la tuerce una semana con retención', () => {
    const p = pendiente([[0, 80], [1, 79.5], [2, 79], [3, 79.6], [4, 78]]);
    expect(p!).toBeLessThan(-0.3);
    expect(pendiente([[0, 80]])).toBeNull();
  });
});

describe('verificarObjetivo — rangos en %', () => {
  it('déficit a −0,5 %/sem con 80 kg está en rango', () => {
    const v = verificarObjetivo({
      objetivo: { tipo: 'deficit', desde: '2026-08-01' },
      pesos: serie('2026-08-01', 80, -0.4, 35), hoy: '2026-09-05',
    });
    expect(v.estado).toBe('en-rango');
    expect(v.ritmoPct!).toBeCloseTo(-0.5, 1);
    expect(v.ajusteKcal).toBeNull();
  });
  it('el mismo −400 g/sem con 60 kg es pérdida acelerada, no déficit', () => {
    const pesos = serie('2026-08-01', 60, -0.4, 35);
    const hoy = '2026-09-05';
    expect(verificarObjetivo({ objetivo: { tipo: 'deficit', desde: '2026-08-01' }, pesos, hoy }).estado).toBe('rapido');
    expect(verificarObjetivo({ objetivo: { tipo: 'deficit_acelerado', desde: '2026-08-01' }, pesos, hoy }).estado).toBe('en-rango');
  });
  it('volumen demasiado lento propone subir kcal, acotado a 400', () => {
    const v = verificarObjetivo({
      objetivo: { tipo: 'volumen', desde: '2026-08-01' },
      pesos: serie('2026-08-01', 80, 0, 28), hoy: '2026-08-29',
    });
    expect(v.estado).toBe('lento');
    expect(v.ajusteKcal!).toBeGreaterThan(0);
    expect(v.ajusteKcal!).toBeLessThanOrEqual(400);
  });
  it('sin dos semanas con pesos no hay veredicto', () => {
    const v = verificarObjetivo({
      objetivo: { tipo: 'deficit', desde: '2026-09-01' },
      pesos: serie('2026-09-01', 80, -0.5, 5), hoy: '2026-09-05',
    });
    expect(v.estado).toBe('sin-datos');
  });
  it('quien va lento TODAS las semanas acaba fuera de la franja (acumula 4 semanas)', () => {
    // −0,28 %/sem con 84 kg: en cada semana suelta el retraso es de ~100 g.
    const lento = verificarObjetivo({
      objetivo: { tipo: 'deficit', desde: '2026-06-01' },
      pesos: serie('2026-06-01', 84, -0.24, 84), hoy: '2026-08-24',
    });
    const hoyPunto = lento.puntos[lento.puntos.length - 2];
    expect(hoyPunto.tendencia!).toBeGreaterThan(hoyPunto.franja![1]);
    // El que cumple, dentro.
    const bien = verificarObjetivo({
      objetivo: { tipo: 'deficit', desde: '2026-06-01' },
      pesos: serie('2026-06-01', 84, -0.42, 84), hoy: '2026-08-24',
    });
    const p = bien.puntos[bien.puntos.length - 2];
    expect(p.tendencia!).toBeGreaterThanOrEqual(p.franja![0]);
    expect(p.tendencia!).toBeLessThanOrEqual(p.franja![1]);
    // Y se pinta la franja de la semana que viene, sin peso real todavía.
    const siguiente = bien.puntos[bien.puntos.length - 1];
    expect(siguiente.real).toBeNull();
    expect(siguiente.franja).not.toBeNull();
  });
  it('el veredicto habla de las últimas semanas: tras corregir, deja de decir «lento»', () => {
    const antes = serie('2026-06-01', 84, 0, 56);           // 8 semanas parado
    const despues = serie('2026-07-27', 84, -0.42, 35);      // corrige y baja a ritmo
    const v = verificarObjetivo({
      objetivo: { tipo: 'deficit', desde: '2026-06-01' },
      pesos: [...antes, ...despues], hoy: '2026-08-30',
    });
    expect(v.estado).toBe('en-rango');
    expect(v.ritmoMedioPct!).toBeGreaterThan(-0.4);       // la media de la fase sigue siendo lenta
  });
});

describe('verificarObjetivo — franja de mantenimiento', () => {
  it('±1 kg de la media de la primera semana', () => {
    const quieto = verificarObjetivo({
      objetivo: { tipo: 'mantenimiento', desde: '2026-08-01' },
      pesos: serie('2026-08-01', 80, 0.1, 42), hoy: '2026-09-12',
    });
    expect(quieto.estado).toBe('en-rango');
    const sube = verificarObjetivo({
      objetivo: { tipo: 'mantenimiento', desde: '2026-08-01' },
      pesos: serie('2026-08-01', 80, 0.4, 42), hoy: '2026-09-12',
    });
    expect(sube.estado).toBe('por-encima');
  });
});

describe('recomposición', () => {
  const log = (date: string, weight: number) => ({
    date, entries: [{ exerciseId: 'sentadilla', sets: [{ weight, repsDone: 5, rir: 2 }] },
                    { exerciseId: 'press', sets: [{ weight: weight / 2, repsDone: 5, rir: 2 }] }],
  });
  const cintura = (date: string, value: number) => ({ date, metricKey: 'cintura' as const, value });

  it('cintura: baja si cae 0,5 cm o más', () => {
    expect(senalCintura([cintura('2026-08-01', 85), cintura('2026-09-01', 84)], '2026-08-01').senal).toBe('ok');
    expect(senalCintura([cintura('2026-08-01', 85), cintura('2026-09-01', 84.8)], '2026-08-01').senal).toBe('mal');
    expect(senalCintura([cintura('2026-08-01', 85)], '2026-08-01').senal).toBe('sin-datos');
  });
  it('fuerza: mediana del cambio de 1RM entre mitades', () => {
    const f = senalFuerza([log('2026-08-03', 100), log('2026-08-28', 105)], '2026-08-01', '2026-09-01');
    expect(f.senal).toBe('ok');
    expect(f.ejercicios).toBe(2);
    expect(f.cambioPct).toBeCloseTo(5, 0);
  });
  it('peso estable + cintura baja + fuerza sube = en rango', () => {
    const v = verificarObjetivo({
      objetivo: { tipo: 'recomposicion', desde: '2026-08-01' },
      pesos: serie('2026-08-01', 80, 0, 35), hoy: '2026-09-05',
      medidas: [cintura('2026-08-02', 86), cintura('2026-09-02', 84.5)],
      entrenos: [log('2026-08-03', 100), log('2026-08-30', 104)],
    });
    expect(v.estado).toBe('en-rango');
  });
  it('sin medir cintura queda parcial, no en rango', () => {
    const v = verificarObjetivo({
      objetivo: { tipo: 'recomposicion', desde: '2026-08-01' },
      pesos: serie('2026-08-01', 80, 0, 35), hoy: '2026-09-05',
      entrenos: [log('2026-08-03', 100), log('2026-08-30', 104)],
    });
    expect(v.estado).toBe('parcial');
  });
});
