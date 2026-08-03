import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { UserProfile, WeightCheckIn, WorkoutAssignment, WorkoutLog } from '../types';
import { getAllUserProfiles, createNotificationDeduped, getWorkoutAssignments, getWorkoutLogs, inviteClient, getPendingInvites } from '../dbService';
import ClientHub, { HubTab, AnalisisTab, HUB_TABS, ANALISIS_TABS } from './ClientHub';
import ResourcesPanel from './ResourcesPanel';
import CoachNotesPanel from './CoachNotesPanel';
import WeeklyAnalysisButton from './WeeklyAnalysisButton';
import { computeAdherenceScore, scoreStyle } from '../utils/adherence';
import { calcPlanExpiry } from '../hooks/usePlanExpiry';
import { getPendingReviews } from '../hooks/usePendingReviews';
import { estimateSetupPct } from '../utils/clientSetup';
import ProgressRing from './ProgressRing';
import { useToast } from '../hooks/useToast';
import Skeleton from './Skeleton';

const DEFAULT_HUB_TAB: HubTab = 'revisiones';
const DEFAULT_ANALISIS_TAB: AnalisisTab = 'reportes';

interface ClientsScreenProps {
  checkins: WeightCheckIn[];
  onRefreshCheckIns: () => void;
  coachId: string;
  coachEmail: string;
  onOpenReviews?: () => void;
}

export default function ClientsScreen({ checkins, onRefreshCheckIns, coachId, coachEmail, onOpenReviews }: ClientsScreenProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { athleteId, hubTab, subTab } = useParams<{ athleteId?: string; hubTab?: string; subTab?: string }>();
  const inviteInputRef = useRef<HTMLInputElement>(null);
  // Shared 'userProfiles' cache key (same as CommandPalette/ReviewsScreen/MesocycleManager).
  const { data: athletes = [], isPending: loadingAthletes } = useQuery({
    queryKey: ['userProfiles'],
    queryFn: getAllUserProfiles,
  });

  // Per-athlete assignments/logs — same N-parallel-queries pattern as
  // PendingTasksPanel's per-questionnaire lookups, sharing cache keys with
  // ClientHub/CoachRoadmapView/HomeScreen/AthleteRoadmapScreen's own reads of
  // the same athlete's assignments/logs. Keyed by userId, matching how
  // createWorkoutAssignment actually writes athleteId (see
  // ClientHub.handleCreateAssignment) — this used to be keyed by email here,
  // which never matched, so every athlete's adherence score silently ignored
  // their training data. allAssignments below is still keyed by .email for
  // lookup convenience against the athlete list.
  const assignmentsQueries = useQueries({
    queries: athletes.map(a => ({
      queryKey: ['workoutAssignments', a.userId],
      queryFn: () => getWorkoutAssignments(a.userId),
    })),
  });
  const allAssignments = new Map<string, WorkoutAssignment[]>();
  athletes.forEach((a, i) => allAssignments.set(a.email, assignmentsQueries[i]?.data ?? []));

  const workoutLogsQueries = useQueries({
    queries: athletes.map(a => ({
      queryKey: ['workoutLogs', a.email],
      queryFn: () => getWorkoutLogs(a.email),
    })),
  });
  const allWorkoutLogs = new Map<string, WorkoutLog[]>();
  athletes.forEach((a, i) => allWorkoutLogs.set(a.email, workoutLogsQueries[i]?.data ?? []));

  // Search + grid density for the athlete list
  const [search, setSearch] = useState('');
  const [gridCols, setGridCols] = useState<2 | 3 | 4>(() => {
    const v = Number(localStorage.getItem('enforma_clients_grid_cols'));
    return v === 2 || v === 3 || v === 4 ? v : 3;
  });
  const changeGridCols = (n: 2 | 3 | 4) => {
    localStorage.setItem('enforma_clients_grid_cols', String(n));
    setGridCols(n);
  };
  const GRID_COLS_CLASS: Record<2 | 3 | 4, string> = {
    2: 'md:grid-cols-2',
    3: 'md:grid-cols-2 lg:grid-cols-3',
    4: 'md:grid-cols-2 lg:grid-cols-4',
  };

  // Invite a new client by email
  const pendingInvitesKey = ['pendingInvites'] as const;
  const { data: pendingInvites = [] } = useQuery({
    queryKey: pendingInvitesKey,
    queryFn: getPendingInvites,
  });
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');

  const loadInvites = () => queryClient.invalidateQueries({ queryKey: pendingInvitesKey });

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError('');
    setInviteSuccess('');
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      await inviteClient(inviteEmail.trim());
      setInviteSuccess(`Invitación enviada a ${inviteEmail.trim()}.`);
      setInviteEmail('');
      loadInvites();
    } catch (err: any) {
      console.error('inviteClient error:', err);
      if (err.code === 'auth/operation-not-allowed') {
        setInviteError('El acceso por enlace no está activado en Firebase (Authentication → Sign-in method → Email link).');
      } else {
        setInviteError(err.message || 'No se pudo enviar la invitación.');
      }
    } finally {
      setInviting(false);
    }
  };

  const handleResendInvite = async (email: string) => {
    try {
      await inviteClient(email);
      loadInvites();
      showToast(`Invitación reenviada a ${email}.`, 'success');
    } catch (err) {
      console.error('resend invite error:', err);
      showToast(`No se pudo reenviar la invitación a ${email}.`);
    }
  };

  const openAthleteHub = (athlete: UserProfile & { setupPct?: number }, tab?: HubTab) => {
    const landingTab = tab ?? ((athlete.setupPct ?? 100) < 100 ? 'setup' : undefined);
    navigate(`/clients/${encodeURIComponent(athlete.email)}${landingTab ? `/${landingTab}` : ''}`);
  };

  const selectedAthlete = useMemo(() => {
    if (!athleteId) return null;
    const decoded = decodeURIComponent(athleteId).toLowerCase();
    return athletes.find(a => a.email.toLowerCase() === decoded) ?? null;
  }, [athletes, athleteId]);

  // Deep-linked to an athlete that doesn't exist (typo, deleted account, stale
  // link) — once the athlete list has actually loaded, bounce back to the grid
  // instead of silently rendering nothing.
  useEffect(() => {
    if (athleteId && !loadingAthletes && !selectedAthlete) {
      navigate('/clients', { replace: true });
    }
  }, [athleteId, loadingAthletes, selectedAthlete, navigate]);

  // The "/clients/:athleteId/analisis/:subTab" route (needed for the extra sub-tab
  // segment) doesn't capture a `hubTab` param at all, so `subTab` being present is
  // what actually means "we're on the Análisis tab" — falling back to `hubTab` alone
  // would default to DEFAULT_HUB_TAB and silently bounce back to Revisiones.
  const activeHubTab: HubTab = subTab
    ? 'analisis'
    : hubTab === 'periodizacion'
      // Pestaña retirada: la periodización vive ahora dentro de Entrenamientos.
      // Los enlaces/bookmarks antiguos aterrizan ahí en vez de en Revisiones.
      ? 'entrenamientos'
      : (hubTab && (HUB_TABS as readonly string[]).includes(hubTab))
        ? (hubTab as HubTab)
        : DEFAULT_HUB_TAB;
  const activeAnalisisTab: AnalisisTab = (subTab && (ANALISIS_TABS as readonly string[]).includes(subTab))
    ? (subTab as AnalisisTab)
    : DEFAULT_ANALISIS_TAB;

  const pendingCheckins = getPendingReviews(checkins);

  const todayMs = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime();
  }, []);

  const enrichedAthletes = useMemo(() => {
    return athletes.map(athlete => {
      const athleteCheckins = checkins.filter(
        c => c.userId === athlete.userId || c.email.toLowerCase() === athlete.email.toLowerCase()
      );

      const lastCheckinMs = athleteCheckins.reduce<number | null>((best, c) => {
        const ms = (c.timestamp instanceof Date ? c.timestamp : new Date(c.timestamp)).getTime();
        return best === null || ms > best ? ms : best;
      }, null);
      const daysSince = lastCheckinMs === null
        ? null
        : Math.floor((todayMs - lastCheckinMs) / 86_400_000);
      const checkinLate = daysSince === null || daysSince > 7;

      const { daysLeft: planDaysLeft, expired: planExpired, expiringSoon: planSoon } = calcPlanExpiry(athlete);

      const athleteAssignments = allAssignments.get(athlete.email) ?? [];
      const setupPct = athlete.setupSummary?.pct ?? estimateSetupPct(athlete, athleteCheckins, athleteAssignments);

      // 0 = most urgent
      let sortScore = 100;
      if (planExpired)    sortScore = Math.min(sortScore, 0);
      if (planSoon)       sortScore = Math.min(sortScore, 1);
      if (checkinLate)    sortScore = Math.min(sortScore, 2);
      if (setupPct < 100) sortScore = Math.min(sortScore, 3);

      const adherence = computeAdherenceScore(athleteAssignments, athleteCheckins);

      const athleteLogs = allWorkoutLogs.get(athlete.email) ?? [];
      const pendingNotesCount = athleteLogs.reduce((n, log) => {
        let count = n;
        if (log.note && !log.noteCoachSeen) count++;
        count += log.entries.filter(e => e.note && !e.noteCoachSeen).length;
        return count;
      }, 0);

      return {
        ...athlete,
        planDaysLeft, planExpired, planSoon,
        daysSince, checkinLate,
        totalCheckCount: athleteCheckins.length,
        pendingCount: getPendingReviews(athleteCheckins).length,
        pendingNotesCount,
        sortScore,
        setupPct,
        adherenceScore: adherence.score,
      };
    }).sort((a, b) => a.sortScore - b.sortScore);
  }, [athletes, checkins, todayMs, allAssignments, allWorkoutLogs]);

  const filteredAthletes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return enrichedAthletes;
    return enrichedAthletes.filter(a =>
      a.displayName.toLowerCase().includes(q) || a.email.toLowerCase().includes(q)
    );
  }, [enrichedAthletes, search]);

  const athletesFinishingSoon = useMemo(
    () => enrichedAthletes.filter(a => a.planSoon).sort((a, b) => (a.planDaysLeft ?? 0) - (b.planDaysLeft ?? 0)),
    [enrichedAthletes]
  );

  const totalPendingNotes = useMemo(
    () => enrichedAthletes.reduce((n, a) => n + a.pendingNotesCount, 0),
    [enrichedAthletes]
  );

  // Emit coach notifications for urgent clients (once per unique condition)
  useEffect(() => {
    if (enrichedAthletes.length === 0) return;
    const now = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    for (const a of enrichedAthletes) {
      if (a.planExpired && a.planDaysLeft !== null) {
        createNotificationDeduped(`notif_pe_${a.email}_${now.slice(0, 7)}`, {
          recipientEmail: coachEmail,
          type: 'plan_expiring',
          title: `Plan vencido: ${a.displayName}`,
          body: `El plan de ${a.displayName} venció hace ${-a.planDaysLeft} día${-a.planDaysLeft !== 1 ? 's' : ''}`,
          link: 'clients',
          createdAt: new Date().toISOString(),
          read: false,
        }).catch(console.error);
      } else if (a.planSoon && a.planDaysLeft !== null) {
        createNotificationDeduped(`notif_ps_${a.email}_${now.slice(0, 7)}`, {
          recipientEmail: coachEmail,
          type: 'plan_expiring',
          title: `Plan próximo a vencer: ${a.displayName}`,
          body: `El plan de ${a.displayName} vence en ${a.planDaysLeft} día${a.planDaysLeft !== 1 ? 's' : ''}`,
          link: 'clients',
          createdAt: new Date().toISOString(),
          read: false,
        }).catch(console.error);
      }
      if (a.checkinLate && a.daysSince !== null && a.daysSince > 7) {
        const week = Math.floor((todayMs / 86_400_000) / 7);
        createNotificationDeduped(`notif_cl_${a.email}_w${week}`, {
          recipientEmail: coachEmail,
          type: 'checkin_late',
          title: `Check-in atrasado: ${a.displayName}`,
          body: `${a.displayName} lleva ${a.daysSince} días sin enviar check-in`,
          link: 'clients',
          createdAt: new Date().toISOString(),
          read: false,
        }).catch(console.error);
      }
    }
  }, [enrichedAthletes, coachEmail, todayMs]);

  if (athleteId) {
    if (!selectedAthlete) return null; // still loading athletes, or about to redirect back to /clients
    return (
      <ClientHub
        key={selectedAthlete.email}
        athlete={selectedAthlete}
        coachId={coachId}
        coachEmail={coachEmail}
        checkins={checkins}
        onRefreshCheckIns={onRefreshCheckIns}
        onBack={() => navigate('/clients')}
        activeTab={activeHubTab}
        onTabChange={tab => navigate(`/clients/${athleteId}${tab === 'analisis' ? `/analisis/${DEFAULT_ANALISIS_TAB}` : `/${tab}`}`)}
        analisisTab={activeAnalisisTab}
        onAnalisisTabChange={sub => navigate(`/clients/${athleteId}/analisis/${sub}`)}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="pb-4 border-b border-hairline">
        <div className="flex items-center gap-3 mb-2">
          <span className="inline-flex items-center px-2 rounded-control bg-raised text-caption font-sans border border-accent/30 text-accent font-bold uppercase tracking-wider">
            Consola de Entrenador
          </span>
          <span className="inline-flex items-center gap-2 text-label font-mono text-data">
            <span className="w-2 h-2 rounded-full bg-data animate-pulse"></span>
            Sincronizado
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="font-sans font-extrabold text-display tracking-tight text-white uppercase">Clientes</h1>
          <WeeklyAnalysisButton />
        </div>
      </header>

      {/* Summary cards */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pb-2">
        {/* Athletes count + finishing soon */}
        <div className="lg:col-span-5 bg-gradient-to-br from-field to-bg border border-hairline p-5 rounded-surface relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 right-0 w-32 h-32 bg-accent/5 rounded-bl-full pointer-events-none" />
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-accent text-title-m">group</span>
                <h2 className="font-sans font-bold text-ink-2 text-label uppercase tracking-wider">Atletas del Entrenador</h2>
              </div>
              <span className="text-caption bg-teal-500/15 text-data px-2 border border-teal-500/20 rounded-control font-sans font-bold uppercase">Activos</span>
            </div>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="font-sans font-extrabold text-display text-white tracking-tight">{athletes.length}</span>
              <span className="text-label text-ink-2 font-sans pb-1">deportistas registrados</span>
            </div>
          </div>
          <div className="mt-6 pt-4 border-t border-hairline">
            <span className="block text-caption text-ink-2 uppercase font-sans mb-2">Próximos a finalizar planificación</span>
            {athletesFinishingSoon.length === 0 ? (
              <p className="text-label text-ink-3 font-sans">Ninguno por ahora.</p>
            ) : (
              <div className="space-y-2">
                {athletesFinishingSoon.slice(0, 3).map(a => (
                  <button
                    key={a.userId}
                    onClick={() => openAthleteHub(a)}
                    className="w-full flex items-center justify-between bg-raised/50 hover:bg-raised px-3 py-2 rounded-control border border-hairline text-left transition-colors"
                  >
                    <span className="text-label text-white font-sans truncate">{a.displayName}</span>
                    <span className="text-caption font-mono font-bold text-orange-300 flex-shrink-0 ml-2">{a.planDaysLeft}d</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Pending reviews + notes */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <button
            onClick={onOpenReviews}
            disabled={!onOpenReviews}
            className="bg-surface border border-hairline p-5 rounded-control flex flex-col justify-between text-left hover:border-data/40 transition-colors disabled:cursor-default disabled:hover:border-hairline"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-data text-title-m">pending_actions</span>
                <h2 className="font-sans font-bold text-ink-2 text-label uppercase tracking-wider">Revisiones Pendientes</h2>
              </div>
              {pendingCheckins.length > 0 ? (
                <span className="text-caption bg-red-500/10 text-rose-400 px-3 border border-red-500/25 rounded-control font-sans uppercase font-bold animate-pulse">
                  {pendingCheckins.length} por evaluar
                </span>
              ) : (
                <span className="text-caption bg-accent/10 text-accent px-3 border border-accent/20 rounded-control font-sans uppercase font-bold">Al día</span>
              )}
            </div>
            {pendingCheckins.length === 0 ? (
              <p className="text-label font-bold text-white">¡Sin revisiones pendientes!</p>
            ) : (
              <p className="text-body-s text-ink-2 font-mono">
                Ve a <strong className="text-accent">Revisiones</strong> para evaluar los {pendingCheckins.length} check-ins pendientes.
              </p>
            )}
          </button>

          {/* Pending notes */}
          <div className="bg-surface border border-hairline p-5 rounded-surface">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-300 text-title-m">sticky_note_2</span>
                <h2 className="font-sans font-bold text-ink-2 text-label uppercase tracking-wider">Notas Pendientes</h2>
              </div>
              {totalPendingNotes > 0 ? (
                <span className="text-caption bg-amber-500/10 text-amber-300 px-3 border border-amber-500/25 rounded-control font-sans uppercase font-bold">
                  {totalPendingNotes} por leer
                </span>
              ) : (
                <span className="text-caption bg-accent/10 text-accent px-3 border border-accent/20 rounded-control font-sans uppercase font-bold">Al día</span>
              )}
            </div>
            {totalPendingNotes === 0 ? (
              <p className="text-label text-ink-3 font-sans">Sin notas nuevas de ejercicios o entrenamientos.</p>
            ) : (
              <div className="space-y-2">
                {enrichedAthletes.filter(a => a.pendingNotesCount > 0).slice(0, 3).map(a => (
                  <button
                    key={a.userId}
                    onClick={() => openAthleteHub(a, 'entrenamientos')}
                    className="w-full flex items-center justify-between bg-raised/50 hover:bg-raised px-3 py-2 rounded-control border border-hairline text-left transition-colors"
                  >
                    <span className="text-label text-white font-sans truncate">{a.displayName}</span>
                    <span className="text-caption font-mono font-bold text-amber-300 flex-shrink-0 ml-2">{a.pendingNotesCount}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Coach's own private to-do list — separate from Revisiones Pendientes */}
      <CoachNotesPanel athletes={athletes} />

      <ResourcesPanel isCoach coachId={coachId} />

      {/* Athlete list */}
      <div className="space-y-4">
        <div className="bg-surface border border-hairline p-4 rounded-surface flex flex-col md:flex-row md:items-center gap-3">
          <div className="relative flex-1">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-ink-2 text-title-s pointer-events-none">search</span>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar atleta por nombre o email..."
              className="w-full bg-bg border border-hairline rounded-control pl-10 pr-3 py-3 text-body-s text-white font-sans focus:outline-none focus:border-accent transition-colors"
            />
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="flex bg-bg border border-hairline p-1 rounded-surface gap-1">
              {([2, 3, 4] as const).map(n => (
                <button
                  key={n}
                  onClick={() => changeGridCols(n)}
                  title={`${n} columnas`}
                  className={`w-7 h-7 rounded-control font-sans text-label font-bold transition-all ${
                    gridCols === n ? 'bg-accent text-black' : 'text-ink-2 hover:text-white'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <span className="text-caption bg-teal-500/10 text-teal-300 px-3 py-2 border border-teal-500/20 rounded-control font-sans uppercase whitespace-nowrap">
              {filteredAthletes.length} ATLETAS
            </span>
          </div>
        </div>

        {loadingAthletes ? (
          <div className={`grid grid-cols-1 ${GRID_COLS_CLASS[gridCols]} gap-4`}>
            <Skeleton className="h-40 w-full rounded-surface" />
            <Skeleton className="h-40 w-full rounded-surface" />
            <Skeleton className="h-40 w-full rounded-surface" />
          </div>
        ) : athletes.length === 0 ? (
          <div className="text-center py-10 flex flex-col items-center gap-3">
            <p className="text-ink-2 font-sans text-label">No hay atletas registrados todavía.</p>
            <button
              onClick={() => inviteInputRef.current?.focus()}
              className="flex items-center gap-2 px-4 py-2 bg-accent text-black font-sans font-bold text-caption uppercase rounded-control hover:bg-accent-press active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined text-body-s">person_add</span>
              Invitar a tu primer atleta
            </button>
          </div>
        ) : filteredAthletes.length === 0 ? (
          <div className="text-center py-10 text-ink-2 font-mono text-label">Ningún atleta coincide con "{search}".</div>
        ) : (
          <div className={`grid grid-cols-1 ${GRID_COLS_CLASS[gridCols]} gap-4`}>
            {filteredAthletes.map(athlete => {
              const { planDaysLeft, planExpired, planSoon, daysSince, checkinLate,
                      totalCheckCount, pendingCount, adherenceScore, setupPct } = athlete;
              const adh = scoreStyle(adherenceScore);
              const needsAttention = planExpired || planSoon || checkinLate;

              return (
                <div
                  key={athlete.userId}
                  onClick={() => openAthleteHub(athlete)}
                  className={`bg-bg border rounded-surface p-5 hover:border-accent/50 cursor-pointer transition-all flex flex-col justify-between group relative overflow-hidden ${
                    needsAttention ? 'border-orange-500/30' : 'border-hairline'
                  }`}
                >
                  <div className="absolute right-0 top-0 w-16 h-16 bg-gradient-to-tr from-transparent to-accent/5 rounded-bl-full pointer-events-none" />
                  <button
                    onClick={e => { e.stopPropagation(); openAthleteHub(athlete, 'setup'); }}
                    title={`Setup ${setupPct}%`}
                    className="absolute right-3 top-3 z-10"
                  >
                    <ProgressRing pct={setupPct} size={32} color={setupPct >= 100 ? 'var(--color-success)' : 'var(--color-accent)'} />
                  </button>
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-hairline group-hover:border-accent/60 transition-all flex-shrink-0">
                        <img src={athlete.avatarUrl} alt={athlete.displayName} className="w-full h-full object-cover" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-sans font-bold text-white text-title-s leading-snug group-hover:text-accent transition-colors">{athlete.displayName}</h3>
                        <p className="font-mono text-caption text-ink-2 truncate">{athlete.email}</p>
                        {/* Plan badge */}
                        <div className="flex flex-wrap gap-1 ">
                          {planDaysLeft !== null ? (
                            <span className={`text-caption font-sans font-bold uppercase px-2 rounded-control border ${
                              planDaysLeft > 30  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' :
                              planDaysLeft >= 0  ? 'bg-orange-500/10  text-orange-300  border-orange-500/20'  :
                                                   'bg-red-500/10     text-red-400     border-red-500/20'
                            }`}>
                              {planDaysLeft >= 0 ? `Vence en ${planDaysLeft}d` : `Vencido hace ${-planDaysLeft}d`}
                            </span>
                          ) : (
                            <span className="text-caption font-sans font-bold uppercase px-2 rounded-control border bg-raised text-ink-3 border-hairline">
                              Sin plan
                            </span>
                          )}
                          {/* Check-in atrasado badge */}
                          {checkinLate && (
                            <span className="text-caption font-sans font-bold uppercase px-2 rounded-control border bg-orange-500/10 text-orange-300 border-orange-500/20">
                              {daysSince === null ? 'Sin check-in' : `Check-in · ${daysSince}d`}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 bg-raised/50 p-3 rounded-surface border border-hairline text-center font-mono">
                      <div>
                        <span className="block text-caption text-ink-2 uppercase">INICIAL</span>
                        <span className="block text-label font-bold text-white">{athlete.initialWeight} kg</span>
                      </div>
                      <div>
                        <span className="block text-caption text-accent uppercase font-bold">ACTUAL</span>
                        <span className="block text-label font-bold text-accent">{athlete.actualWeight || athlete.initialWeight} kg</span>
                      </div>
                      <div>
                        <span className="block text-caption text-data uppercase">META</span>
                        <span className="block text-label font-bold text-data">{athlete.targetWeight} kg</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between font-mono text-caption">
                        <span className="text-ink-2 uppercase flex items-center gap-1">
                          <span className="material-symbols-outlined text-label text-orange-400">local_fire_department</span> Racha
                        </span>
                        <strong className="text-white">{athlete.currentStreak || 0} sem</strong>
                      </div>
                      <div className="flex justify-between font-mono text-caption">
                        <span className="text-ink-2 uppercase flex items-center gap-1">
                          <span className="material-symbols-outlined text-label text-teal-400">military_tech</span> Nivel
                        </span>
                        <strong className="text-data">Lvl {athlete.level || 1}</strong>
                      </div>
                      {/* Adherence score */}
                      <div className={`flex items-center justify-between px-3 py-2 rounded-surface border font-sans ${adh.bg}`}>
                        <span className={`text-caption uppercase font-bold flex items-center gap-1 ${adh.text}`}>
                          <span className="material-symbols-outlined" style={{ fontSize: '11px' }}>monitor_heart</span>
                          {adh.label}
                        </span>
                        <span className={`text-body-s font-bold ${adh.text}`}>{adherenceScore}</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-5 pt-4 border-t border-hairline flex items-center justify-between text-label font-mono">
                    <div className="flex items-center gap-2">
                      <span className="text-ink-2">{totalCheckCount} Reportes</span>
                      {pendingCount > 0 && (
                        <span className="text-caption bg-red-500/15 text-rose-400 border border-red-500/25 px-2 rounded-control font-sans uppercase">
                          {pendingCount} pend.
                        </span>
                      )}
                    </div>
                    <span className="text-accent flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                      <span>Abrir Hub</span>
                      <span className="material-symbols-outlined text-caption">arrow_forward</span>
                    </span>
                  </div>
                </div>
              );
            })}

          </div>
        )}
      </div>

      {/* Invite a new client by email */}
      <div className="bg-surface border border-hairline p-5 rounded-surface">
        <div className="flex items-center gap-2 mb-3">
          <span className="material-symbols-outlined text-accent text-title-m">person_add</span>
          <h2 className="font-sans font-bold text-ink-2 text-label uppercase tracking-wider">Invitar nuevo atleta</h2>
        </div>
        <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-2 sm:max-w-md">
          <input
            ref={inviteInputRef}
            type="email"
            value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)}
            placeholder="correo del nuevo cliente"
            className="flex-1 bg-bg border border-hairline rounded-control px-3 py-3 text-body-s text-white focus:outline-none focus:border-accent transition-colors"
          />
          <button
            type="submit"
            disabled={inviting || !inviteEmail.trim()}
            className="flex-shrink-0 flex items-center justify-center gap-2 px-4 py-3 bg-accent text-black font-sans font-bold text-caption uppercase rounded-control hover:bg-accent-press active:scale-95 transition-all disabled:opacity-40"
          >
            <span className="material-symbols-outlined text-body-s">mail</span>
            {inviting ? 'Enviando...' : 'Invitar'}
          </button>
        </form>
        {inviteError && <p className="font-sans text-caption text-red-400 mt-2">{inviteError}</p>}
        {inviteSuccess && <p className="font-mono text-caption text-accent mt-2">{inviteSuccess}</p>}

        {pendingInvites.length > 0 && (
          <div className="mt-4 pt-4 border-t border-hairline">
            <p className="font-sans text-caption text-ink-2 uppercase tracking-wider mb-3">
              Invitaciones pendientes ({pendingInvites.length})
            </p>
            <div className="space-y-2">
              {pendingInvites.map(inv => (
                <div key={inv.id} className="flex items-center gap-3 bg-raised border border-hairline rounded-surface px-3 py-2">
                  <span className="material-symbols-outlined text-ink-2 text-body-s">mail</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-sans text-label text-white truncate">{inv.email}</p>
                    <p className="font-mono text-caption text-ink-3">
                      Invitado el {new Date(inv.invitedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                    </p>
                  </div>
                  <button
                    onClick={() => handleResendInvite(inv.email)}
                    className="font-mono text-caption text-data hover:underline uppercase tracking-wide flex-shrink-0"
                  >
                    Reenviar
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
