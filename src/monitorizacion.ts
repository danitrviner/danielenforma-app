/* ═══════════════════════════════════════════════════════════════════════════
   Monitorización de errores · Sentry

   Hasta ahora, cuando la app fallaba en el móvil de un cliente el fallo moría
   ahí: el `ErrorBoundary` evitaba la pantalla en blanco y el `console.error`
   se quedaba en una consola que nadie iba a abrir. La única vía de enterarse
   era que la persona escribiera para quejarse — y la mayoría no escribe, se va.

   Esto lo cambia: cada error de render y cada fallo de Firestore llegan a un
   panel donde se ve QUÉ ha petado, EN QUÉ pantalla, en QUÉ versión y en qué
   navegador o móvil, con la pila de llamadas completa.

   ── Sin DSN no hace nada ──────────────────────────────────────────────────
   Si `VITE_SENTRY_DSN` no está definida, `iniciarMonitorizacion()` sale sin
   tocar nada y `reportarError()` se limita al `console.error` de siempre. Eso
   mantiene el desarrollo local y los tests limpios de ruido, y hace que la
   app siga funcionando igual si algún día se quita la variable.

   ── Datos personales ──────────────────────────────────────────────────────
   Esta app trata datos de salud (peso, lesiones, dietas), así que la
   configuración de abajo es deliberadamente conservadora: no se envían ni el
   correo, ni el contenido de los formularios, ni el texto de los botones que
   se pulsan, ni lo que se imprime por consola. Al usuario se le identifica con
   un código corto derivado de su correo, estable entre sesiones: sirve para
   ver «este fallo le pasa siempre a la misma persona» y para agrupar, pero no
   permite reconstruir de quién se trata desde el panel de Sentry.

   Ver `identificarUsuario()` para la nota sobre cómo cruzar ese código con un
   cliente concreto cuando haga falta atenderle.
   ═══════════════════════════════════════════════════════════════════════════ */

import * as Sentry from '@sentry/react';

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;

/** Nombre del entorno tal y como aparecerá en Sentry. */
function entorno(): string {
  if (import.meta.env.DEV) return 'desarrollo';
  const host = typeof location !== 'undefined' ? location.hostname : '';
  // Capacitor sirve el bundle desde `localhost` dentro del WebView, así que un
  // hostname local en una build de producción significa app nativa, no dev.
  if (host === 'localhost' || host === '') return 'nativa';
  if (host.includes('-git-') || host.includes('vercel.app') === false) return 'preproduccion';
  return 'produccion';
}

/**
 * Quita de una URL lo que no debe salir del dispositivo.
 *
 * El caso que obliga a esto es el acceso sin contraseña: el enlace que Firebase
 * manda por correo vuelve a la app con el correo de la persona y el
 * `oobCode` de un solo uso en la query string. Mandar esa URL tal cual a
 * Sentry sería filtrar a la vez la identidad y una credencial viva.
 */
function limpiarUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const clave of ['email', 'oobCode', 'apiKey', 'continueUrl', 'token']) {
      if (u.searchParams.has(clave)) u.searchParams.set(clave, '[oculto]');
    }
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * Código corto y estable a partir del correo. No es criptográfico y no
 * pretende serlo: solo evita que el correo viaje en claro a un tercero.
 */
function codigoDeUsuario(email: string): string {
  let h = 0;
  const limpio = email.trim().toLowerCase();
  for (let i = 0; i < limpio.length; i++) {
    h = (h << 5) - h + limpio.charCodeAt(i);
    h |= 0;
  }
  return 'u' + Math.abs(h).toString(36);
}

let iniciado = false;

/** Arranca Sentry. Idempotente: llamarlo dos veces no duplica nada. */
export function iniciarMonitorizacion(): void {
  if (iniciado || !DSN) return;
  iniciado = true;

  Sentry.init({
    dsn: DSN,
    environment: entorno(),
    // Inyectado en tiempo de build (ver vite.config.ts). Permite saber en qué
    // despliegue concreto apareció un fallo, que es la mitad de arreglarlo.
    release: __APP_RELEASE__,

    // Nada de correos, IPs ni cabeceras de la petición.
    sendDefaultPii: false,

    // Solo errores. Las trazas de rendimiento son útiles pero consumen la
    // cuota del plan gratuito muy deprisa, y hoy el problema no es ese.
    tracesSampleRate: 0,

    integrations: [
      // Por defecto Sentry graba como «migas de pan» el texto de cada elemento
      // que se pulsa y todo lo que pasa por `console`. En esta app eso sería
      // ir mandando nombres de recetas, de clientes y de ejercicios sin querer.
      Sentry.breadcrumbsIntegration({ console: false, dom: false }),
    ],

    // Ruido conocido que no es un fallo de la app y solo gasta cuota.
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      // Capacitor y algunos navegadores lanzan esto al cancelar una navegación
      // o al cerrar la app a media petición.
      'AbortError',
      'Failed to fetch',
      'Load failed',
      'NetworkError when attempting to fetch resource',
    ],

    beforeSend(evento) {
      if (evento.request?.url) evento.request.url = limpiarUrl(evento.request.url);
      if (evento.breadcrumbs) {
        for (const miga of evento.breadcrumbs) {
          if (typeof miga.data?.to === 'string') miga.data.to = limpiarUrl(miga.data.to);
          if (typeof miga.data?.from === 'string') miga.data.from = limpiarUrl(miga.data.from);
        }
      }
      return evento;
    },
  });
}

/**
 * Asocia los errores siguientes a quien tiene la sesión abierta.
 *
 * Se le manda a Sentry el código de `codigoDeUsuario()`, no el correo. Para
 * saber a quién atender cuando un fallo se repite siempre en la misma persona,
 * ese mismo código se puede calcular sobre los correos de tus clientes desde
 * un script y buscar el que coincida — el cruce se hace en tu máquina, con tus
 * datos, en vez de tener los correos guardados en un servicio de terceros.
 */
export function identificarUsuario(email: string | null, rol?: 'coach' | 'atleta'): void {
  if (!DSN) return;
  if (!email) {
    Sentry.setUser(null);
    return;
  }
  Sentry.setUser({ id: codigoDeUsuario(email) });
  if (rol) Sentry.setTag('rol', rol);
}

/**
 * Manda un error a Sentry con contexto, y lo deja además en la consola para
 * quien esté depurando en local.
 *
 * `donde` debe decir en qué parte de la app ha pasado ('ErrorBoundary',
 * 'firestore', 'ai-chat'...): es lo que permite agrupar y filtrar después.
 */
export function reportarError(error: unknown, donde: string, extra?: Record<string, unknown>): void {
  console.error(`[${donde}]`, error, extra ?? '');
  if (!DSN) return;
  Sentry.withScope(scope => {
    scope.setTag('donde', donde);
    if (extra) scope.setContext('detalle', extra);
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)));
  });
}

/** Deja constancia de algo que ayuda a entender el error que venga después. */
export function migaDePan(mensaje: string, datos?: Record<string, unknown>): void {
  if (!DSN) return;
  Sentry.addBreadcrumb({ message: mensaje, level: 'info', data: datos });
}
