import { MUSCLE_LABELS } from '../types.js';
import { RevisionDelAtleta } from './revisionCoach.js';
import { ComidaDeLaSemana } from './comidaDeLaSemana.js';
import { PesoVsSemanaPasada } from './revisionCoach.js';
import { describirCambios } from './comparabilidad.js';
import { EFECTIVAS_MINIMO_PCT, RIR_EFECTIVO_MAXIMO } from './seriesEfectivas.js';
import { fechaCorta } from './trainingWeek.js';
import { superaElRuido } from './ruidoDeMedida.js';
import { textoDeSemanas } from './estancamiento.js';

/* ═══════════════════════════════════════════════════════════════════════════
   LOS TITULARES DE LA REVISIÓN — qué decir, en qué orden.

   La pantalla tiene ocho bloques y un vídeo dura tres minutos. Este motor
   contesta a «¿qué es lo que hay que contar de este atleta esta semana?»
   ordenándolo por lo que de verdad cambia una decisión: lo que está roto
   primero, lo que va bien después, y el ruido nunca.

   Reglas que se ven en el código y no son negociables:

    · No dice nada que no esté medido. Si no hay dato, no hay titular — no se
      rellena con «sigue igual», que es una afirmación disfrazada de silencio.
    · Cada titular sabe si es una alarma, una victoria o un hecho neutro
      (`tono`), porque el orden en que se cuentan importa más que el texto.
    · El borrador para el cliente NUNCA se manda solo: es texto para copiar,
      editar y pegar. Por eso está escrito en segunda persona y sin cifras que
      el atleta no pueda interpretar (tonelaje, IEM, zonas de volumen).

   Puro y determinista, como el resto de motores: mismos datos, mismo texto.
   ═══════════════════════════════════════════════════════════════════════════ */

export type TonoTitular = 'alarma' | 'bien' | 'neutro';

export interface Titular {
  id: string;
  tono: TonoTitular;
  /** Para el coach: puede llevar jerga y cifras técnicas. */
  texto: string;
  /**
   * La misma idea dicha AL atleta. Opcional a propósito: hay titulares que son
   * solo del coach —«no es momento de subirle carga» es una decisión de
   * programación, no algo que se le cuente— y esos no tienen versión para él.
   * El borrador solo usa esta versión, así que lo que no se pueda decir bien,
   * directamente no se dice.
   */
  paraCliente?: string;
}

export interface TitularesDeLaRevision {
  titulares: Titular[];
  /** Borrador en segunda persona, para copiar y editar antes de mandarlo. */
  resumenParaCliente: string;
}

const ORDEN_TONO: Record<TonoTitular, number> = { alarma: 0, bien: 1, neutro: 2 };

function num(n: number): string {
  return n.toLocaleString('es-ES', { maximumFractionDigits: 1 });
}

function listar(cosas: string[]): string {
  if (cosas.length === 1) return cosas[0];
  return `${cosas.slice(0, -1).join(', ')} y ${cosas[cosas.length - 1]}`;
}

function primerNombre(nombre: string | undefined): string {
  return (nombre ?? '').trim().split(/\s+/)[0] || 'Crack';
}

export function construirTitulares(params: {
  revision: RevisionDelAtleta;
  comida?: ComidaDeLaSemana | null;
  peso?: PesoVsSemanaPasada | null;
  athleteName?: string;
}): TitularesDeLaRevision {
  const { revision, comida = null, peso = null } = params;
  const { informe, suben, bajan, bienestar, ventana } = revision;
  const t: Titular[] = [];

  // ── Ha entrenado o no ────────────────────────────────────────────────────
  if (informe.sessions === 0) {
    t.push({
      id: 'sin_sesiones', tono: 'alarma',
      texto: `No ha registrado ni una sesión en ${ventana.etiqueta.toLowerCase()}.`,
      paraCliente: 'No me consta ninguna sesión registrada en este periodo.',
    });
  } else {
    t.push({
      id: 'sesiones', tono: 'neutro',
      texto: `${informe.sessions} ${informe.sessions === 1 ? 'sesión registrada' : 'sesiones registradas'} en esta ventana.`,
    });
  }

  // ── Agujetas que no se van ───────────────────────────────────────────────
  if (bienestar.domsCronico.length > 0) {
    t.push({
      id: 'doms_cronico', tono: 'alarma',
      texto: `Arrastra agujetas en ${listar(bienestar.domsCronico.map(d => MUSCLE_LABELS[d.grupo].toLowerCase()))} desde hace semanas.`,
      paraCliente: `Llevas semanas con agujetas en ${listar(bienestar.domsCronico.map(d => MUSCLE_LABELS[d.grupo].toLowerCase()))}: vamos a ajustarlo.`,
    });
  }

  // ── Lo que sube y lo que baja ────────────────────────────────────────────
  const mejor = suben[0];
  if (mejor && mejor.deltaOrmPct != null && mejor.deltaOrmPct > 0) {
    t.push({
      id: 'sube', tono: 'bien',
      texto: `${mejor.name} es lo que más sube: ${num(mejor.deltaOrmPct)} % ${informe.comparisonLabel}.`,
      paraCliente: `Donde más has subido es en ${mejor.name.toLowerCase()}.`,
    });
  }
  const peor = bajan[0];
  const cambioDelPeor = peor ? revision.cambiosDeTarea?.[peor.exerciseId] : undefined;
  // «Va a menos» solo si la bajada supera el ruido de medida (17-11-2026): un
  // −2 % en siete días es una repetición menos un día, no un bajón que contar.
  const bajaDeVerdad = !!peor && peor.deltaOrmPct != null && peor.deltaOrmPct < 0 && superaElRuido(peor.deltaOrmPct);
  if (bajaDeVerdad && peor.deltaOrmPct != null && cambioDelPeor) {
    // S3: si la tarea cambió dentro de la ventana, la bajada no es del atleta.
    t.push({
      id: 'baja_no_comparable', tono: 'neutro',
      texto: `${peor.name} marca ${num(peor.deltaOrmPct)} % ${informe.comparisonLabel}, pero el ${fechaCorta(cambioDelPeor.date)} cambió ${describirCambios(cambioDelPeor.cambios)}: no es comparable con lo de antes. Es su referencia nueva.`,
    });
  } else if (bajaDeVerdad && peor.deltaOrmPct != null) {
    t.push({
      id: 'baja', tono: 'alarma',
      texto: `${peor.name} va a menos: ${num(peor.deltaOrmPct)} % ${informe.comparisonLabel}.`,
      paraCliente: `${peor.name} se te ha quedado atrás, le damos una vuelta.`,
    });
  }

  // ── Récords ──────────────────────────────────────────────────────────────
  const records = informe.perExercise.filter(e => e.isPR).length;
  if (records > 0) {
    t.push({
      id: 'records', tono: 'bien',
      texto: `${records} ${records === 1 ? 'récord' : 'récords'} en esta ventana.`,
      paraCliente: `Has hecho ${records} ${records === 1 ? 'récord personal' : 'récords personales'}.`,
    });
  }

  // ── Lo que dicen las series (regla del 80 %, limitante, días malos) ──────
  // Como mucho dos de cada: un vídeo no da para repasar ocho ejercicios, y el
  // resto está en la tabla. Se leen con `?? []` por si alguien construye una
  // revisión a mano (bancos de pruebas) sin calcularlos.
  const nombreDe = (id: string) => informe.perExercise.find(e => e.exerciseId === id)?.name ?? 'Un ejercicio';
  const MAXIMO_POR_TIPO = 2;
  const QUE_PARA = { agarre: 'el agarre', aire: 'el aire', ardor: 'el ardor', tecnica: 'la técnica', molestia: 'una molestia' } as const;

  for (const d of (revision.descansos ?? []).filter(x => x.tipo === 'corto').slice(0, MAXIMO_POR_TIPO)) {
    const real = d.descansoRealSeg != null ? ` Está descansando unos ${d.descansoRealSeg} s.` : '';
    t.push({
      id: `descanso_corto_${d.exerciseId}`, tono: 'alarma',
      texto: `${nombreDe(d.exerciseId)}: la 2.ª serie se queda en el ${d.conservadoPct} % de la 1.ª (${d.coinciden} de las últimas ${d.sesiones} sesiones). El descanso se queda corto: súbele 30-60 s.${real}`,
      paraCliente: `En ${nombreDe(d.exerciseId).toLowerCase()} la segunda serie se te cae mucho: te subo un poco el descanso.`,
    });
  }

  for (const l of (revision.limitantes ?? []).slice(0, MAXIMO_POR_TIPO)) {
    t.push({
      id: `limitante_${l.exerciseId}`, tono: 'alarma',
      texto: `${nombreDe(l.exerciseId)}: lo que le para la serie es ${QUE_PARA[l.motivo]}, no el músculo (${l.veces} de ${l.de} sesiones). Antes de tocar series, ${l.arreglo}.`,
      // Del coach: es una decisión de programación; se le cuenta con el cambio hecho.
    });
  }

  for (const d of (revision.diasMalos ?? []).slice(0, MAXIMO_POR_TIPO)) {
    t.push({
      id: `dias_malos_${d.exerciseId}`, tono: 'alarma',
      texto: `${nombreDe(d.exerciseId)}: ${d.seguidos} sesiones seguidas empezando 2 o más repeticiones por debajo con el mismo peso. Ya no es un día malo: mira sueño, estrés y carga antes de añadir nada.`,
    });
  }

  // ── Dónde cae (S2) ───────────────────────────────────────────────────────
  // El caso local ya lo cuenta «va a menos»; aquí solo lo que cambia la
  // lectura: que sea una zona entera o que sea todo.
  const caida = revision.caida;
  if (caida && caida.tipo !== 'local') {
    t.push({
      id: `caida_${caida.tipo}`, tono: 'alarma',
      texto: `Caída ${caida.tipo === 'regional' ? 'de zona' : 'general'} (${listar(caida.ejercicios.map(nombreDe))}). ${caida.lectura}.`,
    });
  }

  // ── Descarga por señales y qué recortar primero (S7) ─────────────────────
  const descarga = revision.descarga;
  if (descarga?.recomendada) {
    const recortes = descarga.recortes.slice(0, 3).map(r => r.texto);
    t.push({
      id: 'descarga_senales', tono: 'alarma',
      texto: `Señales de descarga: ${listar(descarga.senales)}. ${recortes.length > 0
        ? `Antes de regalar una semana entera, recorta por aquí: ${recortes.join('; ')}.`
        : 'No hay nada evidente que recortar: programa una semana de descarga.'}`,
      paraCliente: 'Vienes cargado, así que esta semana te quito algo de trabajo para que recuperes.',
    });
  }

  // Una sesión de 8 o más con la media de la semana por debajo (auditoría de
  // cifras, 17-11-2026): no pide descarga, pero lo que se trabajó ese día no
  // se sube. Es una decisión de programación: sin versión para el atleta.
  if (!descarga?.recomendada && (descarga?.sesionesDuras?.length ?? 0) > 0) {
    const frases = descarga!.sesionesDuras!.slice(0, MAXIMO_POR_TIPO);
    t.push({
      id: 'sesiones_duras', tono: 'alarma',
      texto: `Cansancio al salir: ${frases.join('; ')}.`,
    });
  }

  // ── Estancamiento honesto (S1) ───────────────────────────────────────────
  const PARA_CLIENTE_ESTANCADO: Partial<Record<string, (n: string) => string>> = {
    apretar: n => `En ${n} llevas varias semanas igual y creo que te queda más margen del que apuntas: aprieta un poco más el final de cada serie.`,
    subir_series: n => `En ${n} llevas varias semanas igual: te ajusto el plan para desatascarlo.`,
    cambiar_variante: n => `En ${n} llevas muchas semanas igual: te lo cambio por una variante nueva.`,
  };
  for (const e of (revision.estancados ?? []).slice(0, MAXIMO_POR_TIPO)) {
    t.push({
      id: `estancado_${e.exerciseId}`,
      // «Mantener» no pide tocar nada: es un hecho, no una alarma.
      tono: e.veredicto === 'mantener' ? 'neutro' : 'alarma',
      // En semanas (17-11-2026): seis sesiones a frecuencia 2 eran tres semanas.
      texto: `Lleva ${textoDeSemanas(e.semanas)} sin mejorar en ${nombreDe(e.exerciseId).toLowerCase()} (${e.sesiones} sesiones comparables). ${e.accion}.`,
      paraCliente: PARA_CLIENTE_ESTANCADO[e.veredicto]?.(nombreDe(e.exerciseId).toLowerCase()),
    });
  }

  // ── Molestias por ejercicio (D5) y cómo llega (D4) ───────────────────────
  // Una molestia de 4 o más, o repetida, es para mirarla antes que cualquier
  // decisión de volumen.
  for (const m of (revision.molestias ?? []).filter(x => x.maxima >= 4 || x.veces >= 2).slice(0, MAXIMO_POR_TIPO)) {
    t.push({
      id: `molestia_${m.exerciseId}`, tono: 'alarma',
      texto: `${nombreDe(m.exerciseId)}: molestia de ${m.maxima}/10${m.veces > 1 ? ` (${m.veces} sesiones)` : ''}. Pídele vídeo y revisa técnica, recorrido y carga antes de seguir subiendo.`,
      paraCliente: `Me apuntaste una molestia en ${nombreDe(m.exerciseId).toLowerCase()}: mándame un vídeo de una serie y lo miramos.`,
    });
  }
  const ll = revision.llegadas;
  if (ll && ll.contestadas >= 2 && ll.justo * 2 > ll.contestadas) {
    t.push({
      id: 'llega_justo', tono: 'alarma',
      texto: `Llega justo a ${ll.justo} de ${ll.contestadas} sesiones (lo dice él al empezar). Antes de tocar el entreno, pregunta por sueño, comida y horario.`,
    });
  }

  // ── Series efectivas (S10) ───────────────────────────────────────────────
  const ef = revision.efectivas;
  if (ef?.pct != null && ef.pct < EFECTIVAS_MINIMO_PCT) {
    const donde = ef.dondeSePierden.slice(0, 2).map(d => nombreDe(d.exerciseId).toLowerCase());
    t.push({
      id: 'series_efectivas', tono: 'alarma',
      texto: `Solo ${ef.efectivas} de ${ef.hechas} series (${ef.pct} %) llegan a RIR ${RIR_EFECTIVO_MAXIMO} o menos: el volumen que cuenta es menor que el que dice el papel${donde.length > 0 ? `. Se pierden sobre todo en ${listar(donde)}` : ''}.`,
      paraCliente: 'Varias series se te quedan lejos del final: acércate más en las últimas repeticiones, que es donde está el estímulo.',
    });
  }

  // ── Calibración del RIR (F4) ─────────────────────────────────────────────
  const cal = revision.calibracion;
  if (cal) {
    const veces = `${cal.comprobaciones} ${cal.comprobaciones === 1 ? 'comprobación' : 'comprobaciones'}`;
    const reps = num(Math.abs(cal.desfaseMedio));
    const donde = cal.porEjercicio[0] && cal.porEjercicio.length > 1 ? `, sobre todo en ${nombreDe(cal.porEjercicio[0].exerciseId).toLowerCase()}` : '';
    if (cal.lectura === 'se_queda_lejos') {
      t.push({
        id: 'rir_lejos', tono: 'alarma',
        texto: `RIR: al comprobarlo con series al máximo (${veces}) se queda unas ${reps} repeticiones más lejos de lo que apunta${donde}. Antes de subirle series, que apriete.`,
        paraCliente: 'En las series al máximo te han salido más repeticiones de las que creías tener: puedes acercarte más al final de cada serie.',
      });
    } else if (cal.lectura === 'se_pasa') {
      t.push({
        id: 'rir_se_pasa', tono: 'neutro',
        texto: `RIR: al comprobarlo (${veces}) aprieta unas ${reps} repeticiones más de lo que apunta${donde}. Cuenta con más fatiga de la que dice el papel.`,
      });
    } else {
      t.push({ id: 'rir_fino', tono: 'bien', texto: `RIR comprobado con series al máximo (${veces}): va fino.` });
    }
  }

  // ── Comida ───────────────────────────────────────────────────────────────
  if (comida) {
    const { diasSinRegistrar, diasRegistrados, diasPorEncima, diasPorDebajo } = comida.patrones;
    const total = diasSinRegistrar + diasRegistrados;
    // Solo se habla de los huecos si son mayoría: uno o dos días sin apuntar
    // en una semana no dicen nada y gastarían un titular.
    if (total > 0 && diasSinRegistrar > total / 2) {
      t.push({
        id: 'comida_sin_registrar', tono: 'alarma',
        texto: `Ha dejado ${diasSinRegistrar} de ${total} días sin registrar la comida, así que de nutrición se ve poco.`,
        paraCliente: `Te faltan ${diasSinRegistrar} de ${total} días por registrar en la dieta: sin eso no puedo ajustarte nada.`,
      });
    } else if (diasPorEncima > diasPorDebajo && diasPorEncima > 0) {
      t.push({
        id: 'comida_por_encima', tono: 'neutro',
        texto: `Se pasó del cupo ${diasPorEncima} ${diasPorEncima === 1 ? 'día' : 'días'} de los ${diasRegistrados} que registró.`,
        paraCliente: `Te pasaste del cupo ${diasPorEncima} de los ${diasRegistrados} días que apuntaste.`,
      });
    } else if (diasPorDebajo > diasPorEncima && diasPorDebajo > 0) {
      t.push({
        id: 'comida_por_debajo', tono: 'neutro',
        texto: `Se quedó corto de cupo ${diasPorDebajo} ${diasPorDebajo === 1 ? 'día' : 'días'} de los ${diasRegistrados} que registró.`,
        paraCliente: `Te quedaste corto de cupo ${diasPorDebajo} de los ${diasRegistrados} días que apuntaste.`,
      });
    }
  }

  // ── Peso ─────────────────────────────────────────────────────────────────
  // Sin tono: que suba o baje es bueno o malo según el objetivo del bloque, y
  // este motor no lo conoce.
  if (peso?.deltaKg != null && peso.estaSemana != null) {
    const d = peso.deltaKg;
    const movimiento = d === 0
      ? 'igual que la semana pasada'
      : `${d > 0 ? '+' : '−'}${num(Math.abs(d))} kg respecto a la semana pasada`;
    t.push({
      id: 'peso', tono: 'neutro',
      texto: `Peso: ${num(peso.estaSemana)} kg de media, ${movimiento}.`,
    });
  }

  const titulares = t
    .map((x, i) => ({ x, i }))
    .sort((a, b) => ORDEN_TONO[a.x.tono] - ORDEN_TONO[b.x.tono] || a.i - b.i)
    .map(({ x }) => x);

  return { titulares, resumenParaCliente: borrador(titulares, params.athleteName, informe.sessions) };
}

/**
 * El borrador que se copia y se pega. Segunda persona, sin jerga y sin las
 * cifras que el atleta no puede interpretar: el tonelaje y el índice de
 * estímulo son del coach, no suyos.
 */
function borrador(titulares: Titular[], athleteName: string | undefined, sesiones: number): string {
  const nombre = primerNombre(athleteName);
  const partes: string[] = [`${nombre}, resumen de estas semanas:`];

  if (sesiones > 0) partes.push(`Has entrenado ${sesiones} ${sesiones === 1 ? 'día' : 'días'}.`);

  // Solo lo que tiene versión para él. Lo que solo existe en voz de coach —una
  // decisión de programación, una zona de volumen— se queda fuera del borrador
  // en vez de colarse tal cual en un mensaje al atleta.
  const bien = titulares.filter(x => x.tono === 'bien' && x.paraCliente).map(x => x.paraCliente!);
  if (bien.length > 0) partes.push(`Lo que va bien: ${bien.join(' ')}`);

  const alarmas = titulares.filter(x => x.tono === 'alarma' && x.paraCliente).map(x => x.paraCliente!);
  if (alarmas.length > 0) partes.push(`En lo que vamos a trabajar: ${alarmas.join(' ')}`);

  partes.push('—— (edita esto antes de mandárselo)');
  return partes.join('\n\n');
}
