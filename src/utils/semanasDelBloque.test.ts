import { describe, expect, it } from 'vitest';
import { WorkoutExercise } from '../types';
import { resolveExerciseForWeek, resolverEjercicioDelMeso } from './progression';
import {
  programarCambio, quitarCambiosDeSemana, novedadesDeSemana, compararSemanas, seriesDeLaSemana, origenDeCambios,
  programarEnSemanas, semanasAlternas, rirDescendente, subirSeries,
} from './semanasDelBloque';

const curl: WorkoutExercise = { exerciseId: 'curl', order: 0, sets: 4, reps: '10', rir: 1, restSeconds: 75 };
const nombres: Record<string, string> = { curl: 'Curl de bíceps', inclinado: 'Curl inclinado' };
const nombreDe = (id: string) => nombres[id] ?? id;
const topBackoff = [{ label: 'Top set', sets: 1, reps: '6-8', rir: 1 }, { label: 'Back-off', sets: 3, reps: '12-15', rir: 2 }];

describe('cambios por semana', () => {
  it('un cambio desde la S3 se queda las semanas siguientes', () => {
    const reglas = programarCambio(curl, 3, false, { ...curl, setGroups: topBackoff });
    const we = { ...curl, weeklyProgression: reglas };
    expect(resolveExerciseForWeek(we, 2).setGroups).toBeUndefined();
    expect(resolveExerciseForWeek(we, 3).setGroups).toEqual(topBackoff);
    expect(resolveExerciseForWeek(we, 8).setGroups).toEqual(topBackoff);
    expect(resolveExerciseForWeek(we, 8).sets).toBe(4);
  });

  it('«solo esta semana» vuelve a lo anterior la siguiente', () => {
    const we = { ...curl, weeklyProgression: programarCambio(curl, 5, true, { ...curl, reps: '15-20' }) };
    expect(resolveExerciseForWeek(we, 5).reps).toBe('15-20');
    expect(resolveExerciseForWeek(we, 6).reps).toBe('10');
  });

  it('los cambios se acumulan: el de la S6 no borra el de la S3', () => {
    let we: WorkoutExercise = { ...curl, weeklyProgression: programarCambio(curl, 3, false, { ...curl, restSeconds: 90 }) };
    we = { ...we, weeklyProgression: programarCambio(we, 6, false, { ...resolveExerciseForWeek(we, 6), exerciseId: 'inclinado' }) };
    const s7 = resolveExerciseForWeek(we, 7);
    expect(s7.restSeconds).toBe(90);
    expect(s7.exerciseId).toBe('inclinado');
  });

  it('volver al valor anterior quita el cambio en vez de guardar uno vacío', () => {
    const we = { ...curl, weeklyProgression: programarCambio(curl, 3, false, { ...curl, sets: 5 }) };
    expect(programarCambio(we, 3, false, { ...curl, sets: 4 })).toBeUndefined();
  });

  it('volver a un solo rango se guarda como quitar los bloques', () => {
    let we: WorkoutExercise = { ...curl, weeklyProgression: programarCambio(curl, 3, false, { ...curl, setGroups: topBackoff }) };
    const s5 = resolveExerciseForWeek(we, 5);
    const { setGroups: _quitado, ...sinBloques } = s5;
    we = { ...we, weeklyProgression: programarCambio(we, 5, false, { ...sinBloques, sets: 3, reps: '10' }) };
    expect(resolveExerciseForWeek(we, 4).setGroups).toEqual(topBackoff);
    expect(resolveExerciseForWeek(we, 5).setGroups).toBeUndefined();
    expect(resolveExerciseForWeek(we, 5).sets).toBe(3);
  });

  it('los escalones de siempre siguen funcionando igual encima de los cambios', () => {
    const we: WorkoutExercise = { ...curl, weeklyProgression: [
      { atWeek: 4, addSets: 1 },
      ...programarCambio(curl, 3, false, { ...curl, restSeconds: 90 })!,
    ] };
    expect(resolveExerciseForWeek(we, 3)).toMatchObject({ sets: 4, restSeconds: 90 });
    expect(resolveExerciseForWeek(we, 4)).toMatchObject({ sets: 5, restSeconds: 90 });
  });

  it('quitar cambios de una semana no toca los escalones del chip Progresión', () => {
    const we: WorkoutExercise = { ...curl, weeklyProgression: [
      { atWeek: 3, addSets: 1 },
      ...programarCambio(curl, 3, false, { ...curl, restSeconds: 90 })!,
    ] };
    expect(quitarCambiosDeSemana(we, 3)).toEqual([{ atWeek: 3, addSets: 1 }]);
  });

  it('marca desde qué semana viene cada campo', () => {
    const we = { ...curl, weeklyProgression: programarCambio(curl, 3, false, { ...curl, restSeconds: 90 }) };
    expect(origenDeCambios(we, 2)).toEqual({});
    expect(origenDeCambios(we, 6)).toEqual({ restSeconds: 'S3' });
  });
});

describe('descarga', () => {
  const meso = { semanasDescarga: [10] };
  it('la semana de descarga hace la mitad de series, redondeando hacia arriba', () => {
    expect(resolverEjercicioDelMeso({ ...curl, sets: 3 }, meso, 10).sets).toBe(2);
    expect(resolverEjercicioDelMeso(curl, meso, 9).sets).toBe(4);
  });
  it('con bloques, cada bloque a la mitad (nunca menos de 1)', () => {
    const we = { ...curl, setGroups: topBackoff };
    expect(resolverEjercicioDelMeso(we, meso, 10).setGroups!.map(g => g.sets)).toEqual([1, 2]);
  });
  it('cuenta las series reales de la semana', () => {
    expect(seriesDeLaSemana([{ we: curl, dia: 'D1' }], meso, 9)).toBe(4);
    expect(seriesDeLaSemana([{ we: curl, dia: 'D1' }], meso, 10)).toBe(2);
  });
});

describe('novedades y comparar', () => {
  const we = { ...curl, weeklyProgression: programarCambio(curl, 3, false, { ...curl, setGroups: topBackoff }) };
  const ej = [{ we, dia: 'Día 1' }];
  it('avisa del cambio la semana en que entra, y no la siguiente', () => {
    const s3 = novedadesDeSemana(ej, {}, 3, nombreDe);
    expect(s3.cambios).toEqual([{ dia: 'Día 1', ejercicio: 'Curl de bíceps', cambios: ['Top set 1×6-8 + Back-off 3×12-15'] }]);
    expect(novedadesDeSemana(ej, {}, 4, nombreDe).cambios).toEqual([]);
  });
  it('la descarga se avisa una vez, sin listar cada ejercicio', () => {
    const n = novedadesDeSemana(ej, { semanasDescarga: [5] }, 5, nombreDe);
    expect(n.descarga).toBe(true);
    expect(n.cambios).toEqual([]);
    expect(novedadesDeSemana(ej, { semanasDescarga: [5] }, 6, nombreDe).vuelveElVolumen).toBe(true);
  });
  it('compara dos semanas cualesquiera', () => {
    expect(compararSemanas(ej, 1, 8, nombreDe)[0].cambios).toHaveLength(1);
    expect(compararSemanas(ej, 4, 8, nombreDe)).toEqual([]);
  });
});

describe('progresiones en un clic y rotación A/B', () => {
  it('RIR 3 → 0 repartido por el bloque, saltando la descarga', () => {
    const we = { ...curl, weeklyProgression: rirDescendente(curl, 5, 3, 0, [5]) };
    expect([1, 2, 3, 4].map(s => resolveExerciseForWeek(we, s).rir)).toEqual([3, 2, 1, 0]);
  });
  it('con bloques, todos se mueven igual que el primero', () => {
    const conBloques = { ...curl, setGroups: topBackoff };
    const we = { ...conBloques, weeklyProgression: rirDescendente(conBloques, 2, 3, 1) };
    expect(resolveExerciseForWeek(we, 1).setGroups!.map(g => g.rir)).toEqual([3, 4]);
    expect(resolveExerciseForWeek(we, 2).setGroups!.map(g => g.rir)).toEqual([1, 2]);
  });
  it('+1 serie cada 2 semanas hasta la S6', () => {
    const we = { ...curl, weeklyProgression: subirSeries(curl, 2, 6) };
    expect([1, 2, 3, 4, 5, 6, 7].map(s => resolveExerciseForWeek(we, s).sets)).toEqual([4, 4, 5, 5, 6, 6, 6]);
  });
  it('rotación A/B: otro ejercicio en S2, S4, S6', () => {
    const we = { ...curl, weeklyProgression: programarEnSemanas(curl, semanasAlternas(2, 6), true, r => ({ ...r, exerciseId: 'inclinado' })) };
    expect([1, 2, 3, 4, 5, 6].map(s => resolveExerciseForWeek(we, s).exerciseId))
      .toEqual(['curl', 'inclinado', 'curl', 'inclinado', 'curl', 'inclinado']);
  });
  it('semana de test y evento salen en las novedades', () => {
    const n = novedadesDeSemana([{ we: curl, dia: 'D1' }], { semanasTest: [4], eventosSemana: { '4': { tipo: 'vacaciones', nota: 'Hotel' } } }, 4, nombreDe);
    expect(n.test).toBe(true);
    expect(n.evento).toEqual({ tipo: 'vacaciones', nota: 'Hotel' });
    expect(resolverEjercicioDelMeso(curl, { semanasTest: [4] }, 4).technique).toBe('amrap');
  });
});
