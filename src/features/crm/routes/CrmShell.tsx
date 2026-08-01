import React from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import ClientesList from './ClientesList';
import ClienteDetail from './ClienteDetail';
import PagosScreen from './PagosScreen';

// Contenedor del módulo CRM. Monta sus propias rutas anidadas para que App.tsx
// solo necesite una línea (`/crm/*`) y el módulo siga siendo autocontenido.
//
// Las secciones de Reuniones y Dashboard aún no existen — sus entradas de
// navegación no se pintan todavía en vez de llevar a una pantalla vacía.

const SECCIONES = [
  { path: '/crm/clientes', label: 'Clientes', icon: 'group' },
  { path: '/crm/pagos', label: 'Pagos', icon: 'euro' },
];

export default function CrmShell({ coachEmail }: { coachEmail: string }) {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="space-y-3">
      {SECCIONES.length > 1 && (
        <nav className="flex items-center gap-1">
          {SECCIONES.map(s => {
            const activo = location.pathname.startsWith(s.path);
            return (
              <button
                key={s.path}
                type="button"
                onClick={() => navigate(s.path)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg font-mono text-[9px] uppercase tracking-widest transition-colors ${
                  activo
                    ? 'bg-[#fbcb1a]/15 text-[#fbcb1a] border border-[#fbcb1a]/30'
                    : 'bg-[#141413] text-[#a8a89e] border border-white/7 hover:border-white/12'
                }`}
              >
                <span className="material-symbols-outlined text-sm">{s.icon}</span>
                {s.label}
              </button>
            );
          })}
        </nav>
      )}

      <Routes>
        <Route index element={<Navigate to="/crm/clientes" replace />} />
        <Route path="clientes" element={<ClientesList />} />
        <Route path="clientes/:id" element={<ClienteDetail coachEmail={coachEmail} />} />
        <Route path="pagos" element={<PagosScreen coachEmail={coachEmail} />} />
        <Route path="*" element={<Navigate to="/crm/clientes" replace />} />
      </Routes>
    </div>
  );
}
