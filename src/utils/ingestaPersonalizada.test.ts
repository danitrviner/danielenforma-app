import { describe, it, expect } from 'vitest';
import type { WeekDay } from '../types';
import {
  avisoDeRecetas, conCantidad, conDiaAlternado, extraDeAlimento, kcalDeExtra, modoDeRecetas,
  resumenDeRecetas, textoDeDias, textoDeExtraFijo, tocaElDia, type ExtraFijo,
} from './ingestaPersonalizada';

const TODOS: WeekDay[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const chocolate = { id: 'choc', nombre: 'Chocolate negro 85 %', porCien: { kcal: 600, p: 9, hc: 20, g: 50 }, unidad: { nombre: 'onza', gramos: 10 } };
const miel = { id: 'miel', nombre: 'Miel', porCien: { kcal: 304, p: 0, hc: 82, g: 0 } };

describe('extra fijo', () => {
  it('con medida casera empieza en una pieza', () => {
    const e = extraDeAlimento(chocolate);
    expect(textoDeExtraFijo(e)).toBe('1 onza de Chocolate negro 85 %');
    expect(kcalDeExtra(e)).toBe(60);
    expect(kcalDeExtra(conCantidad(e, 1.5))).toBe(90);
    expect(textoDeExtraFijo(conCantidad(e, 1.5))).toBe('1½ onza de Chocolate negro 85 %');
  });
  it('sin medida casera va en gramos, cerca de 100 kcal', () => {
    const e = extraDeAlimento(miel);
    expect(e.gramos).toBe(35);
    expect(kcalDeExtra(e)).toBe(106);
    expect(textoDeExtraFijo(e)).toBe('35 g de Miel');
  });
  it('no baja de media pieza', () => {
    expect(conCantidad(extraDeAlimento(chocolate), 0).piezas).toBe(0.5);
  });
});

describe('días del extra', () => {
  const e: ExtraFijo = extraDeAlimento(chocolate);
  it('sin días marcados toca siempre', () => {
    expect(tocaElDia(e, 'sun')).toBe(true);
    expect(textoDeDias(e.dias)).toBe('Todos los días');
  });
  it('quitar un día y volver a ponerlo lo deja en «todos»', () => {
    const sinDomingo = conDiaAlternado(e, 'sun', TODOS);
    expect(sinDomingo.dias).toEqual(['mon', 'tue', 'wed', 'thu', 'fri', 'sat']);
    expect(tocaElDia(sinDomingo, 'sun')).toBe(false);
    expect(conDiaAlternado(sinDomingo, 'sun', TODOS).dias).toBeUndefined();
  });
  it('lee los días como los diría el coach', () => {
    expect(textoDeDias(['mon', 'tue', 'wed', 'thu', 'fri'])).toBe('De lun a vie');
    expect(textoDeDias(['sat', 'sun'])).toBe('Sáb y dom');
    expect(textoDeDias(['mon', 'wed', 'fri'])).toBe('Lun, mié y vie');
    expect(textoDeDias([])).toBe('Ningún día');
  });
  it('no cuenta los días sin dieta', () => {
    expect(textoDeDias(undefined, ['mon', 'tue', 'wed'])).toBe('Todos los días');
    expect(textoDeDias(['mon', 'sun'], ['mon', 'tue', 'wed'])).toBe('Lun');
  });
});

describe('recetas de la ingesta', () => {
  const r = (n: number) => ({ recetas: Array.from({ length: n }, (_, i) => ({ id: `r${i}`, nombre: `R${i}` })) });
  it('distingue lista, cerradas y paquete', () => {
    expect(modoDeRecetas(undefined)).toBe('lista');
    expect(modoDeRecetas(r(2))).toBe('estas');
    expect(modoDeRecetas({ paqueteId: 'p1' })).toBe('paquete');
  });
  it('resume en una línea', () => {
    expect(resumenDeRecetas(undefined, () => undefined)).toBe('De su lista');
    expect(resumenDeRecetas(r(3), () => undefined)).toBe('3 recetas a elegir');
    expect(resumenDeRecetas(r(1), () => undefined)).toBe('Siempre la misma receta');
    expect(resumenDeRecetas({ paqueteId: 'p1' }, () => 'Desayunos rápidos')).toBe('Paquete Desayunos rápidos');
  });
  it('avisa de cuánto se repite', () => {
    expect(avisoDeRecetas(r(1), 7)).toBe('Comerá esto los 7 días.');
    expect(avisoDeRecetas(r(3), 7)).toBe('Rota entre estas 3: cada una sale 2–3 veces por semana.');
    expect(avisoDeRecetas(r(7), 7)).toBeNull();
    expect(avisoDeRecetas(undefined, 7)).toBeNull();
  });
});

describe('lo que se guarda por atleta', () => {
  it('guarda solo las comidas que llevan algo y lo vuelve a poner en su sitio', async () => {
    const { conIngestasAMedida, ingestasDeSlots, idsCerrados, complementoDeExtraFijo } = await import('./ingestaPersonalizada');
    const extra = extraDeAlimento(chocolate);
    const slots = [
      { slot: 1, name: 'Desayuno', pct: 30 },
      { slot: 4, name: 'Merienda', pct: 20, recetas: { recetas: [{ id: 'r1', nombre: 'Tostada' }] }, fruta: 'mas' as const },
      { slot: 5, name: 'Cena', pct: 50, extra },
    ];
    const guardadas = ingestasDeSlots(slots);
    expect(Object.keys(guardadas)).toEqual(['1_4', '2_5']);
    const deNuevo = conIngestasAMedida(slots.map(({ slot, name, pct }) => ({ slot, name, pct })), guardadas);
    expect(deNuevo).toEqual(slots);
    // Si cambia la estructura de comidas, lo guardado para otra posición no se aplica.
    expect(conIngestasAMedida([{ slot: 5, name: 'Cena', pct: 100 }], guardadas)).toEqual([{ slot: 5, name: 'Cena', pct: 100 }]);

    expect(idsCerrados(slots[1].recetas)).toEqual(['r1']);
    expect(idsCerrados({ recetas: [] })).toBeNull();
    expect(idsCerrados({ paqueteId: 'p' }, [{ id: 'p', nombre: 'P', recipeIds: ['a', 'b'] }])).toEqual(['a', 'b']);
    expect(complementoDeExtraFijo(extra)).toMatchObject({ foodLabel: 'Chocolate negro 85 %', alimentoId: 'choc', gramos: 10, piezas: 1, unidad: 'onza', obligatoria: true, fijo: true, category: 'GRASA', macros: { kcal: 60, g: 5 } });
  });
});
