import type {
  BodyweightLog, DietCompletionLog, QuestionnaireAssignment, QuestionnaireResponse,
  SenalesDelAtleta, StepLog, WorkoutAssignment, WorkoutLog,
} from '../types.js';
import { addDays } from './trainingWeek.js';
import { conEstadoReal } from './estadoDeAsignacion.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Señales de acompañamiento de un atleta (28-10-2026)

   La bandeja del día (utils/bandejaDelDia.ts) no lee historial: recibe lo que
   la pantalla de clientes ya tiene y poco más. Por eso hasta ahora «se está
   apagando» solo se podía deducir de `lastLoginAt` —y un atleta que abre la
   app sin registrar nada pasa por activo—, y las sesiones perdidas no
   contaban para nada.

   Esto es la DECISIÓN de qué resumir, pura: recibe la foto que el latido ya
   lee de cada atleta y devuelve las cuatro cifras que la bandeja necesita.
   Quien escribe es el latido (`guardarSenales` en api/_lib/db-admin.ts), una
   vez al día, en `user_profiles.senales`; el cliente nunca las escribe.

   «Registro» es cualquier día con entreno guardado, peso, pasos, comida
   apuntada o cuestionario enviado. Abrir la app no cuenta: la pregunta es si
   está HACIENDO el plan, no si lo mira.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Ventana de las sesiones perdidas y de los días con registro. */
export const DIAS_VENTANA_SENALES = 14;

export interface FotoParaSenales {
  assignments: readonly WorkoutAssignment[];
  workoutLogs: readonly WorkoutLog[];
  bodyweightLogs: readonly BodyweightLog[];
  stepLogs: readonly StepLog[];
  dietLogs: readonly DietCompletionLog[];
  respuestas: readonly QuestionnaireResponse[];
  cuestionarios: readonly QuestionnaireAssignment[];
}

const dia = (iso: string | undefined | null): string | null =>
  iso && iso.length >= 10 ? iso.slice(0, 10) : null;

export function calcularSenales(foto: FotoParaSenales, hoy: string): SenalesDelAtleta {
  const desde = addDays(hoy, -(DIAS_VENTANA_SENALES - 1));
  const dias = new Set<string>();
  const anotar = (d: string | null) => { if (d && d <= hoy) dias.add(d); };

  for (const l of foto.workoutLogs) anotar(dia(l.date));
  for (const p of foto.bodyweightLogs) anotar(dia(p.date));
  for (const s of foto.stepLogs) anotar(dia(s.date));
  for (const c of foto.dietLogs) anotar(dia(c.date));
  for (const r of foto.respuestas) anotar(dia(r.submittedAt));

  const ordenados = [...dias].sort();
  const ultimoRegistro = ordenados[ordenados.length - 1] ?? null;
  const registros14d = ordenados.filter(d => d >= desde).length;

  // Una asignación con entreno guardado está hecha diga lo que diga `status`
  // (mismo criterio que el latido al marcar perdidas).
  const perdidas14d = conEstadoReal(foto.assignments, foto.workoutLogs)
    .filter(a => a.status === 'perdido' && a.date >= desde && a.date <= hoy)
    .length;

  const respuestasOrdenadas = foto.respuestas.map(r => dia(r.submittedAt)).filter((d): d is string => !!d).sort();
  const ultimaRespuesta = respuestasOrdenadas[respuestasOrdenadas.length - 1] ?? null;

  return {
    calculadoEn: hoy,
    ultimoRegistro,
    registros14d,
    perdidas14d,
    ultimaRespuesta,
    tieneCuestionarios: foto.cuestionarios.some(c => c.active),
  };
}

/** ¿Han cambiado de verdad? Para no reescribir el perfil cada noche sin motivo. */
export function senalesIguales(a: SenalesDelAtleta | undefined, b: SenalesDelAtleta): boolean {
  if (!a) return false;
  return a.ultimoRegistro === b.ultimoRegistro
    && a.registros14d === b.registros14d
    && a.perdidas14d === b.perdidas14d
    && a.ultimaRespuesta === b.ultimaRespuesta
    && a.tieneCuestionarios === b.tieneCuestionarios;
}
