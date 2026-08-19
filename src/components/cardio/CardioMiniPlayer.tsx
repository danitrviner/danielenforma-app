import React from 'react';
import { useCardioSession } from '../../hooks/useCardioSession';
import { ZONE_LABEL, ZONE_COLOR, BELOW_ZONE_LABEL } from '../../utils/cardioZones';
import { Icon } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Mini-reproductor persistente (F6 del plan de réplica FITIV, §4bis.3 del
   análisis: "al navegar durante un entreno queda una barra fija abajo").

   Solo es posible desde F2: el motor de la sesión vive en un Provider por
   encima del router, así que sigue vivo al salir de /cardio — antes de eso
   no había nada que "mostrar en segundo plano", la sesión se cortaba sola.

   Se monta una vez en App.tsx, dentro de <CardioSessionProvider>, y decide
   cuándo pintarse a partir de `currentPath`: sesión en vivo Y la ruta no es
   /cardio (ahí ya se ve la pantalla completa, la barra sería redundante).

   `currentPath` y `onOpen` llegan como props en vez de leer el router aquí
   dentro (`useLocation`/`useNavigate` directos) por dos razones: AppContent
   ya calcula `location.pathname` para su propia navegación, así que no hace
   falta un segundo hook idéntico; y renderizar un `<MemoryRouter>` propio
   para probar este componente aislado (banco de pruebas de desarrollo)
   choca en seco con el `<BrowserRouter>` real que ya envuelve toda la app
   — React Router no admite un Router dentro de otro Router. Con la ruta
   como prop, el banco de pruebas la simula sin necesitar un router propio.

   Simplificación deliberada: no compensa el padding inferior del contenido
   de cada pantalla para dejarle hueco exacto — flota encima, con desenfoque,
   igual que el mini-reproductor de Spotify o Apple Music. Tocar el padding
   del contenedor raíz de App.tsx exigiría que ese nivel (fuera del árbol del
   Provider) conociera el estado de la sesión, lo que habría significado
   partir AppContent — un componente ya enorme — solo para este detalle.
   ═══════════════════════════════════════════════════════════════════════════ */

function fmtClock(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

const SESSION_ICON: Record<string, string> = {
  libre: 'directions_run',
  zona2: 'favorite',
  intervalos: 'bolt',
};

interface Props {
  currentPath: string;
  onOpen: () => void;
}

export default function CardioMiniPlayer({ currentPath, onOpen }: Props) {
  const cardio = useCardioSession();

  if (cardio.state !== 'live' || currentPath === '/cardio') return null;

  const zone = cardio.sessionTargetZoneRef.current;
  const zoneLabel = zone ? ZONE_LABEL[zone] : BELOW_ZONE_LABEL;
  const zoneColor = zone ? ZONE_COLOR[zone] : 'var(--color-ink-2)';

  return (
    <div
      onClick={onOpen}
      className="fixed inset-x-0 bottom-[var(--nav-h)] md:bottom-0 md:left-[var(--sidebar-w)] z-[var(--z-nav)] flex items-center gap-3 bg-bg/92 backdrop-blur-md border-t border-hairline px-4 py-3 cursor-pointer select-none"
      aria-live="off"
    >
      <Icon name={SESSION_ICON[cardio.sessionType] ?? 'monitor_heart'} size="l" className="text-accent" filled />
      <div className="flex-1 min-w-0">
        <p className="text-body-s font-sans font-bold text-ink truncate">{zoneLabel}</p>
        <p className="text-caption font-mono text-ink-2 tabular-nums">
          {fmtClock(cardio.displayElapsedSec)}
          {cardio.bpm !== null && <span style={{ color: zoneColor }}> · {cardio.bpm} ppm</span>}
        </p>
      </div>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); cardio.paused ? cardio.resume() : cardio.pause(); }}
        aria-label={cardio.paused ? 'Reanudar' : 'Pausar'}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-raised text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-line"
      >
        <Icon name={cardio.paused ? 'play_arrow' : 'pause'} size="m" filled />
      </button>
    </div>
  );
}
