#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   ¿Usa la app algún icono que no esté dentro del subconjunto empaquetado?

   Es el precio de subsetear (06-1): la fuente ya no trae los ~3.000 iconos de
   Google, solo los que se usaban el día que se generó. Añadir un `<Icon
   name="rocket" />` sin regenerar no rompe el build ni da error en consola:
   simplemente sale la palabra «rocket» dentro del botón, y eso solo se ve
   abriendo esa pantalla concreta.

   Por eso esto corre en `npm run lint` y en `prerelease`: falla el comando,
   con el nombre del icono que falta, antes de que llegue a una tienda.

   Comprueba DOS cosas distintas, porque en producción fallaron las dos:

   1. Que todo icono usado esté dentro del subconjunto empaquetado. Esto ya
      estaba, pero no servía de nada: `iconos-usados.mjs` solo veía literales
      estáticos, así que un `name={x ? 'expand_less' : 'expand_more'}` no
      entraba ni en la lista ni en la comprobación. Se comparaba la lista de
      usados contra un subconjunto generado A PARTIR DE ESA MISMA LISTA — un
      check que no podía fallar. En el móvil salían «EXPAND_LESS»,
      «RADIO_BUTTON_UNCHECKED» y «ACCESSIBILITY_NEW» como texto.

   2. Que el nombre EXISTA en Material Symbols. `recipe` no existe: entraba en
      la lista pedida a Google, pasaba el punto 1 y aun así se pintaba la
      palabra «RECIPE» en la cabecera de Ingredientes, porque Google no puede
      servir un glifo que no tiene.
   ═══════════════════════════════════════════════════════════════════════════ */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const LISTA = new URL('../src/assets/fonts/material-symbols-iconos.txt', import.meta.url).pathname;

let empaquetados;
try {
  empaquetados = new Set(readFileSync(LISTA, 'utf8').split('\n').map(s => s.trim()).filter(Boolean));
} catch {
  console.error('No existe la lista de iconos empaquetados. Ejecuta: npm run iconos:generar');
  process.exit(1);
}

const { usados, inventados } = JSON.parse(
  execFileSync('node', [new URL('./iconos-usados.mjs', import.meta.url).pathname, '--json'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));

const faltan = usados.filter(n => !empaquetados.has(n));

if (faltan.length === 0 && inventados.length === 0) {
  console.log(`Iconos OK · ${usados.length} usados, todos existen y están dentro del subconjunto.`);
  process.exit(0);
}

if (inventados.length) {
  console.error(`\n${inventados.length} nombre(s) que NO existen en Material Symbols:\n`);
  for (const { nombre, fichero } of inventados) console.error(`  · ${nombre}  (${fichero})`);
  console.error('\nNo hay glifo que servir: se pinta la palabra dentro de la interfaz.');
  console.error('Busca el nombre real en src/assets/fonts/material-symbols-catalogo.txt\n');
}

if (faltan.length) {
  console.error(`\nFaltan ${faltan.length} icono(s) en la fuente empaquetada:\n`);
  for (const n of faltan) console.error(`  · ${n}`);
  console.error('\nSaldrían como texto («' + faltan[0] + '») dentro de la interfaz.');
  console.error('Arréglalo con:  npm run iconos:generar\n');
}

process.exit(1);
