import { describe, it, expect, beforeAll, vi } from 'vitest';
import { queryRecetas, queryRecetasForGenerator, cargarIndiceRecetas } from './recipes';

/* El recetario dejó de leerse de Firestore.
 *
 * Antes, listar recetas eran 8.850 documentos releídos desde el servidor en
 * cada sesión de cada atleta: agotaba la cuota diaria de lecturas de la base de
 * datos —con la app entera cayéndose a modo local y el aviso rojo de «los
 * cambios NO se están guardando» cuando pasaba— y pagaba un viaje a us-west1
 * por cada página. Ahora el índice viaja dentro de la app y listar cuesta cero
 * lecturas; solo se va al servidor al abrir una receta concreta.
 *
 * Lo que aquí se protege es que la paginación y los filtros sigan dando el
 * mismo resultado que daba la consulta de Firestore, porque toda la pantalla
 * depende de eso y ya no hay servidor que corrija un fallo de recorte. */

const receta = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id, name, intakeTypes: [1], ingredientsText: [], ...extra,
});

// Deliberadamente desordenadas por nombre: el generador las ordena al escribir
// el fichero, así que el índice real llega ordenado y estas pruebas comprueban
// que la app respeta ese orden en vez de reordenar por su cuenta.
const INDICE = [
  receta('a', 'Arroz con pollo',   { categoria: 'Platos salados' }),
  receta('b', 'Batido de fresa',   { categoria: 'Bebidas', intakeTypes: [2] }),
  receta('c', 'Crema de calabaza', { categoria: 'Platos salados' }),
  receta('d', 'Dorada al horno',   { categoria: 'Platos salados', intakeTypes: [1, 2] }),
  receta('e', 'Ensalada César',    { categoria: 'Platos salados' }),
];

beforeAll(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    json: async () => ({ total: INDICE.length, recetas: INDICE }),
  })));
});

describe('índice del recetario empaquetado', () => {
  it('se lee del fichero de la app, no de Firestore', async () => {
    const indice = await cargarIndiceRecetas();
    expect(indice).toHaveLength(5);
    expect(fetch).toHaveBeenCalledWith('/recetas-indice.json');
  });

  it('lo carga UNA vez aunque se lo pidan varias', async () => {
    const llamadasPrevias = (fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
    await Promise.all([cargarIndiceRecetas(), cargarIndiceRecetas(), queryRecetas({}, null, 2)]);
    expect((fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(llamadasPrevias);
  });

  it('repone los campos derivados que no se guardan 8.850 veces en el fichero', async () => {
    const [primera] = await cargarIndiceRecetas();
    expect(primera.ownerId).toBe('recetas');
    expect(primera.categories).toEqual(['Platos salados']);
    expect(primera.ingredients).toEqual([]);
  });
});

describe('queryRecetas — paginación sobre el índice', () => {
  it('devuelve la primera página y avisa de que hay más', async () => {
    const { recipes, cursor, hasMore } = await queryRecetas({}, null, 2);
    expect(recipes.map(r => r.id)).toEqual(['a', 'b']);
    expect(cursor).toEqual({ offset: 2 });
    expect(hasMore).toBe(true);
  });

  it('continúa por donde iba al pasarle el cursor', async () => {
    const primera = await queryRecetas({}, null, 2);
    const segunda = await queryRecetas({}, primera.cursor, 2);
    expect(segunda.recipes.map(r => r.id)).toEqual(['c', 'd']);
    expect(segunda.hasMore).toBe(true);
  });

  it('marca el final sin dejarse la última receta', async () => {
    const { recipes, hasMore } = await queryRecetas({}, { offset: 4 }, 2);
    expect(recipes.map(r => r.id)).toEqual(['e']);
    expect(hasMore).toBe(false);
  });

  it('respeta el orden por nombre del fichero', async () => {
    const { recipes } = await queryRecetas({}, null, 99);
    expect(recipes.map(r => r.name)).toEqual([...recipes.map(r => r.name)].sort((x, y) => x.localeCompare(y, 'es')));
  });

  it('filtra por categoría', async () => {
    const { recipes, hasMore } = await queryRecetas({ categoria: 'Bebidas' }, null, 10);
    expect(recipes.map(r => r.id)).toEqual(['b']);
    expect(hasMore).toBe(false);
  });

  it('filtra por tipo de ingesta, incluyendo recetas con varios', async () => {
    const { recipes } = await queryRecetas({ intakeType: 2 }, null, 10);
    expect(recipes.map(r => r.id)).toEqual(['b', 'd']);
  });

  it('combina los dos filtros', async () => {
    const { recipes } = await queryRecetas({ categoria: 'Platos salados', intakeType: 2 }, null, 10);
    expect(recipes.map(r => r.id)).toEqual(['d']);
  });

  it('con un filtro sin resultados no se queda pidiendo más páginas', async () => {
    const { recipes, hasMore } = await queryRecetas({ categoria: 'No existe' }, null, 10);
    expect(recipes).toEqual([]);
    expect(hasMore).toBe(false);
  });
});

describe('queryRecetasForGenerator', () => {
  it('solo propone recetas del tipo de ingesta pedido', async () => {
    const recetas = await queryRecetasForGenerator(2, 10);
    expect(recetas.map(r => r.id).sort()).toEqual(['b', 'd']);
  });

  it('respeta el tope de candidatas', async () => {
    const recetas = await queryRecetasForGenerator(1, 2);
    expect(recetas).toHaveLength(2);
  });

  it('devuelve lista vacía si ningún plato encaja, sin reventar el generador', async () => {
    expect(await queryRecetasForGenerator(99, 10)).toEqual([]);
  });
});
