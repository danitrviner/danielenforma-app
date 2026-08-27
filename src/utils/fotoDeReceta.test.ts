import { describe, it, expect } from 'vitest';
import { esFotoViva, fotoDeReceta } from './fotoDeReceta';

const MUERTA = 'https://s3.eu-west-3.amazonaws.com/storage.get.com/recipes/1.jpg';

describe('fotoDeReceta', () => {
  it('descarta el bucket muerto del importador de recetas', () => {
    expect(esFotoViva(MUERTA)).toBe(false);
    expect(fotoDeReceta({ photoUrl: MUERTA })).toBeUndefined();
  });

  it('deja pasar una URL cualquiera', () => {
    const url = 'https://firebasestorage.googleapis.com/v0/b/x/o/foto.jpg';
    expect(esFotoViva(url)).toBe(true);
    expect(fotoDeReceta({ image: url })).toBe(url);
  });

  it('prefiere image, pero cae a photoUrl si la primera está muerta', () => {
    expect(fotoDeReceta({ image: 'https://a/b.jpg', photoUrl: 'https://c/d.jpg' })).toBe('https://a/b.jpg');
    expect(fotoDeReceta({ image: MUERTA, photoUrl: 'https://c/d.jpg' })).toBe('https://c/d.jpg');
    expect(fotoDeReceta({ image: MUERTA, photoUrl: MUERTA })).toBeUndefined();
  });

  it('tolera receta sin foto, nula o indefinida', () => {
    expect(fotoDeReceta({})).toBeUndefined();
    expect(fotoDeReceta(null)).toBeUndefined();
    expect(fotoDeReceta(undefined)).toBeUndefined();
    expect(esFotoViva('')).toBe(false);
  });
});
