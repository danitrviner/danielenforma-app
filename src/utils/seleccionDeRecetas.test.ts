import { describe, expect, it } from 'vitest';
import type { Recipe } from '../types';
import {
  aplicarSeleccion, compilarFiltro, conDiasConTiempo, conFiltro, esDiaConTiempo, filtroDeDieta, filtroVacio,
  idDePaquete, llevaAlimento, quiereAlgunaDieta, resumenDeFiltro, sumarFiltro, TODAS_LAS_DIETAS,
  type PaqueteDeRecetas, type SeleccionDeRecetas,
} from './seleccionDeRecetas';
import { rankCandidates, type GeneratorPrefs } from './menuEngine';
import { findRecipeAlternatives } from './recipeMatch';

function receta(id: string, o: Partial<Recipe> = {}): Recipe {
  return {
    id, ownerId: 'recetas', name: o.name ?? `Receta ${id}`, categories: [], ingredients: [], extras: [], steps: [],
    exchanges: { HC: 2, PROT: 2, GRASA: 1 }, ...o,
  };
}
const con = (...nombres: string[]): Partial<Recipe> => ({ ingredientsText: nombres.map(name => ({ name, quantity: 0 })) });

describe('llevaAlimento', () => {
  it('encuentra el alimento aunque el coach lo escriba en plural o sin tilde', () => {
    const r = receta('a', con('Garbanzo cocido', 'Atún en lata'));
    expect(llevaAlimento(r, 'Garbanzos')).toBe(true);
    expect(llevaAlimento(r, 'atun')).toBe(true);
    expect(llevaAlimento(r, 'lentejas')).toBe(false);
    expect(llevaAlimento(r, '  ')).toBe(false);
  });

  it('las palabras de familia reconocen a toda la familia', () => {
    expect(llevaAlimento(receta('g', con('Gambas peladas')), 'Marisco')).toBe(true);
    expect(llevaAlimento(receta('m', con('Merluza')), 'pescado')).toBe(true);
    expect(llevaAlimento(receta('q', con('Queso fresco')), 'Lácteos')).toBe(true);
    expect(llevaAlimento(receta('p', con('Pechuga de pavo')), 'carnes')).toBe(true);
    expect(llevaAlimento(receta('a', con('Arroz')), 'pescado')).toBe(false);
  });
});

describe('compilarFiltro', () => {
  const arrozRapido = receta('arroz', { name: 'Arroz con pollo', basica: true, tupper: true, ...con('Arroz', 'Pollo') });
  const lentejas = receta('lentejas', { name: 'Lentejas estofadas', ...con('Lenteja', 'Zanahoria') });
  const tostada = receta('tostada', { name: 'Tostada de atún', basica: true, ...con('Pan', 'Atún') });

  it('cada cosa marcada estrecha la lista; dentro de cada una basta con una', () => {
    const pasa = compilarFiltro({ rapidas: true, con: ['arroz', 'atún'] });
    expect([arrozRapido, lentejas, tostada].filter(pasa).map(r => r.id)).toEqual(['arroz', 'tostada']);
  });

  it('«sin» quita lo que lleve cualquiera de esos alimentos', () => {
    const pasa = compilarFiltro({ sin: ['atun'] });
    expect([arrozRapido, lentejas, tostada].filter(pasa).map(r => r.id)).toEqual(['arroz', 'lentejas']);
  });

  it('filtra por tipo de plato y por tupper', () => {
    expect([arrozRapido, lentejas, tostada].filter(compilarFiltro({ platos: ['legumbre', 'tostada'] })).map(r => r.id))
      .toEqual(['lentejas', 'tostada']);
    expect([arrozRapido, lentejas, tostada].filter(compilarFiltro({ tupper: true })).map(r => r.id)).toEqual(['arroz']);
  });

  it('un paquete deja solo sus recetas; un paquete borrado no deja ninguna', () => {
    const paquetes: PaqueteDeRecetas[] = [{ id: 'p1', nombre: 'Legumbres', recipeIds: ['lentejas'] }];
    expect([arrozRapido, lentejas].filter(compilarFiltro({ paquetes: ['p1'] }, paquetes)).map(r => r.id)).toEqual(['lentejas']);
    expect([arrozRapido, lentejas].filter(compilarFiltro({ paquetes: ['borrado'] }, paquetes))).toEqual([]);
  });

  it('un día con tiempo no se limita a rápidas, pero el resto del filtro sigue', () => {
    const pasa = compilarFiltro({ rapidas: true, sin: ['atun'] }, [], true);
    expect([arrozRapido, lentejas, tostada].filter(pasa).map(r => r.id)).toEqual(['arroz', 'lentejas']);
  });
});

describe('filtroDeDieta y días con tiempo', () => {
  const sel: SeleccionDeRecetas = {
    general: { rapidas: true },
    porDieta: { descanso: { con: ['lentejas'] }, vacia: {} },
    diasConTiempo: ['wed', 'thu'],
  };

  it('manda el filtro propio; si no tiene, el de todas las dietas', () => {
    expect(filtroDeDieta(sel, 'descanso')).toEqual({ con: ['lentejas'] });
    expect(filtroDeDieta(sel, 'vacia')).toEqual({ rapidas: true });
    expect(filtroDeDieta(sel, null)).toEqual({ rapidas: true });
    expect(filtroDeDieta(undefined, 'descanso')).toBeNull();
  });

  it('en una tanda solo es «con tiempo» si lo son todos sus días', () => {
    expect(esDiaConTiempo(sel, ['wed'])).toBe(true);
    expect(esDiaConTiempo(sel, ['wed', 'thu'])).toBe(true);
    expect(esDiaConTiempo(sel, ['wed', 'fri'])).toBe(false);
    expect(esDiaConTiempo(sel, undefined)).toBe(false);
  });
});

describe('aplicarSeleccion', () => {
  const rapidas = Array.from({ length: 6 }, (_, i) => receta(`r${i}`, { basica: true }));
  const lentas = Array.from({ length: 6 }, (_, i) => receta(`l${i}`, con('Garbanzos')));
  const pool = [...rapidas, ...lentas];

  it('con filtro y recetas de sobra, el filtro gana a la lista del menú', () => {
    const r = aplicarSeleccion(pool, { listaMenu: lentas.map(x => x.id), seleccion: { general: { rapidas: true } } }, {});
    expect(r.pool.map(x => x.id)).toEqual(rapidas.map(x => x.id));
  });

  it('si el filtro deja menos de 5, vuelve a la lista del menú', () => {
    const r = aplicarSeleccion(pool, { listaMenu: lentas.map(x => x.id), seleccion: { general: { con: ['quinoa'] } } }, {});
    expect(r.pool.map(x => x.id)).toEqual(lentas.map(x => x.id));
  });

  it('el día con tiempo levanta el «solo rápidas» y lo dice', () => {
    const r = aplicarSeleccion(pool, { seleccion: { general: { rapidas: true }, diasConTiempo: ['thu'] } }, { dias: ['thu'] });
    expect(r.conTiempo).toBe(true);
    expect(r.pool).toHaveLength(12);
  });

  it('no toca el recetario que navega el atleta', () => {
    const r = aplicarSeleccion(pool, { seleccion: { general: { rapidas: true } } }, { ambito: 'recetario' });
    expect(r.pool).toHaveLength(12);
  });
});

describe('quiereAlgunaDieta', () => {
  it('sin filtros no añade nada; con filtros, vale lo que quiera cualquier dieta', () => {
    expect(quiereAlgunaDieta(undefined)).toBeUndefined();
    expect(quiereAlgunaDieta({ porDieta: { a: {} } })).toBeUndefined();
    const quiere = quiereAlgunaDieta({ general: { rapidas: true }, porDieta: { a: { con: ['garbanzos'] } } })!;
    expect(quiere(receta('x', { basica: true }))).toBe(true);
    expect(quiere(receta('y', con('Garbanzo')))).toBe(true);
    expect(quiere(receta('z'))).toBe(false);
  });
});

describe('editar la selección', () => {
  it('conFiltro limpia lo vacío y borra la tarjeta al quitarle todo', () => {
    let sel = conFiltro(undefined, 'd1', { rapidas: true, tupper: false, con: [] });
    expect(sel).toEqual({ porDieta: { d1: { rapidas: true } } });
    sel = conFiltro(sel, TODAS_LAS_DIETAS, { sin: ['atún'] });
    expect(sel.general).toEqual({ sin: ['atún'] });
    sel = conFiltro(sel, 'd1', {});
    expect(sel).toEqual({ general: { sin: ['atún'] } });
  });

  it('una plantilla se suma a lo que ya hay sin duplicar', () => {
    expect(sumarFiltro({ con: ['Arroz'], rapidas: true }, { con: ['Arroz', 'Garbanzos'], tupper: true }))
      .toEqual({ rapidas: true, tupper: true, con: ['Arroz', 'Garbanzos'] });
  });

  it('los siete días con tiempo equivalen a ninguno', () => {
    expect(conDiasConTiempo({}, ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])).toEqual({});
    expect(conDiasConTiempo({}, ['wed', 'wed'])).toEqual({ diasConTiempo: ['wed'] });
  });

  it('filtroVacio y el resumen corto', () => {
    expect(filtroVacio({ con: [] })).toBe(true);
    expect(resumenDeFiltro({ rapidas: true, con: ['Arroz', 'Garbanzos'], sin: ['Atún'] }))
      .toBe('Rápidas · con arroz, garbanzos · sin atún');
    expect(resumenDeFiltro({ paquetes: ['p'] }, id => (id === 'p' ? 'Batch' : undefined))).toBe('paquete Batch');
    expect(resumenDeFiltro(undefined)).toBe('Sin filtros');
  });

  it('ids de paquete legibles y sin repetir', () => {
    expect(idDePaquete('Cenas rápidas', [])).toBe('cenas-rapidas');
    expect(idDePaquete('Cenas rápidas', [{ id: 'cenas-rapidas', nombre: '', recipeIds: [] }])).toBe('cenas-rapidas-2');
  });
});

describe('el generador respeta la selección por dieta', () => {
  const target = { HC: 2, PROT: 2, GRASA: 1 };
  const rapidas = Array.from({ length: 5 }, (_, i) => receta(`r${i}`, { basica: true }));
  const garbanzos = Array.from({ length: 5 }, (_, i) => receta(`g${i}`, con('Garbanzos')));
  const lentas = Array.from({ length: 5 }, (_, i) => receta(`l${i}`, { cookingTime: 1 }));
  const pool = [...rapidas, ...garbanzos, ...lentas];
  const prefs: GeneratorPrefs = {
    allergies: [], disliked: [], liked: [], variety: 3, cookingMaxTime: 15,
    seleccion: { general: { rapidas: true }, porDieta: { descanso: { con: ['garbanzos'] } }, diasConTiempo: ['thu'] },
  };
  const ids = (r: { recipe: Recipe }[]) => new Set(r.map(c => c.recipe.id[0]));

  it('cada dieta usa sus filtros', () => {
    expect(ids(rankCandidates(pool, target, prefs, new Set(), { dietId: 'entreno', dias: ['mon'] }))).toEqual(new Set(['r']));
    expect(ids(rankCandidates(pool, target, prefs, new Set(), { dietId: 'descanso', dias: ['mon'] }))).toEqual(new Set(['g']));
  });

  it('el día con tiempo admite recetas largas aunque el atleta dijera 15 minutos', () => {
    expect(ids(rankCandidates(pool, target, prefs, new Set(), { dietId: 'entreno', dias: ['thu'] }))).toEqual(new Set(['r', 'g', 'l']));
  });

  it('«cambiar comida» del atleta también los respeta', () => {
    const origen = receta('origen', { basica: true });
    const alt = findRecipeAlternatives(origen, pool, { prefs, dietId: 'descanso', dias: ['mon'], diversify: false, limit: 50 });
    expect(new Set(alt.map(a => a.recipe.id[0]))).toEqual(new Set(['g']));
  });
});
