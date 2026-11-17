import { describe, expect, it } from 'vitest';
import { ETIQUETA_SIN_MARCA } from './marcaDeSesion';
import { rmDeSerie } from './oneRepMax';
import {
  marcaDeSesion, mejorSerieValida, motivoPrincipal, motivoSinMarca, rmValidoDeSerie,
} from './marcaDeSesion';

const s = (weight: number, repsDone: number, rir = 2, extra: Record<string, unknown> = {}) => ({ weight, repsDone, rir, ...extra });

describe('marca de una sesión (D2)', () => {
  it('es el RM de la mejor serie válida, no el de la mejor serie a secas', () => {
    // 70 × 20 a RIR 4 da más RM que 80 × 8 a RIR 2, pero no vale para estimarlo.
    const sets = [s(80, 8), s(70, 20, 4), s(80, 7, 1)];
    expect(rmDeSerie(sets[1])).toBeGreaterThan(rmDeSerie(sets[0]));
    expect(marcaDeSesion(sets)).toBe(rmDeSerie(sets[0]));
    expect(mejorSerieValida(sets)).toMatchObject({ serie: sets[0], kg: 80 });
  });

  it('una sesión sin ninguna serie válida no tiene marca: null, no 0', () => {
    expect(marcaDeSesion([s(60, 16), s(60, 20)])).toBeNull(); // más de 15 repeticiones
    // Hasta 15 sí vale (auditoría de cifras, 17-11-2026; antes el tope era 12).
    expect(marcaDeSesion([s(60, 15), s(60, 14)])).toBe(rmDeSerie(s(60, 15)));
    expect(marcaDeSesion([s(80, 8, 3), s(80, 8, 5)])).toBeNull(); // RIR de 3 o más
    expect(marcaDeSesion([s(80, 8, 2, { rirApuntado: false })])).toBeNull(); // RIR pautado sin tocar
    expect(marcaDeSesion([s(100, 5, 0, { segmento: true })])).toBeNull(); // solo una bajada
    expect(marcaDeSesion([s(0, 10)])).toBeNull(); // sin peso
    expect(marcaDeSesion([])).toBeNull();
  });

  it('al fallo vale aunque el RIR no esté apuntado, y los registros antiguos (sin marca de RIR) valen', () => {
    expect(marcaDeSesion([s(80, 8, 4, { alFallo: true, rirApuntado: false })])).toBe(rmDeSerie({ weight: 80, repsDone: 8, alFallo: true }));
    expect(marcaDeSesion([s(80, 8, 2)])).toBe(rmDeSerie(s(80, 8, 2)));
  });

  it('lee las series de la sesión en curso, que vienen como texto', () => {
    expect(rmValidoDeSerie({ weight: '80', repsDone: '8', rir: '2' })).toBe(rmDeSerie(s(80, 8)));
    expect(rmValidoDeSerie({ weight: '80', repsDone: '16', rir: '2' })).toBeNull();
  });

  it('con `kg` suma el peso corporal de dominadas y fondos', () => {
    expect(rmValidoDeSerie(s(10, 8), 85)).toBe(rmDeSerie(s(85, 8)));
    expect(marcaDeSesion([s(0, 8)], () => 75)).toBe(rmDeSerie(s(75, 8)));
  });
});

describe('por qué una sesión se queda sin marca', () => {
  it('el motivo más repetido entre sus series con peso', () => {
    expect(motivoSinMarca([s(60, 20), s(60, 20), s(60, 8, 4)])).toBe('reps_altas');
    expect(motivoSinMarca([s(80, 8, 3), s(80, 8, 4)])).toBe('rir_lejos');
    expect(motivoSinMarca([s(80, 8, 2, { rirApuntado: false }), s(80, 8, 2, { rirApuntado: false })])).toBe('rir_sin_apuntar');
    expect(motivoSinMarca([s(120, 1, 0), s(120, 2, 0)])).toBe('reps_bajas');
  });

  it('null si tiene marca o si no hay series con peso', () => {
    expect(motivoSinMarca([s(60, 20), s(80, 8)])).toBeNull();
    expect(motivoSinMarca([s(0, 20)])).toBeNull();
    // Las bajadas no cuentan ni a favor ni en contra.
    expect(motivoSinMarca([s(80, 8, 4), s(60, 20, 0, { segmento: true })])).toBe('rir_lejos');
  });

  it('a igualdad, primero lo que el atleta arregla antes', () => {
    expect(motivoPrincipal({ reps_altas: 2, rir_sin_apuntar: 2 })).toBe('rir_sin_apuntar');
    expect(motivoPrincipal({ reps_altas: 3, rir_lejos: 1 })).toBe('reps_altas');
    expect(motivoPrincipal({})).toBeNull();
  });
});

describe('fuera de su gimnasio (17-11-2026)', () => {
  it('una sesión fuera no tiene marca, y el motivo para el coach es «fuera de su gimnasio»', () => {
    const sets = [s(80, 8, 1, { fuera: true }), s(80, 8, 2, { fuera: true })];
    expect(marcaDeSesion(sets)).toBeNull();
    expect(rmValidoDeSerie(sets[0])).toBeNull();
    expect(motivoSinMarca(sets)).toBe('fuera');
    expect(ETIQUETA_SIN_MARCA.fuera).toBe('fuera de su gimnasio');
  });

  it('a igualdad de veces, «fuera» se enseña antes que cualquier otro motivo', () => {
    expect(motivoPrincipal({ fuera: 1, reps_altas: 1 })).toBe('fuera');
  });
});
