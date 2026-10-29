import React, { useMemo, useState } from 'react';
import {
  DayPlan, Exercise, MuscleGroup, MuscleGroupConfig, WeekDistribution, WorkoutExercise,
  MUSCLE_LABELS,
} from '../../types';
import {
  seriesPorGrupo, seriesPlanificadasDelDia, seriesPlanificadasDelMeso, balanceDeSeries,
} from '../../utils/programacion';
import SeriesBalance from './SeriesBalance';
import PanelIndicesCdg from '../mesociclo/PanelIndicesCdg';
import ResumenCdgDia from '../mesociclo/ResumenCdgDia';
import { Icon } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Vista previa de «Generar rutinas».

   A propósito NO trae el editor de prescripción completo (reps, RIR, descanso,
   técnica, calentamiento, progresión, vídeo). En este paso el coach decide una
   sola cosa —QUÉ ejercicios cubren las series que la distribución repartió, en
   qué orden y con cuántas series cada uno— y el editor entero convertía esa
   decisión en un muro de controles por ejercicio. El ajuste fino vive en la
   pestaña «Ejercicios», ya con el mesociclo asignado.

   Lo que sí añade, porque era justo lo que faltaba: el balance por grupo. Sin
   él, quitar un ejercicio dejaba el día por debajo del volumen planificado sin
   que nada lo dijera.
   ═══════════════════════════════════════════════════════════════════════════ */

// Extiende WorkoutExercise (no es una forma paralela) para que la previa pueda
// arrastrar los mismos campos que el editor de rutinas. `name`/`muscleGroup`/
// `equipmentMismatch` son extras de presentación, que se quitan al asignar.
export interface PreviewExercise extends WorkoutExercise {
  name: string;
  muscleGroup: MuscleGroup;
  equipmentMismatch?: boolean;
  /**
   * Por qué el generador eligió ESTE ejercicio y con estos números.
   *
   * Sin esto el coach recibe una lista que no puede auditar y la reescribe a
   * mano por desconfianza — que es el mismo final que tenía el generador viejo,
   * por otro camino. Ausente en las rutinas que vienen de una plantilla: ahí no
   * ha elegido nadie.
   */
  razones?: string[];
}

export interface PreviewDay {
  dayIndex: number;
  exercises: PreviewExercise[];
  warnings: string[];
}

interface Props {
  days: PreviewDay[];
  distribution?: WeekDistribution;
  mesoGroups: Record<MuscleGroup, MuscleGroupConfig>;
  mesoNumber: number;
  weeks: number;
  daysPerWeek: number;
  /** Semanas que dura una vuelta del microciclo (1 = semanal). */
  semanasDelCiclo: number;
  /** Veces que se repite el microciclo dentro del mesociclo. */
  vueltas: number;
  /** En qué día del ciclo (0-based) cae cada sesión — para titular «Día N» por
      el día real de calendario, no por la posición en la lista de sesiones. */
  offsets: number[];
  catalogo: Exercise[];
  onSets: (dayIdx: number, exIdx: number, sets: number) => void;
  /** Nuevo orden del día: posiciones antiguas en el orden nuevo. */
  onReordenar: (dayIdx: number, orden: number[]) => void;
  onRemove: (dayIdx: number, exIdx: number) => void;
  onReplace: (dayIdx: number, exIdx: number) => void;
  /** Con `group`, el buscador abre ya filtrado en ese grupo. */
  onAdd: (dayIdx: number, group?: MuscleGroup) => void;
  onBack: () => void;
  onAssign: () => void;
  /** Texto del botón de confirmar (por defecto «Asignar al atleta»). */
  assignLabel?: string;
}

function SetsStepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1 bg-inset rounded-control px-1 py-0.5 flex-shrink-0">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, value - 1))}
        disabled={value <= 1}
        aria-label="Quitar una serie"
        className="w-8 h-8 sm:w-6 sm:h-6 rounded-control text-ink-2 hover:bg-hairline disabled:opacity-30 font-mono text-body-s sm:text-label font-bold flex items-center justify-center transition-colors"
      >−</button>
      <span className="w-9 text-center font-mono text-title-s font-bold text-ink tabular-nums">{value}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(20, value + 1))}
        disabled={value >= 20}
        aria-label="Añadir una serie"
        className="w-8 h-8 sm:w-6 sm:h-6 rounded-control bg-accent/14 text-accent-ink hover:bg-accent/22 disabled:opacity-30 font-mono text-body-s sm:text-label font-bold flex items-center justify-center transition-colors"
      >+</button>
    </div>
  );
}

export default function RoutinePreview({
  days, distribution, mesoGroups, mesoNumber, weeks, daysPerWeek, semanasDelCiclo, vueltas, offsets, catalogo,
  onSets, onReordenar, onRemove, onReplace, onAdd, onBack, onAssign, assignLabel,
}: Props) {
  // Balance de la SEMANA: lo pautado en todos los días contra el volumen del
  // mesociclo (pestaña «Volumen»), que es el número que el coach decidió antes
  // de repartir nada.
  const balanceSemana = useMemo(() => balanceDeSeries(
    seriesPorGrupo(days.flatMap(d => d.exercises), catalogo),
    seriesPlanificadasDelMeso(mesoGroups, semanasDelCiclo),
  ), [days, catalogo, mesoGroups, semanasDelCiclo]);

  const referenciaCiclo = semanasDelCiclo === 1
    ? 'el volumen del mesociclo'
    : `el volumen del ciclo (${semanasDelCiclo.toLocaleString('es-ES')} semanas)`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="font-sans font-bold text-ink text-body-s">Vista previa de rutinas</p>
          <p className="font-mono text-caption text-ink-2">
            Meso #{mesoNumber} · {weeks} semanas · {vueltas} vueltas × {daysPerWeek} sesiones =&nbsp;
            <span className="text-accent-ink">{vueltas * daysPerWeek} sesiones</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="px-3 py-2 font-mono text-label text-ink-2 hover:text-ink border border-hairline rounded-control transition-[color,background-color,border-color,opacity,transform,box-shadow] flex items-center gap-1"
          >
            <Icon name="arrow_back" size="s" />
            Volver
          </button>
          <button
            onClick={onAssign}
            className="px-4 py-2 bg-accent text-on-accent font-sans text-label font-bold uppercase rounded-control hover:bg-accent-press active:scale-95 transition-[color,background-color,border-color,opacity,transform,box-shadow] flex items-center gap-2"
          >
            <Icon name="assignment_turned_in" size="s" />
            {assignLabel ?? 'Asignar al atleta'}
          </button>
        </div>
      </div>

      {/* Balance semanal — la cuenta que decide si esta rutina es la que se
          configuró en «Volumen» o se ha quedado corta por el camino. */}
      <div className="bg-surface border border-hairline rounded-surface px-4 py-3">
        <SeriesBalance balance={balanceSemana} referencia={referenciaCiclo} ocultarSiVacio={false} />
      </div>

      {/* Índices CDG (IF, IEM, estrés articular) de lo que se va a asignar, con los
          días en columnas. Se ve ANTES de asignar, que es cuando todavía es barato cambiar. */}
      <PanelIndicesCdg
        grupos={days.map((pd, i) => ({ name: `Día ${(offsets[i] ?? i) + 1}`, exercises: pd.exercises }))}
        meso={{}}
        semana={0}
        allExercises={catalogo}
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-start">
        {days.map((pd, dayIdx) => (
          <DiaPreview
            key={dayIdx}
            pd={pd}
            dayIdx={dayIdx}
            dayPlan={distribution?.days[dayIdx]}
            diaCalendario={(offsets[dayIdx] ?? dayIdx) + 1}
            catalogo={catalogo}
            onSets={onSets}
            onReordenar={onReordenar}
            onRemove={onRemove}
            onReplace={onReplace}
            onAdd={onAdd}
          />
        ))}
      </div>

      <p className="font-sans text-caption text-ink-3">
        Aquí solo se eligen ejercicios, orden y series. Reps, RIR, descanso, técnica, calentamiento,
        progresión y vídeo se ajustan en la pestaña «Ejercicios» una vez asignado.
      </p>
    </div>
  );
}

/* ── Un día de la vista previa, agrupado por grupo muscular (29-10) ──────────
   Propuesta 2 elegida por Dani: los ejercicios cuelgan de su grupo, con las
   series que lleva el grupo frente a las que pide la distribución del día, y
   «+ Ejercicio de X» cuando faltan. Los bloques son TRAMOS SEGUIDOS del orden
   real de la sesión: si el orden alterna empuje y tracción, el grupo sale en
   dos bloques en vez de reordenarse a escondidas. Se arrastra el bloque entero
   (asa de su cabecera) o un ejercicio dentro de su bloque.

   El texto que el generador repetía en cada fila («series, reps, RIR y
   descanso salen de la mediana de tus rutinas…») se dice una vez arriba; en la
   fila queda «15 rutinas» o «nuevo» si no lo has programado nunca. */

const TIPO_EJERCICIO = 'application/x-enforma-ejercicio';
const TIPO_BLOQUE = 'application/x-enforma-bloque';
const MEDIANA = 'mediana de tus rutinas';

interface Bloque { group: MuscleGroup; idxs: number[] }

function bloquesDe(exs: PreviewExercise[]): Bloque[] {
  const out: Bloque[] = [];
  exs.forEach((e, i) => {
    const ultimo = out[out.length - 1];
    if (ultimo && ultimo.group === e.muscleGroup) ultimo.idxs.push(i);
    else out.push({ group: e.muscleGroup, idxs: [i] });
  });
  return out;
}

/** «Lo programas en 15 rutinas tuyas» → «15 rutinas»; sin perfil → nuevo. */
function historial(razones?: string[]): { texto: string; nuevo: boolean } | null {
  if (!razones?.length) return null;
  const m = razones[0].match(/Lo programas en (\d+) (rutinas?)/);
  if (m) return { texto: `${m[1]} ${m[2]}`, nuevo: false };
  if (razones[0].startsWith('No lo tienes')) return { texto: 'nuevo · sin usar', nuevo: true };
  return null;
}

/** Lo que no es historial ni la frase de la mediana: avisos que sí hay que leer en la fila. */
const avisosDe = (razones?: string[]) =>
  (razones ?? []).slice(1).filter(r => !r.includes(MEDIANA));

function DiaPreview({ pd, dayIdx, dayPlan, diaCalendario, catalogo, onSets, onReordenar, onRemove, onReplace, onAdd }: {
  pd: PreviewDay;
  dayIdx: number;
  dayPlan?: DayPlan;
  diaCalendario: number;
  catalogo: Exercise[];
  onSets: Props['onSets'];
  onReordenar: Props['onReordenar'];
  onRemove: Props['onRemove'];
  onReplace: Props['onReplace'];
  onAdd: Props['onAdd'];
  key?: React.Key;
}) {
  const [menu, setMenu] = useState<number | null>(null);
  const [encima, setEncima] = useState<string | null>(null);

  const lleva = seriesPorGrupo(pd.exercises, catalogo);
  const pide = seriesPlanificadasDelDia(dayPlan);
  const bloques = bloquesDe(pd.exercises);
  const ultimoBloqueDe = new Map(bloques.map((b, i) => [b.group, i]));
  // Grupos que la distribución pide y no tienen ni un ejercicio.
  const vacios = [...pide.keys()].filter(g => (pide.get(g) ?? 0) > 0 && !bloques.some(b => b.group === g));
  const totalSeries = pd.exercises.reduce((s, e) => s + e.sets, 0);
  const totalPedido = [...pide.values()].reduce((a, b) => a + b, 0);
  const conMediana = pd.exercises.some(e => e.razones?.some(r => r.includes(MEDIANA)));
  const n = pd.exercises.length;

  const moverBloque = (desde: number, hacia: number) => {
    if (desde === hacia) return;
    // Bajando, cae DESPUÉS del bloque destino; subiendo, ANTES. En los dos
    // casos, sin el bloque que se mueve, eso es la posición `hacia`.
    const sin = bloques.filter((_, i) => i !== desde);
    sin.splice(hacia, 0, bloques[desde]);
    onReordenar(dayIdx, sin.flatMap(b => b.idxs));
  };
  const moverEjercicio = (b: Bloque, desde: number, hacia: number) => {
    if (desde === hacia || !b.idxs.includes(desde) || !b.idxs.includes(hacia)) return;
    const orden = Array.from({ length: n }, (_, i) => i).filter(i => i !== desde);
    orden.splice(orden.indexOf(hacia) + (desde < hacia ? 1 : 0), 0, desde);
    onReordenar(dayIdx, orden);
  };
  const leer = (e: React.DragEvent, tipo: string) => {
    try { return JSON.parse(e.dataTransfer.getData(tipo)); } catch { return null; }
  };

  const cabecera = (g: MuscleGroup) => {
    const l = lleva.get(g) ?? 0;
    const p = pide.get(g);
    const falta = p != null && l < p;
    const sobra = p != null && l > p;
    return (
      <>
        <span className="font-sans text-label font-bold text-ink">{MUSCLE_LABELS[g]}</span>
        {p != null && p > 0 && (
          <span className="h-1 w-16 rounded-full bg-raised overflow-hidden" aria-hidden>
            <span className={`block h-full ${falta ? 'bg-warning' : 'bg-success'}`} style={{ width: `${Math.min(100, (l / p) * 100)}%` }} />
          </span>
        )}
        <span className={`ml-auto flex items-center gap-1 font-mono text-caption tabular-nums ${falta ? 'text-warning' : p == null ? 'text-ink-3' : 'text-success'}`}>
          {p != null && <Icon name={falta ? 'error' : 'check_circle'} size="s" />}
          {p != null ? `${l}/${p}` : `${l} series · fuera de la distribución`}
          {falta && ` · faltan ${p! - l}`}
          {sobra && ` · +${l - p!}`}
        </span>
      </>
    );
  };

  return (
    <div className="bg-surface border border-hairline rounded-surface p-4 space-y-3 min-w-0">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-label font-bold text-ink uppercase truncate">
            Día {diaCalendario}{dayPlan?.dayType ? ` · ${dayPlan.dayType}` : ''}
          </p>
          <p className="font-mono text-caption text-ink-3 tabular-nums">
            {totalSeries} series · {n} ejerc.
            <ResumenCdgDia ejercicios={pd.exercises} allExercises={catalogo} />
          </p>
        </div>
        {totalPedido > 0 && (
          <span className={`flex-shrink-0 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-caption ${
            totalSeries === totalPedido ? 'text-success border-success/30 bg-success/8' : 'text-warning border-warning/30 bg-warning/8'
          }`}>
            <Icon name={totalSeries === totalPedido ? 'check_circle' : 'error'} size="s" />
            {totalSeries}/{totalPedido}
          </span>
        )}
      </div>
      {/* Un grupo partido en varios bloques (la guía del IH alterna empuje y
          tracción): juntarlo es decisión del coach, con un toque, no algo que
          se haga solo. */}
      {new Set(bloques.map(b => b.group)).size < bloques.length && (
        <button
          type="button"
          onClick={() => {
            const grupos = [...new Set(bloques.map(b => b.group))];
            onReordenar(dayIdx, grupos.flatMap(g => bloques.filter(b => b.group === g).flatMap(b => b.idxs)));
          }}
          className="inline-flex items-center gap-1.5 rounded-control border border-hairline px-2.5 py-1 font-mono text-caption text-ink-2 hover:border-accent-line hover:text-accent-ink"
        >
          <Icon name="join_inner" size="s" />
          Juntar cada grupo en un bloque
        </button>
      )}
      {conMediana && (
        <p className="font-mono text-caption text-ink-3">Series, reps, RIR y descanso: la mediana de tus rutinas con cada ejercicio.</p>
      )}
      {pd.warnings.filter(w => w.includes('(')).map((w, wi) => (
        <p key={wi} className="text-caption font-mono text-warning flex items-center gap-1">
          <Icon name="warning" size="s" />
          {w}
        </p>
      ))}

      {n === 0 && vacios.length === 0 && (
        <p className="font-sans text-caption text-ink-3 py-2">Sin ejercicios en este día.</p>
      )}

      {bloques.map((b, bi) => {
        const claveB = `b${bi}`;
        const l = lleva.get(b.group) ?? 0;
        const p = pide.get(b.group);
        const esUltimo = ultimoBloqueDe.get(b.group) === bi;
        return (
          <div
            key={`${b.group}-${b.idxs[0]}`}
            onDragOver={e => { if (!e.dataTransfer.types.includes(TIPO_BLOQUE)) return; e.preventDefault(); setEncima(claveB); }}
            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setEncima(v => (v === claveB ? null : v)); }}
            onDrop={e => {
              const d = leer(e, TIPO_BLOQUE);
              setEncima(null);
              if (d?.dia === dayIdx) { e.preventDefault(); moverBloque(d.b, bi); }
            }}
            className={`rounded-surface border bg-inset p-2 transition-colors ${encima === claveB ? 'border-accent' : 'border-hairline'}`}
          >
            <div className="flex items-center gap-2 px-1 pb-2">
              {bloques.length > 1 && (
                <span
                  draggable
                  onDragStart={e => {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData(TIPO_BLOQUE, JSON.stringify({ dia: dayIdx, b: bi }));
                    const caja = e.currentTarget.closest('[class*="rounded-surface"]') as HTMLElement | null;
                    if (caja) e.dataTransfer.setDragImage(caja, 16, 16);
                  }}
                  onDragEnd={() => setEncima(null)}
                  title="Arrastra para mover el grupo entero en la sesión"
                  aria-label={`Arrastrar el bloque de ${MUSCLE_LABELS[b.group]}`}
                  className="flex h-5 w-4 flex-shrink-0 cursor-grab items-center justify-center text-ink-3 hover:text-accent-ink active:cursor-grabbing"
                >
                  <Icon name="drag_indicator" size="s" />
                </span>
              )}
              {cabecera(b.group)}
            </div>

            <div className="space-y-1.5">
              {b.idxs.map(exIdx => {
                const pe = pd.exercises[exIdx];
                const claveE = `e${exIdx}`;
                const hist = historial(pe.razones);
                const avisos = avisosDe(pe.razones);
                return (
                  <div
                    key={`${pe.exerciseId}-${exIdx}`}
                    onDragOver={e => { if (!e.dataTransfer.types.includes(TIPO_EJERCICIO)) return; e.preventDefault(); e.stopPropagation(); setEncima(claveE); }}
                    onDrop={e => {
                      const d = leer(e, TIPO_EJERCICIO);
                      setEncima(null);
                      if (d?.dia === dayIdx) { e.preventDefault(); e.stopPropagation(); moverEjercicio(b, d.idx, exIdx); }
                    }}
                    className={`relative flex items-center gap-2 rounded-control border bg-raised py-2 pl-1.5 pr-1 transition-colors ${encima === claveE ? 'border-accent' : 'border-hairline'}`}
                  >
                    {b.idxs.length > 1 ? (
                      <span
                        draggable
                        onDragStart={e => {
                          e.stopPropagation();
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData(TIPO_EJERCICIO, JSON.stringify({ dia: dayIdx, idx: exIdx }));
                          if (e.currentTarget.parentElement) e.dataTransfer.setDragImage(e.currentTarget.parentElement, 12, 16);
                        }}
                        onDragEnd={() => setEncima(null)}
                        title="Arrastra para ordenar dentro del grupo"
                        aria-label={`Arrastrar ${pe.name}`}
                        className="flex h-6 w-4 flex-shrink-0 cursor-grab items-center justify-center text-ink-3 hover:text-accent-ink active:cursor-grabbing"
                      >
                        <Icon name="drag_indicator" size="s" />
                      </span>
                    ) : <span className="w-4 flex-shrink-0" />}
                    <span className="w-4 flex-shrink-0 font-mono text-caption text-ink-3 tabular-nums">{exIdx + 1}</span>

                    <div className="min-w-0 flex-1">
                      <p className="font-sans text-label font-bold text-ink leading-snug line-clamp-2">{pe.name}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-mono text-caption text-ink-3 tabular-nums">
                        {/* El esquema que puso el motor: cambia por ejercicio. */}
                        <span>{pe.reps} · RIR {pe.rir} · {pe.restSeconds}s</span>
                        {hist && (hist.nuevo
                          ? <span className="rounded-control border border-warning/40 px-1 text-warning">{hist.texto}</span>
                          : <span>· {hist.texto}</span>)}
                        {pe.equipmentMismatch && (
                          <span title="Material no disponible según el onboarding" className="rounded-control border border-warning/30 bg-warning/10 px-1 text-warning">sin material</span>
                        )}
                      </div>
                      {avisos.map((a, ai) => (
                        <p key={ai} className="mt-0.5 font-mono text-caption text-warning leading-snug">{a}</p>
                      ))}
                    </div>

                    <SetsStepper value={pe.sets} onChange={v => onSets(dayIdx, exIdx, v)} />

                    <button
                      type="button"
                      onClick={() => setMenu(menu === exIdx ? null : exIdx)}
                      aria-label={`Opciones de ${pe.name}`}
                      aria-expanded={menu === exIdx}
                      className="flex h-8 w-6 flex-shrink-0 items-center justify-center rounded-control text-ink-3 hover:bg-hairline hover:text-ink"
                    >
                      <Icon name="more_vert" size="s" />
                    </button>
                    {menu === exIdx && (
                      <>
                        <button type="button" aria-label="Cerrar opciones" className="fixed inset-0 z-20 cursor-default" onClick={() => setMenu(null)} />
                        <div role="menu" className="absolute right-1 top-full z-30 mt-1 w-52 rounded-control border border-hairline bg-raised p-1 shadow-lg">
                          <button
                            type="button" role="menuitem"
                            onClick={() => { setMenu(null); onReplace(dayIdx, exIdx); }}
                            className="flex w-full items-center gap-2 rounded-control px-2.5 py-2 text-left font-sans text-body-s text-ink hover:bg-hairline"
                          >
                            <Icon name="swap_horiz" size="s" className="text-ink-2" />
                            Cambiar ejercicio
                          </button>
                          <button
                            type="button" role="menuitem"
                            onClick={() => { setMenu(null); onRemove(dayIdx, exIdx); }}
                            className="flex w-full items-center gap-2 rounded-control px-2.5 py-2 text-left font-sans text-body-s text-danger hover:bg-hairline"
                          >
                            <Icon name="close" size="s" />
                            Quitar
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            {esUltimo && p != null && l < p && (
              <button
                type="button"
                onClick={() => onAdd(dayIdx, b.group)}
                className="mt-1.5 flex w-full items-center gap-2 rounded-control border border-dashed border-warning/45 px-3 py-2 font-sans text-body-s text-warning hover:bg-warning/8"
              >
                <Icon name="add" size="s" />
                Ejercicio de {MUSCLE_LABELS[b.group].toLowerCase()} · faltan {p - l} series
              </button>
            )}
          </div>
        );
      })}

      {vacios.map(g => (
        <div key={g} className="rounded-surface border border-hairline bg-inset p-2">
          <div className="flex items-center gap-2 px-1 pb-2">{cabecera(g)}</div>
          <button
            type="button"
            onClick={() => onAdd(dayIdx, g)}
            className="flex w-full items-center gap-2 rounded-control border border-dashed border-warning/45 px-3 py-2 font-sans text-body-s text-warning hover:bg-warning/8"
          >
            <Icon name="add" size="s" />
            Ejercicio de {MUSCLE_LABELS[g].toLowerCase()} · faltan {pide.get(g)} series
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={() => onAdd(dayIdx)}
        className="w-full flex items-center justify-center gap-2 bg-bg border border-dashed border-hairline rounded-control px-3 py-2 text-title-s font-sans text-ink-2 hover:text-accent-ink hover:border-accent/40 transition-[color,background-color,border-color,opacity,transform,box-shadow]"
      >
        <Icon name="add" size="s" />
        Añadir ejercicio
      </button>
    </div>
  );
}
