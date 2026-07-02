import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, getRedirectResult, auth } from './firebase';
import { UserProfile, WeightCheckIn } from './types';
import { getOrCreateUserProfile, getCheckIns, seedInitialCheckinsIfEmpty, cleanupTestDataOnce } from './dbService';
import NotificationBell from './components/NotificationBell';

import WelcomeScreen from './components/WelcomeScreen';
import ProfileScreen from './components/ProfileScreen';

// Athlete screens
import HomeScreen from './components/HomeScreen';
import TrainingScreen from './components/TrainingScreen';
import NutritionHubScreen from './components/NutritionHubScreen';
import CheckInScreen from './components/CheckInScreen';

// Shared screens
import AthleteRoadmapScreen from './components/AthleteRoadmapScreen';

// Coach screens
import ClientsScreen from './components/ClientsScreen';
import ReviewsScreen from './components/ReviewsScreen';
import TrainingCoachScreen from './components/TrainingCoachScreen';
import NutritionCoachScreen from './components/NutritionCoachScreen';
import CoachesScreen from './components/CoachesScreen';

const OWNER_EMAIL = 'danitrviner@gmail.com';

type NavTab = 'home' | 'training' | 'nutrition' | 'checkin' | 'roadmap' | 'clients' | 'reviews' | 'settings' | 'profile';

const ATHLETE_TABS: { id: NavTab; label: string; shortLabel: string; icon: string }[] = [
  { id: 'home',      label: 'Inicio',        shortLabel: 'Inicio',   icon: 'bolt' },
  { id: 'training',  label: 'Entrenamiento', shortLabel: 'Entreno',  icon: 'fitness_center' },
  { id: 'nutrition', label: 'Nutrición',     shortLabel: 'Nutri.',   icon: 'restaurant' },
  { id: 'checkin',   label: 'Check-in',      shortLabel: 'Check-in', icon: 'edit_note' },
  { id: 'roadmap',   label: 'Road map',      shortLabel: 'Mapa',     icon: 'map' },
];

const COACH_TABS: { id: NavTab; label: string; shortLabel?: string; icon: string }[] = [
  { id: 'clients',   label: 'Clientes',   icon: 'group'           },
  { id: 'reviews',   label: 'Revisiones', shortLabel: 'Revisar',   icon: 'pending_actions' },
  { id: 'training',  label: 'Ejercicios', shortLabel: 'Ejercs.',   icon: 'fitness_center'  },
  { id: 'nutrition', label: 'Nutrición',  shortLabel: 'Nutri.',    icon: 'restaurant'      },
  { id: 'settings',  label: 'Ajustes',    icon: 'settings'        },
];

export default function App() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [checkins, setCheckins] = useState<WeightCheckIn[]>([]);
  const [activeTab, setActiveTab] = useState<NavTab>('home');
  const [loading, setLoading] = useState(true);
  const loadUserSession = async (user: any) => {
    const userProfile = await getOrCreateUserProfile(user.uid, user.email || 'atleta@enforma.com', user.displayName || '');
    const isOwner = (user.email || '').toLowerCase() === OWNER_EMAIL;
    const coachRole = userProfile.role === 'coach' || isOwner;
    setProfile(userProfile);
    setActiveTab(coachRole ? 'clients' : 'home');
    await seedInitialCheckinsIfEmpty(user.uid, user.email || 'atleta@enforma.com');
    // Coach reads all check-ins (no userId filter); athlete reads only their own
    const checks = await getCheckIns(coachRole ? undefined : user.uid);
    setCheckins(checks);
    // One-time ZZ_TEST cleanup only for coaches (reads full collections)
    if (coachRole) cleanupTestDataOnce().catch(console.warn);
  };

  // One-time cleanup runs only for coaches (reads full collections; athletes lack permission)
  // Called inside loadUserSession after role is known

  // Subscribe once on mount — handles session restore when the page reloads with an
  // existing Firebase session. Does NOT re-run on manual logins (those go through
  // handleLoginSuccess directly, avoiding a Firebase null response wiping mock users).
  useEffect(() => {
    const safetyTimeout = setTimeout(() => setLoading(false), 8000);
    // Track whether the redirect path already loaded the session, so
    // onAuthStateChanged doesn't call loadUserSession a second time.
    let sessionLoaded = false;

    // Resolve any pending Google redirect before subscribing to auth state.
    // onAuthStateChanged fires AFTER Firebase processes the redirect, so this
    // call completes first and sets sessionLoaded, preventing a double-load.
    getRedirectResult(auth)
      .then(async result => {
        if (result?.user) {
          clearTimeout(safetyTimeout);
          sessionLoaded = true;
          setCurrentUser(result.user);
          await loadUserSession(result.user);
          setLoading(false);
        }
      })
      .catch(err => {
        console.error('getRedirectResult error:', err);
      });

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (sessionLoaded) return; // already handled by getRedirectResult
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

  const handleRefreshData = async () => {
    if (currentUser) {
      try {
        const userProfile = await getOrCreateUserProfile(currentUser.uid, currentUser.email || 'atleta@enforma.com', currentUser.displayName || '');
        setProfile(userProfile);
        const isOwner = (currentUser.email || '').toLowerCase() === OWNER_EMAIL;
        const coachRole = userProfile.role === 'coach' || isOwner;
        const checks = await getCheckIns(coachRole ? undefined : currentUser.uid);
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

  const isCoach = profile.role === 'coach' || profile.email.toLowerCase() === OWNER_EMAIL;
  const mainTabs = isCoach ? COACH_TABS : ATHLETE_TABS;
  const pendingCount = checkins.filter(c => !c.approved || !c.coachFeedback).length;

  return (
    <div className="min-h-screen text-[#e5e2e1] bg-[#131313] flex flex-col md:flex-row pb-24 md:pb-0">

      {/* TOP DESKTOP HEADER */}
      <header className="hidden md:flex justify-between items-center w-full px-8 py-5 bg-[#131313] fixed top-0 left-0 border-b border-[#2a2a2a] z-40">
        <div className="flex items-center gap-2 text-[#e2ff00]">
          <span className="material-symbols-outlined font-bold" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>
          <span className="font-sans font-black text-xl tracking-tighter uppercase select-none">EN FORMA</span>
          <span className="text-[10px] bg-[#1c1b1b] border border-[#2a2a2a] text-[#c6c9ab] px-2 py-0.5 rounded font-mono uppercase ml-2 select-none">
            {profile.role.toUpperCase()} MODE
          </span>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <NotificationBell recipientEmail={profile.email} onNavigate={setActiveTab} />
            <span className="w-px h-6 bg-[#2a2a2a]"></span>
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => setActiveTab('profile')}>
              <img src={profile.avatarUrl} alt="Avatar" className="w-7 h-7 rounded-full object-cover border border-[#e2ff00]/40" />
              <span className="text-xs font-mono font-medium text-white">{profile.displayName}</span>
            </div>
          </div>
        </div>
      </header>

      {/* MOBILE HEADER */}
      <header className="md:hidden flex justify-between items-center w-full px-4 py-4 bg-[#131313] border-b border-[#2a2a2a] sticky top-0 z-40">
        <div className="flex items-center gap-2 text-[#e2ff00]">
          <span className="material-symbols-outlined font-bold" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>
          <span className="font-sans font-black text-lg tracking-tighter uppercase">EN FORMA</span>
          <span className="text-[8px] bg-[#2a2a2a] text-[#c6c9ab] px-1.5 py-0.5 rounded font-bold uppercase select-none">
            {isCoach ? 'C' : 'A'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <NotificationBell recipientEmail={profile.email} onNavigate={setActiveTab} />
          <div className="w-6 h-6 rounded-full overflow-hidden border border-[#e2ff00]/40" onClick={() => setActiveTab('profile')}>
            <img src={profile.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
          </div>
        </div>
      </header>

      {/* DESKTOP SIDEBAR */}
      <nav className="hidden md:flex flex-col w-[280px] bg-[#0c0f0f] h-screen fixed left-0 top-[65px] border-r border-[#2a2a2a] p-6 justify-between select-none">
        <div className="flex flex-col gap-3">
          {mainTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-3.5 p-3.5 rounded-xl transition-all text-left group ${activeTab === tab.id ? 'bg-[#e2ff00] text-black font-bold shadow-md' : 'text-[#c6c9ab] hover:bg-[#1a1c1c] hover:text-white'}`}
            >
              <span
                className="material-symbols-outlined group-hover:scale-110 transition-transform"
                style={{ fontVariationSettings: activeTab === tab.id ? "'FILL' 1" : "'FILL' 0" }}
              >
                {tab.icon}
              </span>
              <span className="font-sans text-xs uppercase tracking-wider font-mono flex-1">{tab.label}</span>
              {tab.id === 'reviews' && pendingCount > 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#00eefc] animate-pulse"></span>
              )}
            </button>
          ))}
        </div>
        {isCoach && (
          <button
            onClick={() => setActiveTab('profile')}
            className={`flex items-center gap-4 p-3 rounded-lg text-left ${activeTab === 'profile' ? 'text-[#e2ff00]' : 'text-[#c6c9ab] hover:text-white'}`}
          >
            <span className="material-symbols-outlined">person</span>
            <span className="font-mono text-xs uppercase tracking-wider">Mi Perfil</span>
          </button>
        )}
      </nav>

      <main className="flex-1 mt-0 md:mt-[65px] md:ml-[280px] p-4 md:p-8 max-w-7xl mx-auto w-full transition-all">

        {/* ATHLETE */}
        {!isCoach && activeTab === 'home'      && <HomeScreen profile={profile} checkins={checkins} />}
        {!isCoach && activeTab === 'training'  && <TrainingScreen profile={profile} />}
        {!isCoach && activeTab === 'nutrition' && <NutritionHubScreen profile={profile} />}
        {!isCoach && activeTab === 'checkin'   && (
          <CheckInScreen
            profile={profile}
            checkins={checkins}
          />
        )}
        {!isCoach && activeTab === 'roadmap'   && <AthleteRoadmapScreen profile={profile} />}

        {/* COACH */}
        {isCoach && activeTab === 'clients'   && <ClientsScreen checkins={checkins} onRefreshCheckIns={handleRefreshData} coachId={profile.userId} coachEmail={profile.email} />}
        {isCoach && activeTab === 'reviews'   && <ReviewsScreen checkins={checkins} onRefreshCheckIns={handleRefreshData} coachId={profile.userId} />}
        {isCoach && activeTab === 'training'  && <TrainingCoachScreen coachId={profile.userId} />}
        {isCoach && activeTab === 'nutrition' && <NutritionCoachScreen coachId={profile.userId} />}
        {isCoach && activeTab === 'settings'  && <CoachesScreen currentUserId={profile.userId} currentUserEmail={profile.email} />}

        {/* SHARED */}
        {activeTab === 'profile' && (
          <ProfileScreen
            profile={profile}
            onRefreshProfile={handleRefreshData}
            onLogOut={() => setCurrentUser(null)}
          />
        )}
      </main>

      {/* MOBILE BOTTOM NAV */}
      <nav className="md:hidden fixed bottom-0 w-full z-50 flex items-center px-1 pt-2 bg-[#0e0e0e] border-t border-[#2a2a2a] select-none shadow-2xl" style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom, 20px))' }}>
        {mainTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex flex-col items-center justify-center py-1 flex-1 min-w-0 rounded-lg transition-all relative ${activeTab === tab.id ? 'text-[#e2ff00]' : 'text-[#c6c9ab]'}`}
          >
            <span
              className="material-symbols-outlined text-[22px] mb-0.5"
              style={{ fontVariationSettings: activeTab === tab.id ? "'FILL' 1" : "'FILL' 0" }}
            >
              {tab.icon}
            </span>
            <span className="font-mono text-[10px] uppercase font-bold leading-none truncate w-full text-center px-0.5">
              {tab.shortLabel ?? tab.label}
            </span>
            {tab.id === 'reviews' && pendingCount > 0 && (
              <span className="absolute top-0.5 right-1 w-1.5 h-1.5 rounded-full bg-[#00eefc]"></span>
            )}
          </button>
        ))}
        {/* Athletes reach their profile via the avatar bubble in the header — no separate nav item needed */}
        {isCoach && (
          <button
            onClick={() => setActiveTab('profile')}
            className={`flex flex-col items-center justify-center py-1 flex-1 min-w-0 rounded-lg transition-all ${activeTab === 'profile' ? 'text-[#e2ff00]' : 'text-[#c6c9ab]'}`}
          >
            <span
              className="material-symbols-outlined text-[22px] mb-0.5"
              style={{ fontVariationSettings: activeTab === 'profile' ? "'FILL' 1" : "'FILL' 0" }}
            >
              person
            </span>
            <span className="font-mono text-[10px] uppercase font-bold leading-none truncate w-full text-center px-0.5">Perfil</span>
          </button>
        )}
      </nav>

    </div>
  );
}
