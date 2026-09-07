import { describe, it, expect, vi } from 'vitest';
import type { KeyboardEvent } from 'react';
import { alPulsarTecla, pulsable } from './a11y';

/** Evento de teclado de mentira, con lo justo que mira `alPulsarTecla`. */
function evento(key: string, opciones: { dentroDeCampo?: boolean } = {}) {
  const currentTarget = { tagName: 'DIV' } as unknown as HTMLElement;
  const target = opciones.dentroDeCampo
    ? ({ closest: (sel: string) => (sel.includes('input') ? { tagName: 'INPUT' } : null) } as unknown as HTMLElement)
    : currentTarget;
  return { key, target, currentTarget, preventDefault: vi.fn() } as unknown as KeyboardEvent & { preventDefault: ReturnType<typeof vi.fn> };
}

describe('alPulsarTecla', () => {
  it('activa con Enter y con la barra espaciadora', () => {
    const accion = vi.fn();
    alPulsarTecla(accion)(evento('Enter'));
    alPulsarTecla(accion)(evento(' '));
    expect(accion).toHaveBeenCalledTimes(2);
  });

  it('corta el scroll de la barra espaciadora', () => {
    const e = evento(' ');
    alPulsarTecla(() => {})(e);
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it('no hace nada con otras teclas', () => {
    const accion = vi.fn();
    const e = evento('a');
    alPulsarTecla(accion)(e);
    expect(accion).not.toHaveBeenCalled();
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it('no roba la tecla a un campo anidado', () => {
    // Escribir un espacio dentro de un input de una fila desplegable no puede
    // desplegar la fila (ni comerse el espacio).
    const accion = vi.fn();
    const e = evento(' ', { dentroDeCampo: true });
    alPulsarTecla(accion)(e);
    expect(accion).not.toHaveBeenCalled();
    expect(e.preventDefault).not.toHaveBeenCalled();
  });
});

describe('pulsable', () => {
  it('trae los tres atributos que pide la regla', () => {
    const props = pulsable(() => {});
    expect(props.role).toBe('button');
    expect(props.tabIndex).toBe(0);
    expect(typeof props.onKeyDown).toBe('function');
    expect(typeof props.onClick).toBe('function');
  });

  it('pone aria-label solo si se le da', () => {
    expect('aria-label' in pulsable(() => {})).toBe(false);
    expect(pulsable(() => {}, 'Abrir receta')['aria-label']).toBe('Abrir receta');
  });
});
