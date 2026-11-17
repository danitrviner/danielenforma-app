import { describe, expect, it } from 'vitest';
import {
  Exercise, Mesocycle, MuscleGroup, MuscleGroupConfig, WorkoutAssignment, WorkoutLog, MUSCLE_ORDER,
} from '../types';
import { buildCierreMesociclo, semanasDeCalendarioEnDescarga } from './cierreMesociclo';

const grupos = (parcial: Partial<Record<MuscleGroup, number>>): Record<MuscleGroup, MuscleGroupConfig> =>
  Object.fromEntries(MUSCLE_ORDER.map(g => [g, { series: parcial[g] ?? 0, priority: 'media' as const }])) as Record<MuscleGroup, MuscleGroupConfig>;

const meso = (over: Partial<Mesocycle> = {}): Mesocycle => ({
  id: 'm2', athleteId: 'a@b.c', number: 2, weeks: 4, startDate: '2026-06-01',
  objective: 'Hipertrofia', daysPerWeek: 4, groups: grupos({ pecho: 10, dorsal: 10 }),
  ...over,
});

const ex = (id: string, name: string, muscleGroup: MuscleGroup): Exercise => ({
  id, ownerId: 'coach', name, primaryFocus: '', muscleGroup, type: 'fuerza', isCustom: false,
});

const EJERCICIOS = [ex('press', 'Press banca', 'pecho'), ex('remo', 'Remo con barra', 'dorsal')];

const log = (date: string, exerciseId: string, series: { weight: number; repsDone: number }[]): WorkoutLog => ({
  id: `l-${date}-${exerciseId}`, athleteId: 'a@b.c', workoutId: 'w', assignmentId: 'as',
  date, completedAt: `${date}T10:00:00.000Z`,
  entries: [{ exerciseId, sets: series.map(s => ({ ...s, rir: 2 })) }],
});

const asig = (date: string, status: WorkoutAssignment['status']): WorkoutAssignment => ({
  id: `a-${date}`, workoutId: 'w', athleteId: 'uid', date, status, mesocycleId: 'm2',
});

describe('buildCierreMesociclo', () => {
  it('acota la ventana al mesociclo: semanas × 7 días desde su inicio', () => {
    const c = buildCierreMesociclo({
      meso: meso(), mesocycles: [meso()], logs: [], assignments: [], exercises: EJERCICIOS, hoy: '2026-07-15',
    });
    expect(c.inicio).toBe('2026-06-01');
    expect(c.fin).toBe('2026-06-28'); // 4 semanas = 28 días, el último es el 28
    expect(c.enCurso).toBe(false);
  });

  it('marca el mesociclo como en curso si hoy cae dentro', () => {
    const c = buildCierreMesociclo({
      meso: meso(), mesocycles: [meso()], logs: [], assignments: [], exercises: EJERCICIOS, hoy: '2026-06-10',
    });
    expect(c.enCurso).toBe(true);
  });

  it('calcula la adherencia sobre las asignaciones del propio mesociclo', () => {
    const c = buildCierreMesociclo({
      meso: meso(), mesocycles: [meso()], logs: [], exercises: EJERCICIOS, hoy: '2026-07-15',
      assignments: [
        asig('2026-06-01', 'completed'),
        asig('2026-06-02', 'completed'),
        asig('2026-06-03', 'perdido'),
        asig('2026-06-04', 'pending'),
        { ...asig('2026-06-05', 'completed'), mesocycleId: 'otro' }, // de otro meso: no cuenta
      ],
    });
    expect(c.sesiones.programadas).toBe(4);
    expect(c.sesiones.completadas).toBe(2);
    expect(c.sesiones.adherenciaPct).toBe(50);
  });

  it('sin asignaciones no inventa un 0% de adherencia', () => {
    const c = buildCierreMesociclo({
      meso: meso(), mesocycles: [meso()], logs: [], assignments: [], exercises: EJERCICIOS, hoy: '2026-07-15',
    });
    expect(c.sesiones.adherenciaPct).toBeNull();
  });

  it('compara volumen programado (semanales × semanas) con el realizado', () => {
    const logs = [
      log('2026-06-02', 'press', [{ weight: 80, repsDone: 8 }, { weight: 80, repsDone: 8 }]),
      log('2026-06-09', 'press', [{ weight: 82, repsDone: 8 }]),
      log('2026-06-16', 'remo', [{ weight: 60, repsDone: 10 }]),
      log('2026-07-20', 'press', [{ weight: 90, repsDone: 8 }]), // fuera de la ventana
    ];
    const c = buildCierreMesociclo({
      meso: meso(), mesocycles: [meso()], logs, assignments: [], exercises: EJERCICIOS, hoy: '2026-08-01',
    });
    const pecho = c.volumen.filas.find(f => f.group === 'pecho')!;
    expect(pecho.programadas).toBe(40); // 10 series/sem × 4 semanas
    expect(pecho.realizadas).toBe(3);   // las del 20 de julio quedan fuera
    expect(pecho.pct).toBe(8);
    expect(c.volumen.totalProgramadas).toBe(80);
    expect(c.volumen.totalRealizadas).toBe(4);
  });

  it('en curso, lo programado es lo que ya ha pasado del bloque (26-10-2026)', () => {
    const logs = [log('2026-06-02', 'press', [{ weight: 80, repsDone: 8 }, { weight: 80, repsDone: 8 }])];
    // Hoy es el día 10 del bloque: semana 2 de 4.
    const c = buildCierreMesociclo({
      meso: meso(), mesocycles: [meso()], logs, assignments: [], exercises: EJERCICIOS, hoy: '2026-06-10',
    });
    const pecho = c.volumen.filas.find(f => f.group === 'pecho')!;
    expect(pecho.programadas).toBe(20); // 10 series/sem × 2 semanas vividas, no × 4
    expect(pecho.realizadas).toBe(2);
  });

  it('un registro con mesocycleId de otro bloque no cuenta aunque caiga en las fechas', () => {
    const logs = [{ ...log('2026-06-02', 'press', [{ weight: 80, repsDone: 8 }]), mesocycleId: 'otro' }];
    const c = buildCierreMesociclo({
      meso: meso(), mesocycles: [meso()], logs, assignments: [], exercises: EJERCICIOS, hoy: '2026-08-01',
    });
    expect(c.volumen.filas.find(f => f.group === 'pecho')!.realizadas).toBe(0);
  });

  it('deja fuera los grupos sin volumen programado ni series registradas', () => {
    const c = buildCierreMesociclo({
      meso: meso(), mesocycles: [meso()], logs: [], assignments: [], exercises: EJERCICIOS, hoy: '2026-07-15',
    });
    expect(c.volumen.filas.map(f => f.group).sort()).toEqual(['dorsal', 'pecho']);
  });

  it('trae el volumen semanal del mesociclo anterior para ver la progresión', () => {
    const previo = meso({ id: 'm1', number: 1, startDate: '2026-05-01', groups: grupos({ pecho: 8, dorsal: 12 }) });
    const c = buildCierreMesociclo({
      meso: meso(), mesocycles: [previo, meso()], logs: [], assignments: [], exercises: EJERCICIOS, hoy: '2026-07-15',
    });
    expect(c.comparacion).toBe('Meso #1');
    expect(c.volumen.filas.find(f => f.group === 'pecho')!.semanalesPrevias).toBe(8);
  });

  it('sin mesociclo anterior lo dice en vez de comparar contra la nada', () => {
    const c = buildCierreMesociclo({
      meso: meso({ number: 1 }), mesocycles: [meso({ number: 1 })], logs: [], assignments: [], exercises: EJERCICIOS, hoy: '2026-07-15',
    });
    expect(c.comparacion).toBe('sin mesociclo previo');
    expect(c.volumen.filas.every(f => f.semanalesPrevias === null)).toBe(true);
  });

  it('detecta récord de 1RM estimado frente al historial anterior', () => {
    const previo = meso({ id: 'm1', number: 1, startDate: '2026-05-01' });
    const logs = [
      log('2026-05-05', 'press', [{ weight: 80, repsDone: 8 }]),  // 1RM est. ≈ 101,3
      log('2026-06-05', 'press', [{ weight: 90, repsDone: 8 }]),  // 1RM est. ≈ 114
    ];
    const c = buildCierreMesociclo({
      meso: meso(), mesocycles: [previo, meso()], logs, assignments: [], exercises: EJERCICIOS, hoy: '2026-07-15',
    });
    const press = c.informe.perExercise.find(e => e.exerciseId === 'press')!;
    expect(press.isPR).toBe(true);
    expect(c.titulares.some(t => t.includes('récord'))).toBe(true);
  });

  it('avisa de los grupos que se quedaron por debajo del 80% de lo previsto', () => {
    const logs = [log('2026-06-02', 'press', Array.from({ length: 35 }, () => ({ weight: 80, repsDone: 8 })))];
    const c = buildCierreMesociclo({
      meso: meso(), mesocycles: [meso()], logs, assignments: [], exercises: EJERCICIOS, hoy: '2026-07-15',
    });
    const aviso = c.titulares.find(t => t.startsWith('Por debajo de lo previsto'));
    expect(aviso).toContain('Dorsal (0%)');
    expect(aviso).not.toContain('Pecho');
  });

  it('el borrador para el cliente no es el mismo texto dos veces (usa sus datos)', () => {
    const c = buildCierreMesociclo({
      meso: meso(), mesocycles: [meso()], logs: [], assignments: [asig('2026-06-01', 'completed')],
      exercises: EJERCICIOS, athleteName: 'Marta López', hoy: '2026-07-15',
    });
    expect(c.resumenParaCliente).toContain('Marta');
    expect(c.resumenParaCliente).toContain('bloque 2');
    expect(c.resumenParaCliente).toContain('Hipertrofia');
  });

  it('llama al bloque por su nombre, no por «#número» (F8)', () => {
    const previo = meso({ id: 'm1', number: 1, startDate: '2026-05-01', name: 'Base de fuerza' });
    const actual = meso({ name: 'Hipertrofia 1' });
    const c = buildCierreMesociclo({
      meso: actual, mesocycles: [previo, actual], logs: [], assignments: [asig('2026-06-01', 'completed')],
      exercises: EJERCICIOS, athleteName: 'Marta', hoy: '2026-07-15',
    });
    expect(c.nombre).toBe('Hipertrofia 1');
    expect(c.comparacion).toBe('Base de fuerza');
    expect(c.resumenParaCliente).toContain('cerramos el bloque «Hipertrofia 1»');
    // Sin nombre sigue siendo «Meso #N» en pantalla.
    expect(buildCierreMesociclo({ meso: meso(), mesocycles: [meso()], logs: [], assignments: [], exercises: EJERCICIOS, hoy: '2026-07-15' }).nombre).toBe('Meso #2');
  });

  it('es determinista: dos llamadas con los mismos datos dan el mismo texto', () => {
    const args = {
      meso: meso(), mesocycles: [meso()], logs: [log('2026-06-02', 'press', [{ weight: 80, repsDone: 8 }])],
      assignments: [asig('2026-06-01', 'completed')], exercises: EJERCICIOS, hoy: '2026-07-15',
    };
    expect(buildCierreMesociclo(args).resumenParaCliente).toBe(buildCierreMesociclo(args).resumenParaCliente);
    expect(buildCierreMesociclo(args).titulares).toEqual(buildCierreMesociclo(args).titulares);
  });

  it('sin bloque anterior, cuenta la progresión dentro del propio bloque', () => {
    const logs = [
      log('2026-06-01', 'press', [{ weight: 80, repsDone: 8 }]),
      log('2026-06-22', 'press', [{ weight: 90, repsDone: 8 }]),
    ];
    const c = buildCierreMesociclo({
      meso: meso({ number: 1 }), mesocycles: [meso({ number: 1 })], logs, assignments: [], exercises: EJERCICIOS,
      athleteName: 'Marta', hoy: '2026-07-15',
    });
    expect(c.progresion.resumen).toMatchObject({ comparables: 1, mejoran: 1 });
    expect(c.titulares[0]).toMatch(/^Mejora en 1 de 1 ejercicios/);
    expect(c.titulares.some(t => t.includes('Press banca 80 kg × 8 → 90 kg × 8'))).toBe(true);
    expect(c.resumenParaCliente).toContain('· Press banca: 80 kg × 8 → 90 kg × 8');
  });

  it('compara el tonelaje con el bloque anterior por semana, no en total', () => {
    // Bloque anterior de 1 semana con 1 sesión; este de 4 semanas con 4 sesiones iguales.
    const previo = meso({ id: 'm1', number: 1, startDate: '2026-05-25', weeks: 1 });
    const sesion = [{ weight: 80, repsDone: 8 }];
    const logs = [
      log('2026-05-26', 'press', sesion),
      log('2026-06-01', 'press', sesion), log('2026-06-08', 'press', sesion),
      log('2026-06-15', 'press', sesion), log('2026-06-22', 'press', sesion),
    ];
    const c = buildCierreMesociclo({
      meso: meso(), mesocycles: [previo, meso()], logs, assignments: [], exercises: EJERCICIOS, hoy: '2026-07-15',
    });
    expect(c.informe.tonnage.deltaPct).toBe(300); // el total engaña…
    const t = c.titulares.find(x => x.startsWith('Kg movidos por semana'));
    expect(t).toContain('un 0% vs Meso #1'); // …por semana es lo mismo
    expect(t).not.toContain('300');
  });

  // ── F3: adherencia con el bloque en curso ─────────────────────────────────
  describe('adherencia con el bloque sin terminar (F3)', () => {
    // 8 semanas a 2 sesiones (lunes y jueves) = 16. Hoy, martes de la semana 2.
    const bloque = meso({ weeks: 8, daysPerWeek: 2 });
    const fechas = Array.from({ length: 8 }, (_, s) => [`2026-06-${String(1 + s * 7).padStart(2, '0')}`, `2026-06-${String(4 + s * 7).padStart(2, '0')}`])
      .flat().filter(f => f <= '2026-06-30');
    const asignaciones = [...fechas, '2026-07-02', '2026-07-06', '2026-07-09', '2026-07-13', '2026-07-16', '2026-07-20', '2026-07-23']
      .map(f => asig(f, f <= '2026-06-08' ? 'completed' : 'pending'));

    it('en la semana 2 de 8 con todo hecho da 100 %, no 19 %', () => {
      const c = buildCierreMesociclo({
        meso: bloque, mesocycles: [bloque], logs: [], assignments: asignaciones, exercises: EJERCICIOS, athleteName: 'Marta', hoy: '2026-06-09',
      });
      expect(c.enCurso).toBe(true);
      expect(c.sesiones).toMatchObject({ completadas: 3, programadas: 3, programadasEnTotal: 16, adherenciaPct: 100 });
      expect(c.titulares.find(t => t.startsWith('Lleva'))).toBe('Lleva 3 de las 3 sesiones que tocaban hasta hoy (100%); el bloque tiene 16.');
      expect(c.resumenParaCliente).toContain('Llevas 3 de las 3 sesiones que tocaban hasta hoy (100%).');
      expect(c.resumenParaCliente).not.toContain('palanca');
    });

    it('con el bloque terminado vuelve a contar todas', () => {
      const c = buildCierreMesociclo({
        meso: bloque, mesocycles: [bloque], logs: [], assignments: asignaciones, exercises: EJERCICIOS, hoy: '2026-08-15',
      });
      expect(c.enCurso).toBe(false);
      expect(c.sesiones).toMatchObject({ completadas: 3, programadas: 16, programadasEnTotal: 16, adherenciaPct: 19 });
    });
  });

  // ── F5: el bloque acaba cuando acaban sus vueltas, no en semanas × 7 ──────
  describe('fin real del bloque con ciclo distinto de 7 (F5)', () => {
    // 4 semanas con ciclo de 10 días = 3 vueltas = 30 días: acaba el 30 de junio, no el 28.
    const deDiez = meso({ cycleDays: 10 });
    const logs = [
      log('2026-06-01', 'press', [{ weight: 80, repsDone: 8 }]),
      log('2026-06-29', 'press', [{ weight: 90, repsDone: 8 }]), // día 29: fuera de 4 × 7
    ];

    it('el fin es vueltas × ciclo, y el bloque sigue en curso hasta ese día', () => {
      const c = buildCierreMesociclo({ meso: deDiez, mesocycles: [deDiez], logs, assignments: [], exercises: EJERCICIOS, hoy: '2026-06-30' });
      expect(c.fin).toBe('2026-06-30');
      expect(c.enCurso).toBe(true);
      expect(c.semanasDeCalendario).toBe(5);
      expect(buildCierreMesociclo({ meso: deDiez, mesocycles: [deDiez], logs, assignments: [], exercises: EJERCICIOS, hoy: '2026-07-01' }).enCurso).toBe(false);
    });

    it('las sesiones de los últimos días entran en la progresión', () => {
      const c = buildCierreMesociclo({ meso: deDiez, mesocycles: [deDiez], logs, assignments: [], exercises: EJERCICIOS, hoy: '2026-07-15' });
      expect(c.progresion.semanas).toHaveLength(5);
      expect(c.progresion.ejercicios[0]).toMatchObject({ lectura: '80 kg × 8 → 90 kg × 8', estado: 'mejora' });
    });

    it('con ciclo de 5 días, 8 semanas son 11 vueltas = 55 días: acaba un día antes', () => {
      const deCinco = meso({ weeks: 8, cycleDays: 5 });
      const c = buildCierreMesociclo({ meso: deCinco, mesocycles: [deCinco], logs: [], assignments: [], exercises: EJERCICIOS, hoy: '2026-07-26' });
      expect(c.fin).toBe('2026-07-25'); // 1 jun + 54 días
      expect(c.enCurso).toBe(false);
    });

    it('la descarga, que se marca por vuelta, se lee en semanas de calendario', () => {
      expect(semanasDeCalendarioEnDescarga([4], 7, 28)).toEqual([4]);          // ciclo semanal: la misma
      expect(semanasDeCalendarioEnDescarga([4], 14, 56)).toEqual([7, 8]);      // vuelta 4 de 14 días = semanas 7 y 8
      expect(semanasDeCalendarioEnDescarga([11], 5, 55)).toEqual([8]);         // vuelta 11 de 5 días = días 50-54
      expect(semanasDeCalendarioEnDescarga([], 5, 55)).toEqual([]);
      // Vuelta 3 de 10 días (días 20-29): la semana 4 (días 21-27) entera y la 5 (28-29) también.
      const conDescarga = meso({ cycleDays: 10, semanasDescarga: [3] });
      const c = buildCierreMesociclo({
        meso: conDescarga, mesocycles: [conDescarga], exercises: EJERCICIOS, assignments: [], hoy: '2026-07-15',
        logs: [
          log('2026-06-01', 'press', [{ weight: 80, repsDone: 8 }]),
          log('2026-06-15', 'press', [{ weight: 90, repsDone: 8 }]),
          log('2026-06-24', 'press', [{ weight: 60, repsDone: 8 }]), // en descarga: no es el «final»
        ],
      });
      expect(c.progresion.semanas.filter(s => s.esDescarga).map(s => s.semana)).toEqual([4, 5]);
      expect(c.progresion.ejercicios[0].final).toMatchObject({ kg: 90 });
    });
  });

  // ── F10: el mensaje no afirma más de lo que el dato permite ───────────────
  describe('textos que el dato respalda (F10)', () => {
    const cierreCon = (kgFinal: number) => buildCierreMesociclo({
      meso: meso({ number: 1 }), mesocycles: [meso({ number: 1 })], assignments: [], exercises: EJERCICIOS, athleteName: 'Marta', hoy: '2026-07-15',
      logs: [log('2026-06-01', 'press', [{ weight: 100, repsDone: 8 }]), log('2026-06-22', 'press', [{ weight: kgFinal, repsDone: 8 }])],
    });

    it('por debajo del ruido (3 %) no dice «eres más fuerte»: la fuerza se mantiene', () => {
      const c = cierreCon(102.5);
      expect(c.progresion.resumen.medianaPct).toBe(2.5);
      expect(c.resumenParaCliente).toContain('En conjunto, tu fuerza se mantiene.');
      expect(c.resumenParaCliente).not.toContain('más fuerte');
      expect(c.titulares[0]).toContain('dentro del ±3% de error de medida, la fuerza se mantiene');
    });

    it('por encima del ruido sí lo dice', () => {
      const c = cierreCon(110);
      expect(c.resumenParaCliente).toContain('de media eres un +10% más fuerte.');
      expect(c.titulares[0]).not.toContain('error de medida');
    });

    it('una caída mayor que el ruido se dice como caída', () => {
      const c = cierreCon(90);
      expect(c.resumenParaCliente).toContain('tu fuerza estimada baja un 10%');
      expect(c.resumenParaCliente).not.toContain('se mantiene');
    });

    it('si mueve menos kg que en el bloque anterior, no explica por qué', () => {
      const previo = meso({ id: 'm1', number: 1, startDate: '2026-05-04', weeks: 4 });
      const c = buildCierreMesociclo({
        meso: meso(), mesocycles: [previo, meso()], assignments: [], exercises: EJERCICIOS, hoy: '2026-07-15',
        logs: [
          log('2026-05-05', 'press', [{ weight: 100, repsDone: 10 }, { weight: 100, repsDone: 10 }]),
          log('2026-06-02', 'press', [{ weight: 100, repsDone: 10 }]),
        ],
      });
      const linea = c.resumenParaCliente.split('\n').find(l => l.startsWith('En total has movido'))!;
      expect(linea).toContain('un -50% respecto al bloque anterior.');
      expect(c.resumenParaCliente).not.toMatch(/tocaba|no iba de acumular/);
    });
  });
});
