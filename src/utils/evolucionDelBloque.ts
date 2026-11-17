import type {
  BodyMeasurement, BodyweightLog, Diet, DietCompletionLog, ProgressPhoto, Questionnaire,
  QuestionnaireQuestion, QuestionnaireResponse, WorkoutLog,
} from '../types.js';
import { BODY_METRIC_LABELS } from '../types.js';
import { addDays, diasEntreFechas } from './trainingWeek.js';
import { adherenciaPorKcal } from './diaDeDieta.js';
import { RANGO_PCT_SEMANA, type ObjetivoCorporalTipo } from './verificacionObjetivo.js';

// ═══════════════════════════════════════════════════════════════════════════
// EVOLUCIÓN DEL BLOQUE — todo lo que el atleta ha registrado durante un
// mesociclo, del principio al final: peso, medidas, cuestionarios (sueño,
// estrés, cansancio, agujetas, pasos…), cumplimiento de la dieta y lo
// constante que ha sido apuntándolo.
//
// Es la otra mitad del cierre: `progresionDelBloque` cuenta el rendimiento;
// esto cuenta cómo ha llegado a ese rendimiento y qué le ha pasado al cuerpo.
// Determinista y sin IA, como el resto del cierre.
//
// Criterio común: «inicio» y «final» nunca son un único dato suelto. El peso
// es la mediana de la primera/última semana; un cuestionario, la media del
// primer/último tercio de sus respuestas. Un mal día no define un bloque.
// ═══════════════════════════════════════════════════════════════════════════

export type Direccion = 'sube_bien' | 'baja_bien' | 'neutra';

export interface EvolucionPeso {
  inicio: number;
  final: number;
  deltaKg: number;
  deltaPct: number;
  /** Ritmo medio en % del peso por semana, con signo. */
  ritmoPctSemana: number | null;
  pesajes: number;
  /** Mediana semanal (índice 0 = semana 1). `null` = sin pesajes esa semana. */
  semanal: (number | null)[];
  objetivo: ObjetivoCorporalTipo | null;
  /** ¿El ritmo cae en el rango del objetivo de la fase? `null` si el objetivo no tiene rango. */
  enRango: boolean | null;
  rango: { min: number; max: number } | null;
}

export interface EvolucionMedida {
  clave: string;
  label: string;
  inicio: number;
  final: number;
  delta: number;
  unidad: string;
  fechaInicio: string;
  fechaFinal: string;
}

export interface EvolucionPregunta {
  clave: string;
  label: string;
  direccion: Direccion;
  inicio: number;
  final: number;
  delta: number;
  /** Variación normalizada a la escala de la pregunta (0-100). Para ordenar y para decidir si es un cambio de verdad. */
  deltaRelativoPct: number;
  respuestas: number;
  semanal: (number | null)[];
  unidad?: string;
  /** Agujetas: las zonas que más han cambiado, para el detalle. */
  detalle?: { label: string; inicio: number; final: number }[];
  /** ¿El cambio es bueno, malo o indiferente según la dirección? */
  lectura: 'mejora' | 'empeora' | 'igual';
}

export interface EvolucionDieta {
  diasRegistrados: number;
  diasDelBloque: number;
  /** % de kcal del objetivo, media de la primera/última semana con datos. */
  inicio: number | null;
  final: number | null;
  media: number | null;
  /** Días dentro de ±10 % del objetivo, sobre los días con objetivo. */
  diasEnObjetivoPct: number | null;
  semanal: (number | null)[];
}

export interface RegistroDelAtleta {
  diasDelBloque: number;
  sesiones: number;
  notasDelAtleta: number;
  pesajes: number;
  diasConPesaje: number;
  cuestionarios: number;
  fotos: number;
  medidas: number;
  diasDieta: number;
}

/** Lo que el atleta contesta en el cuestionario de fin de mesociclo (señales `meso_end.*`). */
export interface VozDelAtleta {
  fecha: string;
  valoracion: number | null;
  recuperacion: number | null;
  exigencia: number | null;
  priorizar: string[];
  demasiado: string[];
}

export interface EvolucionDelBloque {
  semanas: number;
  peso: EvolucionPeso | null;
  medidas: EvolucionMedida[];
  preguntas: EvolucionPregunta[];
  dieta: EvolucionDieta | null;
  registro: RegistroDelAtleta;
  voz: VozDelAtleta | null;
  /** Fotos del bloque (±14 días), para el comparador. */
  fotos: ProgressPhoto[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

function mediana(xs: number[]): number | null {
  if (!xs.length) return null;
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}
function media(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}
const fechaDe = (iso: string) => iso.slice(0, 10);

/** Dirección «buena» de una pregunta, por su señal o por cómo está redactada. */
export function direccionDePregunta(q: Pick<QuestionnaireQuestion, 'label' | 'signalKey'>): Direccion {
  const s = q.signalKey ?? '';
  if (/stress|fatigue|^doms\.|^agujetas\./.test(s)) return 'baja_bien';
  if (/sleep|motivation|^adherencia\.|^retencion\./.test(s)) return 'sube_bien';
  const l = q.label.toLowerCase();
  // Antes que nada: lo que no tiene una dirección buena (peso, medidas).
  if (/\bpeso\b|\bkg\b|per[ií]metro|cintura|diferencia/.test(l)) return 'neutra';
  if (/estr[eé]s|cansad|cansancio|fatiga|agujeta|dolor|molest|hambre|ansiedad|apetito|pesadez/.test(l)) return 'baja_bien';
  if (/sue[ñn]o|dorm|motiva|energ|cumpl|satisf|progres|pasos|rendim|[aá]nimo|recuper|ganas|adheren|calidad|disfrut|confianza/.test(l)) return 'sube_bien';
  return 'neutra';
}

function esAgujetas(q: Pick<QuestionnaireQuestion, 'signalKey'>): boolean {
  return /^(doms|agujetas)\./.test(q.signalKey ?? '');
}

function claveDeEtiqueta(label: string): string {
  return label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
}

/** Media del primer y del último tercio (mínimo un valor en cada lado). */
function extremos(valores: number[]): { inicio: number; final: number } {
  const k = Math.max(1, Math.floor(valores.length / 3));
  return { inicio: media(valores.slice(0, k))!, final: media(valores.slice(-k))! };
}

// ── Motor ────────────────────────────────────────────────────────────────────

export function buildEvolucionDelBloque(params: {
  inicio: string;
  fin: string;
  semanas: number;
  hoy: string;
  bodyweightLogs?: BodyweightLog[];
  medidas?: BodyMeasurement[];
  photos?: ProgressPhoto[];
  responses?: QuestionnaireResponse[];
  questionnaires?: Questionnaire[];
  dietLogs?: DietCompletionLog[];
  diets?: Diet[];
  logs?: WorkoutLog[];
  objetivo?: ObjetivoCorporalTipo | null;
}): EvolucionDelBloque {
  const { inicio, fin, hoy } = params;
  const corte = hoy < fin ? hoy : fin;
  const dentro = (f: string) => f >= inicio && f <= corte;
  const semanaDe = (f: string) => Math.floor(diasEntreFechas(inicio, f) / 7) + 1;
  const nSemanas = Math.max(1, Math.min(params.semanas, semanaDe(corte)));
  const diasDelBloque = diasEntreFechas(inicio, corte) + 1;
  const porSemana = <T,>(items: { fecha: string; v: T }[]) => {
    const out: T[][] = Array.from({ length: nSemanas }, () => []);
    for (const it of items) {
      const s = semanaDe(it.fecha);
      if (s >= 1 && s <= nSemanas) out[s - 1].push(it.v);
    }
    return out;
  };

  // ── Peso ─────────────────────────────────────────────────────────────────
  const pesos = (params.bodyweightLogs ?? [])
    .filter(l => l.weight > 0 && dentro(l.date))
    .sort((a, b) => a.date.localeCompare(b.date));
  let peso: EvolucionPeso | null = null;
  if (pesos.length >= 2) {
    const sem = porSemana(pesos.map(p => ({ fecha: p.date, v: p.weight })));
    const semanal = sem.map(xs => (xs.length ? r1(mediana(xs)!) : null));
    const conDatos = semanal.map((v, i) => ({ v, i })).filter((x): x is { v: number; i: number } => x.v != null);
    if (conDatos.length >= 2) {
      const ini = conDatos[0], fi = conDatos[conDatos.length - 1];
      const deltaKg = r1(fi.v - ini.v);
      const deltaPct = r2((deltaKg / ini.v) * 100);
      const semanasEntre = fi.i - ini.i;
      const ritmo = semanasEntre > 0 ? r2(deltaPct / semanasEntre) : null;
      const objetivo = params.objetivo ?? null;
      const rango = objetivo ? RANGO_PCT_SEMANA[objetivo] ?? null : null;
      peso = {
        inicio: ini.v, final: fi.v, deltaKg, deltaPct, ritmoPctSemana: ritmo,
        pesajes: pesos.length, semanal, objetivo,
        rango, enRango: rango && ritmo != null ? ritmo >= rango.min && ritmo <= rango.max : null,
      };
    }
  }

  // ── Medidas ──────────────────────────────────────────────────────────────
  // Margen de dos semanas a cada lado: las mediciones se piden cada 2-4
  // semanas, y la de «inicio» suele ser la de justo antes de arrancar.
  const medidasBloque = (params.medidas ?? []).filter(m =>
    m.metricKey !== 'bodyweight' && m.metricKey !== 'altura' && !/_izq|_der|gemelo/.test(m.metricKey)
    && m.date >= addDays(inicio, -14) && m.date <= addDays(corte, 7));
  const porClave = new Map<string, BodyMeasurement[]>();
  for (const m of medidasBloque) {
    if (!porClave.has(m.metricKey)) porClave.set(m.metricKey, []);
    porClave.get(m.metricKey)!.push(m);
  }
  const medidas: EvolucionMedida[] = [];
  for (const [clave, ms] of porClave) {
    const o = [...ms].sort((a, b) => a.date.localeCompare(b.date));
    const a = o[0], b = o[o.length - 1];
    if (a.date === b.date) continue;
    medidas.push({
      clave, label: BODY_METRIC_LABELS[a.metricKey] ?? clave, unidad: a.unit,
      inicio: a.value, final: b.value, delta: r1(b.value - a.value), fechaInicio: a.date, fechaFinal: b.date,
    });
  }

  // ── Cuestionarios ────────────────────────────────────────────────────────
  const qPorId = new Map((params.questionnaires ?? []).map(q => [q.id, q]));
  // Hasta una semana después del fin: el cuestionario de cierre se contesta
  // cuando el bloque ya ha acabado.
  const respBloque = (params.responses ?? [])
    .filter(r => {
      const f = fechaDe(r.submittedAt);
      return f >= inicio && f <= addDays(corte, 7);
    })
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));

  interface Serie { label: string; dir: Direccion; unidad?: string; escala: number; puntos: { fecha: string; v: number }[] }
  const series = new Map<string, Serie>();
  const agujetasPorResp: { fecha: string; v: number }[] = [];
  const agujetasPorZona = new Map<string, { fecha: string; v: number }[]>();
  let escalaAgujetas = 0;
  let voz: VozDelAtleta | null = null;

  for (const r of respBloque) {
    const q = qPorId.get(r.questionnaireId);
    if (!q) continue;
    const fecha = fechaDe(r.submittedAt);
    const preguntas = new Map(q.questions.map(p => [p.id, p]));
    const zonas: number[] = [];
    const vozAqui: Partial<VozDelAtleta> = {};
    for (const a of r.answers) {
      const p = preguntas.get(a.questionId);
      if (!p) continue;
      const sk = p.signalKey ?? '';
      if (sk.startsWith('meso_end.')) {
        if (sk === 'meso_end.rating') vozAqui.valoracion = Number(a.value) || null;
        if (sk === 'meso_end.recovery') vozAqui.recuperacion = Number(a.value) || null;
        if (sk === 'meso_end.effort') vozAqui.exigencia = Number(a.value) || null;
        if (sk === 'meso_end.priority_groups') vozAqui.priorizar = String(a.value).split(/[,;]\s*/).filter(Boolean);
        if (sk === 'meso_end.overload_groups') vozAqui.demasiado = String(a.value).split(/[,;]\s*/).filter(Boolean);
        continue;
      }
      if (sk.startsWith('perfil.')) continue;
      if (p.type !== 'scale' && p.type !== 'numeric') continue;
      const v = typeof a.value === 'number' ? a.value : Number(String(a.value).replace(',', '.'));
      if (!Number.isFinite(v) || typeof a.value === 'boolean') continue;
      if (esAgujetas(p)) {
        zonas.push(v);
        escalaAgujetas = Math.max(escalaAgujetas, p.type === 'scale' ? (p.scaleMax ?? 10) - (p.scaleMin ?? 1) : (p.max ?? 5) - (p.min ?? 1));
        if (!agujetasPorZona.has(p.label)) agujetasPorZona.set(p.label, []);
        agujetasPorZona.get(p.label)!.push({ fecha, v });
        continue;
      }
      const clave = claveDeEtiqueta(p.label);
      if (!series.has(clave)) {
        const escala = p.type === 'scale'
          ? (p.scaleMax ?? 10) - (p.scaleMin ?? 1)
          : (p.max != null && p.min != null ? p.max - p.min : 0);
        series.set(clave, { label: p.label, dir: direccionDePregunta(p), unidad: p.unit, escala, puntos: [] });
      }
      series.get(clave)!.puntos.push({ fecha, v });
    }
    if (zonas.length) agujetasPorResp.push({ fecha, v: media(zonas)! });
    if (Object.keys(vozAqui).length) {
      voz = {
        fecha,
        valoracion: vozAqui.valoracion ?? voz?.valoracion ?? null,
        recuperacion: vozAqui.recuperacion ?? voz?.recuperacion ?? null,
        exigencia: vozAqui.exigencia ?? voz?.exigencia ?? null,
        priorizar: vozAqui.priorizar ?? voz?.priorizar ?? [],
        demasiado: vozAqui.demasiado ?? voz?.demasiado ?? [],
      };
    }
  }

  const aPregunta = (clave: string, s: Serie, detalle?: EvolucionPregunta['detalle']): EvolucionPregunta | null => {
    // Hace falta verlo en dos momentos distintos del bloque.
    // Escala abierta (pasos, horas): fuera lo que es claramente un error de
    // tecleo —«10» en una pregunta de pasos donde el resto son 9.800—.
    if (s.escala <= 0 && s.puntos.length >= 3) {
      const med = mediana(s.puntos.map(p => p.v))!;
      if (med > 0) s = { ...s, puntos: s.puntos.filter(p => p.v >= med * 0.1 && p.v <= med * 10) };
    }
    const fechas = new Set(s.puntos.map(p => p.fecha));
    if (s.puntos.length < 2 || fechas.size < 2) return null;
    const { inicio: ini, final: fi } = extremos(s.puntos.map(p => p.v));
    const delta = r1(fi - ini);
    // Sin escala conocida (numérica abierta: pasos, horas), relativo al valor inicial.
    const base = s.escala > 0 ? s.escala : Math.abs(ini) || 1;
    const deltaRelativoPct = r1((delta / base) * 100);
    const relevante = Math.abs(deltaRelativoPct) >= 5;
    const lectura: EvolucionPregunta['lectura'] = !relevante || s.dir === 'neutra' ? 'igual'
      : (delta > 0) === (s.dir === 'sube_bien') ? 'mejora' : 'empeora';
    return {
      clave, label: s.label, direccion: s.dir, unidad: s.unidad,
      inicio: r1(ini), final: r1(fi), delta, deltaRelativoPct, respuestas: s.puntos.length,
      semanal: porSemana(s.puntos.map(p => ({ fecha: p.fecha, v: p.v }))).map(xs => (xs.length ? r1(media(xs)!) : null)),
      detalle, lectura,
    };
  };

  const preguntas: EvolucionPregunta[] = [];
  if (agujetasPorResp.length >= 2) {
    const detalle = [...agujetasPorZona.entries()]
      .filter(([, ps]) => ps.length >= 2)
      .map(([label, ps]) => ({ label, ...extremos(ps.map(p => p.v)) }))
      .map(z => ({ label: z.label, inicio: r1(z.inicio), final: r1(z.final) }))
      .sort((a, b) => Math.abs(b.final - b.inicio) - Math.abs(a.final - a.inicio))
      .slice(0, 5);
    const p = aPregunta('agujetas', { label: 'Agujetas (media de las zonas)', dir: 'baja_bien', escala: escalaAgujetas || 4, puntos: agujetasPorResp }, detalle);
    if (p) preguntas.push(p);
  }
  for (const [clave, s] of series) {
    const p = aPregunta(clave, s);
    if (p) preguntas.push(p);
  }
  // Primero lo que cambia (y si es para bien o para mal), luego lo estable.
  preguntas.sort((a, b) => {
    const peso = (x: EvolucionPregunta) => (x.lectura === 'igual' ? 0 : 1);
    return peso(b) - peso(a) || Math.abs(b.deltaRelativoPct) - Math.abs(a.deltaRelativoPct);
  });

  // ── Dieta ────────────────────────────────────────────────────────────────
  const diasDieta = (params.dietLogs ?? []).filter(l => dentro(l.date) && (l.doneItemIds?.length ?? 0) > 0);
  let dieta: EvolucionDieta | null = null;
  if (diasDieta.length > 0) {
    const pcts = diasDieta
      .map(l => ({ fecha: l.date, a: adherenciaPorKcal(l, params.diets ?? []) }))
      .filter((x): x is { fecha: string; a: NonNullable<ReturnType<typeof adherenciaPorKcal>> } => x.a != null);
    const semanal = porSemana(pcts.map(x => ({ fecha: x.fecha, v: x.a.pct }))).map(xs => (xs.length ? Math.round(media(xs)!) : null));
    const conDatos = semanal.filter((v): v is number => v != null);
    const enObjetivo = pcts.filter(x => Math.abs(x.a.comido.kcal - x.a.objetivo.kcal) <= Math.max(100, x.a.objetivo.kcal * 0.1)).length;
    dieta = {
      diasRegistrados: diasDieta.length,
      diasDelBloque,
      inicio: conDatos[0] ?? null,
      final: conDatos.length >= 2 ? conDatos[conDatos.length - 1] : null,
      media: pcts.length ? Math.round(media(pcts.map(x => x.a.pct))!) : null,
      diasEnObjetivoPct: pcts.length ? Math.round((enObjetivo / pcts.length) * 100) : null,
      semanal,
    };
  }

  // ── Constancia del registro ──────────────────────────────────────────────
  const logsBloque = (params.logs ?? []).filter(l => dentro(l.date));
  const notas = logsBloque.reduce(
    (n, l) => n + (l.note?.trim() ? 1 : 0) + (l.entries ?? []).filter(e => e.note?.trim()).length, 0);
  const fotosBloque = (params.photos ?? []).filter(f => f.date >= addDays(inicio, -14) && f.date <= addDays(corte, 14));
  const registro: RegistroDelAtleta = {
    diasDelBloque,
    sesiones: new Set(logsBloque.map(l => l.date)).size,
    notasDelAtleta: notas,
    pesajes: pesos.length,
    diasConPesaje: new Set(pesos.map(p => p.date)).size,
    cuestionarios: respBloque.length,
    fotos: new Set(fotosBloque.filter(f => dentro(f.date)).map(f => f.date)).size,
    medidas: new Set(medidasBloque.filter(m => dentro(m.date)).map(m => m.date)).size,
    diasDieta: diasDieta.length,
  };

  return { semanas: nSemanas, peso, medidas, preguntas, dieta, registro, voz, fotos: fotosBloque };
}
