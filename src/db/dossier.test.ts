import { describe, it, expect, vi } from 'vitest';

/* La ficha se manda al modelo como TEXTO, no como JSON: es lo que lee la IA
   antes de proponer y lo que Dani ve en el ClientHub. Se comprueba que no se
   cuelan secciones vacías (ruido en el prompt) y que el orden es el de lectura:
   primero quién es y a dónde va, al final lo que ya pasó. */

vi.mock('../firebase', () => ({ db: {}, doc: vi.fn(), getDoc: vi.fn(), setDoc: vi.fn() }));
vi.mock('./core', () => ({ forceLocalOnly: true, setLocalBypassMode: vi.fn(), esFalloDePermisos: () => false }));

import { renderDossier, DOSSIER_VACIO } from './dossier';
import type { AthleteDossier } from '../types';

const ficha = (extra: Partial<AthleteDossier>): AthleteDossier => ({ ...DOSSIER_VACIO, ...extra });

describe('renderDossier', () => {
  it('una ficha vacía no manda nada al prompt', () => {
    expect(renderDossier(DOSSIER_VACIO)).toBe('');
  });

  it('omite las secciones sin contenido en vez de dejar títulos huérfanos', () => {
    const texto = renderDossier(ficha({ objetivos: 'Bajar al 12% sin perder press banca' }));
    expect(texto).toContain('OBJETIVOS');
    expect(texto).toContain('Bajar al 12%');
    expect(texto).not.toContain('FOCO DE LA SIGUIENTE REVISIÓN');
    expect(texto).not.toContain('PREGUNTAS ABIERTAS');
  });

  it('pone lo que hay que saber antes de lo que ya pasó', () => {
    const texto = renderDossier(ficha({
      objetivos: 'Ganar músculo',
      foco: 'Ver si el dolor de hombro vuelve con press militar',
      preguntasAbiertas: ['¿Sigue yendo al gimnasio en agosto?'],
      hechos: [{ at: '2026-08-20T10:00:00Z', kind: 'propuesta', text: 'Mesociclo #4' }],
    }));
    expect(texto.indexOf('OBJETIVOS')).toBeLessThan(texto.indexOf('FOCO DE LA SIGUIENTE REVISIÓN'));
    expect(texto.indexOf('FOCO DE LA SIGUIENTE REVISIÓN')).toBeLessThan(texto.indexOf('QUÉ SE HA HECHO'));
    expect(texto).toContain('- ¿Sigue yendo al gimnasio en agosto?');
    expect(texto).toContain('2026-08-20 · propuesta: Mesociclo #4');
  });

  it('de un historial largo manda solo lo reciente, para no inflar el prompt', () => {
    const hechos = Array.from({ length: 40 }, (_, i) => ({
      at: `2026-08-${String((i % 28) + 1).padStart(2, '0')}T10:00:00Z`,
      kind: 'observacion' as const,
      text: `hecho ${i}`,
    }));
    const texto = renderDossier(ficha({ hechos }));
    expect(texto).toContain('hecho 39');
    expect(texto).not.toContain('hecho 0\n');
    expect(texto.split('\n').filter(l => l.startsWith('- 2026')).length).toBe(25);
  });
});
