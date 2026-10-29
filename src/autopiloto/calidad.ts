/* CALIDAD — «la auditoría de 5 minutos» (diseño §5.4).

   Cada semana, cinco decisiones automáticas al azar entre las que el asistente
   aplicó solo (`aplicada` con `politica: 'automatico'`), con el expediente, los
   datos del motor que usó y el texto que llegó al atleta. Dani marca «bien»,
   «mal» o «no vuelvas». El azar es DETERMINISTA por semana: la muestra del
   lunes es la misma el martes, para que no se escapen cinco distintas cada
   vez que abre la pantalla.

   «No vuelvas» hace dos cosas, las dos en lo que ya existe: baja el nivel de
   ese TIPO de decisión a `proponer` en la política y deja una instrucción fija
   para el asistente (las mismas que lee en todos los episodios). Eso es lo que
   el diseño llama «baja el nivel + instrucción fija».

   Aquí también están los FILTROS de la pantalla de Propuestas, que hasta ahora
   solo enseñaba las pendientes. */
import type { AiProposal } from '../types.js';
import { type NivelAutonomia, type PoliticaAutopiloto, type TipoDecision, ETIQUETA_DECISION } from './politica.js';

export type Veredicto = 'bien' | 'mal' | 'no_vuelvas';

export interface VeredictoCalidad {
  veredicto: Veredicto;
  en: string; // ISO
  nota?: string;
}

export const MUESTRA_SEMANAL = 5;

/** YYYY-MM-DD del lunes de la semana (local) en la que cae `fecha`. */
export function lunesDeLaSemana(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00`);
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Entero pseudoaleatorio estable a partir de un texto (FNV-1a de 32 bits). */
export function semilla(texto: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) { h ^= texto.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/** Las automáticas de la semana anterior a `hoy` (de lunes a domingo). */
export function automaticasDeLaSemana(propuestas: AiProposal[], hoy: string): { desde: string; hasta: string; lista: AiProposal[] } {
  const lunes = lunesDeLaSemana(hoy);
  const d = new Date(`${lunes}T12:00:00`); d.setDate(d.getDate() - 7);
  const desde = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const hasta = lunes; // exclusivo
  const lista = propuestas.filter(p =>
    p.status === 'aplicada' && p.politica === 'automatico' && !!p.aplicadaEn
    && p.aplicadaEn.slice(0, 10) >= desde && p.aplicadaEn.slice(0, 10) < hasta);
  return { desde, hasta, lista };
}

/** La muestra de la semana: hasta `n` decisiones, en un orden estable que
 *  depende solo del lunes y de los ids. Las ya juzgadas se quedan (para ver qué
 *  se dijo), pero cuentan dentro del mismo cupo. */
export function muestraDeCalidad(propuestas: AiProposal[], hoy: string, n = MUESTRA_SEMANAL): { semana: string; muestra: AiProposal[]; total: number } {
  const { desde, lista } = automaticasDeLaSemana(propuestas, hoy);
  const ordenadas = [...lista].sort((a, b) => semilla(`${desde}|${a.id}`) - semilla(`${desde}|${b.id}`) || a.id.localeCompare(b.id));
  return { semana: desde, muestra: ordenadas.slice(0, n), total: lista.length };
}

export interface ResumenCalidad {
  juzgadas: number;
  bien: number;
  mal: number;
  noVuelvas: number;
  /** De las juzgadas, qué parte estuvo bien (0-1); null sin datos. */
  tasa: number | null;
}

export function resumenCalidad(propuestas: AiProposal[]): ResumenCalidad {
  const r: ResumenCalidad = { juzgadas: 0, bien: 0, mal: 0, noVuelvas: 0, tasa: null };
  for (const p of propuestas) {
    const v = p.calidad?.veredicto;
    if (!v) continue;
    r.juzgadas++;
    if (v === 'bien') r.bien++; else if (v === 'mal') r.mal++; else r.noVuelvas++;
  }
  r.tasa = r.juzgadas ? r.bien / r.juzgadas : null;
  return r;
}

/** Lo que cambia en la política con un «no vuelvas» sobre una decisión de un
 *  tipo: ese tipo baja a `proponer`. Devuelve la política nueva (sin tocar la
 *  recibida) y si de verdad cambió algo. */
export function bajarPorNoVuelvas(politica: PoliticaAutopiloto, tipo: TipoDecision): { politica: PoliticaAutopiloto; cambio: boolean } {
  const actual: NivelAutonomia | undefined = politica.nivelPorTipo[tipo];
  if (actual === 'proponer') return { politica, cambio: false };
  return { politica: { ...politica, nivelPorTipo: { ...politica.nivelPorTipo, [tipo]: 'proponer' } }, cambio: true };
}

/** La instrucción fija que se añade al texto de instrucciones del coach. Una
 *  línea, con fecha, para que el asistente la lea en todos los episodios. */
export function instruccionDeNoVuelvas(p: Pick<AiProposal, 'summary' | 'athleteId'>, tipo: TipoDecision, fecha: string, nota?: string): string {
  const motivo = nota?.trim() ? ` Motivo: ${nota.trim()}` : '';
  return `- [${fecha.slice(0, 10)}] NO VUELVAS a decidir solo «${p.summary}» (${ETIQUETA_DECISION[tipo].toLowerCase()}, ${p.athleteId}): propónmelo siempre.${motivo}`;
}

export function anadirInstruccionFija(texto: string, linea: string): string {
  if (texto.includes(linea)) return texto;
  const base = texto.trimEnd();
  return base ? `${base}\n${linea}` : linea;
}

/* ── Filtros de la pantalla de Propuestas ───────────────────────────────── */

export type FiltroPropuestas = 'pendientes' | 'aplicadas' | 'rechazadas' | 'sombra';

export const FILTROS_PROPUESTAS: { id: FiltroPropuestas; etiqueta: string; ayuda: string }[] = [
  { id: 'pendientes', etiqueta: 'Pendientes', ayuda: 'Sin decidir: nada de esto lo ve el atleta hasta que lo apruebes.' },
  { id: 'aplicadas', etiqueta: 'Aplicadas', ayuda: 'Lo que ya está en su plan, lo aprobaras tú o lo aplicara el asistente; con deshacer si guardó el estado de antes.' },
  { id: 'rechazadas', etiqueta: 'Rechazadas', ayuda: 'Lo que dijiste que no, con el motivo. Y lo que se deshizo o caducó.' },
  { id: 'sombra', etiqueta: 'Sombra', ayuda: 'Lo que el asistente habría hecho en modo sombra, para compararlo con lo que hiciste tú.' },
];

export function filtrarPropuestas(propuestas: AiProposal[], filtro: FiltroPropuestas): AiProposal[] {
  switch (filtro) {
    case 'pendientes': return propuestas.filter(p => p.status === 'proposed');
    case 'aplicadas': return propuestas.filter(p => p.status === 'approved' || p.status === 'aplicada');
    case 'rechazadas': return propuestas.filter(p => p.status === 'rejected' || p.status === 'deshecha' || p.status === 'caducada');
    case 'sombra': return propuestas.filter(p => p.status === 'sombra');
  }
}

/** Los estados de Firestore que hay que pedir para cada filtro (sin índice compuesto: `in` sobre status). */
export const ESTADOS_POR_FILTRO: Record<FiltroPropuestas, AiProposal['status'][]> = {
  pendientes: ['proposed'],
  aplicadas: ['approved', 'aplicada'],
  rechazadas: ['rejected', 'deshecha', 'caducada'],
  sombra: ['sombra'],
};
