import { describe, it, expect } from 'vitest';
import { comprimirImagen, LADO_MAXIMO, CALIDAD } from './comprimirImagen';

/* En Node no hay `createImageBitmap` ni canvas, así que lo que se puede probar
   aquí es justo lo que importa: que NUNCA se pierda el fichero. La compresión
   real se ve en el navegador; que un fallo devuelva el original tiene que estar
   garantizado, porque es la pantalla donde el atleta documenta su progreso. */

function archivo(nombre: string, tipo: string, bytes = 1024): File {
  return new File([new Uint8Array(bytes)], nombre, { type: tipo });
}

describe('comprimirImagen', () => {
  it('lo que no es una imagen se devuelve intacto', async () => {
    const f = archivo('notas.pdf', 'application/pdf');
    expect(await comprimirImagen(f)).toBe(f);
  });

  it('si el navegador no puede decodificarla, se sube la original', async () => {
    // Sin `createImageBitmap` (este entorno) la función cae al catch.
    const f = archivo('foto.jpg', 'image/jpeg');
    const r = await comprimirImagen(f);
    expect(r).toBe(f);
    expect(r.size).toBe(f.size);
  });

  it('los valores por defecto son los que se decidieron', () => {
    expect(LADO_MAXIMO).toBe(1600);
    expect(CALIDAD).toBeGreaterThan(0.7);
    expect(CALIDAD).toBeLessThanOrEqual(0.85);
  });
});
