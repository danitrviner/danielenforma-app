import { describe, expect, it } from 'vitest';
import type { HipotesisDeZona } from '../../types';
import type { EstadoDelBloque, SemanaRealizada } from './estadoDelBloqueAnterior';
import { proponerHipotesis } from './proponerHipotesis';
import { conReferenciaPropia, estadoParaElProceso, referenciaPropia } from './referenciaPropia';
import { semaforoDeHipotesis } from './semaforoDeHipotesis';
import { veredictosDelBloque } from './veredicto';

const semana = (n: number, o: Partial<SemanaRealizada> = {}): SemanaRealizada =>
  ({ semana: n, inicio: `2026-10-${String(n * 7 - 2).padStart(2, '0')}`, cuenta: true, motivo: null, entrenada: true, ...o });

/** Un bloque en curso: `pectoral` y `cuadriceps` semana a semana (solo las que cuentan). */
const estado = (o: { semanas: SemanaRealizada[]; pectoral?: number[]; cuadriceps?: number[] }): EstadoDelBloque => {
  const zona = (clave: 'pectoral' | 'cuadriceps', porSemana: number[]) => ({
    zona: clave, porSemana, iemMedio: Math.round((porSemana.reduce((a, b) => a + b, 0) / porSemana.length) * 10) / 10, iemFinal: porSemana[porSemana.length - 1],
  });
  return {
    mesocycleId: 'm1', semanas: o.semanas,
    semanasQueCuentan: o.semanas.filter(s => s.cuenta).length, semanasSinEntrenar: 0,
    porZona: {
      ...(o.pectoral ? { pectoral: zona('pectoral', o.pectoral) } : {}),
      ...(o.cuadriceps ? { cuadriceps: zona('cuadriceps', o.cuadriceps) } : {}),
    },
  };
};

describe('referenciaPropia', () => {
  it('sale de las dos primeras semanas que cuentan y entrenó: la mediana de las dos', () => {
    const r = referenciaPropia(estado({ semanas: [1, 2, 3, 4, 5].map(n => semana(n)), pectoral: [40.8, 41.6, 43, 44, 44], cuadriceps: [30, 30, 31, 31, 32] }));
    expect(r).toEqual({
      semanas: 2, semanasUsadas: [1, 2],
      porZona: {
        pectoral: { zona: 'pectoral', iemMedio: 41.2, iemFinal: 41.2 },
        cuadriceps: { zona: 'cuadriceps', iemMedio: 30, iemFinal: 30 },
      },
    });
  });

  it('no existe hasta que hay dos semanas terminadas y entrenadas: la semana en curso no cuenta', () => {
    expect(referenciaPropia(null)).toBeNull();
    expect(referenciaPropia(estado({ semanas: [semana(1)], pectoral: [40] }))).toBeNull();
    // Semana 2 a medias: `estadoDelBloqueAnterior` la deja fuera (`cuenta: false`) y no trae su valor.
    expect(referenciaPropia(estado({ semanas: [semana(1), semana(2, { cuenta: false, motivo: 'en_curso' })], pectoral: [40] }))).toBeNull();
  });

  it('una semana entera sin entrenar no sirve de referencia, pero queda fuera de la media igual', () => {
    // Se saltó la semana 2: la referencia son la 1 y la 3, y fuera de la media quedan las tres primeras.
    const r = referenciaPropia(estado({ semanas: [semana(1), semana(2, { entrenada: false }), semana(3), semana(4)], pectoral: [40, 0, 42, 44] }));
    expect(r).toMatchObject({ semanas: 3, semanasUsadas: [1, 3], porZona: { pectoral: { iemFinal: 41 } } });
  });

  it('una semana que no cuenta (vuelta de parón, descarga) tampoco entra', () => {
    const r = referenciaPropia(estado({
      semanas: [semana(1, { cuenta: false, motivo: 'vuelta_de_paron' }), semana(2), semana(3), semana(4)], pectoral: [40, 42, 44],
    }));
    expect(r).toMatchObject({ semanas: 2, semanasUsadas: [2, 3], porZona: { pectoral: { iemFinal: 41 } } });
  });

  it('una zona sin estímulo en esas semanas no tiene referencia', () => {
    const r = referenciaPropia(estado({ semanas: [1, 2, 3].map(n => semana(n)), pectoral: [40, 42, 44], cuadriceps: [0, 0, 20] }));
    expect(Object.keys(r!.porZona)).toEqual(['pectoral']);
    expect(referenciaPropia(estado({ semanas: [1, 2, 3].map(n => semana(n)), cuadriceps: [0, 0, 20] }))).toBeNull();
  });
});

describe('estadoParaElProceso', () => {
  const z = { iemMedio: 42.7, porSemana: [40.8, 41.6, 43, 44, 44] };

  it('con bloque anterior no cambia nada', () => {
    expect(estadoParaElProceso(z, { })).toEqual({ iemMedio: 42.7, porSemana: z.porSemana, semanasDeReferencia: 0 });
    expect(estadoParaElProceso(null, undefined)).toEqual({ iemMedio: null, porSemana: [], semanasDeReferencia: 0 });
    expect(conReferenciaPropia({})).toBe(false);
  });

  it('con referencia propia la media se cuenta sin las semanas de referencia', () => {
    expect(conReferenciaPropia({ semanasDeReferencia: 2 })).toBe(true);
    expect(estadoParaElProceso(z, { semanasDeReferencia: 2 })).toEqual({ iemMedio: 43.7, porSemana: [43, 44, 44], semanasDeReferencia: 2 });
    // Aún no hay ninguna semana terminada después de la referencia: sin dato, no un 0.
    expect(estadoParaElProceso({ iemMedio: 41.2, porSemana: [40.8, 41.6] }, { semanasDeReferencia: 2 }))
      .toEqual({ iemMedio: null, porSemana: [], semanasDeReferencia: 2 });
  });
});

describe('la hipótesis de un primer bloque, con referencia propia', () => {
  const ref = referenciaPropia(estado({ semanas: [1, 2, 3, 4, 5].map(n => semana(n)), pectoral: [40.8, 41.6, 43, 44, 44] }))!;

  it('sin referencia sigue sin cifras de proceso; con ella, las de siempre sobre sus primeras semanas', () => {
    const sin = proponerHipotesis({ tipo: 'desarrollo', estrellas: ['pectoral'] });
    expect(sin.hipotesis.pectoral).toEqual({ palanca: 'volumen', rmObjetivoPct: 5 });
    expect(sin.cdgObjetivosIem).toEqual({});

    const con = proponerHipotesis({ tipo: 'desarrollo', estrellas: ['pectoral'], referenciaPropia: ref });
    // 41,2 + medio escalón (5 %) = 43,3 de media; techo 41,2 + 10 % = 45,3.
    expect(con.hipotesis.pectoral).toEqual({
      palanca: 'volumen', iemMedioAnterior: 41.2, iemFinalAnterior: 41.2, semanasDeReferencia: 2,
      iemMedioObjetivo: 43.3, iemArranque: 41.2, iemTecho: 45.3, rmObjetivoPct: 5,
    });
    expect(con.cdgObjetivosIem).toEqual({ pectoral: 45.3 });
  });

  it('el bloque ya ha empezado: la semana 1 reducida no le baja el arranque', () => {
    const h = proponerHipotesis({ tipo: 'desarrollo', estrellas: ['pectoral'], referenciaPropia: ref, semana1Reducida: true }).hipotesis.pectoral!;
    expect(h.iemArranque).toBe(41.2);
  });

  it('donde hay bloque anterior, manda el anterior; la referencia propia cubre solo las zonas que le faltan', () => {
    const p = proponerHipotesis({
      tipo: 'desarrollo', estrellas: ['pectoral', 'cuadriceps'],
      anterior: { porZona: { cuadriceps: { zona: 'cuadriceps', iemMedio: 28, iemFinal: 30, porSemana: [] } } },
      referenciaPropia: { semanas: 2, porZona: { ...ref.porZona, cuadriceps: { zona: 'cuadriceps', iemMedio: 99, iemFinal: 99 } } },
    });
    expect(p.hipotesis.cuadriceps).toMatchObject({ iemFinalAnterior: 30, iemMedioAnterior: 28 });
    expect(p.hipotesis.cuadriceps!.semanasDeReferencia).toBeUndefined();
    expect(p.hipotesis.pectoral).toMatchObject({ iemFinalAnterior: 41.2, semanasDeReferencia: 2 });
  });

  const H: Record<string, HipotesisDeZona> = {
    pectoral: { palanca: 'volumen', iemMedioAnterior: 41.2, iemFinalAnterior: 41.2, semanasDeReferencia: 2, iemMedioObjetivo: 43.3, iemArranque: 41.2, iemTecho: 45.3, rmObjetivoPct: 5 },
  };

  it('el semáforo mide desde la semana siguiente a la referencia y lo dice', () => {
    const e = estado({ semanas: [1, 2, 3, 4, 5].map(n => semana(n)), pectoral: [40.8, 41.6, 43, 44, 44] });
    const [f] = semaforoDeHipotesis({ hipotesis: H, estado: e, semanaActual: 6, semanasTotales: 10 });
    // Media de 43, 44 y 44 (43,7), no de las cinco (42,7): con las de referencia dentro no llegaría a 43,3.
    expect(f).toMatchObject({ iemMedio: 43.7, iemMedioObjetivo: 43.3, proceso: 'en_camino' });
    expect(f.texto).toContain('IEM medio tras la referencia 43,7 de 43,3');
    // La misma hipótesis sin la marca se mediría con las cinco semanas.
    const { semanasDeReferencia: _, ...sinMarca } = H.pectoral;
    expect(semaforoDeHipotesis({ hipotesis: { pectoral: sinMarca }, estado: e, semanaActual: 6, semanasTotales: 10 })[0].iemMedio).toBe(42.7);
  });

  it('recién confirmada, sin semanas después de la referencia: sin dato de proceso', () => {
    const e = estado({ semanas: [1, 2].map(n => semana(n)), pectoral: [40.8, 41.6] });
    const [f] = semaforoDeHipotesis({ hipotesis: H, estado: e, semanaActual: 3, semanasTotales: 10 });
    expect(f).toMatchObject({ iemMedio: null, proceso: 'sin_dato' });
    expect(f.texto).toContain('IEM medio aún sin semanas tras la referencia');
  });

  it('el veredicto hace la misma cuenta: se hizo si la media SIN la referencia llega', () => {
    const base = { hipotesis: H, progresion: [], zonaDe: {} };
    const hecho = veredictosDelBloque({ ...base, estado: estado({ semanas: [1, 2, 3, 4, 5].map(n => semana(n)), pectoral: [40.8, 41.6, 43, 44, 44] }) })[0];
    expect(hecho).toMatchObject({ iemMedio: 43.7, iemMedioObjetivo: 43.3, procesoCumplido: true });
    // No subió nada: se quedó en el nivel de la referencia.
    const plano = veredictosDelBloque({ ...base, estado: estado({ semanas: [1, 2, 3, 4, 5].map(n => semana(n)), pectoral: [40.8, 41.6, 41, 41.5, 41] }) })[0];
    expect(plano).toMatchObject({ iemMedio: 41.2, procesoCumplido: false });
  });
});
