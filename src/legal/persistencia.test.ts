import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserProfile } from '../types';
import type { AceptacionesLegales } from './aceptacion';

const escrituras: { userId: string; datos: { legal: AceptacionesLegales } }[] = [];

vi.mock('../dbService', () => ({
  updateUserProfile: (userId: string, datos: { legal: AceptacionesLegales }) => {
    escrituras.push({ userId, datos });
    return Promise.resolve();
  },
  fusionarConsentimientoIA: () => Promise.resolve(),
}));

const { guardarAceptaciones } = await import('./persistencia');
const { registrarAceptacion, DOCUMENTOS_LEGALES, documentosPendientes } = await import('./aceptacion');

const AHORA = '2026-09-03T10:00:00.000Z';
const meta = (id: string) => DOCUMENTOS_LEGALES.find(d => d.id === id)!;
const perfil = (legal?: AceptacionesLegales) =>
  ({ userId: 'u1', email: 'atleta@ejemplo.com', role: 'client', legal } as UserProfile);

beforeEach(() => { escrituras.length = 0; });

/* El muro legal se recorre documento a documento y guarda al terminar CADA
   uno. `guardarAceptaciones` fusiona contra el `legal` del perfil que se le
   pasa y escribe el bloque ENTERO, así que quien lo llama tiene que irle
   pasando lo acumulado. Pasarle el perfil de la sesión —que no se refresca
   hasta el final del muro— borraba el primer documento al guardar el segundo:
   el atleta terminaba el muro con los términos sin aceptar, se le volvía a
   pedir, y el muro se quedaba en una pantalla negra con el índice fuera de
   rango. Es el bug de 03-09. */
describe('guardarAceptaciones a lo largo del muro', () => {
  it('acumula los dos documentos cuando se le pasa lo ya guardado', async () => {
    const tras1 = await guardarAceptaciones(
      perfil(),
      { terminos: registrarAceptacion(meta('terminos'), AHORA) },
    );
    const tras2 = await guardarAceptaciones(
      { ...perfil(), legal: tras1 },
      { privacidad: registrarAceptacion(meta('privacidad'), AHORA) },
    );

    expect(Object.keys(tras2).sort()).toEqual(['privacidad', 'terminos']);
    expect(documentosPendientes(tras2)).toEqual([]);
    // Y lo que va a Firestore es lo mismo que se devuelve: el bloque entero.
    expect(escrituras.at(-1)!.datos.legal).toEqual(tras2);
  });

  it('con el perfil sin refrescar pierde el documento anterior (regresión)', async () => {
    const sinRefrescar = perfil();
    await guardarAceptaciones(sinRefrescar, { terminos: registrarAceptacion(meta('terminos'), AHORA) });
    const tras2 = await guardarAceptaciones(
      sinRefrescar,
      { privacidad: registrarAceptacion(meta('privacidad'), AHORA) },
    );

    expect(Object.keys(tras2)).toEqual(['privacidad']);
    expect(documentosPendientes(tras2).map(d => d.id)).toEqual(['terminos']);
  });
});
