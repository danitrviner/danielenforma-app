import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { UserProfile, WeightCheckIn, WorkoutAssignment, WorkoutLog, Invite } from '../types';
import { getAllUserProfiles, createNotificationDeduped, getWorkoutAssignments, getWorkoutLogs, inviteClient, getPendingInvites } from '../dbService';
import ClientHub, { HubTab, AnalisisTab, HUB_TABS, ANALISIS_TABS } from './ClientHub';
import ResourcesPanel from './ResourcesPanel';
import CoachNotesPanel from './CoachNotesPanel';
import { computeAdherenceScore, scoreStyle } from '../utils/adherence';
import { calcPlanExpiry } from '../hooks/usePlanExpiry';
import { getPendingReviews } from '../hooks/usePendingReviews';
import { estimateSetupPct } from '../utils/clientSetup';
import ProgressRing from './ProgressRing';

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
  const { athleteId, hubTab, subTab } = useParams<{ athleteId?: string; hubTab?: string; subTab?: string }>();
  const [athletes, setAthletes]           = useState<UserProfile[]>([]);
  const [loadingAthletes, setLoadingAthletes] = useState(true);
  const [allAssignments, setAllAssignments] = useState<Map<string, WorkoutAssignment[]>>(new Map());
  const [allWorkoutLogs, setAllWorkoutLogs] = useState<Map<string, WorkoutLog[]>>(new Map());

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
  const [pendingInvites, setPendingInvites] = useState<Invite[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');

  const loadInvites = () => {
    getPendingInvites().then(setPendingInvites).catch(console.error);
  };

  useEffect(() => { loadInvites(); }, []);

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
    } catch (err) {
      console.error('resend invite error:', err);
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

  useEffect(() => {
    getAllUserProfiles()
      .then(setAthletes)
      .catch(console.error)
      .finally(() => setLoadingAthletes(false));
  }, []);

  useEffect(() => {
    if (athletes.length === 0) return;
    // Keyed by userId, matching how createWorkoutAssignment actually writes
    // athleteId (see ClientHub.handleCreateAssignment) — this used to be keyed
    // by email here, which never matched, so every athlete's adherence score
    // silently ignored their training data. allAssignments is still keyed by
    // .email below for lookup convenience against the athlete list.
    Promise.all(athletes.map(a => getWorkoutAssignments(a.userId).then(wa => [a.email, wa] as const)))
      .then(pairs => setAllAssignments(new Map(pairs)))
      .catch(console.error);
    Promise.all(athletes.map(a => getWorkoutLogs(a.email).then(logs => [a.email, logs] as const)))
      .then(pairs => setAllWorkoutLogs(new Map(pairs)))
      .catch(console.error);
  }, [athletes]);

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
      <header className="pb-4 border-b border-white/60">
        <div className="flex items-center gap-3 mb-2">
          <span className="inline-flex items-center px-2 py-0.5 rounded bg-[#201f1f] text-[10px] font-sans border border-[#fbcb1a]/30 text-[#fbcb1a] font-bold uppercase tracking-wider">
            Consola de Entrenador
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-mono text-[#00eefc]">
            <span className="w-2 h-2 rounded-full bg-[#00eefc] animate-pulse"></span>
            Sincronizado
          </span>
        </div>
        <h1 className="font-sans font-black text-3xl tracking-tight text-white uppercase">Clientes</h1>
      </header>

      {/* Summary cards */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pb-2">
        {/* Athletes count + finishing soon */}
        <div className="lg:col-span-5 bg-gradient-to-br from-[#121414] to-[#121212] border border-white/7 p-5 rounded-2xl relative overflow-hidden flex flex-col justify-between shadow-lg">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#fbcb1a]/5 rounded-bl-full pointer-events-none" />
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#fbcb1a] text-xl">group</span>
                <h2 className="font-sans font-extrabold text-[#c6c9ab] text-xs uppercase tracking-wider">Atletas del Entrenador</h2>
              </div>
              <span className="text-[10px] bg-teal-500/15 text-[#00eefc] px-2 py-0.5 border border-teal-500/20 rounded font-sans font-bold uppercase">Activos</span>
            </div>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="font-sans font-black text-5xl text-white tracking-tight">{athletes.length}</span>
              <span className="text-xs text-[#c6c9ab] font-sans pb-1">deportistas registrados</span>
            </div>
          </div>
          <div className="mt-6 pt-4 border-t border-white/60">
            <span className="block text-[8px] text-[#c6c9ab] uppercase font-mono mb-2">Próximos a finalizar planificación</span>
            {athletesFinishingSoon.length === 0 ? (
              <p className="text-xs text-[#555] font-mono">Ninguno por ahora.</p>
            ) : (
              <div className="space-y-1.5">
                {athletesFinishingSoon.slice(0, 3).map(a => (
                  <button
                    key={a.userId}
                    onClick={() => openAthleteHub(a)}
                    className="w-full flex items-center justify-between bg-[#1b1c1c]/50 hover:bg-[#1b1c1c] px-2.5 py-1.5 rounded-lg border border-white/40 text-left transition-colors"
                  >
                    <span className="text-xs text-white font-sans truncate">{a.displayName}</span>
                    <span className="text-[10px] font-mono font-bold text-orange-300 flex-shrink-0 ml-2">{a.planDaysLeft}d</span>
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
            className="bg-[#181816] border border-white/7 p-5 rounded-2xl flex flex-col justify-between shadow-lg text-left hover:border-[#00eefc]/40 transition-colors disabled:cursor-default disabled:hover:border-white/7"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#00eefc] text-xl">pending_actions</span>
                <h2 className="font-sans font-extrabold text-[#c6c9ab] text-xs uppercase tracking-wider">Revisiones Pendientes</h2>
              </div>
              {pendingCheckins.length > 0 ? (
                <span className="text-[10px] bg-red-500/10 text-rose-400 px-2.5 py-0.5 border border-red-500/25 rounded font-sans uppercase font-black animate-pulse">
                  {pendingCheckins.length} por evaluar
                </span>
              ) : (
                <span className="text-[10px] bg-[#fbcb1a]/10 text-[#fbcb1a] px-2.5 py-0.5 border border-[#fbcb1a]/20 rounded font-sans uppercase font-bold">Al día</span>
              )}
            </div>
            {pendingCheckins.length === 0 ? (
              <p className="text-xs font-bold text-white">¡Sin revisiones pendientes!</p>
            ) : (
              <p className="text-sm text-[#c6c9ab] font-mono">
                Ve a <strong className="text-[#fbcb1a]">Revisiones</strong> para evaluar los {pendingCheckins.length} check-ins pendientes.
              </p>
            )}
          </button>

          {/* Pending notes */}
          <div className="bg-[#181816] border border-white/7 p-5 rounded-2xl shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-300 text-xl">sticky_note_2</span>
                <h2 className="font-sans font-extrabold text-[#c6c9ab] text-xs uppercase tracking-wider">Notas Pendientes</h2>
              </div>
              {totalPendingNotes > 0 ? (
                <span className="text-[10px] bg-amber-500/10 text-amber-300 px-2.5 py-0.5 border border-amber-500/25 rounded font-sans uppercase font-black">
                  {totalPendingNotes} por leer
                </span>
              ) : (
                <span className="text-[10px] bg-[#fbcb1a]/10 text-[#fbcb1a] px-2.5 py-0.5 border border-[#fbcb1a]/20 rounded font-sans uppercase font-bold">Al día</span>
              )}
            </div>
            {totalPendingNotes === 0 ? (
              <p className="text-xs text-[#555] font-mono">Sin notas nuevas de ejercicios o entrenamientos.</p>
            ) : (
              <div className="space-y-1.5">
                {enrichedAthletes.filter(a => a.pendingNotesCount > 0).slice(0, 3).map(a => (
                  <button
                    key={a.userId}
                    onClick={() => openAthleteHub(a, 'entrenamientos')}
                    className="w-full flex items-center justify-between bg-[#1b1c1c]/50 hover:bg-[#1b1c1c] px-2.5 py-1.5 rounded-lg border border-white/40 text-left transition-colors"
                  >
                    <span className="text-xs text-white font-sans truncate">{a.displayName}</span>
                    <span className="text-[10px] font-mono font-bold text-amber-300 flex-shrink-0 ml-2">{a.pendingNotesCount}</span>
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
        <div className="bg-[#181816] border border-white/7 p-4 rounded-2xl flex flex-col md:flex-row md:items-center gap-3">
          <div className="relative flex-1">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#c6c9ab] text-base pointer-events-none">search</span>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar atleta por nombre o email..."
              className="w-full bg-[#111110] border border-white/7 rounded-lg pl-9 pr-3 py-2.5 text-sm text-white font-sans focus:outline-none focus:border-[#fbcb1a] transition-colors"
            />
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="flex bg-[#111110] border border-white/7 p-1 rounded-lg gap-1">
              {([2, 3, 4] as const).map(n => (
                <button
                  key={n}
                  onClick={() => changeGridCols(n)}
                  title={`${n} columnas`}
                  className={`w-7 h-7 rounded-md font-sans text-xs font-bold transition-all ${
                    gridCols === n ? 'bg-[#fbcb1a] text-black' : 'text-[#c6c9ab] hover:text-white'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <span className="text-[10px] bg-teal-500/10 text-teal-300 px-3 py-1.5 border border-teal-500/20 rounded font-sans uppercase whitespace-nowrap">
              {filteredAthletes.length} ATLETAS
            </span>
          </div>
        </div>

        {loadingAthletes ? (
          <div className="text-center py-12 text-[#c6c9ab] font-mono tracking-widest uppercase text-xs animate-pulse">Cargando atletas...</div>
        ) : athletes.length === 0 ? (
          <div className="text-center py-12 text-[#c6c9ab] font-mono text-xs">No hay atletas registrados todavía.</div>
        ) : filteredAthletes.length === 0 ? (
          <div className="text-center py-12 text-[#c6c9ab] font-mono text-xs">Ningún atleta coincide con "{search}".</div>
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
                  className={`bg-[#111110] border rounded-2xl p-5 hover:border-[#fbcb1a]/50 hover:shadow-[0_4px_20px_rgba(251,203,26,0.05)] cursor-pointer transition-all flex flex-col justify-between group relative overflow-hidden ${
                    needsAttention ? 'border-orange-500/30' : 'border-white/7'
                  }`}
                >
                  <div className="absolute right-0 top-0 w-16 h-16 bg-gradient-to-tr from-transparent to-[#fbcb1a]/5 rounded-bl-full pointer-events-none" />
                  <button
                    onClick={e => { e.stopPropagation(); openAthleteHub(athlete, 'setup'); }}
                    title={`Setup ${setupPct}%`}
                    className="absolute right-3 top-3 z-10"
                  >
                    <ProgressRing pct={setupPct} size={32} color={setupPct >= 100 ? '#34d399' : '#fbcb1a'} />
                  </button>
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-white/7 group-hover:border-[#fbcb1a]/60 transition-all flex-shrink-0">
                        <img src={athlete.avatarUrl} alt={athlete.displayName} className="w-full h-full object-cover" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-sans font-bold text-white text-base leading-snug group-hover:text-[#fbcb1a] transition-colors">{athlete.displayName}</h3>
                        <p className="font-mono text-[10px] text-[#c6c9ab] truncate">{athlete.email}</p>
                        {/* Plan badge */}
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {planDaysLeft !== null ? (
                            <span className={`text-[9px] font-sans font-bold uppercase px-1.5 py-0.5 rounded border ${
                              planDaysLeft > 30  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' :
                              planDaysLeft >= 0  ? 'bg-orange-500/10  text-orange-300  border-orange-500/20'  :
                                                   'bg-red-500/10     text-red-400     border-red-500/20'
                            }`}>
                              {planDaysLeft >= 0 ? `Vence en ${planDaysLeft}d` : `Vencido hace ${-planDaysLeft}d`}
                            </span>
                          ) : (
                            <span className="text-[9px] font-sans font-bold uppercase px-1.5 py-0.5 rounded border bg-[#1c1b1b] text-[#4a4a4a] border-white/7">
                              Sin plan
                            </span>
                          )}
                          {/* Check-in atrasado badge */}
                          {checkinLate && (
                            <span className="text-[9px] font-sans font-bold uppercase px-1.5 py-0.5 rounded border bg-orange-500/10 text-orange-300 border-orange-500/20">
                              {daysSince === null ? 'Sin check-in' : `Check-in · ${daysSince}d`}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 bg-[#1b1c1c]/50 p-2.5 rounded-lg border border-white/40 text-center font-mono">
                      <div>
                        <span className="block text-[8px] text-[#c6c9ab] uppercase">INICIAL</span>
                        <span className="block text-xs font-bold text-white">{athlete.initialWeight} kg</span>
                      </div>
                      <div>
                        <span className="block text-[8px] text-[#fbcb1a] uppercase font-bold">ACTUAL</span>
                        <span className="block text-xs font-bold text-[#fbcb1a]">{athlete.actualWeight || athlete.initialWeight} kg</span>
                      </div>
                      <div>
                        <span className="block text-[8px] text-[#00eefc] uppercase">META</span>
                        <span className="block text-xs font-bold text-[#00eefc]">{athlete.targetWeight} kg</span>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex justify-between font-mono text-[10px]">
                        <span className="text-[#c6c9ab] uppercase flex items-center gap-1">
                          <span className="material-symbols-outlined text-[12px] text-orange-400">local_fire_department</span> Racha
                        </span>
                        <strong className="text-white">{athlete.currentStreak || 0} sem</strong>
                      </div>
                      <div className="flex justify-between font-mono text-[10px]">
                        <span className="text-[#c6c9ab] uppercase flex items-center gap-1">
                          <span className="material-symbols-outlined text-[12px] text-teal-400">military_tech</span> Nivel
                        </span>
                        <strong className="text-[#00eefc]">Lvl {athlete.level || 1}</strong>
                      </div>
                      {/* Adherence score */}
                      <div className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border font-mono ${adh.bg}`}>
                        <span className={`text-[10px] uppercase font-bold flex items-center gap-1 ${adh.text}`}>
                          <span className="material-symbols-outlined" style={{ fontSize: '11px' }}>monitor_heart</span>
                          {adh.label}
                        </span>
                        <span className={`text-sm font-black ${adh.text}`}>{adherenceScore}</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-5 pt-3.5 border-t border-white/60 flex items-center justify-between text-xs font-mono">
                    <div className="flex items-center gap-2">
                      <span className="text-[#c6c9ab]">{totalCheckCount} Reportes</span>
                      {pendingCount > 0 && (
                        <span className="text-[9px] bg-red-500/15 text-rose-400 border border-red-500/25 px-1.5 py-0.5 rounded font-sans uppercase">
                          {pendingCount} pend.
                        </span>
                      )}
                    </div>
                    <span className="text-[#fbcb1a] flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                      <span>Abrir Hub</span>
                      <span className="material-symbols-outlined text-[10px]">arrow_forward</span>
                    </span>
                  </div>
                </div>
              );
            })}

          </div>
        )}
      </div>

      {/* Invite a new client by email */}
      <div className="bg-[#181816] border border-white/7 p-5 rounded-2xl">
        <div className="flex items-center gap-2 mb-3">
          <span className="material-symbols-outlined text-[#fbcb1a] text-xl">person_add</span>
          <h2 className="font-sans font-extrabold text-[#c6c9ab] text-xs uppercase tracking-wider">Invitar nuevo atleta</h2>
        </div>
        <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-2 sm:max-w-md">
          <input
            type="email"
            value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)}
            placeholder="correo del nuevo cliente"
            className="flex-1 bg-[#111110] border border-white/7 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#fbcb1a] transition-colors"
          />
          <button
            type="submit"
            disabled={inviting || !inviteEmail.trim()}
            className="flex-shrink-0 flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-[#fbcb1a] text-black font-sans font-bold text-[10px] uppercase rounded-lg hover:bg-[#d4a800] active:scale-95 transition-all disabled:opacity-40"
          >
            <span className="material-symbols-outlined text-sm">mail</span>
            {inviting ? 'Enviando...' : 'Invitar'}
          </button>
        </form>
        {inviteError && <p className="font-mono text-[10px] text-red-400 mt-1.5">{inviteError}</p>}
        {inviteSuccess && <p className="font-mono text-[10px] text-[#fbcb1a] mt-1.5">{inviteSuccess}</p>}

        {pendingInvites.length > 0 && (
          <div className="mt-4 pt-4 border-t border-white/60">
            <p className="font-mono text-[9px] text-[#c6c9ab] uppercase tracking-wider mb-2.5">
              Invitaciones pendientes ({pendingInvites.length})
            </p>
            <div className="space-y-1.5">
              {pendingInvites.map(inv => (
                <div key={inv.id} className="flex items-center gap-3 bg-[#1e1e1b] border border-white/7 rounded-xl px-3 py-2">
                  <span className="material-symbols-outlined text-[#c6c9ab] text-sm">mail</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-sans text-xs text-white truncate">{inv.email}</p>
                    <p className="font-mono text-[9px] text-[#555]">
                      Invitado el {new Date(inv.invitedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                    </p>
                  </div>
                  <button
                    onClick={() => handleResendInvite(inv.email)}
                    className="font-mono text-[9px] text-[#00eefc] hover:underline uppercase tracking-wide flex-shrink-0"
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
