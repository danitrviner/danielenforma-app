import { describe, it, expect } from 'vitest';
import { normalizarTexto, coincideBusqueda } from './busqueda';

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
