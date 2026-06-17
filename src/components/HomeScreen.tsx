import React from 'react';
import { UserProfile } from '../types';

interface HomeScreenProps {
  profile: UserProfile;
}

export default function HomeScreen({ profile }: HomeScreenProps) {
  const streakDays = profile.currentStreak;
  const maxStreakDays = profile.maxStreak;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-sans font-extrabold text-3xl tracking-tight text-white">Inicio</h1>
        <p className="text-[#c6c9ab] text-sm mt-1">Tu progreso gamificado, racha y logros desbloqueados.</p>
      </div>

      <div className="max-w-xl bg-[#121212] border border-[#2a2a2a] rounded-xl p-5 relative overflow-hidden flex flex-col gap-5">
        <div className="absolute top-0 right-0 w-32 h-32 bg-[#e2ff00]/5 blur-3xl rounded-full pointer-events-none"></div>

        {/* Avatar + XP */}
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-[#1e1e1e] border-2 border-[#e2ff00] overflow-hidden relative shadow-lg">
            <img alt="Avatar" className="w-full h-full object-cover" src={profile.avatarUrl} />
            <div className="absolute bottom-0 right-0 bg-[#e2ff00] text-black text-[10px] font-bold px-1 rounded-sm">L{profile.level}</div>
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

        {/* Streak */}
        <div className="flex justify-between items-center bg-[#1e1e1e] p-4 rounded-lg border border-[#2a2a2a]">
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

        {/* Iron Calendar */}
        <div>
          <span className="font-mono text-[10px] text-[#c6c9ab] uppercase block mb-3">Iron Calendar (Apego de entrenos)</span>
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: 14 }).map((_, idx) => {
              const isActive = idx < Math.min(14, streakDays % 14 || 6);
              return (
                <div
                  key={idx}
                  className={`aspect-square rounded border transition-all ${isActive ? 'bg-[#e2ff00] border-transparent shadow-[0_0_6px_rgba(226,255,0,0.3)]' : 'bg-[#1e1e1e] border-[#2a2a2a]'}`}
                  title={isActive ? 'Entrenamiento registrado' : 'Próximo entreno'}
                />
              );
            })}
          </div>
        </div>

        {/* Badges */}
        <div>
          <span className="font-mono text-[10px] text-[#c6c9ab] uppercase block mb-3">Insignias Desbloqueadas</span>
          <div className="flex flex-wrap gap-2">
            <span className="px-3 py-1.5 bg-[#201f1f] text-white rounded-full text-xs border border-[#2a2a2a] flex items-center gap-1.5">
              <span>🏅</span> Primera semana
            </span>
            <span className="px-3 py-1.5 bg-[#201f1f] text-white rounded-full text-xs border border-[#2a2a2a] flex items-center gap-1.5">
              <span className="text-[#e2ff00]">⚡</span> 10 días de racha
            </span>
            <span className="px-3 py-1.5 bg-[#201f1f] text-white rounded-full text-xs border border-[#2a2a2a] flex items-center gap-1.5">
              <span className="text-[#00eefc]">⭐</span> Nivel {profile.level}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
