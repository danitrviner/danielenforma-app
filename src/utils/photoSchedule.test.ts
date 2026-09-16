import { describe, it, expect, vi, afterEach } from 'vitest';
import { hasUploadedThisOccurrence } from './photoSchedule';
import type { PhotoAssignment, ProgressPhoto } from '../types';

/** Hoy es miércoles 16 de septiembre de 2026, a las 10:00 hora de España. */
function congelarHoy() {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 8, 16, 10, 0, 0));
}

afterEach(() => { vi.useRealTimers(); });

function asignacion(type: PhotoAssignment['schedule']['type']): PhotoAssignment {
  return {
    id: 'pa1', athleteId: 'ana@x.com', views: ['front', 'side'],
    startDate: '2026-09-01', active: true,
    schedule: { type, weekdays: [3] },
  } as unknown as PhotoAssignment;
}

function foto(view: string, date: string): ProgressPhoto {
  return { id: `p_${view}_${date}`, athleteId: 'ana@x.com', view, date, url: 'x' } as unknown as ProgressPhoto;
}

describe('hasUploadedThisOccurrence', () => {
  it('con las dos vistas del día, la ocurrencia está cubierta', () => {
    congelarHoy();
    const fotos = [foto('front', '2026-09-16'), foto('side', '2026-09-16')];
    expect(hasUploadedThisOccurrence(asignacion('weekdays'), fotos)).toBe(true);
  });

  it('la foto hecha el domingo y subida el lunes sigue contando', () => {
    congelarHoy();
    // Dos días antes: dentro del margen.
    const fotos = [foto('front', '2026-09-14'), foto('side', '2026-09-14')];
    expect(hasUploadedThisOccurrence(asignacion('weekdays'), fotos)).toBe(true);
  });

  it('y la subida por adelantado, también', () => {
    congelarHoy();
    const fotos = [foto('front', '2026-09-18'), foto('side', '2026-09-18')];
    expect(hasUploadedThisOccurrence(asignacion('interval'), fotos)).toBe(true);
  });

  it('pero tres días atrás ya es la ocurrencia anterior', () => {
    congelarHoy();
    const fotos = [foto('front', '2026-09-13'), foto('side', '2026-09-13')];
    expect(hasUploadedThisOccurrence(asignacion('weekdays'), fotos)).toBe(false);
  });

  it('falta una vista y la ocurrencia no está cubierta', () => {
    congelarHoy();
    expect(hasUploadedThisOccurrence(asignacion('weekdays'), [foto('front', '2026-09-16')])).toBe(false);
  });

  it('a las 00:30 de España «hoy» es hoy, no la víspera en UTC', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 16, 0, 30, 0));
    // Con el día en UTC, `todayStr()` habría dicho 15 y una foto del 18 —a dos
    // días del 16— se habría quedado fuera de la ventana.
    const fotos = [foto('front', '2026-09-18'), foto('side', '2026-09-18')];
    expect(hasUploadedThisOccurrence(asignacion('weekdays'), fotos)).toBe(true);
  });

  it('la mensual mira el mes entero, no la ventana de días', () => {
    congelarHoy();
    const fotos = [foto('front', '2026-09-02'), foto('side', '2026-09-02')];
    expect(hasUploadedThisOccurrence(asignacion('monthly'), fotos)).toBe(true);
    const otroMes = [foto('front', '2026-08-30'), foto('side', '2026-08-30')];
    expect(hasUploadedThisOccurrence(asignacion('monthly'), otroMes)).toBe(false);
  });

  it('las fotos de otro atleta no cuentan', () => {
    congelarHoy();
    const ajenas = [
      { ...foto('front', '2026-09-16'), athleteId: 'otro@x.com' },
      { ...foto('side', '2026-09-16'), athleteId: 'otro@x.com' },
    ] as ProgressPhoto[];
    expect(hasUploadedThisOccurrence(asignacion('weekdays'), ajenas)).toBe(false);
  });
});
