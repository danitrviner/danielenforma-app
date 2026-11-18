/* ═══════════════════════════════════════════════════════════════════════════
   Service worker de las notificaciones push (fase 1, web push con FCM).

   Lo registra src/services/push/registroPush.ts con el ámbito propio de FCM
   (`/firebase-cloud-messaging-push-scope`), así que NO controla las páginas de
   la app: no intercepta peticiones, no cachea nada y no puede dejar a nadie con
   una versión vieja de la web. Solo hace dos cosas:

     · `push`: pinta la notificación que manda el servidor (api/_lib/push.ts).
       Llega «solo datos» (titulo, cuerpo, enlace, etiqueta), sin el bloque
       `notification` de FCM, para que la decisión sea nuestra: si la app está
       abierta y delante, basta con avisar a la página para que refresque la
       campana. En iPhone/iPad se pinta SIEMPRE: Safari retira la suscripción
       a quien recibe pushes sin enseñar nada.
     · `notificationclick`: abre la app en la pantalla del aviso (o la enfoca
       si ya estaba abierta).

   Sin el SDK de Firebase dentro a propósito: no hace falta para recibir (el
   push es estándar) y así no se carga código de un CDN externo aquí.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Canal con la página abierta (NotificationBell.tsx lo escucha). */
const canal = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('enforma-avisos-push') : null;

const ES_IOS = /iPhone|iPad|iPod/i.test(self.navigator.userAgent)
  || (/Macintosh/i.test(self.navigator.userAgent) && (self.navigator.maxTouchPoints || 0) > 1);

/** Solo rutas internas de la app; cualquier otra cosa abre Inicio. */
function enlaceSeguro(enlace) {
  return typeof enlace === 'string' && /^\/[a-z][a-z0-9_-]{0,30}(\?[a-z0-9_=&-]{0,60})?$/.test(enlace)
    ? enlace
    : '/home';
}

function leerDatos(event) {
  if (!event.data) return {};
  try {
    const json = event.data.json();
    // FCM envuelve los datos en `data`; un push de prueba desde las
    // herramientas del navegador puede traer `notification` o venir plano.
    const datos = json.data || {};
    const noti = json.notification || {};
    return {
      titulo: datos.titulo || noti.title || json.titulo,
      cuerpo: datos.cuerpo || noti.body || json.cuerpo,
      enlace: datos.enlace || json.enlace,
      etiqueta: datos.etiqueta || json.etiqueta,
    };
  } catch (e) {
    return { cuerpo: event.data.text() };
  }
}

self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim()); });

self.addEventListener('push', (event) => {
  const d = leerDatos(event);
  const titulo = d.titulo || 'En Forma';
  const opciones = {
    body: d.cuerpo || 'Tienes un aviso nuevo.',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: d.etiqueta || 'avisos',
    renotify: true,
    data: { enlace: enlaceSeguro(d.enlace) },
  };

  event.waitUntil((async () => {
    const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (canal) canal.postMessage({ tipo: 'enforma-aviso-push' });
    const delante = ventanas.some(v => v.visibilityState === 'visible' && v.focused);
    if (delante && !ES_IOS) return; // la campana ya lo enseña
    await self.registration.showNotification(titulo, opciones);
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const enlace = enlaceSeguro(event.notification.data && event.notification.data.enlace);
  event.waitUntil((async () => {
    const destino = new URL(enlace, self.location.origin).href;
    const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const abierta = ventanas.find(v => new URL(v.url).origin === self.location.origin);
    if (abierta) {
      await abierta.focus();
      if ('navigate' in abierta) {
        try { await abierta.navigate(destino); return; } catch (e) { /* no controlada: se avisa */ }
      }
      if (canal) canal.postMessage({ tipo: 'enforma-abrir', enlace });
      return;
    }
    await self.clients.openWindow(destino);
  })());
});
