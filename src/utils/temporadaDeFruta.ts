import { normalizeStr } from './foodPrefs.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Temporada de la fruta (Dani, 17-11-2026)

   «Nada de sandía en enero.» El catálogo no trae temporada, así que vive aquí:
   para cada fruta, los meses en los que se come en España. No es un veto —si
   ese día no cabe ninguna de temporada, mejor fruta de invernadero que ninguna—,
   pero la de temporada gana siempre que pueda.

   Lo que no aparece en la tabla (plátano, manzana, pera, cítricos de pulpa,
   tropicales de importación) se da por bueno todo el año: en el súper está
   siempre y a nadie le chirría verlo en el menú.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Meses (1-12) en los que esa fruta está en su momento. */
interface Temporada { claves: string[]; meses: number[] }

const rango = (desde: number, hasta: number): number[] => {
  const out: number[] = [];
  for (let m = desde; ; m = (m % 12) + 1) { out.push(m); if (m === hasta) break; }
  return out;
};

const TEMPORADAS: Temporada[] = [
  { claves: ['sandia'], meses: rango(6, 9) },
  { claves: ['melon'], meses: rango(5, 9) },
  { claves: ['fresa', 'freson'], meses: rango(2, 6) },
  { claves: ['cereza', 'picota'], meses: rango(5, 7) },
  { claves: ['melocoton', 'nectarina', 'paraguayo', 'paraguaya'], meses: rango(5, 9) },
  { claves: ['albaricoque'], meses: rango(5, 7) },
  { claves: ['ciruela'], meses: rango(6, 9) },
  { claves: ['breva'], meses: rango(6, 7) },
  { claves: ['higo'], meses: rango(8, 9) },
  { claves: ['uva'], meses: rango(8, 10) },
  { claves: ['granada'], meses: rango(9, 12) },
  { claves: ['caqui', 'persimon'], meses: rango(10, 12) },
  { claves: ['chirimoya'], meses: rango(10, 2) },
  { claves: ['nispero'], meses: rango(4, 6) },
  { claves: ['frambuesa', 'mora', 'grosella'], meses: rango(6, 9) },
  { claves: ['arandano'], meses: rango(5, 9) },
  { claves: ['mandarina', 'clementina'], meses: rango(11, 3) },
  { claves: ['naranja'], meses: rango(11, 4) },
  { claves: ['pomelo'], meses: rango(11, 4) },
  { claves: ['kiwi'], meses: rango(11, 5) },
];

const normal = (s: string) => normalizeStr(s);

/** La temporada de esa fruta, o null si vale todo el año (o no es fruta). */
function temporadaDe(nombre: string): number[] | null {
  const n = normal(nombre);
  return TEMPORADAS.find(t => t.claves.some(k => n.includes(k)))?.meses ?? null;
}

/** ¿Esa fruta queda rara en ese mes? `mes` es 1-12. */
export function fueraDeTemporada(nombre: string, mes: number): boolean {
  const meses = temporadaDe(nombre);
  return !!meses && !meses.includes(mes);
}

/** El mes (1-12) de una fecha; por defecto, hoy. */
export const mesDe = (d: Date = new Date()): number => d.getMonth() + 1;

const NOMBRE_DE_MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** «De mayo a septiembre», «Todo el año». Para decirlo en pantalla. */
export function textoDeTemporada(nombre: string): string {
  const meses = temporadaDe(nombre);
  if (!meses) return 'Todo el año';
  return `De ${NOMBRE_DE_MES[meses[0] - 1]} a ${NOMBRE_DE_MES[meses[meses.length - 1] - 1]}`;
}
