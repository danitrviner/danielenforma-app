import { describe, it, expect } from 'vitest';
import { MUSCLE_ORDER, type Mesocycle, type MuscleGroup, type MuscleGroupConfig } from '../types';
import { etapaDesdeMeso, mesoDesdeEtapa, mesoDeAtletaDesdeEtapa, plantillaDesdeMeso, rutinasDeMesoDePlantilla, LUNES_DE_PLANTILLA } from './plantillaMeso';
import { buildSnapshot } from './repartoDesactualizado';

const grupos = Object.fromEntries(MUSCLE_ORDER.map(g => [g, { series: g === 'pecho' ? 12 : 0, priority: 'media' }])) as Record<MuscleGroup, MuscleGroupConfig>;

const MESO: Mesocycle = {
  id: 'm1', athleteId: 'atleta@enforma.com', number: 3, weeks: 6, startDate: '2026-10-19',
  name: 'Fuerza invierno', objective: 'Hipertrofia torso', daysPerWeek: 3, cycleDays: 14,
  groups: grupos,
  reparto: {
    nombre: 'PPL', frecuencias: { pecho: 1.5 },
    dias: [{ tipo: 'Empuje', grupos: ['pecho'] }, null, { tipo: 'Tirón', grupos: ['dorsal'] }, null, { tipo: 'Pierna', grupos: ['cuadriceps'] }, null, null,
      null, null, null, null, null, null, null],
  },
  distribution: { days: [{ assignments: [{ group: 'pecho', series: 8 }], totalSeries: 8, dayType: 'Empuje' }], overloadAlert: false, snapshot: { daysPerWeek: 3, groupSeries: {} }, generatedAt: 'x' },
  phaseType: 'hipertrofia',
  nombresSesion: ['Empuje pesado', '', ''],
  ejerciciosClave: ['d0::banca'],
  notasSemana: { '2': 'subo carga' },
  semanasDescarga: [6], deloadWeek: 6, semanasTest: [5],
  days: [{ id: 'd1', name: 'Empuje', exercises: [{ exerciseId: 'banca', order: 0, sets: 3, reps: '6-8', rir: 2, restSeconds: 120 }] }],
};

describe('meso → etapa → meso', () => {
  it('no pierde nada del plan', () => {
    const etapa = etapaDesdeMeso(MESO, { id: 'st1' });
    expect(etapa.name).toBe('Fuerza invierno');
    expect(etapa.objective).toBe('Hipertrofia torso');
    const vuelta = mesoDesdeEtapa(etapa, { id: 'm2', athleteId: 'otro@enforma.com', number: 1, startDate: LUNES_DE_PLANTILLA }, true);
    for (const k of ['weeks', 'daysPerWeek', 'cycleDays', 'groups', 'reparto', 'distribution', 'phaseType',
      'nombresSesion', 'ejerciciosClave', 'notasSemana', 'semanasDescarga', 'deloadWeek', 'semanasTest', 'days', 'objective', 'name'] as const) {
      expect(vuelta[k], k).toEqual(MESO[k]);
    }
    expect(vuelta.athleteId).toBe('otro@enforma.com');
  });

  it('copia, no comparte: tocar la etapa no toca el mesociclo', () => {
    const etapa = etapaDesdeMeso(MESO, { id: 'st1' });
    etapa.reparto!.dias[0]!.grupos.push('triceps');
    etapa.days![0].exercises[0].sets = 9;
    expect(MESO.reparto!.dias[0]!.grupos).toEqual(['pecho']);
    expect(MESO.days![0].exercises[0].sets).toBe(3);
  });

  it('al aplicar a un atleta el bloque no toma el nombre de la etapa (sigue siendo «Meso #N»)', () => {
    const meso = mesoDesdeEtapa(etapaDesdeMeso(MESO, { id: 'st1' }), { id: 'm9', athleteId: 'a@b.c', number: 4, startDate: '2026-11-02' });
    expect(meso.name).toBeUndefined();
    expect(meso.objective).toBe('Hipertrofia torso');
  });

  it('una etapa antigua (solo volumen y días) sigue abriendo', () => {
    const meso = mesoDesdeEtapa({ id: 's', name: 'Mesociclo 1', weeks: 4, daysPerWeek: 4, groups: grupos }, { id: 'x', athleteId: '', number: 1, startDate: LUNES_DE_PLANTILLA });
    expect(meso.objective).toBe('Mesociclo 1');
    expect(meso.reparto).toBeUndefined();
    expect(meso.days).toBeUndefined();
  });

  it('las revisiones de la etapa se conservan si se pasan', () => {
    const etapa = etapaDesdeMeso({ ...MESO, distribution: { ...MESO.distribution!, snapshot: buildSnapshot(MESO) } },
      { id: 'st', revisiones: { reviewCadenceWeeks: 2, reviewType: 'revision' } });
    expect(etapa.reviewCadenceWeeks).toBe(2);
  });
});

describe('mesociclo del atleta → plantilla de biblioteca', () => {
  const DEL_ATLETA: Mesocycle = {
    ...MESO,
    programId: 'prog_1', programOrder: 0,
    eventosSemana: { '3': { tipo: 'vacaciones' } },
    vuelveDeParon: true,
    draft: { pecho: ['banca'] },
    cdgActitud: 'agresivo',
  };
  const DIAS = [{ id: 'd1', name: 'Empuje', exercises: [{
    exerciseId: 'banca', order: 0, sets: 3, reps: '6-8', rir: 2, restSeconds: 120,
    weeklyProgression: [{ atWeek: 3, addSets: 1, setRir: 1 }],
  }] }];

  it('copia el plan y el nombre, y nada del atleta', () => {
    const tpl = plantillaDesdeMeso(DEL_ATLETA, { ownerId: 'coachUid', etapaId: 'st1', dias: DIAS });
    expect(tpl.ownerId).toBe('coachUid');
    expect(tpl.name).toBe('Fuerza invierno');
    expect(tpl.stages).toHaveLength(1);
    const etapa = tpl.stages[0];
    expect(etapa.days).toEqual(DIAS);
    expect(etapa.days).not.toBe(DIAS);
    expect(etapa.days![0].exercises[0].weeklyProgression).toEqual([{ atWeek: 3, addSets: 1, setRir: 1 }]);
    expect(etapa.weeks).toBe(6);
    expect(etapa.reparto?.nombre).toBe('PPL');
    expect(etapa.semanasTest).toEqual([5]);
    const texto = JSON.stringify(tpl);
    for (const delAtleta of ['atleta@enforma.com', '2026-10-19', 'prog_1', 'vacaciones', 'agresivo', 'vuelveDeParon', 'draft']) {
      expect(texto).not.toContain(delAtleta);
    }
  });

  it('el nombre que pone el coach manda; vacío, el del mesociclo o «Meso #N»', () => {
    expect(plantillaDesdeMeso(MESO, { ownerId: 'c', etapaId: 's', nombre: '  PPL 3 días ' }).name).toBe('PPL 3 días');
    expect(plantillaDesdeMeso({ ...MESO, name: undefined }, { ownerId: 'c', etapaId: 's', nombre: ' ' }).name).toBe('Meso #3');
  });

  it('aplicada a otro atleta, le llega el mismo plan', () => {
    const tpl = plantillaDesdeMeso(DEL_ATLETA, { ownerId: 'c', etapaId: 's', dias: DIAS });
    const meso = mesoDesdeEtapa(tpl.stages[0], { id: 'm2', athleteId: 'otro@enforma.com', number: 1, startDate: '2026-11-09' });
    expect(meso.athleteId).toBe('otro@enforma.com');
    expect(meso.days).toEqual(DIAS);
    expect(meso.eventosSemana).toBeUndefined();
    expect(meso.cdgActitud).toBeUndefined();
  });
});

describe('plantilla aplicada a un atleta: llega terminada', () => {
  const DIAS = [{ id: 'd1', name: 'Empuje', exercises: [{
    exerciseId: 'banca', order: 0, sets: 3, reps: '6-8', rir: 2, restSeconds: 120,
  }] }];
  it('las rutinas de los días hechos nacen con su sesión, sin asignar', () => {
    const tpl = plantillaDesdeMeso(MESO, { ownerId: 'c', etapaId: 's', dias: DIAS });
    const meso = mesoDeAtletaDesdeEtapa(tpl.stages[0], { id: 'm9', athleteId: 'otro@enforma.com', number: 1, startDate: '2026-11-09' });
    const rutinas = rutinasDeMesoDePlantilla(meso, { ownerId: 'coachUid', athleteName: 'Ander' });
    expect(rutinas).toHaveLength(Math.min(DIAS.length, meso.daysPerWeek));
    expect(rutinas.map(r => r.dayIndex)).toEqual(rutinas.map((_, i) => i));
    expect(rutinas.every(r => r.mesocycleId === 'm9' && r.ownerId === 'coachUid')).toBe(true);
    expect(rutinas[0].exercises).toEqual(DIAS[0].exercises);
    expect(rutinas[0].exercises).not.toBe(DIAS[0].exercises);
    // El nombre propio de la sesión manda sobre el del día.
    expect(rutinas[0].name).toBe('Empuje pesado · Ander · Meso #1');
  });

  it('sin ejercicios en la plantilla no inventa rutinas', () => {
    const meso = mesoDeAtletaDesdeEtapa({ id: 's', name: 'Vacía', weeks: 4, daysPerWeek: 3, groups: grupos }, { id: 'm', athleteId: 'a', number: 1, startDate: '2026-11-09' });
    expect(rutinasDeMesoDePlantilla(meso, { ownerId: 'c' })).toEqual([]);
    expect(meso.distribution).toBeUndefined();
  });

  it('plantilla vieja con ejercicios y sin distribución: se calcula al aplicarla', () => {
    const etapa = { ...etapaDesdeMeso(MESO, { id: 's', dias: DIAS }), distribution: undefined };
    const meso = mesoDeAtletaDesdeEtapa(etapa, { id: 'm', athleteId: 'a', number: 1, startDate: '2026-11-09' });
    expect(meso.distribution?.days.length).toBe(meso.daysPerWeek);
  });

  it('con distribución guardada, se respeta la de la plantilla', () => {
    const tpl = plantillaDesdeMeso(MESO, { ownerId: 'c', etapaId: 's', dias: DIAS });
    const meso = mesoDeAtletaDesdeEtapa(tpl.stages[0], { id: 'm', athleteId: 'a', number: 1, startDate: '2026-11-09' });
    expect(meso.distribution).toEqual(MESO.distribution);
  });
});
