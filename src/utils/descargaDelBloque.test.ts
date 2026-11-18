import { describe, expect, it } from 'vitest';
import type { WorkoutExercise } from '../types';
import {
  camposDeDescarga, descargaDeCabecera, descargaEnSemanaDeCalendario, podarSemanasFueraDelBloque,
  ponerDescargaDeCabecera, semanaDeCalendarioDeVuelta, textoDeDescarga, vueltaDeSemanaDeCalendario,
  type CamposDeDescarga,
} from './descargaDelBloque';
import { resolverEjercicioDelMeso } from './progression';

/* El fallo que esto cierra (17-11-2026): «Incluye semana de descarga» y el
   asistente escribían solo `deloadWeek`, que pinta el calendario, y el entreno
   solo recorta con `semanasDescarga`. La descarga se veía y no ocurría. */

const press: WorkoutExercise = { exerciseId: 'press', order: 0, sets: 4, reps: '8-10', rir: 2, restSeconds: 120 };

describe('semanas de ciclo ↔ semanas de calendario', () => {
  it('con ciclo semanal son la misma', () => {
    expect(semanaDeCalendarioDeVuelta(4, 7)).toBe(4);
    expect(vueltaDeSemanaDeCalendario(4, 7)).toBe(4);
  });

  it('con un ciclo de 14 días, la vuelta 3 empieza en la semana 5 y las semanas 5 y 6 son la vuelta 3', () => {
    expect(semanaDeCalendarioDeVuelta(3, 14)).toBe(5);
    expect(vueltaDeSemanaDeCalendario(5, 14)).toBe(3);
    expect(vueltaDeSemanaDeCalendario(6, 14)).toBe(3);
  });
});

describe('camposDeDescarga', () => {
  it('ordena, quita repetidas y deriva deloadWeek de la primera', () => {
    expect(camposDeDescarga([8, 4, 8], 7)).toEqual({ semanasDescarga: [4, 8], deloadWeek: 4 });
  });

  it('sin descargas devuelve las dos claves a undefined, para que se borren del documento', () => {
    const campos = camposDeDescarga([], 7);
    expect(campos).toEqual({ semanasDescarga: undefined, deloadWeek: undefined });
    expect(Object.keys(campos).sort()).toEqual(['deloadWeek', 'semanasDescarga']);
  });

  it('deloadWeek va en semanas de calendario aunque el ciclo no sea semanal', () => {
    expect(camposDeDescarga([4], 14)).toEqual({ semanasDescarga: [4], deloadWeek: 7 });
  });
});

describe('interruptor «Incluye semana de descarga» de la cabecera', () => {
  it('encenderlo escribe semanasDescarga, y esa semana el atleta hace la mitad de series', () => {
    const campos = ponerDescargaDeCabecera({}, 8, 7);
    expect(campos).toEqual({ semanasDescarga: [8], deloadWeek: 8 });
    expect(resolverEjercicioDelMeso(press, campos, 8).sets).toBe(2);
    expect(resolverEjercicioDelMeso(press, campos, 7).sets).toBe(4);
  });

  it('apagarlo quita la descarga de verdad, también las puestas desde la barra de semanas', () => {
    const campos = ponerDescargaDeCabecera({ semanasDescarga: [6, 12], deloadWeek: 6 }, undefined, 7);
    expect(campos).toEqual({ semanasDescarga: undefined, deloadWeek: undefined });
    expect(resolverEjercicioDelMeso(press, campos, 6).sets).toBe(4);
  });

  it('cambiar el número mueve la descarga que enseñaba y respeta las demás', () => {
    expect(ponerDescargaDeCabecera({ semanasDescarga: [6, 12], deloadWeek: 6 }, 5, 7))
      .toEqual({ semanasDescarga: [5, 12], deloadWeek: 5 });
  });

  it('enseña la primera descarga de verdad', () => {
    expect(descargaDeCabecera({ semanasDescarga: [12, 6], deloadWeek: 6 }, 7)).toBe(6);
    expect(descargaDeCabecera({}, 7)).toBeUndefined();
  });

  it('un bloque antiguo con solo deloadWeek sale encendido, pero NO recorta hasta que el coach lo toca', () => {
    const antiguo: CamposDeDescarga = { deloadWeek: 8 };
    expect(descargaDeCabecera(antiguo, 7)).toBe(8);
    // La lectura no cambia: nadie empieza a descargar solo.
    expect(resolverEjercicioDelMeso(press, antiguo, 8).sets).toBe(4);
    // Mover el número lo convierte en una descarga de verdad.
    const movido = ponerDescargaDeCabecera(antiguo, 7, 7);
    expect(movido).toEqual({ semanasDescarga: [7], deloadWeek: 7 });
    expect(resolverEjercicioDelMeso(press, movido, 7).sets).toBe(2);
    // Y apagarlo quita la marca del calendario.
    expect(ponerDescargaDeCabecera(antiguo, undefined, 7)).toEqual({ semanasDescarga: undefined, deloadWeek: undefined });
  });
});

describe('descargaEnSemanaDeCalendario (lo que guarda el asistente)', () => {
  it('«descarga en la semana 8» recorta la semana 8', () => {
    const campos = descargaEnSemanaDeCalendario(8, 7);
    expect(campos).toEqual({ semanasDescarga: [8], deloadWeek: 8 });
    expect(resolverEjercicioDelMeso(press, campos, 8).sets).toBe(2);
  });

  it('con un ciclo de 14 días cae en la vuelta que contiene esa semana', () => {
    expect(descargaEnSemanaDeCalendario(8, 14)).toEqual({ semanasDescarga: [4], deloadWeek: 7 });
  });

  it('no deja claves a undefined: va a un documento que se crea', () => {
    expect(Object.values(descargaEnSemanaDeCalendario(1, 7)).every(v => v !== undefined)).toBe(true);
  });
});

describe('textoDeDescarga', () => {
  it('dice las descargas que recortan el entreno', () => {
    expect(textoDeDescarga({}, 7)).toBe('sin descarga');
    expect(textoDeDescarga({ semanasDescarga: [4], deloadWeek: 4 }, 7)).toBe('descarga en la semana 4');
    expect(textoDeDescarga({ semanasDescarga: [12, 4, 8], deloadWeek: 4 }, 7)).toBe('descarga en las semanas 4, 8 y 12');
  });

  it('con ciclo no semanal habla de vueltas, que es en lo que van', () => {
    expect(textoDeDescarga({ semanasDescarga: [4], deloadWeek: 7 }, 14)).toBe('descarga en la vuelta 4');
  });

  it('no promete una descarga que solo está pintada en el calendario', () => {
    expect(textoDeDescarga({ deloadWeek: 8 }, 7)).toBe('descarga solo en el calendario (semana 8)');
  });
});

describe('podarSemanasFueraDelBloque', () => {
  const bloque = {
    semanasDescarga: [6, 12], deloadWeek: 6,
    semanasTest: [11], semanasPivot: [4, 9],
    notasSemana: { '0': 'general', '3': 'subo top set', '10': 'ojo al hombro' },
    eventosSemana: { '2': { tipo: 'viaje' }, '12': { tipo: 'vacaciones' } } as never,
  };

  it('al acortar de 12 a 8 quita todo lo que cae de la semana 9 en adelante', () => {
    expect(podarSemanasFueraDelBloque(bloque, 8, 7)).toEqual({
      semanasDescarga: [6],
      deloadWeek: 6,
      semanasTest: undefined,
      semanasPivot: [4],
      notasSemana: { '0': 'general', '3': 'subo top set' },
      eventosSemana: { '2': { tipo: 'viaje' } },
    });
  });

  it('lo que se queda vacío va a undefined explícito, para borrarlo del documento', () => {
    const patch = podarSemanasFueraDelBloque(bloque, 1, 7);
    expect(patch).toEqual({
      semanasDescarga: undefined, deloadWeek: undefined, semanasTest: undefined, semanasPivot: undefined,
      notasSemana: { '0': 'general' }, eventosSemana: undefined,
    });
    expect('semanasTest' in patch).toBe(true);
  });

  it('alargar el bloque, o acortarlo sin nada fuera, no toca nada', () => {
    expect(podarSemanasFueraDelBloque(bloque, 16, 7)).toEqual({});
    expect(podarSemanasFueraDelBloque(bloque, 12, 7)).toEqual({});
    expect(podarSemanasFueraDelBloque({}, 4, 7)).toEqual({});
  });

  it('con un ciclo de 14 días el tope son las vueltas, no las semanas', () => {
    // 8 semanas = 4 vueltas: la descarga de la vuelta 4 se queda, la test de la 5 no.
    expect(podarSemanasFueraDelBloque({ semanasDescarga: [4], deloadWeek: 7, semanasTest: [5] }, 8, 14))
      .toEqual({ semanasTest: undefined });
  });

  it('en un bloque antiguo con solo deloadWeek, la marca se quita si cae fuera', () => {
    expect(podarSemanasFueraDelBloque({ deloadWeek: 12 }, 8, 7)).toEqual({ deloadWeek: undefined });
    expect(podarSemanasFueraDelBloque({ deloadWeek: 8 }, 8, 7)).toEqual({});
  });

  it('si la primera descarga se va, deloadWeek pasa a la siguiente que queda dentro', () => {
    expect(podarSemanasFueraDelBloque({ semanasDescarga: [3, 9], deloadWeek: 3 }, 2, 7))
      .toEqual({ semanasDescarga: undefined, deloadWeek: undefined });
    expect(podarSemanasFueraDelBloque({ semanasDescarga: [9, 3], deloadWeek: 3 }, 4, 7))
      .toEqual({ semanasDescarga: [3], deloadWeek: 3 });
  });
});
