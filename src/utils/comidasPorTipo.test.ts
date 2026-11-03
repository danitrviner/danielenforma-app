import { describe, it, expect } from 'vitest';
import type { Recipe } from '../types';
import { conComidasPorTipo, tipoParaComidas, tablaVigente, cambiosSobreDefecto, COMIDAS_POR_TIPO_DEFECTO } from './comidasPorTipo';
import { conComidasDelCoach } from '../db/recipes';

const r = (id: string, name: string, intakeTypes: number[] = [1, 2, 3, 4, 5]) => ({ id, name, intakeTypes }) as Recipe;
const comidas = (name: string, guardada?: Parameters<typeof conComidasPorTipo>[1]) => conComidasPorTipo([r('x', name)], guardada)[0].intakeTypes;

describe('qué tipo de plato va en cada comida', () => {
  it('nadie desayuna una hamburguesa ni come una pizza: solo cena', () => {
    expect(comidas('Hamburguesa de ternera con queso')).toEqual([5]);
    expect(comidas('Pizza de jamón y champiñones')).toEqual([5]);
    expect(comidas('Pan pizza con atún y tomates secos')).toEqual([5]);
    expect(comidas('Sándwich multicereal de hamburguesa vegetariana')).toEqual([2, 4]);
  });

  it('desayunos sencillos: avena, porridge, yogur, fruta, tostadas', () => {
    for (const n of ['Porridge de avena con arándanos y miel', 'Granola con frutos rojos', 'Yogur natural con nueces', 'Macedonia de fruta', 'Tostada con tomate y aceite']) {
      expect(comidas(n)).toContain(1);
    }
  });

  it('bocadillos, wraps y tortitas o crepes saladas fuera del desayuno', () => {
    expect(comidas('Bocadillo de lomo con tomate')).toEqual([2, 4]);
    expect(comidas('Wrap de atún')).toEqual([2, 4, 5]);
    expect(comidas('Crepe de pollo y queso')).toEqual([2, 4]);
    expect(tipoParaComidas({ name: 'Crepe de pollo y queso' })).toBe('Tortitas y crepes saladas');
    expect(tipoParaComidas({ name: 'Tortitas de avena con plátano' })).toBe('Desayunos: avena, tortitas y cereales');
  });

  it('platos de cuchara, carne y pescado a comida y cena', () => {
    expect(comidas('Lentejas estofadas')).toEqual([3, 5]);
    expect(comidas('Salmón al horno con verduras')).toEqual([3, 5]);
  });

  it('lo que cambia el coach en la tabla manda; una fila vacía no cuenta', () => {
    expect(comidas('Hamburguesa de pollo', { Hamburguesas: [3, 5] })).toEqual([3, 5]);
    expect(comidas('Hamburguesa de pollo', { Hamburguesas: [] })).toEqual([5]);
  });

  it('los tipos sin regla se quedan como vienen', () => {
    const [salsa] = conComidasPorTipo([r('s', 'Salsa de yogur', [3])]);
    expect(salsa.intakeTypes).toEqual([3]);
  });

  it('lo marcado en una receta concreta gana a la tabla', () => {
    const [h] = conComidasPorTipo([r('h', 'Hamburguesa de pollo')]);
    expect(conComidasDelCoach([h], { comidas: { h: [3] } })[0].intakeTypes).toEqual([3]);
  });

  it('solo guarda como cambio lo distinto a lo recomendado', () => {
    const t = tablaVigente({ Pastas: [3] });
    expect(cambiosSobreDefecto(t)).toEqual({ Pastas: [3] });
    expect(cambiosSobreDefecto(COMIDAS_POR_TIPO_DEFECTO)).toEqual({});
  });
});
