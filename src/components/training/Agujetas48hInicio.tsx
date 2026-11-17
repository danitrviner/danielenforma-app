import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Workout, WorkoutLog } from '../../types';
import { getExercises, getWorkoutLogs, updateWorkoutLog } from '../../dbService';
import { agujetasContestadas, enPausaTrasAhoraNo, sesionParaAgujetas48h, VENTANA_AGUJETAS_48H } from '../../utils/agujetas48h';
import { addDays, hoyIsoLocal } from '../../utils/trainingWeek';
import Agujetas48h, { type RespuestaAgujetas48h, type VarianteAgujetas48h } from './Agujetas48h';

/* ═══════════════════════════════════════════════════════════════════════════
   Agujetas a las 48 h en el Inicio del atleta (D7, 17-11-2026)

   Decide SI hay que preguntar y guarda la respuesta; lo que se ve es
   `Agujetas48h`. Si no toca (ninguna sesión terminada hace 36-72 h sin
   contestar), no pinta nada.

   Lecturas: Inicio no carga el historial de entrenos a propósito (ver
   `useRetoDeLaSemana`), así que aquí se piden solo los registros de los
   últimos días, con ventana y clave propia: tres o cuatro documentos. El
   catálogo de ejercicios (copia local del dispositivo) solo se pide si hay
   alguna sesión por la que preguntar.

   «Ahora no» se recuerda en el dispositivo unas horas (`enPausaTrasAhoraNo`):
   la tarjeta se calla y vuelve a salir mientras la sesión siga en la ventana.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  athleteEmail: string;
  /** Las rutinas del atleta que Inicio ya tiene cargadas: dan el nombre de la sesión y el grupo de cada ejercicio. */
  workouts: Workout[];
  variante?: VarianteAgujetas48h;
  /** Hay otra ventana delante (consentimiento, novedades): la variante `hoja` espera su turno. */
  enEspera?: boolean;
  /** Dónde se guarda la respuesta. Por defecto, en el registro de la sesión; el banco de pruebas pone uno de mentira. */
  guardarEn?: (logId: string, respuesta: RespuestaAgujetas48h) => Promise<void>;
}

/** Cada cuánto se vuelve a mirar el reloj con la pantalla abierta. */
const REFRESCO_MS = 5 * 60_000;
const HORA_MS = 3_600_000;
/** Prefijo de lo que «Ahora no» deja apuntado en el dispositivo (una clave por sesión). */
export const PREFIJO_AHORA_NO = 'agujetas48h:ahoraNo:';
const claveAhoraNo = (logId: string) => `${PREFIJO_AHORA_NO}${logId}`;

/** Desde qué día se piden los registros: las 72 h de la ventana y un día de margen
 *  (`date` es el día local de la sesión, no el instante en que terminó). */
export const desdeDeAgujetas48h = (hoy: string = hoyIsoLocal()) => addDays(hoy, -(Math.ceil(VENTANA_AGUJETAS_48H.hastaHoras / 24) + 1));
/** Clave de caché de esa lectura con ventana. Empieza como las demás de `workoutLogs` del atleta. */
export const claveLogsAgujetas48h = (athleteEmail: string, desde: string = desdeDeAgujetas48h()) =>
  ['workoutLogs', athleteEmail, 'agujetas48h', desde] as const;

function leerAhoraNo(logId: string): string | null {
  try { return localStorage.getItem(claveAhoraNo(logId)); } catch { return null; }
}
function guardarAhoraNo(logId: string, instante: string) {
  try { localStorage.setItem(claveAhoraNo(logId), instante); } catch { /* sin almacenamiento, vale para esta visita */ }
}

/** «Ahora», que avanza solo cada pocos minutos y al volver a la app; `poner` lo adelanta a mano. */
function useAhora(): [number, (instante: number) => void] {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const poner = () => setAhora(Date.now());
    const alVolver = () => { if (document.visibilityState === 'visible') poner(); };
    const id = setInterval(poner, REFRESCO_MS);
    document.addEventListener('visibilitychange', alVolver);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', alVolver); };
  }, []);
  return [ahora, setAhora];
}

export default function Agujetas48hInicio({ athleteEmail, workouts, variante = 'tarjeta', enEspera = false, guardarEn = updateWorkoutLog }: Props) {
  const qc = useQueryClient();
  const [ahora, ponerAhora] = useAhora();
  const desde = desdeDeAgujetas48h();
  const { data: logs = [] } = useQuery({
    queryKey: claveLogsAgujetas48h(athleteEmail, desde),
    queryFn: () => getWorkoutLogs(athleteEmail, { desde, limite: 12 }),
    enabled: !!athleteEmail,
  });

  // ¿Hay alguna sesión en la ventana sin contestar? Solo entonces hace falta el catálogo.
  const hayCandidata = useMemo(() => logs.some(l => {
    const horas = (ahora - Date.parse(l.completedAt)) / HORA_MS;
    return horas >= VENTANA_AGUJETAS_48H.desdeHoras && horas <= VENTANA_AGUJETAS_48H.hastaHoras && !agujetasContestadas(l);
  }), [logs, ahora]);
  const { data: exercises = [] } = useQuery({ queryKey: ['exercises'], queryFn: getExercises, enabled: hayCandidata });

  const pregunta = useMemo(
    () => (hayCandidata && exercises.length > 0 ? sesionParaAgujetas48h({ logs, workouts, exercises, ahora }) : null),
    [hayCandidata, logs, workouts, exercises, ahora],
  );

  // El «ahora no» de esta sesión: el guardado en el dispositivo o el de esta visita.
  const [descartadas, setDescartadas] = useState<Record<string, string>>({});
  const descartadaEn = pregunta ? (descartadas[pregunta.logId] ?? leerAhoraNo(pregunta.logId)) : null;

  const logId = pregunta?.logId;
  const guardar = useCallback(async (respuesta: RespuestaAgujetas48h) => {
    if (!logId) return;
    await guardarEn(logId, respuesta);
  }, [logId, guardarEn]);
  // Tras el «apuntado»: la respuesta entra en todas las listas de registros de
  // este atleta que haya en memoria, y la tarjeta desaparece (o pasa a la siguiente sesión).
  const alGuardar = useCallback((respuesta: RespuestaAgujetas48h) => {
    if (!logId) return;
    qc.setQueriesData<WorkoutLog[]>({ queryKey: ['workoutLogs', athleteEmail] }, prev =>
      (Array.isArray(prev) ? prev.map(l => (l.id === logId ? { ...l, ...respuesta } : l)) : prev));
  }, [qc, athleteEmail, logId]);

  const ultima = useRef<RespuestaAgujetas48h | null>(null);

  if (!pregunta || enPausaTrasAhoraNo(descartadaEn, ahora)) return null;
  return (
    <Agujetas48h
      key={pregunta.logId}
      pregunta={pregunta}
      variante={variante}
      enEspera={enEspera}
      onGuardar={async (respuesta) => { await guardar(respuesta); ultima.current = respuesta; }}
      onGuardado={() => { if (ultima.current) alGuardar(ultima.current); }}
      onAhoraNo={() => {
        // El reloj de la pantalla se adelanta al instante del toque: si no, la pausa «empezaría en el futuro».
        const toque = Date.now();
        const instante = new Date(toque).toISOString();
        guardarAhoraNo(pregunta.logId, instante);
        setDescartadas(d => ({ ...d, [pregunta.logId]: instante }));
        ponerAhora(toque);
      }}
    />
  );
}
