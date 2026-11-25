import { describe, it, expect } from 'vitest';
import { normalizarTexto, coincideBusqueda, relevanciaDeBusqueda } from './busqueda';

describe('búsqueda por texto', () => {
  // El caso real: las 8 recetas de sándwich con jamón serrano del catálogo se
  // llaman "Sándwich…" y ninguna contiene la cadena literal "sandwich".
  it('encuentra "Sándwich" escribiendo "sandwich"', () => {
    expect(coincideBusqueda('Sándwich de jamón serrano y tomate', 'sandwich')).toBe(true);
    expect(coincideBusqueda('Sándwich de jamón serrano y tomate', 'jamon serrano')).toBe(true);
  });

  it('también al revés: escribir con tilde encuentra lo que no la lleva', () => {
    expect(coincideBusqueda('Tortitas de avena', 'avéna')).toBe(true);
  });

  it('ignora mayúsculas', () => {
    expect(coincideBusqueda('Pollo al horno', 'POLLO')).toBe(true);
  });

  it('aguanta los espacios y saltos de línea colados del recetario importado', () => {
    expect(coincideBusqueda('Sándwich de jamón serrano y tomate\n', 'tomate')).toBe(true);
    expect(coincideBusqueda(' Fideos de arroz  con   seitán', 'arroz con seitan')).toBe(true);
    expect(coincideBusqueda('Pollo al horno', '  pollo  ')).toBe(true);
  });

  it('un término vacío no filtra nada', () => {
    expect(coincideBusqueda('lo que sea', '')).toBe(true);
    expect(coincideBusqueda('lo que sea', '   ')).toBe(true);
  });

  it('sigue sin encontrar lo que de verdad no está', () => {
    expect(coincideBusqueda('Sándwich de jamón serrano', 'salmon')).toBe(false);
  });

  it('normalizarTexto deja el texto listo para comparar', () => {
    expect(normalizarTexto('  Puré de PATATA\n')).toBe('pure de patata');
  });
});

// Nadie se acuerda del nombre exacto de una receta; se acuerda de lo que lleva.
describe('búsqueda por varias palabras', () => {
  const receta = 'Queso batido con cacao 0%, plátano, granola y chocolate';

  it('encuentra la receta con las palabras sueltas y en otro orden', () => {
    expect(coincideBusqueda(receta, 'queso batido cacao granola')).toBe(true);
    expect(coincideBusqueda(receta, 'granola chocolate queso')).toBe(true);
    expect(coincideBusqueda(receta, 'platano granola')).toBe(true);
  });

  it('las quiere TODAS: una palabra que no está descarta la receta', () => {
    expect(coincideBusqueda(receta, 'queso batido salmon')).toBe(false);
  });

  it('la frase entera sigue funcionando', () => {
    expect(coincideBusqueda(receta, 'cacao 0%, plátano')).toBe(true);
  });

  it('los espacios de más no cuentan como palabra', () => {
    expect(coincideBusqueda(receta, '  granola   chocolate  ')).toBe(true);
  });
});

describe('relevanciaDeBusqueda (25-11)', () => {
  const ordenar = (nombres: string[], q: string) => [...nombres].sort((a, b) => relevanciaDeBusqueda(a, q) - relevanciaDeBusqueda(b, q));

  it('buscando «huevo», primero lo que ES huevo y no lo que lleva medio', () => {
    const nombres = [
      'Bocadillo de jamón cocido con rúcula, guisantes y medio huevo revuelto',
      'Huevos revueltos con jamón',
      'Tostada de aguacate con huevo',
      'Revuelto de huevo y espárragos',
    ];
    expect(ordenar(nombres, 'huevo')).toEqual([
      'Huevos revueltos con jamón',
      'Revuelto de huevo y espárragos',
      'Tostada de aguacate con huevo',
      'Bocadillo de jamón cocido con rúcula, guisantes y medio huevo revuelto',
    ]);
  });

  it('sin tildes y con varias palabras', () => {
    expect(relevanciaDeBusqueda('Atún con tomate', 'atun')).toBeLessThan(relevanciaDeBusqueda('Ensalada de atún', 'atun'));
    expect(relevanciaDeBusqueda('Huevos con jamón', 'jamon huevo')).toBeLessThan(relevanciaDeBusqueda('Pan con jamón, queso, rúcula y huevo duro', 'jamon huevo'));
  });

  it('palabra entera gana a trozo de palabra', () => {
    expect(relevanciaDeBusqueda('Pan de pasas', 'pan')).toBeLessThan(relevanciaDeBusqueda('Empanada', 'pan'));
  });
});
