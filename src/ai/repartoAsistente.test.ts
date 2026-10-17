import { describe, it, expect } from 'vitest';
import { MUSCLE_ORDER, type MuscleGroup, type MuscleGroupConfig, type Mesocycle } from '../types';
import {
  repartoDesdeAsistente, repartoParaAsistente, diasSemanaDesdeAsistente, calcularRepartoParaAsistente, sesionesDelReparto,
} from './repartoAsistente';
import { validateMesocyclePayload } from './validators';
import { distribucionDeMeso } from '../utils/distribucionDeMeso';
import { frecuenciaPorDefecto } from '../utils/calculadoraReparto';

const grupos = (series: Partial<Record<MuscleGroup, number>>) =>
  Object.fromEntries(MUSCLE_ORDER.map(g => [g, { series: series[g] ?? 0, priority: 'media' }])) as Record<MuscleGroup, MuscleGroupConfig>;

describe('repartoDesdeAsistente', () => {
  it('traduce los descansos a null y valida los grupos', () => {
    const { reparto, issues } = repartoDesdeAsistente({
      nombre: 'PPL', dias: [{ tipo: 'Empuje', grupos: ['pecho', 'triceps'] }, { tipo: 'descanso' }, { tipo: 'Tirón', grupos: ['dorsal'] }],
      frecuencias: { pecho: 1.5, inventado: 2 },
    });
    expect(issues).toEqual([]);
    expect(reparto!.dias).toEqual([{ tipo: 'Empuje', grupos: ['pecho', 'triceps'] }, null, { tipo: 'Tirón', grupos: ['dorsal'] }]);
    expect(reparto!.frecuencias).toEqual({ pecho: 1.5 });
    expect(sesionesDelReparto(reparto!)).toBe(2);
  });

  it('sin reparto no es un error', () => {
    expect(repartoDesdeAsistente(undefined)).toEqual({ reparto: null, issues: [] });
  });

  it('dice todo lo que falla de una vez', () => {
    const { reparto, issues } = repartoDesdeAsistente({ dias: [{ tipo: '', grupos: ['pechote'] }, { tipo: 'Descanso' }] });
    expect(reparto).toBeNull();
    const textos = issues.map(i => i.message).join(' | ');
    expect(textos).toMatch(/no tiene nombre/);
    expect(textos).toMatch(/Grupos inválidos en el día 1: pechote/);
    expect(textos).toMatch(/no entrena ningún grupo/);
  });

  it('ida y vuelta con lo que devuelve la calculadora', () => {
    const r = calcularRepartoParaAsistente({
      diasSemana: [0, 1, 2, 4, 5],
      frecuencias: { ...Object.fromEntries(MUSCLE_ORDER.map(g => [g, 0])), pecho: 1.5, dorsal: 2, cuadriceps: 2 },
      grupos: grupos({ pecho: 12, dorsal: 12, cuadriceps: 10 }),
    });
    expect(r.cicloDias).toBe(14);
    const elegido = r.opciones[0].reparto;
    const { reparto, issues } = repartoDesdeAsistente(elegido);
    expect(issues).toEqual([]);
    expect(repartoParaAsistente(reparto!)).toEqual({ ...elegido, nombre: elegido.nombre });
    expect(sesionesDelReparto(reparto!)).toBe(10);
  });
});

describe('diasSemanaDesdeAsistente', () => {
  it('acepta letras, nombres con o sin tilde y números', () => {
    expect(diasSemanaDesdeAsistente(['L', 'x', 'miércoles', 'Sábado', 4, 'nada'])).toEqual([0, 2, 4, 5]);
  });
});

describe('calcularRepartoParaAsistente con el reparto actual', () => {
  it('incluye cómo está hoy el atleta frente a lo que se pide', () => {
    const meso: Mesocycle = {
      id: 'm', athleteId: 'a', number: 1, weeks: 4, startDate: '2026-10-19', objective: '', daysPerWeek: 4,
      splitId: '4-torso-pierna-x2', groups: grupos({ pecho: 12, cuadriceps: 10 }),
    };
    const frecuencias = Object.fromEntries(MUSCLE_ORDER.map(g => [g, frecuenciaPorDefecto(meso.groups[g].series)]));
    const r = calcularRepartoParaAsistente({ diasSemana: [0, 1, 3, 4], frecuencias: { ...frecuencias, pecho: 1.5 }, grupos: meso.groups }, meso);
    expect(r.repartoActual?.frecuenciasQueNoCumple).toContain('Pecho: 2× (pides 1.5×)');
    expect(r.opciones.some(o => o.mejorEncaje)).toBe(true);
  });
});

describe('un mesociclo propuesto con reparto de 14 días', () => {
  it('admite 10 sesiones por ciclo y sale con su distribución exacta', () => {
    expect(validateMesocyclePayload({ weeks: 6, daysPerWeek: 10, objective: 'x', groups: { pecho: { series: 12 } } })).toEqual([]);
    expect(validateMesocyclePayload({ weeks: 6, daysPerWeek: 15, objective: 'x', groups: { pecho: { series: 12 } } })[0].field).toBe('daysPerWeek');

    const { reparto } = repartoDesdeAsistente({
      dias: [{ tipo: 'Pecho', grupos: ['pecho'] }, { tipo: 'Descanso' }, { tipo: 'Pecho', grupos: ['pecho'] }, { tipo: 'Descanso' },
        { tipo: 'Pecho', grupos: ['pecho'] }, { tipo: 'Descanso' }, { tipo: 'Descanso' },
        { tipo: 'Descanso' }, { tipo: 'Descanso' }, { tipo: 'Descanso' }, { tipo: 'Descanso' }, { tipo: 'Descanso' }, { tipo: 'Descanso' }, { tipo: 'Descanso' }],
      frecuencias: { pecho: 1.5 },
    });
    const meso: Mesocycle = {
      id: '', athleteId: 'a', number: 1, weeks: 6, startDate: '2026-10-19', objective: 'x', daysPerWeek: 3, cycleDays: 14,
      groups: grupos({ pecho: 12 }), reparto: reparto!,
    };
    const d = distribucionDeMeso(meso);
    expect(d.days.map(x => x.assignments.find(a => a.group === 'pecho')?.series)).toEqual([8, 8, 8]);
  });
});
