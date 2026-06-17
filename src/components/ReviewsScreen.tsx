import React, { useState, useEffect } from 'react';
import { UserProfile, WeightCheckIn } from '../types';
import { getAllUserProfiles, submitCoachFeedback } from '../dbService';

interface ReviewsScreenProps {
  checkins: WeightCheckIn[];
  onRefreshCheckIns: () => void;
}

export default function ReviewsScreen({ checkins, onRefreshCheckIns }: ReviewsScreenProps) {
  const [activeSubTab, setActiveSubTab] = useState<'pending' | 'history'>('pending');
  const [athletes, setAthletes] = useState<UserProfile[]>([]);
  const [selectedCheckIn, setSelectedCheckIn] = useState<WeightCheckIn | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const pendingCheckins = checkins.filter(c => !c.approved || !c.coachFeedback);

  useEffect(() => {
    async function fetchAthletes() {
      try {
        const list = await getAllUserProfiles();
        setAthletes(list);
      } catch (err) {
        console.error('Error fetching athletes:', err);
      }
    }
    fetchAthletes();
  }, [checkins]);

  const getAthleteProfile = (checkIn: WeightCheckIn) =>
    athletes.find(a => a.userId === checkIn.userId || a.email.toLowerCase() === checkIn.email.toLowerCase());

  const handleSelectCheckIn = (checkIn: WeightCheckIn) => {
    setSelectedCheckIn(checkIn);
    setFeedbackText(checkIn.coachFeedback || '');
    setErrorMsg('');
    setSuccessMsg('');
  };

  const handleSendFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCheckIn) return;
    if (!feedbackText.trim()) { setErrorMsg('Ingresa una directriz para el atleta.'); return; }
    setErrorMsg('');
    setSuccessMsg('');
    setIsSubmitting(true);
    try {
      await submitCoachFeedback(selectedCheckIn.id, feedbackText);
      setSuccessMsg('¡Directiva enviada y check-in aprobado!');
      onRefreshCheckIns();
      setSelectedCheckIn(null);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: any) {
      console.error(err);
      setErrorMsg('Error al guardar. Intenta de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-end justify-between pb-4 border-b border-[#2a2a2a]/60 gap-4">
        <div>
          <h1 className="font-sans font-black text-3xl tracking-tight text-white uppercase">Revisiones</h1>
          <p className="text-[#c6c9ab] text-sm mt-1">Evalúa los check-ins de tus atletas y revisa el historial.</p>
        </div>
        <div className="flex bg-[#121212] border border-[#2a2a2a] p-1 rounded-lg gap-1">
          <button
            onClick={() => setActiveSubTab('pending')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md font-sans text-xs font-bold tracking-wider uppercase transition-all relative ${activeSubTab === 'pending' ? 'bg-[#e2ff00] text-black shadow-lg' : 'text-[#c6c9ab] hover:text-white'}`}
          >
            <span className="material-symbols-outlined text-base">pending_actions</span>
            <span>Pendientes</span>
            {pendingCheckins.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-[#00eefc] text-black font-mono font-black text-[9px] w-5 h-5 rounded-full flex items-center justify-center animate-bounce">
                {pendingCheckins.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveSubTab('history')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md font-sans text-xs font-bold tracking-wider uppercase transition-all ${activeSubTab === 'history' ? 'bg-[#e2ff00] text-black shadow-lg' : 'text-[#c6c9ab] hover:text-white'}`}
          >
            <span className="material-symbols-outlined text-base">history</span>
            <span>Historial</span>
          </button>
        </div>
      </header>

      {successMsg && (
        <div className="bg-[#e2ff00]/15 border border-[#e2ff00]/30 text-white p-4 rounded-xl text-sm flex items-center gap-2">
          <span className="material-symbols-outlined text-[#e2ff00]">check_circle</span>
          <p>{successMsg}</p>
        </div>
      )}
      {errorMsg && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-200 p-4 rounded-xl text-xs font-mono">{errorMsg}</div>
      )}

      {/* Inline feedback panel for selected check-in */}
      {selectedCheckIn && (
        <div className="bg-[#121212] border border-[#e2ff00]/20 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-sans font-bold text-sm text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-[#e2ff00] text-sm">rate_review</span>
              Evaluando: <span className="text-[#e2ff00]">{getAthleteProfile(selectedCheckIn)?.displayName || selectedCheckIn.email.split('@')[0]}</span> — {selectedCheckIn.dateStr}
            </h3>
            <button onClick={() => setSelectedCheckIn(null)} className="text-[#c6c9ab] hover:text-white">
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3 font-mono text-xs">
            <div className="bg-[#191919] p-3 rounded-lg border border-[#2a2a2a]/40">
              <span className="block text-[#c6c9ab] text-[9px] uppercase">Peso</span>
              <strong className="text-white">{selectedCheckIn.weight} kg</strong>
            </div>
            <div className="bg-[#191919] p-3 rounded-lg border border-[#2a2a2a]/40">
              <span className="block text-[#c6c9ab] text-[9px] uppercase">Adherencia</span>
              <strong className="text-[#e2ff00]">{selectedCheckIn.adherence}</strong>
            </div>
            <div className="bg-[#191919] p-3 rounded-lg border border-[#2a2a2a]/40">
              <span className="block text-[#c6c9ab] text-[9px] uppercase">Humor</span>
              <strong className="text-white">{selectedCheckIn.mood}</strong>
            </div>
          </div>
          {selectedCheckIn.notes && (
            <div className="bg-[#181818] p-3 rounded-lg border border-[#2a2a2a]/30">
              <span className="block font-mono text-[9px] text-[#c6c9ab] uppercase mb-1">Notas del atleta</span>
              <p className="text-xs text-slate-300 italic">"{selectedCheckIn.notes}"</p>
            </div>
          )}
          <form onSubmit={handleSendFeedback} className="space-y-3">
            <textarea
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="Escribe tu directriz para el atleta..."
              className="w-full bg-[#1c1b1b] border border-[#2a2a2a]/60 rounded p-3 text-sm text-white focus:ring-1 focus:ring-[#e2ff00] focus:outline-none min-h-[90px] resize-none font-sans"
            />
            <button
              type="submit"
              disabled={isSubmitting}
              className="h-[40px] px-6 bg-[#e2ff00] text-black font-mono font-bold text-xs uppercase rounded flex items-center gap-2 hover:bg-[#bad200] active:scale-95 transition-all disabled:opacity-50"
            >
              {isSubmitting ? 'Guardando...' : 'Enviar y Aprobar'}
              <span className="material-symbols-outlined text-sm">send</span>
            </button>
          </form>
        </div>
      )}

      {/* PENDING TAB */}
      {activeSubTab === 'pending' && (
        <div className="space-y-4">
          <div className="bg-[#121212] border border-[#2a2a2a] p-4 rounded-xl flex items-center justify-between">
            <p className="text-xs text-[#c6c9ab] font-sans">Check-ins que requieren tu evaluación y feedback.</p>
            <span className="text-[10px] bg-[#e2ff00]/10 text-[#e2ff00] px-3 py-1 border border-[#e2ff00]/20 rounded font-mono uppercase font-black">
              {pendingCheckins.length} PENDIENTES
            </span>
          </div>
          {pendingCheckins.length === 0 ? (
            <div className="bg-[#131313] border border-dashed border-[#2a2a2a] rounded-xl p-12 text-center text-[#c6c9ab]">
              <span className="material-symbols-outlined text-4xl text-[#e2ff00] mb-2 block">verified_user</span>
              <p className="text-sm font-bold text-white">¡Sin revisiones pendientes!</p>
              <p className="text-xs mt-1">Todos los atletas tienen sus directrices actualizadas.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingCheckins.map((check) => {
                const athleteProfile = getAthleteProfile(check);
                return (
                  <div
                    key={check.id}
                    onClick={() => handleSelectCheckIn(check)}
                    className={`bg-[#121212] border rounded-xl p-4 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer group ${selectedCheckIn?.id === check.id ? 'border-[#e2ff00]/50' : 'border-[#2a2a2a] hover:border-[#00eefc]/50'}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full overflow-hidden border border-[#2a2a2a] flex-shrink-0">
                        <img
                          src={athleteProfile?.avatarUrl || 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&q=80&w=200'}
                          alt="Avatar"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-sans font-bold text-white group-hover:text-[#00eefc] transition-colors">
                            {athleteProfile?.displayName || check.email.split('@')[0]}
                          </span>
                          <span className="text-[9px] bg-red-500/10 text-red-400 px-2 py-0.5 rounded font-mono uppercase">Nueva Pesada</span>
                        </div>
                        <p className="font-mono text-xs text-[#c6c9ab] mt-0.5">{check.dateStr}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6 flex-wrap">
                      <div className="font-mono text-center">
                        <span className="block text-[8px] text-[#c6c9ab] uppercase">Peso</span>
                        <strong className="block text-sm text-white">{check.weight} kg</strong>
                      </div>
                      <div className="font-mono text-center">
                        <span className="block text-[8px] text-[#c6c9ab] uppercase">Adherencia</span>
                        <strong className="block text-xs text-[#e2ff00]">{check.adherence}</strong>
                      </div>
                      <button className="h-[36px] px-4 bg-[#e2ff00] hover:bg-[#bad200] text-black font-semibold font-mono text-xs uppercase rounded flex items-center gap-1">
                        <span>Evaluar</span>
                        <span className="material-symbols-outlined text-xs">edit</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* HISTORY TAB */}
      {activeSubTab === 'history' && (
        <div className="space-y-4">
          <div className="bg-[#121212] border border-[#2a2a2a] p-4 rounded-xl">
            <h3 className="font-sans font-bold text-sm text-white uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-violet-400 text-sm">history_edu</span>
              Historial Completo
            </h3>
            <p className="text-xs text-[#c6c9ab] font-sans">Todos los reportes. Haz clic en cualquiera para editar el feedback.</p>
          </div>
          <section className="bg-[#121212] border border-[#2a2a2a] rounded-xl overflow-hidden shadow-md">
            <div className="overflow-x-auto hide-scrollbar">
              <table className="w-full text-left border-collapse min-w-[700px]">
                <thead>
                  <tr className="bg-[#1a1a1a] border-b border-[#2a2a2a]">
                    <th className="p-3.5 pl-6 font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider">Fecha</th>
                    <th className="p-3.5 font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider">Deportista</th>
                    <th className="p-3.5 font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider">Peso</th>
                    <th className="p-3.5 font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider">Adherencia</th>
                    <th className="p-3.5 font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider">Humor</th>
                    <th className="p-3.5 font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider">Estado</th>
                    <th className="p-3.5 font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider text-right pr-6">Acción</th>
                  </tr>
                </thead>
                <tbody className="font-mono text-xs text-[#e2e2e2]">
                  {checkins.map((item) => {
                    const athleteProfile = getAthleteProfile(item);
                    return (
                      <tr
                        key={item.id}
                        onClick={() => handleSelectCheckIn(item)}
                        className="border-b border-[#2a2a2a]/30 hover:bg-[#1e1e1e] cursor-pointer transition-colors"
                      >
                        <td className="p-4 pl-6 text-[#c5c6c5]">{item.dateStr || 'S/D'}</td>
                        <td className="p-4 text-white font-bold">{athleteProfile?.displayName || item.email.split('@')[0]}</td>
                        <td className="p-4 text-white font-bold">{item.weight} kg</td>
                        <td className="p-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${item.adherence === 'Sí' ? 'bg-teal-500/10 text-teal-300' : item.adherence === 'Parcial' ? 'bg-amber-500/10 text-amber-300' : 'bg-red-500/10 text-red-300'}`}>
                            {item.adherence}
                          </span>
                        </td>
                        <td className="p-4 text-sm">{item.mood || '😐'}</td>
                        <td className="p-4">
                          {item.approved ? (
                            <span className="text-[#e2ff00] flex items-center gap-1 text-[10px] font-bold">
                              <span className="material-symbols-outlined text-xs">verified</span> EVALUADO
                            </span>
                          ) : (
                            <span className="text-rose-400 flex items-center gap-1 text-[10px] font-bold animate-pulse">
                              <span className="material-symbols-outlined text-xs">priority_high</span> PENDIENTE
                            </span>
                          )}
                        </td>
                        <td className="p-4 text-right pr-6">
                          <span className="text-[#e2ff00] hover:underline cursor-pointer">
                            {item.approved ? 'Editar' : 'Evaluar'} →
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
