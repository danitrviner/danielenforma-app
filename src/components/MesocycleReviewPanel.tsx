import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Exercise, Mesocycle, WorkoutAssignment, WorkoutLog, BodyweightLog } from '../types';
import { auth } from '../firebase';
import { getBodyMeasurementsForAthlete, getNutritionProgram, getOnboarding, getQuestionnairesByCoach, getResponsesForAthlete } from '../dbService';
import { bodyMeasurementsForAthleteKey } from '../hooks/useBodyMeasurements';
import type { FilaVolumenGrupo } from '../utils/cierreMesociclo';
import { buildCierreCompleto } from '../utils/cierreCompleto';
import { useMotorCdg } from '../hooks/useMotorCdg';
import { iemDeLogs, filasIEM, type FilaIEM } from '../utils/cdg';
import { Sexo } from '../utils/athleteProfileSignals';
import { useToast } from '../hooks/useToast';
import { Icon, EmptyState, Badge, SegmentedControl, BarraCumplimiento } from './ui';
import {
  fmt, conSigno, colorDelta, Tile, Seccion, SemanaASemana, Podio, ListaEjercicios, Agregado,
} from './cierre/piezas';
import VeredictosDeHipotesis from './cierre/VeredictosDeHipotesis';
import { mapaDeRespuesta } from '../utils/hipotesisDeBloque/mapaDeRespuesta';

/* ═══════════════════════════════════════════════════════════════════════════
   Cierre del mesociclo — solo para el entrenador.

   Responde a las preguntas que se hacen al terminar un bloque: ¿está más
   fuerte?, ¿en qué y cuánto?, ¿lo hizo?, ¿cómo ha ido semana a semana?, ¿qué
   se ha quedado parado? Y deja escrito lo que hay que contarle al cliente.

   Rehecho el 16-11-2026: antes solo comparaba con el mesociclo ANTERIOR, y
   como casi todos los atletas están en su primer bloque, no salía ningún %.
   Ahora la referencia principal es el propio bloque —la primera semana de
   cada ejercicio frente a las últimas— (utils/progresionDelBloque.ts), y la
   comparación con el bloque anterior queda como capa extra cuando existe.

   Todo son cuentas locales sobre los logs del atleta. Sin IA.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  meso: Mesocycle;
  mesocycles: Mesocycle[];
  logs: WorkoutLog[];
  assignments: WorkoutAssignment[];
  exercises: Exercise[];
  athleteName?: string;
  cargando?: boolean;
  // Para el 1RM alométrico y el lastre de dominadas/fondos — null-tolerante.
  sexo?: Sexo | null;
  pesoLogs?: BodyweightLog[];
}

type Vista = 'ejercicios' | 'patrones' | 'grupos' | 'volumen' | 'estimulo';

export default function MesocycleReviewPanel({
  meso, mesocycles, logs, assignments, exercises, athleteName, cargando = false,
  sexo = null, pesoLogs = [],
}: Props) {
  const { showToast } = useToast();
  const [vista, setVista] = useState<Vista>('ejercicios');
  const { motor, cargando: cargandoCdg, noSubido } = useMotorCdg();

  // Lo que el mensaje dice del cuerpo y del bienestar sale de las medidas, los
  // cuestionarios y la fase de nutrición. Se piden aquí con las mismas claves
  // que Revisión › Cierre de bloque (casi siempre ya en caché) para que el
  // mensaje de esta pantalla sea EL MISMO que el de allí, no uno más corto.
  const email = meso.athleteId || '';
  const coachUid = auth.currentUser?.uid ?? '';
  const { data: medidas } = useQuery({
    queryKey: bodyMeasurementsForAthleteKey(email),
    queryFn: () => getBodyMeasurementsForAthlete(email),
    enabled: !!email,
  });
  const { data: respuestas } = useQuery({
    queryKey: ['responsesForAthlete', email],
    queryFn: () => getResponsesForAthlete(email),
    enabled: !!email,
  });
  const { data: cuestionarios } = useQuery({
    queryKey: ['questionnairesByCoach', coachUid],
    queryFn: () => getQuestionnairesByCoach(coachUid),
    enabled: !!coachUid,
  });
  const { data: programa } = useQuery({
    queryKey: ['nutritionProgram', email],
    queryFn: () => getNutritionProgram(email),
    enabled: !!email,
  });

  // Nivel del atleta: a un avanzado, la hipótesis se le juzga a dos bloques.
  const { data: alta } = useQuery({
    queryKey: ['onboarding', email],
    queryFn: () => getOnboarding(email),
    enabled: !!email,
  });

  // El cierre entero y su único mensaje (utils/cierreCompleto). El peso
  // corporal al final del bloque lo resuelve el propio motor: suma a las
  // series de dominadas/fondos y alimenta el 1RM alométrico.
  const completo = useMemo(
    () => buildCierreCompleto({
      meso, mesocycles, logs, assignments, exercises, athleteName,
      bodyweightLogs: pesoLogs, medidas, responses: respuestas, questionnaires: cuestionarios, programaNutricion: programa,
      // Con el motor CDG salen también los veredictos de las hipótesis del bloque.
      motorCdg: motor, nivel: alta?.experienceLevel,
    }),
    [meso, mesocycles, logs, assignments, exercises, athleteName, pesoLogs, medidas, respuestas, cuestionarios, programa, motor, alta?.experienceLevel],
  );
  const { cierre, pesoCorporalKg: pesoEnCierre, mensaje: mensajeGenerado, hipotesis } = completo;
  const mapa = useMemo(() => mapaDeRespuesta(mesocycles).frase, [mesocycles]);
  const prog = cierre.progresion;
  const res = prog.resumen;

  // El borrador se edita aquí mismo antes de copiarlo; vuelve al generado si
  // cambian los datos (otro bloque, logs nuevos).
  const [borrador, setBorrador] = useState(mensajeGenerado);
  useEffect(() => { setBorrador(mensajeGenerado); }, [mensajeGenerado]);

  // Estímulo (IEM de CDG) de las sesiones del bloque.
  const estimulo = useMemo(() => {
    if (!motor) return null;
    const delBloque = logs.filter(l => l.date >= cierre.inicio && l.date <= cierre.fin);
    const nombreCdgDe = (id: string) => exercises.find(e => e.id === id)?.cdgNombre;
    const r = iemDeLogs(motor, delBloque, nombreCdgDe);
    return { filas: filasIEM(motor, r.IEM), sinVinculo: r.sinVinculo.map(id => exercises.find(e => e.id === id)?.name ?? id) };
  }, [motor, logs, cierre.inicio, cierre.fin, exercises]);

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
  const hayAnterior = cierre.comparacion !== 'sin mesociclo previo';
  const adh = cierre.sesiones.adherenciaPct;
  const vol = cierre.volumen.pct;

  return (
    <div className="space-y-4">
      {/* Cabecera */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="font-sans font-bold text-ink text-body-s">
            Cierre de {cierre.nombre}{cierre.objetivo ? ` · ${cierre.objetivo}` : ''}
          </p>
          <p className="font-mono text-caption text-ink-2">
            {cierre.inicio} → {cierre.fin} · {cierre.semanas} sem × {cierre.diasSemana} días ·{' '}
            progresión del inicio al final del bloque{hayAnterior ? ` y comparado con ${cierre.comparacion}` : ''}
          </p>
        </div>
        <Badge tone={cierre.enCurso ? 'warning' : 'success'}>
          {cierre.enCurso ? 'En curso' : 'Terminado'}
        </Badge>
      </div>

      {cierre.enCurso && !sinDatos && (
        <div className="flex items-start gap-2 bg-warning/10 border border-warning/30 rounded-surface px-3 py-2.5">
          <Icon name="warning" size="s" className="text-warning flex-shrink-0 mt-px" />
          <p className="font-sans text-caption text-warning leading-relaxed">
            El mesociclo todavía no ha terminado ({cierre.fin}). La progresión compara lo que va registrado hasta hoy
            con su primera semana.
          </p>
        </div>
      )}

      {sinDatos ? (
        <div className="border border-dashed border-hairline rounded-surface">
          <EmptyState
            icon="bar_chart"
            title="Sin sesiones registradas en este mesociclo."
            description="El cierre se calcula con lo que el atleta registra al entrenar. En cuanto haya sesiones aparecerán aquí la progresión de cada ejercicio, el volumen y la adherencia."
          />
        </div>
      ) : (
        <>
          {/* ── Los números de cabecera ── */}
          <div className="flex flex-wrap gap-3">
            <Tile
              icon="trending_up"
              label="Fuerza"
              value={res.medianaPct != null ? `${conSigno(res.medianaPct)}%` : '—'}
              sub={res.comparables > 0
                ? `mejora en ${res.mejoran} de ${res.comparables} ejercicios`
                : 'falta una segunda semana para comparar'}
              color={colorDelta(res.medianaPct)}
            />
            <Tile
              icon="event_available"
              label="Adherencia"
              value={adh != null ? `${adh}%` : '—'}
              sub={cierre.sesiones.programadas > 0
                ? `${cierre.sesiones.completadas}/${cierre.sesiones.programadas} sesiones`
                : `${cierre.sesiones.registradas} sesiones registradas`}
              color={adh == null ? 'var(--color-ink-3)' : adh >= 85 ? 'var(--color-success)' : adh >= 65 ? 'var(--color-warning)' : 'var(--color-danger)'}
            />
            <Tile
              icon="fitness_center"
              label="Volumen hecho"
              value={vol != null ? `${vol}%` : '—'}
              sub={`${cierre.volumen.totalRealizadas} de ${cierre.volumen.totalProgramadas} series`}
              color={vol == null ? 'var(--color-ink-3)' : vol >= 90 ? 'var(--color-success)' : vol >= 70 ? 'var(--color-warning)' : 'var(--color-danger)'}
            />
            <Tile
              icon="monitoring"
              label="Kg por semana"
              value={res.tonelajeSemanal?.deltaPct != null ? `${conSigno(res.tonelajeSemanal.deltaPct)}%` : '—'}
              sub={res.tonelajeSemanal
                ? `${fmt(Math.round(res.tonelajeSemanal.inicio), 0)} → ${fmt(Math.round(res.tonelajeSemanal.final), 0)} kg`
                : `${fmt(cierre.informe.tonnage.current, 0)} kg en total`}
              color={colorDelta(res.tonelajeSemanal?.deltaPct)}
            />
            <Tile
              icon="speed"
              label="RIR medio"
              value={res.rir ? `${fmt(res.rir.inicio)} → ${fmt(res.rir.final)}` : '—'}
              sub={res.rir
                ? res.rir.final < res.rir.inicio - 0.2 ? 'más cerca del fallo'
                  : res.rir.final > res.rir.inicio + 0.2 ? 'más lejos del fallo' : 'esfuerzo parecido'
                : 'sin RIR suficiente'}
            />
          </div>

          {/* ── Qué pasó con cada hipótesis (solo se enseña: se firma en Revisión) ── */}
          {hipotesis && (hipotesis.estrellas.length > 0 || (meso.cierreDeHipotesis?.veredictos.length ?? 0) > 0) && (
            <VeredictosDeHipotesis
              key={`veredictos-${meso.id}`}
              meso={meso}
              calculo={hipotesis}
              firmado={meso.cierreDeHipotesis}
              ficha={hipotesis.ficha}
              mapa={mapa}
              enCurso={cierre.enCurso}
              presentando
              nota="Los veredictos se firman, y el bloque siguiente se crea, en Revisión › Cierre de bloque."
            />
          )}

          {/* ── Lo que hay que contarle ── */}
          {cierre.titulares.length > 0 && (
            <Seccion
              titulo="Lo que hay que contarle"
              icon="campaign"
              extra={(
                <button
                  onClick={() => copiar(cierre.titulares.map(t => `· ${t}`).join('\n'), 'Resumen')}
                  className="flex items-center gap-1 font-sans text-caption font-bold text-accent-ink hover:text-ink transition-colors"
                >
                  <Icon name="content_copy" size="s" />Copiar
                </button>
              )}
            >
              <ul className="space-y-1.5">
                {cierre.titulares.map((t, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-accent-ink font-mono text-caption mt-0.5 flex-shrink-0">·</span>
                    <span className="font-sans text-label text-ink leading-relaxed">{t}</span>
                  </li>
                ))}
              </ul>
            </Seccion>
          )}

          {/* ── Semana a semana ── */}
          <SemanaASemana semanas={prog.semanas} />

          {/* ── Lo mejor / lo que se queda parado ── */}
          <Podio ejercicios={prog.ejercicios} />

          {/* ── Detalle ── */}
          <SegmentedControl
            label="Detalle del cierre"
            value={vista}
            onChange={v => setVista(v as Vista)}
            options={[
              { value: 'ejercicios', label: 'Ejercicios' },
              { value: 'patrones',   label: 'Patrones' },
              { value: 'grupos',     label: 'Grupos' },
              { value: 'volumen',    label: 'Volumen' },
              { value: 'estimulo',   label: 'Estímulo' },
            ]}
          />

          {vista === 'ejercicios' && <ListaEjercicios ejercicios={prog.ejercicios} sexo={sexo} pesoKg={pesoEnCierre} />}
          {vista === 'patrones' && (
            <Agregado
              filas={prog.porPatron}
              vacio="Ningún ejercicio del bloque cae en un patrón de movimiento (empujes, tracciones, brazo, pierna, cadera)."
              anterior={hayAnterior ? cierre.patrones : null}
              comparacion={cierre.comparacion}
            />
          )}
          {vista === 'grupos' && (
            <Agregado
              filas={prog.porGrupo}
              vacio="Los ejercicios del bloque no tienen grupo muscular asignado."
              anterior={hayAnterior ? cierre.informe.muscleGroups : null}
              comparacion={cierre.comparacion}
            />
          )}
          {vista === 'volumen'  && <TablaVolumen filas={cierre.volumen.filas} comparacion={cierre.comparacion} />}
          {vista === 'estimulo' && <TablaEstimulo estimulo={estimulo} cargando={cargandoCdg} noSubido={noSubido} />}

          {/* ── Borrador para el cliente ── */}
          <Seccion
            titulo="Mensaje para el cliente"
            icon="chat"
            extra={(
              <div className="flex items-center gap-3">
                {borrador !== mensajeGenerado && (
                  <button
                    onClick={() => setBorrador(mensajeGenerado)}
                    className="font-sans text-caption font-bold text-ink-2 hover:text-ink transition-colors"
                  >
                    Restaurar
                  </button>
                )}
                <button
                  onClick={() => copiar(borrador, 'Mensaje')}
                  className="flex items-center gap-1 font-sans text-caption font-bold text-accent-ink hover:text-ink transition-colors"
                >
                  <Icon name="content_copy" size="s" />Copiar
                </button>
              </div>
            )}
          >
            <textarea
              value={borrador}
              onChange={e => setBorrador(e.target.value)}
              rows={Math.min(16, Math.max(6, borrador.split('\n').length + 1))}
              aria-label="Mensaje para el cliente"
              className="w-full font-sans text-label text-ink leading-relaxed bg-bg border border-hairline rounded-control p-3 resize-y focus:outline-none focus:border-accent"
            />
            <p className="font-mono text-caption text-ink-3">
              Escrito con sus propios datos. Edítalo aquí antes de copiarlo.
            </p>
          </Seccion>
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


function TablaEstimulo({ estimulo, cargando, noSubido }: {
  estimulo: { filas: FilaIEM[]; sinVinculo: string[] } | null;
  cargando: boolean;
  noSubido: boolean;
}) {
  if (cargando) return <p className="font-sans text-caption text-ink-3">Cargando el catálogo CDG…</p>;
  if (!estimulo) {
    return (
      <p className="font-sans text-caption text-ink-3">
        {noSubido
          ? 'El catálogo CDG aún no está en Firestore (se sube con scripts/subirCatalogoCdg.mjs --aplicar): sin él no se puede calcular el estímulo.'
          : 'El estímulo (IEM) solo se calcula en la vista del entrenador, con el catálogo CDG cargado.'}
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {estimulo.filas.length === 0 ? (
        <p className="font-sans text-caption text-ink-3">Ninguna serie del bloque cuenta en el índice (hacen falta ejercicios con vínculo CDG, con kg y con RIR entre 0 y 4).</p>
      ) : (
        <div className="overflow-x-auto rounded-surface border border-hairline">
          <table className="w-full border-collapse" style={{ minWidth: '320px' }}>
            <thead>
              <tr className="bg-bg">
                <th className="text-left px-3 py-2.5 font-mono text-caption text-ink-2 uppercase tracking-wider border-b border-hairline">Músculo</th>
                <th className="text-right px-3 py-2.5 font-mono text-caption text-ink-2 uppercase tracking-wider border-b border-hairline">IEM</th>
              </tr>
            </thead>
            <tbody>
              {estimulo.filas.map(f => (
                <tr key={`${f.compuesto ? 'c' : 'm'}-${f.nombre}`} className="border-b border-hairline last:border-b-0">
                  <td className={`px-3 py-2.5 font-sans text-label whitespace-nowrap ${f.compuesto ? 'font-bold text-ink' : 'text-ink-2'}`}>{f.nombre}{f.compuesto ? ' (grupo)' : ''}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-label font-bold text-ink tabular-nums">{Math.round(f.valor * 100) / 100}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {estimulo.sinVinculo.length > 0 && (
        <p className="font-sans text-caption text-warning">Sin vínculo CDG (no cuentan): {estimulo.sinVinculo.join(', ')}.</p>
      )}
      <p className="font-mono text-caption text-ink-3">
        IEM = estímulo muscular de la plantilla CDG, sumado sobre las series del bloque (cada músculo según el ejercicio, el RIR y las
        repeticiones). Los «grupos» suman sus porciones. Las series sin kg y las de RIR 5 no cuentan.
      </p>
    </div>
  );
}
