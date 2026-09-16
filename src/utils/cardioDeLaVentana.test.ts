import { describe, it, expect } from 'vitest';
import { construirCardioDeLaVentana } from './cardioDeLaVentana';
import type { CardioSession } from '../types';

function sesion(date: string, parcial: Partial<CardioSession> = {}): CardioSession {
  return {
    id: `s_${date}`, athleteId: 'ana@x.com', type: 'zona2', date,
    startedAt: `${date}T09:00:00.000Z`, durationSec: 1800,
    timeInZoneSec: { z1: 300, z2: 1200, z3: 300, z4: 0, z5: 0 },
    samples: [], sampleIntervalSec: 5,
    avgHR: 130, caloriesKcal: 250, trimp: 40,
    ...parcial,
  } as CardioSession;
}

describe('construirCardioDeLaVentana', () => {
  it('cuenta sesiones, minutos y kcal solo de la ventana', () => {
    const r = construirCardioDeLaVentana({
      sesiones: [sesion('2026-09-01'), sesion('2026-09-10'), sesion('2026-09-12')],
      desde: '2026-09-08', hasta: '2026-09-14',
    });
    expect(r.sesiones).toBe(2);
    expect(r.minutos).toBe(60);
    expect(r.kcal).toBe(500);
  });

  it('la carga se calcula con TODO el historial, no con la ventana', () => {
    // Seis semanas seguidas entrenando. Si a `computeTrainingLoad` solo le
    // llegaran los días de la ventana, el CTL —media móvil a 42 días— saldría
    // casi de cero y el cociente dispararía el estado. Se comprueba contra la
    // misma ventana alimentada solo con sus propios días.
    const base = Array.from({ length: 42 }, (_, i) => {
      // eslint-disable-next-line no-restricted-syntax -- Date.UTC de los dos lados
      const d = new Date(Date.UTC(2026, 7, 1) + i * 86_400_000).toISOString().slice(0, 10);
      return sesion(d);
    });
    const ventana = { desde: '2026-09-08', hasta: '2026-09-11' };
    const conHistorial = construirCardioDeLaVentana({ sesiones: base, ...ventana });
    const soloVentana = construirCardioDeLaVentana({
      sesiones: base.filter(s => s.date >= ventana.desde && s.date <= ventana.hasta), ...ventana,
    });

    expect(conHistorial.carga).not.toBeNull();
    expect(soloVentana.carga).not.toBeNull();
    // Con historial hay base crónica; recortando, el CTL apenas arranca.
    expect(conHistorial.carga!.ctl).toBeGreaterThan(soloVentana.carga!.ctl * 3);
    // Y el cociente sale más alto —peor— justo por no tener esa base.
    expect(soloVentana.carga!.tlr).toBeGreaterThan(conHistorial.carga!.tlr);
    expect(conHistorial.carga!.serieTlr.length).toBe(8);
  });

  it('sin TRIMP en ninguna sesión no inventa una carga de cero', () => {
    const r = construirCardioDeLaVentana({
      sesiones: [sesion('2026-09-10', { trimp: undefined })],
      desde: '2026-09-08', hasta: '2026-09-14',
    });
    expect(r.carga).toBeNull();
    expect(r.sesiones).toBe(1);   // la sesión sigue contando
  });

  it('el reparto por zonas sí es de la ventana', () => {
    const r = construirCardioDeLaVentana({
      sesiones: [
        sesion('2026-09-01', { timeInZoneSec: { z1: 0, z2: 0, z3: 0, z4: 0, z5: 1800 } }),
        sesion('2026-09-10'),
      ],
      desde: '2026-09-08', hasta: '2026-09-14',
    });
    // La sesión anaeróbica del 1 queda fuera: el foco es el de la sesión suave.
    expect(r.foco!.anaerobicPct).toBe(0);
    expect(r.foco!.lowAerobicPct).toBeGreaterThan(70);
  });

  it('sin zonas registradas el foco es null, no un reparto a cero', () => {
    const r = construirCardioDeLaVentana({
      sesiones: [sesion('2026-09-10', { timeInZoneSec: { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 } })],
      desde: '2026-09-08', hasta: '2026-09-14',
    });
    expect(r.foco).toBeNull();
  });

  it('la FC media solo promedia las sesiones que la traen', () => {
    const r = construirCardioDeLaVentana({
      sesiones: [
        sesion('2026-09-09', { avgHR: 120 }),
        sesion('2026-09-10', { avgHR: 140 }),
        sesion('2026-09-11', { avgHR: undefined }),
      ],
      desde: '2026-09-08', hasta: '2026-09-14',
    });
    expect(r.fcMedia).toBe(130);
  });

  it('la última sesión y el HRR miran el historial entero, no la ventana', () => {
    const r = construirCardioDeLaVentana({
      sesiones: [sesion('2026-09-20', { hrr1Min: 28 }), sesion('2026-09-10')],
      desde: '2026-09-08', hasta: '2026-09-14',
    });
    expect(r.ultimaSesion).toBe('2026-09-20');
    expect(r.hrr1Min).toBe(28);
  });

  it('sin sesiones devuelve ceros explícitos y nada inventado', () => {
    const r = construirCardioDeLaVentana({ sesiones: [], desde: '2026-09-08', hasta: '2026-09-14' });
    expect(r).toMatchObject({
      sesiones: 0, minutos: 0, kcal: 0,
      fcMedia: null, foco: null, carga: null, hrr1Min: null, ultimaSesion: null,
    });
  });
});
