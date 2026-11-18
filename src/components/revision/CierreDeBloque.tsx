import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AthleteDossier, BodyweightLog, CierreDeHipotesis, Exercise, Mesocycle, ProgressPhoto, Questionnaire,
  QuestionnaireResponse, UserProfile, WorkoutAssignment, WorkoutLog,
} from '../../types';
import { auth } from '../../firebase';
import { getDietCompletionLogsForAthlete, getDietsForAthlete, getNutritionProgram, getOnboarding, updateUserProfile } from '../../dbService';
import { getWorkouts } from '../../db/training';
import { useMotorCdg } from '../../hooks/useMotorCdg';
import { mapaDeRespuesta } from '../../utils/hipotesisDeBloque/mapaDeRespuesta';
import { siguienteBloque, zonasQuePide } from '../../utils/hipotesisDeBloque/siguienteBloque';
import { fotosDeLosBloques, indiciosDeRespuesta, puntoDePartida } from '../../utils/hipotesisDeBloque/respuestaADosis';
import { cierreParaGuardar } from '../../utils/hipotesisDeBloque/veredicto';
import { limitesTrasAceptar, type LimiteArticularPropuesto } from '../../utils/hipotesisDeBloque/estresArticular';
import { UMBRALES_CARGA_POR_DEFECTO } from '../../utils/cdg/integracion';
import { getBodyMeasurementsForAthlete } from '../../db/bodyMeasurements';
import { bodyMeasurementsForAthleteKey } from '../../hooks/useBodyMeasurements';
import { appendDossierFacts, getDossier } from '../../db/dossier';
import type { CierreMesociclo } from '../../utils/cierreMesociclo';
import { buildCierreCompleto } from '../../utils/cierreCompleto';
import { finDeBloque } from '../../utils/finDeBloque';
import { notaDePocasSemanas, notaDeSemanasFuera } from '../../utils/progresionDelBloque';
import { EvolucionDelBloque, EvolucionPregunta } from '../../utils/evolucionDelBloque';
import { Conclusion, TonoConclusion, hechosDeCierre, hechosDeCierrePorGuardar } from '../../utils/conclusionesDelBloque';
import { nombreDeMeso } from '../../utils/nombresMeso';
import { Sexo } from '../../utils/athleteProfileSignals';
import { useToast } from '../../hooks/useToast';
import { Badge, Button, EmptyState, Icon, SegmentedControl, Select } from '../ui';
import {
  fmt, conSigno, colorDelta, Tile, Seccion, SemanaASemana, Podio, ListaEjercicios, Agregado, MiniLinea,
} from '../cierre/piezas';
import VeredictosDeHipotesis from '../cierre/VeredictosDeHipotesis';
import ARespondeA from '../cierre/ARespondeA';
import CrearSiguienteBloque from '../cierre/CrearSiguienteBloque';
import { useEscriturasDelCierre } from '../cierre/escriturasDelCierre';
import ComparadorFotos from './ComparadorFotos';

/* ═══════════════════════════════════════════════════════════════════════════
   Revisión › Cierre de bloque.

   La revisión semanal mira una semana; esto mira un mesociclo entero, del
   principio al final, y contesta lo que se le cuenta al atleta al terminar un
   bloque: ¿ha funcionado?, ¿qué ha mejorado (fuerza, cuerpo, cómo se siente)?,
   ¿qué no?, y —lo que faltaba— ¿qué hacemos en el siguiente?

   Tres capas, en el orden en que se narra:
     1. Conclusiones (utils/conclusionesDelBloque): lo que sacamos y lo que
        cambia en el siguiente bloque. Reglas con la cifra que las dispara.
     2. Al empezar vs al terminar: todo lo medido en una sola tabla —fuerza,
        kilos, RIR, peso, medidas, dieta y cada pregunta de los cuestionarios—.
     3. El detalle: rendimiento semana a semana, ejercicios, patrones y grupos,
        fotos, y lo constante que ha sido registrando.

   Mismos motores que Plan › Entrenamiento › Cierre: los números coinciden, y
   el mensaje para el cliente es el mismo (utils/cierreCompleto).

   17-11-2026 (hipótesis del bloque): si el bloque abrió con hipótesis, lo
   primero es qué pasó con cada una (cierre/VeredictosDeHipotesis) —el coach
   las firma y quedan en el mesociclo— y el bloque siguiente ya propuesto
   (cierre/CrearSiguienteBloque). Un bloque antiguo, sin hipótesis, no enseña
   ninguna de las dos.

   18-11-2026 (Dani): con molestias en una zona con estrella, la propuesta del
   bloque siguiente dice qué articulaciones vigilar y sugiere su límite
   semanal. Aceptarlo escribe el límite del atleta
   (`UserProfile.cdgUmbralesCarga.limitesArticulares`, el mismo que se edita
   en Seguimiento); es lo único que este cierre escribe fuera del mesociclo.

   18-11-2026 (a qué responde): debajo de los veredictos, los indicios de si
   al atleta le va mejor con más volumen, más frecuencia o más cerca del
   fallo (cierre/ARespondeA), con las fotos firmadas de sus bloques y la de
   este en vivo; en un primer bloque, su punto de partida. Los mismos
   indicios van como motivo a la propuesta del bloque siguiente.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  athlete: UserProfile;
  meso: Mesocycle;
  /** Bloques entre los que se puede elegir (el padre decide cuáles). */
  bloques: Mesocycle[];
  onCambiarBloque: (mesoId: string) => void;
  mesocycles: Mesocycle[];
  logs: WorkoutLog[];
  exercises: Exercise[];
  assignments: WorkoutAssignment[];
  photos: ProgressPhoto[];
  bodyweightLogs: BodyweightLog[];
  questionnaires: Questionnaire[];
  responses: QuestionnaireResponse[];
  sexo: Sexo | null;
  hoy: string;
  presentando?: boolean;
}

const TONO: Record<TonoConclusion, { icono: string; clase: string }> = {
  bien: { icono: 'check_circle', clase: 'text-success' },
  atencion: { icono: 'error', clase: 'text-warning' },
  neutro: { icono: 'arrow_forward', clase: 'text-ink-3' },
};

function ListaConclusiones({ items, vacio }: { items: Conclusion[]; vacio: string }) {
  if (items.length === 0) return <p className="font-sans text-caption text-ink-3">{vacio}</p>;
  return (
    <ul className="space-y-2">
      {items.map(c => (
        <li key={c.id} className="flex items-start gap-2">
          <Icon name={TONO[c.tono].icono} size="s" className={`${TONO[c.tono].clase} mt-0.5 shrink-0`} />
          <span className="font-sans text-label text-ink leading-relaxed">{c.texto}</span>
        </li>
      ))}
    </ul>
  );
}

// ── Tabla «al empezar / al terminar» ────────────────────────────────────────

interface FilaComparada {
  clave: string;
  grupo: string;
  metrica: string;
  inicio: string;
  final: string;
  cambio: string;
  color: string;
  serie?: (number | null)[];
}

const COLOR_LECTURA: Record<EvolucionPregunta['lectura'], string> = {
  mejora: 'var(--color-success)',
  empeora: 'var(--color-danger)',
  igual: 'var(--color-ink-2)',
};

function filasComparadas(c: CierreMesociclo, ev: EvolucionDelBloque): FilaComparada[] {
  const filas: FilaComparada[] = [];
  const res = c.progresion.resumen;
  const semanas = c.progresion.semanas;
  // El «al terminar» del índice es el de la última semana comparable: el de una
  // descarga o un test al final no es cómo acaba el bloque.
  const conIndice = semanas.filter(s => s.indiceFuerza != null && s.comparable);
  if (res.medianaPct != null && conIndice.length >= 2) {
    filas.push({
      clave: 'fuerza', grupo: 'Rendimiento', metrica: 'Fuerza estimada (índice)',
      inicio: '100', final: fmt(conIndice[conIndice.length - 1].indiceFuerza!),
      cambio: `${conSigno(res.medianaPct)}% mediana`, color: colorDelta(res.medianaPct),
      serie: semanas.map(s => s.indiceFuerza),
    });
  }
  if (res.tonelajeSemanal) {
    filas.push({
      clave: 'kg', grupo: 'Rendimiento', metrica: 'Kg movidos por semana',
      inicio: fmt(Math.round(res.tonelajeSemanal.inicio), 0), final: fmt(Math.round(res.tonelajeSemanal.final), 0),
      cambio: res.tonelajeSemanal.deltaPct != null ? `${conSigno(res.tonelajeSemanal.deltaPct)}%` : '—',
      color: colorDelta(res.tonelajeSemanal.deltaPct), serie: semanas.map(s => (s.tonelaje > 0 ? s.tonelaje : null)),
    });
  }
  if (res.rir) {
    const d = Math.round((res.rir.final - res.rir.inicio) * 10) / 10;
    filas.push({
      clave: 'rir', grupo: 'Rendimiento', metrica: 'RIR medio (margen hasta el fallo)',
      inicio: fmt(res.rir.inicio), final: fmt(res.rir.final), cambio: d === 0 ? '=' : conSigno(d),
      color: 'var(--color-ink-2)', serie: semanas.map(s => s.rirMedio),
    });
  }
  const completas = semanas.filter(s => !s.enCurso && s.sesionesHechas > 0);
  if (completas.length >= 2) {
    const a = completas[0], b = completas[completas.length - 1];
    filas.push({
      clave: 'sesiones', grupo: 'Rendimiento', metrica: 'Sesiones por semana',
      inicio: `${a.sesionesHechas}${a.sesionesProgramadas ? `/${a.sesionesProgramadas}` : ''}`,
      final: `${b.sesionesHechas}${b.sesionesProgramadas ? `/${b.sesionesProgramadas}` : ''}`,
      cambio: b.sesionesHechas === a.sesionesHechas ? '=' : conSigno(b.sesionesHechas - a.sesionesHechas),
      color: b.sesionesHechas >= a.sesionesHechas ? 'var(--color-ink-2)' : 'var(--color-danger)',
      serie: semanas.map(s => (s.enCurso ? null : s.sesionesHechas)),
    });
  }
  if (ev.peso) {
    const p = ev.peso;
    filas.push({
      clave: 'peso', grupo: 'Cuerpo', metrica: 'Peso corporal (mediana semanal)',
      inicio: `${fmt(p.inicio)} kg`, final: `${fmt(p.final)} kg`,
      cambio: `${conSigno(p.deltaKg)} kg${p.ritmoPctSemana != null ? ` · ${conSigno(p.ritmoPctSemana)}%/sem` : ''}`,
      color: p.enRango == null ? 'var(--color-ink-2)' : p.enRango ? 'var(--color-success)' : 'var(--color-warning)',
      serie: p.semanal,
    });
  }
  // Un cambio menor que el error de la cinta no lleva signo: con «−0,3 cm» se
  // leería una bajada que no se distingue de volver a medir.
  for (const m of ev.medidas) {
    filas.push({
      clave: `m_${m.clave}`, grupo: 'Cuerpo', metrica: m.label,
      inicio: `${fmt(m.inicio)} ${m.unidad}`, final: `${fmt(m.final)} ${m.unidad}`,
      cambio: m.sinCambioMedible ? 'sin cambio medible' : `${conSigno(m.delta)} ${m.unidad}`, color: 'var(--color-ink-2)',
    });
  }
  for (const i of ev.indices) {
    filas.push({
      clave: `i_${i.clave}`, grupo: 'Cuerpo', metrica: `Índice ${i.label}`,
      inicio: fmt(i.inicio, 2), final: fmt(i.final, 2),
      cambio: i.sinCambioMedible ? 'sin cambio medible' : `${i.delta > 0 ? '+' : ''}${fmt(i.delta, 2)}`, color: 'var(--color-ink-2)',
    });
  }
  if (ev.dieta && ev.dieta.inicio != null && ev.dieta.final != null) {
    const d = ev.dieta;
    filas.push({
      clave: 'dieta', grupo: 'Nutrición', metrica: 'Kcal comidas vs objetivo',
      inicio: `${d.inicio}%`, final: `${d.final}%`,
      cambio: d.diasEnObjetivoPct != null ? `${d.diasEnObjetivoPct}% días en objetivo` : '—',
      color: d.diasEnObjetivoPct == null ? 'var(--color-ink-2)' : d.diasEnObjetivoPct >= 70 ? 'var(--color-success)' : d.diasEnObjetivoPct < 50 ? 'var(--color-warning)' : 'var(--color-ink-2)',
      serie: d.semanal,
    });
  }
  for (const q of ev.preguntas) {
    filas.push({
      clave: `q_${q.clave}`, grupo: 'Cuestionarios', metrica: q.label,
      inicio: `${fmt(q.inicio)}${q.unidad ? ` ${q.unidad}` : ''}`, final: `${fmt(q.final)}${q.unidad ? ` ${q.unidad}` : ''}`,
      cambio: `${q.delta === 0 ? '=' : conSigno(q.delta)}${q.lectura === 'mejora' ? ' · mejora' : q.lectura === 'empeora' ? ' · empeora' : ''}`,
      color: COLOR_LECTURA[q.lectura], serie: q.semanal,
    });
  }
  return filas;
}

function TablaInicioFinal({ filas }: { filas: FilaComparada[] }) {
  if (filas.length === 0) {
    return <p className="font-sans text-caption text-ink-3">Todavía no hay dos momentos del bloque con datos que comparar.</p>;
  }
  let grupoAnterior = '';
  return (
    <div className="overflow-x-auto rounded-surface border border-hairline">
      <table className="w-full border-collapse" style={{ minWidth: '560px' }}>
        <thead>
          <tr className="bg-bg">
            {['Qué', 'Al empezar', 'Al terminar', 'Cambio', 'Semanas'].map((h, i) => (
              <th
                key={h}
                className={`px-3 py-2.5 font-mono text-caption text-ink-2 uppercase tracking-wider border-b border-hairline ${i === 0 ? 'text-left' : i === 4 ? 'text-left w-[100px]' : 'text-right'}`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map(f => {
            const cabecera = f.grupo !== grupoAnterior;
            grupoAnterior = f.grupo;
            return (
              <React.Fragment key={f.clave}>
                {cabecera && (
                  <tr className="bg-bg/60">
                    <td colSpan={5} className="px-3 pt-3 pb-1 font-mono text-caption text-ink-3 uppercase tracking-[.1em]">{f.grupo}</td>
                  </tr>
                )}
                <tr className="border-b border-hairline last:border-b-0">
                  <td className="px-3 py-2.5 font-sans text-label text-ink max-w-[260px]">{f.metrica}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-label text-ink-2 tabular-nums whitespace-nowrap">{f.inicio}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-label font-bold text-ink tabular-nums whitespace-nowrap">{f.final}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-caption tabular-nums whitespace-nowrap" style={{ color: f.color }}>{f.cambio}</td>
                  <td className="px-3 py-2.5">{f.serie ? <MiniLinea valores={f.serie} /> : null}</td>
                </tr>
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Pantalla ────────────────────────────────────────────────────────────────

type VistaDetalle = 'grupos' | 'patrones' | 'ejercicios';

export default function CierreDeBloque({
  athlete, meso, bloques, onCambiarBloque, mesocycles, logs, exercises, assignments,
  photos, bodyweightLogs, questionnaires, responses, sexo, hoy, presentando = false,
}: Props) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [vista, setVista] = useState<VistaDetalle>('grupos');
  const [guardando, setGuardando] = useState(false);

  // Las comidas del bloque entero (la revisión semanal solo pide su ventana).
  const { data: registrosDeComida = [] } = useQuery({
    queryKey: ['dietCompletionLogsForAthlete', athlete.email, meso.startDate],
    queryFn: () => getDietCompletionLogsForAthlete(athlete.email, meso.startDate),
  });
  const { data: dietas = [] } = useQuery({
    queryKey: ['dietsForAthlete', athlete.email],
    queryFn: () => getDietsForAthlete(athlete.email),
  });
  const { data: medidas = [] } = useQuery({
    queryKey: bodyMeasurementsForAthleteKey(athlete.email),
    queryFn: () => getBodyMeasurementsForAthlete(athlete.email),
  });
  const { data: programa } = useQuery({
    queryKey: ['nutritionProgram', athlete.email],
    queryFn: () => getNutritionProgram(athlete.email),
  });
  // Para las hipótesis del bloque: el motor CDG (mide el proceso), el nivel del
  // atleta (a un avanzado se le juzga a dos bloques) y las rutinas del bloque
  // (de ellas se clona el siguiente). Mismas claves de caché que el resto.
  const { motor } = useMotorCdg();
  const { data: alta } = useQuery({
    queryKey: ['onboarding', athlete.email],
    queryFn: () => getOnboarding(athlete.email),
  });
  const { data: rutinas = [] } = useQuery({ queryKey: ['workouts'], queryFn: getWorkouts });

  // Los tres motores juntos y su único mensaje: lo mismo que ven el editor
  // del mesociclo, el borrador que se firma y el asistente.
  const completo = useMemo(
    () => buildCierreCompleto({
      meso, mesocycles, logs, assignments, exercises, athleteName: athlete.displayName, hoy,
      bodyweightLogs, medidas, photos, responses, questionnaires,
      dietLogs: registrosDeComida, diets: dietas, programaNutricion: programa,
      motorCdg: motor, nivel: alta?.experienceLevel,
    }),
    [meso, mesocycles, logs, assignments, exercises, athlete.displayName, hoy, bodyweightLogs, medidas, photos, responses, questionnaires, registrosDeComida, dietas, programa, motor, alta?.experienceLevel],
  );
  const { cierre, evolucion, conclusiones, pesoCorporalKg: pesoKg, mensaje: mensajeGenerado, hipotesis } = completo;
  const filas = useMemo(() => filasComparadas(cierre, evolucion), [cierre, evolucion]);

  const [mensaje, setMensaje] = useState(mensajeGenerado);
  useEffect(() => { setMensaje(mensajeGenerado); }, [mensajeGenerado]);

  const copiar = async (texto: string, que: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      showToast(`${que} copiado al portapapeles.`, 'success');
    } catch {
      showToast('No se ha podido copiar. Selecciona el texto y cópialo a mano.', 'error');
    }
  };

  // ── Hipótesis del bloque: veredictos, firma y bloque siguiente ─────────────
  // Lo firmado en esta pantalla manda sobre lo que trae el mesociclo hasta que
  // la lista de bloques se vuelva a leer.
  const [firmadoAqui, setFirmadoAqui] = useState<{ mesoId: string; cierre: CierreDeHipotesis } | null>(null);
  const [firmando, setFirmando] = useState(false);
  const { guardarCierre } = useEscriturasDelCierre();
  const firmado = firmadoAqui?.mesoId === meso.id ? firmadoAqui.cierre : meso.cierreDeHipotesis;
  const ejercicioDe = useMemo(() => {
    const porId = new Map(exercises.map(e => [e.id, e]));
    return (id: string) => porId.get(id);
  }, [exercises]);
  const duracionMediaMin = useMemo(() => {
    const d = cierre.progresion.semanas.map(s => s.duracionMediaMin).filter((x): x is number => x != null);
    return d.length ? d.reduce((a, b) => a + b, 0) / d.length : null;
  }, [cierre.progresion.semanas]);
  // Todos sus bloques, con este tal como queda firmado: de ahí el mapa de respuesta.
  const mapa = useMemo(
    () => mapaDeRespuesta(mesocycles.map(m => (m.id === meso.id && firmado ? { ...m, cierreDeHipotesis: firmado } : m))).frase,
    [mesocycles, meso.id, firmado],
  );
  // Límites articulares del atleta: los de su perfil o, si se acaban de fijar
  // aquí, esos (el perfil que llega por props no se vuelve a leer al momento).
  const [limitesAqui, setLimitesAqui] = useState<{ email: string; limites: Record<string, number> } | null>(null);
  const limitesArticulares = limitesAqui?.email === athlete.email ? limitesAqui.limites : athlete.cdgUmbralesCarga?.limitesArticulares;
  // A qué responde: las fotos firmadas de sus bloques hasta este y la de este
  // (la firmada o, sin firmar, la de ahora). Lo posterior a este bloque no cuenta.
  const indicios = useMemo(() => {
    if (!hipotesis) return [];
    const todos = mesocycles.some(m => m.id === meso.id) ? mesocycles : [...mesocycles, meso];
    return indiciosDeRespuesta(fotosDeLosBloques(
      todos.map(m => (m.id === meso.id ? { ...m, cierreDeHipotesis: firmado } : m)),
      { actual: { mesocycleId: meso.id, dosis: hipotesis.dosis }, hasta: meso.startDate },
    ));
  }, [hipotesis, mesocycles, meso, firmado]);
  const punto = useMemo(() => (hipotesis && meso.tipoBloque === 'primer'
    ? puntoDePartida(firmado?.dosis?.length ? firmado.dosis : hipotesis.dosis, {
      pideElAtleta: zonasQuePide(evolucion.voz?.priorizar), quejas: hipotesis.quejasPorZona,
    })
    : null), [hipotesis, meso.tipoBloque, firmado, evolucion.voz]);
  const propuesto = useMemo(() => {
    if (!hipotesis) return null;
    return siguienteBloque({
      meso, rutinas: rutinas.filter(w => w.mesocycleId === meso.id), mesocycles,
      veredictos: firmado?.veredictos ?? hipotesis.veredictos,
      estado: hipotesis.estado, ejercicios: hipotesis.ejercicios,
      // Molestias y estrés articular: un veredicto firmado se guarda sin sus
      // límites, así que se releen del bloque (ejercicio → zona y cansancio medio).
      zonaDe: hipotesis.zonaDe, cansancioMedio: hipotesis.cansancioMedio,
      estresArticular: hipotesis.estresArticularMedio, limitesArticulares,
      quitaria: evolucion.voz?.quitaria, pideElAtleta: zonasQuePide(evolucion.voz?.priorizar),
      // El parón se cuenta desde lo último que entrenó, sea de este bloque o de uno posterior.
      fin: cierre.fin, hoy, ultimaSesion: logs.reduce<string | null>((u, l) => (l.date <= hoy && (u == null || l.date > u) ? l.date : u), null),
      ownerId: auth.currentUser?.uid ?? '', athleteName: athlete.displayName,
      nombreDe: id => ejercicioDe(id)?.name, grupoDe: id => ejercicioDe(id)?.muscleGroup,
      // Para el objetivo del bloque siguiente: un principiante pide más y en déficit se pide no perder.
      nivel: alta?.experienceLevel, programaNutricion: programa,
      // A qué responde: la foto de este bloque entra en el historial y los indicios van como motivo.
      dosis: firmado?.dosis?.length ? firmado.dosis : hipotesis.dosis, indicios,
    });
  }, [hipotesis, meso, rutinas, mesocycles, firmado, evolucion.voz, cierre.fin, hoy, athlete.displayName, ejercicioDe, logs, alta?.experienceLevel, programa, limitesArticulares, indicios]);

  // Aceptar el límite sugerido: se suma a los que ya tenía (nunca sube uno) y
  // se guarda con sus umbrales de carga, por el mismo camino que Seguimiento.
  const fijarLimitesArticulares = async (propuestos: LimiteArticularPropuesto[]) => {
    const limites = limitesTrasAceptar(limitesArticulares, propuestos);
    const umbrales = athlete.cdgUmbralesCarga ?? UMBRALES_CARGA_POR_DEFECTO;
    await updateUserProfile(athlete.userId, { cdgUmbralesCarga: { inferior: umbrales.inferior, superior: umbrales.superior, limitesArticulares: limites } });
    setLimitesAqui({ email: athlete.email, limites });
    void queryClient.invalidateQueries({ queryKey: ['userProfiles'] });
  };

  const guardarVeredictos = async (nuevo: CierreDeHipotesis, que = 'Veredictos guardados', queNo = 'los veredictos') => {
    setFirmando(true);
    try {
      await guardarCierre(meso.id, nuevo);
      setFirmadoAqui({ mesoId: meso.id, cierre: nuevo });
      queryClient.setQueryData<Mesocycle[]>(['mesocycles', athlete.email], prev =>
        prev?.map(m => (m.id === meso.id ? { ...m, cierreDeHipotesis: nuevo } : m)));
      showToast(`${que} en el bloque`, 'success');
    } catch (err) {
      console.error(`CierreDeBloque: no se pudieron guardar ${queNo}`, err);
      showToast(`No se han podido guardar ${queNo}`, 'error');
    } finally {
      setFirmando(false);
    }
  };

  const guardarEnFicha = async () => {
    setGuardando(true);
    try {
      // Pulsar dos veces escribía las conclusiones dos veces. La ficha solo
      // admite añadir, así que se lee lo que ya tiene y se añade únicamente lo
      // que aún no dice (mismo bloque, mismas conclusiones = mismo texto).
      const nuevos = hechosDeCierre({
        nombreBloque: nombreDeMeso(meso), inicio: cierre.inicio, fin: cierre.fin,
        at: new Date().toISOString(), conclusiones,
      });
      const actual = await getDossier(athlete.email);
      const porGuardar = hechosDeCierrePorGuardar(actual.hechos, nuevos);
      if (porGuardar.length === 0) {
        queryClient.setQueryData<AthleteDossier>(['dossier', athlete.email], actual);
        showToast('Estas conclusiones ya estaban en la ficha del atleta', 'success');
        return;
      }
      const ficha = await appendDossierFacts(athlete.email, porGuardar);
      queryClient.setQueryData<AthleteDossier>(['dossier', athlete.email], ficha);
      showToast('Conclusiones guardadas en la ficha del atleta', 'success');
    } catch (err) {
      console.error('CierreDeBloque: no se pudo guardar en la ficha', err);
      showToast('No se han podido guardar las conclusiones', 'error');
    } finally {
      setGuardando(false);
    }
  };

  // Un bloque sin veredictos que firmar (sin estrellas: el primero, uno de
  // mantenimiento) guarda solo su foto, con lo que ya tuviera firmado.
  const conVeredictos = !!hipotesis && (hipotesis.estrellas.length > 0 || (firmado?.veredictos.length ?? 0) > 0);
  const guardarFoto = hipotesis && !conVeredictos && hipotesis.dosis.length > 0
    ? () => void guardarVeredictos(cierreParaGuardar({
      veredictos: firmado?.veredictos ?? [], firmadoEn: new Date().toISOString(), ficha: hipotesis.ficha, dosis: hipotesis.dosis,
    }), 'Foto del bloque guardada', 'la foto del bloque')
    : undefined;

  const sinDatos = cierre.informe.sessions === 0;
  const res = cierre.progresion.resumen;
  const notasDeFuerza = [
    cierre.notaDeDatos,
    notaDePocasSemanas(res),
    notaDeSemanasFuera(cierre.progresion.semanas),
  ].filter((n): n is string => !!n);
  const adh = cierre.sesiones.adherenciaPct;
  const vol = cierre.volumen.pct;
  const r = evolucion.registro;

  return (
    <div className="space-y-5">
      {/* ── Cabecera ── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-caption text-ink-3 uppercase tracking-[.1em]">Cierre de bloque</p>
          <h2 className="font-sans font-bold text-title-m text-ink">
            {nombreDeMeso(meso)}{meso.objective ? ` · ${meso.objective}` : ''}
          </h2>
          <p className="font-mono text-caption text-ink-2">
            {cierre.inicio} → {cierre.fin} · {meso.weeks} semanas · {athlete.displayName}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={cierre.enCurso ? 'warning' : 'success'}>{cierre.enCurso ? 'En curso' : 'Terminado'}</Badge>
          {!presentando && bloques.length > 1 && (
            <div className="w-[220px]">
              <Select
                value={meso.id}
                onChange={onCambiarBloque}
                options={bloques.map(b => ({ value: b.id, label: finDeBloque(b) >= hoy ? `${nombreDeMeso(b)} (en curso)` : nombreDeMeso(b) }))}
                label="Bloque"
              />
            </div>
          )}
        </div>
      </div>

      {cierre.enCurso && (
        <div className="flex items-start gap-2 bg-warning/10 border border-warning/30 rounded-surface px-3 py-2.5">
          <Icon name="warning" size="s" className="text-warning flex-shrink-0 mt-px" />
          <p className="font-sans text-caption text-warning leading-relaxed">
            Este bloque aún no ha terminado ({cierre.fin}): el «al terminar» es lo registrado hasta hoy.
          </p>
        </div>
      )}

      {sinDatos ? (
        <div className="border border-dashed border-hairline rounded-surface">
          <EmptyState
            icon="bar_chart"
            title="Sin sesiones registradas en este bloque."
            description="El cierre se construye con lo que el atleta registra: entrenos, peso, comidas y cuestionarios."
          />
        </div>
      ) : (
        <>
          {/* ── 0. Hipótesis del bloque: qué pasó con cada una y el bloque siguiente ── */}
          {hipotesis && conVeredictos && (
            <VeredictosDeHipotesis
              key={`veredictos-${meso.id}`}
              meso={meso}
              calculo={hipotesis}
              firmado={firmado}
              ficha={hipotesis.ficha}
              duracionMediaMin={duracionMediaMin}
              mapa={mapa}
              enCurso={cierre.enCurso}
              guardando={firmando}
              onGuardar={guardarVeredictos}
              presentando={presentando}
            />
          )}
          {/* ── 0b. A qué responde (o, en un primer bloque, su punto de partida) ── */}
          {hipotesis && (
            <ARespondeA
              key={`responde-${meso.id}`}
              indicios={indicios}
              punto={punto}
              presentando={presentando}
              onGuardarFoto={guardarFoto}
              guardando={firmando}
              fotoGuardadaEn={!conVeredictos && firmado?.dosis?.length ? firmado.firmadoEn : null}
            />
          )}
          {!presentando && propuesto && (
            <CrearSiguienteBloque
              key={`siguiente-${meso.id}`}
              athleteEmail={athlete.email}
              meso={meso}
              propuesto={propuesto}
              sinFirmar={!firmado}
              sinCifras={!hipotesis?.estado}
              onFijarLimites={fijarLimitesArticulares}
            />
          )}

          {/* ── 1. Conclusiones ── */}
          <div className="grid gap-3 md:grid-cols-2">
            <Seccion titulo="Qué sacamos del bloque" icon="lightbulb">
              <ListaConclusiones items={conclusiones.hallazgos} vacio="Aún no hay datos suficientes para sacar conclusiones." />
            </Seccion>
            <Seccion titulo="Qué hacemos en el siguiente" icon="flag">
              <ListaConclusiones items={conclusiones.acciones} vacio="Nada que cambiar: seguir igual y progresar cargas." />
              {!presentando && (
                <div className="flex justify-end pt-1">
                  <Button size="s" variant="ghost" onClick={guardarEnFicha} disabled={guardando}>
                    <Icon name="bookmark_add" size="s" />
                    Guardar en la ficha
                  </Button>
                </div>
              )}
            </Seccion>
          </div>

          {/* ── 2. Las cifras ── */}
          <div className="flex flex-wrap gap-3">
            <Tile icon="trending_up" label="Fuerza" value={res.medianaPct != null ? `${conSigno(res.medianaPct)}%` : '—'}
              sub={res.comparables > 0 ? `mejora en ${res.mejoran} de ${res.comparables} ejercicios` : 'sin dos semanas para comparar'}
              color={colorDelta(res.medianaPct)} />
            <Tile icon="event_available" label="Adherencia" value={adh != null ? `${adh}%` : '—'}
              sub={cierre.sesiones.programadas > 0 ? `${cierre.sesiones.completadas}/${cierre.sesiones.programadas} sesiones` : `${cierre.sesiones.registradas} sesiones`}
              color={adh == null ? 'var(--color-ink-3)' : adh >= 85 ? 'var(--color-success)' : adh >= 65 ? 'var(--color-warning)' : 'var(--color-danger)'} />
            <Tile icon="fitness_center" label="Volumen hecho" value={vol != null ? `${vol}%` : '—'}
              sub={`${cierre.volumen.totalRealizadas} de ${cierre.volumen.totalProgramadas} series`}
              color={vol == null ? 'var(--color-ink-3)' : vol >= 90 ? 'var(--color-success)' : vol >= 70 ? 'var(--color-warning)' : 'var(--color-danger)'} />
            <Tile icon="monitor_weight" label="Peso" value={evolucion.peso ? `${conSigno(evolucion.peso.deltaKg)} kg` : '—'}
              sub={evolucion.peso ? `${fmt(evolucion.peso.inicio)} → ${fmt(evolucion.peso.final)} kg` : 'sin pesajes suficientes'} />
            <Tile icon="monitoring" label="Kg por semana" value={res.tonelajeSemanal?.deltaPct != null ? `${conSigno(res.tonelajeSemanal.deltaPct)}%` : '—'}
              sub={res.tonelajeSemanal ? `${fmt(Math.round(res.tonelajeSemanal.inicio), 0)} → ${fmt(Math.round(res.tonelajeSemanal.final), 0)} kg` : '—'}
              color={colorDelta(res.tonelajeSemanal?.deltaPct)} />
          </div>
          {/* Con qué dato se ha decidido la fuerza (D4c): sesiones sin marca,
              ejercicios que no cuentan y semanas que quedan fuera. Discreto, y
              solo para el coach: al presentárselo al atleta no sale. */}
          {!presentando && notasDeFuerza.length > 0 && (
            <p className="font-mono text-caption text-ink-3">{notasDeFuerza.join(' ')}</p>
          )}

          {/* ── 3. Al empezar vs al terminar ── */}
          <Seccion titulo="Al empezar vs al terminar" icon="swap_horiz">
            <TablaInicioFinal filas={filas} />
            <p className="font-mono text-caption text-ink-3">
              Nunca un dato suelto: el peso es la mediana de la primera y la última semana con pesajes; los cuestionarios, la media
              del primer y el último tercio de sus respuestas; la fuerza, la mediana de lo que sube cada ejercicio entre sus
              dos primeras y sus dos últimas semanas comparables (la marca de cada sesión es su mejor serie válida).
            </p>
          </Seccion>

          {/* ── 4. Rendimiento ── */}
          <SemanaASemana semanas={cierre.progresion.semanas} />
          <Podio ejercicios={cierre.progresion.ejercicios} />

          <Seccion titulo="Dónde ha mejorado" icon="accessibility_new">
            <SegmentedControl
              label="Detalle del rendimiento"
              value={vista}
              onChange={v => setVista(v as VistaDetalle)}
              options={[
                { value: 'grupos', label: 'Grupos' },
                { value: 'patrones', label: 'Patrones' },
                { value: 'ejercicios', label: 'Ejercicios' },
              ]}
            />
            {vista === 'grupos' && (
              <Agregado filas={cierre.progresion.porGrupo} vacio="Los ejercicios no tienen grupo muscular asignado." anterior={null} comparacion={cierre.comparacion} />
            )}
            {vista === 'patrones' && (
              <Agregado filas={cierre.progresion.porPatron} vacio="Ningún ejercicio cae en un patrón de movimiento." anterior={null} comparacion={cierre.comparacion} />
            )}
            {vista === 'ejercicios' && <ListaEjercicios ejercicios={cierre.progresion.ejercicios} sexo={sexo} pesoKg={pesoKg} />}
          </Seccion>

          {/* ── 5. Fotos del bloque ── */}
          {evolucion.fotos.length > 0 && (
            <Seccion titulo="Fotos del bloque" icon="photo_camera">
              <ComparadorFotos photos={evolucion.fotos} athleteEmail={athlete.email} bodyweightLogs={bodyweightLogs} />
            </Seccion>
          )}

          {/* ── 6. Lo que ha registrado ── */}
          <Seccion titulo="Lo que ha registrado" icon="edit_note">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { l: 'Sesiones', v: `${r.sesiones}`, s: `${fmt(r.sesiones / Math.max(1, r.diasDelBloque / 7))}/semana` },
                { l: 'Días con peso', v: `${r.diasConPesaje}`, s: `de ${r.diasDelBloque} días` },
                { l: 'Días con comida', v: `${r.diasDieta}`, s: `${Math.round((r.diasDieta / Math.max(1, r.diasDelBloque)) * 100)}% del bloque` },
                { l: 'Cuestionarios', v: `${r.cuestionarios}`, s: 'contestados' },
                { l: 'Notas al entrenar', v: `${r.notasDelAtleta}`, s: 'en sesiones y ejercicios' },
                { l: 'Fotos', v: `${r.fotos}`, s: 'días con fotos' },
                { l: 'Medidas', v: `${r.medidas}`, s: 'días medidos' },
              ].map(x => (
                <div key={x.l} className="rounded-control border border-hairline bg-bg px-3 py-2">
                  <span className="block font-mono text-caption text-ink-3 uppercase tracking-[.08em]">{x.l}</span>
                  <span className="block font-mono text-title-s font-semibold text-ink tabular-nums">{x.v}</span>
                  <span className="block font-mono text-caption text-ink-3">{x.s}</span>
                </div>
              ))}
            </div>
            {evolucion.voz && (
              <div className="rounded-control border border-hairline bg-bg px-3 py-2.5 space-y-1">
                <p className="font-mono text-caption text-ink-3 uppercase tracking-[.08em]">Lo que dice del bloque ({evolucion.voz.fecha})</p>
                <p className="font-sans text-label text-ink">
                  {[
                    evolucion.voz.valoracion != null ? `Valoración ${evolucion.voz.valoracion}/10` : null,
                    evolucion.voz.recuperacion != null ? `recuperación ${evolucion.voz.recuperacion}/10` : null,
                    evolucion.voz.exigencia != null ? `exigencia ${evolucion.voz.exigencia}/10` : null,
                  ].filter(Boolean).join(' · ')}
                </p>
                {evolucion.voz.priorizar.length > 0 && <p className="font-sans text-caption text-ink-2">Quiere priorizar: {evolucion.voz.priorizar.join(', ')}</p>}
                {evolucion.voz.demasiado.length > 0 && <p className="font-sans text-caption text-ink-2">Demasiado volumen en: {evolucion.voz.demasiado.join(', ')}</p>}
                {/* Lo que contesta con sus palabras: mantener o cambiar, objetivo, molestias, duración. */}
                {evolucion.voz.respuestas.map((r, i) => (
                  <p key={`${i}-${r.pregunta}`} className="font-sans text-caption text-ink-2">
                    <span className="font-bold text-ink">{r.pregunta}:</span> {r.respuesta}
                  </p>
                ))}
              </div>
            )}
          </Seccion>

          {/* ── 7. El mensaje ── */}
          {!presentando && (
            <Seccion
              titulo="Mensaje para el cliente"
              icon="chat"
              extra={(
                <div className="flex items-center gap-3">
                  {mensaje !== mensajeGenerado && (
                    <button onClick={() => setMensaje(mensajeGenerado)} className="font-sans text-caption font-bold text-ink-2 hover:text-ink transition-colors">
                      Restaurar
                    </button>
                  )}
                  <button onClick={() => copiar(mensaje, 'Mensaje')} className="flex items-center gap-1 font-sans text-caption font-bold text-accent-ink hover:text-ink transition-colors">
                    <Icon name="content_copy" size="s" />Copiar
                  </button>
                </div>
              )}
            >
              <textarea
                value={mensaje}
                onChange={e => setMensaje(e.target.value)}
                rows={Math.min(18, Math.max(6, mensaje.split('\n').length + 1))}
                aria-label="Mensaje para el cliente"
                className="w-full font-sans text-label text-ink leading-relaxed bg-bg border border-control-line rounded-control p-3 resize-y focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <p className="font-mono text-caption text-ink-3">Escrito con sus datos del bloque. Edítalo antes de copiarlo.</p>
            </Seccion>
          )}
        </>
      )}
    </div>
  );
}
