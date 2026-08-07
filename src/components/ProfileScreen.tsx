import React, { useState, useMemo } from 'react';
import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query';
import { UserProfile, Questionnaire, OnboardingData, WeightCheckIn } from '../types';
import { updateUserProfile, getAssignmentsForAthlete, getResponsesForAthlete, getQuestionnaireById, getOnboarding } from '../dbService';
import { signOut, auth } from '../firebase';
import { useToast } from '../hooks/useToast';
import BodyweightPanel from './BodyweightPanel';
import QuestionnaireChartsPanel from './QuestionnaireChartsPanel';
import FoodPreferencesPanel from './FoodPreferencesPanel';
import OnboardingForm from './OnboardingForm';
import CoachesScreen from './CoachesScreen';
import CheckInScreen from './CheckInScreen';
import AthleteRoadmapScreen from './AthleteRoadmapScreen';
import StatTile from './StatTile';
import { Icon, Button, PageHeader, ListRow, Input, Sheet } from './ui';

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
type BlockId = 'gamification' | 'bodyweight' | 'questionnaires' | 'ficha' | 'preferences';
const DEFAULT_BLOCK_ORDER: BlockId[] = ['gamification', 'bodyweight', 'questionnaires', 'ficha', 'preferences'];

export default function ProfileScreen({ profile, isCoach, checkins, onRefreshProfile, onLogOut }: ProfileScreenProps) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [showCoaches, setShowCoaches] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [expandedSection, setExpandedSection] = useState<ExpandedSection>(null);
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [targetWeight, setTargetWeight] = useState(profile.targetWeight.toString());
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');

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
      showToast('No se pudo actualizar el perfil.');
    } finally {
      setLoading(false);
    }
  };

  const visibleBlocks = blockOrder.filter(id => {
    if (id === 'questionnaires') return questionnaires.length > 0 && responses.length > 0;
    if (id === 'ficha') return !isCoach;
    if (id === 'preferences') return !isCoach && !!onboarding && !editingFicha;
    return true;
  });

  function renderBlock(id: BlockId): React.ReactNode {
    switch (id) {
      case 'bodyweight':
        return (
          <div className="bg-surface border border-hairline p-4 sm:p-6 rounded-canvas">
            <BodyweightPanel athleteEmail={profile.email} />
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

      case 'questionnaires':
        return (
          <div className="bg-surface border border-hairline p-4 sm:p-6 rounded-canvas">
            <QuestionnaireChartsPanel questionnaires={questionnaires} responses={responses} />
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
        subtitle="Progreso, gráficas y ficha."
        action={<Button variant="ghost" size="m" icon="settings" onClick={() => setShowSettings(true)} label="Ajustes" />}
      />

      {/* ── Progreso y Road map absorbidos (F3.11, módulo 11: "Perfil absorbe
          Check-in y Road map") — CheckInScreen/AthleteRoadmapScreen se
          embeben enteros al expandir, no se reescriben ni se navega fuera. */}
      {!isCoach && (
        <div className="flex flex-col gap-2">
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
            <Input label="Nombre deportivo" required value={displayName} onChange={setDisplayName} />
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
            <Input label="Avatar (URL de imagen)" type="url" value={avatarUrl} onChange={setAvatarUrl} />
            <Button type="submit" disabled={loading} loading={loading} loadingLabel="Guardando" fullWidth>Guardar cambios</Button>
            {success && <p className="text-label font-sans font-bold text-accent text-center">{success}</p>}
          </form>

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

          <button onClick={handleSignOut} className="w-full flex items-center justify-center gap-2 py-3 text-label font-sans font-bold text-danger">
            <Icon name="logout" size="m" />
            Cerrar sesión
          </button>
        </div>
      </Sheet>
    </div>
  );
}
