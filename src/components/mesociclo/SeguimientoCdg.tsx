import React, { useMemo, useState } from 'react';
import type { BodyMetricKey, Exercise, Mesocycle, WorkoutExercise, WorkoutLog } from '../../types';
import { useMotorCdg } from '../../hooks/useMotorCdg';
import { useBodyMeasurements } from '../../hooks/useBodyMeasurements';
import { computeAnthropometricIndices, ANTHROPOMETRIC_INDEX_LABELS, type AnthropometricIndexKey } from '../../utils/anthropometricIndices';
import {
  semanasRealizadasDelMeso, cargaAgudaCronicaDelMeso, rendimientoDelCiclo, incrementoAntropometria, semanasAnterioresAlBloque,
  UMBRALES_CARGA_POR_DEFECTO, sinMusculos, SEMANAS_CARGA_CRONICA, type UmbralesCarga,
  ZONAS_IEM, iemPorZona, variacion, propuestaZona, SENSIBILIDADES, VELOCIDADES, tipoDeBloque, contextoDeLaSemana,
  UMBRALES_PROTOCOLO, agujetasVigentes, sensibilidadDeZona, semanaPorDefecto, type ZonaIem,
  type TipoDeBloque, type Sensibilidad, type Velocidad, type TonoPropuesta,
  leerRendimiento, indicadoresCambioDeBloque, avisosIemIea, type SemanaParaLectura, type Contexto,
  tipoSugerido, semanasHastaAburrirse, avisoDeFiabilidad, referenciasToleradas,
  contextoPorCiclos, rachaFinal, valorEnElCicloDe, esDescargaOPuente,
  cansancioDeSesiones, origenDeLectura, type LecturaAgujetas,
  bandaIEA, BANDAS_IEA, LIMITE_IEA_CON_ANTECEDENTES, articulacionesSobreSuLimite, limitesValidos, type BandaIEA
} from '../../utils/cdg';
import { useAgujetasCdg } from '../../hooks/useAgujetasCdg';
import { addDays, hoyIsoLocal } from '../../utils/trainingWeek';
import { mesocycleWeekNumber } from '../../utils/progression';
import { contextoPesoCorporal } from '../../utils/pesoCorporal';
import { useAthleteWeight } from '../../hooks/useAthleteWeight';
import { useQuery } from '@tanstack/react-query';
import { getDossier } from '../../db/dossier';
import { dossierKey } from '../DossierPanel';
import { Button, Collapsible, Select } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Seguimiento CDG (solo coach)

   Lo que la plantilla «Índice de hipertrofia» calcula DESPUÉS de entrenar:
   semana realizada, Gestión, carga aguda/crónica, rendimiento (RM y tonelaje)
   y antropometría. Todo se calcula al vuelo desde los logs del atleta, nada se
   guarda: no hay copias que se queden desactualizadas.

   La semana realizada agrupa las sesiones por `Workout.dayIndex`. El RM es el
   de CDG (reps + RIR hasta el fallo; Epley con 10-15 reps, media de tres
   fórmulas con el resto). Las series a peso corporal (dominadas, fondos…)
   cuentan con el peso del atleta cuando se conoce (CR5, Dani 27-10); sin peso
   registrado, se saltan como en la hoja. La semana del calendario en curso no
   entra en la carga crónica, ni las de descarga o puente (17-11-2026).
   Lo realizado cuenta las bajadas y miniseries APUNTADAS con la técnica que
   tenía pautada el ejercicio, igual que lo programado (F15); y las semanas del
   bloque sin ninguna sesión entran en la crónica como cero.

   Estrés articular (X1, 17-11-2026): cada articulación con su banda del curso
   y, si el coach le pone un límite semanal a este atleta, un aviso informativo
   cuando lo pasa. El límite se guarda con sus umbrales de carga.

   Las señales de contexto (estrés, sueño, motivación, cansancio al salir)
   caducan a los 10 días y su historial se alinea por semana de revisión, no
   por posición (F16). La lectura del rendimiento no compara con la semana en
   curso a medias ni con una descarga (R1).

   17-11-2026 (D6r, D7): el cansancio al salir sale de las sesiones de la semana
   que se evalúa (media, y cuál fue la más dura) cuando el atleta lo apunta al
   terminar; si no, del cuestionario semanal como antes. Las agujetas mezclan
   las contestadas a las 48 h de cada sesión con las del cuestionario: manda la
   más reciente, y al lado se dice de dónde sale («a 48 h» o «semanal»).
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  athleteEmail: string;
  logs: WorkoutLog[];
  meso: Mesocycle;
  cicloDias: number;
  vueltas: number;
  /** Rutinas del bloque agrupadas por día (con `dayIndex` y los ids de cada semana). */
  grupos: Array<{ name?: string; dayIndex?: number; workoutIds: string[]; exercises: WorkoutExercise[] }>;
  allExercises: Exercise[];
  umbrales?: UmbralesCarga;
  onGuardarUmbrales: (u: UmbralesCarga) => void;
  /** Guarda el tipo de bloque (`Mesocycle.cdgSensibilidad` y `cdgVelocidad`). */
  onCambiarTipo?: (t: TipoDeBloque) => void;
  /** Guarda el modo de una zona (`Mesocycle.cdgModoPorZona`). */
  onCambiarModo?: (zona: ZonaIem, modo: Sensibilidad) => void;
}

const TONO: Record<TonoPropuesta, string> = {
  freno: 'text-danger', vigilar: 'text-warning', mantener: 'text-ink-2', acelerar: 'text-success', objetivo: 'text-ink', 'sin-dato': 'text-ink-3'
};
const ETIQUETA_TONO: Record<TonoPropuesta, string> = {
  freno: 'Frenar', vigilar: 'Vigilar', mantener: 'Mantener', acelerar: 'Acelerar', objetivo: 'En objetivo', 'sin-dato': 'Sin dato'
};

const n1 = (v: number) => (Math.round(v * 10) / 10).toLocaleString('es-ES');
const n2 = (v: number) => (Math.round(v * 100) / 100).toLocaleString('es-ES');
const pct = (v: number | null) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${(Math.round(v * 1000) / 10).toLocaleString('es-ES')} %`);
/** De dónde sale una lectura de agujetas, dicho en corto al lado de la nota. */
const origenCorto = (l: LecturaAgujetas) => (origenDeLectura(l) === '48h' ? 'a 48 h' : 'semanal');
// Bandas de estrés articular del curso (X1): colorean, no avisan.
const TONO_BANDA_IEA: Record<BandaIEA, string> = { bajo: 'text-ink-3', medio: 'text-ink-2', alto: 'text-ink font-bold' };
const aNumero = (t: string) => Number(t.replace(',', '.').trim());

function Seccion ({ titulo, children, abierta = false }: { titulo: string; children: React.ReactNode; abierta?: boolean }) {
  return (
    <div className="bg-surface border border-hairline rounded-surface px-4">
      <Collapsible defaultOpen={abierta} trigger={<span className="font-sans font-bold text-body-s text-ink">{titulo}</span>}>
        <div className="pb-4 space-y-3">{children}</div>
      </Collapsible>
    </div>
  );
}

const Th = ({ children, derecha }: { children?: React.ReactNode; derecha?: boolean }) => (
  <th className={`py-1 px-2 first:pl-0 last:pr-0 font-normal uppercase tracking-wide text-ink-3 whitespace-nowrap ${derecha ? 'text-right' : 'text-left'}`}>{children}</th>
);

export default function SeguimientoCdg ({ athleteEmail, logs, meso, cicloDias, vueltas, grupos, allExercises, umbrales, onGuardarUmbrales, onCambiarTipo, onCambiarModo }: Props) {
  const { agujetas, sueño, estres, motivacion, fatigaPostSemanal, historial, caducadas: caducadasDelHook } = useAgujetasCdg(athleteEmail);
  const tipo = tipoDeBloque(meso);
  // Tipificación del cliente (ficha viva): misma caché que la ficha.
  const { data: ficha } = useQuery({ queryKey: dossierKey(athleteEmail), queryFn: () => getDossier(athleteEmail), enabled: !!athleteEmail, staleTime: 60_000 });
  const tip = ficha?.tipificacion;
  const sugerido = tipoSugerido(tip);
  const fiabilidad = avisoDeFiabilidad(tip);
  const { contexto, motivos } = contextoDeLaSemana({ estres: estres?.value, sueñoHoras: sueño?.value, motivacion: motivacion?.value });
  const { motor, cargando, noSubido, error } = useMotorCdg();
  const { all: medidas } = useBodyMeasurements(athleteEmail);
  const { current: pesoKg } = useAthleteWeight(athleteEmail);
  const pesoCorporal = useMemo(() => contextoPesoCorporal(allExercises, pesoKg), [allExercises, pesoKg]);
  const semanaEnCurso = mesocycleWeekNumber(meso.startDate, hoyIsoLocal(), cicloDias);
  const porId = useMemo(() => new Map(allExercises.map(e => [e.id, e])), [allExercises]);
  const nombreCdgDe = useMemo(() => (id: string) => porId.get(id)?.cdgNombre, [porId]);
  const sesionPorWorkout = useMemo(() => {
    const m = new Map<string, number>();
    grupos.forEach((g, i) => g.workoutIds.forEach(id => m.set(id, g.dayIndex ?? i)));
    return m;
  }, [grupos]);
  // P4: la hoja dice «Sesión N»; aquí se enseña el nombre del día (Torso A…) y
  // se ocultan los huecos 5-7 que un ciclo de 4 sesiones no usa.
  const nombrePorHueco = useMemo(() => {
    const m = new Map<number, string>();
    grupos.forEach((g, i) => { const d = g.dayIndex ?? i; if (d >= 0 && d <= 6 && g.name) m.set(d, g.name); });
    return m;
  }, [grupos]);
  const huecosUsados = useMemo(() => new Set(grupos.map((g, i) => g.dayIndex ?? i)), [grupos]);
  const nombreSesion = (etiqueta: string) => {
    const m = /^Sesión (\d+)$/.exec(etiqueta);
    return m ? (nombrePorHueco.get(Number(m[1]) - 1) ?? etiqueta) : etiqueta;
  };
  const huecoVacio = (etiqueta: string) => {
    const m = /^Sesión (\d+)$/.exec(etiqueta);
    return !!m && !huecosUsados.has(Number(m[1]) - 1);
  };

  const datos = useMemo(() => {
    if (!motor) return null;
    const { semanas, descartados } = semanasRealizadasDelMeso({
      logs, meso, cicloDias, vueltas, motor, nombreCdgDe, sesionDeWorkout: id => sesionPorWorkout.get(id), pesoCorporal,
      // F15: con lo programado delante, las bajadas apuntadas cuentan con la técnica pautada.
      grupos,
    });
    // Semanas de bloques anteriores (E-10): completan la crónica cuando este
    // bloque aún no tiene 6, y dan la comparación «bloque anterior vs este».
    const anteriores = semanasAnterioresAlBloque({ logs: logs.filter(l => l.mesocycleId !== meso.id), inicio: meso.startDate, motor, nombreCdgDe, pesoCorporal });
    const carga = cargaAgudaCronicaDelMeso({ motor, semanas, grupos, meso, vueltas, nombreCdgDe, umbrales, semanasAnteriores: anteriores, semanaEnCurso });
    const media = (cs: Array<{ IF: number[]; IEM: number[][] }>) => cs.length === 0 ? null : {
      IF: cs.reduce((a, c) => a + c.IF.reduce((x, y) => x + y, 0), 0) / cs.length,
      IEM: cs.reduce((a, c) => a + c.IEM.reduce((x, d) => x + d.reduce((p, q) => p + q, 0), 0), 0) / cs.length,
      n: cs.length,
    };
    const comparacionBloques = { antes: media(anteriores), ahora: media(semanas.map(s => s.calculo)) };
    return { semanas, descartados, carga, comparacionBloques, ciclo: rendimientoDelCiclo(motor, semanas) };
  }, [motor, logs, meso, cicloDias, vueltas, nombreCdgDe, sesionPorWorkout, grupos, umbrales, pesoCorporal, semanaEnCurso]);

  const [semanaSel, setSemanaSel] = useState<string>('');
  // Por defecto, la última semana COMPLETA: la que está en curso tiene pocas
  // sesiones y sus «vs anterior» no dicen nada todavía.
  const sesionesPorCiclo = Math.max(1, grupos.length);
  const semanaActiva = datos?.semanas.find(s => String(s.semana) === semanaSel) ?? (datos ? semanaPorDefecto(datos.semanas, sesionesPorCiclo) : undefined);
  const semanaIncompleta = !!semanaActiva && semanaActiva.logs < sesionesPorCiclo;

  // D6r: el cansancio al salir de las sesiones de la semana que se evalúa (las
  // del bloque que caen en esa vuelta), con el nombre de la más dura. Si no lo
  // apuntó en ninguna, vale el cuestionario semanal, como hasta ahora.
  const nombreDeRutina = (workoutId: string) => grupos.find(g => g.workoutIds.includes(workoutId))?.name;
  const cansancioSesiones = semanaActiva
    ? cansancioDeSesiones(
      logs.filter(l => l.mesocycleId === meso.id && l.date >= meso.startDate && mesocycleWeekNumber(meso.startDate, l.date, cicloDias) === semanaActiva.semana),
      { nombreDe: nombreDeRutina },
    )
    : undefined;
  const fatigaPost = cansancioSesiones?.media ?? fatigaPostSemanal?.value;
  const sesionMasCansada = cansancioSesiones ? { etiqueta: cansancioSesiones.peor.etiqueta, valor: cansancioSesiones.peor.valor } : undefined;
  // El cansancio solo «falta por caducado» si tampoco hay dato por sesión en esta semana.
  const cansancioCaducado = fatigaPost == null && !!historial?.fatigaPost.some(p => p.date <= hoyIsoLocal());
  const caducadas = [...caducadasDelHook.filter(c => c !== 'cansancio al salir'), ...(cansancioCaducado ? ['cansancio al salir'] : [])];

  const [inf, setInf] = useState(String((umbrales ?? UMBRALES_CARGA_POR_DEFECTO).inferior));
  const [sup, setSup] = useState(String((umbrales ?? UMBRALES_CARGA_POR_DEFECTO).superior));
  const umbralesValidos = aNumero(inf) > 0 && aNumero(sup) > aNumero(inf);
  // X1: límite semanal de estrés articular por articulación, de ESTE atleta.
  // Se escribe como texto y se guarda junto a sus umbrales (mismo camino).
  const limitesGuardados = useMemo(() => limitesValidos(umbrales?.limitesArticulares), [umbrales]);
  const [limitesTxt, setLimitesTxt] = useState<Record<string, string>>(
    () => Object.fromEntries(Object.entries(limitesGuardados).map(([k, v]) => [k, String(v).replace('.', ',')])),
  );
  const escritos = Object.entries(limitesTxt) as Array<[string, string]>;
  const limitesEscritos = limitesValidos(Object.fromEntries(escritos.map(([k, t]) => [k, t.trim() === '' ? undefined : aNumero(t)])));
  const limitesMalEscritos = escritos.some(([, t]) => t.trim() !== '' && !(aNumero(t) > 0));
  const limitesCambiados = JSON.stringify(Object.entries(limitesEscritos).sort()) !== JSON.stringify(Object.entries(limitesGuardados).sort());
  /** Lo que se guarda: los umbrales de carga y, si hay alguno, los límites articulares. */
  const guardar = (u: { inferior: number; superior: number }, limites: Record<string, number>) =>
    onGuardarUmbrales({ inferior: u.inferior, superior: u.superior, ...(Object.keys(limites).length > 0 ? { limitesArticulares: limites } : {}) });

  const antropometria = useMemo(() => {
    const primero: Partial<Record<BodyMetricKey, (typeof medidas)[number]>> = {};
    const ultimo: Partial<Record<BodyMetricKey, (typeof medidas)[number]>> = {};
    for (const m of medidas) { primero[m.metricKey] ??= m; ultimo[m.metricKey] = m; }
    const ini = computeAnthropometricIndices(primero);
    const fin = computeAnthropometricIndices(ultimo);
    return incrementoAntropometria(ini, fin).map(f => ({
      clave: f.medida as AnthropometricIndexKey, inicio: ini[f.medida as AnthropometricIndexKey], ultimo: fin[f.medida as AnthropometricIndexKey], incremento: f.incremento
    }));
  }, [medidas]);

  if (cargando) return <p className="font-sans text-caption text-ink-3">Cargando el catálogo CDG…</p>;
  if (error) return <p className="font-sans text-caption text-danger">No se pudo leer el catálogo CDG: {error.message}</p>;
  if (noSubido || !motor || !datos) {
    return (
      <p className="font-sans text-caption text-ink-3">
        El catálogo CDG aún no está en Firestore (se sube con <code>scripts/subirCatalogoCdg.mjs --aplicar</code>); sin él no hay seguimiento.
      </p>
    );
  }

  const { semanas, descartados, carga, comparacionBloques, ciclo } = datos;
  const sinVinculo = new Set<string>();
  for (const l of logs) if (l.mesocycleId === meso.id) for (const e of l.entries) if (!nombreCdgDe(e.exerciseId)) sinVinculo.add(e.exerciseId);

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="font-sans text-caption text-ink-2">
          {semanas.length === 0
            ? 'Todavía no hay sesiones registradas en este bloque.'
            : `${semanas.length} ${semanas.length === 1 ? 'semana realizada' : 'semanas realizadas'} en este bloque (${semanas.reduce((n, s) => n + s.logs, 0)} sesiones).`}
        </p>
        {(descartados.sinSesion > 0 || descartados.fueraDeSemana > 0) && (
          <p className="font-sans text-caption text-warning">
            No se han podido colocar {descartados.sinSesion} sesiones (rutina sin día del ciclo, o día 8-10 de un ciclo largo) y {descartados.fueraDeSemana} fuera de las fechas del bloque.
          </p>
        )}
        <p className="font-sans text-caption text-ink-3">
          {pesoKg ? `Las series a peso corporal cuentan con el peso del atleta (${n1(pesoKg)} kg).` : 'Sin peso registrado: las series a peso corporal (0 kg) no cuentan, como en la hoja.'}
        </p>
        {sinVinculo.size > 0 && (
          <p className="font-sans text-caption text-warning">
            Sin vínculo CDG (no cuentan): {[...sinVinculo].map(id => porId.get(id)?.name ?? id).join(', ')}.
          </p>
        )}
      </div>

      {semanas.length > 0 && (
        <Select
          label="Semana"
          value={String(semanaActiva?.semana ?? '')}
          onChange={setSemanaSel}
          options={semanas.map(s => ({ value: String(s.semana), label: `Semana ${s.semana}${s.logs < sesionesPorCiclo ? ` · ${s.logs} de ${sesionesPorCiclo} sesiones` : ''}` }))}
        />
      )}
      {semanaIncompleta && semanaActiva && (
        <p className="font-sans text-caption text-warning">
          Semana incompleta: {semanaActiva.logs} de {sesionesPorCiclo} sesiones registradas. El IEM y las variaciones frente a la anterior no son comparables hasta que termine.
        </p>
      )}

      <Seccion titulo="Freno / acelerador por zona" abierta>
        {(() => {
          const sumaDias = (m: number[][]) => m.reduce((acc, d) => acc.map((v, i) => v + (d[i] ?? 0)), new Array<number>(motor.musculos.length).fill(0));
          const idx = semanaActiva ? semanas.indexOf(semanaActiva) : -1;
          const ahora = semanaActiva ? iemPorZona(motor, sumaDias(semanaActiva.calculo.IEM)) : null;
          const antes = idx > 0 ? iemPorZona(motor, sumaDias(semanas[idx - 1].calculo.IEM)) : null;
          const hoy = hoyIsoLocal();
          const filas = ZONAS_IEM.map(z => {
            const lectura = agujetas?.[z.clave];
            // Solo cuentan las agujetas de la última semana: una lectura vieja
            // no dice nada de cómo ha encajado la semana que se evalúa.
            const vigente = !!lectura && agujetasVigentes(lectura.fecha, hoy);
            const objetivo = meso.cdgObjetivosIem?.[z.clave];
            // Modo por zona (Dani, 25-10): con objetivo, dinámico; el resto, estático.
            const modo = sensibilidadDeZona(meso, z.clave);
            return {
              z, lectura, vigente, objetivo, modo,
              iem: ahora?.[z.clave] ?? 0,
              vs: ahora && antes ? variacion(antes[z.clave], ahora[z.clave]) : null,
              propuesta: propuestaZona({
                agujetas: vigente ? lectura?.valor : undefined, anterior: vigente ? lectura?.anterior : undefined, sensible: z.sensible,
                tipo: { ...tipo, sensibilidad: modo }, esObjetivo: objetivo != null,
                iem: ahora?.[z.clave] ?? 0, contexto, fatigaPost, sesionMasCansada, objetivo,
                primeraSemanaTrasParon: !!meso.vuelveDeParon && semanaActiva?.semana === 1,
              })
            };
          }).filter(f => f.iem > 0.005 || f.lectura || f.objetivo != null);
          return (
            <>
              {/* Tipo de bloque (guía del IH): cuándo se sube y cuánto, por separado. */}
              <div className="flex flex-wrap items-end gap-3">
                <div className="w-44">
                  <Select
                    label="Velocidad"
                    value={tipo.velocidad}
                    onChange={v => onCambiarTipo?.({ ...tipo, velocidad: v as Velocidad })}
                    options={VELOCIDADES.map(a => ({ value: a.value, label: a.label }))}
                  />
                </div>
                <p className="font-sans text-caption text-ink-3 pb-2">
                  Modo por zona (columna «Modo»): las zonas con objetivo van en dinámico y el resto en estático, que se mantienen. Tócalo para cambiarlo.
                </p>
              </div>
              {sugerido && meso.cdgVelocidad == null && sugerido.velocidad !== tipo.velocidad && (
                <p className="font-sans text-caption text-ink-2">
                  Por su tipificación (freno {tip?.freno}/5) encaja una velocidad {VELOCIDADES.find(a => a.value === sugerido.velocidad)?.label.toLowerCase()}.{' '}
                  <button type="button" className="underline font-bold" onClick={() => onCambiarTipo?.({ ...tipo, velocidad: sugerido.velocidad })}>Usarla</button>
                </p>
              )}
              {fiabilidad && <p className="font-sans text-caption text-warning">{fiabilidad}</p>}
              {/* El protocolo se lee en orden: contexto → cómo sale de las sesiones → agujetas por zona → rendimiento. */}
              <ol className="font-sans text-caption text-ink-2 space-y-0.5 list-decimal pl-4">
                <li>
                  Contexto: <b className={contexto === 'desfavorable' ? 'text-warning' : contexto === 'favorable' ? 'text-success' : 'text-ink'}>{
                    contexto === 'sin-dato' ? 'sin datos' : contexto}</b>
                  {motivos.length ? ` (${motivos.join(', ')})` : ''}
                  {' · '}{estres ? `estrés ${estres.value}/10` : 'sin estrés'} · {sueño ? `${n1(sueño.value)} h de sueño` : 'sin sueño'} · {motivacion ? `motivación ${motivacion.value}/10` : 'sin motivación'}.
                  {contexto === 'desfavorable' && ' Un mal momento puntual no obliga a bajar; si se repite varias semanas, sí.'}
                  {caducadas && caducadas.length > 0 && ` Sin dato reciente de ${caducadas.join(', ')}: su última respuesta tiene más de ${UMBRALES_PROTOCOLO.diasVigenciaContexto} días y ya no cuenta.`}
                </li>
                <li>
                  Al salir de las sesiones: {fatigaPost != null ? <b className={fatigaPost >= UMBRALES_PROTOCOLO.fatigaPostAlta ? 'text-warning' : 'text-ink'}>{n1(fatigaPost)}/10</b> : 'sin dato'}
                  {cansancioSesiones
                    ? <span className="text-ink-3"> de media en {cansancioSesiones.sesiones} {cansancioSesiones.sesiones === 1 ? 'sesión' : 'sesiones'} de la S{semanaActiva?.semana}</span>
                    : fatigaPost != null && <span className="text-ink-3"> · cuestionario semanal</span>}
                  {fatigaPost != null && fatigaPost >= UMBRALES_PROTOCOLO.fatigaPostAlta
                    ? (cansancioSesiones
                      ? <> — la más dura, <b className="text-warning">{cansancioSesiones.peor.etiqueta}: {n1(cansancioSesiones.peor.valor)}/10</b>. No subir IEM sin bajar antes la fatiga (IF) de esa sesión.</>
                      : ' — no subir IEM; mejor bajar el IF manteniéndolo.')
                    : (<>
                      {` (0-${UMBRALES_PROTOCOLO.fatigaPostAlta - 1}: hay margen).`}
                      {/* La media deja margen, pero una sesión concreta pasó del umbral: se dice cuál, sin vetar. */}
                      {cansancioSesiones && cansancioSesiones.peor.valor >= UMBRALES_PROTOCOLO.fatigaPostAlta && (
                        <> Ojo con <b className="text-warning">{cansancioSesiones.peor.etiqueta}: {n1(cansancioSesiones.peor.valor)}/10</b>; si se repite, bájale fatiga a esa.</>
                      )}
                    </>)}
                </li>
                <li>Agujetas de cada zona (a 48 h de la sesión o del cuestionario semanal: la más reciente) contra su IEM (tabla).</li>
                <li>Rendimiento: RM y tonelaje (abajo).</li>
              </ol>
              {(!estres && !motivacion && fatigaPost == null) && (
                <p className="font-sans text-caption text-ink-3">
                  El contexto sale de la revisión semanal (estrés, sueño y motivación). El cansancio, de lo que apunta al terminar cada sesión o, si no, de la pregunta semanal.
                </p>
              )}
              {filas.length === 0 ? <p className="font-sans text-caption text-ink-3">Sin estímulo registrado ni agujetas todavía.</p> : (<>
                {/* P3: en móvil, tarjetas; la tabla de 7 columnas hacía filas de 180 px. */}
                <ul className="sm:hidden space-y-2">
                  {filas.map(f => (
                    <li key={f.z.clave} className="rounded-control border border-hairline px-3 py-2 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`font-sans text-body-s ${f.objetivo != null ? 'font-bold text-ink' : 'text-ink-2'}`}>{f.z.nombre}</span>
                        <button type="button" disabled={!onCambiarModo}
                          onClick={() => onCambiarModo?.(f.z.clave, f.modo === 'dinamico' ? 'estatico' : 'dinamico')}
                          className={`rounded-chip border px-2 py-0.5 font-sans text-caption ${f.modo === 'dinamico' ? 'border-accent-line text-accent-ink' : 'border-hairline text-ink-2'}`}>
                          {SENSIBILIDADES.find(a => a.value === f.modo)?.label}
                        </button>
                      </div>
                      <p className="font-mono text-caption text-ink-2 tabular-nums">
                        Agujetas {f.lectura ? (f.vigente ? <><b className={f.lectura.valor >= 5 ? 'text-danger' : f.lectura.valor >= 4 ? 'text-warning' : 'text-ink'}>{f.lectura.valor}/5</b><span className="font-sans text-ink-3"> {origenCorto(f.lectura)}</span></> : `${f.lectura.valor}/5 · antigua`) : '—'}
                        {' · '}IEM {f.iem > 0.005 ? n1(f.iem) : '·'}{f.vs != null ? ` (${pct(f.vs)})` : ''}{f.objetivo != null ? ` · objetivo ${n1(f.objetivo)}` : ''}
                      </p>
                      <p className={`font-sans text-caption ${TONO[f.propuesta.tono]}`}>
                        <b>{ETIQUETA_TONO[f.propuesta.tono]}</b>{f.propuesta.iemPropuesto != null && <span className="font-mono"> → {n1(f.propuesta.iemPropuesto)}</span>} · {f.propuesta.texto}
                      </p>
                    </li>
                  ))}
                </ul>
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full font-sans text-caption">
                    <thead><tr><Th>Zona</Th><Th>Modo</Th><Th derecha>Agujetas</Th><Th derecha>IEM S{semanaActiva?.semana ?? '—'}</Th><Th derecha>vs anterior</Th><Th derecha>Objetivo</Th><Th>Propuesta</Th></tr></thead>
                    <tbody>
                      {filas.map(f => (
                        <tr key={f.z.clave} className="border-t border-hairline align-top">
                          <td className={`py-1 pr-2 whitespace-nowrap ${f.objetivo != null ? 'font-bold text-ink' : 'text-ink-2'}`}>{f.z.nombre}</td>
                          <td className="py-1 pr-2">
                            <button type="button" disabled={!onCambiarModo}
                              onClick={() => onCambiarModo?.(f.z.clave, f.modo === 'dinamico' ? 'estatico' : 'dinamico')}
                              title={SENSIBILIDADES.find(a => a.value === f.modo)?.ayuda}
                              className={`rounded-chip border px-2 py-0.5 font-sans text-caption ${f.modo === 'dinamico' ? 'border-accent-line text-accent-ink' : 'border-hairline text-ink-2'}`}>
                              {SENSIBILIDADES.find(a => a.value === f.modo)?.label}
                            </button>
                          </td>
                          <td className="py-1 px-2 text-right font-mono tabular-nums whitespace-nowrap" title={f.lectura ? `${f.lectura.fecha} · ${origenDeLectura(f.lectura) === '48h' ? 'contestada a las 48 h de la sesión' : 'cuestionario semanal'}${f.lectura.deEscala10 ? ' · 0-10 convertido' : ''}` : undefined}>
                            {f.lectura && !f.vigente ? <span className="text-ink-3" title={`Última lectura: ${f.lectura.fecha}`}>{f.lectura.valor} · antigua</span> : f.lectura ? <>{f.lectura.anterior != null && <span className="text-ink-3">{f.lectura.anterior} → </span>}<b className={f.lectura.valor >= 5 ? 'text-danger' : f.lectura.valor >= 4 ? 'text-warning' : 'text-ink'}>{f.lectura.valor}</b><span className="block font-sans text-ink-3">{origenCorto(f.lectura)}</span></> : <span className="text-ink-3">—</span>}
                          </td>
                          <td className="py-1 px-2 text-right font-mono tabular-nums text-ink">{f.iem > 0.005 ? n1(f.iem) : '·'}</td>
                          <td className="py-1 px-2 text-right font-mono tabular-nums text-ink-2">{pct(f.vs)}</td>
                          <td className="py-1 px-2 text-right font-mono tabular-nums text-ink-2">{f.objetivo != null ? n1(f.objetivo) : '—'}</td>
                          <td className={`py-1 pl-2 ${TONO[f.propuesta.tono]}`}>
                            <b>{ETIQUETA_TONO[f.propuesta.tono]}</b>
                            {f.propuesta.iemPropuesto != null && <span className="font-mono"> → {n1(f.propuesta.iemPropuesto)}</span>}
                            {' · '}{f.propuesta.texto}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>)}
              {!UMBRALES_PROTOCOLO.validados && (
                <p className="font-sans text-caption text-warning">
                  Umbrales pendientes de validar: contexto malo con estrés ≥ {UMBRALES_PROTOCOLO.estresMalo}, sueño &lt; {UMBRALES_PROTOCOLO.sueñoMaloHoras} h o motivación ≤ {UMBRALES_PROTOCOLO.motivacionMala}; no subir con cansancio ≥ {UMBRALES_PROTOCOLO.fatigaPostAlta}; con IEM ≥ {UMBRALES_PROTOCOLO.iemBaseAlta}, subir como mucho un {UMBRALES_PROTOCOLO.subidaMaxBaseAlta} %. Agujetas de los últimos {UMBRALES_PROTOCOLO.diasVigenciaAgujetas} días.
                </p>
              )}
              <p className="font-sans text-caption text-ink-3">
                Agujetas en la escala 1-5 del curso: «a 48 h» es lo que contestó a los dos días de la sesión; «semanal», el recuerdo del cuestionario (el DOM's 0-10 antiguo va convertido). De cada zona se usa la más reciente y solo cuentan las de los últimos {UMBRALES_PROTOCOLO.diasVigenciaAgujetas} días. No se leen a ciegas: los ejercicios en estiramiento y los tempos excéntricos largos dan más agujetas con el mismo IEM.
              </p>
            </>
          );
        })()}
      </Seccion>

      <Seccion titulo="Gestión · IF por sesión" abierta>
        {!semanaActiva ? <p className="font-sans text-caption text-ink-3">Sin datos.</p> : (
          <table className="w-full font-sans text-caption">
            <thead><tr><Th>Sesión</Th><Th derecha>IF</Th><Th derecha>Músculos &gt; 0</Th><Th derecha>Zonas &gt; 0</Th></tr></thead>
            <tbody>
              {semanaActiva.gestion.filter(f => !huecoVacio(f.sesion)).map(f => (
                <tr key={f.sesion} className={`border-t ${f.sesion === 'Total' ? 'border-strong font-bold' : 'border-hairline'}`}>
                  <td className="py-1.5 text-ink">{nombreSesion(f.sesion)}</td>
                  <td className="py-1.5 text-right font-mono text-ink">{n1(f.IF)}</td>
                  <td className="py-1.5 text-right font-mono text-ink-2">{f.IEM.filter(v => v > 0.005).length}</td>
                  <td className="py-1.5 text-right font-mono text-ink-2">{f.estresArticular.filter(v => v > 0.005).length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Seccion>

      <Seccion titulo="Carga aguda / crónica">
        {carga.disponible === false ? (
          <p className="font-sans text-caption text-ink-2">{carga.motivo}</p>
        ) : (
          <>
            <p className="font-sans text-caption text-ink-2">
              Lo programado para la semana {carga.semanaReferencia} frente a la media de las {carga.semanasUsadas.length + carga.semanasDeOtrosBloques} últimas realizadas
              {carga.semanasUsadas.length > 0 ? ` (de este bloque: ${carga.semanasUsadas.slice().sort((a, b) => a - b).map(s => `S${s}`).join(', ')}` : ' ('}
              {carga.semanasDeOtrosBloques > 0 ? `${carga.semanasUsadas.length > 0 ? '; ' : ''}${carga.semanasDeOtrosBloques} de bloques anteriores` : ''}).
              {carga.semanasDeOtrosBloques > 0 && ' Al mezclar bloques solo se compara el total de la semana: sus sesiones no se corresponden.'}
              {carga.semanasRecortadas.length > 0 && ` No cuentan en la media ${carga.semanasRecortadas.map(n => `S${n}`).join(', ')}: ${carga.semanasRecortadas.length === 1 ? 'es' : 'son'} de descarga o puente.`}
              {carga.semanasVacias.length > 0 && ` ${carga.semanasVacias.map(n => `S${n}`).join(', ')} sin ninguna sesión: ${carga.semanasVacias.length === 1 ? 'cuenta' : 'cuentan'} como cero en la media.`}
            </p>
            <p className="font-sans text-caption text-ink-3">
              Lo realizado cuenta las bajadas y miniseries que el atleta apuntó, con la técnica que tenía pautada el ejercicio (la misma equivalencia que lo programado); en bloques anteriores se deduce del peso de la bajada. Una técnica pautada que no se apuntó no cuenta.
            </p>
            {carga.referenciaRecortada && (
              <p className="font-sans text-caption text-ink-3">
                La semana {carga.semanaReferencia} es {carga.referenciaRecortada === 'descarga' ? 'de descarga' : 'una semana puente'}: quedar por debajo de la media es lo que se busca, así que solo se avisa si se pasa por encima.
              </p>
            )}
            {!carga.fiable && (
              <p className="font-sans text-caption text-warning">Poca historia ({carga.semanasUsadas.length + carga.semanasDeOtrosBloques} de {SEMANAS_CARGA_CRONICA} semanas): tómalo como orientativo.</p>
            )}
            <table className="w-full font-sans text-caption">
              <thead><tr><Th>Sesión</Th><Th derecha>IF aguda / crónica</Th></tr></thead>
              <tbody>
                {carga.avisos.sesionesIF.filter(s => !huecoVacio(s.sesion)).map(s => (
                  <tr key={s.sesion} className="border-t border-hairline">
                    <td className="py-1.5 text-ink">{nombreSesion(s.sesion)}</td>
                    <td className={`py-1.5 text-right font-mono ${s.fuera ? 'text-warning font-bold' : 'text-ink'}`}>{'nueva' in s && s.nueva ? <span className="font-sans text-ink-2">nueva (sin historia)</span> : n2(s.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(carga.avisos.musculos.length > 0 || carga.avisos.articulaciones.length > 0) && (
              <ul className="space-y-0.5 font-sans text-caption text-warning">
                {carga.avisos.musculos.map((a, i) => <li key={`m${i}`}>{nombreSesion(a.sesion)} · {a.nombre}: {n2(a.valor)}× la media (fuera de {n2((umbrales ?? UMBRALES_CARGA_POR_DEFECTO).inferior)}–{n2((umbrales ?? UMBRALES_CARGA_POR_DEFECTO).superior)})</li>)}
                {carga.avisos.articulaciones.map((a, i) => <li key={`a${i}`}>{nombreSesion(a.sesion)} · {a.nombre}: {n2(a.valor)}× la media (fuera de {n2((umbrales ?? UMBRALES_CARGA_POR_DEFECTO).inferior)}–{n2((umbrales ?? UMBRALES_CARGA_POR_DEFECTO).superior)})</li>)}
              </ul>
            )}
            {/* Zona nueva (F15): sin historia no hay ratio; se avisa aparte, como información. */}
            {carga.avisos.nuevos.length > 0 && (
              <p className="font-sans text-caption text-ink-2">
                <b className="text-ink">Zona nueva esta semana</b> (sin carga en las semanas de la media, así que no hay con qué compararla):{' '}
                {[
                  ...carga.avisos.nuevos.filter(x => x.tipo === 'musculo').map(x => `${x.nombre} (IEM ${n1(x.aguda)})`),
                  ...carga.avisos.nuevos.filter(x => x.tipo === 'articulacion').map(x => `${x.nombre} (estrés articular ${n1(x.aguda)})`),
                ].join(', ')}. Empieza con poco y mira las agujetas.
              </p>
            )}
          </>
        )}
        {comparacionBloques.antes && comparacionBloques.ahora && (
          <div className="rounded-control border border-hairline p-3 space-y-1">
            <p className="font-sans text-caption font-bold text-ink">Bloque anterior vs este (media por semana)</p>
            <p className="font-sans text-caption text-ink-2">
              Fatiga (IF): {n1(comparacionBloques.antes.IF)} → <b className="text-ink">{n1(comparacionBloques.ahora.IF)}</b> ({pct(variacion(comparacionBloques.antes.IF, comparacionBloques.ahora.IF))})
              {' · '}Estímulo (IEM total): {n1(comparacionBloques.antes.IEM)} → <b className="text-ink">{n1(comparacionBloques.ahora.IEM)}</b> ({pct(variacion(comparacionBloques.antes.IEM, comparacionBloques.ahora.IEM))})
            </p>
            <p className="font-sans text-caption text-ink-3">Con {comparacionBloques.antes.n} semana{comparacionBloques.antes.n === 1 ? '' : 's'} antes de este bloque y {comparacionBloques.ahora.n} de este.</p>
          </div>
        )}
        <div className="flex flex-wrap items-end gap-2 pt-1">
          <label className="flex flex-col gap-1">
            <span className="text-caption font-sans uppercase tracking-wide text-ink-3">Aviso por debajo de</span>
            <input value={inf} onChange={e => setInf(e.target.value)} inputMode="decimal" aria-label="Umbral inferior" className="h-10 w-24 rounded-field border border-control-line bg-field px-2 font-mono text-body-s text-ink" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-caption font-sans uppercase tracking-wide text-ink-3">Aviso por encima de</span>
            <input value={sup} onChange={e => setSup(e.target.value)} inputMode="decimal" aria-label="Umbral superior" className="h-10 w-24 rounded-field border border-control-line bg-field px-2 font-mono text-body-s text-ink" />
          </label>
          <Button size="s" variant="secondary" disabled={!umbralesValidos} onClick={() => guardar({ inferior: aNumero(inf), superior: aNumero(sup) }, limitesGuardados)}>
            Guardar para este atleta
          </Button>
        </div>
      </Seccion>

      <Seccion titulo="Estrés articular · banda y límite del atleta">
        {(() => {
          // Total de la semana y sesión más cargada de cada articulación, de lo REALIZADO.
          const total = semanaActiva?.gestion.find(f => f.sesion === 'Total');
          const sesionesDeLaSemana = semanaActiva?.gestion.filter(f => f.sesion !== 'Total') ?? [];
          const filas = motor.articulaciones.map((nombre, j) => {
            const valor = total?.estresArticular[j] ?? 0;
            const pico = sesionesDeLaSemana.reduce<{ sesion: string; valor: number } | null>(
              (m, f) => ((f.estresArticular[j] ?? 0) > (m?.valor ?? 0.005) ? { sesion: f.sesion, valor: f.estresArticular[j] } : m), null);
            return { nombre, j, valor, pico, ...bandaIEA(valor, 'semana') };
          });
          const sobreLimite = total ? articulacionesSobreSuLimite(motor.articulaciones, total.estresArticular, limitesGuardados) : [];
          return (
            <>
              <p className="font-sans text-caption text-ink-2">
                {semanaActiva ? `Estrés articular realizado en la semana ${semanaActiva.semana}, por articulación.` : 'Sin semana realizada todavía: se pueden dejar puestos los límites.'}
                {' '}Referencia del curso por semana: bajo hasta {BANDAS_IEA.semana.bajoHasta}, alto de {BANDAS_IEA.semana.altoDesde} a {BANDAS_IEA.semana.techo}; por sesión, bajo por debajo de {BANDAS_IEA.sesion.bajoHasta} y alto de {BANDAS_IEA.sesion.altoDesde} a {BANDAS_IEA.sesion.techo}.
              </p>
              {/* Informativo: se dice que pasa de SU límite, no por qué lo tiene. */}
              {sobreLimite.length > 0 && (
                <ul className="space-y-0.5 font-sans text-caption text-ink-2">
                  {sobreLimite.map(a => (
                    <li key={a.j}><b className="text-ink">{a.articulacion}</b>: {n1(a.valor)} esta semana, por encima de su límite ({n1(a.limite)}).</li>
                  ))}
                </ul>
              )}
              <div className="overflow-x-auto">
                <table className="w-full font-sans text-caption">
                  <thead><tr><Th>Articulación</Th><Th derecha>Semana</Th><Th>Banda</Th><Th>Sesión más cargada</Th><Th derecha>Límite semanal</Th></tr></thead>
                  <tbody>
                    {filas.map(f => (
                      <tr key={f.nombre} className="border-t border-hairline">
                        <td className="py-1 pr-2 text-ink whitespace-nowrap">{f.nombre}</td>
                        <td className="py-1 px-2 text-right font-mono tabular-nums text-ink">{f.valor > 0.005 ? n1(f.valor) : '·'}</td>
                        <td className={`py-1 px-2 ${TONO_BANDA_IEA[f.banda]}`}>{f.valor > 0.005 ? `${f.etiqueta}${f.sobreElTecho ? ` (más de ${BANDAS_IEA.semana.techo})` : ''}` : '—'}</td>
                        <td className="py-1 px-2 text-ink-2 whitespace-nowrap">
                          {f.pico ? <>{nombreSesion(f.pico.sesion)} · <span className="font-mono tabular-nums">{n1(f.pico.valor)}</span> <span className={TONO_BANDA_IEA[bandaIEA(f.pico.valor, 'sesion').banda]}>{bandaIEA(f.pico.valor, 'sesion').etiqueta.toLowerCase()}</span></> : '—'}
                        </td>
                        <td className="py-1 pl-2 text-right">
                          <input
                            value={limitesTxt[f.nombre] ?? ''}
                            onChange={e => setLimitesTxt(t => ({ ...t, [f.nombre]: e.target.value }))}
                            inputMode="decimal" placeholder="sin límite" aria-label={`Límite semanal de ${f.nombre}`}
                            className="h-9 w-24 rounded-field border border-control-line bg-field px-2 text-right font-mono text-body-s text-ink"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="s" variant="secondary" disabled={limitesMalEscritos || !limitesCambiados} onClick={() => guardar(umbrales ?? UMBRALES_CARGA_POR_DEFECTO, limitesEscritos)}>
                  Guardar límites para este atleta
                </Button>
                {limitesMalEscritos && <span className="font-sans text-caption text-warning">Un límite tiene que ser un número mayor que cero (o dejarse vacío).</span>}
              </div>
              <p className="font-sans text-caption text-ink-3">
                El límite es de este atleta y por articulación; vacío = sin límite. Referencia del curso para una articulación que conviene cuidar: por debajo de {LIMITE_IEA_CON_ANTECEDENTES} a la semana. El aviso es informativo y sale aquí y en el panel de índices de la semana programada.
              </p>
            </>
          );
        })()}
      </Seccion>

      <Seccion titulo="Rendimiento · RM y tonelaje">
        {!semanaActiva || semanaActiva.rendimiento.length === 0 ? <p className="font-sans text-caption text-ink-3">Sin datos.</p> : (
          <table className="w-full font-sans text-caption">
            <thead><tr><Th>Sesión</Th><Th>Ejercicio</Th><Th derecha>RM</Th><Th derecha>Tonelaje</Th></tr></thead>
            <tbody>
              {semanaActiva.rendimiento.map((f, i) => (
                <tr key={i} className="border-t border-hairline">
                  <td className="py-1.5 text-ink-2 whitespace-nowrap pr-2">{nombreSesion(f.sesion)}</td>
                  <td className="py-1.5 text-ink">{sinMusculos(f.ejercicio)}</td>
                  <td className="py-1.5 text-right font-mono text-ink">{n1(f.rm)}</td>
                  <td className="py-1.5 text-right font-mono text-ink-2">{Math.round(f.tonelaje).toLocaleString('es-ES')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {semanas.length >= 2 && (
          <div className="space-y-3 pt-2">
            <p className="text-caption font-sans uppercase tracking-wide text-ink-3">Mejora del ciclo (RM, primera → última semana con ese ejercicio)</p>
            <table className="w-full font-sans text-caption">
              <thead><tr><Th>Categoría</Th><Th derecha>Mejora</Th></tr></thead>
              <tbody>
                {ciclo.categorias.map(c => (
                  <tr key={c.categoria} className="border-t border-hairline">
                    <td className="py-1.5 text-ink">{c.categoria} <span className="text-ink-3">({c.ejercicios})</span></td>
                    <td className="py-1.5 text-right font-mono text-ink">{pct(c.incremento)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <table className="w-full font-sans text-caption">
              <thead><tr><Th>Ejercicio</Th><Th derecha>Semanas</Th><Th derecha>Mejora</Th></tr></thead>
              <tbody>
                {ciclo.incrementos.map(c => (
                  <tr key={c.ejercicio} className="border-t border-hairline">
                    <td className="py-1.5 text-ink">{sinMusculos(c.ejercicio)}</td>
                    <td className="py-1.5 text-right font-mono text-ink-2">{c.semanas}</td>
                    <td className="py-1.5 text-right font-mono text-ink">{pct(c.incremento)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Seccion>

      {(() => {
        // Guía del IH: tonelaje frente a RM y «¿toca cambiar de bloque?».
        const sumar = (m: number[][]) => m.reduce((a, d) => a + d.reduce((x, y) => x + y, 0), 0);
        // R1: ni la semana en curso a medias ni las de descarga o puente se comparan.
        const paraLectura: SemanaParaLectura[] = semanas.map(s => ({
          semana: s.semana, rendimiento: s.rendimiento, iemTotal: sumar(s.calculo.IEM),
          incompleta: s.semana === semanaEnCurso && s.logs < sesionesPorCiclo,
          descarga: esDescargaOPuente(meso, s.semana),
        }));
        const lecturas = paraLectura.map((_, i) => leerRendimiento(paraLectura.slice(0, i + 1)).lectura).filter(l => l !== 'sin-dato');
        const ultima = leerRendimiento(paraLectura);
        // F16: el historial va por semana de revisión (su fecha), no por posición.
        // Una semana sin contestar es «sin dato» y corta cualquier racha.
        const ciclos = historial ? contextoPorCiclos(historial, hoyIsoLocal()) : [];
        const contextos: Contexto[] = ciclos.map(c => c.contexto);
        const fatigaSeguida = rachaFinal(ciclos.map(c => c.fatigaPost));
        const motivacionSeguida = rachaFinal(ciclos.map(c => c.motivacion));
        // El cansancio de cada semana realizada: la respuesta del ciclo de revisión
        // en el que cae su último día (misma regla que `fechaSemanaDelBloque`).
        const cansancioDe = (semana: number) => valorEnElCicloDe(ciclos, addDays(meso.startDate, semana * cicloDias - 1), 'fatigaPost');
        let avisosArticulares = 0;
        if (semanas.length >= 2) {
          const totales = (s: typeof semanas[number]) => ({
            IEM: s.calculo.IEM.reduce((acc, d) => acc.map((v, i) => v + (d[i] ?? 0)), new Array<number>(motor.musculos.length).fill(0)),
            estresArticular: s.calculo.estresArticular.reduce((acc, d) => acc.map((v, i) => v + (d[i] ?? 0)), new Array<number>(motor.articulaciones.length).fill(0)),
          });
          avisosArticulares = avisosIemIea(motor, totales(semanas[semanas.length - 2]), totales(semanas[semanas.length - 1])).length;
        }
        const cambio = indicadoresCambioDeBloque({
          semanasHechas: semanas.length, contextos, semanasAburrimiento: semanasHastaAburrirse(tip),
          fatigaPost: fatigaSeguida, motivacion: motivacionSeguida,
          lecturas, avisosArticulares, rmUltimaSemana: ultima.rm,
        });
        return (
          <>
            <Seccion titulo="Lectura del rendimiento">
              <p className="font-sans text-caption text-ink">{ultima.texto}</p>
              {ultima.tonelaje != null && ultima.rm != null && (
                <p className="font-mono text-caption text-ink-2">Tonelaje {pct(ultima.tonelaje)} · RM {pct(ultima.rm)} (ejercicios comunes de {ultima.semanas ? `S${ultima.semanas[0]} y S${ultima.semanas[1]}` : 'las dos últimas semanas'}; sin la semana en curso a medias ni descargas)</p>
              )}
              <p className="font-sans text-caption text-ink-3">Anota las bajadas intencionadas (descargas) para no malinterpretarlas después.</p>
              {(() => {
                // Cada semana con SU cansancio (por fecha); las que no lo tienen, fuera.
                const pares = semanas.map(se => ({ IF: Math.max(0, ...se.calculo.IF), cansancio: cansancioDe(se.semana) }))
                  .filter((x): x is { IF: number; cansancio: number } => x.cansancio != null);
                const ref = referenciasToleradas(pares.map(x => x.IF), pares.map(x => x.cansancio));
                if (ref.tolerado == null && ref.demasiado == null) return null;
                return (
                  <p className="font-sans text-caption text-ink-2">
                    Referencia de este atleta:{ref.tolerado != null && <> lleva bien sesiones de hasta <b className="font-mono">IF {n1(ref.tolerado)}</b></>}
                    {ref.tolerado != null && ref.demasiado != null && ';'}
                    {ref.demasiado != null && <> con <b className="font-mono">IF {n1(ref.demasiado)}</b> salió destrozado</>}.
                  </p>
                );
              })()}
            </Seccion>
            <Seccion titulo="¿Toca cambiar de bloque?">
              <p className="font-sans text-caption text-ink">{cambio.resumen}</p>
              <ul className="font-sans text-caption space-y-0.5">
                {cambio.aFavor.map(i => (
                  <li key={i.clave} className={i.cumple ? 'text-warning' : 'text-ink-3'}>
                    {i.cumple ? '● ' : '○ '}{i.texto}{i.detalle ? ` · ${i.detalle}` : ''}
                  </li>
                ))}
                {cambio.enContra.filter(i => i.cumple).map(i => (
                  <li key={i.clave} className="text-success">✓ {i.texto}</li>
                ))}
              </ul>
            </Seccion>
          </>
        );
      })()}

      <Seccion titulo="Antropometría · inicio → último">
        <table className="w-full font-sans text-caption">
          <thead><tr><Th>Índice</Th><Th derecha>Inicio</Th><Th derecha>Último</Th><Th derecha>Incremento</Th></tr></thead>
          <tbody>
            {antropometria.map(f => (
              <tr key={f.clave} className="border-t border-hairline">
                <td className="py-1.5 text-ink">{ANTHROPOMETRIC_INDEX_LABELS[f.clave]}</td>
                <td className="py-1.5 text-right font-mono text-ink-2">{f.inicio != null ? f.inicio.toLocaleString('es-ES', { maximumFractionDigits: 3 }) : '—'}</td>
                <td className="py-1.5 text-right font-mono text-ink">{f.ultimo != null ? f.ultimo.toLocaleString('es-ES', { maximumFractionDigits: 3 }) : '—'}</td>
                <td className="py-1.5 text-right font-mono text-ink">{pct(f.incremento)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="font-sans text-caption text-ink-3">Un índice sin dato en los dos extremos queda en «—». Inicio = primera medida de cada perímetro.</p>
      </Seccion>
    </div>
  );
}
