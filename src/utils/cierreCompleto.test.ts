import { describe, expect, it } from 'vitest';
import {
  BodyweightLog, Exercise, Mesocycle, MuscleGroup, MuscleGroupConfig, WorkoutAssignment, WorkoutLog, MUSCLE_ORDER,
} from '../types';
import { buildCierreCompleto, mensajeDeCierre } from './cierreCompleto';
import { buildCierreMesociclo } from './cierreMesociclo';
import { RUIDO_RM_PCT } from './ruidoDeMedida';
import { addDays } from './trainingWeek';
import catalogoPrueba from './cdg/__fixtures__/catalogoPrueba.json';
import { crearMotor, expandirCatalogo, type CdgCatalogoCompacto } from './cdg';

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

// ── El sesgo del cierre, de punta a punta (D2b-D4c, 17-11-2026) ─────────────
// Fuerza constante con ±1 repetición de ruido: antes el cierre decía «mejora»
// (dato único de la semana 1 contra el máximo de las dos últimas). Ahora ni el
// titular, ni las conclusiones, ni el mensaje al cliente lo dicen.
describe('un bloque de 8 semanas sin mejora real no «funciona»', () => {
  const azar = (semilla: number) => {
    let a = semilla >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  const SEIS: Exercise[] = ['Press banca', 'Remo', 'Sentadilla', 'Curl', 'Press militar', 'Peso muerto'].map((name, i) => ({
    id: `e${i}`, ownerId: 'c', name, primaryFocus: '', muscleGroup: (['pecho', 'dorsal', 'cuadriceps', 'biceps', 'deltoide_ant', 'isquios'] as MuscleGroup[])[i],
    type: 'fuerza', isCustom: false,
  }));
  const OCHO: Mesocycle = { ...MESO, weeks: 8, groups: grupos({ pecho: 4, dorsal: 4 }) };
  // Dos sesiones por semana, dos series por ejercicio, siempre el mismo peso a RIR 1 y 7-9 repeticiones.
  const bloque = (semilla: number, kgSemana1 = 1): WorkoutLog[] => {
    const r = azar(semilla);
    return Array.from({ length: 16 }, (_, k) => {
      const date = addDays('2026-06-01', Math.floor(k / 2) * 7 + (k % 2) * 3);
      return {
        id: `l-${date}`, athleteId: 'a@b.c', workoutId: 'w', assignmentId: 'as', date, completedAt: `${date}T10:00:00.000Z`,
        entries: SEIS.map((e, i) => ({
          exerciseId: e.id,
          sets: [0, 1].map(() => ({ weight: (40 + i * 15) * (k < 2 ? kgSemana1 : 1), repsDone: 8 + Math.floor(r() * 3) - 1, rir: 1 })),
        })),
      };
    });
  };
  const cerrar = (logs: WorkoutLog[], meso: Mesocycle = OCHO) => buildCierreCompleto({
    meso, mesocycles: [meso], logs, assignments: [], exercises: SEIS, athleteName: 'Marta López', hoy: '2026-08-15',
  });

  it('la mediana queda por debajo del ruido y no se dice que mejora', () => {
    for (const semilla of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      const { cierre, conclusiones, mensaje } = cerrar(bloque(semilla));
      const res = cierre.progresion.resumen;
      expect(res.comparables).toBe(6);
      expect(Math.abs(res.medianaPct!)).toBeLessThan(RUIDO_RM_PCT);
      expect(res.mejoran).toBeLessThanOrEqual(1);
      expect(cierre.titulares[0]).toContain(`dentro del ±${RUIDO_RM_PCT}% de error de medida, la fuerza se mantiene`);
      const ids = conclusiones.hallazgos.map(h => h.id);
      expect(ids).not.toContain('funciona');
      expect(ids).not.toContain('progreso_lento');
      expect(ids).toContain('estancado');
      expect(conclusiones.hallazgos.find(h => h.id === 'estancado')!.texto).toMatch(/^La fuerza se mantiene/);
      expect(mensaje).toContain('En conjunto, tu fuerza se mantiene.');
      expect(mensaje).not.toContain('más fuerte');
      expect(cierre.notaDeDatos).toBeNull(); // todas las sesiones dieron marca
    }
  });

  it('con la semana 1 de descarga o de vuelta de un parón tampoco', () => {
    for (const semilla of [1, 2, 3, 4, 5]) {
      const logs = bloque(semilla, 0.8); // la semana 1, con el 80 % del peso
      for (const marca of [{ semanasDescarga: [1] }, { vuelveDeParon: true }]) {
        const { cierre, conclusiones, mensaje } = cerrar(logs, { ...OCHO, ...marca });
        expect(cierre.progresion.semanas[0].comparable).toBe(false);
        expect(Math.abs(cierre.progresion.resumen.medianaPct!)).toBeLessThan(RUIDO_RM_PCT);
        expect(conclusiones.hallazgos.map(h => h.id)).not.toContain('funciona');
        expect(mensaje).not.toContain('más fuerte');
        // Ni en los kg por semana: la semana recortada no es la referencia.
        expect(Math.abs(cierre.progresion.resumen.tonelajeSemanal!.deltaPct!)).toBeLessThan(5);
        expect(mensaje).not.toContain('más de kilos por semana');
      }
    }
  });

  it('una mejora de verdad (+2,5 kg cada dos semanas) sí se dice', () => {
    const logs = bloque(3).map((l, k) => ({
      ...l, entries: l.entries.map(e => ({ ...e, sets: e.sets.map(s => ({ ...s, weight: s.weight * (1 + 0.03 * Math.floor(k / 4)) })) })),
    }));
    const { cierre, conclusiones } = cerrar(logs);
    expect(cierre.progresion.resumen.medianaPct!).toBeGreaterThan(5);
    expect(conclusiones.hallazgos.map(h => h.id)).toContain('funciona');
  });
});

describe('hipótesis del bloque en el cierre', () => {
  const motor = crearMotor(expandirCatalogo(catalogoPrueba as CdgCatalogoCompacto));
  const PRESS: Exercise = {
    id: 'press', ownerId: 'c', name: 'Press banca', primaryFocus: '', muscleGroup: 'pecho', type: 'fuerza', isCustom: false,
    cdgNombre: 'Press banca plano con mancuernas (caja torácica amplia) - Pectoral, deltoides anterior, tríceps',
  };
  const CON_HIPOTESIS: Mesocycle = {
    ...MESO, tipoBloque: 'desarrollo', hipotesis: { pectoral: { palanca: 'volumen', iemMedioObjetivo: 1, iemTecho: 99 } },
  };
  // Cuatro semanas de press, cada una con 2,5 kg más y saliendo con un 6 de cansancio.
  const logs = [0, 1, 2, 3].map((i): WorkoutLog => ({
    id: `p${i}`, athleteId: 'a@b.c', workoutId: 'w', assignmentId: 'as', mesocycleId: 'm1', date: addDays('2026-06-02', i * 7),
    completedAt: `${addDays('2026-06-02', i * 7)}T10:00:00.000Z`, cansancioAlSalir: 6,
    entries: [{ exerciseId: 'press', sets: [{ weight: 40 + i * 2.5, repsDone: 8, rir: 1 }, { weight: 40 + i * 2.5, repsDone: 8, rir: 1 }] }],
  }));
  const base = { ...BASE, meso: CON_HIPOTESIS, mesocycles: [CON_HIPOTESIS], exercises: [PRESS], logs };

  it('un bloque antiguo, sin tipo ni estrellas, no lleva hipótesis y el resto no cambia', () => {
    const c = buildCierreCompleto({ ...BASE, motorCdg: motor });
    expect(c.hipotesis).toBeNull();
    expect(c.mensaje).toBe(buildCierreCompleto(BASE).mensaje);
  });

  it('sin motor CDG el cierre sale igual, sin veredictos y diciéndolo', () => {
    const sin = buildCierreCompleto(base);
    const con = buildCierreCompleto({ ...base, motorCdg: motor });
    expect(sin.hipotesis).toMatchObject({ sinMotor: true, veredictos: [], estrellas: ['pectoral'], cansancioMedio: 6 });
    expect(sin.mensaje).toBe(con.mensaje);
    expect(sin.cierre.progresion).toEqual(con.cierre.progresion);
    expect(sin.conclusiones).toEqual(con.conclusiones);
  });

  it('con motor da un veredicto por hipótesis, con la progresión del propio cierre, y la ficha del método', () => {
    const c = buildCierreCompleto({ ...base, motorCdg: motor, bodyweightLogs: PESOS });
    const h = c.hipotesis!;
    expect(h.sinMotor).toBe(false);
    expect(h.veredictos).toHaveLength(1);
    expect(h.veredictos[0]).toMatchObject({ zona: 'pectoral', palanca: 'volumen', procesoCumplido: true, lectura: 'confirmada' });
    expect(h.veredictos[0].rmPct).toBe(c.cierre.progresion.ejercicios.find(e => e.exerciseId === 'press')!.deltaPct);
    expect(h.estado?.porZona.pectoral?.iemFinal).toBeGreaterThan(0);
    expect(h.ficha).toEqual({ cansancioMedio: 6, pesoDeltaKg: c.evolucion.peso!.deltaKg });
  });
});
