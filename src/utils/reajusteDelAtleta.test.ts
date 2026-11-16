import { describe, it, expect } from 'vitest';
import type { MenuComplement, MenuDay, MenuMeal } from '../types';
import { macrosDeLaComida } from './menuMacros';
import { acotarExtrasDeComida } from './menuEngine';
import {
  anadirExtraDelAtleta, cambiarPlato, cambiarRacion, comidasFijas, conRacion, racionDe, racionesPosibles, aLoPautado, textoDeCambio,
  conComidaElegida, conIngrediente, ingredientesDeReceta, ingredientesVariables, mismoPlato,
} from './reajusteDelAtleta';

const plato = (id: string, name: string, slot: number, kcal: number, p: number, hc: number, g: number, scale = 1): MenuMeal => ({
  id, slot, name, recipeId: `r_${id}`, recipeName: `Receta ${name}`, scale,
  macros: { kcal, p, hc, g }, exch: { HC: 0, PROT: 0, GRASA: 0 }, kcal, complements: [],
  objetivoMacros: { kcal, p, hc, g },
});
const platano: MenuComplement = { foodLabel: 'Plátano', category: 'HC', quantity: 0, alimentoId: 'platano', gramos: 120, piezas: 1, unidad: 'unidad', macros: { kcal: 107, p: 1.3, hc: 24, g: 0.4 } };
const onza: MenuComplement = { foodLabel: 'Chocolate negro 85 %', category: 'GRASA', quantity: 0, alimentoId: 'choco', gramos: 20, piezas: 2, unidad: 'onza', macros: { kcal: 120, p: 2, hc: 4, g: 10 } };

function dia(): MenuDay {
  const meals = [
    plato('d', 'Desayuno', 1, 480, 28, 55, 16),
    plato('c', 'Comida', 3, 720, 52, 78, 22),
    { ...plato('m', 'Merienda', 4, 240, 20, 22, 8), complements: [platano] },
    plato('n', 'Cena', 5, 600, 45, 55, 22),
  ];
  const t = meals.map(macrosDeLaComida).reduce((a, m) => ({ kcal: a.kcal + m.kcal, p: a.p + m.p, hc: a.hc + m.hc, g: a.g + m.g }));
  return { day: 'mon', dietId: 'x', target: { HC: 0, PROT: 0, GRASA: 0 }, objetivo: t, meals };
}
const kcalDia = (d: MenuDay) => d.meals.reduce((s, m) => s + macrosDeLaComida(m).kcal, 0);

describe('reajuste del día por el atleta', () => {
  it('más desayuno: el resto cede y el día sigue cuadrado', () => {
    const d = dia();
    const r = cambiarRacion(d, 'd', 1.5, comidasFijas(d));
    expect(racionDe(r.dia.meals[0])).toBe(1.5);
    expect(r.dia.meals[0].racionDelAtleta).toBe(true);
    expect(r.estado).toBe('cuadra');
    expect(Math.abs(kcalDia(r.dia) - kcalDia(d))).toBeLessThanOrEqual(50);
    expect(r.cambios.length).toBeGreaterThan(0);
    expect(r.cambios.every(c => c.mealId !== 'd')).toBe(true);
  });

  it('primero se van los extras de cuadrar, antes que tocar platos', () => {
    const d = dia();
    const r = cambiarRacion(d, 'd', 1.25, comidasFijas(d));
    expect(r.cambios).toHaveLength(1);
    expect(r.cambios[0].extrasQuitados).toEqual(['Plátano']);
    expect(r.cambios[0].racionAntes).toBe(r.cambios[0].racionDespues);
  });

  it('menos desayuno: sube la ración de otra comida', () => {
    const d = dia();
    const r = cambiarRacion(d, 'd', 0.5, comidasFijas(d));
    expect(r.cambios.some(c => c.racionDespues > c.racionAntes)).toBe(true);
    expect(r.estado).toBe('cuadra');
  });

  it('lo ya comido no se toca; sin margen, lo dice', () => {
    const d = dia();
    const r = cambiarRacion(d, 'n', 1.5, comidasFijas(d, ['d', 'c', 'm']));
    expect(r.cambios).toHaveLength(0);
    expect(r.estado).toBe('pasado');
    expect(r.sinMargen).toBe(true);
    expect(r.desvioKcal).toBe(300);
  });

  it('un capricho entra entero y el día sigue cuadrado', () => {
    const d = dia();
    const r = anadirExtraDelAtleta(d, 'n', onza, comidasFijas(d, ['d']));
    const cena = r.dia.meals[3];
    expect(cena.complements.some(c => c.delAtleta && c.foodLabel === onza.foodLabel)).toBe(true);
    expect(r.estado).toBe('cuadra');
    expect(r.dia.meals[0]).toBe(d.meals[0]); // el desayuno, ya comido, intacto
  });

  it('la proteína no baja del mínimo: antes se queda pasado', () => {
    const d = dia();
    const r = cambiarRacion(d, 'd', 3, comidasFijas(d));
    expect(r.proteina.despues).toBeGreaterThanOrEqual(Math.floor(r.proteina.objetivo * 0.9));
  });

  it('una ración elegida antes sigue fija en el reajuste siguiente', () => {
    const d = dia();
    const uno = cambiarRacion(d, 'd', 1.25, comidasFijas(d));
    const dos = cambiarRacion(uno.dia, 'c', 1.25, comidasFijas(uno.dia));
    expect(racionDe(dos.dia.meals[0])).toBe(1.25);
    expect(dos.cambios.every(c => c.mealId !== 'd')).toBe(true);
  });

  it('la capa de escritura no recorta lo que eligió el atleta', () => {
    const d = dia();
    const r = anadirExtraDelAtleta(d, 'm', onza, comidasFijas(d));
    for (const m of r.dia.meals) expect(acotarExtrasDeComida(m).recortado).toBe(false);
  });

  it('receta ajustada por ingredientes: la ración va en los gramos', () => {
    const m: MenuMeal = { ...plato('a', 'Comida', 3, 600, 40, 60, 20), ajuste: { gramos: [{ n: 0, gramos: 80 }, { n: 1, gramos: 150 }], cambios: [] } };
    const mas = conRacion(m, 1.25, true);
    expect(mas.scale).toBe(1);
    expect(mas.ajuste!.gramos).toEqual([{ n: 0, gramos: 100 }, { n: 1, gramos: 188 }]);
    expect(racionDe(mas)).toBe(1.25);
    expect(aLoPautado(mas).ajuste!.gramos).toEqual(m.ajuste!.gramos);
  });

  it('raciones posibles: un plato pequeño no baja de ¾', () => {
    expect(racionesPosibles(plato('p', 'Merienda', 4, 200, 10, 20, 8))[0]).toBe(0.75);
  });

  it('cambiar de plato: si el nuevo es mayor, el resto cede; lo de la receta anterior se cae', () => {
    const d = dia();
    const conRacionPropia = cambiarRacion(d, 'c', 1.25, comidasFijas(d)).dia;
    const nuevo: MenuMeal = { ...conRacionPropia.meals[1], recipeId: 'r_otra', recipeName: 'Pasta boloñesa', scale: 1, macros: { kcal: 950, p: 50, hc: 110, g: 32 } };
    const r = cambiarPlato(d, 'c', nuevo, comidasFijas(d));
    expect(r.dia.meals[1].pautado).toBeUndefined();
    expect(r.dia.meals[1].racionDelAtleta).toBeUndefined();
    expect(r.cambios.length).toBeGreaterThan(0);
    expect(r.estado).toBe('cuadra');
    expect(acotarExtrasDeComida(r.dia.meals[1]).recortado).toBe(false);
  });

  it('cambiar a un plato mayor sin que nadie pueda ceder: al guardar no se pierde el extra', () => {
    const d = dia();
    const merienda = d.meals[2];
    const mayor = { ...merienda, recipeId: 'r_otro', recipeName: 'Otro', macros: { kcal: 280, p: 22, hc: 26, g: 10 }, kcal: 280 };
    // Todas las demás fijas: el reajuste no mueve nada y el día queda algo pasado.
    const r = cambiarPlato(d, 'm', mayor, new Set(['d', 'c', 'n']));
    expect(r.cambios).toHaveLength(0);
    const guardada = acotarExtrasDeComida(r.dia.meals[2]);
    expect(guardada.recortado).toBe(false);
    expect(guardada.meal.complements).toHaveLength(1);
  });

  it('cambiar de plato por uno equivalente no mueve nada', () => {
    const d = dia();
    const nuevo: MenuMeal = { ...d.meals[1], recipeId: 'r_otra', recipeName: 'Pasta con atún', macros: { kcal: 700, p: 50, hc: 80, g: 20 } };
    const r = cambiarPlato(d, 'c', nuevo, comidasFijas(d));
    expect(r.cambios).toHaveLength(0);
    expect(r.estado).toBe('cuadra');
  });

  it('texto del cambio', () => {
    expect(textoDeCambio({ mealId: 'n', comida: 'Cena', receta: 'x', kcalAntes: 600, kcalDespues: 450, racionAntes: 1, racionDespues: 0.75, extrasQuitados: [] })).toBe('Cena ×1 → ×0,75 (−150 kcal)');
  });
});

/* Cena vinculada al catálogo: salmón 160 g, patata 250 g, brócoli 150 g, aceite 5 g. */
const RECETA_CENA = ingredientesDeReceta({
  ingredientsText: [{ name: 'Salmón', quantity: 160 }, { name: 'Patata', quantity: 250 }, { name: 'Brócoli', quantity: 150 }, { name: 'Aceite de oliva', quantity: 5 }, { name: 'Sal', quantity: 2 }],
  vinculo: {
    calculadoEn: '2026-11-16',
    ingredientes: [
      { n: 0, alimentoId: 'salmon', gramos: 160, min: 100, max: 220, palanca: 'proteina', porCien: { kcal: 200, p: 20, hc: 0, g: 13 } },
      { n: 1, alimentoId: 'patata', gramos: 250, min: 100, max: 400, palanca: 'hc', porCien: { kcal: 80, p: 2, hc: 17, g: 0.1 } },
      { n: 2, alimentoId: 'brocoli', gramos: 150, min: 100, max: 250, porCien: { kcal: 34, p: 2.8, hc: 4, g: 0.4 } },
      { n: 3, alimentoId: 'aceite', gramos: 5, min: 0, max: 15, palanca: 'grasa', porCien: { kcal: 900, p: 0, hc: 0, g: 100 } },
      { n: 4, alimentoId: null, gramos: 2, min: 2, max: 2 },
    ],
  },
} as never)!;
const gramosDe = (m: MenuMeal) => Object.fromEntries(ingredientesVariables(m, RECETA_CENA).map(i => [i.nombre, i.gramos]));

function diaVinculado(): MenuDay {
  const d = dia();
  // 320 + 200 + 51 + 45 kcal
  const cena = plato('n', 'Cena', 5, 616, 41.2, 48.5, 26.7);
  const meals = d.meals.map(m => (m.id === 'n' ? cena : m));
  const t = meals.map(macrosDeLaComida).reduce((a, m) => ({ kcal: a.kcal + m.kcal, p: a.p + m.p, hc: a.hc + m.hc, g: a.g + m.g }));
  return { ...d, objetivo: t, meals };
}

describe('los ingredientes del plato', () => {
  it('solo se mueven los que cuentan, con su paso y su tope', () => {
    const cena = diaVinculado().meals[3];
    const lista = ingredientesVariables(cena, RECETA_CENA, 0.25);
    expect(lista.map(i => i.nombre)).toEqual(['Salmón', 'Patata', 'Brócoli', 'Aceite de oliva']);
    const patata = lista[1];
    expect([patata.gramos, patata.paso, patata.min, patata.max]).toEqual([250, 25, 200, 300]);
    expect([lista[3].paso, lista[3].min, lista[3].max]).toEqual([1, 4, 6]);
    // Sin tope: de quitarlo al triple.
    const libre = ingredientesVariables(cena, RECETA_CENA)[1];
    expect([libre.min, libre.max]).toEqual([0, 750]);
  });

  it('más patata: suben las kcal del plato, la ración no cambia y queda fijo', () => {
    const cena = diaVinculado().meals[3];
    const con = conIngrediente(cena, RECETA_CENA, 1, 300);
    expect(gramosDe(con)).toEqual({ 'Salmón': 160, 'Patata': 300, 'Brócoli': 150, 'Aceite de oliva': 5 });
    expect(Math.round(con.macros!.kcal)).toBe(656);
    expect(con.macros!.hc).toBeCloseTo(57, 0);
    expect(racionDe(con)).toBe(1);
    expect(con.racionDelAtleta).toBe(true);
    expect(mismoPlato(con, cena)).toBe(false);
    // Lo que se guarda para la ficha y la lista de la compra.
    expect(con.ajuste!.gramos.find(g => g.n === 1)!.gramos).toBe(300);
    expect(con.ajuste!.gramos.some(g => g.n === 4)).toBe(false);
  });

  it('la ración escala el plato entero sin deshacer la mezcla', () => {
    const cena = diaVinculado().meals[3];
    const grande = conRacion(conIngrediente(cena, RECETA_CENA, 1, 300), 1.5);
    expect(racionDe(grande)).toBe(1.5);
    expect(gramosDe(grande)).toEqual({ 'Salmón': 240, 'Patata': 450, 'Brócoli': 225, 'Aceite de oliva': 8 });
    expect(Math.round(grande.macros!.kcal)).toBe(984);
    // Y a esa ración, un ingrediente se pone en los gramos que ve el atleta.
    const menosAceite = conIngrediente(grande, RECETA_CENA, 3, 3);
    expect(gramosDe(menosAceite)['Aceite de oliva']).toBe(3);
    expect(gramosDe(menosAceite)['Patata']).toBe(450);
  });

  it('volver a los gramos pautados deja el plato como estaba', () => {
    const cena = diaVinculado().meals[3];
    const ida = conIngrediente(cena, RECETA_CENA, 1, 300);
    const vuelta = conIngrediente(ida, RECETA_CENA, 1, 250);
    expect(vuelta.mezcla).toBeUndefined();
    expect(vuelta.ajuste).toBeUndefined();
    expect(vuelta.macros!.kcal).toBe(616);
    expect(aLoPautado(ida).mezcla).toBeUndefined();
  });

  it('el resto del día compensa lo que mueve un ingrediente', () => {
    const d = diaVinculado();
    const cena = conIngrediente(d.meals[3], RECETA_CENA, 0, 60); // casi sin salmón: −200 kcal
    const r = conComidaElegida(d, cena, comidasFijas(d));
    expect(r.cambios.length).toBeGreaterThan(0);
    expect(r.cambios.every(c => c.mealId !== 'n')).toBe(true);
    expect(r.estado).toBe('cuadra');
  });
});

describe('un capricho se descuenta primero de su propia comida', () => {
  it('con receta vinculada ceden los hidratos y la grasa, no la proteína, y el resto del día no se toca', () => {
    const d = diaVinculado();
    const r = anadirExtraDelAtleta(d, 'n', onza, comidasFijas(d), undefined, RECETA_CENA);
    const cena = r.dia.meals[3];
    expect(gramosDe(cena)['Salmón']).toBe(160);
    expect(gramosDe(cena)['Brócoli']).toBe(150);
    expect(gramosDe(cena)['Patata']).toBeLessThan(250);
    expect(r.enSuComida!.ingredientes.map(i => i.nombre)).toContain('Patata');
    expect(r.enSuComida!.kcalAntes - r.enSuComida!.kcalDespues).toBeGreaterThan(80);
    expect(r.cambios).toHaveLength(0);
    expect(r.estado).toBe('cuadra');
    expect(cena.complements.some(c => c.delAtleta)).toBe(true);
    expect(Math.abs(kcalDia(r.dia) - kcalDia(d))).toBeLessThanOrEqual(50);
  });

  it('sin receta vinculada baja el plato entero', () => {
    const d = dia();
    const r = anadirExtraDelAtleta(d, 'n', onza, comidasFijas(d));
    expect(r.enSuComida).toMatchObject({ racionAntes: 1, racionDespues: 0.75, ingredientes: [] });
    expect(r.estado).toBe('cuadra');
  });

  it('lo que su plato no puede ceder lo reparte el resto del día', () => {
    const d = diaVinculado();
    const helado: MenuComplement = { ...onza, foodLabel: 'Helado', macros: { kcal: 330, p: 20, hc: 30, g: 14 } };
    const r = anadirExtraDelAtleta(d, 'n', helado, comidasFijas(d), undefined, RECETA_CENA);
    // Patata y aceite no bajan de la mitad de lo pautado.
    expect(gramosDe(r.dia.meals[3])['Patata']).toBeGreaterThanOrEqual(125);
    expect(r.cambios.length).toBeGreaterThan(0);
    expect(r.estado).toBe('cuadra');
  });

  it('si el día tenía hueco de sobra, no se recorta nada', () => {
    const d = diaVinculado();
    const conHueco = { ...d, objetivo: { ...d.objetivo!, kcal: d.objetivo!.kcal + 100 } };
    const r = anadirExtraDelAtleta(conHueco, 'n', onza, comidasFijas(conHueco), undefined, RECETA_CENA);
    expect(r.enSuComida).toBeUndefined();
    expect(r.cambios).toHaveLength(0);
  });

  it('una comida ya comida no se recorta: compensa el resto', () => {
    const d = diaVinculado();
    const r = anadirExtraDelAtleta(d, 'n', onza, comidasFijas(d, ['n']), undefined, RECETA_CENA);
    expect(r.enSuComida).toBeUndefined();
    expect(r.cambios.length).toBeGreaterThan(0);
  });
});
