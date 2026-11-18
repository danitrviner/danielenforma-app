import type { DosisDeZona, Mesocycle, MuscleGroup, WorkoutLog } from '../../types.js';
import { ZONAS_IEM, esZonaIem, type ZonaIem } from '../cdg/zonas.js';
import type { ProgresionEjercicio } from '../progresionDelBloque.js';
import { RUIDO_RM_PCT } from '../ruidoDeMedida.js';
import { REPS_MAX_RM, REPS_MIN_RM, RIR_MAX_RM, mediana } from '../rmValido.js';
import { addDays, diasEntreFechas } from '../trainingWeek.js';
import { redondearIem } from './cifras.js';
import {
  iniciosDeSemanaDelBloque, semanasFueraDelBloque, type EstadoDelBloque, type MesoParaEstado, type SemanaRealizada,
} from './estadoDelBloqueAnterior.js';
import { ordenarBloques, type BloqueConCierre } from './historial.js';
import { enLista, nombreCortoDeZona } from './tiposDeBloque.js';
import { rmDeLaZona, type ZonaDeEjercicio } from './veredicto.js';

/* ═══════════════════════════════════════════════════════════════════════════
   A qué responde cada atleta: dosis y respuesta por zona (18-11-2026)

   Idea de la formación de Heracles, pedida por Dani: al cerrar un bloque, ver
   si al atleta le va mejor con más VOLUMEN (series por semana), más
   FRECUENCIA (sesiones por semana en que trabaja la zona) o más CERCANÍA AL
   FALLO (RIR medio). Tres variables, no más.

   1. La FOTO de cada bloque (`dosisDelBloque`): por cada zona con algo de
      trabajo, con qué dosis se trabajó y cuánto mejoró (el mismo % de RM del
      veredicto, `rmDeLaZona`). Se guarda al firmar el cierre
      (`CierreDeHipotesis.dosis`); la del bloque que se cierra se calcula en
      vivo aunque no esté firmado.
   2. Los INDICIOS (`indiciosDeRespuesta`), de más a menos fiables:
        · la misma zona en dos bloques, si cambió UNA sola variable;
        · zonas distintas del mismo bloque (orientativo: un curl no mejora
          como una sentadilla), comparando medianas.
      Solo hay diferencia si es del ruido de medida (3 puntos) o más; por
      debajo, «sin diferencia», que también es información. «Se repite»
      cuando lo mismo sale en dos comparaciones independientes. Nunca una
      afirmación sin decir con cuántos casos.
   3. El PUNTO DE PARTIDA (`puntoDePartida`) de un primer bloque: 3-4 frases
      con lo que subió más y menos, lo que se quejó con poco volumen y por
      dónde seguir. Sin marcas, lo dice y no inventa.

   Todas las cifras de corte de abajo son CRITERIO PROPIO (no salen del curso
   ni las ha fijado Dani): están para no leer ruido y se pueden mover sin
   preguntarle. Puro: no lee ni escribe nada.
   ═══════════════════════════════════════════════════════════════════════════ */

// ── Cifras de corte (criterio propio) ────────────────────────────────────────

/**
 * Cambio de series por semana de una zona entre dos bloques a partir del cual
 * el volumen «cambió de verdad»: 2 series o un 20 % de las del bloque
 * anterior, lo que llegue antes. Propio: una serie suelta de diferencia en la
 * media cabe en una sesión saltada; el 20 % es para que en zonas pequeñas
 * (4 → 5 series) también cuente.
 */
export const CAMBIO_MINIMO_DE_SERIES = { series: 2, pct: 20 } as const;
/** Cambio de frecuencia (sesiones por semana) que ya cuenta: medio día por
 *  semana, una sesión más cada dos semanas. Propio. */
export const CAMBIO_MINIMO_DE_FRECUENCIA = 0.5;
/** Cambio de RIR medio que ya cuenta. Propio: el RIR que se apunta uno mismo
 *  falla en torno a una repetición (Halperin 2022, ver `rmValido.ts`); con
 *  tres cuartos de repetición de media el cambio ya no es de apuntar distinto. */
export const CAMBIO_MINIMO_DE_RIR = 0.75;

/** Entre zonas: frecuencia «alta» = la zona se trabaja este número de días por
 *  semana o más. Propio: es la frontera habitual de 1 contra 2 días. */
export const FRECUENCIA_ALTA = 2;
/** Entre zonas: RIR medio «cerca del fallo» = este o menos. Propio: la mitad
 *  del RIR 3 que se usa de techo en una semana normal. */
export const RIR_CERCA_DEL_FALLO = 1.5;
/** Entre zonas: mínimo de zonas con marca a cada lado de la comparación.
 *  Propio: con menos, una sola zona rara mueve la mediana. */
export const ZONAS_MINIMAS_POR_LADO = 3;

/** Diferencia de % de RM que ya es diferencia: el ruido de medida (3 puntos,
 *  `ruidoDeMedida.ts`). Por debajo, «sin diferencia». */
export const DIFERENCIA_MINIMA_RM = RUIDO_RM_PCT;
/** Comparaciones independientes en la misma dirección para que un indicio
 *  pase a «se repite». Propio: una sola es una pista, nunca una conclusión. */
export const VECES_PARA_SE_REPITE = 2;
/** Fracción de series con un RIR que diga algo por debajo de la cual el RIR
 *  medio de la zona no se da (`null`): más de la mitad sin dato. Propio. */
export const FRACCION_MINIMA_CON_RIR = 0.5;

// ── 1. La foto del bloque ────────────────────────────────────────────────────

/**
 * Ejercicio → zona por su grupo muscular principal (`ZONAS_IEM[].grupos`):
 * lo que se usa sin motor CDG, o para un ejercicio sin vínculo con él.
 */
export function zonaPorGrupo(grupo: MuscleGroup | string | null | undefined): ZonaIem | undefined {
  if (!grupo) return undefined;
  return ZONAS_IEM.find(z => (z.grupos as readonly string[]).includes(grupo))?.clave;
}

/**
 * La asignación ejercicio → zona de la foto: la del motor CDG si el ejercicio
 * está vinculado y, si no (o sin motor), la de su grupo muscular principal.
 * Así la foto sale igual sin motor y no pierde las series de un ejercicio sin
 * vínculo.
 */
export function zonaDeLaDosis(
  porMotor: Partial<Record<string, ZonaIem>>, grupoDe?: (exerciseId: string) => MuscleGroup | string | undefined,
): (exerciseId: string) => ZonaIem | undefined {
  return id => porMotor[id] ?? zonaPorGrupo(grupoDe?.(id));
}

/**
 * Las semanas de calendario del bloque y si cuentan, con las mismas reglas
 * que el cierre (`estadoDelBloqueAnterior`): fuera descargas, puentes, test,
 * la semana 1 de vuelta de un parón y la semana en curso a medias. No hace
 * falta el motor: sirve igual con y sin él.
 */
export function semanasDelBloque(
  meso: MesoParaEstado, o: { fin: string; hoy: string; logs?: readonly Pick<WorkoutLog, 'date'>[] },
): SemanaRealizada[] {
  const enCurso = o.hoy <= o.fin ? o.hoy : undefined;
  const fuera = semanasFueraDelBloque(meso);
  return iniciosDeSemanaDelBloque(meso, enCurso ?? o.fin).map(inicio => {
    const semana = Math.floor(diasEntreFechas(meso.startDate, inicio) / 7) + 1;
    const finSemana = addDays(inicio, 6);
    const esLaEnCurso = enCurso != null && inicio <= enCurso && finSemana >= enCurso;
    const motivo = semana < 1 || semana > meso.weeks ? 'fuera_del_bloque' as const
      : fuera.get(semana) ?? (esLaEnCurso ? 'en_curso' as const : null);
    const entrenada = (o.logs ?? []).some(l => l.date >= inicio && l.date <= finSemana);
    return { semana, inicio, cuenta: motivo === null, motivo, entrenada };
  });
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const zonaDeId = (zonaDe: ZonaDeEjercicio, id: string) => (typeof zonaDe === 'function' ? zonaDe(id) : zonaDe[id]);

export interface EntradaDeDosis {
  meso: MesoParaEstado;
  /** Los registros DEL BLOQUE (`logsDelBloque`). Las sesiones «fuera de mi
   *  gimnasio» cuentan: son trabajo hecho, aunque sus pesos no valgan para el RM. */
  logs: readonly WorkoutLog[];
  /** Último día real del bloque (`finDeBloque`). */
  fin: string;
  hoy: string;
  /** Ejercicio → zona principal (`zonaDeLaDosis`). */
  zonaDe: ZonaDeEjercicio;
  /** La progresión por ejercicio que ya calcula el cierre: de ahí el % de RM. */
  progresion: ReadonlyArray<Pick<ProgresionEjercicio, 'exerciseId' | 'nombre' | 'deltaPct' | 'metrica'>>;
  /** Cómo acaba el bloque por zona (con motor): de ahí el IEM medio. */
  estado?: Pick<EstadoDelBloque, 'porZona'> | null;
  /** Las semanas que cuentan, si ya están calculadas (`semanasDelBloque`). */
  semanas?: readonly SemanaRealizada[];
}

/**
 * La foto de «dosis y respuesta» de un bloque: una fila por zona con alguna
 * serie en las semanas que cuentan, en el orden de las zonas.
 *
 *  · seriesSemana: series principales (sin bajadas ni miniseries) de los
 *    ejercicios cuya zona principal es esta, de media sobre las semanas que
 *    cuentan (una semana sin entrenar cuenta con 0, igual que el IEM medio).
 *  · frecuencia: sesiones por semana, de media, con al menos una serie de la zona.
 *  · rirMedio: de esas series, al fallo = 0; un RIR guardado sin tocar
 *    (`rirApuntado === false`) no dice nada. Con más de la mitad sin dato, `null`.
 *  · iemMedio: el del estado del bloque (solo con motor).
 *  · rmPct y ejercicios: `rmDeLaZona` con la misma asignación.
 */
export function dosisDelBloque(e: EntradaDeDosis): DosisDeZona[] {
  const semanas = e.semanas ?? semanasDelBloque(e.meso, { fin: e.fin, hoy: e.hoy, logs: e.logs });
  const cuentan = semanas.filter(s => s.cuenta);
  if (cuentan.length === 0) return [];
  const enSemanaQueCuenta = (fecha: string) => cuentan.some(s => fecha >= s.inicio && fecha <= addDays(s.inicio, 6));

  const acumulado = new Map<ZonaIem, { series: number; sesiones: number; rirSuma: number; conRir: number }>();
  for (const l of e.logs) {
    if (!enSemanaQueCuenta(l.date)) continue;
    const enEstaSesion = new Set<ZonaIem>();
    for (const entrada of l.entries ?? []) {
      const zona = zonaDeId(e.zonaDe, entrada.exerciseId);
      if (!zona) continue;
      const principales = (entrada.sets ?? []).filter(s => !s.segmento && (Number(s.repsDone) || 0) > 0);
      if (principales.length === 0) continue;
      const a = acumulado.get(zona) ?? { series: 0, sesiones: 0, rirSuma: 0, conRir: 0 };
      for (const s of principales) {
        a.series++;
        if (s.alFallo) { a.conRir++; continue; }
        const rir = Number(s.rir);
        if (s.rirApuntado !== false && Number.isFinite(rir) && rir >= 0) { a.conRir++; a.rirSuma += rir; }
      }
      acumulado.set(zona, a);
      enEstaSesion.add(zona);
    }
    for (const z of enEstaSesion) acumulado.get(z)!.sesiones++;
  }

  const n = cuentan.length;
  return ZONAS_IEM.flatMap(z => {
    const a = acumulado.get(z.clave);
    if (!a || a.series === 0) return [];
    const rm = rmDeLaZona({ zona: z.clave, ejercicios: e.progresion, zonaDe: e.zonaDe });
    const iem = e.estado?.porZona[z.clave]?.iemMedio;
    return [{
      zona: z.clave,
      seriesSemana: r1(a.series / n),
      frecuencia: r1(a.sesiones / n),
      rirMedio: a.conRir / a.series > FRACCION_MINIMA_CON_RIR ? r1(a.rirSuma / a.conRir) : null,
      iemMedio: iem == null ? null : redondearIem(iem),
      rmPct: rm.rmPct,
      ejercicios: rm.ejercicios.length,
    }];
  });
}

// ── 2. Los indicios ──────────────────────────────────────────────────────────

export type VariableDeDosis = 'volumen' | 'frecuencia' | 'cercania_al_fallo';
export type AlcanceDeIndicio = 'misma_zona' | 'entre_zonas';
/**
 * Hacia dónde apunta: le fue mejor con MÁS de la variable (más series, más
 * días, más cerca del fallo), con MENOS, o igual (`sin_diferencia`: la
 * diferencia de RM no llega al ruido). `sin_atribuir`: cambiaron dos
 * variables a la vez entre los dos bloques y no se puede separar.
 */
export type DireccionDeIndicio = 'mas' | 'menos' | 'sin_diferencia' | 'sin_atribuir';
export type GradoDeIndicio = 'indicio' | 'se_repite';

/** Un bloque con su foto, para comparar. */
export interface FotoDeBloque {
  mesocycleId: string;
  /** «bloque 2», para las frases. */
  etiqueta: string;
  dosis: readonly DosisDeZona[];
}

/** Un lado de una comparación: el valor de la variable y la respuesta. */
export interface LadoDeCaso {
  /** Series por semana, días por semana o RIR medio (en `entre_zonas`, la mediana del lado). */
  valor: number;
  /** % de RM (en `entre_zonas`, la mediana del lado). */
  rmPct: number;
  /** Solo en `entre_zonas`: cuántas zonas hay en el lado. */
  zonas?: number;
}

export interface CasoDeIndicio {
  /** Los bloques comparados (uno en `entre_zonas`, dos en `misma_zona`), del más antiguo al más reciente. */
  bloques: string[];
  etiquetas: string[];
  zona?: ZonaIem;
  /** El lado con más de la variable (en cercanía, el de RIR más bajo) y el de menos. */
  mas: LadoDeCaso;
  menos: LadoDeCaso;
  /** `mas.rmPct − menos.rmPct`, en puntos. */
  diferencia: number;
  /** Solo en `sin_atribuir`: las variables que cambiaron a la vez, de antes a después. */
  cambios?: Array<{ variable: VariableDeDosis; antes: number; despues: number }>;
  /** Solo en `sin_atribuir`: el RM de antes y el de después. */
  rmAntes?: number;
  rmDespues?: number;
}

export interface IndicioDeRespuesta {
  id: string;
  /** La variable; `varias` solo con `sin_atribuir`. */
  variable: VariableDeDosis | 'varias';
  alcance: AlcanceDeIndicio;
  /** La zona, si todos los casos son de la misma. */
  zona?: ZonaIem;
  /** Las zonas de los casos (en `entre_zonas`, vacío). */
  zonas: ZonaIem[];
  direccion: DireccionDeIndicio;
  grado: GradoDeIndicio;
  /** Zonas distintas comparadas entre sí: siempre orientativo. */
  orientativo: boolean;
  casos: CasoDeIndicio[];
  /** Cuántos casos lo sostienen. */
  n: number;
  /** Lista para pantalla, sin los casos. */
  frase: string;
  /** Los casos con sus cifras, para entre paréntesis: «1 caso: …». */
  casosTexto: string;
}

const fmt = (v: number) => r1(v).toLocaleString('es-ES');
const pct = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt(Math.abs(v))} %`;
const casosDe = (n: number) => `${n} ${n === 1 ? 'caso' : 'casos'}`;
const nombre = (z: ZonaIem) => nombreCortoDeZona(z);
const mayuscula = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t);

const VALOR: Record<VariableDeDosis, (v: number) => string> = {
  volumen: v => `${fmt(v)} series/semana`,
  frecuencia: v => `${fmt(v)} días/semana`,
  cercania_al_fallo: v => `RIR ${fmt(v)}`,
};
const CORTO: Record<VariableDeDosis, string> = { volumen: 'series', frecuencia: 'días', cercania_al_fallo: 'RIR' };
const MAS: Record<VariableDeDosis, string> = {
  volumen: 'con más series por semana', frecuencia: 'con más días por semana', cercania_al_fallo: 'más cerca del fallo',
};
const MENOS: Record<VariableDeDosis, string> = {
  volumen: 'con menos series por semana', frecuencia: 'con menos días por semana', cercania_al_fallo: 'más lejos del fallo',
};
const PARECIDO: Record<VariableDeDosis, string> = {
  volumen: 'con más y con menos series por semana', frecuencia: 'con más y con menos días por semana', cercania_al_fallo: 'más cerca y más lejos del fallo',
};
const DE_LA_VARIABLE: Record<VariableDeDosis, string> = { volumen: 'las series', frecuencia: 'la frecuencia', cercania_al_fallo: 'el RIR' };

const direccionDe = (diferencia: number): DireccionDeIndicio =>
  Math.abs(diferencia) >= DIFERENCIA_MINIMA_RM ? (diferencia > 0 ? 'mas' : 'menos') : 'sin_diferencia';

/** ¿Cambió de verdad la variable entre dos fotos de la misma zona? */
function cambio(v: VariableDeDosis, a: DosisDeZona, b: DosisDeZona): { antes: number; despues: number } | null {
  if (v === 'volumen') {
    const d = Math.abs(b.seriesSemana - a.seriesSemana);
    const relativo = a.seriesSemana > 0 ? (d / a.seriesSemana) * 100 : Infinity;
    return d >= CAMBIO_MINIMO_DE_SERIES.series || relativo >= CAMBIO_MINIMO_DE_SERIES.pct ? { antes: a.seriesSemana, despues: b.seriesSemana } : null;
  }
  if (v === 'frecuencia') {
    return Math.abs(b.frecuencia - a.frecuencia) >= CAMBIO_MINIMO_DE_FRECUENCIA ? { antes: a.frecuencia, despues: b.frecuencia } : null;
  }
  if (a.rirMedio == null || b.rirMedio == null) return null;
  return Math.abs(b.rirMedio - a.rirMedio) >= CAMBIO_MINIMO_DE_RIR ? { antes: a.rirMedio, despues: b.rirMedio } : null;
}

const VARIABLES: readonly VariableDeDosis[] = ['volumen', 'frecuencia', 'cercania_al_fallo'];

interface Comparacion { alcance: AlcanceDeIndicio; variable: VariableDeDosis | 'varias'; direccion: DireccionDeIndicio; caso: CasoDeIndicio }

/** (a) La misma zona en dos bloques: cada bloque contra el anterior en que la zona tenía marca. */
function compararMismaZona(fotos: readonly FotoDeBloque[]): Comparacion[] {
  const out: Comparacion[] = [];
  for (const z of ZONAS_IEM) {
    let previa: { foto: FotoDeBloque; d: DosisDeZona } | null = null;
    for (const foto of fotos) {
      const d = foto.dosis.find(x => x.zona === z.clave);
      if (!d || d.rmPct == null) continue;
      if (previa) {
        const a = previa.d; const b = d;
        const cambios = VARIABLES.flatMap(v => { const c = cambio(v, a, b); return c ? [{ variable: v, ...c }] : []; });
        const base = { bloques: [previa.foto.mesocycleId, foto.mesocycleId], etiquetas: [previa.foto.etiqueta, foto.etiqueta], zona: z.clave };
        if (cambios.length === 1) {
          const { variable, antes, despues } = cambios[0];
          // «Más» de la variable: más series o días; en cercanía, el RIR más bajo.
          const despuesEsMas = variable === 'cercania_al_fallo' ? despues < antes : despues > antes;
          const mas = despuesEsMas ? { valor: despues, rmPct: b.rmPct! } : { valor: antes, rmPct: a.rmPct! };
          const menos = despuesEsMas ? { valor: antes, rmPct: a.rmPct! } : { valor: despues, rmPct: b.rmPct! };
          const diferencia = r1(mas.rmPct - menos.rmPct);
          out.push({ alcance: 'misma_zona', variable, direccion: direccionDe(diferencia), caso: { ...base, mas, menos, diferencia } });
        } else if (cambios.length > 1) {
          // Dos variables a la vez: se dice, y no se atribuye a ninguna.
          const diferencia = r1(b.rmPct! - a.rmPct!);
          out.push({
            alcance: 'misma_zona', variable: 'varias', direccion: 'sin_atribuir',
            caso: {
              ...base, mas: { valor: 0, rmPct: b.rmPct! }, menos: { valor: 0, rmPct: a.rmPct! }, diferencia,
              cambios, rmAntes: a.rmPct!, rmDespues: b.rmPct!,
            },
          });
        }
      }
      previa = { foto, d };
    }
  }
  return out;
}

/** (b) Zonas distintas del mismo bloque: mediana de un lado contra la del otro. */
function compararEntreZonas(fotos: readonly FotoDeBloque[]): Comparacion[] {
  const out: Comparacion[] = [];
  for (const foto of fotos) {
    const conMarca = foto.dosis.filter(d => d.rmPct != null);
    const lados: Array<[VariableDeDosis, DosisDeZona[], DosisDeZona[], (d: DosisDeZona) => number]> = [];
    // Frecuencia: 2 días o más contra menos de 2.
    lados.push(['frecuencia', conMarca.filter(d => d.frecuencia >= FRECUENCIA_ALTA), conMarca.filter(d => d.frecuencia < FRECUENCIA_ALTA), d => d.frecuencia]);
    // Volumen: la mitad con más series contra la mitad con menos (con un número impar, la del medio no entra).
    const porSeries = [...conMarca].sort((a, b) => b.seriesSemana - a.seriesSemana);
    const mitad = Math.floor(porSeries.length / 2);
    lados.push(['volumen', porSeries.slice(0, mitad), porSeries.slice(porSeries.length - mitad), d => d.seriesSemana]);
    // Cercanía al fallo: RIR medio de 1,5 o menos contra más de 1,5 (sin RIR, la zona no entra).
    const conRir = conMarca.filter(d => d.rirMedio != null);
    lados.push(['cercania_al_fallo', conRir.filter(d => d.rirMedio! <= RIR_CERCA_DEL_FALLO), conRir.filter(d => d.rirMedio! > RIR_CERCA_DEL_FALLO), d => d.rirMedio!]);

    for (const [variable, mas, menos, valorDe] of lados) {
      if (mas.length < ZONAS_MINIMAS_POR_LADO || menos.length < ZONAS_MINIMAS_POR_LADO) continue;
      const lado = (ds: DosisDeZona[]): LadoDeCaso => ({
        valor: r1(mediana(ds.map(valorDe))!), rmPct: r1(mediana(ds.map(d => d.rmPct!))!), zonas: ds.length,
      });
      const a = lado(mas); const b = lado(menos);
      const diferencia = r1(a.rmPct - b.rmPct);
      out.push({
        alcance: 'entre_zonas', variable, direccion: direccionDe(diferencia),
        caso: { bloques: [foto.mesocycleId], etiquetas: [foto.etiqueta], mas: a, menos: b, diferencia },
      });
    }
  }
  return out;
}

function textoDeCaso(c: Comparacion): string {
  const { caso } = c;
  if (c.variable === 'varias') {
    const cambios = (caso.cambios ?? []).map(x => `${CORTO[x.variable]} ${fmt(x.antes)} → ${fmt(x.despues)}`).join(', ');
    return `${nombre(caso.zona!).toLowerCase()}, ${caso.etiquetas.join(' → ')}: ${cambios}; RM ${pct(caso.rmAntes!)} → ${pct(caso.rmDespues!)}`;
  }
  const v = c.variable;
  if (c.alcance === 'entre_zonas') {
    return `${caso.etiquetas[0]}: ${pct(caso.mas.rmPct)} ${MAS[v]} (${caso.mas.zonas} zonas, mediana de ${VALOR[v](caso.mas.valor)}) `
      + `frente a ${pct(caso.menos.rmPct)} ${MENOS[v]} (${caso.menos.zonas} zonas, mediana de ${VALOR[v](caso.menos.valor)})`;
  }
  return `${nombre(caso.zona!).toLowerCase()}, ${caso.etiquetas.join(' → ')}: con ${VALOR[v](caso.menos.valor)} ${pct(caso.menos.rmPct)} `
    + `y con ${VALOR[v](caso.mas.valor)} ${pct(caso.mas.rmPct)}`;
}

function fraseDe(alcance: AlcanceDeIndicio, variable: VariableDeDosis | 'varias', direccion: DireccionDeIndicio, cs: readonly Comparacion[]): string {
  const zonas = [...new Set(cs.map(c => c.caso.zona).filter((z): z is ZonaIem => !!z))];
  const quien = mayuscula(enLista(zonas.map(z => nombre(z).toLowerCase())));
  if (variable === 'varias') {
    const vs = [...new Set(cs.flatMap(c => (c.caso.cambios ?? []).map(x => DE_LA_VARIABLE[x.variable])))];
    return `${quien}: cambiaron a la vez ${enLista(vs)}, así que no se puede saber cuál explica la diferencia de RM.`;
  }
  if (alcance === 'entre_zonas') {
    const corte = variable === 'frecuencia' ? `las zonas trabajadas ${FRECUENCIA_ALTA} o más días por semana`
      : variable === 'volumen' ? 'la mitad de las zonas con más series' : `las zonas con RIR medio de ${fmt(RIR_CERCA_DEL_FALLO)} o menos`;
    const otras = variable === 'frecuencia' ? `las de menos de ${FRECUENCIA_ALTA}`
      : variable === 'volumen' ? 'la mitad con menos' : 'las de más';
    const como = direccion === 'mas' ? 'subieron más que' : direccion === 'menos' ? 'subieron menos que' : 'subieron parecido a';
    return `Orientativo, comparando zonas distintas: ${corte} ${como} ${otras}.`;
  }
  const varias = zonas.length > 1;
  if (direccion === 'sin_diferencia') return `${quien}: ${varias ? 'subieron' : 'subió'} parecido ${PARECIDO[variable]}.`;
  return `${quien}: ${varias ? 'les' : 'le'} fue mejor ${direccion === 'mas' ? MAS[variable] : MENOS[variable]}.`;
}

const ORDEN_DIRECCION: Record<DireccionDeIndicio, number> = { mas: 0, menos: 0, sin_diferencia: 1, sin_atribuir: 2 };

/**
 * Los indicios de a qué responde el atleta. `bloques`: cada bloque con su
 * foto (los firmados con `dosis` más el que se cierra), del más antiguo al
 * más reciente (`fotosDeLosBloques` los da así).
 *
 * Los casos de la misma alcance, variable y dirección se juntan en un
 * indicio; con dos o más (dos zonas, dos pares de bloques o dos bloques en
 * la comparación entre zonas) pasa a «se repite». Lo que no se puede atribuir
 * va aparte, caso a caso, y nunca «se repite».
 */
export function indiciosDeRespuesta(bloques: readonly FotoDeBloque[]): IndicioDeRespuesta[] {
  const comparaciones = [...compararMismaZona(bloques), ...compararEntreZonas(bloques)];
  const grupos = new Map<string, Comparacion[]>();
  comparaciones.forEach((c, i) => {
    const clave = c.direccion === 'sin_atribuir' ? `sin_atribuir_${i}` : `${c.alcance}|${c.variable}|${c.direccion}`;
    grupos.set(clave, [...(grupos.get(clave) ?? []), c]);
  });
  const indicios: IndicioDeRespuesta[] = [...grupos.entries()].map(([id, cs]) => {
    const { alcance, variable, direccion } = cs[0];
    const zonas = [...new Set(cs.map(c => c.caso.zona).filter((z): z is ZonaIem => !!z))];
    const n = cs.length;
    return {
      id, variable, alcance,
      ...(zonas.length === 1 ? { zona: zonas[0] } : {}),
      zonas, direccion,
      grado: direccion !== 'sin_atribuir' && n >= VECES_PARA_SE_REPITE ? 'se_repite' : 'indicio',
      orientativo: alcance === 'entre_zonas',
      casos: cs.map(c => c.caso),
      n,
      frase: fraseDe(alcance, variable, direccion, cs),
      casosTexto: `${casosDe(n)}: ${cs.map(textoDeCaso).join('; ')}`,
    };
  });
  return indicios.sort((a, b) =>
    Number(b.grado === 'se_repite') - Number(a.grado === 'se_repite')
    || ORDEN_DIRECCION[a.direccion] - ORDEN_DIRECCION[b.direccion]
    || Number(a.alcance === 'entre_zonas') - Number(b.alcance === 'entre_zonas')
    || b.n - a.n);
}

/**
 * Los bloques con foto, del más antiguo al más reciente: los firmados con
 * `dosis` y, si se pasa, la foto en vivo del bloque que se cierra (manda
 * sobre la guardada de ese mismo bloque si no tiene). Solo los que empezaron
 * antes o a la vez que `hasta`: lo que se supo después no cuenta.
 */
export function fotosDeLosBloques(
  bloques: readonly BloqueConCierre[],
  o: { actual?: { mesocycleId: string; dosis: readonly DosisDeZona[] } | null; hasta?: string } = {},
): FotoDeBloque[] {
  return ordenarBloques(bloques)
    .filter(b => o.hasta == null || b.startDate <= o.hasta)
    .flatMap(b => {
      const guardada = b.cierreDeHipotesis?.dosis;
      const dosis = guardada?.length ? guardada : o.actual?.mesocycleId === b.id ? o.actual.dosis : null;
      return dosis?.length ? [{ mesocycleId: b.id, etiqueta: `bloque ${b.number}`, dosis }] : [];
    });
}

/** El mejor indicio que no se repite: el de más casos y, a igualdad, el de más diferencia. */
export function mejorIndicio(indicios: readonly IndicioDeRespuesta[]): IndicioDeRespuesta | null {
  const candidatos = indicios.filter(i => i.grado === 'indicio' && (i.direccion === 'mas' || i.direccion === 'menos'));
  const fuerza = (i: IndicioDeRespuesta) => Math.max(...i.casos.map(c => Math.abs(c.diferencia)));
  return [...candidatos].sort((a, b) =>
    Number(a.orientativo) - Number(b.orientativo) || b.n - a.n || fuerza(b) - fuerza(a))[0] ?? null;
}

/** Lo que enseña la ficha del atleta: los que se repiten y el mejor indicio. */
export function indiciosParaLaFicha(indicios: readonly IndicioDeRespuesta[]): IndicioDeRespuesta[] {
  const repiten = indicios.filter(i => i.grado === 'se_repite');
  const mejor = mejorIndicio(indicios);
  return mejor ? [...repiten, mejor] : repiten;
}

/** El pie fijo de la sección. */
export const PIE_DE_INDICIOS = 'Con pocos bloques son pistas, no conclusiones: cada una dice con cuántos casos se sostiene.';
/** La línea cuando no hay nada que decir. */
export const SIN_INDICIOS = 'Todavía no hay con qué comparar: hace falta al menos otro bloque cerrado o tres zonas con marca.';

/**
 * Lo que una zona con estrella saca de los indicios para el bloque
 * siguiente: solo los de la MISMA zona que se repiten EN ESA ZONA, con dos
 * casos suyos o más (los demás son pistas). Un «se repite» que junta zonas
 * distintas —pectoral una vez y deltoides otra— no basta para cambiarle la
 * palanca a ninguna de las dos: cada una lleva un solo caso propio.
 * `palanca`: la coherente si le fue mejor con más volumen o más cerca del
 * fallo; la frecuencia no es una palanca y se queda en `texto`.
 */
export function indicioParaLaZona(indicios: readonly IndicioDeRespuesta[], zona: ZonaIem): {
  palanca: 'volumen' | 'intensidad' | null; texto: string | null;
} {
  const casosSuyos = (i: IndicioDeRespuesta) => i.casos.filter(c => c.zona === zona).length;
  const suyos = indicios
    .filter(i => i.alcance === 'misma_zona' && i.zonas.includes(zona) && casosSuyos(i) >= VECES_PARA_SE_REPITE
      && (i.direccion === 'mas' || i.direccion === 'menos' || i.direccion === 'sin_diferencia'))
    .map(i => ({ ...i, n: casosSuyos(i) }));
  if (suyos.length === 0) return { palanca: null, texto: null };
  const textos = suyos.map(i => {
    const v = i.variable as VariableDeDosis;
    const que = i.direccion === 'sin_diferencia' ? `subió parecido ${PARECIDO[v]}` : `le fue mejor ${i.direccion === 'mas' ? MAS[v] : MENOS[v]}`;
    const extra = v === 'frecuencia' && i.direccion === 'mas' ? ' (recomendación: repartirla en más días; la frecuencia no es una palanca)' : '';
    return `se repite que ${que}${extra} (${casosDe(i.n)})`;
  });
  const aFavor = suyos
    .filter(i => i.direccion === 'mas' && (i.variable === 'volumen' || i.variable === 'cercania_al_fallo'))
    .sort((a, b) => b.n - a.n || Number(b.variable === 'volumen') - Number(a.variable === 'volumen'))[0];
  return {
    palanca: aFavor ? (aFavor.variable === 'volumen' ? 'volumen' : 'intensidad') : null,
    texto: `${textos.join('; ')}.`,
  };
}

/** Los indicios en corto, para el asistente. */
export function indiciosParaElAsistente(indicios: readonly IndicioDeRespuesta[]) {
  return indicios.map(i => ({
    grado: i.grado, alcance: i.alcance, variable: i.variable, direccion: i.direccion,
    ...(i.zonas.length ? { zonas: i.zonas } : {}), orientativo: i.orientativo, casos: i.n, frase: i.frase, cifras: i.casosTexto,
  }));
}

// ── 3. El punto de partida de un primer bloque ───────────────────────────────

export interface QuejaDeZona {
  /** Semanas en que las agujetas frenaron la zona. */
  semanasFrenadas?: number;
  /** Sesiones con molestia apuntada en sus ejercicios. */
  molestias?: number;
}

export interface PuntoDePartida {
  frases: string[];
  /** Ninguna zona con marca suficiente para el RM. */
  sinMarcas: boolean;
  /** Candidatas a estrella para el bloque siguiente, por orden. */
  candidatas: ZonaIem[];
}

/** Cuántas zonas se nombran como «las que más» y «las que menos». */
const ZONAS_POR_FRASE = 2;

/**
 * El punto de partida de un primer bloque (8 semanas), en 3-4 frases:
 *  1. qué zonas subieron más y cuáles menos (solo si la distancia supera el
 *     ruido; si no, que subieron parecido);
 *  2. las que se quejaron (agujetas que frenaron o molestias) con poco
 *     volumen: series por debajo o en la mediana del bloque (criterio propio);
 *  3. por dónde seguir: lo que pide el atleta y las que menos subieron.
 * Sin marcas no inventa: lo dice.
 */
export function puntoDePartida(foto: readonly DosisDeZona[], o: {
  pideElAtleta?: readonly ZonaIem[];
  quejas?: Partial<Record<string, QuejaDeZona>>;
} = {}): PuntoDePartida {
  const frases: string[] = [];
  const conMarca = foto.filter((d): d is DosisDeZona & { zona: ZonaIem; rmPct: number } => d.rmPct != null && esZonaIem(d.zona))
    .sort((a, b) => b.rmPct - a.rmPct);
  const sinMarcas = conMarca.length === 0;
  const lista = (ds: readonly { zona: ZonaIem; rmPct: number }[]) => enLista(ds.map(d => `${nombre(d.zona).toLowerCase()} (${pct(d.rmPct)})`));
  let menosSubieron: ZonaIem[] = [];

  if (sinMarcas) {
    frases.push(`Sin marcas suficientes para saber qué zonas subieron más: hace falta que apunte el RIR y haga series de ${REPS_MIN_RM} a ${REPS_MAX_RM} repeticiones a RIR ${RIR_MAX_RM} o menos.`);
  } else if (conMarca.length === 1) {
    frases.push(`Solo una zona con marca suficiente: ${lista(conMarca)}. Con una no se puede decir qué sube más.`);
  } else {
    const max = conMarca[0].rmPct; const min = conMarca[conMarca.length - 1].rmPct;
    if (max - min < DIFERENCIA_MINIMA_RM) {
      frases.push(`Las ${conMarca.length} zonas con marca subieron parecido (de ${pct(min)} a ${pct(max)}): ninguna se separa más que el ruido de medida.`);
    } else {
      // Las de arriba y las de abajo, sin solaparse y separadas más que el ruido.
      const arriba = conMarca.filter(d => d.rmPct - min >= DIFERENCIA_MINIMA_RM).slice(0, ZONAS_POR_FRASE);
      const abajo = conMarca.filter(d => max - d.rmPct >= DIFERENCIA_MINIMA_RM && !arriba.includes(d)).slice(-ZONAS_POR_FRASE).reverse();
      menosSubieron = abajo.map(d => d.zona);
      frases.push(`Lo que más subió: ${lista(arriba)}; lo que menos: ${lista(abajo)} (de ${conMarca.length} zonas con marca).`);
    }
  }

  // Quejas con poco volumen.
  const seriesMediana = mediana(foto.map(d => d.seriesSemana)) ?? 0;
  const quejas = foto.flatMap(d => {
    const q = o.quejas?.[d.zona];
    if (!q || !esZonaIem(d.zona) || d.seriesSemana > seriesMediana) return [];
    const que = [
      q.semanasFrenadas ? `agujetas que frenaron ${q.semanasFrenadas} ${q.semanasFrenadas === 1 ? 'semana' : 'semanas'}` : null,
      q.molestias ? `molestias en ${q.molestias} ${q.molestias === 1 ? 'sesión' : 'sesiones'}` : null,
    ].filter(Boolean).join(' y ');
    return que ? [`${nombre(d.zona).toLowerCase()} (${que} con ${VALOR.volumen(d.seriesSemana)})`] : [];
  });
  if (quejas.length) frases.push(`${quejas.length === 1 ? 'Se quejó' : 'Se quejaron'} con poco volumen: ${enLista(quejas)}. Ojo antes de ${quejas.length === 1 ? 'subirla' : 'subirlas'}.`);

  // Por dónde seguir.
  const pide = o.pideElAtleta ?? [];
  const candidatas = [...new Set([...pide, ...menosSubieron])];
  if (candidatas.length) {
    const porque = candidatas.map(z => `${nombre(z).toLowerCase()} (${[
      pide.includes(z) ? 'la pide' : null, menosSubieron.includes(z) ? 'de las que menos subieron' : null,
    ].filter(Boolean).join(' y ')})`);
    frases.push(`Por dónde seguir: candidatas a estrella, ${enLista(porque)}.`);
  } else {
    frases.push(sinMarcas
      ? 'Por dónde seguir: sin marcas no hay zona que destaque; manda lo que pida el atleta.'
      : 'Por dónde seguir: ninguna zona se queda atrás ni la pide el atleta; decide tú la estrella.');
  }
  return { frases, sinMarcas, candidatas };
}
