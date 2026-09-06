import { describe, it, expect } from 'vitest';
import {
  bestScaleFit, fillComplements, generateDay,
  findSwapAlternatives, totalConExtras, MENU_SCALES, GeneratorPrefs,
} from './menuEngine';
import { complementosDisponibles, isSimpleComplement } from './menuComplements';
import { buildShoppingList } from './menuShoppingList';
import { Recipe, Diet, BudgetVec, MealItem, MenuDay } from '../types';

const prefs: GeneratorPrefs = { allergies: [], disliked: [], liked: [], variety: 3 };

function receta(id: string, exch: BudgetVec, name = `Receta ${id}`, ingredientes: string[] = []): Recipe {
  return {
    id, ownerId: 'recetas', name, categories: [], ingredients: [], extras: [], steps: [],
    exchanges: exch,
    ingredientsText: ingredientes.map(n => ({ name: n })),
  } as Recipe;
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
  alimento('pollo', 'PROT', '100g carne blanca sin piel (pollo, pavo...)'),
  alimento('aceite', 'GRASA', '10ml (1 cuchara) aceite (preferible AOVE)'),
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

describe('la receta cubre la comida, o se descarta', () => {
  // Dani, 2026-09-05: "si la comida es de 600 kcal, buscamos recetas de 600 o
  // que se puedan multiplicar, punto. Y todas las demás se quedan eliminadas".
  it('multiplica hasta x4 para llegar al objetivo', () => {
    expect(MENU_SCALES[MENU_SCALES.length - 1]).toBe(4);
    const plato = receta('r', { HC: 2, PROT: 1, GRASA: 0.5 });     // 3,5 int base
    const fit = bestScaleFit(plato, { HC: 8, PROT: 4, GRASA: 2 }); // 14 int → x4
    expect(fit?.scale).toBe(4);
  });

  it('descarta la receta que no llega ni multiplicada por cuatro', () => {
    const pequena = receta('r', { HC: 1, PROT: 0, GRASA: 0 });          // 1 int
    expect(bestScaleFit(pequena, { HC: 10, PROT: 5, GRASA: 5 })).toBeNull();
  });

  it('descarta también la que se pasa a media ración', () => {
    const enorme = receta('r', { HC: 10, PROT: 5, GRASA: 5 });
    expect(bestScaleFit(enorme, { HC: 1, PROT: 0, GRASA: 0 })).toBeNull();
  });

  it('ya no hay reintento que readmita a las descartadas', () => {
    // El modo "permitirFueraDeRango" servía el plato a su escala máxima cuando
    // ninguna llegaba, y era el origen del plato escoltado por extras.
    const pool = [receta('p', { HC: 1, PROT: 0, GRASA: 0 })];
    const day = generateDay({
      day: 'mon',
      diet: { id: 'd', athleteId: 'a', name: 'D', budget: { HC: 20, PROT: 10, GRASA: 8, MIX_HC: 0, MIX_GRASA: 0 }, meals: [] } as Diet,
      slots: [{ slot: 3, name: 'Comida', pct: 100 }],
      pools: { 3: pool }, foods: BANCO, prefs, usedIds: new Set(),
    });
    expect(day.meals[0].recipeId).toBe('');  // vacía, para que el entrenador lo vea
  });
});

describe('el día completo: la receta cubre, el comodín remata', () => {
  // Recetario de platos medianos y una comida que pide mucho más que cualquiera
  // de ellos — el caso que dejaba al atleta con dos o tres platos posibles.
  // Con ingredientes escalables, como el 79 % del recetario real: así el hueco
  // se cierra subiendo la ración del propio plato y no solo con acompañamientos.
  const pool: Recipe[] = Array.from({ length: 12 }, (_, i) =>
    receta(`p${i}`, { HC: 2, PROT: 1, GRASA: 0.5 }, `Plato ${i}`, ['Arroz', 'Pechuga de pollo', 'Aceite de oliva']));
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
      const t = totalConExtras(m.exch, m.complements, m.racionesExtra);
      return s + t.HC + t.PROT + t.GRASA;
    }, 0);
    expect(Math.abs(puesto - 30)).toBeLessThanOrEqual(1);
  });

  it('ninguna receta se sirve por encima de la ración máxima', () => {
    expect(dia().meals.every(m => m.scale <= 4)).toBe(true);
  });

  it('el comodín nunca pasa de dos piezas NI de tres intercambios', () => {
    for (const m of dia().meals) {
      expect(m.complements.length).toBeLessThanOrEqual(2);
      expect(m.complements.reduce((s, c) => s + c.quantity, 0)).toBeLessThanOrEqual(3);
    }
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
    const extras = comida.complements.length + (comida.racionesExtra?.length ?? 0);
    expect(extras).toBeGreaterThan(0); // si no, el test no prueba nada
    // Todas las recetas del pool son iguales al plato servido, así que todas
    // deberían valer. Apuntando al total de la comida no llegaría ninguna.
    expect(findSwapAlternatives(d, comida.id, pool, prefs, Infinity, 'OMNIVORO', BANCO).length).toBeGreaterThan(1);
  });

  it('sube la ración del propio plato antes que colgarle un acompañamiento', () => {
    const conRaciones = dia().meals.filter(m => (m.racionesExtra?.length ?? 0) > 0);
    expect(conRaciones.length).toBeGreaterThan(0);
    // Y lo que sube es un ingrediente que la receta lleva de verdad.
    for (const m of conRaciones) {
      for (const r of m.racionesExtra!) {
        expect(['Arroz', 'Pechuga de pollo', 'Aceite de oliva']).toContain(r.ingrediente);
        expect(r.gramos).toBeGreaterThan(0);
      }
    }
  });


});

describe('regresiones encontradas en revisión', () => {
  // La lista de la compra sumaba plato + acompañamientos, pero NO las raciones
  // extra: justo el alimento del que más se come es del que menos se compraba.
  it('la lista de la compra suma las raciones extra del plato', () => {
    const receta: Recipe = {
      id: 'r1', name: 'Arroz con pollo', ownerId: 'recetas',
      ingredientsText: [{ name: 'Arroz', quantity: 100 }],
    } as unknown as Recipe;
    const dia: MenuDay = {
      day: 'mon', dietId: 'd', target: { HC: 4, PROT: 0, GRASA: 0 },
      meals: [{
        id: 'm1', slot: 3, name: 'Comida', recipeId: 'r1', recipeName: 'Arroz con pollo',
        scale: 1, exch: { HC: 4, PROT: 0, GRASA: 0 }, kcal: 400, complements: [],
        racionesExtra: [{ ingrediente: 'Arroz', nombre: 'arroz', category: 'HC', quantity: 2, gramos: 60 }],
      }],
    } as unknown as MenuDay;
    const lista = buildShoppingList([dia], new Map([['r1', receta]]));
    expect(lista.find(i => i.name === 'Arroz')?.grams).toBe(160); // 100 del plato + 60 de la ración
  });

  // "No dejar el día peor de lo que ya estaba" se aplicaba en valor absoluto:
  // un día 2 puntos CORTO abría también 2 puntos de margen por ARRIBA.
  it('un día que va corto no admite alternativas que lo dejen pasado', () => {
    const dia: MenuDay = {
      day: 'mon', dietId: 'd', target: { HC: 10, PROT: 0, GRASA: 0 },
      meals: [{
        id: 'm1', slot: 3, name: 'Comida', recipeId: 'x', recipeName: 'plato',
        scale: 1, exch: { HC: 6, PROT: 0, GRASA: 0 }, kcal: 600, complements: [],
      }],
    } as unknown as MenuDay;
    const receta = (id: string, hc: number): Recipe => ({
      id, name: id, ownerId: 'recetas', intakeTypes: [3],
      exchanges: { HC: hc, PROT: 0, GRASA: 0 },
    } as unknown as Recipe);
    // El día va 4 puntos corto. Una receta de 14 lo dejaría 4 puntos PASADO:
    // mismo tamaño de desvío, dirección contraria, y no debe ofrecerse.
    const ids = findSwapAlternatives(dia, 'm1', [receta('bajo', 6), receta('alto', 14)], prefs, Infinity, 'OMNIVORO', [])
      .map(c => c.recipe.id);
    expect(ids).not.toContain('alto');
  });
});
