import type { Periodicidad, TipoDeServicio } from '../types';

/* ═══════════════════════════════════════════════════════════════════════════
   Catálogo de servicios (R-01)

   Cerrado a propósito (decisión de Dani): trimestral, semestral, anual y
   «otro». Un servicio mensual o una sesión suelta van a «otro». El nombre de
   los tres primeros se DERIVA del tipo: nadie lo escribe, así que no puede
   haber dos formas de llamar a lo mismo.

   `clasificarNombre` sirve para los servicios que ya existían con el nombre
   escrito a mano (R-02). Hay una copia idéntica en
   `scripts/_lib/clasificarServicio.mjs` (la usa el script de migración) y un
   test que comprueba que las dos dan lo mismo.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface EntradaDelCatalogo {
  id: TipoDeServicio;
  /** Cómo se llama en pantalla. */
  etiqueta: string;
  /** Nombre que se guarda en el servicio. `null` en «otro»: lo escribe el coach. */
  nombre: string | null;
  /** Duración en meses, para sugerir el fin. `null` en «otro». */
  meses: number | null;
  /** `periodicidad` que se guarda para que las pantallas antiguas sigan cuadrando. */
  periodicidad: Periodicidad | null;
}

export const CATALOGO_SERVICIOS: EntradaDelCatalogo[] = [
  { id: 'trimestral', etiqueta: 'Trimestral', nombre: 'Asesoría trimestral', meses: 3,  periodicidad: 'trimestral' },
  { id: 'semestral',  etiqueta: 'Semestral',  nombre: 'Asesoría semestral',  meses: 6,  periodicidad: 'semestral' },
  { id: 'anual',      etiqueta: 'Anual',      nombre: 'Asesoría anual',      meses: 12, periodicidad: 'anual' },
  { id: 'otro',       etiqueta: 'Otro',       nombre: null,                  meses: null, periodicidad: null },
];

export const ETIQUETA_SIN_CLASIFICAR = 'Sin clasificar';

export function entradaDelCatalogo(id: TipoDeServicio): EntradaDelCatalogo {
  return CATALOGO_SERVICIOS.find(e => e.id === id) as EntradaDelCatalogo;
}

/** Etiqueta para agrupar y pintar; `undefined` = aún sin clasificar. */
export function etiquetaDeTipoServicio(t: TipoDeServicio | undefined): string {
  return t ? entradaDelCatalogo(t).etiqueta : ETIQUETA_SIN_CLASIFICAR;
}

/* ── Clasificar un nombre escrito a mano ──────────────────────────────────── */

export interface Clasificacion {
  tipo: TipoDeServicio;
  /** `segura`: una sola duración reconocida. `dudosa`: ninguna, o varias que chocan → va a «otro» y se revisa. */
  confianza: 'segura' | 'dudosa';
}

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * Reconoce la duración en el nombre: «3 meses», «trimestre», «trimestral»,
 * «90 días», «semestral», «6 meses», «anual», «1 año», «12 meses»…
 * Las semanas (p. ej. «12 semanas») NO se traducen: es justo la duda que el CSV
 * le pasa a Dani para que decida a qué tipo corresponde.
 * Si no reconoce ninguna, o reconoce más de una, devuelve «otro» + dudosa: no
 * se adivina en silencio (una cifra de negocio equivocada es peor que una que
 * falta).
 */
export function clasificarNombre(nombre: string | undefined): Clasificacion {
  const n = sinTildes(nombre ?? '');
  const encontrados = new Set<TipoDeServicio>();
  if (/\btrimest\w*|\b3\s*(meses|mes|m)\b|\b90\s*dias\b/.test(n)) encontrados.add('trimestral');
  if (/\bsemest\w*|\b6\s*(meses|mes|m)\b|\b180\s*dias\b|\b26\s*semanas\b/.test(n)) encontrados.add('semestral');
  if (/\banual\w*|\b1\s*ano\b|\bun\s*ano\b|\b12\s*(meses|mes|m)\b|\b365\s*dias\b|\b52\s*semanas\b/.test(n)) encontrados.add('anual');
  if (encontrados.size === 1) return { tipo: [...encontrados][0], confianza: 'segura' };
  return { tipo: 'otro', confianza: 'dudosa' };
}
