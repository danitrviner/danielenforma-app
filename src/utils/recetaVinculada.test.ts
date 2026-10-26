import { describe, it, expect } from 'vitest';
import type { AlimentoCatalogo } from './catalogoAlimentos';
import {
  calcularIngredientes, macrosCrudos, aplicarVinculo, mismoResultado, emparejar, propuestaDeRango,
  filasDePropuesta, leerVinculos, leerRecetasNuevas, recetaCrudaNueva, esIngredienteQueNoCuenta, vinculoAutomatico,
  COLUMNAS_VINCULOS, COLUMNAS_RECETAS_NUEVAS, type RecetaCruda, type IngredienteVinculado,
} from './recetaVinculada';

const ARROZ: AlimentoCatalogo = { id: 'arroz-crudo', nombre: 'Arroz blanco', estado: 'crudo', porCien: { kcal: 354, p: 7, hc: 78, g: 0.9 } };
const ARROZ_COCIDO: AlimentoCatalogo = { id: 'arroz-cocido', nombre: 'Arroz blanco', estado: 'cocido', porCien: { kcal: 130, p: 2.7, hc: 28, g: 0.3 } };
const POLLO: AlimentoCatalogo = { id: 'pechuga-pollo', nombre: 'Pechuga de pollo', porCien: { kcal: 110, p: 23, hc: 0, g: 1.5 } };
const TOMATE: AlimentoCatalogo = { id: 'tomate-frito', nombre: 'Tomate frito', porCien: { kcal: 80, p: 1.5, hc: 9, g: 4 } };
const ACEITE: AlimentoCatalogo = { id: 'aceite-oliva', nombre: 'Aceite de oliva', porCien: { kcal: 900, p: 0, hc: 0, g: 100 } };
const HUEVO: AlimentoCatalogo = { id: 'huevo', nombre: 'Huevo', porCien: { kcal: 145, p: 12.5, hc: 0.7, g: 10.6 }, unidad: { nombre: 'huevo', gramos: 55 } };
const LISTA = [ARROZ, ARROZ_COCIDO, POLLO, TOMATE, ACEITE, HUEVO];
const CATALOGO = new Map(LISTA.map(a => [a.id, a]));

const receta = (): RecetaCruda => ({
  id: 'r1', name: 'Arroz con pollo y tomate frito',
  ingredients: [{ name: 'Arroz (en crudo)', quantity: 90 }, { name: 'Pechuga de pollo', quantity: 150 }, { name: 'Tomate frito', quantity: 80 }, { name: 'Sal', quantity: 1 }],
  macros: { carbohydrate: { grams: 77, percentage: 57 }, protein: { grams: 42, percentage: 31 }, fat: { grams: 7, percentage: 12 } },
  kcal: 544, weight: 320,
});
const ings = (): IngredienteVinculado[] => [
  { n: 0, alimentoId: 'arroz-crudo', gramos: 90, min: 45, max: 180, palanca: 'hc' },
  { n: 1, alimentoId: 'pechuga-pollo', gramos: 150, min: 75, max: 300, palanca: 'proteina' },
  { n: 2, alimentoId: 'tomate-frito', gramos: 80, min: 80, max: 80, fijo: true },
  { n: 3, alimentoId: null, gramos: 1, min: 1, max: 1, fijo: true },
];

describe('cálculo', () => {
  it('kcal y macros = suma de los ingredientes (la sal no cuenta)', () => {
    const r = calcularIngredientes(ings(), CATALOGO);
    // arroz 318,6 + pollo 165 + tomate 64 = 547,6
    expect(r).toEqual({ ok: true, kcal: 548, p: 42, hc: 77.4, g: 6.3, gramos: 321 });
  });

  it('si falta un alimento en el catálogo no se calcula', () => {
    const r = calcularIngredientes([{ n: 0, alimentoId: 'no-existe', gramos: 10, min: 10, max: 10 }], CATALOGO);
    expect(r).toEqual({ ok: false, faltan: ['no-existe'] });
  });

  it('porcentajes por energía que suman 100', () => {
    const m = macrosCrudos(42, 77.4, 6.3);
    expect(m.carbohydrate.percentage + m.protein.percentage + m.fat.percentage).toBe(100);
    expect(m.carbohydrate.grams).toBe(77);
  });

  it('aplicar recalcula, guarda el «antes» una sola vez y no muta la receta', () => {
    const original = receta();
    const a = aplicarVinculo(original, ings(), CATALOGO, 't1');
    expect(original.kcal).toBe(544);
    expect(a.receta.kcal).toBe(548);
    expect(a.receta.weight).toBe(321);
    expect(a.receta.vinculo?.antes?.kcal).toBe(544);
    // Cambia el catálogo y se recalcula: el «antes» sigue siendo el original.
    const polloGraso = new Map(CATALOGO).set('pechuga-pollo', { ...POLLO, porCien: { ...POLLO.porCien, kcal: 140, g: 5 } });
    const b = aplicarVinculo(a.receta, ings(), polloGraso, 't2');
    expect(b.receta.vinculo?.antes?.kcal).toBe(544);
    expect(b.receta.kcal).toBeGreaterThan(548);
    // Lleva la copia de los valores por 100 g, ya con el catálogo nuevo.
    expect(b.receta.vinculo?.ingredientes[1].porCien).toEqual({ kcal: 140, p: 23, hc: 0, g: 5 });
    expect(b.receta.vinculo?.ingredientes[3].porCien).toBeUndefined();
  });

  it('sin calcular: guarda el vínculo pero conserva macros y kcal', () => {
    const r = aplicarVinculo(receta(), [{ n: 0, alimentoId: 'x', gramos: 1, min: 1, max: 1 }], CATALOGO, 't');
    expect(r.calculo.ok).toBe(false);
    expect(r.receta.kcal).toBe(544);
    expect(r.receta.vinculo?.ingredientes).toHaveLength(1);
  });

  it('volver a aplicar lo mismo no es un cambio (idempotente)', () => {
    const a = aplicarVinculo(receta(), ings(), CATALOGO, 't1').receta;
    const b = aplicarVinculo(a, ings(), CATALOGO, 't2').receta;
    expect(mismoResultado(a, b)).toBe(true);
  });
});

describe('emparejado y propuesta', () => {
  it('casa por palabras y usa el estado escrito', () => {
    // «Arroz» solo cubre la mitad de «Arroz blanco»: acierta, pero se marca para mirarlo.
    expect(emparejar('Arroz (en crudo)', LISTA)).toEqual({ alimento: ARROZ, confianza: 'media' });
    expect(emparejar('Arroz blanco crudo', LISTA)).toEqual({ alimento: ARROZ, confianza: 'alta' });
    expect(emparejar('Arroz cocido', LISTA).alimento).toBe(ARROZ_COCIDO);
    expect(emparejar('Pechugas de pollo', LISTA)).toEqual({ alimento: POLLO, confianza: 'alta' });
    expect(emparejar('Pollo', LISTA)).toEqual({ alimento: POLLO, confianza: 'media' });
    expect(emparejar('Pechuga de pavo', [POLLO]).confianza).toBe('baja');
    expect(emparejar('Pechuga de pollo a la plancha', LISTA)).toEqual({ alimento: POLLO, confianza: 'media' });
    expect(emparejar('Quinoa', LISTA)).toEqual({ confianza: 'ninguna' });
  });

  it('sal y especias no cuentan', () => {
    expect(esIngredienteQueNoCuenta('Sal')).toBe(true);
    expect(esIngredienteQueNoCuenta('Pimienta negra')).toBe(true);
    expect(esIngredienteQueNoCuenta('Salmón')).toBe(false);
  });

  it('las hierbas, el café, el té y el vino de cocinar tampoco (26-10-2026)', () => {
    for (const n of ['Albahaca fresca', 'Tomillo seco', 'Té', 'Té matcha', 'Café solo', 'Vino blanco', 'Curry en polvo', 'Nuez moscada', 'Piel de limón'])
      expect(esIngredienteQueNoCuenta(n), n).toBe(true);
    for (const n of ['Tomate rojo', 'Ternera', 'Tempeh', 'Café con leche', 'Mentas de chocolate', 'Chile con carne', 'Cebolla'])
      expect(esIngredienteQueNoCuenta(n), n).toBe(false);
  });

  it('palanca = macro con ≥60 % de las kcal; si no hay, fijo', () => {
    expect(propuestaDeRango(90, ARROZ)).toEqual({ min: 45, max: 180, palanca: 'hc' });
    expect(propuestaDeRango(10, ACEITE)).toEqual({ min: 5, max: 20, palanca: 'grasa' });
    expect(propuestaDeRango(80, TOMATE)).toEqual({ min: 80, max: 80, fijo: true });
    expect(propuestaDeRango(30)).toEqual({ min: 30, max: 30, fijo: true });
  });

  it('las filas propuestas pasan unidades a gramos con la medida casera', () => {
    const r: RecetaCruda = { id: 'r2', name: 'Tortilla', ingredients: [{ name: 'Huevo', quantity: 2 }, { name: 'Sal', quantity: 1 }] };
    const filas = filasDePropuesta(r, LISTA);
    const fila = Object.fromEntries(COLUMNAS_VINCULOS.map((c, i) => [c, filas[0][i]]));
    expect(fila.alimento_id).toBe('huevo');
    expect(fila.gramos).toBe('110');
    expect(fila.nota).toContain('unidades');
    expect(filas[1][COLUMNAS_VINCULOS.indexOf('alimento_id')]).toBe('-');
  });
});

describe('CSV de vínculos', () => {
  const cab = COLUMNAS_VINCULOS.join(';');
  it('lee el CSV revisado (la propuesta tal cual vuelve a entrar)', () => {
    const filas = filasDePropuesta(receta(), LISTA);
    const csv = [cab, ...filas.map(f => f.join(';'))].join('\n');
    const { porReceta, errores } = leerVinculos(csv, CATALOGO);
    expect(errores).toEqual([]);
    const v = porReceta.get('r1')!;
    expect(v.map(i => i.alimentoId)).toEqual(['arroz-crudo', 'pechuga-pollo', 'tomate-frito', null]);
    expect(v[0].palanca).toBe('hc');
    expect(v[3].fijo).toBe(true);
  });

  it('una fila mala deja fuera toda su receta', () => {
    const csv = `${cab}\nr1;A;0;Arroz;90;arroz-crudo;;;90;45;180;hc;;\nr1;A;1;Pollo;150;no-existe;;;150;75;300;;;\nr2;B;0;Pollo;100;pechuga-pollo;;;100;200;300;;;\nr3;C;0;Pollo;100;pechuga-pollo;;;100;50;200;proteina;;`;
    const { porReceta, errores } = leerVinculos(csv, CATALOGO);
    expect([...porReceta.keys()]).toEqual(['r3']);
    expect(errores.map(e => e.fila)).toEqual([3, 4]);
  });
});

describe('recetas nuevas', () => {
  const cab = COLUMNAS_RECETAS_NUEVAS.join(';');
  const csv = [
    cab,
    'Pasta con carne;comida, cena;20;sí;vegano, sin gluten;https://x.test/p.jpg;Cuece la pasta | Dora la carne;Pasta;arroz-crudo;80;;;;',
    'Pasta con carne;;;;;;;;pechuga-pollo;120;;;;',
    'Pasta con carne;;;;;;;Aceite;aceite-oliva;10;10;10;;sí',
    'Pasta con carne;;;;;;;Sal;-;2;;;;',
  ].join('\n');

  it('agrupa las filas por receta, traduce momentos y restricciones y propone palancas', () => {
    const { recetas, errores, avisos } = leerRecetasNuevas(csv, CATALOGO);
    expect(errores).toEqual([]);
    expect(avisos).toEqual([]);
    const r = recetas[0];
    expect(r.intakeTypes).toEqual([3, 5]);
    expect(r.forbiddenFor).toEqual([55, 66]);
    expect(r.pasos).toEqual(['Cuece la pasta', 'Dora la carne']);
    expect(r.tupper).toBe(true);
    expect(r.ingredientes.map(i => [i.nombre, i.palanca ?? (i.fijo ? 'fijo' : '')])).toEqual([
      ['Pasta', 'hc'], ['Pechuga de pollo', 'proteina'], ['Aceite', 'fijo'], ['Sal', 'fijo'],
    ]);
  });

  it('genera la receta del recetario con id estable y macros calculados', () => {
    const { recetas } = leerRecetasNuevas(csv, CATALOGO);
    const idDe = (k: string) => `id(${k})`;
    const { receta: r, calculo } = recetaCrudaNueva(recetas[0], CATALOGO, idDe, 't');
    expect(r.id).toBe('id(base:pasta con carne)');
    expect(calculo.ok).toBe(true);
    expect(r.kcal).toBe(Math.round(354 * 0.8 + 110 * 1.2 + 900 * 0.1));
    expect(r.basica).toBe(true);
    expect(r.image).toBe('https://x.test/p.jpg');
    expect(r.categoria).toBe('Platos salados / principales');
    expect(r.vinculo?.antes).toBeUndefined();
    expect(r.ingredients[0]).toEqual({ id: 'id(id(base:pasta con carne):0)', name: 'Pasta', quantity: 80 });
  });

  it('avisa de lo que falta y rechaza restricciones desconocidas', () => {
    const malo = `${cab}\nX;;;;;;;;pechuga-pollo;100;;;;\nY;comida;;;marciano;;;;pechuga-pollo;100;;;;`;
    const { recetas, errores, avisos } = leerRecetasNuevas(malo, CATALOGO);
    expect(recetas.map(r => r.nombre)).toEqual(['X']);
    expect(errores[0].mensaje).toContain('marciano');
    expect(avisos.map(a => a.mensaje).join(' ')).toContain('Sin momentos');
  });
});

describe('vinculoAutomatico', () => {
  const cat = (id: string, nombre: string, porCien: { kcal: number; p: number; hc: number; g: number }) =>
    ({ id, nombre, porCien }) as Parameters<typeof vinculoAutomatico>[1][number];
  const CAT = [
    cat('arroz', 'Arroz', { kcal: 360, p: 6.7, hc: 80, g: 0.6 }),
    cat('pollo', 'Pechuga de pollo', { kcal: 110, p: 23, hc: 0, g: 1.6 }),
    cat('tomate', 'Tomate rojo', { kcal: 18, p: 0.9, hc: 3.9, g: 0.2 }),
    cat('aceite', 'Aceite de oliva', { kcal: 884, p: 0, hc: 0, g: 100 }),
  ];

  it('vincula todo lo que empareja seguro, con palancas y verduras fijas', () => {
    const r = vinculoAutomatico({ ingredients: [
      { name: 'Arroz', quantity: 200 }, { name: 'Pechuga de pollo', quantity: 100 },
      { name: 'Tomate rojo', quantity: 80 }, { name: 'Aceite de oliva', quantity: 10 }, { name: 'Sal', quantity: 1 },
    ] }, CAT);
    expect(r.ok).toBe(true);
    if (!('ingredientes' in r)) return;
    expect(r.ingredientes.map(i => [i.alimentoId, i.palanca ?? (i.fijo ? 'fijo' : '')])).toEqual([
      ['arroz', 'hc'], ['pollo', 'proteina'], ['tomate', 'fijo'], ['aceite', 'grasa'], [null, 'fijo'],
    ]);
    expect(r.ingredientes[0]).toMatchObject({ min: 100, max: 400 });
  });

  it('si algo no empareja seguro, no vincula y dice qué', () => {
    const r = vinculoAutomatico({ ingredients: [{ name: 'Arroz', quantity: 200 }, { name: 'Salsa secreta del chef', quantity: 30 }] }, CAT);
    expect(r).toEqual({ ok: false, dudosos: ['Salsa secreta del chef'] });
  });
});
