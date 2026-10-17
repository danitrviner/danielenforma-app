/**
 * Réplica del resto de la plantilla CulturaDeGym: Semana X (lo realizado),
 * Gestión, carga aguda/crónica, rendimiento (RM y tonelaje), rendimiento del
 * ciclo y antropometría. Validado contra la hoja real de un cliente
 * (39/39 filas de Gestión y 165/165 de Datos de rendimiento, diferencia 0).
 */
import { parsearReps, rirARpe, type CdgSerie, type MotorCdg, type CdgTecnica } from './motor.js'

export const SEMANAS_CARGA_CRONICA = 6

// ─── Semana X ───────────────────────────────────────────────────────────────

export interface CdgSerieRealizada extends CdgSerie {
  weight: number | string;
  intensification: string; // técnica tal cual ('' o '-' = Normal)
  intensificationList?: Array<{ intensificationReps: number | string; intensificationWeight: number | string }>;
}

export interface EntradaSerieHoja { reps: string | number; kg: string | number; rir: string | number; tecnica?: string }

/**
 * Series de un ejercicio de la Semana X, igual que las lee la hoja.
 * RAREZA DEL ORIGINAL: se para en la primera serie sin reps y SALTA la serie sin kg
 * (un ejercicio con peso corporal sin kilos apuntados no cuenta).
 * RAREZA DEL ORIGINAL: siempre convierte RIR→RPE, aunque la config diga RPE.
 */
export function seriesSemanaX (nombre: string, series: EntradaSerieHoja[], detalleTecnica: Array<{ reps: string | number; kg: string | number }> = []): CdgSerieRealizada[] {
  const out: CdgSerieRealizada[] = []
  for (const s of series.slice(0, 5)) {
    if (s == null || String(s.reps ?? '') === '') break
    if (String(s.kg ?? '') === '') continue
    out.push({
      exerciseName: nombre,
      repetitions: parsearReps(s.reps),
      weight: typeof s.kg === 'number' ? s.kg : String(s.kg).replace(',', '.'),
      rpe: rirARpe(s.rir),
      intensification: s.tecnica ?? ''
    })
  }
  if (out[0]) {
    out[0].intensificationList = Array.from({ length: 5 }, (_, i) => ({
      intensificationReps: detalleTecnica[i]?.reps === '' || detalleTecnica[i]?.reps == null ? 0 : detalleTecnica[i].reps,
      intensificationWeight: detalleTecnica[i]?.kg === '' || detalleTecnica[i]?.kg == null ? 0 : detalleTecnica[i].kg
    }))
  }
  return out
}

/** Semana = 7 días; día = ejercicios; ejercicio = series de seriesSemanaX(). */
export type SemanaRealizada = CdgSerieRealizada[][][]

export interface CalculoSemana { IF: number[]; IEM: number[][]; estresArticular: number[][] }

export function calcularSemana (motor: MotorCdg, semana: SemanaRealizada): CalculoSemana {
  const nM = motor.musculos.length; const nJ = motor.articulaciones.length
  const res: CalculoSemana = { IF: [], IEM: [], estresArticular: [] }
  for (const dia of semana) {
    let dIF = 0; let dIEM = new Array<number>(nM).fill(0); let dEA = new Array<number>(nJ).fill(0)
    for (const sets of dia) {
      if (!sets.length || !motor.existe(sets[0].exerciseName)) continue
      const parciales = sets.map(s => motor.calcularSerie({
        ...s, intensificationTechnique: (['', '-'].includes(s.intensification) ? 'Normal' : s.intensification) as CdgTecnica
      }))
      const t = motor.sumar(parciales)
      if (isNaN(t.IF)) continue // el original descarta el ejercicio con error
      dIF += t.IF
      dIEM = dIEM.map((v, i) => v + t.IEM[i])
      dEA = dEA.map((v, i) => v + t.estresArticular[i])
    }
    res.IF.push(dIF); res.IEM.push(dIEM); res.estresArticular.push(dEA)
  }
  return res
}

// ─── Gestión ────────────────────────────────────────────────────────────────

export interface FilaGestion { sesion: string; semana: string; IF: number; IEM: number[]; estresArticular: number[] }

/** Una fila por sesión con IF ≠ 0 + fila Total (suma de toda la semana). */
export function filasGestion (numSemana: number, c: CalculoSemana): FilaGestion[] {
  const suma = (rows: number[][]) => rows.reduce((a, r) => a.map((v, i) => v + r[i]))
  const filas: FilaGestion[] = []
  c.IF.forEach((f, i) => {
    if (f === 0) return
    filas.push({ sesion: `Sesión ${i + 1}`, semana: `Semana ${numSemana}`, IF: f, IEM: c.IEM[i], estresArticular: c.estresArticular[i] })
  })
  filas.push({ sesion: 'Total', semana: `Semana ${numSemana}`, IF: c.IF.reduce((a, b) => a + b, 0), IEM: suma(c.IEM), estresArticular: suma(c.estresArticular) })
  return filas
}

// ─── Carga aguda / crónica ──────────────────────────────────────────────────

/** 8 "sesiones": 7 días + total (índice 7). */
export interface CargaPorSesion { IF: number[]; IEM: number[][]; estresArticular: number[][] }

/**
 * aguda = lo PROGRAMADO para la semana que viene (totales por día + total).
 * semanasPrevias = las 6 últimas semanas REALIZADAS, la más reciente primero.
 * Si no hay exactamente 6, devuelve null (como el original).
 * IF: crónica 0 → 0. IEM/estrés articular: crónica 0 → 1.
 */
export function cargaAgudaCronica (aguda: CargaPorSesion, semanasPrevias: CalculoSemana[]) {
  if (semanasPrevias.length !== SEMANAS_CARGA_CRONICA) return null
  const n = SEMANAS_CARGA_CRONICA
  const conTotal = (rows: number[][]) => [...rows, rows.reduce((a, r) => a.map((v, i) => v + r[i]))]
  const cIF = new Array<number>(8).fill(0)
  let cIEM: number[][] | null = null; let cEA: number[][] | null = null
  for (const w of semanasPrevias) {
    const wIF = [...w.IF, w.IF.reduce((a, b) => a + b, 0)]
    const wIEM = conTotal(w.IEM); const wEA = conTotal(w.estresArticular)
    wIF.forEach((v, i) => { cIF[i] += v })
    cIEM = cIEM ? cIEM.map((r, i) => r.map((v, k) => v + wIEM[i][k])) : wIEM.map(r => [...r])
    cEA = cEA ? cEA.map((r, i) => r.map((v, k) => v + wEA[i][k])) : wEA.map(r => [...r])
  }
  const cronica = { IF: cIF.map(v => v / n), IEM: cIEM!.map(r => r.map(v => v / n)), estresArticular: cEA!.map(r => r.map(v => v / n)) }
  return {
    cronica,
    IF: cronica.IF.map((c, i) => (c === 0 ? 0 : aguda.IF[i] / c)),
    IEM: cronica.IEM.map((r, i) => r.map((c, k) => (c === 0 ? 1 : aguda.IEM[i][k] / c))),
    estresArticular: cronica.estresArticular.map((r, i) => r.map((c, k) => (c === 0 ? 1 : aguda.estresArticular[i][k] / c)))
  }
}

/** Avisos fuera de [inferior, superior] (en la hoja: Presentación M14/M13, por defecto 0.8 / 1.6). */
export function avisosCarga (ac: NonNullable<ReturnType<typeof cargaAgudaCronica>>, motor: MotorCdg, { superior = 1.6, inferior = 0.8 } = {}) {
  const ses = (i: number) => (i === 7 ? 'Total de sesiones' : `Sesión ${i + 1}`)
  const fuera = (v: number) => v > superior || v < inferior
  return {
    sesionesIF: ac.IF.map((v, i) => ({ sesion: ses(i), valor: v, fuera: fuera(v) })),
    musculos: ac.IEM.flatMap((r, i) => r.map((v, k) => ({ sesion: ses(i), nombre: motor.musculos[k], valor: v })).filter(x => fuera(x.valor))),
    articulaciones: ac.estresArticular.flatMap((r, i) => r.map((v, k) => ({ sesion: ses(i), nombre: motor.articulaciones[k], valor: v })).filter(x => fuera(x.valor)))
  }
}

// ─── Rendimiento: RM estimado y tonelaje ────────────────────────────────────

const repsHastaFallo = (s: CdgSerieRealizada) => s.repetitions.min + 10 - (s.rpe as number)
const w = (s: CdgSerieRealizada) => Number(s.weight)
export const epley = (s: CdgSerieRealizada) => w(s) * (1 + 0.033 * repsHastaFallo(s))
export const mayhew = (s: CdgSerieRealizada) => (100 * w(s)) / (52.2 + 41.9 * Math.exp(-0.055 * repsHastaFallo(s)))
export const wathen = (s: CdgSerieRealizada) => (100 * w(s)) / (48.8 + 53.8 * Math.exp(-0.075 * repsHastaFallo(s)))

function rmSerie (s: CdgSerieRealizada) {
  const f = s.repetitions.min >= 10 && s.repetitions.min <= 15 ? [epley] : [epley, mayhew, wathen]
  const t = f.map(g => { const v = g(s); return isNaN(v) ? 0 : v }).reduce((a, b) => a + b, 0)
  return t !== 0 ? t / f.length : 0
}

/** RM estimado del ejercicio = media de sus series (las que tienen kg). */
export function calcularRM (sets: CdgSerieRealizada[]) {
  const t = sets.map(rmSerie).reduce((a, b) => a + b, 0)
  return t !== 0 ? t / sets.length : 0
}

/** Σ kg × reps mínimas + Σ kg × reps del detalle de técnicas (solo en la 1ª serie). */
export function calcularTonelaje (sets: CdgSerieRealizada[]) {
  let t = 0
  for (const s of sets) {
    const p = parseFloat(String(s.weight))
    t += (isNaN(p) ? 0 : p) * s.repetitions.min
  }
  for (const it of sets[0]?.intensificationList ?? []) {
    const p = parseFloat(String(it.intensificationWeight))
    t += (isNaN(p) ? 0 : p) * Number(it.intensificationReps)
  }
  return t
}

export interface FilaRendimiento { semana: string; sesion: string; ejercicio: string; rm: number; tonelaje: number }

export function rendimientoSemana (nombreSemana: string, semana: SemanaRealizada): FilaRendimiento[] {
  const filas: FilaRendimiento[] = []
  semana.forEach((dia, d) => dia.forEach(sets => {
    if (!sets.length) return
    filas.push({ semana: nombreSemana, sesion: `Sesión ${d + 1}`, ejercicio: sets[0].exerciseName, rm: calcularRM(sets), tonelaje: calcularTonelaje(sets) })
  }))
  return filas
}

// ─── Rendimiento del ciclo ──────────────────────────────────────────────────

export const CATEGORIAS_COMPARACION = ['Empuje', 'Tracción', 'Brazo', 'Pierna', 'Cadera'] as const

/**
 * semanas en orden cronológico. Incremento = (media RM última semana − media RM primera) / primera.
 * Por categoría (del catálogo) = media de los incrementos de sus ejercicios.
 */
export function rendimientoCiclo (semanas: Array<{ semana: string; filas: FilaRendimiento[] }>, categoriaDe: (ejercicio: string) => string | undefined) {
  const grupos: Record<string, Record<string, FilaRendimiento[]>> = {}
  for (const { semana, filas } of semanas) {
    for (const f of filas) ((grupos[f.ejercicio] ??= {})[semana] ??= []).push(f)
  }
  const mediaRM = (a: FilaRendimiento[]) => a.reduce((x, f) => x + f.rm, 0) / a.length
  const incrementos: Array<{ ejercicio: string; incremento: number; semanas: number }> = []
  const medias: Array<{ ejercicio: string; mediaRM: number; semanas: number }> = []
  for (const [ejercicio, porSemana] of Object.entries(grupos)) {
    const ss = Object.values(porSemana)
    const ini = mediaRM(ss[0]); const fin = mediaRM(ss[ss.length - 1])
    incrementos.push({ ejercicio, incremento: (fin - ini) / ini, semanas: ss.length })
    medias.push({ ejercicio, mediaRM: mediaRM(ss.flat()), semanas: ss.length })
  }
  const porCat: Record<string, number[]> = {}
  for (const i of incrementos) { const c = categoriaDe(i.ejercicio); if (c != null) (porCat[c] ??= []).push(i.incremento) }
  const categorias = Object.entries(porCat).map(([categoria, l]) => ({ categoria, incremento: l.reduce((a, b) => a + b, 0) / l.length, ejercicios: l.length }))
  const comparacion = CATEGORIAS_COMPARACION.map(c => categorias.find(x => x.categoria === c)?.incremento || 0)
  return { incrementos, medias, categorias, comparacion }
}

// ─── Antropometría ──────────────────────────────────────────────────────────
// Los índices (pecho, bíceps dcho contraído, cadera y muslo dcho relajado ÷ cintura)
// ya existen en utils/anthropometricIndices.ts. Aquí solo el incremento del ciclo.

/** (último − inicial) / inicial para cada índice. */
export function incrementosAntropometria (inicial: Record<string, number | null>, ultimo: Record<string, number | null>) {
  return Object.keys(ultimo).map(k => ({
    medida: k,
    incremento: inicial[k] && ultimo[k] != null ? ((ultimo[k] as number) - (inicial[k] as number)) / (inicial[k] as number) : null
  }))
}
