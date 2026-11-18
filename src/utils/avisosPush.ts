import type { AppNotification, NotificationType } from '../types.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Notificaciones push (web) · lógica pura · 18-11-2026

   Dani: «notificaciones de verdad». Hasta hoy los avisos solo vivían en la
   campana de la app: si el atleta no la abría, no se enteraba. La fase 1 es
   web push con Firebase Cloud Messaging (FCM):

     · el atleta lo activa desde una tarjeta del Inicio (nunca al arrancar);
     · su token se guarda en `pushTokens` (solo lo lee el servidor);
     · el servidor manda la notificación cuando nace un aviso de la campana:
       el latido nocturno (api/latido-diario.ts) y el coach en el acto
       (api/avisar.ts, llamado desde `createNotificationDeduped`).

   Aquí solo se DECIDE, sin navegador, sin Firestore y sin FCM: qué tarjeta
   enseñar, qué texto lleva la notificación, cómo se juntan los avisos de una
   misma noche y qué tokens hay que tirar. Lo usan el cliente y `api/_lib/push.ts`.
   ═══════════════════════════════════════════════════════════════════════════ */

// ── La tarjeta del Inicio ─────────────────────────────────────────────────────

/** Cuánto tiempo deja de salir la tarjeta tras «Ahora no». */
export const DIAS_DE_APLAZO = 14;
/** Tras «Entendido» con el permiso bloqueado: no se insiste. */
export const DIAS_DE_SILENCIO_SI_DENEGADO = 365;

export type PermisoDeAvisos = 'default' | 'granted' | 'denied' | 'no_disponible';

export interface EntornoDeAvisos {
  /** App nativa (Capacitor): eso es la fase 2, aquí nada. */
  nativa: boolean;
  /** `VITE_FCM_VAPID_KEY` configurada. Sin ella no hay push posible. */
  hayClave: boolean;
  /** `isSupported()` de firebase/messaging. */
  soportado: boolean;
  permiso: PermisoDeAvisos;
  /** iPhone o iPad (incluido el iPad que se presenta como Mac). */
  esIOS: boolean;
  /** Abierta desde la pantalla de inicio (modo standalone). */
  instalada: boolean;
  /** Este dispositivo ya tiene su token guardado. */
  activo: boolean;
  /** El atleta lo apagó a mano en Ajustes: no se le vuelve a ofrecer. */
  desactivadoAMano: boolean;
  /** Hasta cuándo no se enseña (ms epoch), por «Ahora no» o «Entendido». */
  aplazadoHasta: number | null;
  ahora: number;
}

export type EstadoTarjetaAvisos = 'oculta' | 'activar' | 'instalar_ios' | 'denegado';

/**
 * Qué enseña la tarjeta «Activa los avisos» del Inicio.
 *
 * El orden importa: el Safari del iPhone sin instalar NO soporta push
 * (`isSupported()` da `false`), así que hay que mirar «iPhone sin instalar»
 * antes que «no soportado»; si no, al atleta de iPhone —la mayoría— nunca se
 * le explicaría cómo conseguirlo.
 */
export function estadoDeLaTarjeta(e: EntornoDeAvisos): EstadoTarjetaAvisos {
  if (e.nativa || !e.hayClave) return 'oculta';
  if (e.desactivadoAMano) return 'oculta';
  if (e.aplazadoHasta !== null && e.ahora < e.aplazadoHasta) return 'oculta';
  if (e.esIOS && !e.instalada) return 'instalar_ios';
  if (!e.soportado || e.permiso === 'no_disponible') return 'oculta';
  if (e.permiso === 'denied') return 'denegado';
  if (e.permiso === 'granted' && e.activo) return 'oculta';
  return 'activar';
}

/** Hasta cuándo se esconde la tarjeta al pulsar «Ahora no» o «Entendido». */
export function aplazarHasta(estado: EstadoTarjetaAvisos, ahora: number): number {
  const dias = estado === 'denegado' ? DIAS_DE_SILENCIO_SI_DENEGADO : DIAS_DE_APLAZO;
  return ahora + dias * 86_400_000;
}

/**
 * iPhone/iPad por el agente de usuario. El iPad de iPadOS 13+ dice ser un Mac:
 * se le reconoce por tener pantalla táctil.
 */
export function esIOSPorAgente(agente: string, puntosTactiles = 0): boolean {
  if (/iPhone|iPad|iPod/i.test(agente)) return true;
  return /Macintosh/i.test(agente) && puntosTactiles > 1;
}

// ── El mensaje ────────────────────────────────────────────────────────────────

export interface MensajePush {
  titulo: string;
  cuerpo: string;
  /** Ruta de la app que abre al tocarla, p. ej. `/checkin`. Nunca datos personales. */
  enlace: string;
  /** Agrupa en la bandeja del móvil: una nueva del mismo tipo sustituye a la vieja. */
  etiqueta: string;
  /** Avisos de la campana que cubre este mensaje. */
  avisoIds: string[];
}

const TOPE_TITULO = 65;
const TOPE_CUERPO = 160;

function recortar(texto: string, tope: number): string {
  const limpio = texto.replace(/\s+/g, ' ').trim();
  return limpio.length <= tope ? limpio : `${limpio.slice(0, tope - 1).trimEnd()}…`;
}

/**
 * La ruta que se abre al tocar la notificación. `AppNotification.link` es una
 * pestaña de la app ('checkin', 'home', 'nutrition'…), la misma que usa la
 * campana; aquí se convierte en ruta. Cualquier cosa rara —una URL externa,
 * algo con barras o con un correo— cae a Inicio: el enlace viaja a un servicio
 * de terceros (el de push del navegador) y no puede llevar nada del atleta.
 */
export function enlaceDelAviso(link: string | undefined): string {
  const l = (link ?? '').trim();
  if (/^[a-z][a-z0-9_-]{0,30}(\?[a-z0-9_=&-]{0,60})?$/.test(l)) return `/${l}`;
  return '/home';
}

/** Lo que más importa al atleta, primero, cuando se juntan varios en una. */
const PRIORIDAD: Partial<Record<NotificationType, number>> = {
  cuestionario_nuevo: 1,
  revision_recordatorio: 2,
  revision_respondida: 3,
  coach_mensaje: 4,
  note_reply: 5,
  coach_day_note: 6,
  report_sent: 7,
  nutrition_phase_change: 8,
  plan_phase_change: 9,
  weekly_challenge_new: 10,
  weekly_challenge_won: 11,
  level_up: 12,
};

export function prioridadDelAviso(tipo: NotificationType): number {
  return PRIORIDAD[tipo] ?? 50;
}

/** El mensaje de UN aviso de la campana. */
export function mensajeDelAviso(aviso: Pick<AppNotification, 'id' | 'type' | 'title' | 'body' | 'link'>): MensajePush {
  return {
    titulo: recortar(aviso.title || 'En Forma', TOPE_TITULO),
    cuerpo: recortar(aviso.body || '', TOPE_CUERPO),
    enlace: enlaceDelAviso(aviso.link),
    etiqueta: aviso.type,
    avisoIds: [aviso.id],
  };
}

/**
 * Quita duplicados: mismo id (dos caminos que crean el mismo aviso) o mismo
 * título y texto (dos claves distintas que dicen lo mismo). Se queda con el
 * primero que aparece.
 */
export function sinDuplicados<T extends Pick<AppNotification, 'id' | 'title' | 'body'>>(avisos: T[]): T[] {
  const ids = new Set<string>();
  const textos = new Set<string>();
  const salida: T[] = [];
  for (const a of avisos) {
    const texto = `${a.title.trim()}\n${a.body.trim()}`;
    if (ids.has(a.id) || textos.has(texto)) continue;
    ids.add(a.id);
    textos.add(texto);
    salida.push(a);
  }
  return salida;
}

/**
 * Los avisos nuevos de UN atleta en una pasada (p. ej. la noche en que se le
 * abre la revisión y además tiene un cuestionario nuevo) salen en UNA sola
 * notificación: la más importante, con «y N más» al final. Dos zumbidos
 * seguidos a las dos de la mañana por la misma app son exactamente lo que hace
 * que alguien las desactive.
 */
export function mensajeDelDia(avisos: Array<Pick<AppNotification, 'id' | 'type' | 'title' | 'body' | 'link'>>): MensajePush | null {
  const unicos = sinDuplicados(avisos);
  if (unicos.length === 0) return null;
  const ordenados = [...unicos].sort((a, b) => prioridadDelAviso(a.type) - prioridadDelAviso(b.type));
  const principal = mensajeDelAviso(ordenados[0]);
  const resto = ordenados.length - 1;
  if (resto === 0) return principal;
  const cola = resto === 1 ? ' · Y 1 aviso más.' : ` · Y ${resto} avisos más.`;
  return {
    ...principal,
    cuerpo: recortar(principal.cuerpo, TOPE_CUERPO - cola.length) + cola,
    etiqueta: 'avisos',
    avisoIds: ordenados.map(a => a.id),
  };
}

// ── Los tokens ────────────────────────────────────────────────────────────────

/**
 * Códigos de FCM que significan «este token ya no sirve»: la app se
 * desinstaló, se borraron los datos del navegador o se retiró el permiso. Solo
 * esos: un `invalid-argument` puede ser culpa del mensaje y no del token, y
 * borrar por eso dejaría al atleta sin avisos por un fallo nuestro.
 */
export const ERRORES_DE_TOKEN_MUERTO = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

export interface RespuestaDeEnvio { success: boolean; error?: { code?: string } }

/** Los tokens que hay que borrar tras un envío, en el mismo orden que se mandaron. */
export function tokensMuertos(tokens: string[], respuestas: RespuestaDeEnvio[]): string[] {
  return tokens.filter((_, i) => {
    const r = respuestas[i];
    return !!r && !r.success && ERRORES_DE_TOKEN_MUERTO.has(r.error?.code ?? '');
  });
}

/**
 * Id del documento del token en `pushTokens`: el UID delante (las reglas lo
 * exigen, así nadie puede ocupar el id de otro) y un resumen del token detrás,
 * para que el mismo dispositivo reescriba su documento en vez de crear otro.
 * No es criptografía: solo un nombre estable (FNV-1a de 32 bits, dos pasadas).
 */
export function idDelTokenPush(uid: string, token: string): string {
  const fnv = (s: string, semilla: number) => {
    let h = semilla >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(36);
  };
  return `${uid}_${fnv(token, 0x811c9dc5)}${fnv(token, 0x1234567)}`;
}
