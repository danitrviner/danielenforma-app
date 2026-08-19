/* ═══════════════════════════════════════════════════════════════════════════
   Consentimiento del atleta para el análisis con IA · `A-2` / `01-7` / `04-6`

   Qué pasaba. El asistente del coach manda a la Messages API de Anthropic el
   perfil del atleta, su onboarding **con lesiones y alergias**, la tendencia de
   peso, las series de sueño, estrés y **dolor**, los check-ins con sus notas
   libres y la dieta entera. El atleta no lo sabía ni lo había consentido, y
   Anthropic no figuraba como subencargado en ninguna parte. Son datos del
   artículo 9 del RGPD —salud— saliendo a un tercero sin base jurídica.

   Que solo el coach dispare las llamadas no cambia nada: el dato tratado es
   del atleta, y es el atleta quien tiene que consentir.

   ── Dos decisiones que conviene entender ────────────────────────────────────

   **Se falla cerrado.** Sin una decisión registrada, no se manda nada. La
   alternativa —dar por consentido lo que nadie ha contestado— es exactamente
   lo que el hallazgo describe. Esto tiene un coste real y hay que decirlo: el
   día que esto se despliegue, el asistente deja de poder analizar a los
   clientes actuales hasta que cada uno conteste, porque ninguno tiene decisión
   guardada. Por eso `SolicitudConsentimientoIA` se le enseña también a quien ya
   terminó el alta, y por eso el mensaje que recibe el coach dice qué pasa y qué
   va a pasar, en vez de parecer un error.

   **Un «no» es una respuesta, no un hueco.** Se guarda `aceptado: false` con su
   fecha. Sin eso no hay forma de distinguir «dijo que no» de «todavía no se lo
   hemos preguntado», y esa diferencia decide si se le vuelve a preguntar y si
   el coach ve «lo ha rechazado» o «está pendiente».
   ═══════════════════════════════════════════════════════════════════════════ */

import type { OnboardingData } from '../types';

/** Versión del texto que se le enseñó al atleta. Si el tratamiento cambia
 *  —otro proveedor, otra finalidad—, se sube el número y hay que volver a
 *  preguntar: un consentimiento vale para lo que se consintió, no para lo que
 *  venga después. */
export const VERSION_CONSENTIMIENTO_IA = 1;

export interface ConsentimientoIA {
  aceptado: boolean;
  /** ISO. Es parte de la prueba del consentimiento, no un adorno. */
  fecha: string;
  version: number;
}

export type EstadoConsentimiento = 'aceptado' | 'rechazado' | 'sin_responder' | 'caducado';

export function estadoConsentimiento(onboarding: OnboardingData | null | undefined): EstadoConsentimiento {
  const c = onboarding?.consentimientoIA;
  if (!c || typeof c.aceptado !== 'boolean') return 'sin_responder';
  if (c.version !== VERSION_CONSENTIMIENTO_IA) return 'caducado';
  return c.aceptado ? 'aceptado' : 'rechazado';
}

/** La única pregunta que debe hacerse antes de mandar datos de un atleta. */
export function puedeAnalizarseConIA(onboarding: OnboardingData | null | undefined): boolean {
  return estadoConsentimiento(onboarding) === 'aceptado';
}

/** ¿Hay que enseñarle la solicitud? Tanto a quien no ha contestado como a quien
 *  contestó a una versión anterior del texto. A quien dijo que no, NO: decir
 *  que no y que te lo vuelvan a preguntar cada vez es acoso, no consentimiento. */
export function debePedirseConsentimiento(onboarding: OnboardingData | null | undefined): boolean {
  const estado = estadoConsentimiento(onboarding);
  return estado === 'sin_responder' || estado === 'caducado';
}

export function registrarConsentimiento(aceptado: boolean, ahora: string): ConsentimientoIA {
  return { aceptado, fecha: ahora, version: VERSION_CONSENTIMIENTO_IA };
}

/** ── "Ahora no" en la pantalla de Hoy (T6, 18-08) ────────────────────────────
 *  No es un rechazo (eso sigue siendo `registrarConsentimiento(false, …)`,
 *  que se guarda en el propio onboarding): es solo dejar de interrumpir a
 *  pantalla completa cada vez que se abre la app. Por eso vive en
 *  localStorage y no en el perfil — no cambia el estado real del
 *  consentimiento, solo la decisión de VOLVER A PREGUNTAR sin que el atleta
 *  lo pida. A partir de aquí la única puerta es el interruptor de
 *  Perfil → Ajustes → Análisis con IA. */
const clave = (athleteEmail: string) => `enforma_consentimiento_ia_aplazado_${athleteEmail.toLowerCase()}`;

export function haSidoAplazado(athleteEmail: string): boolean {
  try { return localStorage.getItem(clave(athleteEmail)) === '1'; } catch { return false; }
}

export function marcarAplazado(athleteEmail: string): void {
  try { localStorage.setItem(clave(athleteEmail), '1'); } catch { /* best-effort */ }
}

/**
 * Lo que se le dice al coach cuando no puede analizar a alguien. Va al modelo
 * como `tool_result`, así que tiene que explicar la situación lo bastante bien
 * como para que el asistente no se invente que hubo un fallo técnico ni insista
 * llamando a otra herramienta con el mismo cliente.
 */
export function motivoParaElCoach(estado: EstadoConsentimiento, alias: string): string {
  switch (estado) {
    case 'rechazado':
      return `${alias} ha rechazado que sus datos se analicen con IA. No puedes usar ninguna herramienta que lea sus datos, y no hay nada que reintentar: es una decisión suya y hay que respetarla. Puedes seguir trabajando con esta persona a mano, en su ficha.`;
    case 'caducado':
      return `${alias} aceptó una versión anterior del aviso de análisis con IA y todavía no ha aceptado la actual. Se le pedirá la próxima vez que abra la app. Hasta entonces no puedes leer sus datos.`;
    default:
      return `${alias} todavía no ha decidido si permite que sus datos se analicen con IA, así que no se pueden enviar. Se le pedirá la próxima vez que abra la app. No es un error ni un fallo de conexión: no reintentes ni pruebes con otra herramienta para esta persona.`;
  }
}

/**
 * Identidad fuera. `A-2` punto 4: aunque haya consentimiento, no hace falta
 * mandar el email ni el nombre completo para analizar entrenamientos o dieta.
 * El coach ya sabe de quién habla —él ha dado el email— y el modelo trabaja
 * igual de bien con un alias.
 *
 * El email se sustituye en vez de borrarse porque el asistente lo necesita como
 * identificador estable dentro de la conversación; lo que no necesita es que
 * sea un dato personal real.
 */
export function aliasDeAtleta(nombreCompleto: string | undefined, email: string): string {
  const limpio = (nombreCompleto ?? '').trim();
  if (!limpio) return 'Atleta';
  // Nombre de pila y la inicial del primer apellido: suficiente para que el
  // coach siga la conversación, insuficiente para identificar a nadie fuera.
  const [nombre, apellido] = limpio.split(/\s+/);
  return apellido ? `${nombre} ${apellido[0].toUpperCase()}.` : nombre;
}
