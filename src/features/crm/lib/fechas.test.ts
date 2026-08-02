import { describe, it, expect } from 'vitest';
import {
  parseDia, aDiaISO, formatDia, diasHasta, tiempoRelativo,
  avanzarPeriodo, sumarMeses, parseFechaFlexible, diasDeRetraso,
} from './fechas';

describe('parseDia / aDiaISO', () => {
  it('interpreta el día en hora local, no en UTC', () => {
    // new Date('2026-08-01') sería UTC medianoche; en zonas al oeste de
    // Greenwich getDate() devolvería 31.
    const d = parseDia('2026-08-01');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7);
    expect(d.getDate()).toBe(1);
  });

  it('ida y vuelta sin desplazarse un día', () => {
    for (const iso of ['2026-01-01', '2026-08-01', '2026-12-31', '2024-02-29']) {
      expect(aDiaISO(parseDia(iso))).toBe(iso);
    }
  });
});

describe('formatDia', () => {
  it('formatea dd mmm aaaa', () => {
    expect(formatDia('2026-08-01')).toBe('01 ago 2026');
    expect(formatDia('2026-12-25')).toBe('25 dic 2026');
  });
  it('cadena vacía si no hay fecha', () => {
    expect(formatDia(undefined)).toBe('');
    expect(formatDia('')).toBe('');
  });
});

describe('diasHasta / tiempoRelativo', () => {
  const hoy = new Date(2026, 7, 1); // 1 ago 2026

  it('cuenta días con signo', () => {
    expect(diasHasta('2026-08-04', hoy)).toBe(3);
    expect(diasHasta('2026-07-20', hoy)).toBe(-12);
    expect(diasHasta('2026-08-01', hoy)).toBe(0);
  });

  it('texto relativo en los casos cercanos', () => {
    expect(tiempoRelativo('2026-08-01', hoy)).toBe('hoy');
    expect(tiempoRelativo('2026-08-02', hoy)).toBe('mañana');
    expect(tiempoRelativo('2026-07-31', hoy)).toBe('ayer');
    expect(tiempoRelativo('2026-08-04', hoy)).toBe('en 3 días');
    expect(tiempoRelativo('2026-07-20', hoy)).toBe('hace 12 días');
  });

  it('cuenta en días hasta el mes y luego en meses', () => {
    expect(tiempoRelativo('2026-08-25', hoy)).toBe('en 24 días');
    expect(tiempoRelativo('2026-11-01', hoy)).toBe('en 3 meses');
  });

  it('concuerda el singular', () => {
    expect(tiempoRelativo('2026-09-05', hoy)).toBe('en 1 mes');
    expect(tiempoRelativo('2025-08-01', hoy)).toBe('hace 1 año');
    expect(tiempoRelativo('2024-08-01', hoy)).toBe('hace 2 años');
  });
});

describe('avanzarPeriodo', () => {
  it('avanza el periodo correspondiente', () => {
    expect(avanzarPeriodo('2026-01-15', 'mensual')).toBe('2026-02-15');
    expect(avanzarPeriodo('2026-01-15', 'trimestral')).toBe('2026-04-15');
    expect(avanzarPeriodo('2026-01-15', 'semestral')).toBe('2026-07-15');
    expect(avanzarPeriodo('2026-01-15', 'anual')).toBe('2027-01-15');
  });

  it('un pago único no avanza', () => {
    expect(avanzarPeriodo('2026-01-15', 'unico')).toBe('2026-01-15');
  });

  it('ancla al último día cuando el mes destino es más corto', () => {
    // Sin el anclaje, JS daría 2026-03-03 y la suscripción se iría desplazando.
    expect(avanzarPeriodo('2026-01-31', 'mensual')).toBe('2026-02-28');
    expect(avanzarPeriodo('2024-01-31', 'mensual')).toBe('2024-02-29'); // bisiesto
    expect(avanzarPeriodo('2026-03-31', 'mensual')).toBe('2026-04-30');
  });

  it('no acumula deriva al encadenar periodos', () => {
    // Empezando un día 31, tras dos saltos debe volver al 31 cuando el mes lo
    // permite... salvo que ya se haya anclado. Documenta el comportamiento real.
    const feb = avanzarPeriodo('2026-01-31', 'mensual'); // 28 feb
    expect(avanzarPeriodo(feb, 'mensual')).toBe('2026-03-28');
  });
});

describe('sumarMeses', () => {
  it('respeta el anclaje de fin de mes', () => {
    expect(sumarMeses('2026-08-31', 6)).toBe('2027-02-28');
    expect(sumarMeses('2026-08-01', 3)).toBe('2026-11-01');
  });
});

describe('parseFechaFlexible', () => {
  it('acepta dd/mm/aaaa y aaaa-mm-dd', () => {
    expect(parseFechaFlexible('01/08/2026')).toBe('2026-08-01');
    expect(parseFechaFlexible('1/8/2026')).toBe('2026-08-01');
    expect(parseFechaFlexible('2026-08-01')).toBe('2026-08-01');
    expect(parseFechaFlexible('01-08-2026')).toBe('2026-08-01');
  });

  it('rechaza fechas que no existen en vez de normalizarlas', () => {
    // new Date(2026, 1, 31) daría 3 de marzo en silencio.
    expect(parseFechaFlexible('31/02/2026')).toBeNull();
    expect(parseFechaFlexible('00/01/2026')).toBeNull();
    expect(parseFechaFlexible('01/13/2026')).toBeNull();
  });

  it('devuelve null con basura', () => {
    expect(parseFechaFlexible('')).toBeNull();
    expect(parseFechaFlexible('ayer')).toBeNull();
  });
});

describe('diasDeRetraso', () => {
  const hoy = new Date(2026, 7, 15); // 15 ago 2026

  it('cuenta días de retraso de una fecha pasada', () => {
    expect(diasDeRetraso('2026-08-08', hoy)).toBe(7);
    expect(diasDeRetraso('2026-07-16', hoy)).toBe(30);
  });

  it('nunca negativo — hoy y el futuro dan 0', () => {
    expect(diasDeRetraso('2026-08-15', hoy)).toBe(0);
    expect(diasDeRetraso('2026-08-20', hoy)).toBe(0);
    expect(diasDeRetraso('2026-09-01', hoy)).toBe(0);
  });
});
