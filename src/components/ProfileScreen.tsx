import React, { useState, useMemo, Suspense, lazy } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query';
import { UserProfile, Questionnaire, OnboardingData, WeightCheckIn, NotificationType } from '../types';
import { updateUserProfile, getAssignmentsForAthlete, getResponsesForAthlete, getQuestionnaireById, getOnboarding, updateOnboarding } from '../dbService';
import { signOut, auth } from '../firebase';
import { useToast } from '../hooks/useToast';
import { estadoConsentimiento, registrarConsentimiento } from '../ai/consentimientoIA';
/* 06-6. Estos tres paneles arrastran recharts —344 KB— y se importaban en
   estático, así que el atleta los descargaba y evaluaba aunque entrase a
   Perfil solo a cambiarse el avatar. Van en diferido: además de los bloques,
   Perfil es una pantalla con orden configurable donde varios de ellos ni
   siquiera se renderizan si el atleta los tiene ocultos. */
const BodyweightPanel = lazy(() => import('./BodyweightPanel'));
const BodyMeasurementsPanel = lazy(() => import('./BodyMeasurementsPanel'));
const QuestionnaireChartsPanel = lazy(() => import('./QuestionnaireChartsPanel'));
import FoodPreferencesPanel from './FoodPreferencesPanel';
import MenuPreferencesPanel from './MenuPreferencesPanel';
import MiFichaCard from './MiFichaCard';
import CoachesScreen from './CoachesScreen';
import EliminarCuentaDialog from './EliminarCuentaDialog';
import CheckInScreen from './CheckInScreen';
import AthleteRoadmapScreen from './AthleteRoadmapScreen';
import StatTile from './StatTile';
import MiGimnasioPanel from '../features/gimnasio/MiGimnasioPanel';
import { useBodyMeasurements } from '../hooks/useBodyMeasurements';
import { useTourTarget } from '../features/tutorial/TourTargetContext';
import { useTutorialEngine } from '../features/tutorial/TutorialEngine';
import { Icon, Button, PageHeader, ListRow, Input, Sheet, Skeleton, Tabs } from './ui';

interface ProfileScreenProps {
  profile: UserProfile;
  isCoach: boolean;
  checkins: WeightCheckIn[];
  onRefreshProfile: () => void;
  onLogOut: () => void;
}

// Perfil del atleta en submenú de pestañas (antes: "Progreso" y "Road map"
// eran desplegables, y el resto de bloques un scroll único apilado — Dani
// pidió que fueran seleccionables, no un scroll largo). Las pantallas que se
// embeben (CheckInScreen, AthleteRoadmapScreen, paneles con gráfica) van tal
// cual, sin reescribirlas: cero riesgo de regresión en su lógica.
type ProfileTab = 'resumen' | 'progreso' | 'roadmap' | 'preferencias' | 'gimnasio';
const PROFILE_TABS: { id: ProfileTab; label: string; icon: string }[] = [
  { id: 'resumen',      label: 'Resumen',       icon: 'person' },
  { id: 'progreso',     label: 'Progreso',      icon: 'edit_note' },
  { id: 'roadmap',      label: 'Road map',      icon: 'map' },
  { id: 'preferencias', label: 'Preferencias',  icon: 'restaurant' },
  { id: 'gimnasio',     label: 'Mi gimnasio',   icon: 'fitness_center' },
];

// Ajustes › Notificaciones (F3.13e) — SOLO los tipos que de verdad se generan
// hacia el coach hoy (ver los `createNotificationDeduped(..., {recipientEmail:
// coachEmail/COACH_EMAIL})` reales en ClientsScreen/CheckInScreen/HrTestsPanel).
// El mockup del handoff pedía también "Entreno completado" y "Mensaje nuevo"
// — no existen (no hay push real ni mensajería coach↔atleta en la app), así
// que no se fingen aquí.
const COACH_NOTIF_TYPES: { type: NotificationType; label: string; sub: string }[] = [
  { type: 'checkin_late', label: 'Check-in atrasado', sub: 'Un atleta lleva más de una semana sin enviarlo' },
  { type: 'plan_expiring', label: 'Plan por vencer', sub: 'El plan de un atleta caduca pronto, o ya venció' },
  { type: 'questionnaire_submitted', label: 'Cuestionario enviado', sub: 'Un atleta envía una revisión' },
  { type: 'hrtest_pending', label: 'Test de FC pendiente', sub: 'Un atleta espera tu aprobación de zonas' },
];

/** Hueco mientras baja el trozo de recharts. Alto fijo para que el bloque no
 *  dé un salto cuando el panel real entra — el orden de bloques de esta
 *  pantalla lo configura el atleta, y un reflow aquí desplaza todo lo de abajo. */
function PanelCargando() {
  return <Skeleton className="w-full h-48 rounded-surface" />;
}

function Switch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      style={{ padding: '2px' }}
      className={`w-11 h-6 rounded-full shrink-0 transition-colors ${on ? 'bg-accent' : 'bg-white/12'}`}
    >
      <span
        className={`block w-5 h-5 rounded-full bg-bg transition-transform ${on ? 'translate-x-5' : 'translate-x-0'}`}
      />
    </button>
  );
}

export default function ProfileScreen({ profile, isCoach, checkins, onRefreshProfile, onLogOut }: ProfileScreenProps) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const tutorial = useTutorialEngine();
  const progressRowRef = useTourTarget('profile-progress-row');
  const settingsActionRef = useTourTarget('profile-settings-action');
  const [showCoaches, setShowCoaches] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showEliminarCuenta, setShowEliminarCuenta] = useState(false);
  const [searchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const initialTab: ProfileTab = PROFILE_TABS.some(t => t.id === requestedTab) ? (requestedTab as ProfileTab) : 'resumen';
  const [activeTab, setActiveTab] = useState<ProfileTab>(initialTab);
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [targetWeight, setTargetWeight] = useState(profile.targetWeight.toString());
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [notifPrefs, setNotifPrefs] = useState(profile.notificationPrefs ?? {});

  const toggleNotifPref = async (type: NotificationType) => {
    const next = { ...notifPrefs, [type]: notifPrefs[type] === false ? true : false };
    setNotifPrefs(next);
    try {
      await updateUserProfile(profile.userId, { notificationPrefs: next });
      onRefreshProfile();
    } catch (err) {
      console.error(err);
      showToast('No se pudo guardar la preferencia.');
      setNotifPrefs(notifPrefs);
    }
  };

  // Questionnaire data for charts
  const { data: assignments = [] } = useQuery({
    queryKey: ['assignmentsForAthlete', profile.email],
    queryFn: () => getAssignmentsForAthlete(profile.email),
  });
  const { data: responses = [] } = useQuery({
    queryKey: ['responsesForAthlete', profile.email],
    queryFn: () => getResponsesForAthlete(profile.email),
  });
  const activeQuestionnaireIds = useMemo(
    () => [...new Set(assignments.filter(a => a.active).map(a => a.questionnaireId))],
    [assignments]
  );
  // One cache entry per questionnaire id, same key PendingTasksPanel uses for
  // the same lookup — reuses/gets reused by it instead of fetching twice.
  const questionnaireQueries = useQueries({
    queries: activeQuestionnaireIds.map(id => ({
      queryKey: ['questionnaireById', id],
      queryFn: (): Promise<Questionnaire | null> => getQuestionnaireById(id),
    })),
  });
  const questionnaires = useMemo(
    () => questionnaireQueries.map(q => q.data).filter((q): q is Questionnaire => !!q),
    [questionnaireQueries]
  );

  // Medidas corporales — mismo query key que BodyMeasurementsPanel (comparten
  // caché), solo para saber si hay algo que mostrar antes de renderizar el bloque.
  const { all: bodyMeasurements } = useBodyMeasurements(profile.email);

  // Food preferences + ficha editing
  const onboardingKey = ['onboarding', profile.email] as const;
  const { data: onboarding = null } = useQuery({
    queryKey: onboardingKey,
    queryFn: () => getOnboarding(profile.email),
  });
  // A-2. Retirar el consentimiento tiene que ser tan fácil como darlo.
  const consentimientoIA = estadoConsentimiento(onboarding);
  const cambiarConsentimientoIA = async (aceptado: boolean) => {
    if (!onboarding) return;
    const anterior = onboarding.consentimientoIA;
    const consentimiento = registrarConsentimiento(aceptado, new Date().toISOString());
    queryClient.setQueryData<OnboardingData | null>(onboardingKey, prev =>
      prev ? { ...prev, consentimientoIA: consentimiento } : prev);
    try {
      await updateOnboarding({ ...onboarding, consentimientoIA: consentimiento });
      showToast(aceptado ? 'Guardado. Tu entrenador ya puede usar el asistente.' : 'Guardado. Tus datos dejan de enviarse.');
    } catch (err) {
      console.error('No se pudo guardar el consentimiento de IA:', err);
      queryClient.setQueryData<OnboardingData | null>(onboardingKey, prev =>
        prev ? { ...prev, consentimientoIA: anterior } : prev);
      showToast('No se pudo guardar. Inténtalo otra vez.');
    }
  };


  const streakDays = profile.currentStreak;
  const maxStreakDays = profile.maxStreak;

  const handleSignOut = async () => {
    // 03-5. `onLogOut` estaba DENTRO del try, así que un `signOut` que lanzara
    // —sesión ya caducada en el servidor, por ejemplo— dejaba a la persona
    // dentro de la app, con todos sus datos en pantalla y sin más aviso que una
    // línea en una consola que nadie mira. Ahora el cierre ocurre pase lo que
    // pase: es justo el caso en el que más falta hace.
    try {
      await signOut(auth);
    } catch (err) {
      console.error('signOut falló; se cierra la sesión en local igualmente:', err);
    } finally {
      onLogOut();
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
        avatarUrl,
        // targetWeight es una meta de ATLETA — el coach no tiene una, y el
        // campo ni se le muestra (ver el <form> más abajo); no se toca en su
        // guardado para no escribir un valor obsoleto de vuelta.
        ...(isCoach ? {} : { targetWeight: parseFloat(targetWeight) || profile.targetWeight }),
      });
      setSuccess(isCoach ? '¡Perfil actualizado!' : '¡Perfil atleta actualizado correctamente!');
      onRefreshProfile();
    } catch (err) {
      console.error(err);
      showToast('No se pudo actualizar el perfil.');
    } finally {
      setLoading(false);
    }
  };

  function renderTab(): React.ReactNode {
    switch (activeTab) {
      case 'resumen':
        return (
          <div className="space-y-4">
            <div className="bg-surface border border-hairline rounded-canvas p-5 relative overflow-hidden flex flex-col gap-5">
              <div className="absolute top-0 right-0 w-32 h-32 bg-accent/5 blur-3xl rounded-full pointer-events-none"></div>

              {/* Avatar + XP */}
              <div className="flex items-center gap-4">
                <div className="relative inline-block flex-shrink-0">
                  <div className="w-16 h-16 rounded-full border-2 border-accent overflow-hidden">
                    <img src={profile.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                  </div>
                  <div className="absolute -bottom-1 -right-1 bg-accent text-black text-caption font-bold px-2 rounded-full leading-tight whitespace-nowrap shadow">Lv {profile.level}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-sans font-bold text-title-m text-ink">{profile.displayName}</h3>
                  <p className="font-mono text-caption text-ink-2 truncate">{profile.email}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="flex-1 h-2 bg-raised rounded-full overflow-hidden">
                      <div className="h-full bg-accent" style={{ width: `${Math.min(100, (profile.xp / 400) * 100)}%` }}></div>
                    </div>
                    <span className="font-mono text-caption text-ink-2 flex-shrink-0">{profile.xp}/400 XP</span>
                  </div>
                </div>
              </div>

              {/* Streak + level stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatTile icon="local_fire_department" label="Racha actual" value={`${streakDays}d`} />
                <StatTile icon="military_tech" label="Racha máxima" value={`${maxStreakDays}d`} />
                <StatTile icon="workspace_premium" label="Nivel" value={profile.level} />
                <StatTile icon="flag" label="Meta" value={`${profile.targetWeight}kg`} />
              </div>
            </div>

            <MiFichaCard profile={profile} />
          </div>
        );

      case 'progreso':
        return (
          <div className="space-y-4">
            <div className="bg-surface border border-hairline rounded-surface p-4 sm:p-5">
              <CheckInScreen profile={profile} checkins={checkins} />
            </div>
            <div className="bg-surface border border-hairline p-4 sm:p-6 rounded-canvas">
              <Suspense fallback={<PanelCargando />}><BodyweightPanel athleteEmail={profile.email} /></Suspense>
            </div>
            {bodyMeasurements.some(m => m.metricKey !== 'bodyweight') && (
              <div className="bg-surface border border-hairline p-4 sm:p-6 rounded-canvas space-y-3">
                <h3 className="font-sans font-bold text-title-s text-ink flex items-center gap-2">
                  <Icon name="straighten" size="m" className="text-accent" />
                  Mediciones
                </h3>
                <Suspense fallback={<PanelCargando />}><BodyMeasurementsPanel athleteEmail={profile.email} /></Suspense>
              </div>
            )}
            {questionnaires.length > 0 && responses.length > 0 && (
              <div className="bg-surface border border-hairline p-4 sm:p-6 rounded-canvas">
                <Suspense fallback={<PanelCargando />}><QuestionnaireChartsPanel questionnaires={questionnaires} responses={responses} /></Suspense>
              </div>
            )}
          </div>
        );

      case 'roadmap':
        return <AthleteRoadmapScreen profile={profile} />;

      case 'preferencias':
        return (
          <div className="space-y-4">
            {onboarding && (
              <div className="bg-surface border border-hairline p-5 rounded-surface">
                <h3 className="font-sans font-bold text-title-s text-white flex items-center gap-2 mb-4">
                  <Icon name="restaurant" size="m" className="text-accent" />
                  Preferencias alimentarias
                </h3>
                <FoodPreferencesPanel
                  athleteEmail={profile.email}
                  initialLiked={onboarding.likedFoods}
                  initialDisliked={onboarding.dislikedFoods}
                  allergies={onboarding.allergies}
                  onSaved={(liked, disliked) =>
                    queryClient.setQueryData<OnboardingData | null>(onboardingKey, prev => prev ? { ...prev, likedFoods: liked, dislikedFoods: disliked } : prev)
                  }
                />
              </div>
            )}
            <MenuPreferencesPanel athleteEmail={profile.email} />
          </div>
        );

      case 'gimnasio':
        return <MiGimnasioPanel email={profile.email} />;
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Mi Perfil"
        subtitle={isCoach ? 'Tu cuenta y tus ajustes.' : 'Progreso, gráficas y ficha.'}
        // La acción es un botón de solo-icono, no le hace falta renglón
        // propio: actionInline la mete en la fila del título, a la misma
        // altura que "MI PERFIL", en vez de apilarse debajo con un hueco
        // vacío al lado (comportamiento por defecto de PageHeader, pensado
        // para acciones con texto).
        actionInline
        action={<span ref={settingsActionRef}><Button variant="ghost" size="m" icon="settings" onClick={() => setShowSettings(true)} label="Ajustes" /></span>}
      />

      {/* Tarjeta de identidad del coach (F3.13e) — antes esta pantalla le
          pintaba al coach los mismos bloques de gamificación/peso del
          atleta (XP, racha, meta de peso), que no significan nada para él.
          Fuera del listado reordenable a propósito: no es contenido de
          progreso, es quién eres. */}
      {isCoach && (
        <div className="bg-surface border border-hairline rounded-canvas p-5 flex items-center gap-4">
          <img src={profile.avatarUrl} alt="Avatar" className="w-14 h-14 rounded-full object-cover border border-accent/40 shrink-0" />
          <div className="min-w-0">
            <h3 className="font-sans font-bold text-title-m text-white truncate">{profile.displayName}</h3>
            <p className="font-sans text-caption text-ink-2 truncate">{profile.email}</p>
            <p className="font-sans text-caption text-accent uppercase tracking-widest mt-1">Coach</p>
          </div>
        </div>
      )}

      {/* Submenú de pestañas (antes: "Progreso" y "Road map" eran desplegables
          y el resto un scroll único apilado — Dani pidió que fueran
          seleccionables). Cada pestaña embebe pantallas existentes tal cual,
          sin reescribirlas. */}
      {!isCoach && (
        <div ref={progressRowRef}>
          <Tabs items={PROFILE_TABS} value={activeTab} onChange={id => setActiveTab(id as ProfileTab)} label="Secciones de Perfil" />
          <div className="mt-4">{renderTab()}</div>
        </div>
      )}

      {/* ── Ajustes (F3.11, módulo 11: "vive detrás de un icono en la
          cabecera, nunca en la barra inferior") — nombre/avatar/meta,
          entrenadores (coach), "Repetir el tour" (F3.12/T7.c, más abajo) y
          cerrar sesión, la única acción destructiva de la pantalla en texto
          rojo sobre fondo neutro, no un botón relleno. */}
      <Sheet open={showSettings} onClose={() => setShowSettings(false)} title="Ajustes">
        <div className="space-y-6">
          <form onSubmit={handleUpdate} className="space-y-4">
            <Input label={isCoach ? 'Nombre' : 'Nombre deportivo'} required value={displayName} onChange={setDisplayName} />
            {!isCoach && (
              <div>
                <label className="block font-sans text-caption text-ink-2 uppercase mb-1">Meta de peso personal (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  value={targetWeight}
                  onChange={(e) => setTargetWeight(e.target.value)}
                  className="w-full bg-raised border border-hairline rounded-control p-3 text-title-s text-white focus:outline-none focus:border-accent"
                />
              </div>
            )}
            <Input label="Avatar (URL de imagen)" type="url" value={avatarUrl} onChange={setAvatarUrl} />
            <Button type="submit" disabled={loading} loading={loading} loadingLabel="Guardando" fullWidth>Guardar cambios</Button>
            {success && <p className="text-label font-sans font-bold text-accent text-center">{success}</p>}
          </form>

          {/* A-2. El aviso de consentimiento promete «puedes cambiarlo en
              Perfil → Ajustes», así que tiene que estar aquí de verdad. Un
              consentimiento que no se puede retirar con la misma facilidad con
              la que se dio no es un consentimiento válido (art. 7.3 RGPD). */}
          {!isCoach && onboarding && (
            <div className="space-y-2">
              <h3 className="font-sans font-bold text-title-s text-white flex items-center gap-2">
                <Icon name="smart_toy" size="m" className="text-accent" />
                Análisis con IA
              </h3>
              <div className="bg-surface border border-hairline rounded-surface p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-sans text-caption font-bold text-white">
                    {consentimientoIA === 'aceptado' ? 'Permitido' : 'No permitido'}
                  </p>
                  <p className="font-sans text-caption text-ink-3">
                    {consentimientoIA === 'aceptado'
                      ? 'Tu entrenador puede analizar tus datos con el asistente de IA.'
                      : 'Tus datos no se envían al asistente de IA. La app funciona igual.'}
                  </p>
                </div>
                <Switch
                  on={consentimientoIA === 'aceptado'}
                  onToggle={() => cambiarConsentimientoIA(consentimientoIA !== 'aceptado')}
                />
              </div>
            </div>
          )}

          {isCoach && (
            <div className="space-y-2">
              <h3 className="font-sans font-bold text-title-s text-white flex items-center gap-2">
                <Icon name="notifications" size="m" className="text-accent" />
                Notificaciones
              </h3>
              <div className="bg-surface border border-hairline rounded-surface divide-y divide-hairline">
                {COACH_NOTIF_TYPES.map(n => (
                  <div key={n.type} className="flex items-center justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <p className="font-sans text-caption font-bold text-white">{n.label}</p>
                      <p className="font-sans text-caption text-ink-3">{n.sub}</p>
                    </div>
                    <Switch on={notifPrefs[n.type] !== false} onToggle={() => toggleNotifPref(n.type)} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {isCoach && (
            showCoaches ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-sans font-bold text-title-s text-white flex items-center gap-2">
                    <Icon name="groups" size="m" className="text-accent" />
                    Entrenadores
                  </h3>
                  <Button variant="ghost" size="s" onClick={() => setShowCoaches(false)} icon="close" label="Cerrar" />
                </div>
                <CoachesScreen currentUserId={profile.userId} currentUserEmail={profile.email} />
              </div>
            ) : (
              <ListRow
                onClick={() => setShowCoaches(true)}
                className="rounded-control border bg-surface border-hairline"
                leading={<Icon name="groups" size="m" className="text-accent" />}
                title="Entrenadores"
                chevron
              />
            )
          )}

          {!isCoach && (
            <ListRow
              onClick={() => { setShowSettings(false); tutorial.restart(); }}
              className="rounded-control border bg-surface border-hairline"
              leading={<Icon name="school" size="m" className="text-accent" />}
              title="Repetir el tour"
              subtitle="Vuelve a empezar desde el paso 01"
              chevron
            />
          )}

          {/* Legales. Apple (5.1.1.i) y Google exigen el enlace a la política de
              privacidad DENTRO de la app, no solo en la ficha de la tienda; y
              Google exige además que el camino de borrado sea accesible desde
              aquí. Son páginas estáticas fuera de la SPA, así que se abren en el
              navegador del sistema: `target="_blank"` con `rel="noopener"` para
              no dejarles acceso a `window.opener`. */}
          <div className="pt-2 mt-2 border-t border-hairline flex flex-col">
            <a
              href="/privacidad"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 py-2 text-body-s font-sans text-ink-3 hover:text-ink-2"
            >
              <Icon name="shield" size="s" />
              Política de privacidad
            </a>
            <a
              href="/terminos"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 py-2 text-body-s font-sans text-ink-3 hover:text-ink-2"
            >
              <Icon name="gavel" size="s" />
              Términos de uso
            </a>
          </div>

          <button onClick={handleSignOut} className="w-full flex items-center justify-center gap-2 py-3 text-label font-sans font-bold text-danger">
            <Icon name="logout" size="m" />
            Cerrar sesión
          </button>

          {/* B-1. Apple (5.1.1.v) exige que una app que crea cuentas ofrezca
              borrarlas DENTRO de la app, y no admite «desactivar» ni «escríbenos».
              Va debajo de «Cerrar sesión» y en tono apagado a propósito: tiene
              que ser encontrable sin esfuerzo, pero no competir con la acción que
              casi todo el mundo viene a hacer aquí. */}
          {!isCoach && (
            <button
              onClick={() => setShowEliminarCuenta(true)}
              className="w-full flex items-center justify-center gap-2 py-3 text-body-s font-sans text-ink-3 hover:text-danger transition-colors"
            >
              <Icon name="delete_forever" size="s" />
              Eliminar mi cuenta
            </button>
          )}
        </div>
      </Sheet>

      <EliminarCuentaDialog
        open={showEliminarCuenta}
        onClose={() => setShowEliminarCuenta(false)}
        email={profile.email}
      />
    </div>
  );
}
