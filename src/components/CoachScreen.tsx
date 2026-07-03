import React, { useState, useEffect } from 'react';
import { UserProfile, WeightCheckIn } from '../types';
import { submitCoachFeedback, getAllUserProfiles } from '../dbService';

interface CoachScreenProps {
  checkins: WeightCheckIn[];
  onRefreshCheckIns: () => void;
}

export default function CoachScreen({ checkins, onRefreshCheckIns }: CoachScreenProps) {
  const [activeSubTab, setActiveSubTab] = useState<'athletes' | 'pending' | 'history'>('athletes');
  const [athletes, setAthletes] = useState<UserProfile[]>([]);
  const [loadingAthletes, setLoadingAthletes] = useState(true);
  
  // Interactive detail states
  const [selectedAthlete, setSelectedAthlete] = useState<UserProfile | null>(null);
  const [selectedView, setSelectedDateView] = useState<'front' | 'side' | 'back'>('front');
  const [activeCheckInId, setActiveCheckInId] = useState<string>('');
  const [feedbackText, setFeedbackText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Sift pending check-ins
  const pendingCheckins = checkins.filter(c => !c.approved || !c.coachFeedback);

  // Load athletes list
  useEffect(() => {
    async function fetchAthletes() {
      try {
        const list = await getAllUserProfiles();
        setAthletes(list);
      } catch (err) {
        console.error('Error fetching athletes:', err);
      } finally {
        setLoadingAthletes(false);
      }
    }
    fetchAthletes();
  }, [checkins]);

  // Handle choosing a specific athlete to audit
  const handleSelectAthlete = (athlete: UserProfile) => {
    setSelectedAthlete(athlete);
    
    // Find check-ins for this specific athlete
    const athleteChecks = checkins.filter(
      c => c.userId === athlete.userId || c.email.toLowerCase() === athlete.email.toLowerCase()
    );
    
    if (athleteChecks.length > 0) {
      setActiveCheckInId(athleteChecks[0].id);
      setFeedbackText(athleteChecks[0].coachFeedback || '');
    } else {
      setActiveCheckInId('');
      setFeedbackText('');
    }
    
    setErrorMsg('');
    setSuccessMsg('');
  };

  const handleSelectCheckIn = (id: string, initialFeedback: string) => {
    setActiveCheckInId(id);
    setFeedbackText(initialFeedback || '');
    setErrorMsg('');
    setSuccessMsg('');
  };

  const handleSelectPendingCheckIn = (checkIn: WeightCheckIn) => {
    // Find matching athlete profile or manufacture matching dummy profile if needed
    const matchedAthlete = athletes.find(
      a => a.userId === checkIn.userId || a.email.toLowerCase() === checkIn.email.toLowerCase()
    ) || {
      userId: checkIn.userId,
      email: checkIn.email,
      displayName: checkIn.email.split('@')[0],
      role: 'client' as const,
      avatarUrl: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&q=80&w=200',
      level: 3,
      xp: 150,
      currentStreak: 4,
      maxStreak: 10,
      initialWeight: checkIn.weight + 2,
      targetWeight: checkIn.weight - 5,
      actualWeight: checkIn.weight
    };

    setSelectedAthlete(matchedAthlete);
    setActiveCheckInId(checkIn.id);
    setFeedbackText(checkIn.coachFeedback || '');
    setErrorMsg('');
    setSuccessMsg('');
  };

  const handleSendFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCheckInId) {
      setErrorMsg('No hay ningún check-in seleccionado para tasar.');
      return;
    }
    if (!feedbackText.trim()) {
      setErrorMsg('Por favor ingresa una directriz para el atleta.');
      return;
    }

    setErrorMsg('');
    setSuccessMsg('');
    setIsSubmitting(true);

    try {
      await submitCoachFeedback(activeCheckInId, feedbackText);
      setSuccessMsg('¡Directiva de entrenamiento y devolución enviada con éxito!');
      onRefreshCheckIns();
      
      // Update local state copy of the checked-in feedback too
      const updatedCheckins = checkins.map(c => 
        c.id === activeCheckInId ? { ...c, coachFeedback: feedbackText, approved: true } : c
      );
      
      // If we cleared a pending review, show message
      setTimeout(() => {
        setSuccessMsg('');
      }, 4000);

    } catch (err: any) {
      console.error(err);
      setErrorMsg('Fallo en la comunicación de red con base de datos.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Find check-ins for the currently selected athlete
  const currentAthleteCheckins = selectedAthlete 
    ? checkins.filter(c => c.userId === selectedAthlete.userId || c.email.toLowerCase() === selectedAthlete.email.toLowerCase())
    : [];

  const activeCheckIn = activeCheckInId 
    ? checkins.find(c => c.id === activeCheckInId) 
    : currentAthleteCheckins[0];

  return (
    <div className="space-y-6">
      
      {/* Dynamic Header Block */}
      <header className="flex flex-col md:flex-row md:items-end justify-between pb-4 border-b border-white/60 gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <span className="inline-flex items-center px-2 py-0.5 rounded bg-[#201f1f] text-[10px] font-mono border border-[#fbcb1a]/30 text-[#fbcb1a] font-bold uppercase tracking-wider">
              Consola de Entrenador (CRM)
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs font-mono text-[#00eefc]">
              <span className="w-2 h-2 rounded-full bg-[#00eefc] animate-pulse"></span>
              Sincronizado
            </span>
          </div>
          {selectedAthlete ? (
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setSelectedAthlete(null)}
                className="p-1 px-3 bg-[#1c1b1b] hover:bg-[#2c2b2b] text-[#fbcb1a] border border-white/7 text-xs font-mono rounded flex items-center gap-1 active:scale-95 transition-all"
              >
                <span className="material-symbols-outlined text-sm">arrow_back</span>
                <span>Volver</span>
              </button>
              <h1 className="font-sans font-extrabold text-2xl tracking-tight text-white m-0">
                Auditoría: <span className="text-[#fbcb1a]">{selectedAthlete.displayName}</span>
              </h1>
            </div>
          ) : (
            <h1 className="font-sans font-black text-3xl tracking-tight text-white m-0 uppercase">Panel Coach</h1>
          )}
        </div>

        {!selectedAthlete && (
          <div className="flex bg-[#181816] border border-white/7 p-1 rounded-lg gap-1">
            <button
              onClick={() => setActiveSubTab('athletes')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md font-sans text-xs font-bold tracking-wider uppercase transition-all ${
                activeSubTab === 'athletes' 
                  ? 'bg-[#fbcb1a] text-black shadow-lg shadow-[#fbcb1a]/10' 
                  : 'text-[#c6c9ab] hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-base">group</span>
              <span>Atletas Activos ({athletes.length})</span>
            </button>
            <button
              onClick={() => setActiveSubTab('pending')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md font-sans text-xs font-bold tracking-wider uppercase transition-all relative ${
                activeSubTab === 'pending' 
                  ? 'bg-[#fbcb1a] text-black shadow-lg shadow-[#fbcb1a]/10' 
                  : 'text-[#c6c9ab] hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-base">pending_actions</span>
              <span>Revisiones</span>
              {pendingCheckins.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-[#00eefc] text-black font-mono font-black text-[9px] w-5 h-5 rounded-full flex items-center justify-center animate-bounce">
                  {pendingCheckins.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveSubTab('history')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md font-sans text-xs font-bold tracking-wider uppercase transition-all ${
                activeSubTab === 'history' 
                  ? 'bg-[#fbcb1a] text-black shadow-lg shadow-[#fbcb1a]/10' 
                  : 'text-[#c6c9ab] hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-base">history</span>
              <span>Historial</span>
            </button>
          </div>
        )}
      </header>

      {successMsg && (
        <div className="bg-[#fbcb1a]/15 border border-[#fbcb1a]/30 text-white p-4 rounded-xl text-sm flex items-center gap-2 animate-pulse shadow-[0_0_15px_rgba(226,255,0,0.1)]">
          <span className="material-symbols-outlined text-[#fbcb1a]">check_circle</span>
          <p className="font-sans font-medium">{successMsg}</p>
        </div>
      )}

      {errorMsg && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-200 p-4 rounded-xl text-xs font-mono">
          {errorMsg}
        </div>
      )}

      {/* EXECUTIVE SUMMARY CARDS */}
      {!selectedAthlete && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pb-2">
          {/* Card 1: Resumen Atletas */}
          <div className="lg:col-span-5 bg-gradient-to-br from-[#121414] to-[#121212] border border-white/7 p-5 rounded-2xl relative overflow-hidden flex flex-col justify-between shadow-lg">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#fbcb1a]/5 rounded-bl-full pointer-events-none" />
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#fbcb1a] text-xl">group</span>
                  <h2 className="font-sans font-extrabold text-[#c6c9ab] text-xs uppercase tracking-wider">Atletas del Entrenador</h2>
                </div>
                <span className="text-[10px] bg-teal-500/15 text-[#00eefc] px-2 py-0.5 border border-teal-500/20 rounded font-mono font-bold uppercase">
                  Activos En Plataforma
                </span>
              </div>
              
              <div className="flex items-baseline gap-2 mt-2">
                <span className="font-sans font-black text-5xl text-white tracking-tight">{athletes.length}</span>
                <span className="text-xs text-[#c6c9ab] font-sans pb-1">deportistas registrados</span>
              </div>
              
              <p className="text-xs text-[#c6c9ab] font-sans mt-3 leading-relaxed">
                Supervisando hábitos de adherencia calórica, marcas de entrenamiento de fuerza bruta, evolución porcentual y estado anímico general.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-6 pt-4 border-t border-white/60">
              <div className="bg-[#1b1c1c]/50 p-2.5 rounded-xl border border-white/40 text-center font-mono">
                <span className="block text-[8px] text-[#c6c9ab] uppercase">Racha Promedio</span>
                <span className="block text-sm font-black text-[#fbcb1a] mt-0.5">
                  {athletes.length > 0 ? Math.round(athletes.reduce((acc, curr) => acc + (curr.currentStreak || 0), 0) / athletes.length) : 0} semanas
                </span>
              </div>
              <div className="bg-[#1b1c1c]/50 p-2.5 rounded-xl border border-white/40 text-center font-mono">
                <span className="block text-[8px] text-[#00eefc] uppercase">Nivel Medio</span>
                <span className="block text-sm font-black text-white mt-0.5">
                  Lvl {athletes.length > 0 ? (athletes.reduce((acc, curr) => acc + (curr.level || 0), 0) / athletes.length).toFixed(1) : '1.0'}
                </span>
              </div>
            </div>
          </div>

          {/* Card 2: Revisiones Pendientes */}
          <div className="lg:col-span-7 bg-[#181816] border border-white/7 p-5 rounded-2xl flex flex-col justify-between shadow-lg relative overflow-hidden">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#00eefc] text-xl">pending_actions</span>
                  <h2 className="font-sans font-extrabold text-[#c6c9ab] text-xs uppercase tracking-wider">Bandeja de Pesadas Pendientes</h2>
                </div>
                {pendingCheckins.length > 0 ? (
                  <span className="text-[10px] bg-red-500/10 text-rose-400 px-2.5 py-0.5 border border-red-500/25 rounded font-mono uppercase font-black animate-pulse">
                    {pendingCheckins.length} por evaluar
                  </span>
                ) : (
                  <span className="text-[10px] bg-[#fbcb1a]/10 text-[#fbcb1a] px-2.5 py-0.5 border border-[#fbcb1a]/20 rounded font-mono uppercase font-bold">
                    Al día
                  </span>
                )}
              </div>

              {pendingCheckins.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center text-[#c6c9ab]">
                  <span className="material-symbols-outlined text-3xl text-[#fbcb1a] mb-2 animate-pulse">verified_user</span>
                  <p className="text-xs font-bold text-white">¡No tienes revisiones de peso pendientes!</p>
                  <p className="text-[11px] mt-0.5">Todos tus atletas ya tienen sus directrices de entrenamiento actualizadas.</p>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[175px] overflow-y-auto pr-1 select-none hide-scrollbar">
                  {pendingCheckins.map((check) => {
                    const athleteProfile = athletes.find(
                      a => a.userId === check.userId || a.email.toLowerCase() === check.email.toLowerCase()
                    );
                    return (
                      <div 
                        key={check.id}
                        onClick={() => handleSelectPendingCheckIn(check)}
                        className="bg-[#181818] hover:bg-[#202020] border border-white/7 hover:border-[#00eefc]/50 p-3 rounded-xl flex items-center justify-between gap-3 cursor-pointer transition-all duration-200 group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-full overflow-hidden border border-white/7 bg-[#1e1e1b] flex-shrink-0">
                            <img 
                              src={athleteProfile?.avatarUrl || 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&q=80&w=200'} 
                              alt="Avatar" 
                              className="w-full h-full object-cover" 
                            />
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-sans font-bold text-xs text-white truncate group-hover:text-[#00eefc] transition-colors">
                              {athleteProfile?.displayName || check.email.split('@')[0]}
                            </h4>
                            <p className="font-mono text-[9px] text-[#c6c9ab] mt-0.5">
                              Peso: <span className="text-white font-bold">{check.weight} kg</span> · {check.dateStr}
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold uppercase ${
                            check.adherence === 'Sí' ? 'bg-teal-500/10 text-teal-300' :
                            check.adherence === 'Parcial' ? 'bg-amber-500/10 text-amber-300' : 'bg-red-500/10 text-red-300'
                          }`}>
                            {check.adherence}
                          </span>
                          <button className="p-1 px-2.5 bg-[#fbcb1a] hover:bg-[#d4a800] text-black font-extrabold font-mono text-[10px] uppercase rounded flex items-center gap-1 shadow transition-all active:scale-95">
                            <span>EVALUAR</span>
                            <span className="material-symbols-outlined text-[10px]">edit</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="mt-4 pt-3.5 border-t border-white/60 text-right">
              <button 
                onClick={() => setActiveSubTab('pending')}
                className="text-[10px] font-mono text-[#00eefc] hover:text-[#00eefc]/80 transition-colors uppercase tracking-wider font-bold flex items-center gap-1 ml-auto"
              >
                <span>Ir a panel de revisiones</span>
                <span className="material-symbols-outlined text-xs">arrow_forward</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VIEW DIRECTORY 1: ACTIVE ATHLETES LIST (LANDING) */}
      {!selectedAthlete && activeSubTab === 'athletes' && (
        <div className="space-y-4">
          <div className="bg-[#181816] border border-white/7 p-4 rounded-2xl flex items-center justify-between">
            <p className="text-xs text-[#c6c9ab] font-sans leading-relaxed">
              Mostrando atletas registrados en el sistema. Selecciona cualquier atleta para ver su histórico progresivo de peso corporal, bitácoras nutricionales y fotos semanales.
            </p>
            <span className="text-[10px] bg-teal-500/10 text-teal-300 px-3 py-1 border border-teal-500/20 rounded font-mono uppercase">
              {athletes.length} ATLETAS EN ALTA
            </span>
          </div>

          {loadingAthletes ? (
            <div className="text-center py-12 text-[#c6c9ab] font-mono tracking-widest uppercase text-xs animate-pulse">
              Cargando atletas activos...
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {athletes.map((athlete) => {
                const totalCheckCount = checkins.filter(
                  c => c.userId === athlete.userId || c.email.toLowerCase() === athlete.email.toLowerCase()
                ).length;

                return (
                  <div 
                    key={athlete.userId}
                    onClick={() => handleSelectAthlete(athlete)}
                    className="bg-[#131313] border border-white/7 rounded-xl p-5 hover:border-[#fbcb1a]/50 hover:shadow-[0_4px_20px_rgba(226,255,0,0.05)] cursor-pointer transition-all flex flex-col justify-between group relative overflow-hidden"
                  >
                    <div className="absolute right-0 top-0 w-16 h-16 bg-gradient-to-tr from-transparent to-[#fbcb1a]/5 rounded-bl-full pointer-events-none" />
                    
                    <div className="space-y-4">
                      {/* Athlete Identity */}
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-white/7 group-hover:border-[#fbcb1a]/60 transition-all">
                          <img src={athlete.avatarUrl} alt={athlete.displayName} className="w-full h-full object-cover" />
                        </div>
                        <div>
                          <h3 className="font-sans font-bold text-white text-base leading-snug group-hover:text-[#fbcb1a] transition-colors">{athlete.displayName}</h3>
                          <p className="font-mono text-[10px] text-[#c6c9ab] truncate max-w-[200px]">{athlete.email}</p>
                        </div>
                      </div>

                      {/* Weight Progress & Objectives Row */}
                      <div className="grid grid-cols-3 gap-2 bg-[#1b1c1c]/50 p-2.5 rounded-lg border border-white/40 text-center font-mono">
                        <div>
                          <span className="block text-[8px] text-[#c6c9ab] uppercase">INICIAL</span>
                          <span className="block text-xs font-bold text-white">{athlete.initialWeight} kg</span>
                        </div>
                        <div>
                          <span className="block text-[8px] text-[#fbcb1a] uppercase font-bold">ACTUAL</span>
                          <span className="block text-xs font-bold text-[#fbcb1a]">{athlete.actualWeight || athlete.initialWeight} kg</span>
                        </div>
                        <div>
                          <span className="block text-[8px] text-[#00eefc] uppercase">META</span>
                          <span className="block text-xs font-bold text-[#00eefc]">{athlete.targetWeight} kg</span>
                        </div>
                      </div>

                      {/* Dynamic Metric indicators */}
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between font-mono text-[10px]">
                          <span className="text-[#c6c9ab] uppercase flex items-center gap-1">
                            <span className="material-symbols-outlined text-[12px] text-orange-400">local_fire_department</span> Racha Actual
                          </span>
                          <strong className="text-white">{athlete.currentStreak || 0} semanas</strong>
                        </div>
                        <div className="flex justify-between font-mono text-[10px]">
                          <span className="text-[#c6c9ab] uppercase flex items-center gap-1">
                            <span className="material-symbols-outlined text-[12px] text-teal-400">military_tech</span> Nivel Ficha
                          </span>
                          <strong className="text-[#00eefc]">Lvl {athlete.level || 1}</strong>
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 pt-3.5 border-t border-white/60 flex items-center justify-between text-xs font-mono">
                      <span className="text-[#c6c9ab]">{totalCheckCount} Reportes</span>
                      <span className="text-[#fbcb1a] flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                        <span>Ver Auditoría</span>
                        <span className="material-symbols-outlined text-[10px]">arrow_forward</span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* VIEW DIRECTORY 2: REVISIONES PENDIENTES */}
      {!selectedAthlete && activeSubTab === 'pending' && (
        <div className="space-y-4">
          <div className="bg-[#181816] border border-white/7 p-4 rounded-2xl flex items-center justify-between">
            <p className="text-xs text-[#c6c9ab] font-sans">
              La siguiente bandeja muestra los reportes pendientes que requieren aprobación y retroalimentación (devolución del coach). Al darles feedback se aprueban instantáneamente.
            </p>
            <span className="text-[10px] bg-[#fbcb1a]/10 text-[#fbcb1a] px-3 py-1 border border-[#fbcb1a]/20 rounded font-mono uppercase font-black">
              {pendingCheckins.length} PENDIENTES
            </span>
          </div>

          {pendingCheckins.length === 0 ? (
            <div className="bg-[#131313] border border-dashed border-white/7 rounded-xl p-12 text-center text-[#c6c9ab] font-sans">
              <span className="material-symbols-outlined text-4xl text-[#fbcb1a] mb-2 animate-pulse">verified_user</span>
              <p className="text-sm font-bold text-white">¡No tienes revisiones pendientes!</p>
              <p className="text-xs mt-1">Todos tus atletas ya tienen sus directrices de entrenamiento y nutrición actualizadas para esta semana.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingCheckins.map((check) => {
                const athleteProfile = athletes.find(
                  a => a.userId === check.userId || a.email.toLowerCase() === check.email.toLowerCase()
                );

                return (
                  <div 
                    key={check.id}
                    onClick={() => handleSelectPendingCheckIn(check)}
                    className="bg-[#181816] border border-white/7 rounded-2xl p-4 hover:border-[#00eefc]/50 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full overflow-hidden border border-white/7 bg-[#1e1e1b] flex-shrink-0">
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
                          <span className="text-[9px] bg-red-500/10 text-red-400 px-2 py-0.5 rounded font-mono uppercase">
                            Nueva Pesada
                          </span>
                        </div>
                        <p className="font-mono text-xs text-[#c6c9ab] mt-0.5">Enviado el {new Date(check.timestamp).toLocaleDateString()}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 flex-wrap">
                      <div className="font-mono text-center">
                        <span className="block text-[8px] text-[#c6c9ab] uppercase">Reporte Peso</span>
                        <strong className="block text-sm text-white">{check.weight} kg</strong>
                      </div>
                      <div className="font-mono text-center">
                        <span className="block text-[8px] text-[#c6c9ab] uppercase">Adherencia</span>
                        <strong className="block text-xs text-[#fbcb1a]">{check.adherence}</strong>
                      </div>
                      <div className="font-mono text-center max-w-[200px] hidden lg:block">
                        <span className="block text-[8px] text-[#c6c9ab] uppercase">Comentario Atleta</span>
                        <p className="text-[10px] text-slate-300 truncate">{check.notes || 'Ninguno'}</p>
                      </div>
                      <button className="h-[36px] px-4 bg-[#fbcb1a] hover:bg-[#d4a800] text-black font-semibold font-mono text-xs uppercase rounded flex items-center gap-1 shadow-md">
                        <span>Evaluar ahora</span>
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

      {/* VIEW DIRECTORY 3: HISTORIAL COMPLETO DE CHECK-INS */}
      {!selectedAthlete && activeSubTab === 'history' && (
        <div className="space-y-4">
          <div className="bg-[#181816] border border-white/7 p-4 rounded-2xl">
            <h3 className="font-sans font-bold text-base text-white uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-violet-400 text-sm">history_edu</span>
              Historial Completo de Reportes Generales
            </h3>
            <p className="text-xs text-[#c6c9ab] font-sans">
              Bitácora cronológica de los últimos reportes cargados en la plataforma por cualquier deportista. Puedes seleccionar cualquiera para editar su devolución.
            </p>
          </div>

          <section className="bg-[#181816] border border-white/7 rounded-2xl overflow-hidden shadow-md">
            <div className="overflow-x-auto hide-scrollbar">
              <table className="w-full text-left border-collapse min-w-[700px]">
                <thead>
                  <tr className="bg-[#1e1e1b] border-b border-white/7">
                    <th className="p-3.5 pl-6 font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider">Fecha de reporte</th>
                    <th className="p-3.5 font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider">Deportista</th>
                    <th className="p-3.5 font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider">Peso (kg)</th>
                    <th className="p-3.5 font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider">Adherencia</th>
                    <th className="p-3.5 font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider">Humor</th>
                    <th className="p-3.5 font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider">Estado</th>
                    <th className="p-3.5 font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider text-right pr-6">Acción</th>
                  </tr>
                </thead>
                <tbody className="font-mono text-xs text-[#e2e2e2]">
                  {checkins.map((item) => {
                    const athleteProfile = athletes.find(
                      a => a.userId === item.userId || a.email.toLowerCase() === item.email.toLowerCase()
                    );

                    return (
                      <tr 
                        key={item.id}
                        onClick={() => handleSelectPendingCheckIn(item)}
                        className={`border-b border-white/30 hover:bg-[#1e1e1e] cursor-pointer transition-colors`}
                      >
                        <td className="p-4 pl-6 text-[#c5c6c5]">{item.dateStr || 'S/D'}</td>
                        <td className="p-4 text-white font-bold">{athleteProfile?.displayName || item.email.split('@')[0]}</td>
                        <td className="p-4 text-white font-bold">{item.weight} kg</td>
                        <td className="p-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            item.adherence === 'Sí' ? 'bg-teal-500/10 text-teal-300' :
                            item.adherence === 'Parcial' ? 'bg-amber-500/10 text-amber-300' : 'bg-red-500/10 text-red-300'
                          }`}>
                            {item.adherence}
                          </span>
                        </td>
                        <td className="p-4 text-sm">{item.mood || '😐'}</td>
                        <td className="p-4">
                          {item.approved ? (
                            <span className="text-[#fbcb1a] flex items-center gap-1 text-[10px] font-bold">
                              <span className="material-symbols-outlined text-xs">verified</span> EVALUADO
                            </span>
                          ) : (
                            <span className="text-rose-400 flex items-center gap-1 text-[10px] font-bold animate-pulse">
                              <span className="material-symbols-outlined text-xs">priority_high</span> PENDIENTE
                            </span>
                          )}
                        </td>
                        <td className="p-4 text-right pr-6">
                          <span className="text-[#fbcb1a] hover:underline">
                            {item.approved ? 'Editar Feed' : 'Evaluar'} →
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


      {/* VIEW ATHLETE SPECIFIC DETAILS (AUDITORIA WORKSPACE) */}
      {selectedAthlete && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fade-in">
          
          {/* LEFT AREA: AUDIT REPORT FEEDBACK & VALUES (4 columns) */}
          <section className="lg:col-span-4 flex flex-col gap-6">
            
            {/* Athlete quick stat board */}
            <div className="bg-[#181816] border border-white/7 rounded-2xl p-5 hover:border-[#c6c9ab]/30 transition-all space-y-4">
              <div className="flex items-center gap-4 border-b border-white/7 pb-3">
                <div className="w-14 h-14 rounded-full overflow-hidden border border-[#fbcb1a]/25">
                  <img src={selectedAthlete.avatarUrl} alt="Athlete Avatar" className="w-full h-full object-cover" />
                </div>
                <div>
                  <h3 className="font-sans font-bold text-white text-lg">{selectedAthlete.displayName}</h3>
                  <span className="font-mono text-xs text-[#00eefc]">Meta: {selectedAthlete.targetWeight} kg</span>
                </div>
              </div>

              <div className="space-y-3 pt-1">
                <div className="flex justify-between items-baseline text-xs font-mono">
                  <span className="text-[#c6c9ab] uppercase">Correo Registrado:</span>
                  <span className="text-white font-bold">{selectedAthlete.email}</span>
                </div>
                <div className="flex justify-between items-baseline text-xs font-mono">
                  <span className="text-[#c6c9ab] uppercase">Racha de Adherencia:</span>
                  <span className="text-orange-400 font-bold">{selectedAthlete.currentStreak || 4} Semanas</span>
                </div>
                <div className="flex justify-between items-baseline text-xs font-mono">
                  <span className="text-[#c6c9ab] uppercase">Nivel de Ficha Fit:</span>
                  <span className="text-[#00eefc] font-bold">Nivel {selectedAthlete.level || 5}</span>
                </div>
                <div className="flex justify-between items-baseline text-xs font-mono">
                  <span className="text-[#c6c9ab] uppercase">XP de Progreso:</span>
                  <span className="text-slate-300 font-bold">{selectedAthlete.xp || 320} / 400</span>
                </div>
              </div>
            </div>

            {/* Selector of historical reports of THIS athlete */}
            <div className="bg-[#181816] border border-white/7 rounded-2xl p-5 hover:border-[#c6c9ab]/30 transition-all flex-1 space-y-4">
              <h3 className="font-sans font-bold text-base text-white flex items-center gap-2 border-b border-white/7 pb-2 uppercase tracking-wide">
                <span className="material-symbols-outlined text-[#00eefc] text-sm">history_edu</span>
                Historial Progresivo
              </h3>
              
              {currentAthleteCheckins.length === 0 ? (
                <p className="text-xs text-[#c6c9ab] font-mono text-center py-4">Este deportista aún no ha cargado pesajes ni reportes semanales.</p>
              ) : (
                <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1 hide-scrollbar">
                  {currentAthleteCheckins.map((check) => (
                    <div 
                      key={check.id}
                      onClick={() => handleSelectCheckIn(check.id, check.coachFeedback || '')}
                      className={`p-3 rounded-lg border cursor-pointer transition-all ${
                        activeCheckInId === check.id 
                          ? 'bg-[#1e1e1a] border-[#fbcb1a] text-white' 
                          : 'bg-[#131313] border-white/7 hover:border-slate-500 text-slate-300'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-mono text-xs font-bold">{check.dateStr}</span>
                        <span className={`text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded ${
                          check.approved ? 'bg-[#fbcb1a]/10 text-[#fbcb1a]' : 'bg-red-500/10 text-red-300'
                        }`}>
                          {check.approved ? 'Evaluado' : 'Pendiente'}
                        </span>
                      </div>
                      
                      <div className="flex gap-4 mt-2 text-xs font-mono">
                        <span>Peso: <strong className="text-white">{check.weight} kg</strong></span>
                        <span>Cumple: <strong className="text-white">{check.adherence}</strong></span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ADHERENCE CARD CUMPLIMIENTO */}
            <div className="bg-[#181816] border border-white/7 rounded-2xl p-5 hover:border-[#c6c9ab]/30 transition-all space-y-4">
              <h3 className="font-sans font-bold text-base text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-[#00eefc] text-sm">assignment_turned_in</span>
                Cumplimiento Semanal
              </h3>

              <div className="space-y-3 text-xs">
                <div>
                  <div className="flex justify-between mb-1.5 font-mono text-[10px]">
                    <span className="text-[#c6c9ab] uppercase">Entrenamientos Realizados</span>
                    <span className="text-white">4 / 5</span>
                  </div>
                  <div className="h-1.5 w-full bg-[#1c1b1b] rounded-full overflow-hidden">
                    <div className="h-full bg-[#00eefc] w-[80%] rounded-full shadow-[0_0_6px_rgba(0,238,252,0.3)]"></div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between mb-1.5 font-mono text-[10px]">
                    <span className="text-[#c6c9ab] uppercase">Adherencia Macros Nutri</span>
                    <span className="text-white">92%</span>
                  </div>
                  <div className="h-1.5 w-full bg-[#1c1b1b] rounded-full overflow-hidden">
                    <div className="h-full bg-[#fbcb1a] w-[92%] rounded-full shadow-[0_0_6px_rgba(226,255,0,0.3)]"></div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* RIGHT AREA: DETAIL PROGRESS VIEW & DIRECTIVE BOX (8 columns) */}
          <section className="lg:col-span-8 flex flex-col gap-6">
            
            {/* Progress photos comparison */}
            <div className="bg-[#181816] border border-white/7 rounded-2xl overflow-hidden flex flex-col hover:border-[#c6c9ab]/30 transition-all">
              <div className="p-4 border-b border-white/7 flex items-center justify-between bg-[#1c1b1b]">
                <h3 className="font-sans font-bold text-base text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#fbcb1a] text-sm">photo_camera</span>
                  Historial Fotográfico de Control
                </h3>
                
                {/* View options */}
                <div className="flex bg-[#2a2a2a] rounded p-0.5">
                  {(['front', 'side', 'back'] as const).map((view) => (
                    <button
                      key={view}
                      type="button"
                      onClick={() => setSelectedDateView(view)}
                      className={`px-3 py-1 rounded font-sans text-[9px] font-bold uppercase transition-all tracking-wider ${selectedView === view ? 'bg-[#fbcb1a] text-black shadow-md' : 'text-[#c6c9ab] hover:text-white'}`}
                    >
                      {view}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3 grid grid-cols-2 gap-3 bg-[#131313]/90">
                {/* Baseline Week 1 */}
                <div className="relative rounded-lg overflow-hidden border border-white/7 group">
                  <div className="absolute top-2 left-2 z-10 bg-black/75 backdrop-blur-sm border border-white/7 px-2.5 py-0.5 rounded text-white font-mono text-[10px] tracking-wide">
                    Baseline (S1)
                  </div>
                  <img 
                    className="w-full h-[280px] object-cover object-top filter grayscale-[15%] group-hover:filter-none transition-all duration-500"
                    src="https://lh3.googleusercontent.com/aida-public/AB6AXuCembU5PDvcRsGK_NeKUJUjJ0C4iyB3TjRmqUz0ICDMLKno0GJG-vc6PkXBlOrZ6lKLe3_xQQX74ev4M4oXWnNXlB0-ywA94vvgxgRj0uTEcOAsPm4hQeXwpQgvp7pFs-hIspYO7w2uAv_2BMTBzWgMhdFYZAeTT8psKgvECQnecZG6tI5dLcVbej4gJX2t2-Cf3PppEFrMnKOoj0JIRWfHpvrvTRbHBHVoe-0Sbfo9drSiGRy2sQSJn1e5svDWXPBW1bjjQD1Wn5ab" 
                    alt="Baseline front"
                  />
                </div>

                {/* Current Week 6 */}
                <div className="relative rounded-lg overflow-hidden border border-[#fbcb1a]/20 group">
                  <div className="absolute top-2 left-2 z-10 bg-[#fbcb1a] text-black px-2.5 py-0.5 rounded font-sans text-[10px] font-black shadow-md tracking-wide">
                    Actual (Simanal)
                  </div>
                  <img 
                    className="w-full h-[280px] object-cover object-top group-hover:scale-105 transition-all duration-500"
                    src="https://lh3.googleusercontent.com/aida-public/AB6AXuBmPlIy5pwqq-9j9RusW6cmHeHZEEQCHOULf9mpDx67LB56kmapDKD4S6TX3sOc9zBv0KA_ZokJ3EBqlHlchw3jc9tuNK_2oQm--a46HeMBvL5MgQjJaMSXyTaEW3mW1kZ_aVbNcYPoFGdpJJfWOnLh6zlA4h7aC_0MAVCUviar-P2_qSt-pRsnwPylJ1JUSnuQ7NpVeChalKhgi-mraO1P10CiJfVQ5tOMrmzvL8M_-V6NnKWTimdZA-nDXcUYt5CoJMjyLKSghHuL" 
                    alt="Current front"
                  />
                </div>
              </div>
            </div>

            {/* Details panel of selected check-in */}
            {activeCheckIn ? (
              <div className="bg-[#181816] border border-white/7 rounded-2xl p-5 space-y-4">
                <div className="flex justify-between items-center border-b border-white/7 pb-3">
                  <h4 className="font-sans font-bold text-sm text-white flex items-center gap-2 uppercase tracking-wide text-[#00eefc]">
                    <span className="material-symbols-outlined text-sm">folder_open</span>
                    Datos de la Entrada: {activeCheckIn.dateStr}
                  </h4>
                  <span className="text-xs font-mono text-[#c6c9ab]">Reportado el {new Date(activeCheckIn.timestamp).toLocaleDateString()}</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono text-xs">
                  <div className="bg-[#1e1e1b] p-3 rounded-xl border border-white/40">
                    <span className="block text-[#c6c9ab] text-[10px] uppercase">Peso Registrado</span>
                    <strong className="text-white text-base font-bold">{activeCheckIn.weight} kg</strong>
                  </div>
                  <div className="bg-[#1e1e1b] p-3 rounded-xl border border-white/40">
                    <span className="block text-[#c6c9ab] text-[10px] uppercase">Cumplimiento Dieta</span>
                    <strong className="text-base font-bold text-[#fbcb1a]">{activeCheckIn.adherence}</strong>
                  </div>
                  <div className="bg-[#1e1e1b] p-3 rounded-xl border border-white/40">
                    <span className="block text-[#c6c9ab] text-[10px] uppercase">Humor Atleta</span>
                    <strong className="text-base text-white">{activeCheckIn.mood || '😊'}</strong>
                  </div>
                </div>

                <div className="bg-[#181818]/60 p-3.5 rounded-lg border border-white/30">
                  <span className="block font-mono text-[9px] text-[#c6c9ab] uppercase mb-1">Notas del deportista</span>
                  <p className="text-xs text-slate-300 font-sans italic">
                    "{activeCheckIn.notes || 'El deportista no ha ingresado notas adicionales en esta pasada semanal.'}"
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-[#181816] border border-dashed border-white/7 p-8 text-center rounded-2xl text-xs text-[#c6c9ab]">
                Selecciona una entrada del histórico de la izquierda para evaluar o inspeccionar detalladamente.
              </div>
            )}

            {/* Evaluative directrice form */}
            <form onSubmit={handleSendFeedback} className="bg-[#181816] border border-white/7 p-5 rounded-2xl space-y-4 hover:border-[#c6c9ab]/30 transition-all relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#fbcb1a]" />
              
              <div className="flex justify-between items-center">
                <h3 className="font-sans font-bold text-base text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#fbcb1a] text-sm">rate_review</span>
                  Redacción de Directriz &amp; Devolución (Coach Note)
                </h3>
                {activeCheckIn?.approved && (
                  <span className="bg-[#fbcb1a]/10 text-[#fbcb1a] font-mono text-[9px] font-black uppercase px-2 py-0.5 rounded border border-[#fbcb1a]/25">
                    Evaluación Completa
                  </span>
                )}
              </div>

              <div className="bg-[#1c1b1b] p-3.5 rounded-lg border border-white/60 space-y-3">
                <p className="text-[10px] font-mono text-[#c6c9ab]">
                  Ajustes nutricionales, indicaciones de cargas rítmicas en el gimnasio u observaciones motivacionales:
                </p>
                
                <textarea
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  placeholder="Ej: Mantén el cardio diario constante. Subimos carbohidratos complejos en comidas pre-entreno para maximizar la fuerza el día de piernas..."
                  className="w-full bg-[#181816] border border-white/60 rounded p-3 text-sm text-white focus:ring-1 focus:ring-[#fbcb1a] focus:border-[#fbcb1a] focus:outline-none min-h-[110px] resize-none placeholder-slate-600 font-sans"
                />
              </div>

              <div className="flex md:items-center justify-between gap-4 flex-col md:flex-row pt-1">
                <span className="text-[10px] font-mono text-[#c6c9ab] leading-snug">
                  La directriz se refleja de inmediato en el historial personal y el panel de inicio del deportista.
                </span>
                <button
                  type="submit"
                  disabled={isSubmitting || !activeCheckIn}
                  className="h-[40px] px-6 bg-[#fbcb1a] hover:bg-[#d4a800] text-black font-sans font-bold text-xs uppercase rounded flex items-center justify-center gap-2 shadow-[0_0_12px_rgba(226,255,0,0.25)] active:scale-95 transition-all self-end flex-shrink-0 disabled:opacity-50 disabled:pointer-events-none"
                >
                  {isSubmitting ? 'Guardando...' : 'Enviar y Aprobar'}
                  <span className="material-symbols-outlined text-sm font-bold">send</span>
                </button>
              </div>
            </form>
          </section>

        </div>
      )}

    </div>
  );
}
