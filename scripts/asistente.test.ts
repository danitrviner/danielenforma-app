import { describe, it, expect, vi } from 'vitest';
import { fuenteEnSeco, leerArgumentos, leerEntrada, leerEnv, type Apunte } from './asistente';
import type { FuenteDeDatos } from '../src/ai/tools/datos';

/* El puente del asistente para Claude Code. Lo que NO puede fallar es el modo
   en seco: es lo que deja validar una propuesta contra los datos reales de un
   atleta sin escribirle nada. Si una escritura se colara, no daría error: daría
   una propuesta de prueba en la bandeja de Dani o un hecho falso en la ficha. */

describe('fuenteEnSeco', () => {
  const real = {
    getMesocycles: vi.fn(async () => [{ id: 'm1' }]),
    createAiProposal: vi.fn(async (d: object) => ({ id: 'real', ...d })),
    updateAiProposal: vi.fn(async () => undefined),
    appendDossierFacts: vi.fn(async () => ({})),
    createCoachClientTask: vi.fn(async (d: object) => ({ id: 'real', ...d })),
    saveCoachReport: vi.fn(async (d: object) => ({ id: 'real', ...d })),
    coachActual: () => ({ uid: 'coach', email: 'c@x.com' }),
    isLocalBypassActive: () => false,
  };
  const fuente = (apuntes: Apunte[]) => fuenteEnSeco(real as unknown as FuenteDeDatos, apuntes);

  it('las lecturas pasan a la fuente real', async () => {
    const apuntes: Apunte[] = [];
    expect(await fuente(apuntes).getMesocycles('ana@x.com')).toEqual([{ id: 'm1' }]);
    expect(real.getMesocycles).toHaveBeenCalledWith('ana@x.com');
    expect(apuntes).toEqual([]);
  });

  it('ninguna escritura llega a la fuente real: se apunta y devuelve un id de mentira', async () => {
    const apuntes: Apunte[] = [];
    const f = fuente(apuntes) as unknown as Record<string, (...a: unknown[]) => Promise<{ id: string }>>;
    const p = await f.createAiProposal({ athleteId: 'ana@x.com', kind: 'diet' });
    await f.updateAiProposal('p1', { status: 'approved' });
    await f.appendDossierFacts('ana@x.com', [{ text: 'hecho' }]);
    await f.createCoachClientTask({ title: 't' });
    await f.saveCoachReport({ status: 'draft' });
    expect(p).toMatchObject({ id: 'SECO_1', athleteId: 'ana@x.com', kind: 'diet' });
    expect(apuntes.map(a => a.metodo)).toEqual(['createAiProposal', 'updateAiProposal', 'appendDossierFacts', 'createCoachClientTask', 'saveCoachReport']);
    for (const m of ['createAiProposal', 'updateAiProposal', 'appendDossierFacts', 'createCoachClientTask', 'saveCoachReport'] as const) {
      expect(real[m], m).not.toHaveBeenCalled();
    }
  });

  it('lo que no es una función (o no escribe) se devuelve tal cual', () => {
    expect(fuente([]).coachActual()).toEqual({ uid: 'coach', email: 'c@x.com' });
  });
});

describe('argumentos y entrada', () => {
  it('separa lo posicional de las banderas, con y sin valor', () => {
    expect(leerArgumentos(['tool', 'get_diet', '{"a":1}', '--escribir'])).toEqual({ posicionales: ['tool', 'get_diet', '{"a":1}'], banderas: { escribir: true } });
    expect(leerArgumentos(['clips', 'a@x.com', '--n', '3', '--completo'])).toEqual({ posicionales: ['clips', 'a@x.com'], banderas: { n: '3', completo: true } });
    expect(leerArgumentos(['aprobar', 'p1', '--nota', 'subo dorsal'])).toEqual({ posicionales: ['aprobar', 'p1'], banderas: { nota: 'subo dorsal' } });
  });
  it('sin --escribir no hay bandera de escribir: el valor por defecto es en seco', () => {
    expect(leerArgumentos(['tool', 'propose_diet_update', '{}']).banderas.escribir).toBeUndefined();
  });
  it('la entrada de una tool tiene que ser un objeto JSON', () => {
    expect(leerEntrada('{"athlete_email":"a@x.com"}')).toEqual({ athlete_email: 'a@x.com' });
    expect(leerEntrada(undefined)).toEqual({});
    expect(() => leerEntrada('[1,2]')).toThrow(/objeto JSON/);
    expect(() => leerEntrada('no es json')).toThrow();
  });
  it('lee un .env con y sin comillas y salta lo que no es una variable', () => {
    expect(leerEnv('# comentario\nA=1\nB="dos palabras"\n\nC=\'x\'\nsin igual')).toEqual({ A: '1', B: 'dos palabras', C: 'x' });
  });
});
