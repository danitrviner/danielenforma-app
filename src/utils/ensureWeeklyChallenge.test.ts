import { describe, expect, it, vi, beforeEach } from 'vitest';
import { WeeklyChallenge } from '../types';
import { ChallengeData, isoWeekKey } from './weeklyChallenge';
import { getWeekStart, addDays } from './trainingWeek';

// Store en memoria para simular Firestore sin tocar la red.
const store = new Map<string, WeeklyChallenge>();
const notifications: { dedupeKey: string; type: string }[] = [];

vi.mock('../dbService', () => ({
  getWeeklyChallenge: vi.fn(async (email: string, isoWeek: string) => store.get(`${email}_${isoWeek}`) ?? null),
  saveWeeklyChallenge: vi.fn(async (ch: WeeklyChallenge) => { store.set(ch.id, ch); }),
  createNotificationDeduped: vi.fn(async (dedupeKey: string, data: { type: string }) => {
    notifications.push({ dedupeKey, type: data.type });
  }),
}));

const { ensureWeeklyChallenge } = await import('./ensureWeeklyChallenge');
const dbService = await import('../dbService');

const EMPTY_DATA: ChallengeData = {
  stepLogs: [], bodyweightLogs: [], workoutLogs: [], exercises: [],
  completionLogs: [], coachDiets: [], assignments: [], projection: null,
};

const ATHLETE = 'atleta@x.com';
const MONDAY = '2026-07-06';
const TUESDAY = '2026-07-07';

beforeEach(() => {
  store.clear();
  notifications.length = 0;
  vi.clearAllMocks();
});

describe('ensureWeeklyChallenge — regla del martes', () => {
  it('no crea reto en lunes si no hay ninguno asignado — devuelve pending', async () => {
    const result = await ensureWeeklyChallenge(ATHLETE, EMPTY_DATA, MONDAY);
    expect(result.pending).toBe(true);
    expect(result.challenge).toBeNull();
    expect(result.progress).toBeNull();
    expect(dbService.saveWeeklyChallenge).not.toHaveBeenCalled();
    expect(notifications.some(n => n.type === 'weekly_challenge_new')).toBe(false);
  });

  it('auto-crea el reto desde el martes si sigue sin haber ninguno', async () => {
    const result = await ensureWeeklyChallenge(ATHLETE, EMPTY_DATA, TUESDAY);
    expect(result.pending).toBe(false);
    expect(result.challenge).not.toBeNull();
    expect(result.challenge!.origin).toBe('auto');
    expect(dbService.saveWeeklyChallenge).toHaveBeenCalled();
    expect(notifications.some(n => n.type === 'weekly_challenge_new')).toBe(true);
  });

  it('respeta un reto ya asignado por el coach en lunes (no lo sobrescribe ni queda pending)', async () => {
    const isoWeek = '2026-W28';
    const coachChallenge: WeeklyChallenge = {
      id: `${ATHLETE}_${isoWeek}`, athleteId: ATHLETE, isoWeek,
      weekStart: MONDAY, weekEnd: '2026-07-12',
      kind: 'custom', title: 'Reto del coach', description: 'd',
      origin: 'coach', metric: { unit: 'unidades', target: 1 },
      status: 'activo', createdAt: MONDAY,
    };
    store.set(coachChallenge.id, coachChallenge);

    const result = await ensureWeeklyChallenge(ATHLETE, EMPTY_DATA, MONDAY);
    expect(result.pending).toBe(false);
    expect(result.challenge?.origin).toBe('coach');
    expect(result.challenge?.title).toBe('Reto del coach');
  });

  it('resuelve igualmente la semana anterior aunque hoy sea lunes sin reto nuevo', async () => {
    // Se deriva con los mismos helpers que usa el código bajo test (en vez de
    // fijar el string a mano) para no acoplarse a addDays (trainingWeek.ts),
    // que tiene un desfase de huso horario conocido y ajeno a este test.
    const prevWeekStart = addDays(getWeekStart(MONDAY), -7);
    const prevIsoWeek = isoWeekKey(prevWeekStart);
    const prevChallenge: WeeklyChallenge = {
      id: `${ATHLETE}_${prevIsoWeek}`, athleteId: ATHLETE, isoWeek: prevIsoWeek,
      weekStart: prevWeekStart, weekEnd: addDays(prevWeekStart, 6),
      kind: 'pasos_media', title: 't', description: 'd',
      origin: 'auto', metric: { unit: 'pasos', target: 8000 },
      status: 'activo', createdAt: prevWeekStart,
    };
    store.set(prevChallenge.id, prevChallenge);

    await ensureWeeklyChallenge(ATHLETE, EMPTY_DATA, MONDAY);
    // resolvePreviousWeek corre en background (no bloquea el return) — esperamos
    // a que se asiente su propia cadena de awaits (get → evaluar → save).
    await new Promise(r => setTimeout(r, 10));
    const resolved = store.get(prevChallenge.id);
    expect(resolved?.status).toBe('fallido'); // sin stepLogs, no puede haberse conseguido
  });
});
