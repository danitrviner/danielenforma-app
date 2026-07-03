import React, { useState } from 'react';
import { UserProfile, WeightCheckIn } from '../types';
import { addWeightCheckIn } from '../dbService';

interface MetricsScreenProps {
  profile: UserProfile;
  checkins: WeightCheckIn[];
  onCheckInAdded: (newCheckIn: WeightCheckIn) => void;
  onRefreshProfile: () => void;
}

export default function MetricsScreen({ profile, checkins, onCheckInAdded, onRefreshProfile }: MetricsScreenProps) {
  const [weight, setWeight] = useState('');
  const [mood, setMood] = useState('🔥');
  const [adherence, setAdherence] = useState<'Sí' | 'Parcial' | 'No'>('Sí');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Find latest weight and compute overall difference
  const currentWeight = checkins[0]?.weight || profile.actualWeight;
  const initialWeight = profile.initialWeight;
  const difference = parseFloat((currentWeight - initialWeight).toFixed(1));
  const diffSign = difference > 0 ? `+${difference}` : `${difference}`;
  
  // Custom interactive SVG Chart calculations
  const chartHeight = 160;
  const chartWidth = 500;
  const verticalPadding = 20;
  const horizontalPadding = 35;
  
  // Sort reverse to draw chronologically from left to right
  const sortedCheckins = [...checkins].reverse();
  const weights = sortedCheckins.map(c => d => c.weight);
  
  // Calculate Min and Max for standard scaling
  const minWeight = Math.min(...checkins.map(c => c.weight), initialWeight) - 1;
  const maxWeight = Math.max(...checkins.map(c => c.weight), initialWeight) + 1;
  const weightRange = maxWeight - minWeight;

  const points = sortedCheckins.map((item, index) => {
    const x = horizontalPadding + (index / Math.max(1, sortedCheckins.length - 1)) * (chartWidth - horizontalPadding * 2);
    const weightVal = item.weight;
    // Map of weight to Y coordinate
    const y = chartHeight - verticalPadding - ((weightVal - minWeight) / (weightRange || 1)) * (chartHeight - verticalPadding * 2);
    return { x, y, item };
  });

  const pathD = points.length > 0 
    ? `M ${points.map(p => `${p.x} ${p.y}`).join(' L ')}` 
    : '';

  // Form checkin submit
  const handleSubmitCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!weight) {
      setErrorMsg('Por favor, indica tu peso actual.');
      return;
    }
    setErrorMsg('');
    setSuccessMsg('');
    setIsSubmitting(true);

    try {
      const added = await addWeightCheckIn(profile.userId, profile.email, {
        weight: parseFloat(weight),
        mood,
        adherence,
        notes
      });
      onCheckInAdded(added);
      setSuccessMsg('¡Check-in enviado exitosamente al entrenador! Has sumado +50 XP y extendido tu racha.');
      setWeight('');
      setNotes('');
      // Trigger update of upper-level profile data
      setTimeout(() => {
        onRefreshProfile();
      }, 500);
    } catch (err: any) {
      console.error(err);
      setErrorMsg('Error de conexión o permisos insuficientes.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const streakDays = profile.currentStreak;
  const maxStreakDays = profile.maxStreak;

  return (
    <div className="space-y-6">
      {/* Upper header summary */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-sans font-extrabold text-3xl tracking-tight text-white m-0">Progress &amp; Evolution</h1>
          <p className="text-[#c6c9ab] text-sm mt-1">Registra tus marcas, revisa las métricas semanales y analiza tu progreso.</p>
        </div>
      </div>

      {successMsg && (
        <div className="bg-[#fbcb1a]/10 border border-[#fbcb1a]/30 text-white p-4 rounded-lg text-sm flex items-center gap-3 animate-bounce">
          <span className="material-symbols-outlined text-[#fbcb1a]">energy_savings_leaf</span>
          <div>
            <p className="font-bold">{successMsg}</p>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-200 p-4 rounded-lg text-sm">
          {errorMsg}
        </div>
      )}

      {/* Grid containing visual details */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Section A: Visual Summary Weight & Core Chart */}
        <section className="lg:col-span-8 bg-[#181816] border border-white/7 rounded-2xl p-5 flex flex-col justify-between relative overflow-hidden">
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="flex flex-col">
              <span className="font-mono text-[11px] text-[#c6c9ab] uppercase tracking-wider mb-1">ACTUAL</span>
              <span className="font-sans font-black text-2xl md:text-3xl text-white">
                {currentWeight} <span className="text-sm font-normal text-[#c6c9ab]">kg</span>
              </span>
            </div>
            
            <div className="flex flex-col">
              <span className="font-mono text-[11px] text-[#c6c9ab] uppercase tracking-wider mb-1">INICIAL</span>
              <span className="font-sans font-semibold text-2xl md:text-3xl text-white/95">
                {initialWeight} <span className="text-sm font-normal text-[#c6c9ab]">kg</span>
              </span>
            </div>

            <div className="flex flex-col items-end">
              <span className="font-mono text-[11px] text-[#c6c9ab] uppercase tracking-wider mb-1">DIF. TOTAL</span>
              <div className={`flex items-center gap-1 font-sans font-black text-2xl md:text-3xl ${difference <= 0 ? 'text-[#00eefc]' : 'text-red-400'}`}>
                <span className="material-symbols-outlined text-sm font-bold">
                  {difference <= 0 ? 'arrow_downward' : 'arrow_upward'}
                </span>
                <span>{diffSign} <span className="text-sm font-normal">kg</span></span>
              </div>
            </div>
          </div>

          {/* Core Weight Chart SVG */}
          <div className="w-full bg-[#1e1e1e] border border-white/7 rounded-lg p-3 relative overflow-hidden mb-5">
            <div className="absolute top-2 left-3 font-mono text-[10px] text-[#c6c9ab]/60 uppercase">Evolución de Peso (kg)</div>
            
            <div className="w-full overflow-x-auto hide-scrollbar">
              <svg width="100%" height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none" className="min-w-[450px]">
                {/* Horizontal Guide Lines */}
                {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
                  const y = verticalPadding + ratio * (chartHeight - verticalPadding * 2);
                  const wVal = (maxWeight - ratio * weightRange).toFixed(1);
                  return (
                    <g key={i}>
                      <line x1={horizontalPadding} y1={y} x2={chartWidth - horizontalPadding} y2={y} stroke="#2a2a2a" strokeDasharray="3,3" />
                      <text x={horizontalPadding - 8} y={y + 4} fill="#c6c9ab" fontSize="10" fontFamily="monospace" textAnchor="end">{wVal}</text>
                    </g>
                  );
                })}

                {/* Path representing weight flow */}
                {points.length > 1 && (
                  <>
                    {/* Fill Area Gradient */}
                    <defs>
                      <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#00eefc" stopOpacity="0.18" />
                        <stop offset="100%" stopColor="#00eefc" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>
                    <path
                      d={`${pathD} L ${points[points.length - 1].x} ${chartHeight - verticalPadding} L ${points[0].x} ${chartHeight - verticalPadding} Z`}
                      fill="url(#chartGradient)"
                    />
                    {/* Stroke line */}
                    <path
                      d={pathD}
                      fill="none"
                      stroke="#00eefc"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                  </>
                )}

                {/* Individual checkin points */}
                {points.map((p, i) => {
                  const isLast = i === points.length - 1;
                  return (
                    <g key={i}>
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r={isLast ? "5" : "4"}
                        fill={isLast ? "#fbcb1a" : "#00eefc"}
                        className={isLast ? "volt-glow" : ""}
                      />
                      <text x={p.x} y={p.y - 10} fill="#ffffff" fontSize="9" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
                        {p.item.weight}
                      </text>
                      <text x={p.x} y={chartHeight - 4} fill="#c6c9ab" fontSize="8" fontFamily="monospace" textAnchor="middle">
                        {p.item.dateStr}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          {/* Sub summary info */}
          <div className="flex justify-between items-center bg-[#1e1e1e] p-3 rounded-lg border border-white/7">
            <span className="font-sans text-xs text-[#c6c9ab]">Tendencia últimos 7 días</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-white text-sm font-semibold">{currentWeight} kg</span>
              <span className="text-[#00eefc] text-xs font-mono">
                ({difference <= 0 ? 'Progreso positivo' : 'Fase de volumen'})
              </span>
            </div>
          </div>
        </section>

        {/* Section B: New Check-in Form */}
        <section className="lg:col-span-4 bg-[#181816] border border-white/7 rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <h2 className="font-sans font-bold text-lg text-white mb-4 pb-2 border-b border-white/7 flex items-center gap-2">
              <span className="material-symbols-outlined text-[#fbcb1a]">edit_note</span>
              Nuevo Check-in
            </h2>
            
            <form onSubmit={handleSubmitCheckIn} className="space-y-4">
              <div>
                <label className="block font-mono text-[11px] text-[#c6c9ab] uppercase tracking-wider mb-2">Peso Actual (kg) *</label>
                <input 
                  type="number" 
                  step="0.1"
                  min="30"
                  max="250"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  placeholder="0.0"
                  className="w-full bg-[#1e1e1e] border-0 border-b border-white/7 text-white font-mono p-2.5 focus:ring-0 focus:border-[#fbcb1a] transition-colors"
                  required
                />
              </div>

              <div>
                <label className="block font-mono text-[11px] text-[#c6c9ab] uppercase tracking-wider mb-2">Estado de Ánimo</label>
                <div className="flex justify-between items-center bg-[#1e1e1e] p-2 rounded-lg border border-white/7 gap-1">
                  {['😩', '😴', '😐', '😊', '🔥'].map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setMood(emoji)}
                      className={`text-xl hover:scale-125 hover:rotate-6 transition-all duration-150 p-1.5 rounded-full ${mood === emoji ? 'bg-[#201f1f] ring-1 ring-[#fbcb1a] scale-110' : 'opacity-55'}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-mono text-[11px] text-[#c6c9ab] uppercase tracking-wider mb-2">Adherencia Nutricional</label>
                <div className="flex gap-2">
                  {(['Sí', 'Parcial', 'No'] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setAdherence(opt)}
                      className={`flex-1 py-2 font-sans text-xs rounded-lg border transition-all ${adherence === opt ? 'bg-[#fbcb1a] text-black font-bold border-transparent' : 'bg-[#1e1e1e] text-[#e5e2e1] border-white/7'}`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-mono text-[11px] text-[#c6c9ab] uppercase tracking-wider mb-2">Notas (Opcional)</label>
                <textarea 
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="¿Cómo te sentiste esta semana, dudas, dolores, fatiga?"
                  className="w-full bg-[#1e1e1e] border-0 border-b border-white/7 text-[#e5e2e1] text-xs p-2.5 focus:ring-0 focus:border-[#fbcb1a] transition-colors min-h-[75px]"
                ></textarea>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full h-[44px] bg-[#fbcb1a] text-black font-sans font-bold text-xs uppercase rounded-lg hover:bg-opacity-95 active:scale-95 transition-all w-full flex items-center justify-center gap-2"
              >
                {isSubmitting ? 'Enviando...' : 'Enviar al Entrenador'}
                <span className="material-symbols-outlined text-sm">send</span>
              </button>
            </form>
          </div>
        </section>

      </div>

      {/* Grid lower details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Section C: Gamification, Streak & Iron Calendar */}
        <section className="bg-[#181816] border border-white/7 rounded-2xl p-5 relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#fbcb1a]/5 blur-3xl rounded-full pointer-events-none"></div>
          
          <div>
            <div className="flex items-center gap-4 mb-5">
              <div className="w-16 h-16 rounded-full bg-[#1e1e1e] border-2 border-[#fbcb1a] overflow-hidden relative shadow-lg">
                <img 
                  alt="Athlete avatar" 
                  className="w-full h-full object-cover" 
                  src={profile.avatarUrl}
                />
                <div className="absolute bottom-0 right-0 bg-[#fbcb1a] text-black text-[10px] font-bold px-1 rounded-sm">L{profile.level}</div>
              </div>
              
              <div className="flex-1">
                <h3 className="font-sans font-bold text-lg text-white">Nivel {profile.level}: Élite</h3>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 h-2 bg-[#1e1e1e] rounded-full overflow-hidden">
                    <div className="h-full bg-[#00eefc]" style={{ width: `${(profile.xp / 400) * 100}%` }}></div>
                  </div>
                  <span className="font-mono text-[11px] text-[#c6c9ab]">{profile.xp}/400 XP</span>
                </div>
              </div>
            </div>

            {/* Streak metrics */}
            <div className="flex justify-between items-center bg-[#1e1e1e] p-4 rounded-lg border border-white/7 mb-5">
              <div className="flex items-center gap-3">
                <span className="text-3xl">🔥</span>
                <div className="flex flex-col">
                  <span className="font-mono text-[10px] text-[#c6c9ab] uppercase">Racha Actual</span>
                  <span className="font-sans font-bold text-lg text-white">{streakDays} Días</span>
                </div>
              </div>
              <div className="text-right flex flex-col">
                <span className="font-mono text-[10px] text-[#c6c9ab] uppercase">Racha Máxima</span>
                <span className="font-mono font-bold text-white text-sm">{maxStreakDays} Días</span>
              </div>
            </div>

            {/* Iron Calendar design */}
            <div className="mb-5">
              <span className="font-mono text-[10px] text-[#c6c9ab] uppercase block mb-3">Iron Calendar (Apego de entrenos)</span>
              <div className="grid grid-cols-7 gap-2">
                {Array.from({ length: 14 }).map((_, idx) => {
                  // highlight boxes in Volt if streak or arbitrary fitness progress is met
                  const isActive = idx < Math.min(14, streakDays % 14 || 6);
                  return (
                    <div 
                      key={idx} 
                      className={`aspect-square rounded border transition-all ${isActive ? 'bg-[#fbcb1a] border-transparent shadow-[0_0_6px_rgba(251,203,26,0.3)]' : 'bg-[#1e1e1e] border-white/7'}`}
                      title={isActive ? "Entrenamiento registrado" : "Próximo entreno"}
                    />
                  );
                })}
              </div>
            </div>
          </div>

          {/* Insignias unlocked */}
          <div>
            <span className="font-mono text-[10px] text-[#c6c9ab] uppercase block mb-3">Insignias Desbloqueadas</span>
            <div className="flex flex-wrap gap-2">
              <span className="px-3 py-1.5 bg-[#201f1f] text-white rounded-full text-xs border border-white/7 flex items-center gap-1.5">
                <span>🏅</span> Primera semana
              </span>
              <span className="px-3 py-1.5 bg-[#201f1f] text-white rounded-full text-xs border border-white/7 flex items-center gap-1.5">
                <span className="text-[#fbcb1a]">⚡</span> 10 días de racha
              </span>
              <span className="px-3 py-1.5 bg-[#201f1f] text-white rounded-full text-xs border border-white/7 flex items-center gap-1.5">
                <span className="text-[#00eefc]">⭐</span> Nivel {profile.level}
              </span>
            </div>
          </div>
        </section>

        {/* Section D: Historial weight & coach directives logs */}
        <section className="bg-[#181816] border border-white/7 rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <h2 className="font-sans font-bold text-lg text-white mb-4 pb-2 border-b border-white/7 flex items-center gap-2">
              <span className="material-symbols-outlined text-[#00eefc]">history</span>
              Historial de Revisiones
            </h2>

            <div className="flex flex-col gap-3 max-h-[360px] overflow-y-auto custom-scrollbar pr-1">
              {checkins.map((item) => (
                <div 
                  key={item.id} 
                  className={`bg-[#1e1e1e] border rounded-lg p-4 transition-all hover:bg-[#201f1f] ${item.approved ? 'border-[#00eefc]/30' : 'border-white/7'}`}
                >
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs text-[#c6c9ab]">{item.dateStr}</span>
                      <span className="font-mono font-bold text-white text-sm">{item.weight} kg</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-base">{item.mood}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded uppercase font-mono ${item.adherence === 'Sí' ? 'bg-[#fbcb1a]/10 text-[#fbcb1a]' : item.adherence === 'Parcial' ? 'bg-[#00eefc]/10 text-[#00eefc]' : 'bg-red-400/10 text-red-300'}`}>
                        {item.adherence}
                      </span>
                    </div>
                  </div>

                  {item.notes && (
                    <p className="text-xs text-[#c6c9ab] font-sans leading-relaxed mb-3 italic">
                      "{item.notes}"
                    </p>
                  )}

                  {/* Coach feedback loop displayed directly in notes checks! */}
                  {item.coachFeedback ? (
                    <div className="text-xs border-l-2 border-[#fbcb1a] pl-3 py-1 ml-1 bg-black/20 rounded-r p-2">
                      <span className="font-mono font-semibold text-[#fbcb1a] block mb-1">Nota del Entrenador:</span>
                      <p className="text-white leading-relaxed">{item.coachFeedback}</p>
                    </div>
                  ) : (
                    <div className="text-[11px] text-[#c6c9ab]/60 font-mono italic pl-1 flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs animate-spin text-[#fbcb1a]">sync</span>
                      Pendiente de revisión del Entrenador
                    </div>
                  )}
                </div>
              ))}
              
              {checkins.length === 0 && (
                <div className="text-[#c6c9ab] text-center italic py-12 text-sm">
                  Aún no posees ningún registro de peso. Registra tu primer check-in.
                </div>
              )}
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
