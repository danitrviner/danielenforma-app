import { describe, it, expect } from 'vitest';
import {
  POLITICA_POR_DEFECTO, NIVEL_DESTINO, NUNCA_AUTOMATICO, nivelDe, politicaEfectiva, politicaDeEpisodio,
  tipoDeDecision, evaluarSubida, estadisticasPorTipo, normalizarPolitica, type PoliticaAutopiloto,
} from './politica';
import type { AiProposal } from '../types';

const conModo = (modo: PoliticaAutopiloto['modo'], extra: Partial<PoliticaAutopiloto> = {}): PoliticaAutopiloto => ({ ...POLITICA_POR_DEFECTO, modo, ...extra });

describe('política de autonomía', () => {
  it('por defecto se arranca en SOMBRA (decisión de Dani del 28-10) con 50 $/mes', () => {
    expect(POLITICA_POR_DEFECTO.modo).toBe('sombra');
    expect(POLITICA_POR_DEFECTO.presupuesto).toEqual({ mesUsd: 50, diaUsd: 3 });
    expect(POLITICA_POR_DEFECTO.menuAutomatico).toBe('borrador24h');
    expect(normalizarPolitica({ modo: 'lo que sea', presupuesto: { mesUsd: -3 } })).toMatchObject({ modo: 'sombra', presupuesto: { mesUsd: 50, diaUsd: 3 } });
  });

  it('en sombra nada se aplica ni se propone; en rodaje todo se propone', () => {
    expect(politicaEfectiva(conModo('sombra'), 'respuesta_rutinaria')).toBe('sombra');
    expect(politicaEfectiva(conModo('rodaje'), 'respuesta_rutinaria')).toBe('proponer');
    expect(politicaEfectiva(conModo('rodaje'), 'menu_semanal')).toBe('proponer');
    expect(politicaDeEpisodio(conModo('sombra'))).toBe('sombra');
    expect(politicaDeEpisodio(conModo('rodaje'))).toBe('proponer');
  });

  it('con la política activa manda la tabla de destino, el nivel por tipo y el del atleta, en ese orden', () => {
    const p = conModo('politica', { nivelPorTipo: { respuesta_rutinaria: 'aviso' } });
    expect(politicaEfectiva(p, 'menu_semanal')).toBe(NIVEL_DESTINO.menu_semanal);
    expect(politicaEfectiva(p, 'respuesta_rutinaria')).toBe('aviso');
    expect(politicaEfectiva(p, 'respuesta_rutinaria', { respuesta_rutinaria: 'proponer' })).toBe('proponer');
  });

  it('lo que nunca es automático baja a aviso aunque Dani lo ponga en automático; lo clínico y el dinero siempre se proponen', () => {
    const p = conModo('politica', { nivelPorTipo: { mesociclo: 'automatico', clinico: 'automatico', renovacion: 'aviso' } });
    expect(nivelDe(p, 'mesociclo')).toBe('aviso');
    expect(nivelDe(p, 'clinico')).toBe('proponer');
    expect(nivelDe(p, 'renovacion')).toBe('proponer');
    for (const t of NUNCA_AUTOMATICO) expect(nivelDe(conModo('politica', { nivelPorTipo: { [t]: 'automatico' } }), t)).not.toBe('automatico');
  });
});

describe('tipoDeDecision', () => {
  const base = (kind: AiProposal['kind'], payload: unknown, baseEntityId?: string) => ({ kind, payload: payload as AiProposal['payload'], baseEntityId });
  it('una alerta clínica manda sobre el tipo de propuesta', () => {
    expect(tipoDeDecision(base('respuestaRevision', {}), { alertas: ['Molestia: hombro'] })).toBe('clinico');
  });
  it('los ajustes de dieta se clasifican por el porcentaje de kcal frente a la dieta base', () => {
    const dietaBase = { objetivo: { kcal: 2000, p: 160, hc: 200, g: 60 } } as never;
    const con = (kcal: number) => base('diet', { objetivo: { kcal, p: 160, hc: (kcal - 160 * 4 - 60 * 9) / 4, g: 60 } }, 'd1');
    expect(tipoDeDecision(con(1920), { dietaBase })).toBe('ajuste_kcal_pequeno');
    expect(tipoDeDecision(con(1840), { dietaBase })).toBe('ajuste_kcal_medio');
    expect(tipoDeDecision(con(1700), { dietaBase })).toBe('ajuste_kcal_grande');
    expect(tipoDeDecision(base('diet', { objetivo: { kcal: 2000, p: 160, hc: 200, g: 60 } }))).toBe('ajuste_kcal_grande');
  });
  it('la semana con descarga es descarga adelantada; con cambios de ejercicio, cambio por molestia; sin nada, progresión programada', () => {
    expect(tipoDeDecision(base('weekPlan', { semanasDescarga: [5] }))).toBe('descarga_adelantada');
    expect(tipoDeDecision(base('weekPlan', { cambios: [{}] }))).toBe('cambio_ejercicio_molestia');
    expect(tipoDeDecision(base('weekPlan', { rir: { desde: 3, hasta: 1 } }))).toBe('progresion_programada');
  });
  it('el resto va a su tipo', () => {
    expect(tipoDeDecision(base('mesocycle', {}))).toBe('mesociclo');
    expect(tipoDeDecision(base('workoutDays', {}))).toBe('sesiones');
    expect(tipoDeDecision(base('publishBlock', {}))).toBe('publicar_bloque');
    expect(tipoDeDecision(base('mensajeAtleta', {}))).toBe('mensaje_atleta');
    expect(tipoDeDecision(base('weeklyChallenge', {}))).toBe('reto');
    expect(tipoDeDecision(base('nutritionProgram', {}))).toBe('ajuste_kcal_grande');
  });
});

describe('rodaje · evaluarSubida y estadísticas', () => {
  const stat = (p: Partial<ReturnType<typeof estadisticasPorTipo>[number]> = {}) => ({ tipo: 'respuesta_rutinaria' as const, decididas: 0, aprobadasSinCambios: 0, editadas: 0, rechazadas: 0, deshechas: 0, avisosSinDeshacer: 0, ...p });

  it('de proponer a aviso hacen falta 8 decididas y 7 sin tocar', () => {
    expect(evaluarSubida('proponer', stat({ decididas: 7, aprobadasSinCambios: 7 }))).toBeNull();
    expect(evaluarSubida('proponer', stat({ decididas: 8, aprobadasSinCambios: 6, editadas: 2 }))).toBeNull();
    expect(evaluarSubida('proponer', stat({ decididas: 8, aprobadasSinCambios: 7, editadas: 1 }))?.a).toBe('aviso');
  });
  it('de aviso a automático hacen falta 8 avisos y ninguna deshecha, y nunca en lo que no puede ser automático', () => {
    expect(evaluarSubida('aviso', stat({ avisosSinDeshacer: 8 }))?.a).toBe('automatico');
    expect(evaluarSubida('aviso', stat({ avisosSinDeshacer: 8, deshechas: 1 }))).toBeNull();
    expect(evaluarSubida('aviso', stat({ tipo: 'mesociclo', avisosSinDeshacer: 20 }))).toBeNull();
    expect(evaluarSubida('proponer', stat({ tipo: 'clinico', decididas: 50, aprobadasSinCambios: 50 }))).toBeNull();
  });
  it('estadisticasPorTipo cuenta aprobadas sin tocar, editadas, rechazadas, deshechas y avisos', () => {
    const p = (id: string, status: AiProposal['status'], politica?: AiProposal['politica']): AiProposal =>
      ({ id, athleteId: 'a', kind: 'respuestaRevision', status, chatId: 'c', summary: '', rationale: '', payload: {} as never, createdAt: '2026-10-29', ...(politica ? { politica } : {}) });
    const e = estadisticasPorTipo(
      [p('1', 'approved'), p('2', 'approved'), p('3', 'rejected'), p('4', 'deshecha'), p('5', 'aplicada', 'aviso'), p('6', 'sombra'), p('7', 'proposed')],
      new Set(['2']), () => 'respuesta_rutinaria',
    );
    expect(e).toEqual([{ tipo: 'respuesta_rutinaria', decididas: 5, aprobadasSinCambios: 1, editadas: 1, rechazadas: 1, deshechas: 1, avisosSinDeshacer: 1 }]);
  });
});
