import { describe, expect, it } from 'vitest';
import { procesoEnCurso } from './procesoEnCurso';

/* El proceso A MEDIAS (auditoría de cifras, 17-11-2026). El caso medido:
   arranque 58, techo 63,8, objetivo de media 60,9 en 12 semanas. */

const en = (nivel: number, n: number) => Array.from({ length: n }, () => nivel);
const caso = (porSemana: number[]) => procesoEnCurso({ objetivo: 60.9, techo: 63.8, porSemana, semanasTotales: 12 });

describe('procesoEnCurso', () => {
  it('sin semanas medidas no hay nada que decir', () => {
    expect(caso([])).toBeNull();
  });

  it('la media solo llega a 60,9 si el escalón se da en la semana 7 como tarde', () => {
    // Con n semanas en 58, ¿cuántas más puede seguir así?
    expect(caso(en(58, 1))).toMatchObject({ ritmo: 'a_tiempo', semanasDeMargen: 5, media: 58, proyeccion: 58, restantes: 11 });
    expect(caso(en(58, 5))).toMatchObject({ ritmo: 'a_tiempo', semanasDeMargen: 1 });
    expect(caso(en(58, 6))).toMatchObject({ ritmo: 'a_tiempo', semanasDeMargen: 0 }); // sube ya: semana 7
    expect(caso(en(58, 7))).toMatchObject({ ritmo: 'tarde', semanasDeMargen: null });  // subiría en la 8: no llega
  });

  it('ya ha subido: sosteniendo el nivel de ahora llega, aunque la media vaya por detrás', () => {
    expect(caso([...en(58, 4), 63.8])).toMatchObject({ ritmo: 'llega', media: 59.2, proyeccion: 61.9 });
  });

  it('cumplido: la media ya está en el objetivo y no se cae sosteniendo el nivel', () => {
    expect(caso([...en(58, 2), ...en(63.8, 6)])).toMatchObject({ ritmo: 'cumplido', media: 62.4 });
  });

  it('con el bloque entero es la cuenta del veredicto: llega (60,9 justo cuenta) o no', () => {
    expect(caso([...en(58, 6), ...en(63.8, 6)])).toMatchObject({ ritmo: 'cumplido', media: 60.9, restantes: 0 });
    expect(caso([...en(58, 7), ...en(63.8, 5)])).toMatchObject({ ritmo: 'tarde', media: 60.4, restantes: 0 });
  });

  it('una semana sin entrenar cuenta como 0 en la media, pero el nivel es el de cuando entrenaba', () => {
    const r = caso([58, 58, 0])!;
    expect(r.media).toBe(38.7);
    // Proyecta a 58 (no a 0) las nueve que quedan.
    expect(r.proyeccion).toBe(53.2);
    expect(r.ritmo).toBe('tarde');
  });

  it('sostener (techo donde acabó): llega mientras no se caiga del 95 %', () => {
    const sostener = (porSemana: number[]) => procesoEnCurso({ objetivo: 55.1, techo: 58, porSemana, semanasTotales: 12 });
    expect(sostener(en(58, 3))?.ritmo).toBe('cumplido');
    expect(sostener([54, 54])).toMatchObject({ ritmo: 'a_tiempo' }); // volviendo a 58 a tiempo, llega
    expect(sostener(en(50, 10))?.ritmo).toBe('tarde');
  });

  it('sin techo por encima del nivel no hay margen que contar', () => {
    expect(procesoEnCurso({ objetivo: 60.9, porSemana: en(58, 2), semanasTotales: 12 })).toMatchObject({ ritmo: 'tarde', semanasDeMargen: null });
  });
});
