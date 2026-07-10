// Orquestador del reto semanal (generate-on-read). Se llama al cargar la
// pantalla Roadmap del atleta: garantiza que la semana en curso tiene reto
// (si el coach no asignó uno, se genera automático), refresca el progreso,
// resuelve la semana anterior y dispara las notificaciones. Separado de
// weeklyChallenge.ts para que el motor puro sea testeable sin Firebase.

import { WeeklyChallenge } from '../types';
import {
  getWeeklyChallenge, saveWeeklyChallenge, createNotificationDeduped,
} from '../dbService';
import {
  isoWeekKey, generateAutoChallenge, evaluateChallengeProgress,
  ChallengeData, ChallengeProgress,
} from './weeklyChallenge';
import { getWeekStart, addDays } from './trainingWeek';
import { isCoachGraceDay } from './challengeOptions';

const COACH_EMAIL = 'danitrviner@gmail.com';

async function notifyChallengeWon(ch: WeeklyChallenge): Promise<void> {
  const body = `${ch.title} — objetivo cumplido. ¡Enorme!`;
  await createNotificationDeduped(`notif_wc_won_${ch.athleteId}_${ch.isoWeek}_athlete`, {
    recipientEmail: ch.athleteId,
    type: 'weekly_challenge_won',
    title: 'Reto conseguido 🏆',
    body,
    link: 'roadmap',
    createdAt: new Date().toISOString(),
    read: false,
  });
  await createNotificationDeduped(`notif_wc_won_${ch.athleteId}_${ch.isoWeek}_coach`, {
    recipientEmail: COACH_EMAIL,
    type: 'weekly_challenge_won',
    title: 'Reto conseguido',
    body: `${ch.athleteId} ha conseguido su reto: ${ch.title}`,
    createdAt: new Date().toISOString(),
    read: false,
  });
}

// Resuelve el reto de la semana ISO anterior si quedó 'activo' (el atleta no
// abrió la app al cierre): se evalúa con sus propios datos y queda
// conseguido/fallido para que el historial no acumule retos zombis.
async function resolvePreviousWeek(athleteEmail: string, data: ChallengeData, today: string): Promise<void> {
  const prevDay = addDays(getWeekStart(today), -7);
  const prevKey = isoWeekKey(prevDay);
  const prev = await getWeeklyChallenge(athleteEmail, prevKey);
  if (!prev || prev.status !== 'activo') return;
  const progress = evaluateChallengeProgress(prev, data, today);
  const resolved: WeeklyChallenge = {
    ...prev,
    status: progress.achieved ? 'conseguido' : 'fallido',
    progressValue: progress.progressValue,
    resolvedAt: new Date().toISOString(),
  };
  await saveWeeklyChallenge(resolved);
  if (progress.achieved) await notifyChallengeWon(resolved);
}

export interface EnsureChallengeResult {
  challenge: WeeklyChallenge | null;   // null = lunes sin reto todavía (margen del coach)
  progress: ChallengeProgress | null;
  pending: boolean;                    // true → mostrar "tu coach está preparando tu reto"
  previousKind?: WeeklyChallenge['kind'];
}

export async function ensureWeeklyChallenge(
  athleteEmail: string,
  data: ChallengeData,
  today: string,
): Promise<EnsureChallengeResult> {
  const key = isoWeekKey(today);
  const prevDay = addDays(getWeekStart(today), -7);
  const [existing, previous] = await Promise.all([
    getWeeklyChallenge(athleteEmail, key),
    getWeeklyChallenge(athleteEmail, isoWeekKey(prevDay)),
  ]);

  let challenge = existing;
  if (!challenge) {
    if (isCoachGraceDay(today)) {
      // Lunes: margen para que el coach elija una opción a mano. No se
      // auto-crea nada; la semana anterior sí se resuelve igualmente.
      resolvePreviousWeek(athleteEmail, data, today).catch(err =>
        console.warn('resolvePreviousWeek failed:', err),
      );
      return { challenge: null, progress: null, pending: true, previousKind: previous?.kind };
    }
    challenge = generateAutoChallenge({
      ...data,
      athleteId: athleteEmail,
      today,
      previousKind: previous?.kind,
    });
    await saveWeeklyChallenge(challenge);
    await createNotificationDeduped(`notif_wc_new_${athleteEmail}_${key}`, {
      recipientEmail: athleteEmail,
      type: 'weekly_challenge_new',
      title: 'Nuevo reto de la semana',
      body: challenge.title,
      link: 'roadmap',
      createdAt: new Date().toISOString(),
      read: false,
    });
  }

  const progress = evaluateChallengeProgress(challenge, data, today);

  if (progress.achieved && challenge.status === 'activo') {
    challenge = {
      ...challenge,
      status: 'conseguido',
      progressValue: progress.progressValue,
      resolvedAt: new Date().toISOString(),
    };
    await saveWeeklyChallenge(challenge);
    await notifyChallengeWon(challenge);
  } else if (challenge.status === 'activo' && challenge.progressValue !== progress.progressValue) {
    // Snapshot para que el coach vea el avance sin recalcular todos los logs.
    challenge = { ...challenge, progressValue: progress.progressValue };
    await saveWeeklyChallenge(challenge);
  }

  // No bloquea el render si la semana anterior falla al resolverse.
  resolvePreviousWeek(athleteEmail, data, today).catch(err =>
    console.warn('resolvePreviousWeek failed:', err),
  );

  return { challenge, progress, pending: false, previousKind: previous?.kind };
}
