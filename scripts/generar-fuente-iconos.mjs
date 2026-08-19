#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   Genera el subconjunto de Material Symbols con los iconos que usa la app.

   `06-1` / `07-5`. `index.html` cargaba la fuente desde fonts.googleapis.com
   con `rel="stylesheet"`, o sea render-blocking: 572 ms medidos CON banda ancha
   y latencia cero (domInteractive 188 ms frente a domContentLoaded 798 ms — el
   76 % del arranque era esperar a Google). En el sótano de un gimnasio sin
   datos, la pantalla se quedaba en el fondo hasta que expiraba el timeout de
   red del WebView, y al pintar, los iconos salían como el TEXTO de su ligadura
   —«fitness_center», «arrow_back», «close»—, lo que desmonta la barra inferior
   y todas las cabeceras. Las otras tres fuentes ya iban empaquetadas.

   Por qué un subconjunto y no la fuente entera: la variable completa son ~4 MB
   para ~3.000 iconos, y la app usa ~200. Eso son ~4 MB en el binario de las dos
   tiendas y en la primera carga web, para tirar el 93 %.

   Por qué se pide a Google y no se recorta en local: subsetear una fuente de
   ICONOS no es subsetear texto. Los nombres son ligaduras, y todos comparten el
   mismo alfabeto, así que un `pyftsubset --text=...` conserva prácticamente
   todas las ligaduras y no ahorra nada. El endpoint `icon_names=` de Google es
   el que sabe recortar por glifo.

   ES UN PASO MANUAL, A PROPÓSITO. No corre en el build: la fuente generada se
   commitea y el build es reproducible y sin red. Solo hay que volver a correr
   esto cuando se use un icono NUEVO — y `npm run iconos:comprobar` avisa.

   Uso:  node scripts/generar-fuente-iconos.mjs
   ═══════════════════════════════════════════════════════════════════════════ */

import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const DESTINO_FUENTE = new URL('../src/assets/fonts/material-symbols-subset.woff2', import.meta.url).pathname;
const DESTINO_LISTA  = new URL('../src/assets/fonts/material-symbols-iconos.txt', import.meta.url).pathname;

// Los mismos ejes que declaraba el <link> que esto sustituye (wght 100..700,
// FILL 0..1). Cambiarlos aquí cambia cómo se ve la app, no solo el peso.
const EJES = 'wght,FILL@100..700,0..1';

// Google sirve .ttf a los clientes que no anuncia soporte de woff2. Sin un
// User-Agent moderno, el subconjunto pesaría cinco veces más.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const iconos = execFileSync('node', [new URL('./iconos-usados.mjs', import.meta.url).pathname, '--csv'],
  { encoding: 'utf8' }).trim();

const nombres = iconos.split(',');
console.log(`Pidiendo el subconjunto de ${nombres.length} iconos…`);

const urlCss = 'https://fonts.googleapis.com/css2'
  + `?family=Material+Symbols+Outlined:${EJES}`
  + `&icon_names=${iconos}`
  + '&display=block';

const css = await (await fetch(urlCss, { headers: { 'User-Agent': UA } })).text();

if (css.includes('<') || !css.includes('@font-face')) {
  console.error('Google no devolvió CSS. Suele ser un nombre de icono que no existe.');
  console.error(css.slice(0, 400));
  process.exit(1);
}

// Ojo: el endpoint de SUBCONJUNTO no sirve un `.woff2` con extensión como el
// de la fuente completa, sino una URL opaca `/l/font?kit=…`. El formato real se
// declara aparte, en `format('woff2')`, así que se comprueba eso y no el path.
const url = css.match(/url\((https:\/\/[^)]+)\)/)?.[1];
if (!url || !css.includes("format('woff2')")) {
  console.error('El CSS no traía una fuente woff2:\n' + css.slice(0, 500));
  process.exit(1);
}

const fuente = Buffer.from(await (await fetch(url, { headers: { 'User-Agent': UA } })).arrayBuffer());

mkdirSync(dirname(DESTINO_FUENTE), { recursive: true });
writeFileSync(DESTINO_FUENTE, fuente);
// La lista se guarda al lado de la fuente para poder comprobar, sin red, si
// alguien ha usado un icono que no está dentro.
writeFileSync(DESTINO_LISTA, nombres.join('\n') + '\n');

console.log(`OK · ${(fuente.length / 1024).toFixed(1)} KB → src/assets/fonts/material-symbols-subset.woff2`);
