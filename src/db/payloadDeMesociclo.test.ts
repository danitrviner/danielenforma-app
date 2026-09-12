import { describe, it, expect, vi } from 'vitest';

// `deleteField()` es un centinela del SDK: aquí solo hace falta poder
// reconocerlo, no que haga nada.
vi.mock('../firebase', async () => {
  const real = await vi.importActual<Record<string, unknown>>('../firebase');
  return { ...real, deleteField: () => ({ __borrar: true }) };
});

const { payloadDeMesociclo } = await import('./training');

/* El fallo de Sentry (11-09): «Function updateDoc() called with invalid data.
   Unsupported field value: undefined (found in document mesocycles/dvL7Pq…)».

   El payload ya convertía los `undefined` de primer nivel en `deleteField()`,
   pero `distribution.snapshot.cycleDays` es undefined en TODO mesociclo semanal
   y viaja dentro de un objeto. Ese llegaba crudo y Firestore rechazaba la
   escritura entera: el coach tocaba el bloque y no se guardaba nada. */

const esBorrado = (v: unknown) => (v as { __borrar?: boolean })?.__borrar === true;

describe('payloadDeMesociclo', () => {
  it('borra de verdad los campos que el coach ha quitado', () => {
    // Volver a «Semanal» quita cycleDays; sin deleteField se quedaba el viejo.
    const payload = payloadDeMesociclo({ cycleDays: undefined, splitId: undefined, weeks: 4 });
    expect(esBorrado(payload.cycleDays)).toBe(true);
    expect(esBorrado(payload.splitId)).toBe(true);
    expect(payload.weeks).toBe(4);
  });

  it('limpia los undefined de DENTRO de un objeto en vez de mandarlos', () => {
    const payload = payloadDeMesociclo({
      distribution: {
        days: [],
        overloadAlert: false,
        snapshot: { daysPerWeek: 4, cycleDays: undefined, splitId: undefined, groupSeries: {} },
        generatedAt: '2026-09-11T00:00:00.000Z',
      },
    });
    const snapshot = (payload.distribution as { snapshot: Record<string, unknown> }).snapshot;
    expect('cycleDays' in snapshot).toBe(false);
    expect('splitId' in snapshot).toBe(false);
    expect(snapshot.daysPerWeek).toBe(4);
    // Y desde luego no puede colarse un deleteField() ahí dentro: anidado no
    // vale, es justo lo que Firestore rechaza.
    expect(esBorrado(snapshot.cycleDays)).toBe(false);
  });

  it('limpia también dentro de los arrays', () => {
    const payload = payloadDeMesociclo({
      days: [{ dayIndex: 0, workoutId: 'w1', dayType: undefined }] as never,
    });
    const dia = (payload.days as Record<string, unknown>[])[0];
    expect('dayType' in dia).toBe(false);
    expect(dia.workoutId).toBe('w1');
  });

  it('no inventa campos: lo que no venía en updates no aparece', () => {
    const payload = payloadDeMesociclo({ weeks: 6 });
    expect(Object.keys(payload)).toEqual(['weeks']);
  });

  it('deja pasar los ceros y las cadenas vacías, que no son huecos', () => {
    const payload = payloadDeMesociclo({ number: 0, objective: '' });
    expect(payload.number).toBe(0);
    expect(payload.objective).toBe('');
    expect(esBorrado(payload.number)).toBe(false);
  });
});
