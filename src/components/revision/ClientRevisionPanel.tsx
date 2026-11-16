import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  UserProfile, WorkoutLog, Exercise, Mesocycle, ProgressPhoto, BodyweightLog,
  WeightCheckIn, Questionnaire, QuestionnaireResponse, WorkoutAssignment,
} from '../../types';
import { Sexo } from '../../utils/athleteProfileSignals';
import { getVolumeLandmarks } from '../../db/coachSettings';
import {
  getDietCompletionLogsForAthlete, getDietsForAthlete, getCardioSessionsForAthlete,
  getNutritionProgram,
} from '../../dbService';
import {
  buildRevisionCoach, PeriodoRevision, mesoActivo, pesoVsSemanaPasada, fechaDeLaUltimaRevision,
} from '../../utils/revisionCoach';
import { computeActivePhase } from '../../utils/fasesNutricion';
import { construirComidaDeLaSemana } from '../../utils/comidaDeLaSemana';
import { construirCardioDeLaVentana } from '../../utils/cardioDeLaVentana';
import { hoyIsoLocal } from '../../utils/trainingWeek';
import { useModoPresentacion } from '../../hooks/useModoPresentacion';
import { HubTab } from '../ClientHub';
import RevisionCabecera from './RevisionCabecera';
import MensajesCoachPanel, { type CierrePorFirmar } from './MensajesCoachPanel';
import { buildCierreMesociclo } from '../../utils/cierreMesociclo';
import { bloqueCerradoRecientemente, idDeCierre, textoCierre } from '../../utils/cierreParaAtleta';
import DiaRevisionAtleta from './DiaRevisionAtleta';
import BodyweightPanel from '../BodyweightPanel';
import SelectorPeriodoRevision from './SelectorPeriodoRevision';
import BloquePatrones from './BloquePatrones';
import BloqueMejoresEjercicios from './BloqueMejoresEjercicios';
import BloqueEstimuloSemanal from './BloqueEstimuloSemanal';
import { semanasDeLaRevision } from '../../utils/cdg/iemSemanal';
import BloqueCuerpo from './BloqueCuerpo';
import BloqueCardio from './BloqueCardio';
import BloqueBienestar from './BloqueBienestar';
import BloqueQueHaComido from './BloqueQueHaComido';
import BloqueNutricionHabitos from './BloqueNutricionHabitos';
import BloqueRecibido from './BloqueRecibido';
import BloqueRetosNivel from './BloqueRetosNivel';
import BloqueCierre from './BloqueCierre';
import BloqueCambios from './BloqueCambios';
import CierreDeBloque from './CierreDeBloque';
import { addDays } from '../../utils/trainingWeek';
import { nombreDeMeso } from '../../utils/nombresMeso';
import LineaDeTiempoAsistente from '../autopiloto/LineaDeTiempoAsistente';
import { Card, Button, Icon, SegmentedControl } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   REVISIÓN — la pantalla de un vistazo.

   Qué problema resuelve: para contarle a un atleta cómo va, Dani tenía que
   recorrer cinco pestañas (Revisiones, Cuerpo, Dietas › info, Análisis ›
   Reportes, Correlaciones) y ninguna contestaba a lo que quería contar. Esto
   junta lo que ya se calculaba en sitios distintos, en el orden en el que se
   narra: ¿ha entrenado? → ¿está más fuerte, y en qué? → ¿le estoy dando
   volumen a lo que toca? → ¿cómo va el cuerpo? → ¿qué me ha mandado?

   Se graba en vídeo, y eso manda en el diseño:
     · Scroll continuo, sin hojas ni modales que tapen (el detalle de un patrón
       se despliega en línea).
     · «Desplegar todo» para poder hacer una pasada de arriba abajo sin clicar.
     · Modo presentación (tecla P): fuera los controles que el atleta no puede
       pulsar, y todo un punto más grande para que se lea en un vídeo
       comprimido visto en un móvil.
     · Nada de ventanas que el coach tenga que configurar dos veces: el periodo
       se elige una vez arriba y manda sobre todos los bloques.

   Desde el 16-09 ya no se suma: absorbe. La zona «Análisis» del Hub desaparece
   y su contenido vive aquí — los titulares de progreso y el explorador de
   series dentro del bloque del cuerpo, la adherencia/pasos/macros/alertas como
   bloque propio. Solo Reportes sigue siendo pestaña, porque Revisión es MIRAR y
   Reportes es ENVIAR.

   Sobre las consultas: el panel solo se monta cuando la pestaña está activa, así
   que montarse ES el `enabled` — el mismo patrón que ClientSetupPanel. Lo caro
   (logs, ejercicios, mesociclos) llega por props porque ClientHub ya lo tiene.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  athlete: UserProfile;
  logs: WorkoutLog[];
  exercises: Exercise[];
  mesocycles: Mesocycle[];
  photos: ProgressPhoto[];
  bodyweightLogs: BodyweightLog[];
  /** Sexo biológico de la anamnesis — lo necesita el %grasa US Navy. */
  sexo: Sexo | null;
  checkins: WeightCheckIn[];
  questionnaires: Questionnaire[];
  responses: QuestionnaireResponse[];
  /** Asignaciones de entreno — las necesita la serie de adherencia semanal. */
  assignments: WorkoutAssignment[];
  onGoToTab: (tab: HubTab) => void;
}

/**
 * Cada bloque de la pantalla es una tarjeta del DS, no una sección suelta.
 *
 * El número NO se escribe: lo pone `<Secciones>` contando las que se han
 * pintado de verdad. Escribirlo a mano obligaba a renumerar todo el fichero
 * cada vez que se añadía un bloque en medio, y con bloques condicionales
 * —el cardio solo sale si hay cardio— directamente no había número correcto
 * que escribir.
 */
function Seccion({ n, titulo, children, accion, presentando = false }: {
  n?: number; titulo: string; children: React.ReactNode; accion?: React.ReactNode;
  /** En presentación se cae la acción: es un botón que el atleta no puede pulsar. */
  presentando?: boolean;
}) {
  return (
    <Card
      title={n != null ? `${n}. ${titulo}` : titulo}
      action={presentando ? undefined : accion}
      className="space-y-3"
    >
      {children}
    </Card>
  );
}

/** Numera en orden las `<Seccion>` que existan, saltándose las que no se
 *  pintan, y les pasa `presentando`: antes iba a mano en las once, y cada
 *  bloque nuevo tenía que acordarse o su botón se colaba en el modo
 *  presentación. */
function Secciones({ children, presentando }: { children: React.ReactNode; presentando: boolean }) {
  let n = 0;
  return (
    <>
      {React.Children.map(children, hijo => {
        if (!React.isValidElement(hijo)) return hijo;
        n += 1;
        return React.cloneElement(hijo as React.ReactElement<{ n?: number; presentando?: boolean }>, { n, presentando });
      })}
    </>
  );
}

export default function ClientRevisionPanel({
  athlete, logs, exercises, mesocycles,
  photos, bodyweightLogs, sexo, checkins, questionnaires, responses, assignments, onGoToTab,
}: Props) {
  const hoy = hoyIsoLocal();

  // Arranca en el bloque en curso si lo hay: es la ventana que Dani mira el
  // 90 % de las veces. Sin mesociclos, los últimos 7 días.
  const [periodo, setPeriodo] = useState<PeriodoRevision>(() => {
    const activo = mesoActivo(mesocycles, hoy);
    return activo ? { tipo: 'meso', mesoId: activo.id } : { tipo: '7d' };
  });
  const [todoAbierto, setTodoAbierto] = useState(false);
  const { presentando, alternar: alternarPresentacion } = useModoPresentacion();

  // ── Cierre de bloque (16-11-2026) ─────────────────────────────────────────
  // La revisión semanal y el cierre de un mesociclo son dos conversaciones
  // distintas: la primera mira una semana, la segunda el bloque entero del
  // principio al final. Viven en la misma pestaña, separadas por un selector.
  const bloquesConCierre = useMemo(
    () => mesocycles.filter(m => !!m.startDate && m.startDate <= hoy).sort((a, b) => b.number - a.number),
    [mesocycles, hoy],
  );
  const recienCerrado = useMemo(() => bloqueCerradoRecientemente(mesocycles, hoy), [mesocycles, hoy]);
  const [modo, setModo] = useState<'semanal' | 'cierre'>('semanal');
  const [mesoCierreId, setMesoCierreId] = useState<string | null>(null);
  const mesoCierre = useMemo(() => {
    const elegido = bloquesConCierre.find(m => m.id === mesoCierreId);
    if (elegido) return elegido;
    if (recienCerrado) return recienCerrado;
    // Sin bloque recién cerrado: el último terminado y, si no hay, el que está en curso.
    return bloquesConCierre.find(m => addDays(m.startDate, m.weeks * 7 - 1) < hoy) ?? bloquesConCierre[0] ?? null;
  }, [bloquesConCierre, mesoCierreId, recienCerrado, hoy]);

  // Clave compartida con MesocycleManager y el panel del asistente: un documento, y
  // casi siempre ya en caché.
  const { data: landmarks } = useQuery({
    queryKey: ['coachVolumeLandmarks'],
    queryFn: getVolumeLandmarks,
  });

  // El cierre del bloque que acabó hace poco, como borrador para firmar
  // (tanda 8): las cifras del motor de cierre y sus frases para el cliente.
  const cierrePorFirmar = useMemo<CierrePorFirmar | null>(() => {
    const meso = bloqueCerradoRecientemente(mesocycles, hoy);
    if (!meso) return null;
    const c = buildCierreMesociclo({ meso, mesocycles, logs, assignments, exercises, athleteName: athlete.displayName, hoy });
    return { id: idDeCierre(meso.id), texto: textoCierre(c, meso.name), fecha: hoy, mesoNombre: meso.name || `#${c.numero}` };
  }, [mesocycles, logs, assignments, exercises, athlete.displayName, hoy]);

  const revision = useMemo(
    () => buildRevisionCoach({
      logs, exercises, mesocycles, periodo, landmarks, hoy, responses, questionnaires, checkins,
    }),
    [logs, exercises, mesocycles, periodo, landmarks, hoy, responses, questionnaires, checkins],
  );
  const ultimaRevision = useMemo(() => fechaDeLaUltimaRevision(checkins), [checkins]);

  const { ventana, informe } = revision;
  // Semanas del bloque «Estímulo por semana»: las del bloque si se está mirando
  // un mesociclo; si no, las seis últimas.
  const semanasIem = useMemo(() => {
    const mesoMirado = periodo.tipo === 'meso' ? mesocycles.find(m => m.id === periodo.mesoId) : null;
    const hasta = ventana.hasta < hoy ? ventana.hasta : hoy;
    return semanasDeLaRevision({ hasta, inicioBloque: mesoMirado?.startDate ?? null });
  }, [periodo, mesocycles, ventana.hasta, hoy]);
  const peso = useMemo(
    () => pesoVsSemanaPasada(bodyweightLogs, ventana.desde, ventana.hasta),
    [bodyweightLogs, ventana.desde, ventana.hasta],
  );

  // Fase de nutrición vigente — mismo motor que BloqueNutricionHabitos, aparte
  // porque la cabecera se pinta antes de llegar a ese bloque y necesita saber
  // ya si el atleta está en volumen o en definición para dar contexto al vídeo.
  const { data: programaNutricion } = useQuery({
    queryKey: ['nutritionProgram', athlete.email],
    queryFn: () => getNutritionProgram(athlete.email),
  });
  const faseActiva = useMemo(
    () => (programaNutricion && programaNutricion.phases.length > 0
      ? computeActivePhase(programaNutricion, ventana.hasta)
      : null),
    [programaNutricion, ventana.hasta],
  );

  // ── Lo que ha comido ───────────────────────────────────────────────────────
  // Acotado a la ventana desde la propia consulta (`desde`), no leído entero y
  // filtrado aquí: los registros de dieta son un documento por día, así que un
  // atleta de un año son 365 lecturas para enseñar siete. La clave lleva el
  // `desde` para no pisar la caché de las pantallas que sí piden el historial
  // completo (Análisis nutricional, la periodización).
  const { data: registrosDeComida = [] } = useQuery({
    queryKey: ['dietCompletionLogsForAthlete', athlete.email, ventana.desde],
    queryFn: () => getDietCompletionLogsForAthlete(athlete.email, ventana.desde),
  });
  // Solo hacen falta para los días anteriores a 09-2026, que no congelaron sus
  // comidas en el propio registro. Clave compartida con el resto del Hub.
  const { data: dietas = [] } = useQuery({
    queryKey: ['dietsForAthlete', athlete.email],
    queryFn: () => getDietsForAthlete(athlete.email),
  });
  const comida = useMemo(
    () => construirComidaDeLaSemana({
      logs: registrosDeComida, diets: dietas, desde: ventana.desde, hasta: ventana.hasta,
    }),
    [registrosDeComida, dietas, ventana.desde, ventana.hasta],
  );

  // ── El cardio ──────────────────────────────────────────────────────────────
  // Sin acotar a la ventana, y a propósito: el cociente de carga son dos medias
  // móviles de 7 y 42 días, así que recortando la entrada el CTL arrancaría de
  // cero y todo el mundo saldría en «overreaching». Clave compartida con la
  // pestaña de Cardio del Hub.
  const { data: sesionesCardio = [] } = useQuery({
    queryKey: ['cardioSessions', athlete.email],
    queryFn: () => getCardioSessionsForAthlete(athlete.email),
  });
  const cardio = useMemo(
    () => construirCardioDeLaVentana({
      sesiones: sesionesCardio, desde: ventana.desde, hasta: ventana.hasta,
    }),
    [sesionesCardio, ventana.desde, ventana.hasta],
  );

  return (
    // El agrandado vive en `.revision-presentando` (src/index.css), no aquí:
    // necesita una media query —en móvil el zoom rompe la contención de las
    // tablas— y eso no se puede escribir en un `style` en línea.
    <div className={`pantalla space-y-8 ${presentando ? 'revision-presentando' : ''}`}>
      {presentando && (
        <p className="font-mono text-caption text-ink-3 text-right">
          Modo presentación · P o Esc para salir
        </p>
      )}

      {/* ── Revisión de la semana / Cierre de bloque ── */}
      {mesoCierre && !presentando && (
        <div className="space-y-3">
          <SegmentedControl
            label="Qué revisar"
            value={modo}
            onChange={v => setModo(v as 'semanal' | 'cierre')}
            options={[
              { value: 'semanal', label: 'Revisión de la semana' },
              { value: 'cierre', label: 'Cierre de bloque' },
            ]}
          />
          {modo === 'semanal' && recienCerrado && (
            <button
              type="button"
              onClick={() => { setMesoCierreId(recienCerrado.id); setModo('cierre'); }}
              className="fila-pulsable w-full flex items-center gap-3 rounded-surface border border-accent-line bg-accent/10 px-4 py-3 text-left"
            >
              <Icon name="flag" size="m" className="text-accent-ink shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block font-sans text-label font-bold text-ink">
                  {nombreDeMeso(recienCerrado)} terminó el {addDays(recienCerrado.startDate, recienCerrado.weeks * 7 - 1)}
                </span>
                <span className="block font-sans text-caption text-ink-2">
                  Tienes su cierre listo: rendimiento del inicio al final, cuerpo, cuestionarios y qué cambiar en el siguiente.
                </span>
              </span>
              <Icon name="chevron_right" size="m" className="text-ink-3 shrink-0" />
            </button>
          )}
        </div>
      )}

      {modo === 'cierre' && mesoCierre ? (
        <CierreDeBloque
          athlete={athlete}
          meso={mesoCierre}
          bloques={bloquesConCierre}
          onCambiarBloque={setMesoCierreId}
          mesocycles={mesocycles}
          logs={logs}
          exercises={exercises}
          assignments={assignments}
          photos={photos}
          bodyweightLogs={bodyweightLogs}
          questionnaires={questionnaires}
          responses={responses}
          sexo={sexo}
          hoy={hoy}
          presentando={presentando}
        />
      ) : (
      <>
      {/* ── Día de revisión y pausa: se cambian aquí también, no solo en
          Revisiones, que es donde Dani está cuando lo decide (29-10). Fuera
          en modo presentación, como el resto de controles. */}
      {!presentando && (
        <div className="bg-surface border border-hairline rounded-surface">
          <DiaRevisionAtleta athlete={athlete} suelto />
        </div>
      )}

      {/* ── Controles de la pantalla ─────────────────────────────────────── */}
      <div className={`flex flex-wrap items-end justify-between gap-3 ${presentando ? 'hidden' : ''}`}>
        <SelectorPeriodoRevision
          periodo={periodo}
          onChange={setPeriodo}
          mesocycles={mesocycles}
          etiquetaComparacion={ventana.etiquetaComparacion}
          hoy={hoy}
          ultimaRevision={ultimaRevision}
        />
        {/* `flex-wrap`: los dos botones juntos miden 394 px y el móvil tiene
            375, así que sin esto la pantalla entera se desplazaba a lo ancho. */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            onClick={() => setTodoAbierto(v => !v)}
            aria-pressed={todoAbierto}
          >
            <Icon name={todoAbierto ? 'unfold_less' : 'unfold_more'} size="s" />
            {todoAbierto ? 'Plegar todo' : 'Desplegar todo'}
          </Button>
          {/* El botón existe para que el modo sea descubrible; en cuanto se
              enciende desaparece con el resto de los controles, que es justo
              lo que se quiere de él en un vídeo. */}
          <Button variant="ghost" onClick={alternarPresentacion} aria-pressed={presentando}>
            <Icon name="slideshow" size="s" />
            Presentar
          </Button>
        </div>
      </div>

      <RevisionCabecera
        athlete={athlete}
        ventana={ventana}
        informe={informe}
        peso={peso}
        faseNutricional={faseActiva?.name ?? null}
        pesoObjetivo={athlete.targetWeight}
      />

      {/* El canal de mensajes (29-10): lo que hay por firmar, los cambios sin
          contar y lo que el atleta contó, antes de los números. Oculto al
          presentar: es trabajo del coach, no parte del vídeo. */}
      {!presentando && <MensajesCoachPanel athlete={athlete} cierre={cierrePorFirmar} />}

      {/* Peso corporal arriba del todo, justo bajo la cabecera: la misma
          gráfica y registro que en Atleta › Cuerpo. */}
      <div className="bg-surface border border-hairline rounded-surface p-5">
        <BodyweightPanel athleteEmail={athlete.email} readOnly />
      </div>

      <Secciones presentando={presentando}>
        <Seccion titulo="Cómo va cada patrón">
          <BloquePatrones
            patrones={revision.patrones}
            ejerciciosPorPatron={revision.ejerciciosPorPatron}
            ejerciciosSinPatron={revision.ejerciciosSinPatron}
            comparacion={ventana.etiquetaComparacion.replace(/^vs /, '')}
            curvas={revision.curvaPorEjercicio}
            ultimaSesion={revision.ultimaSesionPorEjercicio}
            todoAbierto={todoAbierto}
          />
        </Seccion>

        <Seccion
          titulo="Lo que sube y lo que baja"
          accion={
            <Button variant="ghost" onClick={() => onGoToTab('entrenamientos')}>
              Ver historial de cargas
            </Button>
          }
        >
          <BloqueMejoresEjercicios
            suben={revision.suben}
            bajan={revision.bajan}
            comparacion={ventana.etiquetaComparacion}
          />
        </Seccion>

        <Seccion
          titulo="Estímulo por semana (IEM)"
          accion={
            <Button variant="ghost" onClick={() => onGoToTab('entrenamientos')}>
              Ajustar el bloque
            </Button>
          }
        >
          <BloqueEstimuloSemanal
            logs={logs}
            exercises={exercises}
            semanas={semanasIem}
            domsPorGrupo={revision.bienestar.domsPorGrupo}
            todoAbierto={todoAbierto}
          />
        </Seccion>

        {/* Solo si hay cardio del que hablar. Un bloque vacío en un atleta que
            solo hace pesas ocupa sitio en el vídeo y no dice nada; y en cuanto
            registre una sesión, aparece solo. */}
        {(cardio.sesiones > 0 || cardio.ultimaSesion) && (
          <Seccion titulo="El cardio">
            <BloqueCardio cardio={cardio} onGoToTab={onGoToTab} todoAbierto={todoAbierto} />
          </Seccion>
        )}

        {/* Va pegado al volumen a propósito: cuando el volumen está puesto y aun
            así no sube nada, la respuesta casi siempre está aquí —duerme poco,
            arrastra estrés, o hay un grupo con agujetas que no se van—. Es la
            explicación del bloque de arriba, no una sección independiente. */}
        <Seccion titulo="Cómo ha llegado">
          <BloqueBienestar bienestar={revision.bienestar} todoAbierto={todoAbierto} />
        </Seccion>

        {/* Va entre el entrenamiento y el cuerpo a propósito: primero qué ha
            hecho, luego qué ha comido, y solo entonces qué ha pasado con su
            cuerpo — que es la consecuencia de los dos anteriores. */}
        <Seccion
          titulo="Qué ha comido"
          accion={
            <Button variant="ghost" onClick={() => onGoToTab('dietas')}>
              Ver su plan de comidas
            </Button>
          }
        >
          <BloqueQueHaComido comida={comida} todoAbierto={todoAbierto} />
        </Seccion>

        {/* Qué eligió comer (bloque 4) y cuánto de lo pautado cumplió (este) son
            preguntas distintas y van seguidas: el coach cuenta primero la
            selección y luego el número. Los dos leen la misma ventana. */}
        <Seccion
          titulo="Adherencia y hábitos"
          accion={
            <Button variant="ghost" onClick={() => onGoToTab('reportes')}>
              Convertir en reporte
            </Button>
          }
        >
          <BloqueNutricionHabitos
            athleteEmail={athlete.email}
            athleteName={athlete.displayName}
            targetWeight={athlete.targetWeight}
            registros={registrosDeComida}
            dietas={dietas}
            bodyweightLogs={bodyweightLogs}
            ventana={ventana}
          />
        </Seccion>

        <Seccion
          titulo="El cuerpo"
          accion={
            <Button variant="ghost" onClick={() => onGoToTab('cuerpo')}>
              Ver todo el seguimiento
            </Button>
          }
        >
          <BloqueCuerpo
            athlete={athlete}
            sexo={sexo}
            photos={photos}
            bodyweightLogs={bodyweightLogs}
            onGoToTab={onGoToTab}
            todoAbierto={todoAbierto}
            logs={logs}
            exercises={exercises}
            responses={responses}
            questionnaires={questionnaires}
            assignments={assignments}
          />
        </Seccion>

        <Seccion
          titulo="Lo que te ha mandado"
          accion={
            <Button variant="ghost" onClick={() => onGoToTab('revisiones')}>
              Ir a Revisiones
            </Button>
          }
        >
          <BloqueRecibido
            checkins={checkins}
            questionnaires={questionnaires}
            responses={responses}
            onGoToTab={onGoToTab}
            todoAbierto={todoAbierto}
          />
        </Seccion>

        {/* Detrás de «lo que te ha mandado» porque también es algo que viene de
            su lado: el reto es lo único de la app que le pide algo concreto cada
            semana, y el peldaño es la promesa a medio plazo. */}
        <Seccion
          titulo="Retos y nivel"
        >
          <BloqueRetosNivel
            athleteEmail={athlete.email}
            initialWeight={athlete.initialWeight}
            logs={logs}
            exercises={exercises}
            bodyweightLogs={bodyweightLogs}
            registrosDeComida={registrosDeComida}
            dietas={dietas}
            assignments={assignments}
            onGoToTab={onGoToTab}
            todoAbierto={todoAbierto}
          />
        </Seccion>

        {/* Antes de «Lo que he cambiado» porque son las dos mitades de la misma
            pregunta: qué le tocó la máquina y qué le toqué yo. */}
        <Seccion titulo="Lo que ha hecho el asistente">
          <LineaDeTiempoAsistente athlete={athlete} presentando={presentando} />
        </Seccion>

        <Seccion titulo="Lo que he cambiado">
          <BloqueCambios
            athleteEmail={athlete.email}
            desde={ventana.desde}
            hasta={ventana.hasta}
            todoAbierto={todoAbierto}
          />
        </Seccion>

        {/* Va el último porque es la conclusión: los bloques de arriba son la
            prueba, y este es lo que se le dice. */}
        <Seccion titulo="Cierre de la revisión">
          <BloqueCierre
            athleteEmail={athlete.email}
            athleteName={athlete.displayName}
            revision={revision}
            comida={comida}
            peso={peso}
            onGoToTab={onGoToTab}
            presentando={presentando}
          />
        </Seccion>
      </Secciones>
      </>
      )}
    </div>
  );
}
