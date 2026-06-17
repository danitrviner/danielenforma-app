import React, { useState } from 'react';
import { UserProfile, WeightCheckIn } from '../types';
import { addWeightCheckIn } from '../dbService';

interface CheckInScreenProps {
  profile: UserProfile;
  onCheckInAdded: (newCheckIn: WeightCheckIn) => void;
  onRefreshProfile: () => void;
}

export default function CheckInScreen({ profile, onCheckInAdded, onRefreshProfile }: CheckInScreenProps) {
  const [weight, setWeight] = useState('');
  const [mood, setMood] = useState('🔥');
  const [adherence, setAdherence] = useState<'Sí' | 'Parcial' | 'No'>('Sí');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

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
      setSuccessMsg('¡Check-in enviado al entrenador! Has sumado +50 XP y extendido tu racha.');
      setWeight('');
      setNotes('');
      setTimeout(() => onRefreshProfile(), 500);
    } catch (err: any) {
      console.error(err);
      setErrorMsg('Error de conexión o permisos insuficientes.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-sans font-extrabold text-3xl tracking-tight text-white">Check-in Semanal</h1>
        <p className="text-[#c6c9ab] text-sm mt-1">Registra tu peso, estado de ánimo y adherencia de la semana.</p>
      </div>

      {successMsg && (
        <div className="bg-[#e2ff00]/10 border border-[#e2ff00]/30 text-white p-4 rounded-lg text-sm flex items-center gap-3 animate-bounce">
          <span className="material-symbols-outlined text-[#e2ff00]">energy_savings_leaf</span>
          <p className="font-bold">{successMsg}</p>
        </div>
      )}
      {errorMsg && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-200 p-4 rounded-lg text-sm">
          {errorMsg}
        </div>
      )}

      <div className="max-w-lg bg-[#121212] border border-[#2a2a2a] rounded-xl p-6">
        <h2 className="font-sans font-bold text-lg text-white mb-6 pb-2 border-b border-[#2a2a2a] flex items-center gap-2">
          <span className="material-symbols-outlined text-[#e2ff00]">edit_note</span>
          Nuevo Check-in
        </h2>

        <form onSubmit={handleSubmitCheckIn} className="space-y-5">
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
              className="w-full bg-[#1e1e1e] border-0 border-b border-[#2a2a2a] text-white font-mono p-2.5 focus:ring-0 focus:border-[#e2ff00] transition-colors"
              required
            />
          </div>

          <div>
            <label className="block font-mono text-[11px] text-[#c6c9ab] uppercase tracking-wider mb-2">Estado de Ánimo</label>
            <div className="flex justify-between items-center bg-[#1e1e1e] p-2 rounded-lg border border-[#2a2a2a] gap-1">
              {['😩', '😴', '😐', '😊', '🔥'].map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setMood(emoji)}
                  className={`text-xl hover:scale-125 hover:rotate-6 transition-all duration-150 p-1.5 rounded-full ${mood === emoji ? 'bg-[#201f1f] ring-1 ring-[#e2ff00] scale-110' : 'opacity-55'}`}
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
                  className={`flex-1 py-2 font-mono text-xs rounded-lg border transition-all ${adherence === opt ? 'bg-[#e2ff00] text-black font-bold border-transparent' : 'bg-[#1e1e1e] text-[#e5e2e1] border-[#2a2a2a]'}`}
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
              className="w-full bg-[#1e1e1e] border-0 border-b border-[#2a2a2a] text-[#e5e2e1] text-xs p-2.5 focus:ring-0 focus:border-[#e2ff00] transition-colors min-h-[80px]"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full h-[44px] bg-[#e2ff00] text-black font-mono font-bold text-xs uppercase rounded-lg hover:bg-opacity-95 active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            {isSubmitting ? 'Enviando...' : 'Enviar al Entrenador'}
            <span className="material-symbols-outlined text-sm">send</span>
          </button>
        </form>
      </div>
    </div>
  );
}
