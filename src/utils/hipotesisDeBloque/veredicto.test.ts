import { describe, expect, it } from 'vitest';
import catalogoPrueba from '../cdg/__fixtures__/catalogoPrueba.json';
import type { HipotesisDeZona, VeredictoDeHipotesis } from '../../types';
import { crearMotor, expandirCatalogo, type CdgCatalogoCompacto } from '../cdg/motor';
import {
  cierreParaGuardar, franjaDeResultado, lecturaDe, molestiasDeLaZona, rmDeLaZona, veredictoDeHipotesis, veredictosDelBloque,
  zonaPrincipalDeEjercicios, type EntradaDeVeredicto,
} from './veredicto';

/** La hipótesis del ejemplo de Dani: acabó en 16, objetivo medio 16,8 (donde acabó + 5 %), techo 17,6, RM +5 %. */
const H: HipotesisDeZona = { palanca: 'volumen', iemMedioAnterior: 14, iemFinalAnterior: 16, iemMedioObjetivo: 16.8, iemArranque: 16, iemTecho: 17.6, rmObjetivoPct: 5 };
const v = (extra: Partial<EntradaDeVeredicto> & { rmPct?: number | null } = {}) => {
  const { rmPct, ...resto } = extra;
  return veredictoDeHipotesis({ zona: 'pectoral', hipotesis: H, iemMedio: 17, rm: { rmPct: rmPct === undefined ? 6 : rmPct }, ...resto });
};
const previo = (lectura: VeredictoDeHipotesis['lectura'], palanca: VeredictoDeHipotesis['palanca'] = 'volumen', rmPct: number | null = 1): VeredictoDeHipotesis =>
  ({ zona: 'pectoral', palanca, iemMedio: 16, procesoCumplido: true, rmPct, rmObjetivoPct: 5, resultadoCumplido: false, lectura });

describe('las lecturas', () => {
  it('la tabla: proceso × resultado en tres franjas', () => {
    expect(lecturaDe(true, 'cumplido')).toBe('confirmada');
    expect(lecturaDe(true, 'parcial')).toBe('mejora_parcial');
    expect(lecturaDe(true, 'no_cumplido')).toBe('no_responde');
    expect(lecturaDe(false, 'cumplido')).toBe('responde_con_menos');
    // No se hizo lo previsto y aun así mejora más que el ruido: responde con menos.
    expect(lecturaDe(false, 'parcial')).toBe('responde_con_menos');
    expect(lecturaDe(false, 'no_cumplido')).toBe('sin_probar');
    expect(lecturaDe(null, 'parcial')).toBe('mejora_parcial');
    // Con un sí / no, las cuatro de siempre.
    expect(lecturaDe(true, true)).toBe('confirmada');
    expect(lecturaDe(true, false)).toBe('no_responde');
    expect(lecturaDe(false, true)).toBe('responde_con_menos');
    expect(lecturaDe(false, false)).toBe('sin_probar');
    // Sin medida no hay lectura posible; sin objetivo de proceso manda el resultado.
    expect(lecturaDe(true, null)).toBe('sin_probar');
    expect(lecturaDe(null, true)).toBe('confirmada');
    expect(lecturaDe(null, false)).toBe('no_responde');
  });

  it('se hizo y sirvió → confirmada: misma línea y un escalón más de techo', () => {
    const r = v({ iemMedio: 17, rmPct: 6 });
    expect(r).toMatchObject({ lectura: 'confirmada', procesoCumplido: true, resultadoCumplido: true, resultado: 'cumplido', iemMedio: 17, iemMedioObjetivo: 16.8, rmPct: 6, rmObjetivoPct: 5 });
    expect(r.propuesta).toMatchObject({ accion: 'misma_linea', palanca: 'volumen', subirTecho: true });
    expect(r.texto).toContain('Pectoral: confirmada');
    expect(r.texto).toContain('IEM medio 17 de 16,8 previstos: se hizo');
    expect(r.texto).toContain('RM +6 % (objetivo +5 %)');
    expect(r.causa).toBeUndefined();
  });

  it('se hizo y no sirvió → no responde: cambiar de palanca', () => {
    const r = v({ iemMedio: 17, rmPct: 1 });
    expect(r).toMatchObject({ lectura: 'no_responde', procesoCumplido: true, resultadoCumplido: false, resultado: 'no_cumplido', mejoraSinLlegar: false });
    expect(r.propuesta).toMatchObject({ accion: 'cambiar_palanca', palanca: 'intensidad' });
    expect(r.texto).toContain('sin cambio medible');
  });

  it('no se hizo y aun así mejora → responde con menos: no subir', () => {
    const r = v({ iemMedio: 13, rmPct: 7 });
    expect(r).toMatchObject({ lectura: 'responde_con_menos', procesoCumplido: false, resultadoCumplido: true });
    expect(r.propuesta).toMatchObject({ accion: 'no_subir', palanca: 'volumen', subirTecho: false });
    expect(r.texto).toContain('no se llegó');
  });

  it('ni se hizo ni sirvió → sin probar: repetir arreglando la causa', () => {
    const r = v({ iemMedio: 13, rmPct: 1 });
    expect(r).toMatchObject({ lectura: 'sin_probar', procesoCumplido: false, resultadoCumplido: false });
    expect(r.propuesta.accion).toBe('repetir');
  });
});

describe('proceso: cumplido si llega al objetivo, sin tolerancia', () => {
  it('con 16,8 se hizo y con 16,7 no (antes bastaba el 95 %: 16)', () => {
    expect(v({ iemMedio: 16.8 }).procesoCumplido).toBe(true);
    expect(v({ iemMedio: 16.7 }).procesoCumplido).toBe(false);
    // Quedarse donde acabó el bloque anterior ya no cumple.
    expect(v({ iemMedio: 16 }).procesoCumplido).toBe(false);
  });

  it('sin objetivo de proceso (bloque sin cifras) se juzga solo por el resultado', () => {
    const sinCifras: HipotesisDeZona = { palanca: 'volumen', rmObjetivoPct: 5 };
    const si = v({ hipotesis: sinCifras, rmPct: 6 });
    expect(si).toMatchObject({ procesoCumplido: null, lectura: 'confirmada' });
    expect(si).not.toHaveProperty('iemMedioObjetivo');
    expect(si.texto).toContain('se juzga solo por el resultado');
    expect(v({ hipotesis: sinCifras, rmPct: 1 }).lectura).toBe('no_responde');
  });

  it('recuperar va al revés: se cumple si el estímulo se quedó en el tope, y del RM se pide no perderlo', () => {
    const recuperar: HipotesisDeZona = { palanca: 'recuperar', iemFinalAnterior: 16, iemArranque: 8, iemTecho: 8, rmObjetivoPct: 0 };
    expect(v({ hipotesis: recuperar, iemMedio: 8.2, rmPct: -1 })).toMatchObject({ procesoCumplido: true, resultadoCumplido: true, lectura: 'confirmada' });
    expect(v({ hipotesis: recuperar, iemMedio: 12, rmPct: -1 }).procesoCumplido).toBe(false);
    expect(v({ hipotesis: recuperar, iemMedio: 8, rmPct: -4 }).resultadoCumplido).toBe(false);
  });
});

describe('resultado: tres franjas frente al objetivo y al ruido', () => {
  // Lo medido (auditoría de cifras, 17-11-2026): con un 5 % real y un ruido del
  // 3 % por sesión, solo se llega al objetivo la mitad de las veces. Lo que
  // supera el ruido sin llegar no es «no responde».
  it.each([
    [2.9, 'no_cumplido', false, 'no_responde'],
    [3, 'parcial', false, 'mejora_parcial'],
    [4.9, 'parcial', false, 'mejora_parcial'],
    [5, 'cumplido', true, 'confirmada'],
  ] as const)('con el proceso cumplido, un RM de +%s %% es «%s»', (rmPct, franja, cumplido, lectura) => {
    expect(franjaDeResultado(rmPct, 5)).toBe(franja);
    expect(v({ rmPct })).toMatchObject({ resultado: franja, resultadoCumplido: cumplido, lectura, mejoraSinLlegar: franja === 'parcial' });
  });

  it.each([
    [2.9, 'sin_probar'],
    [3, 'responde_con_menos'],
    [4.9, 'responde_con_menos'],
    [5, 'responde_con_menos'],
  ] as const)('con el proceso SIN cumplir, un RM de +%s %% es «%s»', (rmPct, lectura) => {
    expect(v({ iemMedio: 13, rmPct }).lectura).toBe(lectura);
  });

  it('el objetivo manda sobre la franja: con un 8 % (principiante) un +5 % es parcial', () => {
    expect(franjaDeResultado(5, 8)).toBe('parcial');
    expect(franjaDeResultado(7.9, 8)).toBe('parcial');
    expect(franjaDeResultado(8, 8)).toBe('cumplido');
    expect(v({ hipotesis: { ...H, rmObjetivoPct: 8 }, rmPct: 5 }).lectura).toBe('mejora_parcial');
  });

  it('con objetivo de no perder (0 %) no hay franja intermedia: vale por encima de −3 %', () => {
    expect(franjaDeResultado(-2.9, 0)).toBe('cumplido');
    expect(franjaDeResultado(-3, 0)).toBe('no_cumplido');
    expect(franjaDeResultado(null, 5)).toBeNull();
  });

  it('bloque en déficit confirmado (sostuvo y no perdió): la propuesta no promete un escalón sin más', () => {
    const enDeficit: HipotesisDeZona = { palanca: 'volumen', iemFinalAnterior: 16, iemMedioObjetivo: 15.2, iemArranque: 16, iemTecho: 16, rmObjetivoPct: 0 };
    const r = v({ hipotesis: enDeficit, iemMedio: 15.6, rmPct: -1 });
    expect(r).toMatchObject({ lectura: 'confirmada', procesoCumplido: true, resultadoCumplido: true });
    expect(r.propuesta.texto).toBe('Misma línea: sigue con volumen. Sostuvo el estímulo sin perder fuerza; el techo sube un escalón cuando el bloque ya no vaya en déficit.');
    expect(r.texto).toContain('RM −1 %: se mantiene');
  });

  it('mejora parcial: misma línea SIN subir el techo, y el texto dice que no cuenta como «no responde»', () => {
    const r = v({ rmPct: 4 });
    expect(r).toMatchObject({ lectura: 'mejora_parcial', procesoCumplido: true, resultadoCumplido: false, mejoraSinLlegar: true });
    expect(r.propuesta).toMatchObject({ accion: 'misma_linea', palanca: 'volumen', subirTecho: false });
    expect(r.propuesta.texto).toContain('sin subir el techo');
    expect(r.propuesta.texto).toContain('No cuenta como «no responde»');
    expect(r.texto).toContain('Pectoral: mejora, menos de lo buscado');
    expect(r.texto).toContain('mejora, pero menos de lo buscado (+5 %)');
    expect(r.causa).toBeUndefined();
  });

  it('por debajo del 3 % es ruido; una caída mayor que el ruido se dice', () => {
    expect(v({ rmPct: 2.9 }).mejoraSinLlegar).toBe(false);
    expect(v({ rmPct: 2.9 }).texto).toContain('por debajo del 3 % es ruido');
    expect(v({ rmPct: -4 }).texto).toContain('RM −4 %: ha bajado');
    expect(v({ rmPct: 5 }).resultadoCumplido).toBe(true);
  });

  it('sin ejercicios con marca suficiente no hay resultado: sin probar por falta de medida', () => {
    const r = v({ rmPct: null });
    expect(r).toMatchObject({ rmPct: null, resultadoCumplido: null, lectura: 'sin_probar', causa: 'sin_medida' });
    expect(r.texto).toContain('sin marcas suficientes');
    expect(r.propuesta.texto).toContain('que apunte el RIR');
  });
});

describe('a un avanzado se le juzga a dos bloques', () => {
  it('con un +3 % en el primero queda a la espera del segundo, no «no responde»', () => {
    const r = v({ rmPct: 3, nivel: 'avanzado' });
    expect(r).toMatchObject({ resultadoCumplido: null, lectura: 'sin_probar', causa: 'a_dos_bloques' });
    expect(r.propuesta).toMatchObject({ accion: 'repetir', palanca: 'volumen' });
    expect(r.texto).toContain('se juzga a dos bloques');
  });

  it('en el segundo se suman: +3 % y +2,5 % pasan del 5 %', () => {
    const r = v({ rmPct: 2.5, nivel: 'avanzado', anteriores: [previo('sin_probar', 'volumen', 3)] });
    expect(r.rmPctAcumulado).toBe(5.6);
    expect(r).toMatchObject({ resultadoCumplido: true, lectura: 'confirmada' });
  });

  it('…y si sumados no llegan, no responde', () => {
    const r = v({ rmPct: 1, nivel: 'avanzado', anteriores: [previo('sin_probar', 'volumen', 1)] });
    expect(r).toMatchObject({ rmPctAcumulado: 2, resultadoCumplido: false, lectura: 'no_responde' });
  });

  it('…y si sumados superan el ruido sin llegar, mejora parcial (las mismas tres franjas, a dos bloques)', () => {
    const r = v({ rmPct: 2, nivel: 'avanzado', anteriores: [previo('sin_probar', 'volumen', 2)] });
    expect(r).toMatchObject({ rmPctAcumulado: 4, resultado: 'parcial', resultadoCumplido: false, lectura: 'mejora_parcial' });
    expect(r.propuesta).toMatchObject({ accion: 'misma_linea', subirTecho: false });
  });

  it('un bloque anterior con otra apuesta no se suma', () => {
    expect(v({ rmPct: 3, nivel: 'avanzado', anteriores: [previo('no_responde', 'intensidad', 4)] }).causa).toBe('a_dos_bloques');
  });

  it('si llega al 5 % en un bloque, confirmada sin esperar; y a quien no es avanzado no se le espera', () => {
    expect(v({ rmPct: 5.5, nivel: 'avanzado' }).lectura).toBe('confirmada');
    expect(v({ rmPct: 3, nivel: 'intermedio' }).lectura).toBe('mejora_parcial');
    expect(v({ rmPct: 2, nivel: 'intermedio' }).lectura).toBe('no_responde');
  });
});

describe('sin probar: se dice la causa', () => {
  const sinProbar = (contexto: EntradaDeVeredicto['contexto']) => v({ iemMedio: 12, rmPct: 0.5, contexto });

  it('adherencia baja (menos del 80 %)', () => {
    const r = sinProbar({ adherenciaPct: 62, semanasFrenadasPorAgujetas: 3 });
    expect(r.causa).toBe('adherencia');
    expect(r.propuesta.texto).toContain('la causa fue la adherencia');
  });
  it('freno por agujetas (2 semanas o más)', () => {
    expect(sinProbar({ adherenciaPct: 95, semanasFrenadasPorAgujetas: 2 }).causa).toBe('agujetas');
    expect(sinProbar({ adherenciaPct: 95, semanasFrenadasPorAgujetas: 1 }).causa).toBe('sin_causa_clara');
  });
  it('contexto desfavorable', () => {
    expect(sinProbar({ adherenciaPct: 95, contexto: 'desfavorable' }).causa).toBe('contexto');
  });
  it('sin nada que lo explique, se dice así', () => {
    const r = sinProbar(undefined);
    expect(r.causa).toBe('sin_causa_clara');
    expect(r.propuesta.texto).toContain('revisa si el techo era realista');
  });
});

describe('los límites van como dato del veredicto', () => {
  it('cansancio medio de 8 o más: la lectura no cambia, pero una confirmada no sube el techo', () => {
    const r = v({ limites: { cansancioMedio: 8.4 } });
    expect(r.lectura).toBe('confirmada');
    expect(r.limites.cansancio).toEqual({ valor: 8.4, limite: 8, pasado: true });
    expect(r.limites.algunoPasado).toBe(true);
    expect(r.propuesta.subirTecho).toBe(false);
    expect(r.texto).toContain('Límite pasado: cansancio medio al salir de 8,4/10');
    expect(v({ limites: { cansancioMedio: 7.9 } }).propuesta.subirTecho).toBe(true);
  });

  it('molestia en la zona y el límite propio del coach', () => {
    const r = v({ hipotesis: { ...H, limite: 'hombro sin molestias' }, limites: { molestiasEnLaZona: 3, molestiaMaxima: 6 } });
    expect(r.limites.molestia).toEqual({ veces: 3, maxima: 6, pasado: true });
    expect(r.limites.propio).toBe('hombro sin molestias');
    expect(r.limites.textos).toEqual(['molestia apuntada en 3 sesiones (hasta 6/10)']);
  });

  // Dani, 18-11-2026: «me parece bien; incluso que se controle el índice articular de la zona».
  it('con molestia en la zona, confirmada no sube el techo y la propuesta pide vigilar sus articulaciones', () => {
    const r = v({ limites: { molestiasEnLaZona: 2, molestiaMaxima: 5 } });
    expect(r.lectura).toBe('confirmada');
    expect(r.propuesta.subirTecho).toBe(false);
    expect(r.propuesta.texto).toContain('sin subir el techo: se pasó un límite (molestia apuntada en 2 sesiones (hasta 5/10))');
    expect(r.propuesta.texto).toMatch(/Vigilar el estrés articular de hombro \(articular, tendinoso compresivo y tendinoso tensil\)\.$/);
    // También cuando la lectura es otra: la molestia no depende de si la apuesta salió.
    expect(v({ rmPct: 1, limites: { molestiasEnLaZona: 1 } }).propuesta.texto).toContain('Vigilar el estrés articular de hombro');
    // Sin molestia (o solo con el cansancio pasado) no se dice nada de articulaciones.
    expect(v().propuesta.texto).not.toContain('Vigilar');
    expect(v({ limites: { cansancioMedio: 8.4 } }).propuesta.texto).not.toContain('Vigilar');
    // Una zona a la que el método no asigna articulaciones no da línea.
    const biceps = veredictoDeHipotesis({ zona: 'biceps', hipotesis: H, iemMedio: 17, rm: { rmPct: 6 }, limites: { molestiasEnLaZona: 2 } });
    expect(biceps.propuesta.subirTecho).toBe(false);
    expect(biceps.propuesta.texto).not.toContain('Vigilar');
  });

  it('sin datos de límites, ninguno pasado', () => {
    expect(v().limites).toMatchObject({ algunoPasado: false, textos: [], cansancio: { valor: null, pasado: false }, molestia: { veces: 0, pasado: false } });
  });

  it('las molestias de la zona salen de sus ejercicios', () => {
    const estado = [
      { exerciseId: 'press', molestia: { veces: 2, maxima: 6, ultima: '2026-01-20' } },
      { exerciseId: 'peck', molestia: { veces: 1, maxima: null, ultima: '2026-01-21' } },
      { exerciseId: 'curl', molestia: { veces: 4, maxima: 9, ultima: '2026-01-22' } },
      { exerciseId: 'fondos', molestia: null },
    ];
    const zonaDe = { press: 'pectoral', peck: 'pectoral', curl: 'biceps', fondos: 'pectoral' } as const;
    expect(molestiasDeLaZona(estado, zonaDe, 'pectoral')).toEqual({ molestiasEnLaZona: 3, molestiaMaxima: 6 });
    expect(molestiasDeLaZona(estado, zonaDe, 'dorsal')).toEqual({ molestiasEnLaZona: 0, molestiaMaxima: null });
  });
});

describe('no responde: a la segunda seguida, la estrella pasa a otra zona', () => {
  it('la primera vez cambia de palanca', () => {
    expect(v({ rmPct: 1 }).propuesta).toMatchObject({ accion: 'cambiar_palanca', palanca: 'intensidad', subirTecho: true });
  });
  it('si el bloque anterior tampoco respondió, pasa la estrella', () => {
    const r = v({ hipotesis: { ...H, palanca: 'intensidad' }, rmPct: 1, anteriores: [previo('no_responde', 'volumen')] });
    expect(r.propuesta.accion).toBe('pasar_estrella');
    expect(r.propuesta.texto).toContain('Segunda vez seguida sin responder');
  });
  it('un «no responde» antiguo con una confirmada en medio no cuenta como seguido', () => {
    const r = v({ rmPct: 1, anteriores: [previo('no_responde', 'intensidad'), previo('confirmada', 'volumen', 6)] });
    expect(r.propuesta).toMatchObject({ accion: 'cambiar_palanca', palanca: 'ejercicios' }); // intensidad ya falló
  });

  it('una mejora parcial en medio tampoco: no cuenta como «no responde» ni marca su palanca como fallida', () => {
    const r = v({ rmPct: 1, anteriores: [previo('no_responde', 'intensidad'), previo('mejora_parcial', 'volumen', 4)] });
    expect(r.propuesta).toMatchObject({ accion: 'cambiar_palanca', palanca: 'ejercicios' });
    // Dos mejoras parciales seguidas y ahora un «no responde»: es el primero, cambia de palanca.
    const primero = v({ rmPct: 1, anteriores: [previo('mejora_parcial', 'volumen', 4), previo('mejora_parcial', 'volumen', 3.5)] });
    expect(primero.propuesta).toMatchObject({ accion: 'cambiar_palanca', palanca: 'intensidad' });
  });

  it('con el bloque anterior en mejora parcial, otra mejora parcial sigue la misma línea: la estrella no se mueve', () => {
    const r = v({ rmPct: 4, anteriores: [previo('mejora_parcial', 'volumen', 4)] });
    expect(r.lectura).toBe('mejora_parcial');
    expect(r.propuesta.accion).toBe('misma_linea');
  });
});

describe('qué ejercicios son de la zona', () => {
  const motor = crearMotor(expandirCatalogo(catalogoPrueba as CdgCatalogoCompacto));
  const N: Record<string, string> = {
    press: 'Press en máquina convergente horizontal - Pectoral, deltoides anterior, tríceps',
    peck: 'Peck deck codo a 90º (ajustado) - Pectoral',
    curl: 'Curl de bíceps en polea - Bíceps',
    lat: 'Elevaciones laterales con mancuernas - Deltoides medial',
  };

  it('la zona a la que el motor reparte más estímulo; sin vínculo CDG, ninguna', () => {
    const zonas = zonaPrincipalDeEjercicios(motor, id => N[id], ['press', 'peck', 'curl', 'lat', 'sin-vinculo']);
    expect(zonas).toEqual({ press: 'pectoral', peck: 'pectoral', curl: 'biceps', lat: 'deltoides' });
  });

  it('el RM de la zona es la MEDIANA de sus ejercicios que cuentan', () => {
    const ejercicios = [
      { exerciseId: 'press', nombre: 'Press', deltaPct: 8, metrica: 'e1rm' as const },
      { exerciseId: 'peck', nombre: 'Peck deck', deltaPct: 4, metrica: 'e1rm' as const },
      { exerciseId: 'fondos', nombre: 'Fondos', deltaPct: 30, metrica: 'reps' as const },   // se compara por repeticiones: no mide RM
      { exerciseId: 'cruces', nombre: 'Cruces', deltaPct: null, metrica: 'e1rm' as const },  // pocas semanas: no cuenta
      { exerciseId: 'curl', nombre: 'Curl', deltaPct: 20, metrica: 'e1rm' as const },        // otra zona
    ];
    const zonaDe = { press: 'pectoral', peck: 'pectoral', fondos: 'pectoral', cruces: 'pectoral', curl: 'biceps' } as const;
    const r = rmDeLaZona({ zona: 'pectoral', ejercicios, zonaDe });
    expect(r.rmPct).toBe(6);
    expect(r.ejercicios.map(e => e.exerciseId)).toEqual(['press', 'peck']);
    expect(rmDeLaZona({ zona: 'dorsal', ejercicios, zonaDe })).toEqual({ rmPct: null, ejercicios: [] });
    // La asignación también puede ser una función.
    expect(rmDeLaZona({ zona: 'biceps', ejercicios, zonaDe: id => (id === 'curl' ? 'biceps' : undefined) }).rmPct).toBe(20);
  });
});

describe('veredictosDelBloque y lo que se guarda', () => {
  const hipotesis = { deltoides: { palanca: 'intensidad' as const, iemMedioObjetivo: 10, rmObjetivoPct: 5 }, pectoral: H };
  const progresion = [
    { exerciseId: 'press', nombre: 'Press', deltaPct: 7, metrica: 'e1rm' as const },
    { exerciseId: 'lat', nombre: 'Laterales', deltaPct: 1, metrica: 'e1rm' as const },
  ];
  const veredictos = veredictosDelBloque({
    hipotesis, progresion, zonaDe: { press: 'pectoral', lat: 'deltoides' },
    estado: { porZona: { pectoral: { zona: 'pectoral', iemMedio: 17, iemFinal: 17.6, porSemana: [] }, deltoides: { zona: 'deltoides', iemMedio: 10.2, iemFinal: 11, porSemana: [] } } },
    ejercicios: [{ exerciseId: 'lat', molestia: { veces: 1, maxima: 4, ultima: '2026-02-01' } }],
    cansancioMedio: 6,
  });

  it('uno por hipótesis, en el orden de las zonas, cada uno con su resultado y sus límites', () => {
    expect(veredictos.map(x => [x.zona, x.lectura])).toEqual([['pectoral', 'confirmada'], ['deltoides', 'no_responde']]);
    expect(veredictos[0].ejerciciosQueCuentan).toBe(1);
    expect(veredictos[1].limites.molestia.pasado).toBe(true);
    expect(veredictos[0].limites.molestia.pasado).toBe(false);
  });

  it('el cierre guarda solo los campos del tipo, sin `undefined`, con la decisión del coach', () => {
    const cierre = cierreParaGuardar({
      veredictos, firmadoEn: '2026-03-30T10:00:00.000Z',
      decisiones: { pectoral: ' Seguimos con volumen ' }, lecturas: { deltoides: 'sin_probar' },
      ficha: { contexto: 'neutro', cansancioMedio: 6, molestias: '', motivacion: undefined },
    });
    expect(cierre.firmadoEn).toBe('2026-03-30T10:00:00.000Z');
    expect(cierre.veredictos[0]).toEqual({
      zona: 'pectoral', palanca: 'volumen', iemMedio: 17, iemMedioObjetivo: 16.8, procesoCumplido: true,
      rmPct: 7, rmObjetivoPct: 5, resultadoCumplido: true, lectura: 'confirmada', decision: 'Seguimos con volumen',
    });
    // El coach puede corregir la lectura de la app.
    expect(cierre.veredictos[1].lectura).toBe('sin_probar');
    expect(cierre.veredictos[1]).not.toHaveProperty('decision');
    expect(cierre.ficha).toEqual({ contexto: 'neutro', cansancioMedio: 6 });
    expect(JSON.stringify(cierre)).not.toContain('propuesta');
    expect(cierre.veredictos[0]).not.toHaveProperty('resultado');
  });
});

describe('cierreParaGuardar con la foto de dosis y respuesta (18-11-2026)', () => {
  it('guarda la foto limpia (solo los campos del tipo) y la omite si no hay', () => {
    const dosis = [{ zona: 'pectoral', seriesSemana: 12, frecuencia: 2, rirMedio: 1.5, iemMedio: 14, rmPct: 5, ejercicios: 2, sobra: 1 }];
    const c = cierreParaGuardar({ veredictos: [], firmadoEn: '2026-11-18', dosis });
    expect(c.dosis).toEqual([{ zona: 'pectoral', seriesSemana: 12, frecuencia: 2, rirMedio: 1.5, iemMedio: 14, rmPct: 5, ejercicios: 2 }]);
    expect('dosis' in cierreParaGuardar({ veredictos: [], firmadoEn: '2026-11-18', dosis: [] })).toBe(false);
  });
});
