import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AiContentBlock } from '../../src/types';

/* El bucle de agente del servidor, ronda a ronda, sin red y sin Firestore:
   el «modelo» es un guion de respuestas y la fuente de datos de las tools un
   objeto con lo justo. Lo que se comprueba es el CABLE: que el prompt del
   episodio salga como primer mensaje, que una ronda con tools ejecute las
   tools y deje el historial listo para la siguiente, que el coste se acumule
   y que `end_turn` cierre con la línea para Dani. */

const fuente = vi.hoisted(() => ({
  getOnboarding: vi.fn(async () => ({ athleteId: 'ana@x.com', consentimientoIA: { aceptado: true, fecha: '2026-10-01', version: 1 } })),
  getAllUserProfiles: vi.fn(async () => [{ email: 'ana@x.com', displayName: 'Ana García' }]),
  getResponsesForAthlete: vi.fn(async () => [{ id: 'r1', questionnaireId: 'q', assignmentId: 'a', athleteId: 'ana@x.com', submittedAt: '2026-10-29T09:00:00.000Z', answers: [] }]),
  createAiProposal: vi.fn(async (d: Record<string, unknown>) => ({ id: 'prop_1', ...d })),
  appendDossierFacts: vi.fn(async () => ({})),
  coachActual: () => ({ uid: 'coach', email: 'danitrviner@gmail.com' }),
  isLocalBypassActive: () => false,
}));

vi.mock('../../src/ai/tools/lectores.js', () => ({
  getClientBrief: vi.fn(async () => 'BRIEF DE ANA'),
  getRevisionEngine: vi.fn(async () => JSON.stringify({ titulares: [] })),
}));

import { ejecutarRonda, type ClienteModelo } from '../_lib/agente';
import { usarFuenteDeDatos, type FuenteDeDatos } from '../../src/ai/tools/datos';
import { nuevoEpisodio, type Episodio } from '../../src/autopiloto/episodios';

usarFuenteDeDatos(fuente as unknown as FuenteDeDatos);

const AHORA = '2026-10-29T03:00:00.000Z';
const uso = (input = 1000, output = 100) => ({ input_tokens: input, output_tokens: output, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 });
const texto = (t: string): AiContentBlock => ({ type: 'text', text: t });
const toolUse = (id: string, name: string, input: Record<string, unknown>): AiContentBlock => ({ type: 'tool_use', id, name, input });

function cliente(guion: { content: AiContentBlock[]; stop_reason: string }[]): ClienteModelo & { llamadas: unknown[] } {
  const llamadas: unknown[] = [];
  return {
    llamadas,
    crear: async params => {
      llamadas.push(params);
      const r = guion.shift();
      if (!r) throw new Error('guion agotado');
      return { ...r, usage: uso() };
    },
  };
}

const sistema = { doctrina: { entrenamiento: 'E', nutricion: 'N' }, instruccionesFijas: '' };
const episodio = (): Episodio => nuevoEpisodio({
  tipo: 'cuestionario_recibido', athleteId: 'ana@x.com', clave: 'r1',
  disparador: { fuente: 'questionnaireResponses', docId: 'r1', fecha: '2026-10-29' }, politica: 'sombra', ahora: AHORA,
});

beforeEach(() => { fuente.createAiProposal.mockClear(); });

describe('ejecutarRonda', () => {
  it('ronda 1 con tools: manda el prompt del episodio, ejecuta las tools y deja el historial listo', async () => {
    const c = cliente([{ content: [toolUse('t1', 'get_client_brief', { athlete_email: 'ana@x.com', tarea: 'revision' })], stop_reason: 'tool_use' }]);
    const r = await ejecutarRonda({ episodio: episodio(), modelo: 'claude-sonnet-5-5', cliente: c, sistema, alias: 'Ana G.', ahora: AHORA });
    const params = c.llamadas[0] as { messages: { role: string; content: { type: string; text?: string }[] }[]; system: { text: string }[]; model: string };
    expect(params.model).toBe('claude-sonnet-5-5');
    expect(params.messages).toHaveLength(1);
    expect(params.messages[0].content[0].text).toMatch(/^EPISODIO: ha llegado la revisión/);
    expect(params.system.map(s => s.text).join('\n')).toContain('CRITERIO DEL COACH');
    expect(r.episodio.estado).toBe('en_curso');
    expect(r.episodio.ronda).toBe(1);
    expect(r.episodio.historial).toHaveLength(3);
    const resultado = r.episodio.historial![2].content[0] as { type: string; content: string };
    expect(resultado.type).toBe('tool_result');
    expect(resultado.content).toBe('BRIEF DE ANA');
    expect(r.auditoria).toMatchObject({ episodioId: r.episodio.id, tipo: 'cuestionario_recibido', toolNames: ['get_client_brief'] });
    expect(r.episodio.coste.usd).toBeGreaterThan(0);
    expect(r.episodio.coste.llamadas).toBe(1);
  });

  it('una propuesta creada por una tool queda apuntada en el episodio y lleva su contexto (sombra)', async () => {
    const c = cliente([{ content: [toolUse('t2', 'propose_respuesta_revision', { athlete_email: 'ana@x.com', response_id: 'r1', texto: 'Buena semana, Ana.' })], stop_reason: 'tool_use' }]);
    const r = await ejecutarRonda({ episodio: episodio(), modelo: 'claude-sonnet-5-5', cliente: c, sistema, alias: 'Ana G.', ahora: AHORA });
    expect(r.episodio.propuestas).toEqual(['prop_1']);
    expect(fuente.createAiProposal).toHaveBeenCalledWith(expect.objectContaining({ kind: 'respuestaRevision', paraAtleta: 'Buena semana, Ana.' }));
  });

  it('ronda 2 reanuda desde el historial guardado y end_turn cierra con la línea para Dani', async () => {
    const c = cliente([
      { content: [toolUse('t1', 'get_client_brief', { athlete_email: 'ana@x.com', tarea: 'revision' })], stop_reason: 'tool_use' },
      { content: [texto('He propuesto la respuesta.\n\nPARA DANI: respuesta rutinaria propuesta; nada que mirar.')], stop_reason: 'end_turn' },
    ]);
    const r1 = await ejecutarRonda({ episodio: episodio(), modelo: 'claude-sonnet-5-5', cliente: c, sistema, alias: 'Ana G.', ahora: AHORA });
    const r2 = await ejecutarRonda({ episodio: r1.episodio, modelo: 'claude-sonnet-5-5', cliente: c, sistema, alias: 'Ana G.', ahora: AHORA });
    const params2 = c.llamadas[1] as { messages: unknown[] };
    expect(params2.messages).toHaveLength(3);
    expect(r2.episodio.estado).toBe('hecho');
    expect(r2.episodio.paraDani).toBe('respuesta rutinaria propuesta; nada que mirar.');
    expect(r2.episodio.ronda).toBe(2);
    expect(r2.episodio.cerradoEn).toBe(AHORA);
    expect(r2.episodio.coste.llamadas).toBe(2);
  });

  it('con alertas, el cierre es «escalado»: lo tiene que mirar Dani', async () => {
    const ep = { ...episodio(), alertas: ['Molestia: hombro'] };
    const c = cliente([{ content: [texto('PARA DANI: molestia en el hombro, nota dejada.')], stop_reason: 'end_turn' }]);
    const r = await ejecutarRonda({ episodio: ep, modelo: 'claude-sonnet-5-5', cliente: c, sistema, alias: 'Ana G.', ahora: AHORA });
    expect(r.episodio.estado).toBe('escalado');
  });

  // 25-11-2026: un corte por longitud mataba el episodio a la primera. Ahora la
  // ronda se repite con la salida ampliada y solo el segundo corte lo cierra.
  it('un corte por longitud repite la ronda con más salida; si se vuelve a cortar, fallido con el historial saneado', async () => {
    const cortada = { content: [toolUse('t9', 'get_client_brief', { athlete_email: 'ana@x.com' })], stop_reason: 'max_tokens' };
    const c = cliente([cortada, { ...cortada }]);
    const r1 = await ejecutarRonda({ episodio: episodio(), modelo: 'claude-sonnet-5-5', cliente: c, sistema, alias: 'Ana G.', ahora: AHORA });
    expect((c.llamadas[0] as { max_tokens: number }).max_tokens).toBe(8000);
    expect(r1.episodio.estado).toBe('en_curso');
    expect(r1.episodio.salidaAmpliada).toBe(true);
    // La respuesta cortada no entra en el historial (puede traer un tool_use a medias), pero su gasto sí cuenta.
    expect(r1.episodio.historial).toBeUndefined();
    expect(r1.episodio.coste.llamadas).toBe(1);
    expect(r1.episodio.ronda).toBe(1);

    const r2 = await ejecutarRonda({ episodio: r1.episodio, modelo: 'claude-sonnet-5-5', cliente: c, sistema, alias: 'Ana G.', ahora: AHORA });
    const params2 = c.llamadas[1] as { max_tokens: number; messages: unknown[] };
    expect(params2.max_tokens).toBe(16000);
    expect(params2.messages).toHaveLength(1); // la misma ronda, desde el guion
    expect(r2.episodio.estado).toBe('fallido');
    expect(r2.episodio.error).toMatch(/longitud/);
    // El tool_use sin resultado se cierra con un «interrumpido»: el historial sigue siendo válido.
    const ultimo = r2.episodio.historial!.at(-1)!;
    expect(ultimo.role).toBe('user');
    expect((ultimo.content[0] as { type: string }).type).toBe('tool_result');
  });

  it('un rechazo del modelo cierra el episodio como fallido', async () => {
    const c = cliente([{ content: [texto('No puedo ayudar con esto.')], stop_reason: 'refusal' }]);
    const r = await ejecutarRonda({ episodio: episodio(), modelo: 'claude-sonnet-5-5', cliente: c, sistema, alias: 'Ana G.', ahora: AHORA });
    expect(r.episodio.estado).toBe('fallido');
    expect(r.episodio.error).toMatch(/rechazó/);
  });

  it('una ronda buena borra el rastro de los fallos transitorios anteriores', async () => {
    const c = cliente([{ content: [texto('PARA DANI: hecho.')], stop_reason: 'end_turn' }]);
    const conFallo = { ...episodio(), intentos: 2, error: 'Intento 2 de 3 fallido…' };
    const r = await ejecutarRonda({ episodio: conFallo, modelo: 'claude-sonnet-5-5', cliente: c, sistema, alias: 'Ana G.', ahora: AHORA });
    expect(r.episodio.estado).toBe('hecho');
    expect(r.episodio.intentos).toBeUndefined();
    expect(r.episodio.error).toBeUndefined();
  });

  it('un episodio ya cerrado o sin presupuesto no llama al modelo', async () => {
    const c = cliente([]);
    const hecho = { ...episodio(), estado: 'hecho' as const };
    expect((await ejecutarRonda({ episodio: hecho, modelo: 'x', cliente: c, sistema, alias: 'A', ahora: AHORA })).auditoria).toBeNull();
    const caro = { ...episodio(), coste: { usd: 0.6, llamadas: 9, modelo: 'x' } };
    const r = await ejecutarRonda({ episodio: caro, modelo: 'x', cliente: c, sistema, alias: 'A', ahora: AHORA });
    expect(r.episodio.estado).toBe('fallido');
    expect(r.episodio.error).toMatch(/Tope de gasto/);
    expect(c.llamadas).toHaveLength(0);
  });
});

describe('ejecutarRonda · lo que lleva cada llamada', () => {
  const pesado = (tipo: 'alta_completada' | 'fin_de_bloque' | 'revision'): Episodio => nuevoEpisodio({
    tipo, athleteId: 'ana@x.com', clave: 'ana@x.com', disparador: { fuente: 'onboarding', fecha: '2026-10-29' }, politica: 'sombra', ahora: AHORA,
  });
  const fin = { content: [texto('PARA DANI: x')], stop_reason: 'end_turn' };

  it('los ligeros van con 8.000 tokens y esfuerzo bajo; alta, revisión y fin de bloque con 16.000 y esfuerzo medio', async () => {
    const c = cliente([fin, { ...fin }, { ...fin }, { ...fin }]);
    await ejecutarRonda({ episodio: episodio(), modelo: 'm', cliente: c, sistema, alias: 'A', ahora: AHORA });
    for (const tipo of ['alta_completada', 'fin_de_bloque', 'revision'] as const) {
      await ejecutarRonda({ episodio: pesado(tipo), modelo: 'm', cliente: c, sistema, alias: 'A', ahora: AHORA });
    }
    const ajustes = (c.llamadas as { max_tokens: number; output_config: { effort: string } }[]).map(p => [p.max_tokens, p.output_config.effort]);
    expect(ajustes).toEqual([[8000, 'low'], [16000, 'medium'], [16000, 'medium'], [16000, 'medium']]);
  });

  it('el sistema lleva los mismos cuatro bloques que el chat: prompt, doctrina con SU tabla de volumen, cómo programa Dani y el sufijo', async () => {
    const c = cliente([fin]);
    const landmarks = { pecho: { mv: 6, mev: 9, mavMin: 11, mavMax: 17, mrv: 21 } };
    await ejecutarRonda({
      episodio: pesado('alta_completada'), modelo: 'm', cliente: c, alias: 'A', ahora: AHORA,
      sistema: { ...sistema, volumeLandmarks: landmarks, perfilProgramacion: '# CÓMO PROGRAMA DANI (sus 3 rutinas)\nPecho: Press banca (×3; 3×8-10 · RIR 2)', instruccionesFijas: 'Nunca peso muerto convencional.' },
    });
    const system = (c.llamadas[0] as { system: { text: string; cache_control?: unknown }[] }).system;
    expect(system).toHaveLength(4);
    expect(system[1].text).toContain('CRITERIO DEL COACH');
    expect(system[1].text).toMatch(/pecho[^\n]*\b17\b/i); // el mavMax de la tabla de Dani, no el de fábrica
    expect(system[2].text).toMatch(/^# CÓMO PROGRAMA DANI/);
    expect(system.slice(0, 3).every(b => !!b.cache_control)).toBe(true);
    expect(system[3].text).toContain('Nunca peso muerto convencional.');
    expect(system[3].cache_control).toBeUndefined();
  });

  it('sin rutinas no hay bloque de perfil: el sistema se queda en tres', async () => {
    const c = cliente([fin]);
    await ejecutarRonda({ episodio: episodio(), modelo: 'm', cliente: c, sistema: { ...sistema, perfilProgramacion: '' }, alias: 'A', ahora: AHORA });
    expect((c.llamadas[0] as { system: unknown[] }).system).toHaveLength(3);
  });

  it('la señal de corte por tiempo llega a la llamada al modelo', async () => {
    const señales: (AbortSignal | undefined)[] = [];
    const c: ClienteModelo = { crear: async (_p, o) => { señales.push(o?.signal); return { ...fin, usage: uso() }; } };
    const corte = new AbortController();
    await ejecutarRonda({ episodio: episodio(), modelo: 'm', cliente: c, sistema, alias: 'A', ahora: AHORA, signal: corte.signal });
    expect(señales).toEqual([corte.signal]);
  });
});

describe('ejecutarRonda · aplicar según política', () => {
  it('cada propuesta nueva pasa por `aplicar`; las de rondas anteriores no se repiten', async () => {
    const aplicadas: string[] = [];
    const c = cliente([{ content: [toolUse('t2', 'propose_respuesta_revision', { athlete_email: 'ana@x.com', response_id: 'r1', texto: 'Hola.' })], stop_reason: 'tool_use' }]);
    const r = await ejecutarRonda({ episodio: { ...episodio(), propuestas: ['prop_vieja'] }, modelo: 'm', cliente: c, sistema, alias: 'A', ahora: AHORA, aplicar: async id => { aplicadas.push(id); } });
    expect(aplicadas).toEqual(['prop_1']);
    expect(r.episodio.propuestas).toEqual(['prop_vieja', 'prop_1']);
  });
  it('si aplicar falla, la ronda no se cae: queda para Dani', async () => {
    const c = cliente([{ content: [toolUse('t2', 'propose_respuesta_revision', { athlete_email: 'ana@x.com', response_id: 'r1', texto: 'Hola.' })], stop_reason: 'tool_use' }]);
    const r = await ejecutarRonda({ episodio: episodio(), modelo: 'm', cliente: c, sistema, alias: 'A', ahora: AHORA, aplicar: async () => { throw new Error('boom'); } });
    expect(r.episodio.estado).toBe('en_curso');
  });
});

describe('ejecutarRonda · esperar a Dani (ESPERO)', () => {
  const alta = (): Episodio => nuevoEpisodio({
    tipo: 'alta_completada', athleteId: 'ana@x.com', clave: 'ana@x.com',
    disparador: { fuente: 'onboarding', fecha: '2026-10-29' }, politica: 'proponer', ahora: AHORA,
  });
  it('una propuesta que la política deja y un turno con ESPERO → escalado con esa propuesta', async () => {
    const c = cliente([
      { content: [toolUse('t1', 'propose_mensaje_atleta', { athlete_email: 'ana@x.com', texto: 'Hola.', motivo: 'otro' })], stop_reason: 'tool_use' },
      { content: [texto('Propuesto.\nESPERO: prop_1\nPARA DANI: mesociclo propuesto.')], stop_reason: 'end_turn' },
    ]);
    const r1 = await ejecutarRonda({ episodio: alta(), modelo: 'm', cliente: c, sistema, alias: 'A', ahora: AHORA, aplicar: async () => ({ resultado: 'dejada' }) });
    expect(r1.episodio.aplicadas).toEqual([]);
    const r2 = await ejecutarRonda({ episodio: r1.episodio, modelo: 'm', cliente: c, sistema, alias: 'A', ahora: AHORA });
    expect(r2.episodio.estado).toBe('escalado');
    expect(r2.episodio.esperaPropuestas).toEqual(['prop_1']);
    expect(r2.episodio.paraDani).toContain('Esperando tu decisión');
  });
  it('si la política la aplicó, la ronda la apunta en `aplicadas` y el ESPERO no para', async () => {
    const c = cliente([
      { content: [toolUse('t1', 'propose_mensaje_atleta', { athlete_email: 'ana@x.com', texto: 'Hola.', motivo: 'otro' })], stop_reason: 'tool_use' },
      { content: [texto('ESPERO: prop_1\nPARA DANI: x')], stop_reason: 'end_turn' },
    ]);
    const r1 = await ejecutarRonda({ episodio: alta(), modelo: 'm', cliente: c, sistema, alias: 'A', ahora: AHORA, aplicar: async () => ({ resultado: 'aplicada' }) });
    expect(r1.episodio.aplicadas).toEqual(['prop_1']);
    const r2 = await ejecutarRonda({ episodio: r1.episodio, modelo: 'm', cliente: c, sistema, alias: 'A', ahora: AHORA });
    expect(r2.episodio.estado).toBe('en_curso');
  });
});
