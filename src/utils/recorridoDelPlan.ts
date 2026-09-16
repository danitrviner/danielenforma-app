import { HubTab } from '../components/ClientHub';

// ═══════════════════════════════════════════════════════════════════════════
// EL RECORRIDO DEL PLAN — montar el mes de un atleta, de la A a la Z.
//
// Origen ÚNICO de dos cosas que hasta ahora vivían duplicadas y se
// sincronizaban a mano:
//
//   · El guion cerrado que sigue el asistente (`ai/tareas.ts`), 19 pasos en
//     seis bloques.
//   · El recorrido que el coach hace a mano en la pestaña de Implantación.
//
// La cabecera de `ai/tareas.ts` lo admitía por escrito: «La lista es la MISMA
// que la checklist de Setup. Si allí se añade un item, aquí hay que añadir el
// paso». Eso es una obligación de sincronía manual esperando a romperse: un
// paso nuevo que solo entre en una de las dos listas deja al asistente
// diciendo que ha terminado un plan que la checklist da por incompleto, o al
// revés. Ahora las dos se derivan de aquí.
//
// El orden NO es estético: cada paso necesita que exista el anterior. Las
// sesiones necesitan el mesociclo, publicar necesita las sesiones, el
// calendario de dietas necesita las dietas (se resuelven por nombre).
//
// ── Qué NO está aquí ───────────────────────────────────────────────────────
// Los ítems de acompañamiento de la checklist (contacto diario, reseña,
// referidos, decisión de renovación) no son pasos de montaje: pertenecen a las
// fases `primeras_semanas` y `consolidacion` de `clientSetup.ts` y viven allí.
// Montar el programa y acompañar al cliente son dos carriles distintos.
// ═══════════════════════════════════════════════════════════════════════════

export type BloqueRecorrido =
  | 'alta' | 'entrenamiento' | 'nutricion' | 'configuracion' | 'roadmap' | 'cierre';

export interface MetaBloque {
  /** La letra con la que se numera en el guion de la IA. */
  letra: string;
  titulo: string;
  /** Aclaración que va pegada al título en el prompt, si la hay. */
  nota?: string;
}

export const BLOQUES_RECORRIDO: Record<BloqueRecorrido, MetaBloque> = {
  alta:          { letra: 'A', titulo: 'Antes de proponer nada — el alta' },
  entrenamiento: { letra: 'B', titulo: 'Entrenamiento' },
  nutricion:     { letra: 'C', titulo: 'Nutrición' },
  configuracion: { letra: 'D', titulo: 'Configuración del plan', nota: ' (todo esto va en UNA propose_setup_config)' },
  roadmap:       { letra: 'E', titulo: 'Road map — lo que el atleta ve venir' },
  cierre:        { letra: 'F', titulo: 'Cierre' },
};

export const ORDEN_BLOQUES: BloqueRecorrido[] =
  ['alta', 'entrenamiento', 'nutricion', 'configuracion', 'roadmap', 'cierre'];

export interface PasoDelRecorrido {
  /** Número que se lee en el guion: '0', '0b', '1'… */
  numero: string;
  /**
   * Cómo se llama el paso en la pantalla del coach.
   *
   * Es un campo aparte de `instruccionIA` a propósito: esa es texto de prompt,
   * larga y dirigida al modelo («Repasa el ALTA del brief entera. Todo lo que
   * esté sin contestar…»). Derivar el título recortándola daba etiquetas como
   * «CUESTIONARIO periódico con su cadencia, y FOTOS d…», que en un índice no
   * se leen. Dos audiencias, dos textos.
   */
  titulo: string;
  bloque: BloqueRecorrido;
  /** Dónde lo hace el coach a mano. Sin pestaña = no hay pantalla que abrir. */
  tab?: HubTab;
  /**
   * Ítems de `SEEDED_ITEMS` (clientSetup.ts) que comprueban este paso. Vacío o
   * ausente = el paso no deja rastro comprobable en los datos: «repasa el
   * alta» o «termina con un resumen» no se pueden verificar leyendo Firestore,
   * así que la checklist no los mide y el recorrido los marca a mano.
   */
  comprueba?: string[];
  /**
   * Qué hay que DECIDIR en este paso, dicho al coach.
   *
   * No es un resumen de `instruccionIA` ni del título. La instrucción es texto
   * de prompt —le dice al modelo qué herramienta llamar y con qué criterio— y
   * el título solo nombra la pieza. Esto es lo otro: la elección concreta que
   * hay delante, que es lo que de verdad cuesta y lo que se olvida a las tres
   * de la tarde con el octavo cliente.
   *
   * Ausente en los pasos que no tienen nada que elegir (repasar el alta,
   * cerrar con el resumen).
   */
  queDecidir?: string;
  /**
   * La línea LITERAL del guion del asistente. Es texto de prompt, no copia de
   * interfaz: se toca sabiendo que cambia lo que hace el modelo.
   */
  instruccionIA: string;
}

export const PASOS_DEL_RECORRIDO: PasoDelRecorrido[] = [
  {
    numero: '0',
    titulo: 'Repasar el alta',
    bloque: 'alta',
    tab: 'ficha',
    comprueba: ['alta_onboarding'],
    queDecidir:
      'Qué te falta por preguntarle y qué vas a asumir sin preguntar. Bloquean de verdad cuatro cosas: días que puede entrenar, minutos por sesión, material y lesiones activas.',
    instruccionIA:
      'Repasa el ALTA del brief entera. Todo lo que esté sin contestar, a medias o se contradiga con lo que ves en sus datos, déjalo como nota con add_coach_task (una nota por cosa, con el dato dentro: "En el alta puso 5 días pero solo registra 3 entrenos: confirmar días reales"). Bloquean de verdad: días que va a entrenar, minutos por sesión, material, lesiones activas. Lo que bloquea se pregunta; lo que no, se asume y se dice qué has asumido.',
  },
  {
    numero: '0b',
    titulo: 'Datos que faltan del plan',
    bloque: 'alta',
    tab: 'ficha',
    instruccionIA:
      'Si le falta la fecha de inicio, la duración del plan o el peso objetivo, van en el paso 8 (propose_setup_config), no en una nota.',
  },
  {
    numero: '1',
    titulo: 'Mesociclo',
    bloque: 'entrenamiento',
    tab: 'entrenamientos',
    comprueba: ['prog_mesociclo'],
    queDecidir:
      'Cuántas semanas dura el bloque, cuántos días entrena y a qué grupos les das prioridad. La prioridad no es un adorno: decide dónde van las series que sobran.',
    instruccionIA:
      '**Mesociclo** (propose_mesocycle): semanas, días por ciclo, objetivo y reparto de series por grupo. Llama antes a get_volume_suggestion con los días y las prioridades que hayas decidido: ese motor conoce los umbrales por grupo de tu doctrina y lo que pasó en el bloque anterior. Usa sus números y, si te desvías de alguno, di por qué.',
  },
  {
    numero: '2',
    titulo: 'Sesiones',
    bloque: 'entrenamiento',
    tab: 'entrenamientos',
    comprueba: ['prog_sesiones'],
    queDecidir:
      'Qué ejercicios de los que YA programas le pones a cada día, y con qué series, reps y RIR. Si un grupo no tiene nada usable con su material, ahí sí se busca fuera.',
    instruccionIA:
      '**Sesiones** (propose_workout_days): cada día con sus ejercicios, series, reps, RIR y descansos. Elige del bloque «CÓMO PROGRAMA DANI» del contexto — no pidas get_exercise_usage ni recorras el catálogo grupo a grupo; get_exercise_library solo si un grupo no tiene nada usable ahí o el material lo descarta.',
  },
  {
    numero: '3',
    titulo: 'Publicar el bloque',
    bloque: 'entrenamiento',
    tab: 'entrenamientos',
    comprueba: ['prog_entrenos_semana'],
    queDecidir:
      'En qué fecha arranca el bloque en su calendario. Hasta que no publiques, el atleta tiene un plan que no ve.',
    instruccionIA:
      '**Publicar el bloque** (propose_publish_block): vuelca las sesiones al calendario del atleta. Sin este paso tiene un plan que no ve. Va siempre después del 2.',
  },
  {
    numero: '4',
    titulo: 'Periodización nutricional',
    bloque: 'nutricion',
    tab: 'dietas',
    comprueba: ['prog_periodizacion'],
    queDecidir:
      'Cuántas fases, de cuántas semanas cada una y con qué kcal. Solo el presupuesto de intercambios: los alimentos los colocas tú después en el editor.',
    instruccionIA:
      '**Periodización nutricional** (propose_nutrition_program): las fases encadenadas con sus semanas, kcal y recargas, y dentro de cada fase su dieta. Manda solo el PRESUPUESTO de intercambios de cada dieta (HC / PROT / GRASA): los alimentos los coloca Dani en el editor de dietas. NO rellenes comidas salvo que te lo pida.',
  },
  {
    numero: '5',
    titulo: 'Ajuste de dieta suelto',
    bloque: 'nutricion',
    tab: 'dietas',
    comprueba: ['prog_dietas'],
    queDecidir:
      'Si le hace falta alguna dieta suelta fuera de la periodización — el día de descanso, el día libre.',
    instruccionIA:
      '**Ajuste de dieta suelto** (propose_diet_update) solo si hace falta una dieta fuera de la periodización (día de descanso, día libre). Mismo criterio: presupuesto sí, comidas no.',
  },
  {
    numero: '6',
    titulo: 'Fecha, duración y peso objetivo',
    bloque: 'configuracion',
    tab: 'ficha',
    comprueba: ['alta_plan_fechado', 'alta_peso_meta'],
    queDecidir:
      'Cuándo empieza el plan, cuánto dura y a qué peso vais. Sin duración no hay renovación que preparar.',
    instruccionIA:
      'Fecha de inicio, duración del plan y peso objetivo, si faltan.',
  },
  {
    numero: '7',
    titulo: 'Objetivo de pasos',
    bloque: 'configuracion',
    tab: 'dietas',
    comprueba: ['prog_pasos'],
    queDecidir:
      'Cuántos pasos al día le pides. Es la palanca de gasto que no depende de que pise el gimnasio.',
    instruccionIA:
      'Objetivo diario de PASOS.',
  },
  {
    numero: '8',
    titulo: 'Dietas activas y calendario',
    bloque: 'configuracion',
    tab: 'dietas',
    comprueba: ['prog_calendario_dietas'],
    queDecidir:
      'Qué come cada día de la semana. Ojo al orden: las dietas se resuelven por nombre, así que esto va DESPUÉS de la periodización.',
    instruccionIA:
      'Qué dietas quedan activas y el CALENDARIO semanal de dietas (qué come cada día de la semana). Ojo: se resuelven por nombre, así que esta propuesta se aprueba DESPUÉS de la periodización.',
  },
  {
    numero: '9',
    titulo: 'Cuestionario y fotos',
    bloque: 'configuracion',
    tab: 'revisiones',
    comprueba: ['alta_cuestionario', 'alta_foto_inicial'],
    queDecidir:
      'Cada cuánto le pides el cuestionario y qué fotos quieres. Una cadencia a medias no se dispara nunca.',
    instruccionIA:
      'CUESTIONARIO periódico con su cadencia, y FOTOS de seguimiento con sus vistas y cadencia.',
  },
  {
    numero: '10',
    titulo: 'Ejercicios para retos',
    bloque: 'configuracion',
    tab: 'roadmap',
    comprueba: ['prog_retos_config'],
    queDecidir:
      'Cuáles son sus básicos de verdad: los ejercicios sobre los que tiene sentido ponerle un reto de carga.',
    instruccionIA:
      'Ejercicios elegibles para RETOS de carga (sus básicos reales).',
  },
  {
    numero: '11',
    titulo: 'Cardio',
    bloque: 'configuracion',
    tab: 'cardio',
    comprueba: ['prog_cardio'],
    queDecidir:
      'Si le toca cardio y de qué tipo — Zona 2 para base, VO₂máx si ya la tiene.',
    instruccionIA:
      'CARDIO: programa de Zona 2 o de VO₂máx, si le toca.',
  },
  {
    numero: '12',
    titulo: 'Escalera de niveles',
    bloque: 'roadmap',
    tab: 'roadmap',
    comprueba: ['prog_escalera'],
    queDecidir:
      'Si la escalera por defecto le sirve. Casi siempre sí: cambiarla por cambiarla es trabajo que no compra nada.',
    instruccionIA:
      '**Escalera de niveles** (propose_level_ladder), solo si la de por defecto no le sirve. Si le sirve, dilo y no propongas por proponer.',
  },
  {
    numero: '13',
    titulo: 'Fases del plan e hitos',
    bloque: 'roadmap',
    tab: 'roadmap',
    comprueba: ['prog_fases_plan'],
    queDecidir:
      'Las fases grandes del plan y los hitos con fecha. Es lo único que le enseña hacia dónde va más allá de esta semana.',
    instruccionIA:
      '**Fases del plan e hitos** (propose_roadmap_items): las fases macro y los hitos con fecha.',
  },
  {
    numero: '14',
    titulo: 'Días señalados',
    bloque: 'roadmap',
    tab: 'roadmap',
    comprueba: ['prog_dias_senalados'],
    queDecidir:
      'Si el mes lleva algún día señalado: toma de marcas, AMRAP, recarga. Uno o dos, no diez.',
    instruccionIA:
      '**Días señalados** (propose_special_day): toma de marcas, AMRAP, recarga. Uno o dos en el mes, no diez.',
  },
  {
    numero: '15',
    titulo: 'Reto de la semana',
    bloque: 'roadmap',
    tab: 'roadmap',
    comprueba: ['w1_reto_semana'],
    queDecidir:
      'Cuál de las opciones que calcula el motor con SUS datos le pones esta semana.',
    instruccionIA:
      '**Reto de la semana** (get_challenge_options y luego propose_weekly_challenge): mira antes las opciones que calcula el motor con SUS datos.',
  },
  {
    numero: '16',
    titulo: 'Ficha viva',
    bloque: 'cierre',
    tab: 'ficha',
    comprueba: ['prog_ficha_viva'],
    queDecidir:
      'Sus objetivos con sus palabras, dónde está hoy, qué esperas ver en estas semanas y qué vas a mirar en la próxima revisión.',
    instruccionIA:
      '**Ficha viva** (propose_dossier_update): objetivos con sus palabras, dónde está hoy, qué esperamos ver en estas semanas, el foco de la próxima revisión y las preguntas abiertas.',
  },
  {
    numero: '17',
    titulo: 'El mes de un vistazo',
    bloque: 'cierre',
    instruccionIA:
      'Termina con «El mes de un vistazo»: una línea por pieza, en el orden en que Dani debe aprobarlas, y las notas que le has dejado. Nada después de eso.',
  },
];

/** El id estable de un paso, para guardar estado contra él. */
export function idDePaso(p: PasoDelRecorrido): string {
  return `paso_${p.numero}`;
}

/** Los pasos de un bloque, en orden. */
export function pasosDeBloque(bloque: BloqueRecorrido): PasoDelRecorrido[] {
  return PASOS_DEL_RECORRIDO.filter(p => p.bloque === bloque);
}

/**
 * El guion numerado que se le manda al asistente.
 *
 * Se genera desde `PASOS_DEL_RECORRIDO` para que no pueda desincronizarse del
 * recorrido que ve el coach. `ai/tareas.ts` lo mete tal cual en el prompt, y
 * `recorridoDelPlan.test.ts` fija el texto resultante carácter a carácter: si
 * alguien toca un paso, el test enseña exactamente qué línea del prompt cambia
 * antes de que se entere el modelo.
 */
export function textoDelPlanCompleto(): string {
  const cabecera = '### El plan entero, en este orden (no pares a la mitad ni preguntes «¿sigo?»)';
  const cuerpo = ORDEN_BLOQUES.map(b => {
    const meta = BLOQUES_RECORRIDO[b];
    const titulo = `**${meta.letra}. ${meta.titulo}**${meta.nota ?? ''}`;
    const lineas = pasosDeBloque(b).map(p => `${p.numero}. ${p.instruccionIA}`);
    return [titulo, ...lineas].join('\n');
  }).join('\n\n');
  return `${cabecera}\n\n${cuerpo}\n\n${COLA_DEL_PLAN}`;
}

/** El cierre del guion: qué hacer cuando falta un dato. */
const COLA_DEL_PLAN =
  'Si te falta un dato que cambia una decisión, agrupa las preguntas (máximo 5, de más a menos '
  + 'bloqueante) y propón igualmente el 80% que sí puedes, diciendo qué has asumido y qué cambiaría '
  + 'si la respuesta fuese otra.';
