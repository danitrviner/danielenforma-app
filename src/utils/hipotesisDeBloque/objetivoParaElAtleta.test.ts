import { describe, expect, it } from 'vitest';
import { ZONAS_IEM } from '../cdg/zonas';
import { ZONA_PARA_EL_ATLETA, objetivoDelMesoParaElAtleta, objetivoParaElAtleta } from './objetivoParaElAtleta';

describe('objetivoParaElAtleta', () => {
  it('el ejemplo: pecho y hombro en 12 semanas', () => {
    expect(objetivoParaElAtleta({ tipo: 'desarrollo', estrellas: ['pectoral', 'deltoides'], semanas: 12 }))
      .toBe('Este bloque va de pecho y hombro. Lo daremos por bueno si en 12 semanas mueves un 5 % más en tus ejercicios de pecho y de hombro.');
  });

  it('una sola zona, y «e» delante de isquios', () => {
    expect(objetivoParaElAtleta({ tipo: 'desarrollo', estrellas: ['gluteo'], semanas: 10 }))
      .toBe('Este bloque va de glúteo. Lo daremos por bueno si en 10 semanas mueves un 5 % más en tus ejercicios de glúteo.');
    // Las zonas salen en el orden del método, se pasen como se pasen.
    expect(objetivoParaElAtleta({ tipo: 'desarrollo', estrellas: ['isquios', 'cuadriceps'], semanas: 12 }))
      .toBe('Este bloque va de cuádriceps e isquios. Lo daremos por bueno si en 12 semanas mueves un 5 % más en tus ejercicios de cuádriceps y de isquios.');
  });

  it('primer bloque: aprender y apuntar, sin cifras', () => {
    const t = objetivoParaElAtleta({ tipo: 'primer', semanas: 8 });
    expect(t).toBe('Este primer bloque va de aprender bien los ejercicios y encontrar tu punto de partida. Lo daremos por bueno si en 8 semanas haces tus sesiones y apuntas cada serie: con eso sabremos de dónde salimos.');
    expect(t).not.toContain('%');
  });

  it('mantenimiento: seguir moviendo lo mismo', () => {
    expect(objetivoParaElAtleta({ tipo: 'mantenimiento', semanas: 12 }))
      .toBe('Este bloque va de conservar lo que has ganado con menos trabajo. Lo daremos por bueno si en 12 semanas sigues moviendo lo mismo en tus ejercicios.');
  });

  it('especialización: todo a una zona y el resto se mantiene', () => {
    expect(objetivoParaElAtleta({ tipo: 'especializacion', estrellas: ['pectoral'], semanas: 12 }))
      .toBe('Este bloque va todo a pecho: el resto se mantiene para dejarle sitio. Lo daremos por bueno si en 12 semanas mueves un 5 % más en tus ejercicios de pecho.');
  });

  it('desarrollo sin estrellas: progresar en todo', () => {
    expect(objetivoParaElAtleta({ tipo: 'desarrollo', semanas: 12 })).toContain('seguir progresando en todo por igual');
  });

  it('a un avanzado no se le pide el 5 % en un bloque: entre este y el siguiente', () => {
    expect(objetivoParaElAtleta({ tipo: 'desarrollo', estrellas: ['pectoral'], semanas: 12, nivel: 'avanzado' }))
      .toBe('Este bloque va de pecho. Lo daremos por bueno si entre este bloque y el siguiente mueves un 5 % más en tus ejercicios de pecho.');
  });

  it('sin datos usa los de por defecto: desarrollo, 12 semanas, 5 %', () => {
    expect(objetivoParaElAtleta({ estrellas: ['dorsal'] })).toBe('Este bloque va de espalda. Lo daremos por bueno si en 12 semanas mueves un 5 % más en tus ejercicios de espalda.');
    expect(objetivoParaElAtleta({ estrellas: ['dorsal'], rmObjetivoPct: 7.5, semanas: 1 })).toContain('en 1 semana mueves un 7,5 % más');
  });

  it('nunca habla en términos del método: ni índices, ni RM, ni palancas, ni «IA»', () => {
    const prohibidas = /\b(IEM|IF|IEA|RM|RIR|palanca|zona|hip[oó]tesis|est[ií]mulo|techo|IA)\b/i;
    const todas = ZONAS_IEM.map(z => z.clave);
    for (const tipo of ['primer', 'desarrollo', 'especializacion', 'mantenimiento'] as const) {
      for (const nivel of ['principiante', 'avanzado'] as const) {
        expect(objetivoParaElAtleta({ tipo, estrellas: todas, semanas: 12, nivel })).not.toMatch(prohibidas);
      }
    }
    expect(Object.keys(ZONA_PARA_EL_ATLETA)).toHaveLength(ZONAS_IEM.length);
  });
});

describe('objetivoDelMesoParaElAtleta', () => {
  it('sale de las hipótesis guardadas en el mesociclo', () => {
    const meso = { weeks: 12, tipoBloque: 'desarrollo' as const, hipotesis: { deltoides: { palanca: 'volumen' as const, rmObjetivoPct: 5 }, pectoral: { palanca: 'intensidad' as const, rmObjetivoPct: 5 } } };
    expect(objetivoDelMesoParaElAtleta(meso))
      .toBe('Este bloque va de pecho y hombro. Lo daremos por bueno si en 12 semanas mueves un 5 % más en tus ejercicios de pecho y de hombro.');
  });

  it('una zona que se recupera no es «de qué va» el bloque', () => {
    const meso = { weeks: 12, tipoBloque: 'desarrollo' as const, hipotesis: { pectoral: { palanca: 'volumen' as const, rmObjetivoPct: 4 }, deltoides: { palanca: 'recuperar' as const, rmObjetivoPct: 0 } } };
    expect(objetivoDelMesoParaElAtleta(meso)).toBe('Este bloque va de pecho. Lo daremos por bueno si en 12 semanas mueves un 4 % más en tus ejercicios de pecho.');
  });

  it('un bloque antiguo, sin tipo ni hipótesis, también tiene frase', () => {
    expect(objetivoDelMesoParaElAtleta({ weeks: 6 })).toContain('en 6 semanas mueves más que ahora');
  });
});
