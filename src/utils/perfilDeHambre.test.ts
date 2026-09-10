import { describe, expect, it } from 'vitest';
import { perfilDeHambreDelTexto, perfilDeHambreVigente } from './perfilDeHambre';

describe('perfilDeHambreDelTexto', () => {
  it('reconoce la noche en las frases que escribe la gente', () => {
    for (const frase of ['Por la noche', 'sobre todo a la hora de la cena', 'DE MADRUGADA', 'por la tarde-noche']) {
      expect(perfilDeHambreDelTexto(frase)).toBe('noche');
    }
  });

  it('reconoce la mañana, con tilde y sin ella', () => {
    for (const frase of ['por la mañana', 'por la manana', 'nada más levantarme', 'antes del desayuno', 'muy temprano']) {
      expect(perfilDeHambreDelTexto(frase)).toBe('manana');
    }
  });

  it('el mediodía y el "siempre" son reparto equilibrado', () => {
    for (const frase of ['al mediodía', 'a la hora de la comida', 'en la merienda', 'tengo hambre todo el día']) {
      expect(perfilDeHambreDelTexto(frase)).toBe('equilibrado');
    }
  });

  it('la noche gana cuando la frase nombra las dos', () => {
    expect(perfilDeHambreDelTexto('por la mañana poco, por la noche muchísimo')).toBe('noche');
  });

  it('sin texto o sin nada reconocible no inventa un perfil', () => {
    expect(perfilDeHambreDelTexto(undefined)).toBeUndefined();
    expect(perfilDeHambreDelTexto('')).toBeUndefined();
    expect(perfilDeHambreDelTexto('depende')).toBeUndefined();
  });
});

describe('perfilDeHambreVigente', () => {
  it('lo que el atleta eligió a mano manda sobre lo que escribió en el alta', () => {
    expect(perfilDeHambreVigente('manana', 'por la noche')).toBe('manana');
  });

  it('sin elección, se usa lo del alta', () => {
    expect(perfilDeHambreVigente(undefined, 'por la noche')).toBe('noche');
  });

  it('sin nada de nada, undefined (el repartidor cae a uniforme)', () => {
    expect(perfilDeHambreVigente(undefined, undefined)).toBeUndefined();
  });
});
