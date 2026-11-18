import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CierreDeHipotesis, Mesocycle } from '../../types';
import { usarFuenteDeDatos, type FuenteDeDatos } from './datos';
import { NOTA_DE_HIPOTESIS, hipotesisParaElAsistente, esTipoDeBloque, semanasPorDefectoDe } from './hipotesis';
import { leerBloqueDelAsistente, primerBloqueSiNoSeIndica, proposeMesocycle, proposePeriodizationBlock } from './propuestas';
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

  it('el objetivo de RM se cuenta tal cual: 0 es «no perder» (déficit o recuperar), no un 5 %', () => {
    const deficit = { ...M2, hipotesis: { pectoral: { palanca: 'volumen', rmObjetivoPct: 0, iemFinalAnterior: 58, iemTecho: 58, iemMedioObjetivo: 55.1 }, deltoides: { palanca: 'recuperar' }, dorsal: { palanca: 'volumen', rmObjetivoPct: 8 } } } as unknown as Mesocycle;
    const r = hipotesisParaElAsistente(deficit, [deficit]);
    expect(Object.fromEntries(r.hipotesis.map(h => [h.zona, h.rmObjetivoPct]))).toEqual({ pectoral: 0, dorsal: 8, deltoides: 0 });
  });

  it('la nota explica las cifras nuevas: proceso sobre donde acabó, tres franjas y mejora parcial', () => {
    expect(NOTA_DE_HIPOTESIS).toContain('donde ACABÓ el bloque anterior');
    expect(NOTA_DE_HIPOTESIS).toContain('8 en un principiante');
    expect(NOTA_DE_HIPOTESIS).toContain('0 = no perder');
    expect(NOTA_DE_HIPOTESIS).toContain('80 de IEM o más');
    expect(NOTA_DE_HIPOTESIS).toContain('mejora_parcial');
    expect(NOTA_DE_HIPOTESIS).toContain('NO es «no responde»');
  });

  it('el mapa de respuesta dice aparte los bloques de mejora parcial', () => {
    const parcial = { ...M2, cierreDeHipotesis: { firmadoEn: '2026-11-22T10:00:00.000Z', veredictos: [{ zona: 'pectoral', palanca: 'volumen', iemMedio: 17, procesoCumplido: true, rmPct: 4, rmObjetivoPct: 5, resultadoCumplido: false, lectura: 'mejora_parcial' }] } } as unknown as Mesocycle;
    expect(hipotesisParaElAsistente(parcial, [M1, parcial]).mapaDeRespuesta).toBe('Pectoral: responde a volumen (1 de 1, más 1 con mejora menor de la buscada).');
  });

  it('un bloque pasado no ve lo que se firmó después', () => {
    const m0 = { id: 'm0', number: 0, startDate: '2026-03-01', weeks: 12 } as unknown as Mesocycle;
    const r = hipotesisParaElAsistente(m0, [m0, M1, M2]);
    expect(r).toEqual({ tipoBloque: null, hipotesis: [] });
  });

  it('a qué responde (18-11-2026): los indicios con sus casos, de la foto firmada y la de este bloque en vivo', () => {
    const d = (series: number, rmPct: number) => [{ zona: 'pectoral', seriesSemana: series, frecuencia: 1, rirMedio: 2, iemMedio: null, rmPct, ejercicios: 1 }];
    const m1 = { ...M1, cierreDeHipotesis: { ...CIERRE, dosis: d(12, 2) } } as Mesocycle;
    expect(hipotesisParaElAsistente(M2, [m1, M2]).indiciosDeRespuesta).toBeUndefined();
    const r = hipotesisParaElAsistente(M2, [m1, M2], d(15, 6));
    expect(r.indiciosDeRespuesta).toEqual([expect.objectContaining({
      grado: 'indicio', alcance: 'misma_zona', variable: 'volumen', direccion: 'mas', casos: 1,
      frase: 'Pectoral: le fue mejor con más series por semana.',
    })]);
    expect(NOTA_DE_HIPOTESIS).toContain('Son PISTAS, no conclusiones');
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

  it('rechaza un tipo que no existe; más zonas prioritarias de las que suele llevar el tipo es un aviso, no un rechazo', () => {
    expect(leerBloqueDelAsistente({ pecho: { series: 10 } }, { tipoBloque: 'volumen' }).issues[0].field).toBe('tipo_bloque');
    expect(leerBloqueDelAsistente({ pecho: { series: 10 } }, { semana1Reducida: 'si' }).issues[0].field).toBe('semana1_reducida');
    const b = leerBloqueDelAsistente({ pecho: { series: 12, priority: 'alta' }, dorsal: { series: 14, priority: 'alta' } }, { tipoBloque: 'especializacion' });
    expect(b.avisos.join(' ')).toMatch(/2 zonas prioritarias \(pectoral y dorsal\).*una sola estrella/);
    expect(b.issues).toEqual([]);
  });

  // Dani, 18-11-2026: «con 4 que avise, pero que me permita hacer lo que quiera».
  it('desarrollo: tres zonas prioritarias pasan sin aviso; con cuatro avisa y no rechaza', () => {
    const alta = (grupos: string[]) => Object.fromEntries(grupos.map(g => [g, { series: 10, priority: 'alta' as const }]));
    const tres = leerBloqueDelAsistente(alta(['pecho', 'dorsal', 'cuadriceps']), { tipoBloque: 'desarrollo' });
    expect(tres.issues).toEqual([]);
    expect(tres.avisos).toEqual([]);
    const cuatro = leerBloqueDelAsistente(alta(['pecho', 'dorsal', 'cuadriceps', 'gluteo']), { tipoBloque: 'desarrollo' });
    expect(cuatro.issues).toEqual([]);
    expect(cuatro.avisos.join(' ')).toMatch(/4 zonas prioritarias \(pectoral, dorsal, cuádriceps y glúteo\).*Con 4 estrellas.*puedes dejarlo así/);
    // Los cuatro grupos siguen en alta: nada se recorta.
    expect(Object.values(cuatro.groups).filter(g => g.priority === 'alta')).toHaveLength(4);
  });
});

// Dani, 18-11-2026: «no me parece mal que salga como primer bloque; de 8 semanas, aunque luego se pueda estirar».
describe('primer bloque de un atleta, si el asistente no indica tipo', () => {
  const UNO = [{ id: 'm1' }];
  it('sin bloques anteriores y sin tipo: primer bloque, con las 8 semanas de su preset', () => {
    const r = primerBloqueSiNoSeIndica({ semanasIndicadas: false }, 12, []);
    expect(r.opciones.tipoBloque).toBe('primer');
    expect(r.weeks).toBe(8);
    expect(r.aviso).toMatch(/primer bloque de este atleta.*«Primer bloque» \(8 semanas, semana 1 reducida\)/);
    // El despachador rellena 12 cuando no hay `weeks`: sin saber si las mandó, esas 12 son «no indicadas».
    expect(primerBloqueSiNoSeIndica({}, 12, []).weeks).toBe(8);
  });
  it('si el asistente dijo las semanas, se respetan: se puede estirar', () => {
    expect(primerBloqueSiNoSeIndica({ semanasIndicadas: true }, 12, [])).toMatchObject({ weeks: 12, opciones: { tipoBloque: 'primer' } });
    expect(primerBloqueSiNoSeIndica({}, 10, []).weeks).toBe(10);
  });
  it('con tipo indicado, o con algún bloque anterior, no se toca nada', () => {
    expect(primerBloqueSiNoSeIndica({ tipoBloque: 'desarrollo' }, 12, [])).toEqual({ opciones: { tipoBloque: 'desarrollo' }, weeks: 12, aviso: null });
    expect(primerBloqueSiNoSeIndica({}, 12, UNO)).toEqual({ opciones: {}, weeks: 12, aviso: null });
  });
});

describe('propose_mesocycle y propose_periodization_block · tipo, ignorar y semana 1 reducida', () => {
  const creadas: Record<string, unknown>[] = [];
  /** Los bloques que ya tiene el atleta: vacío = lo que se proponga es su primer bloque. */
  let bloquesDelAtleta: Mesocycle[] = [];
  const YA_TUVO_UNO = [{ id: 'm1', athleteId: 'ana@x.com', number: 1, weeks: 8, startDate: '2026-06-01', objective: 'Primer bloque', daysPerWeek: 3, groups: {} } as unknown as Mesocycle];
  const fuente = {
    getUserProfileByEmail: async () => ({ userId: 'u', email: 'ana@x.com', displayName: 'Ana Ruiz', role: 'client' }),
    getAllUserProfiles: async () => [{ userId: 'u', email: 'ana@x.com', displayName: 'Ana Ruiz', role: 'client' }],
    getMesocycles: async () => bloquesDelAtleta,
    createAiProposal: vi.fn(async (d: Record<string, unknown>) => { creadas.push(d); return { id: `p${creadas.length}`, ...d }; }),
    appendDossierFacts: async () => undefined,
    coachActual: () => ({ uid: 'coach', email: 'danitrviner@gmail.com' }),
    isLocalBypassActive: () => false,
  };
  beforeEach(() => { creadas.length = 0; bloquesDelAtleta = []; usarFuenteDeDatos(fuente as unknown as FuenteDeDatos); });
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

  it('sin tipo ni extras y con algún bloque anterior, la propuesta es la de siempre', async () => {
    bloquesDelAtleta = YA_TUVO_UNO;
    await proposeMesocycle('ana@x.com', 12, 4, 'Hipertrofia', { pecho: { series: 12 } }, '2026-11-23', '', 'chat');
    const meso = creadas[0].payload as Mesocycle;
    expect(meso.tipoBloque).toBeUndefined();
    expect(meso.semana1Reducida).toBeUndefined();
    expect(meso.phaseType).toBeUndefined();
    expect(meso.weeks).toBe(12);
  });

  // Dani, 18-11-2026: el primer bloque de un atleta nace como «primer bloque».
  it('sin tipo y sin ningún bloque anterior: nace como primer bloque de 8 semanas con la semana 1 reducida, y se dice', async () => {
    const r = JSON.parse(await proposeMesocycle('ana@x.com', 12, 4, 'Hipertrofia', { pecho: { series: 12 } }, '2026-11-23', '', 'chat', undefined, undefined, { semanasIndicadas: false }));
    expect(r.proposalCreated).toBe(true);
    const meso = creadas[0].payload as Mesocycle;
    expect(meso).toMatchObject({ number: 1, tipoBloque: 'primer', weeks: 8, semana1Reducida: true, phaseType: 'hipertrofia', cdgVelocidad: 'suave' });
    expect(creadas[0].summary).toContain('8 sem');
    expect(creadas[0].summary).toContain('· Primer bloque · semana 1 reducida');
    expect(r.avisos.join(' ')).toMatch(/primer bloque de este atleta/);
  });

  it('el primer bloque respeta las semanas y el tipo que diga el asistente', async () => {
    await proposeMesocycle('ana@x.com', 12, 4, 'Hipertrofia', { pecho: { series: 12 } }, '2026-11-23', '', 'chat', undefined, undefined, { semanasIndicadas: true });
    expect(creadas[0].payload).toMatchObject({ tipoBloque: 'primer', weeks: 12 });
    await proposeMesocycle('ana@x.com', 12, 4, 'Desarrollo', { pecho: { series: 12 } }, '2026-11-23', '', 'chat', undefined, undefined, { tipoBloque: 'desarrollo' });
    expect(creadas[1].payload).toMatchObject({ tipoBloque: 'desarrollo', weeks: 12 });
    expect((creadas[1].payload as Mesocycle).semana1Reducida).toBeUndefined();
  });

  // Dani, 18-11-2026: «con 4 que avise, pero que me permita hacer lo que quiera».
  it('cuatro zonas prioritarias: la propuesta se crea, con el aviso', async () => {
    bloquesDelAtleta = YA_TUVO_UNO;
    const grupos = Object.fromEntries(['pecho', 'dorsal', 'cuadriceps', 'gluteo'].map(g => [g, { series: 10, priority: 'alta' as const }]));
    const r = JSON.parse(await proposeMesocycle('ana@x.com', 12, 4, 'Desarrollo', grupos, '2026-11-23', '', 'chat', undefined, undefined, { tipoBloque: 'desarrollo' }));
    expect(r.proposalCreated).toBe(true);
    expect(r.valid).toBeUndefined();
    expect(r.avisos.join(' ')).toMatch(/4 zonas prioritarias.*puedes dejarlo así/);
    const meso = creadas[0].payload as Mesocycle;
    expect(['pecho', 'dorsal', 'cuadriceps', 'gluteo'].every(g => meso.groups[g as keyof Mesocycle['groups']].priority === 'alta')).toBe(true);
  });

  it('el bloque completo sin tipo también nace como primer bloque; si la descarga pedida no cabe en 8 semanas, conserva las suyas', async () => {
    await proposePeriodizationBlock('ana@x.com', 12, 3, 'Hipertrofia', { pecho: { series: 8 } }, '2026-11-23', undefined, 2, 'revision', '', 'chat');
    expect((creadas[0].payload as { mesocycle: Mesocycle }).mesocycle).toMatchObject({ tipoBloque: 'primer', weeks: 8, semana1Reducida: true });
    const r = JSON.parse(await proposePeriodizationBlock('ana@x.com', 12, 3, 'Hipertrofia', { pecho: { series: 8 } }, '2026-11-23', 10, 2, 'revision', '', 'chat'));
    expect(r.proposalCreated).toBe(true);
    expect((creadas[1].payload as { mesocycle: Mesocycle }).mesocycle).toMatchObject({ tipoBloque: 'primer', weeks: 12, deloadWeek: 10 });
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
