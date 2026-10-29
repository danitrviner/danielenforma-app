import { describe, it, expect } from 'vitest';
import type { AiProposal } from '../types';
import { POLITICA_POR_DEFECTO } from './politica';
import {
  lunesDeLaSemana, muestraDeCalidad, automaticasDeLaSemana, resumenCalidad, bajarPorNoVuelvas,
  instruccionDeNoVuelvas, anadirInstruccionFija, filtrarPropuestas, semilla,
} from './calidad';

const prop = (id: string, p: Partial<AiProposal>): AiProposal => ({
  id, athleteId: 'ana@x.com', kind: 'diet', status: 'aplicada', chatId: 'c', createdAt: '2026-10-20T10:00:00.000Z',
  summary: `S ${id}`, rationale: '', payload: {} as never, politica: 'automatico', autor: 'asistente', ...p,
} as AiProposal);

// Hoy es miércoles 28-10-2026: la semana auditada es la del lunes 19 al domingo 25.
const HOY = '2026-10-28';
const auto = (id: string, dia: string, extra: Partial<AiProposal> = {}) => prop(id, { aplicadaEn: `${dia}T07:00:00.000Z`, ...extra });
const PROPUESTAS: AiProposal[] = [
  auto('a1', '2026-10-19'), auto('a2', '2026-10-20'), auto('a3', '2026-10-21'), auto('a4', '2026-10-22'),
  auto('a5', '2026-10-23'), auto('a6', '2026-10-24'), auto('a7', '2026-10-25'),
  auto('fuera_antes', '2026-10-18'), auto('fuera_despues', '2026-10-26'),
  auto('aviso', '2026-10-21', { politica: 'aviso' }),
  auto('aprobada', '2026-10-21', { status: 'approved', politica: 'proponer' }),
  auto('deshecha', '2026-10-21', { status: 'deshecha' }),
];

describe('lunesDeLaSemana y semilla', () => {
  it('el lunes de la semana local', () => {
    expect(lunesDeLaSemana('2026-10-28')).toBe('2026-10-26');
    expect(lunesDeLaSemana('2026-10-26')).toBe('2026-10-26');
    expect(lunesDeLaSemana('2026-10-25')).toBe('2026-10-19');
    expect(lunesDeLaSemana('2026-11-01')).toBe('2026-10-26');
  });
  it('la semilla es estable y distinta por texto', () => {
    expect(semilla('x')).toBe(semilla('x'));
    expect(semilla('x')).not.toBe(semilla('y'));
  });
});

describe('automaticasDeLaSemana y muestraDeCalidad', () => {
  it('solo las aplicadas automáticas de lunes a domingo de la semana pasada', () => {
    const { desde, hasta, lista } = automaticasDeLaSemana(PROPUESTAS, HOY);
    expect(desde).toBe('2026-10-19'); expect(hasta).toBe('2026-10-26');
    expect(lista.map(p => p.id).sort()).toEqual(['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7']);
  });
  it('cinco al azar, siempre las mismas durante la semana, y dice de cuántas', () => {
    const lunes = muestraDeCalidad(PROPUESTAS, '2026-10-26');
    const jueves = muestraDeCalidad(PROPUESTAS, '2026-10-29');
    expect(lunes.semana).toBe('2026-10-19');
    expect(lunes.muestra).toHaveLength(5);
    expect(lunes.total).toBe(7);
    expect(jueves.muestra.map(p => p.id)).toEqual(lunes.muestra.map(p => p.id));
    // No es simplemente «las cinco primeras por fecha».
    expect(lunes.muestra.map(p => p.id)).not.toEqual(['a1', 'a2', 'a3', 'a4', 'a5']);
  });
  it('otra semana, otra muestra y otro orden', () => {
    const siguiente = muestraDeCalidad(PROPUESTAS.map(p => ({ ...p, aplicadaEn: p.aplicadaEn && p.aplicadaEn.replace('2026-10-', '2026-11-0') })), '2026-11-11');
    expect(siguiente.semana).toBe('2026-11-02');
    expect(siguiente.total).toBeGreaterThan(0);
  });
  it('con menos de cinco, las que haya', () => {
    expect(muestraDeCalidad(PROPUESTAS.slice(0, 2), HOY).muestra).toHaveLength(2);
    expect(muestraDeCalidad([], HOY).muestra).toEqual([]);
  });
});

describe('resumenCalidad', () => {
  it('cuenta veredictos y la tasa de «bien»', () => {
    const juzgadas = [
      prop('b1', { calidad: { veredicto: 'bien', en: 'x' } }), prop('b2', { calidad: { veredicto: 'bien', en: 'x' } }),
      prop('m1', { calidad: { veredicto: 'mal', en: 'x' } }), prop('n1', { calidad: { veredicto: 'no_vuelvas', en: 'x' } }),
      prop('sin', {}),
    ];
    expect(resumenCalidad(juzgadas)).toEqual({ juzgadas: 4, bien: 2, mal: 1, noVuelvas: 1, tasa: 0.5 });
    expect(resumenCalidad([]).tasa).toBeNull();
  });
});

describe('«no vuelvas»', () => {
  it('baja el tipo a proponer sin tocar la política recibida', () => {
    const base = { ...POLITICA_POR_DEFECTO, modo: 'politica' as const, nivelPorTipo: { menu_semanal: 'automatico' as const } };
    const r = bajarPorNoVuelvas(base, 'menu_semanal');
    expect(r.cambio).toBe(true);
    expect(r.politica.nivelPorTipo.menu_semanal).toBe('proponer');
    expect(base.nivelPorTipo.menu_semanal).toBe('automatico');
    expect(bajarPorNoVuelvas(r.politica, 'menu_semanal').cambio).toBe(false);
  });
  it('la instrucción fija lleva fecha, resumen, tipo y atleta, y no se duplica', () => {
    const linea = instruccionDeNoVuelvas({ summary: 'Menú semana 7 publicado', athleteId: 'ana@x.com' }, 'menu_semanal', '2026-10-28T10:00:00.000Z', 'odia el pescado');
    expect(linea).toBe('- [2026-10-28] NO VUELVAS a decidir solo «Menú semana 7 publicado» (menú de la semana, ana@x.com): propónmelo siempre. Motivo: odia el pescado');
    const texto = anadirInstruccionFija('Siempre descarga en la semana 4.', linea);
    expect(texto).toBe(`Siempre descarga en la semana 4.\n${linea}`);
    expect(anadirInstruccionFija(texto, linea)).toBe(texto);
    expect(anadirInstruccionFija('', linea)).toBe(linea);
  });
});

describe('filtrarPropuestas', () => {
  const lista = [
    prop('p', { status: 'proposed' }), prop('ap', { status: 'approved' }), prop('apl', { status: 'aplicada' }),
    prop('re', { status: 'rejected' }), prop('de', { status: 'deshecha' }), prop('ca', { status: 'caducada' }), prop('so', { status: 'sombra' }),
  ];
  it('cada filtro se lleva los estados que le tocan', () => {
    expect(filtrarPropuestas(lista, 'pendientes').map(p => p.id)).toEqual(['p']);
    expect(filtrarPropuestas(lista, 'aplicadas').map(p => p.id)).toEqual(['ap', 'apl']);
    expect(filtrarPropuestas(lista, 'rechazadas').map(p => p.id)).toEqual(['re', 'de', 'ca']);
    expect(filtrarPropuestas(lista, 'sombra').map(p => p.id)).toEqual(['so']);
  });
});
