import { describe, it, expect } from 'vitest';
import { buildNarrativeIntro } from './reportNarrative';
import { TrainingReport } from './trainingReport';

// Construye un TrainingReport mínimo válido; los tests solo sobreescriben los
// campos relevantes para el caso que están probando.
function baseTraining(overrides: Partial<TrainingReport> = {}): TrainingReport {
  return {
    generatedAt: '2026-07-11T00:00:00.000Z',
    periodStart: '2026-07-05',
    periodEnd: '2026-07-11',
    comparisonLabel: 'vs la semana anterior',
    sessions: 3,
    tonnage: { current: 5000, previous: 4500, deltaPct: 11.1 },
    perExercise: [],
    muscleGroups: [],
    highlights: [],
    ...overrides,
  };
}

describe('buildNarrativeIntro', () => {
  it('devuelve un mensaje de reenganche cuando no hay sesiones', () => {
    const msg = buildNarrativeIntro({ athleteName: 'Marta', training: baseTraining({ sessions: 0 }) });
    expect(msg).toContain('Marta');
    expect(msg.toLowerCase()).toMatch(/no tengo registros|no me consta/);
  });

  it('menciona el nombre de pila, el tonelaje y pluraliza bien las sesiones', () => {
    const msg = buildNarrativeIntro({ athleteName: 'Marta García', training: baseTraining() });
    expect(msg).toContain('Marta');
    expect(msg).toContain('5000');
    expect(msg).toContain('3 sesiones');
    expect(msg).not.toContain('sesiónes');
  });

  it('destaca los récords personales cuando los hay', () => {
    const training = baseTraining({
      perExercise: [{
        exerciseId: 'e1', name: 'Press banca', sets: 4, reps: 32, tonnage: 800,
        bestOrm: 100, prevBestOrm: 95, deltaOrmPct: 5.3, isPR: true,
      }],
    });
    const msg = buildNarrativeIntro({ athleteName: 'Juan', training });
    expect(msg).toContain('Press banca');
    expect(msg).toContain('100');
    expect(msg).toMatch(/récord/i);
  });

  it('incluye el peso corporal cuando se mueve hacia el objetivo', () => {
    const training = baseTraining();
    const msg = buildNarrativeIntro({
      athleteName: 'Ana', training,
      bodyweight: { startWeight: 70, endWeight: 69, deltaKg: -1, targetWeight: 65, towardsTarget: true, entries: 2 },
    });
    expect(msg).toContain('69');
  });

  it('incluye la constancia de sesiones cuando hay assignments', () => {
    const training = baseTraining();
    const msg = buildNarrativeIntro({
      athleteName: 'Ana', training,
      adherence: { planned: 4, completed: 4, pct: 100, prevPct: 75 },
    });
    expect(msg).toMatch(/4 de 4|todas las sesiones/);
  });

  it('incluye el reto conseguido cuando lo hay', () => {
    const training = baseTraining();
    const msg = buildNarrativeIntro({
      athleteName: 'Ana', training,
      challenges: { items: [{ title: 'Reto pasos', status: 'conseguido', target: 8000, unit: 'pasos', progressValue: 8500 }] },
    });
    expect(msg).toContain('Reto pasos');
  });

  it('sin nombre de atleta usa un genérico en vez de romper', () => {
    const msg = buildNarrativeIntro({ athleteName: '', training: baseTraining({ sessions: 0 }) });
    expect(msg.length).toBeGreaterThan(0);
  });
});
