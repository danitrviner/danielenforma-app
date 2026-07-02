import React, { useEffect, useState } from 'react';
import { UserProfile, CoachNote } from '../types';
import { getCoachNotes, createCoachNote, updateCoachNote, deleteCoachNote } from '../dbService';

interface Props {
  athletes: UserProfile[];
}

// Coach's own private to-do list — "enviar mensaje a X", "cambiar rutina a Y".
// Fully separate from TaskItem (tasks the coach assigns TO an athlete, which the
// athlete can see) and from "Revisiones Pendientes" (check-ins awaiting feedback).
// Nothing here is ever visible to athletes.
export default function CoachNotesPanel({ athletes }: Props) {
  const [notes, setNotes] = useState<CoachNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [text, setText] = useState('');
  const [relatedEmail, setRelatedEmail] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getCoachNotes().then(setNotes).catch(console.error).finally(() => setLoading(false));
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSaving(true);
    try {
      const relatedAthlete = athletes.find(a => a.email === relatedEmail);
      const note = await createCoachNote({
        text: text.trim(),
        relatedAthleteEmail: relatedAthlete?.email,
        relatedAthleteName: relatedAthlete?.displayName,
        done: false,
        createdAt: new Date().toISOString(),
      });
      setNotes(prev => [...prev, note]);
      setText('');
      setRelatedEmail('');
      setShowForm(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (note: CoachNote) => {
    setNotes(prev => prev.map(n => n.id === note.id ? { ...n, done: !n.done } : n));
    try { await updateCoachNote(note.id, { done: !note.done }); } catch (err) { console.error(err); }
  };

  const handleDelete = async (id: string) => {
    setNotes(prev => prev.filter(n => n.id !== id));
    try { await deleteCoachNote(id); } catch (err) { console.error(err); }
  };

  const pending = notes.filter(n => !n.done);
  const done = notes.filter(n => n.done);

  return (
    <div className="bg-[#121212] border border-[#2a2a2a] rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-sans font-bold text-sm text-white flex items-center gap-2">
          <span className="material-symbols-outlined text-[#e2ff00] text-base">edit_note</span>
          Mis notas
          {pending.length > 0 && (
            <span className="bg-[#e2ff00] text-black text-[10px] font-bold px-2 py-0.5 rounded-full">{pending.length}</span>
          )}
        </h3>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1 font-mono text-[10px] text-[#c6c9ab] hover:text-[#e2ff00] transition-colors border border-[#2a2a2a] px-2.5 py-1.5 rounded-lg"
        >
          <span className="material-symbols-outlined text-sm">{showForm ? 'close' : 'add'}</span>
          {showForm ? 'Cancelar' : 'Nueva nota'}
        </button>
      </div>
      <p className="font-mono text-[9px] text-[#555] mb-3">
        Privadas — solo tú las ves. Ej: "Enviar mensaje a Ana sobre la dieta", "Cambiar rutina a Marcos".
      </p>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-3 mb-3 space-y-2">
          <input
            type="text"
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Escribe la nota..."
            className="w-full bg-[#0e0e0e] border border-[#2a2a2a] rounded p-2 text-xs text-white focus:outline-none focus:border-[#e2ff00]"
            required
            autoFocus
          />
          <select
            value={relatedEmail}
            onChange={e => setRelatedEmail(e.target.value)}
            className="w-full bg-[#0e0e0e] border border-[#2a2a2a] rounded p-2 text-xs text-white focus:outline-none focus:border-[#e2ff00]"
          >
            <option value="">— Sin cliente asociado —</option>
            {athletes.map(a => (
              <option key={a.email} value={a.email}>{a.displayName}</option>
            ))}
          </select>
          <button
            type="submit"
            disabled={saving}
            className="w-full py-2 bg-[#e2ff00] text-black font-mono font-bold text-xs uppercase rounded hover:bg-[#bad200] active:scale-95 transition-all disabled:opacity-50"
          >
            {saving ? 'Guardando...' : 'Guardar nota'}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-xs text-[#c6c9ab] font-mono animate-pulse py-2">Cargando notas...</p>
      ) : notes.length === 0 ? (
        <p className="text-xs text-[#555] font-mono py-2">Sin notas.</p>
      ) : (
        <div className="space-y-2">
          {[...pending, ...done].map(n => (
            <div
              key={n.id}
              className={`flex items-center gap-3 border rounded-lg p-3 transition-all ${
                n.done ? 'bg-[#161616] border-[#2a2a2a]/50 opacity-60' : 'bg-[#1e1e1e] border-[#2a2a2a]'
              }`}
            >
              <button
                onClick={() => handleToggle(n)}
                className={`w-5 h-5 rounded flex-shrink-0 border-2 flex items-center justify-center transition-colors ${n.done ? 'bg-[#e2ff00] border-[#e2ff00]' : 'border-[#3a3a3a]'}`}
              >
                {n.done && <span className="material-symbols-outlined text-black" style={{ fontSize: '13px' }}>check</span>}
              </button>
              <div className="flex-1 min-w-0">
                <p className={`font-sans text-xs text-white ${n.done ? 'line-through' : ''}`}>{n.text}</p>
                {n.relatedAthleteName && (
                  <p className="font-mono text-[9px] text-[#00eefc] mt-0.5">{n.relatedAthleteName}</p>
                )}
              </div>
              <button
                onClick={() => handleDelete(n.id)}
                className="text-[#c6c9ab] hover:text-red-400 transition-colors flex-shrink-0 p-1"
              >
                <span className="material-symbols-outlined text-sm">delete</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
