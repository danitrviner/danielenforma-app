import { describe, it, expect } from 'vitest';
import { construirComidaDeLaSemana, totalesDeLaVentana } from './comidaDeLaSemana';
import type { Diet, DietCompletionLog, DietMeal } from '../types';

const CUPO = { HC: 12, PROT: 6, GRASA: 6, MIX_HC: 0, MIX_GRASA: 0 };

function comida(id: string, nombre: string, items: DietMeal['items'], slot?: number): DietMeal {
  return { id, name: nombre, items, slot };
}

/** Un día con desayuno (2 HC + 1 PROT) y comida (4 HC + 2 PROT + 2 GRASA). */
function diaTipo(date: string, marcados: string[]): DietCompletionLog {
  return {
    id: `log_${date}`,
    athleteId: 'ana@x.com',
    date,
    dietId: 'd1',
    doneItemIds: marcados,
    budget: CUPO,
    meals: [
      comida('m1', 'Desayuno', [
        { category: 'HC', foodLabel: '40g pan (de molde, tostado, con o sin semillas...)', quantity: 2 },
        { category: 'PROT', foodLabel: '2 huevos', quantity: 1, originRecipeId: 'r9' },
      ], 1),
      comida('m2', 'Comida', [
        { category: 'HC', foodLabel: '30g arroz, pasta, couscous o quinoa', quantity: 4 },
        { category: 'PROT', foodLabel: '100g pollo', quantity: 2, origenMenu: 'mon_m3' },
        { category: 'GRASA', foodLabel: '11g aceite de oliva', quantity: 2 },
      ], 3),
    ],
  };
}

describe('construirComidaDeLaSemana', () => {
  it('devuelve todos los días de la ventana, también los que no tienen registro', () => {
    const r = construirComidaDeLaSemana({
      logs: [diaTipo('2026-09-14', [])],
      diets: [],
      desde: '2026-09-14',
      hasta: '2026-09-16',
    });
    expect(r.dias.map(d => d.fecha)).toEqual(['2026-09-14', '2026-09-15', '2026-09-16']);
    expect(r.dias.map(d => d.registrado)).toEqual([true, false, false]);
    expect(r.patrones.diasSinRegistrar).toBe(2);
  });

  it('separa lo puesto de lo marcado', () => {
    // Solo marca el desayuno entero: 2 HC + 1 PROT.
    const r = construirComidaDeLaSemana({
      logs: [diaTipo('2026-09-14', ['m1_0', 'm1_1'])],
      diets: [], desde: '2026-09-14', hasta: '2026-09-14',
    });
    const dia = r.dias[0];
    // 2 HC + 1 PROT = 50 g HC + 25 g P = 300 kcal.
    expect(dia.comido).toEqual({ kcal: 300, p: 25, hc: 50, g: 0 });
    expect(dia.puesto).toEqual({ kcal: 1098, p: 75, hc: 150, g: 22 });
    expect(dia.items).toBe(5);
    expect(dia.itemsMarcados).toBe(2);
    // 300 kcal comidas contra un objetivo de 2.394.
    expect(dia.desvio).toBe(-2094);
  });

  it('un día viejo cuenta las kcal con las equivalencias de siempre', () => {
    const r = construirComidaDeLaSemana({
      logs: [diaTipo('2026-09-14', ['m1_0', 'm1_1', 'm2_0', 'm2_1', 'm2_2'])],
      diets: [], desde: '2026-09-14', hasta: '2026-09-14',
    });
    const dia = r.dias[0];
    expect(dia.comido).toEqual({ kcal: 1098, p: 75, hc: 150, g: 22 });
    // 6 HC×25g×4 + 3 PROT×25g×4 + 2 GRASA×11g×9 = 600 + 300 + 198
    expect(dia.kcalComido).toBe(1098);
    expect(dia.kcalCupo).toBe(2394);
  });

  it('reconoce de dónde viene cada línea', () => {
    const r = construirComidaDeLaSemana({
      logs: [diaTipo('2026-09-14', [])], diets: [], desde: '2026-09-14', hasta: '2026-09-14',
    });
    const [desayuno, almuerzo] = r.dias[0].comidas;
    expect(desayuno.items.map(i => i.origen)).toEqual(['mano', 'receta']);
    expect(almuerzo.items.map(i => i.origen)).toEqual(['mano', 'menu', 'mano']);
    expect(r.patrones.porOrigen).toEqual({ mano: 3, receta: 1, menu: 1 });
  });

  it('enseña el peso real de cada alimento y el nombre sin los gramos', () => {
    const r = construirComidaDeLaSemana({
      logs: [diaTipo('2026-09-14', [])], diets: [], desde: '2026-09-14', hasta: '2026-09-14',
    });
    const pan = r.dias[0].comidas[0].items[0];
    expect(pan.peso).toBe('80 g');            // 40g × 2 intercambios
    expect(pan.gramos).toBe(80);
    expect(pan.etiqueta).toBe('pan');          // sin gramos ni paréntesis
    expect(pan.etiquetaCompleta).toContain('40g pan');
    expect(pan.macros).toEqual({ p: 0, hc: 50, g: 0 });
  });

  /* Dani, 24-11-2026: «pan tostado» salía dos veces, con «×1» y «×0,5» y sin
     gramos. Es un producto de Open Food Facts guardado en dos líneas por
     categoría enlazadas por `lineaId` (copiado de un registro real). */
  it('un producto repartido en categorías sale en UNA fila, con sus gramos y sus kcal', () => {
    const ln = 'ln_mwotmisf_vudme';
    const off = { tipo: 'off' as const, codigo: '20303488' };
    const log: DietCompletionLog = {
      id: 'l', athleteId: 'ana@x.com', date: '2026-11-20', dietId: 'd1',
      doneItemIds: ['m1_0', 'm1_1', 'm1_2'],
      budget: CUPO,
      meals: [comida('m1', 'Desayuno', [
        { category: 'HC', foodLabel: 'Pan Tostado con harina de trigo y integral de trigo', quantity: 1, origen: off, lineaId: ln, gramos: 37.5, marca: 'Hacendado', nutrientes: { kcal: 150, p: 4.1, hc: 23.3, g: 3.4 } },
        { category: 'GRASA', foodLabel: 'Pan Tostado con harina de trigo y integral de trigo', quantity: 0.5, origen: off, lineaId: ln },
        { category: 'HC', foodLabel: 'pan (ración extra)', quantity: 5, baseGrams: 40, origenMenu: 'thu_thu_m3' },
      ])],
    };
    const r = construirComidaDeLaSemana({ logs: [log], diets: [], desde: '2026-11-20', hasta: '2026-11-20' });
    const dia = r.dias[0];
    const [tostado, extra] = dia.comidas[0].items;

    expect(dia.comidas[0].items).toHaveLength(2);
    expect(tostado).toMatchObject({
      etiqueta: 'Pan Tostado con harina de trigo y integral de trigo',
      marca: 'Hacendado', peso: '38 g', gramos: 38, kcal: 150,
      macros: { p: 4.1, hc: 23.3, g: 3.4 }, marcado: true, tipo: 'producto',
    });
    // La ración extra del menú no lleva gramos en el nombre: salen de `baseGrams`.
    expect(extra).toMatchObject({ peso: '200 g', gramos: 200, origen: 'menu' });
    // Las filas suman lo que dice la cabecera de la comida.
    expect(dia.comidas[0].items.reduce((s, i) => s + (i.kcal ?? 0), 0)).toBe(dia.comidas[0].comido.kcal);
    expect(dia.items).toBe(2);
    expect(dia.itemsMarcados).toBe(2);
  });

  it('un plato entero del recetario dice sus raciones, y un producto sin datos no se pinta como 0 kcal', () => {
    const log: DietCompletionLog = {
      id: 'l', athleteId: 'ana@x.com', date: '2026-11-20', dietId: 'd1',
      doneItemIds: ['m1_0', 'm1_1', 'm1_2'],
      budget: CUPO,
      meals: [comida('m1', 'Cena', [
        { category: 'HC', foodLabel: 'Pollo al curry', quantity: 3, originRecipeId: 'r1', escala: 1.5 },
        { category: 'PROT', foodLabel: 'Pollo al curry', quantity: 3, originRecipeId: 'r1', escala: 1.5 },
        { category: 'PROT', foodLabel: 'Panini', quantity: 1, lineaId: 'ln_x', origen: { tipo: 'off', codigo: '1' }, gramos: 90, nutrientes: null },
      ])],
    };
    const [plato, panini] = construirComidaDeLaSemana({ logs: [log], diets: [], desde: '2026-11-20', hasta: '2026-11-20' })
      .dias[0].comidas[0].items;
    expect(plato).toMatchObject({ etiqueta: 'Pollo al curry', peso: '1,5 raciones', tipo: 'plato', origen: 'receta' });
    expect(plato.kcal).toBeGreaterThan(0);
    expect(panini).toMatchObject({ peso: '90 g', kcal: null, macros: null });
  });

  it('un día sin cupo no cuenta como pasado ni como corto', () => {
    const sinCupo: DietCompletionLog = {
      ...diaTipo('2026-09-14', ['m1_0']),
      budget: { HC: 0, PROT: 0, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0 },
    };
    const r = construirComidaDeLaSemana({ logs: [sinCupo], diets: [], desde: '2026-09-14', hasta: '2026-09-14' });
    expect(r.patrones.diasRegistrados).toBe(1);
    expect(r.patrones.diasPorEncima).toBe(0);
    expect(r.patrones.diasPorDebajo).toBe(0);
    expect(r.patrones.diasEnObjetivo).toBe(0);
  });

  it('marca los días que se pasan del cupo', () => {
    const pasado: DietCompletionLog = {
      id: 'l', athleteId: 'ana@x.com', date: '2026-09-14', dietId: 'd1',
      doneItemIds: ['m1_0'],
      budget: { HC: 2, PROT: 0, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0 },
      meals: [comida('m1', 'Comida', [{ category: 'HC', foodLabel: '30g arroz', quantity: 8 }])],
    };
    const r = construirComidaDeLaSemana({ logs: [pasado], diets: [], desde: '2026-09-14', hasta: '2026-09-14' });
    // 8 HC = 800 kcal contra 2 HC = 200 kcal.
    expect(r.dias[0].desvio).toBe(600);
    expect(r.patrones.diasPorEncima).toBe(1);
  });

  it('cuenta los alimentos que más repite, por días y por veces', () => {
    const r = construirComidaDeLaSemana({
      logs: [diaTipo('2026-09-14', []), diaTipo('2026-09-15', [])],
      diets: [], desde: '2026-09-14', hasta: '2026-09-15',
    });
    const pan = r.patrones.alimentosFrecuentes.find(a => a.etiqueta === 'pan');
    expect(pan).toEqual({ etiqueta: 'pan', veces: 2, dias: 2 });
  });

  it('con dos registros del mismo día manda el guardado más tarde', () => {
    const viejo: DietCompletionLog = { ...diaTipo('2026-09-14', []), updatedAt: '2026-09-14T08:00:00.000Z' };
    const nuevo: DietCompletionLog = {
      ...diaTipo('2026-09-14', ['m1_0', 'm1_1']), updatedAt: '2026-09-14T21:00:00.000Z',
    };
    const r = construirComidaDeLaSemana({ logs: [viejo, nuevo], diets: [], desde: '2026-09-14', hasta: '2026-09-14' });
    expect(r.dias[0].itemsMarcados).toBe(2);
  });

  it('cae a la dieta para los días anteriores a que se congelaran las comidas', () => {
    const dieta: Diet = {
      id: 'd1', athleteId: 'ana@x.com', name: 'Día alto', budget: CUPO,
      meals: [comida('m1', 'Comida', [{ category: 'HC', foodLabel: '30g arroz', quantity: 3 }])],
    };
    const viejo: DietCompletionLog = {
      id: 'l', athleteId: 'ana@x.com', date: '2026-08-01', dietId: 'd1', doneItemIds: ['m1_0'],
    };
    const r = construirComidaDeLaSemana({ logs: [viejo], diets: [dieta], desde: '2026-08-01', hasta: '2026-08-01' });
    expect(r.dias[0].comido).toEqual({ kcal: 300, p: 0, hc: 75, g: 0 });
    expect(r.dias[0].cupo).toEqual({ kcal: 2394, p: 150, hc: 300, g: 66 });
  });

  it('los ingredientes mixtos se reparten entre sus dos categorías', () => {
    const conMix: DietCompletionLog = {
      id: 'l', athleteId: 'ana@x.com', date: '2026-09-14', dietId: 'd1', doneItemIds: ['m1_0'],
      budget: CUPO,
      meals: [comida('m1', 'Comida', [{ category: 'MIX_HC', foodLabel: '200g yogur', quantity: 2 }])],
    };
    const r = construirComidaDeLaSemana({ logs: [conMix], diets: [], desde: '2026-09-14', hasta: '2026-09-14' });
    expect(r.dias[0].comido).toEqual({ kcal: 200, p: 25, hc: 25, g: 0 });
  });

  it('suma la ventana entera sin contar los días sin registro', () => {
    const r = construirComidaDeLaSemana({
      logs: [diaTipo('2026-09-14', ['m1_0']), diaTipo('2026-09-15', ['m1_0'])],
      diets: [], desde: '2026-09-14', hasta: '2026-09-17',
    });
    const { comido, cupo } = totalesDeLaVentana(r);
    expect(comido).toEqual({ kcal: 400, p: 0, hc: 100, g: 0 });
    expect(cupo).toEqual({ kcal: 4788, p: 300, hc: 600, g: 132 });
  });

  it('deja fuera los registros que caen fuera de la ventana', () => {
    const r = construirComidaDeLaSemana({
      logs: [diaTipo('2026-09-01', ['m1_0']), diaTipo('2026-09-14', ['m1_0'])],
      diets: [], desde: '2026-09-14', hasta: '2026-09-14',
    });
    expect(r.dias).toHaveLength(1);
    expect(r.patrones.diasRegistrados).toBe(1);
  });
});
