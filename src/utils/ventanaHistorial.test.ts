import { describe, it, expect } from 'vitest';
import { desdeHaceMeses, ventanaCardio, ventanaHrv } from './ventanaHistorial';

describe('desdeHaceMeses', () => {
  it('resta los meses pedidos', () => {
    expect(desdeHaceMeses(3, new Date(2026, 8, 16, 12, 0))).toBe('2026-06-16');
    expect(desdeHaceMeses(12, new Date(2026, 8, 16, 12, 0))).toBe('2025-09-16');
  });

  it('a las 00:30 en España devuelve el mismo día, no la víspera', () => {
    // El fallo que tenía: `toISOString()` a las 00:30 de Madrid (UTC+2) cae en
    // el día anterior, así que la ventana empezaba un día antes de lo que dice.
    expect(desdeHaceMeses(3, new Date(2026, 8, 16, 0, 30))).toBe('2026-06-16');
  });

  it('las ventanas con nombre son las que comparten las pantallas', () => {
    const hoy = new Date(2026, 8, 16, 12, 0);
    expect(ventanaCardio(hoy)).toBe('2025-09-16');
    expect(ventanaHrv(hoy)).toBe('2026-06-16');
  });
});
