/* ═══════════════════════════════════════════════════════════════════════════
   POLÍTICA DE AUTONOMÍA — qué decide la máquina sola, qué avisa y qué espera.

   Tres niveles por tipo de decisión (diseño §4): `automatico` (se aplica y
   sale en «Hecho hoy» con deshacer), `aviso` (se aplica y Dani tiene 24 h
   para deshacerla sin más) y `proponer` (espera aprobación, lo de siempre).
   Y dos modos por encima, que son por los que se arranca:
     · `sombra`: el autopiloto decide y escribe la propuesta como `sombra`;
       nada se aplica, nada aparece pendiente; se compara con lo que hizo Dani.
     · `rodaje`: todo lo que decide el modelo se PROPONE (decisión de Dani del
       28-10: «quiero poder revisar todo lo que va haciendo»). Lo determinista
       del latido sigue automático con su huella.
     · `politica`: manda la tabla, por tipo, con la posibilidad de un nivel
       distinto por atleta.

   Lo que NUNCA es automático está en código, no en la tabla: mesociclo nuevo,
   sesiones, publicar bloque, kcal de más del 10 %, lo clínico, la renovación.
   Aunque Dani ponga «automático» en la pantalla, aquí baja a «aviso» o
   «proponer».

   La subida de nivel no la hace la máquina: `evaluarSubida` PROPONE, con los
   números (8 decisiones de ese tipo, ≥ 7 aprobadas sin tocar y sin deshacer), y
   Dani la acepta en la pantalla de Política.
   ═══════════════════════════════════════════════════════════════════════════ */
import type { AiProposal, Diet, PoliticaPropuesta } from '../types.js';
import { objetivoDeDieta } from './../utils/macrosLegado.js';

export type NivelAutonomia = 'automatico' | 'aviso' | 'proponer';
export type ModoAutopiloto = 'sombra' | 'rodaje' | 'politica';

export type TipoDecision =
  | 'respuesta_rutinaria' | 'menu_semanal' | 'reto' | 'progresion_programada' | 'progresion_iem'
  | 'ajuste_kcal_pequeno' | 'ajuste_kcal_medio' | 'ajuste_kcal_grande'
  | 'cambio_ejercicio_molestia' | 'descarga_adelantada' | 'mensaje_atleta' | 'ficha'
  | 'mesociclo' | 'sesiones' | 'publicar_bloque' | 'setup' | 'roadmap'
  | 'clinico' | 'renovacion';

export const ETIQUETA_DECISION: Record<TipoDecision, string> = {
  respuesta_rutinaria: 'Respuesta rutinaria a la revisión',
  menu_semanal: 'Menú de la semana',
  reto: 'Reto de la semana',
  progresion_programada: 'Progresión ya programada (+1 serie, RIR, descarga)',
  progresion_iem: 'Progresión IEM de la semana (CDG)',
  ajuste_kcal_pequeno: 'Ajuste de kcal hasta el 5 %',
  ajuste_kcal_medio: 'Ajuste de kcal del 5 al 10 %',
  ajuste_kcal_grande: 'Ajuste de kcal de más del 10 % o cambio de fase',
  cambio_ejercicio_molestia: 'Cambiar un ejercicio por una molestia leve',
  descarga_adelantada: 'Descarga adelantada o semana de mantenimiento',
  mensaje_atleta: 'Mensaje al atleta (qué cambia esta semana, perdidas…)',
  ficha: 'Ficha viva (objetivos, esperado, foco)',
  mesociclo: 'Mesociclo o reparto nuevo',
  sesiones: 'Sesiones del bloque',
  publicar_bloque: 'Publicar el bloque',
  setup: 'Configuración del plan (fechas, pasos, calendario de dietas, cuestionario, cardio)',
  roadmap: 'Road map: escalera, hitos, días señalados',
  clinico: 'Cualquier cosa con lesión, dolor persistente, embarazo, patología',
  renovacion: 'Renovación, baja, dinero',
};

/** La tabla de destino (diseño §4.2): a dónde llega cada tipo cuando sale del rodaje. */
export const NIVEL_DESTINO: Record<TipoDecision, NivelAutonomia> = {
  respuesta_rutinaria: 'automatico', menu_semanal: 'automatico', reto: 'automatico', progresion_programada: 'automatico',
  ajuste_kcal_pequeno: 'automatico',
  progresion_iem: 'aviso', ajuste_kcal_medio: 'aviso', cambio_ejercicio_molestia: 'aviso', descarga_adelantada: 'aviso',
  mensaje_atleta: 'aviso', ficha: 'aviso',
  ajuste_kcal_grande: 'proponer', mesociclo: 'proponer', sesiones: 'proponer', publicar_bloque: 'proponer',
  setup: 'proponer', roadmap: 'proponer', clinico: 'proponer', renovacion: 'proponer',
};

/** Lo que nunca se aplica solo, diga lo que diga la tabla. */
export const NUNCA_AUTOMATICO = new Set<TipoDecision>([
  'ajuste_kcal_grande', 'mesociclo', 'sesiones', 'publicar_bloque', 'setup', 'clinico', 'renovacion',
]);
/** Lo que ni siquiera se aplica con aviso: siempre lo decide una persona. */
export const SIEMPRE_HUMANO = new Set<TipoDecision>(['clinico', 'renovacion']);

export interface PoliticaAutopiloto {
  modo: ModoAutopiloto;
  /** Nivel por tipo cuando `modo === 'politica'`; lo que falte usa NIVEL_DESTINO. */
  nivelPorTipo: Partial<Record<TipoDecision, NivelAutonomia>>;
  presupuesto: { mesUsd: number; diaUsd: number };
  /** Menú semanal: borrador que publica Dani, borrador que se publica solo a las 24 h, o publicar directo (D3, Dani 29-10: «se publicarían solos»). */
  menuAutomatico: 'borrador' | 'borrador24h' | 'publicar';
  horasAviso: number;
  updatedAt?: string;
}

export const POLITICA_POR_DEFECTO: PoliticaAutopiloto = {
  modo: 'sombra',
  nivelPorTipo: {},
  presupuesto: { mesUsd: 50, diaUsd: 3 },
  menuAutomatico: 'publicar',
  horasAviso: 24,
};

export function normalizarPolitica(raw: unknown): PoliticaAutopiloto {
  const r = (raw ?? {}) as Partial<PoliticaAutopiloto>;
  const modo: ModoAutopiloto = r.modo === 'rodaje' || r.modo === 'politica' ? r.modo : 'sombra';
  const nivelPorTipo: Partial<Record<TipoDecision, NivelAutonomia>> = {};
  for (const [k, v] of Object.entries(r.nivelPorTipo ?? {})) {
    if (k in NIVEL_DESTINO && (v === 'automatico' || v === 'aviso' || v === 'proponer')) nivelPorTipo[k as TipoDecision] = v;
  }
  const n = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : d);
  return {
    modo,
    nivelPorTipo,
    presupuesto: { mesUsd: n(r.presupuesto?.mesUsd, 50), diaUsd: n(r.presupuesto?.diaUsd, 3) },
    menuAutomatico: r.menuAutomatico === 'borrador' || r.menuAutomatico === 'borrador24h' ? r.menuAutomatico : 'publicar',
    horasAviso: n(r.horasAviso, 24) || 24,
    ...(typeof r.updatedAt === 'string' ? { updatedAt: r.updatedAt } : {}),
  };
}

/** El nivel de la tabla para un tipo, con el nivel del atleta por encima si lo hay. */
export function nivelDe(politica: PoliticaAutopiloto, tipo: TipoDecision, delAtleta?: Partial<Record<TipoDecision, NivelAutonomia>>): NivelAutonomia {
  const nivel = delAtleta?.[tipo] ?? politica.nivelPorTipo[tipo] ?? NIVEL_DESTINO[tipo];
  if (SIEMPRE_HUMANO.has(tipo)) return 'proponer';
  if (NUNCA_AUTOMATICO.has(tipo) && nivel === 'automatico') return 'aviso';
  return nivel;
}

/** Con qué política corre una decisión AHORA, según el modo del autopiloto. */
export function politicaEfectiva(
  politica: PoliticaAutopiloto, tipo: TipoDecision, delAtleta?: Partial<Record<TipoDecision, NivelAutonomia>>,
): PoliticaPropuesta {
  if (politica.modo === 'sombra') return 'sombra';
  if (politica.modo === 'rodaje') return 'proponer';
  return nivelDe(politica, tipo, delAtleta);
}

/** La política con la que se encola un EPISODIO (antes de saber qué decidirá). */
export function politicaDeEpisodio(politica: PoliticaAutopiloto): PoliticaPropuesta {
  return politica.modo === 'sombra' ? 'sombra' : politica.modo === 'rodaje' ? 'proponer' : 'automatico';
}

/** A qué tipo de decisión pertenece una propuesta, con el contexto que la
 *  tool no tiene (alertas clínicas del episodio, la dieta que ajusta). */
export function tipoDeDecision(p: Pick<AiProposal, 'kind' | 'payload' | 'baseEntityId'>, ctx: { alertas?: string[]; dietaBase?: Pick<Diet, 'objetivo' | 'budget'> | null } = {}): TipoDecision {
  if (ctx.alertas?.length) return 'clinico';
  switch (p.kind) {
    case 'respuestaRevision':
    case 'checkinFeedback': return 'respuesta_rutinaria';
    case 'weeklyChallenge': return 'reto';
    case 'dossier': return 'ficha';
    case 'mesocycle':
    case 'periodizationBlock':
    case 'mesocycleTemplate':
    case 'workoutTemplate': return 'mesociclo';
    case 'workoutDays': return 'sesiones';
    case 'publishBlock': return 'publicar_bloque';
    case 'setupConfig': return 'setup';
    case 'roadmap':
    case 'levelLadder':
    case 'specialDay': return 'roadmap';
    case 'nutritionProgram': return 'ajuste_kcal_grande';
    case 'weekPlan': {
      const plan = p.payload as { semanasDescarga?: number[]; cambios?: unknown[]; nutricion?: { semanasMantenimiento?: number[] }; origenIem?: boolean };
      if (plan.origenIem) return 'progresion_iem';
      if (plan.semanasDescarga?.length || plan.nutricion?.semanasMantenimiento?.length) return 'descarga_adelantada';
      if (plan.cambios?.length) return 'cambio_ejercicio_molestia';
      return 'progresion_programada';
    }
    case 'diet': {
      if (!p.baseEntityId || !ctx.dietaBase) return 'ajuste_kcal_grande';
      const antes = objetivoDeDieta(ctx.dietaBase).kcal;
      const despues = objetivoDeDieta(p.payload as Pick<Diet, 'objetivo' | 'budget'>).kcal;
      if (!antes) return 'ajuste_kcal_grande';
      const pct = Math.abs(despues - antes) / antes;
      return pct <= 0.05 ? 'ajuste_kcal_pequeno' : pct <= 0.10 ? 'ajuste_kcal_medio' : 'ajuste_kcal_grande';
    }
    case 'mensajeAtleta': return 'mensaje_atleta';
    case 'latido': return 'progresion_programada';
  }
}

// ── Rodaje: medir y proponer la subida ──────────────────────────────────────

export interface EstadisticaDeTipo {
  tipo: TipoDecision;
  /** Propuestas de ese tipo que Dani decidió (aprobó o rechazó) o que se aplicaron. */
  decididas: number;
  aprobadasSinCambios: number;
  editadas: number;
  rechazadas: number;
  deshechas: number;
  /** Aplicadas con aviso que pasaron sin deshacer. */
  avisosSinDeshacer: number;
}

export const MINIMO_PARA_SUBIR = 8;
export const TASA_PARA_SUBIR = 7 / 8;

/** La subida que se puede proponer a Dani, o null si todavía no hay datos. */
export function evaluarSubida(nivelActual: NivelAutonomia, e: EstadisticaDeTipo): { a: NivelAutonomia; motivo: string } | null {
  if (SIEMPRE_HUMANO.has(e.tipo)) return null;
  if (nivelActual === 'proponer') {
    if (e.decididas < MINIMO_PARA_SUBIR) return null;
    const tasa = e.aprobadasSinCambios / e.decididas;
    if (tasa < TASA_PARA_SUBIR) return null;
    return { a: 'aviso', motivo: `${e.aprobadasSinCambios} de ${e.decididas} aprobadas sin tocar: puede aplicarse con aviso de 24 h.` };
  }
  if (nivelActual === 'aviso' && !NUNCA_AUTOMATICO.has(e.tipo)) {
    if (e.avisosSinDeshacer < MINIMO_PARA_SUBIR || e.deshechas > 0) return null;
    return { a: 'automatico', motivo: `${e.avisosSinDeshacer} aplicadas con aviso y ninguna deshecha: puede pasar a automático.` };
  }
  return null;
}

/** Estadística por tipo a partir de las propuestas (lo que hay que medir para el rodaje). */
export function estadisticasPorTipo(
  propuestas: AiProposal[],
  editadasIds: Set<string>,
  tipoDe: (p: AiProposal) => TipoDecision,
): EstadisticaDeTipo[] {
  const porTipo = new Map<TipoDecision, EstadisticaDeTipo>();
  for (const p of propuestas) {
    const tipo = tipoDe(p);
    const e = porTipo.get(tipo) ?? { tipo, decididas: 0, aprobadasSinCambios: 0, editadas: 0, rechazadas: 0, deshechas: 0, avisosSinDeshacer: 0 };
    if (p.status === 'approved') { e.decididas++; if (editadasIds.has(p.id)) e.editadas++; else e.aprobadasSinCambios++; }
    else if (p.status === 'rejected') { e.decididas++; e.rechazadas++; }
    else if (p.status === 'deshecha') { e.decididas++; e.deshechas++; }
    else if (p.status === 'aplicada') { e.decididas++; if (p.politica === 'aviso') e.avisosSinDeshacer++; }
    porTipo.set(tipo, e);
  }
  return [...porTipo.values()].sort((a, b) => a.tipo.localeCompare(b.tipo));
}
