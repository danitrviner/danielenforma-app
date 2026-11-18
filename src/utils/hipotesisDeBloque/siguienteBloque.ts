import type {
  DosisDeZona, ExperienceLevel, HipotesisDeZona, Mesocycle, MuscleGroup, NutritionProgram, TemplateDay, TipoDeBloque, VeredictoDeHipotesis,
  Workout, WorkoutExercise,
} from '../../types.js';
import { MUSCLE_LABELS } from '../../types.js';
import { cicloDiasDeMeso } from '../asignacionMesociclo.js';
import type { ZonaIem } from '../cdg/zonas.js';
import { nombreCortoDeSesion } from '../nombresMeso.js';
import { siguienteNumeroDeBloque } from '../numeroDeBloque.js';
import { conRampaPendiente } from '../rampaEnRutinas.js';
import { etapaDesdeMeso, mesoDeAtletaDesdeEtapa, rutinasDeMesoDePlantilla } from '../plantillaMeso.js';
import { planDeSemana1Reducida, resolveExerciseForWeek, vueltasDelCiclo } from '../progression.js';
import { addDays, diasEntreFechas } from '../trainingWeek.js';
import { bloqueEnDeficit } from './bloqueEnDeficit.js';
import { candidatosACambio, type CandidatoACambio } from './candidatosACambio.js';
import { CANSANCIO_LIMITE } from './cifras.js';
import type { EstadoDeEjercicio, EstadoDelBloque } from './estadoDelBloqueAnterior.js';
import { notaDeVigilancia, propuestaArticular, type MolestiaDeZona, type PropuestaArticular } from './estresArticular.js';
import type { BloqueConCierre } from './historial.js';
import { rotacionDeEstrellas, zonasDeGrupos } from './mapaDeRespuesta.js';
import { cifrasDeHipotesis, proponerHipotesis } from './proponerHipotesis.js';
import { fotosDeLosBloques, indicioParaLaZona, indiciosDeRespuesta, type IndicioDeRespuesta } from './respuestaADosis.js';
import { TIPOS_DE_BLOQUE, enLista, estrellasDe, nombreCortoDeZona, objetivoDerivado, sugerirSemana1Reducida } from './tiposDeBloque.js';
import { cierreParaGuardar, molestiasDeLaZona, type LimitesDelVeredicto, type PropuestaSiguiente, type ZonaDeEjercicio } from './veredicto.js';

/* ═══════════════════════════════════════════════════════════════════════════
   El bloque siguiente, propuesto (17-11-2026)

   Al cerrar un bloque la app propone el siguiente ya montado: el mismo plan
   (reparto, días, ciclo, ejercicios, ejercicios clave, máquinas, velocidad)
   con las hipótesis que salen de los veredictos. Se CLONA a propósito: cambiar
   ejercicios porque sí rompe la referencia con la que se mide el resultado.
   Los que tienen motivo para cambiar se señalan (`candidatosACambio`), pero
   decide el coach en el editor.

   Qué se hereda y qué no:
    · Prescripciones: las de la ÚLTIMA semana normal del bloque (lo que el
      atleta hacía al acabar), sin los cambios programados semana a semana. El
      bloque nuevo arranca donde acabó el anterior, que es justo de donde
      parten las cifras de la hipótesis (`iemArranque`).
    · Tipo de bloque: el mismo, salvo «primer bloque», que solo hay uno: el
      siguiente es de desarrollo.
    · Estrellas: las que tenía, TODAS (desde el 18-11-2026 no se recortan a
      las que el tipo lleva sin aviso: con 4 o más se avisa y nada más), menos
      las que la rotación suelta (dos «no responde» seguidos,
      `rotacionDeEstrellas`; una «mejora, menos de lo buscado» no cuenta y
      sigue la misma línea sin subir el techo). El hueco lo recoge una zona
      que pida el atleta; si no pide ninguna, se queda libre y se le dice al
      coach cuáles llevan dos bloques en mantener.
    · Molestias (Dani, 18-11-2026): una zona con molestia apuntada no sube el
      techo aunque se confirme, y además se propone vigilar el estrés
      articular de sus articulaciones, con un límite semanal sugerido (su
      media en este bloque, no más alto; `estresArticular.ts`). La línea viaja
      como nota privada de la semana 1 del bloque nuevo; el límite es del
      atleta y solo se escribe si el coach lo acepta en la tarjeta.
    · Objetivo de resultado y techo según el caso (auditoría de cifras,
      17-11-2026): +8 % de RM en un principiante; con el bloque NUEVO cayendo
      en déficit, no perder y techo sin subir; con la zona ya alta (80 de IEM
      o más), techo sin subir. Sale de `proponerHipotesis` y se edita después.
    · NO se heredan descargas, puentes, test, notas de semana ni eventos: eran
      de aquel calendario. (La única nota con la que puede nacer es la de
      vigilar una articulación, que es de este bloque.)

   Puro: devuelve el mesociclo y sus rutinas listos para guardar. Nada se
   asigna al atleta: las rutinas nacen sin calendario, como al aplicar una
   plantilla.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Un veredicto, recién calculado (con su propuesta y sus límites) o ya guardado (sin ellos). */
export type VeredictoParaClonar = VeredictoDeHipotesis & {
  propuesta?: Pick<PropuestaSiguiente, 'subirTecho'>;
  limites?: Pick<LimitesDelVeredicto, 'molestia'>;
};

export interface EntradaDeSiguienteBloque {
  /** El bloque que se cierra. */
  meso: Mesocycle;
  /** Sus rutinas (`Workout.mesocycleId === meso.id`), en cualquier orden. */
  rutinas: readonly Pick<Workout, 'name' | 'dayIndex' | 'exercises'>[];
  /** Todos los bloques del atleta: de ellos salen el número y el historial. */
  mesocycles: readonly Mesocycle[];
  /** Los veredictos de este bloque (los firmados si los hay; si no, los calculados). */
  veredictos: readonly VeredictoParaClonar[];
  /** Cómo acaba este bloque por zona (`estadoDelBloqueAnterior` sobre él). Sin él, hipótesis sin cifras de IEM. */
  estado?: Pick<EstadoDelBloque, 'porZona'> | null;
  /** Parones y molestias por ejercicio (`estadoDeLosEjercicios`). */
  ejercicios?: readonly EstadoDeEjercicio[];
  /** Ejercicio → zona (`VeredictosDelCierre.zonaDe`). Con él, un veredicto ya
   *  firmado —que se guarda sin sus límites— recupera las molestias de su zona. */
  zonaDe?: ZonaDeEjercicio;
  /** Cansancio medio al salir en el bloque: el otro límite de un veredicto ya firmado. */
  cansancioMedio?: number | null;
  /** Estrés articular medio por semana y articulación en este bloque (`estresArticularMedioDelBloque`). */
  estresArticular?: Partial<Record<string, number>> | null;
  /** Límites articulares que ya tiene el atleta (`UserProfile.cdgUmbralesCarga.limitesArticulares`). */
  limitesArticulares?: Partial<Record<string, unknown>> | null;
  /** Ids que el atleta dijo que quitaría (`voz.quitaria` del cierre). */
  quitaria?: readonly string[];
  /** Zonas que pide priorizar (`zonasDeGrupos` sobre lo que contestó). */
  pideElAtleta?: readonly ZonaIem[];
  /** Último día real del bloque (`finDeBloque`). */
  fin: string;
  hoy: string;
  /** Última sesión registrada del bloque: de ahí se cuenta el parón. */
  ultimaSesion?: string | null;
  ownerId: string;
  athleteName?: string;
  nombreDe?: (exerciseId: string) => string | undefined;
  grupoDe?: (exerciseId: string) => MuscleGroup | undefined;
  /** Nivel del atleta (`OnboardingData.experienceLevel`): a un principiante se le pide más RM. */
  nivel?: ExperienceLevel;
  /** Periodización nutricional del atleta: si el bloque NUEVO cae mayoritariamente
   *  en déficit, se propone no perder fuerza y no subir el techo. */
  programaNutricion?: NutritionProgram | null;
  /** La foto de dosis y respuesta de este bloque (la firmada o, sin firmar,
   *  la calculada): entra en el historial del que salen los indicios. */
  dosis?: readonly DosisDeZona[] | null;
  /** Los indicios de a qué responde (`indiciosDeRespuesta`): se pasan como
   *  motivo a la propuesta. Sin ellos, salen de las fotos del historial. */
  indicios?: readonly IndicioDeRespuesta[];
}

export interface SiguienteBloque {
  /** El mesociclo nuevo, listo para `createMesocycle`. */
  meso: Omit<Mesocycle, 'id'>;
  /** Sus rutinas, a falta del id del mesociclo recién creado (`mesocycleId`). */
  rutinas: Omit<Workout, 'id' | 'mesocycleId'>[];
  resumen: {
    numero: number;
    inicio: string;
    semanas: number;
    tipo: TipoDeBloque;
    estrellas: ZonaIem[];
    /** Estrellas que se sueltan y quién las recoge, en frases para el coach. */
    rotacion: string[];
    /** Ejercicios distintos del bloque que se clonan sin motivo para cambiarlos. */
    seQuedan: number;
    candidatos: CandidatoACambio[];
    semana1Reducida: boolean;
    vuelveDeParon: boolean;
    /** Por qué la semana 1 va reducida; `null` si arranca donde acabó. */
    motivoDeArranque: string | null;
    /** Avisos de la propuesta de hipótesis (estrellas de más, zona que debería soltarla…). */
    avisos: string[];
    /** El bloque nuevo cae mayoritariamente en una fase de déficit. */
    enDeficit: boolean;
    /** Por qué alguna hipótesis no propone lo de siempre (déficit, zona ya alta), en frases para el coach. */
    notas: string[];
    /** La vuelta del ciclo de este bloque de la que se copian series y repeticiones: su última semana normal. */
    semanaDeReferencia: number;
    /** Zonas con molestia: qué articulaciones vigilar y qué límite semanal se sugiere (Dani, 18-11-2026). */
    articular: PropuestaArticular;
    /** Ya hay un bloque que empieza después del que se cierra. */
    hayPosterior: boolean;
  };
}

const sinTildes = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

/**
 * Las zonas que pide priorizar el atleta, a partir de lo que contestó en el
 * cuestionario de cierre (`voz.priorizar`): llega como claves de grupo
 * («pecho») o como sus nombres («Pecho», «Deltoide lateral»), según el
 * cuestionario. Lo que no se reconoce se ignora.
 */
export function zonasQuePide(priorizar: readonly string[] | undefined): ZonaIem[] {
  const porNombre = new Map<string, string>();
  for (const [clave, etiqueta] of Object.entries(MUSCLE_LABELS)) {
    porNombre.set(sinTildes(clave), clave);
    porNombre.set(sinTildes(String(etiqueta)), clave);
  }
  return zonasDeGrupos((priorizar ?? []).map(p => porNombre.get(sinTildes(p)) ?? p));
}

/** El primer lunes DESPUÉS de `fecha` (si `fecha` es lunes, el de la semana siguiente). */
export function lunesSiguiente(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number);
  const dia = new Date(y, m - 1, d).getDay(); // 0 = domingo
  return addDays(fecha, dia === 0 ? 1 : 8 - dia);
}

/** El lunes en el que empieza el bloque nuevo: el siguiente al final real o, si ya pasó, el próximo desde hoy. */
export function inicioDelSiguiente(fin: string, hoy: string): string {
  const trasElFin = lunesSiguiente(fin);
  return trasElFin >= hoy ? trasElFin : lunesSiguiente(addDays(hoy, -1));
}

/** La última vuelta del ciclo que no es descarga, puente ni test: lo que hacía al acabar. */
export function ultimaSemanaNormal(meso: Pick<Mesocycle, 'weeks' | 'daysPerWeek' | 'cycleDays' | 'splitId' | 'reparto' | 'semanasDescarga' | 'semanasPivot' | 'semanasTest'>): number {
  const vueltas = Math.max(1, vueltasDelCiclo(meso.weeks, cicloDiasDeMeso(meso)));
  const fuera = new Set([...(meso.semanasDescarga ?? []), ...(meso.semanasPivot ?? []), ...(meso.semanasTest ?? [])]);
  for (let s = vueltas; s >= 1; s--) if (!fuera.has(s)) return s;
  return vueltas;
}

/** La prescripción con la que acabó un ejercicio, ya sin escalones ni cambios por semana. */
function alAcabar(we: WorkoutExercise, semana: number): WorkoutExercise {
  const { weeklyProgression: _sinEscalones, ...r } = resolveExerciseForWeek(structuredClone(we), semana);
  return r;
}

/** Los días del bloque nuevo, a partir de las rutinas del que se cierra (una por sesión del ciclo). */
export function diasDesdeRutinas(
  rutinas: EntradaDeSiguienteBloque['rutinas'], sesiones: number, semana: number,
): { dias: TemplateDay[]; cambiosDeId: Array<{ dia: number; de: string; a: string }> } {
  const orden = rutinas
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (a.r.dayIndex ?? Number.MAX_SAFE_INTEGER) - (b.r.dayIndex ?? Number.MAX_SAFE_INTEGER) || a.i - b.i);
  // Una por día del ciclo: los bloques antiguos podían tener varias con el mismo `dayIndex`.
  const vistos = new Set<number>();
  const unicas = orden.filter(({ r }) => {
    if (r.dayIndex == null) return true;
    if (vistos.has(r.dayIndex)) return false;
    vistos.add(r.dayIndex);
    return true;
  }).slice(0, Math.max(0, sesiones));
  const cambiosDeId: Array<{ dia: number; de: string; a: string }> = [];
  const dias = unicas.map(({ r }, dia) => ({
    id: `dia_${dia + 1}`,
    name: nombreCortoDeSesion(r.name),
    exercises: r.exercises.map(we => {
      const final = alAcabar(we, semana);
      if (final.exerciseId !== we.exerciseId) cambiosDeId.push({ dia: r.dayIndex ?? dia, de: we.exerciseId, a: final.exerciseId });
      return final;
    }),
  }));
  return { dias, cambiosDeId };
}

export function siguienteBloque(e: EntradaDeSiguienteBloque): SiguienteBloque {
  const { meso } = e;
  const tipo: TipoDeBloque = !meso.tipoBloque || meso.tipoBloque === 'primer' ? 'desarrollo' : meso.tipoBloque;
  const preset = TIPOS_DE_BLOQUE[tipo];
  const numero = siguienteNumeroDeBloque(e.mesocycles);
  const inicio = inicioDelSiguiente(e.fin, e.hoy);

  // ── Plan: el mismo, con las prescripciones del final ───────────────────────
  const semanaDeReferencia = ultimaSemanaNormal(meso);
  const { dias, cambiosDeId } = diasDesdeRutinas(e.rutinas, meso.daysPerWeek, semanaDeReferencia);
  const etapa = etapaDesdeMeso(meso, { id: 'siguiente', dias });
  if (dias.length === 0) delete etapa.days;
  const { id: _sinId, ...clonado } = mesoDeAtletaDesdeEtapa(etapa, { id: '', athleteId: meso.athleteId, number: numero, startDate: inicio }, e.grupoDe);
  // Lo que era de aquel calendario no viaja.
  delete clonado.deloadWeek; delete clonado.semanasDescarga; delete clonado.semanasPivot;
  delete clonado.semanasTest; delete clonado.notasSemana; delete clonado.eventosSemana;
  // Un ejercicio cambiado a mitad de bloque sigue siendo clave con su id nuevo.
  const ejerciciosClave = meso.ejerciciosClave?.map(k => {
    const c = cambiosDeId.find(x => k === `d${x.dia}::${x.de}`);
    return c ? `d${c.dia}::${c.a}` : k;
  });

  // ── Estrellas: las que tenía, con la rotación ──────────────────────────────
  const anteriores = e.mesocycles.filter(m => m.id !== meso.id && m.startDate <= meso.startDate);
  const dosis = e.dosis ?? meso.cierreDeHipotesis?.dosis ?? null;
  const esteConCierre: BloqueConCierre = e.veredictos.length > 0 || dosis?.length
    ? { ...meso, cierreDeHipotesis: cierreParaGuardar({ veredictos: e.veredictos, firmadoEn: meso.cierreDeHipotesis?.firmadoEn ?? e.hoy, dosis }) }
    : meso;
  const historial: BloqueConCierre[] = [...anteriores, esteConCierre];
  const rot = rotacionDeEstrellas({ bloques: historial, pideElAtleta: e.pideElAtleta });
  const sueltan = new Set(rot.soltar.map(s => s.zona));
  const estrellas: ZonaIem[] = estrellasDe(meso).filter(z => !sueltan.has(z));
  const rotacion: string[] = [];
  // Solo se reparte sola la que pide el atleta: «lleva dos bloques en
  // mantener» lo cumplen casi todas y elegir una de ellas es cosa del coach.
  const pedidas = rot.candidatas.filter(c => c.motivos.includes('lo_pide_el_atleta'));
  const enMantener = rot.candidatas.filter(c => !c.motivos.includes('lo_pide_el_atleta')).map(c => c.nombre.toLowerCase());
  for (const s of rot.soltar) {
    // Cada estrella que se suelta deja un hueco: lo recoge lo que pida el
    // atleta sin mirar cuántas quedan (las estrellas no tienen tope; con 4 o
    // más solo se avisa. Dani, 18-11-2026).
    const recoge = pedidas.shift();
    if (recoge) estrellas.push(recoge.zona);
    const suelta = `${s.nombre} suelta la estrella (${s.noRespondeSeguidos} bloques sin responder)`;
    rotacion.push(recoge
      ? `${suelta} y la recoge ${recoge.nombre.toLowerCase()}, que la pide el atleta.`
      : `${suelta} y nadie la recoge: decide tú a quién va${enMantener.length ? ` (llevan dos bloques o más en mantener: ${enLista(enMantener)})` : ''}.`);
  }
  // Todas: ya no se recortan a las que el tipo lleva sin aviso.
  const conEstrella = estrellas;

  // ── Arranque ───────────────────────────────────────────────────────────────
  const diasDeParon = diasEntreFechas(e.ultimaSesion ?? e.fin, inicio);
  const arranque = sugerirSemana1Reducida({ ejerciciosNuevos: 0, diasDeParon });

  // ── Hipótesis: las del motor, con el estado final de este bloque ───────────
  const limites = Object.fromEntries(conEstrella.flatMap(z => {
    const l = meso.hipotesis?.[z]?.limite?.trim();
    return l ? [[z, l]] : [];
  })) as Partial<Record<ZonaIem, string>>;
  // Déficit: se mira el bloque NUEVO (sus fechas), no el que se cierra.
  // A qué responde: los indicios que se repiten en la misma zona van como
  // motivo (y, si nada manda otra cosa, deciden la palanca: `proponerHipotesis`).
  const indicios = e.indicios ?? indiciosDeRespuesta(fotosDeLosBloques(historial));
  const enDeficit = bloqueEnDeficit(e.programaNutricion, inicio, addDays(inicio, preset.semanas * 7 - 1));
  const propuesta = proponerHipotesis({
    tipo, estrellas: conEstrella, velocidad: meso.cdgVelocidad, semana1Reducida: arranque.semana1Reducida,
    anterior: e.estado ?? null, historial, limites, nivel: e.nivel, enDeficit, indicios,
  });
  const hipotesis: Partial<Record<string, HipotesisDeZona>> = { ...propuesta.hipotesis };
  const cdgObjetivosIem: Partial<Record<string, number>> = { ...propuesta.cdgObjetivosIem };
  // Molestias de cada zona con veredicto: las del veredicto recién calculado
  // o, en uno ya firmado (se guarda sin sus límites), las de sus ejercicios.
  const molestias: MolestiaDeZona[] = e.veredictos.flatMap(v => {
    const zona = v.zona as ZonaIem;
    const m = v.limites?.molestia
      ?? (e.ejercicios && e.zonaDe ? (({ molestiasEnLaZona: veces, molestiaMaxima: maxima }) => ({ veces, maxima }))(molestiasDeLaZona(e.ejercicios, e.zonaDe, zona)) : null);
    return m && m.veces > 0 ? [{ zona, veces: m.veces, maxima: m.maxima }] : [];
  });
  const conMolestia = new Set<string>(molestias.map(m => m.zona));
  const cansancioPasado = e.cansancioMedio != null && e.cansancioMedio >= CANSANCIO_LIMITE;
  // Confirmada con un límite pasado: misma línea, pero sin subir el techo. Un
  // veredicto firmado no trae la propuesta: sus límites se releen del bloque.
  for (const v of e.veredictos) {
    const h = hipotesis[v.zona];
    const limitePasado = v.propuesta ? v.propuesta.subirTecho === false : conMolestia.has(v.zona) || cansancioPasado;
    if (!h || v.lectura !== 'confirmada' || !limitePasado) continue;
    const sinSubir = cifrasDeHipotesis({
      palanca: h.palanca, estado: e.estado?.porZona[v.zona as ZonaIem], velocidad: meso.cdgVelocidad ?? preset.velocidad,
      semana1Reducida: arranque.semana1Reducida, subir: false, limite: h.limite, rmObjetivoPct: h.rmObjetivoPct,
    });
    hipotesis[v.zona] = sinSubir;
    if (sinSubir.iemTecho != null) cdgObjetivosIem[v.zona] = sinSubir.iemTecho;
  }
  const notas = [...new Set([
    ...conEstrella.flatMap(z => (propuesta.notas[z] ?? [])
      .map(n => (n.clave === 'deficit' ? n.texto : `${nombreCortoDeZona(z)}: ${n.texto.charAt(0).toLowerCase()}${n.texto.slice(1)}`))),
    // Lo que se repite en la misma zona, como motivo para el coach.
    ...conEstrella.flatMap(z => { const t = indicioParaLaZona(indicios, z).texto; return t ? [`${nombreCortoDeZona(z)}: ${t}`] : []; }),
  ])];

  // Con molestia en alguna zona: qué articulaciones vigilar y qué límite
  // semanal se sugiere. La línea se queda escrita en el bloque nuevo, como
  // nota privada del coach en su semana 1.
  const articular = propuestaArticular({ molestias, estresMedio: e.estresArticular, limitesActuales: e.limitesArticulares });
  const notaArticular = notaDeVigilancia(articular);

  const nuevo: Omit<Mesocycle, 'id'> = {
    ...clonado,
    weeks: preset.semanas,
    objective: objetivoDerivado(tipo, conEstrella),
    phaseType: preset.phaseType,
    tipoBloque: tipo,
    ...(ejerciciosClave?.length ? { ejerciciosClave } : {}),
    ...(meso.draft ? { draft: structuredClone(meso.draft) } : {}),
    ...(meso.draftMaquinas ? { draftMaquinas: { ...meso.draftMaquinas } } : {}),
    ...(meso.cdgVelocidad ? { cdgVelocidad: meso.cdgVelocidad } : {}),
    ...(meso.cdgActitud ? { cdgActitud: meso.cdgActitud } : {}),
    ...(meso.cdgSensibilidad ? { cdgSensibilidad: meso.cdgSensibilidad } : {}),
    cdgModoPorZona: propuesta.cdgModoPorZona,
    cdgObjetivosIem,
    hipotesis,
    semana1Reducida: arranque.semana1Reducida,
    ...(arranque.vuelveDeParon ? { vuelveDeParon: true } : {}),
    ...(notaArticular ? { notasSemana: { 1: notaArticular } } : {}),
  };

  const rutinas = rutinasDeMesoDePlantilla({ ...nuevo, id: '' }, { ownerId: e.ownerId, athleteName: e.athleteName })
    // La norma de ejercicio nuevo se aplica al abrir el bloque en el editor,
    // que es quien tiene los registros del atleta: aquí solo se deja la marca.
    .map(({ mesocycleId: _sinMeso, ...r }) => ({ ...r, tags: conRampaPendiente(r.tags) }));
  // El recorte de la semana 1 se guarda por ejercicio (lo lee la app del
  // atleta): sin él, el interruptor encendido no recortaría nada hasta que el
  // coach abriera el bloque en el editor.
  if (nuevo.semana1Reducida) nuevo.semana1Recorte = planDeSemana1Reducida(rutinas, nuevo.groups);

  const idsDelBloque = dias.flatMap(d => d.exercises.map(x => x.exerciseId));
  const { cambiar, clonar } = candidatosACambio({
    ejercicios: idsDelBloque, estado: e.ejercicios ?? [], quitaria: e.quitaria, nombreDe: e.nombreDe,
  });

  return {
    meso: nuevo,
    rutinas,
    resumen: {
      numero, inicio, semanas: preset.semanas, tipo, estrellas: conEstrella, rotacion,
      seQuedan: clonar.length, candidatos: cambiar,
      semana1Reducida: arranque.semana1Reducida, vuelveDeParon: arranque.vuelveDeParon, motivoDeArranque: arranque.motivo,
      avisos: propuesta.avisos, enDeficit, notas, semanaDeReferencia, articular,
      hayPosterior: e.mesocycles.some(m => m.id !== meso.id && m.startDate > meso.startDate),
    },
  };
}

/** «Desarrollo · 2 estrellas (pectoral y deltoides)», para la tarjeta. */
export function resumenDeTipo(r: Pick<SiguienteBloque['resumen'], 'tipo' | 'estrellas'>): string {
  const n = r.estrellas.length;
  const cuales = n ? ` (${enLista(r.estrellas.map(z => nombreCortoDeZona(z).toLowerCase()))})` : '';
  return `${TIPOS_DE_BLOQUE[r.tipo].etiqueta} · ${n === 0 ? 'sin estrellas' : `${n} ${n === 1 ? 'estrella' : 'estrellas'}`}${cuales}`;
}
