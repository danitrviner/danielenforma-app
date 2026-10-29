import type { BodyweightLog, CoachClientTask, QuestionnaireResponse, UserProfile, WorkoutAssignment } from '../types';
import { addDays, diasEntreFechas } from './trainingWeek';

/* ═══════════════════════════════════════════════════════════════════════════
   La primera semana (29-10-2026)

   Lo que se vende es «contacto diario la primera semana» y lo que decide si
   alguien se queda son los días 3 y 7. Aquí vive lo puro: en qué día del
   plan está cada atleta, qué le toca a Dani ese día, qué ve el atleta en su
   lista de la primera semana, y el texto de bienvenida que el coach firma.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Días que dura «la primera semana» a efectos de la lista del atleta. */
export const DIAS_LISTA_PRIMERA_SEMANA = 14;

/** Día del plan: 1 = el día en que se publicó. null si no hay plan. */
export function diaDePlan(profile: Pick<UserProfile, 'planPublishedAt'>, hoy: string): number | null {
  if (!profile.planPublishedAt) return null;
  return diasEntreFechas(profile.planPublishedAt.slice(0, 10), hoy) + 1;
}

/** Fecha comprometida por defecto: dos días después del alta (hoy si ya pasó). */
export function fechaPrometidaPorDefecto(createdAt: string | undefined, hoy: string): string {
  const base = createdAt ? addDays(createdAt.slice(0, 10), 2) : addDays(hoy, 2);
  return base < hoy ? hoy : base;
}

export interface ItemPrimeraSemana {
  id: 'sesion' | 'peso' | 'revision';
  titulo: string;
  detalle: string;
  hecho: boolean;
  destino: 'training' | 'checkin';
}

/** La lista del atleta: tres cosas, con lo que ya ha registrado desde que tiene plan. */
export function listaPrimeraSemana(e: {
  profile: Pick<UserProfile, 'planPublishedAt'>;
  assignments: readonly Pick<WorkoutAssignment, 'date' | 'status'>[];
  pesos: readonly Pick<BodyweightLog, 'date'>[];
  respuestas: readonly Pick<QuestionnaireResponse, 'submittedAt'>[];
  hoy: string;
}): ItemPrimeraSemana[] | null {
  const dia = diaDePlan(e.profile, e.hoy);
  if (dia === null || dia < 1 || dia > DIAS_LISTA_PRIMERA_SEMANA) return null;
  const desde = e.profile.planPublishedAt!.slice(0, 10);
  const sesion = e.assignments.some(a => a.status === 'completed' && a.date >= desde);
  const peso = e.pesos.some(p => p.date >= desde);
  const revision = e.respuestas.some(r => r.submittedAt.slice(0, 10) >= desde);
  return [
    { id: 'sesion', titulo: 'Tu primera sesión', detalle: sesion ? 'Hecha' : 'Sin récords: hazla entera y apunta lo que pesa', hecho: sesion, destino: 'training' },
    { id: 'peso', titulo: 'Tu primer peso', detalle: peso ? 'Registrado' : 'Por la mañana, tras el baño; tres veces por semana', hecho: peso, destino: 'checkin' },
    { id: 'revision', titulo: 'Tu primera revisión', detalle: revision ? 'Enviada' : 'Se abre el viernes: cinco minutos', hecho: revision, destino: 'checkin' },
  ];
}

export type MotivoPrimeraSemana = 'primera_sesion' | 'dia3_sin_registro';

/** Qué le toca a Dani hoy con un atleta en su primera semana, si algo. */
export function senalPrimeraSemana(e: {
  profile: Pick<UserProfile, 'planPublishedAt' | 'senales'>;
  hoy: string;
}): { dia: number; motivo: MotivoPrimeraSemana; texto: string } | null {
  const dia = diaDePlan(e.profile, e.hoy);
  if (dia === null || dia < 1 || dia > 7) return null;
  const desde = e.profile.planPublishedAt!.slice(0, 10);
  const ultimo = e.profile.senales?.ultimoRegistro ?? null;
  const haRegistrado = !!ultimo && ultimo >= desde;
  if (dia <= 2 && haRegistrado) {
    return { dia, motivo: 'primera_sesion', texto: `Día ${dia} · ya ha registrado algo: dile que lo has visto` };
  }
  if (dia >= 3 && !haRegistrado) {
    return { dia, motivo: 'dia3_sin_registro', texto: `Día ${dia} con plan y sin registrar nada` };
  }
  return null;
}

/** El texto de bienvenida que el coach firma al publicar el plan. */
export function textoBienvenida(e: { nombre: string; diasPorSemana?: number | null }): string {
  const n = (e.nombre.trim().split(/\s+/)[0] ?? '');
  const nombre = n ? n[0].toUpperCase() + n.slice(1) : '';
  const dias = e.diasPorSemana && e.diasPorSemana > 0 ? `${e.diasPorSemana} días de entreno` : 'tus entrenos';
  return `${nombre ? `Bienvenido, ${nombre}. ` : ''}Ya tienes tu plan: ${dias} y la comida en kcal, como hablamos. Esta semana no busques récords: busca hacer las sesiones enteras y registrar lo que comes. El viernes te pregunto cómo ha ido y el lunes te digo qué cambia.`;
}

/** Las preguntas abiertas del alta, listas para pegar en WhatsApp. */
export function preguntasDelAltaParaWhatsApp(nombre: string, tareas: readonly Pick<CoachClientTask, 'title' | 'done'>[]): string | null {
  const abiertas = tareas.filter(t => !t.done).map(t => t.title.replace(/\s*\(.*?\)\s*$/, '').trim()).filter(Boolean);
  if (abiertas.length === 0) return null;
  const n = nombre.trim().split(/\s+/)[0] ?? '';
  const lista = abiertas.slice(0, 4).map((t, i) => `${i + 1}) ${t}`).join(' ');
  return `${n ? `${n}, ` : ''}para dejarte el plan bien montado me falta saber: ${lista}. Con eso lo cierro.`;
}
