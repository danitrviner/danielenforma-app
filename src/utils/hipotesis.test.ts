import { describe, it, expect } from 'vitest';
import type { WorkoutLog } from '../types';
import { antesYDespues, ejercicioDelCambio, estadoDeHipotesis, textoDeResultado } from './hipotesis';

let n = 0;
const sesion = (date: string, weight: number, repsDone: number): WorkoutLog => ({
  id: `l${n++}`, athleteId: 'a', workoutId: 'w', assignmentId: 'x', date, completedAt: '',
  entries: [{ exerciseId: 'press', sets: [{ weight, repsDone, rir: 2 }, { weight, repsDone, rir: 2 }] }],
}) as WorkoutLog;

describe('cambios con hipótesis (S5)', () => {
  it('el estado sale de la fecha de revisión y del cierre', () => {
    expect(estadoDeHipotesis({ revisarEl: '2026-12-02' }, '2026-11-20')).toBe('en_observacion');
    expect(estadoDeHipotesis({ revisarEl: '2026-12-02' }, '2026-12-02')).toBe('toca_revisar');
    expect(estadoDeHipotesis({ revisarEl: '2026-12-02', cierre: { resultado: 'funciono', at: 'x' } }, '2026-12-05')).toBe('cerrada');
  });

  it('compara la media de las sesiones de antes con las de después', () => {
    const logs = [sesion('2026-10-01', 80, 8), sesion('2026-10-08', 80, 8), sesion('2026-10-20', 80, 9), sesion('2026-10-27', 80, 10)];
    const r = antesYDespues(logs, 'press', '2026-10-15');
    expect(r.sesionesDespues).toBe(2);
    expect(r.despues!).toBeGreaterThan(r.antes!);
    expect(r.cambioPct!).toBeGreaterThan(0);
  });

  it('una sesión sin series válidas no tiene marca y no entra en ninguna media (D2)', () => {
    const lejos = (date: string): WorkoutLog => ({
      id: `l${n++}`, athleteId: 'a', workoutId: 'w', assignmentId: 'x', date, completedAt: '',
      entries: [{ exerciseId: 'press', sets: [{ weight: 80, repsDone: 8, rir: 5 }, { weight: 60, repsDone: 20, rir: 2 }] }],
    }) as WorkoutLog;
    const limpio = [sesion('2026-10-01', 80, 8), sesion('2026-10-08', 80, 8), sesion('2026-10-20', 80, 8), sesion('2026-10-27', 80, 8)];
    const conRuido = [...limpio, lejos('2026-10-05'), lejos('2026-10-23')];
    // Antes: la de RIR 5 y la de 20 repeticiones movían la media de su lado.
    expect(antesYDespues(conRuido, 'press', '2026-10-15')).toEqual(antesYDespues(limpio, 'press', '2026-10-15'));
    expect(antesYDespues(conRuido, 'press', '2026-10-15')).toMatchObject({ cambioPct: 0, sesionesDespues: 2 });
    // Y si después del cambio solo hay sesiones sin marca, no hay «después».
    expect(antesYDespues([sesion('2026-10-01', 80, 8), lejos('2026-10-20')], 'press', '2026-10-15')).toMatchObject({ despues: null, sesionesDespues: 0, cambioPct: null });
  });

  it('sin sesiones a un lado no inventa el porcentaje', () => {
    const r = antesYDespues([sesion('2026-10-01', 80, 8)], 'press', '2026-10-15');
    expect(r).toMatchObject({ despues: null, sesionesDespues: 0, cambioPct: null });
  });

  it('propone el ejercicio que nombra el cambio, el de nombre más largo si hay dos', () => {
    const ejercicios = [{ id: 'press', nombre: 'Press banca' }, { id: 'inclinado', nombre: 'Press banca inclinado' }];
    expect(ejercicioDelCambio({ titulo: 'Mesociclo #3 · Press banca inclinado', lineas: ['Descanso 90 → 150 s'] }, ejercicios)).toBe('inclinado');
    expect(ejercicioDelCambio({ titulo: 'Mesociclo #3', lineas: ['Dorsal 12 → 14 series'] }, ejercicios)).toBe('');
  });

  it('el resultado se lee de un vistazo y no inventa nada sin datos', () => {
    const logs = [sesion('2026-10-01', 80, 8), sesion('2026-10-20', 80, 10)];
    const h = { id: 'c1', espero: 'x', exerciseId: 'press', desde: '2026-10-15', revisarEl: '2026-11-05' };
    expect(textoDeResultado(h, logs, 'Press banca')).toMatch(/^Press banca · 1RM est\. .+ → .+ kg \(\+.+ %\) en 1 sesión$/);
    expect(textoDeResultado({ ...h, exerciseId: undefined }, logs, undefined)).toContain('No elegiste ejercicio');
    expect(textoDeResultado({ ...h, desde: '2026-12-01' }, logs, 'Press banca')).toContain('aún no hay sesiones');
  });
});
