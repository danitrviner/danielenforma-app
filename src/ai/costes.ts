/* Precios de la Messages API por millón de tokens, en una sola tabla para el
   proxy del chat (api/ai-chat.ts) y el bucle del autopiloto (api/_lib/agente.ts).
   Si Anthropic cambia precios, esto es lo único que hay que tocar.

   Multiplicadores de caché según la documentación: escribir a 5 min 1,25×,
   escribir a 1 h 2×, leer 0,1×. Haiku 5.5: precio hasta 100k tokens de entrada
   por petición (por encima 0,50/2,50); ninguna llamada de aquí llega a eso. */

export const MODELOS_PERMITIDOS = ['claude-sonnet-5', 'claude-sonnet-5-5', 'claude-haiku-4-5', 'claude-haiku-5-5'] as const;
export type ModeloPermitido = typeof MODELOS_PERMITIDOS[number];

export const PRECIOS_POR_MTOK: Record<ModeloPermitido, { input: number; output: number }> = {
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
};

export interface UsoDeTokens {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation?: { ephemeral_5m_input_tokens?: number | null; ephemeral_1h_input_tokens?: number | null } | null;
}

export function calcularCosteUsd(modelo: string, usage: UsoDeTokens): number {
  const precio = PRECIOS_POR_MTOK[modelo as ModeloPermitido];
  if (!precio) return 0;
  const MTOK = 1_000_000;
  const escritura1h = usage.cache_creation?.ephemeral_1h_input_tokens ?? 0;
  const escritura5m = usage.cache_creation
    ? (usage.cache_creation.ephemeral_5m_input_tokens ?? 0)
    : (usage.cache_creation_input_tokens ?? 0);
  return (
    (usage.input_tokens * precio.input) / MTOK +
    (usage.output_tokens * precio.output) / MTOK +
    (escritura5m * precio.input * 1.25) / MTOK +
    (escritura1h * precio.input * 2) / MTOK +
    ((usage.cache_read_input_tokens ?? 0) * precio.input * 0.1) / MTOK
  );
}

/** Modelo por tipo de trabajo (diseño §9.10): Sonnet decide, Haiku redacta. */
export const MODELO_POR_DEFECTO = {
  chat: 'claude-sonnet-5',
  episodioLigero: 'claude-sonnet-5-5',
  episodioPesado: 'claude-sonnet-5-5',
} as const;
