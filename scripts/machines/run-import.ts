import { MUSCLE_LABELS } from '../../src/types';
import type { Importador } from './tipos';
import { importar } from './pipeline';
import { hammerStrength } from './importers/hammerStrength';
import { technogym } from './importers/technogym';

/**
 * CLI del importador de catálogos de máquinas.
 *
 *   npx tsx scripts/machines/run-import.ts hammerStrength
 *   npx tsx scripts/machines/run-import.ts            # todas
 *
 * Escribe src/data/maquinas/<marca>.json y public/maquinas/<id>.webp.
 * Después hay que registrar el JSON en src/data/maquinas/index.ts y subir
 * CATALOGO_VERSION. Nada queda publicado: eso lo decide un admin desde la app.
 *
 * Para añadir una marca: un fichero en importers/ y una línea en REGISTRO.
 */
const REGISTRO: Record<string, Importador> = {
  hammerStrength,
  technogym,
};

async function main() {
  const pedidas = process.argv.slice(2);
  const claves = pedidas.length ? pedidas : Object.keys(REGISTRO);

  const desconocidas = claves.filter(c => !REGISTRO[c]);
  if (desconocidas.length) {
    console.error(`Marca desconocida: ${desconocidas.join(', ')}`);
    console.error(`Disponibles: ${Object.keys(REGISTRO).join(', ')}`);
    process.exit(1);
  }

  let incidencias = 0;

  for (const clave of claves) {
    console.log(`\n── ${clave} ──`);
    const r = await importar(REGISTRO[clave]);

    const kb = Math.round(r.bytesImagenes / 1024);
    const media = r.total ? Math.round(r.bytesImagenes / r.total / 1024) : 0;
    console.log(`${r.total} máquinas · ${r.familia}`);
    console.log(`imágenes: ${kb} KB en total, ${media} KB de media`);

    const porCategoria = new Map<string, number>();
    for (const m of r.maquinas) porCategoria.set(m.categoria, (porCategoria.get(m.categoria) ?? 0) + 1);
    console.log(
      'por categoría: ' +
      [...porCategoria.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([c, n]) => `${MUSCLE_LABELS[c as keyof typeof MUSCLE_LABELS] ?? c} ${n}`)
        .join(' · ')
    );

    // Nada se recorta en silencio: si algo ha quedado a medias, se dice.
    if (r.sinTraduccion.length) {
      incidencias += r.sinTraduccion.length;
      console.warn(`\n⚠ ${r.sinTraduccion.length} sin traducir (se muestran en inglés):`);
      r.sinTraduccion.forEach(n => console.warn(`   ${n}`));
    }
    if (r.sinCategoria.length) {
      incidencias += r.sinCategoria.length;
      console.warn(`\n⚠ ${r.sinCategoria.length} sin clasificar (van a 'core', recolócalas):`);
      r.sinCategoria.forEach(n => console.warn(`   ${n}`));
    }
    if (r.traduccionesHuerfanas.length) {
      incidencias += r.traduccionesHuerfanas.length;
      console.warn(`\n⚠ ${r.traduccionesHuerfanas.length} traducciones que ya no casan con ninguna máquina`);
      console.warn('   (el fabricante habrá renombrado el producto, y con él su id):');
      r.traduccionesHuerfanas.forEach(n => console.warn(`   ${n}`));
    }
    if (r.fallosDeImagen.length) {
      incidencias += r.fallosDeImagen.length;
      console.error(`\n✕ ${r.fallosDeImagen.length} imágenes no descargadas:`);
      r.fallosDeImagen.forEach(f => console.error(`   ${f.nombre}: ${f.error}`));
    }
  }

  console.log(
    incidencias === 0
      ? '\nSin incidencias. Registra los JSON en src/data/maquinas/index.ts y sube CATALOGO_VERSION.'
      : `\n${incidencias} incidencias arriba. Revísalas antes de publicar.`
  );
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
