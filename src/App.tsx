import React, { useState, useEffect, Suspense, lazy } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { onAuthStateChanged, getRedirectResult, auth } from './firebase';
import { UserProfile, WeightCheckIn } from './types';
import { getOrCreateUserProfile, getCheckIns, seedInitialCheckinsIfEmpty, getOnboarding } from './dbService';
import { getPendingReviews } from './hooks/usePendingReviews';
import NotificationBell from './components/NotificationBell';

import WelcomeScreen from './components/WelcomeScreen';
import LocalModeBanner from './components/LocalModeBanner';
import { ToastProvider } from './hooks/useToast';

// Cada pantalla de abajo solo se monta tras elegir un tab, y ningún atleta
// necesita el código de las pantallas de coach (ni viceversa) — son ~8800 y
// ~4700 líneas respectivamente que antes iban todas en el bundle inicial.
// lazy() las trocea en chunks aparte que el navegador solo pide al entrar.
const ProfileScreen        = lazy(() => import('./components/ProfileScreen'));

// Athlete screens
const HomeScreen           = lazy(() => import('./components/HomeScreen'));
const TrainingScreen       = lazy(() => import('./components/TrainingScreen'));
const NutritionHubScreen   = lazy(() => import('./components/NutritionHubScreen'));
const CheckInScreen        = lazy(() => import('./components/CheckInScreen'));

// Shared screens
const AthleteRoadmapScreen = lazy(() => import('./components/AthleteRoadmapScreen'));

// Coach screens
const ClientsScreen        = lazy(() => import('./components/ClientsScreen'));
const AiChatPanel          = lazy(() => import('./components/AiChatPanel'));
const AthleteOnboardingWizard = lazy(() => import('./components/AthleteOnboardingWizard'));
const ReviewsScreen        = lazy(() => import('./components/ReviewsScreen'));
const TrainingCoachScreen  = lazy(() => import('./components/TrainingCoachScreen'));
const NutritionCoachScreen = lazy(() => import('./components/NutritionCoachScreen'));

function ScreenFallback() {
  return (
    <div className="text-center py-12 text-[#c6c9ab] font-mono tracking-widest uppercase text-xs animate-pulse">
      Cargando...
    </div>
  );
}

const OWNER_EMAIL = 'danitrviner@gmail.com';

type NavTab = 'home' | 'training' | 'nutrition' | 'checkin' | 'roadmap' | 'clients' | 'reviews' | 'profile';

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
];

export default function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}

function AppContent() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [checkins, setCheckins] = useState<WeightCheckIn[]>([]);
  const [activeTab, setActiveTab] = useState<NavTab>('home');
  const [loading, setLoading] = useState(true);
  // Gating del primer login del atleta: hasta completar el onboarding guiado no
  // se desbloquea la app. 'checking' mientras consultamos Firestore; el coach
  // pasa directo a 'done'.
  const [onboardingGate, setOnboardingGate] = useState<'checking' | 'missing' | 'done'>('checking');
  const navigate = useNavigate();
  const location = useLocation();

  // The "clients" tab is the only part of the app backed by real routes (see
  // ClientsScreen/ClientHub) — keep the URL bar in sync whenever the coach
  // switches tabs, and push a coach who just logged in onto /clients so a
  // refresh there lands back on the exact athlete/hub-tab instead of the grid.
  const goToTab = (tab: NavTab) => {
    setActiveTab(tab);
    if (tab === 'clients') {
      if (!location.pathname.startsWith('/clients')) navigate('/clients');
    } else if (location.pathname.startsWith('/clients')) {
      navigate('/');
    }
  };

  // One-directional: only follows the URL when something *outside* goToTab
  // pushed us onto a /clients/* URL (e.g. a raw navigate() from ReviewsScreen).
  // There used to be a symmetric branch that force-navigated back to /clients
  // whenever activeTab === 'clients' but the URL wasn't — that fired on every
  // goToTab() call made *from* the clients tab (its own navigate('/') hadn't
  // landed in location yet on that render), snapping every tab back to Clientes.
  // The two legitimate "land coach on /clients" cases it covered (initial login,
  // NotificationBell's raw setActiveTab) are now handled explicitly instead.
  useEffect(() => {
    const onClientsUrl = location.pathname.startsWith('/clients');
    if (onClientsUrl && activeTab !== 'clients') {
      setActiveTab('clients');
    }
  }, [activeTab, location.pathname]);

  // Comprueba si el atleta ya hizo el onboarding guiado. El coach nunca se gatea.
  useEffect(() => {
    if (!profile) { setOnboardingGate('checking'); return; }
    const coachRole = profile.role === 'coach' || profile.email.toLowerCase() === OWNER_EMAIL;
    if (coachRole) { setOnboardingGate('done'); return; }
    let cancelled = false;
    getOnboarding(profile.email)
      .then(o => {
        if (cancelled) return;
        setOnboardingGate(o?.completedAt ? 'done' : 'missing');
      })
      .catch(() => { if (!cancelled) setOnboardingGate('done'); }); // ante error, no bloquear la app
    return () => { cancelled = true; };
  }, [profile]);
  const loadUserSession = async (user: any) => {
    const userProfile = await getOrCreateUserProfile(user.uid, user.email || 'atleta@enforma.com', user.displayName || '');
    const isOwner = (user.email || '').toLowerCase() === OWNER_EMAIL;
    const coachRole = userProfile.role === 'coach' || isOwner;
    setProfile(userProfile);
    setActiveTab(coachRole ? 'clients' : 'home');
    if (coachRole && !location.pathname.startsWith('/clients')) navigate('/clients');
    // Check-ins ya no bloquean el splash de carga — antes el coach esperaba
    // la descarga completa del historial (sin límite) antes de ver ninguna
    // pantalla. `checkins` arranca en [] y toda la UI que depende de él ya
    // tolera la lista vacía, así que puede llegar en segundo plano.
    seedInitialCheckinsIfEmpty(user.uid, user.email || 'atleta@enforma.com')
      .then(() => getCheckIns(coachRole ? undefined : user.uid)) // coach: sin filtro; atleta: solo el suyo
      .then(setCheckins)
      .catch(err => console.error('Error cargando check-ins:', err));
  };

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
      <div className="min-h-screen bg-[#111110] flex items-center justify-center flex-col gap-4">
        <div className="flex items-center gap-2 text-[#fbcb1a] animate-pulse">
          <img src="/atlas-logo.png" alt="En Forma" className="w-9 h-9 rounded-md" />
          <span className="font-sans font-black text-3xl tracking-tighter uppercase text-[#fbcb1a]">EN FORMA</span>
        </div>
        <p className="font-mono text-xs text-[#c6c9ab] uppercase tracking-widest animate-pulse">Cargando tu sesión...</p>
      </div>
    );
  }

  if (!currentUser || !profile) {
    return <WelcomeScreen onLoginSuccess={handleLoginSuccess} />;
  }

  const isCoach = profile.role === 'coach' || profile.email.toLowerCase() === OWNER_EMAIL;

  // Primer login del atleta: onboarding guiado obligatorio antes de ver la app.
  if (!isCoach && onboardingGate !== 'done') {
    if (onboardingGate === 'missing') {
      return (
        <Suspense fallback={<div className="min-h-screen bg-[#0e0e0e]" />}>
          <AthleteOnboardingWizard
            profile={profile}
            onComplete={() => setOnboardingGate('done')}
          />
        </Suspense>
      );
    }
    // 'checking' — misma splash que la carga de sesión
    return (
      <div className="min-h-screen bg-[#111110] flex items-center justify-center flex-col gap-4">
        <div className="flex items-center gap-2 text-[#fbcb1a] animate-pulse">
          <img src="/atlas-logo.png" alt="En Forma" className="w-9 h-9 rounded-md" />
          <span className="font-sans font-black text-3xl tracking-tighter uppercase text-[#fbcb1a]">EN FORMA</span>
        </div>
        <p className="font-mono text-xs text-[#c6c9ab] uppercase tracking-widest animate-pulse">Preparando tu experiencia...</p>
      </div>
    );
  }

  const mainTabs = isCoach ? COACH_TABS : ATHLETE_TABS;
  const pendingCount = getPendingReviews(checkins).length;

  // Cliente activo para el asistente IA: el :athleteId de /clients/* es el email
  // URL-encodeado (ver ClientsScreen), así el chat sabe a quién se refiere "este cliente".
  const clientRouteMatch = location.pathname.match(/^\/clients\/([^/]+)/);
  const activeAthleteEmail = clientRouteMatch ? decodeURIComponent(clientRouteMatch[1]) : undefined;

  return (
    <div className="min-h-screen text-[#e5e2e1] bg-[#111110] flex flex-col md:flex-row pb-24 md:pb-0">

      <LocalModeBanner />

      {/* TOP DESKTOP HEADER */}
      <header className="hidden md:flex justify-between items-center w-full px-8 py-5 bg-[#111110] fixed top-0 left-0 border-b border-white/7 z-40">
        <div className="flex items-center gap-2 text-[#fbcb1a]">
          <img src="/atlas-logo.png" alt="En Forma" className="w-6 h-6 rounded" />
          <span className="font-sans font-black text-xl tracking-tighter uppercase select-none">EN FORMA</span>
          <span className="text-[10px] bg-[#181816] border border-white/7 text-[#c6c9ab] px-2 py-0.5 rounded font-mono uppercase ml-2 select-none">
            {profile.role === 'coach' ? 'Modo entrenador' : 'Modo atleta'}
          </span>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <NotificationBell recipientEmail={profile.email} onNavigate={goToTab} />
            <span className="w-px h-6 bg-white/7"></span>
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => goToTab('profile')}>
              <img src={profile.avatarUrl} alt="Avatar" className="w-7 h-7 rounded-full object-cover border border-[#fbcb1a]/40" />
              <span className="text-xs font-mono font-medium text-white">{profile.displayName}</span>
            </div>
          </div>
        </div>
      </header>

      {/* MOBILE HEADER */}
      <header className="md:hidden flex justify-between items-center w-full px-4 py-4 bg-[#111110] border-b border-white/7 sticky top-0 z-40">
        <div className="flex items-center gap-2 text-[#fbcb1a]">
          <img src="/atlas-logo.png" alt="En Forma" className="w-6 h-6 rounded" />
          <span className="font-sans font-black text-lg tracking-tighter uppercase">EN FORMA</span>
          <span className="text-[8px] bg-white/7 text-[#c6c9ab] px-1.5 py-0.5 rounded font-bold uppercase select-none">
            {isCoach ? 'C' : 'A'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <NotificationBell recipientEmail={profile.email} onNavigate={goToTab} />
          <div className="w-6 h-6 rounded-full overflow-hidden border border-[#fbcb1a]/40" onClick={() => goToTab('profile')}>
            <img src={profile.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
          </div>
        </div>
      </header>

      {/* DESKTOP SIDEBAR */}
      <nav className="hidden md:flex flex-col w-[280px] bg-[#111110] h-screen fixed left-0 top-[65px] border-r border-white/7 p-6 justify-between select-none">
        <div className="flex flex-col gap-3">
          {mainTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => goToTab(tab.id)}
              className={`flex items-center gap-3.5 p-3.5 rounded-xl transition-all text-left group ${activeTab === tab.id ? 'bg-[#fbcb1a] text-black font-bold shadow-md' : 'text-[#c6c9ab] hover:bg-[#1e1e1b] hover:text-white'}`}
            >
              <span
                className="material-symbols-outlined group-hover:scale-110 transition-transform"
                style={{ fontVariationSettings: activeTab === tab.id ? "'FILL' 1" : "'FILL' 0" }}
              >
                {tab.icon}
              </span>
              <span className="font-sans text-xs uppercase tracking-wider font-bold flex-1">{tab.label}</span>
              {tab.id === 'reviews' && pendingCount > 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#00eefc] animate-pulse"></span>
              )}
            </button>
          ))}
        </div>
        {isCoach && (
          <button
            onClick={() => goToTab('profile')}
            className={`flex items-center gap-4 p-3 rounded-lg text-left ${activeTab === 'profile' ? 'text-[#fbcb1a]' : 'text-[#c6c9ab] hover:text-white'}`}
          >
            <span className="material-symbols-outlined">person</span>
            <span className="font-sans text-xs font-bold uppercase tracking-wider">Mi Perfil</span>
          </button>
        )}
      </nav>

      <main className="flex-1 mt-0 md:mt-[65px] md:ml-[280px] p-4 md:p-8 max-w-7xl mx-auto w-full transition-all">
      <Suspense fallback={<ScreenFallback />}>

        {/* ATHLETE */}
        {!isCoach && activeTab === 'home'      && <HomeScreen profile={profile} checkins={checkins} onNavigate={goToTab} />}
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
        {isCoach && activeTab === 'clients' && (() => {
          const clientsScreen = (
            <ClientsScreen
              checkins={checkins}
              onRefreshCheckIns={handleRefreshData}
              coachId={profile.userId}
              coachEmail={profile.email}
              onOpenReviews={() => goToTab('reviews')}
            />
          );
          return (
            <Routes>
              <Route path="/clients" element={clientsScreen} />
              <Route path="/clients/:athleteId" element={clientsScreen} />
              <Route path="/clients/:athleteId/:hubTab" element={clientsScreen} />
              <Route path="/clients/:athleteId/analisis/:subTab" element={clientsScreen} />
            </Routes>
          );
        })()}
        {isCoach && activeTab === 'reviews'   && <ReviewsScreen checkins={checkins} onRefreshCheckIns={handleRefreshData} coachId={profile.userId} coachEmail={profile.email} />}
        {isCoach && activeTab === 'training'  && <TrainingCoachScreen coachId={profile.userId} />}
        {isCoach && activeTab === 'nutrition' && <NutritionCoachScreen coachId={profile.userId} />}

        {/* SHARED */}
        {activeTab === 'profile' && (
          <ProfileScreen
            profile={profile}
            isCoach={isCoach}
            onRefreshProfile={handleRefreshData}
            onLogOut={() => setCurrentUser(null)}
          />
        )}
      </Suspense>
      </main>

      {/* MOBILE BOTTOM NAV */}
      <nav className="md:hidden fixed bottom-0 w-full z-50 flex items-center gap-1 px-2 pt-2 bg-[#111110] border-t border-white/7 select-none shadow-2xl" style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom, 20px))' }}>
        {mainTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => goToTab(tab.id)}
            className={`flex flex-col items-center justify-center gap-0.5 py-1.5 flex-1 min-w-0 rounded-2xl transition-all relative border ${activeTab === tab.id ? 'bg-[#fbcb1a]/10 border-[#fbcb1a]/30 text-[#fbcb1a]' : 'border-transparent text-[#c6c9ab]'}`}
          >
            <span
              className="material-symbols-outlined text-[22px]"
              style={{ fontVariationSettings: activeTab === tab.id ? "'FILL' 1" : "'FILL' 0" }}
            >
              {tab.icon}
            </span>
            <span className="font-sans text-[10px] uppercase font-bold leading-none truncate w-full text-center px-0.5">
              {tab.shortLabel ?? tab.label}
            </span>
            {tab.id === 'reviews' && pendingCount > 0 && (
              <span className="absolute top-0.5 right-1 w-1.5 h-1.5 rounded-full bg-[#00eefc]"></span>
            )}
          </button>
        ))}
        {/* Both athletes and coaches reach their profile via the avatar bubble in the header — no separate nav item needed */}
      </nav>

      {/* Asistente IA — solo coach, flotante y global para poder preguntar desde cualquier pantalla */}
      {isCoach && (
        <Suspense fallback={null}>
          <AiChatPanel activeAthleteEmail={activeAthleteEmail} />
        </Suspense>
      )}

    </div>
  );
}
