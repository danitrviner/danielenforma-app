import { describe, expect, it } from 'vitest';
import type { MealItem } from '../types';
import { SYSTEM_FOODS } from '../nutricion_seed_en_forma';
import { alimentoGeneral, alimentosGeneralesPorGrupo } from './alimentosGenerales';

const banco: MealItem[] = SYSTEM_FOODS.map((f, i) => ({ id: `f${i}`, ...f }));

describe('alimentos generales', () => {
  it('son los 310 del banco, repartidos por modo', () => {
    expect(banco).toHaveLength(310);
    const cuenta = (m: MealItem['mode']) =>
      alimentosGeneralesPorGrupo(banco, m).reduce((s, g) => s + g.alimentos.length, 0);
    expect(cuenta('OMNIVORO')).toBe(122);
    expect(cuenta('VEGANO')).toBe(76);
    expect(cuenta('SIN_PESAR')).toBe(112);
  });

  it('agrupa por Hidratos, Proteínas, Grasas y Mixtos, en ese orden', () => {
    expect(alimentosGeneralesPorGrupo(banco, 'OMNIVORO').map(g => g.titulo)).toEqual(['Hidratos', 'Proteínas', 'Grasas', 'Mixtos']);
  });

  it('una ración en gramos: nombre limpio, kcal por ración y por 100 g', () => {
    const arroz = alimentoGeneral({ id: 'a', mode: 'OMNIVORO', category: 'HC', label: '30g arroz, pasta, couscous o quinoa' });
    expect(arroz.nombre).toBe('Arroz, pasta, couscous o quinoa');
    expect(arroz.racion).toBe('30 g');
    expect(arroz.porRacion).toEqual({ kcal: 100, p: 0, hc: 25, g: 0 });
    expect(arroz.porCien).toEqual({ kcal: 333, p: 0, hc: 83.3, g: 0 });
  });

  it('«sin pesar»: medida casera y sin datos por 100 g', () => {
    const patata = alimentoGeneral({ id: 'p', mode: 'SIN_PESAR', category: 'HC', label: 'Patata → 1 patata mediana del tamaño de un puño' });
    expect(patata.nombre).toBe('Patata');
    expect(patata.racion).toBe('1 patata mediana del tamaño de un puño');
    expect(patata.gramosRacion).toBeNull();
    expect(patata.porCien).toBeNull();
    expect(patata.porRacion.kcal).toBe(100);
  });

  it('todos los alimentos con gramos tienen kcal por 100 g', () => {
    const conGramos = banco.map(alimentoGeneral).filter(a => a.gramosRacion != null);
    expect(conGramos.length).toBeGreaterThan(150);
    expect(conGramos.every(a => a.porCien && a.porCien.kcal > 0)).toBe(true);
  });
});
