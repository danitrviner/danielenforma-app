import type { Contacto, QuestionnaireResponse, UserProfile } from '../types';
import { diasEntreFechas } from './trainingWeek';
import { DIAS_SIN_REGISTRAR, PERDIDAS_QUE_AVISAN } from './bandejaDelDia';

/* ═══════════════════════════════════════════════════════════════════════════
   Panel de retención del coach (28-10-2026)

   Las cuatro cifras que dicen si el acompañamiento está funcionando, en la
   pantalla por la que Dani entra cada mañana. Salen de lo que la pantalla ya
   tiene (perfiles con `senales`, respuestas de la bandeja de Revisiones,
   contactos): no cuesta ninguna lectura más.

   Es la línea base de la revisión del 28-10 (docs/revision-acompanamiento):
   latencia mediana de respuesta 170 h, 0 % contestadas en 48 h, 4 de 15 en
   marcha apagándose. Lo que se mide a las 4 semanas de cada tanda es esto.

   Puro, con la fecha inyectada.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Horas en las que una revisión «se ha contestado a tiempo» (promesa de venta: 24-48 h). */
export const HORAS_RESPUESTA_PROMETIDA = 48;
/** Días de ventana para la latencia y el % contestadas. */
export const DIAS_VENTANA_PANEL = 28;
/** Días de la «primera semana» (contacto diario prometido). */
export const DIAS_PRIMERA_SEMANA = 7;

export interface PanelRetencion {
  /** Con plan publicado y registrando (ni apagándose ni callados). */
  enMarcha: number;
  /** Con plan y ≥ 3 días sin registrar o ≥ 3 perdidas en 14 días. */
  apagandose: number;
  /** Con plan y sin ningún registro en 14 días (o nunca). */
  callados: number;
  /** Cuenta creada sin plan publicado. */
  sinPlan: number;
  /** Mediana, en horas, entre enviar una revisión y la respuesta (en app o WhatsApp). null = ninguna contestada. */
  latenciaMedianaH: number | null;
  /** Revisiones de la ventana contestadas en ≤ 48 h, en %. null = sin revisiones. */
  pctContestadas48h: number | null;
  /** Revisiones de la ventana sin ninguna respuesta todavía. */
  sinContestar: number;
  /** Atletas en su primera semana con plan: nombre y día (1 = el día que se publicó). */
  primeraSemana: { nombre: string; dia: number; email: string }[];
}

export function mediana(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

export function calcularPanelRetencion(e: {
  atletas: UserProfile[];
  respuestas: QuestionnaireResponse[];
  contactos: Contacto[];
  hoy: string;
}): PanelRetencion {
  const { atletas, hoy } = e;
  let enMarcha = 0, apagandose = 0, callados = 0, sinPlan = 0;
  const primeraSemana: PanelRetencion['primeraSemana'] = [];

  for (const a of atletas) {
    if (!a.planPublishedAt) { sinPlan++; continue; }
    const publicado = a.planPublishedAt.slice(0, 10);
    const diaDePlan = diasEntreFechas(publicado, hoy) + 1;
    if (diaDePlan >= 1 && diaDePlan <= DIAS_PRIMERA_SEMANA) {
      primeraSemana.push({ nombre: a.displayName || a.email, dia: diaDePlan, email: a.email });
    }
    const s = a.senales;
    if (!s) { enMarcha++; continue; }
    const sinRegistrar = s.ultimoRegistro ? diasEntreFechas(s.ultimoRegistro, hoy) : Infinity;
    if (sinRegistrar >= 14) callados++;
    else if (sinRegistrar >= DIAS_SIN_REGISTRAR || s.perdidas14d >= PERDIDAS_QUE_AVISAN) apagandose++;
    else enMarcha++;
  }

  // Latencia: enviar → respuestaCoach.enviadaEn, o el primer contacto por
  // WhatsApp (`sin_respuesta`) posterior al envío. Una revisión de hoy sin
  // respuesta no cuenta como tarde todavía: sinContestar la recoge.
  const desde = new Date(Date.parse(`${hoy}T00:00:00`) - DIAS_VENTANA_PANEL * 86_400_000).toISOString();
  const recientes = e.respuestas.filter(r => r.submittedAt >= desde);
  const latencias: number[] = [];
  let sinContestar = 0;
  for (const r of recientes) {
    const envio = Date.parse(r.submittedAt);
    const enApp = r.respuestaCoach?.enviadaEn ? Date.parse(r.respuestaCoach.enviadaEn) : null;
    const porWhatsApp = e.contactos
      .filter(c => c.athleteId === r.athleteId.toLowerCase() && c.motivo === 'sin_respuesta' && Date.parse(`${c.fecha}T12:00:00`) >= envio)
      .map(c => Date.parse(c.createdAt || `${c.fecha}T12:00:00`))
      .sort()[0] ?? null;
    const respuesta = [enApp, porWhatsApp].filter((x): x is number => x !== null).sort()[0] ?? null;
    if (respuesta === null) { sinContestar++; continue; }
    latencias.push(Math.max(0, Math.round((respuesta - envio) / 36e5)));
  }
  const contestadas48 = latencias.filter(h => h <= HORAS_RESPUESTA_PROMETIDA).length;

  return {
    enMarcha, apagandose, callados, sinPlan,
    latenciaMedianaH: mediana(latencias),
    pctContestadas48h: recientes.length === 0 ? null : Math.round((contestadas48 / recientes.length) * 100),
    sinContestar,
    primeraSemana: primeraSemana.sort((x, y) => x.dia - y.dia),
  };
}
