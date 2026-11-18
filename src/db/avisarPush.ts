import { auth } from '../firebase';
import { apiUrl } from './apiBase';
import { esElCoachPermanente as esEmailDelCoach } from '../utils/coach';

/* ═══════════════════════════════════════════════════════════════════════════
   «Que le suene ya» · 18-11-2026

   Cuando el COACH crea un aviso para un atleta (Mandar ahora, mover una fecha
   a hoy, responder la revisión, un mensaje, una nota del día…), además de la
   campana se le pide al servidor la notificación push (api/avisar.ts). El
   servidor relee el aviso de Firestore, comprueba que quien llama es el coach
   y lo manda a los móviles del atleta.

   Nunca bloquea ni lanza: el aviso de la campana ya está creado, el push es un
   extra. Si falla (sin conexión, sin FCM configurado, sin dispositivos), no
   pasa nada visible.
   ═══════════════════════════════════════════════════════════════════════════ */

/** ¿Hay que pedir push para este aviso? Solo del coach a otra persona. */
export function debePedirPush(emailDeQuienEscribe: string | null | undefined, destinatario: string): boolean {
  return esEmailDelCoach(emailDeQuienEscribe) && !esEmailDelCoach(destinatario);
}

export async function pedirPushDelAviso(avisoId: string, destinatario: string): Promise<void> {
  try {
    const usuario = auth?.currentUser;
    if (!usuario || !debePedirPush(usuario.email, destinatario)) return;
    const idToken = await usuario.getIdToken();
    const r = await fetch(apiUrl('/api/avisar'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ avisoId }),
      keepalive: true,
    });
    if (!r.ok) console.warn(`avisar respondió ${r.status}`);
  } catch (err) {
    console.warn('pedirPushDelAviso:', err);
  }
}
