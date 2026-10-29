/* ═══════════════════════════════════════════════════════════════════════════
   Plantillas de WhatsApp para las señales de la bandeja (28-10-2026)

   Decisión de Dani: el canal fuera de la app es WhatsApp, escrito por él. La
   app no manda nada: prepara el texto con el nombre y el dato de la señal,
   Dani lo copia, lo manda y pulsa «Ya le he escrito».

   Tono (referencias/tono.md de la skill whatsapp-clientes): español de
   España, tuteo, nombre al principio, 3-5 líneas, una pregunta como mucho,
   sin reproche, sin «espero que estés bien», sin viñetas, cero o un emoji.
   Las aperturas rotan por día para que once clientes no reciban la misma
   frase el mismo martes.
   ═══════════════════════════════════════════════════════════════════════════ */

export type MotivoContacto = 'sin_registrar' | 'perdidas' | 'sin_revision' | 'sin_respuesta' | 'bloque_terminado' | 'alta_parada';

export interface DatosPlantilla {
  nombre: string;
  /** Día de referencia (YYYY-MM-DD) para variar la apertura. */
  hoy: string;
  dias?: number;
  perdidas?: number;
  fechaRevision?: string; // YYYY-MM-DD
}

const APERTURAS = [
  (n: string) => `Buenas ${n}, ¿cómo vas?`,
  (n: string) => `${n}, ¿qué tal estos días?`,
  (n: string) => `Hola ${n}, ¿todo bien?`,
  (n: string) => `${n}, ¿cómo lo llevas?`,
];

function nombreCorto(nombre: string): string {
  const n = nombre.trim().split(/\s+/)[0] ?? '';
  return n.length > 0 ? n[0].toUpperCase() + n.slice(1) : 'hola';
}

function apertura(nombre: string, hoy: string): string {
  const dia = Number(hoy.slice(8, 10)) || 0;
  return APERTURAS[dia % APERTURAS.length](nombreCorto(nombre));
}

function fechaCorta(iso?: string): string {
  if (!iso) return '';
  return new Date(`${iso}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' });
}

export function plantillaWhatsApp(motivo: MotivoContacto, d: DatosPlantilla): string {
  const ap = apertura(d.nombre, d.hoy);
  switch (motivo) {
    case 'sin_registrar':
      return `${ap} No te veo registrar nada desde hace ${d.dias ?? 'unos'} días. Si ha sido una semana chunga me lo dices y lo adaptamos, que para eso estoy. Cuéntame solo cómo vas y lo cuadramos.`;
    case 'perdidas':
      return `${ap} Te he visto faltar a ${d.perdidas ?? 'varios'} entrenos estas dos semanas. ¿Qué está pasando, tiempo o ganas? Dímelo y vemos si hay que recortar el plan a lo que puedas cumplir de verdad.`;
    case 'sin_revision':
      return `${ap} Llevo dos semanas sin tu revisión en la app y me faltan tus datos para ajustarte el plan. ¿Me la mandas esta semana? Son cinco minutos y me sirve para saber qué cambio.`;
    case 'sin_respuesta':
      return `${ap} He leído tu revisión del ${fechaCorta(d.fechaRevision)}: te contesto en la app con lo que cambia esta semana. Si hay algo urgente, escríbeme por aquí.`;
    case 'bloque_terminado':
      return `${ap} Tu bloque de entreno ha terminado. Esta semana te monto el siguiente con lo que has conseguido en este. Dime si cambia algo de tus días o tu material.`;
    case 'alta_parada':
      return `${ap} Veo que te quedaste a medias con el alta en la app. ¿Te ayudo a terminarla? Son unos minutos y en cuanto esté te monto el plan.`;
  }
}
