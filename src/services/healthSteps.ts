import { Capacitor } from '@capacitor/core';
import { Health } from 'capacitor-health';

const PERMISSION_STORAGE_KEY = 'enforma:healthStepsLinked';

export function isHealthStepsSupported(): boolean {
  return Capacitor.isNativePlatform();
}

export function isHealthStepsLinked(): boolean {
  return localStorage.getItem(PERMISSION_STORAGE_KEY) === '1';
}

/** Pide permiso de lectura de pasos (HealthKit en iOS, Health Connect en Android). */
export async function linkHealthSteps(): Promise<boolean> {
  if (!isHealthStepsSupported()) return false;
  const { available } = await Health.isHealthAvailable();
  if (!available) return false;
  await Health.requestHealthPermissions({ permissions: ['READ_STEPS'] });
  // iOS nunca informa si el atleta denegó — se asume concedido, como indica
  // la documentación del plugin. Android sí puede confirmarse con
  // checkHealthPermissions, pero tratamos ambos igual para no bifurcar la UI.
  localStorage.setItem(PERMISSION_STORAGE_KEY, '1');
  return true;
}

export function unlinkHealthSteps(): void {
  localStorage.removeItem(PERMISSION_STORAGE_KEY);
}

/** Pasos de hoy (medianoche local → ahora), o null si no hay vínculo o falla la lectura. */
export async function getTodaySteps(): Promise<number | null> {
  if (!isHealthStepsSupported() || !isHealthStepsLinked()) return null;
  try {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const { aggregatedData } = await Health.queryAggregated({
      startDate: start.toISOString(),
      endDate: new Date().toISOString(),
      dataType: 'steps',
      bucket: 'day',
    });
    return aggregatedData.reduce((sum, s) => sum + s.value, 0);
  } catch (err) {
    console.warn('getTodaySteps (Health) failed:', err);
    return null;
  }
}
