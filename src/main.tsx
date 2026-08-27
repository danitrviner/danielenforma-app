import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {QueryClient} from '@tanstack/react-query';
import {PersistQueryClientProvider} from '@tanstack/react-query-persist-client';
import {createSyncStoragePersister} from '@tanstack/query-sync-storage-persister';
import {CLAVE_CACHE_CONSULTAS, registrarClienteDeConsultas} from './cacheDeConsultas.ts';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import {iniciarMonitorizacion} from './monitorizacion.ts';
import './index.css';

// Lo primero de todo, antes de montar React: un fallo durante el arranque —el
// peor de los fallos, porque deja al usuario sin app— tiene que llegar igual.
// Sin `VITE_SENTRY_DSN` esto no hace nada (ver src/monitorizacion.ts).
iniciarMonitorizacion();

// Firestore reads are the app's real cost/latency driver, so default to a
// stale time instead of react-query's refetch-on-mount-by-default — most of
// this data (assignments, diets, onboarding...) doesn't change from another
// tab while the coach/athlete is looking at it. Screens that need fresher
// data set their own staleTime/refetchOnMount per query.
//
// 06-2 / 06-20. Los 60 s de antes eran demasiado poco, y `refetchOnWindowFocus`
// se quedó en su valor por defecto (`true`) sin sobrescribirse en ningún sitio:
// CADA vuelta de la app al primer plano pasado un minuto repetía entero el
// abanico de lecturas de la pantalla. En el móvil de un coach —que sale y entra
// de la app decenas de veces al día— eso multiplicaba por sí solo la factura de
// Firestore, y sin aportar nada: los datos de esta app los cambia una persona
// desde otra pantalla cada muchos minutos, no cada segundo.
//
// Nada de esto retrasa lo que hace el propio usuario: cada mutación actualiza
// la caché con `setQueryData` en el momento, así que lo que tú tocas se ve al
// instante. Lo que se retrasa es enterarse de lo que cambió OTRO dispositivo,
// y ahí diez minutos es de sobra.
// `gcTime` sube de los 30 min de antes a 24 h: con la persistencia de abajo,
// `gcTime` ya no es solo "cuánto vive en memoria" — es lo que decide cuánto
// dura en el localStorage guardado entre recargas. Con 30 min, cualquier dato
// que llevara más de media hora sin pedirse se borraba del caché ANTES de que
// hubiera ocasión de persistirlo, y la persistencia de abajo no habría servido
// para nada.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10 * 60_000,
      gcTime: 24 * 60 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

/* ═══════════════════════════════════════════════════════════════════════════
   Caché entre recargas

   Hasta ahora el `staleTime` de 10 min de arriba solo amortiguaba lecturas
   DENTRO de una sesión: 13 pantallas de coach comparten la consulta
   `userProfiles`, así que abrir cinco de ellas seguidas costaba una sola
   lectura de Firestore, no cinco. Pero cada vez que el coach cerraba y volvía
   a abrir la app —o recargaba— ese caché desaparecía entero y las mismas
   colecciones (perfiles de todos los clientes, catálogo de ejercicios,
   dietas del CRM...) se volvían a leer de cero. Eso, no las pantallas en sí,
   es lo que agotó la cuota diaria el 22 de agosto con apenas nadie usando
   la app todavía.
   Esto guarda el caché en `localStorage` al salir y lo recupera al entrar, así
   que una recarga reutiliza lo que ya se había leído en las últimas 24 h en
   vez de camino a Firestore otra vez. No es información nueva expuesta: cada
   dominio de `src/db/` ya guarda su propia copia en localStorage como reserva
   sin conexión (`enforma_exercises`, `enforma_food_items_v2`...) — esto solo
   hace lo mismo con la capa de React Query.
   `buster: __APP_RELEASE__` invalida el caché guardado en cada despliegue: si
   la forma de un dato cambia entre versiones, no hay riesgo de arrancar con
   una versión vieja del JSON pegada en el localStorage de alguien.
   ═══════════════════════════════════════════════════════════════════════════ */
const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: CLAVE_CACHE_CONSULTAS,
});

registrarClienteDeConsultas(queryClient);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{ persister, maxAge: 24 * 60 * 60_000, buster: __APP_RELEASE__ }}
      >
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </PersistQueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
