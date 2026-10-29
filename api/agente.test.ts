import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AiContentBlock } from '../src/types';

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

vi.mock('../src/ai/tools/lectores.js', () => ({
  getClientBrief: vi.fn(async () => 'BRIEF DE ANA'),
  getRevisionEngine: vi.fn(async () => JSON.stringify({ titulares: [] })),
}));

import { ejecutarRonda, type ClienteModelo } from './_lib/agente';
import { usarFuenteDeDatos, type FuenteDeDatos } from '../src/ai/tools/datos';
import { nuevoEpisodio, type Episodio } from '../src/autopiloto/episodios';

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

  it('un corte por longitud o un rechazo cierran el episodio como fallido con el historial saneado', async () => {
    const c = cliente([{ content: [toolUse('t9', 'get_client_brief', { athlete_email: 'ana@x.com' })], stop_reason: 'max_tokens' }]);
    const r = await ejecutarRonda({ episodio: episodio(), modelo: 'claude-sonnet-5-5', cliente: c, sistema, alias: 'Ana G.', ahora: AHORA });
    expect(r.episodio.estado).toBe('fallido');
    expect(r.episodio.error).toMatch(/longitud/);
    // El tool_use sin resultado se cierra con un «interrumpido»: el historial sigue siendo válido.
    const ultimo = r.episodio.historial!.at(-1)!;
    expect(ultimo.role).toBe('user');
    expect((ultimo.content[0] as { type: string }).type).toBe('tool_result');
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
