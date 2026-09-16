import { CardioSession } from '../types';
import {
  dailyLoadFromSessions, computeTrainingLoad, classifyTlr, TLR_LABEL,
  trainingFocus, TrainingFocus, TrainingLoadState,
} from './cardioMetrics';

/* ═══════════════════════════════════════════════════════════════════════════
   EL CARDIO DE LA VENTANA — lo que el coach necesita decir en la revisión.

   Los cálculos ya existían todos en `cardioMetrics` y los usaba la pantalla del
   ATLETA (su sesión en directo, su historial). El coach no los tenía en ningún
   sitio: para saber si alguien está acumulando más carga de la que asimila
   había que abrir la pestaña de Cardio y sumar sesiones a ojo.

   Tres decisiones que están en el código:

    · La carga se calcula con TODO el historial, no con la ventana. ATL y CTL
      son medias móviles de 7 y 42 días: recortar la entrada a siete días
      dejaría el CTL arrancando de cero y el cociente saldría siempre en
      «overreaching», que es exactamente la lectura contraria a la real.
    · El reparto por zonas sí es de la ventana: ahí la pregunta es «qué ha hecho
      ESTAS semanas», no «qué viene arrastrando».
    · Sin TRIMP en ninguna sesión no hay carga que dar. `trimp` necesita FC
      media, y una sesión registrada a mano no la tiene. En ese caso se
      devuelve `carga: null` y la pantalla lo dice, en vez de enseñar un 0 que
      se leería como «no entrena».

   Puro y determinista: sin React, sin dbService y con la fecha inyectable.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface CargaDeEntrenamiento {
  /** Carga aguda: lo de los últimos 7 días, en media móvil. */
  atl: number;
  /** Carga crónica: la base de las últimas 6 semanas. */
  ctl: number;
  /** atl ÷ ctl. Por debajo de 0,8 se desentrena; por encima de 1,5, riesgo. */
  tlr: number;
  estado: TrainingLoadState;
  estadoLabel: string;
  /** Últimos puntos de TLR, del más antiguo al más nuevo, para la sparkline. */
  serieTlr: number[];
}

export interface CardioDeLaVentana {
  sesiones: number;
  minutos: number;
  kcal: number;
  /** Media de FC de las sesiones que la traen. `null` si ninguna. */
  fcMedia: number | null;
  /** Reparto del tiempo por intensidad EN LA VENTANA. `null` sin zonas. */
  foco: TrainingFocus | null;
  /** Carga acumulada a día de hoy, del historial completo. */
  carga: CargaDeEntrenamiento | null;
  /** Última recuperación de FC al minuto, si se midió. */
  hrr1Min: number | null;
  /** Fecha de la última sesión de todo el historial, dentro o fuera de la ventana. */
  ultimaSesion: string | null;
}

/** Cuántos puntos de TLR pinta la sparkline. */
const PUNTOS_DE_CARGA = 8;

function redondear(n: number, decimales = 1): number {
  const f = 10 ** decimales;
  return Math.round(n * f) / f;
}

export function construirCardioDeLaVentana(params: {
  sesiones: CardioSession[];
  desde: string;
  hasta: string;
}): CardioDeLaVentana {
  const { sesiones, desde, hasta } = params;
  const enVentana = sesiones.filter(s => s.date >= desde && s.date <= hasta);

  const minutos = Math.round(enVentana.reduce((t, s) => t + s.durationSec, 0) / 60);
  const kcal = Math.round(enVentana.reduce((t, s) => t + (s.caloriesKcal ?? 0), 0));

  const conFc = enVentana.filter(s => typeof s.avgHR === 'number');
  const fcMedia = conFc.length > 0
    ? Math.round(conFc.reduce((t, s) => t + s.avgHR!, 0) / conFc.length)
    : null;

  // Zonas sumadas de la ventana. Si ninguna sesión trae zonas (registro manual
  // sin banda), `foco` queda en null y no se dibuja un reparto inventado.
  const zonas = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 };
  let hayZonas = false;
  for (const s of enVentana) {
    if (!s.timeInZoneSec) continue;
    for (const z of ['z1', 'z2', 'z3', 'z4', 'z5'] as const) {
      zonas[z] += s.timeInZoneSec[z] ?? 0;
    }
    hayZonas = true;
  }
  const totalZonas = zonas.z1 + zonas.z2 + zonas.z3 + zonas.z4 + zonas.z5;
  const foco = hayZonas && totalZonas > 0 ? trainingFocus(zonas) : null;

  const carga = construirCarga(sesiones);

  const porFecha = [...sesiones].sort((a, b) => a.date.localeCompare(b.date));
  const ultima = porFecha[porFecha.length - 1] ?? null;
  const conHrr = porFecha.filter(s => typeof s.hrr1Min === 'number');

  return {
    sesiones: enVentana.length,
    minutos,
    kcal,
    fcMedia,
    foco,
    carga,
    hrr1Min: conHrr.length > 0 ? conHrr[conHrr.length - 1].hrr1Min! : null,
    ultimaSesion: ultima?.date ?? null,
  };
}

function construirCarga(sesiones: CardioSession[]): CargaDeEntrenamiento | null {
  const cargasDiarias = dailyLoadFromSessions(sesiones);
  if (cargasDiarias.length === 0) return null;
  const puntos = computeTrainingLoad(cargasDiarias);
  if (puntos.length === 0) return null;
  const ultimo = puntos[puntos.length - 1];
  const estado = classifyTlr(ultimo.tlr);
  return {
    atl: redondear(ultimo.atl),
    ctl: redondear(ultimo.ctl),
    tlr: redondear(ultimo.tlr, 2),
    estado,
    estadoLabel: TLR_LABEL[estado],
    serieTlr: puntos.slice(-PUNTOS_DE_CARGA).map(p => redondear(p.tlr, 2)),
  };
}
