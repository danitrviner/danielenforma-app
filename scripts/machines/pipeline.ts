import path from 'node:path';
import type { Maquina } from '../../src/types';
import { maquinaId } from '../../src/utils/maquinaId';
import type { Importador } from './tipos';
import { categoriaDesdeNombre } from './categorias';
import { descargarYOptimizar, escribirJson } from './imagenes';

/**
 * Núcleo del importador de catálogos. Un importador solo sabe recorrer la web de
 * su marca; todo lo demás —id estable, categoría, traducción, imagen, JSON— pasa
 * por aquí, para que dos marcas nunca acaben con criterios distintos.
 *
 * Nada de lo que sale de aquí se publica: cada máquina se escribe con
 * `publicadoEn: null` y no la ve ningún atleta hasta que un admin la revisa en
 * Perfil › Ajustes › Máquinas. Es deliberado — el scraping no decide qué entra
 * en la app.
 */

export interface ResultadoImport {
  marca: string;
  familia: string;
  total: number;
  maquinas: Maquina[];
  sinTraduccion: string[];
  sinCategoria: string[];
  traduccionesHuerfanas: string[];
  fallosDeImagen: Array<{ nombre: string; error: string }>;
  bytesImagenes: number;
}

export async function importar(imp: Importador): Promise<ResultadoImport> {
  const crudas = await imp.obtener();
  if (crudas.length === 0) {
    throw new Error(`El importador de ${imp.marca} no ha devuelto ninguna máquina: la web habrá cambiado.`);
  }

  const maquinas: Maquina[] = [];
  const sinTraduccion: string[] = [];
  const sinCategoria: string[] = [];
  const fallosDeImagen: ResultadoImport['fallosDeImagen'] = [];
  const traduccionesUsadas = new Set<string>();
  let bytesImagenes = 0;

  for (const cruda of crudas) {
    const id = maquinaId(imp.marca, imp.familia, cruda.nombreOriginal);

    const traducido = imp.traducciones[cruda.nombreOriginal];
    if (traducido) traduccionesUsadas.add(cruda.nombreOriginal);
    else sinTraduccion.push(cruda.nombreOriginal);

    const categoria = imp.categorias?.[cruda.nombreOriginal] ?? categoriaDesdeNombre(cruda.nombreOriginal);
    if (!categoria) sinCategoria.push(cruda.nombreOriginal);

    let fotoUrl = '';
    try {
      const { ruta, bytes } = await descargarYOptimizar(id, cruda.imagenUrl);
      fotoUrl = ruta;
      bytesImagenes += bytes;
    } catch (err) {
      fallosDeImagen.push({ nombre: cruda.nombreOriginal, error: String(err) });
    }

    maquinas.push({
      id,
      nombreOriginal: cruda.nombreOriginal,
      // Sin traducción se cae al nombre original antes que dejar la tarjeta en
      // blanco; queda listado abajo para que se corrija, no se entierra.
      nombreMostrado: traducido ?? cruda.nombreOriginal,
      marca: imp.marca,
      familia: imp.familia,
      // 'core' como red de seguridad solo si el heurístico falla: la máquina
      // aparece en el listado de `sinCategoria` para recolocarla a mano.
      categoria: categoria ?? 'core',
      fotoUrl,
      fuente: 'scraping',
      visible: true,
      publicadoEn: null,
      creadoPor: 'sistema',
    });
  }

  maquinas.sort((a, b) => a.id.localeCompare(b.id));

  const destino = path.resolve(process.cwd(), `src/data/maquinas/${imp.marca}.json`);
  await escribirJson(destino, maquinas);

  return {
    marca: imp.marca,
    familia: imp.familia,
    total: maquinas.length,
    maquinas,
    sinTraduccion,
    sinCategoria,
    // Una traducción que ya no casa con ninguna máquina suele significar que el
    // fabricante ha renombrado el producto — y, por tanto, que su id ha cambiado.
    traduccionesHuerfanas: Object.keys(imp.traducciones).filter(n => !traduccionesUsadas.has(n)),
    fallosDeImagen,
    bytesImagenes,
  };
}
