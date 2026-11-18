import { describe, it, expect } from 'vitest';
import {
  conVoto, cuentaDeVotos, esPreguntaPorEjercicio, fraseDeVotos, idsConVoto, leerVotos, votosATexto,
  type VotosDeEjercicios,
} from './cierrePorEjercicio';

const NOMBRES: Record<string, string> = { press: 'Press banca', curl: 'Curl en polea', sent: 'Sentadilla' };
const nombreDe = (id: string) => NOMBRES[id];

describe('votos por ejercicio', () => {
  it('ida y vuelta: el valor guarda quién se queda y quién se quitaría', () => {
    const votos: VotosDeEjercicios = { press: 'quitar', sent: 'queda', curl: 'quitar' };
    const texto = votosATexto(votos);
    expect(texto).toBe('-press,+sent,-curl');
    expect(leerVotos(texto)).toEqual(votos);
    expect(idsConVoto(leerVotos(texto), 'quitar')).toEqual(['press', 'curl']);
    expect(idsConVoto(leerVotos(texto), 'queda')).toEqual(['sent']);
  });

  it('sin opinar de ninguno no hay respuesta', () => {
    expect(votosATexto({})).toBe('');
    expect(leerVotos('')).toEqual({});
  });

  it('no se rompe con lo que no es suyo', () => {
    expect(leerVotos('mantener')).toEqual({});
    expect(leerVotos('cambiar')).toEqual({});
    expect(leerVotos(7)).toEqual({});
    expect(leerVotos(undefined)).toEqual({});
    expect(leerVotos('-a, +b,,-')).toEqual({ a: 'quitar', b: 'queda' });
  });

  it('tocar el mismo voto lo quita; tocar el otro lo cambia', () => {
    let v: VotosDeEjercicios = {};
    v = conVoto(v, 'press', 'quitar');
    expect(v).toEqual({ press: 'quitar' });
    v = conVoto(v, 'press', 'queda');
    expect(v).toEqual({ press: 'queda' });
    v = conVoto(v, 'press', 'queda');
    expect(v).toEqual({});
  });

  it('la frase para el coach lleva los nombres, no los ids', () => {
    expect(fraseDeVotos({ press: 'quitar', curl: 'quitar', sent: 'queda' }, nombreDe))
      .toBe('Quitaría: Press banca, Curl en polea. Se quedan: Sentadilla.');
    expect(fraseDeVotos({ sent: 'queda' }, nombreDe)).toBe('Se quedan: Sentadilla.');
    expect(fraseDeVotos({}, nombreDe)).toBe('');
  });

  it('un ejercicio que ya no está en el catálogo no se nombra', () => {
    expect(fraseDeVotos({ press: 'quitar', borrado: 'quitar' }, nombreDe)).toBe('Quitaría: Press banca.');
  });

  it('la cuenta resume el valor', () => {
    expect(cuentaDeVotos('-press,-curl,+sent')).toBe('2 que quitaría · 1 se queda');
    expect(cuentaDeVotos('+press,+sent')).toBe('2 se quedan');
    expect(cuentaDeVotos(undefined)).toBe('');
  });

  it('reconoce la pregunta por su señal', () => {
    expect(esPreguntaPorEjercicio({ signalKey: 'meso_end.quitar' })).toBe(true);
    expect(esPreguntaPorEjercicio({ signalKey: 'meso_end.rating' })).toBe(false);
    expect(esPreguntaPorEjercicio({})).toBe(false);
  });
});
