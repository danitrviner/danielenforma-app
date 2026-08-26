import React, { useMemo, useState } from 'react';
import { Exercise, Mesocycle, WorkoutAssignment, WorkoutLog, BodyweightLog } from '../types';
import { buildCierreMesociclo, FilaVolumenGrupo } from '../utils/cierreMesociclo';
import { ExercisePerf } from '../utils/trainingReport';
import { IEARow } from '../utils/accumulatedStimulusIndex';
import { Sexo } from '../utils/athleteProfileSignals';
import { e1rmAlometrico, pesoCorporalEn } from '../utils/allometricScore';
import { useToast } from '../hooks/useToast';
import { Icon, EmptyState, Badge, SegmentedControl } from './ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Cierre del mesociclo — solo para el entrenador.

   Responde a las cuatro preguntas que se hacen al terminar un bloque y que
   hasta ahora había que contestar a mano revisando sesión por sesión:
   ¿lo hizo?, ¿hizo el volumen que le puse?, ¿está más fuerte?, ¿en qué?

   Todo son cuentas locales sobre los logs del atleta (ver utils/cierreMesociclo
   y utils/trainingReport). Sin IA: los mismos datos dan siempre los mismos
   números y el mismo borrador de texto.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  meso: Mesocycle;
  mesocycles: Mesocycle[];
  logs: WorkoutLog[];
  assignments: WorkoutAssignment[];
  exercises: Exercise[];
  athleteName?: string;
  cargando?: boolean;
  // Para el 1RM alométrico de la tabla «Fuerza» — null-tolerante: sin sexo o
  // sin peso registrado en el bloque, la columna simplemente no aparece.
  sexo?: Sexo | null;
  pesoLogs?: BodyweightLog[];
}

function Delta({ pct, invertido = false }: { pct: number | null; invertido?: boolean }) {
  if (pct == null) return <span className="font-mono text-caption text-ink-3">—</span>;
  const bueno = invertido ? pct < 0 : pct > 0;
  const color = pct === 0 ? 'var(--color-ink-3)' : bueno ? 'var(--color-success)' : 'var(--color-danger)';
  return (
    <span className="font-mono text-caption tabular-nums" style={{ color }}>
      {pct > 0 ? '▲+' : pct < 0 ? '▼' : '='}{pct !== 0 ? `${pct}%` : ''}
    </span>
  );
}

function Tile({ label, value, sub, color = 'var(--color-ink)' }: {
  label: string; value: React.ReactNode; sub?: React.ReactNode; color?: string;
}) {
  return (
    <div className="bg-surface border border-hairline rounded-surface px-4 py-3 flex-1 min-w-[140px]">
      <span className="font-mono text-caption text-ink-2 uppercase tracking-[.1em] block">{label}</span>
      <span className="font-mono font-semibold text-title-l tabular-nums block leading-tight" style={{ color }}>{value}</span>
      {sub && <span className="font-mono text-caption text-ink-3 block">{sub}</span>}
    </div>
  );
}

/** Barra de cumplimiento: verde a partir del 90%, ámbar por encima del 70%, rojo por debajo. */
function BarraCumplimiento({ pct }: { pct: number | null }) {
  if (pct == null) return null;
  const color = pct >= 90 ? 'var(--color-success)' : pct >= 70 ? 'var(--color-warning)' : 'var(--color-danger)';
  return (
    <div className="relative h-1 rounded-full bg-track w-full min-w-[48px]">
      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, pct)}%`, backgroundColor: color }} />
      {pct > 100 && <div className="absolute inset-y-0 right-0 w-px bg-white/40" />}
    </div>
  );
}

type Vista = 'volumen' | 'fuerza' | 'grupos' | 'patrones' | 'estimulo';

export default function MesocycleReviewPanel({
  meso, mesocycles, logs, assignments, exercises, athleteName, cargando = false,
  sexo = null, pesoLogs = [],
}: Props) {
  const { showToast } = useToast();
  const [vista, setVista] = useState<Vista>('volumen');

  const cierre = useMemo(
    () => buildCierreMesociclo({ meso, mesocycles, logs, assignments, exercises, athleteName }),
    [meso, mesocycles, logs, assignments, exercises, athleteName],
  );

  // Peso corporal al final del bloque (aproximación documentada: si el
  // atleta no se pesó ese día, es la última medida conocida hasta esa fecha)
  // — para el 1RM alométrico, que corrige el sesgo del peso corporal.
  const pesoEnCierre = useMemo(() => pesoCorporalEn(cierre.fin, pesoLogs), [cierre.fin, pesoLogs]);

  const copiar = async (texto: string, queEs: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      showToast(`${queEs} copiado al portapapeles.`, 'success');
    } catch {
      showToast('El navegador no ha dejado copiar. Selecciona el texto a mano.');
    }
  };

  if (cargando) {
    return <p className="font-mono text-caption text-ink-2">Cargando sesiones registradas…</p>;
  }

  const sinDatos = cierre.informe.sessions === 0;

  return (
    <div className="space-y-4">
      {/* Cabecera */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="font-sans font-bold text-white text-body-s">
            Cierre del mesociclo #{cierre.numero}{cierre.objetivo ? ` · ${cierre.objetivo}` : ''}
          </p>
          <p className="font-mono text-caption text-ink-2">
            {cierre.inicio} → {cierre.fin} · {cierre.semanas} sem × {cierre.diasSemana} días ·{' '}
            {cierre.comparacion === 'sin mesociclo previo'
              ? 'sin bloque anterior con el que comparar'
              : `comparado con ${cierre.comparacion}`}
          </p>
        </div>
        <Badge tone={cierre.enCurso ? 'warning' : 'success'}>
          {cierre.enCurso ? 'En curso' : 'Terminado'}
        </Badge>
      </div>

      {cierre.enCurso && (
        <div className="flex items-start gap-2 bg-orange-500/10 border border-orange-500/30 rounded-surface px-3 py-2.5">
          <Icon name="warning" size="s" className="text-orange-400 flex-shrink-0 mt-px" />
          <p className="font-sans text-caption text-orange-300 leading-relaxed">
            El mesociclo todavía no ha terminado ({cierre.fin}). Los números son de lo que va registrado hasta hoy,
            así que el volumen realizado saldrá corto por definición.
          </p>
        </div>
      )}

      {sinDatos ? (
        <div className="border border-dashed border-hairline rounded-surface">
          <EmptyState
            icon="bar_chart"
            title="Sin sesiones registradas en este mesociclo."
            description="El cierre se calcula con lo que el atleta registra al entrenar. En cuanto haya sesiones aparecerán aquí el volumen realizado, la fuerza y los récords."
          />
        </div>
      ) : (
        <>
          {/* Los cuatro números de cabecera */}
          <div className="flex flex-wrap gap-3">
            <Tile
              label="Adherencia"
              value={cierre.sesiones.adherenciaPct != null ? `${cierre.sesiones.adherenciaPct}%` : '—'}
              sub={cierre.sesiones.programadas > 0
                ? `${cierre.sesiones.completadas}/${cierre.sesiones.programadas} sesiones`
                : 'sin sesiones asignadas'}
              color={
                cierre.sesiones.adherenciaPct == null ? 'var(--color-ink-3)'
                : cierre.sesiones.adherenciaPct >= 85 ? 'var(--color-success)'
                : cierre.sesiones.adherenciaPct >= 65 ? 'var(--color-warning)' : 'var(--color-danger)'
              }
            />
            <Tile
              label="Volumen hecho"
              value={cierre.volumen.pct != null ? `${cierre.volumen.pct}%` : '—'}
              sub={`${cierre.volumen.totalRealizadas} de ${cierre.volumen.totalProgramadas} series`}
              color={
                cierre.volumen.pct == null ? 'var(--color-ink-3)'
                : cierre.volumen.pct >= 90 ? 'var(--color-success)'
                : cierre.volumen.pct >= 70 ? 'var(--color-warning)' : 'var(--color-danger)'
              }
            />
            <Tile
              label="Tonelaje"
              value={`${cierre.informe.tonnage.current.toLocaleString('es-ES', { maximumFractionDigits: 0 })} kg`}
              sub={<Delta pct={cierre.informe.tonnage.deltaPct} />}
            />
            <Tile
              label="Récords"
              value={cierre.informe.perExercise.filter(e => e.isPR).length}
              sub={`${cierre.informe.sessions} sesiones registradas`}
              color="var(--color-accent)"
            />
          </div>

          {/* Titulares — lo que el coach le cuenta al cliente */}
          {cierre.titulares.length > 0 && (
            <div className="bg-surface border border-hairline rounded-surface p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-caption text-ink-2 uppercase tracking-wider">Lo que hay que contarle</span>
                <button
                  onClick={() => copiar(cierre.titulares.map(t => `· ${t}`).join('\n'), 'Resumen')}
                  className="flex items-center gap-1 font-sans text-caption font-bold text-accent hover:text-white transition-colors"
                >
                  <Icon name="content_copy" size="s" />
                  Copiar
                </button>
              </div>
              <ul className="space-y-1.5">
                {cierre.titulares.map((t, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-accent font-mono text-caption mt-0.5 flex-shrink-0">·</span>
                    <span className="font-sans text-label text-ink leading-relaxed">{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <SegmentedControl
            label="Detalle del cierre"
            value={vista}
            onChange={v => setVista(v as Vista)}
            options={[
              { value: 'volumen',  label: 'Volumen' },
              { value: 'fuerza',   label: 'Fuerza' },
              { value: 'grupos',   label: 'Por grupo' },
              { value: 'patrones', label: 'Rendimiento' },
              { value: 'estimulo', label: 'Estímulo (IEA)' },
            ]}
          />

          {vista === 'volumen'  && <TablaVolumen filas={cierre.volumen.filas} comparacion={cierre.comparacion} />}
          {vista === 'fuerza'   && <TablaFuerza ejercicios={cierre.informe.perExercise} comparacion={cierre.comparacion} sexo={sexo} pesoKg={pesoEnCierre} />}
          {vista === 'grupos'   && <TablaGrupos grupos={cierre.informe.muscleGroups} comparacion={cierre.comparacion} />}
          {vista === 'patrones' && <TablaGrupos grupos={cierre.patrones} comparacion={cierre.comparacion} />}
          {vista === 'estimulo' && <TablaEstimulo filas={cierre.estimuloAcumulado} />}

          {/* Borrador para el cliente */}
          <div className="bg-surface border border-hairline rounded-surface p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-caption text-ink-2 uppercase tracking-wider">Borrador para el cliente</span>
              <button
                onClick={() => copiar(cierre.resumenParaCliente, 'Borrador')}
                className="flex items-center gap-1 font-sans text-caption font-bold text-accent hover:text-white transition-colors"
              >
                <Icon name="content_copy" size="s" />
                Copiar
              </button>
            </div>
            <p className="font-sans text-label text-ink leading-relaxed bg-bg border border-hairline rounded-control p-3">
              {cierre.resumenParaCliente}
            </p>
            <p className="font-mono text-caption text-ink-3">
              Escrito con sus propios datos, sin IA. Es un punto de partida — edítalo antes de mandarlo.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

// ── Tablas de detalle ────────────────────────────────────────────────────────

function TablaVolumen({ filas, comparacion }: { filas: FilaVolumenGrupo[]; comparacion: string }) {
  if (filas.length === 0) {
    return <p className="font-sans text-caption text-ink-3">Este mesociclo no tenía volumen configurado por grupo.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-surface border border-hairline">
      <table className="w-full border-collapse" style={{ minWidth: '520px' }}>
        <thead>
          <tr className="bg-bg">
            <th className="text-left px-3 py-2.5 font-mono text-caption text-ink-2 uppercase tracking-wider border-b border-hairline">Grupo</th>
            <th className="text-right px-3 py-2.5 font-mono text-caption text-ink-2 uppercase tracking-wider border-b border-hairline">Sem. ({comparacion})</th>
            <th className="text-right px-3 py-2.5 font-mono text-caption text-ink-2 uppercase tracking-wider border-b border-hairline">Programadas</th>
            <th className="text-right px-3 py-2.5 font-mono text-caption text-ink-2 uppercase tracking-wider border-b border-hairline">Hechas</th>
            <th className="text-left px-3 py-2.5 font-mono text-caption text-ink-2 uppercase tracking-wider border-b border-hairline w-[130px]">Cumplimiento</th>
          </tr>
        </thead>
        <tbody>
          {filas.map(f => (
            <tr key={f.group} className="border-b border-hairline last:border-b-0">
              <td className="px-3 py-2.5 font-sans text-label text-ink whitespace-nowrap">{f.label}</td>
              <td className="px-3 py-2.5 text-right font-mono text-caption text-ink-2 tabular-nums whitespace-nowrap">
                {f.semanalesPrevias != null ? `${f.semanalesPrevias} → ` : ''}<span className="text-ink">{f.semanales}</span>
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-label text-ink-2 tabular-nums">{f.programadas}</td>
              <td className="px-3 py-2.5 text-right font-mono text-label font-bold text-ink tabular-nums">{f.realizadas}</td>
              <td className="px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <BarraCumplimiento pct={f.pct} />
                  <span className="font-mono text-caption text-ink-2 tabular-nums w-10 text-right flex-shrink-0">
                    {f.pct != null ? `${f.pct}%` : '—'}
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TablaFuerza({ ejercicios, comparacion, sexo, pesoKg }: {
  ejercicios: ExercisePerf[]; comparacion: string; sexo: Sexo | null; pesoKg: number | null;
}) {
  if (ejercicios.length === 0) {
    return <p className="font-sans text-caption text-ink-3">Sin ejercicios registrados en la ventana del mesociclo.</p>;
  }
  // Por 1RM estimado descendente: la pregunta de esta tabla es la fuerza, no el volumen.
  const orden = [...ejercicios].sort((a, b) => b.bestOrm - a.bestOrm);
  const alometricoDisponible = sexo != null && pesoKg != null;
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-surface border border-hairline">
        <table className="w-full border-collapse" style={{ minWidth: alometricoDisponible ? '620px' : '520px' }}>
          <thead>
            <tr className="bg-bg">
              <th className="text-left px-3 py-2.5 font-mono text-caption text-ink-2 uppercase tracking-wider border-b border-hairline">Ejercicio</th>
              <th className="text-right px-3 py-2.5 font-mono text-caption text-ink-2 uppercase tracking-wider border-b border-hairline">Series</th>
              <th className="text-right px-3 py-2.5 font-mono text-caption text-ink-2 uppercase tracking-wider border-b border-hairline">Tonelaje</th>
              <th className="text-right px-3 py-2.5 font-mono text-caption text-ink-2 uppercase tracking-wider border-b border-hairline">1RM est.</th>
              {alometricoDisponible && (
                <th className="text-right px-3 py-2.5 font-mono text-caption text-ink-2 uppercase tracking-wider border-b border-hairline">1RM alom.</th>
              )}
              <th className="text-right px-3 py-2.5 font-mono text-caption text-ink-2 uppercase tracking-wider border-b border-hairline">vs {comparacion}</th>
            </tr>
          </thead>
          <tbody>
            {orden.map(e => (
              <tr key={e.exerciseId} className="border-b border-hairline last:border-b-0">
                <td className="px-3 py-2.5 font-sans text-label text-ink">
                  <span className="flex items-center gap-2">
                    <span className="truncate">{e.name}</span>
                    {e.isPR && <Badge tone="accent">PR</Badge>}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-label text-ink-2 tabular-nums">{e.sets}</td>
                <td className="px-3 py-2.5 text-right font-mono text-label text-ink-2 tabular-nums">
                  {e.tonnage.toLocaleString('es-ES', { maximumFractionDigits: 0 })} kg
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-label font-bold text-ink tabular-nums">{e.bestOrm} kg</td>
                {alometricoDisponible && (
                  <td className="px-3 py-2.5 text-right font-mono text-label text-ink-2 tabular-nums">
                    {e1rmAlometrico(e.bestOrm, pesoKg!, sexo!) ?? '—'}
                  </td>
                )}
                <td className="px-3 py-2.5 text-right"><Delta pct={e.deltaOrmPct} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {alometricoDisponible ? (
        <p className="font-mono text-caption text-ink-3">
          1RM alométrico = 1RM est. / Peso^{sexo === 'hombre' ? '0.55' : '0.50'} — corrige el sesgo de comparar fuerza
          entre pesos corporales distintos. Calculado con el peso del {pesoKg}kg registrado hacia el {comparacion === 'sin mesociclo previo' ? 'final del bloque' : 'cierre'}.
        </p>
      ) : (
        <p className="font-mono text-caption text-ink-3">
          Falta {sexo == null ? 'el sexo biológico (anamnesis)' : 'un peso corporal registrado'} para mostrar el 1RM alométrico.
        </p>
      )}
    </div>
  );
}

// Forma común a MuscleGroupPerf y PatternPerf (movementPatterns.ts) — la tabla
// no necesita saber si `group` es un grupo muscular o un patrón de movimiento.
interface GroupPerfLike {
  group: string;
  label: string;
  tonnage: number;
  tonnageDeltaPct: number | null;
  sets: number;
  meanOrm: number | null;
  ormDeltaPct: number | null;
}

function TablaGrupos({ grupos, comparacion }: { grupos: GroupPerfLike[]; comparacion: string }) {
  if (grupos.length === 0) {
    return <p className="font-sans text-caption text-ink-3">Sin series registradas por grupo muscular.</p>;
  }
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-surface border border-hairline">
        <table className="w-full border-collapse" style={{ minWidth: '520px' }}>
          <thead>
            <tr className="bg-bg">
              <th className="text-left px-3 py-2.5 font-mono text-caption text-ink-2 uppercase tracking-wider border-b border-hairline">Grupo</th>
              <th className="text-right px-3 py-2.5 font-mono text-caption text-ink-2 uppercase tracking-wider border-b border-hairline">Series</th>
              <th className="text-right px-3 py-2.5 font-mono text-caption text-ink-2 uppercase tracking-wider border-b border-hairline">Tonelaje</th>
              <th className="text-right px-3 py-2.5 font-mono text-caption text-ink-2 uppercase tracking-wider border-b border-hairline">vs {comparacion}</th>
              <th className="text-right px-3 py-2.5 font-mono text-caption text-ink-2 uppercase tracking-wider border-b border-hairline">1RM medio</th>
            </tr>
          </thead>
          <tbody>
            {grupos.map(g => (
              <tr key={g.group} className="border-b border-hairline last:border-b-0">
                <td className="px-3 py-2.5 font-sans text-label text-ink whitespace-nowrap">{g.label}</td>
                <td className="px-3 py-2.5 text-right font-mono text-label text-ink-2 tabular-nums">{g.sets}</td>
                <td className="px-3 py-2.5 text-right font-mono text-label text-ink tabular-nums">
                  {g.tonnage.toLocaleString('es-ES', { maximumFractionDigits: 0 })} kg
                </td>
                <td className="px-3 py-2.5 text-right"><Delta pct={g.tonnageDeltaPct} /></td>
                <td className="px-3 py-2.5 text-right font-mono text-label text-ink-2 tabular-nums">
                  {g.meanOrm != null ? `${g.meanOrm} kg` : '—'} <Delta pct={g.ormDeltaPct} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="font-mono text-caption text-ink-3">
        Las series de esta tabla son efectivas ponderadas: el grupo principal del ejercicio cuenta 1 y cada
        secundario 0,5. La tabla de «Volumen» cuenta solo el principal, que es la unidad con la que se programó.
      </p>
    </div>
  );
}

function TablaEstimulo({ filas }: { filas: IEARow[] }) {
  if (filas.length === 0) {
    return <p className="font-sans text-caption text-ink-3">Sin series registradas por grupo muscular.</p>;
  }
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-surface border border-hairline">
        <table className="w-full border-collapse" style={{ minWidth: '480px' }}>
          <thead>
            <tr className="bg-bg">
              <th className="text-left px-3 py-2.5 font-mono text-caption text-ink-2 uppercase tracking-wider border-b border-hairline">Grupo</th>
              <th className="text-right px-3 py-2.5 font-mono text-caption text-ink-2 uppercase tracking-wider border-b border-hairline">Series efect.</th>
              <th className="text-right px-3 py-2.5 font-mono text-caption text-ink-2 uppercase tracking-wider border-b border-hairline">RIR medio</th>
              <th className="text-right px-3 py-2.5 font-mono text-caption text-ink-2 uppercase tracking-wider border-b border-hairline">IEA</th>
            </tr>
          </thead>
          <tbody>
            {filas.map(f => (
              <tr key={f.group} className="border-b border-hairline last:border-b-0">
                <td className="px-3 py-2.5 font-sans text-label text-ink whitespace-nowrap">{f.label}</td>
                <td className="px-3 py-2.5 text-right font-mono text-label text-ink-2 tabular-nums">{f.fractionalSets}</td>
                <td className="px-3 py-2.5 text-right font-mono text-label text-ink-2 tabular-nums">{f.meanRir != null ? f.meanRir : '—'}</td>
                <td className="px-3 py-2.5 text-right font-mono text-label font-bold text-ink tabular-nums">{f.iea != null ? f.iea : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="font-mono text-caption text-ink-3">
        IEA = series efectivas × (RIR medio real / 10) — sustituye al tonelaje bruto, que se dispara solo por cambiar el
        rango de repeticiones aunque el estímulo real no haya subido. Sin RIR registrado en el bloque, sale «—».
      </p>
    </div>
  );
}
