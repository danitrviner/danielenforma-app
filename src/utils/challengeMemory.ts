// Memoria del motor de retos: lee el historial de retos ya resueltos del atleta
// y lo convierte en las tres cosas que el generador necesita para no repetirse
// ni proponer objetivos absurdos.
//
//   1. ROTACIÓN — qué tipos ha visto en las últimas 4 semanas (antes solo se
//      miraba la semana anterior, así que el motor alternaba entre dos tipos).
//   2. DIFICULTAD — cuánto apretar el objetivo. La diana es ~65% de retos
//      conseguidos: se afloja tras un fallo y se aprieta tras un éxito holgado,
//      igual que se progresa una carga. Un reto que se gana siempre no es un
//      reto, y uno que se pierde siempre deja de leerse.
//   3. HITOS QUEMADOS — cuántas veces seguidas ha fallado el hito redondo de un
//      ejercicio, para dejar de colgárselo delante indefinidamente.
//
// Módulo puro y sin dependencias de Firebase: challengeOptions lo consume y los
// tests lo pueden alimentar con historiales sintéticos.

import { ChallengeKind, ChallengeDifficulty, WeeklyChallenge } from '../types';

// Semanas de historial que cuentan para la rotación de tipos.
export const ROTATION_WINDOW = 4;

// Por debajo de esto el atleta es "nuevo" y todos los retos salen suaves: los
// primeros necesitan ganarse para que el hábito arraigue.
export const WARMUP_WEEKS = 3;

export interface KindOutcome {
  isoWeek: string;
  status: 'conseguido' | 'fallido';
  // progressValue / target. >1 = se pasó de largo; el motor usa esto para
  // distinguir "lo clavó justo" de "se lo comió con patatas".
  overshoot: number;
}

export interface ChallengeMemory {
  // Tipos de las últimas ROTATION_WINDOW semanas, la más reciente primero.
  recentKinds: ChallengeKind[];
  lastByKind: Map<ChallengeKind, KindOutcome>;
  // Fallos consecutivos (desde el más reciente hacia atrás) por tipo.
  failStreakByKind: Map<ChallengeKind, number>;
  // Hitos redondos fallados consecutivamente, por ejercicio.
  failedMilestonesByExercise: Map<string, number>;
  resolvedCount: number;
  wonCount: number;
  winRate: number;    // 0-1 sobre los resueltos; 0 si no hay ninguno
  winStreak: number;  // retos conseguidos consecutivos, del más reciente atrás
}

export const EMPTY_MEMORY: ChallengeMemory = {
  recentKinds: [],
  lastByKind: new Map(),
  failStreakByKind: new Map(),
  failedMilestonesByExercise: new Map(),
  resolvedCount: 0,
  wonCount: 0,
  winRate: 0,
  winStreak: 0,
};

// Los isoWeek ('2026-W07') ordenan lexicográficamente igual que cronológicamente,
// incluido el salto de año, porque la semana va con padding a 2 dígitos.
export function buildChallengeMemory(
  history: WeeklyChallenge[] | undefined,
  beforeIsoWeek: string,
): ChallengeMemory {
  if (!history || history.length === 0) return EMPTY_MEMORY;

  const past = history
    .filter(c => c.isoWeek < beforeIsoWeek)
    .sort((a, b) => b.isoWeek.localeCompare(a.isoWeek));
  if (past.length === 0) return EMPTY_MEMORY;

  const recentKinds = past.slice(0, ROTATION_WINDOW).map(c => c.kind);
  const lastByKind = new Map<ChallengeKind, KindOutcome>();
  const failStreakByKind = new Map<ChallengeKind, number>();
  const failedMilestonesByExercise = new Map<string, number>();
  // Un tipo deja de acumular racha de fallos en cuanto aparece un conseguido.
  const kindStreakOpen = new Set<ChallengeKind>();
  const milestoneStreakClosed = new Set<string>();

  let resolvedCount = 0;
  let wonCount = 0;
  let winStreak = 0;
  let winStreakOpen = true;

  for (const ch of past) {
    if (ch.status === 'activo') continue;  // semana en curso o sin resolver: no opina
    resolvedCount++;
    const won = ch.status === 'conseguido';
    if (won) wonCount++;

    if (winStreakOpen) {
      if (won) winStreak++; else winStreakOpen = false;
    }

    const target = ch.metric.target;
    const overshoot = target > 0 ? (ch.progressValue ?? 0) / target : (won ? 1 : 0);
    if (!lastByKind.has(ch.kind)) {
      lastByKind.set(ch.kind, { isoWeek: ch.isoWeek, status: won ? 'conseguido' : 'fallido', overshoot });
      if (!won) kindStreakOpen.add(ch.kind);
    }
    if (kindStreakOpen.has(ch.kind)) {
      if (won) kindStreakOpen.delete(ch.kind);
      else failStreakByKind.set(ch.kind, (failStreakByKind.get(ch.kind) ?? 0) + 1);
    }

    // Racha de hitos fallados: solo cuenta mientras no haya un hito conseguido
    // de ese mismo ejercicio por medio.
    const exId = ch.metric.exerciseId;
    if (ch.isMilestone && exId && !milestoneStreakClosed.has(exId)) {
      if (won) milestoneStreakClosed.add(exId);
      else failedMilestonesByExercise.set(exId, (failedMilestonesByExercise.get(exId) ?? 0) + 1);
    }
  }

  return {
    recentKinds,
    lastByKind,
    failStreakByKind,
    failedMilestonesByExercise,
    resolvedCount,
    wonCount,
    winRate: resolvedCount > 0 ? wonCount / resolvedCount : 0,
    winStreak,
  };
}

// ── Dificultad ────────────────────────────────────────────────────────────────

export interface DifficultyTuning {
  // Multiplicador sobre el INCREMENTO respecto al baseline (no sobre el
  // objetivo). Así un factor 0,5 significa "sube la mitad de lo normal", nunca
  // "pide la mitad de lo que ya hace".
  factor: number;
  label: ChallengeDifficulty;
}

const SUAVE_MUY = { factor: 0.35, label: 'suave' as const };
const SUAVE     = { factor: 0.6,  label: 'suave' as const };
const JUSTO     = { factor: 1,    label: 'justo' as const };
const AMBICIOSO = { factor: 1.5,  label: 'ambicioso' as const };

// Cuánto apretar este tipo de reto, dado lo que pasó las últimas veces.
// Prioriza el historial DEL MISMO TIPO (que un tío clave los pasos no dice
// nada de si clavará la dieta) y cae a la tasa global cuando no hay.
export function difficultyFor(kind: ChallengeKind, memory: ChallengeMemory): DifficultyTuning {
  // Sin ningún reto resuelto no hay nada a lo que adaptarse: se usa el
  // incremento de referencia. Ojo — esto NO es "atleta novato": un cliente de
  // dos años al que se le activa la función hoy también entra por aquí, y
  // rebajarle el listón de entrada sería tratarle de principiante.
  if (memory.resolvedCount === 0) return JUSTO;

  // Ya sabemos que está empezando con los retos: las primeras semanas se ganan.
  // Sin victorias tempranas el atleta deja de mirar la card y el reto se
  // vuelve decorativo.
  if (memory.resolvedCount < WARMUP_WEEKS) return SUAVE;

  const failStreak = memory.failStreakByKind.get(kind) ?? 0;
  if (failStreak >= 2) return SUAVE_MUY;
  if (failStreak === 1) return SUAVE;

  const last = memory.lastByKind.get(kind);
  if (last?.status === 'conseguido') {
    return last.overshoot >= 1.15 ? AMBICIOSO : JUSTO;
  }

  // Sin historial de este tipo: se guía por cómo le va en general.
  if (memory.winRate >= 0.8) return { factor: 1.25, label: 'ambicioso' };
  if (memory.winRate <= 0.4) return SUAVE;
  return JUSTO;
}

// ── Rotación y fatiga ─────────────────────────────────────────────────────────

// Penalización decreciente por haber visto el tipo hace 1, 2, 3 o 4 semanas.
const ROTATION_PENALTIES = [30, 18, 10, 5];

export function rotationPenalty(kind: ChallengeKind, memory: ChallengeMemory): number {
  const idx = memory.recentKinds.indexOf(kind);
  if (idx < 0 || idx >= ROTATION_PENALTIES.length) return 0;
  return ROTATION_PENALTIES[idx];
}

// Un tipo que lleva 2+ fallos seguidos se aparta del primer puesto aunque su
// score base sea alto: insistir en lo que no sale es la receta de la baja.
export function frustrationPenalty(kind: ChallengeKind, memory: ChallengeMemory): number {
  const failStreak = memory.failStreakByKind.get(kind) ?? 0;
  return failStreak >= 2 ? 15 : 0;
}

// Cuántas veces seguidas ha fallado el hito redondo de este ejercicio.
export function failedMilestoneAttempts(exerciseId: string, memory: ChallengeMemory): number {
  return memory.failedMilestonesByExercise.get(exerciseId) ?? 0;
}

// ── Variación de copy ─────────────────────────────────────────────────────────

// Semilla estable por semana: el mismo reto se lee igual toda la semana (no
// cambia el texto al recargar) pero rota entre semanas para que el atleta no
// reciba diez veces la misma frase calcada.
export function weekSeed(isoWeek: string): number {
  let h = 0;
  for (let i = 0; i < isoWeek.length; i++) h = (h * 31 + isoWeek.charCodeAt(i)) >>> 0;
  return h;
}

export function pickVariant<T>(pool: readonly T[], seed: number, salt = 0): T {
  return pool[(seed + salt) % pool.length];
}
