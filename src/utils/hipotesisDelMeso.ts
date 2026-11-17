import { MUSCLE_ORDER, type ExperienceLevel, type HipotesisDeZona, type Mesocycle, type MuscleGroup, type MuscleGroupConfig, type TipoDeBloque, type WorkoutLog } from '../types.js';
import { ZONAS_IEM, ZONA_POR_CLAVE, esZonaIem, type ZonaIem } from './cdg/zonas.js';
import { proponerHipotesis, type PropuestaDeHipotesis, type TratoDelResto } from './hipotesisDeBloque/proponerHipotesis.js';
import { avisoDeEstrellas, estrellasDe, modoPorZonaDe, objetivoDerivado, type AvisoDeEstrellas } from './hipotesisDeBloque/tiposDeBloque.js';
import type { EstadoDelBloque } from './hipotesisDeBloque/estadoDelBloqueAnterior.js';
import type { BloqueConCierre } from './hipotesisDeBloque/historial.js';
import type { Velocidad } from './cdg/agujetas.js';
import { procesoEnCurso } from './hipotesisDeBloque/procesoEnCurso.js';
import { finDeBloque } from './finDeBloque.js';
import { addDays, diasEntreFechas } from './trainingWeek.js';

/* ═══════════════════════════════════════════════════════════════════════════
   La hipótesis del bloque, vista desde el editor de mesociclos (17-11-2026)

   El motor (`utils/hipotesisDeBloque/`) razona por ZONAS (las del IEM); el
   editor, por GRUPOS musculares (`Mesocycle.groups`, con su prioridad). Este
   archivo es el puente entre los dos y nada más:

     · los cuatro niveles de prioridad y cómo se llaman en pantalla;
     · qué zonas llevan estrella (una zona la lleva si alguno de sus grupos
       está en ⭐ Especializar) y qué se hace con las demás;
     · qué se escribe al confirmar las hipótesis: `hipotesis`, y a juego el
       techo en `cdgObjetivosIem` y el modo por zona, que es lo que lee el
       protocolo semanal;
     · los valores por defecto de un bloque nuevo (inicio, parón, ejercicios
       nuevos) para la sugerencia de la semana 1 reducida.

   Puro: no lee ni escribe nada. Lo alcanza el asistente (que corre también en
   `api/`), así que solo importa con `.js`.
   ═══════════════════════════════════════════════════════════════════════════ */

// ── Los cuatro niveles de prioridad ─────────────────────────────────────────

export type PrioridadDeGrupo = MuscleGroupConfig['priority'];

export interface DefDePrioridad {
  valor: PrioridadDeGrupo;
  icono: string;
  etiqueta: string;
  /** Qué pasa con el grupo, en corto (vista compacta del resto). */
  queHace: string;
}

/** En el orden en que se ofrecen. Los valores guardados no cambian (no hay migración). */
export const PRIORIDADES: readonly DefDePrioridad[] = [
  { valor: 'alta', icono: '⭐', etiqueta: 'Especializar', queHace: 'lleva hipótesis' },
  { valor: 'media', icono: '◑', etiqueta: 'Desarrollar', queHace: 'mismo estímulo' },
  { valor: 'baja', icono: '⚪', etiqueta: 'Mantener', queHace: 'la mitad de lo que hacía' },
  { valor: 'ignorar', icono: '⊘', etiqueta: 'Ignorar', queHace: 'ignorado' },
];

export const PRIORIDAD = Object.fromEntries(PRIORIDADES.map(p => [p.valor, p])) as Record<PrioridadDeGrupo, DefDePrioridad>;

/** La leyenda corta: «⭐ Especializar · ◑ Desarrollar · ⚪ Mantener · ⊘ Ignorar». */
export const LEYENDA_DE_PRIORIDADES = PRIORIDADES.map(p => `${p.icono} ${p.etiqueta}`).join(' · ');

/** La siguiente al pulsar un selector que va rotando. */
export function siguientePrioridad(p: PrioridadDeGrupo): PrioridadDeGrupo {
  const i = PRIORIDADES.findIndex(x => x.valor === p);
  return PRIORIDADES[(i + 1) % PRIORIDADES.length].valor;
}

/** Ignorar = 0 series y fuera de sugerencias, avisos de balance y reparto. */
export const esIgnorado = (cfg: Pick<MuscleGroupConfig, 'priority'> | undefined | null): boolean => cfg?.priority === 'ignorar';

/** Las series de un grupo que cuentan: las de un grupo ignorado, ninguna. */
export const seriesQueCuentan = (cfg: Pick<MuscleGroupConfig, 'priority' | 'series'> | undefined | null): number =>
  !cfg || esIgnorado(cfg) ? 0 : (cfg.series ?? 0);

// ── Estrellas: de grupos a zonas ────────────────────────────────────────────

type Grupos = Partial<Record<MuscleGroup, Pick<MuscleGroupConfig, 'priority' | 'series'>>>;

const gruposDeZona = (z: ZonaIem) => ZONA_POR_CLAVE[z].grupos as readonly MuscleGroup[];

/** Las zonas con estrella: las que tienen algún grupo en ⭐ Especializar, en el orden de `ZONAS_IEM`. */
export function zonasConEstrella(groups: Grupos | undefined): ZonaIem[] {
  return ZONAS_IEM.map(z => z.clave).filter(z => gruposDeZona(z).some(g => groups?.[g]?.priority === 'alta'));
}

/**
 * Qué se hace con cada zona SIN estrella, según la prioridad de sus grupos:
 * todos ignorados → ignorar; todos en mantener (o ignorados) → mantener; si
 * alguno sigue en desarrollar → como estaba. Lo que va a `proponerHipotesis`.
 */
export function tratoDelRestoPorZona(groups: Grupos | undefined): Partial<Record<ZonaIem, TratoDelResto>> {
  const out: Partial<Record<ZonaIem, TratoDelResto>> = {};
  for (const z of ZONAS_IEM) {
    const ps = gruposDeZona(z.clave).map(g => groups?.[g]?.priority ?? 'media');
    if (ps.includes('alta')) continue;
    out[z.clave] = ps.every(p => p === 'ignorar') ? 'ignorar' : ps.every(p => p === 'baja' || p === 'ignorar') ? 'mantener' : 'como_estaba';
  }
  return out;
}

/** El aviso de estrellas de un bloque (sustituye al viejo «más de 3 en alta»). Sin tipo, desarrollo. */
export function avisoDeEstrellasDelMeso(meso: { groups?: Grupos; tipoBloque?: TipoDeBloque }): AvisoDeEstrellas | null {
  return avisoDeEstrellas(meso.tipoBloque ?? 'desarrollo', zonasConEstrella(meso.groups).length);
}

// ── El bloque anterior y los valores por defecto de uno nuevo ───────────────

/** El bloque del mismo atleta que empieza justo antes que este (`null` si es el primero). */
export function mesoAnteriorA<M extends Pick<Mesocycle, 'id' | 'startDate' | 'number'>>(meso: M, mesos: readonly M[]): M | null {
  const antes = mesos.filter(m => m.id !== meso.id && (m.startDate < meso.startDate || (m.startDate === meso.startDate && m.number < meso.number)));
  antes.sort((a, b) => b.startDate.localeCompare(a.startDate) || b.number - a.number);
  return antes[0] ?? null;
}

/** El lunes más cercano a partir de `fecha` (la propia fecha si ya es lunes). */
export function lunesDesde(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number);
  const dia = new Date(y, m - 1, d).getDay(); // 0 = domingo
  return addDays(fecha, (8 - dia) % 7);
}

/**
 * Inicio por defecto de un bloque nuevo: el lunes siguiente al fin del bloque
 * que todavía no ha terminado (el que acaba más tarde, si hay varios); sin
 * ninguno, hoy.
 */
export function inicioPorDefecto(mesos: readonly Mesocycle[], hoy: string): string {
  const fines = mesos.map(m => finDeBloque(m)).filter(f => f >= hoy).sort();
  const fin = fines[fines.length - 1];
  return fin ? lunesDesde(addDays(fin, 1)) : hoy;
}

/** Días desde la última sesión registrada antes de `inicio` hasta `inicio`. `null` si nunca entrenó. */
export function diasDeParon(logs: readonly Pick<WorkoutLog, 'date'>[], inicio: string): number | null {
  let ultimo: string | null = null;
  for (const l of logs) if (l.date < inicio && (ultimo == null || l.date > ultimo)) ultimo = l.date;
  return ultimo == null ? null : diasEntreFechas(ultimo, inicio);
}

/** Ejercicios del bloque que no estaban en el anterior. Sin anterior, ninguno (no hay con qué comparar). */
export function ejerciciosNuevos(actuales: readonly string[], anteriores: readonly string[] | null): number {
  if (!anteriores || anteriores.length === 0) return 0;
  const antes = new Set(anteriores);
  return new Set(actuales.filter(id => !antes.has(id))).size;
}

// ── La propuesta y lo que se guarda ─────────────────────────────────────────

export type MesoParaHipotesis = Pick<Mesocycle, 'groups' | 'weeks'>
  & Partial<Pick<Mesocycle, 'tipoBloque' | 'cdgVelocidad' | 'semana1Reducida' | 'hipotesis' | 'cdgObjetivosIem' | 'cdgModoPorZona' | 'objective'>>;

/**
 * La propuesta del motor para las estrellas del bloque, a partir de cómo
 * acabó el anterior. Lo que el coach ya eligió a mano (palanca y límite de
 * cada zona) manda.
 */
export function propuestaDelMeso(o: {
  meso: MesoParaHipotesis;
  anterior: Pick<EstadoDelBloque, 'porZona'> | null;
  historial?: readonly BloqueConCierre[];
  /** Nivel del atleta: a un principiante se le pide más RM (auditoría de cifras, 17-11-2026). */
  nivel?: ExperienceLevel;
  /** El bloque cae mayoritariamente en déficit (`bloqueEnDeficit`): no perder y techo sin subir. */
  enDeficit?: boolean;
}): PropuestaDeHipotesis {
  const { meso } = o;
  const guardadas = meso.hipotesis ?? {};
  const palancas: Partial<Record<ZonaIem, HipotesisDeZona['palanca']>> = {};
  const limites: Partial<Record<ZonaIem, string>> = {};
  for (const [z, h] of Object.entries(guardadas)) {
    if (!esZonaIem(z) || !h) continue;
    palancas[z] = h.palanca;
    if (h.limite) limites[z] = h.limite;
  }
  return proponerHipotesis({
    tipo: meso.tipoBloque ?? 'desarrollo',
    estrellas: zonasConEstrella(meso.groups),
    velocidad: meso.cdgVelocidad as Velocidad | undefined,
    semana1Reducida: !!meso.semana1Reducida,
    anterior: o.anterior,
    historial: o.historial,
    palancas,
    limites,
    resto: tratoDelRestoPorZona(meso.groups),
    nivel: o.nivel,
    enDeficit: o.enDeficit,
  });
}

/**
 * Las hipótesis que enseña el editor: las guardadas de cada zona con estrella
 * y, para las que aún no tienen, la propuesta. Las de zonas que ya no llevan
 * estrella no salen (se quitan al confirmar).
 */
export function hipotesisEnPantalla(meso: MesoParaHipotesis, propuesta: Pick<PropuestaDeHipotesis, 'hipotesis'>): Partial<Record<ZonaIem, HipotesisDeZona>> {
  const out: Partial<Record<ZonaIem, HipotesisDeZona>> = {};
  for (const z of zonasConEstrella(meso.groups)) {
    const h = meso.hipotesis?.[z] ?? propuesta.hipotesis[z];
    if (h) out[z] = h;
  }
  return out;
}

/** Sin claves vacías: Firestore no admite `undefined` y una cifra borrada es «sin cifra». */
export function limpiarHipotesis(h: HipotesisDeZona): HipotesisDeZona {
  const out = { ...h } as Record<string, unknown>;
  for (const [k, v] of Object.entries(out)) {
    if (v === undefined || v === null || (typeof v === 'number' && !Number.isFinite(v)) || (typeof v === 'string' && v.trim() === '')) delete out[k];
  }
  return out as unknown as HipotesisDeZona;
}

const igual = (a: unknown, b: unknown) => JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});

/** ¿Lo que se ve es distinto de lo guardado? (hace falta confirmar). */
export function hayCambiosSinGuardar(meso: MesoParaHipotesis, enPantalla: Partial<Record<ZonaIem, HipotesisDeZona>>): boolean {
  const guardadas = Object.fromEntries(Object.entries(meso.hipotesis ?? {}).filter(([z]) => esZonaIem(z)));
  const ordenar = (o: Record<string, unknown>) => Object.fromEntries(Object.keys(o).sort().map(k => [k, o[k]]));
  return !igual(ordenar(guardadas), ordenar(Object.fromEntries(Object.entries(enPantalla).map(([z, h]) => [z, limpiarHipotesis(h!)]))));
}

/**
 * Lo que se escribe en el mesociclo al confirmar las hipótesis:
 *
 *  · `hipotesis`: solo las zonas con estrella;
 *  · `cdgObjetivosIem`: el techo de cada una (lo que lee el protocolo semanal
 *    para no proponer subir por encima). Las zonas que tenían hipótesis y ya no
 *    la tienen pierden su cifra; las que el coach puso a mano sin hipótesis se
 *    respetan;
 *  · `cdgModoPorZona`: estrella en dinámico y el resto en estático;
 *  · `objective`: si sigue siendo el derivado del tipo (o está vacío), se
 *    rehace con las estrellas nuevas («Desarrollo: pectoral y deltoides»).
 */
export function camposAlConfirmar(
  meso: MesoParaHipotesis, hipotesis: Partial<Record<ZonaIem, HipotesisDeZona>>,
): Pick<Mesocycle, 'hipotesis' | 'cdgObjetivosIem' | 'cdgModoPorZona'> & Partial<Pick<Mesocycle, 'objective'>> {
  const estrellas = ZONAS_IEM.map(z => z.clave).filter(z => hipotesis[z]);
  const limpias = Object.fromEntries(estrellas.map(z => [z, limpiarHipotesis(hipotesis[z]!)])) as Partial<Record<ZonaIem, HipotesisDeZona>>;

  const objetivos: Partial<Record<string, number>> = { ...(meso.cdgObjetivosIem ?? {}) };
  for (const z of Object.keys(meso.hipotesis ?? {})) delete objetivos[z];
  for (const z of estrellas) {
    const techo = limpias[z]?.iemTecho;
    if (techo != null && techo > 0) objetivos[z] = techo;
    else delete objetivos[z];
  }
  for (const [k, v] of Object.entries(objetivos)) if (v == null) delete objetivos[k];

  const tipo = meso.tipoBloque ?? 'desarrollo';
  const out: ReturnType<typeof camposAlConfirmar> = {
    hipotesis: limpias,
    cdgObjetivosIem: objetivos,
    cdgModoPorZona: modoPorZonaDe(estrellas, tipo),
  };
  if (meso.tipoBloque) {
    // Derivado de antes: con las estrellas guardadas, sin ninguna (recién
    // elegido el tipo) o con las nuevas. Cualquier otro texto es del coach.
    const derivados = new Set([objetivoDerivado(tipo, estrellasDe(meso)), objetivoDerivado(tipo), objetivoDerivado(tipo, estrellas)]);
    if (!meso.objective?.trim() || derivados.has(meso.objective)) out.objective = objetivoDerivado(tipo, estrellas);
  }
  return out;
}

// ── El resto de grupos, en corto ────────────────────────────────────────────

export interface GrupoDelResto {
  grupo: MuscleGroup;
  series: number;
  /** Series que hacía en el bloque anterior, si lo hay. */
  antes: number | null;
}

export interface NivelDelResto {
  prioridad: Exclude<PrioridadDeGrupo, 'alta'>;
  grupos: GrupoDelResto[];
}

/**
 * Los grupos SIN estrella, juntos por nivel, para la vista compacta debajo de
 * las fichas. De desarrollar y mantener solo los que tienen series (los demás
 * no se entrenan y no dicen nada); de ignorar, todos.
 */
export function restoPorNivel(groups: Grupos | undefined, anteriores?: Grupos | null): NivelDelResto[] {
  const niveles: NivelDelResto['prioridad'][] = ['media', 'baja', 'ignorar'];
  return niveles.map(prioridad => ({
    prioridad,
    grupos: MUSCLE_ORDER
      .filter(g => (groups?.[g]?.priority ?? 'media') === prioridad && (prioridad === 'ignorar' || (groups?.[g]?.series ?? 0) > 0))
      .map(g => ({ grupo: g, series: groups?.[g]?.series ?? 0, antes: anteriores ? (anteriores[g]?.series ?? 0) : null })),
  })).filter(n => n.grupos.length > 0);
}

// ── Cómo va cada hipótesis, semana a semana (Seguimiento) ───────────────────

/** Agujetas (1-5) a partir de las que la zona está frenada: con un 4 se mantiene
 *  y con un 5 se baja (curso, Caso 6 y Programación 2). */
export const AGUJETAS_QUE_FRENAN = 4;

export type MarcaDeHipotesis = 'en_camino' | 'por_debajo' | 'frenada' | 'sin_dato';

export interface HipotesisEnCurso {
  zona: ZonaIem;
  /** IEM medio realizado del bloque hasta ahora (semanas que cuentan). */
  iemMedio: number | null;
  semanasMedidas: number;
  objetivo: number | null;
  techo: number | null;
  /** Semanas normales en el nivel de la última subida, contando la de la subida. `null` = no ha subido. */
  semanasDesdeSubida: number | null;
  enMeseta: boolean;
  marca: MarcaDeHipotesis;
}

/**
 * El estado de la hipótesis de una zona en lo que va de bloque. «En camino»
 * mientras la media TODAVÍA LLEGUE al objetivo (`procesoEnCurso`: sosteniendo
 * el nivel de ahora, o subiendo al techo a tiempo); «por debajo» cuando ya no
 * llega. La media va detrás del nivel porque el bloque arranca más abajo, así
 * que compararla sin más con el objetivo daría rojo hasta la primera subida.
 * Sin tolerancia del 95 % (auditoría de cifras, 17-11-2026). Sin las semanas
 * del bloque (`semanasTotales`) no se puede proyectar: vale si la media o la
 * última semana medida ya están en el objetivo. En una zona que se recupera,
 * «en camino» es estar ya en su nivel bajo.
 */
export function hipotesisEnCurso(o: {
  zona: ZonaIem;
  h: HipotesisDeZona;
  /** IEM realizado de cada semana que cuenta, en orden. */
  porSemana: readonly number[];
  subidas?: { semanasSostenidas: number | null; enMeseta: boolean } | null;
  /** Agujetas vigentes de la zona (1-5). */
  agujetas?: number | null;
  /** Semanas del bloque que cuentan para la media (sin descargas, puentes ni test). */
  semanasTotales?: number;
}): HipotesisEnCurso {
  const { h, porSemana } = o;
  const iemMedio = porSemana.length ? Math.round((porSemana.reduce((a, b) => a + b, 0) / porSemana.length) * 10) / 10 : null;
  const ultima = porSemana.length ? porSemana[porSemana.length - 1] : null;
  const objetivo = h.iemMedioObjetivo ?? null;
  const techo = h.iemTecho ?? null;
  let marca: MarcaDeHipotesis;
  if (o.agujetas != null && o.agujetas >= AGUJETAS_QUE_FRENAN) marca = 'frenada';
  else if (iemMedio == null) marca = 'sin_dato';
  else if (h.palanca === 'recuperar') marca = techo == null ? 'sin_dato' : (ultima ?? iemMedio) <= techo * 1.05 ? 'en_camino' : 'por_debajo';
  else if (objetivo == null) marca = 'sin_dato';
  else if (o.semanasTotales != null && o.semanasTotales > 0) {
    marca = procesoEnCurso({ objetivo, techo, porSemana, semanasTotales: o.semanasTotales })?.ritmo === 'tarde' ? 'por_debajo' : 'en_camino';
  } else marca = iemMedio >= objetivo || (ultima ?? 0) >= objetivo ? 'en_camino' : 'por_debajo';
  return {
    zona: o.zona, iemMedio, semanasMedidas: porSemana.length, objetivo, techo,
    semanasDesdeSubida: o.subidas?.semanasSostenidas ?? null, enMeseta: !!o.subidas?.enMeseta, marca,
  };
}

/** Series semanales de los grupos de una zona (para «Series: 14 → 15 por semana»). */
export function seriesDeZona(groups: Grupos | undefined, zona: ZonaIem): number {
  return gruposDeZona(zona).reduce((s, g) => s + seriesQueCuentan(groups?.[g] as MuscleGroupConfig | undefined), 0);
}
