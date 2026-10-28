import { describe, expect, it } from 'vitest';
import type { AlimentoCatalogo } from './catalogoAlimentos';
import {
  alimentoDelExtra, alimentosParaExtras, cabeExtra, elegirExtras, extraDeCatalogo, familiaDeExtra,
  gramosPosibles, gramosVecinos, macrosDeAlimento, recortarExtra, textoDeExtra,
} from './extrasDelCatalogo';

const PLATANO: AlimentoCatalogo = { id: 'platano-listo', nombre: 'Plátano', estado: 'listo', porCien: { kcal: 89, p: 1.1, hc: 22.8, g: 0.3 }, unidad: { nombre: 'unidad pequeña', gramos: 100 } };
const MANZANA: AlimentoCatalogo = { id: 'manzana-listo', nombre: 'Manzana', estado: 'listo', porCien: { kcal: 52, p: 0.3, hc: 13.8, g: 0.2 }, unidad: { nombre: 'unidad', gramos: 180 } };
const FRESAS: AlimentoCatalogo = { id: 'fresas-listo', nombre: 'Fresas', estado: 'listo', porCien: { kcal: 32, p: 0.7, hc: 7.7, g: 0.3 } };
const YOGUR: AlimentoCatalogo = { id: 'yogur-prot', nombre: 'Yogur alto en proteínas', estado: 'listo', porCien: { kcal: 57, p: 10, hc: 4, g: 0.2 }, unidad: { nombre: 'yogur', gramos: 120 } };
const NUECES: AlimentoCatalogo = { id: 'nueces-listo', nombre: 'Nueces', estado: 'listo', porCien: { kcal: 654, p: 15.2, hc: 13.7, g: 65.2 }, unidad: { nombre: 'puñado', gramos: 30 } };
const PAN: AlimentoCatalogo = { id: 'pan-listo', nombre: 'Pan', estado: 'listo', porCien: { kcal: 265, p: 9, hc: 49, g: 3.5 }, unidad: { nombre: 'rebanada', gramos: 30 } };
const ARROZ_CRUDO: AlimentoCatalogo = { id: 'arroz-crudo', nombre: 'Arroz blanco', estado: 'crudo', porCien: { kcal: 354, p: 7, hc: 78, g: 0.9 } };
const ZUMO: AlimentoCatalogo = { id: 'zumo', nombre: 'Zumo de naranja natural', porCien: { kcal: 45, p: 0.7, hc: 10.4, g: 0.2 } };
const MERMELADA: AlimentoCatalogo = { id: 'merm', nombre: 'Mermelada light de fresa', porCien: { kcal: 84, p: 0.5, hc: 20, g: 0 } };
const TODOS = [PLATANO, MANZANA, FRESAS, YOGUR, NUECES, PAN, ARROZ_CRUDO, ZUMO, MERMELADA];

describe('familiaDeExtra', () => {
  it('reconoce fruta, lácteo, pan y frutos secos y deja fuera lo que hay que cocinar o no es «de nevera»', () => {
    expect(familiaDeExtra(PLATANO)).toBe('fruta');
    expect(familiaDeExtra(YOGUR)).toBe('lacteo');
    expect(familiaDeExtra(PAN)).toBe('pan');
    expect(familiaDeExtra(NUECES)).toBe('frutoSeco');
    expect(familiaDeExtra(ARROZ_CRUDO)).toBeNull();
    expect(familiaDeExtra(ZUMO)).toBeNull();
    expect(familiaDeExtra(MERMELADA)).toBeNull();
  });
});

describe('extraDeCatalogo', () => {
  it('un plátano son 100 g con sus macros exactos, y se enseña como pieza', () => {
    const c = extraDeCatalogo(PLATANO, 100);
    expect(c).toMatchObject({ alimentoId: 'platano-listo', gramos: 100, piezas: 1, unidad: 'unidad pequeña', quantity: 0 });
    expect(c.macros).toEqual({ kcal: 89, p: 1.1, hc: 22.8, g: 0.3 });
    expect(textoDeExtra(c)).toBe('1 unidad pequeña Plátano · 100 g');
    expect(textoDeExtra(extraDeCatalogo(MANZANA, 270))).toBe('1½ Manzana · 270 g');
    expect(textoDeExtra(extraDeCatalogo(FRESAS, 150))).toBe('150 g de Fresas');
  });

  it('las cantidades van de media pieza en media pieza, o de 25 g en 25 g sin medida casera', () => {
    expect(gramosPosibles(PLATANO).slice(0, 4)).toEqual([50, 100, 150, 200]);
    expect(gramosPosibles(FRESAS).slice(0, 3)).toEqual([50, 75, 100]);
    expect(gramosVecinos(PLATANO, 100, 1)).toBe(150);
    expect(gramosVecinos(PLATANO, 50, -1)).toBeNull();
  });

  it('el extra se describe a sí mismo: de él se recupera el alimento para recortarlo sin catálogo', () => {
    const a = alimentoDelExtra(extraDeCatalogo(MANZANA, 270))!;
    expect(a.unidad).toEqual({ nombre: 'unidad', gramos: 180 });
    expect(a.porCien.kcal).toBeCloseTo(52, 0);
    expect(macrosDeAlimento(a, 180).hc).toBeCloseTo(13.8 * 1.8, 0);
  });
});

describe('alimentosParaExtras', () => {
  it('lo que le gusta va delante; alergias, «no me gusta» y condiciones quitan', () => {
    const lista = alimentosParaExtras(TODOS, { liked: ['manzana'], disliked: ['fresa'], allergies: ['nueces'], conditions: [66] });
    expect(lista[0].a.id).toBe('manzana-listo');
    const ids = lista.map(c => c.a.id);
    expect(ids).not.toContain('fresas-listo');
    expect(ids).not.toContain('nueces-listo');
    expect(ids).not.toContain('pan-listo');   // celiaquía
  });

  it('un vegano no recibe yogur de leche', () => {
    expect(alimentosParaExtras([YOGUR], { dietType: 'vegano' })).toHaveLength(0);
  });
});

describe('elegirExtras', () => {
  const candidatos = alimentosParaExtras(TODOS, {});

  it('para 46 g de hidratos elige dos plátanos enteros, no medias piezas raras', () => {
    const [c] = elegirExtras({ kcal: 190, p: 2, hc: 46, g: 1 }, candidatos, 1);
    expect(c.alimentoId).toBe('platano-listo');
    expect(c.piezas).toBe(2);
  });

  it('prefiere la fruta que le gusta aunque cubra un poco peor', () => {
    const conGusto = alimentosParaExtras(TODOS, { liked: ['manzana'] });
    const [c] = elegirExtras({ kcal: 100, p: 1, hc: 25, g: 1 }, conGusto, 1);
    expect(c.alimentoId).toBe('manzana-listo');
    expect(c.piezas).toBe(1);   // 180 g = 24,8 g HC
  });

  it('nunca se pasa de ningún macro más de 3 g: si no cabe ni media pieza, no pone nada', () => {
    expect(elegirExtras({ kcal: 20, p: 0, hc: 5, g: 0 }, candidatos)).toEqual([]);
    const [c] = elegirExtras({ kcal: 50, p: 0.5, hc: 12, g: 0.3 }, candidatos, 1);
    expect(c.macros!.hc).toBeLessThanOrEqual(15);
  });

  it('la proteína la tapa un yogur y la grasa un puñado de nueces', () => {
    const extras = elegirExtras({ kcal: 300, p: 10, hc: 4, g: 20 }, candidatos, 2);
    expect(extras.map(c => c.alimentoId)).toEqual(['yogur-prot', 'nueces-listo']);
  });
});

describe('cabeExtra / recortarExtra', () => {
  it('recorta de media en media hasta que cabe, y quita si ni media cabe', () => {
    const dos = extraDeCatalogo(PLATANO, 200);
    expect(cabeExtra({ kcal: 100, p: 2, hc: 25, g: 1 }, dos)).toBe(false);
    expect(recortarExtra({ kcal: 100, p: 2, hc: 25, g: 1 }, dos)?.piezas).toBe(1);
    expect(recortarExtra({ kcal: 10, p: 0, hc: 2, g: 0 }, dos)).toBeNull();
    expect(recortarExtra({ kcal: 300, p: 5, hc: 60, g: 2 }, dos)).toBe(dos);
  });
});
