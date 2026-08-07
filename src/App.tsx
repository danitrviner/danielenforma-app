import React, { useState, useEffect, Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { onAuthStateChanged, getRedirectResult, auth } from './firebase';
import { UserProfile, WeightCheckIn } from './types';
import { getOrCreateUserProfile, getCheckIns, seedInitialCheckinsIfEmpty, getOnboarding, getWorkoutAssignmentsForAthlete } from './dbService';
import { getPendingReviews } from './hooks/usePendingReviews';
import NotificationBell from './components/NotificationBell';
import TutorialEngine from './features/tutorial/TutorialEngine';
import { useTourTarget, registerTourTarget } from './features/tutorial/TourTargetContext';

import WelcomeScreen from './components/WelcomeScreen';
import LocalModeBanner from './components/LocalModeBanner';
import { ToastProvider } from './hooks/useToast';
import { ScreenSkeleton } from './components/ui';
import { Icon } from './components/ui';

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
const AcademyScreen        = lazy(() => import('./components/AcademyScreen'));
const CardioScreen         = lazy(() => import('./components/CardioScreen'));

// Shared screens
const AthleteRoadmapScreen = lazy(() => import('./components/AthleteRoadmapScreen'));

// Coach screens
const ClientsScreen        = lazy(() => import('./components/ClientsScreen'));
const AiChatPanel          = lazy(() => import('./components/AiChatPanel'));
const CommandPalette       = lazy(() => import('./components/CommandPalette'));
const AthleteOnboardingWizard = lazy(() => import('./components/AthleteOnboardingWizard'));
const ReviewsScreen        = lazy(() => import('./components/ReviewsScreen'));
const TrainingCoachScreen  = lazy(() => import('./components/TrainingCoachScreen'));
const NutritionCoachScreen = lazy(() => import('./components/NutritionCoachScreen'));
const AcademyCoachScreen   = lazy(() => import('./components/AcademyCoachScreen'));
const CardioCoachScreen    = lazy(() => import('./components/CardioCoachScreen'));
const CrmShell             = lazy(() => import('./features/crm/routes/CrmShell'));

// Escaparate de las primitivas de `ui/` (F7). El ternario NO es un lazy() con
// una guarda alrededor: Vite sustituye `import.meta.env.DEV` por `false` al
// compilar, así que en producción la rama entera se poda y el `import()`
// desaparece del grafo — no se genera ni un chunk que nadie va a pedir. Con la
// guarda solo en la ruta, el chunk se habría empaquetado igual.
const UiShowcase = import.meta.env.DEV
  ? lazy(() => import('./components/ui/Showcase'))
  : null;

function ScreenFallback() {
  return <ScreenSkeleton />;
}

const OWNER_EMAIL = 'danitrviner@gmail.com';

export type NavTab = 'home' | 'training' | 'nutrition' | 'checkin' | 'roadmap' | 'academy' | 'cardio' | 'clients' | 'reviews' | 'crm' | 'profile';

// Fase 3 (F3.4): la barra pasa a los cinco destinos del handoff — Hoy ·
// Rutinas · Academia · Nutrición · Perfil. Cardio se queda sin pestaña
// propia a propósito (regla dura del módulo Cardio: nunca aparece antes que
// el entreno de fuerza, se entra desde una tarjeta en Hoy). Check-in y Road
// map dejan de ser pestañas — Perfil los absorbe (decisión de Dani,
// 2026-08-07): F3.11 los renderiza dentro de Perfil como secciones
// expandibles (CheckInScreen/AthleteRoadmapScreen embebidos, no un salto de
// pantalla). Sus rutas siguen vivas (ATHLETE_PATH_SEGMENTS) por si algo
// externo enlaza directo a /checkin o /roadmap.
const ATHLETE_TABS: { id: NavTab; label: string; shortLabel: string; icon: string }[] = [
  { id: 'home',      label: 'Hoy',      shortLabel: 'Hoy',      icon: 'bolt' },
  { id: 'training',  label: 'Rutinas',  shortLabel: 'Rutinas',  icon: 'fitness_center' },
  { id: 'academy',   label: 'Academia', shortLabel: 'Academia', icon: 'school' },
  { id: 'nutrition', label: 'Nutrición', shortLabel: 'Nutri.',  icon: 'restaurant' },
  { id: 'profile',   label: 'Perfil',   shortLabel: 'Perfil',   icon: 'person' },
];

const COACH_TABS: { id: NavTab; label: string; shortLabel?: string; icon: string }[] = [
  { id: 'clients',   label: 'Clientes',   icon: 'group'           },
  { id: 'crm',       label: 'CRM',        icon: 'contacts'        },
  { id: 'reviews',   label: 'Revisiones', shortLabel: 'Revisar',   icon: 'pending_actions' },
  { id: 'training',  label: 'Ejercicios', shortLabel: 'Ejercs.',   icon: 'fitness_center'  },
  { id: 'nutrition', label: 'Nutrición',  shortLabel: 'Nutri.',    icon: 'restaurant'      },
  { id: 'academy',   label: 'Academia',   shortLabel: 'Academia',  icon: 'school'          },
  { id: 'cardio',    label: 'Cardio',     shortLabel: 'Cardio',    icon: 'favorite'        },
];

// Segmentos de URL válidos por rol — cada pantalla tiene ahora su propia ruta
// (antes solo /clients/* estaba enrutado; el resto vivía en un estado
// `activeTab` que un refresh o el botón atrás de móvil no podían recuperar).
const ATHLETE_PATH_SEGMENTS = ['home', 'training', 'nutrition', 'checkin', 'roadmap', 'academy', 'cardio', 'profile'];
const COACH_PATH_SEGMENTS = ['clients', 'crm', 'reviews', 'training', 'nutrition', 'academy', 'cardio', 'profile'];

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
  const [loading, setLoading] = useState(true);
  // Gating del primer login del atleta: hasta completar el onboarding guiado no
  // se desbloquea la app. 'checking' mientras consultamos Firestore; el coach
  // pasa directo a 'done'.
  const [onboardingGate, setOnboardingGate] = useState<'checking' | 'missing' | 'done'>('checking');
  const navigate = useNavigate();
  const location = useLocation();

  // La pestaña activa se lee directo de la URL (primer segmento) en vez de
  // guardarse en estado — así un refresh o el botón atrás de móvil recuperan
  // la pantalla exacta en la que estaba el usuario, no solo /clients/* como
  // antes. `goToTab` es ahora un simple `navigate`.
  const goToTab = (tab: NavTab) => navigate(`/${tab}`);

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
    // Si ya hay una URL válida para este rol (ej. F5 en /training), se
    // respeta — es lo que hace que el refresh recupere la pantalla exacta.
    // Si no (login nuevo, o una URL de otro rol en un navegador compartido),
    // aterriza en la pantalla por defecto del rol.
    const seg = location.pathname.split('/')[1];
    const validSegments = coachRole ? COACH_PATH_SEGMENTS : ATHLETE_PATH_SEGMENTS;
    if (!validSegments.includes(seg)) {
      navigate(coachRole ? '/clients' : '/home', { replace: true });
    }
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

  // El escaparate de primitivas va ANTES de la puerta de sesión: son piezas sin
  // datos, no necesitan Firebase ni un perfil, y pedir un login para mirar un
  // botón es fricción sin motivo. Solo existe en desarrollo (ver UiShowcase).
  if (UiShowcase && location.pathname === '/ui') {
    return (
      <div className="min-h-screen bg-bg p-4">
        <Suspense fallback={<div className="min-h-screen bg-bg" />}>
          <UiShowcase />
        </Suspense>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center flex-col gap-4">
        <div className="flex items-center gap-2 text-accent animate-pulse">
          <img src="/atlas-logo.png" alt="En Forma" className="w-9 h-9 object-contain" />
          <span className="font-sans font-extrabold text-display tracking-tighter uppercase text-accent">EN FORMA</span>
        </div>
        <p className="font-sans text-label text-ink-2 uppercase tracking-widest animate-pulse">Cargando tu sesión...</p>
      </div>
    );
  }

  if (!currentUser || !profile) {
    return <WelcomeScreen onLoginSuccess={handleLoginSuccess} />;
  }

  const isCoach = profile.role === 'coach' || profile.email.toLowerCase() === OWNER_EMAIL;

  // Mismo query key que HomeScreen — comparten caché, esto no dispara una
  // petición extra. Solo hace falta saber si hay ALGO asignado (el tutorial,
  // F3.12, arranca cuando el coach publica el plan), no la lista en sí.
  const { data: tutorialGateAssignments = [] } = useQuery({
    queryKey: ['workoutAssignments', profile.userId],
    queryFn: () => getWorkoutAssignmentsForAthlete(profile.userId),
    enabled: !isCoach,
  });

  // Primer login del atleta: onboarding guiado obligatorio antes de ver la app.
  if (!isCoach && onboardingGate !== 'done') {
    if (onboardingGate === 'missing') {
      return (
        <Suspense fallback={<div className="min-h-screen bg-bg" />}>
          <AthleteOnboardingWizard
            profile={profile}
            onComplete={() => setOnboardingGate('done')}
          />
        </Suspense>
      );
    }
    // 'checking' — misma splash que la carga de sesión
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center flex-col gap-4">
        <div className="flex items-center gap-2 text-accent animate-pulse">
          <img src="/atlas-logo.png" alt="En Forma" className="w-9 h-9 object-contain" />
          <span className="font-sans font-extrabold text-display tracking-tighter uppercase text-accent">EN FORMA</span>
        </div>
        <p className="font-sans text-label text-ink-2 uppercase tracking-widest animate-pulse">Preparando tu experiencia...</p>
      </div>
    );
  }

  const mainTabs = isCoach ? COACH_TABS : ATHLETE_TABS;
  const pendingCount = getPendingReviews(checkins).length;

  // Pestaña activa para resaltar la nav — el primer segmento de la URL, ya
  // no un estado aparte que podía desincronizarse de dónde estaba el usuario.
  const pathTab = location.pathname.split('/')[1] as NavTab;

  // Cliente activo para el asistente IA: el :athleteId de /clients/* es el email
  // URL-encodeado (ver ClientsScreen), así el chat sabe a quién se refiere "este cliente".
  const clientRouteMatch = location.pathname.match(/^\/clients\/([^/]+)/);
  const activeAthleteEmail = clientRouteMatch ? decodeURIComponent(clientRouteMatch[1]) : undefined;

  return (
    <div className="min-h-screen text-ink bg-bg flex flex-col md:flex-row pb-[calc(var(--nav-h)+1rem)] md:pb-0">
    <TutorialEngine
      profile={profile}
      hasPlan={!isCoach && tutorialGateAssignments.length > 0}
      currentTab={pathTab}
      onNavigate={goToTab}
      onProfileChanged={updates => setProfile(p => p ? { ...p, ...updates } as UserProfile : p)}
    >

      <LocalModeBanner />

      {/* TOP DESKTOP HEADER */}
      <header className="hidden md:flex justify-between items-center w-full px-8 h-[var(--header-h)] bg-bg fixed top-0 left-0 border-b border-hairline z-[var(--z-header)]">
        <div className="flex items-center gap-2 text-accent">
          <img src="/atlas-logo.png" alt="En Forma" className="w-6 h-6 object-contain" />
          <span className="font-sans font-bold text-title-m tracking-tighter uppercase select-none">EN FORMA</span>
          <span className="text-caption bg-surface border border-hairline text-ink-2 px-2 rounded-control font-mono uppercase ml-2 select-none">
            {profile.role === 'coach' ? 'Modo entrenador' : 'Modo atleta'}
          </span>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <NotificationBell recipientEmail={profile.email} onNavigate={goToTab} />
            <span className="w-px h-6 bg-white/7"></span>
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => goToTab('profile')}>
              <img src={profile.avatarUrl} alt="Avatar" className="w-7 h-7 rounded-full object-cover border border-accent/40" />
              <span className="text-label font-sans font-medium text-white">{profile.displayName}</span>
            </div>
          </div>
        </div>
      </header>

      {/* MOBILE HEADER */}
      <header className="md:hidden flex justify-between items-center w-full px-4 h-[var(--header-h)] bg-bg border-b border-hairline sticky top-0 z-[var(--z-header)]">
        <div className="flex items-center gap-2 text-accent">
          <img src="/atlas-logo.png" alt="En Forma" className="w-6 h-6 object-contain" />
          <span className="font-sans font-bold text-title-m tracking-tighter uppercase">EN FORMA</span>
          <span className="text-caption bg-white/7 text-ink-2 px-2 rounded-control font-bold uppercase select-none">
            {isCoach ? 'C' : 'A'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <NotificationBell recipientEmail={profile.email} onNavigate={goToTab} />
          <div className="w-6 h-6 rounded-full overflow-hidden border border-accent/40" onClick={() => goToTab('profile')}>
            <img src={profile.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
          </div>
        </div>
      </header>

      {/* DESKTOP SIDEBAR */}
      <nav className="hidden md:flex flex-col w-[var(--sidebar-w)] bg-bg h-screen fixed left-0 top-[var(--header-h)] border-r border-hairline p-6 justify-between select-none">
        <div className="flex flex-col gap-3">
          {mainTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => goToTab(tab.id)}
              className={`flex items-center gap-4 p-4 rounded-control transition-all text-left group ${pathTab === tab.id ? 'bg-accent text-black font-bold' : 'text-ink-2 hover:bg-raised hover:text-white'}`}
            >
              <Icon name={tab.icon} size="l" filled={pathTab === tab.id} className="group-hover:scale-110 transition-transform" />
              <span className="font-sans text-label uppercase tracking-wider font-bold flex-1">{tab.label}</span>
              {tab.id === 'reviews' && pendingCount > 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-data animate-pulse"></span>
              )}
            </button>
          ))}
        </div>
        {isCoach && (
          <button
            onClick={() => goToTab('profile')}
            className={`flex items-center gap-4 p-3 rounded-control text-left ${pathTab === 'profile' ? 'text-accent' : 'text-ink-2 hover:text-white'}`}
          >
            <Icon name="person" size="l" />
            <span className="font-sans text-label font-bold uppercase tracking-wider">Mi Perfil</span>
          </button>
        )}
      </nav>

      <main className="flex-1 mt-0 md:mt-[var(--header-h)] md:ml-[var(--sidebar-w)] p-4 md:p-8 max-w-7xl mx-auto w-full">
      <Suspense fallback={<ScreenFallback />}>
        {/* Fundido hacia arriba al cambiar de PESTAÑA (280 ms) — la key es
            pathTab, no la ruta completa, así que navegar dentro de una misma
            pestaña (p. ej. entre clientes del CRM) no reinicia la animación
            ni el estado de scroll cada vez. */}
        <div key={pathTab} className="animate-fade-up">
        <Routes>
          <Route path="/" element={<Navigate to={isCoach ? '/clients' : '/home'} replace />} />

          {/* ATHLETE */}
          {!isCoach && <Route path="/home" element={<HomeScreen profile={profile} checkins={checkins} onNavigate={goToTab} />} />}
          {!isCoach && <Route path="/training" element={<TrainingScreen profile={profile} />} />}
          {!isCoach && <Route path="/nutrition" element={<NutritionHubScreen profile={profile} />} />}
          {!isCoach && <Route path="/checkin" element={<CheckInScreen profile={profile} checkins={checkins} />} />}
          {!isCoach && <Route path="/roadmap" element={<AthleteRoadmapScreen profile={profile} />} />}
          {!isCoach && <Route path="/academy" element={<AcademyScreen profile={profile} />} />}
          {!isCoach && <Route path="/cardio" element={<CardioScreen profile={profile} />} />}

          {/* COACH */}
          {isCoach && (() => {
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
              <>
                <Route path="/clients" element={clientsScreen} />
                <Route path="/clients/:athleteId" element={clientsScreen} />
                <Route path="/clients/:athleteId/:hubTab" element={clientsScreen} />
                <Route path="/clients/:athleteId/analisis/:subTab" element={clientsScreen} />
                {/* El CRM monta sus propias rutas anidadas (ver CrmShell) */}
                <Route path="/crm/*" element={<CrmShell coachEmail={profile.email} />} />
                <Route path="/reviews" element={<ReviewsScreen checkins={checkins} onRefreshCheckIns={handleRefreshData} coachId={profile.userId} coachEmail={profile.email} />} />
                <Route path="/training" element={<TrainingCoachScreen coachId={profile.userId} />} />
                <Route path="/nutrition" element={<NutritionCoachScreen coachId={profile.userId} />} />
                <Route path="/academy" element={<AcademyCoachScreen coachId={profile.userId} coachEmail={profile.email} />} />
                <Route path="/cardio" element={<CardioCoachScreen coachEmail={profile.email} />} />
              </>
            );
          })()}

          {/* SHARED */}
          <Route
            path="/profile"
            element={(
              <ProfileScreen
                profile={profile}
                isCoach={isCoach}
                checkins={checkins}
                onRefreshProfile={handleRefreshData}
                onLogOut={() => setCurrentUser(null)}
              />
            )}
          />

          {/* URL desconocida o inválida para este rol (ej. atleta en /clients
              de una sesión anterior de coach en el mismo navegador) */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </div>
      </Suspense>
      </main>

      {/* MOBILE BOTTOM NAV — Fase 3 (F3.4)
          78 px de contenido + safe area, fondo casi negro con blur, línea
          superior al 7 %. La pestaña activa no lleva fondo propio: sube el
          icono 1 px y un punto de 4 px se escala .2→1 debajo — el
          "fundido hacia arriba" del contenido lo hace el wrapper con key
          por pestaña más abajo, en <main>. Sin deslizamiento lateral entre
          pestañas: es un cambio de ruta, no un carrusel.
          Para el atleta son los 5 destinos del handoff; el coach conserva
          sus 7 (R10 sigue abierto, se resuelve en F3.13) — la excepción de
          10 px sigue viva mientras tanto. */}
      <nav
        ref={useTourTarget('nav-tabs')}
        className="md:hidden fixed bottom-0 w-full z-[var(--z-nav)] flex items-stretch gap-1 px-2 py-4 bg-bg/92 backdrop-blur-md border-t border-hairline select-none"
        style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom, 20px))' }}
      >
        {mainTabs.map((tab) => {
          const activa = pathTab === tab.id;
          const insignia = tab.id === 'reviews' ? Math.min(pendingCount, 99) : 0;
          return (
            <button
              key={tab.id}
              ref={el => { if (['training', 'nutrition', 'academy'].includes(tab.id)) registerTourTarget(`nav-tab-${tab.id}`, el); }}
              onClick={() => goToTab(tab.id)}
              className="relative flex flex-1 min-w-0 flex-col items-center justify-center gap-1"
            >
              <span
                className={
                  'relative flex transition-transform duration-(--duration-state) ease-brand '
                  + (activa ? '-translate-y-px text-accent' : 'text-ink-2')
                }
              >
                <Icon name={tab.icon} size="l" filled={activa} />
                {insignia > 0 && (
                  <span className="absolute -top-1 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 font-mono text-caption font-bold leading-none text-on-accent">
                    {insignia}
                  </span>
                )}
              </span>
              {/* EXCEPCIÓN TEMPORAL AL DESIGN SYSTEM — ver DESIGN_SYSTEM_STATUS.md
                  El suelo del DS son 11 px; con los 7 destinos del coach en
                  375 px las etiquetas largas se truncan por debajo de eso.
                  Con los 5 del atleta ya no hace falta, pero el componente es
                  compartido y R10 (la IA del coach) se resuelve en F3.13. */}
              <span className={`font-sans text-[10px] uppercase font-bold leading-none truncate w-full text-center ${activa ? 'text-accent' : 'text-ink-2'}`}>
                {tab.shortLabel ?? tab.label}
              </span>
              <span
                aria-hidden
                className={
                  'h-1 w-1 rounded-full bg-accent transition-transform duration-(--duration-state) ease-brand '
                  + (activa ? 'scale-100' : 'scale-[.2] opacity-0')
                }
              />
            </button>
          );
        })}
      </nav>

      {/* Asistente IA — solo coach, flotante y global para poder preguntar desde cualquier pantalla */}
      {isCoach && (
        <Suspense fallback={null}>
          <AiChatPanel activeAthleteEmail={activeAthleteEmail} />
        </Suspense>
      )}

      {/* Buscador global (Cmd+K) — solo coach */}
      {isCoach && (
        <Suspense fallback={null}>
          <CommandPalette onNavigateTab={goToTab} />
        </Suspense>
      )}

    </TutorialEngine>
    </div>
  );
}
