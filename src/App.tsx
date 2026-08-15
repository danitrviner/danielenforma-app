import React, { useState, useEffect, useMemo, Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { onAuthStateChanged, auth } from './firebase';
import { UserProfile, WeightCheckIn, NotificationType } from './types';
import { getOrCreateUserProfile, getCheckIns, seedInitialCheckinsIfEmpty, getOnboarding, getWorkoutAssignmentsForAthlete, getGimnasio } from './dbService';
import { useGimnasioPendiente } from './features/gimnasio/RecordatorioGimnasioCard';
import { getPendingReviews } from './hooks/usePendingReviews';
import NotificationBell from './components/NotificationBell';
import TutorialEngine from './features/tutorial/TutorialEngine';
import { useTourTarget, registerTourTarget } from './features/tutorial/TourTargetContext';

import WelcomeScreen from './components/WelcomeScreen';
import LocalModeBanner from './components/LocalModeBanner';
import { ToastProvider, useToast } from './hooks/useToast';
import { ScreenSkeleton } from './components/ui';
import { Icon } from './components/ui';
import { OPEN_AI_PANEL_EVENT } from './ai/events';
import { limpiarDatosDeSesion } from './utils/cierreDeSesion';
import { iniciarBotonAtras, fijarManejadorDeRuta, salirDeLaApp } from './services/botonAtras';

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
const CoachLibraryScreen   = lazy(() => import('./components/CoachLibraryScreen'));
const CrmShell             = lazy(() => import('./features/crm/routes/CrmShell'));
const CatalogoSwipe        = lazy(() => import('./features/gimnasio/CatalogoSwipe'));

// Escaparate de las primitivas de `ui/` (F7). El ternario NO es un lazy() con
// una guarda alrededor: Vite sustituye `import.meta.env.DEV` por `false` al
// compilar, así que en producción la rama entera se poda y el `import()`
// desaparece del grafo — no se genera ni un chunk que nadie va a pedir. Con la
// guarda solo en la ruta, el chunk se habría empaquetado igual.
const UiShowcase = import.meta.env.DEV
  ? lazy(() => import('./components/ui/Showcase'))
  : null;

// Banco de pruebas del catálogo de máquinas, misma poda que el escaparate. El
// swipe solo enseña máquinas publicadas y el importador las deja sin publicar a
// propósito, así que sin esto el flujo no se puede recorrer hasta que un admin
// publique. Ver features/gimnasio/DevHarness.
const GimnasioHarness = import.meta.env.DEV
  ? lazy(() => import('./features/gimnasio/DevHarness'))
  : null;

function ScreenFallback() {
  return <ScreenSkeleton />;
}

const OWNER_EMAIL = 'danitrviner@gmail.com';

export type NavTab = 'home' | 'training' | 'nutrition' | 'checkin' | 'roadmap' | 'academy' | 'cardio' | 'clients' | 'reviews' | 'crm' | 'library' | 'profile';

type NavItem = { id: NavTab; label: string; shortLabel?: string; icon: string };
type NavGroup = { title?: string; items: NavItem[] };

// Fase 3 (F3.4): la barra pasa a los cinco destinos del handoff — Hoy ·
// Rutinas · Academia · Nutrición · Perfil. Cardio se queda sin pestaña
// propia a propósito (regla dura del módulo Cardio: nunca aparece antes que
// el entreno de fuerza, se entra desde una tarjeta en Hoy). Check-in y Road
// map dejan de ser pestañas — Perfil los absorbe (decisión de Dani,
// 2026-08-07): F3.11 los renderiza dentro de Perfil como secciones
// expandibles (CheckInScreen/AthleteRoadmapScreen embebidos, no un salto de
// pantalla). Sus rutas siguen vivas (ATHLETE_PATH_SEGMENTS) por si algo
// externo enlaza directo a /checkin o /roadmap.
const ATHLETE_TABS: NavItem[] = [
  { id: 'home',      label: 'Hoy',      shortLabel: 'Hoy',      icon: 'bolt' },
  { id: 'training',  label: 'Rutinas',  shortLabel: 'Rutinas',  icon: 'fitness_center' },
  { id: 'academy',   label: 'Academia', shortLabel: 'Academia', icon: 'school' },
  { id: 'nutrition', label: 'Nutrición', shortLabel: 'Nutri.',  icon: 'restaurant' },
  { id: 'profile',   label: 'Perfil',   shortLabel: 'Perfil',   icon: 'person' },
];

// F3.13a: "Home Coach sustituye la entrada del coach" (decisión de Dani,
// 2026-08-07) — la ruta sigue siendo /clients (no romper enlaces existentes
// ni el :athleteId de ClientHub), solo cambian la etiqueta y el icono; el
// contenido en sí lo decide ClientsScreen (HomeCoachScreen prepended).
const COACH_DIA_A_DIA: NavItem[] = [
  // Sin `shortLabel`: medido a 375 px, "REVISIONES" ocupa 68 px de los 86 que
  // toca por destino con cuatro. Ya no hace falta abreviar a "Revisar".
  { id: 'clients',   label: 'Inicio',     icon: 'bolt'            },
  { id: 'reviews',   label: 'Revisiones', icon: 'pending_actions' },
  { id: 'crm',       label: 'CRM',        icon: 'contacts'        },
];

// Los cuatro catálogos. En PC siguen siendo cuatro entradas de la barra
// lateral (hay sitio de sobra y ahorran un clic); en móvil se pliegan en un
// único destino "Biblioteca" que los monta como pestañas. Ver
// CoachLibraryScreen para el porqué del corte.
const COACH_BIBLIOTECA: NavItem[] = [
  // Solo salen en la barra lateral de PC, que usa `label`: sin `shortLabel`.
  { id: 'training',  label: 'Ejercicios', icon: 'fitness_center'  },
  { id: 'nutrition', label: 'Nutrición',  icon: 'restaurant'      },
  { id: 'academy',   label: 'Academia',   icon: 'school'          },
  { id: 'cardio',    label: 'Cardio',     icon: 'favorite'        },
];

// Barra lateral de PC: agrupada con encabezados, nadie pierde un destino.
const COACH_NAV_GROUPS: NavGroup[] = [
  { title: 'Día a día',  items: COACH_DIA_A_DIA  },
  { title: 'Biblioteca', items: COACH_BIBLIOTECA },
];
const ATHLETE_NAV_GROUPS: NavGroup[] = [{ items: ATHLETE_TABS }];

// Barra inferior de móvil: cuatro destinos para el coach. Con los siete de
// antes las etiquetas no cabían a los 11 px del Design System y había que
// bajarlas a 10 (la excepción R10 de DESIGN_SYSTEM_STATUS.md); con cuatro
// vuelven al suelo del sistema. Perfil no está porque ya vive en el avatar
// de la cabecera.
const COACH_TABS_MOBILE: NavItem[] = [
  ...COACH_DIA_A_DIA,
  { id: 'library', label: 'Biblioteca', icon: 'folder_open' },
];

// De qué destino de la barra lateral se considera activa cada sección de
// /library, para que en PC se ilumine "Nutrición" y no un genérico.
const LIBRARY_SECTION_TAB: Record<string, NavTab> = {
  ejercicios: 'training',
  nutricion:  'nutrition',
  academia:   'academy',
  cardio:     'cardio',
};
const TAB_LIBRARY_SECTION: Record<string, string> = {
  training:  'ejercicios',
  nutrition: 'nutricion',
  academy:   'academia',
  cardio:    'cardio',
};

// Segmentos de URL válidos por rol — cada pantalla tiene ahora su propia ruta
// (antes solo /clients/* estaba enrutado; el resto vivía en un estado
// `activeTab` que un refresh o el botón atrás de móvil no podían recuperar).
const ATHLETE_PATH_SEGMENTS = ['home', 'training', 'nutrition', 'checkin', 'roadmap', 'academy', 'cardio', 'profile'];
// 'training' | 'nutrition' | 'academy' | 'cardio' siguen aquí aunque ya no
// sean destinos propios del coach: sus rutas viven (redirigen a /library/…)
// para no romper enlaces antiguos ni las notificaciones que navegan ahí.
const COACH_PATH_SEGMENTS = ['clients', 'crm', 'reviews', 'library', 'training', 'nutrition', 'academy', 'cardio', 'profile'];

// Techo para cualquier carga de sesión (login manual o restauración al
// abrir la app): sin él, un hipo de red deja el logo pulsando para siempre.
const LOGIN_TIMEOUT_MS = 12_000;

export default function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}

function AppContent() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [checkins, setCheckins] = useState<WeightCheckIn[]>([]);
  const [loading, setLoading] = useState(true);
  // Gating del primer login del atleta: hasta completar el onboarding guiado no
  // se desbloquea la app. 'checking' mientras consultamos Firestore; el coach
  // pasa directo a 'done'.
  const [onboardingGate, setOnboardingGate] = useState<'checking' | 'missing' | 'done'>('checking');
  // Segundo gate, independiente del anterior: el catálogo de máquinas. Va aparte
  // y no como un paso más del wizard porque son cientos de tarjetas y el wizard
  // no persiste su progreso (17 useState locales que se pierden al cerrar).
  // Aquí sí se reanuda, y "omitir" es una salida legítima que deja recordatorio.
  const [gimnasioGate, setGimnasioGate] = useState<'checking' | 'missing' | 'done'>('checking');
  const navigate = useNavigate();
  const location = useLocation();

  /* 07-9. Botón Atrás de Android. Las capas (Sheet, Dialog) se cierran solas
     porque la primitiva los apila; aquí se decide lo que pasa cuando NO hay
     ninguna capa abierta.

     En la raíz se usa el doble-Atrás con aviso, que es la convención de Android
     y no necesita un diálogo propio. Importa más de lo que parece: hasta ahora
     una pulsación distraída en la pantalla de inicio cerraba la app en seco, y
     eso pasaba también en mitad de un entrenamiento. */
  const salidaArmada = React.useRef(false);

  useEffect(() => { iniciarBotonAtras(); }, []);

  useEffect(() => {
    fijarManejadorDeRuta(() => {
      if (location.pathname !== '/') {
        navigate(-1);
        return;
      }
      if (salidaArmada.current) {
        salirDeLaApp();
        return;
      }
      salidaArmada.current = true;
      showToast('Pulsa Atrás otra vez para salir de En Forma.');
      // La ventana es corta a propósito: si fuera larga, dos pulsaciones
      // separadas por medio minuto contarían como una intención de salir.
      setTimeout(() => { salidaArmada.current = false; }, 2500);
    });
  }, [location.pathname, navigate, showToast]);

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

  // Catálogo de máquinas. Se evalúa después del onboarding, no a la vez: sin la
  // anamnesis hecha, preguntar por el gimnasio no tiene sentido. Se muestra solo
  // si nunca se ha tocado; si el atleta lo omitió (`pendienteRecordatorio`), la
  // app se desbloquea y el recordatorio vive en Hoy — no se le vuelve a plantar
  // el catálogo delante en cada arranque.
  useEffect(() => {
    if (!profile || onboardingGate !== 'done') { setGimnasioGate('checking'); return; }
    const coachRole = profile.role === 'coach' || profile.email.toLowerCase() === OWNER_EMAIL;
    if (coachRole) { setGimnasioGate('done'); return; }
    let cancelled = false;
    getGimnasio(profile.email)
      .then(g => {
        if (cancelled) return;
        const tocado = !!g && (g.progresoCatalogo.completado || g.progresoCatalogo.pendienteRecordatorio || g.maquinas.length > 0);
        setGimnasioGate(tocado ? 'done' : 'missing');
      })
      .catch(() => { if (!cancelled) setGimnasioGate('done'); }); // ante error, no bloquear la app
    return () => { cancelled = true; };
  }, [profile, onboardingGate]);
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
    // El `clearTimeout` vivía dentro del callback de `onAuthStateChanged`, así
    // que se cancelaba en cuanto Firebase confirmaba el usuario — ANTES de
    // esperar a `loadUserSession`. Si esa lectura de Firestore se colgaba, ya
    // no quedaba ningún salvavidas y la sesión no se restauraba nunca. Ahora el
    // timeout cubre la operación completa, con Promise.race, igual que en
    // handleLoginSuccess.
    const safetyTimeout = setTimeout(() => {
      setLoading(false);
      showToast('Ha tardado demasiado en cargar tu sesión. Recarga la página.', 'error');
    }, LOGIN_TIMEOUT_MS);

    // Antes había aquí un `getRedirectResult` para resolver la vuelta del
    // redirect de Google, con una bandera `sessionLoaded` para que
    // onAuthStateChanged no cargara la sesión dos veces. Al quitar Google
    // Sign-In (B-3/B-4) ya no hay ningún redirect que resolver, y con él se va
    // también 03-8: aquel `catch` mandaba el error solo a la consola, así que un
    // fallo de acceso por redirect no producía ni un mensaje en pantalla.
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
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
        clearTimeout(safetyTimeout);
        setLoading(false);
      }
    });

    return () => {
      clearTimeout(safetyTimeout);
      unsubscribe();
    };
  }, []);

  /* ═══════════════════════════════════════════════════════════════════════
     TODOS los hooks van aquí, por encima del primer `return` condicional.

     Este componente tiene cuatro salidas tempranas (escaparate, banco de
     pruebas, splash de carga y pantalla de bienvenida) y debajo de ellas vivían
     tres hooks. Eso rompe la regla de orden de React: en el render donde
     `loading` es true no se llamaban, y en el siguiente sí — que es
     exactamente lo que produce el «change in the order of Hooks» y, con él,
     estado leído de la posición equivocada. `eslint` lo marcaba como error.

     El precio de subirlos es que `profile` todavía puede ser null aquí, así que
     cada uno se escribe a prueba de eso y las consultas van con `enabled`. No
     disparan nada hasta que hay perfil.
     ═══════════════════════════════════════════════════════════════════════ */

  // Null-safe a propósito: se evalúa antes de la puerta de sesión.
  const isCoach = !!profile && (profile.role === 'coach' || profile.email.toLowerCase() === OWNER_EMAIL);

  // F3.13e: tipos que el coach silenció en Ajustes › Notificaciones. Vacío
  // para el atleta (ese panel es coach-only, ver ProfileScreen).
  const mutedNotifTypes = useMemo(() => {
    const prefs = profile?.notificationPrefs;
    if (!prefs) return undefined;
    const muted = (Object.entries(prefs) as [NotificationType, boolean | undefined][])
      .filter(([, on]) => on === false)
      .map(([type]) => type);
    return muted.length ? new Set(muted) : undefined;
  }, [profile?.notificationPrefs]);

  // Mismo query key que HomeScreen — comparten caché, esto no dispara una
  // petición extra. Solo hace falta saber si hay ALGO asignado (el tutorial,
  // F3.12, arranca cuando el coach publica el plan), no la lista en sí.
  const athleteUserId = profile?.userId;
  const { data: tutorialGateAssignments = [] } = useQuery({
    queryKey: ['workoutAssignments', athleteUserId],
    queryFn: () => getWorkoutAssignmentsForAthlete(athleteUserId!),
    enabled: !!athleteUserId && !isCoach,
  });

  // Punto rojo en Hoy mientras el catálogo de máquinas siga a medias. Sin cifra:
  // el recuento exacto está en la tarjeta de dentro, y un número en la pestaña
  // competiría con el de revisiones, que sí es trabajo que le llega de fuera.
  // Comparte queryKey con MiGimnasioPanel, así que no añade una lectura.
  const { pendiente: gimnasioPendiente } = useGimnasioPendiente(profile?.email ?? '', !!profile && !isCoach);

  // `useTourTarget` no llama a ningún hook —devuelve una callback de ref— pero
  // se llama `use*`, así que la regla lo trata como uno. Se resuelve aquí en vez
  // de en el JSX de la barra de navegación, que está detrás de los gates.
  const navTabsRef = useTourTarget('nav-tabs');

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

  // El login por credenciales llamaba directo a loadUserSession sin ningún
  // salvavidas: si la primera lectura de Firestore se quedaba colgada (hipo de
  // red, token todavía no propagado), el `finally` de abajo no se ejecutaba
  // nunca y la persona se quedaba viendo el logo pulsando para siempre, sin
  // mensaje y sin forma de reintentar. La restauración automática de sesión
  // (el otro useEffect, arriba) sí tenía un `setTimeout` de 8 s para esto
  // mismo — este era el único camino de login sin red de seguridad.
  const handleLoginSuccess = async (user: any) => {
    setLoading(true);
    setCurrentUser(user);
    try {
      await Promise.race([
        loadUserSession(user),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout-cargando-sesion')), LOGIN_TIMEOUT_MS)
        ),
      ]);
    } catch (err: any) {
      console.error('Error loading profile after login:', err);
      showToast(
        err?.message === 'timeout-cargando-sesion'
          ? 'Ha tardado demasiado en cargar tu sesión. Vuelve a intentarlo.'
          : 'No se pudo cargar tu perfil. Vuelve a intentarlo.',
        'error'
      );
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

  if (GimnasioHarness && location.pathname === '/dev/gimnasio') {
    return (
      <Suspense fallback={<div className="min-h-screen bg-bg" />}>
        <GimnasioHarness />
      </Suspense>
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

  // Segundo gate: el catálogo de máquinas, justo después de la anamnesis.
  // "Omitir" no bloquea — marca el recordatorio y deja pasar (lo recoge Hoy).
  if (!isCoach && gimnasioGate === 'missing') {
    return (
      <Suspense fallback={<div className="min-h-screen bg-bg" />}>
        <CatalogoSwipe
          email={profile.email}
          onCompletado={() => setGimnasioGate('done')}
          onOmitir={() => setGimnasioGate('done')}
        />
      </Suspense>
    );
  }

  const mobileTabs = isCoach ? COACH_TABS_MOBILE : ATHLETE_TABS;
  const navGroups = isCoach ? COACH_NAV_GROUPS : ATHLETE_NAV_GROUPS;
  const pendingCount = getPendingReviews(checkins).length;

  // Pestaña activa para resaltar la nav — el primer segmento de la URL, ya
  // no un estado aparte que podía desincronizarse de dónde estaba el usuario.
  const pathTab = location.pathname.split('/')[1] as NavTab;

  // En /library/<sección> el primer segmento es siempre 'library', así que la
  // barra lateral (que sigue listando los cuatro catálogos por separado)
  // necesita saber a cuál de ellos corresponde. La barra de móvil, que solo
  // tiene el destino 'library', se ilumina con el segmento tal cual.
  const librarySection = pathTab === 'library' ? location.pathname.split('/')[2] : undefined;
  const esActiva = (id: NavTab) =>
    pathTab === id || (librarySection != null && LIBRARY_SECTION_TAB[librarySection] === id);

  // Los cuatro catálogos ya no tienen ruta propia para el coach: se navega
  // directo a su sección de /library para no pasar por el redirect (que sigue
  // ahí, pero para enlaces antiguos, no para un clic de la propia barra).
  const goToNav = (id: NavTab) =>
    isCoach && TAB_LIBRARY_SECTION[id] ? navigate(`/library/${TAB_LIBRARY_SECTION[id]}`) : goToTab(id);

  // Cliente activo para el asistente IA: el :athleteId de /clients/* es el email
  // URL-encodeado (ver ClientsScreen), así el chat sabe a quién se refiere "este cliente".
  const clientRouteMatch = location.pathname.match(/^\/clients\/([^/]+)/);
  const activeAthleteEmail = clientRouteMatch ? decodeURIComponent(clientRouteMatch[1]) : undefined;

  // P1-3 de la auditoría visual se arregló aquí con un suelo de 172 px: el
  // FAB del Asistente IA flotaba abajo-derecha y tapaba el último bloque de
  // contenido en ClientHub/CRM Pagos/Cardio Zonas. Ese suelo ya no hace
  // falta —en móvil el disparador se ha mudado a la cabecera, junto al
  // avatar, y no hay nada flotando que tapar—, así que el hueco vuelve a ser
  // solo el de la barra de navegación y el contenido recupera 60 px.
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
      <header className="hidden md:flex justify-between items-center w-full px-8 h-[var(--header-h)] pt-[var(--safe-top)] bg-bg fixed top-0 left-0 border-b border-hairline z-[var(--z-header)]">
        <div className="flex items-center gap-2 text-accent">
          <img src="/atlas-logo.png" alt="En Forma" className="w-6 h-6 object-contain" />
          <span className="font-sans font-bold text-title-m tracking-tighter uppercase select-none">EN FORMA</span>
          <span className="text-caption bg-surface border border-hairline text-ink-2 px-2 rounded-control font-mono uppercase ml-2 select-none">
            {profile.role === 'coach' ? 'Modo entrenador' : 'Modo atleta'}
          </span>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <NotificationBell recipientEmail={profile.email} onNavigate={goToTab} mutedTypes={mutedNotifTypes} />
            <span className="w-px h-6 bg-white/7"></span>
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => goToTab('profile')}>
              <img src={profile.avatarUrl} alt="Avatar" className="w-7 h-7 rounded-full object-cover border border-accent/40" />
              <span className="text-label font-sans font-medium text-white">{profile.displayName}</span>
            </div>
          </div>
        </div>
      </header>

      {/* MOBILE HEADER */}
      <header className="md:hidden flex justify-between items-center w-full px-4 h-[var(--header-h)] pt-[var(--safe-top)] bg-bg border-b border-hairline sticky top-0 z-[var(--z-header)]">
        <div className="flex items-center gap-2 text-accent">
          <img src="/atlas-logo.png" alt="En Forma" className="w-6 h-6 object-contain" />
          <span className="font-sans font-bold text-title-m tracking-tighter uppercase">EN FORMA</span>
          <span className="text-caption bg-white/7 text-ink-2 px-2 rounded-control font-bold uppercase select-none">
            {isCoach ? 'C' : 'A'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {/* Asistente IA. En escritorio sigue siendo el botón flotante de
              abajo-derecha; en móvil vive aquí, junto al avatar. Flotando
              tapaba el último bloque de contenido de cada pantalla (P1-3 de
              la auditoría visual) y obligaba a reservarle 172 px de hueco al
              final del layout; en la cabecera no tapa nada. Dispara el mismo
              evento que ya usaba ClientHub para abrir el panel. */}
          {isCoach && (
            <button
              onClick={() => window.dispatchEvent(new CustomEvent(OPEN_AI_PANEL_EVENT))}
              aria-label="Asistente IA"
              className="flex h-8 w-8 items-center justify-center rounded-full text-accent transition-colors hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-line"
            >
              <Icon name="smart_toy" size="m" filled />
            </button>
          )}
          {/* Cardio, atajo del atleta. Su sitio en la barra inferior se lo
              quedaron los cinco destinos de siempre, así que para llegar había
              que entrar por Perfil: demasiados pasos para algo que se abre
              nada más subirse a la cinta. Ocupa el hueco del botón de IA, que
              es solo del coach, y así ninguna de las dos cabeceras crece. */}
          {!isCoach && (
            <button
              onClick={() => goToTab('cardio')}
              aria-label="Cardio"
              className="flex h-8 w-8 items-center justify-center rounded-full text-accent transition-colors hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-line"
            >
              <Icon name="monitor_heart" size="m" filled />
            </button>
          )}
          <NotificationBell recipientEmail={profile.email} onNavigate={goToTab} mutedTypes={mutedNotifTypes} />
          <div className="w-6 h-6 rounded-full overflow-hidden border border-accent/40" onClick={() => goToTab('profile')}>
            <img src={profile.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
          </div>
        </div>
      </header>

      {/* DESKTOP SIDEBAR */}
      {/* En PC no se pliega nada: los siete destinos del coach siguen a un
          clic, solo se agrupan bajo encabezados (Día a día / Biblioteca) para
          que se lea de un vistazo qué es trabajo diario y qué es catálogo. El
          atleta usa un único grupo sin título, así el render es el mismo. */}
      <nav className="hidden md:flex flex-col w-[var(--sidebar-w)] bg-bg h-screen fixed left-0 top-[var(--header-h)] border-r border-hairline p-6 justify-between select-none overflow-y-auto">
        <div className="flex flex-col gap-6">
          {navGroups.map((group, gi) => (
            <div key={group.title ?? gi} className="flex flex-col gap-1">
              {group.title && (
                <h2 className="px-4 pb-2 font-sans text-caption font-bold uppercase tracking-widest text-ink-2/60">
                  {group.title}
                </h2>
              )}
              {group.items.map((tab) => {
                const activa = esActiva(tab.id);
                return (
                  <button
                    key={tab.id}
                    onClick={() => goToNav(tab.id)}
                    aria-current={activa ? 'page' : undefined}
                    className={`flex items-center gap-4 p-3 rounded-control transition-all text-left group ${activa ? 'bg-accent text-black font-bold' : 'text-ink-2 hover:bg-raised hover:text-white'}`}
                  >
                    <Icon name={tab.icon} size="l" filled={activa} className="group-hover:scale-110 transition-transform" />
                    <span className="font-sans text-label uppercase tracking-wider font-bold flex-1">{tab.label}</span>
                    {tab.id === 'reviews' && pendingCount > 0 && (
                      <span className="w-1.5 h-1.5 rounded-full bg-data animate-pulse"></span>
                    )}
                    {tab.id === 'home' && !isCoach && gimnasioPendiente && (
                      <span className="w-1.5 h-1.5 rounded-full bg-danger" aria-label="Catálogo de máquinas a medias"></span>
                    )}
                  </button>
                );
              })}
            </div>
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

                {/* Biblioteca: los cuatro catálogos como rutas hijas, con la
                    sección en la URL para que un refresco la recupere. */}
                <Route path="/library" element={<CoachLibraryScreen />}>
                  <Route index element={<Navigate to="ejercicios" replace />} />
                  <Route path="ejercicios" element={<TrainingCoachScreen coachId={profile.userId} />} />
                  <Route path="nutricion" element={<NutritionCoachScreen coachId={profile.userId} />} />
                  <Route path="academia" element={<AcademyCoachScreen coachId={profile.userId} coachEmail={profile.email} />} />
                  <Route path="cardio" element={<CardioCoachScreen coachEmail={profile.email} />} />
                  <Route path="*" element={<Navigate to="/library/ejercicios" replace />} />
                </Route>

                {/* Rutas antiguas de los catálogos. Se quedan vivas —las
                    notificaciones y los enlaces guardados siguen apuntando
                    aquí— pero ahora solo redirigen a su pestaña. */}
                <Route path="/training" element={<Navigate to="/library/ejercicios" replace />} />
                <Route path="/nutrition" element={<Navigate to="/library/nutricion" replace />} />
                <Route path="/academy" element={<Navigate to="/library/academia" replace />} />
                <Route path="/cardio" element={<Navigate to="/library/cardio" replace />} />
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
                // 03-5 / 04-14. Esto era literalmente `() => setCurrentUser(null)`:
                // la caché de react-query, ~50 claves enforma_* (muchas globales,
                // no por usuario) y la caché persistente de Firestore con peso,
                // perímetros, cuestionarios y dietas se quedaban en el dispositivo.
                // En un móvil compartido, fuga real de datos de salud de otra
                // persona. La limpieza termina recargando; setCurrentUser se
                // queda como red por si la recarga no llegara a ocurrir.
                onLogOut={() => {
                  setCurrentUser(null);
                  void limpiarDatosDeSesion(queryClient);
                }}
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
          Para el atleta son los 5 destinos del handoff; el coach baja de 7 a
          4 (Inicio · Revisiones · CRM · Biblioteca), que es lo que cierra
          R10: las etiquetas vuelven a los 11 px del Design System y se retira
          la excepción de los 10 px. */}
      <nav
        ref={navTabsRef}
        className="md:hidden fixed bottom-0 w-full z-[var(--z-nav)] flex items-stretch gap-1 px-2 py-4 bg-bg/92 backdrop-blur-md border-t border-hairline select-none"
        style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom, 20px))' }}
      >
        {mobileTabs.map((tab) => {
          const activa = esActiva(tab.id);
          const insignia = tab.id === 'reviews' ? Math.min(pendingCount, 99) : 0;
          return (
            <button
              key={tab.id}
              ref={el => { if (['training', 'nutrition', 'academy'].includes(tab.id)) registerTourTarget(`nav-tab-${tab.id}`, el); }}
              onClick={() => goToNav(tab.id)}
              className="relative flex flex-1 min-w-0 flex-col items-center justify-center gap-1"
            >
              <span
                className={
                  'relative flex transition-transform duration-(--duration-state) ease-brand '
                  + (activa ? '-translate-y-px text-accent' : 'text-ink-2')
                }
              >
                <Icon name={tab.icon} size="l" filled={activa} />
                {tab.id === 'home' && !isCoach && gimnasioPendiente && (
                  <span
                    aria-label="Tienes el catálogo de máquinas a medias"
                    className="absolute -top-0.5 -right-1.5 h-2 w-2 rounded-full bg-danger"
                  />
                )}
                {insignia > 0 && (
                  <span className="absolute -top-1 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 font-mono text-caption font-bold leading-none text-on-accent">
                    {insignia}
                  </span>
                )}
              </span>
              {/* R10 cerrado: 11 px, el suelo del Design System. Cabía con los
                  5 destinos del atleta y ahora también con los 4 del coach —
                  la excepción de los 10 px que hubo aquí era consecuencia de
                  los 7 destinos, no del componente. */}
              <span className={`font-sans text-caption uppercase font-bold leading-none truncate w-full text-center ${activa ? 'text-accent' : 'text-ink-2'}`}>
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
          {/* goToNav, no goToTab: "Ir a Ejercicios" salta directo a su
              pestaña de Biblioteca en vez de pasar por el redirect. */}
          <CommandPalette onNavigateTab={goToNav} />
        </Suspense>
      )}

    </TutorialEngine>
    </div>
  );
}
