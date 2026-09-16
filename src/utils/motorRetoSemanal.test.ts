import { describe, expect, it, beforeEach } from 'vitest';
import { WeeklyChallenge, AppNotification } from '../types';
import { ChallengeData, isoWeekKey } from './weeklyChallenge';
import { getWeekStart, addDays } from './trainingWeek';
import { ejecutarRetoSemanal, AlmacenDeRetos } from './motorRetoSemanal';

/* Un almacén en memoria. Sin `vi.mock` de dbService: el motor ya no lo conoce,
   que es justo lo que permite que el latido del servidor lo reutilice. */
function almacenEnMemoria() {
  const retos = new Map<string, WeeklyChallenge>();
  const avisos: { dedupeKey: string; data: Omit<AppNotification, 'id'> }[] = [];
  const almacen: AlmacenDeRetos = {
    async getWeeklyChallenge(email, isoWeek) {
      return retos.get(`${email}_${isoWeek}`) ?? null;
    },
    async saveWeeklyChallenge(ch) {
      retos.set(`${ch.athleteId}_${ch.isoWeek}`, ch);
    },
    async createNotificationDeduped(dedupeKey, data) {
      if (avisos.some(a => a.dedupeKey === dedupeKey)) return;
      avisos.push({ dedupeKey, data });
    },
  };
  return { almacen, retos, avisos };
}

const DATOS: ChallengeData = {
  stepLogs: [], bodyweightLogs: [], workoutLogs: [], exercises: [],
  completionLogs: [], coachDiets: [], assignments: [], projection: null,
};

const ATLETA = 'atleta@x.com';
const COACH = 'coach@x.com';
const LUNES = '2026-07-06';
const MARTES = '2026-07-07';
const OPCIONES = { coachEmail: COACH, esperarAlCierreAnterior: true };

let m: ReturnType<typeof almacenEnMemoria>;
beforeEach(() => { m = almacenEnMemoria(); });

describe('ejecutarRetoSemanal', () => {
  it('el lunes deja el margen del coach: no crea nada y avisa de que está pendiente', async () => {
    const r = await ejecutarRetoSemanal(ATLETA, DATOS, LUNES, m.almacen, OPCIONES);
    expect(r.pending).toBe(true);
    expect(r.challenge).toBeNull();
    expect(m.retos.size).toBe(0);
  });

  it('desde el martes genera el reto y avisa al atleta una sola vez', async () => {
    const r = await ejecutarRetoSemanal(ATLETA, DATOS, MARTES, m.almacen, OPCIONES);
    expect(r.pending).toBe(false);
    expect(r.challenge).not.toBeNull();
    expect(m.avisos.filter(a => a.data.type === 'weekly_challenge_new')).toHaveLength(1);

    // Volver a pasarlo el mismo día no duplica ni el reto ni el aviso: es lo
    // que permite que el latido y el navegador convivan sin pisarse.
    await ejecutarRetoSemanal(ATLETA, DATOS, MARTES, m.almacen, OPCIONES);
    expect(m.retos.size).toBe(1);
    expect(m.avisos.filter(a => a.data.type === 'weekly_challenge_new')).toHaveLength(1);
  });

  it('cierra el reto de la semana anterior que quedó activo', async () => {
    const semanaPasada = isoWeekKey(addDays(getWeekStart(MARTES), -7));
    const zombi: WeeklyChallenge = {
      id: `${ATLETA}_${semanaPasada}`, athleteId: ATLETA, isoWeek: semanaPasada,
      weekStart: addDays(getWeekStart(MARTES), -7), weekEnd: addDays(getWeekStart(MARTES), -1),
      kind: 'pasos_media', title: 'Media de 9.000 pasos', description: '',
      origin: 'auto', metric: { unit: 'pasos', target: 9000 },
      status: 'activo', createdAt: '2026-06-30T08:00:00.000Z',
    };
    m.retos.set(`${ATLETA}_${semanaPasada}`, zombi);

    await ejecutarRetoSemanal(ATLETA, DATOS, MARTES, m.almacen, OPCIONES);

    const cerrado = m.retos.get(`${ATLETA}_${semanaPasada}`)!;
    // Sin pasos registrados, falla: lo que no puede quedarse es en 'activo'.
    expect(cerrado.status).toBe('fallido');
    expect(cerrado.resolvedAt).toBeTruthy();
  });

  it('el aviso de reto conseguido va al atleta y al coach que se le pase', async () => {
    const estaSemana = isoWeekKey(MARTES);
    m.retos.set(`${ATLETA}_${estaSemana}`, {
      id: `${ATLETA}_${estaSemana}`, athleteId: ATLETA, isoWeek: estaSemana,
      weekStart: getWeekStart(MARTES), weekEnd: addDays(getWeekStart(MARTES), 6),
      kind: 'pasos_total', title: 'Da 10 pasos', description: '',
      origin: 'coach', metric: { unit: 'pasos', target: 0 },
      status: 'activo', createdAt: '2026-07-06T08:00:00.000Z',
    } as WeeklyChallenge);

    await ejecutarRetoSemanal(ATLETA, DATOS, MARTES, m.almacen, OPCIONES);

    const ganados = m.avisos.filter(a => a.data.type === 'weekly_challenge_won');
    expect(ganados).toHaveLength(2);
    expect(ganados.map(a => a.data.recipientEmail).sort()).toEqual([ATLETA, COACH].sort());
    expect(m.retos.get(`${ATLETA}_${estaSemana}`)!.status).toBe('conseguido');
  });

  it('un reto ya conseguido no se vuelve a anunciar', async () => {
    await ejecutarRetoSemanal(ATLETA, DATOS, MARTES, m.almacen, OPCIONES);
    const antes = m.avisos.length;
    await ejecutarRetoSemanal(ATLETA, DATOS, MARTES, m.almacen, OPCIONES);
    expect(m.avisos.length).toBe(antes);
  });
});
