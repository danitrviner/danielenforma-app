/* Genera el índice por palabras (`n/`) de la copia de Open Food Facts a partir
 * de lo que ya hay en la carpeta (`p/` e `indice.json`). No descarga nada ni
 * toca Firestore. `generarOpenFoodFacts.mjs` lo llama al terminar; este script
 * sirve para rehacerlo sin repetir la descarga.
 *
 * Uso: node scripts/generarIndicePalabrasOff.mjs [carpeta=public/off]
 */
import { escribirIndicePalabras } from './_lib/offPalabras.mjs';

const carpeta = process.argv[2] ?? 'public/off';
console.log('Índice por palabras:', escribirIndicePalabras(carpeta));
