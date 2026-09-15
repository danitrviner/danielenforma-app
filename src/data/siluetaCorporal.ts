import { MuscleGroup } from '../types';

// ═══════════════════════════════════════════════════════════════════════════
// SILUETA CORPORAL — la geometría del mapa de calor de volumen.
//
// Solo datos, cero React y cero color: quien pinta decide el relleno (sale de
// `heatmapBg` con el landmark de cada grupo), aquí solo está DÓNDE va cada
// grupo. Esa separación es la que permite rehacer el dibujo entero sin tocar
// el motor ni la tabla — que es justo lo que pasó: la primera versión usaba
// elipses y no se leía como un cuerpo.
//
// ── Lámina de anatomía, no manchas ─────────────────────────────────────────
// Cada grupo es su músculo: los pectorales son dos placas que nacen del
// esternón, el dorsal es la V que baja de la axila a la lumbar, el recto
// abdominal va segmentado en seis con los oblicuos a los lados, el trapecio es
// la cometa entre el cuello y la mitad de la espalda. El coach reconoce el
// músculo antes de leer la etiqueta, que es el punto entero de un mapa de calor.
//
// ── El eje y el espejo ─────────────────────────────────────────────────────
// El cuerpo está centrado en x=100 y solo se escribe la MITAD IZQUIERDA: la
// derecha la genera `espejo()`. Así es imposible que un lado quede desalineado
// del otro, que es el defecto que delata a este tipo de dibujos, y hay la mitad
// de coordenadas que revisar.
//
// ── Las dos vistas ─────────────────────────────────────────────────────────
// Los 17 grupos caben repartidos entre frente y espalda, sin que ninguno se
// quede fuera: deltoides lateral y anterior van delante, posterior detrás, que
// es donde se ven. Los tres «difíciles» tienen sitio honesto: core es el recto
// abdominal con sus oblicuos, lumbares son los erectores a los lados de la
// columna, y rotadores un parche escapular pequeño, con borde punteado porque
// es musculatura profunda y no una superficie visible.
// ═══════════════════════════════════════════════════════════════════════════

export type VistaSilueta = 'frente' | 'espalda';

export const VISTAS: { id: VistaSilueta; label: string }[] = [
  { id: 'frente', label: 'Frente' },
  { id: 'espalda', label: 'Espalda' },
];

/** Lienzo de UNA vista. Las dos usan el mismo, se pintan en SVG separados. */
export const VIEWBOX_SILUETA = '0 0 200 480';

/** Eje de simetría del cuerpo dentro del lienzo. */
export const EJE_X = 100;

export interface RegionSilueta {
  vista: VistaSilueta;
  /** Uno o varios paths. Solo comandos ABSOLUTOS M/L/C/Z — ver `espejo()`. */
  paths: string[];
  /** Ancla de la etiqueta, en coordenadas del viewBox. */
  centro: [number, number];
  /** Musculatura profunda: se dibuja con borde punteado para no fingir que se ve. */
  profundo?: boolean;
}

/**
 * Refleja un path respecto al eje del cuerpo.
 *
 * Solo entiende comandos ABSOLUTOS de pares x,y (M, L, C) y Z, que es
 * deliberadamente todo lo que se usa en este archivo: con comandos relativos
 * (m, l, c) o de un solo eje (H, V, S, Q, A) el reflejo necesitaría un parser
 * de verdad, y un dibujo que no se puede reflejar de forma fiable no vale para
 * un cuerpo simétrico. `espejo.test.ts` fija que reflejar dos veces devuelve el
 * original, que es la comprobación que caza cualquier comando no soportado.
 */
export function espejo(d: string): string {
  return d
    .replace(/([MLCZ])([^MLCZ]*)/g, (_, cmd: string, nums: string) => {
      if (cmd === 'Z') return `${cmd} `;
      const vals = nums.trim().split(/[\s,]+/).filter(Boolean).map(Number);
      return `${cmd}${vals.map((v, i) => (i % 2 === 0 ? EJE_X * 2 - v : v)).join(' ')} `;
    })
    .trim();
}

/** Un músculo par: se escribe el izquierdo y el derecho sale reflejado. */
function par(d: string): string[] {
  return [d, espejo(d)];
}

// ── Contorno ────────────────────────────────────────────────────────────────
// El cuerpo desnudo sobre el que se leen los músculos. No es interactivo ni se
// colorea. Proporciones de lámina: 8,5 cabezas de alto, hombros de dos cabezas
// de ancho, cintura marcada y brazos SEPARADOS del tronco — el hueco entre
// brazo y costado es lo que hace que se lea como una persona y no como un
// bloque. Cabeza y=16-60, hombro y=88, cintura y=180, cadera y=215,
// rodilla y=340, pie y=464.

const CABEZA = 'M100 16 C111 16 119 26 119 39 C119 52 111 62 100 62 C89 62 81 52 81 39 C81 26 89 16 100 16 Z';
const CUELLO = 'M92 56 L108 56 L109 78 L91 78 Z';
const TRONCO = 'M88 74 C75 77 66 85 63 98 C61 110 62 124 64 140 '
  + 'C66 156 69 168 71 180 C72 194 69 206 71 218 C75 230 125 230 129 218 '
  + 'C131 206 128 194 129 180 C131 168 134 156 136 140 C138 124 139 110 137 98 '
  + 'C134 85 125 77 112 74 Z';
const BRAZO = 'M56 90 C47 95 43 107 42 120 L40 168 L38 214 C38 226 36 242 38 252 '
  + 'C40 262 52 262 54 252 C56 242 54 226 54 214 L57 168 L60 120 C60 106 61 96 56 90 Z';
const MANO = 'M38 248 C31 254 29 270 34 281 C39 290 51 290 55 281 C59 270 57 254 51 248 Z';
const PIERNA = 'M70 224 C66 254 68 302 72 338 C74 356 74 398 76 430 L76 452 L95 452 '
  + 'L93 430 C93 398 95 356 97 338 C99 302 99 254 99 224 Z';
const PIE = 'M76 450 L95 450 L97 464 L72 464 Z';

const CONTORNO = [
  CABEZA, CUELLO, TRONCO,
  BRAZO, espejo(BRAZO), MANO, espejo(MANO),
  PIERNA, espejo(PIERNA), PIE, espejo(PIE),
];

export const CONTORNO_SILUETA: Record<VistaSilueta, string[]> = {
  frente: CONTORNO,
  espalda: CONTORNO,
};

// ── Músculos ────────────────────────────────────────────────────────────────
// Todos dejan 2-3 px de aire contra el contorno y contra sus vecinos. Ese hueco
// no es estético: sin él las regiones se tocan, el ojo las lee como una sola
// mancha y el mapa deja de decir qué grupo está caliente.

// Cada grupo se dibuja con VARIOS paths: sus vientres reales. Un pectoral
// partido en porción clavicular y esternal, un cuádriceps con sus tres vastos,
// un tríceps con su cabeza larga y su lateral. Todos los trozos de un mismo
// grupo comparten `MuscleGroup`, así que al pasar por cualquiera se enciende el
// grupo entero y la tabla sigue teniendo UNA fila por grupo: el detalle es
// puramente de dibujo, no cambia ni el motor ni el conteo de series.

/** Deltoides: dos lóbulos. Sirve para las tres porciones, cada una en su vista. */
const DELT_EXTERNO = 'M55 87 C47 91 43 101 43 113 C43 120 48 123 52 118 C55 111 56 95 55 87 Z';
const DELT_INTERNO = 'M57 88 C54 96 53 110 54 119 C55 125 61 125 62 118 C63 107 61 93 57 88 Z';

/** Brazo entre hombro y codo: cabeza larga y cabeza externa. */
const BRAZO_LARGO  = 'M45 126 C42 138 42 154 45 166 C47 173 51 173 52 166 C53 152 52 136 50 126 C48 121 46 121 45 126 Z';
const BRAZO_EXTERNO = 'M54 128 C52 140 52 154 54 164 C56 171 60 170 61 163 C62 151 61 136 58 128 C57 123 55 123 54 128 Z';

/** Un segmento del recto abdominal (mitad izquierda). */
const abdomen = (y0: number, y1: number, ancho: number): string => {
  const x1 = EJE_X - 2;
  const x0 = x1 - ancho;
  return `M${x0 + 3} ${y0} L${x1} ${y0} L${x1} ${y1} L${x0 + 3} ${y1} `
    + `C${x0} ${y1} ${x0} ${y1 - 3} ${x0} ${y1 - 3} L${x0} ${y0 + 3} `
    + `C${x0} ${y0} ${x0 + 3} ${y0} ${x0 + 3} ${y0} Z`;
};

export const REGIONES_SILUETA: Record<MuscleGroup, RegionSilueta> = {
  // ── Frente ───────────────────────────────────────────────────────────────
  deltoide_lat: { vista: 'frente', paths: [...par(DELT_EXTERNO), ...par(DELT_INTERNO)], centro: [100, 104] },

  deltoide_ant: {
    vista: 'frente',
    paths: [
      ...par('M68 94 C63 97 60 104 60 113 C60 120 65 122 68 116 C71 109 70 98 68 94 Z'),
      ...par('M72 97 C69 103 68 112 69 119 C70 125 75 124 76 117 C77 108 75 99 72 97 Z'),
    ],
    centro: [100, 110],
  },

  // Pectoral en sus dos porciones: la clavicular arriba y la esternal debajo.
  // El borde interno recto de las dos es la línea del esternón.
  pecho: {
    vista: 'frente',
    paths: [
      // Clavicular: estrecha y en cuña hacia el hombro. Ancha se lee como una
      // venda cruzando el pecho, no como un músculo.
      ...par('M96 101 C89 97 80 99 75 104 C72 107 74 112 78 113 C84 115 92 114 96 112 C98 110 98 105 96 101 Z'),
      // Esternal: la placa grande, más baja y más ancha.
      ...par('M96 116 C89 113 78 115 72 120 C68 124 70 131 76 135 C83 139 91 139 96 134 C98 131 98 121 96 116 Z'),
    ],
    centro: [100, 118],
  },

  biceps: { vista: 'frente', paths: [...par(BRAZO_LARGO), ...par(BRAZO_EXTERNO)], centro: [100, 146] },

  // Braquiorradial por fuera y masa flexora por dentro.
  antebrazo: {
    vista: 'frente',
    paths: [
      ...par('M42 176 C38 192 38 216 41 236 C43 245 48 245 49 236 C50 216 49 192 47 176 C46 170 43 170 42 176 Z'),
      ...par('M50 180 C48 196 48 218 50 236 C52 245 56 244 57 235 C58 216 57 194 55 180 C54 175 51 175 50 180 Z'),
    ],
    centro: [100, 208],
  },

  // Recto abdominal en seis, con los oblicuos flanqueándolo y el vértice que
  // baja al pubis. Es lo que lo hace reconocible de un vistazo.
  core: {
    vista: 'frente',
    paths: [
      ...par(abdomen(148, 165, 14)),
      ...par(abdomen(169, 186, 14)),
      ...par(abdomen(190, 206, 13)),
      ...par('M74 154 C70 170 71 190 77 203 C79 209 81 207 81 201 L81 152 C79 150 76 151 74 154 Z'),
      'M87 210 C91 222 109 222 113 210 C108 217 92 217 87 210 Z',
    ],
    centro: [100, 180],
  },

  // Los tres vastos: lateral por fuera, recto femoral por el centro y el
  // medial en la gota de encima de la rodilla.
  cuadriceps: {
    vista: 'frente',
    paths: [
      ...par('M74 236 C70 256 70 292 74 318 C77 330 81 330 82 318 C84 292 83 258 80 238 C78 230 75 229 74 236 Z'),
      ...par('M85 234 C83 256 83 292 85 314 C87 325 90 325 91 314 C92 292 92 256 89 234 C88 227 86 227 85 234 Z'),
      ...par('M89 290 C87 300 87 316 90 326 C92 333 94 332 94 324 C95 312 94 298 92 290 C91 286 90 286 89 290 Z'),
    ],
    centro: [100, 282],
  },

  // Cara interna del muslo: aductor mayor arriba y recto interno bajando.
  aductores: {
    vista: 'frente',
    paths: [
      ...par('M94 230 C92 240 92 254 94 264 C96 270 99 269 99 262 L99 230 Z'),
      ...par('M96 266 C95 274 95 288 96 296 C97 301 99 300 99 294 L99 266 Z'),
    ],
    centro: [100, 258],
  },

  // ── Espalda ──────────────────────────────────────────────────────────────
  // Trapecio en sus tres porciones: la cúpula del cuello a los hombros, las
  // fibras medias sobre la escápula y la punta que baja por la columna.
  trapecio: {
    vista: 'espalda',
    paths: [
      'M100 80 C93 80 88 86 84 95 C82 101 87 107 92 106 C95 105 97 104 100 104 '
        + 'C103 104 105 105 108 106 C113 107 118 101 116 95 C112 86 107 80 100 80 Z',
      ...par('M96 108 C91 110 87 116 86 124 C85 131 90 135 94 131 C97 128 97 118 96 108 Z'),
      'M100 130 C97 130 94 136 93 144 C92 152 96 158 100 160 C104 158 108 152 107 144 C106 136 103 130 100 130 Z',
    ],
    centro: [100, 110],
  },

  deltoide_post: { vista: 'espalda', paths: [...par(DELT_EXTERNO), ...par(DELT_INTERNO)], centro: [100, 104] },

  // Manguito: infraespinoso y redondo menor, sobre la escápula.
  rotadores: {
    vista: 'espalda',
    paths: [
      ...par('M73 104 C68 107 66 114 70 119 C74 124 79 121 80 114 C81 107 77 102 73 104 Z'),
      ...par('M74 120 C70 122 69 127 72 130 C75 133 79 131 79 126 C79 122 77 119 74 120 Z'),
    ],
    centro: [100, 114],
    profundo: true,
  },

  // Dorsal ancho: el ala. Fibras costales arriba e ilíacas abajo, convergiendo
  // hacia la lumbar — la V que el coach busca cuando mira una espalda.
  dorsal: {
    vista: 'espalda',
    paths: [
      ...par('M70 126 C64 134 63 148 66 160 C68 168 76 168 81 162 C85 156 87 144 86 134 '
        + 'C85 128 82 123 78 123 C74 123 71 124 70 126 Z'),
      ...par('M69 162 C67 170 68 180 72 186 C77 190 84 187 87 180 C89 174 89 166 87 160 '
        + 'C84 156 76 157 72 159 C70 160 69 161 69 162 Z'),
    ],
    centro: [100, 155],
  },

  triceps: { vista: 'espalda', paths: [...par(BRAZO_LARGO), ...par(BRAZO_EXTERNO)], centro: [100, 146] },

  // Erectores espinales: el largo que flanquea la columna y el cuadrado lumbar.
  lumbares: {
    vista: 'espalda',
    paths: [
      ...par('M93 164 C90 178 90 196 93 206 C96 213 99 211 99 202 L99 164 Z'),
      ...par('M88 172 C86 182 86 194 88 202 C90 207 92 206 92 200 C93 190 92 178 90 172 C89 169 88 169 88 172 Z'),
    ],
    centro: [100, 186],
  },

  // Glúteo mayor y, encima, el medio.
  gluteo: {
    vista: 'espalda',
    paths: [
      ...par('M76 214 C69 220 68 238 76 249 C84 257 96 254 97 242 C98 230 96 218 91 213 C86 209 80 210 76 214 Z'),
      ...par('M74 206 C69 209 67 216 70 221 C74 226 80 223 82 217 C83 211 79 203 74 206 Z'),
    ],
    centro: [100, 230],
  },

  // Bíceps femoral por fuera, semitendinoso por el centro, semimembranoso
  // asomando por dentro cerca de la rodilla.
  isquios: {
    vista: 'espalda',
    paths: [
      ...par('M74 258 C70 276 70 304 74 322 C77 333 82 333 83 322 C85 302 84 276 81 260 C79 252 76 252 74 258 Z'),
      ...par('M86 258 C84 276 84 302 86 318 C88 328 91 328 92 318 C93 300 93 276 90 258 C89 251 87 251 86 258 Z'),
      ...par('M92 290 C90 300 90 314 92 324 C94 330 96 329 96 322 C97 310 96 298 94 290 C93 286 92 286 92 290 Z'),
    ],
    centro: [100, 292],
  },

  // Los dos vientres del gastrocnemio y el sóleo debajo.
  gemelo: {
    vista: 'espalda',
    paths: [
      ...par('M78 358 C74 370 74 388 78 402 C80 410 84 410 85 402 C87 388 86 370 83 360 C81 353 79 353 78 358 Z'),
      ...par('M88 358 C86 370 86 388 88 400 C90 408 93 408 94 400 C95 388 94 370 92 358 C91 352 89 352 88 358 Z'),
      ...par('M82 404 C80 412 80 422 82 428 C84 433 88 433 90 428 C92 422 92 412 90 404 C88 400 84 400 82 404 Z'),
    ],
    centro: [100, 390],
  },
};

/** Los grupos que se dibujan en una vista. */
export function gruposDeVista(vista: VistaSilueta): MuscleGroup[] {
  return (Object.keys(REGIONES_SILUETA) as MuscleGroup[])
    .filter(g => REGIONES_SILUETA[g].vista === vista);
}
