import { describe, it, expect } from 'vitest';
import { plantillaWhatsApp, type MotivoContacto } from './plantillasWhatsApp';

const MOTIVOS: MotivoContacto[] = ['sin_registrar', 'perdidas', 'sin_revision', 'sin_respuesta', 'bloque_terminado', 'alta_parada'];

describe('plantillaWhatsApp', () => {
  it('empieza con el nombre de pila, corto y sin viñetas', () => {
    for (const m of MOTIVOS) {
      const t = plantillaWhatsApp(m, { nombre: 'javier vergara', hoy: '2026-10-28', dias: 3, perdidas: 3, fechaRevision: '2026-10-24' });
      expect(t).toMatch(/Javier/);
      expect(t.split('\n').length).toBe(1);
      expect(t).not.toMatch(/[-•*]/);
      expect(t.length).toBeLessThan(320);
      expect(t.toLowerCase()).not.toMatch(/espero que estés bien|no dudes/);
    }
  });

  it('mete el dato de la señal', () => {
    expect(plantillaWhatsApp('sin_registrar', { nombre: 'Ana', hoy: '2026-10-28', dias: 4 })).toMatch(/4 días/);
    expect(plantillaWhatsApp('perdidas', { nombre: 'Ana', hoy: '2026-10-28', perdidas: 3 })).toMatch(/3 entrenos/);
    expect(plantillaWhatsApp('sin_respuesta', { nombre: 'Ana', hoy: '2026-10-28', fechaRevision: '2026-10-24' })).toMatch(/sábado 24/);
  });

  it('la apertura cambia con el día', () => {
    const a = plantillaWhatsApp('sin_registrar', { nombre: 'Ana', hoy: '2026-10-28', dias: 3 });
    const b = plantillaWhatsApp('sin_registrar', { nombre: 'Ana', hoy: '2026-10-29', dias: 3 });
    expect(a.split('.')[0]).not.toBe(b.split('.')[0]);
  });
});
