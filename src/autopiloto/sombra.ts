/* El COMPARADOR DE SOMBRA (diseño §4.1 y tanda 9).

   En modo sombra el autopiloto decide pero no escribe: cada decisión queda
   como `aiProposals` con `status: 'sombra'`. Esto la compara con lo que Dani
   hizo de verdad con ese atleta en los días siguientes —sus propuestas
   aprobadas, sus cambios a mano (`cambiosAtleta`), sus respuestas a las
   revisiones— y saca una tasa de coincidencia por tipo de decisión. Con eso
   se decide, tipo a tipo, qué pasa de sombra a aviso o a propuesta.

   Lógica pura. Lo que se compara, por tipo:
     · respuesta rutinaria → ¿Dani también contestó esa revisión?
     · ajustes de kcal      → ¿el objetivo de kcal que puso Dani queda a ±5 %?
     · el resto             → ¿hizo algo del mismo tipo (o de la misma área, a
                              mano) en la ventana? Y si las frases de «qué
                              cambia» se solapan, cuenta como coincidencia.
   «Parecido» = mismo tipo de acción sin poder afinar más; «distinto» = hizo
   otra cosa; «nada» = pasó la ventana sin que tocara eso; «pendiente» = la
   ventana aún no ha pasado. */
import type { AiProposal, Diet, QuestionnaireResponse, RespuestaRevisionProposalPayload } from '../types.js';
import type { CambioAtleta } from '../utils/cambiosAtleta.js';
import { objetivoDeDieta } from '../utils/macrosLegado.js';
import { ETIQUETA_DECISION, MINIMO_PARA_SUBIR, SIEMPRE_HUMANO, TASA_PARA_SUBIR, tipoDeDecision, type TipoDecision } from './politica.js';

export type VeredictoSombra = 'coincide' | 'parecido' | 'distinto' | 'nada' | 'pendiente';

export interface ComparacionSombra {
  proposalId: string;
  athleteId: string;
  tipo: TipoDecision;
  /** YYYY-MM-DD de la decisión en sombra. */
  fecha: string;
  resumen: string;
  veredicto: VeredictoSombra;
  detalle: string;
  /** Con qué se comparó, si hubo algo. */
  referencia?: { que: string; fecha: string };
}

export interface ReferenciaDeDani {
  /** Todas las propuestas (las de Dani son `approved`/`rejected` con política `proponer`, o `autor: 'coach'`). */
  propuestas: AiProposal[];
  cambios: CambioAtleta[];
  respuestas?: QuestionnaireResponse[];
}

export const VENTANA_DIAS = 7;
export const TOLERANCIA_KCAL = 0.05;

const TIPOS_KCAL = new Set<TipoDecision>(['ajuste_kcal_pequeno', 'ajuste_kcal_medio', 'ajuste_kcal_grande']);
const AREA_DE_TIPO: Partial<Record<TipoDecision, CambioAtleta['area']>> = {
  menu_semanal: 'nutricion', ajuste_kcal_pequeno: 'nutricion', ajuste_kcal_medio: 'nutricion', ajuste_kcal_grande: 'nutricion',
  progresion_programada: 'entreno', progresion_iem: 'entreno', cambio_ejercicio_molestia: 'entreno', descarga_adelantada: 'entreno',
  mesociclo: 'entreno', sesiones: 'entreno', publicar_bloque: 'entreno',
};

const dia = (iso: string) => iso.slice(0, 10);
const fechaDe = (p: AiProposal) => p.aplicadaEn ?? p.reviewedAt ?? p.createdAt;
const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${dia(b)}T12:00:00`) - Date.parse(`${dia(a)}T12:00:00`)) / 864e5);
const esDeDani = (p: AiProposal) => p.autor === 'coach' || ((p.status === 'approved' || p.status === 'rejected') && (p.politica ?? 'proponer') === 'proponer');
// Las cifras pierden el punto de millar antes de quitar signos: «2.300» y «2300» son lo mismo.
const normalizar = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/(\d)\.(\d)/g, '$1$2').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

function enVentana(desde: string, cuando: string): boolean {
  const d = diasEntre(desde, cuando);
  return d >= 0 && d <= VENTANA_DIAS;
}

/** Cuántas frases de «qué cambia» de la sombra aparecen (normalizadas) en las de Dani. */
export function solapeDeFrases(a: string[], b: string[]): number {
  const bN = b.map(normalizar).filter(Boolean);
  return a.map(normalizar).filter(Boolean).filter(x => bN.some(y => y === x || y.includes(x) || x.includes(y))).length;
}

function kcalDe(p: AiProposal): number | null {
  if (p.kind !== 'diet') return null;
  const k = objetivoDeDieta(p.payload as Omit<Diet, 'id'>).kcal;
  return Number.isFinite(k) && k > 0 ? k : null;
}
function kcalDeLineas(lineas: string[]): number | null {
  // La última cifra seguida de «kcal» de las frases del cambio: «objetivo 2.300 → 2.200 kcal».
  const todas = lineas.flatMap(l => [...l.matchAll(/(\d[\d.]*)\s*kcal/gi)].map(m => Number(m[1].replace(/\./g, ''))));
  const v = todas.at(-1);
  return v !== undefined && Number.isFinite(v) && v > 0 ? v : null;
}

export function compararUna(sombra: AiProposal, ref: ReferenciaDeDani, ahora: string): ComparacionSombra {
  const tipo = tipoDeDecision(sombra);
  const fecha = dia(fechaDe(sombra));
  const base = { proposalId: sombra.id, athleteId: sombra.athleteId, tipo, fecha, resumen: sombra.summary };
  const ventanaPasada = diasEntre(fecha, ahora) > VENTANA_DIAS;
  const sinReferencia = (): ComparacionSombra => ventanaPasada
    ? { ...base, veredicto: 'nada', detalle: `Dani no tocó nada de este tipo en ${VENTANA_DIAS} días.` }
    : { ...base, veredicto: 'pendiente', detalle: `Aún dentro de la ventana de ${VENTANA_DIAS} días.` };

  // 1 · Respuesta a la revisión: ¿Dani contestó la misma?
  if (sombra.kind === 'respuestaRevision') {
    const id = (sombra.payload as RespuestaRevisionProposalPayload).responseId;
    const r = (ref.respuestas ?? []).find(x => x.id === id);
    const rc = r?.respuestaCoach;
    if (rc?.texto && enVentana(fecha, rc.enviadaEn)) {
      return { ...base, veredicto: 'coincide', detalle: `Dani también contestó (${rc.texto.length} frente a ${(sombra.paraAtleta ?? '').length} caracteres).`, referencia: { que: 'Respuesta de Dani a la misma revisión', fecha: dia(rc.enviadaEn) } };
    }
    const otra = ref.propuestas.find(p => p.id !== sombra.id && p.kind === 'respuestaRevision' && esDeDani(p) && p.athleteId === sombra.athleteId && (p.payload as RespuestaRevisionProposalPayload).responseId === id && enVentana(fecha, fechaDe(p)));
    if (otra) return { ...base, veredicto: 'coincide', detalle: 'Dani aprobó una respuesta a la misma revisión.', referencia: { que: otra.summary, fecha: dia(fechaDe(otra)) } };
    return sinReferencia();
  }

  const mismasDeDani = ref.propuestas.filter(p => p.id !== sombra.id && p.athleteId === sombra.athleteId && esDeDani(p) && p.status === 'approved' && enVentana(fecha, fechaDe(p)));
  const cambiosDeDani = ref.cambios.filter(c => c.athleteId === sombra.athleteId && enVentana(fecha, c.at));

  // 2 · Kcal: el objetivo que puso Dani frente al de la sombra.
  if (TIPOS_KCAL.has(tipo)) {
    const objetivoSombra = kcalDe(sombra);
    const candidatos: { kcal: number; que: string; fecha: string }[] = [
      ...mismasDeDani.filter(p => p.kind === 'diet').map(p => ({ kcal: kcalDe(p), que: p.summary, fecha: dia(fechaDe(p)) })).filter((x): x is { kcal: number; que: string; fecha: string } => x.kcal !== null),
      ...cambiosDeDani.filter(c => c.area === 'nutricion').map(c => ({ kcal: kcalDeLineas(c.lineas), que: `${c.titulo}: ${c.lineas.join(' · ')}`, fecha: dia(c.at) })).filter((x): x is { kcal: number; que: string; fecha: string } => x.kcal !== null),
    ];
    const r = candidatos[0];
    if (!r) {
      const algoDeNutricion = cambiosDeDani.find(c => c.area === 'nutricion') ?? mismasDeDani.find(p => p.kind === 'diet' || p.kind === 'nutritionProgram');
      if (algoDeNutricion) return { ...base, veredicto: 'parecido', detalle: 'Dani tocó la nutrición, pero sin un objetivo de kcal que comparar.', referencia: 'titulo' in algoDeNutricion ? { que: algoDeNutricion.titulo, fecha: dia(algoDeNutricion.at) } : { que: algoDeNutricion.summary, fecha: dia(fechaDe(algoDeNutricion)) } };
      return sinReferencia();
    }
    if (objetivoSombra === null) return { ...base, veredicto: 'parecido', detalle: 'Dani ajustó las kcal; la sombra no traía objetivo comparable.', referencia: { que: r.que, fecha: r.fecha } };
    const desvio = Math.abs(r.kcal - objetivoSombra) / objetivoSombra;
    return desvio <= TOLERANCIA_KCAL
      ? { ...base, veredicto: 'coincide', detalle: `Sombra ${objetivoSombra} kcal, Dani ${r.kcal} kcal (${Math.round(desvio * 100)} %).`, referencia: { que: r.que, fecha: r.fecha } }
      : { ...base, veredicto: 'distinto', detalle: `Sombra ${objetivoSombra} kcal, Dani ${r.kcal} kcal (${Math.round(desvio * 100)} %).`, referencia: { que: r.que, fecha: r.fecha } };
  }

  // 3 · El resto: mismo tipo de propuesta aprobada por Dani, o un cambio a mano de la misma área.
  const mismoTipo = mismasDeDani.find(p => tipoDeDecision(p) === tipo);
  if (mismoTipo) {
    const solape = solapeDeFrases(sombra.cambios ?? [], mismoTipo.cambios ?? []);
    const total = (sombra.cambios ?? []).length;
    if (total > 0 && solape === total) return { ...base, veredicto: 'coincide', detalle: `Mismos ${total} cambios.`, referencia: { que: mismoTipo.summary, fecha: dia(fechaDe(mismoTipo)) } };
    if (total > 0 && solape === 0) return { ...base, veredicto: 'distinto', detalle: 'Dani hizo lo mismo de otra manera: ninguna frase en común.', referencia: { que: mismoTipo.summary, fecha: dia(fechaDe(mismoTipo)) } };
    return { ...base, veredicto: solape > 0 ? 'coincide' : 'parecido', detalle: total > 0 ? `${solape} de ${total} cambios en común.` : 'Dani aprobó una decisión del mismo tipo.', referencia: { que: mismoTipo.summary, fecha: dia(fechaDe(mismoTipo)) } };
  }
  const area = AREA_DE_TIPO[tipo];
  const aMano = area ? cambiosDeDani.find(c => c.area === area) : undefined;
  if (aMano) {
    const solape = solapeDeFrases(sombra.cambios ?? [], aMano.lineas);
    return { ...base, veredicto: solape > 0 ? 'coincide' : 'parecido', detalle: solape > 0 ? `${solape} frases en común con un cambio a mano.` : 'Dani tocó la misma área a mano.', referencia: { que: `${aMano.titulo}: ${aMano.lineas.slice(0, 2).join(' · ')}`, fecha: dia(aMano.at) } };
  }
  return sinReferencia();
}

export function compararSombra(sombras: AiProposal[], ref: ReferenciaDeDani, ahora: string): ComparacionSombra[] {
  return sombras.filter(p => p.status === 'sombra').map(p => compararUna(p, ref, ahora)).sort((a, b) => b.fecha.localeCompare(a.fecha));
}

/* ── El informe por tipo ──────────────────────────────────────────────────── */

export interface FilaDeInforme {
  tipo: TipoDecision;
  etiqueta: string;
  total: number;
  coincide: number;
  parecido: number;
  distinto: number;
  nada: number;
  pendiente: number;
  /** (coincide + parecido) / (total − pendiente); null sin decididas. */
  tasa: number | null;
  /** Lo que se puede proponer a Dani con estos números. */
  recomendacion: 'subir' | 'seguir' | 'pocos_datos' | 'siempre_humano';
}

export interface InformeDeSombra {
  filas: FilaDeInforme[];
  total: number;
  decididas: number;
  tasaGlobal: number | null;
  desde?: string;
  hasta?: string;
}

export function informeDeSombra(comparaciones: ComparacionSombra[]): InformeDeSombra {
  const porTipo = new Map<TipoDecision, FilaDeInforme>();
  for (const c of comparaciones) {
    const f = porTipo.get(c.tipo) ?? { tipo: c.tipo, etiqueta: ETIQUETA_DECISION[c.tipo], total: 0, coincide: 0, parecido: 0, distinto: 0, nada: 0, pendiente: 0, tasa: null, recomendacion: 'pocos_datos' as const };
    f.total++;
    f[c.veredicto]++;
    porTipo.set(c.tipo, f);
  }
  let decididas = 0; let aciertos = 0;
  const filas = [...porTipo.values()].map(f => {
    const dec = f.total - f.pendiente;
    decididas += dec; aciertos += f.coincide + f.parecido;
    const tasa = dec > 0 ? (f.coincide + f.parecido) / dec : null;
    const recomendacion: FilaDeInforme['recomendacion'] = SIEMPRE_HUMANO.has(f.tipo) ? 'siempre_humano'
      : dec < MINIMO_PARA_SUBIR ? 'pocos_datos'
        : (tasa ?? 0) >= TASA_PARA_SUBIR ? 'subir' : 'seguir';
    return { ...f, tasa, recomendacion };
  }).sort((a, b) => b.total - a.total || a.tipo.localeCompare(b.tipo));
  const fechas = comparaciones.map(c => c.fecha).sort();
  return {
    filas, total: comparaciones.length, decididas, tasaGlobal: decididas > 0 ? aciertos / decididas : null,
    ...(fechas.length ? { desde: fechas[0], hasta: fechas[fechas.length - 1] } : {}),
  };
}
