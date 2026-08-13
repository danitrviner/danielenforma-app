#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   Lista los nombres de icono que la app usa de verdad.

   `06-1` / `07-5`. La fuente de iconos se pedía a fonts.googleapis.com en
   caliente: render-blocking, 572 ms medidos con banda ancha, y sin cobertura
   los iconos salían como el TEXTO de la ligadura («fitness_center»,
   «arrow_back»), lo que desmontaba la barra inferior y las cabeceras.

   Empaquetarla entera son ~4 MB de fuente variable con ~3.000 iconos para usar
   200. Este script saca los que se usan, y `scripts/generar-fuente-iconos.mjs`
   pide a Google el subconjunto exacto.

   Se recogen las CUATRO formas en que la app nombra un icono, que conviven a
   propósito porque la migración al design system (F8) adoptó `<Icon>` pantalla
   a pantalla y quedan usos de la clase cruda:

     <Icon name="add" />            ·  icon="add"
     { icon: 'add', ... }           ·  <span className="material-symbols-…">add</span>

   Uso:  node scripts/iconos-usados.mjs          → uno por línea
         node scripts/iconos-usados.mjs --csv    → separados por comas
   ═══════════════════════════════════════════════════════════════════════════ */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const RAÍZ = new URL('../src', import.meta.url).pathname;

/** Un nombre de icono de Material Symbols: minúsculas, dígitos y barra baja. */
const NOMBRE = '[a-z][a-z0-9_]*';

const PATRONES = [
  // <Icon name="add" />  y  <Icon ... name='add'>
  new RegExp(`<Icon\\b[^>]*?\\bname=["'](${NOMBRE})["']`, 'g'),
  // icon="add"  /  icon='add'   (props de Button, ListRow, StatTile, Tabs…)
  new RegExp(`\\bicon=["'](${NOMBRE})["']`, 'g'),
  // { icon: 'add' }   (tablas de configuración: navegación, bloques, retos…)
  new RegExp(`\\bicon:\\s*["'](${NOMBRE})["']`, 'g'),
  // <span className="material-symbols-outlined …">add</span>  y .ui-icon
  new RegExp(`(?:material-symbols-outlined|ui-icon)[^>]*>\\s*(${NOMBRE})\\s*<`, 'g'),
];

function* ficheros(dir) {
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) { yield* ficheros(ruta); continue; }
    if (['.ts', '.tsx'].includes(extname(ruta)) && !ruta.endsWith('.test.ts')) yield ruta;
  }
}

const encontrados = new Set();
for (const ruta of ficheros(RAÍZ)) {
  const fuente = readFileSync(ruta, 'utf8');
  for (const patrón of PATRONES) {
    for (const [, nombre] of fuente.matchAll(patrón)) encontrados.add(nombre);
  }
}

const lista = [...encontrados].sort();
process.stdout.write(process.argv.includes('--csv') ? lista.join(',') : lista.join('\n') + '\n');
process.stderr.write(`\n${lista.length} iconos distintos\n`);
