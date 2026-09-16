import { describe, it, expect } from 'vitest';
import { proponerAjuste } from './ajusteDePeriodizacion';

/* §19 y §23: la app compara ritmo objetivo con ritmo real y PROPONE. Nunca
 * cambia nada sola — el entrenador revisa y acepta.
 *
 * Y lo que dice tiene que ser lo que pedía §23: no «según una fórmula deberías
 * gastar X», sino «come X, ha perdido X por semana, su mantenimiento parece X,
 * va por encima/debajo, el siguiente paso es X». */

const base = {
  ritmoObjetivo: -0.5,
  kcalActuales: 2500,
  mantenimientoEstimado: 2900,
  confianza: 'media' as const,
};

describe('proponerAjuste', () => {
  it('pierde menos de lo previsto → propone bajar calorías', () => {
    const p = proponerAjuste({ ...base, ritmoReal: -0.2 });
    expect(p.hayPropuesta).toBe(true);
    expect(p.kcalPropuestas!).toBeLessThan(2500);
  });

  it('pierde más de lo previsto → propone subirlas', () => {
    const p = proponerAjuste({ ...base, ritmoReal: -0.9 });
    expect(p.kcalPropuestas!).toBeGreaterThan(2500);
  });

  it('en ganancia también funciona: sube de más → bajar calorías', () => {
    // El ejemplo de §22: objetivo +0,2, real +0,5.
    const p = proponerAjuste({
      ...base, ritmoObjetivo: 0.2, ritmoReal: 0.5, mantenimientoEstimado: 2400, kcalActuales: 3000,
    });
    expect(p.kcalPropuestas!).toBeLessThan(3000);
  });

  it('va en rumbo → no propone nada, que es una respuesta válida', () => {
    const p = proponerAjuste({ ...base, ritmoReal: -0.45 });
    expect(p.hayPropuesta).toBe(false);
    expect(p.kcalPropuestas).toBeNull();
  });

  it('sin ritmo real todavía no propone nada', () => {
    const p = proponerAjuste({ ...base, ritmoReal: null });
    expect(p.hayPropuesta).toBe(false);
  });

  it('con confianza baja avisa pero no propone un número', () => {
    // Mover las calorías por una señal ruidosa es peor que esperar una semana.
    const p = proponerAjuste({ ...base, ritmoReal: -0.2, confianza: 'baja' });
    expect(p.hayPropuesta).toBe(false);
    expect(p.explicacion).toContain('pocos datos');
  });

  it('el ajuste es proporcional al desvío, no un salto fijo', () => {
    const poco = proponerAjuste({ ...base, ritmoReal: -0.35 });
    const mucho = proponerAjuste({ ...base, ritmoReal: -0.05 });
    expect(mucho.kcalPropuestas!).toBeLessThan(poco.kcalPropuestas!);
  });

  it('no propone recortes salvajes de una vez', () => {
    // Un desvío enorme no justifica quitarle 1.200 kcal de golpe a nadie.
    const p = proponerAjuste({ ...base, ritmoReal: 0.8 });
    expect(Math.abs(p.kcalPropuestas! - 2500)).toBeLessThanOrEqual(400);
  });

  it('nunca propone bajar de un suelo de seguridad', () => {
    const p = proponerAjuste({ ...base, kcalActuales: 1500, ritmoReal: 0.3 });
    expect(p.kcalPropuestas!).toBeGreaterThanOrEqual(1400);
  });

  it('explica el porqué con los números del atleta, no con una fórmula', () => {
    // Sin punto de millar: en español las cifras de cuatro dígitos se escriben
    // seguidas («2500 kcal»), y es lo que hace toLocaleString('es-ES').
    const p = proponerAjuste({ ...base, ritmoReal: -0.2 });
    expect(p.explicacion).toContain('2500');   // lo que come
    expect(p.explicacion).toContain('2900');   // su mantenimiento estimado
    expect(p.explicacion).toContain('0,2');    // su ritmo real
  });

  it('nunca aplica nada: solo devuelve la propuesta', () => {
    const entrada = { ...base, ritmoReal: -0.2 };
    const copia = { ...entrada };
    proponerAjuste(entrada);
    expect(entrada).toEqual(copia);
  });
});
