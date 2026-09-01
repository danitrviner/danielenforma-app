import {
  MuscleGroup, MuscleGroupConfig, ExperienceLevel, MUSCLE_LABELS, MUSCLE_ORDER,
} from '../types';
import type { VolumeLandmark } from '../data/volumeLandmarks';
import type { VolumeHistory } from './volumeHistory';
import { TRAINING_SPLITS, frecuenciaSemanalDeSplit } from './trainingSplits';

// ═══════════════════════════════════════════════════════════════════════════
// SUGERIDOR DE VOLUMEN — propone las series semanales de los 17 grupos.
//
// Determinista y puro: mismo input, mismo output, sin IA y sin I/O. Eso es lo
// que permite que el dial recalcule al instante en la previsualización y que
// Dani pueda auditar POR QUÉ salió cada número (`reasons`), en vez de recibir
// una cifra de una caja negra.
//
// Hasta ahora los 17 grupos nacían a 0 y se subían uno a uno con botones ±1, y
// el selector de prioridad ⭐/◑/⚪ no tocaba el volumen en absoluto: solo movía
// el grupo de día en la distribución. Aquí la prioridad pasa por fin a
// significar lo que dice la doctrina de Dani: los prioritarios a la parte alta
// del rango, los no prioritarios al mínimo que mantiene, nunca todo a tope.
// ═══════════════════════════════════════════════════════════════════════════

export type VolumeIntent = 'conservador' | 'estandar' | 'agresivo';

export interface VolumeSuggestionInput {
  landmarks: Record<MuscleGroup, VolumeLandmark>;
  /** Sesiones del microciclo (no siempre de una semana: ver `semanasDelCiclo`). */
  daysPerWeek: number;
  /** Semanas que dura una vuelta del ciclo. 1 = semanal. */
  semanasDelCiclo?: number;
  /** Reparto elegido (utils/trainingSplits). Acota el volumen por frecuencia real. */
  splitId?: string;
  level: ExperienceLevel;
  intent: VolumeIntent;
  priorities: Record<MuscleGroup, 'alta' | 'media' | 'baja'>;
  history?: VolumeHistory;
}

export interface VolumeSuggestionResult {
  groups: Record<MuscleGroup, MuscleGroupConfig>;
  /** Por qué salió ese número, paso a paso. Se enseña al desplegar la fila. */
  reasons: Record<MuscleGroup, string[]>;
  totalSeries: number;
  warnings: string[];
  /** El dial que se aplicó de verdad: una recuperación mala lo fuerza a conservador. */
  intentAplicado: VolumeIntent;
}

// Tope por grupo: el mismo de ai/validators.ts y del heatmap del mesociclo.
const MAX_SERIES_PER_GROUP = 25;

/**
 * Techo REAL del total semanal, en series por sesión.
 *
 * No es el umbral de `overloadAlert` de la distribución (`daysPerWeek × 12`),
 * y hay un motivo medido: la suma de los volúmenes de MANTENIMIENTO de los 17
 * grupos ya son 54 series: con 4 días entrenando, `4 × 12 = 48` ni siquiera da
 * para mantener lo que hay, así que usarlo como tope duro hace que el
 * sugeridor recorte todos los grupos por debajo de su mínimo efectivo y
 * proponga siempre un bloque peor que el que había. 23 series por sesión es el
 * techo que Dani programa de hecho: alto, pero es su criterio, no un genérico.
 *
 * Los 12/día siguen aquí, pero como AVISO, que es para lo que sirven: por
 * encima de eso la pantalla de Distribución marca sobrevolumen.
 */
export const SERIES_POR_DIA_TOPE = 23;
const SERIES_POR_DIA_AVISO = 12;

/** Series por sesión y grupo que tiene sentido acumular sin caer en trabajo basura. */
const SERIES_POR_SESION = 8;

const FACTOR_INTENT: Record<VolumeIntent, number> = {
  conservador: 0.85,
  estandar:    1,
  agresivo:    1.15,
};

const ETIQUETA_INTENT: Record<VolumeIntent, string> = {
  conservador: 'conservador',
  estandar:    'estándar',
  agresivo:    'agresivo',
};

/**
 * Los cinco escalones de un grupo, de menos a más: mantenimiento, mínimo
 * efectivo, entrada del rango adaptativo, mitad y techo del rango.
 *
 * Trabajar por escalones (y no sumando series sueltas) es lo que hace que
 * «subir un escalón» signifique lo mismo en pecho que en antebrazo, cuyos
 * rangos no se parecen en nada.
 */
function escalones(l: VolumeLandmark): number[] {
  return [l.mv, l.mev, l.mavMin, Math.round((l.mavMin + l.mavMax) / 2), l.mavMax];
}

const ESCALON_BASE: Record<ExperienceLevel, number> = {
  principiante: 1, // MEV: lo mínimo que hace crecer
  intermedio:   2, // entrada del rango adaptativo
  avanzado:     3, // mitad del rango adaptativo
};

const NOMBRE_ESCALON = ['mantenimiento (MV)', 'mínimo efectivo (MEV)', 'entrada de MAV', 'mitad de MAV', 'techo de MAV'];

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/**
 * Veces POR SEMANA que el reparto elegido toca este grupo.
 *
 * Por semana y no por ciclo, porque el volumen que se está sugiriendo es
 * semanal: con un ciclo de dos semanas, tocar un grupo 3 veces son 1,5 sesiones
 * por semana, y el tope de series que aguanta es el de 1,5 sesiones, no el de 3.
 * `null` = el reparto no cubre este grupo en ningún día y la distribución lo
 * colocará por su fallback, así que no se acota por aquí.
 */
function frecuenciaDisponible(group: MuscleGroup, splitId: string | undefined): number | null {
  if (!splitId) return null;
  const split = TRAINING_SPLITS.find(s => s.id === splitId);
  if (!split) return null;
  const frecuencia = frecuenciaSemanalDeSplit(split, group);
  return frecuencia > 0 ? frecuencia : null;
}

/**
 * Baja un conjunto de grupos hasta que sumen `objetivo`, repartiendo el recorte
 * en proporción a lo que tenía cada uno.
 *
 * El reparto del resto se hace por mayor parte decimal, con el orden del enum
 * como desempate, para que el resultado sea siempre el mismo con el mismo
 * input — una ordenación inestable o un reparto al azar harían que el mismo botón
 * diera números distintos en dos pulsaciones.
 */
function aplicarRecorte(
  groups: Record<MuscleGroup, MuscleGroupConfig>,
  reasons: Record<MuscleGroup, string[]>,
  grupos: MuscleGroup[],
  objetivo: number,
): void {
  const suma = grupos.reduce((s, g) => s + groups[g].series, 0);
  if (suma === 0 || suma <= objetivo) return;

  const factor = objetivo / suma;
  const exactos = grupos.map(g => ({ g, valor: groups[g].series * factor }));
  const enteros = new Map(exactos.map(({ g, valor }) => [g, Math.floor(valor)]));
  let repartido = [...enteros.values()].reduce((s, v) => s + v, 0);

  const porDecimal = [...exactos]
    .sort((a, b) => (b.valor - Math.floor(b.valor)) - (a.valor - Math.floor(a.valor))
      || MUSCLE_ORDER.indexOf(a.g) - MUSCLE_ORDER.indexOf(b.g));
  for (const { g } of porDecimal) {
    if (repartido >= objetivo) break;
    enteros.set(g, (enteros.get(g) ?? 0) + 1);
    repartido++;
  }

  for (const g of grupos) {
    const nuevo = enteros.get(g) ?? 0;
    if (nuevo !== groups[g].series) {
      reasons[g].push(`Recortado por el tope semanal total: ${groups[g].series} → ${nuevo}.`);
      groups[g] = { ...groups[g], series: nuevo };
    }
  }
}

export function suggestVolume(input: VolumeSuggestionInput): VolumeSuggestionResult {
  const { landmarks, daysPerWeek, splitId, level, priorities, history } = input;
  // El volumen que se sugiere es SEMANAL, así que el techo también: con un ciclo
  // de dos semanas y 10 sesiones, las sesiones de una semana son 5, no 10.
  const semanas = Math.max(1, input.semanasDelCiclo ?? 1);
  const sesionesPorSemana = Math.max(1, Math.round(daysPerWeek / semanas));
  const warnings: string[] = [];

  // Una recuperación mala anula el dial que se haya pedido. No es una
  // sugerencia: subir volumen sobre alguien que no se recupera es exactamente
  // lo que no hay que hacer, y el motor no debe dejar que se le pase por alto.
  const recovery = history?.feedback?.recovery;
  let intent = input.intent;
  if (recovery != null && recovery <= 4) {
    if (intent !== 'conservador') {
      warnings.push(`El atleta valoró su recuperación en ${recovery}/10 al cerrar el bloque anterior — el dial se fuerza a conservador.`);
    }
    intent = 'conservador';
  }

  const feedback = history?.feedback;
  const groups = {} as Record<MuscleGroup, MuscleGroupConfig>;
  const reasons = {} as Record<MuscleGroup, string[]>;

  for (const g of MUSCLE_ORDER) {
    const l = landmarks[g];
    const pasos = escalones(l);
    const razones: string[] = [];
    const prioridad = priorities[g] ?? 'media';

    // ── 1. Base por nivel ────────────────────────────────────────────────
    let idx = ESCALON_BASE[level];
    razones.push(`Nivel ${level}: parte del ${NOMBRE_ESCALON[idx]} (${pasos[idx]} series).`);

    // ── 2. Prioridad ─────────────────────────────────────────────────────
    if (prioridad === 'alta') {
      idx += 1;
      razones.push('Prioridad alta: sube un escalón dentro de su rango.');
    } else if (prioridad === 'baja') {
      idx = 0;
      razones.push('Prioridad baja: al mínimo que mantiene (MV), para dejar sitio a lo prioritario.');
    }

    // ── 3. Feedback del atleta ───────────────────────────────────────────
    // Va aquí, junto a la prioridad, porque opera sobre la MISMA escala de
    // escalones; el dial de intención (paso 4) es un % sobre el resultado.
    if (feedback?.priorityGroups.includes(g)) {
      idx += 1;
      razones.push('El atleta lo pidió como grupo a priorizar: +1 escalón.');
    }
    const doms = feedback?.doms?.[g];
    if (feedback?.overloadGroups.includes(g)) {
      idx -= 1;
      razones.push('El atleta marcó que le sobró volumen aquí: −1 escalón.');
    } else if (doms != null && doms >= 8) {
      idx -= 1;
      razones.push(`Agujetas de ${doms}/10 en este grupo: −1 escalón.`);
    }

    idx = clamp(idx, 0, pasos.length - 1);
    let series = pasos[idx];

    // ── 4. Dial de intención ─────────────────────────────────────────────
    if (intent !== 'estandar') {
      const antes = series;
      series = Math.round(series * FACTOR_INTENT[intent]);
      if (series !== antes) razones.push(`Dial ${ETIQUETA_INTENT[intent]}: ${antes} → ${series}.`);
    }

    // ── 5. Historial del bloque anterior ─────────────────────────────────
    const h = history?.groups?.[g];
    const adherencia = history?.adherencePct ?? null;
    const rir = history?.meanRir ?? null;

    if (adherencia != null && adherencia >= 90 && rir != null && rir <= 2 && prioridad !== 'baja') {
      const extra = prioridad === 'alta' ? 2 : 1;
      series += extra;
      razones.push(`Cumplió el bloque anterior (${adherencia}% de adherencia, RIR medio ${rir}): +${extra}.`);
    }

    if (adherencia != null && adherencia < 70 && h && h.performed > 0 && series > h.performed) {
      razones.push(`Adherencia del ${adherencia}%: techo en lo que de verdad completó (${h.performed} series/semana).`);
      series = h.performed;
    } else if (h && h.planned > 0 && h.performed < h.planned * 0.7 && series > h.planned) {
      razones.push(`El bloque anterior solo hizo ${h.performed} de las ${h.planned} series/semana programadas aquí: no se sube por encima de lo ya programado.`);
      series = h.planned;
    }

    // ── 6. Techos de seguridad ───────────────────────────────────────────
    const topeGrupo = Math.min(l.mrv, MAX_SERIES_PER_GROUP);
    if (series > topeGrupo) {
      razones.push(`Tope del grupo (MRV ${l.mrv}): ${series} → ${topeGrupo}.`);
      series = topeGrupo;
    }

    const frecuencia = frecuenciaDisponible(g, splitId);
    if (frecuencia != null) {
      const topeFrecuencia = Math.round(frecuencia * SERIES_POR_SESION);
      if (series > topeFrecuencia) {
        razones.push(`El reparto solo le da ${frecuencia.toLocaleString('es-ES')} sesiones por semana: tope de ${topeFrecuencia} series.`);
        series = topeFrecuencia;
      }
    }

    series = Math.max(0, Math.round(series));
    groups[g] = { series, priority: prioridad };
    reasons[g] = razones;
  }

  // ── 7. Tope global, protegiendo los prioritarios ───────────────────────
  const limite = sesionesPorSemana * SERIES_POR_DIA_TOPE;
  const totalCrudo = MUSCLE_ORDER.reduce((s, g) => s + groups[g].series, 0);

  if (totalCrudo > limite) {
    warnings.push(`El total propuesto (${totalCrudo}) no cabe en ${sesionesPorSemana} sesiones por semana (tope de ${SERIES_POR_DIA_TOPE} series por sesión). Se ha recortado empezando por los grupos no prioritarios; si quieres más volumen en algo concreto, márcalo ⭐ y baja a ⚪ lo que solo haya que mantener.`);

    // Primero se recorta lo NO prioritario, y solo si aún no cabe se toca lo
    // marcado con ⭐. El recorte es proporcional y no "de arriba abajo": bajar
    // siempre al grupo más grande acabaría igualando dorsal con antebrazo, que
    // es justo la forma que el rango por grupo existe para evitar.
    const noPrioritarios = MUSCLE_ORDER.filter(g => groups[g].priority !== 'alta');
    const prioritarios   = MUSCLE_ORDER.filter(g => groups[g].priority === 'alta');
    const sumaAlta = prioritarios.reduce((s, g) => s + groups[g].series, 0);
    const sumaResto = noPrioritarios.reduce((s, g) => s + groups[g].series, 0);

    const objetivoResto = Math.max(0, Math.min(sumaResto, limite - sumaAlta));
    aplicarRecorte(groups, reasons, noPrioritarios, objetivoResto);

    const tras = MUSCLE_ORDER.reduce((s, g) => s + groups[g].series, 0);
    if (tras > limite && prioritarios.length > 0) {
      aplicarRecorte(groups, reasons, prioritarios, Math.max(0, limite - (tras - sumaAlta)));
    }
  }

  // Un grupo al que el reparto no llega en ningún día acabaría colocado por el
  // fallback de la distribución, en un día que no le toca. Se dice, no se
  // esconde.
  if (splitId) {
    const huerfanos = MUSCLE_ORDER.filter(g => groups[g].series > 0 && frecuenciaDisponible(g, splitId) === null);
    if (huerfanos.length > 0) {
      warnings.push(`El reparto elegido no tiene un día propio para ${huerfanos.map(g => MUSCLE_LABELS[g]).join(', ')} — la distribución los colocará donde quepan.`);
    }
  }

  // La razón de un grupo que acaba en 0 se resume: la lista de pasos no aporta
  // nada cuando el resultado es «no se entrena».
  for (const g of MUSCLE_ORDER) {
    if (groups[g].series === 0) reasons[g] = ['Sin volumen: prioridad baja y rango de mantenimiento en 0.'];
  }

  return {
    groups,
    reasons,
    totalSeries: MUSCLE_ORDER.reduce((s, g) => s + groups[g].series, 0),
    warnings,
    intentAplicado: intent,
  };
}
