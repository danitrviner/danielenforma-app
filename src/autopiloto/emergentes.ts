/* ═══════════════════════════════════════════════════════════════════════════
   DETECTORES EMERGENTES (diseño §2.3, tanda 6, H16): lo que pasa entre
   revisiones y no espera al lunes. Siete tipos, todos deterministas y puros:
   reciben la foto del atleta que el latido ya tiene leída y devuelven
   episodios `pendiente` con id estable, así que detectar dos veces lo mismo no
   duplica nada (`crearEpisodioUnaVez`).

   · dolor             texto nuevo con dolor/molestia (cuestionario, check-in,
                       nota de entreno). Clínico si el alta declara lesión o
                       suena persistente: entonces va con `alertas` y todo lo
                       que proponga queda para Dani.
   · perdidas          3 sesiones perdidas en 14 días.
   · peso_sin_registrar 10 días sin pesarse en una fase con objetivo de peso.
   · desvio_peso       ritmo del peso fuera del rango de su fase dos semanas
                       seguidas (motor `verificarObjetivo`) con adherencia ≥ 70 %.
   · desvio_adherencia adherencia por kcal < 70 % dos semanas seguidas.
   · nota_libre        texto nuevo largo o con palabras clave (viaje, enfermo,
                       vacaciones, regla, estrés, cambiar, no puedo).
   · bienestar         contexto desfavorable dos semanas, sueño < 6 h o estrés ≥ 7.

   Nada de aquí toca Firestore ni llama al modelo: el consumidor hace lo demás.
   ═══════════════════════════════════════════════════════════════════════════ */
import type {
  BodyweightLog, Diet, DietCompletionLog, NutritionProgram, OnboardingData, PoliticaPropuesta, Questionnaire, QuestionnaireResponse,
  WeightCheckIn, WorkoutAssignment, WorkoutLog,
} from '../types.js';
import { addDays, isoLocal } from '../utils/trainingWeek.js';
import { isoWeekKey } from '../utils/challengeOptions.js';
import { faseEnCurso } from '../utils/objetivoDeFase.js';
import { verificarObjetivo, RANGO_PCT_SEMANA } from '../utils/verificacionObjetivo.js';
import { adherenciaPorKcal } from '../utils/diaDeDieta.js';
import { historialDeSeñal } from '../utils/signalReading.js';
import { contextoDeLaSemana, UMBRALES_PROTOCOLO } from '../utils/cdg/agujetas.js';
import { nuevoEpisodio, type Episodio } from './episodios.js';

export interface FotoEmergente {
  email: string;
  hoy: string;
  ahora: string;
  consentimiento: boolean;
  politica: PoliticaPropuesta;
  asignaciones: WorkoutAssignment[];
  logs: WorkoutLog[];
  pesajes: BodyweightLog[];
  registros: DietCompletionLog[];
  dietas: Diet[];
  programa: NutritionProgram | null;
  respuestas: QuestionnaireResponse[];
  plantillas: Questionnaire[];
  checkins: WeightCheckIn[];
  alta?: OnboardingData | null;
}

export const DIAS_TEXTO_NUEVO = 3;
export const PERDIDAS_EN_QUINCENA = 3;
export const DIAS_SIN_PESARSE = 10;
export const ADHERENCIA_MINIMA_PCT = 70;
export const DIAS_REGISTRADOS_MINIMOS = 3;
export const TEXTO_LARGO = 80;

const RE_DOLOR = /\b(dolor|duele|dol[ií]a|molestia|molesta|lesi[oó]n|pinch|tir[oó]n|inflam|contractura)/i;
const RE_PERSISTENTE = /\b(semanas|persistente|m[eé]dico|fisio|traumat|lesi[oó]n|desde hace)/i;
const RE_NOTA = /\b(viaje|viajo|enferm|vacacion|regla|estr[eé]s|estresad|cambiar|no puedo|no voy a poder|mudanza|trabajo nuevo|examen)/i;

/** Hash corto y estable para el id de un episodio por texto. */
export function hashTexto(texto: string): string {
  let h = 5381;
  for (let i = 0; i < texto.length; i++) h = ((h << 5) + h + texto.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

interface TextoNuevo { texto: string; fuente: string; docId: string; fecha: string; exerciseId?: string }

/** Todo texto libre del atleta de los últimos días, venga de donde venga. */
export function textosNuevos(f: FotoEmergente): TextoNuevo[] {
  const desde = addDays(f.hoy, -DIAS_TEXTO_NUEVO);
  const out: TextoNuevo[] = [];
  for (const r of f.respuestas) {
    const fecha = (r.submittedAt ?? '').slice(0, 10);
    if (fecha < desde) continue;
    for (const a of r.answers) {
      if (typeof a.value === 'string' && a.value.trim().length >= 12) out.push({ texto: a.value.trim(), fuente: 'questionnaireResponses', docId: `${r.id}:${a.questionId}`, fecha });
    }
  }
  for (const c of f.checkins) {
    const fecha = c.timestamp instanceof Date && !Number.isNaN(c.timestamp.getTime()) ? isoLocal(c.timestamp) : '';
    if (!fecha || fecha < desde || !c.notes?.trim()) continue;
    out.push({ texto: c.notes.trim(), fuente: 'checkins', docId: c.id, fecha });
  }
  for (const l of f.logs) {
    if (l.date < desde) continue;
    if (l.note?.trim()) out.push({ texto: l.note.trim(), fuente: 'workoutLogs', docId: l.id, fecha: l.date });
    for (const e of l.entries) if (e.note?.trim()) out.push({ texto: e.note.trim(), fuente: 'workoutLogs', docId: `${l.id}:${e.exerciseId}`, fecha: l.date, exerciseId: e.exerciseId });
  }
  return out;
}

export function detectarDolor(f: FotoEmergente): Episodio[] {
  if (!f.consentimiento) return [];
  const lesionDeclarada = !!f.alta?.injuries?.trim() && !/^(no|ninguna|nada)\.?$/i.test(f.alta!.injuries.trim());
  return textosNuevos(f).filter(t => RE_DOLOR.test(t.texto)).map(t => {
    const clinico = lesionDeclarada || RE_PERSISTENTE.test(t.texto);
    return nuevoEpisodio({
      tipo: 'dolor', athleteId: f.email, clave: `${f.email}_${hashTexto(t.texto)}`,
      disparador: { fuente: t.fuente, docId: t.docId, fecha: t.fecha }, politica: f.politica, ahora: f.ahora,
      alertas: clinico ? [`${lesionDeclarada ? 'Lesión declarada en el alta' : 'Suena persistente'}: «${t.texto.slice(0, 160)}»`] : undefined,
    });
  });
}

export function detectarPerdidas(f: FotoEmergente): Episodio[] {
  if (!f.consentimiento) return [];
  const desde = addDays(f.hoy, -14);
  const perdidas = f.asignaciones.filter(a => a.status === 'perdido' && a.date >= desde && a.date <= f.hoy).map(a => a.date).sort();
  if (perdidas.length < PERDIDAS_EN_QUINCENA) return [];
  const ultima = perdidas[perdidas.length - 1];
  return [nuevoEpisodio({
    tipo: 'perdidas', athleteId: f.email, clave: `${f.email}_${ultima}`,
    disparador: { fuente: 'workoutAssignments', fecha: ultima }, politica: f.politica, ahora: f.ahora,
  })];
}

/** El objetivo de la fase en curso, si hay uno con rango de peso que verificar. */
function objetivoEnCurso(f: FotoEmergente) {
  const fase = faseEnCurso(f.programa, f.hoy);
  const tipo = fase?.objetivo?.tipo;
  if (!fase || !tipo) return null;
  return { tipo: tipo === 'recomposicion' ? ('mantenimiento' as const) : tipo, desde: fase.desde };
}

export function detectarPesoSinRegistrar(f: FotoEmergente): Episodio[] {
  if (!f.consentimiento || !objetivoEnCurso(f)) return [];
  const ultimo = f.pesajes.map(p => p.date).sort().at(-1);
  const limite = addDays(f.hoy, -DIAS_SIN_PESARSE);
  if (ultimo && ultimo > limite) return [];
  const clave = ultimo ? addDays(ultimo, DIAS_SIN_PESARSE) : `nunca_${isoWeekKey(f.hoy)}`;
  return [nuevoEpisodio({
    tipo: 'peso_sin_registrar', athleteId: f.email, clave: `${f.email}_${clave}`,
    disparador: { fuente: 'bodyweightLogs', fecha: f.hoy }, politica: f.politica, ahora: f.ahora,
  })];
}

/** Adherencia por kcal de la semana ISO (kcal comidas / kcal objetivo de los días con registro). */
export function adherenciaSemanal(f: Pick<FotoEmergente, 'registros' | 'dietas'>, semana: string): { pct: number; dias: number } {
  let comido = 0; let objetivo = 0; let dias = 0;
  for (const r of f.registros) {
    if (isoWeekKey(r.date) !== semana) continue;
    const a = adherenciaPorKcal(r, f.dietas);
    if (!a) continue;
    comido += a.comido.kcal; objetivo += a.objetivo.kcal; dias++;
  }
  return { pct: objetivo > 0 ? Math.round((comido / objetivo) * 1000) / 10 : 0, dias };
}

/** Las dos últimas semanas COMPLETAS (la actual no cuenta hasta que acaba). */
function dosSemanasCerradas(hoy: string): [string, string] {
  return [isoWeekKey(addDays(hoy, -14)), isoWeekKey(addDays(hoy, -7))];
}

export function detectarDesvioAdherencia(f: FotoEmergente): Episodio[] {
  if (!f.consentimiento || f.dietas.length === 0) return [];
  const [s1, s2] = dosSemanasCerradas(f.hoy);
  const a1 = adherenciaSemanal(f, s1); const a2 = adherenciaSemanal(f, s2);
  const baja = (a: { pct: number; dias: number }) => a.dias < DIAS_REGISTRADOS_MINIMOS || a.pct < ADHERENCIA_MINIMA_PCT;
  if (!baja(a1) || !baja(a2)) return [];
  return [nuevoEpisodio({
    tipo: 'desvio_adherencia', athleteId: f.email, clave: `${f.email}_${s2}`,
    disparador: { fuente: 'dietCompletionLogs', fecha: f.hoy }, politica: f.politica, ahora: f.ahora,
  })].map(ep => ({ ...ep, paraDani: `adherencia ${a1.pct} % (${a1.dias} días) y ${a2.pct} % (${a2.dias} días)` }));
}

export function detectarDesvioPeso(f: FotoEmergente): Episodio[] {
  if (!f.consentimiento) return [];
  const objetivo = objetivoEnCurso(f);
  if (!objetivo || !RANGO_PCT_SEMANA[objetivo.tipo]) return [];
  // Con la comida sin seguir, el desvío es de adherencia, no de kcal.
  const [s1, s2] = dosSemanasCerradas(f.hoy);
  const adh = [adherenciaSemanal(f, s1), adherenciaSemanal(f, s2)];
  if (adh.some(a => a.dias >= DIAS_REGISTRADOS_MINIMOS && a.pct < ADHERENCIA_MINIMA_PCT)) return [];
  const fuera = (hoy: string) => {
    const v = verificarObjetivo({ objetivo, pesos: f.pesajes, hoy });
    return v.estado === 'lento' || v.estado === 'rapido' || v.estado === 'contrario' ? v : null;
  };
  const ahora = fuera(f.hoy);
  const antes = ahora ? fuera(addDays(f.hoy, -7)) : null;
  if (!ahora || !antes) return [];
  return [nuevoEpisodio({
    tipo: 'desvio_peso', athleteId: f.email, clave: `${f.email}_${isoWeekKey(f.hoy)}`,
    disparador: { fuente: 'bodyweightLogs', fecha: f.hoy }, politica: f.politica, ahora: f.ahora,
  })].map(ep => ({
    ...ep,
    // Los números del motor viajan en el episodio: el modelo no los recalcula.
    paraDani: `${ahora.estado} dos semanas · ritmo ${ahora.ritmoKg ?? '?'} kg/sem (${ahora.ritmoPct ?? '?'} %) · ajuste orientativo ${ahora.ajusteKcal ?? 0} kcal/día`,
  }));
}

export function detectarNotaLibre(f: FotoEmergente): Episodio[] {
  if (!f.consentimiento) return [];
  return textosNuevos(f)
    .filter(t => !RE_DOLOR.test(t.texto) && (t.texto.length >= TEXTO_LARGO || RE_NOTA.test(t.texto)))
    .map(t => nuevoEpisodio({
      tipo: 'nota_libre', athleteId: f.email, clave: `${f.email}_${hashTexto(t.texto)}`,
      disparador: { fuente: t.fuente, docId: t.docId, fecha: t.fecha }, politica: f.politica, ahora: f.ahora,
    }));
}

export function detectarBienestar(f: FotoEmergente): Episodio[] {
  if (!f.consentimiento) return [];
  const serie = (k: string) => historialDeSeñal(k, f.respuestas, f.plantillas);
  const estres = serie('wellness.stress_weekly'); const sueño = serie('wellness.sleep_hours_weekly'); const motivacion = serie('wellness.motivation_weekly');
  // Una lectura por FECHA de respuesta (las tres señales pueden no venir juntas).
  const fechas = [...new Set([...estres, ...sueño, ...motivacion].map(p => p.date))].sort();
  if (fechas.length === 0) return [];
  const valorEn = (s: { date: string; value: number }[], fecha: string) => s.find(p => p.date === fecha)?.value;
  const lectura = (fecha: string) => ({ estres: valorEn(estres, fecha), sueñoHoras: valorEn(sueño, fecha), motivacion: valorEn(motivacion, fecha) });
  const ultima = fechas[fechas.length - 1];
  if (ultima < addDays(f.hoy, -DIAS_TEXTO_NUEVO)) return [];
  const contexto = (fecha: string | undefined) => (fecha ? contextoDeLaSemana(lectura(fecha)).contexto : 'sin-dato');
  const dosSemanas = contexto(ultima) === 'desfavorable' && contexto(fechas[fechas.length - 2]) === 'desfavorable';
  const l = lectura(ultima);
  const grave = (l.sueñoHoras ?? 99) < UMBRALES_PROTOCOLO.sueñoMaloHoras || (l.estres ?? 0) >= UMBRALES_PROTOCOLO.estresMalo;
  if (!dosSemanas && !grave) return [];
  return [nuevoEpisodio({
    tipo: 'bienestar', athleteId: f.email, clave: `${f.email}_${isoWeekKey(ultima)}`,
    disparador: { fuente: 'questionnaireResponses', fecha: ultima }, politica: f.politica, ahora: f.ahora,
  })].map(ep => ({ ...ep, paraDani: dosSemanas ? 'contexto desfavorable dos semanas seguidas' : `sueño ${l.sueñoHoras ?? '?'} h · estrés ${l.estres ?? '?'}/10` }));
}

/** Todos los emergentes de hoy, por prioridad. Los textos con dolor NO van también como nota libre. */
export function detectarEmergentes(f: FotoEmergente): Episodio[] {
  return [
    ...detectarDolor(f), ...detectarNotaLibre(f), ...detectarPerdidas(f), ...detectarPesoSinRegistrar(f),
    ...detectarDesvioPeso(f), ...detectarDesvioAdherencia(f), ...detectarBienestar(f),
  ].sort((a, b) => a.prioridad - b.prioridad || a.creadoEn.localeCompare(b.creadoEn));
}
