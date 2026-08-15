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

   ── POR QUÉ ESTO NO ES SOLO UNA LISTA DE REGEX ──────────────────────────────

   La versión anterior buscaba CUATRO formas literales (`name="add"`,
   `icon="add"`, `{ icon: 'add' }`, `<span class="material-symbols-…">add<`) y
   se dejaba fuera todas las dinámicas, que es como la app nombra la mitad de
   sus iconos:

     name={abierto ? 'expand_less' : 'expand_more'}   ProfileScreen, MyMenuScreen
     { pending: 'radio_button_unchecked' }            ClientSetupPanel
     { side: 'accessibility_new' }                    PhotosScreen
     { 2: 'coffee', 5: 'dinner_dining' }              OnboardingForm

   Ninguno entraba en el subconjunto, así que en el móvil salían como el texto
   de su ligadura: «EXPAND_LESS» sobre la barra de progreso del Setup,
   «RADIO_BUTTON_UNCHECKED» en las filas de tareas, «ACCESSIBILITY_NEW» en las
   pestañas de fotos. Y el comprobador no lo veía, porque comparaba la lista
   de usados contra un subconjunto generado A PARTIR DE ESA MISMA LISTA: un
   check que no podía fallar nunca.

   La regla ahora es al revés. En vez de adivinar por contexto QUÉ literal es
   un icono, se recogen todos los literales del código y se cruzan con el
   CATÁLOGO oficial de Material Symbols (`material-symbols-catalogo.txt`,
   6.098 nombres). El sesgo es deliberado: colar de más cuesta ~200 bytes de
   fuente por icono; quedarse corto rompe una pantalla en producción y solo se
   descubre abriéndola. Medido en este repo, el barrido amplio da 249 nombres
   frente a los 205 de la lista vieja — unos KB a cambio de que no vuelva a
   pasar.

   Los contextos explícitos se siguen leyendo aparte, porque son los que
   permiten detectar un nombre INVENTADO: `<span …>recipe</span>` pasaba el
   check anterior (estaba en la lista pedida a Google) y aun así salía como
   texto, porque `recipe` no existe en Material Symbols. Todo lo que se nombre
   como icono y no esté en el catálogo se reporta por stderr y hace fallar
   `npm run iconos:comprobar`.

   Uso:  node scripts/iconos-usados.mjs          → uno por línea
         node scripts/iconos-usados.mjs --csv    → separados por comas
         node scripts/iconos-usados.mjs --json   → { usados, inventados }
   ═══════════════════════════════════════════════════════════════════════════ */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const RAÍZ = new URL('../src', import.meta.url).pathname;
const CATÁLOGO = new URL('../src/assets/fonts/material-symbols-catalogo.txt', import.meta.url).pathname;

/** Un nombre de icono de Material Symbols: minúsculas, dígitos y barra baja. */
const NOMBRE = '[a-z][a-z0-9_]*';

let catálogo;
try {
  catálogo = new Set(readFileSync(CATÁLOGO, 'utf8').split('\n').map(s => s.trim()).filter(Boolean));
} catch {
  console.error('Falta src/assets/fonts/material-symbols-catalogo.txt (catálogo oficial de Material Symbols).');
  console.error('Se regenera con:  npm run iconos:catalogo');
  process.exit(1);
}

/* Cualquier literal de cadena del código. El filtro real lo hace el catálogo. */
const LITERAL = new RegExp(`['"\`](${NOMBRE})['"\`]`, 'g');

/* Sitios donde el código dice EXPLÍCITAMENTE «esto es un icono». Sirven para
   cazar nombres inventados, que por definición no están en el catálogo.

   Se captura la EXPRESIÓN entera, no el primer literal: en
   `name={severity === 'critical' ? 'error' : 'warning'}` el primer literal es
   la condición, no el icono. Un nombre solo se denuncia como inventado cuando
   NINGÚN literal de su expresión existe en el catálogo — que es justo el caso
   de `<span className="material-symbols-outlined">recipe</span>`. */
const EXPLÍCITOS = [
  // <Icon name="add" />   ·   <Icon name={x ? 'add' : 'close'} />
  /<Icon\b[^>]*?\bname=(\{[^}]*\}|"[^"]*"|'[^']*')/g,
  // icon="add"  ·  icon={x ? 'add' : 'close'}   (Button, ListRow, StatTile, Tabs…)
  /\bicon=(\{[^}]*\}|"[^"]*"|'[^']*')/g,
  // { icon: 'add' }
  /\bicon:\s*("[^"]*"|'[^']*')/g,
  // <span className="material-symbols-outlined …">add</span>  y .ui-icon
  /(?:material-symbols-outlined|ui-icon)[^>]*>([^<]*)</g,
];

function* ficheros(dir) {
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) { yield* ficheros(ruta); continue; }
    if (['.ts', '.tsx'].includes(extname(ruta)) && !ruta.endsWith('.test.ts')) yield ruta;
  }
}

const usados = new Set();
const inventados = new Map(); // nombre → fichero donde se nombró como icono

for (const ruta of ficheros(RAÍZ)) {
  const fuente = readFileSync(ruta, 'utf8');

  for (const [, nombre] of fuente.matchAll(LITERAL)) {
    if (catálogo.has(nombre)) usados.add(nombre);
  }

  for (const patrón of EXPLÍCITOS) {
    for (const [, expresión] of fuente.matchAll(patrón)) {
      // Un literal suelto (el contenido de un <span>) no lleva comillas.
      const literales = [...expresión.matchAll(LITERAL)].map(([, n]) => n);
      const candidatos = literales.length ? literales : [expresión.trim()];

      const reales = candidatos.filter(n => catálogo.has(n));
      for (const nombre of reales) usados.add(nombre);

      // Si algo de la expresión sí es un icono, el resto son condiciones.
      if (reales.length) continue;
      for (const nombre of candidatos) {
        if (new RegExp(`^${NOMBRE}$`).test(nombre) && !inventados.has(nombre)) {
          inventados.set(nombre, ruta.replace(`${RAÍZ}/`, 'src/'));
        }
      }
    }
  }
}

const lista = [...usados].sort();

if (process.argv.includes('--json')) {
  process.stdout.write(JSON.stringify({
    usados: lista,
    inventados: [...inventados].map(([nombre, fichero]) => ({ nombre, fichero })),
  }));
} else {
  process.stdout.write(process.argv.includes('--csv') ? lista.join(',') : lista.join('\n') + '\n');
}

process.stderr.write(`\n${lista.length} iconos distintos\n`);
if (inventados.size) {
  process.stderr.write(`${inventados.size} nombre(s) que NO existen en Material Symbols:\n`);
  for (const [nombre, fichero] of inventados) process.stderr.write(`  · ${nombre}  (${fichero})\n`);
}
