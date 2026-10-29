import { describe, it, expect } from 'vitest';
import type { MensajeCoach } from '../../types';
import { mensajesVigentes, ETIQUETA_MOTIVO } from './MensajesCoachVista';

const m = (id: string, creadoEn: string, extra: Partial<MensajeCoach> = {}): MensajeCoach =>
  ({ id, athleteId: 'ana@x.com', motivo: 'otro', texto: 't', creadoEn, ...extra });

describe('mensajesVigentes', () => {
  const ahora = Date.parse('2026-10-29T12:00:00.000Z');
  it('solo los de las últimas tres semanas, el más nuevo primero', () => {
    const lista = [m('viejo', '2026-10-01T10:00:00.000Z'), m('a', '2026-10-20T10:00:00.000Z'), m('b', '2026-10-28T10:00:00.000Z')];
    expect(mensajesVigentes(lista, ahora).map(x => x.id)).toEqual(['b', 'a']);
  });
  it('sin mensajes, vacío', () => {
    expect(mensajesVigentes([], ahora)).toEqual([]);
  });
  it('ningún motivo nombra al asistente en pantalla', () => {
    for (const texto of Object.values(ETIQUETA_MOTIVO)) expect(texto).not.toMatch(/asistente|\bIA\b/);
  });
});
