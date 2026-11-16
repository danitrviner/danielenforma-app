import { describe, it, expect } from 'vitest';
import {
  CAPRICHOS_SUGERIDOS, GRUPOS_DE_CAPRICHO, alimentoDelCapricho, buscarCaprichos, caprichosPorGrupo,
  conCapricho, kcalDeRacion, nuevoCapricho, sinCapricho, MAX_CAPRICHOS,
} from './caprichos';
import { extraDeAlimento, kcalDeExtra } from './ingestaPersonalizada';
import type { AlimentoCatalogo } from './catalogoAlimentos';

const catalogo: AlimentoCatalogo[] = [
  { id: 'alubias-blancas', nombre: 'Alubias blancas', estado: 'cocido', porCien: { kcal: 100, p: 7, hc: 14, g: 0.5 } },
  { id: 'ajos-tiernos', nombre: 'Ajos tiernos', porCien: { kcal: 40, p: 2, hc: 8, g: 0.3 } },
  { id: 'mermelada-de-tomate-y-albahaca', nombre: 'Mermelada de tomate y albahaca', porCien: { kcal: 190, p: 0.5, hc: 47, g: 0 } },
  { id: 'natillas', nombre: 'Natillas', porCien: { kcal: 125, p: 3, hc: 19, g: 4 } },
  { id: 'yogur-griego-0-listo', nombre: 'Yogur griego 0%', estado: 'listo', porCien: { kcal: 59, p: 10, hc: 4, g: 0 }, unidad: { nombre: 'yogur', gramos: 125 } },
];

describe('lista de caprichos', () => {
  it('sin buscar no salen legumbres, verduras ni mermeladas raras: solo la lista', () => {
    const lista = buscarCaprichos('', catalogo);
    expect(lista.every(a => a.id.startsWith('capricho-'))).toBe(true);
    expect(lista.map(a => a.nombre).join(' ')).not.toMatch(/alubia|ajo|albahaca/i);
  });

  it('buscando, encuentra también en el catálogo, sin repetir nombre', () => {
    expect(buscarCaprichos('yogur griego', catalogo).map(a => a.id)).toEqual(['yogur-griego-0-listo']);
    const natillas = buscarCaprichos('natillas', catalogo);
    expect(natillas.filter(a => a.nombre === 'Natillas')).toHaveLength(1);
    expect(natillas[0].id.startsWith('capricho-')).toBe(true);
  });

  it('lo escrito a su manera encuentra algo por palabras sueltas', () => {
    expect(buscarCaprichos('Un Magnum almendrado', catalogo)[0].nombre).toBe('Helado bombón (tipo Magnum)');
    expect(buscarCaprichos('unas patatillas de bolsa', catalogo).map(a => a.nombre)).toContain('Patatas fritas de bolsa');
    expect(buscarCaprichos('xyz', catalogo)).toEqual([]);
  });

  it('las kcal de cada sugerido cuadran con sus macros (±15 %: los «sin azúcar» llevan polialcoholes)', () => {
    for (const c of CAPRICHOS_SUGERIDOS) {
      const { kcal, p, hc, g } = c.porCien;
      if (kcal < 20) continue;
      expect(Math.abs(p * 4 + hc * 4 + g * 9 - kcal) / kcal, c.nombre).toBeLessThan(0.15);
    }
  });

  it('ids únicos y todos en un grupo que existe', () => {
    const ids = CAPRICHOS_SUGERIDOS.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    const grupos = new Set(GRUPOS_DE_CAPRICHO.map(g => g.id));
    expect(CAPRICHOS_SUGERIDOS.every(c => grupos.has(c.grupo))).toBe(true);
    expect(caprichosPorGrupo().reduce((s, g) => s + g.caprichos.length, 0)).toBe(CAPRICHOS_SUGERIDOS.length);
  });

  it('una onza de chocolate 85 % ronda las 60 kcal, no 600', () => {
    const choc = CAPRICHOS_SUGERIDOS.find(c => c.id === 'capricho-chocolate-85-porciones-hacendado')!;
    expect(kcalDeRacion(choc)).toBe(61);
    expect(kcalDeExtra(extraDeAlimento(choc))).toBe(61);
  });
});

describe('caprichos del atleta', () => {
  const azar = () => 0.5;

  it('texto libre con nota', () => {
    const c = nuevoCapricho({ nombre: '  Un Magnum   almendrado ', nota: ' viernes con la peli ' }, '2026-11-16', azar)!;
    expect(c).toMatchObject({ nombre: 'Un Magnum almendrado', nota: 'viernes con la peli', creadoEn: '2026-11-16' });
    expect(c.alimento).toBeUndefined();
    expect(alimentoDelCapricho(c)).toBeNull();
  });

  it('sin nombre no hay capricho', () => {
    expect(nuevoCapricho({ nombre: '   ' }, '2026-11-16')).toBeNull();
  });

  it('elegido de la lista: lleva los macros para meterlo de un toque', () => {
    const helado = CAPRICHOS_SUGERIDOS.find(c => c.id === 'capricho-helado-vainilla')!;
    const c = nuevoCapricho({ nombre: helado.nombre, alimento: helado }, '2026-11-16', azar)!;
    const a = alimentoDelCapricho(c)!;
    expect(a.porCien).toEqual({ kcal: 207, p: 3.5, hc: 24, g: 11 });
    expect(extraDeAlimento(a)).toMatchObject({ alimentoId: 'capricho-helado-vainilla', piezas: 1, unidad: 'bola', gramosPorPieza: 60 });
  });

  it('no duplica: mismo alimento o mismo texto sustituye', () => {
    const helado = CAPRICHOS_SUGERIDOS.find(c => c.id === 'capricho-helado-vainilla')!;
    const a = nuevoCapricho({ nombre: 'Helado', alimento: helado }, '2026-11-01', azar)!;
    const b = nuevoCapricho({ nombre: 'Helado de vainilla', nota: 'en verano', alimento: helado }, '2026-11-16', azar)!;
    const t1 = nuevoCapricho({ nombre: 'Pipas' }, '2026-11-01', azar)!;
    const t2 = nuevoCapricho({ nombre: 'pipas' }, '2026-11-16', azar)!;
    const lista = conCapricho(conCapricho(conCapricho(conCapricho([], a), t1), b), t2);
    expect(lista.map(c => c.nombre)).toEqual(['pipas', 'Helado de vainilla']);
  });

  it('tope y quitar', () => {
    let lista = [] as ReturnType<typeof conCapricho>;
    for (let i = 0; i < MAX_CAPRICHOS + 5; i++) lista = conCapricho(lista, { ...nuevoCapricho({ nombre: `c${i}` }, '2026-11-16')!, id: `id${i}` });
    expect(lista).toHaveLength(MAX_CAPRICHOS);
    expect(sinCapricho(lista, 'id24').map(c => c.id)).not.toContain('id24');
  });
});
