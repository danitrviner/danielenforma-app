import React from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import ClientesList from './ClientesList';
import ClienteDetail from './ClienteDetail';
import PagosScreen from './PagosScreen';
import ReunionesScreen from './ReunionesScreen';
import DashboardScreen from './DashboardScreen';
import { Icon } from '../../../components/ui';

// Contenedor del módulo CRM. Monta sus propias rutas anidadas para que App.tsx
// solo necesite una línea (`/crm/*`) y el módulo siga siendo autocontenido.

const SECCIONES = [
  { path: '/crm', label: 'Resumen', icon: 'dashboard', exacta: true },
  { path: '/crm/clientes', label: 'Clientes', icon: 'group' },
  { path: '/crm/pagos', label: 'Pagos', icon: 'euro' },
  { path: '/crm/reuniones', label: 'Reuniones', icon: 'event' },
];

export default function CrmShell({ coachEmail }: { coachEmail: string }) {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="space-y-3">
      {SECCIONES.length > 1 && (
        <nav className="flex items-center gap-1 w-max max-w-full overflow-x-auto hide-scrollbar">
          {SECCIONES.map(s => {
            // "Resumen" (path exacto '/crm') necesita coincidencia exacta —
            // si no, `startsWith('/crm')` también sería verdad en
            // `/crm/clientes`, `/crm/pagos`... y las cuatro pestañas se
            // resaltarían a la vez.
            const activo = s.exacta ? location.pathname === s.path : location.pathname.startsWith(s.path);
            return (
              <button
                key={s.path}
                type="button"
                onClick={() => navigate(s.path)}
                className={`flex shrink-0 items-center gap-1 px-3 py-2 rounded-control font-mono text-caption uppercase tracking-widest transition-colors ${
                  activo
                    ? 'bg-accent/15 text-accent border border-accent/30'
                    : 'bg-field text-ink-2 border border-hairline hover:border-strong'
                }`}
              >
                <Icon name={s.icon} size="s" />
                {s.label}
              </button>
            );
          })}
        </nav>
      )}

      <Routes>
        <Route index element={<DashboardScreen />} />
        <Route path="clientes" element={<ClientesList coachEmail={coachEmail} />} />
        <Route path="clientes/:id" element={<ClienteDetail coachEmail={coachEmail} />} />
        <Route path="pagos" element={<PagosScreen coachEmail={coachEmail} />} />
        <Route path="reuniones" element={<ReunionesScreen coachEmail={coachEmail} />} />
        <Route path="*" element={<Navigate to="/crm" replace />} />
      </Routes>
    </div>
  );
}
