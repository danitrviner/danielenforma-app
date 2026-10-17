import { describe, it, expect } from 'vitest';
import { MUSCLE_ORDER, type MuscleGroup, type MuscleGroupConfig, type Mesocycle } from '../types';
import { calcularRepartos, frecuenciaPorDefecto, nombrarSesion, GRUPOS_COMODIN, evaluarRepartoActual } from './calculadoraReparto';
import { buildSnapshot } from './repartoDesactualizado';
import { repartoDelMesociclo, gruposPorSesion, frecuenciaSemanalDeSplit } from './trainingSplits';

function grupos(series: Partial<Record<MuscleGroup, number>>, alta: MuscleGroup[] = []): Record<MuscleGroup, MuscleGroupConfig> {
  return Object.fromEntries(MUSCLE_ORDER.map(g => [g, { series: series[g] ?? 0, priority: alta.includes(g) ? 'alta' : 'media' }])) as Record<MuscleGroup, MuscleGroupConfig>;
}

const SERIES: Partial<Record<MuscleGroup, number>> = {
  pecho: 12, dorsal: 12, trapecio: 6, biceps: 8, triceps: 8, deltoide_lat: 10, deltoide_post: 6,
  cuadriceps: 10, isquios: 8, gluteo: 8, gemelo: 6, core: 4,
};
const porDefecto = Object.fromEntries(MUSCLE_ORDER.map(g => [g, frecuenciaPorDefecto(SERIES[g] ?? 0)]));
// El ejemplo de Dani: pecho 1,5 · dorsal 2 · trapecio 2 · bíceps 2 · tríceps 1,5; el resto, del volumen.
const FRECUENCIAS_DANI = { ...porDefecto, pecho: 1.5, dorsal: 2, trapecio: 2, biceps: 2, triceps: 1.5 };
const L_M_X_V_S = [0, 1, 2, 4, 5];

describe('frecuenciaPorDefecto', () => {
  it('sale del volumen a medios, con mínimo 1 y máximo 3', () => {
    expect(frecuenciaPorDefecto(0)).toBe(0);
    expect(frecuenciaPorDefecto(3)).toBe(1);
    expect(frecuenciaPorDefecto(9)).toBe(1.5);
    expect(frecuenciaPorDefecto(12)).toBe(2);
    expect(frecuenciaPorDefecto(40)).toBe(3);
  });
});

describe('calcularRepartos · el ejemplo de Dani', () => {
  const r = calcularRepartos({ diasSemana: L_M_X_V_S, frecuencias: FRECUENCIAS_DANI, grupos: grupos(SERIES) });

  it('una frecuencia «y media» pide un ciclo de 14 días con los mismos días las dos semanas', () => {
    expect(r.cicloDias).toBe(14);
    for (const o of r.opciones) {
      expect(o.sesiones.map(s => s.dia)).toEqual([0, 1, 2, 4, 5, 7, 8, 9, 11, 12]);
    }
  });

  it('cada opción toca cada grupo EXACTAMENTE las veces pedidas', () => {
    expect(r.opciones.length).toBeGreaterThanOrEqual(3);
    for (const o of r.opciones) {
      for (const [g, f] of Object.entries(FRECUENCIAS_DANI) as [MuscleGroup, number][]) {
        if (f <= 0) continue;
        const veces = o.sesiones.filter(s => s.grupos.some(x => x.grupo === g)).length;
        expect(veces, `${o.estrategia} · ${g}`).toBe(f * 2);
        expect(o.frecuencias[g]!.conseguida).toBe(f);
      }
    }
  });

  it('las opciones son distintas entre sí', () => {
    expect(new Set(r.opciones.map(o => o.id)).size).toBe(r.opciones.length);
  });

  it('empuje/tirón/pierna sale limpio: cada sesión es de un solo bloque y nada cae en días seguidos', () => {
    const ppl = r.opciones.find(o => o.estrategia === 'Empuje / Tirón / Pierna')!;
    for (const s of ppl.sesiones) expect(s.tipo).toMatch(/^(Empuje|Tirón|Pierna)( [A-C])?$/);
    expect(ppl.avisos.some(a => a.includes('días seguidos'))).toBe(false);
  });

  it('las series de cada grupo en el ciclo son las de Volumen × 2 semanas', () => {
    for (const o of r.opciones) {
      const pecho = o.sesiones.flatMap(s => s.grupos).filter(x => x.grupo === 'pecho').reduce((a, x) => a + x.series, 0);
      expect(pecho).toBe(24);
    }
  });

  it('el reparto que se guarda reproduce las frecuencias con el resolvedor', () => {
    const o = r.opciones[0];
    const resuelto = repartoDelMesociclo({ reparto: o.reparto })!;
    expect(resuelto.dayTypes).toHaveLength(14);
    expect(gruposPorSesion(resuelto)).toHaveLength(10);
    expect(frecuenciaSemanalDeSplit(resuelto, 'pecho')).toBe(1.5);
    expect(o.reparto.frecuencias?.dorsal).toBe(2);
  });
});

describe('calcularRepartos · casos límite', () => {
  it('todo entero → ciclo semanal', () => {
    const r = calcularRepartos({ diasSemana: [0, 2, 4], frecuencias: { pecho: 2, cuadriceps: 1 }, grupos: grupos({ pecho: 10, cuadriceps: 8 }) });
    expect(r.cicloDias).toBe(7);
    expect(r.opciones[0].sesiones.map(s => s.dia)).toEqual([0, 2, 4]);
  });

  it('el ciclo arranca en el día de la semana de la fecha de inicio', () => {
    // Empieza en miércoles (2): L, X, V caen en los días 5, 0 y 2 del ciclo.
    const r = calcularRepartos({ diasSemana: [0, 2, 4], inicioSemana: 2, frecuencias: { pecho: 1 }, grupos: grupos({ pecho: 6 }) });
    expect(r.opciones[0].sesiones.map(s => s.dia)).toEqual([0, 2, 5]);
  });

  it('pedir más veces que sesiones avisa y se queda en las que hay', () => {
    const r = calcularRepartos({ diasSemana: [0, 3], frecuencias: { pecho: 3 }, grupos: grupos({ pecho: 12 }) });
    expect(r.avisos.some(a => a.startsWith('Pecho'))).toBe(true);
    expect(r.opciones[0].sesiones.every(s => s.grupos.some(x => x.grupo === 'pecho'))).toBe(true);
  });

  it('demasiadas series de un grupo por sesión sugiere subirle la frecuencia', () => {
    const r = calcularRepartos({ diasSemana: [0, 2, 4], frecuencias: { pecho: 1 }, grupos: grupos({ pecho: 16 }) });
    expect(r.avisos.join(' ')).toMatch(/Pecho: 16 series por sesión \(tope 8\)\. Súbele la frecuencia a 2×/);
  });

  it('sin días o sin frecuencias no hay opciones, con el motivo', () => {
    expect(calcularRepartos({ diasSemana: [], frecuencias: { pecho: 1 }, grupos: grupos({}) }).avisos[0]).toMatch(/día/);
    expect(calcularRepartos({ diasSemana: [0], frecuencias: {}, grupos: grupos({}) }).avisos[0]).toMatch(/frecuencia/);
  });

  it('un grupo en prioridad alta cae después de un descanso cuando se puede', () => {
    // L, M, J, V: los días tras descanso son lunes y jueves.
    const r = calcularRepartos({
      diasSemana: [0, 1, 3, 4],
      frecuencias: { cuadriceps: 2, pecho: 2, dorsal: 2 },
      grupos: grupos({ cuadriceps: 12, pecho: 10, dorsal: 10 }, ['cuadriceps']),
    });
    const ppl = r.opciones[0];
    const diasCuadriceps = ppl.sesiones.filter(s => s.grupos.some(x => x.grupo === 'cuadriceps')).map(s => s.dia);
    expect(diasCuadriceps).toEqual([0, 3]);
  });
});

describe('nombrarSesion', () => {
  const s = (...gs: MuscleGroup[]) => gs.map(grupo => ({ grupo, series: 4 }));
  it('usa el nombre del día de la lista que la contiene', () => {
    expect(nombrarSesion(s('pecho', 'deltoide_lat', 'triceps'))).toBe('Empuje');
    expect(nombrarSesion(s('dorsal', 'trapecio', 'biceps'))).toBe('Tirón');
    expect(nombrarSesion(s('cuadriceps', 'isquios', 'gluteo', 'core'))).toBe('Pierna');
    expect(nombrarSesion(s('pecho', 'dorsal', 'biceps', 'triceps'))).toBe('Torso');
  });
  it('si ninguno encaja, sus grupos principales', () => {
    expect(nombrarSesion([{ grupo: 'pecho', series: 8 }, { grupo: 'cuadriceps', series: 6 }])).toBe('Pecho · Cuáds');
  });
  it('los comodines no cuentan', () => {
    expect(GRUPOS_COMODIN).toContain('core');
    expect(nombrarSesion(s('core'))).toBe('Core');
  });
});

describe('evaluarRepartoActual', () => {
  const base: Mesocycle = {
    id: 'm', athleteId: 'a', number: 1, weeks: 4, startDate: '2026-10-19', objective: '', daysPerWeek: 4,
    splitId: '4-torso-pierna-x2', groups: grupos({ pecho: 12, dorsal: 12, trapecio: 6, cuadriceps: 10, core: 4 }),
  };

  it('sin reparto, la tarjeta sale de su calendario; sin sesiones, no hay tarjeta', () => {
    const r = evaluarRepartoActual({ ...base, splitId: undefined }, { frecuencias: {}, grupos: base.groups })!;
    expect(r.sesiones.map(s => s.tipo)).toEqual(['Sesión 1', 'Sesión 2', 'Sesión 3', 'Sesión 4']);
    expect(evaluarRepartoActual({ ...base, splitId: undefined, daysPerWeek: 0 }, { frecuencias: {}, grupos: base.groups })).toBeNull();
  });

  it('mide el reparto de la lista sin contar los comodines y compara con lo que se pide', () => {
    const r = evaluarRepartoActual(base, { frecuencias: { pecho: 1.5, dorsal: 2 }, grupos: base.groups })!;
    expect(r.sesiones.map(s => s.tipo)).toEqual(['Torso', 'Pierna', 'Torso', 'Pierna']);
    expect(r.frecuencias.pecho).toEqual({ objetivo: 1.5, conseguida: 2 });
    expect(r.frecuencias.dorsal).toEqual({ objetivo: 2, conseguida: 2 });
    expect(r.frecuencias.core).toBeUndefined();
    expect(r.frecuencias.cuadriceps).toEqual({ objetivo: 0, conseguida: 2 });
  });

  it('con distribución al día manda lo que de verdad se entrena', () => {
    const meso: Mesocycle = {
      ...base,
      distribution: {
        days: [
          { assignments: [{ group: 'pecho', series: 6 }, { group: 'trapecio', series: 6 }], totalSeries: 12 },
          { assignments: [{ group: 'cuadriceps', series: 10 }], totalSeries: 10 },
          { assignments: [{ group: 'pecho', series: 6 }, { group: 'dorsal', series: 12 }], totalSeries: 18 },
          { assignments: [], totalSeries: 0 },
        ],
        overloadAlert: false, snapshot: buildSnapshot(base), generatedAt: 'x',
      },
    };
    const r = evaluarRepartoActual(meso, { frecuencias: { trapecio: 2 }, grupos: meso.groups })!;
    expect(r.frecuencias.trapecio).toEqual({ objetivo: 2, conseguida: 1 });
    expect(r.frecuencias.dorsal?.conseguida).toBe(1);
  });
});
