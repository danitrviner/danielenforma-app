import { describe, it, expect } from 'vitest';
import type { AiProposal } from '../types';
import { nuevoEpisodio, type Episodio } from './episodios';
import { esperaTrasTurno, reanudar, pendientesDe, MARCA_ESPERA } from './reanudacion';

const AHORA = '2026-10-29T03:00:00.000Z';
const ep = (p: Partial<Episodio> = {}): Episodio => ({
  ...nuevoEpisodio({ tipo: 'alta_completada', athleteId: 'ana@x.com', clave: 'ana@x.com', disparador: { fuente: 'onboarding', fecha: '2026-10-29' }, politica: 'proponer', ahora: AHORA }),
  estado: 'en_curso', propuestas: ['p1', 'p2'], historial: [{ role: 'user', content: [{ type: 'text', text: 'guion' }] }],
  ...p,
});
const prop = (id: string, status: AiProposal['status'], extra: Partial<AiProposal> = {}): AiProposal =>
  ({ id, athleteId: 'ana@x.com', kind: 'mesocycle', status, chatId: 'c', createdAt: AHORA, summary: `Propuesta ${id}`, payload: {} as never, ...extra } as AiProposal);

describe('esperaTrasTurno', () => {
  it('sin la marca no hace nada', () => {
    expect(esperaTrasTurno(ep(), 'Hecho.\n\nPARA DANI: listo.', AHORA)).toBeNull();
    expect(MARCA_ESPERA.test('texto normal')).toBe(false);
  });
  it('con la marca y propuestas sin aplicar → escalado esperando justo esas', () => {
    const r = esperaTrasTurno(ep({ aplicadas: ['p1'] }), 'Propuesto el mesociclo.\nESPERO: p2\nPARA DANI: mesociclo propuesto.', AHORA)!;
    expect(r.estado).toBe('escalado');
    expect(r.esperaPropuestas).toEqual(['p2']);
    expect(r.paraDani).toContain('1 propuesta');
    expect(r.paraDani).toContain('mesociclo propuesto');
    expect(r.cerradoEn).toBeUndefined();
  });
  it('si la política ya lo aplicó todo, sigue en curso con un mensaje que lo dice', () => {
    const r = esperaTrasTurno(ep({ aplicadas: ['p1', 'p2'] }), 'ESPERO: p1, p2\nPARA DANI: x', AHORA)!;
    expect(r.estado).toBe('en_curso');
    expect(r.historial?.at(-1)).toMatchObject({ role: 'user' });
    expect(JSON.stringify(r.historial?.at(-1))).toContain('ya está aplicado');
  });
  it('en sombra se cierra: no hay a qué esperar', () => {
    const r = esperaTrasTurno(ep({ politica: 'sombra' }), 'ESPERO: p1\nPARA DANI: mesociclo en sombra.', AHORA)!;
    expect(r.estado).toBe('hecho');
    expect(r.paraDani).toMatch(/^\(sombra\)/);
  });
});

describe('reanudar', () => {
  const esperando = () => ep({ estado: 'escalado', esperaPropuestas: ['p1', 'p2'] });
  it('mientras alguna siga propuesta, nada', () => {
    expect(reanudar(esperando(), [prop('p1', 'approved'), prop('p2', 'proposed')], AHORA)).toBeNull();
    expect(reanudar(esperando(), [prop('p1', 'approved')], AHORA)).toBeNull(); // p2 ni aparece: se espera
  });
  it('con todas decididas vuelve a en_curso, apunta las aprobadas y cuenta al modelo qué pasó', () => {
    const r = reanudar(esperando(), [
      prop('p1', 'approved', { resultEntityId: 'meso_9', comentarios: [{ at: AHORA, text: 'con 4 días' }] }),
      prop('p2', 'rejected', { comentarios: [{ at: AHORA, text: 'no quiero escalera' }] }),
    ], AHORA)!;
    expect(r.estado).toBe('en_curso');
    expect(r.esperaPropuestas).toBeUndefined();
    expect(r.aplicadas).toEqual(['p1']);
    const texto = JSON.stringify(r.historial?.at(-1));
    expect(texto).toContain('APROBADA «Propuesta p1» (id de lo creado: meso_9)');
    expect(texto).toContain('con 4 días');
    expect(texto).toContain('RECHAZADA «Propuesta p2»: no quiero escalera');
    expect(pendientesDe(r)).toEqual(['p2']);
  });
  it('un episodio que no está escalado o no espera nada no se toca', () => {
    expect(reanudar(ep(), [prop('p1', 'approved')], AHORA)).toBeNull();
    expect(reanudar(ep({ estado: 'escalado' }), [], AHORA)).toBeNull();
  });
});
