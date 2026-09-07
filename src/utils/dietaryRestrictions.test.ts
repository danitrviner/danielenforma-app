import { describe, it, expect } from 'vitest';
import {
  violatesRestrictions, restrictionLabel, violatesHealthConditions,
  conditionCodesFromText, athleteConditions,
} from './dietaryRestrictions';

describe('violatesRestrictions', () => {
  it('excluye una receta con carne para un atleta vegano', () => {
    expect(violatesRestrictions([55, 68], 'vegano')).toBe(true);
  });

  it('excluye una receta con carne/pescado para un atleta vegetariano', () => {
    expect(violatesRestrictions([67], 'vegetariano')).toBe(true);
  });

  it('no excluye una receta apta aunque tenga otras restricciones', () => {
    // Prohibida para celíacos, pero eso no afecta a un atleta vegano.
    expect(violatesRestrictions([66], 'vegano')).toBe(false);
  });

  it('no dice nada de las recetas que aún no tienen restrictions (import antiguo)', () => {
    expect(violatesRestrictions(undefined, 'vegano')).toBe(false);
    expect(violatesRestrictions([], 'vegano')).toBe(false);
  });

  it('no filtra nada para omnívoro/otro', () => {
    expect(violatesRestrictions([55, 67], 'omnivoro')).toBe(false);
    expect(violatesRestrictions([55, 67], 'otro')).toBe(false);
  });

  it('etiqueta un código conocido', () => {
    expect(restrictionLabel(66)).toBe('Celiaquía');
  });

  it('no revienta con un código desconocido', () => {
    expect(restrictionLabel(999)).toContain('999');
  });
});

// El caso real que abrió esto (07-09-2026): un atleta celíaco recibió en su
// menú generado una receta con seitán, que es gluten puro.
describe('condiciones de salud', () => {
  const conSeitan = { restrictions: [119, 86, 116, 115, 89, 66, 118] }; // receta real del recetario
  const sinDato   = { restrictions: [] };

  it('descarta la receta con seitán para un celíaco', () => {
    expect(violatesHealthConditions(conSeitan, [66])).toBe(true);
  });

  it('deja pasar esa misma receta para quien no tiene esa condición', () => {
    expect(violatesHealthConditions(conSeitan, [92])).toBe(false);
    expect(violatesHealthConditions(conSeitan, [])).toBe(false);
    expect(violatesHealthConditions(conSeitan, undefined)).toBe(false);
  });

  it('descarta las recetas sin el dato cuando hay alguna condición', () => {
    expect(violatesHealthConditions(sinDato, [66])).toBe(true);
    expect(violatesHealthConditions({}, [66])).toBe(true);
  });

  it('no descarta las recetas sin el dato si el atleta no tiene condiciones', () => {
    expect(violatesHealthConditions(sinDato, [])).toBe(false);
  });

  it('deduce la celiaquía del texto libre que ya escribieron los atletas', () => {
    expect(conditionCodesFromText(['celiaco'])).toEqual([66]);
    expect(conditionCodesFromText(['soy celíaco'])).toEqual([66]);
    expect(conditionCodesFromText(['gluten'])).toEqual([66]);
    expect(conditionCodesFromText(['intolerancia al gluten', 'marisco'])).toEqual([66]);
  });

  it('tira por la versión estricta salvo que el texto diga "leve"', () => {
    expect(conditionCodesFromText(['lactosa'])).toEqual([87]);
    expect(conditionCodesFromText(['intolerancia leve a la lactosa'])).toEqual([113]);
  });

  it('no suaviza una condición por un "leve" que hablaba de otra cosa', () => {
    const codes = conditionCodesFromText(['intolerancia leve a la fructosa', 'lactosa']);
    expect(codes).toContain(114);
    expect(codes).toContain(87);
  });

  it('no deduce nada de un texto que no menciona ninguna condición', () => {
    expect(conditionCodesFromText(['frutos secos', 'marisco'])).toEqual([]);
    expect(conditionCodesFromText([])).toEqual([]);
    expect(conditionCodesFromText(undefined)).toEqual([]);
  });

  it('suma lo marcado y lo deducido, sin repetir', () => {
    expect(athleteConditions({ healthConditions: [66], allergies: ['celiaquia'] })).toEqual([66]);
    expect(athleteConditions({ healthConditions: [92], allergies: ['lactosa'] }).sort()).toEqual([87, 92]);
    expect(athleteConditions(null)).toEqual([]);
  });

  it('ignora códigos que no son condiciones marcables (regímenes: los lleva dietType)', () => {
    expect(athleteConditions({ healthConditions: [55, 66] })).toEqual([66]);
  });
});
