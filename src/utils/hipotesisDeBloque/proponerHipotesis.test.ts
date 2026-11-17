import { describe, expect, it } from 'vitest';
import type { LecturaDeHipotesis, PalancaDeHipotesis } from '../../types';
import { propuestaZona } from '../cdg/agujetas';
import type { EstadoDelBloque } from './estadoDelBloqueAnterior';
import type { BloqueConCierre } from './historial';
import { otraPalanca } from './palancas';
import { cifrasDeHipotesis, proponerHipotesis } from './proponerHipotesis';

const anterior = (porZona: Record<string, { iemMedio: number; iemFinal: number }>): Pick<EstadoDelBloque, 'porZona'> => ({
  porZona: Object.fromEntries(Object.entries(porZona).map(([zona, v]) => [zona, { zona, ...v, porSemana: [] }])) as EstadoDelBloque['porZona'],
});

/** Un bloque cerrado con el veredicto de una zona. */
const cerrado = (n: number, zona: string, palanca: PalancaDeHipotesis, lectura: LecturaDeHipotesis): BloqueConCierre => ({
  id: `m${n}`, number: n, startDate: `2026-0${n}-01`, tipoBloque: 'desarrollo', hipotesis: { [zona]: { palanca } },
  cierreDeHipotesis: {
    firmadoEn: `2026-0${n}-28T10:00:00.000Z`,
    veredictos: [{ zona, palanca, iemMedio: 15, procesoCumplido: true, rmPct: 1, rmObjetivoPct: 5, resultadoCumplido: lectura === 'confirmada', lectura }],
  },
});

describe('el ejemplo de Dani: la zona acaba el bloque anterior en 16', () => {
  const estado = anterior({ pectoral: { iemMedio: 14, iemFinal: 16 } });

  it('con la semana 1 reducida arranca en ~15, vuelve a 16 y su techo es ~17-18, nunca 20', () => {
    const r = proponerHipotesis({ tipo: 'desarrollo', estrellas: ['pectoral'], semana1Reducida: true, anterior: estado });
    const h = r.hipotesis.pectoral!;
    expect(h).toEqual({
      palanca: 'volumen',
      iemMedioAnterior: 14, iemFinalAnterior: 16,
      iemMedioObjetivo: 15.4, // media del anterior + 10 %
      iemArranque: 14.9,      // 16 − 7 %
      iemTecho: 17.6,         // 16 + un escalón suave (10 %)
      rmObjetivoPct: 5,
    });
    expect(h.iemArranque!).toBeGreaterThanOrEqual(16 * 0.90); // dentro del 5-10 % acordado
    expect(h.iemArranque!).toBeLessThanOrEqual(16 * 0.95);
    expect(h.iemTecho!).toBeGreaterThanOrEqual(17);
    expect(h.iemTecho!).toBeLessThanOrEqual(18);
    expect(h.iemTecho!).toBeLessThan(20);
  });

  it('sin la semana 1 reducida arranca donde acabó', () => {
    const r = proponerHipotesis({ tipo: 'desarrollo', estrellas: ['pectoral'], anterior: estado });
    expect(r.hipotesis.pectoral).toMatchObject({ iemArranque: 16, iemTecho: 17.6 });
  });

  it('el techo es el objetivo que lee el protocolo semanal, y la estrella va en dinámico', () => {
    const r = proponerHipotesis({ tipo: 'desarrollo', estrellas: ['pectoral'], anterior: estado });
    expect(r.cdgObjetivosIem).toEqual({ pectoral: 17.6 });
    expect(r.cdgModoPorZona.pectoral).toBe('dinamico');
    expect(r.cdgModoPorZona.dorsal).toBe('estatico');
    // Encima del protocolo, sin sustituirlo: desde 16 propone subir; al llegar al techo ya no.
    const args = { agujetas: 1, sensible: false, tipo: { sensibilidad: r.cdgModoPorZona.pectoral, velocidad: 'suave' as const }, esObjetivo: true, contexto: 'favorable' as const, objetivo: r.cdgObjetivosIem.pectoral };
    const desde16 = propuestaZona({ ...args, iem: 16 });
    expect(desde16.tono).toBe('acelerar');
    expect(desde16.iemPropuesto).toBeLessThanOrEqual(17.6);
    expect(propuestaZona({ ...args, iem: 17.6 }).tono).toBe('objetivo');
  });

  it('con otra velocidad el escalón es el suyo (medio: +20 %)', () => {
    const r = proponerHipotesis({ tipo: 'desarrollo', estrellas: ['pectoral'], velocidad: 'medio', anterior: estado });
    expect(r.hipotesis.pectoral?.iemTecho).toBe(19.2);
  });

  it('el objetivo de proceso nunca pasa del techo', () => {
    // Bloque anterior plano en 16: media + 10 % = 17,6 = el techo.
    const plano = proponerHipotesis({ tipo: 'desarrollo', estrellas: ['pectoral'], anterior: anterior({ pectoral: { iemMedio: 16, iemFinal: 16 } }) });
    expect(plano.hipotesis.pectoral?.iemMedioObjetivo).toBe(17.6);
    // Bloque anterior que acabó por debajo de su media: 18 + 10 % pasaría del techo.
    const bajando = proponerHipotesis({ tipo: 'desarrollo', estrellas: ['pectoral'], anterior: anterior({ pectoral: { iemMedio: 18, iemFinal: 16 } }) });
    expect(bajando.hipotesis.pectoral?.iemMedioObjetivo).toBe(17.6);
  });
});

describe('sin bloque anterior', () => {
  it('no hay cifras de IEM: solo palanca y objetivo de resultado', () => {
    const r = proponerHipotesis({ tipo: 'desarrollo', estrellas: ['pectoral', 'deltoides'] });
    expect(r.hipotesis).toEqual({ pectoral: { palanca: 'volumen', rmObjetivoPct: 5 }, deltoides: { palanca: 'volumen', rmObjetivoPct: 5 } });
    expect(r.cdgObjetivosIem).toEqual({});
    expect(r.cdgModoPorZona.deltoides).toBe('dinamico');
    expect(r.porQue.pectoral).toContain('se empieza por volumen');
  });

  it('una zona que el bloque anterior no trabajó tampoco tiene cifras', () => {
    const r = proponerHipotesis({ tipo: 'desarrollo', estrellas: ['gemelos'], anterior: anterior({ pectoral: { iemMedio: 14, iemFinal: 16 } }) });
    expect(r.hipotesis.gemelos).toEqual({ palanca: 'volumen', rmObjetivoPct: 5 });
  });
});

describe('la palanca sale del historial de veredictos', () => {
  const estado = anterior({ pectoral: { iemMedio: 14, iemFinal: 16 } });
  const proponer = (historial: BloqueConCierre[]) => proponerHipotesis({ tipo: 'desarrollo', estrellas: ['pectoral'], anterior: estado, historial });

  it('confirmada → misma línea y un escalón más', () => {
    const r = proponer([cerrado(1, 'pectoral', 'intensidad', 'confirmada')]);
    expect(r.hipotesis.pectoral).toMatchObject({ palanca: 'intensidad', iemTecho: 17.6 });
  });

  it('no responde → la otra palanca', () => {
    const r = proponer([cerrado(1, 'pectoral', 'volumen', 'no_responde')]);
    expect(r.hipotesis.pectoral?.palanca).toBe('intensidad');
    expect(r.porQue.pectoral).toBe('No respondió a volumen: se prueba intensidad.');
    expect(r.avisos).toEqual([]);
  });

  it('no responde dos veces seguidas → cambio de ejercicios y aviso de pasar la estrella', () => {
    const r = proponer([cerrado(1, 'pectoral', 'volumen', 'no_responde'), cerrado(2, 'pectoral', 'intensidad', 'no_responde')]);
    expect(r.hipotesis.pectoral?.palanca).toBe('ejercicios');
    expect(r.hipotesis.pectoral?.iemTecho).toBe(16); // mismo estímulo con otros ejercicios: no se sube
    expect(r.avisos.join(' ')).toContain('Pectoral: 2 bloques seguidos sin responder');
  });

  it('responde con menos → no subir: el techo se queda donde acabó y el proceso en su media', () => {
    const r = proponer([cerrado(1, 'pectoral', 'volumen', 'responde_con_menos')]);
    expect(r.hipotesis.pectoral).toMatchObject({ palanca: 'volumen', iemTecho: 16, iemMedioObjetivo: 14, iemArranque: 16 });
    expect(r.cdgObjetivosIem.pectoral).toBe(16);
  });

  it('sin probar → se repite la misma hipótesis', () => {
    const r = proponer([cerrado(1, 'pectoral', 'intensidad', 'sin_probar')]);
    expect(r.hipotesis.pectoral).toMatchObject({ palanca: 'intensidad', iemTecho: 17.6 });
  });

  it('manda el último veredicto de la zona, vengan en el orden que vengan; los de otras zonas no cuentan', () => {
    const r = proponer([cerrado(2, 'pectoral', 'intensidad', 'confirmada'), cerrado(1, 'pectoral', 'volumen', 'no_responde'), cerrado(3, 'deltoides', 'volumen', 'no_responde')]);
    expect(r.hipotesis.pectoral?.palanca).toBe('intensidad');
  });

  it('la palanca que el coach eligió a mano manda, y su límite se conserva', () => {
    const r = proponerHipotesis({ tipo: 'desarrollo', estrellas: ['pectoral'], anterior: estado, palancas: { pectoral: 'intensidad' }, limites: { pectoral: ' hombro sin molestias ' } });
    expect(r.hipotesis.pectoral).toMatchObject({ palanca: 'intensidad', limite: 'hombro sin molestias' });
    expect(r.porQue.pectoral).toBe('Palanca elegida a mano.');
  });

  it('otraPalanca: volumen ↔ intensidad y, agotadas las dos, ejercicios', () => {
    expect(otraPalanca('volumen')).toBe('intensidad');
    expect(otraPalanca('intensidad')).toBe('volumen');
    expect(otraPalanca('intensidad', ['volumen'])).toBe('ejercicios');
    expect(otraPalanca('ejercicios')).toBe('volumen');
    expect(otraPalanca('recuperar')).toBe('volumen');
  });
});

describe('estrellas y resto de zonas', () => {
  const estado = anterior({ pectoral: { iemMedio: 14, iemFinal: 16 }, dorsal: { iemMedio: 18, iemFinal: 20 }, biceps: { iemMedio: 8, iemFinal: 9 } });

  it('avisa a partir de 3 estrellas, y en especialización con más de una', () => {
    expect(proponerHipotesis({ tipo: 'desarrollo', estrellas: ['pectoral', 'dorsal'] }).avisos).toEqual([]);
    expect(proponerHipotesis({ tipo: 'desarrollo', estrellas: ['pectoral', 'dorsal', 'biceps'] }).avisos).toHaveLength(1);
    expect(proponerHipotesis({ tipo: 'especializacion', estrellas: ['pectoral', 'dorsal'] }).avisos[0]).toContain('una sola estrella');
  });

  it('desarrollo: el resto sigue como estaba, sin cifra', () => {
    const r = proponerHipotesis({ tipo: 'desarrollo', estrellas: ['pectoral'], anterior: estado });
    expect(r.iemDelResto).toEqual({});
  });

  it('mantenimiento: sin estrellas y todo a la mitad de donde acabó', () => {
    const r = proponerHipotesis({ tipo: 'mantenimiento', estrellas: [], anterior: estado });
    expect(r.hipotesis).toEqual({});
    expect(r.cdgObjetivosIem).toEqual({});
    expect(r.iemDelResto).toEqual({ pectoral: 8, dorsal: 10, biceps: 4.5 });
    expect(Object.values(r.cdgModoPorZona).every(m => m === 'estatico')).toBe(true);
  });

  it('especialización: la estrella sube y el resto baja a mantener; ignorar es 0', () => {
    const r = proponerHipotesis({ tipo: 'especializacion', estrellas: ['pectoral'], anterior: estado, resto: { biceps: 'ignorar', dorsal: 'como_estaba' } });
    expect(r.cdgObjetivosIem).toEqual({ pectoral: 17.6 });
    expect(r.iemDelResto).toEqual({ biceps: 0 });
    const porDefecto = proponerHipotesis({ tipo: 'especializacion', estrellas: ['pectoral'], anterior: estado });
    expect(porDefecto.iemDelResto).toEqual({ dorsal: 10, biceps: 4.5 });
  });
});

describe('cifrasDeHipotesis', () => {
  it('recuperar: la zona baja a la mitad y del RM solo se pide no perderlo', () => {
    expect(cifrasDeHipotesis({ palanca: 'recuperar', estado: { iemMedio: 14, iemFinal: 16 } })).toEqual({
      palanca: 'recuperar', iemMedioAnterior: 14, iemFinalAnterior: 16, iemArranque: 8, iemTecho: 8, rmObjetivoPct: 0,
    });
  });
  it('no deja campos `undefined` (Firestore no los admite)', () => {
    const h = cifrasDeHipotesis({ palanca: 'volumen' });
    expect(Object.values(h).every(v => v !== undefined)).toBe(true);
    expect(Object.keys(h)).toEqual(['palanca', 'rmObjetivoPct']);
  });
});
