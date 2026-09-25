import { describe, it, expect, beforeEach } from 'vitest';
import { apilarCierre, cerrarElDeArriba, pilaDeEscape } from './overlayHooks';

/* Escape con overlays anidados. El caso real: el buscador de alimentos abre la
 * hoja de crear alimento, y esa abre la guía de etiquetas — tres capas. Antes
 * cada una escuchaba Escape por su cuenta y todas se disparaban a la vez: una
 * sola pulsación cerraba las tres y devolvía al atleta a «Mi plan» sin haber
 * pedido nada de eso. */

describe('Escape solo cierra el overlay de arriba', () => {
  beforeEach(() => { pilaDeEscape.length = 0; });

  it('con una sola capa, la cierra', () => {
    const cerrados: string[] = [];
    apilarCierre(() => cerrados.push('a'));
    expect(cerrarElDeArriba()).toBe(true);
    expect(cerrados).toEqual(['a']);
  });

  it('con tres capas, solo se cierra la última abierta', () => {
    const cerrados: string[] = [];
    apilarCierre(() => cerrados.push('buscador'));
    apilarCierre(() => cerrados.push('crear'));
    apilarCierre(() => cerrados.push('guia'));
    cerrarElDeArriba();
    expect(cerrados).toEqual(['guia']);
  });

  it('cerrada la de arriba, la siguiente pulsación cierra la de debajo', () => {
    const cerrados: string[] = [];
    apilarCierre(() => cerrados.push('buscador'));
    const quitarCrear = apilarCierre(() => cerrados.push('crear'));
    cerrarElDeArriba();
    quitarCrear();
    cerrarElDeArriba();
    expect(cerrados).toEqual(['crear', 'buscador']);
  });

  it('desapilar en cualquier orden no descoloca la pila', () => {
    const cerrados: string[] = [];
    const quitarA = apilarCierre(() => cerrados.push('a'));
    apilarCierre(() => cerrados.push('b'));
    // La de ABAJO se desmonta primero: raro, pero pasa si el padre se cierra
    // solo. La de arriba tiene que seguir siendo la de arriba.
    quitarA();
    cerrarElDeArriba();
    expect(cerrados).toEqual(['b']);
  });

  it('sin overlays abiertos no hace nada ni revienta', () => {
    const quitar = apilarCierre(() => { throw new Error('no debería llamarse'); });
    quitar();
    expect(cerrarElDeArriba()).toBe(false);
    expect(pilaDeEscape).toHaveLength(0);
  });

  it('quitar dos veces el mismo overlay no saca al de al lado', () => {
    const cerrados: string[] = [];
    const quitarA = apilarCierre(() => cerrados.push('a'));
    apilarCierre(() => cerrados.push('b'));
    quitarA();
    quitarA();
    expect(pilaDeEscape).toHaveLength(1);
    cerrarElDeArriba();
    expect(cerrados).toEqual(['b']);
  });
});
