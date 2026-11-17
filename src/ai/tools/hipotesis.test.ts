import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CierreDeHipotesis, Mesocycle } from '../../types';
import { usarFuenteDeDatos, type FuenteDeDatos } from './datos';
import { hipotesisParaElAsistente, esTipoDeBloque, semanasPorDefectoDe } from './hipotesis';
import { leerBloqueDelAsistente, proposeMesocycle, proposePeriodizationBlock } from './propuestas';
import { cambiosDeMesociclo } from '../cambiosPropuesta';

/* H11 (17-11-2026): el asistente lee la hipótesis del bloque y puede proponer
   un bloque con tipo, cuatro niveles por grupo y semana 1 reducida. */

const CIERRE: CierreDeHipotesis = {
  firmadoEn: '2026-08-30T10:00:00.000Z',
  veredictos: [{ zona: 'pectoral', palanca: 'volumen', iemMedio: 17, iemMedioObjetivo: 17, procesoCumplido: true, rmPct: 6, rmObjetivoPct: 5, resultadoCumplido: true, lectura: 'confirmada' }],
};
const M1 = { id: 'm1', athleteId: 'ana@x.com', number: 1, weeks: 12, startDate: '2026-06-01', tipoBloque: 'desarrollo', hipotesis: { pectoral: { palanca: 'volumen' } }, cierreDeHipotesis: CIERRE } as unknown as Mesocycle;
const M2 = {
  id: 'm2', athleteId: 'ana@x.com', number: 2, weeks: 12, startDate: '2026-08-31', tipoBloque: 'desarrollo', semana1Reducida: false,
  hipotesis: { deltoides: { palanca: 'intensidad', rmObjetivoPct: 4, limite: ' hombro sin molestias ' }, pectoral: { palanca: 'volumen', iemFinalAnterior: 16, iemTecho: 17.6 } },
  groups: { pecho: { series: 14, priority: 'alta' }, antebrazo: { series: 0, priority: 'ignorar' } },
} as unknown as Mesocycle;

describe('hipotesisParaElAsistente', () => {
  it('trae el tipo, una hipótesis por zona prioritaria en el orden del método y los grupos ignorados', () => {
    const r = hipotesisParaElAsistente(M2, [M1, M2]);
    expect(r.tipoBloque).toBe('desarrollo');
    expect(r.tipoBloqueEtiqueta).toBe('Desarrollo');
    expect(r.semana1Reducida).toBe(false);
    expect(r.hipotesis.map(h => h.zona)).toEqual(['pectoral', 'deltoides']);
    expect(r.hipotesis[0]).toMatchObject({ nombre: 'Pectoral', palanca: 'volumen', rmObjetivoPct: 5, iemFinalAnterior: 16, iemTecho: 17.6 });
    expect(r.hipotesis[1]).toMatchObject({ palanca: 'intensidad', rmObjetivoPct: 4, limite: 'hombro sin molestias' });
    expect(r.gruposIgnorados).toEqual(['Antebrazo']);
  });

  it('sin firmar no hay cierre; el mapa de respuesta sale de los cierres firmados hasta ese bloque', () => {
    const actual = hipotesisParaElAsistente(M2, [M1, M2]);
    expect(actual.cierreDeHipotesis).toBeUndefined();
    expect(actual.mapaDeRespuesta).toBe('Pectoral: responde a volumen (1 de 1).');
    const anterior = hipotesisParaElAsistente(M1, [M1, M2]);
    expect(anterior.cierreDeHipotesis).toEqual(CIERRE);
    expect(anterior.mapaDeRespuesta).toBe('Pectoral: responde a volumen (1 de 1).');
  });

  it('un bloque pasado no ve lo que se firmó después', () => {
    const m0 = { id: 'm0', number: 0, startDate: '2026-03-01', weeks: 12 } as unknown as Mesocycle;
    const r = hipotesisParaElAsistente(m0, [m0, M1, M2]);
    expect(r).toEqual({ tipoBloque: null, hipotesis: [] });
  });
});

describe('tipo de bloque del asistente', () => {
  it('solo los cuatro valores acordados', () => {
    expect(['primer', 'desarrollo', 'especializacion', 'mantenimiento'].every(esTipoDeBloque)).toBe(true);
    expect(esTipoDeBloque('descarga')).toBe(false);
    expect(esTipoDeBloque(undefined)).toBe(false);
  });
  it('sin semanas: 12, y 8 en un primer bloque', () => {
    expect(semanasPorDefectoDe(undefined)).toBe(12);
    expect(semanasPorDefectoDe('desarrollo')).toBe(12);
    expect(semanasPorDefectoDe('primer')).toBe(8);
  });
});

describe('leerBloqueDelAsistente', () => {
  it('un grupo ignorado se valida como 0 series y se guarda con su nivel', () => {
    const b = leerBloqueDelAsistente({ pecho: { series: 12, priority: 'alta' }, antebrazo: { series: 4, priority: 'ignorar' }, gemelo: { series: 4, priority: 'baja' } }, { tipoBloque: 'desarrollo' });
    expect(b.issues).toEqual([]);
    expect(b.paraValidar.antebrazo).toEqual({ series: 0 });
    expect(b.groups.antebrazo).toEqual({ series: 0, priority: 'ignorar' });
    expect(b.groups.gemelo).toEqual({ series: 4, priority: 'baja' });
    expect(b.groups.dorsal).toEqual({ series: 0, priority: 'media' });
    expect(b.avisos.some(a => /«ignorar» son 0 series/.test(a))).toBe(true);
  });

  it('el tipo escribe lo que deriva el editor; la semana 1 reducida solo va sola en el primer bloque', () => {
    expect(leerBloqueDelAsistente({ pecho: { series: 10 } }, { tipoBloque: 'desarrollo' }).campos)
      .toEqual({ tipoBloque: 'desarrollo', phaseType: 'hipertrofia', cdgVelocidad: 'suave' });
    expect(leerBloqueDelAsistente({ pecho: { series: 10 } }, { tipoBloque: 'primer' }).campos)
      .toEqual({ tipoBloque: 'primer', phaseType: 'hipertrofia', cdgVelocidad: 'suave', semana1Reducida: true });
    expect(leerBloqueDelAsistente({ pecho: { series: 6 } }, { tipoBloque: 'mantenimiento' }).campos.phaseType).toBe('mantenimiento');
    // Sin tipo no se inventa nada: los bloques de siempre siguen igual.
    expect(leerBloqueDelAsistente({ pecho: { series: 10 } }).campos).toEqual({});
  });

  it('semana 1 reducida pedida a mano se guarda y recuerda cuándo toca', () => {
    const b = leerBloqueDelAsistente({ pecho: { series: 10 } }, { tipoBloque: 'desarrollo', semana1Reducida: true });
    expect(b.campos.semana1Reducida).toBe(true);
    expect(b.avisos.join(' ')).toMatch(/ejercicios nuevos o tras un parón de más de 3 semanas/);
    expect(leerBloqueDelAsistente({ pecho: { series: 10 } }, { tipoBloque: 'primer', semana1Reducida: false }).campos.semana1Reducida).toBe(false);
  });

  it('rechaza un tipo que no existe y avisa de más zonas prioritarias de las que admite el tipo', () => {
    expect(leerBloqueDelAsistente({ pecho: { series: 10 } }, { tipoBloque: 'volumen' }).issues[0].field).toBe('tipo_bloque');
    expect(leerBloqueDelAsistente({ pecho: { series: 10 } }, { semana1Reducida: 'si' }).issues[0].field).toBe('semana1_reducida');
    const b = leerBloqueDelAsistente({ pecho: { series: 12, priority: 'alta' }, dorsal: { series: 14, priority: 'alta' } }, { tipoBloque: 'especializacion' });
    expect(b.avisos.join(' ')).toMatch(/2 zonas prioritarias \(pectoral y dorsal\).*una sola estrella/);
  });
});

describe('propose_mesocycle y propose_periodization_block · tipo, ignorar y semana 1 reducida', () => {
  const creadas: Record<string, unknown>[] = [];
  const fuente = {
    getUserProfileByEmail: async () => ({ userId: 'u', email: 'ana@x.com', displayName: 'Ana Ruiz', role: 'client' }),
    getAllUserProfiles: async () => [{ userId: 'u', email: 'ana@x.com', displayName: 'Ana Ruiz', role: 'client' }],
    getMesocycles: async () => [],
    createAiProposal: vi.fn(async (d: Record<string, unknown>) => { creadas.push(d); return { id: `p${creadas.length}`, ...d }; }),
    appendDossierFacts: async () => undefined,
    coachActual: () => ({ uid: 'coach', email: 'danitrviner@gmail.com' }),
    isLocalBypassActive: () => false,
  };
  beforeEach(() => { creadas.length = 0; usarFuenteDeDatos(fuente as unknown as FuenteDeDatos); });
  const GRUPOS = { pecho: { series: 12, priority: 'alta' as const }, dorsal: { series: 12, priority: 'media' as const }, gemelo: { series: 6, priority: 'ignorar' as const } };

  it('el mesociclo de la propuesta lleva tipoBloque, semana1Reducida y el grupo ignorado a 0', async () => {
    const r = JSON.parse(await proposeMesocycle('ana@x.com', 12, 4, 'Desarrollo: pectoral', GRUPOS, '2026-11-23', 'porque sí', 'chat', undefined, undefined, { tipoBloque: 'desarrollo', semana1Reducida: true }));
    expect(r.proposalCreated).toBe(true);
    const meso = creadas[0].payload as Mesocycle;
    expect(meso).toMatchObject({ tipoBloque: 'desarrollo', semana1Reducida: true, phaseType: 'hipertrofia', cdgVelocidad: 'suave', weeks: 12 });
    expect(meso.groups.gemelo).toEqual({ series: 0, priority: 'ignorar' });
    expect(meso.groups.pecho).toEqual({ series: 12, priority: 'alta' });
    expect(creadas[0].summary).toContain('· Desarrollo · semana 1 reducida');
    expect(r.trainedGroups.join(' ')).not.toMatch(/Gemelo/);
  });

  it('sin tipo ni extras, la propuesta es la de siempre', async () => {
    await proposeMesocycle('ana@x.com', 12, 4, 'Hipertrofia', { pecho: { series: 12 } }, '2026-11-23', '', 'chat');
    const meso = creadas[0].payload as Mesocycle;
    expect(meso.tipoBloque).toBeUndefined();
    expect(meso.semana1Reducida).toBeUndefined();
    expect(meso.phaseType).toBeUndefined();
  });

  it('un tipo inventado no crea propuesta', async () => {
    const r = JSON.parse(await proposeMesocycle('ana@x.com', 12, 4, 'X', GRUPOS, undefined, '', 'chat', undefined, undefined, { tipoBloque: 'fuerza' }));
    expect(r.valid).toBe(false);
    expect(creadas).toHaveLength(0);
  });

  it('el bloque completo también, y deload_week se acepta pero avisa de que va por señales', async () => {
    const r = JSON.parse(await proposePeriodizationBlock('ana@x.com', 8, 3, 'Primer bloque', { pecho: { series: 8 }, antebrazo: { series: 0, priority: 'ignorar' } }, '2026-11-23', 8, 2, 'revision', '', 'chat', undefined, { tipoBloque: 'primer' }));
    expect(r.proposalCreated).toBe(true);
    const { mesocycle } = creadas[0].payload as { mesocycle: Mesocycle };
    expect(mesocycle).toMatchObject({ tipoBloque: 'primer', semana1Reducida: true, weeks: 8, deloadWeek: 8 });
    expect(mesocycle.groups.antebrazo.priority).toBe('ignorar');
    expect(r.avisos.join(' ')).toMatch(/deload_week está en desuso/);
  });
});

describe('cambiosDeMesociclo · tipo de bloque y grupos ignorados', () => {
  it('dice el tipo nuevo, la semana 1 reducida y lo que se ignora', () => {
    const base = { id: 'a', athleteId: 'ana@x.com', number: 1, weeks: 12, startDate: '2026-06-01', objective: 'X', daysPerWeek: 4 };
    const antes = { ...base, tipoBloque: 'desarrollo', groups: { pecho: { series: 10, priority: 'alta' }, gemelo: { series: 6, priority: 'media' } } } as unknown as Mesocycle;
    const ahora = { ...base, tipoBloque: 'especializacion', semana1Reducida: true, groups: { pecho: { series: 10, priority: 'alta' }, gemelo: { series: 0, priority: 'ignorar' } } } as unknown as Mesocycle;
    const cambios = cambiosDeMesociclo(antes, ahora);
    expect(cambios).toContain('Tipo de bloque: Desarrollo → Especialización');
    expect(cambios).toContain('Semana 1 reducida');
    expect(cambios).toContain('Se ignoran: Gemelo');
    expect(cambiosDeMesociclo(antes, antes)).toEqual([]);
  });
});
