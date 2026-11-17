import type { ExperienceLevel, HipotesisDeZona, Mesocycle, TipoDeBloque } from '../../types.js';
import { ZONAS_IEM, type ZonaIem } from '../cdg/zonas.js';
import { BLOQUES_PARA_JUZGAR_A_UN_AVANZADO, RM_OBJETIVO_PCT, SEMANAS_POR_DEFECTO } from './cifras.js';
import { enLista, estrellasDe } from './tiposDeBloque.js';

/* ═══════════════════════════════════════════════════════════════════════════
   El objetivo del bloque, dicho al atleta (17-11-2026)

   La hipótesis es cosa del coach: el atleta no ve palancas, índices ni
   techos. Ve UNA frase con de qué va el bloque y con qué se dará por bueno,
   en lo único que él puede comprobar: lo que mueve en sus ejercicios.

     «Este bloque va de pecho y hombro. Lo daremos por bueno si en 12 semanas
      mueves un 5 % más en tus ejercicios de pecho y de hombro.»

   Sin tecnicismos a propósito: ni «IEM», ni «RM estimado», ni «zona». Y nunca
   promete nada del proceso (eso lo vigila el coach), solo el resultado.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Cómo llama el atleta a cada zona. */
export const ZONA_PARA_EL_ATLETA: Record<ZonaIem, string> = {
  pectoral: 'pecho', dorsal: 'espalda', trapecio: 'trapecio', deltoides: 'hombro',
  biceps: 'bíceps', triceps: 'tríceps', antebrazo: 'antebrazo', lumbares: 'lumbar',
  abdomen: 'abdomen', cuadriceps: 'cuádriceps', isquios: 'isquios', gluteo: 'glúteo',
  aductores: 'aductores', gemelos: 'gemelo',
};

const fmt = (v: number) => v.toLocaleString('es-ES', { maximumFractionDigits: 1 });
const semanasTexto = (n: number) => `${n} ${n === 1 ? 'semana' : 'semanas'}`;

export function objetivoParaElAtleta(o: {
  tipo?: TipoDeBloque;
  /** Las zonas con estrella. */
  estrellas?: readonly ZonaIem[];
  semanas?: number;
  /** % de mejora que se busca (por defecto 5). Con varias zonas, el menor de sus objetivos. */
  rmObjetivoPct?: number;
  nivel?: ExperienceLevel;
}): string {
  const tipo = o.tipo ?? 'desarrollo';
  const semanas = semanasTexto(o.semanas != null && o.semanas > 0 ? o.semanas : SEMANAS_POR_DEFECTO);
  const estrellas = ZONAS_IEM.map(z => z.clave).filter(z => (o.estrellas ?? []).includes(z));
  const nombres = estrellas.map(z => ZONA_PARA_EL_ATLETA[z]);

  if (tipo === 'primer') {
    return `Este primer bloque va de aprender bien los ejercicios y encontrar tu punto de partida. Lo daremos por bueno si en ${semanas} haces tus sesiones y apuntas cada serie: con eso sabremos de dónde salimos.`;
  }
  if (tipo === 'mantenimiento') {
    return `Este bloque va de conservar lo que has ganado con menos trabajo. Lo daremos por bueno si en ${semanas} sigues moviendo lo mismo en tus ejercicios.`;
  }
  if (nombres.length === 0) {
    return `Este bloque va de seguir progresando en todo por igual. Lo daremos por bueno si en ${semanas} mueves más que ahora en tus ejercicios principales.`;
  }

  const pct = fmt(o.rmObjetivoPct != null && o.rmObjetivoPct > 0 ? o.rmObjetivoPct : RM_OBJETIVO_PCT);
  const deCada = enLista(nombres.map(n => `de ${n}`));
  // A un avanzado no se le pide el objetivo en un bloque: se mira a dos.
  const plazo = o.nivel === 'avanzado' && BLOQUES_PARA_JUZGAR_A_UN_AVANZADO === 2
    ? `entre este bloque y el siguiente`
    : `en ${semanas}`;
  const vaDe = tipo === 'especializacion'
    ? `Este bloque va todo a ${enLista(nombres)}: el resto se mantiene para dejarle sitio.`
    : `Este bloque va de ${enLista(nombres)}.`;
  return `${vaDe} Lo daremos por bueno si ${plazo} mueves un ${pct} % más en tus ejercicios ${deCada}.`;
}

/** La misma frase a partir del mesociclo guardado. */
export function objetivoDelMesoParaElAtleta(
  meso: Pick<Mesocycle, 'weeks'> & Partial<Pick<Mesocycle, 'tipoBloque' | 'hipotesis'>>, nivel?: ExperienceLevel,
): string {
  const estrellas = estrellasDe(meso);
  // Las zonas que se recuperan no son «de qué va» el bloque.
  const queSuben = estrellas.filter(z => (meso.hipotesis?.[z] as HipotesisDeZona | undefined)?.palanca !== 'recuperar');
  const objetivos = queSuben.map(z => meso.hipotesis?.[z]?.rmObjetivoPct).filter((v): v is number => v != null && v > 0);
  return objetivoParaElAtleta({
    tipo: meso.tipoBloque, estrellas: queSuben, semanas: meso.weeks, nivel,
    rmObjetivoPct: objetivos.length ? Math.min(...objetivos) : undefined,
  });
}
