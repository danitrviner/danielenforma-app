import { describe, it, expect } from 'vitest';
import { grupoDeReceta } from './grupoDeReceta';

const g = (name: string, categoria = 'Platos salados / principales') => grupoDeReceta({ name, categoria });

describe('grupo de una receta', () => {
  it('saca de «Platos salados» lo que no es un plato salado', () => {
    expect(g('Batido de arándanos con proteína')).toBe('Batidos y smoothies');
    expect(g('Manzana asada con canela')).toBe('Fruta');
    expect(g('Almendras')).toBe('Frutos secos y snacks');
    expect(g('Guacamole casero')).toBe('Salsas y acompañamientos');
  });

  it('manda el plato principal, antes de la «/» y del «con»', () => {
    expect(g('Pechuga de pollo a la plancha / Ensalada de queso roquefort y espinacas')).toBe('Carnes y aves');
    expect(g('Ensalada caprese / Pechuga de pollo con especias')).toBe('Ensaladas');
    expect(g('Yogur desnatado con copos de espelta, fruta y nueces')).toBe('Yogures, lácteos y bowls');
    expect(g('Pollo con piña')).toBe('Carnes y aves');
  });

  it('la primera palabra clave decide y los plurales cuentan', () => {
    expect(g('Berenjena rellena de quinoa y verduras')).toBe('Verduras');
    expect(g('Albóndigas de lentejas (P) con zanahoria')).toBe('Legumbres');
    expect(g('Albóndigas de pollo a la plancha')).toBe('Carnes y aves');
    expect(g('Alubias (P) al curry con patatas')).toBe('Legumbres');
    expect(g('Raviolis rellenos de setas con salmón')).toBe('Pastas');
    expect(g('Berberechos (P) con limón')).toBe('Pescados y marisco');
    expect(g('Bol de quinoa (P), tofu y aguacate')).toBe('Arroces y granos');
  });

  it('separa suplementos de alimentos sueltos', () => {
    expect(g('3Carb gel 24g HC', 'Suplementos deportivos')).toBe('Suplementos');
    expect(g('Electrolitos (Prozis)', 'Alimentos y suplementos')).toBe('Suplementos');
    expect(g('Aceite de oliva', 'Alimentos y suplementos')).toBe('Alimentos sueltos');
    // Un plato metido entre los suplementos se clasifica como plato.
    expect(g('Bagel de salmón ahumado y huevo', 'Suplementos deportivos')).toBe('Tostadas y bocadillos');
  });

  it('queso batido no es un batido; hamburguesas y wraps van aparte', () => {
    expect(g('Queso batido con frambuesas')).toBe('Yogures, lácteos y bowls');
    expect(g('Hamburguesa de espinacas al plato / Ensalada')).toBe('Hamburguesas');
    expect(g('Wrap de pollo con lechuga')).toBe('Wraps, tacos y burritos');
  });

  it('sin palabra clave cae a su categoría de origen', () => {
    expect(g('Mug cake', 'Desayuno y dulces')).toBe('Dulces y postres');
    expect(g('Agua', 'Bebidas')).toBe('Bebidas');
  });
});
