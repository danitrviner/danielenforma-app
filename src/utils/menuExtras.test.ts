import { describe, it, expect } from 'vitest';
import {
  topeDeReceta, objetivoDePlato, fillComplements, generateDay,
  findSwapAlternatives, totalConExtras, GeneratorPrefs,
} from './menuEngine';
import { complementosDisponibles, isSimpleComplement } from './menuComplements';
import { Recipe, Diet, BudgetVec, MealItem, MenuDay } from '../types';

const prefs: GeneratorPrefs = { allergies: [], disliked: [], liked: [], variety: 3 };

function receta(id: string, exch: BudgetVec, name = `Receta ${id}`): Recipe {
  return { id, ownerId: 'recetas', name, categories: [], ingredients: [], extras: [], steps: [], exchanges: exch };
}

function alimento(id: string, category: MealItem['category'], label: string): MealItem {
  return { id, mode: 'OMNIVORO', category, label };
}

// Banco mínimo con las tres cosas que Dani pedía poder poner de extra.
const BANCO: MealItem[] = [
  alimento('pan', 'HC', '40g pan (de molde, tostado, con o sin semillas...)'),
  alimento('manzana', 'HC', '1 manzana o 1 pera'),
  alimento('arroz', 'HC', '30g arroz, pasta, couscous o quinoa'),
  alimento('mermelada', 'HC', '40g mermelada (la que sea)'),
  alimento('yogur', 'PROT', '1 yogurt YoPro Danone (no choco)'),
  alimento('nueces', 'GRASA', '15g frutos secos sin freír (cualquier fruto seco)'),
];

describe('catálogo de extras', () => {
  // El fallo original: la lista blanca solo admitía fruta, lácteos y frutos
  // secos, así que "añade un punto de pan" era literalmente imposible.
  it('el pan puede ser un extra', () => {
    expect(isSimpleComplement(BANCO[0])).toBe(true);
  });

  it('el atleta puede elegir CUALQUIER alimento de su banco, no solo los simples', () => {
    const todos = complementosDisponibles(BANCO, 'OMNIVORO');
    expect(todos).toHaveLength(BANCO.length);
    expect(todos.map(f => f.id)).toContain('arroz');      // hay que cocinarlo, pero es su elección
    expect(todos.map(f => f.id)).toContain('mermelada');
  });

  it('filtra por categoría y acepta MIX_HC donde se pide PROT', () => {
    expect(complementosDisponibles(BANCO, 'OMNIVORO', 'HC').every(f => f.category === 'HC')).toBe(true);
    const mix = alimento('yogurgriego', 'MIX_HC', '170g yogurt griego desnatado 0%');
    expect(complementosDisponibles([...BANCO, mix], 'OMNIVORO', 'PROT').map(f => f.id)).toContain('yogurgriego');
  });

  it('no propone azúcares por su cuenta, aunque el atleta pueda elegirlos', () => {
    expect(isSimpleComplement(BANCO[3])).toBe(false);                      // mermelada
    expect(complementosDisponibles(BANCO, 'OMNIVORO').map(f => f.id)).toContain('mermelada');
  });

  it('solo ofrece alimentos del modo de dieta del atleta', () => {
    const vegano = { ...alimento('tofu', 'PROT', '100g tofu'), mode: 'VEGANO' as const };
    expect(complementosDisponibles([...BANCO, vegano], 'OMNIVORO').map(f => f.id)).not.toContain('tofu');
  });
});

describe('extras que propone el generador', () => {
  it('llena un alimento antes de pasar al siguiente, no reparte migajas', () => {
    // Un hueco de 0,75 debe ser UN extra de 0,75, no tres de 0,25.
    const out = fillComplements({ HC: 0.75, PROT: 0, GRASA: 0 }, BANCO, 'OMNIVORO');
    expect(out).toHaveLength(1);
    expect(out[0].quantity).toBe(0.75);
  });

  it('encadena solo cuando no cabe en un alimento', () => {
    const out = fillComplements({ HC: 3, PROT: 0, GRASA: 0 }, BANCO, 'OMNIVORO');
    expect(out.length).toBeGreaterThan(1);
    expect(new Set(out.map(c => c.foodLabel)).size).toBe(out.length); // alimentos distintos
    expect(out.every(c => c.quantity <= 2)).toBe(true);
  });

  it('trabaja en pasos de 0,25 (antes perdía lo que no llegaba a media ración)', () => {
    const out = fillComplements({ HC: 1.25, PROT: 0, GRASA: 0 }, BANCO, 'OMNIVORO');
    expect(out.reduce((s, c) => s + c.quantity, 0)).toBe(1.25);
  });

  it('no propone nada si no falta nada', () => {
    expect(fillComplements({ HC: 0, PROT: 0, GRASA: 0 }, BANCO, 'OMNIVORO')).toEqual([]);
  });
});

describe('tope del plato', () => {
  it('sale del recetario: la receta mediana a doble ración', () => {
    const pool = [1, 2, 3, 4, 5].map((n, i) => receta(`r${i}`, { HC: n, PROT: 0, GRASA: 0 }));
    expect(topeDeReceta(pool)).toBe(6); // mediana 3 × escala 2
  });

  it('sin recetas no hay nada que topar', () => {
    expect(topeDeReceta([])).toBe(Infinity);
  });

  it('recorta manteniendo la proporción entre macros', () => {
    const recortado = objetivoDePlato({ HC: 8, PROT: 4, GRASA: 4 }, 8);
    expect(recortado.HC + recortado.PROT + recortado.GRASA).toBeCloseTo(8, 2);
    expect(recortado.HC / recortado.PROT).toBeCloseTo(2, 2); // 8/4 se mantiene
  });

  it('deja el objetivo intacto si ya cabe', () => {
    const objetivo: BudgetVec = { HC: 2, PROT: 1, GRASA: 1 };
    expect(objetivoDePlato(objetivo, 8)).toEqual(objetivo);
  });
});

describe('el día completo: plato topado + extras', () => {
  // Recetario de platos medianos y una comida que pide mucho más que cualquiera
  // de ellos — el caso que dejaba al atleta con dos o tres platos posibles.
  const pool: Recipe[] = Array.from({ length: 12 }, (_, i) =>
    receta(`p${i}`, { HC: 2, PROT: 1, GRASA: 0.5 }, `Plato ${i}`));
  const pools = { 1: pool, 2: pool, 3: pool, 5: pool };
  const dieta: Diet = {
    id: 'd1', athleteId: 'a@x.com', name: 'Día',
    budget: { HC: 16, PROT: 8, GRASA: 6, MIX_HC: 0, MIX_GRASA: 0 }, meals: [],
  } as Diet;

  const slots = [
    { slot: 1, name: 'Desayuno', pct: 21 },
    { slot: 2, name: 'Media mañana', pct: 11 },
    { slot: 3, name: 'Comida', pct: 40 },
    { slot: 5, name: 'Cena', pct: 28 },
  ];

  function dia(): MenuDay {
    return generateDay({ day: 'mon', diet: dieta, slots, pools, foods: BANCO, prefs, usedIds: new Set() });
  }

  it('el día cuadra con su presupuesto contando plato + extras', () => {
    const d = dia();
    const puesto = d.meals.reduce((s, m) => {
      const t = totalConExtras(m.exch, m.complements);
      return s + t.HC + t.PROT + t.GRASA;
    }, 0);
    expect(Math.abs(puesto - 30)).toBeLessThanOrEqual(1);
  });

  it('ninguna receta se sirve por encima de la ración máxima', () => {
    expect(dia().meals.every(m => m.scale <= 2)).toBe(true);
  });

  it('los extras se reparten entre comidas, no se apilan todos en la comida', () => {
    const conExtras = dia().meals.filter(m => m.complements.length > 0);
    expect(conExtras.length).toBeGreaterThan(1);
  });

  it('generar dos veces da lo mismo (antes los extras salían al azar)', () => {
    expect(JSON.stringify(dia())).toBe(JSON.stringify(dia()));
  });

  it('buscar alternativas mira el PLATO, no el plato más sus extras', () => {
    const d = dia();
    const comida = d.meals.find(m => m.slot === 3)!;
    expect(comida.complements.length).toBeGreaterThan(0); // si no, el test no prueba nada
    // Todas las recetas del pool son iguales al plato servido, así que todas
    // deberían valer. Apuntando al total de la comida no llegaría ninguna.
    expect(findSwapAlternatives(d, comida.id, pool, prefs).length).toBeGreaterThan(1);
  });
});
