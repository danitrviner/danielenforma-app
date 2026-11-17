import { describe, expect, it } from 'vitest';
import {
  BodyweightLog, Exercise, Mesocycle, MuscleGroup, MuscleGroupConfig, WorkoutAssignment, WorkoutLog, MUSCLE_ORDER,
} from '../types';
import { buildCierreCompleto, mensajeDeCierre } from './cierreCompleto';
import { buildCierreMesociclo } from './cierreMesociclo';

/* El mensaje del cierre es UNO (F8): el editor del mesociclo, Revisión › Cierre
   de bloque, el borrador que se firma y el asistente llaman a
   `buildCierreCompleto`. Aquí se comprueba lo que hacía que fueran tres: las
   sesiones repetidas, el peso corporal que faltaba y el cuerpo/bienestar que
   solo salía en una de las pantallas. */

const grupos = (parcial: Partial<Record<MuscleGroup, number>>): Record<MuscleGroup, MuscleGroupConfig> =>
  Object.fromEntries(MUSCLE_ORDER.map(g => [g, { series: parcial[g] ?? 0, priority: 'media' as const }])) as Record<MuscleGroup, MuscleGroupConfig>;

const MESO: Mesocycle = {
  id: 'm1', athleteId: 'a@b.c', number: 1, name: 'Hipertrofia 1', weeks: 4, startDate: '2026-06-01',
  objective: 'Hipertrofia', daysPerWeek: 4, groups: grupos({ dorsal: 2 }),
};
const EJERCICIOS: Exercise[] = [
  { id: 'dom', ownerId: 'c', name: 'Dominadas', primaryFocus: '', muscleGroup: 'dorsal', type: 'fuerza', isCustom: false },
];
// Dominadas sin lastre: 0 kg apuntados. Sin el peso corporal no hay kilos que contar.
const log = (date: string, reps: number): WorkoutLog => ({
  id: `l-${date}`, athleteId: 'a@b.c', workoutId: 'w', assignmentId: 'as', date, completedAt: `${date}T10:00:00.000Z`,
  entries: [{ exerciseId: 'dom', sets: [{ weight: 0, repsDone: reps, rir: 2 }, { weight: 0, repsDone: reps, rir: 2 }] }],
});
const asig = (date: string, status: WorkoutAssignment['status']): WorkoutAssignment => ({
  id: `a-${date}`, workoutId: 'w', athleteId: 'uid', date, status, mesocycleId: 'm1',
});
const peso = (date: string, weight: number): BodyweightLog => ({ id: date, athleteId: 'a@b.c', date, weight } as BodyweightLog);

const BASE = {
  meso: MESO, mesocycles: [MESO], exercises: EJERCICIOS, athleteName: 'Marta López', hoy: '2026-07-10',
  logs: [log('2026-06-02', 6), log('2026-06-09', 7), log('2026-06-16', 8), log('2026-06-23', 9)],
  assignments: [asig('2026-06-02', 'completed'), asig('2026-06-09', 'completed'), asig('2026-06-16', 'completed'), asig('2026-06-23', 'completed'), asig('2026-06-25', 'perdido')],
};
const PESOS = [peso('2026-06-01', 80), peso('2026-06-03', 80.2), peso('2026-06-24', 78), peso('2026-06-26', 78.2), peso('2026-07-09', 70)];

describe('buildCierreCompleto', () => {
  it('calcula siempre con el peso corporal del final del bloque (F8)', () => {
    const c = buildCierreCompleto({ ...BASE, bodyweightLogs: PESOS });
    expect(c.pesoCorporalKg).toBe(78.2); // el último hasta el 28 de junio, no el 70 de después
    // Las dominadas a 0 kg mueven el peso del atleta: hay tonelaje y 1RM estimado.
    const dom = c.cierre.progresion.ejercicios[0];
    expect(dom.metrica).toBe('e1rm');
    expect(dom.tonelaje).toBeGreaterThan(0);
    // Es la misma cifra que da el motor cuando se le pasa el peso a mano…
    const conPeso = buildCierreMesociclo({ ...BASE, pesoCorporalKg: 78.2 });
    expect(dom.deltaPct).toBe(conPeso.progresion.ejercicios[0].deltaPct);
    // …y distinta de la que daba el borrador enviado, que se calculaba sin él.
    const sinPeso = buildCierreMesociclo({ ...BASE });
    expect(sinPeso.progresion.ejercicios[0].metrica).toBe('reps');
    expect(dom.deltaPct).not.toBe(sinPeso.progresion.ejercicios[0].deltaPct);
  });

  it('el mensaje dice las sesiones una sola vez, por su nombre, y acaba en la despedida (F8)', () => {
    const { mensaje } = buildCierreCompleto({ ...BASE, bodyweightLogs: PESOS });
    const lineas = mensaje.split('\n');
    expect(lineas[0]).toBe('Marta, cerramos el bloque «Hipertrofia 1» (Hipertrofia): 4 semanas, del 1 de jun al 28 de jun.');
    expect(mensaje.match(/4 de 5 sesiones/g)).toHaveLength(1);
    expect(mensaje).not.toMatch(/Bloque .* terminado:/); // la cabecera del borrador viejo, que las repetía
    expect(lineas[lineas.length - 1]).toBe('Con esto monto el siguiente bloque.');
    expect(mensaje.match(/Con esto monto el siguiente bloque\./g)).toHaveLength(1);
  });

  it('lleva el cuerpo y el bienestar: el mismo texto para las tres vías (F8)', () => {
    const { mensaje, cierre, conclusiones } = buildCierreCompleto({ ...BASE, bodyweightLogs: PESOS });
    expect(conclusiones.paraElCliente).toEqual(['Tu peso ha pasado de 80,1 a 78,1 kg.']);
    expect(mensaje).toContain('Tu peso ha pasado de 80,1 a 78,1 kg.');
    // El mensaje sale del único generador: rendimiento + cuerpo + despedida.
    expect(mensaje).toBe(mensajeDeCierre(cierre, conclusiones));
    expect(mensaje.startsWith(cierre.resumenParaCliente)).toBe(true);
  });

  it('sin pesajes sigue dando cierre y mensaje, sin inventar un peso', () => {
    const c = buildCierreCompleto({ ...BASE });
    expect(c.pesoCorporalKg).toBeNull();
    expect(c.evolucion.peso).toBeNull();
    expect(c.mensaje).toContain('4 de 5 sesiones');
  });

  it('usa las semanas reales del bloque en la evolución (ciclo distinto de 7)', () => {
    const deDiez: Mesocycle = { ...MESO, cycleDays: 10 }; // 3 vueltas de 10 = 30 días: 5 semanas de calendario
    const c = buildCierreCompleto({ ...BASE, meso: deDiez, mesocycles: [deDiez], bodyweightLogs: [...PESOS, peso('2026-06-30', 77)] });
    expect(c.cierre.fin).toBe('2026-06-30');
    expect(c.evolucion.semanas).toBe(5);
    expect(c.evolucion.peso!.semanal).toHaveLength(5);
    expect(c.pesoCorporalKg).toBe(77);
  });
});
