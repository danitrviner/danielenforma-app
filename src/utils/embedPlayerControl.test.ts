import { describe, expect, it } from 'vitest';
import { parseVideoUrl } from './embedPlayerControl';

describe('parseVideoUrl', () => {
  it('extrae el id de una URL youtube.com/watch?v=', () => {
    expect(parseVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({ provider: 'youtube', id: 'dQw4w9WgXcQ' });
  });

  it('ignora parámetros extra después del id', () => {
    expect(parseVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s')).toEqual({ provider: 'youtube', id: 'dQw4w9WgXcQ' });
  });

  it('extrae el id de una URL youtu.be corta', () => {
    expect(parseVideoUrl('https://youtu.be/dQw4w9WgXcQ')).toEqual({ provider: 'youtube', id: 'dQw4w9WgXcQ' });
  });

  it('extrae el id de un short de youtube', () => {
    expect(parseVideoUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toEqual({ provider: 'youtube', id: 'dQw4w9WgXcQ' });
  });

  it('extrae el id de una URL de vimeo', () => {
    expect(parseVideoUrl('https://vimeo.com/76979871')).toEqual({ provider: 'vimeo', id: '76979871' });
  });

  it('una URL que no es de youtube ni vimeo devuelve null', () => {
    expect(parseVideoUrl('https://example.com/video.mp4')).toBeNull();
  });

  it('cadena vacía devuelve null', () => {
    expect(parseVideoUrl('')).toBeNull();
  });
});
