import { describe, it, expect } from 'vitest';
import {
  PROTOCOLOS_VO2MAX, protocoloVo2max, indiceSemana, sesionVo2max, sesionZona2,
  semanaDelPrograma, lunesDe, resolverAsignacionCardio, previaDelPrograma,
} from './cardioProgression';
import { CardioAssignment, CardioProgram } from '../types';

const HOY = '2026-09-14'; // lunes

function programa(over: Partial<CardioProgram> = {}): CardioProgram {
  return { kind: 'vo2max', protocolId: 'billat30_30', startDate: '2026-08-31', ...over };
}

function asignacion(over: Partial<CardioAssignment> = {}): CardioAssignment {
  return {
    id: 'c1', athleteId: 'ana@ejemplo.com', type: 'intervalos',
    active: true, createdAt: '2026-08-31T10:00:00.000Z', ...over,
  };
}

describe('indiceSemana — el bloque no se acaba nunca ni se dispara', () => {
  it('mapea las semanas del bloque una a una', () => {
    expect(indiceSemana(1, 8)).toBe(0);
    expect(indiceSemana(8, 8)).toBe(7);
  });

  it('pasado el bloque repite el último microciclo de 4', () => {
    expect(indiceSemana(9, 8)).toBe(4);
    expect(indiceSemana(12, 8)).toBe(7);
    expect(indiceSemana(13, 8)).toBe(4);
  });
});

describe('sesionVo2max', () => {
  const p = protocoloVo2max('billat30_30');

  it('monta calentamiento, N series con su recuperación y vuelta a la calma', () => {
    const s = sesionVo2max(p, 1);
    const labels = s.intervals!.map(b => b.label);
    expect(labels[0]).toBe('Calentamiento');
    expect(labels.at(-1)).toBe('Vuelta a la calma');
    // 8 series → 8 de trabajo + 8 de recuperación + calentamiento + calma
    expect(s.intervals).toHaveLength(8 * 2 + 2);
    expect(s.intervals!.filter(b => b.label.startsWith('Serie'))).toHaveLength(8);
  });

  it('acumula más series a medida que avanza el bloque', () => {
    const series = (n: number) => sesionVo2max(p, n).intervals!.filter(b => b.label.startsWith('Serie')).length;
    expect(series(1)).toBe(8);
    expect(series(2)).toBe(10);
    expect(series(3)).toBe(12);
  });

  it('marca la semana de descarga y baja la carga', () => {
    expect(sesionVo2max(p, 3).esDescarga).toBe(false);
    expect(sesionVo2max(p, 4).esDescarga).toBe(true);
    const s4 = sesionVo2max(p, 4).intervals!.filter(b => b.label.startsWith('Serie')).length;
    expect(s4).toBeLessThan(12);
  });

  it('prescribe por zona, nunca en ppm fijos (así se reajusta al mejorar la FC)', () => {
    for (const proto of PROTOCOLOS_VO2MAX) {
      for (const b of sesionVo2max(proto, 2).intervals!) {
        expect(b.targetZone).toBeTruthy();
        expect(b.hrThresholdBpm).toBeUndefined();
      }
    }
  });
});

describe('sesionZona2 — progresa en tiempo, nunca en intensidad', () => {
  it('arranca en la base y sube cada semana', () => {
    expect(sesionZona2(30, 1).targetDurationSec).toBe(30 * 60);
    expect(sesionZona2(30, 2).targetDurationSec!).toBeGreaterThan(30 * 60);
    expect(sesionZona2(30, 3).targetDurationSec!).toBeGreaterThan(sesionZona2(30, 2).targetDurationSec!);
  });

  it('descarga cada cuarta semana', () => {
    expect(sesionZona2(30, 4).esDescarga).toBe(true);
    expect(sesionZona2(30, 4).targetDurationSec!).toBeLessThan(sesionZona2(30, 3).targetDurationSec!);
    // Y la descarga no se come un peldaño: la semana 5 sigue por encima de la 3.
    expect(sesionZona2(30, 5).targetDurationSec!).toBeGreaterThan(sesionZona2(30, 3).targetDurationSec!);
  });

  it('no crece sin fin: el techo es el doble de la base', () => {
    expect(sesionZona2(30, 60).targetDurationSec!).toBeLessThanOrEqual(60 * 60);
  });

  it('prescribe minutos enteros', () => {
    for (let n = 1; n <= 12; n++) {
      expect(sesionZona2(30, n).targetDurationSec! % 60).toBe(0);
    }
  });
});

describe('semanaDelPrograma — avanza quien entrena, no el calendario', () => {
  it('empieza en la semana 1 sin sesiones', () => {
    expect(semanaDelPrograma(programa(), 'c1', [], HOY)).toBe(1);
  });

  it('cuenta una semana por cada semana anterior con al menos una sesión', () => {
    const sesiones = [
      { date: '2026-08-31', assignmentId: 'c1' },
      { date: '2026-09-02', assignmentId: 'c1' }, // misma semana: no suma dos veces
      { date: '2026-09-08', assignmentId: 'c1' },
    ];
    expect(semanaDelPrograma(programa(), 'c1', sesiones, HOY)).toBe(3);
  });

  it('no avanza por las sesiones de esta semana (esas son las de hoy)', () => {
    expect(semanaDelPrograma(programa(), 'c1', [{ date: HOY, assignmentId: 'c1' }], HOY)).toBe(1);
  });

  it('ignora el cardio suelto y el de otras asignaciones', () => {
    const sesiones = [
      { date: '2026-09-01', assignmentId: 'otra' },
      { date: '2026-09-02', assignmentId: undefined },
    ];
    expect(semanaDelPrograma(programa(), 'c1', sesiones, HOY)).toBe(1);
  });

  it('quien se salta dos semanas repite semana, no se encuentra la carga de la 3', () => {
    const sesiones = [{ date: '2026-08-31', assignmentId: 'c1' }];
    expect(semanaDelPrograma(programa(), 'c1', sesiones, '2026-09-21')).toBe(2);
  });
});

describe('lunesDe', () => {
  it('lleva cualquier día a su lunes', () => {
    expect(lunesDe('2026-09-14')).toBe('2026-09-14'); // lunes
    expect(lunesDe('2026-09-20')).toBe('2026-09-14'); // domingo
  });
});

describe('resolverAsignacionCardio', () => {
  it('deja intacta una asignación sin programa', () => {
    const a = asignacion({ intervals: [{ label: 'X', closeType: 'time', durationSec: 60 }] });
    expect(resolverAsignacionCardio(a, [], HOY)).toBe(a);
  });

  it('sustituye los bloques por los de la semana en curso y ajusta la duración total', () => {
    const a = asignacion({ program: programa() });
    const sesiones = [{ date: '2026-09-07', assignmentId: 'c1' }];
    const r = resolverAsignacionCardio(a, sesiones, HOY)!;
    expect(r.intervals!.filter(b => b.label.startsWith('Serie'))).toHaveLength(10); // semana 2
    expect(r.targetDurationSec).toBe(r.intervals!.reduce((s, b) => s + b.durationSec, 0));
  });

  it('en Zona 2 ajusta la duración y no toca la zona objetivo', () => {
    const a = asignacion({ type: 'zona2', targetZone: 'z2', program: programa({ kind: 'zona2', baseMinutes: 40 }) });
    const r = resolverAsignacionCardio(a, [], HOY)!;
    expect(r.targetDurationSec).toBe(40 * 60);
    expect(r.targetZone).toBe('z2');
    expect(r.intervals).toBeUndefined();
  });

  it('tolera undefined (no hay cardio activo)', () => {
    expect(resolverAsignacionCardio(undefined, [], HOY)).toBeUndefined();
  });
});

describe('previaDelPrograma', () => {
  it('devuelve las próximas semanas para que el coach vea a dónde lleva', () => {
    const previa = previaDelPrograma(programa(), 1, 4);
    expect(previa).toHaveLength(4);
    expect(previa.map(p => p.semana)).toEqual([1, 2, 3, 4]);
    expect(previa[3].esDescarga).toBe(true);
  });
});

describe('dosis de VO₂máx — lo que decide si la sesión sirve', () => {
  it('las semanas altas caen en la horquilla útil de 10-20 min de trabajo', () => {
    for (const p of PROTOCOLOS_VO2MAX) {
      const pico = Math.max(...p.repsPorSemana.map((_, i) => sesionVo2max(p, i + 1).minutosDeTrabajo!));
      expect(pico).toBeGreaterThanOrEqual(7);
      expect(pico).toBeLessThanOrEqual(20);
    }
  });

  it('nunca prescribe más de 2 sesiones de VO₂máx a la semana', () => {
    for (const p of PROTOCOLOS_VO2MAX) {
      for (let n = 1; n <= 16; n++) {
        expect(sesionVo2max(p, n).sesionesPorSemana).toBeLessThanOrEqual(2);
      }
    }
  });

  it('los minutos de trabajo no cuentan recuperaciones ni calentamiento', () => {
    const p = protocoloVo2max('noruego4x4');
    const s = sesionVo2max(p, 2); // 4 series de 4 min
    expect(s.minutosDeTrabajo).toBe(16);
    const totalSesion = s.intervals!.reduce((sum, b) => sum + b.durationSec, 0) / 60;
    expect(totalSesion).toBeGreaterThan(s.minutosDeTrabajo!);
  });
});
