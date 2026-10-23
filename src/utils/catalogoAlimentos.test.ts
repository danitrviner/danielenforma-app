import { describe, it, expect } from 'vitest';
import {
  validarCsv, idDeAlimento, compararCatalogo, fusionarCatalogo, repartirEnTrozos,
  buscarEnCatalogo, comoProducto, nombreDeAlimento, type AlimentoCatalogo,
} from './catalogoAlimentos';

const CAB = 'id;nombre;estado;kcal;proteina;hidratos;grasa;fibra;azucares;grasa_saturada;sal;unidad_nombre;unidad_gramos;fuente';

const arroz: AlimentoCatalogo = { id: 'arroz-blanco-crudo', nombre: 'Arroz blanco', estado: 'crudo', porCien: { kcal: 354, p: 7, hc: 78, g: 0.9 } };

describe('validarCsv', () => {
  it('lee una fila completa con comas decimales, BOM y medida casera', () => {
    const csv = `\uFEFF${CAB}\n;Pan de molde;listo;265;9;49;3,5;2,5;5;0,7;1,2;rebanada;30;etiqueta Hacendado\n`;
    const r = validarCsv(csv);
    expect(r.erroresGenerales).toEqual([]);
    expect(r.filas[0].errores).toEqual([]);
    expect(r.alimentos[0]).toEqual({
      id: 'pan-de-molde-listo', nombre: 'Pan de molde', estado: 'listo',
      porCien: { kcal: 265, p: 9, hc: 49, g: 3.5, fibra: 2.5, azucares: 5, saturada: 0.7, sal: 1.2 },
      unidad: { nombre: 'rebanada', gramos: 30 }, fuente: 'etiqueta Hacendado',
    });
  });

  it('acepta solo las columnas obligatorias y sin estado', () => {
    const r = validarCsv('nombre;kcal;proteina;hidratos;grasa\nPechuga de pollo;110;23;0;1,5\n');
    expect(r.alimentos).toEqual([{ id: 'pechuga-de-pollo', nombre: 'Pechuga de pollo', porCien: { kcal: 110, p: 23, hc: 0, g: 1.5 } }]);
  });

  it('sin una columna obligatoria no lee nada', () => {
    const r = validarCsv('nombre;kcal;proteina;hidratos\nX;1;1;1\n');
    expect(r.erroresGenerales[0]).toContain('grasa');
    expect(r.alimentos).toEqual([]);
  });

  it('rechaza macros que faltan, negativos o que pasan de 100 g', () => {
    const r = validarCsv(`${CAB}\n;Sin grasa;;100;10;10;\n;Negativo;;100;-1;10;1\n;Imposible;;500;60;50;5\n`);
    expect(r.filas[0].errores).toContain('Falta grasa.');
    expect(r.filas[1].errores[0]).toContain('proteína');
    expect(r.filas[2].errores[0]).toContain('suman');
    expect(r.alimentos).toEqual([]);
  });

  it('avisa (sin rechazar) si las kcal no cuadran con 4/4/9', () => {
    const r = validarCsv(`${CAB}\n;Raro;;500;10;10;1\n`);
    expect(r.filas[0].errores).toEqual([]);
    expect(r.filas[0].avisos[0]).toContain('no cuadran');
    expect(r.alimentos).toHaveLength(1);
  });

  it('rechaza un estado desconocido y una medida casera a medias', () => {
    const r = validarCsv(`${CAB}\n;A;hervido;100;5;15;2\n;B;;100;5;15;2;;;;;cucharada;\n`);
    expect(r.filas[0].errores[0]).toContain('Estado');
    expect(r.filas[1].errores[0]).toContain('medida casera');
  });

  it('un alimento repetido se queda solo con su primera fila', () => {
    const r = validarCsv(`${CAB}\n;Arroz blanco;crudo;354;7;78;0,9\n;Arroz Blanco;Crudo;350;7;78;1\n`);
    expect(r.alimentos).toHaveLength(1);
    expect(r.filas[1].errores[0]).toContain('fila 2');
  });

  it('crudo y cocido son alimentos distintos', () => {
    const r = validarCsv(`${CAB}\n;Arroz blanco;crudo;354;7;78;0,9\n;Arroz blanco;cocido;130;2,7;28;0,3\n`);
    expect(r.alimentos.map(a => a.id)).toEqual(['arroz-blanco-crudo', 'arroz-blanco-cocido']);
  });
});

describe('idDeAlimento', () => {
  it('sin tildes ni símbolos', () => {
    expect(idDeAlimento('Plátano de Canarias', 'listo')).toBe('platano-de-canarias-listo');
    expect(idDeAlimento('Yogur 0% (natural)')).toBe('yogur-0-natural');
  });
});

describe('comparar y fusionar', () => {
  const pollo: AlimentoCatalogo = { id: 'pollo', nombre: 'Pollo', porCien: { kcal: 110, p: 23, hc: 0, g: 1.5 } };

  it('distingue nuevos, cambiados, iguales y ausentes (los ausentes no se borran)', () => {
    const atun: AlimentoCatalogo = { id: 'atun', nombre: 'Atún', porCien: { kcal: 100, p: 23, hc: 0, g: 1 } };
    const polloNuevo = { ...pollo, porCien: { ...pollo.porCien, g: 2 } };
    const huevo: AlimentoCatalogo = { id: 'huevo', nombre: 'Huevo', porCien: { kcal: 145, p: 12.5, hc: 0.7, g: 10.6 } };
    const d = compararCatalogo([arroz, pollo, atun], [{ ...arroz }, polloNuevo, huevo]);
    expect(d.nuevos).toEqual([huevo]);
    expect(d.cambiados).toEqual([{ antes: pollo, despues: polloNuevo }]);
    expect(d.iguales).toBe(1);
    expect(d.ausentes).toEqual([atun]);
    expect(fusionarCatalogo([arroz, pollo, atun], [polloNuevo, huevo]).map(a => a.id)).toEqual(['arroz-blanco-crudo', 'atun', 'huevo', 'pollo']);
  });

  it('el orden de las claves no cuenta como cambio (idempotente)', () => {
    const mismo = { porCien: { g: 0.9, hc: 78, p: 7, kcal: 354 }, estado: 'crudo', nombre: 'Arroz blanco', id: 'arroz-blanco-crudo' } as AlimentoCatalogo;
    expect(compararCatalogo([arroz], [mismo]).iguales).toBe(1);
  });

  it('reparte en trozos del tamaño pedido', () => {
    const muchos = Array.from({ length: 5 }, (_, i) => ({ ...pollo, id: `p${i}` }));
    expect(repartirEnTrozos(muchos, 2).map(t => t.length)).toEqual([2, 2, 1]);
    expect(repartirEnTrozos([], 2)).toEqual([]);
  });
});

describe('buscar y mostrar', () => {
  const lista: AlimentoCatalogo[] = [
    { id: 'a', nombre: 'Leche de avena', porCien: { kcal: 45, p: 1, hc: 7, g: 1.5 } },
    { id: 'b', nombre: 'Avena en copos', estado: 'seco', porCien: { kcal: 370, p: 13, hc: 60, g: 7 } },
    arroz,
  ];

  it('sin tildes, palabra a palabra, y primero los que empiezan por lo buscado', () => {
    expect(buscarEnCatalogo(lista, 'avena').map(a => a.id)).toEqual(['b', 'a']);
    expect(buscarEnCatalogo(lista, 'crudo arroz').map(a => a.id)).toEqual(['arroz-blanco-crudo']);
    expect(buscarEnCatalogo(lista, 'a')).toEqual([]);
  });

  it('nombre con estado y conversión a la ficha de producto', () => {
    expect(nombreDeAlimento(arroz)).toBe('Arroz blanco (crudo)');
    const pan: AlimentoCatalogo = { id: 'pan', nombre: 'Pan', estado: 'listo', porCien: { kcal: 265, p: 9, hc: 49, g: 3.5, fibra: 2.5 }, unidad: { nombre: 'rebanada', gramos: 30 } };
    expect(nombreDeAlimento(pan)).toBe('Pan');
    expect(comoProducto(pan)).toEqual({ c: 'pan', n: 'Pan', b: '', s: 30, q: '1 rebanada = 30 g', k: 265, p: 9, h: 49, g: 3.5, f: 2.5 });
  });
});
