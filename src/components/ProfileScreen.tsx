import React, { useState, useMemo, Suspense, lazy } from 'react';
import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query';
import { UserProfile, Questionnaire, OnboardingData, WeightCheckIn, NotificationType } from '../types';
import { updateUserProfile, getAssignmentsForAthlete, getResponsesForAthlete, getQuestionnaireById, getOnboarding } from '../dbService';
import { signOut, auth } from '../firebase';
import { useToast } from '../hooks/useToast';
/* 06-6. Estos tres paneles arrastran recharts —344 KB— y se importaban en
   estático, así que el atleta los descargaba y evaluaba aunque entrase a
   Perfil solo a cambiarse el avatar. Van en diferido: además de los bloques,
   Perfil es una pantalla con orden configurable donde varios de ellos ni
   siquiera se renderizan si el atleta los tiene ocultos. */
const BodyweightPanel = lazy(() => import('./BodyweightPanel'));
const BodyMeasurementsPanel = lazy(() => import('./BodyMeasurementsPanel'));
const QuestionnaireChartsPanel = lazy(() => import('./QuestionnaireChartsPanel'));
import FoodPreferencesPanel from './FoodPreferencesPanel';
import OnboardingForm from './OnboardingForm';
import CoachesScreen from './CoachesScreen';
import EliminarCuentaDialog from './EliminarCuentaDialog';
import CheckInScreen from './CheckInScreen';
import AthleteRoadmapScreen from './AthleteRoadmapScreen';
import StatTile from './StatTile';
import MiGimnasioPanel from '../features/gimnasio/MiGimnasioPanel';
import { useBodyMeasurements } from '../hooks/useBodyMeasurements';
import { useTourTarget } from '../features/tutorial/TourTargetContext';
import { useTutorialEngine } from '../features/tutorial/TutorialEngine';
import { Icon, Button, PageHeader, ListRow, Input, Sheet, Skeleton } from './ui';

interface ProfileScreenProps {
  profile: UserProfile;
  isCoach: boolean;
  checkins: WeightCheckIn[];
  onRefreshProfile: () => void;
  onLogOut: () => void;
}

// Progreso y Road map (F3.11, módulo 11): "Perfil absorbe Check-in y Road
// map" se cumple embebiendo las pantallas existentes tal cual —son
// autocontenidas, solo necesitan `profile`/`checkins`— dentro de una sección
// expandible, no reescribiéndolas ni saltando a otra ruta. Cero riesgo de
// regresión en su lógica (peso, fotos, cuestionarios, hitos), que se queda
// intacta; lo único nuevo es DÓNDE vive en la app.
type ExpandedSection = 'progress' | 'roadmap' | null;

// The reorderable content blocks on this screen — order persisted per-athlete on
// UserProfile.dashboardOrder. Not every block is visible for every athlete/coach
// (e.g. "ficha" only shows for athletes), so reorder controls are positioned
// among only the currently-visible blocks, not this full fixed list.
type BlockId = 'gamification' | 'bodyweight' | 'measurements' | 'questionnaires' | 'ficha' | 'preferences' | 'gimnasio';
const DEFAULT_BLOCK_ORDER: BlockId[] = ['gamification', 'bodyweight', 'measurements', 'questionnaires', 'ficha', 'preferences', 'gimnasio'];

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
  const [expandedSection, setExpandedSection] = useState<ExpandedSection>(null);
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
  const [editingFicha,  setEditingFicha]  = useState(false);

  // Block reordering
  const [reorderMode, setReorderMode] = useState(false);

  const streakDays = profile.currentStreak;
  const maxStreakDays = profile.maxStreak;

  const blockOrder = useMemo<BlockId[]>(() => {
    const saved = (profile.dashboardOrder ?? []).filter((id): id is BlockId => DEFAULT_BLOCK_ORDER.includes(id as BlockId));
    const missing = DEFAULT_BLOCK_ORDER.filter(id => !saved.includes(id));
    return [...saved, ...missing];
  }, [profile.dashboardOrder]);

  const moveBlock = async (visibleIds: BlockId[], id: BlockId, dir: -1 | 1) => {
    const from = visibleIds.indexOf(id);
    const to = from + dir;
    if (to < 0 || to >= visibleIds.length) return;
    const reordered = [...visibleIds];
    [reordered[from], reordered[to]] = [reordered[to], reordered[from]];
    // Splice the reordered visible ids back into the full order, keeping any
    // currently-hidden blocks in their existing relative position.
    let vi = 0;
    const nextOrder = blockOrder.map(bid => visibleIds.includes(bid) ? reordered[vi++] : bid);
    await updateUserProfile(profile.userId, { dashboardOrder: nextOrder }).catch(console.error);
    onRefreshProfile();
  };

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

  const visibleBlocks = blockOrder.filter(id => {
    if (id === 'questionnaires') return questionnaires.length > 0 && responses.length > 0;
    if (id === 'measurements') return bodyMeasurements.some(m => m.metricKey !== 'bodyweight');
    if (id === 'ficha') return !isCoach;
    if (id === 'preferences') return !isCoach && !!onboarding && !editingFicha;
    // F3.13e: 'gamification' (XP/nivel/racha) y 'bodyweight' son datos de
    // ATLETA — antes se pintaban igual para el coach (bug real, sin sentido:
    // un coach no tiene meta de peso ni racha de check-ins). La tarjeta de
    // identidad del coach vive aparte, fuera de este listado reordenable.
    if (id === 'gamification' || id === 'bodyweight') return !isCoach;
    // El gimnasio es del atleta: el coach ve el de cada cliente en su Hub, no aquí.
    if (id === 'gimnasio') return !isCoach;
    return true;
  });

  function renderBlock(id: BlockId): React.ReactNode {
    switch (id) {
      case 'bodyweight':
        return (
          <div className="bg-surface border border-hairline p-4 sm:p-6 rounded-canvas">
            <Suspense fallback={<PanelCargando />}><BodyweightPanel athleteEmail={profile.email} /></Suspense>
          </div>
        );

      case 'measurements':
        return (
          <div className="bg-[#181816] border border-white/7 p-4 sm:p-6 rounded-3xl space-y-3">
            <h3 className="font-sans font-bold text-base text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-[#fbcb1a] text-base">straighten</span>
              Mediciones
            </h3>
            <Suspense fallback={<PanelCargando />}><BodyMeasurementsPanel athleteEmail={profile.email} /></Suspense>
          </div>
        );

      case 'gamification':
        return (
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
                <h3 className="font-sans font-bold text-title-m text-white">{profile.displayName}</h3>
                <p className="font-mono text-caption text-ink-2 truncate">{profile.email}</p>
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex-1 h-2 bg-raised rounded-full overflow-hidden">
                    <div className="h-full bg-data" style={{ width: `${Math.min(100, (profile.xp / 400) * 100)}%` }}></div>
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
              <StatTile icon="flag" label="Meta" value={`${profile.targetWeight}kg`} accent="var(--color-data)" />
            </div>
          </div>
        );

      case 'gimnasio':
        return <MiGimnasioPanel email={profile.email} />;

      case 'questionnaires':
        return (
          <div className="bg-surface border border-hairline p-4 sm:p-6 rounded-canvas">
            <Suspense fallback={<PanelCargando />}><QuestionnaireChartsPanel questionnaires={questionnaires} responses={responses} /></Suspense>
          </div>
        );

      case 'ficha':
        return editingFicha ? (
          <div className="bg-surface border border-hairline p-4 rounded-surface">
            <OnboardingForm
              athleteEmail={profile.email}
              initialData={onboarding}
              onSaved={data => { queryClient.setQueryData(onboardingKey, data); setEditingFicha(false); }}
              onCancel={() => setEditingFicha(false)}
            />
          </div>
        ) : (
          <div className="bg-surface border border-hairline p-5 rounded-surface flex items-center justify-between gap-4">
            <div>
              <h3 className="font-sans font-bold text-title-s text-white flex items-center gap-2">
                <Icon name="assignment_ind" size="m" className="text-accent" />
                {onboarding ? 'Mi ficha de iniciación' : 'Ficha de iniciación'}
              </h3>
              <p className="font-mono text-caption text-ink-3 mt-1">
                {onboarding
                  ? `Actualizada el ${new Date(onboarding.completedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}`
                  : 'Completa tu ficha para que tu entrenador personalice tu plan.'}
              </p>
            </div>
            <Button onClick={() => setEditingFicha(true)} icon="edit_note" className="shrink-0">
              {onboarding ? 'Editar' : 'Completar'}
            </Button>
          </div>
        );

      case 'preferences':
        if (!onboarding) return null;
        return (
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
        );
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mi Perfil"
        subtitle={isCoach ? 'Tu cuenta y tus ajustes.' : 'Progreso, gráficas y ficha.'}
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

      {/* ── Progreso y Road map absorbidos (F3.11, módulo 11: "Perfil absorbe
          Check-in y Road map") — CheckInScreen/AthleteRoadmapScreen se
          embeben enteros al expandir, no se reescriben ni se navega fuera. */}
      {!isCoach && (
        <div className="flex flex-col gap-2" ref={progressRowRef}>
          <ListRow
            onClick={() => setExpandedSection(v => v === 'progress' ? null : 'progress')}
            className="rounded-control border bg-surface border-hairline"
            leading={<Icon name="edit_note" size="m" className="text-accent" />}
            title="Progreso"
            subtitle="Peso, fotos y cuestionarios de revisión"
            trailing={<Icon name={expandedSection === 'progress' ? 'expand_less' : 'expand_more'} size="m" className="text-ink-2" />}
          />
          {expandedSection === 'progress' && (
            <div className="bg-surface border border-hairline rounded-surface p-4 sm:p-5">
              <CheckInScreen profile={profile} checkins={checkins} />
            </div>
          )}
          <ListRow
            onClick={() => setExpandedSection(v => v === 'roadmap' ? null : 'roadmap')}
            className="rounded-control border bg-surface border-hairline"
            leading={<Icon name="map" size="m" className="text-accent" />}
            title="Road map"
            subtitle="Tu plan, fases y retos semanales"
            trailing={<Icon name={expandedSection === 'roadmap' ? 'expand_less' : 'expand_more'} size="m" className="text-ink-2" />}
          />
          {expandedSection === 'roadmap' && (
            <div className="bg-surface border border-hairline rounded-surface p-4 sm:p-5">
              <AthleteRoadmapScreen profile={profile} />
            </div>
          )}
        </div>
      )}

      {/* ── Reorder toggle ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-end">
        <button
          onClick={() => setReorderMode(v => !v)}
          className={`flex items-center gap-2 px-3 py-2 rounded-control font-mono text-caption font-bold uppercase tracking-wider border transition-all ${
            reorderMode
              ? 'bg-accent/10 border-accent/40 text-accent'
              : 'border-hairline text-ink-2 hover:text-white hover:border-strong'
          }`}
        >
          <Icon name={reorderMode ? 'check' : 'reorder'} size="s" />
          {reorderMode ? 'Listo' : 'Reordenar bloques'}
        </button>
      </div>

      {/* ── Reorderable content blocks ───────────────────────────────────────── */}
      {visibleBlocks.map((id, idx) => (
        <div key={id}>
          {reorderMode && (
            <div className="flex items-center justify-end gap-1 mb-2">
              <Button
                variant="secondary" size="s"
                onClick={() => moveBlock(visibleBlocks, id, -1)}
                disabled={idx === 0}
                icon="arrow_upward"
                label="Subir"
              />
              <Button
                variant="secondary" size="s"
                onClick={() => moveBlock(visibleBlocks, id, 1)}
                disabled={idx === visibleBlocks.length - 1}
                icon="arrow_downward"
                label="Bajar"
              />
            </div>
          )}
          {renderBlock(id)}
        </div>
      ))}

      {/* ── Ajustes (F3.11, módulo 11: "vive detrás de un icono en la
          cabecera, nunca en la barra inferior") — nombre/avatar/meta,
          entrenadores (coach) y cerrar sesión, la única acción destructiva
          de la pantalla en texto rojo sobre fondo neutro, no un botón
          relleno. "Repetir el tour" queda fuera: el motor de tutorial es
          F3.12, todavía no existe nada que repetir. */}
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
