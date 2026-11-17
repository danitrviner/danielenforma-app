import { describe, expect, it } from 'vitest';
import type { LecturaDeHipotesis, PalancaDeHipotesis, TipoDeBloque } from '../../types';
import type { BloqueConCierre } from './historial';
import { bloquesEnMantener, mapaDeRespuesta, rotacionDeEstrellas, zonasDeGrupos } from './mapaDeRespuesta';

type V = [zona: string, palanca: PalancaDeHipotesis, lectura: LecturaDeHipotesis];
/** Un bloque cerrado con los veredictos de sus zonas con estrella. */
const bloque = (n: number, veredictos: V[], tipo: TipoDeBloque = 'desarrollo'): BloqueConCierre => ({
  id: `m${n}`, number: n, startDate: `2026-0${n}-01`, tipoBloque: tipo,
  hipotesis: Object.fromEntries(veredictos.map(([zona, palanca]) => [zona, { palanca }])),
  ...(veredictos.length ? {
    cierreDeHipotesis: {
      firmadoEn: `2026-0${n}-28T10:00:00.000Z`,
      veredictos: veredictos.map(([zona, palanca, lectura]) => ({ zona, palanca, iemMedio: 15, procesoCumplido: true, rmPct: 4, rmObjetivoPct: 5, resultadoCumplido: lectura === 'confirmada', lectura })),
    },
  } : {}),
});

describe('mapaDeRespuesta', () => {
  it('el ejemplo: «Pectoral: responde a volumen (2 de 2). Deltoides: no responde a intensidad (1 de 1).»', () => {
    const m = mapaDeRespuesta([
      bloque(1, [['pectoral', 'volumen', 'confirmada']]),
      bloque(2, [['pectoral', 'volumen', 'confirmada'], ['deltoides', 'intensidad', 'no_responde']]),
    ]);
    expect(m.frase).toBe('Pectoral: responde a volumen (2 de 2). Deltoides: no responde a intensidad (1 de 1).');
    expect(m.zonas.map(z => z.zona)).toEqual(['pectoral', 'deltoides']);
    expect(m.zonas[0].porPalanca.volumen).toEqual({ confirmada: 2, no_responde: 0, responde_con_menos: 0, sin_probar: 0, probadas: 2 });
    expect(m.zonas[0].ultima).toEqual({ lectura: 'confirmada', palanca: 'volumen', mesocycleId: 'm2', firmadoEn: '2026-02-28T10:00:00.000Z' });
    expect(m.zonas[1].noRespondeSeguidos).toBe(1);
  });

  it('cuenta por palanca y los bloques pueden venir desordenados', () => {
    const m = mapaDeRespuesta([
      bloque(3, [['pectoral', 'intensidad', 'confirmada']]),
      bloque(1, [['pectoral', 'volumen', 'confirmada']]),
      bloque(2, [['pectoral', 'volumen', 'no_responde']]),
    ]);
    const z = m.zonas[0];
    expect(z.porPalanca.volumen).toMatchObject({ confirmada: 1, no_responde: 1, probadas: 2 });
    expect(z.porPalanca.intensidad).toMatchObject({ confirmada: 1, probadas: 1 });
    expect(z.ultima).toMatchObject({ palanca: 'intensidad', mesocycleId: 'm3' });
    expect(z.frase).toBe('Pectoral: responde a volumen (1 de 2); responde a intensidad (1 de 1).');
    expect(z.noRespondeSeguidos).toBe(0);
  });

  it('«sin probar» se cuenta aparte: no entra en el «de N»', () => {
    const m = mapaDeRespuesta([
      bloque(1, [['gluteo', 'volumen', 'sin_probar']]),
      bloque(2, [['gluteo', 'volumen', 'responde_con_menos'], ['isquios', 'volumen', 'sin_probar']]),
    ]);
    const frases = Object.fromEntries(m.zonas.map(z => [z.zona, z.frase]));
    expect(frases.gluteo).toBe('Glúteo: responde a volumen con menos estímulo (1 de 1).');
    expect(frases.isquios).toBe('Isquiotibiales: volumen sin probar (1 bloque).');
  });

  it('sin cierres firmados no hay mapa', () => {
    expect(mapaDeRespuesta([bloque(1, [])])).toEqual({ zonas: [], frase: '' });
    expect(mapaDeRespuesta([])).toEqual({ zonas: [], frase: '' });
  });
});

describe('rotacionDeEstrellas', () => {
  it('dos «no responde» seguidos: la zona suelta la estrella', () => {
    const r = rotacionDeEstrellas({ bloques: [
      bloque(1, [['deltoides', 'volumen', 'no_responde'], ['pectoral', 'volumen', 'confirmada']]),
      bloque(2, [['deltoides', 'intensidad', 'no_responde'], ['pectoral', 'volumen', 'no_responde']]),
    ] });
    expect(r.soltar.map(s => s.zona)).toEqual(['deltoides']);
    expect(r.soltar[0].texto).toBe('Deltoides: 2 bloques seguidos sin responder. Suelta la estrella y pasa a mantener.');
  });

  it('con una confirmada en medio no son seguidos', () => {
    const r = rotacionDeEstrellas({ bloques: [
      bloque(1, [['deltoides', 'volumen', 'no_responde']]),
      bloque(2, [['deltoides', 'intensidad', 'confirmada']]),
      bloque(3, [['deltoides', 'intensidad', 'no_responde']]),
    ] });
    expect(r.soltar).toEqual([]);
  });

  it('candidatas: lo que pide el atleta y lo que lleva 2 o más bloques en mantener', () => {
    const bloques = [
      bloque(1, [['pectoral', 'volumen', 'confirmada'], ['gluteo', 'volumen', 'confirmada']]),
      bloque(2, [['pectoral', 'volumen', 'confirmada']]),
      bloque(3, [['pectoral', 'volumen', 'confirmada']]),
    ];
    expect(bloquesEnMantener(bloques, 'gluteo')).toBe(2);
    expect(bloquesEnMantener(bloques, 'dorsal')).toBe(3);
    expect(bloquesEnMantener(bloques, 'pectoral')).toBe(0);

    const r = rotacionDeEstrellas({ bloques, pideElAtleta: ['gluteo', 'pectoral', 'biceps'] });
    // La que ya tiene estrella no es candidata; primero las que suman los dos motivos.
    expect(r.candidatas.map(c => c.zona)).not.toContain('pectoral');
    expect(r.candidatas[0]).toMatchObject({ zona: 'biceps', motivos: ['lo_pide_el_atleta', 'en_mantener'], bloquesEnMantener: 3 });
    expect(r.candidatas[1]).toMatchObject({ zona: 'gluteo', motivos: ['lo_pide_el_atleta', 'en_mantener'], bloquesEnMantener: 2 });
    expect(r.candidatas[1].texto).toBe('Glúteo: la pide el atleta y lleva 2 bloques en mantener.');
    expect(r.candidatas.find(c => c.zona === 'dorsal')).toMatchObject({ motivos: ['en_mantener'] });
  });

  it('un solo bloque en mantener no basta; lo que pide el atleta sí', () => {
    const r = rotacionDeEstrellas({ bloques: [bloque(1, [['pectoral', 'volumen', 'confirmada']])], pideElAtleta: ['dorsal'] });
    expect(r.candidatas.map(c => [c.zona, c.motivos])).toEqual([['dorsal', ['lo_pide_el_atleta']]]);
  });

  it('los bloques de antes de las hipótesis (sin tipo ni estrellas) no cuentan como mantener', () => {
    const viejo: BloqueConCierre = { id: 'm0', number: 0, startDate: '2025-10-01' };
    const bloques = [viejo, bloque(1, [['pectoral', 'volumen', 'confirmada']]), bloque(2, [], 'mantenimiento')];
    expect(bloquesEnMantener(bloques, 'dorsal')).toBe(2);
    expect(bloquesEnMantener([viejo], 'dorsal')).toBe(0);
    // En un bloque de mantenimiento la que tenía estrella también pasa a mantener.
    expect(bloquesEnMantener(bloques, 'pectoral')).toBe(1);
  });

  it('la que suelta la estrella no vuelve como candidata aunque el atleta la pida', () => {
    const r = rotacionDeEstrellas({
      bloques: [bloque(1, [['deltoides', 'volumen', 'no_responde']]), bloque(2, [['deltoides', 'intensidad', 'no_responde']])],
      pideElAtleta: ['deltoides'],
    });
    expect(r.soltar.map(s => s.zona)).toEqual(['deltoides']);
    expect(r.candidatas.map(c => c.zona)).not.toContain('deltoides');
  });

  it('los grupos que marca el atleta se traducen a zonas del método', () => {
    expect(zonasDeGrupos(['pecho', 'deltoide_lat', 'deltoide_post', 'core'])).toEqual(['pectoral', 'deltoides', 'abdomen']);
    expect(zonasDeGrupos(['rotadores'])).toEqual([]);
  });
});
