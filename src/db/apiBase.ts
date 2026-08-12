import { Capacitor } from '@capacitor/core';

/* ═══════════════════════════════════════════════════════════════════════════
   De dónde cuelgan las funciones de servidor (`/api/*`).

   En web basta una ruta relativa: el front y las funciones de Vercel comparten
   origen. En la app NATIVA no: el WebView de Capacitor sirve el bundle desde
   `capacitor://localhost`, así que un `fetch('/api/create-athlete')` se resuelve
   contra ese origen local —donde no hay ninguna función— y la llamada no llega
   a salir del móvil. El síntoma es exactamente el que se vio: invitar a un
   atleta desde la app no mandaba ningún correo.

   Afectaba a los tres endpoints por igual (alta de atleta, borrado de cuenta y
   el proxy del asistente de IA), así que la decisión vive aquí una sola vez en
   vez de repetida en cada llamante.
   ═══════════════════════════════════════════════════════════════════════════ */

// Despliegue de producción. Es el fallback en nativo cuando no se ha definido
// VITE_API_BASE_URL en el build — sin esto, la app compilada para las tiendas
// se quedaría sin servidor. Si algún día cambia el dominio (§6.1 del
// checklist), este es el único sitio que hay que tocar.
const PRODUCCION = 'https://en-forma-ivory.vercel.app';

function baseConfigurada(): string | null {
  const raw = import.meta.env.VITE_API_BASE_URL as string | undefined;
  const limpia = raw?.trim().replace(/\/$/, '');
  return limpia ? limpia : null;
}

/**
 * URL absoluta o relativa de un endpoint de `api/`, según dónde corra la app.
 *
 * @param ruta ruta del endpoint empezando por `/api/`, p. ej. `/api/ai-chat`.
 */
export function apiUrl(ruta: string): string {
  const configurada = baseConfigurada();
  if (configurada) return `${configurada}${ruta}`;
  // Nativo sin variable: hay que ir a producción sí o sí, porque relativo
  // apuntaría al bundle local.
  if (Capacitor.isNativePlatform()) return `${PRODUCCION}${ruta}`;
  // Web: mismo origen, que es lo correcto tanto en producción como en `vercel dev`.
  return ruta;
}
