import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getWorkoutLogs } from '../../dbService';
import type { Exercise, Mesocycle, WorkoutLog } from '../../types';
import { useMotorCdg } from '../../hooks/useMotorCdg';
import { iemSemanalPorZona } from '../../utils/cdg/iemSemanal';
import {
  estadoDelBloqueAnterior, iniciosDeSemanaDelBloque, type EstadoDelBloque,
} from '../../utils/hipotesisDeBloque/estadoDelBloqueAnterior';
import { mapaDeRespuesta, type MapaDeRespuesta } from '../../utils/hipotesisDeBloque/mapaDeRespuesta';
import type { PropuestaDeHipotesis } from '../../utils/hipotesisDeBloque/proponerHipotesis';
import { sugerirSemana1Reducida } from '../../utils/hipotesisDeBloque/tiposDeBloque';
import { diasDeParon, mesoAnteriorA, propuestaDelMeso } from '../../utils/hipotesisDelMeso';
import { ejerciciosNuevosDelBloque } from '../../utils/rampaDeEjercicioNuevo';
import { hoyIsoLocal } from '../../utils/trainingWeek';

/* ═══════════════════════════════════════════════════════════════════════════
   De dónde salen las fichas de hipótesis del bloque (17-11-2026)

   Junta lo que el motor necesita para proponer, igual que lo junta el
   Seguimiento: los registros del atleta (misma clave de caché `workoutLogs`
   que el resto de la ficha: si ya están cargados no cuesta una lectura) y el
   motor CDG, que convierte esos registros en IEM por zona y semana
   (`iemSemanalPorZona` con las semanas del bloque ANTERIOR). De ahí, cómo
   acabó ese bloque (`estadoDelBloqueAnterior`) y la propuesta para este.

   Sin bloque anterior, sin registros o sin catálogo CDG no hay cifras de
   proceso: `motivoSinCifras` dice cuál de las tres, para que la ficha lo diga.

   La sugerencia de «semana 1 reducida» cuenta los ejercicios nuevos con la
   misma norma que les pone la entrada de repeticiones (`rampaDeEjercicioNuevo`:
   nunca hechos, o no en más de 8 semanas antes del inicio del bloque). Hasta
   el 17-11-2026 se comparaba con las rutinas del bloque anterior, y un
   ejercicio que el atleta llevaba un año haciendo salía como nuevo solo por
   no estar en el último bloque. Sin registros cargados todavía, ninguno.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface HipotesisDelBloque {
  cargando: boolean;
  /** El bloque del que se parte (`null` si este es el primero). */
  mesoAnterior: Mesocycle | null;
  /** Cómo acabó, por zona. `null` sin bloque anterior o sin poder calcularlo. */
  anterior: EstadoDelBloque | null;
  /** Por qué no hay cifras de proceso, en una frase; `null` si las hay. */
  motivoSinCifras: string | null;
  /** Lo que propone el motor para las estrellas de este bloque. */
  propuesta: PropuestaDeHipotesis;
  /** Qué le funciona a cada zona, de los cierres firmados anteriores. `null` sin ninguno. */
  mapa: MapaDeRespuesta | null;
  /** ¿Conviene la semana 1 reducida? (ejercicios nuevos o parón de más de 3 semanas). */
  sugerenciaSemana1: ReturnType<typeof sugerirSemana1Reducida>;
}

export function useHipotesisDelBloque(o: {
  meso: Mesocycle | null;
  mesocycles: readonly Mesocycle[];
  athleteEmail?: string;
  exercises: readonly Exercise[];
  /** Registros ya cargados por quien monta la pantalla; si no, se piden aquí. */
  logs?: WorkoutLog[];
  /** Ejercicios de las rutinas de este bloque (para «ejercicios nuevos»). */
  ejerciciosDelBloque?: readonly string[];
  /** Apagado en plantillas y en bloques sin tipo: no se pide nada. */
  activo?: boolean;
}): HipotesisDelBloque {
  const { meso, mesocycles, athleteEmail, exercises } = o;
  const activo = o.activo !== false && !!meso;
  const { motor, cargando: cargandoMotor, noSubido } = useMotorCdg();
  const pedirLogs = activo && !o.logs && !!athleteEmail;
  const registros = useQuery({
    queryKey: ['workoutLogs', athleteEmail],
    queryFn: () => getWorkoutLogs(athleteEmail!),
    enabled: pedirLogs,
  });
  const logs = o.logs ?? registros.data;
  const cargando = activo && ((pedirLogs && registros.isPending) || cargandoMotor);

  const mesoAnterior = useMemo(
    () => (meso ? mesoAnteriorA(meso, mesocycles as Mesocycle[]) : null),
    [meso, mesocycles],
  );

  const anterior = useMemo(() => {
    if (!activo || !motor || !mesoAnterior || !logs) return null;
    const hoy = hoyIsoLocal();
    const porId = new Map(exercises.map(e => [e.id, e]));
    // Solo lo entrenado EN ese bloque: un registro suelto de otro bloque que
    // caiga en sus fechas no es estímulo suyo.
    const suyos = logs.filter(l => (l.mesocycleId ? l.mesocycleId === mesoAnterior.id : l.date >= mesoAnterior.startDate));
    const iem = iemSemanalPorZona(motor, suyos, id => porId.get(id)?.cdgNombre, iniciosDeSemanaDelBloque(mesoAnterior, hoy), hoy);
    const estado = estadoDelBloqueAnterior({ iem, meso: mesoAnterior });
    return Object.keys(estado.porZona).length > 0 ? estado : null;
  }, [activo, motor, mesoAnterior, logs, exercises]);

  const anteriores = useMemo(
    () => (meso ? mesocycles.filter(m => m.id !== meso.id && m.startDate <= meso.startDate) : []),
    [meso, mesocycles],
  );

  const propuesta = useMemo<PropuestaDeHipotesis>(() => {
    if (!meso) return { hipotesis: {}, cdgObjetivosIem: {}, cdgModoPorZona: {} as PropuestaDeHipotesis['cdgModoPorZona'], iemDelResto: {}, porQue: {}, avisos: [] };
    return propuestaDelMeso({ meso, anterior, historial: anteriores });
  }, [meso, anterior, anteriores]);

  const mapa = useMemo(() => {
    const m = mapaDeRespuesta(anteriores);
    return m.zonas.length > 0 ? m : null;
  }, [anteriores]);

  const sugerenciaSemana1 = useMemo(() => sugerirSemana1Reducida({
    ejerciciosNuevos: meso && logs ? ejerciciosNuevosDelBloque(o.ejerciciosDelBloque ?? [], logs, meso.startDate).length : 0,
    diasDeParon: meso && logs ? diasDeParon(logs, meso.startDate) : null,
  }), [o.ejerciciosDelBloque, meso, logs]);

  const motivoSinCifras = anterior ? null
    : !mesoAnterior ? 'Es el primer bloque del atleta: no hay bloque anterior del que sacar las cifras de proceso.'
    : cargando ? null
    : noSubido || !motor ? 'Sin el catálogo del Índice de Hipertrofia no se puede calcular el estímulo del bloque anterior.'
    : 'El bloque anterior no tiene registros con ejercicios vinculados al catálogo: sin ellos no hay cifras de proceso.';

  return { cargando, mesoAnterior, anterior, motivoSinCifras, propuesta, mapa, sugerenciaSemana1 };
}
