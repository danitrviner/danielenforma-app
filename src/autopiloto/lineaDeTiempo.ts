/* La LÍNEA DE TIEMPO de un atleta (diseño §5.2): lo que ha hecho el asistente
   con él, episodio a episodio, con las decisiones de cada uno (antes → después,
   política, resultado del esperado) y quién decidió al final. Se lee en la
   pestaña Revisión del coach, antes de «Lo que he cambiado».

   Es LÓGICA PURA sobre dos listas ya leídas: los `episodios` del atleta y sus
   `aiProposals`. Las propuestas que no vienen de ningún episodio (las del chat,
   las del latido) también entran, cada una como su propia entrada, para que la
   línea cuente todo lo que se le tocó y no solo lo del autopiloto.

   También vive aquí lo de «Plan inicial vs ahora»: las propuestas del episodio
   de alta comparadas con lo que el atleta tiene hoy (`calcularDerivas`), y el
   AUTOR de cada paso del Setup, que es la misma pregunta («¿esto lo cerró Dani
   o la máquina?») vista desde la checklist. */
import type { AiProposal, AiProposalKind, AutorPropuesta, Diet, Mesocycle, PoliticaPropuesta } from '../types.js';
import type { SetupItem } from '../utils/clientSetup.js';
import { calcularDerivas, type Deriva } from '../utils/derivaPropuestas.js';
import { isoLocal } from '../utils/trainingWeek.js';
import type { Episodio, EstadoEpisodio, TipoEpisodio } from './episodios.js';

export const ETIQUETA_EPISODIO: Record<TipoEpisodio, string> = {
  alta_completada: 'alta', semana_nueva: 'semana', cuestionario_recibido: 'cuestionario', revision: 'revisión',
  fin_de_bloque: 'fin de bloque', renovacion: 'renovación', dolor: 'molestia', perdidas: 'sesiones perdidas',
  peso_sin_registrar: 'sin pesarse', desvio_peso: 'desvío de peso', desvio_adherencia: 'adherencia baja',
  nota_libre: 'nota del atleta', bienestar: 'bienestar',
};

/** Lo que pasó al final con una decisión, en una palabra para la fila. */
export type DesenlaceDecision =
  | 'automatico' | 'aviso' | 'aprobada' | 'editada' | 'rechazada' | 'deshecha' | 'pendiente' | 'sombra' | 'caducada';

export interface DecisionDeLinea {
  proposalId: string;
  summary: string;
  kind: AiProposalKind;
  cambios: string[];
  autor: AutorPropuesta;
  politica: PoliticaPropuesta;
  desenlace: DesenlaceDecision;
  /** ✓ cumplió, ✗ no cumplió, null sin comprobar (o comprobado sin saber). */
  esperado: boolean | null;
  /** La nota del cierre del esperado o lo que Dani escribió al aprobar. */
  nota?: string;
  paraAtleta?: string;
}

export interface EntradaDeLinea {
  id: string;
  /** YYYY-MM-DD local del hecho (el disparador del episodio o la fecha de la propuesta). */
  fecha: string;
  /** Semana del plan (1 = la del inicio) si se conoce el inicio. */
  semana?: number;
  tipo: TipoEpisodio | 'chat' | 'latido';
  etiqueta: string;
  estado: EstadoEpisodio | 'decidido';
  alertas: string[];
  paraDani: string;
  decisiones: DecisionDeLinea[];
  costeUsd?: number;
}

export interface LineaDeTiempo {
  entradas: EntradaDeLinea[];
  episodios: number;
  /** Cuántas decisiones acabaron en cada desenlace. */
  porDesenlace: Partial<Record<DesenlaceDecision, number>>;
  /** Propuestas con esperado comprobado: cuántas cumplieron. */
  esperado: { comprobadas: number; cumplidas: number };
  derivasDelAlta: Deriva[];
}

export function desenlaceDe(p: AiProposal, editadas?: Set<string>): DesenlaceDecision {
  switch (p.status) {
    case 'aplicada': return p.politica === 'aviso' ? 'aviso' : 'automatico';
    case 'approved': return editadas?.has(p.id) || !!p.expediente?.notaAlAprobar ? 'editada' : 'aprobada';
    case 'rejected': return 'rechazada';
    case 'deshecha': return 'deshecha';
    case 'sombra': return 'sombra';
    case 'caducada': return 'caducada';
    default: return 'pendiente';
  }
}

export function decisionDeLinea(p: AiProposal, editadas?: Set<string>): DecisionDeLinea {
  const nota = p.resultado?.nota || p.expediente?.notaAlAprobar || undefined;
  return {
    proposalId: p.id, summary: p.summary, kind: p.kind, cambios: p.cambios ?? [],
    autor: p.autor ?? 'asistente', politica: p.politica ?? 'proponer',
    desenlace: desenlaceDe(p, editadas), esperado: p.resultado?.cumplioEsperado ?? null,
    ...(nota ? { nota } : {}), ...(p.paraAtleta ? { paraAtleta: p.paraAtleta } : {}),
  };
}

const fechaDePropuesta = (p: AiProposal) => (p.aplicadaEn ?? p.reviewedAt ?? p.createdAt).slice(0, 10);

/** Semana del plan a la que cae una fecha (1 = la semana que empieza en `inicio`). */
export function semanaDelPlan(fecha: string, inicio: string | undefined): number | undefined {
  if (!inicio) return undefined;
  const dias = Math.round((Date.parse(`${fecha}T12:00:00`) - Date.parse(`${inicio}T12:00:00`)) / 864e5);
  if (!Number.isFinite(dias) || dias < 0) return undefined;
  return Math.floor(dias / 7) + 1;
}

export interface OpcionesDeLinea {
  /** Inicio del plan contratado o del primer mesociclo: numera las semanas. */
  inicioPlan?: string;
  /** Ids de propuestas que Dani editó antes de aprobar (si se saben aparte de la nota). */
  editadas?: Set<string>;
  /** Para «Plan inicial vs ahora». Sin ellos no se calculan derivas. */
  mesociclos?: Mesocycle[];
  dietas?: Diet[];
}

/** Lo más reciente primero. Una entrada por episodio; las propuestas sueltas,
 *  una entrada cada una (chat) o agrupadas por día (latido). */
export function construirLineaDeTiempo(episodios: Episodio[], propuestas: AiProposal[], opts: OpcionesDeLinea = {}): LineaDeTiempo {
  const porId = new Map(propuestas.map(p => [p.id, p]));
  const usadas = new Set<string>();
  const entradas: EntradaDeLinea[] = [];

  for (const ep of episodios) {
    const ids = [...new Set([...ep.propuestas, ...propuestas.filter(p => p.episodioId === ep.id).map(p => p.id)])];
    const decisiones = ids.map(id => porId.get(id)).filter((p): p is AiProposal => !!p).map(p => { usadas.add(p.id); return decisionDeLinea(p, opts.editadas); });
    const fecha = (ep.disparador.fecha || ep.creadoEn).slice(0, 10);
    entradas.push({
      id: ep.id, fecha, tipo: ep.tipo, etiqueta: ETIQUETA_EPISODIO[ep.tipo] ?? ep.tipo, estado: ep.estado,
      alertas: ep.alertas ?? [], paraDani: ep.paraDani, decisiones, costeUsd: ep.coste?.usd,
      ...(semanaDelPlan(fecha, opts.inicioPlan) !== undefined ? { semana: semanaDelPlan(fecha, opts.inicioPlan) } : {}),
    });
  }

  const sueltas = propuestas.filter(p => !usadas.has(p.id) && !p.episodioId);
  const latidoPorDia = new Map<string, AiProposal[]>();
  for (const p of sueltas) {
    if (p.autor === 'latido') {
      const dia = fechaDePropuesta(p);
      latidoPorDia.set(dia, [...(latidoPorDia.get(dia) ?? []), p]);
      continue;
    }
    const fecha = fechaDePropuesta(p);
    entradas.push({
      id: `p_${p.id}`, fecha, tipo: 'chat', etiqueta: p.autor === 'coach' ? 'tú' : 'chat', estado: 'decidido', alertas: [],
      paraDani: '', decisiones: [decisionDeLinea(p, opts.editadas)],
      ...(semanaDelPlan(fecha, opts.inicioPlan) !== undefined ? { semana: semanaDelPlan(fecha, opts.inicioPlan) } : {}),
    });
  }
  for (const [fecha, lista] of latidoPorDia) {
    entradas.push({
      id: `latido_${fecha}`, fecha, tipo: 'latido', etiqueta: 'latido', estado: 'decidido', alertas: [], paraDani: '',
      decisiones: lista.map(p => decisionDeLinea(p, opts.editadas)),
      ...(semanaDelPlan(fecha, opts.inicioPlan) !== undefined ? { semana: semanaDelPlan(fecha, opts.inicioPlan) } : {}),
    });
  }

  entradas.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id.localeCompare(a.id));

  const porDesenlace: Partial<Record<DesenlaceDecision, number>> = {};
  let comprobadas = 0; let cumplidas = 0;
  for (const e of entradas) for (const d of e.decisiones) {
    porDesenlace[d.desenlace] = (porDesenlace[d.desenlace] ?? 0) + 1;
    if (d.esperado !== null) { comprobadas++; if (d.esperado) cumplidas++; }
  }

  const alta = episodios.find(e => e.tipo === 'alta_completada');
  const delAlta = alta ? propuestas.filter(p => p.episodioId === alta.id || alta.propuestas.includes(p.id)) : [];
  const derivasDelAlta = opts.mesociclos && opts.dietas && delAlta.length > 0
    ? calcularDerivas(delAlta, opts.mesociclos, opts.dietas)
    : [];

  return { entradas, episodios: episodios.length, porDesenlace, esperado: { comprobadas, cumplidas }, derivasDelAlta };
}

/* ── Quién cerró cada paso del Setup ──────────────────────────────────────── */

/** Qué propuestas dejan hecho cada ítem comprobable de la checklist. */
export const KINDS_POR_ITEM: Record<string, AiProposalKind[]> = {
  alta_cuestionario: ['setupConfig'],
  prog_mesociclo: ['mesocycle'],
  prog_entrenos_semana: ['publishBlock'],
  prog_sesiones: ['workoutDays', 'workoutTemplate'],
  prog_dietas: ['diet'],
  prog_calendario_dietas: ['setupConfig'],
  prog_pasos: ['setupConfig'],
  prog_cardio: ['setupConfig'],
  prog_fases_plan: ['nutritionProgram', 'periodizationBlock'],
  prog_periodizacion: ['nutritionProgram', 'periodizationBlock'],
  prog_escalera: ['levelLadder'],
  prog_retos_config: ['roadmap'],
  prog_dias_senalados: ['roadmap', 'specialDay'],
  prog_ficha_viva: ['dossier'],
  w1_reto_semana: ['weeklyChallenge'],
};

export interface AutorDePaso {
  autor: AutorPropuesta;
  politica: PoliticaPropuesta;
  fecha: string; // ISO
  /** Dani la aprobó pero la tocó antes. */
  editada: boolean;
  proposalId: string;
}

/** Quién dejó hecho un paso, mirando la última propuesta aplicada o aprobada
 *  de los tipos que ese paso comprueba. `null` = no hay rastro de propuesta:
 *  lo hizo Dani a mano en el editor (o el paso sigue sin hacer). */
export function autorDelPaso(items: Pick<SetupItem, 'id' | 'status'>[], propuestas: AiProposal[]): AutorDePaso | null {
  const kinds = new Set(items.filter(i => i.status === 'done').flatMap(i => KINDS_POR_ITEM[i.id] ?? []));
  if (kinds.size === 0) return null;
  const candidatas = propuestas
    .filter(p => kinds.has(p.kind) && (p.status === 'approved' || p.status === 'aplicada'))
    .sort((a, b) => (b.aplicadaEn ?? b.reviewedAt ?? b.createdAt).localeCompare(a.aplicadaEn ?? a.reviewedAt ?? a.createdAt));
  const p = candidatas[0];
  if (!p) return null;
  return {
    autor: p.autor ?? 'asistente', politica: p.politica ?? 'proponer', fecha: p.aplicadaEn ?? p.reviewedAt ?? p.createdAt,
    editada: !!p.expediente?.notaAlAprobar, proposalId: p.id,
  };
}

export function textoDeAutor(a: AutorDePaso): string {
  const dia = isoLocal(new Date(a.fecha));
  if (a.autor === 'coach') return `Lo hiciste tú · ${dia}`;
  if (a.autor === 'latido') return `Lo hizo el latido · ${dia}`;
  if (a.politica === 'automatico') return `El asistente, automático · ${dia}`;
  if (a.politica === 'aviso') return `El asistente, con aviso · ${dia}`;
  return a.editada ? `Propuso el asistente, lo aprobaste con cambios · ${dia}` : `Propuso el asistente, lo aprobaste · ${dia}`;
}
