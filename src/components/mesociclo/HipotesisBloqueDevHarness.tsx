import { useMemo, useState } from 'react';
import { MUSCLE_LABELS, MUSCLE_ORDER, type Mesocycle, type MuscleGroup, type MuscleGroupConfig, type WorkoutExercise } from '../../types';
import type { ZonaIem } from '../../utils/cdg/zonas';
import type { EstadoDelBloque } from '../../utils/hipotesisDeBloque/estadoDelBloqueAnterior';
import { mapaDeRespuesta } from '../../utils/hipotesisDeBloque/mapaDeRespuesta';
import { sugerirSemana1Reducida } from '../../utils/hipotesisDeBloque/tiposDeBloque';
import { PRIORIDAD, avisoDeEstrellasDelMeso, propuestaDelMeso, siguientePrioridad } from '../../utils/hipotesisDelMeso';
import { planDeSemana1Reducida } from '../../utils/progression';
import { Chip, SegmentedControl } from '../ui';
import FichasDeHipotesis from './FichasDeHipotesis';
import Semana1Reducida from './Semana1Reducida';
import TipoDeBloqueSelector from './TipoDeBloqueSelector';
import { alCambiarSemana1, camposDeBloqueNuevo } from './hipotesisDelEditor';

/* ═══════════════════════════════════════════════════════════════════════════
   Banco de pruebas de las fichas «Hipótesis del bloque» (Mesociclo, coach) —
   ruta `/dev/hipotesis-bloque`, solo en desarrollo. Sin sesión de coach no hay
   registros ni catálogo del Índice de Hipertrofia, así que el estado del
   bloque anterior va escrito a mano: es el caso de la maqueta (pectoral 52 de
   media, acabó en 58; deltoides 38 y 40). Todo en memoria: nada se guarda.
   ═══════════════════════════════════════════════════════════════════════════ */

const HOY = '2026-11-17';
const SERIES: Partial<Record<MuscleGroup, number>> = {
  pecho: 15, dorsal: 14, deltoide_lat: 10, biceps: 4, triceps: 4, cuadriceps: 12, isquios: 8, gluteo: 6,
};
const SERIES_ANTES: Partial<Record<MuscleGroup, number>> = { ...SERIES, pecho: 14, biceps: 8, triceps: 8, gemelo: 6 };
const PRIORIDADES_DE_PARTIDA: Partial<Record<MuscleGroup, MuscleGroupConfig['priority']>> = {
  pecho: 'alta', deltoide_lat: 'alta', biceps: 'baja', triceps: 'baja', gemelo: 'ignorar',
};

const grupos = (series: Partial<Record<MuscleGroup, number>>, prioridades: Partial<Record<MuscleGroup, MuscleGroupConfig['priority']>> = {}) =>
  Object.fromEntries(MUSCLE_ORDER.map(g => [g, { series: series[g] ?? 0, priority: prioridades[g] ?? 'media' }])) as Record<MuscleGroup, MuscleGroupConfig>;

/** El bloque en curso, del que parte el nuevo: 12 semanas desde el 07-09. */
const ANTERIOR: Mesocycle = {
  id: 'h1', athleteId: 'dani@enforma.app', number: 3, name: 'Hipertrofia 1', weeks: 12, startDate: '2026-09-07',
  objective: 'Hipertrofia', daysPerWeek: 4, groups: grupos(SERIES_ANTES),
};
/** El mismo, ya con su cierre firmado: de ahí sale el mapa de respuesta. */
const ANTERIOR_FIRMADO: Mesocycle = {
  ...ANTERIOR, tipoBloque: 'desarrollo',
  hipotesis: { pectoral: { palanca: 'volumen', rmObjetivoPct: 5 }, deltoides: { palanca: 'volumen', rmObjetivoPct: 5 } },
  cierreDeHipotesis: {
    firmadoEn: '2026-11-16T10:00:00.000Z',
    veredictos: [
      { zona: 'pectoral', palanca: 'volumen', iemMedio: 52, iemMedioObjetivo: 50, procesoCumplido: true, rmPct: 6.2, rmObjetivoPct: 5, resultadoCumplido: true, lectura: 'confirmada' },
      { zona: 'deltoides', palanca: 'volumen', iemMedio: 38, iemMedioObjetivo: 37, procesoCumplido: true, rmPct: 1.1, rmObjetivoPct: 5, resultadoCumplido: false, lectura: 'no_responde' },
    ],
  },
};

const zona = (z: ZonaIem, iemMedio: number, iemFinal: number) => ({ zona: z, iemMedio, iemFinal, porSemana: [] });
const ESTADO: EstadoDelBloque = {
  mesocycleId: 'h1', semanas: [], semanasQueCuentan: 10, semanasSinEntrenar: 0,
  porZona: {
    pectoral: zona('pectoral', 52, 58), deltoides: zona('deltoides', 38, 40), dorsal: zona('dorsal', 47, 50),
    biceps: zona('biceps', 21, 22), triceps: zona('triceps', 24, 26), cuadriceps: zona('cuadriceps', 44, 46),
  },
};

const ej = (exerciseId: string, muscleGroup: MuscleGroup, sets: number): WorkoutExercise =>
  ({ exerciseId, muscleGroup, sets, order: 0, reps: '8-10', restSeconds: 120, rir: 2 });
/** Rutinas de mentira del bloque nuevo, para el recorte de la semana 1 y los nombres de la ficha. */
const RUTINAS: { exercises: WorkoutExercise[] }[] = [
  { exercises: [ej('Press inclinado', 'pecho', 4), ej('Fondos', 'pecho', 4), ej('Press militar', 'deltoide_lat', 3), ej('Remo', 'dorsal', 4), ej('Jalón', 'dorsal', 3)] },
  { exercises: [ej('Cruces', 'pecho', 4), ej('Press en máquina', 'pecho', 3), ej('Elevaciones laterales', 'deltoide_lat', 4), ej('Elevación en polea', 'deltoide_lat', 3), ej('Dominadas', 'dorsal', 4), ej('Remo en T', 'dorsal', 3)] },
];
const GRUPOS_DE_ZONA: Partial<Record<ZonaIem, MuscleGroup[]>> = { pectoral: ['pecho'], deltoides: ['deltoide_ant', 'deltoide_lat', 'deltoide_post'], dorsal: ['dorsal'] };

type Escenario = 'con' | 'firmado' | 'sin' | 'antiguo';
const ESCENARIOS: { value: Escenario; label: string }[] = [
  { value: 'con', label: 'Con bloque anterior' },
  { value: 'firmado', label: 'Anterior firmado' },
  { value: 'sin', label: 'Sin bloque anterior' },
  { value: 'antiguo', label: 'Bloque sin tipo' },
];

function partida(e: Escenario): { meso: Mesocycle; mesos: Mesocycle[]; anterior: Mesocycle | null } {
  const anterior = e === 'sin' ? null : e === 'firmado' ? ANTERIOR_FIRMADO : ANTERIOR;
  const mesos = anterior ? [anterior] : [];
  const base: Mesocycle = {
    id: 'h2', athleteId: 'dani@enforma.app', number: 4, name: 'Hipertrofia 2', daysPerWeek: 4,
    groups: grupos(SERIES, PRIORIDADES_DE_PARTIDA),
    ...(e === 'antiguo'
      ? { weeks: 10, startDate: '2026-11-30', objective: 'Hipertrofia tren superior' }
      : camposDeBloqueNuevo(mesos, HOY)),
  };
  return { meso: base, mesos, anterior };
}

export default function HipotesisBloqueDevHarness() {
  const [escenario, setEscenario] = useState<Escenario>('con');
  const [meso, setMeso] = useState<Mesocycle>(() => partida('con').meso);
  const { mesos, anterior } = useMemo(() => partida(escenario), [escenario]);
  const cambiarEscenario = (e: string) => { setEscenario(e as Escenario); setMeso(partida(e as Escenario).meso); };
  const cambiar = (cambios: Partial<Mesocycle>) => setMeso(m => ({ ...m, ...cambios }));

  const estado = anterior ? ESTADO : null;
  const propuesta = useMemo(() => propuestaDelMeso({ meso, anterior: estado, historial: mesos }), [meso, estado, mesos]);
  const mapa = useMemo(() => { const m = mapaDeRespuesta(mesos); return m.zonas.length ? m : null; }, [mesos]);
  const recorte = useMemo(() => planDeSemana1Reducida(RUTINAS, meso.groups), [meso.groups]);
  const sugerencia = sugerirSemana1Reducida({ ejerciciosNuevos: anterior ? 2 : 0 });
  const aviso = avisoDeEstrellasDelMeso(meso);

  return (
    <div className="min-h-screen bg-bg text-ink p-4 sm:p-8">
      <div className="max-w-5xl mx-auto space-y-4">
        <SegmentedControl label="Escenario" value={escenario} onChange={cambiarEscenario} options={ESCENARIOS} />

        <div className="bg-surface border border-hairline rounded-surface p-5 space-y-4">
          <h2 className="font-sans font-bold text-ink text-title-s">{meso.name} · {meso.weeks} semanas · empieza el {meso.startDate}</h2>
          <TipoDeBloqueSelector meso={meso} onCambiar={cambiar} />
          <Semana1Reducida
            activa={!!meso.semana1Reducida}
            motivo={sugerencia.motivo}
            recorte={Object.entries(recorte).map(([id, n]) => `${id} −${n}`)}
            onCambiar={activa => cambiar(alCambiarSemana1(meso, activa))}
          />
        </div>

        {(meso.tipoBloque || Object.keys(meso.hipotesis ?? {}).length > 0) && (
          <FichasDeHipotesis
            meso={meso}
            propuesta={propuesta}
            mesoAnterior={anterior}
            anterior={estado}
            motivoSinCifras={estado ? null : 'Es el primer bloque del atleta: no hay bloque anterior del que sacar las cifras de proceso.'}
            mapa={mapa}
            ejerciciosDeZona={z => [...new Set(RUTINAS.flatMap(r => r.exercises).filter(e => GRUPOS_DE_ZONA[z]?.includes(e.muscleGroup!)).map(e => e.exerciseId))]}
            minutosDeSesion={75}
            nivel="intermedio"
            nombreAtleta="Daniel"
            onCambiar={cambiar}
          />
        )}

        {/* La pestaña Volumen, en pequeño: pulsar un grupo rota su nivel. */}
        <div className="bg-surface border border-hairline rounded-surface p-5 space-y-2">
          <span className="block font-mono text-caption text-ink-2 uppercase">Prioridad por grupo (pulsa para rotar)</span>
          {aviso && <p className="font-sans text-caption text-warning">{aviso.texto}</p>}
          <div className="flex flex-wrap gap-1.5">
            {MUSCLE_ORDER.map(g => (
              <Chip key={g} selected={meso.groups[g].priority === 'alta'} onClick={() => {
                const priority = siguientePrioridad(meso.groups[g].priority);
                cambiar({ groups: { ...meso.groups, [g]: { series: priority === 'ignorar' ? 0 : meso.groups[g].series, priority } } });
              }}>
                {PRIORIDAD[meso.groups[g].priority].icono} {MUSCLE_LABELS[g]}
              </Chip>
            ))}
          </div>
        </div>

        <details className="rounded-surface border border-hairline bg-surface p-3">
          <summary className="font-mono text-caption text-ink-2 uppercase cursor-pointer">Lo que se guardaría en el mesociclo</summary>
          <pre data-testid="meso" className="font-mono text-caption text-ink-2 whitespace-pre-wrap">{JSON.stringify({
            tipoBloque: meso.tipoBloque, weeks: meso.weeks, startDate: meso.startDate, objective: meso.objective, phaseType: meso.phaseType,
            cdgVelocidad: meso.cdgVelocidad, semana1Reducida: meso.semana1Reducida,
            hipotesis: meso.hipotesis, cdgObjetivosIem: meso.cdgObjetivosIem, cdgModoPorZona: meso.cdgModoPorZona,
          }, null, 2)}</pre>
        </details>
      </div>
    </div>
  );
}
