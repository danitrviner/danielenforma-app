// Adaptador de cliente del motor del reto semanal (generate-on-read).
//
// La lógica vive en `motorRetoSemanal.ts`, sin saber dónde se guarda nada: así
// la puede usar igual el navegador del atleta (aquí) y el latido diario del
// servidor, que escribe con el SDK de administración. Este fichero solo enchufa
// las tres funciones de `dbService` y fija el correo del coach.
import {
  getWeeklyChallenge, saveWeeklyChallenge, createNotificationDeduped,
} from '../dbService';
import { ChallengeData } from './weeklyChallenge';
import {
  ejecutarRetoSemanal, AlmacenDeRetos, EnsureChallengeResult,
} from './motorRetoSemanal';

export type { EnsureChallengeResult } from './motorRetoSemanal';

const COACH_EMAIL = 'danitrviner@gmail.com';

const ALMACEN: AlmacenDeRetos = {
  getWeeklyChallenge,
  saveWeeklyChallenge,
  createNotificationDeduped,
};

export async function ensureWeeklyChallenge(
  athleteEmail: string,
  data: ChallengeData,
  today: string,
): Promise<EnsureChallengeResult> {
  // `esperarAlCierreAnterior` queda en false: en el navegador, resolver la
  // semana pasada no debe retrasar el primer render del Road map, y si falla,
  // el latido de esta noche lo arregla.
  return ejecutarRetoSemanal(athleteEmail, data, today, ALMACEN, { coachEmail: COACH_EMAIL });
}
