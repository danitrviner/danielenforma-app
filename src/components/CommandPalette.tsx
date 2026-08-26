import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { UserProfile } from '../types';
import { getAllUserProfiles } from '../dbService';
import { atletasActivos } from '../utils/atletas';
import type { NavTab } from '../App';
import { Icon, ListRow, EmptyState } from './ui';

interface Props {
  onNavigateTab: (tab: NavTab) => void;
}

interface QuickAction {
  id: NavTab;
  label: string;
  icon: string;
}

const ACTIONS: QuickAction[] = [
  { id: 'clients',  label: 'Ir a Clientes',     icon: 'group' },
  { id: 'reviews',  label: 'Ir a Revisiones',   icon: 'pending_actions' },
  { id: 'training', label: 'Ir a Ejercicios',   icon: 'fitness_center' },
  { id: 'nutrition', label: 'Ir a Nutrición',   icon: 'restaurant' },
];

// Buscador global del coach (Cmd+K / Ctrl+K): saltar directo a la ficha de
// un atleta o a una pestaña sin pasar por Clientes → buscar → abrir. Acotado
// a atletas + navegación — buscar ejercicios/recetas necesitaría un índice
// de búsqueda de verdad (el recetario importado son 8.850+ documentos,
// no algo para traer entero al cliente), queda fuera de alcance por ahora.
export default function CommandPalette({ onNavigateTab }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Shared 'userProfiles' cache key (same as MesocycleManager) — this used to
  // be a hand-rolled module-level cache; the query cache now does the same
  // dedup app-wide, plus shares the fetch with ClientsScreen/ReviewsScreen.
  const { data: allProfiles = [], isPending: loadingAthletes } = useQuery({
    queryKey: ['userProfiles'],
    queryFn: getAllUserProfiles,
    enabled: open,
  });
  const athletes = useMemo(() => atletasActivos(allProfiles), [allProfiles]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(o => !o);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    const focusTimer = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(focusTimer);
  }, [open]);

  if (!open) return null;

  const q = query.trim().toLowerCase();
  const matchedAthletes = athletes
    .filter(a => a.role !== 'coach')
    .filter(a => !q || a.displayName.toLowerCase().includes(q) || a.email.toLowerCase().includes(q))
    .slice(0, 8);
  const matchedActions = ACTIONS.filter(a => !q || a.label.toLowerCase().includes(q));

  const goToAthlete = (a: UserProfile) => {
    setOpen(false);
    navigate(`/clients/${encodeURIComponent(a.email)}`);
  };
  const runAction = (id: NavTab) => {
    setOpen(false);
    onNavigateTab(id);
  };

  return (
    /* F9 no migra este overlay, a propósito: la paleta va anclada arriba
       (`pt-14`), que es la convención de Cmd+K, y ninguna primitiva tiene esa
       posición — `Dialog` centra y `Sheet` sube desde abajo. Cierra con Escape
       por su cuenta; lo que le falta es el foco atrapado y el bloqueo de
       scroll compartido. Decisión de Dani el 4 ago 2026: queda para la fase de
       diseño, que decidirá si la posición superior se convierte en una
       variante de la primitiva. */
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200] flex items-start justify-center pt-14 px-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="bg-surface border border-hairline rounded-surface w-full max-w-lg shadow-e2 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-hairline">
          <Icon name="search" size="m" className="text-ink-2" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar atleta o acción..."
            className="flex-1 bg-transparent text-white text-title-s focus:outline-none placeholder-ink-2/50"
          />
          <span className="font-mono text-caption text-ink-2/50 border border-hairline rounded-control px-2 flex-shrink-0">ESC</span>
        </div>

        <div className="max-h-96 overflow-y-auto">
          {loadingAthletes && (
            <p className="px-4 py-6 text-center font-sans text-label text-ink-2 animate-pulse">Cargando atletas...</p>
          )}

          {!loadingAthletes && matchedAthletes.length > 0 && (
            <div className="py-2">
              <p className="px-4 py-1 font-mono text-caption text-ink-2 uppercase tracking-wider">Atletas</p>
              {matchedAthletes.map(a => (
                <ListRow
                  key={a.userId}
                  onClick={() => goToAthlete(a)}
                  leading={<img src={a.avatarUrl} alt="" loading="lazy" decoding="async" className="w-6 h-6 rounded-full object-cover flex-shrink-0" />}
                  title={a.displayName}
                  subtitle={a.email}
                />
              ))}
            </div>
          )}

          {matchedActions.length > 0 && (
            <div className="py-2 border-t border-hairline">
              <p className="px-4 py-1 font-mono text-caption text-ink-2 uppercase tracking-wider">Acciones</p>
              {matchedActions.map(a => (
                <ListRow
                  key={a.id}
                  onClick={() => runAction(a.id)}
                  leading={<Icon name={a.icon} size="m" className="text-ink-2" />}
                  title={a.label}
                />
              ))}
            </div>
          )}

          {!loadingAthletes && matchedAthletes.length === 0 && matchedActions.length === 0 && (
            <EmptyState icon="search_off" title="Sin resultados." />
          )}
        </div>
      </div>
    </div>
  );
}
