import { describe, it, expect } from 'vitest';
import type { AppNotification } from '../types';
import { TOPE_DE_AVISOS } from './notifications';

/* No se prueba `getNotifications` (necesitaría Firestore), sino la propiedad
   que hace que el recorte sea seguro: que el tope declarado sea mayor que lo
   que la campana enseña, y que ordenar por `createdAt` como texto sea
   equivalente a ordenar por fecha. Esto último no es evidente y es de lo que
   depende que el `orderBy` del servidor y el `sort` del cliente coincidan. */

describe('el tope de avisos', () => {
  it('deja margen sobre lo que la campana enseña (40)', () => {
    expect(TOPE_DE_AVISOS).toBeGreaterThan(40);
  });
});

describe('ordenar por createdAt como texto', () => {
  const iso = (d: string) => new Date(d).toISOString();

  it('coincide con ordenar por fecha real', () => {
    const fechas = [
      '2026-01-05T10:00:00Z', '2026-12-31T23:59:59Z', '2025-06-01T00:00:00Z',
      '2026-01-05T09:59:59Z', '2026-02-01T00:00:00Z',
    ].map(iso);
    const porTexto = [...fechas].sort((a, b) => b.localeCompare(a));
    const porFecha = [...fechas].sort((a, b) => Date.parse(b) - Date.parse(a));
    expect(porTexto).toEqual(porFecha);
  });

  it('el cambio de año no rompe el orden', () => {
    const a: AppNotification = { id: 'a', createdAt: iso('2025-12-31T23:00:00Z') } as AppNotification;
    const b: AppNotification = { id: 'b', createdAt: iso('2026-01-01T01:00:00Z') } as AppNotification;
    expect([a, b].sort((x, y) => y.createdAt.localeCompare(x.createdAt))[0].id).toBe('b');
  });
});
