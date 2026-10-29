import { describe, it, expect } from 'vitest';
import { usaCdg } from './eleccionCdg';

describe('usaCdg', () => {
  it('por defecto, reparto propio', () => {
    expect(usaCdg({}).cdg).toBe(false);
    expect(usaCdg({ tipificacion: { freno: 3, tiempo: 3 } }).cdg).toBe(false);
  });
  it('la plantilla marcada CDG manda', () => {
    expect(usaCdg({ plantilla: { cdg: true }, tipificacion: { freno: 5 } })).toEqual({ cdg: true, motivo: 'la plantilla elegida está marcada CDG' });
  });
  it('freno ≤ 2 o tiempo ≥ 4 piden CDG', () => {
    expect(usaCdg({ tipificacion: { freno: 2 } }).cdg).toBe(true);
    expect(usaCdg({ tipificacion: { tiempo: 4 } }).motivo).toContain('tiempo 4');
  });
});
