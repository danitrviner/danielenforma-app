import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getNutritionProgram, getOnboarding, getWorkoutLogs } from '../../dbService';
import type { Exercise, ExperienceLevel, Mesocycle, NutritionProgram, WorkoutLog } from '../../types';
import { useMotorCdg } from '../../hooks/useMotorCdg';
import { iemSemanalPorZona } from '../../utils/cdg/iemSemanal';
import {
  estadoDelBloqueAnterior, iniciosDeSemanaDelBloque, type EstadoDelBloque,
} from '../../utils/hipotesisDeBloque/estadoDelBloqueAnterior';
import { bloqueEnDeficit } from '../../utils/hipotesisDeBloque/bloqueEnDeficit';
import { referenciaPropia, type ReferenciaPropia } from '../../utils/hipotesisDeBloque/referenciaPropia';
import { finDeBloque } from '../../utils/finDeBloque';
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

   23-11-2026 (referencia propia): un primer bloque ya no se queda sin cifras.
   En cuanto termina sus dos primeras semanas entrenadas, esas semanas hacen
   de «donde acabó el anterior» (`referenciaPropia.ts`). Vale también para las
   zonas que el bloque anterior no entrenó.

   La sugerencia de «semana 1 reducida» cuenta los ejercicios nuevos con la
   misma norma que les pone la entrada de repeticiones (`rampaDeEjercicioNuevo`:
   nunca hechos, o no en más de 8 semanas antes del inicio del bloque). Hasta
   el 17-11-2026 se comparaba con las rutinas del bloque anterior, y un
   ejercicio que el atleta llevaba un año haciendo salía como nuevo solo por
   no estar en el último bloque. Sin registros cargados todavía, ninguno.

   Dos datos más cambian lo que se propone por defecto (auditoría de cifras,
   17-11-2026): el NIVEL del atleta (a un principiante se le pide un 8 % de RM)
   y si el bloque cae mayoritariamente en una fase de DÉFICIT de su
   periodización nutricional (se pide no perder y el techo no sube). Los dos se
   leen con las claves de caché que ya usa su ficha (`onboarding` y
   `nutritionProgram`), así que casi nunca cuestan una lectura; quien monta la
   pantalla puede pasarlos ya cargados. Es una sugerencia: la periodización
   nutricional no toca el entreno, y el coach edita la ficha como quiera.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface HipotesisDelBloque {
  cargando: boolean;
  /** El bloque del que se parte (`null` si este es el primero). */
  mesoAnterior: Mesocycle | null;
  /** Cómo acabó, por zona. `null` sin bloque anterior o sin poder calcularlo. */
  anterior: EstadoDelBloque | null;
  /** Por qué no hay cifras de proceso, en una frase; `null` si las hay. */
  motivoSinCifras: string | null;
  /** Cómo va ESTE bloque hasta hoy, por zona (sin la semana en curso). `null` si no ha empezado, sin registros o sin catálogo. */
  enCurso: EstadoDelBloque | null;
  /** Sus dos primeras semanas entrenadas: la referencia de las zonas sin bloque anterior (`referenciaPropia.ts`). `null` hasta que las termine. */
  referencia: ReferenciaPropia | null;
  /** Lo que propone el motor para las estrellas de este bloque. */
  propuesta: PropuestaDeHipotesis;
  /** Qué le funciona a cada zona, de los cierres firmados anteriores. `null` sin ninguno. */
  mapa: MapaDeRespuesta | null;
  /** ¿Conviene la semana 1 reducida? (ejercicios nuevos o parón de más de 3 semanas). */
  sugerenciaSemana1: ReturnType<typeof sugerirSemana1Reducida>;
  /** El bloque cae mayoritariamente en una fase de déficit de la periodización nutricional. */
  enDeficit: boolean;
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
  /** Nivel del atleta, si quien monta la pantalla ya lo tiene; si no, se lee del alta. */
  nivel?: ExperienceLevel;
  /** Periodización nutricional ya cargada (`null` = no tiene); sin pasarla, se pide aquí. */
  programaNutricion?: NutritionProgram | null;
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
  // Nivel y periodización nutricional: mismas claves que el resto de la ficha
  // del cliente. Si fallan o aún no han llegado, la propuesta sale con los
  // valores de siempre (5 % y techo con escalón): no bloquean la pantalla.
  const alta = useQuery({
    queryKey: ['onboarding', athleteEmail],
    queryFn: () => getOnboarding(athleteEmail!),
    enabled: activo && o.nivel === undefined && !!athleteEmail,
  });
  const nivel = o.nivel ?? alta.data?.experienceLevel;
  const nutricion = useQuery({
    queryKey: ['nutritionProgram', athleteEmail],
    queryFn: () => getNutritionProgram(athleteEmail!),
    enabled: activo && o.programaNutricion === undefined && !!athleteEmail,
  });
  const programa = o.programaNutricion !== undefined ? o.programaNutricion : nutricion.data ?? null;
  const enDeficit = useMemo(
    () => !!meso && activo && bloqueEnDeficit(programa, meso.startDate, finDeBloque(meso)),
    [meso, activo, programa],
  );
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

  // Este mismo bloque hasta hoy: de sus dos primeras semanas sale la
  // referencia de las zonas que el bloque anterior no tiene (todas, en un
  // primer bloque) y, de las siguientes, la media que lleva (23-11-2026).
  const mesoId = meso?.id;
  const inicio = meso?.startDate;
  const enCurso = useMemo(() => {
    if (!activo || !motor || !meso || !mesoId || !inicio || !logs) return null;
    const hoy = hoyIsoLocal();
    if (inicio > hoy) return null;
    const fin = finDeBloque(meso);
    const porId = new Map(exercises.map(e => [e.id, e]));
    const suyos = logs.filter(l => l.date <= fin && (l.mesocycleId ? l.mesocycleId === mesoId : l.date >= inicio));
    const hasta = hoy <= fin ? hoy : undefined;
    const iem = iemSemanalPorZona(motor, suyos, id => porId.get(id)?.cdgNombre, iniciosDeSemanaDelBloque(meso, hasta ?? fin), hasta);
    return estadoDelBloqueAnterior({ iem, meso });
    // Solo las piezas del bloque que mueven el cálculo: `meso` cambia de identidad con cada tecla del editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo, motor, mesoId, inicio, meso?.weeks, meso?.daysPerWeek, meso?.cycleDays, meso?.semanasDescarga, meso?.semanasPivot, meso?.semanasTest, meso?.vuelveDeParon, logs, exercises]);
  const referencia = useMemo(() => referenciaPropia(enCurso), [enCurso]);

  const anteriores = useMemo(
    () => (meso ? mesocycles.filter(m => m.id !== meso.id && m.startDate <= meso.startDate) : []),
    [meso, mesocycles],
  );

  const propuesta = useMemo<PropuestaDeHipotesis>(() => {
    if (!meso) return { hipotesis: {}, cdgObjetivosIem: {}, cdgModoPorZona: {} as PropuestaDeHipotesis['cdgModoPorZona'], iemDelResto: {}, porQue: {}, notas: {}, enDeficit: false, avisos: [] };
    return propuestaDelMeso({ meso, anterior, referenciaPropia: referencia, historial: anteriores, nivel, enDeficit });
  }, [meso, anterior, referencia, anteriores, nivel, enDeficit]);

  const mapa = useMemo(() => {
    const m = mapaDeRespuesta(anteriores);
    return m.zonas.length > 0 ? m : null;
  }, [anteriores]);

  const sugerenciaSemana1 = useMemo(() => sugerirSemana1Reducida({
    ejerciciosNuevos: meso && logs ? ejerciciosNuevosDelBloque(o.ejerciciosDelBloque ?? [], logs, meso.startDate).length : 0,
    diasDeParon: meso && logs ? diasDeParon(logs, meso.startDate) : null,
  }), [o.ejerciciosDelBloque, meso, logs]);

  const motivoSinCifras = anterior || referencia ? null
    : !mesoAnterior ? 'Es el primer bloque del atleta: las cifras de proceso saldrán de sus dos primeras semanas entrenadas, cuando las termine.'
    : cargando ? null
    : noSubido || !motor ? 'Sin el catálogo del Índice de Hipertrofia no se puede calcular el estímulo del bloque anterior.'
    : 'El bloque anterior no tiene registros con ejercicios vinculados al catálogo: sin ellos no hay cifras de proceso.';

  return { cargando, mesoAnterior, anterior, motivoSinCifras, enCurso, referencia, propuesta, mapa, sugerenciaSemana1, enDeficit };
}
