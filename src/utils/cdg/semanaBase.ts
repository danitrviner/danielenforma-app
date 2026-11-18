/**
 * Qué semana sirve de base al proponer el estímulo (IEM) de otra (F2, 17-11-2026).
 *
 * La regla de Dani del 25-10 es «el % va sobre lo PROGRAMADO la semana
 * anterior». Pero si esa semana es de descarga o puente, lo programado ya va
 * recortado a la mitad, y proponer un +10 % sobre media semana es mandar al
 * atleta a hacer poco más de la mitad de lo que venía haciendo. La base es la
 * última semana NORMAL anterior: la descarga y el puente no cuentan ni como
 * base ni como destino de una subida.
 *
 * Funciones puras, las mismas para Planificar (`usePropuestaIem`) y para el
 * asistente (`ai/tools/cdg`).
 */

export interface SemanasEspeciales { semanasDescarga?: number[]; semanasPivot?: number[] }

/**
 * Semana recortada a propósito, o `null` si es normal. Si coinciden, manda la
 * descarga (igual que `resolverEjercicioDelMeso`). Es la misma lectura que
 * `utils/tipoDeSemana.ts` (lado atleta), sin el parón: la primera semana tras
 * un parón no recorta series, solo sube el RIR.
 */
export function semanaRecortada (meso: SemanasEspeciales, semana: number): 'descarga' | 'puente' | null {
  if (meso.semanasDescarga?.includes(semana)) return 'descarga'
  if (meso.semanasPivot?.includes(semana)) return 'puente'
  return null
}

export const esDescargaOPuente = (meso: SemanasEspeciales, semana: number) => semanaRecortada(meso, semana) != null

/**
 * La semana de la que parte la propuesta para `semana`: la última anterior que
 * no es descarga ni puente. 0 = Base (la prescripción sin cambios por semana)
 * cuando no hay ninguna semana normal antes.
 */
export function semanaBaseDeIem (meso: SemanasEspeciales, semana: number): number {
  for (let s = semana - 1; s >= 1; s--) if (!esDescargaOPuente(meso, s)) return s
  return 0
}

/**
 * La semana desde la que se cuenta lo acumulado al programar `semana`: la
 * última puente YA PASADA (anterior a la que se programa) o, si no hay, la S1.
 * Una puente futura no reinicia nada todavía, y con dos manda la más reciente.
 */
export function semanaDePartidaDeIem (meso: SemanasEspeciales, semana: number): number {
  const pasadas = (meso.semanasPivot ?? []).filter(s => s >= 1 && s < semana)
  return pasadas.length ? Math.max(...pasadas) : 1
}

/** Semanas a las que se puede proponer una subida: de la 2 en adelante, sin descargas ni puentes. */
export function destinosDeProgresion (meso: SemanasEspeciales, vueltas: number): number[] {
  return Array.from({ length: Math.max(0, vueltas) }, (_, i) => i + 1).filter(s => s >= 2 && !esDescargaOPuente(meso, s))
}

/** Por qué no se propone subida en esa semana, para decírselo al coach o al asistente. `null` si es normal. */
export function motivoSinProgresion (meso: SemanasEspeciales, semana: number): string | null {
  const tipo = semanaRecortada(meso, semana)
  if (tipo === 'descarga') return `La S${semana} es de descarga: no se progresa en ella.`
  if (tipo === 'puente') return `La S${semana} es una semana puente: no se progresa en ella.`
  return null
}

/** «S3 (la S4 es de descarga)»: de dónde parte la propuesta cuando no es la semana anterior. `null` si lo es. */
export function avisoDeSemanaBase (meso: SemanasEspeciales, semana: number): string | null {
  const base = semanaBaseDeIem(meso, semana)
  if (base === semana - 1) return null
  const saltadas = Array.from({ length: semana - 1 - base }, (_, i) => base + 1 + i)
  const lista = saltadas.map(s => `S${s} (${semanaRecortada(meso, s)})`).join(', ')
  const desde = base === 0 ? 'lo programado en Base' : `lo programado en la S${base}`
  return `La subida se calcula sobre ${desde}, no sobre la semana anterior: ${lista} va${saltadas.length === 1 ? '' : 'n'} recortada${saltadas.length === 1 ? '' : 's'} a propósito y no sirve${saltadas.length === 1 ? '' : 'n'} de referencia.`
}
