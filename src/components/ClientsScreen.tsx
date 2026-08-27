import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useQueries, useQuery, useIsFetching, useIsMutating } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { UserProfile, WeightCheckIn, WorkoutAssignment, WorkoutLog } from '../types';
import { getAllUserProfiles, createNotificationDeduped, getWorkoutAssignments, getWorkoutLogs } from '../dbService';
import ClientHub, { HubTab, HUB_TABS } from './ClientHub';
import HomeCoachScreen from './HomeCoachScreen';
import AthletesBar from './AthletesBar';
import CoachNotesPanel from './CoachNotesPanel';
import InvitarAtletaModal from '../features/crm/components/InvitarAtletaModal';
import { calcPlanExpiry } from '../hooks/usePlanExpiry';
import { getPendingReviews } from '../hooks/usePendingReviews';
import { estimateSetupPct } from '../utils/clientSetup';
import { atletasActivos, esBaja, esAnonimizado } from '../utils/atletas';
import { Skeleton } from './ui';
import { EmptyState, Badge } from './ui';

const DEFAULT_HUB_TAB: HubTab = 'revisiones';

// Forma de cada elemento de `enrichedAthletes` (más abajo) — hecha a mano
// porque ese array sale de un useMemo sin tipo propio y AthleteRow necesita
// un tipo con nombre para vivir fuera del componente (ver comentario junto a
// AthleteRow). Si el useMemo deja de calcular alguno de estos campos, tsc lo
// marca aquí como incompatibilidad de tipos.
type EnrichedAthlete = UserProfile & {
  planDaysLeft: number | null;
  planExpired: boolean;
  planSoon: boolean;
  daysSince: number | null;
  checkinLate: boolean;
  daysSinceLogin: number | null;
  totalCheckCount: number;
  pendingCount: number;
  pendingNotesCount: number;
  sortScore: number;
  setupPct: number;
};

// Envuelta en React.memo y hecha componente aparte (antes iba inline dentro
// del .map()) — la lista de atletas puede ser larga y antes cualquier estado
// de ClientsScreen (búsqueda, sincronización...) repintaba cada fila igual.
// Depende de que `onOpen` tenga identidad estable (useCallback más abajo) y
// de que `athlete` no se reconstruya en cada render (ya sale de un useMemo).
const AthleteRow = React.memo(function AthleteRow({ athlete, onOpen }: {
  athlete: EnrichedAthlete;
  onOpen: (athlete: EnrichedAthlete) => void;
}) {
  const { pendingCount, daysSince, daysSinceLogin } = athlete;
  const revisionLabel = daysSince === null ? '—' : daysSince <= 0 ? 'hoy' : `hace ${daysSince}d`;
  const loginLabel = daysSinceLogin === null ? '—' : daysSinceLogin <= 0 ? 'hoy' : `hace ${daysSinceLogin}d`;
  const metaLine = pendingCount > 0
    ? `${pendingCount} revisión${pendingCount === 1 ? '' : 'es'} pendiente${pendingCount === 1 ? '' : 's'}`
    : `Último acceso: ${loginLabel} · Última revisión: ${revisionLabel}`;

  return (
    <button
      onClick={() => onOpen(athlete)}
      className="flex items-center gap-3 bg-raised border border-hairline rounded-control px-3 py-2.5 text-left hover:border-accent/40 transition-colors"
    >
      <div className="w-8 h-8 rounded-full overflow-hidden border border-hairline flex-shrink-0">
        <img src={athlete.avatarUrl} alt={athlete.displayName} loading="lazy" decoding="async" className="w-full h-full object-cover" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-sans font-bold text-white text-label truncate">{athlete.displayName}</p>
        <p className="font-mono text-caption text-ink-3 truncate mt-0.5">{metaLine}</p>
      </div>
    </button>
  );
});

interface ClientsScreenProps {
  checkins: WeightCheckIn[];
  onRefreshCheckIns: () => void;
  coachId: string;
  coachEmail: string;
}

export default function ClientsScreen({ checkins, onRefreshCheckIns, coachId, coachEmail }: ClientsScreenProps) {
  const navigate = useNavigate();
  const { athleteId, hubTab } = useParams<{ athleteId?: string; hubTab?: string }>();
  // "Sincronizado" solo mientras hay algo de verdad en vuelo — antes era texto
  // fijo, sin relación con si había o no una petición en curso.
  // Ambos hooks se llaman siempre, nunca dentro de un `||` — cortocircuitar
  // haría que `useIsMutating` se saltara algunos renders y no otros, cambiando
  // el nº de hooks entre renders (React lo detecta y rompe el componente).
  const fetchingCount = useIsFetching();
  const mutatingCount = useIsMutating();
  const isSyncing = fetchingCount > 0 || mutatingCount > 0;
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
      queryFn: () => getWorkoutAssignments({ uid: a.userId, email: a.email }),
      enabled: !athleteId,
    })),
  });
  // Memoizado: sin esto, un Map nuevo en cada render invalidaba también el
  // useMemo de `enrichedAthletes` (lo tiene como dependencia) en cada render
  // — lo que a su vez habría dejado sin efecto el React.memo de AthleteRow,
  // porque cada `athlete` habría sido un objeto distinto cada vez aunque
  // nada suyo hubiera cambiado de verdad.
  const allAssignments = useMemo(() => {
    const map = new Map<string, WorkoutAssignment[]>();
    athletes.forEach((a, i) => map.set(a.email, assignmentsQueries[i]?.data ?? []));
    return map;
  }, [athletes, assignmentsQueries]);
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
  const allWorkoutLogs = useMemo(() => {
    const map = new Map<string, WorkoutLog[]>();
    athletes.forEach((a, i) => map.set(a.email, workoutLogsQueries[i]?.data ?? []));
    return map;
  }, [athletes, workoutLogsQueries]);

  // Buscador de la lista de atletas.
  const [search, setSearch] = useState('');

  // "Todos los atletas" — desplegable 1:1 con `OFICIAL - Home Coach.dc.html`:
  // abierto por defecto, igual que el mockup (`allAthletesOpen: true`).
  const [allAthletesOpen, setAllAthletesOpen] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);

  const openAthleteHub = useCallback((athlete: UserProfile & { setupPct?: number }, tab?: HubTab) => {
    const landingTab = tab ?? ((athlete.setupPct ?? 100) < 100 ? 'setup' : undefined);
    navigate(`/clients/${encodeURIComponent(athlete.email)}${landingTab ? `/${landingTab}` : ''}`);
  }, [navigate]);

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
        {isSyncing && (
          <div className="flex items-center gap-3 mb-2">
            <span className="inline-flex items-center gap-2 text-label font-mono text-data">
              <span className="w-2 h-2 rounded-full bg-data animate-pulse"></span>
              Sincronizando…
            </span>
          </div>
        )}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="font-sans font-extrabold text-display tracking-tight text-white uppercase">Clientes</h1>
        </div>
      </header>

      {/* Buscador — 1:1 con `OFICIAL - Home Coach.dc.html`. */}
      <AthletesBar search={search} onSearchChange={setSearch} />

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

      {/* "Todos los atletas" — 1:1 con `OFICIAL - Home Coach.dc.html`:
          desplegable con fila simple (avatar, nombre, último acceso · última
          revisión, o el aviso urgente si lo tiene) e "Invitar atleta" junto a
          la cabecera. La parrilla rica de antes (badges de plan, racha,
          anillo de setup, peso) sigue disponible al abrir el Hub del atleta —
          solo deja de mostrarse en este vistazo rápido. */}
      <div className="bg-surface border border-hairline rounded-surface p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <button
            type="button"
            onClick={() => setAllAthletesOpen(v => !v)}
            className="flex items-center gap-2 font-sans font-bold text-title-s text-white uppercase whitespace-nowrap"
          >
            <span className="material-symbols-outlined text-data">group</span>
            Todos los atletas
            <span className="text-ink-2 normal-case font-mono text-label">· {athletes.length}</span>
          </button>
          <div className="flex items-center gap-2.5 flex-none">
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              className="flex items-center gap-1.5 font-mono text-caption font-bold uppercase text-accent border border-accent/35 rounded-control px-2.5 py-1.5 whitespace-nowrap"
            >
              <span className="material-symbols-outlined text-body-s">person_add</span>
              Invitar atleta
            </button>
            <button
              type="button"
              onClick={() => setAllAthletesOpen(v => !v)}
              className={`text-ink-2 transition-transform duration-(--duration-state) ${allAthletesOpen ? 'rotate-180' : ''}`}
            >
              <span className="material-symbols-outlined">expand_more</span>
            </button>
          </div>
        </div>

        {allAthletesOpen && (
          loadingAthletes ? (
            <div className="space-y-1">
              <Skeleton className="h-11 w-full rounded-control" />
              <Skeleton className="h-11 w-full rounded-control" />
              <Skeleton className="h-11 w-full rounded-control" />
            </div>
          ) : athletes.length === 0 ? (
            <EmptyState
              icon="group"
              title="No hay atletas registrados todavía."
              actionLabel="Invitar a tu primer atleta"
              onAction={() => setInviteOpen(true)}
            />
          ) : filteredAthletes.length === 0 ? (
            <EmptyState icon="search_off" title={`Ningún atleta coincide con "${search}".`} />
          ) : (
            <div className="flex flex-col gap-1.5">
              {filteredAthletes.map(athlete => (
                <AthleteRow key={athlete.userId} athlete={athlete} onOpen={openAthleteHub} />
              ))}
            </div>
          )
        )}
      </div>

      {inviteOpen && <InvitarAtletaModal onCerrar={() => setInviteOpen(false)} />}

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
                <img src={a.avatarUrl} alt="" loading="lazy" decoding="async" className="w-8 h-8 rounded-full object-cover border border-hairline shrink-0" />
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
