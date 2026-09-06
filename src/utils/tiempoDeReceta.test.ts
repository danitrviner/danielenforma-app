import { describe, it, expect } from 'vitest';
import { minutosDeReceta, superaElTiempo } from './tiempoDeReceta';

describe('minutosDeReceta', () => {
  // El recetario guarda `cookingTime` como índice 1-4 e INVERTIDO: 4 es lo más
  // rápido (bocadillos, 2,8 pasos) y 1 lo más lento (horno y olla, 7,6 pasos).
  // Calibrado contra los minutos que las propias recetas declaran en sus pasos.
  it('traduce el índice a minutos, de rápido (4) a lento (1)', () => {
    expect(minutosDeReceta({ cookingTime: 4 })).toBe(10);
    expect(minutosDeReceta({ cookingTime: 3 })).toBe(20);
    expect(minutosDeReceta({ cookingTime: 2 })).toBe(35);
    expect(minutosDeReceta({ cookingTime: 1 })).toBe(60);
  });

  it('el índice es decreciente en tiempo: 4 es más rápido que 1', () => {
    expect(minutosDeReceta({ cookingTime: 4 })!).toBeLessThan(minutosDeReceta({ cookingTime: 1 })!);
  });

  it('sin dato no se inventa un tiempo', () => {
    expect(minutosDeReceta({})).toBeNull();
    expect(minutosDeReceta({ cookingTime: undefined })).toBeNull();
    expect(minutosDeReceta({ cookingTime: 0 })).toBeNull();
  });

  it('un valor por encima de 4 ya son minutos de verdad, no un índice', () => {
    // Las recetas del constructor del entrenador no traen `cookingTime`, pero si
    // algún día lo trajeran en minutos, un 45 no puede leerse como índice.
    expect(minutosDeReceta({ cookingTime: 45 })).toBe(45);
  });
});

describe('superaElTiempo', () => {
  // El fallo que esto arregla: se comparaba el índice (1-4) contra los minutos
  // del atleta (15, 30, 45...). Como 4 nunca es mayor que 15, el filtro
  // descartaba CERO recetas y la pregunta del alta no hacía nada.
  it('descarta la receta lenta para quien tiene 15 minutos', () => {
    expect(superaElTiempo({ cookingTime: 1 }, 15)).toBe(true);   // 60 min
    expect(superaElTiempo({ cookingTime: 2 }, 15)).toBe(true);   // 35 min
    expect(superaElTiempo({ cookingTime: 3 }, 15)).toBe(true);   // 20 min
    expect(superaElTiempo({ cookingTime: 4 }, 15)).toBe(false);  // 10 min
  });

  it('con una hora entra todo el recetario', () => {
    for (const idx of [1, 2, 3, 4]) expect(superaElTiempo({ cookingTime: idx }, 60)).toBe(false);
  });

  it('sin límite del atleta no filtra', () => {
    expect(superaElTiempo({ cookingTime: 1 }, undefined)).toBe(false);
  });

  it('sin dato en la receta se admite: mejor ofrecerla que esconderla', () => {
    expect(superaElTiempo({}, 15)).toBe(false);
  });
});
