import { describe, expect, it } from 'vitest';
import { clasificarFaseEntreno } from '../roadmapCalendar';
import { ZONAS_IEM } from '../cdg/zonas';
import { ESTRELLAS_CON_AVISO, ESTRELLAS_CON_AVISO_ESPECIALIZACION } from './cifras';
import {
  ORDEN_DE_TIPOS, SOLO_ES_UN_AVISO, TIPOS_DE_BLOQUE, aplicarTipoDeBloque, avisoDeEstrellas, enLista, estrellasDe, gruposDeLasZonas,
  modoPorZonaDe, objetivoDerivado, sugerirSemana1Reducida,
} from './tiposDeBloque';

describe('los cuatro tipos de bloque', () => {
  it('cifras de cada preset: semanas, velocidad y estrellas', () => {
    expect(ORDEN_DE_TIPOS).toEqual(['primer', 'desarrollo', 'especializacion', 'mantenimiento']);
    expect(ORDEN_DE_TIPOS.map(t => TIPOS_DE_BLOQUE[t].semanas)).toEqual([8, 12, 12, 12]);
    // Las que lleva cada tipo SIN aviso; no es un tope (Dani, 18-11-2026).
    expect(ORDEN_DE_TIPOS.map(t => TIPOS_DE_BLOQUE[t].estrellasSinAviso)).toEqual([0, 3, 1, 0]);
    expect(ORDEN_DE_TIPOS.every(t => TIPOS_DE_BLOQUE[t].velocidad === 'suave')).toBe(true);
    // Solo el primer bloque sugiere la semana 1 reducida (todos los ejercicios son nuevos).
    expect(ORDEN_DE_TIPOS.map(t => TIPOS_DE_BLOQUE[t].semana1Reducida)).toEqual([true, false, false, false]);
    expect(ORDEN_DE_TIPOS.every(t => TIPOS_DE_BLOQUE[t].vuelveDeParon === false)).toBe(true);
  });

  it('cada tipo tiene etiqueta y para qué sirve, y deriva un `phaseType` que el calendario entiende', () => {
    for (const t of ORDEN_DE_TIPOS) {
      const p = TIPOS_DE_BLOQUE[t];
      expect(p.etiqueta.length).toBeGreaterThan(3);
      expect(p.paraQue.endsWith('.')).toBe(true);
      expect(clasificarFaseEntreno({ phaseType: p.phaseType, objective: p.objective })).toBe(p.phaseType);
    }
    expect(TIPOS_DE_BLOQUE.mantenimiento.phaseType).toBe('mantenimiento');
    expect(TIPOS_DE_BLOQUE.desarrollo.phaseType).toBe('hipertrofia');
  });

  it('modo por zona: la estrella en dinámico y el resto en estático, para TODAS las zonas', () => {
    const modo = modoPorZonaDe(['pectoral', 'deltoides']);
    expect(Object.keys(modo)).toHaveLength(ZONAS_IEM.length);
    expect(modo.pectoral).toBe('dinamico');
    expect(modo.deltoides).toBe('dinamico');
    expect(modo.dorsal).toBe('estatico');
    expect(Object.values(modoPorZonaDe([])).every(m => m === 'estatico')).toBe(true);
  });

  it('el `objective` derivado nombra TODAS las estrellas: no se recortan a las del tipo (Dani, 18-11-2026)', () => {
    expect(objetivoDerivado('desarrollo', ['pectoral', 'deltoides'])).toBe('Desarrollo: pectoral y deltoides');
    expect(objetivoDerivado('especializacion', ['gluteo'])).toBe('Especialización: glúteo');
    expect(objetivoDerivado('desarrollo')).toBe('Desarrollo');
    expect(objetivoDerivado('mantenimiento')).toBe('Mantenimiento');
    expect(objetivoDerivado('primer', ['pectoral'])).toBe('Primer bloque: pectoral');
    expect(objetivoDerivado('especializacion', ['pectoral', 'gluteo'])).toBe('Especialización: pectoral y glúteo');
    expect(objetivoDerivado('desarrollo', ['pectoral', 'dorsal', 'deltoides', 'gluteo'])).toBe('Desarrollo: pectoral, dorsal, deltoides y glúteo');
  });

  it('listas en español: «y», y «e» delante de i-', () => {
    expect(enLista(['pecho'])).toBe('pecho');
    expect(enLista(['pecho', 'hombro'])).toBe('pecho y hombro');
    expect(enLista(['pecho', 'hombro', 'isquios'])).toBe('pecho, hombro e isquios');
  });

  it('las estrellas de un bloque son las zonas con hipótesis, en el orden del método', () => {
    expect(estrellasDe({ hipotesis: { deltoides: { palanca: 'volumen' }, pectoral: { palanca: 'volumen' }, inventada: { palanca: 'volumen' } } })).toEqual(['pectoral', 'deltoides']);
    expect(estrellasDe({})).toEqual([]);
    expect(gruposDeLasZonas(['deltoides', 'pectoral'])).toEqual(['deltoide_ant', 'deltoide_lat', 'deltoide_post', 'pecho']);
  });
});

describe('aviso de estrellas', () => {
  // Dani, 18-11-2026: «con 4 que avise, pero que me permita hacer lo que quiera».
  it('desarrollo: nada con 3 o menos; con 4 o más, un aviso informativo', () => {
    expect(ESTRELLAS_CON_AVISO).toBe(4);
    for (const n of [0, 1, 2, 3]) expect(avisoDeEstrellas('desarrollo', n)).toBeNull();
    expect(avisoDeEstrellas('desarrollo', 4)).toMatchObject({ nivel: 'aviso' });
    expect(avisoDeEstrellas('desarrollo', 4)?.texto).toContain('Con 4 estrellas');
    expect(avisoDeEstrellas('desarrollo', 6)?.nivel).toBe('aviso');
  });
  it('especialización: el aviso sale con 2 o más; primer bloque y mantenimiento, con cualquiera', () => {
    expect(ESTRELLAS_CON_AVISO_ESPECIALIZACION).toBe(2);
    expect(avisoDeEstrellas('especializacion', 1)).toBeNull();
    expect(avisoDeEstrellas('especializacion', 2)).toMatchObject({ nivel: 'aviso' });
    expect(avisoDeEstrellas('especializacion', 2)?.texto).toContain('una sola estrella y hay 2');
    expect(avisoDeEstrellas('primer', 1)?.nivel).toBe('aviso');
    expect(avisoDeEstrellas('mantenimiento', 1)?.texto).toContain('no suele llevar estrellas');
    expect(avisoDeEstrellas('mantenimiento', 0)).toBeNull();
  });
  it('ningún aviso pide quitar estrellas: todos dicen que se puede dejar así', () => {
    const avisos = [avisoDeEstrellas('desarrollo', 4), avisoDeEstrellas('especializacion', 3), avisoDeEstrellas('primer', 2), avisoDeEstrellas('mantenimiento', 1)];
    for (const a of avisos) {
      expect(a?.texto).toContain(SOLO_ES_UN_AVISO);
      expect(a?.texto).not.toMatch(/elige cuál|Quítalas|admite hasta/);
    }
  });
});

describe('sugerir la semana 1 reducida', () => {
  it('apagada por defecto', () => {
    expect(sugerirSemana1Reducida({})).toEqual({ semana1Reducida: false, vuelveDeParon: false, motivo: null });
    expect(sugerirSemana1Reducida({ diasDeParon: 21 }).semana1Reducida).toBe(false); // «más de 3 semanas»
  });
  it('con ejercicios nuevos, o tras un parón de más de 3 semanas (ahí además lejos del fallo)', () => {
    expect(sugerirSemana1Reducida({ ejerciciosNuevos: 2 })).toMatchObject({ semana1Reducida: true, vuelveDeParon: false });
    const paron = sugerirSemana1Reducida({ diasDeParon: 30 });
    expect(paron).toMatchObject({ semana1Reducida: true, vuelveDeParon: true });
    expect(paron.motivo).toContain('parón de 4 semanas');
  });
});

describe('aplicarTipoDeBloque', () => {
  it('en un bloque nuevo lo rellena todo', () => {
    const r = aplicarTipoDeBloque({ weeks: 4, objective: '' }, 'desarrollo', { nuevo: true });
    expect(r.cambios).toMatchObject({
      tipoBloque: 'desarrollo', weeks: 12, cdgVelocidad: 'suave', semana1Reducida: false, vuelveDeParon: false,
      phaseType: 'hipertrofia', objective: 'Desarrollo',
    });
    expect(Object.values(r.cambios.cdgModoPorZona!).every(m => m === 'estatico')).toBe(true);
    expect(r.respetados).toEqual([]);
    expect(r.avisos).toEqual([]);
  });

  it('en un bloque nuevo respeta lo que el coach diga que ya tocó', () => {
    const r = aplicarTipoDeBloque({ weeks: 10, objective: '' }, 'desarrollo', { nuevo: true, tocados: ['weeks'] });
    expect(r.cambios.weeks).toBeUndefined();
    expect(r.respetados).toEqual(['weeks']);
  });

  it('a un bloque que ya existía sin tipo no le cambia la duración ni el objetivo escritos', () => {
    const r = aplicarTipoDeBloque({ weeks: 6, objective: 'Vuelta tras lesión', phaseType: 'fuerza' }, 'desarrollo');
    expect(r.cambios.weeks).toBeUndefined();
    expect(r.cambios.objective).toBeUndefined();
    expect(r.cambios.phaseType).toBeUndefined();
    expect(r.respetados).toEqual(expect.arrayContaining(['weeks', 'objective', 'phaseType']));
    // Lo que estaba vacío sí se rellena.
    expect(r.cambios).toMatchObject({ tipoBloque: 'desarrollo', cdgVelocidad: 'suave', semana1Reducida: false });
  });

  it('al cambiar de tipo, lo que seguía como lo dejó el preset anterior pasa al nuevo', () => {
    const meso = {
      tipoBloque: 'desarrollo' as const, weeks: 12, cdgVelocidad: 'suave' as const, semana1Reducida: false, vuelveDeParon: false,
      phaseType: 'hipertrofia' as const, objective: 'Desarrollo', cdgModoPorZona: modoPorZonaDe([]),
    };
    const r = aplicarTipoDeBloque(meso, 'primer');
    expect(r.cambios).toEqual({ tipoBloque: 'primer', weeks: 8, semana1Reducida: true, objective: 'Primer bloque' });
    expect(r.respetados).toEqual([]);
  });

  it('…y lo que el coach cambió a mano se queda', () => {
    const meso = {
      tipoBloque: 'desarrollo' as const, weeks: 10, cdgVelocidad: 'medio' as const, semana1Reducida: false, vuelveDeParon: true,
      phaseType: 'hipertrofia' as const, objective: 'Desarrollo',
    };
    const r = aplicarTipoDeBloque(meso, 'mantenimiento');
    expect(r.cambios.weeks).toBeUndefined();          // 10 no es lo que ponía Desarrollo (12)
    expect(r.cambios.cdgVelocidad).toBeUndefined();   // puso «medio» a mano
    expect(r.cambios.vuelveDeParon).toBeUndefined();  // lo marcó él
    expect(r.cambios).toMatchObject({ tipoBloque: 'mantenimiento', phaseType: 'mantenimiento', objective: 'Mantenimiento' });
    expect(r.respetados).toEqual(expect.arrayContaining(['weeks', 'cdgVelocidad', 'vuelveDeParon']));
  });

  it('el modo por zona sale de las estrellas y no se pisa si el coach lo cambió', () => {
    const conEstrella = { hipotesis: { pectoral: { palanca: 'volumen' as const } } };
    const r = aplicarTipoDeBloque(conEstrella, 'desarrollo');
    expect(r.cambios.cdgModoPorZona?.pectoral).toBe('dinamico');
    expect(r.cambios.cdgModoPorZona?.dorsal).toBe('estatico');
    expect(r.cambios.objective).toBe('Desarrollo: pectoral');

    const aMano = { ...conEstrella, cdgModoPorZona: { pectoral: 'dinamico' as const, dorsal: 'dinamico' as const } };
    const r2 = aplicarTipoDeBloque(aMano, 'desarrollo');
    expect(r2.cambios.cdgModoPorZona).toBeUndefined();
    expect(r2.respetados).toContain('cdgModoPorZona');
  });

  it('no borra hipótesis: si el tipo nuevo suele llevar menos estrellas, avisa sin bloquear', () => {
    const meso = { tipoBloque: 'desarrollo' as const, hipotesis: { pectoral: { palanca: 'volumen' as const }, deltoides: { palanca: 'volumen' as const } } };
    const r = aplicarTipoDeBloque(meso, 'especializacion');
    expect(r.avisos).toHaveLength(1);
    expect(r.avisos[0]).toContain('una sola estrella y hay 2');
    expect(r.cambios).not.toHaveProperty('hipotesis');
  });

  it('no toca los grupos: bajar el resto a mantener es una recomendación aparte (Dani, 18-11-2026)', () => {
    const groups = { pecho: { series: 12, priority: 'alta' as const }, dorsal: { series: 14, priority: 'media' as const } };
    for (const tipo of ['especializacion', 'mantenimiento'] as const) {
      expect(aplicarTipoDeBloque({ tipoBloque: 'desarrollo', groups } as never, tipo).cambios).not.toHaveProperty('groups');
    }
  });

  it('aplicar el mismo tipo dos veces no cambia nada', () => {
    const primero = aplicarTipoDeBloque({ weeks: 4, objective: '' }, 'desarrollo', { nuevo: true });
    const meso = { weeks: 4, objective: '', ...primero.cambios };
    expect(aplicarTipoDeBloque(meso, 'desarrollo')).toEqual({ cambios: {}, respetados: [], avisos: [] });
  });
});
