import { describe, expect, it } from 'vitest';
import type { WorkoutAssignment } from '../types';
import { adherenciaDeMesociclo, asignacionesDeMesociclo } from './adherence';

const asig = (date: string, status: WorkoutAssignment['status'], mesocycleId = 'm1'): WorkoutAssignment => ({
  id: `a-${date}`, workoutId: 'w', athleteId: 'uid', date, status, mesocycleId,
});

// Bloque de 8 semanas a 2 sesiones: 16 asignaciones. Hoy es martes de la
// semana 2 (2026-06-09) y el atleta ha hecho las tres que han tocado.
const BLOQUE: WorkoutAssignment[] = Array.from({ length: 8 }, (_, s) => {
  const lunes = new Date(2026, 5, 1 + s * 7), jueves = new Date(2026, 5, 4 + s * 7);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return [iso(lunes), iso(jueves)];
}).flat().map(date => asig(date, date <= '2026-06-08' ? 'completed' : 'pending'));

describe('adherenciaDeMesociclo con el bloque en curso (F3)', () => {
  it('sin fecha de corte divide por todo el bloque: la cifra de siempre para un bloque terminado', () => {
    expect(adherenciaDeMesociclo(BLOQUE, 'm1')).toBe(19); // 3 de 16
  });

  it('con fecha de corte solo cuentan las sesiones que ya han tocado', () => {
    expect(adherenciaDeMesociclo(BLOQUE, 'm1', '2026-06-09')).toBe(100); // 3 de 3
    expect(asignacionesDeMesociclo(BLOQUE, 'm1', '2026-06-09')).toHaveLength(3);
  });

  it('una sesión vencida sin hacer sí baja la cifra; la de hoy todavía no', () => {
    const conFallo = BLOQUE.map(a => (a.date === '2026-06-04' ? { ...a, status: 'perdido' as const } : a));
    expect(adherenciaDeMesociclo(conFallo, 'm1', '2026-06-09')).toBe(67); // 2 de 3
    // El jueves 11, por la mañana, la sesión de ese día aún no cuenta como fallada.
    expect(adherenciaDeMesociclo(BLOQUE, 'm1', '2026-06-11')).toBe(100);
    // Al día siguiente, si sigue sin hacerse, sí.
    expect(adherenciaDeMesociclo(BLOQUE, 'm1', '2026-06-12')).toBe(75); // 3 de 4
  });

  it('una sesión adelantada y completada cuenta aunque su fecha sea futura', () => {
    const adelantada = BLOQUE.map(a => (a.date === '2026-06-11' ? { ...a, status: 'completed' as const } : a));
    expect(adherenciaDeMesociclo(adelantada, 'm1', '2026-06-09')).toBe(100); // 4 de 4
    expect(asignacionesDeMesociclo(adelantada, 'm1', '2026-06-09')).toHaveLength(4);
  });

  it('si aún no ha tocado ninguna, no hay un 0 %: no se sabe', () => {
    expect(adherenciaDeMesociclo(BLOQUE.map(a => ({ ...a, status: 'pending' as const })), 'm1', '2026-06-01')).toBeNull();
  });
});
