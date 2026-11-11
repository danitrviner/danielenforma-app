/**
 * «Matices» de un ejercicio del índice de hipertrofia (11-11).
 *
 * Lo que de verdad mueve el índice para un ejercicio: la inestabilidad, los 33
 * valores musculares y los 11 articulares (tabla a mano, sin fórmula). Aquí se
 * leen, se comparan dos ejercicios, se editan los «propios» viendo al momento
 * el IEM/IF de la serie de referencia, y se prepara el JSON que se guarda en
 * `cdgCatalogo/propios`. Sin fórmulas nuevas: todo pasa por `crearMotor`.
 *
 * «Unilateral» NO es un parámetro del índice: el motor solo duplica el TIEMPO
 * de la serie si el nombre lleva la palabra «unilateral» (en minúscula).
 */
import { crearMotor, parsearEsfuerzo, parsearReps, FACTOR_TAMANO, type CdgEjercicio, type CdgCatalogoCompacto } from './motor.js'
import { SERIE_DE_REFERENCIA } from './fichaEjercicio.js'
import { sinMusculos } from './emparejado.js'

export const SUFIJO_PROPIO = ' (propio)'
export const esPropio = (e: Pick<CdgEjercicio, 'exercise' | 'subcategory'>) =>
  e.subcategory === 'Propio' && e.exercise.endsWith(SUFIJO_PROPIO)
/** Réplica del motor: solo la palabra en minúscula duplica el tiempo. */
export const cuentaComoUnilateral = (nombre: string) => nombre.includes('unilateral')

/** Músculos con tamaño fuera de la tabla del IF (los «Mediano»: RAREZA DEL ORIGINAL) no suman al IF. */
export const sumaAlIF = (size: string) => (FACTOR_TAMANO[size] ?? 0) > 0

export interface ResultadoReferencia { IF: number; IEMTotal: number; IEM: number[]; estres: number[]; estresTotal: number }

/** IEM/IF/estrés de UNA serie de referencia (8-12 a RIR 1) de un ejercicio, editado o no. */
export function resultadoReferencia (e: CdgEjercicio): ResultadoReferencia {
  const r = crearMotor([e]).calcularSerie({
    exerciseName: e.exercise,
    rpe: parsearEsfuerzo(1, `1x${SERIE_DE_REFERENCIA.rir}`, 'RIR')[0],
    repetitions: parsearReps(SERIE_DE_REFERENCIA.reps)
  })
  const suma = (v: number[]) => v.reduce((a, x) => a + x, 0)
  return { IF: r.IF, IEMTotal: suma(r.IEM), IEM: r.IEM, estres: r.estresArticular, estresTotal: suma(r.estresArticular) }
}

export type Cambio =
  | { tipo: 'inestabilidad'; valor: number }
  | { tipo: 'musculo'; i: number; valor: number }
  | { tipo: 'articulacion'; i: number; valor: number }

export const LIMITES = { inestabilidad: 5, musculo: 5, articulacion: 2 } as const
const acotar = (v: number, max: number) => (Number.isFinite(v) ? Math.min(max, Math.max(0, Math.round(v * 100) / 100)) : 0)

/** Copia del ejercicio con un valor cambiado (acotado a los rangos del catálogo). */
export function conCambio (e: CdgEjercicio, c: Cambio): CdgEjercicio {
  if (c.tipo === 'inestabilidad') return { ...e, inestability: acotar(c.valor, LIMITES.inestabilidad) }
  if (c.tipo === 'musculo') return { ...e, muscleStress: e.muscleStress.map((m, i) => (i === c.i ? { ...m, value: acotar(c.valor, LIMITES.musculo) } : m)) }
  return { ...e, jointStress: e.jointStress.map((j, i) => (i === c.i ? { ...j, value: acotar(c.valor, LIMITES.articulacion) } : j)) }
}

export interface FilaComparada { nombre: string; a: number; b: number; dif: number }
export interface Comparacion {
  inestabilidad: FilaComparada; musculos: FilaComparada[]; articulaciones: FilaComparada[];
  ref: { a: ResultadoReferencia; b: ResultadoReferencia }
}
/** Dos ejercicios lado a lado: valores y resultado de la serie de referencia. */
export function comparar (a: CdgEjercicio, b: CdgEjercicio): Comparacion {
  const fila = (nombre: string, x: number, y: number): FilaComparada => ({ nombre, a: x, b: y, dif: y - x })
  return {
    inestabilidad: fila('Inestabilidad', Number(a.inestability) || 0, Number(b.inestability) || 0),
    musculos: a.muscleStress.map((m, i) => fila(m.muscle, m.value, b.muscleStress[i]?.value ?? 0)),
    articulaciones: a.jointStress.map((j, i) => fila(j.joint, j.value, b.jointStress[i]?.value ?? 0)),
    ref: { a: resultadoReferencia(a), b: resultadoReferencia(b) }
  }
}

// ─── JSON de cdgCatalogo/propios ────────────────────────────────────────────

type Compacto = CdgCatalogoCompacto['exercises'][number] & { base?: string; appId?: string }
const TOPE_BYTES = 900 * 1024

function leerPropios (jsonPropios: string | null | undefined, cat: CdgCatalogoCompacto): CdgCatalogoCompacto {
  if (!jsonPropios) return { muscles: cat.muscles, joints: cat.joints, exercises: [] }
  const p = JSON.parse(jsonPropios) as CdgCatalogoCompacto
  if (JSON.stringify(p.muscles) !== JSON.stringify(cat.muscles) || JSON.stringify(p.joints) !== JSON.stringify(cat.joints)) {
    throw new Error('Los ejercicios propios no usan los mismos músculos/articulaciones que el catálogo.')
  }
  return p
}
function cerrar (p: CdgCatalogoCompacto): { json: string; ejercicios: number } {
  const json = JSON.stringify(p)
  if (json.length > TOPE_BYTES) throw new Error('Los ejercicios propios superan el tamaño máximo del documento.')
  return { json, ejercicios: p.exercises.length }
}
const valoresDe = (e: CdgEjercicio) => ({
  inestability: Number(e.inestability) || 0, m: e.muscleStress.map(m => m.value), j: e.jointStress.map(j => j.value)
})

/** Guarda los valores editados de un propio que YA existe (por nombre). Conserva id, base, appId, link… */
export function actualizarPropio (jsonPropios: string | null | undefined, jsonCatalogo: string, editado: CdgEjercicio) {
  const cat = JSON.parse(jsonCatalogo) as CdgCatalogoCompacto
  const p = leerPropios(jsonPropios, cat)
  const i = p.exercises.findIndex(e => e.exercise === editado.exercise)
  if (i < 0) throw new Error(`«${editado.exercise}» no es un ejercicio propio: los del Excel no se editan.`)
  const v = valoresDe(editado)
  if (v.m.length !== cat.muscles.length || v.j.length !== cat.joints.length) throw new Error('Valores incompletos.')
  p.exercises[i] = { ...p.exercises[i], ...v }
  return cerrar(p)
}

/** «Press francés con mancuernas - Tríceps» + «Press francés apoyado» → «Press francés apoyado - Tríceps (propio)». */
export function nombreDeVariante (nombreBase: string, nombreCorto: string): string {
  const base = nombreBase.replace(/\s*\(propio\)$/, '')
  const musculos = base.slice(sinMusculos(base).length).replace(/^\s*-\s*/, '').trim()
  const corto = nombreCorto.trim().replace(/\s*\(propio\)$/, '')
  return `${corto}${musculos ? ` - ${musculos}` : ''}${SUFIJO_PROPIO}`
}

/** Añade un propio nuevo copiando los valores de `base` (del Excel o de otro propio). */
export function crearVariante (
  jsonPropios: string | null | undefined, jsonCatalogo: string, base: CdgEjercicio, nombreCorto: string, appId?: string
) {
  const cat = JSON.parse(jsonCatalogo) as CdgCatalogoCompacto
  const p = leerPropios(jsonPropios, cat)
  if (!nombreCorto.trim()) throw new Error('Falta el nombre de la variante.')
  const nombre = nombreDeVariante(base.exercise, nombreCorto)
  if (cat.exercises.some(e => e.exercise === nombre) || p.exercises.some(e => e.exercise === nombre)) {
    throw new Error(`Ya existe un ejercicio llamado «${nombre}».`)
  }
  const nuevo: Compacto = {
    id: `propio-${appId ?? nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
    exercise: nombre, category: base.category, subcategory: 'Propio', link: base.link,
    ...valoresDe(base), base: base.exercise, ...(appId ? { appId } : {})
  }
  p.exercises = [...p.exercises, nuevo]
  return { ...cerrar(p), nombre }
}

/** «a RIR 1 · 8–12 reps», para los textos de la ficha. */
export const SERIE_DE_REFERENCIA_TEXTO = `de ${SERIE_DE_REFERENCIA.reps.replace('-', '–')} repeticiones a RIR ${SERIE_DE_REFERENCIA.rir}`
