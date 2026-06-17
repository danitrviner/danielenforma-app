import React, { useState } from 'react';
import { UserProfile } from '../types';
import { updateUserProfile } from '../dbService';
import { signOut, auth } from '../firebase';

interface ProfileScreenProps {
  profile: UserProfile;
  onRefreshProfile: () => void;
  onLogOut: () => void;
  onToggleRole?: () => void;
}

export default function ProfileScreen({ profile, onRefreshProfile, onLogOut, onToggleRole }: ProfileScreenProps) {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [targetWeight, setTargetWeight] = useState(profile.targetWeight.toString());
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  
  const handleSignOut = async () => {
    try {
      await signOut(auth);
      onLogOut();
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName) return;

    setLoading(true);
    setSuccess('');
    try {
      await updateUserProfile(profile.userId, {
        displayName,
        targetWeight: parseFloat(targetWeight) || profile.targetWeight,
        avatarUrl
      });
      setSuccess('¡Perfil atleta actualizado correctamente!');
      onRefreshProfile();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h1 className="font-sans font-extrabold text-3xl tracking-tight text-white">Mi Perfil</h1>
        <p className="text-[#c6c9ab] text-sm mt-1">Configura tus credenciales del sistema, avatar, metas personales e insignias En Forma.</p>
      </div>

      {success && (
        <div className="bg-[#e2ff00]/10 border border-[#e2ff00]/30 text-white p-3.5 rounded-lg text-xs font-bold text-center">
          {success}
        </div>
      )}

      {/* Main card details */}
      <div className="bg-[#121212] border border-[#2a2a2a] p-6 rounded-xl flex flex-col items-center text-center space-y-4">
        <div className="w-20 h-20 rounded-full border-2 border-[#e2ff00] overflow-hidden relative shadow-lg">
          <img src={profile.avatarUrl} alt="Avatar profile" className="w-full h-full object-cover" />
          <div className="absolute bottom-0 right-0 bg-[#e2ff00] text-black text-[10px] font-bold px-1.5 py-0.5 rounded-full">Lv {profile.level}</div>
        </div>

        <div>
          <h2 className="font-sans font-black text-xl text-white">{profile.displayName}</h2>
          <span className="font-mono text-[10px] text-[#c6c9ab] uppercase tracking-widest">{profile.email}</span>
        </div>

        {/* Level details metrics */}
        <div className="grid grid-cols-3 gap-3 w-full bg-[#1c1b1b] p-3 rounded-lg border border-[#2a2a2a] text-center font-mono">
          <div>
            <span className="block text-[9px] text-[#c6c9ab] uppercase">Racha</span>
            <span className="block text-sm font-bold text-white mt-0.5">{profile.currentStreak} días</span>
          </div>
          <div>
            <span className="block text-[9px] text-[#c6c9ab] uppercase">Nivel Atleta</span>
            <span className="block text-sm font-bold text-[#e2ff00] mt-0.5">{profile.level} (Élite)</span>
          </div>
          <div>
            <span className="block text-[9px] text-[#c6c9ab] uppercase">Meta Peso</span>
            <span className="block text-sm font-bold text-[#00eefc] mt-0.5">{profile.targetWeight} kg</span>
          </div>
        </div>
      </div>

      {/* Role Switching Interactive Block */}
      {onToggleRole && (
        <div className="bg-[#121212] border border-teal-500/25 p-5 rounded-xl space-y-4 shadow-md">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#e2ff00]">shield_person</span>
            <h3 className="font-sans font-bold text-sm text-white uppercase tracking-wider">Selector de Rol Activo</h3>
          </div>
          
          <p className="text-xs text-[#c6c9ab] leading-relaxed">
            Puedes alternar libremente tu rol para probar ambas puntas de la aplicación: el panel del Entrenador (Módulo CRM) o el panel del Atleta.
          </p>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => profile.role !== 'client' && onToggleRole()}
              className={`flex-1 py-3 px-4 rounded-lg font-sans text-xs uppercase tracking-wider font-extrabold transition-all border flex items-center justify-center gap-2 ${
                profile.role === 'client'
                  ? 'bg-[#e2ff00] text-black border-[#e2ff00] shadow-[0_0_12px_rgba(226,255,0,0.15)] pointer-events-none'
                  : 'bg-[#1c1b1b] text-slate-300 border-[#2a2a2a] hover:border-slate-500 hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-sm">fitness_center</span>
              <span>Rol: Atleta</span>
            </button>

            <button
              type="button"
              onClick={() => profile.role !== 'coach' && onToggleRole()}
              className={`flex-1 py-3 px-4 rounded-lg font-sans text-xs uppercase tracking-wider font-extrabold transition-all border flex items-center justify-center gap-2 ${
                profile.role === 'coach'
                  ? 'bg-[#e2ff00] text-black border-[#e2ff00] shadow-[0_0_12px_rgba(226,255,0,0.15)] pointer-events-none'
                  : 'bg-[#1c1b1b] text-slate-300 border-[#2a2a2a] hover:border-slate-500 hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-sm">assignment_ind</span>
              <span>Rol: Entrenador</span>
            </button>
          </div>
          
          <div className="text-[10px] text-center font-mono text-[#c6c9ab] uppercase bg-[#1c1b1b] py-1 border border-[#2a2a2a] rounded">
            Rol actual registrado: <strong className="text-white">{profile.role === 'coach' ? 'ENTRENADOR (COACH)' : 'ATLETA / CLIENTE'}</strong>
          </div>
        </div>
      )}

      {/* Form editing updates */}
      <form onSubmit={handleUpdate} className="bg-[#121212] border border-[#2a2a2a] p-4 rounded-xl space-y-4">
        <h3 className="font-sans font-bold text-sm text-[#e2ff00] uppercase tracking-wide border-b border-[#2a2a2a] pb-2">Editar Marca de Ficha</h3>

        <div>
          <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase mb-1">Nombre deportivo</label>
          <input 
            type="text" 
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full bg-[#1c1b1b] border border-[#2a2a2a] rounded p-2.5 text-xs text-white focus:outline-none focus:border-[#e2ff00]"
            required
          />
        </div>

        <div>
          <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase mb-1">Meta de Peso Personal (kg)</label>
          <input 
            type="number" 
            step="0.1"
            value={targetWeight}
            onChange={(e) => setTargetWeight(e.target.value)}
            className="w-full bg-[#1c1b1b] border border-[#2a2a2a] rounded p-2.5 text-xs text-white focus:outline-none focus:border-[#e2ff00]"
          />
        </div>

        <div>
          <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase mb-1">Avatar Imagen URL</label>
          <input 
            type="url" 
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            className="w-full bg-[#1c1b1b] border border-[#2a2a2a] rounded p-2.5 text-xs text-mono text-white focus:outline-none focus:border-[#e2ff00]"
          />
        </div>

        <button 
          type="submit" 
          disabled={loading}
          className="w-full py-2.5 bg-white hover:bg-opacity-95 text-black font-semibold text-xs font-mono rounded uppercase tracking-wider transition-colors active:scale-95"
        >
          {loading ? 'Sincronizando...' : 'Guardar Cambios Deportivos'}
        </button>
      </form>

      {/* Log out options CTA */}
      <div className="pt-2">
        <button
          onClick={handleSignOut}
          className="w-full py-3 bg-red-500/10 hover:bg-red-500/15 border border-red-500/35 text-red-200 text-xs font-mono font-bold tracking-widest uppercase rounded flex items-center justify-center gap-2 active:scale-95 transition-all"
        >
          <span className="material-symbols-outlined text-sm">logout</span>
          Cerrar Sesión Activa
        </button>
      </div>
    </div>
  );
}
