import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
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
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10 * 60_000,
      gcTime: 30 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
