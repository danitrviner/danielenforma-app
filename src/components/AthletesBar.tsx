import React, { useState } from 'react';
import InvitarAtletaModal from '../features/crm/components/InvitarAtletaModal';
import InvitacionesPendientesPanel from '../features/crm/components/InvitacionesPendientesPanel';
import { SearchField, Button } from './ui';

interface AthleteFinishingSoon {
  userId: string;
  displayName: string;
  planDaysLeft: number | null;
}

interface Props {
  count: number;
  finishingSoon: AthleteFinishingSoon[];
  onOpenAthlete: (userId: string) => void;
  search: string;
  onSearchChange: (v: string) => void;
}

// Reúne, arriba de la lista de atletas en INICIO, lo que antes estaba
// repartido: el contador + "próximos a finalizar" (ClientsScreen), el
// buscador (input a pelo → SearchField del DS) y el alta/reenvío de
// invitaciones (antes solo accesible desde CRM > Clientes). Ninguno de los
// cuatro es dato nuevo — solo se recolocan para que el coach no tenga que
// saltar de pantalla para invitar a alguien o ver quién tiene el plan a punto
// de acabar.
export default function AthletesBar({ count, finishingSoon, onOpenAthlete, search, onSearchChange }: Props) {
  const [invitarAbierto, setInvitarAbierto] = useState(false);

  return (
    <div className="space-y-3">
      <div className="bg-gradient-to-br from-field to-bg border border-hairline p-5 rounded-surface relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-accent/5 rounded-bl-full pointer-events-none" />
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-accent text-title-m">group</span>
            <h2 className="font-sans font-bold text-ink-2 text-label uppercase tracking-wider">Atletas del Entrenador</h2>
          </div>
          <Button variant="secondary" size="s" icon="person_add" onClick={() => setInvitarAbierto(true)}>
            Invitar atleta
          </Button>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="font-sans font-extrabold text-display text-white tracking-tight">{count}</span>
          <span className="text-label text-ink-2 font-sans pb-1">deportistas registrados</span>
        </div>

        {finishingSoon.length > 0 && (
          <div className="mt-5 pt-4 border-t border-hairline">
            <span className="block text-caption text-ink-2 uppercase font-sans mb-2">Próximos a finalizar planificación</span>
            <div className="space-y-2">
              {finishingSoon.slice(0, 3).map(a => (
                <button
                  key={a.userId}
                  onClick={() => onOpenAthlete(a.userId)}
                  className="w-full flex items-center justify-between bg-raised/50 hover:bg-raised px-3 py-2 rounded-control border border-hairline text-left transition-colors"
                >
                  <span className="text-label text-white font-sans truncate">{a.displayName}</span>
                  <span className="text-caption font-mono font-bold text-orange-300 flex-shrink-0 ml-2">{a.planDaysLeft}d</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <SearchField value={search} onChange={onSearchChange} placeholder="Buscar atleta por nombre o email..." label="Buscar atleta" />

      {/* Se oculta sola cuando no hay ninguna pendiente — no ocupa hueco de sobra. */}
      <InvitacionesPendientesPanel />

      {invitarAbierto && <InvitarAtletaModal onCerrar={() => setInvitarAbierto(false)} />}
    </div>
  );
}
