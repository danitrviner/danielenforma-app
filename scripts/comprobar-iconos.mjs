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

const usados = execFileSync('node', [new URL('./iconos-usados.mjs', import.meta.url).pathname, '--csv'],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split(',');

const faltan = usados.filter(n => !empaquetados.has(n));

if (faltan.length === 0) {
  console.log(`Iconos OK · ${usados.length} usados, todos dentro del subconjunto.`);
  process.exit(0);
}

console.error(`\nFaltan ${faltan.length} icono(s) en la fuente empaquetada:\n`);
for (const n of faltan) console.error(`  · ${n}`);
console.error('\nSaldrían como texto («' + faltan[0] + '») dentro de la interfaz.');
console.error('Arréglalo con:  npm run iconos:generar\n');
process.exit(1);
