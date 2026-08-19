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
import { calcPlanExpiry } from '../hooks/usePlanExpiry';
import { getPendingReviews } from '../hooks/usePendingReviews';
import { estimateSetupPct } from '../utils/clientSetup';
import { atletasActivos, esBaja, esAnonimizado } from '../utils/atletas';
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
  // Sin filtrar: el CRM y la sección "Archivados" de abajo necesitan también
  // las bajas y los anonimizados. `athletes` (abajo) es la vista filtrada
  // que usa el resto de esta pantalla — el coach entrena hoy a esos, no a
  // los de baja ni a los perfiles borrados (ver src/utils/atletas.ts).
  const { data: allProfiles = [], isPending: loadingAthletes } = useQuery({
    queryKey: ['userProfiles'],
    queryFn: getAllUserProfiles,
  });
  const athletes: UserProfile[] = useMemo(() => atletasActivos(allProfiles), [allProfiles]);
  const archivedAthletes = useMemo(
    () => allProfiles.filter(p => esBaja(p) && !esAnonimizado(p)),
    [allProfiles]
  );

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

  // Search + grid density for the athlete list. Tarjetas más compactas y más
  // opciones de columnas (hasta 6): antes el máximo eran 4 columnas con
  // tarjetas grandes, y con más de un puñado de atletas la lista se hacía
  // larguísima de bajar.
  const [search, setSearch] = useState('');
  const [gridCols, setGridCols] = useState<2 | 3 | 4 | 5 | 6>(() => {
    const v = Number(localStorage.getItem('enforma_clients_grid_cols'));
    return v === 2 || v === 3 || v === 4 || v === 5 || v === 6 ? v : 4;
  });
  const changeGridCols = (n: 2 | 3 | 4 | 5 | 6) => {
    localStorage.setItem('enforma_clients_grid_cols', String(n));
    setGridCols(n);
  };
  const GRID_COLS_CLASS: Record<2 | 3 | 4 | 5 | 6, string> = {
    2: 'md:grid-cols-2',
    3: 'md:grid-cols-2 lg:grid-cols-3',
    4: 'md:grid-cols-2 lg:grid-cols-4',
    5: 'md:grid-cols-3 lg:grid-cols-5',
    6: 'md:grid-cols-3 lg:grid-cols-6',
  };

  // Modo de vista: tarjetas (diseño 1a) o fila compacta (diseño 1b, ~80px por
  // atleta) — para coaches con muchos atletas que prefieren hacer scroll
  // rápido antes de entrar al detalle de uno. El selector de columnas solo
  // tiene sentido en modo tarjetas.
  const [viewMode, setViewMode] = useState<'cards' | 'compact'>(() => {
    const v = localStorage.getItem('enforma_clients_view_mode');
    return v === 'compact' ? 'compact' : 'cards';
  });
  const changeViewMode = (m: 'cards' | 'compact') => {
    localStorage.setItem('enforma_clients_view_mode', m);
    setViewMode(m);
  };

  const openAthleteHub = (athlete: UserProfile & { setupPct?: number }, tab?: HubTab) => {
    const landingTab = tab ?? ((athlete.setupPct ?? 100) < 100 ? 'setup' : undefined);
    navigate(`/clients/${encodeURIComponent(athlete.email)}${landingTab ? `/${landingTab}` : ''}`);
  };

  // Busca en allProfiles, no en athletes: un enlace desde "Archivados" apunta
  // a una baja, que atletasActivos() ya no incluye.
  const selectedAthlete = useMemo(() => {
    if (!athleteId) return null;
    const decoded = decodeURIComponent(athleteId).toLowerCase();
    return allProfiles.find(a => a.email.toLowerCase() === decoded) ?? null;
  }, [allProfiles, athleteId]);

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

      const daysSinceLogin = athlete.lastLoginAt
        ? Math.floor((todayMs - new Date(athlete.lastLoginAt).getTime()) / 86_400_000)
        : null;

      const { daysLeft: planDaysLeft, expired: planExpired, expiringSoon: planSoon } = calcPlanExpiry(athlete);

      const athleteAssignments = allAssignments.get(athlete.email) ?? [];
      const setupPct = athlete.setupSummary?.pct ?? estimateSetupPct(athlete, athleteCheckins, athleteAssignments);

      // 0 = most urgent
      let sortScore = 100;
      if (planExpired)    sortScore = Math.min(sortScore, 0);
      if (planSoon)       sortScore = Math.min(sortScore, 1);
      if (checkinLate)    sortScore = Math.min(sortScore, 2);
      if (setupPct < 100) sortScore = Math.min(sortScore, 3);

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
        daysSince, checkinLate, daysSinceLogin,
        totalCheckCount: athleteCheckins.length,
        pendingCount: getPendingReviews(athleteCheckins).length,
        pendingNotesCount,
        sortScore,
        setupPct,
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

      {/* Athlete list — junto a "Atletas del Entrenador", no al final de la
          pantalla: es lo primero que el coach quiere ver al entrar. */}
      <div className="space-y-4">
        <div className="flex items-center justify-end gap-3">
          {/* Tarjetas vs. fila compacta (diseño 1b) */}
          <div className="flex bg-bg border border-hairline p-1 rounded-surface gap-1">
            <button
              onClick={() => changeViewMode('cards')}
              title="Tarjetas"
              className={`w-7 h-7 rounded-control flex items-center justify-center transition-all ${
                viewMode === 'cards' ? 'bg-accent text-black' : 'text-ink-2 hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>grid_view</span>
            </button>
            <button
              onClick={() => changeViewMode('compact')}
              title="Fila compacta"
              className={`w-7 h-7 rounded-control flex items-center justify-center transition-all ${
                viewMode === 'compact' ? 'bg-accent text-black' : 'text-ink-2 hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>table_rows</span>
            </button>
          </div>
          {viewMode === 'cards' && (
            <div className="flex bg-bg border border-hairline p-1 rounded-surface gap-1">
              {([2, 3, 4, 5, 6] as const).map(n => (
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
          )}
          <span className="text-caption bg-teal-500/10 text-teal-300 px-3 py-2 border border-teal-500/20 rounded-control font-sans uppercase whitespace-nowrap">
            {filteredAthletes.length} ATLETAS
          </span>
        </div>

        {loadingAthletes ? (
          <div className={viewMode === 'cards' ? `grid grid-cols-1 ${GRID_COLS_CLASS[gridCols]} gap-4` : 'space-y-px'}>
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
        ) : viewMode === 'compact' ? (
          /* Fila compacta (diseño 1b) — avatar, nombre, un dato clave y el
             anillo de setup, ~80px por atleta. Pensada para escanear rápido
             una lista larga antes de entrar al detalle de uno. */
          <div className="flex flex-col gap-px bg-hairline rounded-surface overflow-hidden border border-hairline">
            {filteredAthletes.map(athlete => {
              const { setupPct, totalCheckCount, checkinLate, planExpired, daysSince } = athlete;
              const isAlert = planExpired || (checkinLate && daysSince !== null && daysSince > 7);
              const ringR = 13.5, ringCx = 16, ringSize = 32;
              const ringCirc = 2 * Math.PI * ringR;
              const ringOffset = ringCirc * (1 - Math.max(0, Math.min(100, setupPct)) / 100);
              const subtitle = totalCheckCount === 0
                ? `Sin registros · racha ${athlete.currentStreak || 0} sem`
                : `${athlete.actualWeight || athlete.initialWeight} kg · racha ${athlete.currentStreak || 0} sem`;

              return (
                <button
                  key={athlete.userId}
                  onClick={() => openAthleteHub(athlete)}
                  className={`bg-bg flex items-center gap-3 px-4 py-3 text-left hover:bg-raised/50 transition-colors ${
                    isAlert ? 'shadow-[inset_3px_0_0_var(--color-danger)]' : ''
                  }`}
                >
                  <div className="w-9.5 h-9.5 rounded-full overflow-hidden border border-hairline flex-shrink-0" style={{ width: 38, height: 38 }}>
                    <img src={athlete.avatarUrl} alt={athlete.displayName} className="w-full h-full object-cover" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-sans font-bold text-white text-label truncate">{athlete.displayName}</p>
                    <p className="font-mono text-caption text-ink-2 truncate">{subtitle}</p>
                  </div>
                  <div className="relative flex-none" style={{ width: ringSize, height: ringSize }}>
                    <svg width={ringSize} height={ringSize} viewBox={`0 0 ${ringSize} ${ringSize}`} className="-rotate-90">
                      <circle cx={ringCx} cy={ringCx} r={ringR} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="2.5" />
                      <circle
                        cx={ringCx} cy={ringCx} r={ringR} fill="none" stroke={setupPct >= 100 ? 'var(--color-success)' : 'var(--color-accent)'} strokeWidth="2.5"
                        strokeLinecap="round" strokeDasharray={ringCirc} strokeDashoffset={ringOffset}
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center font-mono text-[8.5px] font-semibold text-white/80">{setupPct}%</span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className={`grid grid-cols-1 ${GRID_COLS_CLASS[gridCols]} gap-4`}>
            {filteredAthletes.map(athlete => {
              const { planDaysLeft, planExpired, planSoon, daysSince, checkinLate,
                      daysSinceLogin, pendingCount, setupPct, totalCheckCount } = athlete;
              // Alerta real (diseño 1c) — plan vencido o 7+ días sin actividad,
              // no "casi vence" ni cualquier otro matiz: eso ya lo dicen los
              // badges. El borde rojo se reserva a lo urgente de verdad.
              const isAlert = planExpired || (checkinLate && daysSince !== null && daysSince > 7);
              const setupRing = setupPct >= 100 ? 'var(--color-success)' : 'var(--color-accent)';

              // Anillo de progreso del setup — trazo fino (3px), % centrado.
              // No se reutiliza <ProgressRing/> aquí: esa tiene un trazo fijo de
              // 9px pensado para el tamaño grande del dashboard del atleta.
              const ringR = 18, ringCx = 21, ringSize = 42;
              const ringCirc = 2 * Math.PI * ringR;
              const ringOffset = ringCirc * (1 - Math.max(0, Math.min(100, setupPct)) / 100);

              return (
                <div
                  key={athlete.userId}
                  onClick={() => openAthleteHub(athlete)}
                  className={`bg-bg border rounded-surface p-4 hover:border-accent/50 cursor-pointer transition-all flex flex-col gap-3 group relative overflow-hidden ${
                    isAlert ? 'border-danger/30 shadow-[inset_3px_0_0_var(--color-danger)]' : 'border-hairline'
                  }`}
                >
                  {/* Header: avatar, nombre, email, badge de plan + anillo de setup */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-hairline group-hover:border-accent/60 transition-all flex-shrink-0">
                        <img src={athlete.avatarUrl} alt={athlete.displayName} className="w-full h-full object-cover" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-sans font-bold text-white text-label leading-snug group-hover:text-accent transition-colors truncate">{athlete.displayName}</h3>
                        <p className="font-mono text-caption text-ink-2 truncate">{athlete.email}</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {planDaysLeft !== null ? (
                            <Badge tone={planDaysLeft > 30 ? 'success' : planDaysLeft >= 0 ? 'warning' : 'danger'}>
                              {planDaysLeft >= 0 ? `Vence en ${planDaysLeft}d` : `Vencido hace ${-planDaysLeft}d`}
                            </Badge>
                          ) : (
                            <Badge tone="neutral">Sin plan</Badge>
                          )}
                          {checkinLate && (
                            <Badge tone="warning">
                              {daysSince === null ? 'Sin check-in' : `Check-in · ${daysSince}d`}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); openAthleteHub(athlete, 'setup'); }}
                      title={`Setup ${setupPct}%`}
                      className="relative flex-none z-10"
                      style={{ width: ringSize, height: ringSize }}
                    >
                      <svg width={ringSize} height={ringSize} viewBox={`0 0 ${ringSize} ${ringSize}`} className="-rotate-90">
                        <circle cx={ringCx} cy={ringCx} r={ringR} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="3" />
                        <circle
                          cx={ringCx} cy={ringCx} r={ringR} fill="none" stroke={setupRing} strokeWidth="3"
                          strokeLinecap="round" strokeDasharray={ringCirc} strokeDashoffset={ringOffset}
                          className="transition-all duration-500"
                        />
                      </svg>
                      <span className="absolute inset-0 flex items-center justify-center font-mono text-[10.5px] font-semibold text-white/85">{setupPct}%</span>
                    </button>
                  </div>

                  <div className="h-px bg-hairline" />

                  {/* Pesos, o el estado real de un atleta sin registros todavía */}
                  {totalCheckCount === 0 ? (
                    <div className="flex items-center gap-2 py-0.5">
                      <span className="material-symbols-outlined text-label text-ink-3">info</span>
                      <span className="font-mono text-caption text-ink-3">Sin registros de peso todavía</span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 text-center font-mono">
                      <div>
                        <span className="block text-caption text-ink-2 uppercase">Inicial</span>
                        <span className="block text-title-s font-bold text-white/85">{athlete.initialWeight}</span>
                      </div>
                      <div className="border-l border-hairline">
                        <span className="block text-caption text-accent uppercase font-bold">Actual</span>
                        <span className="block text-title-s font-bold text-accent">{athlete.actualWeight || athlete.initialWeight}</span>
                      </div>
                      <div className="border-l border-hairline">
                        <span className="block text-caption text-data uppercase">Meta</span>
                        <span className="block text-title-s font-bold text-data">{athlete.targetWeight}</span>
                      </div>
                    </div>
                  )}

                  <div className="h-px bg-hairline" />

                  {/* Racha + último login, dos columnas separadas por un divisor —
                      antes iba Nivel aquí, pero el coach ya no lo quiere ver. */}
                  <div className="flex items-center">
                    <div className="flex items-center gap-1.5 flex-1 font-mono text-caption">
                      <span className="material-symbols-outlined text-label text-orange-400">local_fire_department</span>
                      <span className="text-ink-2 uppercase">Racha</span>
                      <strong className="ml-auto text-white/85">{athlete.currentStreak || 0} sem</strong>
                    </div>
                    <div className="w-px h-[18px] bg-hairline mx-3.5" />
                    <div className="flex items-center gap-1.5 flex-1 font-mono text-caption">
                      <span className="material-symbols-outlined text-label text-ink-3">history</span>
                      <span className="text-ink-2 uppercase">Login</span>
                      <strong className="ml-auto text-white/85">{daysSinceLogin === null ? '—' : daysSinceLogin <= 0 ? 'Hoy' : `${daysSinceLogin}d`}</strong>
                    </div>
                  </div>

                  <div className="h-px bg-hairline" />

                  <div className="flex items-center justify-between text-label font-mono">
                    <div className="flex items-center gap-2 font-mono text-caption text-ink-2">
                      {isAlert ? (
                        <span>Última actividad {daysSince === null ? 'desconocida' : `hace ${daysSince}d`}</span>
                      ) : (
                        <span>Último reporte · {daysSince === null ? '—' : daysSince <= 0 ? 'hoy' : `hace ${daysSince}d`}</span>
                      )}
                      {pendingCount > 0 && (
                        <span className="text-caption bg-red-500/15 text-rose-400 border border-red-500/25 px-2 rounded-control font-sans uppercase">
                          {pendingCount} pend.
                        </span>
                      )}
                    </div>
                    <span className={`flex items-center gap-1 group-hover:translate-x-1 transition-transform ${isAlert ? 'text-danger' : 'text-accent'}`}>
                      <span>{isAlert ? 'Contactar' : 'Abrir Hub'}</span>
                      <span className="material-symbols-outlined text-caption">arrow_forward</span>
                    </span>
                  </div>
                </div>
              );
            })}

          </div>
        )}
      </div>

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

      {/* Bajas no anonimizadas: fuera de la lista principal (no molestan en
          HOME COACH ni en el contador), pero no desaparecidas — el coach
          puede volver a abrir su ficha. Los anonimizados no se listan aquí
          ni en ningún sitio: ya no tienen nombre ni datos, solo cuentan para
          el churn del CRM. */}
      {archivedAthletes.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer font-mono text-caption text-ink-3 uppercase tracking-wider py-2 select-none">
            Archivados ({archivedAthletes.length})
          </summary>
          <div className="mt-2 space-y-1">
            {archivedAthletes.map(a => (
              <button
                key={a.userId}
                onClick={() => openAthleteHub(a)}
                className="w-full flex items-center gap-3 bg-bg border border-hairline rounded-surface px-4 py-3 text-left hover:border-accent/40 transition-colors"
              >
                <img src={a.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover border border-hairline shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-sans text-label text-ink-2 truncate">{a.displayName}</p>
                  <p className="font-mono text-caption text-ink-4 truncate">{a.email}</p>
                </div>
                {a.fechaBaja && <Badge tone="neutral">Baja: {a.fechaBaja}</Badge>}
              </button>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
