import { describe, expect, it } from 'vitest';
import {
  comprobacionDelRir, logrosDelCierre, mejorRmValido, mensajeTrasCerrar, recordDeRepeticiones, rirConocido,
  rirMedioApuntado, MENSAJE_IGUAL, MENSAJE_POR_DEBAJO, type SerieDeCierre,
} from './cierreDeEjercicio';
import { rmDeSerie } from '../../utils/oneRepMax';

const serie = (weight: number, repsDone: number, rir: number, extra: Partial<SerieDeCierre> = {}): SerieDeCierre =>
  ({ weight, repsDone, rir, ...extra });
/** El RIR lo eligió el atleta. */
const suya = (weight: number, repsDone: number, rir: number, extra: Partial<SerieDeCierre> = {}) =>
  serie(weight, repsDone, rir, { rirApuntado: true, ...extra });
/** Se guardó el pautado sin tocar. */
const sinTocar = (weight: number, repsDone: number, rir: number) => serie(weight, repsDone, rir, { rirApuntado: false });

describe('rirConocido', () => {
  it('lo apuntó él, fue al fallo, o es un registro antiguo: se conoce', () => {
    expect(rirConocido(suya(80, 8, 1))).toBe(true);
    expect(rirConocido(serie(80, 8, 0, { alFallo: true, rirApuntado: false }))).toBe(true);
    expect(rirConocido(serie(80, 8, 1))).toBe(true);
  });

  it('el pautado sin tocar no dice nada de su esfuerzo', () => {
    expect(rirConocido(sinTocar(80, 8, 1))).toBe(false);
  });
});

describe('D9: récords al cerrar el ejercicio', () => {
  const ANTES = rmDeSerie({ weight: 80, repsDone: 8, rir: 1 });
  const base = { nombre: 'Press banca', tonelajeMaxAntes: undefined, ultimaVez: undefined, repsMaximasAntes: () => 0 };

  it('récord de RM con una serie válida: se celebra', () => {
    const logros = logrosDelCierre({ ...base, hechas: [suya(82.5, 8, 1)], mejorRmAntes: ANTES });
    expect(logros).toEqual([{ tipo: 'record', titulo: '¡Récord personal!', detalle: expect.stringContaining('82,5') }]);
  });

  it('subir el RIR del desplegable ya no da récord: RIR 4 no es una serie válida', () => {
    // 80 × 8 a RIR 4 «estima» más RM que 80 × 8 a RIR 1, pero no vale para estimarlo.
    expect(rmDeSerie({ weight: 80, repsDone: 8, rir: 4 })).toBeGreaterThan(ANTES);
    expect(logrosDelCierre({ ...base, hechas: [suya(80, 8, 4)], mejorRmAntes: ANTES })).toEqual([]);
  });

  it('con el RIR pautado sin tocar tampoco hay récord de RM', () => {
    expect(logrosDelCierre({ ...base, hechas: [sinTocar(82.5, 8, 1)], mejorRmAntes: ANTES })).toEqual([]);
  });

  it('más de 15 repeticiones no vale para el RM, aunque el número salga más alto', () => {
    expect(logrosDelCierre({ ...base, hechas: [suya(80, 18, 0)], mejorRmAntes: ANTES })).toEqual([]);
  });

  it('la serie no vale, pero hizo más repeticiones que nunca con ese peso: se celebra eso', () => {
    const logros = logrosDelCierre({
      ...base, hechas: [sinTocar(80, 11, 1)], mejorRmAntes: ANTES, repsMaximasAntes: peso => (peso <= 80 ? 10 : 0),
    });
    expect(logros).toHaveLength(1);
    expect(logros[0].tipo).toBe('record');
    expect(logros[0].titulo.replace(/\u00a0/g, ' ')).toBe('Más repeticiones que nunca con 80 kg');
    expect(logros[0].detalle.replace(/\u00a0/g, ' ')).toBe('80 kg × 11 en Press banca — tu tope con ese peso eran 10');
  });

  it('con récord de RM válido no se añade el de repeticiones', () => {
    const logros = logrosDelCierre({ ...base, hechas: [suya(80, 11, 1)], mejorRmAntes: ANTES, repsMaximasAntes: () => 10 });
    expect(logros.map(l => l.titulo)).toEqual(['¡Récord personal!']);
  });

  it('estrenar un peso no es un récord de repeticiones', () => {
    expect(recordDeRepeticiones([sinTocar(90, 5, 1)], () => 0)).toBeNull();
  });

  it('récord de repeticiones: la serie más pesada que lo bate, sin contar bajadas', () => {
    const antes = (peso: number) => (peso <= 60 ? 12 : peso <= 80 ? 8 : 0);
    expect(recordDeRepeticiones([sinTocar(80, 9, 1), sinTocar(60, 14, 1)], antes)).toEqual({ peso: 80, reps: 9, antes: 8 });
    expect(recordDeRepeticiones([serie(60, 20, 0, { segmento: true })], antes)).toBeNull();
    expect(recordDeRepeticiones([sinTocar(80, 8, 1)], antes)).toBeNull();
  });

  it('el tonelaje se sigue contando con todo lo levantado', () => {
    const logros = logrosDelCierre({
      ...base, hechas: [sinTocar(80, 8, 1), sinTocar(80, 8, 1)], mejorRmAntes: ANTES, tonelajeMaxAntes: 1000,
    });
    expect(logros.map(l => l.tipo)).toEqual(['tonelaje']);
  });

  it('«sigues progresando» también pide una serie válida: subir el RIR del desplegable no basta', () => {
    const ultimaVez = [serie(80, 8, 1)];
    // Mismo peso y mismas repeticiones, RIR más alto: antes salía «progreso» y confeti.
    expect(logrosDelCierre({ ...base, hechas: [suya(80, 8, 4)], mejorRmAntes: undefined, ultimaVez })).toEqual([]);
    expect(logrosDelCierre({ ...base, hechas: [sinTocar(80, 8, 3)], mejorRmAntes: undefined, ultimaVez })).toEqual([]);
    // Una repetición más, con el RIR apuntado: sí.
    expect(logrosDelCierre({ ...base, hechas: [suya(80, 9, 1)], mejorRmAntes: undefined, ultimaVez }).map(l => l.tipo)).toEqual(['progreso']);
  });

  it('con récord de repeticiones no se repite «sigues progresando»', () => {
    const logros = logrosDelCierre({
      ...base, hechas: [suya(80, 9, 1)], mejorRmAntes: undefined, ultimaVez: [serie(80, 8, 1)], repsMaximasAntes: () => 8,
    });
    expect(logros.map(l => l.tipo)).toEqual(['record']);
    expect(logros[0].titulo).toContain('Más repeticiones que nunca');
  });

  it('mejorRmValido ignora las series que no valen', () => {
    expect(mejorRmValido([sinTocar(100, 5, 1), suya(80, 8, 4), suya(80, 18, 0)])).toBeNull();
    expect(mejorRmValido([sinTocar(100, 5, 1), suya(80, 8, 1)])?.serie.weight).toBe(80);
  });
});

describe('D1d: lo que opina del esfuerzo solo sale con el RIR apuntado', () => {
  it('«hoy ha salido por debajo» solo si el RIR de hoy y el de la última vez son suyos', () => {
    expect(mensajeTrasCerrar([suya(80, 6, 1)], [suya(80, 8, 1)])).toBe(MENSAJE_POR_DEBAJO);
    expect(mensajeTrasCerrar([suya(80, 6, 1)], [serie(80, 8, 1)])).toBe(MENSAJE_POR_DEBAJO);
    // Hoy con el pautado sin tocar: no se opina.
    expect(mensajeTrasCerrar([sinTocar(80, 6, 1)], [suya(80, 8, 1)])).toBeUndefined();
    // La última vez con el pautado sin tocar: tampoco.
    expect(mensajeTrasCerrar([suya(80, 6, 1)], [sinTocar(80, 8, 1)])).toBeUndefined();
  });

  it('«igual que la última vez» es un hecho: sale también sin el RIR apuntado', () => {
    expect(mensajeTrasCerrar([sinTocar(80, 8, 1)], [sinTocar(80, 8, 1)])).toBe(MENSAJE_IGUAL);
    expect(mensajeTrasCerrar([suya(80, 8, 1)], [suya(80, 8, 1)])).toBe(MENSAJE_IGUAL);
  });

  it('sin el RIR apuntado, un RIR distinto no cambia la lectura: mismo peso y repeticiones es «igual»', () => {
    expect(mensajeTrasCerrar([sinTocar(80, 8, 0)], [serie(80, 8, 3)])).toBe(MENSAJE_IGUAL);
  });

  it('si ha salido mejor, o no hay con qué comparar, no dice nada', () => {
    expect(mensajeTrasCerrar([suya(80, 10, 1)], [suya(80, 8, 1)])).toBeUndefined();
    expect(mensajeTrasCerrar([suya(80, 8, 1)], undefined)).toBeUndefined();
    expect(mensajeTrasCerrar([], [suya(80, 8, 1)])).toBeUndefined();
  });

  it('«Tu RIR, comprobado» entre sesiones: solo si los dos RIR se conocen', () => {
    const hoy = [serie(80, 12, 0, { alFallo: true, rirApuntado: true })];
    expect(comprobacionDelRir(hoy, [suya(80, 8, 2)])).toMatchObject({ entreSesiones: true, desfase: 2 });
    // La última vez se guardó el pautado sin tocar: no se le dice que «apuntó» nada.
    expect(comprobacionDelRir(hoy, [sinTocar(80, 8, 2)])).toBeNull();
    // Registro antiguo, sin la marca: se da por bueno.
    expect(comprobacionDelRir(hoy, [serie(80, 8, 2)])).toMatchObject({ entreSesiones: true });
  });

  it('«Tu RIR, comprobado»: un RIR 0 de relleno hoy no cuenta como serie al máximo', () => {
    expect(comprobacionDelRir([sinTocar(80, 12, 0)], [suya(80, 8, 2)])).toBeNull();
    // Serie de test prerrellenada con «fallo»: esa sí es al máximo.
    expect(comprobacionDelRir([serie(80, 12, 0, { alFallo: true, rirApuntado: false })], [suya(80, 8, 2)])).toMatchObject({ desfase: 2 });
  });

  it('«Tu RIR, comprobado» dentro de la sesión: solo con estimaciones que apuntó él', () => {
    const tope = serie(80, 11, 0, { alFallo: true, rirApuntado: true });
    expect(comprobacionDelRir([suya(80, 8, 1), tope])).toMatchObject({ entreSesiones: false, desfase: 2 });
    expect(comprobacionDelRir([sinTocar(80, 8, 1), tope])).toBeNull();
  });

  it('RIR medio: solo de las series cuyo RIR apuntó; sin ninguna, nada', () => {
    expect(rirMedioApuntado([suya(80, 8, 1), suya(80, 8, 0, { alFallo: true }), sinTocar(80, 8, 3)])).toBe(0.5);
    expect(rirMedioApuntado([sinTocar(80, 8, 2), sinTocar(80, 8, 2)])).toBeNull();
    // Las bajadas llevan un RIR de relleno: fuera.
    expect(rirMedioApuntado([suya(80, 8, 2), serie(60, 8, 0, { segmento: true, rirApuntado: true })])).toBe(2);
  });
});
