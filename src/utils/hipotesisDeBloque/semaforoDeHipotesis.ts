import type { Exercise, HipotesisDeZona, Mesocycle, WorkoutExercise, WorkoutLog } from '../../types.js';
import { semanasFueraDeSubidas, subidasDeLaZona, type SubidasDeLaZona } from '../cdg/agujetas.js';
import { iemSemanalPorZona } from '../cdg/iemSemanal.js';
import type { MotorCdg } from '../cdg/motor.js';
import { iemProgramadoPorZona } from '../cdg/progresionIem.js';
import { ZONAS_IEM, type ZonaIem } from '../cdg/zonas.js';
import { buildCierreMesociclo } from '../cierreMesociclo.js';
import { finDeBloque } from '../finDeBloque.js';
import { resolverEjercicioDelMeso } from '../progression.js';
import { FRACCION_DE_PROCESO_CUMPLIDO, RM_OBJETIVO_PCT, RM_RUIDO_PCT, redondearIem } from './cifras.js';
import type { EstadoDelBloque } from './estadoDelBloqueAnterior.js';
import { PALANCAS } from './palancas.js';
import { estadoDelBloqueAnterior, iniciosDeSemanaDelBloque } from './estadoDelBloqueAnterior.js';
import { estrellasDe, nombreCortoDeZona } from './tiposDeBloque.js';
import { rmDeLaZona, zonaPrincipalDeEjercicios } from './veredicto.js';
import { logsDelBloque } from './veredictosDelCierre.js';

/* ═══════════════════════════════════════════════════════════════════════════
   El semáforo de cada hipótesis, semana a semana (17-11-2026)

   El veredicto llega al cerrar el bloque; esto es la misma cuenta A MEDIAS,
   para el Seguimiento semanal: por cada zona con estrella, si va en camino de
   cumplir su hipótesis o se está quedando atrás, cuando aún se puede corregir.

     PROCESO   IEM medio realizado del bloque hasta hoy frente al objetivo, con
               el mismo 95 % del veredicto (`FRACCION_DE_PROCESO_CUMPLIDO`).
     RESULTADO RM estimado medio de los ejercicios de la zona frente a lo que
               tocaría a estas alturas: la parte proporcional del objetivo
               (a mitad de bloque, la mitad). Propio: pedir el +5 % entero en
               la semana 3 pondría todas las zonas en rojo. Mientras lo que
               toca no supere el ruido de medida (3 %) no se pide nada; una
               caída mayor que el ruido va «por detrás» en cualquier semana.

   El color de la fila es el peor de los dos; si falta uno, manda el otro.
   No decide nada ni propone: para eso están el freno/acelerador y el cierre.
   ═══════════════════════════════════════════════════════════════════════════ */

export type ColorDeSemaforo = 'en_camino' | 'por_detras' | 'sin_dato';

export const ETIQUETA_DE_SEMAFORO: Record<ColorDeSemaforo, string> = {
  en_camino: 'Va en camino', por_detras: 'Por detrás', sin_dato: 'Sin dato',
};

export interface FilaDeSemaforo {
  zona: ZonaIem;
  nombre: string;
  /** «volumen», «intensidad»… */
  palanca: string;
  iemMedio: number | null;
  iemMedioObjetivo: number | null;
  techo: number | null;
  /** Subidas programadas en lo que va de bloque. */
  subidas: number;
  /** Semanas normales en el nivel de la última subida, contando la de la subida; `null` si aún no ha subido. */
  semanasDesdeLaSubida: number | null;
  rmPct: number | null;
  rmObjetivoPct: number;
  /** Lo que tocaría llevar de RM a estas alturas del bloque. */
  rmEsperadoPct: number;
  proceso: ColorDeSemaforo;
  resultado: ColorDeSemaforo;
  color: ColorDeSemaforo;
  /** Las cifras en una línea, para la fila. */
  texto: string;
}

const fmt = (v: number) => (Math.round(v * 10) / 10).toLocaleString('es-ES');
const conSigno = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt(Math.abs(v))}`;

export function semaforoDeHipotesis(o: {
  hipotesis: Partial<Record<string, HipotesisDeZona>> | undefined;
  /** `estadoDelBloqueAnterior` sobre el bloque EN CURSO (hasta hoy). `null` sin motor o sin registros. */
  estado: Pick<EstadoDelBloque, 'porZona'> | null;
  /** `subidasDeLaZona` de cada zona, con lo programado hasta la semana en curso. */
  subidas?: Partial<Record<ZonaIem, Pick<SubidasDeLaZona, 'subidas' | 'semanasSostenidas'>>>;
  /** % de RM de los ejercicios de cada zona (`rmDeLaZona`). */
  rm?: Partial<Record<ZonaIem, number | null>>;
  /** Semana del bloque en la que se está (1-indexada) y las que tiene. */
  semanaActual: number;
  semanasTotales: number;
}): FilaDeSemaforo[] {
  const avance = o.semanasTotales > 0 ? Math.min(1, Math.max(0, o.semanaActual / o.semanasTotales)) : 1;
  return ZONAS_IEM.flatMap(z => {
    const h = o.hipotesis?.[z.clave];
    if (!h) return [];
    const zona = z.clave;
    const medio = o.estado?.porZona[zona]?.iemMedio;
    const iemMedio = medio == null ? null : redondearIem(medio);
    const recuperar = h.palanca === 'recuperar';
    const iemMedioObjetivo = h.iemMedioObjetivo ?? null;
    const techo = h.iemTecho ?? null;

    let proceso: ColorDeSemaforo = 'sin_dato';
    if (iemMedio != null) {
      if (recuperar && techo != null) proceso = iemMedio <= techo * (2 - FRACCION_DE_PROCESO_CUMPLIDO) ? 'en_camino' : 'por_detras';
      else if (!recuperar && iemMedioObjetivo != null && iemMedioObjetivo > 0) {
        proceso = iemMedio >= iemMedioObjetivo * FRACCION_DE_PROCESO_CUMPLIDO ? 'en_camino' : 'por_detras';
      }
    }

    const rmObjetivoPct = h.rmObjetivoPct ?? RM_OBJETIVO_PCT;
    const rmEsperadoPct = redondearIem(Math.max(0, rmObjetivoPct) * avance);
    const rm = o.rm?.[zona];
    const rmPct = rm == null ? null : redondearIem(rm);
    let resultado: ColorDeSemaforo = 'sin_dato';
    if (rmPct != null) {
      resultado = rmPct <= -RM_RUIDO_PCT ? 'por_detras'
        // Mientras lo esperado no supere el ruido de medida, cualquier cifra dentro del ruido vale.
        : rmObjetivoPct <= 0 || rmPct >= rmEsperadoPct || rmEsperadoPct < RM_RUIDO_PCT ? 'en_camino' : 'por_detras';
    }

    const color: ColorDeSemaforo = proceso === 'por_detras' || resultado === 'por_detras' ? 'por_detras'
      : proceso === 'en_camino' || resultado === 'en_camino' ? 'en_camino' : 'sin_dato';

    const s = o.subidas?.[zona];
    const semanasDesdeLaSubida = s?.semanasSostenidas ?? null;
    const partes = [
      iemMedio == null ? 'IEM medio sin dato'
        : recuperar ? `IEM medio ${fmt(iemMedio)}${techo != null ? ` (tope ${fmt(techo)})` : ''}`
          : `IEM medio ${fmt(iemMedio)}${iemMedioObjetivo != null ? ` de ${fmt(iemMedioObjetivo)}` : ''}`,
      !recuperar && techo != null ? `techo ${fmt(techo)}` : null,
      semanasDesdeLaSubida == null ? 'sin subidas todavía'
        : semanasDesdeLaSubida <= 1 ? 'subió esta semana' : `${semanasDesdeLaSubida} semanas desde la última subida`,
      rmPct == null ? 'RM sin medida'
        : rmObjetivoPct <= 0 ? `RM ${conSigno(rmPct)} % (objetivo: no perder)`
          : `RM ${conSigno(rmPct)} % de +${fmt(rmObjetivoPct)} %${avance < 1 ? ` (a estas alturas, +${fmt(rmEsperadoPct)} %)` : ''}`,
    ];
    return [{
      zona, nombre: nombreCortoDeZona(zona), palanca: PALANCAS[h.palanca].etiqueta,
      iemMedio, iemMedioObjetivo, techo,
      subidas: s?.subidas.length ?? 0, semanasDesdeLaSubida,
      rmPct, rmObjetivoPct, rmEsperadoPct,
      proceso, resultado, color,
      texto: partes.filter((p): p is string => !!p).join(' · '),
    }];
  });
}

/**
 * El semáforo de un bloque en curso, con los mismos motores que usará el
 * cierre: el IEM realizado por semana de calendario (`estadoDelBloqueAnterior`,
 * sin la semana en curso), el RM de cada zona (`progresionDelBloque` a través
 * del cierre) y las subidas deducidas de lo programado (`subidasDeLaZona`).
 * Vacío si el bloque no tiene hipótesis.
 */
export function semaforoDelBloque(o: {
  motor: MotorCdg;
  meso: Mesocycle;
  /** Todos los registros del atleta. */
  logs: WorkoutLog[];
  exercises: Exercise[];
  /** Los ejercicios programados del bloque (todas sus sesiones), con sus cambios por semana. */
  programados: readonly WorkoutExercise[];
  /** Vuelta del ciclo en la que se está (1-indexada) y las que tiene el bloque. */
  semanaActual: number;
  vueltas: number;
  hoy: string;
  pesoCorporalKg?: number | null;
}): FilaDeSemaforo[] {
  const { motor, meso, hoy } = o;
  const estrellas = estrellasDe(meso);
  if (estrellas.length === 0) return [];
  const cdgDe = new Map(o.exercises.map(e => [e.id, e.cdgNombre]));
  const nombreCdgDe = (id: string) => cdgDe.get(id);
  const fin = finDeBloque(meso);
  const enCurso = hoy <= fin ? hoy : undefined;

  const delBloque = logsDelBloque(o.logs, meso, fin);
  const iem = iemSemanalPorZona(motor, delBloque, nombreCdgDe, iniciosDeSemanaDelBloque(meso, enCurso ?? fin), enCurso);
  const estado = estadoDelBloqueAnterior({ iem, meso });

  const cierre = buildCierreMesociclo({
    meso, mesocycles: [meso], logs: o.logs, assignments: [], exercises: o.exercises, hoy, pesoCorporalKg: o.pesoCorporalKg ?? null,
  });
  const progresion = cierre.progresion.ejercicios;
  const zonaDe = zonaPrincipalDeEjercicios(motor, nombreCdgDe, progresion.map(p => p.exerciseId));

  // Lo programado semana a semana hasta la que está en curso: de ahí, las subidas.
  const hasta = Math.max(1, Math.min(o.semanaActual, o.vueltas));
  const programado = Array.from({ length: hasta }, (_, i) =>
    iemProgramadoPorZona(motor, nombreCdgDe, o.programados.map(we => resolverEjercicioDelMeso(we, meso, i + 1))));
  const semanasFuera = semanasFueraDeSubidas(meso);

  return semaforoDeHipotesis({
    hipotesis: meso.hipotesis,
    estado,
    subidas: Object.fromEntries(estrellas.map(z => [z, subidasDeLaZona({ programado: programado.map(p => p[z] ?? 0), destino: hasta + 1, semanasFuera })])),
    rm: Object.fromEntries(estrellas.map(z => [z, rmDeLaZona({ zona: z, ejercicios: progresion, zonaDe }).rmPct])),
    semanaActual: hasta, semanasTotales: o.vueltas,
  });
}
