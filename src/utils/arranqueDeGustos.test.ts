import { describe, it, expect } from 'vitest';
import type { Recipe } from '../types';
import { dishType } from './dishTypes';
import {
  elegirRecetasDeArranque, motivoDeGusto, patronesDeArranque, resultadoDeArranque,
  type RecetaDeArranque, type RespuestaDeArranque,
} from './arranqueDeGustos';

let n = 0;
const receta = (name: string, ingredientes: string[], minutos = 15): Recipe => ({
  id: `r${++n}`, ownerId: 'x', name, categories: [], ingredients: [], extras: [], steps: [], kcal: 400, cookingTime: minutos,
  ingredientsText: ingredientes.map(i => ({ name: i, quantity: 100 })),
} as unknown as Recipe);

const comidas = [
  receta('Arroz con pollo', ['Arroz', 'Pechuga de pollo']),
  receta('Ensalada de pollo', ['Lechuga', 'Pechuga de pollo']),
  receta('Pasta con pollo', ['Pasta', 'Pollo']),
  receta('Pollo al curry', ['Pollo', 'Leche de coco']),
  receta('Wok de pollo', ['Pollo', 'Verduras']),
  receta('Fajitas de pollo', ['Pollo', 'Tortilla de trigo']),
  receta('Pollo asado', ['Pollo', 'Patata']),
  receta('Salmón al horno', ['Salmón', 'Patata']),
  receta('Lentejas estofadas', ['Lentejas', 'Zanahoria']),
  receta('Crema de calabaza', ['Calabaza', 'Cebolla']),
  receta('Merluza en salsa verde', ['Merluza', 'Guisantes']),
  receta('Tortilla de patata', ['Huevo', 'Patata']),
  receta('Pasta con atún', ['Pasta', 'Atún']),
  receta('Arroz con gambas', ['Arroz', 'Gambas']),
  receta('Sopa de pescado con gambas', ['Gambas', 'Merluza']),
];

describe('arranque de gustos: elegir recetas', () => {
  it('nunca sale nada con un alimento que no quiere', () => {
    const r = elegirRecetasDeArranque({ comida: comidas }, { liked: ['pollo'], disliked: ['gambas', 'atún'] });
    expect(r).toHaveLength(10);
    expect(r.some(x => /gambas|atún/i.test(x.recipe.name))).toBe(false);
  });

  it('seis de cada diez llevan algo que le gusta, y el resto es para descubrir', () => {
    const r = elegirRecetasDeArranque({ comida: comidas }, { liked: ['pollo'], disliked: [] });
    const con = r.filter(x => x.gustos.length > 0);
    expect(con.length).toBeGreaterThanOrEqual(5);
    expect(con.length).toBeLessThanOrEqual(7);
    expect(r.some(x => x.gustos.length === 0)).toBe(true);
    // No más de dos platos del mismo tipo mientras haya otros donde elegir.
    const porTipo = new Map<string, number>();
    for (const x of con) porTipo.set(dishType(x.recipe), (porTipo.get(dishType(x.recipe)) ?? 0) + 1);
    expect(Math.max(...porTipo.values())).toBeLessThanOrEqual(3);
  });

  it('«ver más» no repite las ya vistas', () => {
    const una = elegirRecetasDeArranque({ comida: comidas }, { liked: [], disliked: [] }, { porTanda: 5 });
    const otra = elegirRecetasDeArranque({ comida: comidas }, { liked: [], disliked: [] }, { porTanda: 5, yaVistas: new Set(una.map(x => x.recipe.id)) });
    expect(otra.some(x => una.some(y => y.recipe.id === x.recipe.id))).toBe(false);
  });

  it('motivo', () => {
    expect(motivoDeGusto(['Huevo', 'Calabacín'])).toBe('Lleva huevo y calabacín, que te gustan');
    expect(motivoDeGusto(['Pollo'])).toBe('Lleva pollo, que te gusta');
    expect(motivoDeGusto([])).toBeNull();
  });
});

describe('arranque de gustos: patrones', () => {
  const vistas: RecetaDeArranque[] = comidas.map(recipe => ({ recipe, tanda: 'comida', gustos: [] }));
  const responder = (gusta: (r: Recipe) => boolean): RespuestaDeArranque[] => comidas.map(r => ({ recipeId: r.id, gusta: gusta(r) }));

  it('rechaza todo el pescado: pregunta por el pescado, una sola vez', () => {
    const resp = responder(r => !/salm|merluza|at[uú]n|pescado/i.test(r.name));
    const p = patronesDeArranque(vistas, resp, { liked: [] });
    const pescado = p.find(x => x.id === 'alimento:pescado');
    expect(pescado?.sentido).toBe('no');
    expect(pescado?.opciones[0].accion).toBe('noQuiero');
    expect(p.some(x => x.id === 'alimento:pescado azul' || x.id === 'alimento:pescado blanco')).toBe(false);
    expect(p.length).toBeLessThanOrEqual(5);
  });

  it('elige todo el pollo: lo pregunta, salvo que ya lo dijera en el alta', () => {
    const resp = responder(r => /pollo/i.test(r.name));
    expect(patronesDeArranque(vistas, resp, { liked: [] }).some(x => x.id === 'alimento:pollo' && x.sentido === 'si')).toBe(true);
    expect(patronesDeArranque(vistas, resp, { liked: ['Pollo'] }).some(x => x.id === 'alimento:pollo')).toBe(false);
  });

  it('dijo que le gusta el pollo pero lo rechaza: se lo dice', () => {
    const resp = responder(r => !/pollo/i.test(r.name));
    const p = patronesDeArranque(vistas, resp, { liked: ['pollo'] }).find(x => x.id === 'alimento:pollo');
    expect(p?.titulo).toContain('dijiste que te gusta');
  });

  it('a quien dice sí a casi todo no se le pregunta por lo que acepta', () => {
    const resp = responder(r => !/salm|merluza|at[uú]n|pescado/i.test(r.name));
    const p = patronesDeArranque(vistas, resp, { liked: [] });
    expect(p.every(x => x.sentido === 'no')).toBe(true);
  });

  it('alimento y tipo de plato sobre los mismos platos: una sola pregunta', () => {
    const sopas = ['Sopa de fideos', 'Sopa de verduras', 'Crema de calabaza', 'Crema de puerros', 'Sopa de pollo']
      .map(nm => receta(nm, ['Caldo', 'Calabacín']));
    const otras = ['Arroz blanco', 'Pasta sola', 'Tostada', 'Yogur', 'Ensalada verde', 'Bocadillo'].map(nm => receta(nm, ['Pan']));
    const v: RecetaDeArranque[] = [...sopas, ...otras].map(recipe => ({ recipe, tanda: 'cena', gustos: [] }));
    const resp = v.map(x => ({ recipeId: x.recipe.id, gusta: !sopas.includes(x.recipe) }));
    const p = patronesDeArranque(v, resp, { liked: [] });
    expect(p.filter(x => x.sentido === 'no')).toHaveLength(1);
  });

  it('con menos de cuatro apariciones no pregunta', () => {
    const resp = responder(() => true).slice(0, 3);
    expect(patronesDeArranque(vistas, resp, { liked: [] })).toHaveLength(0);
  });
});

describe('arranque de gustos: resultado', () => {
  const resp: RespuestaDeArranque[] = [{ recipeId: 'a', gusta: true }, { recipeId: 'b', gusta: false }];
  const patron = { id: 'alimento:pescado azul', tipo: 'alimento' as const, sentido: 'no' as const, si: 0, total: 4, titulo: '', detalle: '', opciones: [], alimentos: ['salmón', 'atún'] };

  it('lo confirmado pasa a «no quiero» y sale de lo que le gusta', () => {
    const r = resultadoDeArranque(resp, [patron], { [patron.id]: 'noQuiero' }, { likedFoods: ['Salmón', 'pollo'], dislikedFoods: ['coliflor'] }, '2026-11-16');
    expect(r.dislikedFoods).toEqual(['coliflor', 'salmón', 'atún']);
    expect(r.likedFoods).toEqual(['pollo']);
    expect(r.cambianAlimentos).toBe(true);
    expect(r.arranque).toEqual({ si: ['a'], no: ['b'], hechoEn: '2026-11-16' });
  });

  it('sin confirmar no toca nada firme', () => {
    const r = resultadoDeArranque(resp, [patron], { [patron.id]: 'nada' }, { likedFoods: ['pollo'], dislikedFoods: [] }, '2026-11-16');
    expect(r.cambianAlimentos).toBe(false);
    expect(r.cambiaConfig).toBe(false);
  });

  it('repetirlo corrige lo que vuelve a ver y conserva lo demás', () => {
    const r = resultadoDeArranque([{ recipeId: 'a', gusta: false }], [], {}, { arranque: { si: ['a', 'c'], no: ['b'], hechoEn: '2026-10-01' }, likedFoods: [], dislikedFoods: [] }, '2026-11-16');
    expect(r.arranque.si).toEqual(['c']);
    expect(r.arranque.no).toEqual(['b', 'a']);
  });

  it('tipo de plato y platos rápidos', () => {
    const tipo = { id: 'plato:sopa', tipo: 'plato' as const, sentido: 'no' as const, si: 0, total: 4, titulo: '', detalle: '', opciones: [], tipoDePlato: 'sopa' as const };
    const tiempo = { id: 'tiempo:largas', tipo: 'tiempo' as const, sentido: 'no' as const, si: 0, total: 4, titulo: '', detalle: '', opciones: [] };
    const r = resultadoDeArranque(resp, [tipo, tiempo], { 'plato:sopa': 'tipoExcluido', 'tiempo:largas': 'rapidas' }, { likedFoods: [], dislikedFoods: [], preferredDishTypes: ['sopa'] }, '2026-11-16');
    expect(r.excludedDishTypes).toEqual(['sopa']);
    expect(r.preferredDishTypes).toEqual([]);
    expect(r.quiereRapidas).toBe(true);
    expect(r.cambiaConfig).toBe(true);
  });
});
