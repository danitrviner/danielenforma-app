import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  WorkoutLog, Exercise, BodyweightLog, WeeklyChallenge, DietCompletionLog, Diet,
  WorkoutAssignment,
} from '../../types';
import { getWeeklyChallengesForAthlete, getRoadmap, getStepsForAthlete } from '../../dbService';
import { DEFAULT_LEVEL_LADDER } from '../../data/defaultLevelLadder';
import { computeLadderStatus } from '../../utils/levelLadder';
import { buildChallengeMemory } from '../../utils/challengeMemory';
import { evaluateChallengeProgress } from '../../utils/weeklyChallenge';
import { hoyIsoLocal, fechaCorta } from '../../utils/trainingWeek';
import { HubTab } from '../ClientHub';
import { Badge, BarraCumplimiento, Skeleton, Button, Collapsible } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Bloque — El reto de la semana y el peldaño.

   Los dos motores existían y los dos los veía SOLO el atleta, en su Road map.
   Para el coach eso es un punto ciego: el reto semanal es lo único de la app
   que le pide algo concreto cada siete días, y el nivel es la promesa a medio
   plazo. Si Dani no sabe si lo está consiguiendo, no puede ni felicitarle ni
   bajarle el listón — y el motor de retos ya baja la dificultad solo cuando
   falla (`difficultyFor`), así que un atleta puede llevar un mes con retos cada
   vez más suaves sin que nadie se entere.

   Aquí no se calcula nada nuevo: `evaluateChallengeProgress` es la misma
   función que pinta la barra en el móvil del atleta, y `computeLadderStatus` la
   misma que decide su peldaño. Si los dos lados usaran cuentas distintas, el
   coach le diría en el vídeo un número que el atleta no ve en su pantalla.

   Solo lee. La generación del reto y la persistencia del nivel siguen siendo
   del lado del atleta (generate-on-read en AthleteRoadmapScreen): escribir
   desde aquí duplicaría el efecto y las dos pantallas se pisarían.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Cuántos retos pasados se listan: dos meses largos. */
const RETOS_EN_EL_HISTORIAL = 10;

interface Props {
  athleteEmail: string;
  initialWeight?: number;
  logs: WorkoutLog[];
  exercises: Exercise[];
  bodyweightLogs: BodyweightLog[];
  registrosDeComida: DietCompletionLog[];
  dietas: Diet[];
  assignments: WorkoutAssignment[];
  onGoToTab: (tab: HubTab) => void;
  todoAbierto?: boolean;
}

export default function BloqueRetosNivel({
  athleteEmail, initialWeight, logs, exercises, bodyweightLogs,
  registrosDeComida, dietas, assignments, onGoToTab, todoAbierto = false,
}: Props) {
  const hoy = hoyIsoLocal();
  // Clave sin ventana a propósito: la comparten Correlaciones y el Road map
  // del coach dentro de esta misma pantalla, que necesitan la serie entera.
  const { data: retos = [], isPending: cargandoRetos } = useQuery({
    queryKey: ['weeklyChallengesForAthlete', athleteEmail],
    queryFn: () => getWeeklyChallengesForAthlete(athleteEmail),
  });
  const { data: roadmap, isPending: cargandoRoadmap } = useQuery({
    queryKey: ['roadmap', athleteEmail],
    queryFn: () => getRoadmap(athleteEmail),
  });
  const { data: stepLogs = [], isPending: cargandoPasos } = useQuery({
    queryKey: ['stepsForAthlete', athleteEmail],
    queryFn: () => getStepsForAthlete(athleteEmail),
  });

  const cargando = cargandoRetos || cargandoRoadmap || cargandoPasos;

  const ordenados = useMemo(
    () => [...retos].sort((a, b) => b.isoWeek.localeCompare(a.isoWeek)),
    [retos],
  );
  const actual: WeeklyChallenge | null = useMemo(
    () => ordenados.find(c => c.weekStart <= hoy && hoy <= c.weekEnd) ?? null,
    [ordenados, hoy],
  );

  const datos = useMemo(() => ({
    stepLogs, bodyweightLogs, workoutLogs: logs, exercises,
    completionLogs: registrosDeComida,
    coachDiets: dietas.filter(d => !d.selfManaged),
    assignments,
  }), [stepLogs, bodyweightLogs, logs, exercises, registrosDeComida, dietas, assignments]);

  const progreso = useMemo(
    () => (actual ? evaluateChallengeProgress(actual, datos, hoy) : null),
    [actual, datos, hoy],
  );

  // La memoria se calcula SIN la semana en curso (`beforeIsoWeek`): mezclar un
  // reto que aún no ha terminado con los resueltos daría una tasa de acierto
  // que cambia sola al pasar los días.
  const memoria = useMemo(
    () => buildChallengeMemory(retos, actual?.isoWeek ?? '9999-W99'),
    [retos, actual],
  );

  const nivel = useMemo(() => computeLadderStatus(
    roadmap?.levelLadder ?? DEFAULT_LEVEL_LADDER,
    { bodyweightLogs, stepLogs, workoutLogs: logs, exercises, initialWeight, today: hoy },
  ), [roadmap, bodyweightLogs, stepLogs, logs, exercises, initialWeight, hoy]);

  if (cargando) return <Skeleton className="h-48 w-full" />;

  const historial = ordenados.filter(c => c.id !== actual?.id).slice(0, RETOS_EN_EL_HISTORIAL);

  return (
    <div className="space-y-4">
      {/* ── El de esta semana ────────────────────────────────────────────── */}
      {actual && progreso ? (
        <div className="bg-raised border border-hairline rounded-surface p-4 space-y-2">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <span className="font-mono text-caption text-ink-3 uppercase tracking-[.08em] block">
                Reto de esta semana · {actual.origin === 'coach' ? 'se lo pusiste tú' : 'automático'}
              </span>
              <span className="font-sans font-bold text-label text-ink">{actual.title}</span>
            </div>
            <Badge tone={progreso.achieved ? 'success' : 'neutral'}>
              {progreso.achieved ? 'conseguido' : 'en curso'}
            </Badge>
          </div>
          <div className="flex items-center gap-3">
            {/* `BarraCumplimiento` es `w-full`, así que como hijo directo de un
                flex reclama la fila entera y se come lo que tenga al lado.
                Siempre va dentro de una caja que le fije el ancho. */}
            <div className="flex-1 min-w-0">
              <BarraCumplimiento pct={progreso.pct} />
            </div>
            <span className="font-mono text-caption text-ink-2 tabular-nums shrink-0">
              {progreso.progressValue.toLocaleString('es-ES')} / {actual.metric.target.toLocaleString('es-ES')} {actual.metric.unit}
            </span>
          </div>
          <p className="font-sans text-label text-ink-2">{actual.description}</p>
        </div>
      ) : (
        <p className="font-sans text-label text-ink-3">
          Esta semana no tiene reto. Se crea solo la primera vez que el atleta abre su Road map,
          así que si lleva días sin entrar, todavía no existe.
        </p>
      )}

      {/* ── Cómo va con ellos ────────────────────────────────────────────── */}
      {memoria.resolvedCount > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <Dato
            label="Los gana"
            valor={`${Math.round(memoria.winRate * 100)} %`}
            sub={`${memoria.wonCount} de ${memoria.resolvedCount}`}
          />
          <Dato
            label="Racha"
            valor={`${memoria.winStreak}`}
            sub={memoria.winStreak === 1 ? 'seguido' : 'seguidos'}
          />
          <Dato
            label="Peldaño"
            valor={nivel.currentLevel?.name ?? '—'}
            sub={nivel.nextLevel ? `siguiente: ${nivel.nextLevel.name}` : 'escalera completa'}
          />
        </div>
      )}

      {/* Un atleta que gana todos los retos con holgura los tiene demasiado
          fáciles, y el motor no lo detecta solo: `difficultyFor` solo AFLOJA
          cuando se falla, nunca aprieta por ir sobrado. Eso lo decide el coach,
          así que hay que decírselo. */}
      {memoria.resolvedCount >= 4 && memoria.winRate === 1 && (
        <p className="font-sans text-label text-ink-2">
          Lleva {memoria.resolvedCount} retos seguidos sin fallar ninguno: probablemente se le hayan
          quedado cortos. Súbele el listón desde su Road map.
        </p>
      )}

      {/* ── Lo que le falta para el siguiente peldaño ─────────────────────── */}
      {nivel.nextLevel && nivel.nextLevelCriteria.length > 0 && (
        <Collapsible
          key={`nivel-${todoAbierto}`}
          defaultOpen={todoAbierto}
          trigger={
            <span className="flex items-baseline gap-2">
              <span className="font-sans font-bold text-label text-ink">
                Para llegar a «{nivel.nextLevel.name}»
              </span>
              <span className="font-mono text-caption text-ink-3">
                {nivel.nextLevelCriteria.filter(c => c.done).length} de {nivel.nextLevelCriteria.length}
              </span>
            </span>
          }
        >
          <ul className="space-y-1.5 list-none">
            {nivel.nextLevelCriteria.map((c, i) => (
              <li key={i} className="flex items-center gap-3">
                <span className="font-sans text-label text-ink-2 flex-1 min-w-0 truncate">{c.criterion.label}</span>
                <div className="w-20 sm:w-28 shrink-0">
                  <BarraCumplimiento pct={c.pct} />
                </div>
                <span className="font-mono text-caption text-ink-3 tabular-nums shrink-0 w-10 text-right">
                  {Math.round(c.pct)} %
                </span>
              </li>
            ))}
          </ul>
        </Collapsible>
      )}

      {/* ── El historial ─────────────────────────────────────────────────── */}
      {historial.length > 0 && (
        <Collapsible
          key={`retos-${todoAbierto}`}
          defaultOpen={todoAbierto}
          trigger={
            <span className="flex items-baseline gap-2">
              <span className="font-sans font-bold text-label text-ink">Retos anteriores</span>
              <span className="font-mono text-caption text-ink-3">{historial.length}</span>
            </span>
          }
        >
          <ul className="divide-y divide-hairline list-none">
            {historial.map(c => (
              <li key={c.id} className="py-2 flex items-baseline justify-between gap-3">
                <span className="font-mono text-caption text-ink-3 tabular-nums shrink-0">
                  {fechaCorta(c.weekStart)}
                </span>
                <span className="font-sans text-label text-ink-2 flex-1 min-w-0 truncate">{c.title}</span>
                <Badge tone={c.status === 'conseguido' ? 'success' : c.status === 'fallido' ? 'danger' : 'neutral'}>
                  {c.status}
                </Badge>
              </li>
            ))}
          </ul>
        </Collapsible>
      )}

      <div className="flex justify-end">
        <Button variant="ghost" onClick={() => onGoToTab('roadmap')}>
          Ver y cambiar su Road map
        </Button>
      </div>
    </div>
  );
}

function Dato({ label, valor, sub }: { label: string; valor: string; sub: string }) {
  return (
    <div className="bg-raised border border-hairline rounded-surface p-3 text-center">
      <span className="block font-mono text-caption text-ink-3 uppercase tracking-[.08em]">{label}</span>
      <span className="block font-sans font-bold text-title-s text-ink mt-0.5">{valor}</span>
      <span className="block font-mono text-caption text-ink-3">{sub}</span>
    </div>
  );
}
