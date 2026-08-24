import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ExperienceLevel, Mesocycle, MuscleGroup, MuscleGroupConfig, MUSCLE_LABELS, MUSCLE_ORDER,
} from '../types';
import type { VolumeLandmark } from '../data/volumeLandmarks';
import { suggestVolume, VolumeIntent, SERIES_POR_DIA_TOPE } from '../utils/volumeSuggestion';
import { buildVolumeHistoryFrom } from '../utils/volumeHistory';
import { TRAINING_SPLITS } from '../utils/trainingSplits';
import { diasDeCiclo } from '../utils/progression';
import { zoneLabel, heatmapText } from '../utils/volumeZones';
import {
  getExercises, getWorkoutLogs, getWorkoutAssignmentsByMesocycleIds,
  getQuestionnairesByCoach, getResponsesForAthlete,
} from '../dbService';
import { Sheet, Button, Icon, SegmentedControl, Skeleton } from './ui';

/* ═══════════════════════════════════════════════════════════════════════════
   «Sugerir volumen» — propone las series semanales de los 17 grupos.

   Dos pasos a propósito. El primero confirma con qué se va a decidir (nivel,
   prioridades, dial); el segundo enseña el resultado ANTES de tocar nada, con
   el porqué de cada número al desplegar la fila. El motor es puro y síncrono
   (utils/volumeSuggestion.ts), así que mover el dial recalcula al instante sin
   volver a pedir nada.

   Aplicar tiene dos formas porque son dos intenciones distintas: pisar los 17
   grupos, o rellenar solo los que siguen a 0 y respetar lo que el coach ya
   hubiera tocado a mano.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  editing: Mesocycle;
  mesocycles: Mesocycle[];
  landmarks: Record<MuscleGroup, VolumeLandmark>;
  athleteLevel?: ExperienceLevel;
  athleteEmail: string;
  coachId: string;
  onClose: () => void;
  onApply: (groups: Record<MuscleGroup, MuscleGroupConfig>, mode: 'replace' | 'fillZeros') => void;
}

const NIVELES: { value: ExperienceLevel; label: string }[] = [
  { value: 'principiante', label: 'Principiante' },
  { value: 'intermedio',   label: 'Intermedio' },
  { value: 'avanzado',     label: 'Avanzado' },
];

const INTENCIONES: { value: VolumeIntent; label: string }[] = [
  { value: 'conservador', label: 'Conservador' },
  { value: 'estandar',    label: 'Estándar' },
  { value: 'agresivo',    label: 'Agresivo' },
];

export default function VolumeSuggestionSheet({
  editing, mesocycles, landmarks, athleteLevel, athleteEmail, coachId, onClose, onApply,
}: Props) {
  const [paso, setPaso] = useState<1 | 2>(1);
  const [level, setLevel] = useState<ExperienceLevel>(athleteLevel ?? 'intermedio');
  const [intent, setIntent] = useState<VolumeIntent>('estandar');
  const [prioridades, setPrioridades] = useState<Record<MuscleGroup, 'alta' | 'media' | 'baja'>>(
    () => Object.fromEntries(
      MUSCLE_ORDER.map(g => [g, editing.groups[g]?.priority ?? 'media']),
    ) as Record<MuscleGroup, 'alta' | 'media' | 'baja'>,
  );
  const [prioridadesTocadas, setPrioridadesTocadas] = useState(false);
  const [filaAbierta, setFilaAbierta] = useState<MuscleGroup | null>(null);
  // Cómo aplicar la propuesta. Vive aquí y no en dos botones del pie porque
  // tres botones en el pie de una hoja no caben en un móvil, y porque elegir
  // primero y confirmar después se lee mejor que dos botones que hacen cosas
  // parecidas pero no iguales.
  const [modo, setModo] = useState<'replace' | 'fillZeros'>('replace');

  // Las cinco piezas del historial, cada una con la MISMA queryKey que ya usa
  // el resto de la app (ClientHub, MesocycleDashboard…). Es deliberado: leerlas
  // por su cuenta duplicaría lecturas de Firestore que ya están en memoria —
  // `getExercises` sola son 1.700 documentos. Así, abrir esta hoja con la ficha
  // del cliente ya cargada no cuesta ni una lectura nueva.
  const mesoIds = useMemo(() => mesocycles.map(m => m.id), [mesocycles]);
  const q = {
    exercises:      useQuery({ queryKey: ['exercises'], queryFn: getExercises }),
    logs:           useQuery({ queryKey: ['workoutLogs', athleteEmail], queryFn: () => getWorkoutLogs(athleteEmail) }),
    assignments:    useQuery({ queryKey: ['workoutAssignmentsByMesocycleIds', mesoIds], queryFn: () => getWorkoutAssignmentsByMesocycleIds(mesoIds), enabled: mesoIds.length > 0 }),
    questionnaires: useQuery({ queryKey: ['questionnairesByCoach', coachId], queryFn: () => getQuestionnairesByCoach(coachId) }),
    responses:      useQuery({ queryKey: ['responsesForAthlete', athleteEmail], queryFn: () => getResponsesForAthlete(athleteEmail) }),
  };
  // El historial es una MEJORA de la sugerencia, no un requisito: mientras
  // carga (o si algo falla) se propone solo por reglas, que es exactamente lo
  // que hay que hacer con un cliente nuevo.
  const cargandoHistorial = Object.values(q).some(r => r.isPending);
  const history = useMemo(() => buildVolumeHistoryFrom({
    mesocycles, currentId: editing.id,
    logs: q.logs.data ?? [],
    exercises: q.exercises.data ?? [],
    assignments: q.assignments.data ?? [],
    questionnaires: q.questionnaires.data ?? [],
    responses: q.responses.data ?? [],
  }), [mesocycles, editing.id, q.logs.data, q.exercises.data, q.assignments.data, q.questionnaires.data, q.responses.data]);

  // Lo que el atleta pidió priorizar al cerrar el bloque anterior se
  // pre-marca solo — pero deja de imponerse en cuanto el coach toca algo.
  const prioridadesEfectivas = useMemo(() => {
    if (prioridadesTocadas) return prioridades;
    const pedidos = history.feedback?.priorityGroups ?? [];
    if (pedidos.length === 0) return prioridades;
    const copia = { ...prioridades };
    for (const g of pedidos) copia[g] = 'alta';
    return copia;
  }, [prioridades, prioridadesTocadas, history.feedback]);

  const split = editing.splitId ? TRAINING_SPLITS.find(s => s.id === editing.splitId) : undefined;
  const cicloDias = diasDeCiclo(editing.daysPerWeek, editing.cycleDays);
  const semanasDelCiclo = cicloDias / 7;
  const sesionesPorSemana = Math.max(1, Math.round(editing.daysPerWeek / semanasDelCiclo));

  const resultado = useMemo(() => suggestVolume({
    landmarks,
    daysPerWeek: editing.daysPerWeek,
    semanasDelCiclo,
    splitId: editing.splitId,
    level,
    intent,
    priorities: prioridadesEfectivas,
    history,
  }), [landmarks, editing.daysPerWeek, semanasDelCiclo, editing.splitId, level, intent, prioridadesEfectivas, history]);

  const totalActual = MUSCLE_ORDER.reduce((s, g) => s + (editing.groups[g]?.series ?? 0), 0);

  const cambiarPrioridad = (g: MuscleGroup) => {
    setPrioridadesTocadas(true);
    setPrioridades(prev => {
      const actual = (prioridadesTocadas ? prev : prioridadesEfectivas)[g];
      const siguiente = actual === 'alta' ? 'baja' : actual === 'baja' ? 'media' : 'alta';
      return { ...(prioridadesTocadas ? prev : prioridadesEfectivas), [g]: siguiente };
    });
  };

  const resumenHistorial = (() => {
    if (cargandoHistorial) return null;
    if (!history.previous) return 'Sin bloque anterior registrado: la propuesta sale solo de las reglas.';
    const partes = [`Meso #${history.previous.number}`];
    if (history.adherencePct != null) partes.push(`${history.adherencePct}% de adherencia`);
    if (history.meanRir != null) partes.push(`RIR medio ${history.meanRir}`);
    if (history.feedback?.recovery != null) partes.push(`recuperación ${history.feedback.recovery}/10`);
    return partes.join(' · ');
  })();

  return (
    <Sheet
      open
      onClose={onClose}
      title={paso === 1 ? 'Sugerir volumen' : 'Propuesta de volumen'}
      size="l"
      footer={paso === 1 ? (
        <>
          <Button variant="secondary" onClick={onClose} fullWidth>Cancelar</Button>
          <Button onClick={() => setPaso(2)} icon="auto_awesome" fullWidth>Ver propuesta</Button>
        </>
      ) : (
        <>
          <Button variant="secondary" onClick={() => setPaso(1)} icon="arrow_back" fullWidth>Ajustar</Button>
          <Button onClick={() => onApply(resultado.groups, modo)} icon="check" fullWidth>
            {modo === 'replace' ? 'Sustituir todo' : 'Rellenar los 0'}
          </Button>
        </>
      )}
    >
      {paso === 1 ? (
        <div className="space-y-5">
          {/* Lo que ya está decidido en el mesociclo: se enseña, no se pregunta. */}
          <div className="flex flex-wrap gap-2">
            {[
              `${sesionesPorSemana} sesiones/sem`,
              semanasDelCiclo === 1 ? 'ciclo semanal' : `ciclo de ${semanasDelCiclo.toLocaleString('es-ES')} semanas`,
              `${editing.weeks} vueltas`,
              split ? split.label : 'sin reparto elegido',
              editing.deloadWeek !== undefined ? `descarga en la semana ${editing.deloadWeek}` : 'sin descarga',
            ].map(t => (
              <span key={t} className="rounded-chip border border-hairline bg-raised px-2.5 py-1 font-mono text-caption text-ink-2">{t}</span>
            ))}
          </div>

          {cargandoHistorial ? (
            <Skeleton className="h-10 w-full rounded-surface" />
          ) : (
            <div className="flex items-start gap-2 bg-bg border border-hairline rounded-surface px-3 py-2.5">
              <Icon name="history" size="s" className="text-ink-3 flex-shrink-0 mt-px" />
              <p className="font-mono text-caption text-ink-2 leading-relaxed">{resumenHistorial}</p>
            </div>
          )}

          <div className="space-y-2">
            <span className="font-mono text-caption text-ink-2 uppercase tracking-wider">Nivel del atleta</span>
            <SegmentedControl
              label="Nivel del atleta"
              value={level}
              onChange={v => setLevel(v as ExperienceLevel)}
              options={NIVELES}
            />
            <p className="font-sans text-caption text-ink-3">
              Marca de dónde parte cada grupo dentro de su rango: mínimo efectivo, entrada del rango adaptativo o su mitad.
            </p>
          </div>

          <div className="space-y-2">
            <span className="font-mono text-caption text-ink-2 uppercase tracking-wider">Cuánto empujar</span>
            <SegmentedControl
              label="Intención"
              value={intent}
              onChange={v => setIntent(v as VolumeIntent)}
              options={INTENCIONES}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-caption text-ink-2 uppercase tracking-wider">Prioridad por grupo</span>
              <span className="font-mono text-caption text-ink-3">⭐ alta · ◑ media · ⚪ baja</span>
            </div>
            <p className="font-sans text-caption text-ink-3">
              Pulsa para cambiarla. Los ⭐ suben dentro de su rango y son los últimos que se recortan; los ⚪ bajan al volumen de mantenimiento.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {MUSCLE_ORDER.map(g => {
                const p = prioridadesEfectivas[g];
                const tono = p === 'alta'
                  ? 'border-accent bg-accent/14 text-accent'
                  : p === 'baja'
                    ? 'border-hairline bg-transparent text-ink-3'
                    : 'border-hairline bg-raised text-ink-2';
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => cambiarPrioridad(g)}
                    className={`inline-flex items-center gap-1 rounded-chip border px-2.5 py-1.5 font-sans text-caption transition-colors ${tono}`}
                  >
                    <span>{p === 'alta' ? '⭐' : p === 'baja' ? '⚪' : '◑'}</span>
                    {MUSCLE_LABELS[g]}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* El dial sigue aquí: la gracia de un motor síncrono es poder moverlo
              y ver la tabla cambiar sin salir de la previsualización. */}
          <SegmentedControl
            label="Intención"
            value={intent}
            onChange={v => setIntent(v as VolumeIntent)}
            options={INTENCIONES}
          />

          <div className="bg-surface border border-hairline rounded-surface px-4 py-3 flex items-end justify-between gap-3 flex-wrap">
            <div>
              <span className="font-mono text-caption text-ink-2 uppercase tracking-[.1em] block">Series por semana</span>
              <div className="flex items-baseline gap-2">
                <span className="font-mono font-semibold text-title-l text-ink tabular-nums">{resultado.totalSeries}</span>
                <span className="font-mono text-caption text-ink-3">ahora {totalActual}</span>
              </div>
            </div>
            <span className="font-mono text-caption text-ink-3">
              Techo semanal: {sesionesPorSemana} × {SERIES_POR_DIA_TOPE} = {sesionesPorSemana * SERIES_POR_DIA_TOPE}
            </span>
          </div>

          {resultado.warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 bg-orange-500/10 border border-orange-500/30 rounded-surface px-3 py-2.5">
              <Icon name="warning" size="s" className="text-orange-400 flex-shrink-0 mt-px" />
              <p className="font-sans text-caption text-orange-300 leading-relaxed">{w}</p>
            </div>
          ))}

          <div className="rounded-surface border border-hairline overflow-hidden">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-bg">
                  <th className="text-left px-3 py-2 font-mono text-caption text-ink-2 uppercase tracking-wider border-b border-hairline">Grupo</th>
                  <th className="text-right px-2 py-2 font-mono text-caption text-ink-2 uppercase tracking-wider border-b border-hairline">Ahora</th>
                  <th className="text-right px-2 py-2 font-mono text-caption text-ink-2 uppercase tracking-wider border-b border-hairline">Propuesto</th>
                  <th className="text-right px-2 py-2 font-mono text-caption text-ink-2 uppercase tracking-wider border-b border-hairline">Δ</th>
                  <th className="text-right px-3 py-2 font-mono text-caption text-ink-2 uppercase tracking-wider border-b border-hairline">Zona</th>
                </tr>
              </thead>
              <tbody>
                {MUSCLE_ORDER.map(g => {
                  const actual = editing.groups[g]?.series ?? 0;
                  const propuesto = resultado.groups[g].series;
                  const delta = propuesto - actual;
                  const abierta = filaAbierta === g;
                  return (
                    <React.Fragment key={g}>
                      <tr
                        onClick={() => setFilaAbierta(abierta ? null : g)}
                        className="border-b border-hairline cursor-pointer hover:bg-white/[.02]"
                      >
                        <td className="px-3 py-2 font-sans text-label text-ink whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5">
                            <Icon name="expand_more" size="s" className={`text-ink-3 transition-transform ${abierta ? 'rotate-180' : ''}`} />
                            {MUSCLE_LABELS[g]}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-right font-mono text-label text-ink-3 tabular-nums">{actual}</td>
                        <td className="px-2 py-2 text-right font-mono text-label font-bold tabular-nums" style={{ color: heatmapText(propuesto, landmarks[g]) }}>
                          {propuesto}
                        </td>
                        <td className="px-2 py-2 text-right font-mono text-caption tabular-nums" style={{
                          color: delta > 0 ? 'var(--color-success)' : delta < 0 ? 'var(--color-danger)' : 'var(--color-ink-3)',
                        }}>
                          {delta > 0 ? `+${delta}` : delta < 0 ? delta : '='}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-caption" style={{ color: heatmapText(propuesto, landmarks[g]) }}>
                          {zoneLabel(propuesto, landmarks[g])}
                        </td>
                      </tr>
                      {abierta && (
                        <tr className="border-b border-hairline bg-bg">
                          <td colSpan={5} className="px-3 py-2.5">
                            <ul className="space-y-1">
                              {resultado.reasons[g].map((r, i) => (
                                <li key={i} className="flex items-start gap-2">
                                  <span className="text-accent font-mono text-caption mt-0.5 flex-shrink-0">·</span>
                                  <span className="font-sans text-caption text-ink-2 leading-relaxed">{r}</span>
                                </li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="space-y-2">
            <span className="font-mono text-caption text-ink-2 uppercase tracking-wider">Cómo aplicarlo</span>
            <SegmentedControl
              label="Cómo aplicarlo"
              value={modo}
              onChange={v => setModo(v as 'replace' | 'fillZeros')}
              options={[
                { value: 'replace',   label: 'Sustituir todo' },
                { value: 'fillZeros', label: 'Solo los que están a 0' },
              ]}
            />
            <p className="font-mono text-caption text-ink-3">
              «Sustituir todo» pisa los 17 grupos. «Solo los que están a 0» respeta lo que ya hayas puesto a mano.
            </p>
          </div>
        </div>
      )}
    </Sheet>
  );
}
