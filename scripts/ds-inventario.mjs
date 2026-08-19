#!/usr/bin/env node
/**
 * Inventario del Design System — fase F0 del plan de migración.
 *
 * Mide el estado de la interfaz con contadores objetivos y lo compara contra
 * una línea base versionada. Es la red de seguridad de toda la migración: sin
 * esto, "reversible y revisable" es una intención y no un hecho.
 *
 *   node scripts/ds-inventario.mjs            compara contra la línea base
 *   node scripts/ds-inventario.mjs --write    (re)escribe la línea base
 *   node scripts/ds-inventario.mjs --json     vuelca el informe en crudo
 *   node scripts/ds-inventario.mjs --detalle  añade el desglose por archivo
 *
 * Sale con código 1 si una métrica de deuda SUBE o una métrica de salud BAJA.
 * Esa es la única condición de fallo: el inventario no juzga el valor absoluto,
 * solo la dirección. Se puede empezar con la deuda que sea; lo que no se puede
 * es empeorarla sin enterarse.
 *
 * Sin dependencias: solo módulos nativos de Node.
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const RAIZ = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const DIR_SRC = join(RAIZ, 'src');
const RUTA_BASE = join(RAIZ, 'docs/baseline/inventario.json');

/**
 * Las métricas se miden SOLO sobre código de componente (.tsx/.ts).
 *
 * `src/index.css` queda fuera a propósito: es el bloque @theme, es decir el
 * único sitio donde un valor hexadecimal *debe* estar. Contarlo junto a los
 * componentes mezcla dos señales opuestas — migrar un color a un token baja el
 * hex en el componente y lo sube en el CSS — y haría que el instrumento
 * marcase como regresión justo el trabajo que la migración persigue.
 * El CSS se mide aparte, como métrica informativa.
 */
const EXTENSIONES = new Set(['.tsx', '.ts']);
const EXTENSIONES_CSS = new Set(['.css']);
const IGNORAR = new Set(['node_modules', 'dist', '.git']);

/**
 * La capa de primitivas. Algunas métricas cuentan ahí lo contrario de lo que
 * cuentan fuera: un `fixed inset-0` en `ui/Sheet.tsx` ES el objetivo de la
 * migración, y el mismo patrón repetido a mano en una pantalla es la deuda que
 * la fase persigue. Sin esta distinción el instrumento penalizaría escribir la
 * primitiva, que es justo el trabajo que hay que hacer.
 *
 * Solo la usan las métricas que declaran `ambito`. El resto mide `ui/` como
 * cualquier otro archivo: las primitivas no están exentas de la escala de
 * espaciado, de los tokens de color ni del suelo tipográfico.
 */
const DIR_PRIMITIVAS = 'src/components/ui/';
const esPrimitiva = (rel) => rel.replaceAll('\\', '/').startsWith(DIR_PRIMITIVAS);

/** Escala de espaciado admitida por el DS, en px (base 4). */
const ESCALA_ESPACIADO = new Set([0, 4, 8, 12, 16, 20, 24, 32, 40, 56]);

/**
 * Los mismos nueve pasos expresados como escalón de Tailwind (escalón × 4 px).
 * Hace falta esta segunda forma porque la deuda de espaciado no se escribe casi
 * nunca en píxeles arbitrarios: se escribe con escalones —`py-20` son 80 px y
 * `pl-9` son 36— que la primera versión de esta métrica no miraba.
 */
const PASOS_ESPACIADO = new Set([0, 1, 2, 3, 4, 5, 6, 8, 10, 14]);

/**
 * Niveles de elevación del DS. Cualquier otra sombra está fuera de la escala:
 * las de Tailwind por defecto (`shadow-md`…), las arbitrarias (`shadow-[…]`),
 * los `drop-shadow` y los `boxShadow` escritos en un estilo en línea.
 */
const SOMBRAS_DS = new Set(['e1', 'e2', 'glow', 'none']);

/**
 * Tokens del Design System, tal como se llaman en el bloque @theme. Se cuenta
 * cualquier utilidad que los consuma (`bg-surface`, `text-ink-2`,
 * `border-hairline`, `hover:bg-raised`, `text-ink-2/60`…), no una lista
 * cerrada de clases: los prefijos de Tailwind son demasiados para enumerarlos
 * y lo que interesa medir es la adopción del token, no la utilidad concreta.
 */
const TOKENS_DS = [
  'bg', 'surface', 'raised', 'field',
  'ink', 'ink-2', 'ink-3', 'on-accent',
  'hairline', 'strong', 'accent-line',
  'accent', 'accent-press',
  'data',
  'success', 'warning', 'danger', 'info',
  'chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5',
];

/** Prefijos de utilidad de Tailwind que aceptan un color. */
const PREFIJOS_COLOR = [
  'bg', 'text', 'border', 'border-[xytblrse]', 'divide', 'divide-[xy]',
  'ring', 'outline', 'placeholder', 'caret', 'accent', 'decoration',
  'shadow', 'fill', 'stroke', 'from', 'via', 'to',
].join('|');

// ─────────────────────────────────────────────────────────────────────────────
// Utilidades de conteo
// ─────────────────────────────────────────────────────────────────────────────

/** Número de coincidencias de un patrón global. */
const contar = (texto, patron) => (texto.match(patron) ?? []).length;

/** Todas las capturas del grupo 1 de un patrón global. */
function capturas(texto, patron) {
  const salida = [];
  for (const m of texto.matchAll(patron)) salida.push(m[1]);
  return salida;
}

// ─────────────────────────────────────────────────────────────────────────────
// Definición de métricas
//
// direccion:
//   'bajar'  → es deuda; que suba rompe el build
//   'subir'  → es salud; que baje rompe el build
//   'info'   → se registra pero nunca falla (contexto, no objetivo)
//
// fase: en qué fase del plan se espera que esta métrica se mueva.
// ─────────────────────────────────────────────────────────────────────────────

const METRICAS = [
  {
    id: 'hexLiterales',
    etiqueta: "Hex literales en componentes",
    direccion: 'bajar',
    fase: 'F1',
    medir: (t) => contar(t, /#[0-9a-fA-F]{3,8}\b/g),
  },
  {
    id: 'clasesTokenEnUso',
    etiqueta: 'Tokens del DS en uso',
    direccion: 'subir',
    fase: 'F1',
    medir: (t) => TOKENS_DS.reduce(
      (n, tok) => n + contar(
        t, new RegExp(`(?:${PREFIJOS_COLOR})-${tok}(?![\\w-])`, 'g')), 0),
  },
  {
    id: 'importsThemeTs',
    etiqueta: "Imports de src/theme.ts",
    direccion: 'bajar',
    fase: 'F1',
    medir: (t) => contar(t, /from\s+['"][^'"]*\/theme['"]/g),
  },
  {
    id: 'bordesBlancosFuertes',
    etiqueta: 'Bordes border-white/>12',
    direccion: 'bajar',
    fase: 'F2',
    medir: (t) => capturas(t, /border-white\/(\d{1,3})\b/g)
      .filter((n) => Number(n) > 12).length,
  },
  {
    id: 'textoBajo11px',
    etiqueta: 'Textos por debajo de 11 px',
    direccion: 'bajar',
    fase: 'F4',
    medir: (t) => capturas(t, /text-\[(\d+(?:\.\d+)?)px\]/g)
      .filter((n) => Number(n) < 11).length,
  },
  {
    id: 'camposBajo16px',
    etiqueta: 'Campos de formulario < 16 px',
    direccion: 'bajar',
    fase: 'F11',
    /*
     * R8: Safari en iOS hace zoom al enfocar un `<input>`, `<select>` o
     * `<textarea>` con letra menor de 16 px, y NO lo deshace al salir — el
     * usuario se queda con la página ampliada.
     *
     * El riesgo llevaba abierto desde F4 sin contador: la auditoría dijo 5,
     * F2 encontró 238 y nadie podía comprobar si subían o bajaban. Sin esto,
     * F11 sería la única fase de la migración verificable solo a ojo.
     *
     * Mide la clase de tamaño que lleva el propio control, no la heredada:
     * busca la etiqueta de apertura y le lee el `className`. Los que no
     * declaran tamaño no se cuentan — heredan, y no hay forma barata de saber
     * de qué. Los de `ui/` quedan fuera: `Input` fija 16 px por construcción y
     * es el destino, no la deuda.
     */
    ambito: (rel) => !esPrimitiva(rel),
    medir: (t) => {
      const MENORES = /\btext-(caption|label|body-s|body|xs|sm|base)\b/;
      const GRANDES = new Set(['text-body', 'text-base']); // 15 px y 16 px
      let n = 0;
      /*
       * Exige un espacio detrás del nombre de etiqueta. Un control real de este
       * repo siempre lleva atributos (`<input type=…`, `<select\n  value=…`),
       * mientras que en prosa se escribe cerrada: «se queda a mano porque es un
       * <textarea>». Sin esta guarda, un comentario que MENCIONA la etiqueta se
       * cuenta como campo y adopta el `className` del siguiente elemento —
       * pasó de verdad, y dejó la métrica en 1 con la deuda ya a 0.
       */
      for (const m of t.matchAll(/<(?:input|select|textarea)\s/g)) {
        const etiqueta = t.slice(m.index, m.index + 900);
        const cls = /className=[{"`]([^"`}]*)/.exec(etiqueta);
        if (!cls) continue;
        const hallado = MENORES.exec(cls[1]);
        if (hallado && !GRANDES.has(hallado[0])) n++;
      }
      return n;
    },
  },
  {
    id: 'fontMono',
    etiqueta: 'font-mono',
    direccion: 'bajar',
    fase: 'F5',
    medir: (t) => contar(t, /(?<![\w-])font-mono(?![\w-])/g),
  },
  {
    id: 'fontSans',
    etiqueta: 'font-sans',
    direccion: 'subir',
    fase: 'F5',
    medir: (t) => contar(t, /(?<![\w-])font-sans(?![\w-])/g),
  },
  {
    id: 'pesosProhibidos',
    etiqueta: 'font-black / font-extrabold',
    direccion: 'bajar',
    fase: 'F4',
    medir: (t) => contar(t, /(?<![\w-])font-(?:black|extrabold)(?![\w-])/g),
  },
  {
    id: 'espaciadoFueraEscala',
    etiqueta: 'Espaciado fuera de la escala',
    direccion: 'bajar',
    fase: 'F6',
    medir: (t) => {
      // Valores arbitrarios en px: p-[6px], gap-[14px]…
      const arbitrarios = capturas(t, /(?:[pmg][xytblr]?|gap(?:-[xy])?|space-[xy])-\[(\d+(?:\.\d+)?)px\]/g)
        .filter((n) => !ESCALA_ESPACIADO.has(Number(n))).length;
      // Pasos de Tailwind que no caen en la escala (0.5 = 2px, 1.5 = 6px…).
      const fraccionarios = contar(t, /(?<![\w-])(?:[pmg][xytblr]?|gap(?:-[xy])?|space-[xy])-\d+\.5(?![\w-])/g);
      // Escalones enteros fuera de los nueve pasos: py-20 (80 px), pl-9 (36)…
      // El lookahead excluye el punto para no contar aquí la parte entera de
      // un fraccionario, que ya se cuenta arriba.
      const enteros = capturas(t, /(?<![\w-])(?:[pmg][xytblr]?|gap(?:-[xy])?|space-[xy])-(\d+)(?![\w./-])/g)
        .filter((n) => !PASOS_ESPACIADO.has(Number(n))).length;
      return arbitrarios + fraccionarios + enteros;
    },
  },
  {
    id: 'sombrasFueraEscala',
    etiqueta: 'Sombras fuera de la escala',
    direccion: 'bajar',
    fase: 'F6',
    medir: (t) => {
      // Utilidades `shadow-*` que no son un nivel del DS. Se excluyen las que
      // solo tiñen (`shadow-accent/10`), que las cuenta `glowAcento`.
      const utilidades = capturas(t, /(?<![\w-])shadow-([a-z0-9]+(?:-[a-z0-9]+)*|\[)/g)
        .filter((v) => !SOMBRAS_DS.has(v) && v !== 'accent').length;
      const enLinea = contar(t, /boxShadow/g);
      const drop = contar(t, /drop-shadow/g);
      return utilidades + enLinea + drop;
    },
  },
  {
    id: 'glowAcento',
    etiqueta: 'Glow de acento',
    direccion: 'bajar',
    fase: 'F6',
    medir: (t) => {
      // El DS admite exactamente uno en toda la app: el siguiente entrenamiento
      // pendiente. Cualquier otro brillo dorado deja de significar nada.
      const utilidad = contar(t, /(?<![\w-])(?:volt-glow|shadow-accent(?:\/\d+)?)(?![\w-])/g);
      const literal = contar(t, /(?:shadow|boxShadow|drop-shadow)[^;"'`\n]{0,80}?(?:251,\s*203,\s*26|#fbcb1a)/gi);
      return utilidad + literal;
    },
  },
  {
    id: 'modalesArtesanales',
    etiqueta: 'Overlays artesanales (no ui/)',
    direccion: 'bajar',
    fase: 'F9',
    // Los de `ui/` no cuentan: son el destino, no la deuda. Es el mismo
    // objetivo que el panel de estado ya declara — «0 fuera de ui/».
    ambito: (rel) => !esPrimitiva(rel),
    medir: (t) => contar(t, /fixed\s+inset-0/g),
  },
  {
    id: 'transitionAll',
    etiqueta: 'transition-all',
    direccion: 'bajar',
    fase: 'F13',
    medir: (t) => contar(t, /(?<![\w-])transition-all(?![\w-])/g),
  },
  {
    id: 'animatePulse',
    etiqueta: 'animate-pulse',
    direccion: 'bajar',
    fase: 'F13',
    medir: (t) => contar(t, /(?<![\w-])animate-pulse(?![\w-])/g),
  },
  {
    id: 'ariaLabel',
    etiqueta: 'aria-label',
    direccion: 'subir',
    fase: 'F14',
    medir: (t) => contar(t, /aria-label[=\s]/g),
  },
  {
    id: 'htmlFor',
    etiqueta: 'htmlFor',
    direccion: 'subir',
    fase: 'F14',
    medir: (t) => contar(t, /htmlFor[=\s]/g),
  },
  {
    id: 'focusVisible',
    etiqueta: 'focus-visible',
    direccion: 'subir',
    fase: 'F14',
    medir: (t) => contar(t, /focus-visible/g),
  },
  {
    id: 'reducedMotion',
    etiqueta: 'prefers-reduced-motion',
    direccion: 'subir',
    fase: 'F13',
    medir: (t) => contar(t, /prefers-reduced-motion/g),
  },
  // ── Informativas: contexto para leer las demás, nunca condición de fallo ──
  {
    id: 'roundedSm',   etiqueta: 'rounded-sm',   direccion: 'info', fase: 'F3',
    medir: (t) => contar(t, /(?<![\w-])rounded-sm(?![\w-])/g),
  },
  {
    id: 'roundedMd',   etiqueta: 'rounded-md',   direccion: 'info', fase: 'F3',
    medir: (t) => contar(t, /(?<![\w-])rounded-md(?![\w-])/g),
  },
  {
    id: 'roundedLg',   etiqueta: 'rounded-lg',   direccion: 'info', fase: 'F3',
    medir: (t) => contar(t, /(?<![\w-])rounded-lg(?![\w-])/g),
  },
  {
    id: 'roundedXl',   etiqueta: 'rounded-xl',   direccion: 'info', fase: 'F3',
    medir: (t) => contar(t, /(?<![\w-])rounded-xl(?![\w-])/g),
  },
  {
    id: 'rounded2xl',  etiqueta: 'rounded-2xl',  direccion: 'info', fase: 'F3',
    medir: (t) => contar(t, /(?<![\w-])rounded-2xl(?![\w-])/g),
  },
  {
    id: 'rounded3xl',  etiqueta: 'rounded-3xl',  direccion: 'info', fase: 'F3',
    medir: (t) => contar(t, /(?<![\w-])rounded-3xl(?![\w-])/g),
  },
  {
    id: 'roundedFull', etiqueta: 'rounded-full', direccion: 'info', fase: 'F3',
    medir: (t) => contar(t, /(?<![\w-])rounded-full(?![\w-])/g),
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Recorrido y medición
// ─────────────────────────────────────────────────────────────────────────────

function listarArchivos(dir, extensiones = EXTENSIONES) {
  const salida = [];
  for (const entrada of readdirSync(dir)) {
    if (IGNORAR.has(entrada)) continue;
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) salida.push(...listarArchivos(ruta, extensiones));
    else if (extensiones.has(extname(entrada))) salida.push(ruta);
  }
  return salida.sort();
}

/** Hex declarados en el CSS: no son deuda, son la fuente de verdad. */
function medirCss() {
  const distintos = new Set();
  let apariciones = 0;
  for (const ruta of listarArchivos(DIR_SRC, EXTENSIONES_CSS)) {
    for (const hex of readFileSync(ruta, 'utf8').match(/#[0-9a-fA-F]{3,8}\b/g) ?? []) {
      apariciones++;
      const v = hex.toLowerCase();
      if ([4, 5, 7, 9].includes(v.length)) distintos.add(v);
    }
  }
  return { distintos: distintos.size, apariciones, lista: [...distintos].sort() };
}

function medir() {
  // index.html también lleva clases de Tailwind en <body> y se le escapó a F1
  // precisamente porque el inventario no lo miraba. Ahora sí.
  const raizHtml = join(RAIZ, 'index.html');
  const archivos = [...listarArchivos(DIR_SRC), ...(existsSync(raizHtml) ? [raizHtml] : [])];

  const metricas = Object.fromEntries(METRICAS.map((m) => [m.id, 0]));
  const porArchivo = {};
  const hexDistintos = new Set();
  const tamanosTexto = new Set();
  const archivosGrandes = [];
  let lineasTsx = 0;
  let archivosTsx = 0;

  for (const ruta of archivos) {
    // Las <meta> quedan fuera: theme-color y similares exigen un hex literal,
    // no admiten var(). Es el único hex legítimo fuera del bloque @theme.
    const texto = readFileSync(ruta, 'utf8').replace(/<meta[^>]*>/g, '');
    const rel = relative(RAIZ, ruta);
    // Igual que `wc -l`: no cuenta el fragmento vacío tras el salto final.
    const lineas = texto.split('\n').length - (texto.endsWith('\n') ? 1 : 0);

    if (extname(ruta) === ".tsx") {
      archivosTsx++;
      lineasTsx += lineas;
      if (lineas > 600) archivosGrandes.push({ archivo: rel, lineas });
    }

    for (const hex of texto.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []) {
      const v = hex.toLowerCase();
      if ([4, 5, 7, 9].includes(v.length)) hexDistintos.add(v);
    }
    // Cuenta escalones de tamaño DISTINTOS en uso, vengan de donde vengan:
    // valores arbitrarios (`text-[9px]`), pasos de Tailwind (`text-sm`) o
    // tokens del DS (`text-body-s`). Contar solo los arbitrarios dejaba la
    // métrica ciega en cuanto F4 los eliminó: marcaba 0 con 8 escalones vivos.
    for (const px of capturas(texto, /text-\[(\d+(?:\.\d+)?)px\]/g)) {
      tamanosTexto.add(`${px}px`);
    }
    for (const paso of capturas(
      texto, /(?<![\w-])text-(xs|sm|base|lg|xl|[2-9]xl|display|title-l|title-m|title-s|body|body-s|label|caption)(?![\w-])/g)) {
      tamanosTexto.add(paso);
    }

    const conteo = {};
    for (const m of METRICAS) {
      const n = m.ambito && !m.ambito(rel) ? 0 : m.medir(texto);
      if (n > 0) {
        metricas[m.id] += n;
        conteo[m.id] = n;
      }
    }
    if (Object.keys(conteo).length > 0) porArchivo[rel] = conteo;
  }

  const css = medirCss();

  metricas.hexDistintos = hexDistintos.size;
  metricas.tamanosTextoDistintos = tamanosTexto.size;
  metricas.archivosMas600Lineas = archivosGrandes.length;
  metricas.hexEnTokensCss = css.distintos;

  return {
    generado: new Date().toISOString(),
    commit: commitActual(),
    totales: { archivosTsx, lineasTsx },
    metricas,
    listas: {
      hexDistintos: [...hexDistintos].sort(),
      hexEnTokensCss: css.lista,
      tamanosTexto: [...tamanosTexto].sort(),
      archivosGrandes: archivosGrandes.sort((a, b) => b.lineas - a.lineas),
    },
    porArchivo,
  };
}

function commitActual() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: RAIZ, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Presentación
// ─────────────────────────────────────────────────────────────────────────────

/** Métricas derivadas que no salen de METRICAS pero sí se vigilan. */
const DERIVADAS = [
  { id: 'hexDistintos',          etiqueta: 'Hex distintos en componentes', direccion: 'bajar', fase: 'F1' },
  { id: 'hexEnTokensCss',        etiqueta: 'Hex en tokens (index.css)',    direccion: 'info',  fase: 'F1' },
  { id: 'tamanosTextoDistintos', etiqueta: 'Escalones de tamaño en uso',     direccion: 'bajar', fase: 'F4' },
  { id: 'archivosMas600Lineas',  etiqueta: 'Archivos > 600 líneas',        direccion: 'info',  fase: 'F15' },
];

const TODAS = [...DERIVADAS, ...METRICAS.map(({ id, etiqueta, direccion, fase }) => ({ id, etiqueta, direccion, fase }))];

const SIMBOLO = { bajar: '↓', subir: '↑', info: '·' };

function informar(actual, base, { reciénEscrita = false } = {}) {
  const anchoEtiq = Math.max(...TODAS.map((m) => m.etiqueta.length));
  const regresiones = [];
  const mejoras = [];

  console.log(`\n  Inventario del Design System — ${actual.commit ?? 'sin commit'}`);
  console.log(`  ${actual.totales.archivosTsx} componentes .tsx · ${actual.totales.lineasTsx.toLocaleString('es-ES')} líneas\n`);

  const cab = `  ${'Métrica'.padEnd(anchoEtiq)}  Fase  Objetivo  ${'Actual'.padStart(8)}`;
  console.log(base ? `${cab}  ${'Base'.padStart(8)}  Delta` : cab);
  console.log(`  ${'─'.repeat(anchoEtiq + (base ? 44 : 26))}`);

  for (const m of TODAS) {
    const valor = actual.metricas[m.id] ?? 0;
    let linea = `  ${m.etiqueta.padEnd(anchoEtiq)}  ${m.fase.padEnd(4)}  `
      + `${SIMBOLO[m.direccion].padEnd(8)}  ${String(valor).padStart(8)}`;

    if (base) {
      const previo = base.metricas[m.id] ?? 0;
      const delta = valor - previo;
      const empeora = m.direccion === 'bajar' ? delta > 0
        : m.direccion === 'subir' ? delta < 0
          : false;
      const mejora = m.direccion === 'bajar' ? delta < 0
        : m.direccion === 'subir' ? delta > 0
          : false;

      if (empeora) regresiones.push({ ...m, previo, valor, delta });
      if (mejora) mejoras.push({ ...m, previo, valor, delta });

      const texto = delta === 0 ? '—' : (delta > 0 ? `+${delta}` : `${delta}`);
      const marca = empeora ? ' ✗' : mejora ? ' ✓' : '';
      linea += `  ${String(previo).padStart(8)}  ${texto.padStart(6)}${marca}`;
    }
    console.log(linea);
  }

  if (!base) {
    console.log(reciénEscrita
      ? '\n  Esta es la nueva línea base. Las próximas ejecuciones se comparan contra ella.\n'
      : '\n  Sin línea base. Genérala con:  npm run ds:inventario -- --write\n');
    return 0;
  }

  console.log('');
  if (mejoras.length > 0) {
    console.log(`  ✓ ${mejoras.length} métrica(s) mejoran:`);
    for (const m of mejoras) console.log(`      ${m.etiqueta}: ${m.previo} → ${m.valor}`);
    console.log('');
  }
  if (regresiones.length > 0) {
    console.log(`  ✗ ${regresiones.length} REGRESIÓN(ES):`);
    for (const m of regresiones) {
      console.log(`      ${m.etiqueta} (${m.fase}): ${m.previo} → ${m.valor}`);
      for (const archivo of culpables(actual, base, m.id)) console.log(`          ${archivo}`);
    }
    console.log('\n  Corrige, o actualiza la línea base a propósito con --write\n');
    return 1;
  }
  console.log('  Sin regresiones.\n');
  return 0;
}

/** Archivos donde una métrica concreta ha subido respecto a la línea base. */
function culpables(actual, base, idMetrica) {
  const salida = [];
  const archivos = new Set([...Object.keys(actual.porArchivo), ...Object.keys(base.porArchivo ?? {})]);
  for (const archivo of archivos) {
    const ahora = actual.porArchivo[archivo]?.[idMetrica] ?? 0;
    const antes = base.porArchivo?.[archivo]?.[idMetrica] ?? 0;
    if (ahora !== antes) salida.push(`${archivo}: ${antes} → ${ahora}`);
  }
  return salida.sort();
}

// ─────────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const informe = medir();

if (args.includes('--json')) {
  const salida = args.includes('--detalle') ? informe : { ...informe, porArchivo: undefined };
  console.log(JSON.stringify(salida, null, 2));
  process.exit(0);
}

if (args.includes('--write')) {
  writeFileSync(RUTA_BASE, JSON.stringify(informe, null, 2) + '\n');
  console.log(`\n  Línea base escrita en ${relative(RAIZ, RUTA_BASE)} (commit ${informe.commit})`);
  informar(informe, null, { reciénEscrita: true });
  process.exit(0);
}

const base = existsSync(RUTA_BASE) ? JSON.parse(readFileSync(RUTA_BASE, 'utf8')) : null;
process.exit(informar(informe, base));
