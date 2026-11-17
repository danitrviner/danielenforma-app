import { describe, expect, it } from 'vitest';
import type { Estancamiento } from '../estancamiento';
import { candidatosACambio } from './candidatosACambio';
import type { EstadoDeEjercicio } from './estadoDelBloqueAnterior';

const parado = (exerciseId: string, sesiones: number): Estancamiento =>
  ({ exerciseId, sesiones, veredicto: 'subir_series', accion: 'Esfuerzo y contexto en orden: súbele 1-2 series semanales al grupo y mantenlo unas semanas' });
const estado = (exerciseId: string, extra: Partial<EstadoDeEjercicio> = {}): EstadoDeEjercicio =>
  ({ exerciseId, sesiones: 10, estancamiento: null, molestia: null, ...extra });

describe('candidatosACambio', () => {
  const ESTADO = [
    estado('press'),
    estado('peck', { estancamiento: parado('peck', 7) }),
    estado('fondos', { molestia: { veces: 2, maxima: 6, ultima: '2026-02-01' } }),
    estado('curl'),
    estado('remo', { estancamiento: parado('remo', 12), molestia: { veces: 1, maxima: null, ultima: '2026-02-03' } }),
  ];
  const NOMBRES: Record<string, string> = { press: 'Press banca', peck: 'Peck deck', fondos: 'Fondos', curl: 'Curl', remo: 'Remo' };

  it('señala los parados, los que tienen molestia y los que el atleta quitaría; el resto se clona', () => {
    const r = candidatosACambio({ ejercicios: ['press', 'peck', 'fondos', 'curl', 'remo'], estado: ESTADO, quitaria: ['curl'], nombreDe: id => NOMBRES[id] });
    expect(r.clonar).toEqual(['press']);
    expect(r.cambiar.map(c => [c.exerciseId, c.motivos])).toEqual([
      ['remo', ['molestia', 'parado']],   // el que más motivos tiene, primero
      ['peck', ['parado']],
      ['fondos', ['molestia']],
      ['curl', ['lo_quitaria']],
    ]);
  });

  it('cada candidato dice por qué, y un parón trae lo que propone `detectarEstancamiento`', () => {
    const r = candidatosACambio({ ejercicios: ['peck', 'fondos', 'curl', 'remo'], estado: ESTADO, quitaria: ['curl'], nombreDe: id => NOMBRES[id] });
    const de = (id: string) => r.cambiar.find(c => c.exerciseId === id)!;
    expect(de('peck')).toMatchObject({ nombre: 'Peck deck', sesionesParado: 7, detalle: 'Parado 7 sesiones comparables.' });
    expect(de('peck').accionDelParon).toContain('súbele 1-2 series');
    expect(de('fondos')).toMatchObject({ molestia: { veces: 2, maxima: 6 }, detalle: 'Molestia apuntada en 2 sesiones (hasta 6/10).' });
    expect(de('curl').detalle).toBe('El atleta lo quitaría.');
    expect(de('remo').detalle).toBe('Molestia apuntada en 1 sesión; parado 12 sesiones comparables.');
  });

  it('sin motivos, todo se clona tal cual y en su orden', () => {
    const r = candidatosACambio({ ejercicios: ['curl', 'press', 'curl'], estado: ESTADO });
    expect(r).toEqual({ cambiar: [], clonar: ['curl', 'press'] });
  });

  it('un ejercicio sin estado (no se llegó a hacer) se clona, salvo que el atleta lo quitaría', () => {
    expect(candidatosACambio({ ejercicios: ['nuevo'], estado: [] }).clonar).toEqual(['nuevo']);
    expect(candidatosACambio({ ejercicios: ['nuevo'], estado: [], quitaria: ['nuevo'] }).cambiar[0]).toMatchObject({ exerciseId: 'nuevo', motivos: ['lo_quitaria'] });
  });

  it('lo que el atleta quitaría de OTRO bloque no señala nada de este', () => {
    expect(candidatosACambio({ ejercicios: ['press'], estado: ESTADO, quitaria: ['zancadas'] })).toEqual({ cambiar: [], clonar: ['press'] });
  });
});
