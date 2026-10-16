import { describe, it, expect } from 'vitest';
import { MUSCLE_ORDER, type Mesocycle, type MuscleGroup, type MuscleGroupConfig } from '../types';
import { etapaDesdeMeso, mesoDesdeEtapa, LUNES_DE_PLANTILLA } from './plantillaMeso';
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
