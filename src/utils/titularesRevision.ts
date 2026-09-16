import { MUSCLE_LABELS } from '../types';
import { RevisionDelAtleta } from './revisionCoach';
import { ComidaDeLaSemana } from './comidaDeLaSemana';
import { PesoVsSemanaPasada } from './revisionCoach';

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
      el atleta no pueda interpretar (tonelaje, IEA, zonas de volumen).

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
  const { informe, mapa, suben, bajan, bienestar, ventana } = revision;
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

  // ── Grupos prioritarios a los que no se les está dando volumen ───────────
  const abandonados = mapa.filter(
    c => c.prioridad === 'alta' && (c.zona === 'sin_volumen' || c.zona === 'mev'),
  );
  if (abandonados.length > 0) {
    t.push({
      id: 'prioritarios_sin_volumen', tono: 'alarma',
      texto: `${listar(abandonados.map(c => c.label))} ${abandonados.length === 1 ? 'es prioridad alta y no llega' : 'son prioridad alta y no llegan'} al mínimo efectivo.`,
      // Del coach: el atleta no decide el volumen, lo ajusto yo.
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

  // ── Disposición en negativo ──────────────────────────────────────────────
  if (bienestar.irp.valor != null && bienestar.irp.valor <= 0) {
    t.push({
      id: 'irp_negativo', tono: 'alarma',
      texto: 'Entre el estrés y las agujetas no le queda margen de recuperación: ahora mismo no es momento de subirle carga.',
      paraCliente: 'Vienes justo de descanso y de recuperación, así que esta vuelta toca aflojar antes que apretar.',
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
  if (peor && peor.deltaOrmPct != null && peor.deltaOrmPct < 0) {
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
