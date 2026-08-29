import { describe, it, expect } from 'vitest';
import { esFotoViva, fotoDeReceta, sanearFoto } from './fotoDeReceta';

const MUERTA = 'https://s3.eu-west-3.amazonaws.com/storage.get.com/recipes/images/1.jpg';
const REPARADA = 'https://s3.eu-west-3.amazonaws.com/storage.getindya.com/recipes/images/1.jpg';

describe('fotoDeReceta', () => {
  it('repara el host muerto del importador en vez de descartarlo', () => {
    expect(sanearFoto(MUERTA)).toBe(REPARADA);
    expect(fotoDeReceta({ photoUrl: MUERTA })).toBe(REPARADA);
    expect(fotoDeReceta({ image: MUERTA })).toBe(REPARADA);
  });

  it('sanearFoto es idempotente y no toca URLs sanas', () => {
    expect(sanearFoto(REPARADA)).toBe(REPARADA);
    const url = 'https://firebasestorage.googleapis.com/v0/b/x/o/foto.jpg';
    expect(sanearFoto(url)).toBe(url);
  });

  it('deja pasar una URL cualquiera', () => {
    const url = 'https://firebasestorage.googleapis.com/v0/b/x/o/foto.jpg';
    expect(esFotoViva(url)).toBe(true);
    expect(fotoDeReceta({ image: url })).toBe(url);
  });

  it('prefiere image, cae a photoUrl solo si image no existe', () => {
    expect(fotoDeReceta({ image: 'https://a/b.jpg', photoUrl: 'https://c/d.jpg' })).toBe('https://a/b.jpg');
    expect(fotoDeReceta({ photoUrl: 'https://c/d.jpg' })).toBe('https://c/d.jpg');
  });

  it('tolera receta sin foto, nula o indefinida', () => {
    expect(fotoDeReceta({})).toBeUndefined();
    expect(fotoDeReceta(null)).toBeUndefined();
    expect(fotoDeReceta(undefined)).toBeUndefined();
    expect(esFotoViva('')).toBe(false);
    expect(sanearFoto('')).toBeUndefined();
  });
});
