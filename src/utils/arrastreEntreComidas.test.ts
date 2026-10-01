import { describe, it, expect } from 'vitest';
import { calcularArrastreEntreComidas, type ComidaParaArrastre } from './arrastreEntreComidas';

const vacio = { HC: 0, PROT: 0, GRASA: 0 };

function comida(p: Partial<ComidaParaArrastre> & { id: string }): ComidaParaArrastre {
  return { nombre: p.id, target: undefined, libre: false, colocado: { ...vacio }, ...p };
}

describe('calcularArrastreEntreComidas', () => {
  it('sin nada colocado, el objetivo efectivo es el original', () => {
    const comidas = [
      comida({ id: 'm1', target: { HC: 2, PROT: 1 } }),
      comida({ id: 'm2', target: { HC: 1 } }),
    ];
    const out = calcularArrastreEntreComidas(comidas);
    expect(out.find(o => o.mealId === 'm1')!.objetivo).toEqual({ HC: 2, PROT: 1 });
    expect(out.find(o => o.mealId === 'm2')!.objetivo).toEqual({ HC: 1 });
    expect(out.every(o => Object.keys(o.ajustes).length === 0)).toBe(true);
  });

  it('exceso: lo que sobra se resta de la siguiente comida', () => {
    const comidas = [
      comida({ id: 'desayuno', nombre: 'Desayuno', target: { HC: 2 }, colocado: { ...vacio, HC: 3 } }),
      comida({ id: 'comida', nombre: 'Comida', target: { HC: 1 } }),
    ];
    const out = calcularArrastreEntreComidas(comidas);
    // La primera no recibe nada de nadie: conserva su objetivo.
    expect(out.find(o => o.mealId === 'desayuno')!.objetivo.HC).toBe(2);
    const comida2 = out.find(o => o.mealId === 'comida')!;
    expect(comida2.objetivo.HC).toBe(0); // 1 - 1 de exceso
    expect(comida2.ajustes.HC).toEqual([{ mealId: 'desayuno', nombre: 'Desayuno', delta: -1 }]);
  });

  it('coincide con el ejemplo del encargo: "HC 1,5 (era 2 · −0,5 por Desayuno)"', () => {
    const comidas = [
      comida({ id: 'desayuno', nombre: 'Desayuno', target: { HC: 2 }, colocado: { ...vacio, HC: 2.5 } }),
      comida({ id: 'comida', nombre: 'Comida', target: { HC: 2 } }),
    ];
    const out = calcularArrastreEntreComidas(comidas);
    const comida2 = out.find(o => o.mealId === 'comida')!;
    expect(comida2.objetivo.HC).toBe(1.5);
    expect(comida2.ajustes.HC).toEqual([{ mealId: 'desayuno', nombre: 'Desayuno', delta: -0.5 }]);
  });

  it('déficit: lo que falta se suma a la siguiente comida', () => {
    const comidas = [
      comida({ id: 'desayuno', nombre: 'Desayuno', target: { HC: 2 }, colocado: { ...vacio, HC: 1 } }),
      comida({ id: 'comida', nombre: 'Comida', target: { HC: 1 } }),
    ];
    const out = calcularArrastreEntreComidas(comidas);
    const comida2 = out.find(o => o.mealId === 'comida')!;
    expect(comida2.objetivo.HC).toBe(2); // 1 + 1 que faltó
    expect(comida2.ajustes.HC).toEqual([{ mealId: 'desayuno', nombre: 'Desayuno', delta: 1 }]);
  });

  it('varias comidas pasadas acumulan su arrastre antes de llegar a la vacía', () => {
    const comidas = [
      comida({ id: 'm1', nombre: 'M1', target: { HC: 2 }, colocado: { ...vacio, HC: 3 } }), // sobra 1
      comida({ id: 'm2', nombre: 'M2', target: { HC: 2 }, colocado: { ...vacio, HC: 2.5 } }), // sobra 0.5
      comida({ id: 'm3', nombre: 'M3', target: { HC: 2 } }),
    ];
    const out = calcularArrastreEntreComidas(comidas);
    const m3 = out.find(o => o.mealId === 'm3')!;
    expect(m3.objetivo.HC).toBe(0.5); // 2 - 1 - 0.5
    expect(m3.ajustes.HC).toEqual([
      { mealId: 'm1', nombre: 'M1', delta: -1 },
      { mealId: 'm2', nombre: 'M2', delta: -0.5 },
    ]);
  });

  it('si el exceso es mayor que el objetivo de la siguiente vacía, esa se queda en 0 y el resto sigue a la siguiente', () => {
    const comidas = [
      comida({ id: 'm1', nombre: 'M1', target: { HC: 1 }, colocado: { ...vacio, HC: 5 } }), // sobra 4
      comida({ id: 'm2', nombre: 'M2', target: { HC: 1 } }),
      comida({ id: 'm3', nombre: 'M3', target: { HC: 2 } }),
    ];
    const out = calcularArrastreEntreComidas(comidas);
    // m2 absorbe 1 (hasta 0) y pasa -3; m3 absorbe 2 (hasta 0) y pasa -1.
    // Sin más abiertas después, el -1 restante se reparte entre m2 y m3 (-0.5 cada una).
    expect(out.find(o => o.mealId === 'm2')!.objetivo.HC).toBe(0);
    expect(out.find(o => o.mealId === 'm3')!.objetivo.HC).toBe(0);
    expect(out.find(o => o.mealId === 'm1')!.objetivo.HC).toBe(1); // la primera nunca recibe
  });

  it('la siguiente recibe el ajuste aunque ya tenga alimentos (dieta que llega con todo puesto)', () => {
    const comidas = [
      comida({ id: 'desayuno', nombre: 'Desayuno', target: { HC: 2 }, colocado: { ...vacio, HC: 2.5 } }),
      comida({ id: 'comida', nombre: 'Comida', target: { HC: 2 }, colocado: { ...vacio, HC: 2 } }),
      comida({ id: 'cena', nombre: 'Cena', target: { HC: 2 }, colocado: { ...vacio, HC: 2 } }),
    ];
    const out = calcularArrastreEntreComidas(comidas);
    const comida2 = out.find(o => o.mealId === 'comida')!;
    expect(comida2.objetivo.HC).toBe(1.5); // «tienes 2: quita medio»
    expect(comida2.ajustes.HC).toEqual([{ mealId: 'desayuno', nombre: 'Desayuno', delta: -0.5 }]);
    // Mientras la comida no se corrija, el medio sigue pendiente en la cena.
    expect(out.find(o => o.mealId === 'cena')!.objetivo.HC).toBe(1.5);
  });

  it('si el atleta corrige la comida siguiente, el ajuste se acaba ahí', () => {
    const comidas = [
      comida({ id: 'desayuno', nombre: 'Desayuno', target: { HC: 2 }, colocado: { ...vacio, HC: 2.5 } }),
      comida({ id: 'comida', nombre: 'Comida', target: { HC: 2 }, colocado: { ...vacio, HC: 1.5 } }),
      comida({ id: 'cena', nombre: 'Cena', target: { HC: 2 }, colocado: { ...vacio, HC: 2 } }),
    ];
    const out = calcularArrastreEntreComidas(comidas);
    expect(out.find(o => o.mealId === 'comida')!.objetivo.HC).toBe(1.5);
    const cena = out.find(o => o.mealId === 'cena')!;
    expect(cena.objetivo.HC).toBe(2);
    expect(cena.ajustes.HC).toBeUndefined();
  });

  it('una corrección a medias deja pasar solo lo que falta, con su desglose', () => {
    const comidas = [
      comida({ id: 'desayuno', nombre: 'Desayuno', target: { HC: 2 }, colocado: { ...vacio, HC: 3 } }), // sobra 1
      comida({ id: 'comida', nombre: 'Comida', target: { HC: 2 }, colocado: { ...vacio, HC: 1.5 } }), // quita 0,5
      comida({ id: 'cena', nombre: 'Cena', target: { HC: 2 }, colocado: { ...vacio, HC: 2 } }),
    ];
    const out = calcularArrastreEntreComidas(comidas);
    const cena = out.find(o => o.mealId === 'cena')!;
    expect(cena.objetivo.HC).toBe(1.5);
    expect(cena.ajustes.HC).toEqual([
      { mealId: 'desayuno', nombre: 'Desayuno', delta: -1 },
      { mealId: 'comida', nombre: 'Comida', delta: 0.5 },
    ]);
  });

  it('lo que sobra en la última comida no va a ningún sitio si no hay comidas vacías (lo refleja el total del día)', () => {
    const comidas = [
      comida({ id: 'm1', nombre: 'M1', target: { HC: 1 }, colocado: { ...vacio, HC: 1 } }),
      comida({ id: 'm2', nombre: 'M2', target: { HC: 1 }, colocado: { ...vacio, HC: 3 } }),
    ];
    const out = calcularArrastreEntreComidas(comidas);
    expect(out.find(o => o.mealId === 'm1')!.objetivo.HC).toBe(1);
    expect(out.find(o => o.mealId === 'm2')!.objetivo.HC).toBe(1);
    expect(out.every(o => Object.keys(o.ajustes).length === 0)).toBe(true);
  });

  it('las comidas sin reparto, o libres, ni generan ni reciben arrastre', () => {
    const comidas = [
      comida({ id: 'm1', nombre: 'M1', target: { HC: 2 }, colocado: { ...vacio, HC: 3 } }), // sobra 1
      comida({ id: 'libre', nombre: 'Libre', libre: true, target: { HC: 5 }, colocado: { ...vacio, HC: 5 } }),
      comida({ id: 'sinReparto', nombre: 'Sin reparto', colocado: { ...vacio, HC: 1 } }), // target undefined
      comida({ id: 'm2', nombre: 'M2', target: { HC: 1 } }),
    ];
    const out = calcularArrastreEntreComidas(comidas);
    expect(out.some(o => o.mealId === 'libre')).toBe(false);
    expect(out.some(o => o.mealId === 'sinReparto')).toBe(false);
    expect(out.find(o => o.mealId === 'm2')!.objetivo.HC).toBe(0); // 1 - 1, saltándose libre y sin reparto
  });

  it('categorías independientes: HC y PROT arrastran por separado dentro de las mismas comidas', () => {
    const comidas = [
      comida({ id: 'm1', nombre: 'M1', target: { HC: 2, PROT: 1 }, colocado: { ...vacio, HC: 3, PROT: 0 } }),
      comida({ id: 'm2', nombre: 'M2', target: { HC: 1, PROT: 1 } }),
    ];
    const out = calcularArrastreEntreComidas(comidas);
    const m2 = out.find(o => o.mealId === 'm2')!;
    expect(m2.objetivo.HC).toBe(0); // sobró 1 de HC
    expect(m2.objetivo.PROT).toBe(2); // faltó 1 de PROT
  });

  it('conserva el total del día cuando no hace falta recortar por debajo de 0', () => {
    const original = { m1: 2, m2: 1, m3: 2 };
    const comidas = [
      comida({ id: 'm1', nombre: 'M1', target: { HC: original.m1 }, colocado: { ...vacio, HC: 2.75 } }),
      comida({ id: 'm2', nombre: 'M2', target: { HC: original.m2 } }),
      comida({ id: 'm3', nombre: 'M3', target: { HC: original.m3 } }),
    ];
    const out = calcularArrastreEntreComidas(comidas);
    const sumaOriginal = Object.values(original).reduce((s, v) => s + v, 0);
    // La comida con alimentos cuenta por lo COLOCADO, las vacías por su objetivo efectivo.
    const sumaResultante =
      comidas[0].colocado.HC! + out.find(o => o.mealId === 'm2')!.objetivo.HC! + out.find(o => o.mealId === 'm3')!.objetivo.HC!;
    expect(sumaResultante).toBe(sumaOriginal);
  });

  it('no toca meal.target: es una función pura, sin efectos sobre la entrada', () => {
    const m1Target = { HC: 2 };
    const comidas = [
      comida({ id: 'm1', target: m1Target, colocado: { ...vacio, HC: 3 } }),
      comida({ id: 'm2', target: { HC: 1 } }),
    ];
    calcularArrastreEntreComidas(comidas);
    expect(m1Target).toEqual({ HC: 2 });
  });
});
