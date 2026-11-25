import { describe, it, expect } from 'vitest';
import {
  MAX_INTENTOS_TRANSITORIOS, ajustesDeLlamada, esEpisodioPesado, esFalloTransitorio, nuevoEpisodio, promptDeEpisodio,
  trasFalloDeRonda, type Episodio, type TipoEpisodio,
} from './episodios';
import { TOOL_DEFINITIONS } from '../ai/tools/definiciones';

/* La tanda rápida del 25-11-2026 sobre el autopiloto:
     · cuánta salida y cuánto esfuerzo lleva cada tipo de episodio;
     · qué fallos se reintentan y cuándo se rinde;
     · que los guiones solo pidan lo que las tools admiten. */

const AHORA = '2026-11-25T03:00:00.000Z';
const ep = (tipo: TipoEpisodio, extra: Partial<Episodio> = {}): Episodio => ({
  ...nuevoEpisodio({ tipo, athleteId: 'ana@x.com', clave: 'k', disparador: { fuente: 'latido', docId: 'r1', fecha: '2026-11-25' }, politica: 'sombra', ahora: AHORA }),
  ...extra,
});

describe('ajustesDeLlamada', () => {
  it('alta, fin de bloque y revisión son pesados: 16.000 tokens y esfuerzo medio', () => {
    for (const tipo of ['alta_completada', 'fin_de_bloque', 'revision'] as const) {
      expect(esEpisodioPesado(tipo)).toBe(true);
      expect(ajustesDeLlamada(ep(tipo))).toEqual({ maxTokens: 16000, effort: 'medium' });
    }
  });
  it('el resto son ligeros: 8.000 y esfuerzo bajo', () => {
    for (const tipo of ['cuestionario_recibido', 'semana_nueva', 'dolor', 'perdidas', 'peso_sin_registrar', 'desvio_peso', 'desvio_adherencia', 'nota_libre', 'bienestar', 'renovacion'] as const) {
      expect(ajustesDeLlamada(ep(tipo))).toEqual({ maxTokens: 8000, effort: 'low' });
    }
  });
  it('un ligero que se cortó repite con la salida de los pesados, sin cambiar de esfuerzo', () => {
    expect(ajustesDeLlamada(ep('dolor', { salidaAmpliada: true }))).toEqual({ maxTokens: 16000, effort: 'low' });
  });
});

describe('esFalloTransitorio', () => {
  it('se reintenta lo que se arregla solo: 408, 409, 429, 5xx, sin conexión y plazo agotado', () => {
    for (const status of [408, 409, 429, 500, 502, 503, 529]) expect(esFalloTransitorio({ status }), String(status)).toBe(true);
    expect(esFalloTransitorio({ name: 'APIConnectionError', message: 'Connection error.' })).toBe(true);
    expect(esFalloTransitorio({ name: 'APIConnectionTimeoutError', message: 'Request timed out.' })).toBe(true);
    expect(esFalloTransitorio({ name: 'APIUserAbortError', message: 'Request was aborted.' })).toBe(true);
    expect(esFalloTransitorio({ name: 'TimeoutError', message: 'The operation was aborted due to timeout' })).toBe(true);
    expect(esFalloTransitorio(Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }))).toBe(true);
  });
  it('no se reintenta lo que repetir no cambia: 400, 401, 403, 404, 413 ni un error de programa', () => {
    for (const status of [400, 401, 403, 404, 413, 422]) expect(esFalloTransitorio({ status }), String(status)).toBe(false);
    expect(esFalloTransitorio(new TypeError("Cannot read properties of undefined (reading 'id')"))).toBe(false);
    expect(esFalloTransitorio(null)).toBe(false);
  });
});

describe('trasFalloDeRonda', () => {
  const saturada = Object.assign(new Error('Overloaded'), { status: 529 });
  it('un fallo transitorio deja el episodio en cola, con el intento apuntado y sin cerrarlo', () => {
    const r = trasFalloDeRonda(ep('revision', { estado: 'en_curso', ronda: 4 }), saturada, AHORA);
    expect(r.estado).toBe('en_curso');
    expect(r.intentos).toBe(1);
    expect(r.ronda).toBe(4);
    expect(r.cerradoEn).toBeUndefined();
    expect(r.error).toMatch(/Intento 1 de 3.*Overloaded/);
  });
  it('un episodio que aún no había empezado sigue pendiente', () => {
    expect(trasFalloDeRonda(ep('dolor'), saturada, AHORA).estado).toBe('pendiente');
  });
  it('al tercer fallo seguido se da por fallido', () => {
    const r = trasFalloDeRonda(ep('revision', { estado: 'en_curso', intentos: MAX_INTENTOS_TRANSITORIOS - 1 }), saturada, AHORA);
    expect(r.estado).toBe('fallido');
    expect(r.cerradoEn).toBe(AHORA);
    expect(r.error).toBe('Overloaded');
  });
  it('un fallo que no es transitorio falla a la primera', () => {
    const r = trasFalloDeRonda(ep('revision'), Object.assign(new Error('messages: text content blocks must be non-empty'), { status: 400 }), AHORA);
    expect(r.estado).toBe('fallido');
    expect(r.intentos).toBe(1);
  });
});

describe('los guiones solo piden lo que las tools admiten', () => {
  const tool = (nombre: string) => TOOL_DEFINITIONS.find(t => t.name === nombre)!.input_schema as {
    properties: Record<string, { enum?: string[]; items?: { properties: Record<string, unknown> } }>;
  };

  it('cada `periodo "…"` que nombra un guion existe en get_revision_engine', () => {
    const validos = tool('get_revision_engine').properties.periodo.enum!;
    const tipos: TipoEpisodio[] = ['cuestionario_recibido', 'semana_nueva', 'revision', 'alta_completada', 'fin_de_bloque', 'dolor', 'perdidas', 'peso_sin_registrar', 'desvio_peso', 'desvio_adherencia', 'nota_libre', 'bienestar', 'renovacion'];
    const pedidos = tipos.flatMap(t => [...promptDeEpisodio(ep(t), { alias: 'A' }).matchAll(/periodo "([^"]+)"/g)].map(m => m[1]));
    expect(pedidos.length).toBeGreaterThan(0);
    for (const p of pedidos) expect(validos, `periodo "${p}"`).toContain(p);
  });

  it('el guion de molestia cambia el ejercicio con `sustituto`, que propose_week_plan admite', () => {
    const guion = promptDeEpisodio(ep('dolor'), { alias: 'A' });
    expect(guion).toContain('propose_week_plan');
    expect(guion).toContain('`sustituto`');
    expect(Object.keys(tool('propose_week_plan').properties.cambios.items!.properties)).toContain('sustituto');
  });

  it('el guion de desvío de peso no promete un dato que el brief no trae', () => {
    expect(promptDeEpisodio(ep('desvio_peso'), { alias: 'A' })).not.toMatch(/gasto real/i);
  });
});
