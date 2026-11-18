/**
 * Agujetas por zona y la regla de freno / acelerador del curso.
 *
 * Escala del curso: 1 a 5 («apenas he notado trabajo» … «duele incluso en
 * reposo»). Se preguntan UNA VEZ A LA SEMANA en el módulo de agujetas de «Tu
 * semana» (paquete oficial): 1-5 por zona (`agujetas.<zona>`), con mapa corporal
 * y solo las zonas entrenadas (decisión de Dani 27-10, PR #20). Esas se usan tal
 * cual. Quien siga con el DOM's 0-10 por grupo (`doms.<grupo>`) también vale:
 * se convierte a 1-5 con max(1, round(v / 2)).
 *
 * Reglas (clase de seguimiento semanal del curso; el detalle, en `propuestaZona`):
 *   5 → freno: nunca subir; reducir o pausar la carga de esa zona (sin % fijo,
 *       decisión de Dani del 25-10). Es un aviso BLOQUEANTE (`Propuesta.bloqueante`):
 *       nada que trabaje la zona sube y la zona se enseña siempre.
 *   4 → zona propensa a agujetas (`sensible` en zonas.ts: isquios y aductores):
 *       esperar una semana y, si sigue sin recuperar, bajar. Zona no propensa
 *       (p. ej. deltoides): te pasas, bajar un 15-30 %.
 *   1-3 → margen para subir si el IF de la sesión y el contexto lo permiten.
 *       Sensibilidad estática: solo con un 1. Dinámica: con 1-3.
 *       Cuánto lo dice la velocidad (suave ~10 %, medio ~20 %, agresivo ~30 %).
 * Las agujetas no se leen a ciegas: los ejercicios en estiramiento y los tempos
 * excéntricos largos dan más agujetas con el mismo IEM.
 *
 * Desde el 17-11-2026 (hipótesis del bloque) el acelerador tiene además ritmo:
 * entre subida y subida van 2 semanas sostenidas como mínimo (meseta), y de la
 * segunda subida del bloque en adelante se repiten los PUNTOS de la primera,
 * no el porcentaje (curso, Caso 6). Las subidas no se guardan: se deducen de
 * lo programado semana a semana (`subidasDeLaZona`).
 */
import { ZONAS_IEM, type ZonaIem } from './zonas.js'
import { SEMANAS_ENTRE_SUBIDAS, SUBIDA_MINIMA } from '../hipotesisDeBloque/cifras.js'

/**
 * Tipo de bloque (guía del Índice de Hipertrofia, «tipos de bloque»): dos ejes
 * que antes iban juntos en una sola «actitud».
 *  - Sensibilidad: CUÁNDO se sube. Estático = solo con agujetas 1; dinámico = con 1-3.
 *  - Velocidad: CUÁNTO se sube. Suave ≈ +10 %, medio ≈ +20 %, agresivo hasta ≈ +30 %.
 */
export type Sensibilidad = 'estatico' | 'dinamico'
export type Velocidad = 'suave' | 'medio' | 'agresivo'
export interface TipoDeBloque { sensibilidad: Sensibilidad; velocidad: Velocidad }

/** Actitud de una sola pieza: la que guardaban los bloques creados antes de separar los ejes. */
export type ActitudBloque = 'estatico' | 'dinamico' | 'agresivo'
export const TIPO_POR_DEFECTO: TipoDeBloque = { sensibilidad: 'estatico', velocidad: 'suave' }

/** El tipo de un mesociclo: los campos nuevos o, si no hay, el que equivale a la actitud antigua. */
export function tipoDeBloque (m: { cdgSensibilidad?: Sensibilidad; cdgVelocidad?: Velocidad; cdgActitud?: ActitudBloque }): TipoDeBloque {
  const viejo: TipoDeBloque = m.cdgActitud === 'agresivo' ? { sensibilidad: 'dinamico', velocidad: 'agresivo' }
    : m.cdgActitud === 'dinamico' ? { sensibilidad: 'dinamico', velocidad: 'medio' }
      : TIPO_POR_DEFECTO
  return { sensibilidad: m.cdgSensibilidad ?? viejo.sensibilidad, velocidad: m.cdgVelocidad ?? viejo.velocidad }
}

/**
 * Modo (sensibilidad) de una zona (Dani, 25-10): lo que el coach haya puesto o,
 * por defecto, dinámico en las zonas que se priorizan (las que tienen objetivo
 * de IEM) y estático en el resto, que se mantienen.
 */
export function sensibilidadDeZona (
  m: { cdgModoPorZona?: Partial<Record<string, Sensibilidad>>; cdgObjetivosIem?: Partial<Record<string, number>> },
  zona: ZonaIem,
): Sensibilidad {
  return m.cdgModoPorZona?.[zona] ?? (m.cdgObjetivosIem?.[zona] != null ? 'dinamico' : 'estatico')
}

export const SENSIBILIDADES: Array<{ value: Sensibilidad; label: string; ayuda: string }> = [
  { value: 'estatico', label: 'Estático', ayuda: 'Solo se sube con agujetas de 1' },
  { value: 'dinamico', label: 'Dinámico', ayuda: 'Se sube con agujetas de 1 a 3' },
]
export const VELOCIDADES: Array<{ value: Velocidad; label: string; pct: number }> = [
  { value: 'suave', label: 'Suave (~10 %)', pct: 10 },
  { value: 'medio', label: 'Medio (~20 %)', pct: 20 },
  { value: 'agresivo', label: 'Agresivo (~30 %)', pct: 30 },
]

export interface PuntoSeñal { date: string; value: number }
export type SerieDeSeñal = (signalKey: string) => PuntoSeñal[]

export interface LecturaAgujetas {
  zona: ZonaIem
  valor: number
  fecha: string
  /** Lectura anterior de la misma zona (para ver si se recupera de una semana a otra). */
  anterior?: number
  /** Viene del cuestionario antiguo 0-10, convertido. */
  deEscala10: boolean
}

const r1 = (v: number) => Math.round(v * 10) / 10

export const aEscala5 = (v010: number) => Math.min(5, Math.max(1, Math.round(v010 / 2)))

const diasEntre = (desde: string, hasta: string) =>
  Math.round((Date.parse(`${hasta.slice(0, 10)}T00:00:00Z`) - Date.parse(`${desde.slice(0, 10)}T00:00:00Z`)) / 86_400_000)

/**
 * ¿La lectura `fechaAnterior` es de la semana previa a `fecha`? Otro día y a
 * 14 días como mucho (F16): «segunda semana seguida en 4» no puede salir de
 * comparar con una respuesta de hace dos meses.
 */
export function esLecturaDeLaSemanaPrevia (fechaAnterior: string, fecha: string, dias: number = UMBRALES_PROTOCOLO.diasAnteriorAgujetas): boolean {
  const d = diasEntre(fechaAnterior, fecha)
  return Number.isFinite(d) && d >= 1 && d <= dias
}

export function agujetasPorZona (serie: SerieDeSeñal): Partial<Record<ZonaIem, LecturaAgujetas>> {
  const out: Partial<Record<ZonaIem, LecturaAgujetas>> = {}
  for (const z of ZONAS_IEM) {
    const nuevas = serie(`agujetas.${z.clave}`).filter(p => p.value >= 1 && p.value <= 5)
    if (nuevas.length) {
      const u = nuevas[nuevas.length - 1]
      // La anterior es la última de OTRO día, y solo vale si es de la semana previa.
      const previa = [...nuevas].reverse().find(p => p.date.slice(0, 10) < u.date.slice(0, 10))
      out[z.clave] = {
        zona: z.clave, valor: u.value, fecha: u.date,
        anterior: previa && esLecturaDeLaSemanaPrevia(previa.date, u.date) ? previa.value : undefined, deEscala10: false,
      }
      continue
    }
    // Cuestionario antiguo: por fecha, el peor de los grupos de la zona.
    const porFecha = new Map<string, number>()
    for (const g of z.grupos) for (const p of serie(`doms.${g}`)) porFecha.set(p.date, Math.max(porFecha.get(p.date) ?? 0, p.value))
    const fechas = [...porFecha.keys()].sort()
    if (!fechas.length) continue
    const f = fechas[fechas.length - 1]; const fa = fechas[fechas.length - 2]
    out[z.clave] = {
      zona: z.clave, valor: aEscala5(porFecha.get(f)!), fecha: f,
      anterior: fa && esLecturaDeLaSemanaPrevia(fa, f) ? aEscala5(porFecha.get(fa)!) : undefined, deEscala10: true,
    }
  }
  return out
}

export type TonoPropuesta = 'freno' | 'vigilar' | 'mantener' | 'acelerar' | 'objetivo' | 'sin-dato'
export interface Propuesta {
  tono: TonoPropuesta
  texto: string
  /** Cambio de IEM propuesto en % (negativo = bajar). */
  pct?: number
  /** IEM semanal al que llevaría ese cambio. */
  iemPropuesto?: number
  /**
   * Aviso bloqueante (F6, 17-11-2026): agujetas de 5, duele en reposo. No lleva
   * % porque cuánto bajar lo decide el coach (Dani, 25-10), pero tampoco puede
   * desaparecer como un «mantener»: quien use la propuesta (Planificar, el
   * asistente) no sube NADA que trabaje esa zona y lo enseña.
   */
  bloqueante?: boolean
  /** La zona iba a subir pero está en meseta: subió hace menos de 2 semanas
   *  sostenidas. No lleva %: se mantiene y se vuelve a mirar la semana que viene. */
  enMeseta?: boolean
  /** Puntos de IEM que se suben cuando la subida repite los de la primera del
   *  bloque en vez del porcentaje (segunda subida y siguientes). */
  puntos?: number
  /** La zona no sube por UNA sesión de la que salió con 8 o más de cansancio
   *  (17-11-2026): cuál fue y su nota, para nombrarla y bajarle la fatiga. */
  sesionDura?: { etiqueta: string; valor: number }
}

export interface SubidaDeZona {
  /** Semana (vuelta) en la que el IEM programado de la zona pasó a un nivel nuevo. */
  semana: number
  de: number
  a: number
  /** Puntos de IEM que subió. */
  puntos: number
  pct: number
}

export interface SubidasDeLaZona {
  subidas: SubidaDeZona[]
  primera: SubidaDeZona | null
  ultima: SubidaDeZona | null
  /** Semanas normales que lleva en el nivel de la última subida antes de
   *  `destino`, contando la de la subida. `null` si no ha subido en el bloque. */
  semanasSostenidas: number | null
  /** Subió hace menos de `SEMANAS_ENTRE_SUBIDAS` semanas sostenidas: todavía no toca otra. */
  enMeseta: boolean
}

/**
 * Semanas que no cuentan al deducir las subidas: descargas y puentes (van
 * recortadas a propósito) y la semana 1 cuando arranca reducida o vuelve de
 * un parón (volver de ahí al nivel normal no es una subida).
 */
export function semanasFueraDeSubidas (meso: { semanasDescarga?: number[]; semanasPivot?: number[]; semana1Reducida?: boolean; vuelveDeParon?: boolean }): number[] {
  const fuera = new Set([...(meso.semanasDescarga ?? []), ...(meso.semanasPivot ?? [])])
  if (meso.semana1Reducida || meso.vuelveDeParon) fuera.add(1)
  return [...fuera].sort((x, y) => x - y)
}

/**
 * Las subidas de una zona en lo que va de bloque, DEDUCIDAS de su IEM
 * programado semana a semana (no se guarda nada nuevo). Una subida es una
 * semana normal en la que lo programado supera el nivel más alto que llevaba
 * en el bloque (en más de `SUBIDA_MINIMA`): volver a donde estaba después de
 * un freno no es subir. Solo se miran las semanas anteriores a `destino`, la
 * que se va a programar.
 */
export function subidasDeLaZona (o: {
  /** IEM programado de la zona en cada semana del bloque (índice 0 = S1). */
  programado: readonly number[]
  /** La semana para la que se propone. */
  destino: number
  /** Semanas que no cuentan (`semanasFueraDeSubidas`). */
  semanasFuera?: readonly number[]
}): SubidasDeLaZona {
  const fuera = new Set(o.semanasFuera ?? [])
  const normales: number[] = []
  for (let s = 1; s < o.destino && s <= o.programado.length; s++) if (!fuera.has(s)) normales.push(s)
  const subidas: SubidaDeZona[] = []
  let nivel = 0
  for (const s of normales) {
    const v = o.programado[s - 1] ?? 0
    if (nivel > 0.005 && v - nivel >= Math.max(SUBIDA_MINIMA.puntos, nivel * SUBIDA_MINIMA.pct / 100)) {
      subidas.push({ semana: s, de: r1(nivel), a: r1(v), puntos: r1(v - nivel), pct: r1((v / nivel - 1) * 100) })
    }
    if (v > nivel) nivel = v
  }
  const ultima = subidas[subidas.length - 1] ?? null
  const semanasSostenidas = ultima ? normales.filter(s => s >= ultima.semana).length : null
  return {
    subidas, primera: subidas[0] ?? null, ultima, semanasSostenidas,
    enMeseta: semanasSostenidas != null && semanasSostenidas < SEMANAS_ENTRE_SUBIDAS,
  }
}

/**
 * El % que se aplica de verdad a una zona en Planificar: el que ponga el coach
 * o, si no ha tocado nada, el sugerido. Con aviso bloqueante (agujetas de 5) no
 * hay sugerido y un % positivo se queda en 0: el coach solo decide cuánto BAJAR.
 */
export function pctEfectivo (propuesta: Propuesta, manual?: number): number {
  if (propuesta.bloqueante) return Math.min(0, manual ?? 0)
  return manual ?? propuesta.pct ?? 0
}

export type Contexto = 'favorable' | 'neutro' | 'desfavorable' | 'sin-dato'

/**
 * Umbrales del protocolo semanal, en un solo sitio (E-09). PENDIENTES DE
 * VALIDAR con la formación de Dani (decisión D15): la pantalla los marca así
 * hasta entonces. Fijos a propósito: no se editan desde la app (Dani, 23-10).
 */
export const UMBRALES_PROTOCOLO = {
  /** Contexto desfavorable si estrés ≥, sueño <, motivación ≤. */
  estresMalo: 7, sueñoMaloHoras: 6, motivacionMala: 4,
  /** Contexto favorable si estrés ≤, sueño ≥, motivación ≥ (todos los que haya). */
  estresBueno: 4, sueñoBuenoHoras: 7, motivacionBuena: 7,
  /** Fatiga al salir de las sesiones a partir de la cual no se sube el IEM: la
   *  media de la semana (todas las zonas) o una sesión suelta (las zonas que
   *  trabajó; auditoría de cifras, 17-11-2026). */
  fatigaPostAlta: 8,
  /** Con una base de IEM así de alta, la subida no pasa de `subidaMaxBaseAlta` %. */
  iemBaseAlta: 100, subidaMaxBaseAlta: 10,
  /** Una lectura de agujetas más antigua que esto ya no dice nada de la semana. */
  diasVigenciaAgujetas: 7,
  /** La lectura «anterior» de agujetas solo cuenta si es de la semana previa:
   *  como mucho estos días antes de la última (criterio propio, F16). */
  diasAnteriorAgujetas: 14,
  /** Estrés, sueño, motivación y cansancio al salir caducan a los 10 días
   *  (criterio propio, F16, 17-11-2026: el cuestionario es semanal, así que 10
   *  días cubren una respuesta que llega tarde pero no la de hace un mes).
   *  Caducada = «sin dato», no la última que hubiera. */
  diasVigenciaContexto: 10,
  /** Revisados por Dani el 27-10-2026 (son suyos, no del curso). */
  validados: true,
} as const

/** ¿La lectura de agujetas es de los últimos `diasVigenciaAgujetas` días? (fechas YYYY-MM-DD) */
export function agujetasVigentes (fechaLectura: string, hoy: string, dias: number = UMBRALES_PROTOCOLO.diasVigenciaAgujetas): boolean {
  const ms = Date.parse(`${hoy}T00:00:00Z`) - Date.parse(`${fechaLectura.slice(0, 10)}T00:00:00Z`)
  return Number.isFinite(ms) && ms >= 0 && ms <= dias * 86_400_000
}

/**
 * La última respuesta de una señal de contexto, si sigue vigente (F16). Antes
 * se tomaba la última sin mirar la fecha: un estrés de 8 de hace tres meses
 * seguía partiendo por la mitad todas las subidas.
 */
export function ultimaVigente (puntos: readonly PuntoSeñal[], hoy: string, dias: number = UMBRALES_PROTOCOLO.diasVigenciaContexto): PuntoSeñal | undefined {
  const u = puntos[puntos.length - 1]
  return u && agujetasVigentes(u.date, hoy, dias) ? u : undefined
}

/**
 * Contexto de la semana a partir del seguimiento (guía, paso 1 del protocolo):
 * dónde va el pie antes de mirar ninguna zona.
 */
export function contextoDeLaSemana (o: { estres?: number; sueñoHoras?: number; motivacion?: number }): { contexto: Contexto; motivos: string[] } {
  const { estres, sueñoHoras, motivacion } = o
  if (estres == null && sueñoHoras == null && motivacion == null) return { contexto: 'sin-dato', motivos: [] }
  const u = UMBRALES_PROTOCOLO
  const malos: string[] = []
  if (estres != null && estres >= u.estresMalo) malos.push(`estrés ${estres}/10`)
  if (sueñoHoras != null && sueñoHoras < u.sueñoMaloHoras) malos.push(`${sueñoHoras.toLocaleString('es-ES')} h de sueño`)
  if (motivacion != null && motivacion <= u.motivacionMala) malos.push(`motivación ${motivacion}/10`)
  if (malos.length) return { contexto: 'desfavorable', motivos: malos }
  const buenos = (estres == null || estres <= u.estresBueno) && (sueñoHoras == null || sueñoHoras >= u.sueñoBuenoHoras) && (motivacion == null || motivacion >= u.motivacionBuena)
  return { contexto: buenos ? 'favorable' : 'neutro', motivos: [] }
}

/**
 * Freno / acelerador de una zona: el protocolo semanal de la guía.
 *  1. Agujetas 5 (duele en reposo) → nunca subir; reducir o pausar esa carga,
 *     y cuánto lo decide el coach: sin % fijo (Dani, 25-10). Si la subida vino
 *     de ejercicios en estiramiento, quitar estiramiento antes que series.
 *  2. Agujetas 4: en zona propensa (isquios, aductores) se espera una semana;
 *     en el resto, bajar 15-30 %.
 *  3. Fatiga al salir de las sesiones 8-9 o más → no subir IEM: bajar IF manteniéndolo.
 *     Si el cansancio viene por sesión (D6r), se dice de cuál y se baja ESA.
 *     Dos alcances (auditoría de cifras, 17-11-2026): la MEDIA de la semana en
 *     8 o más frena todas las zonas, como hasta ahora; y UNA sesión en 8 o más
 *     frena solo las zonas que se trabajaron en ella (`sesionDura`), aunque la
 *     media deje margen. Antes solo contaba la media, que pide que casi todas
 *     las sesiones sean de 8; el curso lo mira sesión a sesión.
 *  4. Contexto desfavorable → el curso no lo veta, lo hace más prudente: la mitad
 *     del %, con aviso (Dani, 27-10). Un mal momento puntual tampoco obliga a bajar.
 *  5. Se sube si lo permite la sensibilidad (estático: 1; dinámico: 1-3), lo que
 *     diga la velocidad, a la mitad con contexto neutro. Con una base alta
 *     (≥ 100) no más de un 10 %: se mantienen los puntos añadidos, no el porcentaje.
 *  6. El IEM objetivo de la zona (Volumen) es la meta: la subida no lo pasa, y
 *     si ya llega, el motor no propone y decide el coach (Dani, 25-10).
 *  7. Meseta (17-11-2026): si la zona subió hace menos de 2 semanas sostenidas,
 *     no se propone otra subida todavía. Los frenos van siempre por delante.
 *  8. Puntos (curso, Caso 6): de la segunda subida del bloque en adelante se
 *     repiten los PUNTOS de la primera, no el porcentaje, y nunca más de lo que
 *     daría el porcentaje (contexto y base alta incluidos).
 */
export function propuestaZona (o: {
  agujetas?: number; anterior?: number; sensible: boolean; tipo: TipoDeBloque; esObjetivo: boolean;
  iem?: number; contexto?: Contexto
  /** Cansancio al salir (0-10): la media de las sesiones de la semana o, si no
   *  lo apuntó por sesión, la cifra del cuestionario semanal. */
  fatigaPost?: number
  /** La sesión de la que salió más cansado («la del jueves, Pierna A») y su
   *  nota, cuando el cansancio viene por sesión (D6r): el freno la nombra. */
  sesionMasCansada?: { etiqueta: string; valor: number }
  /** La sesión de la semana con 8 o más de cansancio que trabajó ESTA zona
   *  (`sesionesDurasPorZona`, la más dura si hay varias). Frena la zona aunque
   *  la media de la semana no llegue al umbral. */
  sesionDura?: { etiqueta: string; valor: number }
  /** IEM semanal objetivo de la zona (`Mesocycle.cdgObjetivosIem`), si lo hay. */
  objetivo?: number
  /** Semana 1 de un bloque tras un parón (`Mesocycle.vuelveDeParon`): el curso
   *  pide no apretar el freno de golpe, el pico de agujetas suele normalizarse solo (P5). */
  primeraSemanaTrasParon?: boolean
  /** Las subidas ya programadas de la zona en este bloque (`subidasDeLaZona`):
   *  de ahí salen la meseta y los puntos. Sin él, como siempre. */
  subidas?: Pick<SubidasDeLaZona, 'primera' | 'semanasSostenidas' | 'enMeseta'>
}): Propuesta {
  const { agujetas: a, anterior, sensible, tipo, esObjetivo, iem = 0, contexto = 'sin-dato', fatigaPost, sesionMasCansada, objetivo, primeraSemanaTrasParon, subidas } = o
  const nota10 = (v: number) => r1(v).toLocaleString('es-ES')
  // Solo cuenta si de verdad pasa del umbral: quien llama puede pasar la más cansada sin filtrar.
  const sesionDura = o.sesionDura && o.sesionDura.valor >= UMBRALES_PROTOCOLO.fatigaPostAlta ? o.sesionDura : undefined
  const con = (pct: number) => (iem > 0.005 ? { pct, iemPropuesto: r1(iem * (1 + pct / 100)) } : { pct })
  if (a == null) {
    return {
      tono: 'sin-dato',
      texto: `Sin agujetas registradas: decide con la recuperación entre sesiones y el rendimiento.${sesionDura ? ` Ojo: salió muy cansado de ${sesionDura.etiqueta} (${nota10(sesionDura.valor)}/10), que trabaja esta zona; no la subas sin bajarle antes la fatiga (IF) a esa sesión.` : ''}`,
      ...(sesionDura ? { sesionDura } : {}),
    }
  }
  if (a >= 4 && primeraSemanaTrasParon) {
    return { tono: 'vigilar', texto: 'Primera semana tras un parón: el pico de agujetas es normal y suele normalizarse solo. No frenes de golpe; espera a la semana que viene y anótalo.' }
  }
  // Sin % a propósito (Dani, 25-10), pero bloqueante: frena MÁS que un 4, no menos (F6).
  if (a >= 5) return { tono: 'freno', bloqueante: true, texto: 'Duele incluso en reposo: no subir. Reduce o pausa la carga de esta zona y mira cómo evoluciona; tú decides cuánto. Si la subida vino de ejercicios en estiramiento, quita estiramiento antes que series.' }
  if (a >= 4) {
    if (!sensible) return { tono: 'freno', texto: 'No es una zona propensa a agujetas: con un 4 te estás pasando. Bajar su IEM un 15-30 %.', ...con(-20) }
    if (anterior != null && anterior >= 4) return { tono: 'freno', texto: 'Segunda semana seguida en 4 o más: no se recupera. Bajar su IEM un 15-30 %.', ...con(-20) }
    return { tono: 'vigilar', texto: 'Zona propensa a agujetas (trabajo en estiramiento): esperar una semana y anotarlo. Si sigue en 4, bajar.' }
  }
  if (fatigaPost != null && fatigaPost >= UMBRALES_PROTOCOLO.fatigaPostAlta) {
    const nota = r1(fatigaPost).toLocaleString('es-ES')
    // Con el cansancio por sesión se sabe CUÁL bajar: el curso pide quitarle fatiga a esa antes de subir nada.
    if (sesionMasCansada) {
      return { tono: 'mantener', texto: `Sale muy cansado de las sesiones (${nota}/10 de media; ${sesionMasCansada.etiqueta}: ${r1(sesionMasCansada.valor).toLocaleString('es-ES')}/10). No subir el IEM sin bajar antes la fatiga (IF) de esa sesión, manteniendo su IEM.` }
    }
    return { tono: 'mantener', texto: `Sale muy cansado de las sesiones (${nota}/10): no subir el IEM. Si puedes, baja el IF de la sesión manteniendo el IEM.` }
  }
  // La media deja margen, pero de UNA sesión que trabaja esta zona salió con 8
  // o más: se frena esta zona (y solo las de esa sesión), y se dice cuál bajar.
  if (sesionDura) {
    return {
      tono: 'mantener', sesionDura,
      texto: `Salió muy cansado de una sesión que trabaja esta zona (${sesionDura.etiqueta}: ${nota10(sesionDura.valor)}/10). No subir su IEM: baja antes la fatiga (IF) de esa sesión, manteniendo su IEM.`,
    }
  }
  const umbral = tipo.sensibilidad === 'dinamico' ? 3 : 1
  if (a > umbral) return { tono: 'mantener', texto: tipo.sensibilidad === 'estatico' && a <= 3 ? 'Mantener: en un bloque estático solo se sube con agujetas de 1.' : 'Mantener el IEM.' }
  if (objetivo != null && objetivo > 0 && iem >= objetivo - 0.05) {
    return { tono: 'objetivo', texto: `Ya llega a su objetivo de ${r1(objetivo).toLocaleString('es-ES')}: decide tú si sigue subiendo.` }
  }
  if (subidas?.enMeseta) {
    const n = subidas.semanasSostenidas ?? 0
    return {
      tono: 'mantener', enMeseta: true,
      texto: `Mantener: lleva ${n === 1 ? 'una semana' : `${n} semanas`} en el nivel nuevo y entre subida y subida van ${SEMANAS_ENTRE_SUBIDAS} sostenidas como mínimo.`,
    }
  }
  let pct = VELOCIDADES.find(v => v.value === tipo.velocidad)!.pct
  const notas: string[] = []
  if (contexto !== 'favorable') {
    pct = Math.round(pct / 2)
    notas.push(contexto === 'desfavorable' ? 'contexto desfavorable: si subes, poco; si se repite varias semanas, baja' : contexto === 'neutro' ? 'contexto neutro: la mitad' : 'sin datos de contexto: la mitad')
  }
  if (iem >= UMBRALES_PROTOCOLO.iemBaseAlta && pct > UMBRALES_PROTOCOLO.subidaMaxBaseAlta) { pct = UMBRALES_PROTOCOLO.subidaMaxBaseAlta; notas.push('base alta: mantén los puntos añadidos, no repitas el porcentaje') }
  // Segunda subida del bloque y siguientes: los puntos de la primera, no el
  // porcentaje. Con el contexto en contra, la mitad, igual que el %; y nunca
  // más de lo que daría el % (si la primera fue un salto a mano, no se repite).
  let puntos: number | undefined
  const deLaPrimera = subidas?.primera?.puntos
  if (deLaPrimera != null && deLaPrimera > 0 && iem > 0.005) {
    puntos = Math.min(deLaPrimera * (contexto === 'favorable' ? 1 : 0.5), iem * pct / 100)
    pct = Math.max(1, Math.round(puntos / iem * 100))
    notas.push(`se repiten los puntos de la primera subida del bloque (S${subidas!.primera!.semana}), no el porcentaje`)
  }
  if (iem > 0.005 && iem < 10) notas.push('zona poco trabajada: admite subidas mucho mayores')
  if (objetivo != null && objetivo > 0 && iem > 0.005 && iem * (1 + pct / 100) > objetivo) {
    // Hacia abajo: la subida no pasa del objetivo (1e-9 por el redondeo de coma flotante).
    pct = Math.max(1, Math.floor((objetivo / iem - 1) * 100 + 1e-9))
    if (puntos != null) puntos = Math.min(puntos, objetivo - iem)
    notas.push(`hasta su objetivo de ${r1(objetivo).toLocaleString('es-ES')}`)
  }
  const cuanto = puntos != null ? `+${r1(puntos).toLocaleString('es-ES')} puntos (~${pct} %)` : `~${pct} %`
  return {
    tono: 'acelerar',
    texto: `Margen para subir el IEM ${cuanto}${esObjetivo ? ' (zona objetivo)' : ''}${notas.length ? ` · ${notas.join(' · ')}` : ''}. Comprueba que el IF de la sesión lo admite.`,
    ...con(pct),
    ...(puntos != null ? { puntos: r1(puntos) } : {}),
  }
}
