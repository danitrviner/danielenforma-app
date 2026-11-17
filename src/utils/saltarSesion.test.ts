import { describe, it, expect } from 'vitest';
import { MOTIVOS_DE_SALTO, cambiosAlSaltar, etiquetaDeMotivo, sePuedeSaltar, textoDeSalto } from './saltarSesion';

describe('saltar una sesión', () => {
  it('los cuatro motivos, en un toque', () => {
    expect(MOTIVOS_DE_SALTO.map(m => m.etiqueta)).toEqual(['Enfermo o lesión', 'Viaje o trabajo', 'Falta de tiempo', 'Otro']);
    expect(etiquetaDeMotivo('viaje')).toBe('Viaje o trabajo');
    expect(textoDeSalto('salud')).toBe('No la hice: enfermo o lesión');
  });

  it('solo se ofrece en una sesión pendiente y sin series apuntadas', () => {
    expect(sePuedeSaltar({ status: 'pending' }, 0)).toBe(true);
    expect(sePuedeSaltar({ status: 'pending' }, 3)).toBe(false);
    expect(sePuedeSaltar({ status: 'completed' }, 0)).toBe(false);
    expect(sePuedeSaltar({ status: 'skipped' }, 0)).toBe(false);
    expect(sePuedeSaltar({ status: 'perdido' }, 0)).toBe(false);
  });

  it('solo escribe el estado: es lo único que las reglas dejan tocar al atleta', () => {
    for (const m of MOTIVOS_DE_SALTO) expect(cambiosAlSaltar(m.clave)).toEqual({ status: 'skipped' });
  });
});
