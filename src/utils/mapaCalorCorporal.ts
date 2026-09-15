import {
  MuscleGroup, MuscleGroupConfig, MUSCLE_LABELS, MUSCLE_LABELS_SHORT, MUSCLE_ORDER,
} from '../types';
import { VolumeLandmark, VOLUME_LANDMARKS_DEFAULT } from '../data/volumeLandmarks';
import { VolumeZone, zoneOf, zoneLabel, heatmapBg, heatmapText } from './volumeZones';

// ═══════════════════════════════════════════════════════════════════════════
// MAPA DE CALOR DE VOLUMEN — cuánto está entrenando de verdad cada grupo,
// frente a lo que le pusimos y a lo que la evidencia dice que necesita.
//
// Es el mismo lenguaje de color que ya usan la matriz de MesocycleManager y el
// carril de volumen del calendario (`volumeZones.ts` + los landmarks por grupo
// de `data/volumeLandmarks.ts`), pero contestando otra pregunta: aquellas
// pintan lo PROGRAMADO mientras el coach monta el bloque; esto pinta lo
// REALIZADO cuando lo revisa.
//
// ── La unidad, que es donde está el fallo fácil ────────────────────────────
// Los landmarks (MEV/MAV/MRV) y `MuscleGroupConfig.series` son SIEMPRE series
// POR SEMANA. Pero lo realizado llega como el total crudo de la ventana: en un
// mesociclo de 5 semanas, 50 series de dorsal. Comparar ese 50 contra un MRV de
// 25 pinta el mapa entero en rojo, siempre, para cualquier atleta — y el número
// sería lo bastante creíble como para que el coach se lo cuente al cliente sin
// sospechar. Por eso todo se normaliza a series/semana ANTES de mirar la zona,
// y `semanasDeLaVentana` es obligatorio, no opcional con un 1 por defecto.
// ═══════════════════════════════════════════════════════════════════════════

export type PrioridadGrupo = MuscleGroupConfig['priority'];

export interface CeldaMapaCalor {
  group: MuscleGroup;
  label: string;
  labelCorto: string;
  /** Series realizadas, normalizadas a POR SEMANA. Un decimal. */
  realizadasSemana: number;
  /** Series que el mesociclo pedía por semana. `null` si no hay nada programado. */
  planificadasSemana: number | null;
  /** Lo que el coach marcó al montar el bloque. `null` si no hay mesociclo. */
  prioridad: PrioridadGrupo | null;
  zona: VolumeZone;
  zonaLabel: string;
  /** Relleno del SVG / la celda. Sale de `heatmapBg` con el landmark del grupo. */
  fill: string;
  /** Color de texto legible sobre ese relleno. */
  colorTexto: string;
  /** realizadas ÷ planificadas × 100. `null` si no había nada programado. */
  cumplimientoPct: number | null;
  /** El landmark aplicado, para poder rotular «MAV: 12-20» en el tooltip. */
  landmark: VolumeLandmark;
}

export interface MapaCalorParams {
  /** Series realizadas por grupo en la ventana COMPLETA (sin dividir). */
  realizadas: Map<MuscleGroup, number>;
  /**
   * Series planificadas por grupo, **por semana**. Opcional: si no se pasa, se
   * leen de `groups`, que ya es semanal por definición.
   *
   * La unidad es parte del contrato a propósito. `seriesPlanificadasDelMeso()`
   * devuelve el total ESCALADO a la ventana, así que quien venga de ahí tiene
   * que dividir antes de llamar — o, mejor, pasar `groups` y no pasar esto.
   */
  planificadasSemana?: Map<MuscleGroup, number>;
  /** `Mesocycle.groups` — de aquí salen la prioridad y, si falta el mapa anterior, las series semanales. */
  groups?: Record<MuscleGroup, MuscleGroupConfig>;
  landmarks?: Record<MuscleGroup, VolumeLandmark>;
  /** Semanas que abarca la ventana. Debe ser > 0. */
  semanasDeLaVentana: number;
}

function round1(n: number): number { return Math.round(n * 10) / 10; }

/**
 * Una celda por grupo muscular, en `MUSCLE_ORDER`.
 *
 * Devuelve SIEMPRE los 17, incluidos los que están a cero: un grupo sin series
 * no es una fila que sobra, es la información más accionable del mapa («no has
 * hecho nada de deltoide posterior en cinco semanas»). Quien no quiera pintarlos
 * que filtre por `realizadasSemana > 0` en la UI.
 */
export function construirMapaCalor(params: MapaCalorParams): CeldaMapaCalor[] {
  const {
    realizadas, planificadasSemana: planMap, groups,
    landmarks = VOLUME_LANDMARKS_DEFAULT,
    semanasDeLaVentana,
  } = params;

  // Una ventana de 0 semanas dividiría por cero y sacaría Infinity a pantalla.
  const semanas = semanasDeLaVentana > 0 ? semanasDeLaVentana : 1;

  return MUSCLE_ORDER.map(group => {
    const landmark = landmarks[group] ?? VOLUME_LANDMARKS_DEFAULT[group];
    const realizadasSemana = round1((realizadas.get(group) ?? 0) / semanas);

    const plan = planMap?.get(group) ?? groups?.[group]?.series;
    const planificadasSemana = plan == null || plan <= 0 ? null : round1(plan);

    const zona = zoneOf(realizadasSemana, landmark);

    return {
      group,
      label: MUSCLE_LABELS[group],
      labelCorto: MUSCLE_LABELS_SHORT[group],
      realizadasSemana,
      planificadasSemana,
      prioridad: groups?.[group]?.priority ?? null,
      zona,
      zonaLabel: zoneLabel(realizadasSemana, landmark),
      fill: heatmapBg(realizadasSemana, landmark),
      colorTexto: heatmapText(realizadasSemana, landmark),
      cumplimientoPct: planificadasSemana != null && planificadasSemana > 0
        ? Math.round((realizadasSemana / planificadasSemana) * 100)
        : null,
      landmark,
    };
  });
}

/** ¿Hay algo programado con lo que comparar? Distingue «0 % cumplido» de «no había plan». */
export function hayVolumenProgramado(celdas: CeldaMapaCalor[]): boolean {
  return celdas.some(c => c.planificadasSemana != null);
}

/**
 * Los grupos que merecen un comentario en el vídeo, de más a menos urgente.
 *
 * El criterio no es «el que más se desvía en porcentaje»: un grupo de prioridad
 * baja que se queda corto no es noticia, y uno de prioridad alta por debajo del
 * MEV sí. Por eso pesa la prioridad antes que el tamaño de la desviación.
 */
export function gruposQueDestacar(celdas: CeldaMapaCalor[], n = 4): CeldaMapaCalor[] {
  const peso = (c: CeldaMapaCalor): number => {
    let p = 0;
    if (c.prioridad === 'alta') p += 100;
    else if (c.prioridad === 'media') p += 40;
    if (c.zona === 'sin_volumen' && c.planificadasSemana != null) p += 80;
    else if (c.zona === 'mev') p += 50;
    else if (c.zona === 'mrv') p += 60;
    if (c.cumplimientoPct != null) p += Math.min(60, Math.abs(100 - c.cumplimientoPct) / 2);
    return p;
  };
  return [...celdas]
    .filter(c => c.planificadasSemana != null || c.realizadasSemana > 0)
    .sort((a, b) => peso(b) - peso(a))
    .slice(0, n);
}
