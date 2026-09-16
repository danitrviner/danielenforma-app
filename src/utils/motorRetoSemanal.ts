import { WeeklyChallenge, AppNotification } from '../types.js';
import {
  isoWeekKey, generateAutoChallenge, evaluateChallengeProgress,
  ChallengeData, ChallengeProgress,
} from './weeklyChallenge.js';
import { getWeekStart, addDays } from './trainingWeek.js';
import { isCoachGraceDay } from './challengeOptions.js';

/* ═══════════════════════════════════════════════════════════════════════════
   MOTOR DEL RETO SEMANAL — la lógica, sin saber dónde se guarda.

   Era `ensureWeeklyChallenge`, que importaba `dbService` directamente. Eso
   estaba bien mientras el único que lo llamaba era el navegador del atleta,
   pero el latido diario corre en el servidor con el SDK de administración: si
   la lógica sigue amarrada a `dbService` (que arrastra el SDK de cliente y el
   espejo en localStorage), el servidor no puede usarla y habría que
   reescribirla. Dos copias de las reglas de los retos, divergiendo en cuanto
   alguien toque una: exactamente lo que este trabajo viene a quitar.

   Así que la lógica vive aquí y recibe un `AlmacenDeRetos` — tres funciones—
   que cada lado implementa a su manera. `ensureWeeklyChallenge.ts` sigue
   existiendo como el adaptador del cliente, con la misma firma de siempre.

   Nada de esto importa React ni Firebase: se puede probar con un Map.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Lo único que el motor necesita del mundo exterior. */
export interface AlmacenDeRetos {
  getWeeklyChallenge(athleteEmail: string, isoWeek: string): Promise<WeeklyChallenge | null>;
  saveWeeklyChallenge(challenge: WeeklyChallenge): Promise<void>;
  createNotificationDeduped(dedupeKey: string, data: Omit<AppNotification, 'id'>): Promise<void>;
}

export interface EnsureChallengeResult {
  challenge: WeeklyChallenge | null;   // null = lunes sin reto todavía (margen del coach)
  progress: ChallengeProgress | null;
  pending: boolean;                    // true → mostrar "tu coach está preparando tu reto"
  previousKind?: WeeklyChallenge['kind'];
}

async function notifyChallengeWon(
  ch: WeeklyChallenge, almacen: AlmacenDeRetos, coachEmail: string,
): Promise<void> {
  const body = `${ch.title} — objetivo cumplido. ¡Enorme!`;
  await almacen.createNotificationDeduped(`notif_wc_won_${ch.athleteId}_${ch.isoWeek}_athlete`, {
    recipientEmail: ch.athleteId,
    type: 'weekly_challenge_won',
    title: 'Reto conseguido 🏆',
    body,
    link: 'roadmap',
    createdAt: new Date().toISOString(),
    read: false,
  });
  await almacen.createNotificationDeduped(`notif_wc_won_${ch.athleteId}_${ch.isoWeek}_coach`, {
    recipientEmail: coachEmail,
    type: 'weekly_challenge_won',
    title: 'Reto conseguido',
    body: `${ch.athleteId} ha conseguido su reto: ${ch.title}`,
    createdAt: new Date().toISOString(),
    read: false,
  });
}

/**
 * Resuelve el reto de la semana ISO anterior si quedó 'activo' (el atleta no
 * abrió la app al cierre): se evalúa con sus propios datos y queda
 * conseguido/fallido para que el historial no acumule retos zombis.
 */
async function resolvePreviousWeek(
  athleteEmail: string, data: ChallengeData, today: string,
  almacen: AlmacenDeRetos, coachEmail: string,
): Promise<void> {
  const prevDay = addDays(getWeekStart(today), -7);
  const prevKey = isoWeekKey(prevDay);
  const prev = await almacen.getWeeklyChallenge(athleteEmail, prevKey);
  if (!prev || prev.status !== 'activo') return;
  const progress = evaluateChallengeProgress(prev, data, today);
  const resolved: WeeklyChallenge = {
    ...prev,
    status: progress.achieved ? 'conseguido' : 'fallido',
    progressValue: progress.progressValue,
    resolvedAt: new Date().toISOString(),
  };
  await almacen.saveWeeklyChallenge(resolved);
  if (progress.achieved) await notifyChallengeWon(resolved, almacen, coachEmail);
}

export interface OpcionesMotorReto {
  /** A quién se le avisa de los retos conseguidos. */
  coachEmail: string;
  /**
   * `true` cuando quien llama puede esperar a que termine todo (el latido del
   * servidor). En el navegador se deja en `false`: resolver la semana anterior
   * no debe bloquear el primer render del Road map, y si falla, el latido de
   * esta noche lo arregla.
   */
  esperarAlCierreAnterior?: boolean;
}

export async function ejecutarRetoSemanal(
  athleteEmail: string,
  data: ChallengeData,
  today: string,
  almacen: AlmacenDeRetos,
  opciones: OpcionesMotorReto,
): Promise<EnsureChallengeResult> {
  const { coachEmail, esperarAlCierreAnterior = false } = opciones;
  const key = isoWeekKey(today);
  const prevDay = addDays(getWeekStart(today), -7);
  const [existing, previous] = await Promise.all([
    almacen.getWeeklyChallenge(athleteEmail, key),
    almacen.getWeeklyChallenge(athleteEmail, isoWeekKey(prevDay)),
  ]);

  /* En el navegador NO se espera: cerrar la semana anterior son un getDoc y
     dos o tres escrituras, y con una conexión floja eso dejaba la tarjeta del
     reto en «cargando» hasta que terminaran. Un `await p.catch(...)` sigue
     esperando a `p`; lo que no bloquea es no hacer el await. El resultado del
     cierre no le hace falta a nadie aquí, solo tiene que ocurrir. En el
     servidor (latido) sí se espera, porque allí no hay render que retrasar y
     un fallo tiene que contarse. */
  const cerrarAnterior = (): Promise<void> => {
    const p = resolvePreviousWeek(athleteEmail, data, today, almacen, coachEmail);
    if (esperarAlCierreAnterior) return p;
    void p.catch(err => console.warn('resolvePreviousWeek failed:', err));
    return Promise.resolve();
  };

  let challenge = existing;
  if (!challenge) {
    if (isCoachGraceDay(today)) {
      // Lunes: margen para que el coach elija una opción a mano. No se
      // auto-crea nada; la semana anterior sí se resuelve igualmente.
      await cerrarAnterior();
      return { challenge: null, progress: null, pending: true, previousKind: previous?.kind };
    }
    challenge = generateAutoChallenge({
      ...data,
      athleteId: athleteEmail,
      today,
      previousKind: previous?.kind,
    });
    await almacen.saveWeeklyChallenge(challenge);
    await almacen.createNotificationDeduped(`notif_wc_new_${athleteEmail}_${key}`, {
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
      evaluadoEn: today,
    };
    await almacen.saveWeeklyChallenge(challenge);
    await notifyChallengeWon(challenge, almacen, coachEmail);
  } else if (challenge.status === 'activo'
      && (challenge.progressValue !== progress.progressValue || challenge.evaluadoEn !== today)) {
    // Snapshot para que el coach vea el avance sin recalcular todos los logs —
    // y para que la próxima apertura del día no tenga que volver a cargar el
    // historial entero (ver `evaluadoEn` en types.ts).
    challenge = { ...challenge, progressValue: progress.progressValue, evaluadoEn: today };
    await almacen.saveWeeklyChallenge(challenge);
  }

  await cerrarAnterior();

  return { challenge, progress, pending: false, previousKind: previous?.kind };
}
