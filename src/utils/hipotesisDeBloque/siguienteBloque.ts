import type {
  HipotesisDeZona, Mesocycle, MuscleGroup, TemplateDay, TipoDeBloque, VeredictoDeHipotesis, Workout, WorkoutExercise,
} from '../../types.js';
import { MUSCLE_LABELS } from '../../types.js';
import { cicloDiasDeMeso } from '../asignacionMesociclo.js';
import type { ZonaIem } from '../cdg/zonas.js';
import { nombreCortoDeSesion } from '../nombresMeso.js';
import { siguienteNumeroDeBloque } from '../numeroDeBloque.js';
import { etapaDesdeMeso, mesoDeAtletaDesdeEtapa, rutinasDeMesoDePlantilla } from '../plantillaMeso.js';
import { planDeSemana1Reducida, resolveExerciseForWeek, vueltasDelCiclo } from '../progression.js';
import { addDays, diasEntreFechas } from '../trainingWeek.js';
import { candidatosACambio, type CandidatoACambio } from './candidatosACambio.js';
import type { EstadoDeEjercicio, EstadoDelBloque } from './estadoDelBloqueAnterior.js';
import type { BloqueConCierre } from './historial.js';
import { rotacionDeEstrellas, zonasDeGrupos } from './mapaDeRespuesta.js';
import { cifrasDeHipotesis, proponerHipotesis } from './proponerHipotesis.js';
import { TIPOS_DE_BLOQUE, enLista, estrellasDe, nombreCortoDeZona, objetivoDerivado, sugerirSemana1Reducida } from './tiposDeBloque.js';
import { cierreParaGuardar, type PropuestaSiguiente } from './veredicto.js';

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
    · Estrellas: las que tenía, menos las que la rotación suelta (dos «no
      responde» seguidos, `rotacionDeEstrellas`). El hueco lo recoge una zona
      que pida el atleta; si no pide ninguna, se queda libre y se le dice al
      coach cuáles llevan dos bloques en mantener.
    · NO se heredan descargas, puentes, test, notas de semana ni eventos: eran
      de aquel calendario.

   Puro: devuelve el mesociclo y sus rutinas listos para guardar. Nada se
   asigna al atleta: las rutinas nacen sin calendario, como al aplicar una
   plantilla.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Un veredicto, recién calculado (con su propuesta) o ya guardado (sin ella). */
export type VeredictoParaClonar = VeredictoDeHipotesis & { propuesta?: Pick<PropuestaSiguiente, 'subirTecho'> };

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
  const { dias, cambiosDeId } = diasDesdeRutinas(e.rutinas, meso.daysPerWeek, ultimaSemanaNormal(meso));
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
  const esteConCierre: BloqueConCierre = e.veredictos.length > 0
    ? { ...meso, cierreDeHipotesis: cierreParaGuardar({ veredictos: e.veredictos, firmadoEn: meso.cierreDeHipotesis?.firmadoEn ?? e.hoy }) }
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
    const recoge = estrellas.length < preset.maxEstrellas ? pedidas.shift() : undefined;
    if (recoge) estrellas.push(recoge.zona);
    const suelta = `${s.nombre} suelta la estrella (${s.noRespondeSeguidos} bloques sin responder)`;
    rotacion.push(recoge
      ? `${suelta} y la recoge ${recoge.nombre.toLowerCase()}, que la pide el atleta.`
      : `${suelta} y nadie la recoge: decide tú a quién va${enMantener.length ? ` (llevan dos bloques o más en mantener: ${enLista(enMantener)})` : ''}.`);
  }
  const conEstrella = estrellas.slice(0, Math.max(0, preset.maxEstrellas));

  // ── Arranque ───────────────────────────────────────────────────────────────
  const diasDeParon = diasEntreFechas(e.ultimaSesion ?? e.fin, inicio);
  const arranque = sugerirSemana1Reducida({ ejerciciosNuevos: 0, diasDeParon });

  // ── Hipótesis: las del motor, con el estado final de este bloque ───────────
  const limites = Object.fromEntries(conEstrella.flatMap(z => {
    const l = meso.hipotesis?.[z]?.limite?.trim();
    return l ? [[z, l]] : [];
  })) as Partial<Record<ZonaIem, string>>;
  const propuesta = proponerHipotesis({
    tipo, estrellas: conEstrella, velocidad: meso.cdgVelocidad, semana1Reducida: arranque.semana1Reducida,
    anterior: e.estado ?? null, historial, limites,
  });
  const hipotesis: Partial<Record<string, HipotesisDeZona>> = { ...propuesta.hipotesis };
  const cdgObjetivosIem: Partial<Record<string, number>> = { ...propuesta.cdgObjetivosIem };
  // Confirmada con un límite pasado: misma línea, pero sin subir el techo.
  for (const v of e.veredictos) {
    const h = hipotesis[v.zona];
    if (!h || v.lectura !== 'confirmada' || v.propuesta?.subirTecho !== false) continue;
    const sinSubir = cifrasDeHipotesis({
      palanca: h.palanca, estado: e.estado?.porZona[v.zona as ZonaIem], velocidad: meso.cdgVelocidad ?? preset.velocidad,
      semana1Reducida: arranque.semana1Reducida, subir: false, limite: h.limite,
    });
    hipotesis[v.zona] = sinSubir;
    if (sinSubir.iemTecho != null) cdgObjetivosIem[v.zona] = sinSubir.iemTecho;
  }

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
  };

  const rutinas = rutinasDeMesoDePlantilla({ ...nuevo, id: '' }, { ownerId: e.ownerId, athleteName: e.athleteName })
    .map(({ mesocycleId: _sinMeso, ...r }) => r);
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
      avisos: propuesta.avisos,
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
