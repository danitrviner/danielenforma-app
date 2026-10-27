import { describe, it, expect } from 'vitest';
import type { AlimentoCatalogo } from './catalogoAlimentos';
import {
  calcularIngredientes, macrosCrudos, aplicarVinculo, mismoResultado, emparejar, emparejarRevisado, propuestaDeRango, candidatosDe, palabrasDe,
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
    // El alimento lleva «blanco» y el ingrediente no: a revisar (antes era media).
    expect(emparejar('Arroz (en crudo)', LISTA)).toEqual({ alimento: ARROZ, confianza: 'baja' });
    expect(emparejar('Arroz blanco crudo', LISTA)).toEqual({ alimento: ARROZ, confianza: 'alta' });
    expect(emparejar('Arroz cocido', LISTA).alimento).toBe(ARROZ_COCIDO);
    expect(emparejar('Pechugas de pollo', LISTA)).toEqual({ alimento: POLLO, confianza: 'alta' });
    expect(emparejar('Pollo', LISTA)).toEqual({ alimento: POLLO, confianza: 'baja' });
    expect(emparejar('Pechuga de pavo', [POLLO]).confianza).toBe('baja');
    expect(emparejar('Pechuga de pollo a la plancha', LISTA)).toEqual({ alimento: POLLO, confianza: 'media' });
    expect(emparejar('Quinoa', LISTA)).toEqual({ confianza: 'ninguna' });
  });

  it('el alimento con palabras de más que el ingrediente es baja; al revés, media (26-10-2026)', () => {
    const al = (id: string, nombre: string, estado?: AlimentoCatalogo['estado']): AlimentoCatalogo =>
      ({ id, nombre, estado, porCien: { kcal: 100, p: 1, hc: 1, g: 1 } });
    const PIPAS = al('pipas-de-calabaza', 'Pipas de calabaza');
    const CALABAZA = al('calabaza', 'Calabaza');
    // 144 recetas con «Calabaza» → «Pipas de calabaza» (+533 kcal) entraron por aquí.
    expect(emparejar('Calabaza', [PIPAS]).confianza).toBe('baja');
    expect(emparejar('Calabaza', [PIPAS, CALABAZA])).toEqual({ alimento: CALABAZA, confianza: 'alta' });
    expect(emparejar('Tomate seco', [al('lechuga-y-tomate', 'Lechuga y tomate')]).confianza).toBe('baja');
    expect(emparejar('Avena', [al('bebida-de-avena', 'Bebida de avena')]).confianza).toBe('baja');
    // Descriptores de más en el ingrediente, alimento entero dentro: media.
    expect(emparejar('Almendras al natural', [al('almendras', 'Almendras')]).confianza).toBe('media');
    expect(emparejar('Garbanzo cocido envasado', [al('garbanzos-cocido', 'Garbanzos', 'cocido')]).confianza).toBe('media');
  });

  it('el estado puede venir en el nombre del alimento y cereales/legumbres sin estado no son cocidos (26-10-2026)', () => {
    const al = (id: string, nombre: string, estado?: AlimentoCatalogo['estado']): AlimentoCatalogo =>
      ({ id, nombre, estado, porCien: { kcal: 100, p: 1, hc: 1, g: 1 } });
    // Antes «crudos» chocaba con el estado «listo» del primero y la duda se llevaba 35 recetas.
    const P_LISTO = al('pistachos-listo', 'Pistachos', 'listo');
    const P_CRUDOS = al('pistachos-crudos', 'Pistachos crudos');
    expect(emparejar('Pistachos crudos', [P_LISTO, P_CRUDOS])).toEqual({ alimento: P_CRUDOS, confianza: 'alta' });
    expect(emparejar('Jamón Cocido', [al('jamon-serrano', 'Jamón serrano'), al('jamon-cocido', 'Jamón cocido')])).toEqual({ alimento: al('jamon-cocido', 'Jamón cocido'), confianza: 'alta' });
    // «Arroz integral 60 g» es arroz seco: su única entrada cocida no vale (−118 kcal de mediana en 134 recetas).
    expect(emparejar('Arroz integral', [al('arroz-integral-cocido', 'Arroz integral', 'cocido')]).confianza).toBe('baja');
    expect(emparejar('Arroz integral (en crudo)', [al('arroz-integral-crudo', 'Arroz integral', 'crudo')]).confianza).toBe('alta');
    // Dos entradas con las mismas palabras y peso distinto, sin estado escrito: a revisar.
    expect(emparejar('Lentejas', [al('lentejas-seco', 'Lentejas', 'seco'), al('lentejas-cocido', 'Lentejas', 'cocido')]).confianza).toBe('baja');
    expect(emparejar('Lentejas', [al('lentejas-seco', 'Lentejas', 'seco')]).confianza).toBe('alta');
    expect(emparejar('Lentejas cocidas', [al('lentejas-seco', 'Lentejas', 'seco'), al('lentejas-cocido', 'Lentejas', 'cocido')])).toEqual({ alimento: al('lentejas-cocido', 'Lentejas', 'cocido'), confianza: 'alta' });
    // Verduras no son cereal: «Brócoli» → «Brócoli (cocido)» sigue siendo alta; «Judía verde» tampoco es legumbre seca.
    expect(emparejar('Brócoli', [al('brocoli-cocido', 'Brócoli', 'cocido')]).confianza).toBe('alta');
    expect(emparejar('Judía verde', [al('judia-verde-cocido', 'Judía verde', 'cocido')]).confianza).toBe('alta');
    // A igual puntuación, sin estado escrito, gana la versión sin cocer (455 recetas de «Patata» iban a la cocida).
    expect(emparejar('Patata', [al('patata-cocido', 'Patata', 'cocido'), al('patata-crudo', 'Patata', 'crudo')]).alimento?.id).toBe('patata-crudo');
    expect(emparejar('Patata', [al('patata-cocido', 'Patata', 'cocido'), al('patata-crudo', 'Patata', 'crudo')]).confianza).toBe('alta');
    expect(emparejar('Couscous', [al('couscous-cocido', 'Couscous cocido'), al('couscous', 'Couscous')])).toEqual({ alimento: al('couscous', 'Couscous'), confianza: 'alta' });
    expect(emparejar('Couscous cocido', [al('couscous', 'Couscous'), al('couscous-cocido', 'Couscous cocido')]).alimento?.id).toBe('couscous-cocido');
  });

  it('los sinónimos revisados mandan sobre la puntuación', () => {
    const al = (id: string, nombre: string): AlimentoCatalogo => ({ id, nombre, porCien: { kcal: 100, p: 1, hc: 1, g: 1 } });
    const ALMENDRAS = al('almendras-listo', 'Almendras');
    expect(emparejarRevisado('Almendras al natural', [ALMENDRAS])).toEqual({ alimento: ALMENDRAS, confianza: 'alta' });
    // Si el alimento del sinónimo no está en el catálogo, se puntúa como siempre.
    expect(emparejarRevisado('Almendras al natural', [al('otro', 'Almendras')]).confianza).toBe('media');
    expect(emparejarRevisado('Calabaza', [al('pipas-de-calabaza', 'Pipas de calabaza')]).confianza).toBe('baja');
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

  it('la levadura química y la infusión no cuentan; la nutricional y la de cerveza sí (26-10-2026)', () => {
    for (const n of ['Levadura', 'Levadura química', 'Levadura en polvo', 'Infusión de manzanilla', 'Semillas de cilantro', 'Clavo de olor'])
      expect(esIngredienteQueNoCuenta(n), n).toBe(true);
    for (const n of ['Levadura nutricional', 'Levadura de cerveza'])
      expect(esIngredienteQueNoCuenta(n), n).toBe(false);
  });

  it('palanca = macro con ≥60 % de las kcal; si no hay, fijo', () => {
    expect(propuestaDeRango(90, ARROZ)).toEqual({ min: 45, max: 180, palanca: 'hc' });
    expect(propuestaDeRango(10, ACEITE)).toEqual({ min: 5, max: 20, palanca: 'grasa' });
    // El rango contiene siempre los gramos de la receta: 3 g de aceite no se suben a 5 (26-10-2026).
    expect(propuestaDeRango(3, ACEITE)).toEqual({ min: 3, max: 5, palanca: 'grasa' });
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

  it('un par forzado (desempate por kcal del revinculado) entra como alta', () => {
    const CAT2 = [...CAT, cat('garbanzos-seco', 'Garbanzos', { kcal: 334, p: 19, hc: 55, g: 6 }), cat('garbanzos-cocido', 'Garbanzos', { kcal: 139, p: 7.2, hc: 19, g: 2.6 })];
    const receta = { ingredients: [{ name: 'Garbanzo', quantity: 60 }, { name: 'Pechuga de pollo', quantity: 100 }] };
    // Dos entradas con las mismas palabras y estados seco/cocido: solo, es duda…
    expect(vinculoAutomatico(receta, CAT2.map(c => c.id.startsWith('garbanzos') ? { ...c, estado: c.id.endsWith('seco') ? 'seco' : 'cocido' } : c) as typeof CAT2)).toMatchObject({ ok: false, dudosos: ['Garbanzo'] });
    // …y con el par decidido se vincula sin más.
    const r = vinculoAutomatico(receta, CAT2, new Map([[0, CAT2.find(c => c.id === 'garbanzos-seco')!]]));
    expect(r.ok).toBe(true);
    if ('ingredientes' in r) expect(r.ingredientes[0]).toMatchObject({ alimentoId: 'garbanzos-seco', gramos: 60 });
  });

  it('candidatosDe lista los alimentos que comparten palabras, de mejor a peor; palabrasDe quita vacías y estado', () => {
    const CAT2 = [...CAT, cat('harina-de-garbanzo-listo', 'Harina de garbanzo', { kcal: 387, p: 22, hc: 58, g: 6.7 }), cat('garbanzos-seco', 'Garbanzos', { kcal: 334, p: 19, hc: 55, g: 6 })];
    const c = candidatosDe('Garbanzo cocido', CAT2);
    expect(c.map(x => x.alimento.id)).toEqual(['garbanzos-seco', 'harina-de-garbanzo-listo']);
    expect(c[0]).toMatchObject({ cubre: 1, explica: 1 });
    expect(palabrasDe('Garbanzos cocidos de bote')).toEqual(['garbanzo', 'bote']);
  });

  it('media ya no vincula sola; un sinónimo revisado sí (26-10-2026)', () => {
    const CAT2 = [...CAT, cat('almendras-listo', 'Almendras', { kcal: 600, p: 21, hc: 7, g: 52 }), cat('pipas-de-calabaza', 'Pipas de calabaza', { kcal: 560, p: 30, hc: 11, g: 49 })];
    expect(vinculoAutomatico({ ingredients: [{ name: 'Pechuga de pollo a la plancha', quantity: 150 }] }, CAT2))
      .toEqual({ ok: false, dudosos: ['Pechuga de pollo a la plancha'] });
    expect(vinculoAutomatico({ ingredients: [{ name: 'Calabaza', quantity: 200 }] }, CAT2))
      .toEqual({ ok: false, dudosos: ['Calabaza'] });
    const r = vinculoAutomatico({ ingredients: [{ name: 'Almendras al natural', quantity: 30 }] }, CAT2);
    expect(r.ok).toBe(true);
    if ('ingredientes' in r) expect(r.ingredientes[0]).toMatchObject({ alimentoId: 'almendras-listo', palanca: 'grasa' });
  });
});
