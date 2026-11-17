import type {
  BodyMeasurement, BodyweightLog, CierreDeHipotesis, Diet, DietCompletionLog, Exercise, ExperienceLevel, Mesocycle, NutritionProgram, ProgressPhoto,
  Questionnaire, QuestionnaireResponse, WorkoutAssignment, WorkoutLog,
} from '../types.js';
import type { MotorCdg } from './cdg/motor.js';
import { fichaDeCierre, veredictosDelCierre, type VeredictosDelCierre } from './hipotesisDeBloque/veredictosDelCierre.js';
import { buildCierreMesociclo, type CierreMesociclo } from './cierreMesociclo.js';
import { finDeBloque } from './finDeBloque.js';
import { buildEvolucionDelBloque, type EvolucionDelBloque } from './evolucionDelBloque.js';
import { buildConclusionesDelBloque, type ConclusionesDelBloque } from './conclusionesDelBloque.js';
import { pesoCorporalEn } from './allometricScore.js';
import { hoyIsoLocal } from './trainingWeek.js';
import { faseEnCurso } from './objetivoDeFase.js';

// ═══════════════════════════════════════════════════════════════════════════
// EL CIERRE ENTERO, Y SU ÚNICO MENSAJE (17-11-2026)
//
// Había tres mensajes para el mismo cierre: el del editor del mesociclo (solo
// rendimiento), el de Revisión › Cierre de bloque (rendimiento + cuerpo +
// bienestar) y el que de verdad se enviaba al atleta, que repetía las sesiones
// dos veces y se calculaba SIN peso corporal, así que dominadas y fondos daban
// otra cifra que en pantalla. Tres textos distintos del mismo bloque es justo
// lo que hace que el cliente lea una cosa y el coach vea otra.
//
// Aquí se montan los tres motores juntos (rendimiento, evolución y
// conclusiones), siempre con el peso corporal del final del bloque, y sale UN
// mensaje. El editor, Revisión, el borrador que se firma y el asistente llaman
// a esto; ninguno monta su propio texto.
//
// 17-11-2026 (hipótesis del bloque): si el bloque tiene hipótesis, aquí salen
// también sus veredictos (`hipotesis`). Necesitan el motor CDG, que solo existe
// en la vista del coach: sin él vienen vacíos (`sinMotor`) y el resto del
// cierre es exactamente el mismo. No tocan el mensaje al cliente.
// ═══════════════════════════════════════════════════════════════════════════

export interface CierreCompleto {
  cierre: CierreMesociclo;
  evolucion: EvolucionDelBloque;
  conclusiones: ConclusionesDelBloque;
  /** Peso corporal usado en las series con el propio cuerpo; `null` sin pesajes. */
  pesoCorporalKg: number | null;
  /** El mensaje para el cliente. El coach lo edita antes de enviarlo. */
  mensaje: string;
  /**
   * Qué pasó con cada hipótesis del bloque y cómo acaba cada zona (de ahí
   * arranca el bloque siguiente). `null` en un bloque fuera del sistema de
   * hipótesis (sin tipo de bloque ni estrellas): los antiguos.
   */
  hipotesis: HipotesisDelCierre | null;
}

/** Los veredictos del bloque y su ficha de cierre del método (contexto, cansancio, molestias, nutrición y peso). */
export type HipotesisDelCierre = VeredictosDelCierre & { ficha: NonNullable<CierreDeHipotesis['ficha']> };

const DESPEDIDA = 'Con esto monto el siguiente bloque.';

/**
 * El mensaje del cierre: el rendimiento, luego el cuerpo y el bienestar, y la
 * despedida. Las sesiones se dicen una sola vez (van en el rendimiento).
 */
export function mensajeDeCierre(
  cierre: Pick<CierreMesociclo, 'resumenParaCliente'>,
  conclusiones: Pick<ConclusionesDelBloque, 'paraElCliente'>,
): string {
  return [
    ...cierre.resumenParaCliente.split('\n').filter(l => l.trim()),
    ...conclusiones.paraElCliente,
    DESPEDIDA,
  ].join('\n');
}

export function buildCierreCompleto(params: {
  meso: Mesocycle;
  mesocycles: Mesocycle[];
  logs: WorkoutLog[];
  assignments: WorkoutAssignment[];
  exercises: Exercise[];
  athleteName?: string;
  hoy?: string;
  /** Pesajes del atleta: de aquí sale el peso corporal del cierre y la evolución del peso. */
  bodyweightLogs?: BodyweightLog[];
  medidas?: BodyMeasurement[];
  photos?: ProgressPhoto[];
  responses?: QuestionnaireResponse[];
  questionnaires?: Questionnaire[];
  dietLogs?: DietCompletionLog[];
  diets?: Diet[];
  /**
   * Periodización de nutrición del atleta: de ella sale el objetivo corporal
   * que regía al terminar el bloque (o hoy, si sigue), con el que se juzga el
   * ritmo del peso. Se resuelve aquí para que todos los llamantes lo hagan igual.
   */
  programaNutricion?: NutritionProgram | null;
  /** Motor CDG (solo coach): con él se mide el proceso de cada hipótesis. Sin él, el cierre sale igual y sin veredictos. */
  motorCdg?: MotorCdg | null;
  /** Nivel del atleta (`OnboardingData.experienceLevel`): a un avanzado se le juzga a dos bloques. */
  nivel?: ExperienceLevel;
}): CierreCompleto {
  const { meso } = params;
  const hoy = params.hoy ?? hoyIsoLocal();
  const bodyweightLogs = params.bodyweightLogs ?? [];
  // Último peso conocido hasta el final del bloque: suma a las series de
  // dominadas y fondos. Se calcula aquí para que ningún llamante pueda olvidarlo.
  const pesoCorporalKg = pesoCorporalEn(finDeBloque(meso), bodyweightLogs);
  const cierre = buildCierreMesociclo({
    meso, mesocycles: params.mesocycles, logs: params.logs, assignments: params.assignments,
    exercises: params.exercises, athleteName: params.athleteName, hoy, pesoCorporalKg,
  });
  const fase = faseEnCurso(params.programaNutricion ?? null, hoy < cierre.fin ? hoy : cierre.fin);
  const objetivo = fase?.objetivo?.tipo ?? null;
  const evolucion = buildEvolucionDelBloque({
    inicio: cierre.inicio, fin: cierre.fin, semanas: cierre.semanasDeCalendario, hoy,
    bodyweightLogs, medidas: params.medidas, photos: params.photos,
    responses: params.responses, questionnaires: params.questionnaires,
    dietLogs: params.dietLogs, diets: params.diets, logs: params.logs, objetivo,
  });
  const conclusiones = buildConclusionesDelBloque(cierre, evolucion);
  const conHipotesis = meso.tipoBloque != null || Object.keys(meso.hipotesis ?? {}).length > 0;
  const porId = conHipotesis ? new Map(params.exercises.map(e => [e.id, e])) : null;
  const veredictos = porId ? veredictosDelCierre({
    meso, mesocycles: params.mesocycles, logs: params.logs, fin: cierre.fin, hoy,
    progresion: cierre.progresion.ejercicios, adherenciaPct: cierre.sesiones.adherenciaPct,
    motor: params.motorCdg, nombreCdgDe: id => porId.get(id)?.cdgNombre,
    nivel: params.nivel, responses: params.responses, questionnaires: params.questionnaires,
  }) : null;
  const hipotesis = veredictos && porId ? {
    ...veredictos,
    ficha: fichaDeCierre({
      contexto: veredictos.contexto, cansancioMedio: veredictos.cansancioMedio, ejercicios: veredictos.ejercicios,
      nombreDe: id => porId.get(id)?.name, faseNutricional: fase?.fase.name, pesoDeltaKg: evolucion.peso?.deltaKg,
    }),
  } : null;
  return { cierre, evolucion, conclusiones, pesoCorporalKg, mensaje: mensajeDeCierre(cierre, conclusiones), hipotesis };
}
