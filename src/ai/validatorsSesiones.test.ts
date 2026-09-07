import { describe, it, expect } from 'vitest';
import { validateWorkoutDays, validateLevelLadder, claveDeEjercicio } from './validators';

/* Las sesiones son la única propuesta que el atleta lee el mismo día que
   entrena. Un ejercicio que no existe, un RIR de 9 o un día con 60 series no
   pueden llegar a la tarjeta de revisión: se rechazan aquí y el modelo se
   corrige solo con los issues de vuelta. */

const catalogo = [
  { id: 'e1', name: 'Press banca' },
  { id: 'e2', name: 'Press militar' },
  { id: 'e3', name: 'Remo con barra' },
];

const dia = (exercises: unknown[], day_index = 0) => ({ day_index, exercises });
const ex = (extra: Record<string, unknown> = {}) => ({ exercise: 'Press banca', sets: 4, reps: '8-10', rir: 2, ...extra });

describe('validateWorkoutDays', () => {
  it('acepta una sesión normal', () => {
    expect(validateWorkoutDays([dia([ex(), ex({ exercise: 'Remo con barra' })])], catalogo, 4)).toEqual([]);
  });

  it('acepta el nombre del ejercicio con otra caja y acentos', () => {
    expect(validateWorkoutDays([dia([ex({ exercise: '  PRESS BÁNCA ' })])], catalogo, 4)).toEqual([]);
  });

  it('rechaza un ejercicio que no existe y sugiere los parecidos', () => {
    const issues = validateWorkoutDays([dia([ex({ exercise: 'Press inclinado' })])], catalogo, 4);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('Press banca');
  });

  it('rechaza day_index fuera del mesociclo', () => {
    const issues = validateWorkoutDays([dia([ex()], 7)], catalogo, 4);
    expect(issues.some(i => i.field.endsWith('day_index'))).toBe(true);
  });

  it('rechaza dos sesiones con el mismo día', () => {
    const issues = validateWorkoutDays([dia([ex()], 1), dia([ex()], 1)], catalogo, 4);
    expect(issues.some(i => i.message.includes('repetido'))).toBe(true);
  });

  it('rechaza RIR fuera de 0-5 y series imposibles', () => {
    const issues = validateWorkoutDays([dia([ex({ rir: 9, sets: 40 })])], catalogo, 4);
    expect(issues.some(i => i.field.endsWith('.rir'))).toBe(true);
    expect(issues.some(i => i.field.endsWith('.sets'))).toBe(true);
  });

  it('rechaza un día que suma más series de las que es una sesión', () => {
    const issues = validateWorkoutDays([dia(Array.from({ length: 8 }, () => ex({ sets: 6 })))], catalogo, 4);
    expect(issues.some(i => i.message.includes('no es una sesión'))).toBe(true);
  });

  it('rechaza un día sin ejercicios', () => {
    expect(validateWorkoutDays([dia([])], catalogo, 4).some(i => i.message.includes('no tiene ejercicios'))).toBe(true);
  });
});

describe('claveDeEjercicio', () => {
  it('iguala mayúsculas, acentos y espacios de más', () => {
    expect(claveDeEjercicio('  Sentadilla   Búlgara ')).toBe('sentadilla bulgara');
  });
});

describe('validateLevelLadder', () => {
  const nivel = (name: string, criteria: unknown[]) => ({ name, criteria });

  it('acepta una escalera con criterios completos', () => {
    const issues = validateLevelLadder([
      nivel('Club', [{ kind: 'peso_perdido_kg', label: 'Perder 5 kg', target_value: 5 }]),
      nivel('Hombre Fuerte', [
        { kind: 'manual', label: '10 dominadas estrictas' },
        { kind: 'sentadilla_xbw', label: 'Sentadilla a 1.5x', target_value: 1.5, exercise_name_match: 'sentadilla' },
      ]),
    ]);
    expect(issues).toEqual([]);
  });

  it('rechaza una escalera de un solo nivel', () => {
    expect(validateLevelLadder([nivel('Club', [{ kind: 'manual', label: 'x' }])])).toHaveLength(1);
  });

  it('rechaza un nivel sin criterios: se desbloquearía solo', () => {
    const issues = validateLevelLadder([nivel('Club', []), nivel('Fuerte', [{ kind: 'manual', label: 'x' }])]);
    expect(issues.some(i => i.message.includes('se desbloquearía solo'))).toBe(true);
  });

  it('exige target_value salvo en los criterios manuales', () => {
    const issues = validateLevelLadder([
      nivel('Club', [{ kind: 'peso_perdido_kg', label: 'Perder peso' }]),
      nivel('Fuerte', [{ kind: 'manual', label: 'Dominadas' }]),
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0].field).toContain('target_value');
  });

  it('exige exercise_name_match en sentadilla_xbw', () => {
    const issues = validateLevelLadder([
      nivel('Club', [{ kind: 'sentadilla_xbw', label: 'Sentadilla 1x', target_value: 1 }]),
      nivel('Fuerte', [{ kind: 'manual', label: 'Dominadas' }]),
    ]);
    expect(issues.some(i => i.field.endsWith('exercise_name_match'))).toBe(true);
  });

  it('rechaza nombres de nivel repetidos', () => {
    const issues = validateLevelLadder([
      nivel('Club', [{ kind: 'manual', label: 'a' }]),
      nivel('club', [{ kind: 'manual', label: 'b' }]),
    ]);
    expect(issues.some(i => i.message.includes('repetido'))).toBe(true);
  });
});
