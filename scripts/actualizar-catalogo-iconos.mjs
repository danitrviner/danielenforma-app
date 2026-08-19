#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   Baja el catálogo oficial de nombres de Material Symbols.

   `iconos-usados.mjs` no adivina por contexto qué literal del código es un
   icono: cruza todos los literales contra esta lista. Y `comprobar-iconos.mjs`
   la usa para cazar nombres que no existen —`recipe` estuvo meses pintándose
   como la palabra «RECIPE» en la cabecera de Ingredientes, porque Google no
   puede servir un glifo que no tiene y nada lo comprobaba.

   Se commitea a propósito, como la fuente: ni el build ni el lint deben
   depender de la red. Solo hay que volver a correr esto cuando Google añada
   iconos nuevos y se quiera usar alguno.

   Uso:  npm run iconos:catalogo
   ═══════════════════════════════════════════════════════════════════════════ */

import { writeFileSync } from 'node:fs';

const DESTINO = new URL('../src/assets/fonts/material-symbols-catalogo.txt', import.meta.url).pathname;
const URL_META = 'https://fonts.google.com/metadata/icons?incomplete=1&key=material_symbols';

const texto = await (await fetch(URL_META)).text();

// La respuesta viene con el prefijo anti-JSON-hijacking `)]}'` de Google.
const json = JSON.parse(texto.replace(/^\)\]\}'\s*/, ''));

if (!Array.isArray(json.icons) || json.icons.length === 0) {
  console.error('La metadata no traía iconos. ¿Cambió el endpoint?');
  process.exit(1);
}

const nombres = json.icons.map(i => i.name).sort();
writeFileSync(DESTINO, nombres.join('\n') + '\n');

console.log(`OK · ${nombres.length} nombres → src/assets/fonts/material-symbols-catalogo.txt`);
