import { describe, it, expect } from 'vitest';
import { nombreCortoDeSesion, nombresCortosDeSesiones, nombreDeSesion } from './nombresMeso';

describe('nombreCortoDeSesion', () => {
  it('quita el atleta y el bloque de un nombre generado', () => {
    expect(nombreCortoDeSesion('Torso · Javier Vergara · Meso #1')).toBe('Torso');
    expect(nombreCortoDeSesion('Sesión 2 · Javier Vergara · Fuerza invierno')).toBe('Sesión 2');
  });
  it('sin atleta, quita el «Meso #N»', () => {
    expect(nombreCortoDeSesion('Pierna · Meso #3')).toBe('Pierna');
  });
  it('un nombre escrito a mano se deja tal cual', () => {
    expect(nombreCortoDeSesion('Torso A')).toBe('Torso A');
    expect(nombreCortoDeSesion('Torso · fuerza')).toBe('Torso · fuerza');
  });
  it('es lo inverso de nombreDeSesion', () => {
    const n = nombreDeSesion({ tipo: 'Full body', dayIdx: 0, athleteName: 'Lucía Martín', meso: { number: 2 } });
    expect(nombreCortoDeSesion(n)).toBe('Full body');
  });
});

describe('nombresCortosDeSesiones', () => {
  it('añade letra solo a los repetidos, por orden', () => {
    expect(nombresCortosDeSesiones([
      'Torso · X · Meso #1', 'Pierna · X · Meso #1', 'Torso · X · Meso #1', 'Pierna · X · Meso #1', 'Core · X · Meso #1',
    ])).toEqual(['Torso A', 'Pierna A', 'Torso B', 'Pierna B', 'Core']);
  });
  it('sin repetidos no añade nada', () => {
    expect(nombresCortosDeSesiones(['Torso · X · Meso #1', 'Pierna · X · Meso #1'])).toEqual(['Torso', 'Pierna']);
  });
  it('una lista vacía da una lista vacía', () => {
    expect(nombresCortosDeSesiones([])).toEqual([]);
  });
});
