import { MuscleGroup, MuscleGroupConfig, MUSCLE_ORDER, MUSCLE_LABELS_SHORT, MUSCLE_LABELS, RepartoPropio, Mesocycle } from '../types.js';
import { DAY_TYPE_MUSCLES, DESCANSO, repartoDelMesociclo, gruposPorSesion } from './trainingSplits.js';
import { isStale } from './repartoDesactualizado.js';
import { repartoImplicito } from './reordenarMeso.js';
import { SERIES_POR_DIA_TOPE, SERIES_POR_SESION } from './volumeSuggestion.js';
import { splitEvenly } from './programacion.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Calculadora de reparto por frecuencias

   El coach dice cuántas veces por semana quiere tocar cada grupo (pecho 1,5×,
   dorsal 2×…) y qué días entrena; esto devuelve 3-4 repartos que lo cumplen.

   - El ciclo es de 7 días si todas las frecuencias son enteras, y de 14 si
     alguna es «y media»: 1,5× son 3 veces cada dos semanas, y eso dentro de
     una semana no existe. Los días de la semana son siempre los que marca el
     coach, iguales en las dos semanas.
   - Cada grupo aparece EXACTAMENTE frecuencia × días del ciclo / 7 veces.
   - Dónde cae cada aparición lo decide una búsqueda local determinista sobre
     un coste: recuperación (nada de días seguidos), topes de series,
     sesiones equilibradas, sinergistas juntos según la estrategia, prioridad
     alta tras un descanso e isquios/lumbar lejos del día de tirón.
   - Varias estrategias (empuje/tirón/pierna, torso/pierna…) dan opciones
     distintas de verdad; se devuelven las mejores sin repetir.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Grupos que caben en cualquier día (como en `DAY_TYPE_MUSCLES`): no agrupan sesiones. */
export const GRUPOS_COMODIN: MuscleGroup[] = ['core', 'lumbares', 'rotadores'];

export const FRECUENCIA_MAXIMA = 3;

/** Frecuencia de partida que sale del volumen: series ÷ `SERIES_POR_SESION` (8), a medios, mínimo 1. */
export function frecuenciaPorDefecto(seriesSemanales: number): number {
  if (seriesSemanales <= 0) return 0;
  const f = Math.round((seriesSemanales / SERIES_POR_SESION) * 2) / 2;
  return Math.min(FRECUENCIA_MAXIMA, Math.max(1, f));
}

export interface EntradaCalculadora {
  /** Días de la semana en que se entrena: 0 = lunes … 6 = domingo. */
  diasSemana: number[];
  /** Día de la semana (0 = lunes) en que cae el día 1 del ciclo: el de la fecha de inicio. */
  inicioSemana?: number;
  /** Veces por semana que se quiere tocar cada grupo (pasos de 0,5). 0 o ausente = no entra. */
  frecuencias: Partial<Record<MuscleGroup, number>>;
  /** Series semanales y prioridad de cada grupo (la pestaña Volumen). */
  grupos: Record<MuscleGroup, MuscleGroupConfig>;
  /** Tope de series de una sesión entera (≈ duración). */
  maxSeriesSesion?: number;
  /** Tope de series de un grupo en una misma sesión. */
  maxSeriesGrupoSesion?: number;
}

export interface SesionCalculada {
  /** Día del ciclo (0-based). */
  dia: number;
  tipo: string;
  grupos: { grupo: MuscleGroup; series: number }[];
  total: number;
}

export interface OpcionDeReparto {
  id: string;
  estrategia: string;
  cicloDias: number;
  sesiones: SesionCalculada[];
  reparto: RepartoPropio;
  frecuencias: Partial<Record<MuscleGroup, { objetivo: number; conseguida: number }>>;
  avisos: string[];
  /** Penalización de recuperación, topes y equilibrio (sin la lógica de la estrategia). Menos = mejor encaje. */
  coste: number;
}

export interface ResultadoCalculadora {
  opciones: OpcionDeReparto[];
  /** Avisos que valen para todas las opciones (frecuencia que no cabe, sesión de un grupo demasiado larga…). */
  avisos: string[];
  cicloDias: number;
}

/* ── Estrategias: qué grupos «van juntos» ─────────────────────────────────── */

interface Estrategia {
  id: string;
  nombre: string;
  /** Cluster de cada grupo; sin entrada = neutro (no penaliza mezclar). */
  cluster: Partial<Record<MuscleGroup, string>>;
  pesoCoherencia: number;
}

const EMPUJE: MuscleGroup[] = ['pecho', 'deltoide_ant', 'deltoide_lat', 'triceps'];
const TIRON: MuscleGroup[] = ['dorsal', 'trapecio', 'deltoide_post', 'biceps', 'antebrazo'];
const PIERNA: MuscleGroup[] = ['cuadriceps', 'isquios', 'gluteo', 'aductores', 'gemelo'];

const asignar = (pares: [string, MuscleGroup[]][]): Partial<Record<MuscleGroup, string>> =>
  Object.fromEntries(pares.flatMap(([c, gs]) => gs.map(g => [g, c])));

const ESTRATEGIAS: Estrategia[] = [
  { id: 'ppl', nombre: 'Empuje / Tirón / Pierna', pesoCoherencia: 40,
    cluster: asignar([['empuje', EMPUJE], ['tiron', TIRON], ['pierna', PIERNA]]) },
  { id: 'torso-pierna', nombre: 'Torso / Pierna', pesoCoherencia: 40,
    cluster: asignar([['torso', [...EMPUJE, ...TIRON]], ['pierna', PIERNA]]) },
  { id: 'torso-pierna-brazo', nombre: 'Torso / Pierna / Brazo-Hombro', pesoCoherencia: 35,
    cluster: asignar([['torso', ['pecho', 'dorsal', 'trapecio', 'deltoide_post']], ['brazo', ['biceps', 'triceps', 'antebrazo', 'deltoide_ant', 'deltoide_lat']], ['pierna', PIERNA]]) },
  { id: 'patrones', nombre: 'Por patrones de movimiento', pesoCoherencia: 25,
    cluster: asignar([['empuje', EMPUJE], ['tiron', TIRON], ['rodilla', ['cuadriceps', 'aductores', 'gemelo']], ['cadera', ['gluteo', 'isquios']]]) },
  { id: 'full', nombre: 'Cuerpo completo', pesoCoherencia: 0, cluster: {} },
];

/* ── Contexto y coste ─────────────────────────────────────────────────────── */

interface Contexto {
  cicloDias: number;
  /** Día del ciclo de cada sesión, en orden. */
  offsets: number[];
  /** Grupos que entran, con sus veces en el ciclo y series por aparición. */
  grupos: MuscleGroup[];
  veces: Partial<Record<MuscleGroup, number>>;
  seriesPorVez: Partial<Record<MuscleGroup, number>>;
  prioridadAlta: Set<MuscleGroup>;
  maxSesion: number;
  /** Para cada sesión: ¿el día anterior del calendario es de entrenamiento? */
  tieneDiaAnterior: boolean[];
  /** Para cada sesión: índice de la sesión del día SIGUIENTE del calendario, o -1. */
  sesionSiguiente: number[];
}

type Estado = Partial<Record<MuscleGroup, number[]>>; // grupo → sesiones

const CADERA_BAJA: MuscleGroup[] = ['isquios', 'gluteo', 'lumbares'];
const TIRON_PESADO: MuscleGroup[] = ['dorsal', 'trapecio'];

function cargas(estado: Estado, ctx: Contexto): number[] {
  const carga = ctx.offsets.map(() => 0);
  for (const g of ctx.grupos) for (const s of estado[g] ?? []) carga[s] += ctx.seriesPorVez[g] ?? 0;
  return carga;
}

function coste(estado: Estado, ctx: Contexto, est: Estrategia, conCoherencia = true): number {
  const S = ctx.offsets.length;
  const L = ctx.cicloDias;
  let c = 0;

  // 1. Recuperación: huecos entre apariciones del mismo grupo, en círculo.
  for (const g of ctx.grupos) {
    const ss = estado[g] ?? [];
    if (ss.length < 2) continue;
    const dias = ss.map(s => ctx.offsets[s]).sort((a, b) => a - b);
    const ideal = L / dias.length;
    const comodin = GRUPOS_COMODIN.includes(g);
    for (let k = 0; k < dias.length; k++) {
      const hueco = k === dias.length - 1 ? dias[0] + L - dias[k] : dias[k + 1] - dias[k];
      if (hueco <= 1) c += comodin ? 4 : 30;
      c += (hueco - ideal) ** 2 * 0.15;
    }
  }

  // 2 y 3. Topes de la sesión y equilibrio entre sesiones.
  const carga = cargas(estado, ctx);
  const media = carga.reduce((a, b) => a + b, 0) / Math.max(1, S);
  for (const x of carga) {
    // El tope es un aviso, no un muro: pesa menos que romper la lógica de las
    // sesiones, que es lo que el coach no puede arreglar a mano después.
    if (x > ctx.maxSesion) c += (x - ctx.maxSesion) * 5;
    c += (x - media) ** 2 * 0.05;
  }

  // 4. Coherencia: cuántos «bloques» distintos mezcla cada sesión.
  if (conCoherencia && est.pesoCoherencia > 0) {
    const porSesion: Set<string>[] = ctx.offsets.map(() => new Set());
    for (const g of ctx.grupos) {
      const cl = est.cluster[g];
      if (cl) for (const s of estado[g] ?? []) porSesion[s].add(cl);
    }
    for (const set of porSesion) if (set.size > 1) c += (set.size - 1) * est.pesoCoherencia;
  }

  // 5. Prioridad alta: mejor el día después de un descanso, con el músculo fresco.
  for (const g of ctx.prioridadAlta) {
    for (const s of estado[g] ?? []) if (ctx.tieneDiaAnterior[s]) c += 3;
  }

  // 6. Interferencia: isquios/glúteo/lumbar justo antes de un día de remo y dorsal.
  for (let s = 0; s < S; s++) {
    const sig = ctx.sesionSiguiente[s];
    if (sig < 0) continue;
    const bisagra = CADERA_BAJA.some(g => (estado[g] ?? []).includes(s));
    const tiron = TIRON_PESADO.some(g => (estado[g] ?? []).includes(sig));
    if (bisagra && tiron) c += 4;
  }
  return c;
}

/* ── Búsqueda ─────────────────────────────────────────────────────────────── */

function colocarVoraz(ctx: Contexto, est: Estrategia, rotacion: number): Estado {
  const estado: Estado = {};
  const S = ctx.offsets.length;
  const orden = [...ctx.grupos].sort((a, b) =>
    (ctx.veces[b]! - ctx.veces[a]!) || ((ctx.seriesPorVez[b] ?? 0) - (ctx.seriesPorVez[a] ?? 0))
    || MUSCLE_ORDER.indexOf(a) - MUSCLE_ORDER.indexOf(b));
  for (const g of orden) {
    estado[g] = [];
    for (let v = 0; v < ctx.veces[g]!; v++) {
      let mejor = -1;
      let mejorCoste = Infinity;
      for (let k = 0; k < S; k++) {
        const s = (k + rotacion) % S;
        if (estado[g]!.includes(s)) continue;
        estado[g]!.push(s);
        const cc = coste(estado, ctx, est);
        estado[g]!.pop();
        if (cc < mejorCoste - 1e-9) { mejorCoste = cc; mejor = s; }
      }
      estado[g]!.push(mejor);
    }
  }
  return estado;
}

/**
 * Punto de partida por BLOQUES: primero se decide de qué bloque es cada sesión
 * (empuje, tirón, pierna…), repartiendo los bloques a lo largo del ciclo en
 * proporción a las veces que los pide su grupo más frecuente, y después cada
 * grupo se coloca en las sesiones de su bloque. Sin esto la búsqueda local
 * parte de sesiones mezcladas y no sabe salir de ahí: mover un grupo suelto
 * nunca deshace una mezcla, hace falta mover el bloque entero.
 */
function colocarPorBloques(ctx: Contexto, est: Estrategia, rotacion: number): Estado {
  const S = ctx.offsets.length;
  const bloques = [...new Set(ctx.grupos.map(g => est.cluster[g]).filter((c): c is string => !!c))];
  if (bloques.length === 0) return colocarVoraz(ctx, est, rotacion);
  const peso = new Map(bloques.map(b => [b, Math.max(...ctx.grupos.filter(g => est.cluster[g] === b).map(g => ctx.veces[g]!))]));
  const sumaPesos = [...peso.values()].reduce((a, b) => a + b, 0);
  const asignadas = new Map(bloques.map(b => [b, 0]));
  const orden = bloques.map((_, k) => bloques[(k + rotacion) % bloques.length]);
  const etiqueta: string[] = [];
  for (let s = 0; s < S; s++) {
    let mejor = orden[0];
    let mejorDeficit = -Infinity;
    for (const b of orden) {
      const deficit = peso.get(b)! * (s + 1) * S / sumaPesos / S - asignadas.get(b)!;
      if (deficit > mejorDeficit + 1e-9) { mejorDeficit = deficit; mejor = b; }
    }
    etiqueta.push(mejor);
    asignadas.set(mejor, asignadas.get(mejor)! + 1);
  }

  const estado: Estado = {};
  const ordenGrupos = [...ctx.grupos].sort((a, b) =>
    (ctx.veces[b]! - ctx.veces[a]!) || MUSCLE_ORDER.indexOf(a) - MUSCLE_ORDER.indexOf(b));
  for (const g of ordenGrupos) {
    estado[g] = [];
    const propias = Array.from({ length: S }, (_, k) => k).filter(k => etiqueta[k] === est.cluster[g]);
    for (let v = 0; v < ctx.veces[g]!; v++) {
      // Primero las sesiones de su bloque; si no llegan, el resto.
      const libres = propias.filter(k => !estado[g]!.includes(k));
      const candidatas = libres.length > 0 ? libres : Array.from({ length: S }, (_, k) => k).filter(k => !estado[g]!.includes(k));
      let mejor = candidatas[0];
      let mejorCoste = Infinity;
      for (const k of candidatas) {
        estado[g]!.push(k);
        const cc = coste(estado, ctx, est);
        estado[g]!.pop();
        if (cc < mejorCoste - 1e-9) { mejorCoste = cc; mejor = k; }
      }
      estado[g]!.push(mejor);
    }
  }
  return estado;
}

function mejorar(estado: Estado, ctx: Contexto, est: Estrategia): Estado {
  const S = ctx.offsets.length;
  let actual = coste(estado, ctx, est);
  for (let pasada = 0; pasada < 20; pasada++) {
    let mejoro = false;
    // Mover una aparición de sesión.
    for (const g of ctx.grupos) {
      const ss = estado[g]!;
      for (let i = 0; i < ss.length; i++) {
        const original = ss[i];
        for (let s = 0; s < S; s++) {
          if (ss.includes(s)) continue;
          ss[i] = s;
          const cc = coste(estado, ctx, est);
          if (cc < actual - 1e-9) { actual = cc; mejoro = true; break; }
          ss[i] = original;
        }
      }
    }
    // Intercambiar dos grupos entre dos sesiones.
    for (let a = 0; a < S; a++) {
      for (let b = a + 1; b < S; b++) {
        for (const g of ctx.grupos) {
          const sg = estado[g]!;
          const ig = sg.indexOf(a);
          if (ig < 0 || sg.includes(b)) continue;
          for (const h of ctx.grupos) {
            if (h === g) continue;
            const sh = estado[h]!;
            const ih = sh.indexOf(b);
            if (ih < 0 || sh.includes(a)) continue;
            sg[ig] = b; sh[ih] = a;
            const cc = coste(estado, ctx, est);
            if (cc < actual - 1e-9) { actual = cc; mejoro = true; break; }
            sg[ig] = a; sh[ih] = b;
          }
        }
      }
    }
    if (!mejoro) break;
  }
  return estado;
}

/* ── Nombres de las sesiones ──────────────────────────────────────────────── */

const sinComodin = (gs: MuscleGroup[]) => gs.filter(g => !GRUPOS_COMODIN.includes(g));

const NOMBRES_DE_DIA: [string, MuscleGroup[]][] = [
  ['Pierna', sinComodin(DAY_TYPE_MUSCLES['Pierna'])],
  ['Empuje', sinComodin(DAY_TYPE_MUSCLES['Push'])],
  ['Tirón', sinComodin(DAY_TYPE_MUSCLES['Pull'])],
  ['Brazo', sinComodin(DAY_TYPE_MUSCLES['Brazo'])],
  ['Brazo/Hombro', sinComodin(DAY_TYPE_MUSCLES['Brazo/Hombro'])],
  ['Cuádriceps', sinComodin(DAY_TYPE_MUSCLES['Cuádriceps'])],
  ['Glúteo/Isquios', sinComodin(DAY_TYPE_MUSCLES['Glúteo/Isquios'])],
  ['Pierna/Hombro', sinComodin(DAY_TYPE_MUSCLES['Pierna/Hombro'])],
  ['Torso', sinComodin(DAY_TYPE_MUSCLES['Torso'])],
  ['Full body', sinComodin(DAY_TYPE_MUSCLES['Full body'])],
];

/**
 * Nombre de una sesión por sus grupos: el del día de la lista que mejor la
 * contiene (Empuje, Tirón, Pierna, Torso…) o, si ninguno encaja, sus grupos
 * principales («Pecho · Hombro lat. · Tríceps»).
 */
export function nombrarSesion(grupos: { grupo: MuscleGroup; series: number }[]): string {
  const gs = sinComodin(grupos.map(x => x.grupo));
  if (gs.length === 0) return 'Core';
  let mejor: string | null = null;
  let mejorAjuste = 0;
  for (const [nombre, set] of NOMBRES_DE_DIA) {
    if (!gs.every(g => set.includes(g))) continue;
    const ajuste = gs.length / set.length;
    if (ajuste >= 0.4 && ajuste > mejorAjuste) { mejorAjuste = ajuste; mejor = nombre; }
  }
  if (mejor) return mejor;
  const principales = [...grupos].filter(x => !GRUPOS_COMODIN.includes(x.grupo)).sort((a, b) => b.series - a.series);
  const texto = principales.slice(0, 3).map(x => MUSCLE_LABELS_SHORT[x.grupo]).join(' · ');
  return principales.length > 3 ? `${texto} +${principales.length - 3}` : texto;
}

/** «Torso A», «Torso B» cuando dos sesiones se llaman igual pero no entrenan lo mismo. */
function desambiguar(sesiones: SesionCalculada[]): void {
  const firmas = new Map<string, string[]>();
  for (const s of sesiones) {
    const firma = s.grupos.map(x => x.grupo).sort().join('+');
    const lista = firmas.get(s.tipo) ?? [];
    if (!lista.includes(firma)) lista.push(firma);
    firmas.set(s.tipo, lista);
  }
  for (const s of sesiones) {
    const lista = firmas.get(s.tipo)!;
    if (lista.length < 2) continue;
    const firma = s.grupos.map(x => x.grupo).sort().join('+');
    s.tipo = `${s.tipo} ${String.fromCharCode(65 + lista.indexOf(firma))}`;
  }
}

/* ── Entrada principal ────────────────────────────────────────────────────── */

const DIA_SEMANA = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

export function calcularRepartos(e: EntradaCalculadora): ResultadoCalculadora {
  const avisos: string[] = [];
  const dias = [...new Set(e.diasSemana)].filter(d => d >= 0 && d <= 6).sort((a, b) => a - b);
  const frec = MUSCLE_ORDER.filter(g => (e.frecuencias[g] ?? 0) > 0);
  const media = frec.some(g => !Number.isInteger(e.frecuencias[g]!));
  const cicloDias = media ? 14 : 7;
  if (dias.length === 0) return { opciones: [], avisos: ['Marca al menos un día de entrenamiento.'], cicloDias };
  if (frec.length === 0) return { opciones: [], avisos: ['Pon frecuencia a algún grupo.'], cicloDias };

  const inicio = e.inicioSemana ?? 0;
  const offsets = Array.from({ length: cicloDias }, (_, d) => d).filter(d => dias.includes((inicio + d) % 7));
  const S = offsets.length;
  const maxSesion = e.maxSeriesSesion ?? SERIES_POR_DIA_TOPE;
  const maxGrupo = e.maxSeriesGrupoSesion ?? SERIES_POR_SESION;

  const veces: Partial<Record<MuscleGroup, number>> = {};
  const seriesPorVez: Partial<Record<MuscleGroup, number>> = {};
  for (const g of frec) {
    const pedidas = Math.round(e.frecuencias[g]! * cicloDias / 7);
    const n = Math.min(pedidas, S);
    if (n < pedidas) {
      avisos.push(`${MUSCLE_LABELS[g]}: pides ${pedidas} veces cada ${cicloDias} días y solo hay ${S} sesiones; se queda en ${n}.`);
    }
    veces[g] = n;
    const series = (e.grupos[g]?.series ?? 0) * cicloDias / 7;
    seriesPorVez[g] = n > 0 ? series / n : 0;
    if (series > 0 && seriesPorVez[g]! > maxGrupo + 0.5) {
      const necesaria = Math.ceil(series / maxGrupo) * 7 / cicloDias;
      avisos.push(`${MUSCLE_LABELS[g]}: ${Math.round(seriesPorVez[g]!)} series por sesión (tope ${maxGrupo}). Súbele la frecuencia a ${necesaria.toLocaleString('es-ES')}× o baja su volumen.`);
    }
    if ((e.grupos[g]?.series ?? 0) <= 0) {
      avisos.push(`${MUSCLE_LABELS[g]} tiene frecuencia pero 0 series en Volumen: tendrá su hueco sin series.`);
    }
  }
  const grupos = frec.filter(g => veces[g]! > 0);

  const esSesion = new Set(offsets);
  const ctx: Contexto = {
    cicloDias, offsets, grupos, veces, seriesPorVez,
    prioridadAlta: new Set(grupos.filter(g => e.grupos[g]?.priority === 'alta')),
    maxSesion,
    tieneDiaAnterior: offsets.map(o => esSesion.has((o - 1 + cicloDias) % cicloDias)),
    sesionSiguiente: offsets.map(o => offsets.indexOf((o + 1) % cicloDias)),
  };

  // Una opción por estrategia (la mejor de dos puntos de partida), en el orden
  // de las estrategias y sin repetir. `coste` es el de lo que no depende de la
  // estrategia —recuperación, topes, equilibrio—, para poder marcar cuál
  // encaja mejor; ordenar por él pondría siempre primero el cuerpo completo,
  // que es justo el que no tiene que respetar ningún bloque.
  const opciones: OpcionDeReparto[] = [];
  for (const est of ESTRATEGIAS) {
    let mejor: { estado: Estado; coste: number } | null = null;
    for (const rotacion of [0, 1, 2]) {
      const estado = mejorar(colocarPorBloques(ctx, est, rotacion), ctx, est);
      const cc = coste(estado, ctx, est);
      if (!mejor || cc < mejor.coste) mejor = { estado, coste: cc };
    }
    const opcion = construirOpcion(mejor!.estado, ctx, est, e);
    if (!opciones.some(o => o.id === opcion.id)) opciones.push(opcion);
  }
  return { opciones: opciones.slice(0, 4), avisos, cicloDias };
}

function construirOpcion(estado: Estado, ctx: Contexto, est: Estrategia, e: EntradaCalculadora): OpcionDeReparto {
  // Series enteras: el total del ciclo de cada grupo, repartido a partes iguales.
  const seriesEn: Map<string, number> = new Map();
  for (const g of ctx.grupos) {
    const ss = [...estado[g]!].sort((a, b) => a - b);
    const total = Math.round((e.grupos[g]?.series ?? 0) * ctx.cicloDias / 7);
    splitEvenly(total, ss.length).forEach((n, k) => seriesEn.set(`${g}@${ss[k]}`, n));
  }
  const sesiones: SesionCalculada[] = ctx.offsets.map((dia, s) => {
    const grupos = MUSCLE_ORDER
      .filter(g => (estado[g] ?? []).includes(s))
      .map(g => ({ grupo: g, series: seriesEn.get(`${g}@${s}`) ?? 0 }));
    return { dia, tipo: nombrarSesion(grupos), grupos, total: grupos.reduce((a, x) => a + x.series, 0) };
  });
  desambiguar(sesiones);

  const avisos = avisosDeSesiones(sesiones, ctx.cicloDias, ctx.maxSesion);

  const frecuencias: OpcionDeReparto['frecuencias'] = {};
  for (const g of MUSCLE_ORDER) {
    const objetivo = e.frecuencias[g] ?? 0;
    if (objetivo <= 0) continue;
    frecuencias[g] = { objetivo, conseguida: Math.round(((estado[g]?.length ?? 0) * 7 / ctx.cicloDias) * 100) / 100 };
  }

  const reparto: RepartoPropio = {
    nombre: est.nombre,
    dias: Array.from({ length: ctx.cicloDias }, (_, d) => {
      const s = ctx.offsets.indexOf(d);
      if (s < 0) return null;
      return { tipo: sesiones[s].tipo, grupos: sesiones[s].grupos.map(x => x.grupo) };
    }),
    frecuencias: Object.fromEntries(Object.entries(frecuencias).map(([g, f]) => [g, f!.objetivo])),
  };

  // Huella independiente del orden: dos estrategias que llegan a las mismas
  // sesiones son la misma opción.
  const id = sesiones.map(s => s.grupos.map(x => x.grupo).sort().join('+')).sort().join('|');
  return { id, estrategia: est.nombre, cicloDias: ctx.cicloDias, sesiones, reparto, frecuencias, avisos, coste: coste(estado, ctx, est, false) };
}

/** Sesiones por encima del tope y grupos que caen en días seguidos (en círculo). */
function avisosDeSesiones(sesiones: SesionCalculada[], cicloDias: number, maxSesion: number): string[] {
  const avisos: string[] = [];
  for (const s of sesiones) {
    if (s.total > maxSesion) avisos.push(`${s.tipo} (día ${s.dia + 1}): ${s.total} series, por encima del tope de ${maxSesion}.`);
  }
  for (const g of MUSCLE_ORDER) {
    if (GRUPOS_COMODIN.includes(g)) continue;
    const dias = sesiones.filter(s => s.grupos.some(x => x.grupo === g)).map(s => s.dia).sort((a, b) => a - b);
    if (dias.length < 2) continue;
    const seguidos = dias.some((d, k) => (k === dias.length - 1 ? dias[0] + cicloDias - d : dias[k + 1] - d) <= 1);
    if (seguidos) avisos.push(`${MUSCLE_LABELS[g]} cae en días seguidos.`);
  }
  return avisos;
}

/**
 * El reparto que el mesociclo YA tiene, medido con la misma vara que las
 * opciones: qué se entrena cada día, cuántas veces por semana sale cada grupo
 * frente a lo que se pide ahora, y sus avisos. Es la primera tarjeta de la
 * calculadora, para ver qué cambia cada propuesta respecto a lo de hoy.
 *
 * Si hay distribución al día manda ella (es lo que de verdad se entrena: en un
 * «Torso» de la lista caben todos los grupos del tren superior, pero el
 * trapecio quizá solo va un día). Si no, los grupos de cada día del reparto,
 * sin los comodines que un día de la lista acepta pero no entrena por sí solo.
 */
export function evaluarRepartoActual(
  meso: Mesocycle,
  e: Pick<EntradaCalculadora, 'frecuencias' | 'grupos' | 'maxSeriesSesion'>,
): OpcionDeReparto | null {
  // Sin reparto (calendario tocado a mano), el que sigue de hecho.
  const implicito = repartoImplicito(meso);
  const r = repartoDelMesociclo(implicito ? { reparto: implicito } : meso);
  if (!r) return null;
  const cicloDias = r.dayTypes.length;
  const offsets = r.dayTypes.flatMap((t, i) => (t === DESCANSO ? [] : [i]));
  const tipos = r.dayTypes.filter(t => t !== DESCANSO);
  const maxSesion = e.maxSeriesSesion ?? SERIES_POR_DIA_TOPE;

  let porSesion: { grupo: MuscleGroup; series: number }[][];
  const dist = meso.distribution;
  if (dist && !isStale(meso, dist) && dist.days.length === offsets.length) {
    porSesion = dist.days.map(d => d.assignments.filter(a => a.series > 0).map(a => ({ grupo: a.group, series: a.series })));
  } else {
    const grupos = gruposPorSesion(r).map(gs => gs.filter(g =>
      (r.propio || !GRUPOS_COMODIN.includes(g)) && ((e.grupos[g]?.series ?? 0) > 0 || (e.frecuencias[g] ?? 0) > 0)));
    const seriesEn = new Map<string, number>();
    for (const g of MUSCLE_ORDER) {
      const ss = grupos.flatMap((gs, k) => (gs.includes(g) ? [k] : []));
      if (ss.length === 0) continue;
      splitEvenly(Math.round((e.grupos[g]?.series ?? 0) * cicloDias / 7), ss.length).forEach((n, k) => seriesEn.set(`${g}@${ss[k]}`, n));
    }
    porSesion = grupos.map((gs, k) => MUSCLE_ORDER.filter(g => gs.includes(g)).map(g => ({ grupo: g, series: seriesEn.get(`${g}@${k}`) ?? 0 })));
  }

  const sesiones: SesionCalculada[] = offsets.map((dia, k) => ({
    dia, tipo: tipos[k], grupos: porSesion[k], total: porSesion[k].reduce((a, x) => a + x.series, 0),
  }));
  const avisos = avisosDeSesiones(sesiones, cicloDias, maxSesion);

  const frecuencias: OpcionDeReparto['frecuencias'] = {};
  for (const g of MUSCLE_ORDER) {
    const objetivo = e.frecuencias[g] ?? 0;
    const veces = sesiones.filter(s => s.grupos.some(x => x.grupo === g)).length;
    if (objetivo <= 0 && veces === 0) continue;
    const conseguida = Math.round((veces * 7 / cicloDias) * 100) / 100;
    frecuencias[g] = { objetivo, conseguida };
  }

  return {
    id: 'actual',
    estrategia: 'Tu reparto actual',
    cicloDias,
    sesiones,
    reparto: meso.reparto ?? { nombre: r.nombre, dias: r.dayTypes.map((t, i) => (t === DESCANSO ? null : { tipo: t, grupos: r.gruposPorDia[i] })) },
    frecuencias,
    avisos,
    coste: Infinity,
  };
}

/** «lunes, miércoles y viernes» para los textos de la hoja. */
export function nombrarDias(dias: number[]): string {
  const n = [...dias].sort((a, b) => a - b).map(d => DIA_SEMANA[d]);
  return n.length <= 1 ? (n[0] ?? '') : `${n.slice(0, -1).join(', ')} y ${n[n.length - 1]}`;
}
