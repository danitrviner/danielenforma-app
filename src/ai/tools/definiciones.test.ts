import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { TOOL_DEFINITIONS, toolStatusLabel } from './definiciones';
import { TOOL_DEFINITIONS as desdeLaPuerta, executeTool, toolStatusLabel as etiquetaDesdeLaPuerta } from '../tools';

/* Las definiciones forman parte del prefijo cacheado del prompt y son el
   contrato con el modelo: un cambio accidental no da error de compilación y se
   nota semanas después como «el asistente ya no llama a X». El fixture es la
   foto de las 50 tools (43 al partir tools.ts el 28-10-2026; + propose_respuesta_revision y propose_mensaje_atleta el 29-10; + get_cdg_semana, propose_progresion_iem, get_alternativas_ejercicio, get_resultado_esperado y cerrar_esperado en la tanda 5);
   quien cambie una definición a propósito regenera el fixture y el diff enseña
   exactamente qué cambió. */

const fixture = JSON.parse(readFileSync(new URL('./__fixtures__/definiciones.json', import.meta.url), 'utf8'));

describe('TOOL_DEFINITIONS', () => {
  it('son las 50 tools, iguales al fixture byte a byte', () => {
    expect(TOOL_DEFINITIONS.length).toBe(50);
    expect(JSON.parse(JSON.stringify(TOOL_DEFINITIONS))).toEqual(fixture);
  });

  it('no hay dos tools con el mismo nombre y todas piden athlete_email como string cuando lo piden', () => {
    const nombres = TOOL_DEFINITIONS.map(t => t.name);
    expect(new Set(nombres).size).toBe(nombres.length);
    for (const t of TOOL_DEFINITIONS) {
      const props = (t.input_schema as { properties: Record<string, { type?: string }> }).properties;
      if (props.athlete_email) expect(props.athlete_email.type, t.name).toBe('string');
    }
  });

  it('la puerta ./tools reexporta lo mismo que los módulos', () => {
    expect(desdeLaPuerta).toBe(TOOL_DEFINITIONS);
    expect(etiquetaDesdeLaPuerta).toBe(toolStatusLabel);
    expect(typeof executeTool).toBe('function');
  });
});
