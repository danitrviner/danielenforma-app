/* ═══════════════════════════════════════════════════════════════════════════
   Comprobar los trozos de la web compilada (18-11-2026)

   El 18-11 la PR #78 pasó lint, pruebas y `vite build`, y en producción
   varias pantallas se caían con «Cannot access 'pn' before initialization»:
   un ciclo de importaciones hacía que una constante se leyera antes de
   existir. Vitest carga los módulos en otro orden que la web compilada, así
   que las pruebas no lo ven.

   Este script sirve `dist/` y carga CADA trozo de `dist/assets/*.js` en una
   página nueva (en la misma página los fallos se arrastran de un trozo a
   otro). Un solo fallo y sale con código 1.

   Uso: `npm run build && npm run comprobar:trozos`
   ═══════════════════════════════════════════════════════════════════════════ */

import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { preview } from 'vite';
import { chromium } from 'playwright';

const DIST = 'dist';
const ASSETS = join(DIST, 'assets');

if (!existsSync(ASSETS)) {
  console.error('No hay dist/assets: ejecuta antes `npm run build`.');
  process.exit(1);
}

// El trozo de entrada monta la app entera: ese ya lo prueba abrir la web.
const entrada = new Set();
const html = (await import('node:fs')).readFileSync(join(DIST, 'index.html'), 'utf8');
for (const m of html.matchAll(/<script[^>]+src="\/(assets\/[^"]+\.js)"/g)) entrada.add(m[1]);

const trozos = readdirSync(ASSETS)
  .filter(f => f.endsWith('.js'))
  .map(f => `assets/${f}`)
  .filter(f => !entrada.has(f));

const servidor = await preview({ preview: { port: 0, strictPort: false, open: false }, logLevel: 'silent' });
const base = servidor.resolvedUrls.local[0].replace(/\/$/, '');
const navegador = await chromium.launch();

// Página vacía en el mismo origen: así `import()` resuelve las rutas relativas
// sin arrancar la app.
const VACIA = `${base}/__comprobar-trozos`;

async function probar(trozo) {
  const contexto = await navegador.newContext();
  const pagina = await contexto.newPage();
  const errores = [];
  pagina.on('pageerror', e => errores.push(e.message));
  await pagina.route(VACIA, r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><div id="root"></div></body></html>' }));
  await pagina.goto(VACIA);
  const fallo = await pagina.evaluate(async url => {
    try { await import(url); return null; } catch (e) { return String(e?.message ?? e); }
  }, `${base}/${trozo}`);
  await contexto.close();
  return fallo ?? errores[0] ?? null;
}

const fallos = [];
const EN_PARALELO = 6;
for (let i = 0; i < trozos.length; i += EN_PARALELO) {
  const tanda = trozos.slice(i, i + EN_PARALELO);
  const resultados = await Promise.all(tanda.map(probar));
  resultados.forEach((fallo, j) => { if (fallo) fallos.push({ trozo: tanda[j], fallo }); });
}

await navegador.close();
await new Promise(r => servidor.httpServer.close(r));

if (fallos.length) {
  console.error(`✗ ${fallos.length} de ${trozos.length} trozos fallan al cargar:`);
  for (const { trozo, fallo } of fallos) console.error(`  ${trozo}: ${fallo}`);
  console.error('\nSi dice «before initialization», hay un ciclo de importaciones: saca la constante a un archivo sin importaciones.');
  process.exit(1);
}
console.log(`✓ ${trozos.length} trozos cargan sin fallo.`);
