import type {
  BodyMeasurement, BodyMetricKey, BodyweightLog, Diet, DietCompletionLog, ProgressPhoto, Questionnaire,
  QuestionnaireQuestion, QuestionnaireResponse, WorkoutLog,
} from '../types.js';
import { BODY_METRIC_LABELS } from '../types.js';
import { addDays, diasEntreFechas } from './trainingWeek.js';
import { adherenciaPorKcal } from './diaDeDieta.js';
import { RANGO_PCT_SEMANA, type ObjetivoCorporalTipo } from './verificacionObjetivo.js';
import { RUIDO_PERIMETRO_CM } from './ruidoDeMedida.js';
import {
  computeAnthropometricIndices, ANTHROPOMETRIC_INDEX_LABELS, type AnthropometricIndexKey,
} from './anthropometricIndices.js';

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
  /**
   * El cambio es menor que el error de la cinta (`RUIDO_PERIMETRO_CM`): no se
   * enseña ni como mejora ni como empeoramiento, sino como «sin cambio medible».
   */
  sinCambioMedible: boolean;
}

/** Un índice perímetro / cintura (los de `anthropometricIndices.ts`) al empezar y al acabar. */
export interface EvolucionIndice {
  clave: AnthropometricIndexKey;
  label: string;
  inicio: number;
  final: number;
  delta: number;
  /** Ninguno de sus dos perímetros ha cambiado más que el error de la cinta. */
  sinCambioMedible: boolean;
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
  /**
   * Lo que contesta con sus palabras en ese mismo cuestionario: qué mantener o
   * cambiar, su objetivo, molestias, cómo le ha resultado la duración. Se
   * descartaban por no ser numéricas, y son justo lo que hay que leer antes de
   * montar el siguiente bloque.
   */
  respuestas: { pregunta: string; respuesta: string }[];
}

export interface EvolucionDelBloque {
  semanas: number;
  peso: EvolucionPeso | null;
  medidas: EvolucionMedida[];
  /** Índices perímetro / cintura con dato al empezar y al acabar. */
  indices: EvolucionIndice[];
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
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Perímetros que se miden a los dos lados. En el cierre se enseñan
 * PROMEDIADOS (izquierda y derecha medidas el mismo día): el filtro anterior
 * los quitaba enteros, y con ellos el brazo y el muslo, que es lo primero que
 * mira quien está en volumen.
 */
const PARES_DE_LADOS: { clave: string; label: string; izq: BodyMetricKey; der: BodyMetricKey }[] = [
  { clave: 'biceps_relajado', label: 'Bíceps relajado', izq: 'biceps_izq_relajado', der: 'biceps_der_relajado' },
  { clave: 'biceps_contraido', label: 'Bíceps contraído', izq: 'biceps_izq_contraido', der: 'biceps_der_contraido' },
  { clave: 'muslo_relajado', label: 'Muslo relajado', izq: 'muslo_izq_relajado', der: 'muslo_der_relajado' },
  { clave: 'muslo_contraido', label: 'Muslo contraído', izq: 'muslo_izq_contraido', der: 'muslo_der_contraido' },
  { clave: 'gemelo_lados', label: 'Gemelo', izq: 'gemelo_izq', der: 'gemelo_der' },
  { clave: 'biceps', label: 'Bíceps (legacy)', izq: 'biceps_izq', der: 'biceps_der' },
  { clave: 'muslo', label: 'Muslo (legacy)', izq: 'muslo_izq', der: 'muslo_der' },
];

/** Error de la cinta para un perímetro: el brazo se mide más fino que el resto. */
export function ruidoDePerimetro(clave: string): number {
  return /^biceps/.test(clave) ? RUIDO_PERIMETRO_CM.brazo : RUIDO_PERIMETRO_CM.resto;
}

/** ¿Un cambio de perímetro (en cm) se queda dentro del error de medir? */
function dentroDelRuido(clave: string, delta: number, unidad: string): boolean {
  return unidad === 'cm' && Math.abs(delta) < ruidoDePerimetro(clave);
}

// Numerador de cada índice perímetro / cintura. El cálculo sigue siendo el de
// `anthropometricIndices.ts`; esto solo es para saber qué dos medidas hay que
// tener al empezar y al acabar. El WHtR (cintura / altura) no entra: no es un
// perímetro contra la cintura y la altura no cambia en un bloque.
const NUMERADOR_DE_INDICE: Partial<Record<AnthropometricIndexKey, BodyMetricKey>> = {
  ipc: 'pecho',
  ibc: 'biceps_der_contraido',
  icac: 'cadera',
  imc_muslo: 'muslo_der_relajado',
};

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
    m.metricKey !== 'bodyweight' && m.metricKey !== 'altura'
    && m.date >= addDays(inicio, -14) && m.date <= addDays(corte, 7));
  const porClave = new Map<BodyMetricKey, BodyMeasurement[]>();
  for (const m of [...medidasBloque].sort((a, b) => a.date.localeCompare(b.date))) {
    if (!porClave.has(m.metricKey)) porClave.set(m.metricKey, []);
    porClave.get(m.metricKey)!.push(m);
  }
  const medidas: EvolucionMedida[] = [];
  const medida = (clave: string, label: string, unidad: string, ini: number, fi: number, fechaInicio: string, fechaFinal: string) => {
    const delta = r1(fi - ini);
    medidas.push({
      clave, label, unidad, inicio: r1(ini), final: r1(fi), delta, fechaInicio, fechaFinal,
      sinCambioMedible: dentroDelRuido(clave, delta, unidad),
    });
  };
  // Los dos lados, promediados, cuando hay al menos dos días con ambos medidos:
  // comparar la media de un día con un solo lado de otro mezclaría la asimetría
  // del atleta con el cambio del bloque.
  const yaEnPar = new Set<BodyMetricKey>();
  for (const par of PARES_DE_LADOS) {
    const izq = new Map((porClave.get(par.izq) ?? []).map(m => [m.date, m]));
    const ambos = (porClave.get(par.der) ?? []).filter(m => izq.has(m.date));
    if (ambos.length < 2) continue;
    const a = ambos[0], b = ambos[ambos.length - 1];
    medida(par.clave, `${par.label} (media izq. y der.)`, a.unit,
      (a.value + izq.get(a.date)!.value) / 2, (b.value + izq.get(b.date)!.value) / 2, a.date, b.date);
    yaEnPar.add(par.izq).add(par.der);
  }
  for (const [clave, ms] of porClave) {
    if (yaEnPar.has(clave)) continue;
    const a = ms[0], b = ms[ms.length - 1];
    if (a.date === b.date) continue;
    medida(clave, BODY_METRIC_LABELS[a.metricKey] ?? clave, a.unit, a.value, b.value, a.date, b.date);
  }

  // Índices perímetro / cintura: la primera y la última medida de cada
  // perímetro dentro de la ventana, con el cálculo de `anthropometricIndices`.
  const primeras: Partial<Record<BodyMetricKey, BodyMeasurement>> = {};
  const ultimas: Partial<Record<BodyMetricKey, BodyMeasurement>> = {};
  for (const [clave, ms] of porClave) { primeras[clave] = ms[0]; ultimas[clave] = ms[ms.length - 1]; }
  const indicesInicio = computeAnthropometricIndices(primeras);
  const indicesFinal = computeAnthropometricIndices(ultimas);
  const indices: EvolucionIndice[] = [];
  for (const [clave, numerador] of Object.entries(NUMERADOR_DE_INDICE) as [AnthropometricIndexKey, BodyMetricKey][]) {
    const ini = indicesInicio[clave], fi = indicesFinal[clave];
    if (ini == null || fi == null) continue;
    const num = { a: primeras[numerador]!, b: ultimas[numerador]! };
    const cin = { a: primeras.cintura!, b: ultimas.cintura! };
    // Hacen falta los DOS perímetros medidos dos veces: con uno solo repetido
    // el índice «cambiaría» arrastrando una medida vieja del otro.
    if (num.a.date === num.b.date || cin.a.date === cin.b.date) continue;
    indices.push({
      clave, label: ANTHROPOMETRIC_INDEX_LABELS[clave], inicio: ini, final: fi, delta: r3(fi - ini),
      sinCambioMedible: dentroDelRuido(numerador, num.b.value - num.a.value, num.a.unit)
        && dentroDelRuido('cintura', cin.b.value - cin.a.value, cin.a.unit),
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
    // El cuestionario de cierre se reconoce por sus señales `meso_end.*`. Sus
    // preguntas de texto y de elegir no llevan señal (son para leerlas, no
    // para un cálculo), así que se recogen por pertenecer a ese cuestionario.
    const esDeCierre = q.questions.some(p => (p.signalKey ?? '').startsWith('meso_end.'));
    const enPalabras: VozDelAtleta['respuestas'] = [];
    const anotar = (pregunta: string, valor: string | number | boolean) => {
      const respuesta = typeof valor === 'string' ? valor.trim() : '';
      if (respuesta) enPalabras.push({ pregunta, respuesta });
    };
    for (const a of r.answers) {
      const p = preguntas.get(a.questionId);
      if (!p) {
        // El comentario libre de una pregunta `conComentario` viaja como otra
        // respuesta, con el id de su pregunta más `__comentario`.
        const base = a.questionId.endsWith('__comentario') ? preguntas.get(a.questionId.slice(0, -'__comentario'.length)) : undefined;
        if (esDeCierre && base) anotar(`${base.tituloCorto ?? base.label} (comentario)`, a.value);
        continue;
      }
      const sk = p.signalKey ?? '';
      if (esDeCierre && !sk && (p.type === 'text' || p.type === 'choice')) {
        anotar(p.tituloCorto ?? p.label, a.value);
        continue;
      }
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
    if (Object.keys(vozAqui).length || enPalabras.length) {
      voz = {
        fecha,
        valoracion: vozAqui.valoracion ?? voz?.valoracion ?? null,
        recuperacion: vozAqui.recuperacion ?? voz?.recuperacion ?? null,
        exigencia: vozAqui.exigencia ?? voz?.exigencia ?? null,
        priorizar: vozAqui.priorizar ?? voz?.priorizar ?? [],
        demasiado: vozAqui.demasiado ?? voz?.demasiado ?? [],
        respuestas: enPalabras.length ? enPalabras : voz?.respuestas ?? [],
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

  return { semanas: nSemanas, peso, medidas, indices, preguntas, dieta, registro, voz, fotos: fotosBloque };
}
