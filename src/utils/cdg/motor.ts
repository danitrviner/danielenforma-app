/**
 * Motor de cálculo réplica de la plantilla "Índice de hipertrofia V4" (CulturaDeGym).
 *
 * IF  = índice de fatiga
 * IEM = índice de estímulo muscular (33 músculos)
 * IEA = índice de estrés ARTICULAR (11 zonas).
 *   ⚠️ OJO: no confundir con `utils/accumulatedStimulusIndex.ts`, que en la app
 *   también se llama "IEA" pero es el Índice de Estímulo Acumulado. Aquí se
 *   expone como `estresArticular` para que no se mezclen.
 *
 * Validado contra el motor original (9.000 casos, diferencia 0) y contra hojas
 * reales. Las rarezas del original se replican A PROPÓSITO para que los números
 * sean idénticos; están marcadas con «RAREZA DEL ORIGINAL».
 */

// ─── Catálogo ───────────────────────────────────────────────────────────────

export interface CdgMusculo { muscle: string; size: string; parentMuscle: string }

/** Formato compacto (catalogo-cdg.json). */
export interface CdgCatalogoCompacto {
  muscles: CdgMusculo[];
  joints: string[];
  exercises: Array<{
    id?: number | string;
    exercise: string;
    category?: string;
    subcategory?: string;
    link?: string;
    inestability: number | string;
    m: number[]; // 33 valores, mismo orden que `muscles`
    j: number[]; // 11 valores, mismo orden que `joints`
  }>;
}

export interface CdgEjercicio {
  id?: number | string;
  exercise: string;
  category?: string;
  subcategory?: string;
  link?: string;
  inestability: number | string;
  muscleStress: Array<CdgMusculo & { value: number }>;
  jointStress: Array<{ joint: string; value: number }>;
}

export function expandirCatalogo (c: CdgCatalogoCompacto): CdgEjercicio[] {
  return c.exercises.map(e => ({
    id: e.id, exercise: e.exercise, category: e.category, subcategory: e.subcategory, link: e.link,
    inestability: e.inestability,
    muscleStress: c.muscles.map((m, i) => ({ ...m, value: e.m[i] })),
    jointStress: c.joints.map((joint, i) => ({ joint, value: e.j[i] }))
  }))
}

// ─── Tablas ─────────────────────────────────────────────────────────────────

// RAREZA DEL ORIGINAL: el catálogo usa "Mediano" y esta tabla "Medio", así que
// los músculos medianos cuentan 0 en el IF. `corregirMediano: true` lo arregla
// (pero entonces deja de coincidir con el Excel).
export const FACTOR_TAMANO: Record<string, number> = {
  'Muy pequeño': 0.16, 'Pequeño': 0.33, 'Medio': 0.5, 'Grande': 1, 'Muy grande': 2, 'Enorme': 4
}
export const AJUSTE_INTENSIDAD: Record<number, number> = { 6: 0.73, 7: 0.53, 8: 0.41, 9: 0.25, 10: 0 }
export const INTENSIDAD_IEM: Record<number, number> = { 6: 0.95, 7: 1.85, 8: 2.55, 9: 2.95, 10: 3 }

export const TECNICAS = ['Normal', 'Reps parciales', 'Myo rep', 'Drop 1', 'Drop 2', 'Rest Pause 1', 'Rest Pause 2', 'Rest Pause 3', 'Rest Pause 4'] as const
export type CdgTecnica = typeof TECNICAS[number]

export const TECNICA_IF: Record<CdgTecnica, number> = {
  Normal: 1, 'Reps parciales': 1.15, 'Myo rep': 7, 'Drop 1': 3, 'Drop 2': 4,
  'Rest Pause 1': 2.5, 'Rest Pause 2': 5, 'Rest Pause 3': 8, 'Rest Pause 4': 12
}
export const TECNICA_IEM: Record<CdgTecnica, number> = {
  Normal: 1, 'Reps parciales': 1.1, 'Myo rep': 3.5, 'Drop 1': 1.8, 'Drop 2': 2.4,
  'Rest Pause 1': 2, 'Rest Pause 2': 2.75, 'Rest Pause 3': 3.5, 'Rest Pause 4': 4
}
export const TECNICA_SEGUNDOS: Record<CdgTecnica, number> = {
  Normal: 0, 'Reps parciales': 0, 'Myo rep': 180, 'Drop 1': 20, 'Drop 2': 20,
  'Rest Pause 1': 60, 'Rest Pause 2': 60, 'Rest Pause 3': 60, 'Rest Pause 4': 60
}
export const SEGUNDOS_BASE_SERIE = 60

const IF_FACTOR_REPS = [0.8, 1, 1.2, 1.4, 1.6] // ≤5, 6-12, 13-18, 19-25, ≥26
const tramoIF = (n: number) => (n <= 5 ? 0 : n <= 12 ? 1 : n <= 18 ? 2 : n <= 25 ? 3 : 4)
const CURVA_IEA = [1.8, 1.4, 1.2, 1, 0.8, 0.6] // 1, 2-4, 5-6, 7-12, 13-16, ≥17
const CURVA_IEA_INVERSA = [0.6, 0.8, 1, 1.2, 1.4, 1.8]
const ARTICULACIONES_INVERSAS = [1, 4] // hombro y rodilla "tendinoso compresivo"
const tramoIEA = (n: number) => (n <= 1 ? 0 : n <= 4 ? 1 : n <= 6 ? 2 : n <= 12 ? 3 : n <= 16 ? 4 : 5)

// RAREZA DEL ORIGINAL: RIR 5 no existe (no se convierte). RIR ≥ 6 se toma como RPE.
const RIR_A_RPE: Record<string, number> = { 0: 10, 1: 9, 2: 8, 3: 7, 4: 6, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10 }
export const rirARpe = (rir: number | string | null | undefined): number | undefined => RIR_A_RPE[String(rir ?? '').trim()]

// ─── Parseo (formato de la hoja) ────────────────────────────────────────────

export interface CdgReps { min: number; max: number; raw: string }

export function parsearReps (raw: string | number): CdgReps {
  const m = String(raw ?? '').match(/(\d{1,2})-?(\d{1,2})?/)
  if (!m) throw new Error(`Repeticiones no válidas: "${raw}"`)
  const min = parseInt(m[1])
  return { min, max: m[2] !== undefined ? parseInt(m[2]) : min, raw: String(raw) }
}

/** "4x2" o "2x2 2x0" → un RPE por serie (modo RIR por defecto, como la hoja). */
export function parsearEsfuerzo (series: number, texto: string, modo: 'RIR' | 'RPE' = 'RIR', avisos: string[] = []): Array<number | undefined> {
  const re = /(\d)x(10|[0-9])/g
  const lista: Array<number | undefined> = []
  let m: RegExpExecArray | null
  while ((m = re.exec(String(texto ?? ''))) !== null) {
    const raw = m[2]
    const rpe = modo === 'RPE' ? parseInt(raw) : rirARpe(raw)
    if (rpe === undefined) avisos.push(`Intensidad ${raw} no válida en modo RIR`)
    for (let i = 0; i < parseInt(m[1]); i++) lista.push(rpe)
  }
  if (!lista.length) throw new Error(`Formato de intensidad inválido: "${texto}"`)
  if (lista.length !== series) {
    avisos.push(`La columna RPE indica ${lista.length} series y la de series ${series}`)
    if (lista.length > series) lista.length = series
    else while (lista.length < series) lista.push(lista[lista.length - 1])
  }
  return lista
}

/** "1 Drop 1, 2 Reps parciales" → técnica por serie (se aplican a las primeras series). */
export function parsearTecnicas (series: number, texto: string | undefined, avisos: string[] = []): CdgTecnica[] {
  const out: CdgTecnica[] = []
  const str = String(texto ?? '').trim()
  if (str) {
    const re = /(\d) (Myo rep|Reps parciales|Drop 1|Drop 2|Rest Pause 1|Rest Pause 2|Rest Pause 3|Rest Pause 4|Normal)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(str)) !== null) for (let i = 0; i < parseInt(m[1]); i++) out.push(m[2] as CdgTecnica)
    if (!out.length) avisos.push('Técnicas mal escritas: formato "N Técnica", p.ej. "1 Drop 1"')
  }
  if (out.length > series) throw new Error('Hay más series con técnica que series totales')
  while (out.length < series) out.push('Normal')
  return out
}

// ─── Motor ──────────────────────────────────────────────────────────────────

export interface CdgSerie {
  exerciseName: string;
  rpe: number | undefined;
  repetitions: CdgReps;
  intensificationTechnique?: CdgTecnica | string;
}

export interface CdgValor { nombre: string; valor: number }
export interface CdgResultado {
  IF: number;
  IEM: number[];            // 33, orden del catálogo
  estresArticular: number[]; // 11, orden del catálogo (el "IEA" de la hoja)
  encontrado: boolean;
}

export interface CdgFila {
  nombre: string;
  series: number;
  reps: string;
  esfuerzo: string;   // "4x2"
  tecnicas?: string;  // "1 Drop 1"
  pausa?: string | number;
}

export interface OpcionesMotor { corregirMediano?: boolean }

export function crearMotor (catalogo: CdgEjercicio[], opciones: OpcionesMotor = {}) {
  if (!catalogo.length) throw new Error('Catálogo vacío')
  const porNombre = new Map(catalogo.map(d => [d.exercise, d]))
  const musculos = catalogo[0].muscleStress.map(m => m.muscle)
  const articulaciones = catalogo[0].jointStress.map(j => j.joint)
  const nM = musculos.length
  const nJ = articulaciones.length
  const ceros = (n: number) => new Array<number>(n).fill(0)

  const factorTamano = (size: string) =>
    opciones.corregirMediano && size === 'Mediano' ? 0.5 : (FACTOR_TAMANO[size] ?? 0)
  const ajuste = (rpe: number | undefined) => AJUSTE_INTENSIDAD[parseInt(String(rpe))] ?? 1

  function factorRepsIF ({ min, max }: CdgReps) {
    const a = tramoIF(min); const b = tramoIF(max ?? min)
    if (a === 0) return IF_FACTOR_REPS[0] // RAREZA DEL ORIGINAL: con mínimo ≤5 siempre 0.8
    let s = 0
    for (let k = a; k <= b; k++) s += IF_FACTOR_REPS[k]
    return s / (b - a + 1)
  }
  function factorRepsIEA ({ min, max }: CdgReps, inversa: boolean) {
    const curva = inversa ? CURVA_IEA_INVERSA : CURVA_IEA
    const a = tramoIEA(min); const b = tramoIEA(max ?? min)
    let s = 0
    for (let k = a; k <= b; k++) s += curva[k]
    return s / (b - a + 1)
  }

  function calcularSerie (serie: CdgSerie): CdgResultado {
    const d = porNombre.get(serie.exerciseName)
    if (!d) return { IF: 0, IEM: ceros(nM), estresArticular: ceros(nJ), encontrado: false }
    const tec = (serie.intensificationTechnique || 'Normal') as CdgTecnica
    const reps = serie.repetitions

    let IF = d.muscleStress.reduce((a, m) => a + factorTamano(m.size) * m.value, 0) + parseFloat(String(d.inestability))
    IF = IF - ajuste(serie.rpe) * IF
    IF *= TECNICA_IF[tec]
    IF *= factorRepsIF(reps)

    let iv = INTENSIDAD_IEM[parseInt(String(serie.rpe))] ?? 0
    if (reps.min < 5) iv = iv / 2
    const repsIEM = reps.min > 5 ? 1 : 0.6
    const IEM = d.muscleStress.map(m => m.value * iv * repsIEM * TECNICA_IEM[tec])

    const a = ajuste(serie.rpe)
    const estresArticular = d.jointStress.map((j, i) =>
      (j.value - j.value * a) * factorRepsIEA(reps, ARTICULACIONES_INVERSAS.includes(i)) * TECNICA_IF[tec])

    return { IF, IEM, estresArticular, encontrado: true }
  }

  /** Una fila de Programación tal cual se escribe en la hoja. */
  function calcularFila (fila: CdgFila, { modo = 'RIR' as 'RIR' | 'RPE' } = {}) {
    const avisos: string[] = []
    const reps = parsearReps(fila.reps)
    const rpes = parsearEsfuerzo(fila.series, fila.esfuerzo, modo, avisos)
    const tecs = parsearTecnicas(fila.series, fila.tecnicas, avisos)
    const series: CdgSerie[] = rpes.map((rpe, i) => ({ exerciseName: fila.nombre, rpe, repetitions: reps, intensificationTechnique: tecs[i] }))
    const res = sumar(series.map(calcularSerie))
    const segundos = series.reduce((acc, s) => acc + SEGUNDOS_BASE_SERIE + (parseInt(String(fila.pausa ?? '')) || 0) +
      (TECNICA_SEGUNDOS[s.intensificationTechnique as CdgTecnica] ?? 0), 0) *
      (fila.nombre.includes('unilateral') ? 2 : 1) // RAREZA DEL ORIGINAL: busca la palabra en el nombre
    return { ...res, series, tiempoSeg: segundos, avisos, encontrado: porNombre.has(fila.nombre) }
  }

  function sumar (rs: Array<Pick<CdgResultado, 'IF' | 'IEM' | 'estresArticular'>>) {
    return {
      IF: rs.reduce((a, r) => a + r.IF, 0),
      IEM: rs.reduce((acc, r) => acc.map((v, i) => v + r.IEM[i]), ceros(nM)),
      estresArticular: rs.reduce((acc, r) => acc.map((v, i) => v + r.estresArticular[i]), ceros(nJ))
    }
  }

  /**
   * Filtro "IEM (filtro)" de la hoja.
   * "[Compuesto] Glúteo mayor" → MEDIA de los músculos cuyo nombre lo contiene.
   * RAREZA DEL ORIGINAL: "[Compuesto] bíceps" lleva tilde y los músculos no → 0.
   */
  function filtroIEM (IEM: number[], filtro: string) {
    if (!filtro) return 0
    if (filtro.startsWith('[Compuesto] ')) {
      const p = filtro.replace('[Compuesto] ', '')
      const idx = musculos.map((m, i) => (m.includes(p) ? i : -1)).filter(i => i >= 0)
      return idx.length ? idx.reduce((a, i) => a + IEM[i], 0) / idx.length : 0
    }
    const i = musculos.indexOf(filtro)
    return i >= 0 ? IEM[i] : 0
  }
  const filtroEstresArticular = (v: number[], filtro: string) => {
    const i = articulaciones.indexOf(filtro)
    return filtro && i >= 0 ? v[i] : 0
  }

  return {
    musculos, articulaciones,
    existe: (n: string) => porNombre.has(n),
    descripcion: (n: string) => porNombre.get(n),
    calcularSerie, calcularFila, sumar, filtroIEM, filtroEstresArticular,
    factorRepsIF, factorRepsIEA
  }
}

export type MotorCdg = ReturnType<typeof crearMotor>

/** Columnas "IEM [COMPUESTO]" de Programación: SUMA (no media) de las porciones. */
export const COMPUESTOS: Record<string, number[]> = {
  Deltoides: [2, 3, 4], Pectoral: [5, 6, 7], Bíceps: [11, 12], Tríceps: [15, 16], Cuádriceps: [22, 23], 'Glúteo mayor': [26, 27]
}
export const iemCompuesto = (iem: number[]) =>
  Object.fromEntries(Object.entries(COMPUESTOS).map(([k, idx]) => [k, idx.reduce((a, i) => a + (iem[i] ?? 0), 0)]))
