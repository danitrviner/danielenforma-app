import React from 'react';
import InvitacionesPendientesPanel from '../features/crm/components/InvitacionesPendientesPanel';
import { SearchField } from './ui';

interface Props {
  search: string;
  onSearchChange: (v: string) => void;
}

// Buscador de atletas en INICIO, 1:1 con `OFICIAL - Home Coach.dc.html`: solo
// el campo de búsqueda, sin la tarjeta de contador/invitar/próximos-a-finalizar
// que llevaba antes (handoff Fase 3.2, "Home Coach" — decisión explícita de
// Dani). "+ Invitar atleta" vive ahora junto a "Todos los atletas" en
// ClientsScreen, tal como lo dibuja el mockup. Las invitaciones pendientes se
// quedan aquí debajo del buscador: no están en el mockup, pero no tienen otro
// sitio natural y el panel se oculta solo cuando no hay ninguna.
export default function AthletesBar({ search, onSearchChange }: Props) {
  return (
    <div className="space-y-3">
      <SearchField value={search} onChange={onSearchChange} placeholder="Buscar atleta por nombre o email..." label="Buscar atleta" />
      <InvitacionesPendientesPanel />
    </div>
  );
}
