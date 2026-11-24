import type { HipotesisDeZona, PalancaDeHipotesis } from '../../types.js';
import { ZONAS_IEM, type ZonaIem } from '../cdg/zonas.js';
import { PALANCAS } from './palancas.js';
import { enLista, nombreCortoDeZona } from './tiposDeBloque.js';

/* ═══════════════════════════════════════════════════════════════════════════
   El aviso de «estrellas sin hipótesis» de la revisión semanal (23-11-2026)

   Un bloque puede llevar zonas con estrella y ninguna hipótesis guardada (se
   creó antes de que existieran: 15 de los 20 bloques activos ese día), o
   llevarla sin cifras de proceso (se confirmó en un primer bloque antes de
   que terminara sus dos primeras semanas). En los dos casos el Seguimiento no
   enseña semáforo o el cierre no puede decir si la apuesta se hizo, y nada lo
   avisaba: las fichas viven en el editor, que hay que abrir a propósito.

   Esto es el texto de la fila que sale en «Lo que pide decisión», donde luego
   saldrá el semáforo, con lo que propone el motor en una línea. Confirmar la
   propuesta desde ahí escribe lo mismo que confirmar en el editor
   (`camposAlConfirmar` con `completarHipotesis`, en utils/hipotesisDelMeso.ts).

   Puro: no lee ni escribe nada.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface PendienteDeHipotesis {
  zona: ZonaIem;
  falta: 'hipotesis' | 'cifras';
}

export interface AvisoDePendientes {
  zonas: ZonaIem[];
  /** «Pectoral y Cuádriceps». */
  titulo: string;
  /** «Sin hipótesis» o «Sin cifras de proceso». */
  estado: string;
  /** Dónde está el bloque, qué se pierde y qué propone el motor. */
  detalle: string;
  /** El texto del botón. */
  accion: string;
}

const FRASE_DE_PALANCA: Record<PalancaDeHipotesis, string> = {
  volumen: 'más volumen', intensidad: 'más intensidad', ejercicios: 'otros ejercicios con el mismo estímulo', recuperar: 'recuperar',
};

const fmt = (v: number) => (Math.round(v * 10) / 10).toLocaleString('es-ES');

/**
 * La fila del aviso. `null` si no hay nada pendiente. `semanaActual` y
 * `semanas` son las del bloque (1-indexada y total).
 */
export function avisoDePendientes(o: {
  pendientes: readonly PendienteDeHipotesis[];
  /** La propuesta del motor para las estrellas del bloque (`propuestaDelMeso`). */
  hipotesis: Partial<Record<string, HipotesisDeZona>>;
  semanaActual?: number | null;
  semanas?: number | null;
}): AvisoDePendientes | null {
  const pendientes = ZONAS_IEM.flatMap(z => o.pendientes.filter(p => p.zona === z.clave));
  if (pendientes.length === 0) return null;
  const zonas = pendientes.map(p => p.zona);
  const sinHipotesis = pendientes.some(p => p.falta === 'hipotesis');
  const nombres = (zs: readonly ZonaIem[]) => enLista(zs.map(nombreCortoDeZona));

  const partes: string[] = [];
  if (o.semanaActual != null && o.semanas != null && o.semanas > 0) partes.push(`Semana ${Math.min(o.semanaActual, o.semanas)} de ${o.semanas}.`);
  partes.push(sinHipotesis
    ? 'Sin confirmar no hay semáforo ni veredicto al cerrar.'
    : `${zonas.length === 1 ? 'Está confirmada' : 'Están confirmadas'} sin cifras de estímulo: el veredicto se daría solo por el RM.`);

  // La propuesta, palanca a palanca, en el orden de las zonas.
  const porPalanca = new Map<PalancaDeHipotesis, ZonaIem[]>();
  for (const z of zonas) {
    const h = o.hipotesis[z];
    if (!h) continue;
    porPalanca.set(h.palanca, [...(porPalanca.get(h.palanca) ?? []), z]);
  }
  const apuestas = [...porPalanca].map(([p, zs]) =>
    `${FRASE_DE_PALANCA[p] ?? PALANCAS[p].etiqueta}${porPalanca.size > 1 || zonas.length === 1 ? ` en ${nombres(zs)}` : zonas.length === 2 ? ' en las dos' : ` en las ${zonas.length}`}`);
  if (apuestas.length) {
    const conCifras = zonas.map(z => o.hipotesis[z]).filter((h): h is HipotesisDeZona => !!h && h.iemFinalAnterior != null);
    const propias = conCifras.filter(h => (h.semanasDeReferencia ?? 0) > 0);
    // De dónde salen las cifras: solo se dice si vale para todas las zonas.
    const todas = conCifras.length === zonas.length;
    const origen = !todas ? null : propias.length === zonas.length ? 'propio' : propias.length === 0 ? 'anterior' : null;
    const pct = todas ? porcentajeComun(conCifras) : null;
    if (origen && pct != null && pct <= 0) {
      // La propuesta no sube (bloque en déficit, zona ya alta…): decir «más volumen» engañaría.
      const noPerder = conCifras.every(h => h.rmObjetivoPct === 0);
      const donde = zonas.length === 1 ? `en ${nombres(zonas)}` : zonas.length === 2 ? 'en las dos' : `en las ${zonas.length}`;
      partes.push(`Propuesta: sostener ${origen === 'propio' ? `el estímulo de sus primeras ${propias[0].semanasDeReferencia} semanas` : 'el estímulo con el que acabó el bloque anterior'} ${donde}${noPerder ? ', sin perder fuerza' : ''}.`);
    } else {
      const sube = pct != null && pct > 0 ? `, +${fmt(pct)} %` : '';
      const desde = origen === 'propio' ? `${sube} sobre sus primeras ${propias[0].semanasDeReferencia} semanas`
        : origen === 'anterior' ? `${sube} sobre donde acabó el bloque anterior` : '';
      partes.push(`Propuesta: ${enLista(apuestas)}${desde}.`);
    }
    if (conCifras.length === 0) partes.push('Aún sin cifras de estímulo: saldrán de sus dos primeras semanas entrenadas.');
  }

  return {
    zonas,
    titulo: nombres(zonas),
    estado: sinHipotesis ? 'Sin hipótesis' : 'Sin cifras de proceso',
    detalle: partes.join(' '),
    accion: sinHipotesis ? 'Confirmar la propuesta' : 'Poner las cifras',
  };
}

/**
 * El % que pide el proceso sobre la referencia, si es el mismo en todas
 * (`null` si difiere o falta). «El mismo» con un punto de holgura: las cifras
 * se guardan a un decimal y con un IEM bajo el 5 % de la regla sale como 4,8
 * en una zona y 5,1 en otra.
 */
function porcentajeComun(hs: readonly HipotesisDeZona[]): number | null {
  const pcts: number[] = [];
  for (const h of hs) {
    if (h.iemMedioObjetivo == null || h.iemFinalAnterior == null || !(h.iemFinalAnterior > 0.005)) return null;
    pcts.push((h.iemMedioObjetivo / h.iemFinalAnterior - 1) * 100);
  }
  if (pcts.length === 0) return null;
  const orden = [...pcts].sort((a, b) => a - b);
  if (orden[orden.length - 1] - orden[0] > 1) return null;
  return Math.round(orden.reduce((a, b) => a + b, 0) / orden.length);
}
