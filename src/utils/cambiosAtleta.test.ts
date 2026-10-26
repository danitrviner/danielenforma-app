import { describe, it, expect } from 'vitest';
import type { Diet, Mesocycle, NutritionProgram } from '../types';
import { resumirDieta, resumirPrograma, resumirCalendarioDietas, resumirMeso, resumirConfigNutricion, resumirReglasDeReceta } from './cambiosAtleta';
import type { ReglasDeReceta } from './reglasDeReceta';

const dieta = (over: Partial<Diet> = {}): Diet => ({
  id: 'd1', athleteId: 'a@x.com', name: 'Entreno',
  budget: { HC: 10, PROT: 8, GRASA: 6, MIX_HC: 0, MIX_GRASA: 0 },
  meals: [{ id: 'm1', name: 'Desayuno', items: [{ foodLabel: 'Avena' }] as never }],
  ...over,
});

describe('resumirDieta', () => {
  it('sin cambios no dice nada', () => expect(resumirDieta(dieta(), dieta())).toEqual([]));

  it('cuenta kcal, hidratos y alimentos añadidos o quitados', () => {
    const l = resumirDieta(dieta(), dieta({
      budget: { HC: 12, PROT: 8, GRASA: 6, MIX_HC: 0, MIX_GRASA: 0 },
      meals: [{ id: 'm1', name: 'Desayuno', items: [{ foodLabel: 'Pan' }] as never }],
    }));
    expect(l.some(x => x.startsWith('Kcal'))).toBe(true);
    // En gramos (10 → 12 intercambios de HC son 250 → 300 g), no en intercambios (26-10-2026).
    expect(l).toContain('Hidratos 250 → 300 g');
    expect(l).toContain('Añade Pan');
    expect(l).toContain('Quita Avena');
  });
});

describe('resumirPrograma', () => {
  const prog = (kcal: number, rate?: number): NutritionProgram => ({
    athleteId: 'a@x.com', startDate: '2026-09-01',
    phases: [{ id: 'f1', name: 'Déficit', weeks: 8, dietId: 'd1', targetKcal: kcal, targetRateKgWeek: rate }],
  });
  it('detecta cambio de kcal y de ritmo por fase', () => {
    const l = resumirPrograma(prog(2300, -0.5), prog(2150, -0.7));
    expect(l).toContain('«Déficit» kcal 2.300 → 2.150');
    expect(l.some(x => x.includes('ritmo'))).toBe(true);
  });
  it('fase añadida y eliminada', () => {
    const a = prog(2300);
    const b = { ...a, phases: [{ id: 'f2', name: 'Volumen', weeks: 6, dietId: 'd1', targetKcal: 2900 }] };
    const l = resumirPrograma(a, b);
    expect(l.some(x => x.startsWith('Fase nueva «Volumen»'))).toBe(true);
    expect(l).toContain('Fase «Déficit» eliminada');
  });
});

describe('resumirCalendarioDietas y config', () => {
  it('traduce ids a nombres y marca libres', () => {
    const l = resumirCalendarioDietas(
      { athleteId: 'a', activeDietIds: ['d1'], weeklySchedule: { mon: 'd1', sat: 'd1' } },
      { athleteId: 'a', activeDietIds: ['d1', 'd2'], weeklySchedule: { mon: 'd1', sat: 'd2', sun: null } },
      { d1: 'Entreno', d2: 'Descanso' },
    );
    expect(l).toContain('Sábado: Entreno → Descanso');
    expect(l).toContain('Activa Descanso');
  });
  it('pasos objetivo', () => {
    expect(resumirConfigNutricion({ athleteId: 'a', enabledModes: [], stepGoal: 8000 }, { athleteId: 'a', enabledModes: [], stepGoal: 10000 }))
      .toEqual(['Objetivo de pasos 8.000 → 10.000']);
  });
});

describe('resumirMeso', () => {
  const meso = (series: number, over: Partial<Mesocycle> = {}) => ({
    id: 'm', athleteId: 'a', number: 1, weeks: 6, startDate: '2026-10-01', objective: '', daysPerWeek: 4,
    groups: { pecho: { series, priority: 'alta' } }, ...over,
  }) as unknown as Mesocycle;
  it('series por grupo y sesiones por ciclo', () => {
    const l = resumirMeso(meso(12), meso(14, { daysPerWeek: 5 }));
    expect(l).toContain('Pecho 12 → 14 series');
    expect(l).toContain('Sesiones por ciclo 4 → 5');
  });
  it('un meso nuevo (sin antes) no registra nada', () => expect(resumirMeso(undefined, meso(12))).toEqual([]));
});

describe('resumirReglasDeReceta (N-09)', () => {
  const nombre = (id: string) => ({ a: 'Pollo al curry', b: 'Tortitas', c: 'Salmón', d: 'Lentejas', e: 'Pasta' } as Record<string, string>)[id];
  const base = (over: Partial<ReglasDeReceta> = {}): ReglasDeReceta => ({ athleteId: 'x@y.z', reglas: [], ...over });

  it('sin cambios no dice nada', () => {
    expect(resumirReglasDeReceta(base(), base(), nombre)).toEqual([]);
    expect(resumirReglasDeReceta(undefined, base(), nombre)).toEqual([]);
  });
  it('recetas ocultas: las nuevas y las quitadas, con nombre', () => {
    const l = resumirReglasDeReceta(base({ reglas: [{ recipeId: 'a' }] }), base({ reglas: [{ recipeId: 'b' }, { recipeId: 'c' }] }), nombre);
    expect(l).toEqual(['Recetas ocultas: +2 («Tortitas», «Salmón»)', 'Recetas ocultas: −1 («Pollo al curry»)']);
  });
  it('más de tres: «y N más»', () => {
    const l = resumirReglasDeReceta(undefined, base({ reglas: ['a', 'b', 'c', 'd', 'e'].map(recipeId => ({ recipeId })) }), nombre);
    expect(l).toEqual(['Recetas ocultas: +5 («Pollo al curry», «Tortitas», «Salmón» y 2 más)']);
  });
  it('una receta que sigue oculta pero con otros días cuenta como cambio de alcance', () => {
    const l = resumirReglasDeReceta(base({ reglas: [{ recipeId: 'a' }] }), base({ reglas: [{ recipeId: 'a', dias: ['mon'] }] }), nombre);
    expect(l).toEqual(['Alcance cambiado en 1 receta oculta («Pollo al curry»)']);
  });
  it('recomendadas', () => {
    expect(resumirReglasDeReceta(base({ recomendadas: ['a'] }), base({ recomendadas: ['a', 'd'] }), nombre)).toEqual(['Recomendadas: +1 («Lentejas»)']);
  });
  it('lista del menú: de la general a una propia, y entre dos propias lo que entra y sale', () => {
    expect(resumirReglasDeReceta(base(), base({ listaMenu: ['a', 'b'] }), nombre)).toEqual(['Lista del menú: la general → 2 recetas']);
    expect(resumirReglasDeReceta(base({ listaMenu: ['a', 'b'] }), base(), nombre)).toEqual(['Lista del menú: 2 recetas → la general']);
    expect(resumirReglasDeReceta(base({ listaMenu: ['a', 'b'] }), base({ listaMenu: ['b', 'c'] }), nombre))
      .toEqual(['Lista del menú: +1 («Salmón»)', 'Lista del menú: −1 («Pollo al curry»)']);
  });
  it('recetario', () => {
    expect(resumirReglasDeReceta(base(), base({ recetario: 'recomendadas' }), nombre)).toEqual(['Recetario: todas → solo recomendadas']);
  });
  it('sin función de nombres pone «receta»', () => {
    expect(resumirReglasDeReceta(undefined, base({ reglas: [{ recipeId: 'a' }] }))).toEqual(['Recetas ocultas: +1 («receta»)']);
  });
});

describe('resumirReglasDeReceta: recetas del generador por dieta', () => {
  const base = (seleccion?: ReglasDeReceta['seleccion']): ReglasDeReceta => ({ athleteId: 'a@x.com', reglas: [], seleccion });
  const nombre = (id: string) => ({ d1: 'Día A', p1: 'Batch' } as Record<string, string>)[id];

  it('cuenta el antes y el después de cada dieta con nombre', () => {
    const l = resumirReglasDeReceta(base(), base({ porDieta: { d1: { rapidas: true, con: ['Arroz'] } } }), nombre);
    expect(l).toEqual(['Recetas del generador · Dieta «Día A»: Sin filtros → Rápidas · con arroz']);
  });

  it('todas las dietas, paquetes y días con tiempo', () => {
    const l = resumirReglasDeReceta(
      base({ general: { tupper: true } }),
      base({ general: { paquetes: ['p1'] }, diasConTiempo: ['wed', 'thu'] }),
      nombre,
    );
    expect(l).toEqual([
      'Recetas del generador · Todas las dietas: Tupper → paquete Batch',
      'Días con tiempo para cocinar: ninguno → X, J',
    ]);
  });

  it('sin cambios en la selección, nada', () => {
    const sel = { porDieta: { d1: { sin: ['Atún'] } } };
    expect(resumirReglasDeReceta(base(sel), base(sel), nombre)).toEqual([]);
  });
});
