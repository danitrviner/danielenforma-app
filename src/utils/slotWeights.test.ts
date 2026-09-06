import { describe, it, expect } from 'vitest';
import { slotPercents, slotWeights } from './slotWeights';
import { slotsFromOnboarding, FALLBACK_SLOTS } from './menuEngine';
import { distributeMealTargets } from './mealDistribution';
import { HungerProfile } from '../types';

const PERFILES: (HungerProfile | undefined)[] = [undefined, 'manana', 'equilibrado', 'noche'];

describe('slotPercents', () => {
  // El editor de menús del entrenador bloquea el botón de generar si los
  // porcentajes no suman 100 clavado, así que esto no es cosmética.
  it('suma exactamente 100 en cualquier combinación de franjas y perfil', () => {
    const combos = [[1, 3, 5], [1, 2, 3, 5], [1, 2, 3, 4, 5], [3], [1, 5], [2, 4], [1, 1, 3, 5, 5]];
    for (const slots of combos) {
      for (const perfil of PERFILES) {
        expect(slotPercents(slots, perfil).reduce((s, v) => s + v, 0)).toBe(100);
      }
    }
  });

  it('devuelve enteros, no decimales', () => {
    for (const p of slotPercents([1, 2, 3, 5], 'noche')) expect(Number.isInteger(p)).toBe(true);
  });

  it('reparte a partes iguales si no hay pesos utilizables', () => {
    expect(slotPercents([9, 9, 9, 9]).reduce((s, v) => s + v, 0)).toBe(100);
  });

  it('no se rompe con cero franjas', () => {
    expect(slotPercents([])).toEqual([]);
  });

  it('mueve el peso hacia la noche o hacia la mañana según el perfil', () => {
    const [desMan, , , cenaMan] = slotPercents([1, 2, 3, 5], 'manana');
    const [desNoc, , , cenaNoc] = slotPercents([1, 2, 3, 5], 'noche');
    expect(desMan).toBeGreaterThan(desNoc);
    expect(cenaNoc).toBeGreaterThan(cenaMan);
  });
});

describe('un solo reparto para la dieta y para el menú', () => {
  // El fallo que motivó esto: la dieta de intercambios repartía 20/10/38/10/27 y
  // hacía caso al perfil de hambre; el menú de recetas repartía 20/10/40/10/25 y
  // ni sabía que la pregunta existía. Mismo atleta, dos verdades distintas.
  it('el menú y la dieta ordenan las franjas igual para el mismo perfil', () => {
    for (const perfil of ['manana', 'noche'] as HungerProfile[]) {
      const slots = slotsFromOnboarding({ mealCount: 4 }, perfil);

      const dieta = distributeMealTargets({
        budget: { HC: 12, PROT: 8, GRASA: 6, MIX_HC: 0, MIX_GRASA: 0 },
        meals: slots.map((s, i) => ({ id: String(i), name: s.name, slot: s.slot })),
        hungerProfile: perfil,
      });

      // Cuál es la comida más grande del día, según cada motor.
      const mayorMenu = slots.reduce((a, b) => (b.pct > a.pct ? b : a)).slot;
      const totales = dieta.targets.map(t => t.HC + t.PROT + t.GRASA);
      const mayorDieta = slots[totales.indexOf(Math.max(...totales))].slot;

      expect(mayorMenu).toBe(mayorDieta);
    }
  });

  it('el perfil de hambre cambia el reparto del menú (antes no hacía nada)', () => {
    const manana = slotsFromOnboarding({ mealCount: 4 }, 'manana').map(s => s.pct);
    const noche = slotsFromOnboarding({ mealCount: 4 }, 'noche').map(s => s.pct);
    expect(manana).not.toEqual(noche);
  });

  it('sin perfil se queda muy cerca del reparto fijo de siempre', () => {
    // Tolerancia de 2 puntos: el reparto nuevo sale de pesos normalizados, no de
    // los porcentajes escritos a mano, pero no debe mover el plan de nadie.
    const VIEJO: Record<3 | 4 | 5, number[]> = {
      3: [25, 45, 30], 4: [20, 10, 40, 30], 5: [20, 10, 35, 10, 25],
    };
    for (const n of [3, 4, 5] as const) {
      FALLBACK_SLOTS[n].forEach((sl, i) => {
        expect(Math.abs(sl.pct - VIEJO[n][i])).toBeLessThanOrEqual(2);
      });
    }
  });

  it('respeta las comidas y los nombres propios de la ficha del atleta', () => {
    const slots = slotsFromOnboarding({
      mealCount: 4,
      meals: [
        { intakeType: 1, name: 'Café y tostada', needsTupper: false },
        { intakeType: 2, name: 'Fruta oficina', needsTupper: true },
        { intakeType: 3, name: 'Tupper', needsTupper: true },
        { intakeType: 5, name: 'Cena en casa', needsTupper: false },
      ],
    }, 'noche');

    expect(slots.map(s => s.name)).toEqual(['Café y tostada', 'Fruta oficina', 'Tupper', 'Cena en casa']);
    expect(slots.map(s => s.needsTupper)).toEqual([false, true, true, false]);
    expect(slots.reduce((s, x) => s + x.pct, 0)).toBe(100);
    // Cena por encima del desayuno: el perfil llega hasta las comidas propias.
    expect(slots[3].pct).toBeGreaterThan(slots[0].pct);
  });
});

describe('slotWeights', () => {
  it('el perfil equilibrado deja los pesos base intactos', () => {
    expect(slotWeights([1, 2, 3, 4, 5], 'equilibrado')).toEqual(slotWeights([1, 2, 3, 4, 5], undefined));
  });
});

describe('seis comidas', () => {
  it('no mueve el reparto de 3, 4 ni 5 comidas', () => {
    // Dani, 2026-09-05: "lo del reparto de comida, déjalo como está".
    expect(slotsFromOnboarding({ mealCount: 3 }).map(s => s.pct)).toEqual([23, 45, 32]);
    expect(slotsFromOnboarding({ mealCount: 4 }).map(s => s.pct)).toEqual([21, 11, 40, 28]);
    expect(slotsFromOnboarding({ mealCount: 5 }).map(s => s.pct)).toEqual([19, 10, 36, 9, 26]);
  });

  it('la recena parte la franja de la cena en vez de duplicarla', () => {
    const seis = slotsFromOnboarding({ mealCount: 6 });
    expect(seis.map(s => s.name)).toEqual(
      ['Desayuno', 'Media mañana', 'Comida', 'Merienda', 'Cena', 'Recena']);
    // Cena y recena comparten la franja 5: juntas pesan lo que pesaba la cena
    // sola (26 %), no el doble.
    const cena = seis[4].pct + seis[5].pct;
    expect(Math.abs(cena - 26)).toBeLessThanOrEqual(1);
    expect(seis.reduce((s, x) => s + x.pct, 0)).toBe(100);
  });

  it('la recena usa la franja de cena, que es de donde salen sus recetas', () => {
    expect(slotsFromOnboarding({ mealCount: 6 }).map(s => s.slot)).toEqual([1, 2, 3, 4, 5, 5]);
  });
});

describe('el número de comidas del PERFIL manda sobre la ficha de alta', () => {
  // El atleta cambiaba "comidas al día" en Perfil > Preferencias, se guardaba en
  // AthleteNutritionConfig, y el generador seguía leyendo solo la ficha: veía su
  // elección guardada y el menú le llegaba con las comidas de antes.
  const ficha = {
    mealCount: 4,
    meals: [
      { intakeType: 1, name: 'Desayuno', needsTupper: false },
      { intakeType: 2, name: 'Media mañana', needsTupper: false },
      { intakeType: 3, name: 'Comida', needsTupper: true },
      { intakeType: 5, name: 'Cena', needsTupper: false },
    ],
  };

  it('sin override se respeta la ficha', () => {
    expect(slotsFromOnboarding(ficha).length).toBe(4);
  });

  it('con override manda el perfil, y el reparto sigue sumando 100', () => {
    for (const n of [3, 5, 6]) {
      const slots = slotsFromOnboarding(ficha, undefined, n);
      expect(slots.length).toBe(n);
      expect(slots.reduce((s, sl) => s + sl.pct, 0)).toBe(100);
    }
  });

  it('un valor imposible no rompe: se cae al preset de 4', () => {
    expect(slotsFromOnboarding(ficha, undefined, 99).length).toBe(4);
  });
});
