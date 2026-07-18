import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserProfile } from '../types';
import { getAllUserProfiles } from '../dbService';
import type { NavTab } from '../App';

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

// Cache a nivel de módulo: ClientsScreen/ReviewsScreen ya piden esta misma
// lista por su cuenta cada vez que se montan — aquí al menos no se repite
// la lectura cada vez que el coach abre la paleta dentro de la misma sesión.
let athletesCache: UserProfile[] | null = null;

// Buscador global del coach (Cmd+K / Ctrl+K): saltar directo a la ficha de
// un atleta o a una pestaña sin pasar por Clientes → buscar → abrir. Acotado
// a atletas + navegación — buscar ejercicios/recetas necesitaría un índice
// de búsqueda de verdad (el banco de recetas Indya son 8.850+ documentos,
// no algo para traer entero al cliente), queda fuera de alcance por ahora.
export default function CommandPalette({ onNavigateTab }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [athletes, setAthletes] = useState<UserProfile[]>(athletesCache ?? []);
  const [loadingAthletes, setLoadingAthletes] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

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
    if (athletesCache) {
      setAthletes(athletesCache);
    } else {
      setLoadingAthletes(true);
      getAllUserProfiles()
        .then(list => { athletesCache = list; setAthletes(list); })
        .catch(console.error)
        .finally(() => setLoadingAthletes(false));
    }
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
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200] flex items-start justify-center pt-24 px-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="bg-[#181816] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
          <span className="material-symbols-outlined text-[#c6c9ab]">search</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar atleta o acción..."
            className="flex-1 bg-transparent text-white text-sm focus:outline-none placeholder-[#c6c9ab]/50"
          />
          <span className="font-mono text-[9px] text-[#c6c9ab]/50 border border-white/10 rounded px-1.5 py-0.5 flex-shrink-0">ESC</span>
        </div>

        <div className="max-h-96 overflow-y-auto">
          {loadingAthletes && (
            <p className="px-4 py-6 text-center font-mono text-xs text-[#c6c9ab] animate-pulse">Cargando atletas...</p>
          )}

          {!loadingAthletes && matchedAthletes.length > 0 && (
            <div className="py-2">
              <p className="px-4 py-1 font-mono text-[9px] text-[#c6c9ab] uppercase tracking-wider">Atletas</p>
              {matchedAthletes.map(a => (
                <button
                  key={a.userId}
                  onClick={() => goToAthlete(a)}
                  className="w-full flex items-center gap-3 px-4 py-2 hover:bg-white/5 text-left transition-colors"
                >
                  <img src={a.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">{a.displayName}</p>
                    <p className="text-[10px] text-[#c6c9ab] truncate">{a.email}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {matchedActions.length > 0 && (
            <div className="py-2 border-t border-white/10">
              <p className="px-4 py-1 font-mono text-[9px] text-[#c6c9ab] uppercase tracking-wider">Acciones</p>
              {matchedActions.map(a => (
                <button
                  key={a.id}
                  onClick={() => runAction(a.id)}
                  className="w-full flex items-center gap-3 px-4 py-2 hover:bg-white/5 text-left transition-colors"
                >
                  <span className="material-symbols-outlined text-[#c6c9ab] text-base">{a.icon}</span>
                  <span className="text-sm text-white">{a.label}</span>
                </button>
              ))}
            </div>
          )}

          {!loadingAthletes && matchedAthletes.length === 0 && matchedActions.length === 0 && (
            <p className="px-4 py-6 text-center font-mono text-xs text-[#555]">Sin resultados.</p>
          )}
        </div>
      </div>
    </div>
  );
}
