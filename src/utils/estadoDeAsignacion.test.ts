import { describe, it, expect } from 'vitest';
import type { WorkoutAssignment, WorkoutLog } from '../types';
import { conEstadoReal, asignacionesABorrar, claveDeSesion, planDeReprogramacion } from './estadoDeAsignacion';

/* El fallo que estos tests fijan (auditoría §4.1, Dani 15-09-2026):
 *
 * Un atleta y su entrenador completan el entreno del lunes. Días después
 * aparece como no completado. No se pierde nada: `handleAssign` borra TODAS
 * las asignaciones del mesociclo al reasignar —incluidas las de días ya
 * entrenados— y las recrea con `status: 'pending'`. El `WorkoutLog` con las
 * series sobrevive, pero nadie lo mira: toda la UI lee `assignment.status`.
 *
 * La regla que fija esto: el hecho consumado manda. Si hay un log de ese
 * atleta para esa fecha, ese día está entrenado, diga lo que diga el campo. */

const asignacion = (over: Partial<WorkoutAssignment> = {}): WorkoutAssignment => ({
  id: 'a1', workoutId: 'w1', athleteId: 'ana@correo.com',
  date: '2026-09-07', status: 'pending', mesocycleId: 'm1', ...over,
});

const log = (over: Partial<WorkoutLog> = {}): WorkoutLog => ({
  id: 'l1', athleteId: 'ana@correo.com', workoutId: 'w1', assignmentId: 'a1',
  mesocycleId: 'm1', date: '2026-09-07', completedAt: '2026-09-07T18:30:00.000Z',
  entries: [], ...over,
});

describe('conEstadoReal', () => {
  it('marca completada una asignación que dice «pendiente» pero tiene entreno guardado', () => {
    const [resultado] = conEstadoReal([asignacion()], [log()]);
    expect(resultado.status).toBe('completed');
  });

  it('reconoce el entreno aunque la rutina se haya regenerado con otro id', () => {
    // Es EL caso real: al reasignar, `createWorkoutStrict` crea Workouts nuevos,
    // así que el `workoutId` del log apunta a una rutina que ya no existe. Casar
    // por rutina dejaría el día en pendiente justo cuando más falta hace.
    const [resultado] = conEstadoReal(
      [asignacion({ id: 'a-nueva', workoutId: 'w-regenerado' })],
      [log({ workoutId: 'w-viejo', assignmentId: 'a-borrada' })],
    );
    expect(resultado.status).toBe('completed');
  });

  it('no toca una asignación sin entreno guardado', () => {
    const [resultado] = conEstadoReal([asignacion()], []);
    expect(resultado.status).toBe('pending');
  });

  it('no confunde a dos atletas que entrenan el mismo día', () => {
    const [resultado] = conEstadoReal(
      [asignacion({ athleteId: 'luis@correo.com' })],
      [log({ athleteId: 'ana@correo.com' })],
    );
    expect(resultado.status).toBe('pending');
  });

  it('no arrastra el entreno de un día a otro', () => {
    const [resultado] = conEstadoReal(
      [asignacion({ date: '2026-09-08' })],
      [log({ date: '2026-09-07' })],
    );
    expect(resultado.status).toBe('pending');
  });

  it('respeta «saltado» y «perdido» cuando no hay entreno guardado', () => {
    // Son decisiones explícitas del atleta o del sistema; sin un log que las
    // contradiga, no se tocan.
    const estados = conEstadoReal(
      [asignacion({ id: 'a1', status: 'skipped' }), asignacion({ id: 'a2', status: 'perdido', date: '2026-09-08' })],
      [],
    ).map(a => a.status);
    expect(estados).toEqual(['skipped', 'perdido']);
  });

  it('un entreno guardado gana a «saltado»: si lo hizo, lo hizo', () => {
    const [resultado] = conEstadoReal([asignacion({ status: 'skipped' })], [log()]);
    expect(resultado.status).toBe('completed');
  });

  it('con dos sesiones el mismo día, el log casa con la de su rutina', () => {
    const resultado = conEstadoReal(
      [asignacion({ id: 'manana', workoutId: 'w-fuerza' }), asignacion({ id: 'tarde', workoutId: 'w-cardio' })],
      [log({ workoutId: 'w-cardio' })],
    );
    expect(resultado.find(a => a.id === 'manana')!.status).toBe('pending');
    expect(resultado.find(a => a.id === 'tarde')!.status).toBe('completed');
  });

  it('devuelve las mismas asignaciones cuando no hay nada que corregir', () => {
    // Evita re-renders inútiles en las pantallas que las pintan.
    const entrada = [asignacion({ status: 'completed' })];
    expect(conEstadoReal(entrada, [log()])).toBe(entrada);
  });
});

describe('asignacionesABorrar', () => {
  const HOY = '2026-09-15';

  it('no borra una asignación con entreno guardado detrás', () => {
    const a = asignacion({ date: '2026-09-07' });
    expect(asignacionesABorrar([a], [log()], HOY)).toEqual([]);
  });

  it('no borra días ya pasados aunque no se entrenaran', () => {
    // Un lunes que el atleta se saltó es historia: forma parte de su adherencia.
    // Recrearlo como «pendiente» inventa un entreno que nunca se le pidió.
    const a = asignacion({ date: '2026-09-07' });
    expect(asignacionesABorrar([a], [], HOY)).toEqual([]);
  });

  it('sí borra los días futuros, que son los que se reprograman', () => {
    const a = asignacion({ id: 'futura', date: '2026-09-20' });
    expect(asignacionesABorrar([a], [], HOY).map(x => x.id)).toEqual(['futura']);
  });

  it('borra el día de hoy si todavía no se ha entrenado', () => {
    // El coach que reprograma hoy por la mañana espera que hoy cambie.
    const a = asignacion({ id: 'hoy', date: HOY });
    expect(asignacionesABorrar([a], [], HOY).map(x => x.id)).toEqual(['hoy']);
  });

  it('NO borra el día de hoy si el atleta ya ha entrenado', () => {
    const a = asignacion({ id: 'hoy', date: HOY });
    expect(asignacionesABorrar([a], [log({ date: HOY })], HOY)).toEqual([]);
  });
});

describe('claveDeSesion', () => {
  it('casa asignación y log por atleta y fecha', () => {
    expect(claveDeSesion(asignacion())).toBe(claveDeSesion(log()));
  });

  it('distingue atletas y fechas', () => {
    expect(claveDeSesion(asignacion())).not.toBe(claveDeSesion(asignacion({ date: '2026-09-08' })));
    expect(claveDeSesion(asignacion())).not.toBe(claveDeSesion(asignacion({ athleteId: 'otro@correo.com' })));
  });
});

describe('planDeReprogramacion', () => {
  const HOY = '2026-09-15';
  const nueva = (date: string, workoutId = 'w-nuevo') => ({
    workoutId, athleteId: 'ana@correo.com', mesocycleId: 'm1', date, status: 'pending' as const,
  });

  it('conserva el lunes ya entrenado y no lo vuelve a crear', () => {
    // El caso de la auditoría: el coach reprograma y el lunes entrenado
    // desaparecía y volvía como pendiente.
    const plan = planDeReprogramacion(
      [asignacion({ id: 'lunes', date: '2026-09-07' })],
      [log({ date: '2026-09-07' })],
      [nueva('2026-09-07'), nueva('2026-09-16')],
      HOY,
    );
    expect(plan.borrar).toEqual([]);
    expect(plan.crear.map(n => n.date)).toEqual(['2026-09-16']);
  });

  it('reprograma los días futuros', () => {
    const plan = planDeReprogramacion(
      [asignacion({ id: 'futura', date: '2026-09-20' })],
      [],
      [nueva('2026-09-21')],
      HOY,
    );
    expect(plan.borrar.map(a => a.id)).toEqual(['futura']);
    expect(plan.crear.map(n => n.date)).toEqual(['2026-09-21']);
  });

  it('no duplica un día pasado que se conserva y que el plan nuevo repite', () => {
    const plan = planDeReprogramacion(
      [asignacion({ id: 'pasada', date: '2026-09-07', workoutId: 'w-viejo' })],
      [],
      [nueva('2026-09-07', 'w-regenerado')],
      HOY,
    );
    expect(plan.borrar).toEqual([]);
    expect(plan.crear).toEqual([]);
  });

  it('un día ya vivido queda cerrado: no se le añaden sesiones nuevas', () => {
    // No se puede emparejar por rutina para decidir esto: al regenerar, los
    // Workout se crean de cero y TODOS los workoutId son nuevos, así que
    // cualquier comparación por rutina daría «hueco libre» y duplicaría el día.
    // Un día pasado está cerrado y punto.
    const plan = planDeReprogramacion(
      [asignacion({ id: 'manana', date: '2026-09-07', workoutId: 'w-fuerza' })],
      [log({ date: '2026-09-07', workoutId: 'w-fuerza' })],
      [nueva('2026-09-07', 'w-regenerado'), nueva('2026-09-07', 'w-otro')],
      HOY,
    );
    expect(plan.borrar).toEqual([]);
    expect(plan.crear).toEqual([]);
  });

  it('con el mesociclo entero en el futuro, se rehace del todo', () => {
    const plan = planDeReprogramacion(
      [asignacion({ id: 'f1', date: '2026-10-01' }), asignacion({ id: 'f2', date: '2026-10-03' })],
      [],
      [nueva('2026-10-02'), nueva('2026-10-04')],
      HOY,
    );
    expect(plan.borrar.map(a => a.id)).toEqual(['f1', 'f2']);
    expect(plan.crear).toHaveLength(2);
  });
});
