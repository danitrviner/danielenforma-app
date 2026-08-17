import React, { useState, useEffect, useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { UserProfile, WeightCheckIn, WorkoutAssignment, WorkoutLog } from '../types';
import { getAllUserProfiles, createNotificationDeduped, getWorkoutAssignments, getWorkoutLogs } from '../dbService';
import ClientHub, { HubTab, HUB_TABS } from './ClientHub';
import HomeCoachScreen from './HomeCoachScreen';
import AthletesBar from './AthletesBar';
import CoachNotesPanel from './CoachNotesPanel';
import WeeklyAnalysisButton from './WeeklyAnalysisButton';
import { computeAdherenceScore, scoreStyle, SIN_DATOS_ADHERENCIA } from '../utils/adherence';
import { calcPlanExpiry } from '../hooks/usePlanExpiry';
import { getPendingReviews } from '../hooks/usePendingReviews';
import { estimateSetupPct } from '../utils/clientSetup';
import ProgressRing from './ProgressRing';
import { Skeleton } from './ui';
import { EmptyState, Badge } from './ui';

const DEFAULT_HUB_TAB: HubTab = 'revisiones';

interface ClientsScreenProps {
  checkins: WeightCheckIn[];
  onRefreshCheckIns: () => void;
  coachId: string;
  coachEmail: string;
}

export default function ClientsScreen({ checkins, onRefreshCheckIns, coachId, coachEmail }: ClientsScreenProps) {
  const navigate = useNavigate();
  const { athleteId, hubTab } = useParams<{ athleteId?: string; hubTab?: string }>();
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
  // 06-2. `enabled: !athleteId` — con la ficha de un cliente abierta, esta
  // pantalla no se ve: la ocupa ClientHub. Sin esto, abrir un cliente seguía
  // manteniendo vivas y refrescándose las N consultas de la lista entera.
  const assignmentsQueries = useQueries({
    queries: athletes.map(a => ({
      queryKey: ['workoutAssignments', a.userId],
      queryFn: () => getWorkoutAssignments(a.userId),
      enabled: !athleteId,
    })),
  });
  const allAssignments = new Map<string, WorkoutAssignment[]>();
  athletes.forEach((a, i) => allAssignments.set(a.email, assignmentsQueries[i]?.data ?? []));
  const loadingAssignments = assignmentsQueries.some(q => q.isPending);

  /* 06-2. Esta pantalla leía TODOS los entrenamientos de TODOS los atletas —un
     `where athleteId ==` sin `limit`, historial completo— y lo único que hacía
     con ellos era contar notas sin leer para el badge de la tarjeta. Con 30
     atletas eran ~5.700 documentos por montaje, y con el `refetchOnWindowFocus`
     de antes, otra vez en cada vuelta al primer plano.

     Ahora pide solo la ventana que necesita, y bajo una CLAVE DE CACHÉ PROPIA
     (`recientes`): compartir la clave con ClientHub —que sí necesita el
     historial entero para récords y reportes— le habría servido una lista
     recortada desde la caché, y los récords del atleta habrían salido mal sin
     que nada diera error.

     Lo que se pierde: una nota sin leer de hace más de 120 días deja de contar
     en el badge. Si una nota lleva cuatro meses sin abrirse, el badge no es el
     problema. */
  // Se calcula una vez por montaje, no por render: forma parte de la clave de
  // caché, y una clave que cambia en cada render vuelve a leer en cada render.
  const desdeVentana = useMemo(() => {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    return new Date(hoy.getTime() - 120 * 86_400_000).toISOString().slice(0, 10);
  }, []);

  const workoutLogsQueries = useQueries({
    queries: athletes.map(a => ({
      queryKey: ['workoutLogs', a.email, 'recientes', desdeVentana],
      queryFn: () => getWorkoutLogs(a.email, { desde: desdeVentana, limite: 200 }),
      enabled: !athleteId,
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

  // Alias de pestañas retiradas: los enlaces/bookmarks antiguos siguen vivos,
  // solo redirigen. "periodizacion" vive ahora dentro de Entrenamientos.
  // "analisis" (la pestaña única de antes, sin sub-pestaña en la URL) aterriza
  // en Reportes, la primera de las tres pestañas en que se dividió — el caso
  // CON sub-pestaña (/clients/:id/analisis/:subTab) lo resuelve un redirect
  // propio en App.tsx antes de llegar aquí (ver AnalisisSubTabRedirect).
  const activeHubTab: HubTab = hubTab === 'periodizacion'
    ? 'entrenamientos'
    : hubTab === 'analisis'
      ? 'reportes'
      : (hubTab && (HUB_TABS as readonly string[]).includes(hubTab))
        ? (hubTab as HubTab)
        : DEFAULT_HUB_TAB;

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
        adherenceHasData: adherence.hasData,
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
        onTabChange={tab => navigate(`/clients/${athleteId}/${tab}`)}
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

      {/* Contador + próximos a finalizar + buscador + invitar/invitaciones
          pendientes, unificados y arriba del todo (antes: contador y
          buscador en dos tarjetas separadas más abajo, e invitar solo
          alcanzable desde CRM > Clientes). */}
      <AthletesBar
        count={athletes.length}
        finishingSoon={athletesFinishingSoon}
        onOpenAthlete={userId => {
          const athlete = enrichedAthletes.find(a => a.userId === userId);
          if (athlete) openAthleteHub(athlete);
        }}
        search={search}
        onSearchChange={setSearch}
      />

      {!loadingAthletes && (
        <HomeCoachScreen
          athletes={athletes}
          checkins={checkins}
          assignmentsByEmail={allAssignments}
          loadingAssignments={loadingAssignments}
        />
      )}

      {/* Pendientes: notas del atleta sin leer + to-do privado del coach, en una sola tarjeta */}
      <CoachNotesPanel
        athletes={athletes}
        athletesWithPendingNotes={enrichedAthletes}
        onOpenAthleteNotes={userId => {
          const athlete = enrichedAthletes.find(a => a.userId === userId);
          if (athlete) openAthleteHub(athlete, 'entrenamientos');
        }}
      />

      {/* Athlete list */}
      <div className="space-y-4">
        <div className="flex items-center justify-end gap-3">
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

        {loadingAthletes ? (
          <div className={`grid grid-cols-1 ${GRID_COLS_CLASS[gridCols]} gap-4`}>
            <Skeleton className="h-40 w-full rounded-surface" />
            <Skeleton className="h-40 w-full rounded-surface" />
            <Skeleton className="h-40 w-full rounded-surface" />
          </div>
        ) : athletes.length === 0 ? (
          <EmptyState
            icon="group"
            title="No hay atletas registrados todavía."
            actionLabel="Invitar a tu primer atleta"
            onAction={() => navigate('/crm/clientes')}
          />
        ) : filteredAthletes.length === 0 ? (
          <EmptyState icon="search_off" title={`Ningún atleta coincide con "${search}".`} />
        ) : (
          <div className={`grid grid-cols-1 ${GRID_COLS_CLASS[gridCols]} gap-4`}>
            {filteredAthletes.map(athlete => {
              const { planDaysLeft, planExpired, planSoon, daysSince, checkinLate,
                      totalCheckCount, pendingCount, adherenceScore, adherenceHasData, setupPct } = athlete;
              const adh = adherenceHasData ? scoreStyle(adherenceScore) : SIN_DATOS_ADHERENCIA;
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
                            <Badge tone={planDaysLeft > 30 ? 'success' : planDaysLeft >= 0 ? 'warning' : 'danger'}>
                              {planDaysLeft >= 0 ? `Vence en ${planDaysLeft}d` : `Vencido hace ${-planDaysLeft}d`}
                            </Badge>
                          ) : (
                            <Badge tone="neutral">Sin plan</Badge>
                          )}
                          {/* Check-in atrasado badge */}
                          {checkinLate && (
                            <Badge tone="warning">
                              {daysSince === null ? 'Sin check-in' : `Check-in · ${daysSince}d`}
                            </Badge>
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
                        <span className={`text-body-s font-bold ${adh.text}`}>{adherenceHasData ? adherenceScore : '—'}</span>
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
    </div>
  );
}
