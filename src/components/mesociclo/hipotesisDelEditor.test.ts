import { describe, expect, it } from 'vitest';
import { MUSCLE_ORDER, type Mesocycle, type MuscleGroup, type MuscleGroupConfig } from '../../types';
import {
  alCambiarSemana1, camposDeBloqueNuevo, conCifra, conLimite, conPalanca, elegirTipoDeBloque, fmtCifra, leerCifra,
  modoDeLaZona, notasDeLaFicha, pctDeSubida, pideNoPerder, referenciaDeProceso, resumenDelTipo, textoDeModo,
} from './hipotesisDelEditor';

const grupos = (alta: MuscleGroup[] = []) => Object.fromEntries(
  MUSCLE_ORDER.map(g => [g, { series: 8, priority: alta.includes(g) ? 'alta' : 'media' }]),
) as Record<MuscleGroup, MuscleGroupConfig>;

const meso = (extra: Partial<Mesocycle> = {}): Mesocycle => ({
  id: 'm2', athleteId: 'a@a.es', number: 2, weeks: 12, startDate: '2026-11-23', objective: '', daysPerWeek: 4,
  groups: grupos(), ...extra,
});

describe('bloque nuevo', () => {
  it('nace como desarrollo de 12 semanas, con la semana 1 reducida apagada', () => {
    const c = camposDeBloqueNuevo([], '2026-11-17');
    expect(c).toMatchObject({
      weeks: 12, tipoBloque: 'desarrollo', objective: 'Desarrollo', phaseType: 'hipertrofia',
      cdgVelocidad: 'suave', semana1Reducida: false, startDate: '2026-11-17',
    });
  });

  it('empieza el lunes siguiente al final del bloque en curso', () => {
    // Bloque de 12 semanas desde el lunes 07-09: acaba el domingo 29-11.
    const enCurso = meso({ id: 'm1', number: 1, startDate: '2026-09-07' });
    expect(camposDeBloqueNuevo([enCurso], '2026-11-17').startDate).toBe('2026-11-30');
    // Uno ya terminado no cuenta: hoy.
    const terminado = meso({ id: 'm0', number: 1, startDate: '2026-06-01', weeks: 8 });
    expect(camposDeBloqueNuevo([terminado], '2026-11-17').startDate).toBe('2026-11-17');
  });
});

describe('elegir el tipo en la cabecera', () => {
  it('un bloque antiguo conserva sus semanas y su objetivo, y solo recibe lo que le faltaba', () => {
    const antiguo = meso({ weeks: 6, objective: 'Hipertrofia tren superior' });
    const r = elegirTipoDeBloque(antiguo, 'desarrollo');
    expect(r.cambios).toMatchObject({ tipoBloque: 'desarrollo', cdgVelocidad: 'suave', phaseType: 'hipertrofia' });
    expect(r.cambios.weeks).toBeUndefined();
    expect(r.cambios.objective).toBeUndefined();
    // Las semanas se dicen; el objetivo de siempre no hace falta.
    expect(r.respetados).toEqual(['las semanas']);
  });

  it('entre tipos, lo que nadie tocó cambia con el tipo y el objetivo se deriva', () => {
    const nuevo = meso({ ...camposDeBloqueNuevo([], '2026-11-17') });
    const r = elegirTipoDeBloque(nuevo, 'primer');
    expect(r.cambios).toMatchObject({ tipoBloque: 'primer', weeks: 8, objective: 'Primer bloque' });
    expect(r.respetados).toEqual([]);
    const m = elegirTipoDeBloque(nuevo, 'mantenimiento');
    expect(m.cambios).toMatchObject({ phaseType: 'mantenimiento', objective: 'Mantenimiento' });
  });

  it('lo que el coach tocó se respeta y se dice', () => {
    const tocado = meso({ ...camposDeBloqueNuevo([], '2026-11-17'), weeks: 10 });
    const r = elegirTipoDeBloque(tocado, 'primer');
    expect(r.cambios.weeks).toBeUndefined();
    expect(r.respetados).toContain('las semanas');
  });

  it('avisa si el tipo nuevo admite menos estrellas de las que hay', () => {
    const conDos = meso({ tipoBloque: 'desarrollo', hipotesis: { pectoral: { palanca: 'volumen' }, deltoides: { palanca: 'volumen' } } });
    expect(elegirTipoDeBloque(conDos, 'especializacion').avisos[0]).toContain('una sola estrella');
  });

  it('el resumen del tipo dice estrellas, velocidad y semanas', () => {
    expect(resumenDelTipo('desarrollo', { weeks: 12 })).toBe('hasta 3 estrellas en dinámico, el resto en estático · velocidad suave (~10 %) · 12 semanas');
    expect(resumenDelTipo('especializacion', { weeks: 12, semana1Reducida: true }))
      .toBe('una sola estrella en dinámico, el resto en estático · lo que no lleva estrella, a mantener · velocidad suave (~10 %) · 12 semanas · semana 1 reducida');
    expect(resumenDelTipo('primer', { weeks: 8 })).toContain('sin estrellas');
  });
});

describe('editar una ficha', () => {
  const h = { palanca: 'volumen' as const, iemMedioAnterior: 52, iemFinalAnterior: 58, iemMedioObjetivo: 60.9, iemArranque: 58, iemTecho: 63.8, rmObjetivoPct: 5, limite: 'hombro sin molestias' };

  it('el % de subida es el techo sobre donde acabó', () => {
    expect(pctDeSubida(h)).toBe(10);
    expect(pctDeSubida({ iemTecho: 60 })).toBeNull();
  });

  it('cambiar a «otros ejercicios» deja el techo donde acabó; a «recuperar», en la mitad y sin pedir RM', () => {
    const ejercicios = conPalanca(h, 'ejercicios');
    expect(ejercicios).toMatchObject({ palanca: 'ejercicios', iemTecho: 58, iemMedioObjetivo: 55.1, rmObjetivoPct: 5, limite: 'hombro sin molestias' });
    const recuperar = conPalanca(h, 'recuperar');
    expect(recuperar).toMatchObject({ palanca: 'recuperar', iemArranque: 29, iemTecho: 29, rmObjetivoPct: 0 });
    // Y al volver de recuperar, el objetivo de RM vuelve al de por defecto.
    expect(conPalanca(recuperar, 'intensidad')).toMatchObject({ palanca: 'intensidad', iemTecho: 63.8, rmObjetivoPct: 5 });
  });

  it('la fila de proceso dice qué se pide sobre donde acabó: un 5 % más, o sostenerlo', () => {
    expect(referenciaDeProceso(h)).toEqual({ sube: true, texto: 'un 5 % más' });
    expect(referenciaDeProceso(conPalanca(h, 'ejercicios'))).toEqual({ sube: false, texto: 'sostenerlo, con un 5 % de margen' });
    expect(referenciaDeProceso({ iemMedioObjetivo: 58, iemFinalAnterior: 58 })).toEqual({ sube: false, texto: 'sostenerlo' });
    expect(referenciaDeProceso({ iemMedioObjetivo: 60 })).toBeNull();
  });

  it('con el bloque en déficit, cambiar de palanca conserva el «no perder» y el techo sin subir', () => {
    const enDeficit = { ...h, iemMedioObjetivo: 55.1, iemTecho: 58, rmObjetivoPct: 0 };
    expect(pideNoPerder(enDeficit)).toBe(true);
    expect(pideNoPerder(h)).toBe(false);
    expect(pideNoPerder({ palanca: 'recuperar' })).toBe(true);
    expect(conPalanca(enDeficit, 'intensidad', { enDeficit: true })).toMatchObject({ palanca: 'intensidad', iemTecho: 58, iemMedioObjetivo: 55.1, rmObjetivoPct: 0 });
    // Al volver de «recuperar» el objetivo se rehace con los valores por defecto del caso.
    const recuperar = conPalanca(enDeficit, 'recuperar', { enDeficit: true });
    expect(conPalanca(recuperar, 'volumen', { enDeficit: true })).toMatchObject({ rmObjetivoPct: 0, iemTecho: 58 });
    expect(conPalanca(conPalanca(h, 'recuperar'), 'volumen', { nivel: 'principiante' })).toMatchObject({ rmObjetivoPct: 8, iemTecho: 63.8 });
  });

  it('las líneas de la ficha (déficit, zona alta) dicen la propuesta, o que el coach la ha cambiado', () => {
    const deficit = [{ clave: 'deficit' as const, texto: 'Bloque en déficit: se pide no perder fuerza y no se sube el estímulo.' }];
    const alta = [{ clave: 'zona_alta' as const, texto: 'Zona ya alta: acabó en 82 de IEM y de 80 en adelante se va con cuidado. El techo no sube.' }];
    expect(notasDeLaFicha({ ...h, iemTecho: 58, rmObjetivoPct: 0 }, deficit)).toEqual([deficit[0].texto]);
    // Editable: si el coach vuelve a pedir un 5 % o sube el techo, la línea no afirma lo que la ficha ya no hace.
    expect(notasDeLaFicha(h, deficit)).toEqual(['Bloque en déficit: la propuesta es no perder fuerza y no subir el estímulo. Esta ficha pide más porque la has cambiado a mano.']);
    expect(notasDeLaFicha({ ...h, iemFinalAnterior: 82, iemTecho: 82 }, alta)).toEqual([alta[0].texto]);
    expect(notasDeLaFicha({ ...h, iemFinalAnterior: 82, iemTecho: 90 }, alta)).toEqual(['Zona ya alta: la propuesta es no subir el techo. Lo has subido a mano.']);
    expect(notasDeLaFicha(h, undefined)).toEqual([]);
  });

  it('la misma palanca no toca nada (ni las cifras escritas a mano)', () => {
    const aMano = { ...h, iemTecho: 70 };
    expect(conPalanca(aMano, 'volumen')).toBe(aMano);
  });

  it('sin bloque anterior, cambiar la palanca solo cambia la apuesta', () => {
    expect(conPalanca({ palanca: 'volumen', rmObjetivoPct: 5 }, 'intensidad')).toEqual({ palanca: 'intensidad', rmObjetivoPct: 5 });
  });

  it('una cifra tecleada se guarda con un decimal; vacía, se quita', () => {
    expect(conCifra(h, 'iemTecho', 64.26).iemTecho).toBe(64.3);
    expect('iemTecho' in conCifra(h, 'iemTecho', null)).toBe(false);
    expect(conCifra(h, 'rmObjetivoPct', 3).rmObjetivoPct).toBe(3);
    expect(conLimite(h, '  ').limite).toBeUndefined();
    expect(conLimite(h, ' codo ok ').limite).toBe('codo ok');
  });

  it('lee y enseña las cifras con coma', () => {
    expect(leerCifra('58,5')).toBe(58.5);
    expect(leerCifra('+5 %')).toBe(5);
    expect(leerCifra('')).toBeNull();
    expect(leerCifra('abc')).toBeNull();
    expect(fmtCifra(63.8)).toBe('63,8');
    expect(fmtCifra(undefined)).toBe('');
  });

  it('el modo de la zona: lo guardado y, si no, el del tipo', () => {
    expect(modoDeLaZona({ tipoBloque: 'desarrollo' }, 'pectoral')).toBe('dinamico');
    expect(modoDeLaZona({ tipoBloque: 'desarrollo' }, 'dorsal', false)).toBe('estatico');
    expect(modoDeLaZona({ cdgModoPorZona: { pectoral: 'estatico' } }, 'pectoral')).toBe('estatico');
    expect(textoDeModo('dinamico')).toBe('dinámico · sube con agujetas 1-3');
  });
});

describe('interruptor de la semana 1 reducida', () => {
  const guardadas = {
    pectoral: { palanca: 'volumen' as const, iemFinalAnterior: 58, iemArranque: 58 },
    deltoides: { palanca: 'volumen' as const, iemFinalAnterior: 40, iemArranque: 36 }, // a mano
  };

  it('al encenderla, el arranque que puso la app baja un 7 %; el escrito a mano no', () => {
    const c = alCambiarSemana1({ hipotesis: guardadas, semana1Reducida: false }, true);
    expect(c.semana1Reducida).toBe(true);
    expect(c.hipotesis?.pectoral?.iemArranque).toBe(53.9);
    expect(c.hipotesis?.deltoides?.iemArranque).toBe(36);
  });

  it('al apagarla, vuelve a donde acabó y se quita el recorte por ejercicio', () => {
    const encendida = { hipotesis: { pectoral: { palanca: 'volumen' as const, iemFinalAnterior: 58, iemArranque: 53.9 } }, semana1Reducida: true };
    const c = alCambiarSemana1(encendida, false);
    expect(c).toMatchObject({ semana1Reducida: false, hipotesis: { pectoral: { iemArranque: 58 } } });
    expect('semana1Recorte' in c && c.semana1Recorte === undefined).toBe(true);
  });

  it('sin hipótesis con cifras, solo mueve el interruptor', () => {
    expect(alCambiarSemana1({ hipotesis: { pectoral: { palanca: 'volumen' } } }, true)).toEqual({ semana1Reducida: true });
  });
});
