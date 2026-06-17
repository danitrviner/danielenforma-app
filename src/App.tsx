import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, auth } from './firebase';
import { UserProfile, WeightCheckIn } from './types';
import { getOrCreateUserProfile, getCheckIns, seedInitialCheckinsIfEmpty, updateUserProfile } from './dbService';

// Import Screens
import WelcomeScreen from './components/WelcomeScreen';
import MetricsScreen from './components/MetricsScreen';
import NutritionScreen from './components/NutritionScreen';
import RecipesScreen from './components/RecipesScreen';
import CoachScreen from './components/CoachScreen';
import ProfileScreen from './components/ProfileScreen';

type NavTab = 'workout' | 'nutrition' | 'recipes' | 'coach' | 'profile';

export default function App() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [checkins, setCheckins] = useState<WeightCheckIn[]>([]);
  const [activeTab, setActiveTab] = useState<NavTab>('workout');
  const [loading, setLoading] = useState(true);

  const loadUserSession = async (user: any) => {
    const userProfile = await getOrCreateUserProfile(user.uid, user.email || 'atleta@enforma.com', user.displayName || '');
    setProfile(userProfile);
    setActiveTab(userProfile.role === 'coach' ? 'coach' : 'workout');
    await seedInitialCheckinsIfEmpty(user.uid, user.email || 'atleta@enforma.com');
    const checks = await getCheckIns();
    setCheckins(checks);
  };

  // Subscribe once on mount — handles session restore when the page reloads with an
  // existing Firebase session. Does NOT re-run on manual logins (those go through
  // handleLoginSuccess directly, avoiding a Firebase null response wiping mock users).
  useEffect(() => {
    const safetyTimeout = setTimeout(() => setLoading(false), 8000);

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      clearTimeout(safetyTimeout);
      try {
        if (user) {
          setCurrentUser(user);
          await loadUserSession(user);
        } else {
          setCurrentUser(null);
          setProfile(null);
          setCheckins([]);
        }
      } catch (err) {
        console.error('Error restoring session:', err);
        setCurrentUser(null);
        setProfile(null);
      } finally {
        setLoading(false);
      }
    });

    return () => {
      clearTimeout(safetyTimeout);
      unsubscribe();
    };
  }, []);

  // Handle refresh of checks & profile state on triggers
  const handleRefreshData = async () => {
    if (currentUser) {
      try {
        const userProfile = await getOrCreateUserProfile(currentUser.uid, currentUser.email || 'atleta@enforma.com');
        setProfile(userProfile);
        const checks = await getCheckIns();
        setCheckins(checks);
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleLoginSuccess = async (user: any) => {
    setLoading(true);
    setCurrentUser(user);
    try {
      await loadUserSession(user);
    } catch (err) {
      console.error('Error loading profile after login:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleNewCheckInAdded = (newCheckIn: WeightCheckIn) => {
    setCheckins(prev => [newCheckIn, ...prev]);
    handleRefreshData();
  };

  const handleToggleUserRole = async () => {
    if (!profile) return;
    const nextRole = profile.role === 'client' ? 'coach' : 'client';
    try {
      await updateUserProfile(profile.userId, { role: nextRole });
      setProfile(prev => prev ? { ...prev, role: nextRole } : null);
      if (nextRole === 'coach') {
        setActiveTab('coach');
      } else {
        setActiveTab('workout');
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0e0e0e] flex items-center justify-center flex-col gap-4">
        <div className="flex items-center gap-2 text-[#e2ff00] animate-pulse">
          <span className="material-symbols-outlined text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>
          <span className="font-sans font-black text-3xl tracking-tighter uppercase text-[#e2ff00]">EN FORMA</span>
        </div>
        <p className="font-mono text-xs text-[#c6c9ab] uppercase tracking-widest animate-pulse">Sincronizando portal deportista...</p>
      </div>
    );
  }

  if (!currentUser || !profile) {
    return <WelcomeScreen onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen text-[#e5e2e1] bg-[#131313] flex flex-col md:flex-row pb-24 md:pb-0">
      
      {/* TOP DESKTOP HEADER (Static title banner) */}
      <header className="hidden md:flex justify-between items-center w-full px-8 py-5 bg-[#131313] fixed top-0 left-0 border-b border-[#2a2a2a] z-40 fixed full-width">
        <div className="flex items-center gap-2 text-[#e2ff00]">
          <span className="material-symbols-outlined font-bold" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>
          <span className="font-sans font-black text-xl tracking-tighter uppercase select-none">EN FORMA</span>
          <span className="text-[10px] bg-[#1c1b1b] border border-[#2a2a2a] text-[#c6c9ab] px-2 py-0.5 rounded font-mono uppercase ml-2 select-none">
            {profile.role.toUpperCase()} MODE
          </span>
        </div>
        
        <div className="flex items-center gap-6">
          {/* Quick interactive switcher badge */}
          <button 
            onClick={handleToggleUserRole}
            className="text-xs font-mono text-[#c6c9ab] hover:text-[#e2ff00] transition-colors bg-[#1c1b1b] border border-[#2a2a2a] px-3.5 py-1.5 rounded-full flex items-center gap-1.5 active:scale-95"
          >
            <span className="material-symbols-outlined text-xs">sync_alt</span>
            Presenciar como {profile.role === 'client' ? 'Entrenador' : 'Atleta'}
          </button>

          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[#e2ff00] cursor-pointer hover:opacity-80 transition-opacity">notifications</span>
            <span className="w-px h-6 bg-[#2a2a2a]"></span>
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => setActiveTab('profile')}>
              <img src={profile.avatarUrl} alt="Avatar user" className="w-7 h-7 rounded-full object-cover border border-[#e2ff00]/40" />
              <span className="text-xs font-mono font-medium text-white">{profile.displayName}</span>
            </div>
          </div>
        </div>
      </header>

      {/* MOBILE APPLICATION HEADER */}
      <header className="md:hidden flex justify-between items-center w-full px-4 py-4 bg-[#131313] border-b border-[#2a2a2a] sticky top-0 z-40">
        <div className="flex items-center gap-2 text-[#e2ff00]" onClick={() => handleToggleUserRole()} title="Presenciar como otro rol">
          <span className="material-symbols-outlined font-bold" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>
          <span className="font-sans font-black text-lg tracking-tighter uppercase">EN FORMA</span>
          <span className="text-[8px] bg-[#2a2a2a] text-[#c6c9ab] px-1.5 py-0.5 rounded font-bold uppercase select-none">
            {profile.role[0].toUpperCase()}
          </span>
        </div>
        
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[#e2ff00]">notifications</span>
          <div className="w-6 h-6 rounded-full overflow-hidden border border-[#e2ff00]/40" onClick={() => setActiveTab('profile')}>
            <img src={profile.avatarUrl} alt="Avatar small" className="w-full h-full object-cover" />
          </div>
        </div>
      </header>

      {/* PERSISTENT SIDE NAVIGATION BAR (Desktop Only) */}
      <nav className="hidden md:flex flex-col w-[280px] bg-[#0c0f0f] h-screen fixed left-0 top-[65px] border-r border-[#2a2a2a] p-6 justify-between select-none">
        <div className="flex flex-col gap-3">
          
          <button 
            onClick={() => setActiveTab('workout')}
            className={`flex items-center gap-3.5 p-3.5 rounded-xl transition-all text-left group ${activeTab === 'workout' ? 'bg-[#e2ff00] text-black font-bold shadow-md' : 'text-[#c6c9ab] hover:bg-[#1a1c1c] hover:text-white'}`}
          >
            <span className="material-symbols-outlined group-hover:scale-110 transition-transform">fitness_center</span>
            <span className="font-sans text-xs uppercase tracking-wider font-mono">Progreso Peso</span>
          </button>

          <button 
            onClick={() => setActiveTab('nutrition')}
            className={`flex items-center gap-3.5 p-3.5 rounded-xl transition-all text-left group ${activeTab === 'nutrition' ? 'bg-[#e2ff00] text-black font-bold shadow-md' : 'text-[#c6c9ab] hover:bg-[#1a1c1c] hover:text-white'}`}
          >
            <span className="material-symbols-outlined group-hover:scale-110 transition-transform">restaurant</span>
            <span className="font-sans text-xs uppercase tracking-wider font-mono font-bold">Intercambios Nut</span>
          </button>

          <button 
            onClick={() => setActiveTab('recipes')}
            className={`flex items-center gap-3.5 p-3.5 rounded-xl transition-all text-left group ${activeTab === 'recipes' ? 'bg-[#e2ff00] text-black font-bold shadow-md' : 'text-[#c6c9ab] hover:bg-[#1a1c1c] hover:text-white'}`}
          >
            <span className="material-symbols-outlined group-hover:scale-110 transition-transform">menu_book</span>
            <span className="font-sans text-xs uppercase tracking-wider font-mono">Explorar Recetas</span>
          </button>

          <button 
            onClick={() => setActiveTab('coach')}
            className={`flex items-center gap-3.5 p-3.5 rounded-xl transition-all text-left group ${activeTab === 'coach' ? 'bg-[#e2ff00] text-black font-bold shadow-md' : 'text-[#c6c9ab] hover:bg-[#1a1c1c] hover:text-white'}`}
          >
            <span className="material-symbols-outlined group-hover:scale-110 transition-transform" style={{ fontVariationSettings: activeTab === 'coach' ? "'FILL' 1" : "'FILL' 0" }}>assignment_ind</span>
            <span className="font-sans text-xs uppercase tracking-wider font-mono flex items-center justify-between w-full">
              <span>Módulo Coach (CRM)</span>
              <span className="w-1.5 h-1.5 rounded-full bg-[#00eefc] animate-pulse"></span>
            </span>
          </button>

        </div>

        <div className="flex flex-col gap-2">
          {/* Quick exit settings */}
          <button 
            onClick={() => setActiveTab('profile')}
            className={`flex items-center gap-4 p-3 rounded-lg text-left ${activeTab === 'profile' ? 'text-[#e2ff00]' : 'text-[#c6c9ab] hover:text-white'}`}
          >
            <span className="material-symbols-outlined">person</span>
            <span className="font-mono text-xs uppercase tracking-wider">Mi Perfil Atleta</span>
          </button>
        </div>
      </nav>

      {/* CORE APPLICATION CANVAS LAYOUT */}
      <main className="flex-1 mt-0 md:mt-[65px] md:ml-[280px] p-4 md:p-8 max-w-7xl mx-auto w-full transition-all">
        {activeTab === 'workout' && (
          <MetricsScreen 
            profile={profile} 
            checkins={checkins} 
            onCheckInAdded={handleNewCheckInAdded} 
            onRefreshProfile={handleRefreshData}
          />
        )}
        
        {activeTab === 'nutrition' && (
          <NutritionScreen profile={profile} />
        )}

        {activeTab === 'recipes' && (
          <RecipesScreen profile={profile} />
        )}

        {activeTab === 'coach' && (
          <CoachScreen 
            checkins={checkins} 
            onRefreshCheckIns={handleRefreshData}
          />
        )}

        {activeTab === 'profile' && (
          <ProfileScreen 
            profile={profile} 
            onRefreshProfile={handleRefreshData}
            onLogOut={() => setCurrentUser(null)}
            onToggleRole={handleToggleUserRole}
          />
        )}
      </main>

      {/* MOBILE APPLICATION BOTTOM NAVIGATION TABS */}
      <nav className="md:hidden fixed bottom-0 w-full z-50 flex justify-around items-center px-2 pb-5 pt-2.5 bg-[#0e0e0e] border-t border-[#2a2a2a] select-none shadow-2xl">
        <button 
          onClick={() => setActiveTab('workout')}
          className={`flex flex-col items-center justify-center p-2 rounded-xl w-14 transition-all ${activeTab === 'workout' ? 'text-[#e2ff00]' : 'text-[#c6c9ab]'}`}
        >
          <span className="material-symbols-outlined mb-0.5">fitness_center</span>
          <span className="font-mono text-[9px] uppercase tracking-wider font-bold">Pesos</span>
        </button>

        <button 
          onClick={() => setActiveTab('nutrition')}
          className={`flex flex-col items-center justify-center p-2 rounded-xl w-14 transition-all ${activeTab === 'nutrition' ? 'text-[#e2ff00]' : 'text-[#c6c9ab]'}`}
        >
          <span className="material-symbols-outlined mb-0.5">restaurant</span>
          <span className="font-mono text-[9px] uppercase tracking-wider font-bold">Comidas</span>
        </button>

        <button 
          onClick={() => setActiveTab('recipes')}
          className={`flex flex-col items-center justify-center p-2 rounded-xl w-14 transition-all ${activeTab === 'recipes' ? 'text-[#e2ff00]' : 'text-[#c6c9ab]'}`}
        >
          <span className="material-symbols-outlined mb-0.5">menu_book</span>
          <span className="font-mono text-[9px] uppercase tracking-wider font-bold">Recetas</span>
        </button>

        <button 
          onClick={() => setActiveTab('coach')}
          className={`flex flex-col items-center justify-center p-2 rounded-xl w-14 transition-all relative ${activeTab === 'coach' ? 'text-[#e2ff00]' : 'text-[#c6c9ab]'}`}
        >
          <span className="material-symbols-outlined mb-0.5" style={{ fontVariationSettings: activeTab === 'coach' ? "'FILL' 1" : "'FILL' 0" }}>assignment_ind</span>
          <span className="font-mono text-[9px] uppercase tracking-wider font-bold">CRM</span>
          <span className="absolute top-1 right-2 w-1.5 h-1.5 rounded-full bg-[#00eefc]"></span>
        </button>

        <button 
          onClick={() => setActiveTab('profile')}
          className={`flex flex-col items-center justify-center p-2 rounded-xl w-14 transition-all ${activeTab === 'profile' ? 'text-[#e2ff00]' : 'text-[#c6c9ab]'}`}
        >
          <span className="material-symbols-outlined mb-0.5">person</span>
          <span className="font-mono text-[9px] uppercase tracking-wider font-bold">Perfil</span>
        </button>
      </nav>

    </div>
  );
}
