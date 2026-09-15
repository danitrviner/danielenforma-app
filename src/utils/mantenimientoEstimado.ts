/* ═══════════════════════════════════════════════════════════════════════════
   Mantenimiento estimado a partir de lo que le pasa al atleta

   El problema que arregla, en palabras de Dani: la app estimaba que un atleta
   gasta 4.100 kcal y él sabía que mantiene peso con 2.500. Con la fórmula
   mandando, la gráfica leía un déficit enorme en alguien que ni perdía grasa
   ni bajaba de peso (auditoría §11).

   Mifflin-St Jeor es un punto de partida razonable cuando no hay nada más,
   pero NO es la realidad metabólica de ESE atleta. En cuanto hay semanas
   registradas, su peso y lo que come dicen mucho más:

       mantenimiento ≈ kcal que come − (cambio de peso × 7.700 / días)

   7.700 kcal por kilo es la equivalencia clásica (Wishnofsky; matizada por
   Hall 2008, que es la que ya cita el resto del motor).

   Dos cautelas que la auditoría marca expresamente:

    · NUNCA con una semana suelta (§18). Una retención de líquidos, una comida
      fuera o un pesaje a otra hora mueven el peso más que una semana entera de
      déficit, y la estimación saldría disparada.
    · SIEMPRE diciendo cuánta confianza merece el número (§18, §16). Un número
      sin contexto se lee como una verdad, y este no lo es.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Una semana observada: lo que comió y cómo empezó y acabó de peso. */
export interface SemanaObservada {
  /** Media diaria de la semana. `null` si no se sabe. */
  kcalDiarias: number | null;
  pesoInicioKg: number | null;
  pesoFinKg: number | null;
}

export type Confianza = 'sin-datos' | 'baja' | 'media' | 'alta';

export interface MantenimientoEstimado {
  /** kcal/día, o null si no hay con qué estimarlo. */
  kcal: number | null;
  confianza: Confianza;
  /** Cuántas semanas completas se han podido usar. */
  semanasUsadas: number;
  /** Frase lista para enseñar cuando no hay número. */
  motivo?: string;
  /** true si se aleja de la estimación teórica lo bastante como para decirlo. */
  difieresDeLaTeorica: boolean;
}

export interface ContextoDelAtleta {
  /** Mifflin-St Jeor y compañía. Solo se usa para compararse con ella. */
  estimacionTeorica?: number | null;
  /** Gasto diario pautado por pasos, si se conoce. */
  kcalDiariasDePasos?: number;
}

const KCAL_POR_KG = 7700;
const DIAS_POR_SEMANA = 7;

/** A partir de aquí, la diferencia con la teórica merece decirse en pantalla. */
const DIFERENCIA_NOTABLE_KCAL = 300;

/**
 * Estima el mantenimiento real del atleta con las semanas que haya.
 *
 * Función pura: no toca las semanas que recibe ni guarda nada. Cada llamada es
 * independiente, que es lo que impide que una estimación nueva reescriba el
 * histórico (§24.10).
 */
export function estimarMantenimiento(
  semanas: readonly SemanaObservada[],
  contexto: ContextoDelAtleta = {},
): MantenimientoEstimado {
  // Solo valen las semanas completas. Una semana sin peso o sin kcal no es un
  // cero: es un dato que falta, y contarla como cero hundiría la media.
  const utiles = semanas.filter(
    (s): s is { kcalDiarias: number; pesoInicioKg: number; pesoFinKg: number } =>
      s.kcalDiarias != null && s.pesoInicioKg != null && s.pesoFinKg != null,
  );

  if (utiles.length < 2) {
    return {
      kcal: null,
      confianza: 'sin-datos',
      semanasUsadas: utiles.length,
      motivo: 'Todavía no hay datos suficientes para estimar su mantenimiento real. '
            + 'La estimación se irá ajustando a medida que se registren peso y alimentación.',
      difieresDeLaTeorica: false,
    };
  }

  // Una sola cuenta sobre el periodo entero, no la media de las semanas: así
  // una semana rara pesa lo que le toca y no una fracción fija.
  const dias = utiles.length * DIAS_POR_SEMANA;
  const kcalTotales = utiles.reduce((s, w) => s + w.kcalDiarias * DIAS_POR_SEMANA, 0);
  const cambioDePeso = utiles[utiles.length - 1].pesoFinKg - utiles[0].pesoInicioKg;

  const kcalDiariasMedias = kcalTotales / dias;
  const desajusteDiario = (cambioDePeso * KCAL_POR_KG) / dias;
  const mantenimiento = kcalDiariasMedias - desajusteDiario - (contexto.kcalDiariasDePasos ?? 0);

  const teorica = contexto.estimacionTeorica;
  return {
    kcal: Math.round(mantenimiento),
    confianza: confianzaDe(utiles),
    semanasUsadas: utiles.length,
    difieresDeLaTeorica: teorica != null && Math.abs(mantenimiento - teorica) >= DIFERENCIA_NOTABLE_KCAL,
  };
}

/**
 * Cuánto fiarse del número.
 *
 * No basta con contar semanas: seis semanas que se contradicen entre sí son
 * ruido, y llamar «alta» a eso sería la falsa precisión contra la que avisa la
 * auditoría (§16). Se mira también cuánto se parecen las semanas entre ellas.
 */
function confianzaDe(
  semanas: readonly { kcalDiarias: number; pesoInicioKg: number; pesoFinKg: number }[],
): Confianza {
  if (semanas.length < 2) return 'sin-datos';
  if (semanas.length < 4) return 'baja';

  // Desviación de los cambios semanales de peso. Con las semanas tirando cada
  // una para un lado, la media no representa nada aunque haya muchas.
  const cambios = semanas.map(s => s.pesoFinKg - s.pesoInicioKg);
  const media = cambios.reduce((a, b) => a + b, 0) / cambios.length;
  const varianza = cambios.reduce((a, c) => a + (c - media) ** 2, 0) / cambios.length;
  const desviacion = Math.sqrt(varianza);

  // 0,35 kg de desviación semanal es mucho ruido para una señal que suele
  // moverse entre 0,2 y 0,8 kg.
  if (desviacion > 0.35) return 'baja';
  if (semanas.length < 6) return 'media';
  return 'alta';
}
