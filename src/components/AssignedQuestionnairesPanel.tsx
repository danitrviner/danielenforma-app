import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  UserProfile, Questionnaire, QuestionnaireAssignment, QuestionnairePack,
  QuestionnaireQuestion, QuestionnaireResponse, QSchedule, QScheduleType,
} from '../types';
import {
  assignQuestionnaire, deactivateAssignment, createQuestionnaire,
  getQuestionnairePacksByCoach, createQuestionnairePack, updateQuestionnairePack, deleteQuestionnairePack,
} from '../dbService';
import {
  cadenciaEnCristiano, cadenciaParaTabla, proximaOcurrencia, etiquetaFechaCorta, hoyLocalStr,
} from '../utils/scheduleEngine';
import { suggestedScheduleForTitle } from '../data/questionnairePresets';
import { resolveQuestions } from '../utils/questionnaireResolve';
import { useToast } from '../hooks/useToast';
import { mensajeDeErrorFirestore } from '../utils/erroresFirestore';
import ScheduleFields from './ScheduleFields';
import QuestionnaireEditor, { FormState as QFormState, blankForm as blankQForm, newQuestion, applyTypeChange, QUESTION_TYPE_LABELS } from './QuestionnaireEditor';
import { Badge, Button, Card, EmptyState, Icon, Sheet } from './ui';
import { pulsable } from '../utils/a11y';

/* ═══════════════════════════════════════════════════════════════════════════
   AssignedQuestionnairesPanel — «qué tiene puesto este atleta»

   Antes esta zona era un formulario de asignación con la lista de asignados
   colgando debajo: para saber qué cuestionarios tenía un atleta y cada cuánto
   los responde había que pasar por encima de un select, un selector de
   cadencia y un editor de personalización que solo se usan al dar de alta uno.

   Se invierte: la TABLA es la pantalla (cuestionario · cada cuánto · próxima,
   la misma lectura de un vistazo que HubFit) y asignar es un Sheet que se abre
   cuando hace falta. Y encima, paquetes: un conjunto de cuestionarios con su
   cadencia ya decidida, que se aplica entero a un atleta nuevo de una pulsación
   en vez de repetir tres veces el mismo formulario.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  athlete: UserProfile;
  coachId: string;
  coachQuestionnaires: Questionnaire[];
  setCoachQuestionnaires: React.Dispatch<React.SetStateAction<Questionnaire[]>>;
  athleteQAssignments: QuestionnaireAssignment[];
  setAthleteQAssignments: React.Dispatch<React.SetStateAction<QuestionnaireAssignment[]>>;
  athleteQResponses: QuestionnaireResponse[];
}

export default function AssignedQuestionnairesPanel({
  athlete, coachId,
  coachQuestionnaires, setCoachQuestionnaires,
  athleteQAssignments, setAthleteQAssignments,
  athleteQResponses,
}: Props) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const activas = useMemo(
    () => athleteQAssignments.filter(a => a.active),
    [athleteQAssignments],
  );

  // ── Paquetes ───────────────────────────────────────────────────────────────
  const packsKey = ['questionnairePacks', coachId] as const;
  const { data: packs = [] } = useQuery({
    queryKey: packsKey,
    queryFn: () => getQuestionnairePacksByCoach(coachId),
    enabled: !!coachId,
  });
  // Fila desplegada: qué preguntas le llegan de verdad a ESTE atleta. Una a la
  // vez — es una consulta puntual («¿esto qué le pregunta?»), no una lista que
  // se lea entera.
  const [filaAbierta, setFilaAbierta] = useState<string | null>(null);

  const [aplicandoPack, setAplicandoPack] = useState<string | null>(null);
  const [guardandoPack, setGuardandoPack] = useState(false);
  const [nombrePack, setNombrePack] = useState('');
  const [formPackAbierto, setFormPackAbierto] = useState(false);

  // Constructor de paquete desde cero: elegir plantillas y ponerle cadencia a
  // cada una sin pasar por ningún atleta. El otro camino —«guardar estos N como
  // paquete»— solo sirve cuando ya hay alguien montado como quieres.
  const [sheetPack, setSheetPack] = useState(false);
  const [packNombre, setPackNombre] = useState('');
  const [packItems, setPackItems] = useState<{ key: string; questionnaireId: string; schedule: QSchedule }[]>([]);
  const [creandoPack, setCreandoPack] = useState(false);
  // Con id = editar uno que ya existe; sin él = crear. El formulario es el
  // mismo: montar un paquete y corregirlo son la misma tarea.
  const [packEditando, setPackEditando] = useState<string | null>(null);

  const abrirConstructorDePack = (pack?: QuestionnairePack) => {
    setPackEditando(pack?.id ?? null);
    setPackNombre(pack?.name ?? '');
    setPackItems((pack?.items ?? []).map((it, i) => ({
      key: `it_${i}_${Math.random().toString(36).slice(2, 6)}`,
      questionnaireId: it.questionnaireId,
      schedule: it.schedule,
    })));
    setSheetPack(true);
  };

  const anadirFilaAlPack = () => {
    setPackItems(prev => [...prev, {
      key: `it_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      questionnaireId: '',
      schedule: { type: 'once' },
    }]);
  };

  const cambiarPlantillaDeFila = (key: string, questionnaireId: string) => {
    const tmpl = coachQuestionnaires.find(q => q.id === questionnaireId);
    // Misma cortesía que al asignar: si el título delata la cadencia habitual
    // ("Revisión semanal"), se propone sola y el coach solo la corrige.
    const sugerida = tmpl ? suggestedScheduleForTitle(tmpl.title) : undefined;
    setPackItems(prev => prev.map(it => it.key === key
      ? { ...it, questionnaireId, schedule: sugerida ?? it.schedule }
      : it));
  };

  const cambiarCadenciaDeFila = (key: string, cambio: Partial<QSchedule>) => {
    setPackItems(prev => prev.map(it => it.key === key
      ? { ...it, schedule: { ...it.schedule, ...cambio } }
      : it));
  };

  const packListo = packNombre.trim().length > 0
    && packItems.length > 0
    && packItems.every(it => it.questionnaireId
      && !(it.schedule.type === 'weekdays' && (it.schedule.weekdays ?? []).length === 0));

  const guardarPack = async () => {
    if (!packListo) return;
    const nombre = packNombre.trim();
    const items = packItems.map(({ questionnaireId, schedule }) => ({ questionnaireId, schedule }));
    setCreandoPack(true);
    try {
      if (packEditando) {
        await updateQuestionnairePack(packEditando, { name: nombre, items });
        queryClient.setQueryData<QuestionnairePack[]>(packsKey, prev =>
          (prev ?? []).map(p => p.id === packEditando ? { ...p, name: nombre, items } : p));
        showToast(`Paquete «${nombre}» guardado.`);
      } else {
        const creado = await createQuestionnairePack({
          ownerId: coachId,
          name: nombre,
          items,
          createdAt: new Date().toISOString(),
        });
        queryClient.setQueryData<QuestionnairePack[]>(packsKey, prev => [...(prev ?? []), creado]);
        showToast(`Paquete «${nombre}» creado con ${items.length} cuestionarios.`);
      }
      setSheetPack(false);
    } catch (err) {
      console.error(err);
      showToast(mensajeDeErrorFirestore(err, packEditando ? 'guardar el paquete' : 'crear el paquete'));
    } finally {
      setCreandoPack(false);
    }
  };

  // ── Alta de una asignación ─────────────────────────────────────────────────
  const [sheetAsignar, setSheetAsignar] = useState(false);
  const [assignQId, setAssignQId] = useState('');
  const [assignSchedType, setAssignSchedType] = useState<QScheduleType>('once');
  const [assignWeekdays, setAssignWeekdays] = useState<number[]>([]);
  const [assignIntervalDays, setAssignIntervalDays] = useState(7);
  const [assignDayOfMonth, setAssignDayOfMonth] = useState(1);
  const [assignPlanWeek, setAssignPlanWeek] = useState(3);
  const [assignMesocycleOffsetDays, setAssignMesocycleOffsetDays] = useState(0);
  const [assignStartDate, setAssignStartDate] = useState(hoyLocalStr());
  const [assigningQ, setAssigningQ] = useState(false);

  // Personalización por cliente sobre la plantilla elegida (overrides de la
  // asignación) — ver QuestionnaireOverrides en types.ts. Se resetea al
  // cambiar de plantilla o tras asignar.
  const [assignOverridesOpen, setAssignOverridesOpen] = useState(false);
  const [assignHidden, setAssignHidden] = useState<Set<string>>(new Set());
  const [assignRelabeled, setAssignRelabeled] = useState<Record<string, string>>({});
  const [assignRequiredOverride, setAssignRequiredOverride] = useState<Record<string, boolean>>({});
  const [assignExtra, setAssignExtra] = useState<QuestionnaireQuestion[]>([]);

  const resetAssignOverrides = () => {
    setAssignOverridesOpen(false);
    setAssignHidden(new Set());
    setAssignRelabeled({});
    setAssignRequiredOverride({});
    setAssignExtra([]);
  };

  // Editor de plantilla nueva. Nunca abierto A LA VEZ que el Sheet de asignar:
  // dos Sheets encima del otro comparten z-index y trampa de foco, y el de
  // detrás se queda accesible al tabulador. Se cierra el de asignar, se crea
  // la plantilla, y al guardar se vuelve al de asignar con ella ya elegida.
  const [showNewQEditor, setShowNewQEditor] = useState(false);
  const [newQForm, setNewQForm] = useState<QFormState>(blankQForm());
  const [savingNewQ, setSavingNewQ] = useState(false);

  const abrirEditorDePlantilla = () => {
    setNewQForm(blankQForm());
    setSheetAsignar(false);
    setShowNewQEditor(true);
  };

  const elegirPlantilla = (id: string) => {
    setAssignQId(id);
    resetAssignOverrides();
    const tmpl = coachQuestionnaires.find(q => q.id === id);
    const suggested = tmpl ? suggestedScheduleForTitle(tmpl.title) : undefined;
    if (suggested) {
      setAssignSchedType(suggested.type);
      setAssignWeekdays(suggested.weekdays ?? []);
      setAssignIntervalDays(suggested.intervalDays ?? 7);
      setAssignDayOfMonth(suggested.dayOfMonth ?? 1);
      setAssignPlanWeek(suggested.planWeek ?? 3);
      setAssignMesocycleOffsetDays(suggested.mesocycleOffsetDays ?? 0);
    }
  };

  const abrirSheetAsignar = () => {
    setAssignStartDate(hoyLocalStr());
    setSheetAsignar(true);
  };

  const cedulaDeCadencia = (): QSchedule => {
    const schedule: QSchedule = { type: assignSchedType };
    if (assignSchedType === 'weekdays')      schedule.weekdays            = assignWeekdays;
    if (assignSchedType === 'interval')      schedule.intervalDays        = assignIntervalDays;
    if (assignSchedType === 'monthly')       schedule.dayOfMonth          = assignDayOfMonth;
    if (assignSchedType === 'plan_week')     schedule.planWeek            = assignPlanWeek;
    if (assignSchedType === 'mesocycle_end') schedule.mesocycleOffsetDays = assignMesocycleOffsetDays;
    return schedule;
  };

  const handleAssignQuestionnaire = async () => {
    if (!assignQId) return;
    if (assignSchedType === 'weekdays' && assignWeekdays.length === 0) return;
    setAssigningQ(true);
    try {
      const overrides = assignHidden.size > 0 || Object.keys(assignRelabeled).length > 0
        || Object.keys(assignRequiredOverride).length > 0 || assignExtra.length > 0
        ? {
            hidden: assignHidden.size > 0 ? [...assignHidden] : undefined,
            relabeled: Object.keys(assignRelabeled).length > 0 ? assignRelabeled : undefined,
            required: Object.keys(assignRequiredOverride).length > 0 ? assignRequiredOverride : undefined,
            extra: assignExtra.length > 0 ? assignExtra : undefined,
          }
        : undefined;

      const a = await assignQuestionnaire({
        questionnaireId: assignQId,
        athleteId: athlete.email,
        schedule: cedulaDeCadencia(),
        startDate: assignStartDate,
        active: true,
        createdAt: new Date().toISOString(),
        overrides,
      });
      setAthleteQAssignments(prev => [...prev, a]);
      setAssignQId('');
      setAssignSchedType('once');
      setAssignWeekdays([]);
      resetAssignOverrides();
      setSheetAsignar(false);
    } catch (err) {
      console.error(err);
      showToast(mensajeDeErrorFirestore(err, 'asignar el cuestionario'));
    } finally {
      setAssigningQ(false);
    }
  };

  const handleDeactivateQ = async (a: QuestionnaireAssignment) => {
    const tmpl = coachQuestionnaires.find(q => q.id === a.questionnaireId);
    if (!confirm(`¿Quitarle «${tmpl?.title ?? 'este cuestionario'}» a ${athlete.displayName || athlete.email}?\n\nDeja de pedírselo desde hoy. Las respuestas que ya envió se conservan.`)) return;
    try {
      await deactivateAssignment(a.id);
      setAthleteQAssignments(prev => prev.map(x => x.id === a.id ? { ...x, active: false } : x));
    } catch (err) {
      console.error(err);
      showToast(mensajeDeErrorFirestore(err, 'quitar el cuestionario'));
    }
  };

  const handleCreateNewQ = async () => {
    if (!newQForm.title.trim()) return;
    setSavingNewQ(true);
    try {
      const data = {
        ownerId: coachId,
        title: newQForm.title.trim(),
        description: newQForm.description.trim() || undefined,
        questions: newQForm.questions
          .filter(q => q.label.trim())
          .map(q => ({ ...q, graphable: q.type === 'numeric' || q.type === 'scale' || q.type === 'metric' ? true : undefined })),
      };
      const created = await createQuestionnaire(data);
      setCoachQuestionnaires(prev => [...prev, created]);
      setShowNewQEditor(false);
      setNewQForm(blankQForm());
      // Vuelve al Sheet de asignar con la plantilla recién creada elegida: la
      // razón de crearla era asignarla.
      elegirPlantilla(created.id);
      setSheetAsignar(true);
    } catch (err) {
      console.error(err);
      showToast(mensajeDeErrorFirestore(err, 'crear el cuestionario'));
    } finally {
      setSavingNewQ(false);
    }
  };

  // ── Paquetes: aplicar y guardar ────────────────────────────────────────────
  const aplicarPack = async (pack: QuestionnairePack) => {
    const yaPuestos = new Set(activas.map(a => a.questionnaireId));
    const pendientes = pack.items.filter(i => !yaPuestos.has(i.questionnaireId));
    if (pendientes.length === 0) {
      showToast(`${athlete.displayName || 'El atleta'} ya tiene todos los cuestionarios de «${pack.name}».`);
      return;
    }
    setAplicandoPack(pack.id);
    const nuevas: QuestionnaireAssignment[] = [];
    try {
      for (const item of pendientes) {
        nuevas.push(await assignQuestionnaire({
          questionnaireId: item.questionnaireId,
          athleteId: athlete.email,
          schedule: item.schedule,
          startDate: hoyLocalStr(),
          active: true,
          createdAt: new Date().toISOString(),
        }));
      }
      const repetidos = pack.items.length - pendientes.length;
      showToast(
        `${nuevas.length} cuestionario${nuevas.length === 1 ? '' : 's'} asignado${nuevas.length === 1 ? '' : 's'}`
        + (repetidos > 0 ? ` · ${repetidos} ya lo tenía` : ''),
      );
    } catch (err) {
      console.error(err);
      // Parada a medias: se dice cuántos entraron de verdad en vez de dar el
      // paquete por aplicado o por fallido entero.
      showToast(
        nuevas.length > 0
          ? `Solo se asignaron ${nuevas.length} de ${pendientes.length}. ${mensajeDeErrorFirestore(err, 'aplicar el paquete')}`
          : mensajeDeErrorFirestore(err, 'aplicar el paquete'),
      );
    } finally {
      if (nuevas.length > 0) setAthleteQAssignments(prev => [...prev, ...nuevas]);
      setAplicandoPack(null);
    }
  };

  const guardarComoPack = async () => {
    const nombre = nombrePack.trim();
    if (!nombre) return;
    // Solo lo que se puede volver a aplicar: una asignación cuya plantilla ya
    // no existe no se puede repetir en otro atleta.
    const items = activas
      .filter(a => coachQuestionnaires.some(q => q.id === a.questionnaireId))
      .map(a => ({ questionnaireId: a.questionnaireId, schedule: a.schedule }));
    if (items.length === 0) {
      showToast('No hay cuestionarios con plantilla viva que guardar.');
      return;
    }
    setGuardandoPack(true);
    try {
      const creado = await createQuestionnairePack({
        ownerId: coachId,
        name: nombre,
        items,
        createdAt: new Date().toISOString(),
      });
      queryClient.setQueryData<QuestionnairePack[]>(packsKey, prev => [...(prev ?? []), creado]);
      setNombrePack('');
      setFormPackAbierto(false);
      showToast(`Paquete «${nombre}» guardado con ${items.length} cuestionarios.`);
    } catch (err) {
      console.error(err);
      showToast(mensajeDeErrorFirestore(err, 'guardar el paquete'));
    } finally {
      setGuardandoPack(false);
    }
  };

  const borrarPack = async (pack: QuestionnairePack) => {
    if (!confirm(`¿Borrar el paquete «${pack.name}»?\n\nNo le quita nada a ningún atleta: solo desaparece el atajo.`)) return;
    try {
      await deleteQuestionnairePack(pack.id);
      queryClient.setQueryData<QuestionnairePack[]>(packsKey, prev => (prev ?? []).filter(p => p.id !== pack.id));
    } catch (err) {
      console.error(err);
      showToast(mensajeDeErrorFirestore(err, 'borrar el paquete'));
    }
  };

  const tmplElegida = coachQuestionnaires.find(q => q.id === assignQId);

  return (
    <div className="space-y-6">
      {/* ── Lo que tiene puesto ─────────────────────────────────────────── */}
      <Card
        title="Cuestionarios asignados"
        subtitle={activas.length > 0
          ? `${activas.length} activo${activas.length === 1 ? '' : 's'} · esto es lo que ${athlete.displayName?.split(' ')[0] || 'el atleta'} ve en su app`
          : undefined}
        action={
          <Button size="s" variant="primary" icon="add" onClick={abrirSheetAsignar}>
            Asignar
          </Button>
        }
        padding="none"
      >
        {activas.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon="quiz"
              title="Sin cuestionarios asignados"
              description="No se le está pidiendo ninguna revisión. Asígnale uno, o aplícale un paquete entero."
              actionLabel="Asignar cuestionario"
              onAction={abrirSheetAsignar}
            />
          </div>
        ) : (
          <>
            {/* Cabecera de columnas — solo cuando hay ancho para las tres */}
            <div className="hidden sm:grid grid-cols-[1fr_12.5rem_7rem_2.5rem] gap-3 items-center px-5 py-2.5 border-y border-hairline bg-raised">
              <span className="font-mono text-caption text-ink-2 uppercase tracking-wider">Cuestionario</span>
              <span className="font-mono text-caption text-ink-2 uppercase tracking-wider">Cada cuánto</span>
              <span className="font-mono text-caption text-ink-2 uppercase tracking-wider text-right">Próxima</span>
              <span aria-hidden />
            </div>

            <ul className="divide-y divide-hairline/50">
              {activas.map(a => {
                const tmpl = coachQuestionnaires.find(q => q.id === a.questionnaireId);
                const overrideCount = (a.overrides?.hidden?.length ?? 0)
                  + Object.keys(a.overrides?.relabeled ?? {}).length
                  + Object.keys(a.overrides?.required ?? {}).length
                  + (a.overrides?.extra?.length ?? 0);
                // Las preguntas que ve REALMENTE este atleta, no las de la
                // plantilla: `resolveQuestions` aplica sus overrides (quita las
                // ocultas, reformula, añade las suyas). Es la misma función que
                // usa el formulario que rellena él, así que lo que se lee aquí
                // es exactamente lo que le llega.
                const preguntas = tmpl ? resolveQuestions(tmpl, a) : null;
                const abierta = filaAbierta === a.id;
                const ultima = athleteQResponses
                  .filter(r => r.assignmentId === a.id || r.questionnaireId === a.questionnaireId)
                  .sort((x, y) => y.submittedAt.localeCompare(x.submittedAt))[0];
                const proxima = etiquetaFechaCorta(proximaOcurrencia(a));

                return (
                  <li key={a.id} className="px-5 py-3">
                    <div className="grid grid-cols-[1fr_2.5rem] sm:grid-cols-[1fr_12.5rem_7rem_2.5rem] gap-x-3 gap-y-2 items-center">
                      {/* El nombre abre las preguntas: el coach no se acuerda de
                          memoria de qué le pregunta cada plantilla a cada uno,
                          y menos cuando la tiene personalizada. */}
                      <div
                        {...pulsable(() => setFilaAbierta(abierta ? null : a.id))}
                        aria-expanded={abierta}
                        className="flex items-start gap-3 min-w-0 cursor-pointer rounded-control -mx-1 px-1 py-1 hover:bg-raised/60 transition-colors"
                      >
                        <Icon name="quiz" size="m" className="text-accent mt-0.5 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="font-sans font-bold text-ink text-label text-pretty flex items-center gap-2 flex-wrap">
                            {/* Sin plantilla el nombre no puede ser el ID del documento:
                                eso es ruido de base de datos delante del coach. */}
                            {tmpl?.title ?? 'Cuestionario ya no disponible'}
                            {overrideCount > 0 && <Badge tone="info">a medida · {overrideCount}</Badge>}
                          </p>
                          <p className="font-mono text-caption text-ink-2 tabular-nums">
                            {preguntas
                              ? `${preguntas.length} pregunta${preguntas.length === 1 ? '' : 's'}`
                              : 'plantilla borrada'}
                            {' · '}
                            {ultima
                              ? `última: ${new Date(ultima.submittedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`
                              : 'sin responder aún'}
                          </p>
                        </div>
                        <Icon
                          name="expand_more"
                          size="s"
                          className={`text-ink-3 mt-1 shrink-0 transition-transform ${abierta ? 'rotate-180' : ''}`}
                        />
                      </div>

                      <div className="col-start-1 sm:col-start-2 flex items-center gap-2 min-w-0">
                        <Badge tone="info" icon="schedule" className="whitespace-nowrap">{cadenciaParaTabla(a.schedule)}</Badge>
                        {/* En móvil no hay columna propia para la próxima fecha: se
                            pega a la cadencia en vez de partir la fila en tres. */}
                        {proxima && (
                          <span className="sm:hidden font-mono text-caption text-warning tabular-nums whitespace-nowrap">{proxima}</span>
                        )}
                      </div>

                      <span className="hidden sm:block text-right font-mono text-caption text-warning tabular-nums">
                        {proxima || '—'}
                      </span>

                      <button
                        onClick={() => handleDeactivateQ(a)}
                        title="Quitarle este cuestionario"
                        aria-label={`Quitarle ${tmpl?.title ?? 'el cuestionario'} a este atleta`}
                        className="row-start-1 col-start-2 sm:col-start-4 justify-self-end grid place-items-center h-10 w-10 rounded-control text-ink-3 hover:text-danger hover:bg-danger/10 transition-colors"
                      >
                        <Icon name="close" size="s" />
                      </button>
                    </div>

                    {abierta && (
                      <div className="mt-2 ml-0 sm:ml-9 rounded-field border border-hairline bg-bg p-3">
                        {!preguntas ? (
                          <p className="font-sans text-body-s text-ink-2 text-pretty">
                            La plantilla de este cuestionario ya no existe, así que no se puede
                            saber qué le pregunta. Quítaselo y asígnale uno vivo.
                          </p>
                        ) : (
                          <ol className="divide-y divide-hairline/40">
                            {preguntas.map((q, idx) => {
                              const esSuya = (a.overrides?.extra ?? []).some(x => x.id === q.id);
                              const reformulada = !!a.overrides?.relabeled?.[q.id];
                              return (
                                <li key={q.id} className="py-2 flex items-start gap-3">
                                  <span className="font-mono text-caption text-ink-3 tabular-nums w-5 shrink-0">{idx + 1}</span>
                                  <span className="font-sans text-label text-ink flex-1 text-pretty">
                                    {q.label}
                                    {q.required && <span className="text-danger" title="Obligatoria"> *</span>}
                                  </span>
                                  <span className="font-mono text-caption text-ink-2 shrink-0 text-right">
                                    {QUESTION_TYPE_LABELS[q.type]}
                                    {q.type === 'scale' ? ` ${q.scaleMin ?? 1}-${q.scaleMax ?? 10}` : ''}
                                    {q.unit ? ` · ${q.unit}` : ''}
                                  </span>
                                  {esSuya && <Badge tone="data">solo suya</Badge>}
                                  {reformulada && !esSuya && <Badge tone="info">reescrita</Badge>}
                                </li>
                              );
                            })}
                          </ol>
                        )}
                        {(a.overrides?.hidden?.length ?? 0) > 0 && (
                          <p className="mt-2 pt-2 border-t border-hairline font-mono text-caption text-ink-3">
                            {a.overrides!.hidden!.length} pregunta{a.overrides!.hidden!.length === 1 ? '' : 's'} de la
                            plantilla {a.overrides!.hidden!.length === 1 ? 'está oculta' : 'están ocultas'} para este atleta.
                          </p>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            {/* Guardar lo montado como paquete reutilizable: el caso real es
                "este atleta lo tiene como quiero, quiero esto mismo para los
                siguientes" — no montar un paquete en abstracto. */}
            <div className="px-5 py-3 border-t border-hairline bg-raised/40">
              {formPackAbierto ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    autoFocus
                    value={nombrePack}
                    onChange={e => setNombrePack(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') guardarComoPack(); if (e.key === 'Escape') setFormPackAbierto(false); }}
                    placeholder="Nombre del paquete (ej. Alta de cliente)"
                    className="flex-1 min-w-[12rem] bg-bg border border-hairline rounded-control px-3 py-2.5 text-body-s text-ink font-sans focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                  <Button size="s" onClick={guardarComoPack} disabled={!nombrePack.trim()} loading={guardandoPack} loadingLabel="Guardando">
                    Guardar paquete
                  </Button>
                  <Button size="s" variant="ghost" onClick={() => { setFormPackAbierto(false); setNombrePack(''); }}>
                    Cancelar
                  </Button>
                </div>
              ) : (
                <Button size="s" variant="ghost" icon="bookmark_add" onClick={() => setFormPackAbierto(true)}>
                  Guardar estos {activas.length} como paquete
                </Button>
              )}
            </div>
          </>
        )}
      </Card>

      {/* ── Paquetes ────────────────────────────────────────────────────── */}
      <Card
        title="Paquetes"
        subtitle="Conjuntos de cuestionarios con su cadencia, listos para aplicar de una vez"
        action={
          <Button size="s" variant="secondary" icon="add" onClick={() => abrirConstructorDePack()}>
            Crear paquete
          </Button>
        }
        padding="none"
      >
        {packs.length === 0 ? (
          <p className="px-5 py-4 font-sans text-body-s text-ink-2 text-pretty">
            Todavía no hay paquetes. Móntalo aquí con «Crear paquete», o deja a un atleta
            con los cuestionarios que quieras de serie y usa «Guardar como paquete»: en los
            dos casos se aplica luego a cualquier otro con una sola pulsación.
          </p>
        ) : (
          <ul className="divide-y divide-hairline/50">
            {packs.map(pack => {
              const yaPuestos = new Set(activas.map(a => a.questionnaireId));
              const pendientes = pack.items.filter(i => !yaPuestos.has(i.questionnaireId)).length;
              return (
                <li key={pack.id} className="px-5 py-3 flex flex-wrap items-center gap-3">
                  <Icon name="inventory_2" size="m" className="text-data shrink-0" />
                  <div className="flex-1 min-w-[10rem]">
                    <p className="font-sans font-bold text-ink text-label text-pretty">{pack.name}</p>
                    <p className="font-mono text-caption text-ink-2 tabular-nums">
                      {pack.items
                        .map(i => coachQuestionnaires.find(q => q.id === i.questionnaireId)?.title)
                        .filter(Boolean)
                        .join(' · ') || `${pack.items.length} cuestionarios`}
                    </p>
                  </div>
                  <Button
                    size="s"
                    variant="secondary"
                    icon="library_add"
                    onClick={() => aplicarPack(pack)}
                    loading={aplicandoPack === pack.id}
                    loadingLabel="Aplicando"
                    disabled={pendientes === 0}
                    title={pendientes === 0 ? 'Ya tiene todos los de este paquete' : undefined}
                  >
                    {pendientes === 0 ? 'Ya lo tiene' : `Aplicar (${pendientes})`}
                  </Button>
                  <button
                    onClick={() => abrirConstructorDePack(pack)}
                    aria-label={`Editar el paquete ${pack.name}`}
                    title="Editar el paquete"
                    className="grid place-items-center h-10 w-10 rounded-control text-ink-3 hover:text-ink hover:bg-raised transition-colors"
                  >
                    <Icon name="edit" size="s" />
                  </button>
                  <button
                    onClick={() => borrarPack(pack)}
                    aria-label={`Borrar el paquete ${pack.name}`}
                    title="Borrar el paquete"
                    className="grid place-items-center h-10 w-10 rounded-control text-ink-3 hover:text-danger hover:bg-danger/10 transition-colors"
                  >
                    <Icon name="delete" size="s" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* ── Sheet: constructor de paquete ───────────────────────────────── */}
      {sheetPack && (
        <Sheet
          open
          onClose={() => setSheetPack(false)}
          title={packEditando ? 'Editar paquete' : 'Nuevo paquete'}
          size="l"
          footer={
            <Button
              fullWidth
              onClick={guardarPack}
              disabled={!packListo}
              loading={creandoPack}
              loadingLabel="Guardando"
            >
              {packEditando ? 'Guardar cambios' : 'Crear paquete'}
            </Button>
          }
        >
          <div className="space-y-4">
            <div>
              <label htmlFor="pack-nombre" className="block font-mono text-caption text-ink-2 uppercase tracking-wider mb-1.5">
                Nombre
              </label>
              <input
                id="pack-nombre"
                value={packNombre}
                onChange={e => setPackNombre(e.target.value)}
                placeholder="Alta de cliente"
                className="w-full bg-bg border border-hairline rounded-control px-3 py-3 text-title-s text-ink font-sans focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>

            {packEditando && (
              <p className="font-sans text-body-s text-ink-2 text-pretty">
                Editar el paquete no toca a quien ya lo tiene aplicado: cambia lo que se le
                pondrá a partir de ahora.
              </p>
            )}

            {packItems.length === 0 && (
              <p className="font-sans text-body-s text-ink-2 text-pretty">
                Añade los cuestionarios que quieras que lleve de serie un cliente nuevo, cada
                uno con cada cuánto se lo vas a pedir. La fecha de alta no se guarda aquí:
                es la del día en que le apliques el paquete.
              </p>
            )}

            {packItems.map((it, idx) => {
              const yaElegidos = new Set(packItems.filter(o => o.key !== it.key).map(o => o.questionnaireId));
              return (
                <div key={it.key} className="rounded-field border border-hairline bg-raised/40 p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-caption text-ink-3 tabular-nums shrink-0">{idx + 1}</span>
                    <select
                      value={it.questionnaireId}
                      onChange={e => cambiarPlantillaDeFila(it.key, e.target.value)}
                      aria-label={`Cuestionario ${idx + 1} del paquete`}
                      className="flex-1 min-w-0 bg-bg border border-hairline rounded-control px-3 py-3 text-title-s text-ink font-sans focus:outline-none focus:ring-1 focus:ring-accent"
                    >
                      <option value="">— Seleccionar plantilla —</option>
                      {coachQuestionnaires.map(q => (
                        // Repetir la misma plantilla dos veces en un paquete no
                        // significa nada: al aplicarlo, la segunda se salta por
                        // duplicada. Mejor no dejar montarlo.
                        <option key={q.id} value={q.id} disabled={yaElegidos.has(q.id)}>
                          {q.title}{yaElegidos.has(q.id) ? ' (ya está en el paquete)' : ''}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setPackItems(prev => prev.filter(o => o.key !== it.key))}
                      aria-label={`Quitar el cuestionario ${idx + 1} del paquete`}
                      className="shrink-0 grid place-items-center h-10 w-10 rounded-control text-ink-3 hover:text-danger hover:bg-danger/10 transition-colors"
                    >
                      <Icon name="close" size="s" />
                    </button>
                  </div>

                  {it.questionnaireId && (
                    <>
                      <ScheduleFields
                        schedType={it.schedule.type}
                        onSchedTypeChange={t => cambiarCadenciaDeFila(it.key, { type: t })}
                        weekdays={it.schedule.weekdays ?? []}
                        onWeekdaysChange={d => cambiarCadenciaDeFila(it.key, { weekdays: d })}
                        intervalDays={it.schedule.intervalDays ?? 7}
                        onIntervalDaysChange={n => cambiarCadenciaDeFila(it.key, { intervalDays: n })}
                        dayOfMonth={it.schedule.dayOfMonth ?? 1}
                        onDayOfMonthChange={n => cambiarCadenciaDeFila(it.key, { dayOfMonth: n })}
                        startDate={hoyLocalStr()}
                        onStartDateChange={() => {}}
                        sinFechaDeInicio
                        planWeek={it.schedule.planWeek ?? 3}
                        onPlanWeekChange={n => cambiarCadenciaDeFila(it.key, { planWeek: n })}
                        mesocycleOffsetDays={it.schedule.mesocycleOffsetDays ?? 0}
                        onMesocycleOffsetDaysChange={n => cambiarCadenciaDeFila(it.key, { mesocycleOffsetDays: n })}
                      />
                      <Badge tone="info" icon="schedule" className="whitespace-nowrap">
                        {cadenciaParaTabla(it.schedule)}
                      </Badge>
                    </>
                  )}
                </div>
              );
            })}

            <Button
              variant="secondary"
              icon="add"
              fullWidth
              onClick={anadirFilaAlPack}
              disabled={coachQuestionnaires.length === 0 || packItems.length >= coachQuestionnaires.length}
            >
              Añadir cuestionario
            </Button>
          </div>
        </Sheet>
      )}

      {/* ── Sheet: asignar un cuestionario ──────────────────────────────── */}
      {sheetAsignar && (
        <Sheet
          open
          onClose={() => setSheetAsignar(false)}
          title="Asignar cuestionario"
          size="l"
          footer={
            <Button
              fullWidth
              onClick={handleAssignQuestionnaire}
              disabled={!assignQId || (assignSchedType === 'weekdays' && assignWeekdays.length === 0)}
              loading={assigningQ}
              loadingLabel="Asignando"
            >
              Asignar
            </Button>
          }
        >
          <div className="space-y-3">
            {coachQuestionnaires.length === 0 ? (
              <EmptyState
                icon="quiz"
                title="No tienes ninguna plantilla"
                description="Un cuestionario se crea una vez y se asigna a quien quieras, con la cadencia de cada uno."
                actionLabel="Crear cuestionario"
                onAction={abrirEditorDePlantilla}
              />
            ) : (
              <>
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="asignar-plantilla" className="font-mono text-caption text-ink-2 uppercase tracking-wider">
                    Plantilla
                  </label>
                  <Button size="s" variant="ghost" icon="add" onClick={abrirEditorDePlantilla}>
                    Crear nueva
                  </Button>
                </div>
                <select
                  id="asignar-plantilla"
                  value={assignQId}
                  onChange={e => elegirPlantilla(e.target.value)}
                  className="w-full bg-bg border border-hairline rounded-control px-3 py-3 text-title-s text-ink font-sans focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  <option value="">— Seleccionar plantilla —</option>
                  {coachQuestionnaires.map(q => (
                    <option key={q.id} value={q.id}>{q.title}</option>
                  ))}
                </select>

                {tmplElegida && (
                  <p className="font-mono text-caption text-ink-2 tabular-nums">
                    {tmplElegida.questions.length} pregunta{tmplElegida.questions.length === 1 ? '' : 's'}
                    {tmplElegida.description ? ` · ${tmplElegida.description}` : ''}
                  </p>
                )}

                <ScheduleFields
                  schedType={assignSchedType}
                  onSchedTypeChange={setAssignSchedType}
                  weekdays={assignWeekdays}
                  onWeekdaysChange={setAssignWeekdays}
                  intervalDays={assignIntervalDays}
                  onIntervalDaysChange={setAssignIntervalDays}
                  dayOfMonth={assignDayOfMonth}
                  onDayOfMonthChange={setAssignDayOfMonth}
                  startDate={assignStartDate}
                  onStartDateChange={setAssignStartDate}
                  planWeek={assignPlanWeek}
                  onPlanWeekChange={setAssignPlanWeek}
                  mesocycleOffsetDays={assignMesocycleOffsetDays}
                  onMesocycleOffsetDaysChange={setAssignMesocycleOffsetDays}
                />

                {/* Lectura de control: lo que el coach acaba de montar, dicho en
                    la misma frase que va a leer luego en la tabla. */}
                {assignQId && (
                  <p className="font-sans text-body-s text-ink-2 text-pretty">
                    Se le pedirá <strong className="text-ink">{cadenciaEnCristiano(cedulaDeCadencia()).toLowerCase()}</strong>
                    {(() => {
                      const p = etiquetaFechaCorta(proximaOcurrencia({ schedule: cedulaDeCadencia(), startDate: assignStartDate }));
                      return p ? <> · primera vez: <strong className="text-ink">{p}</strong></> : null;
                    })()}
                  </p>
                )}

                {/* ── Personalizar para este cliente (overrides) ──────────── */}
                {tmplElegida && (() => {
                  const changeCount = assignHidden.size + Object.keys(assignRelabeled).length
                    + Object.keys(assignRequiredOverride).length + assignExtra.length;
                  return (
                    <div className="border border-hairline rounded-field overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setAssignOverridesOpen(o => !o)}
                        aria-expanded={assignOverridesOpen}
                        className="w-full flex items-center justify-between px-3 py-3 bg-raised hover:bg-raised/70 transition-colors"
                      >
                        <span className="font-mono text-caption text-ink-2 uppercase tracking-wide flex items-center gap-1.5">
                          <Icon name="tune" size="s" />
                          Personalizar para este cliente
                          {changeCount > 0 && <Badge tone="accent">{changeCount}</Badge>}
                        </span>
                        <Icon
                          name="expand_more"
                          size="s"
                          className={`text-ink-2 transition-transform ${assignOverridesOpen ? 'rotate-180' : ''}`}
                        />
                      </button>
                      {assignOverridesOpen && (
                        <div className="p-3 space-y-2 bg-bg">
                          {tmplElegida.questions.map(q => {
                            const hidden = assignHidden.has(q.id);
                            return (
                              <div key={q.id} className={`flex items-start gap-2 p-2 rounded-control border ${hidden ? 'border-ink-3 opacity-50' : 'border-hairline'}`}>
                                <button
                                  type="button"
                                  onClick={() => setAssignHidden(prev => {
                                    const next = new Set(prev);
                                    if (next.has(q.id)) next.delete(q.id);
                                    else next.add(q.id);
                                    return next;
                                  })}
                                  title={hidden ? 'Mostrar de nuevo' : 'Ocultar para este cliente'}
                                  aria-label={hidden ? `Mostrar «${q.label}»` : `Ocultar «${q.label}»`}
                                  className="shrink-0 grid place-items-center h-10 w-10 rounded-control text-ink-2 hover:text-ink transition-colors"
                                >
                                  <Icon name={hidden ? 'visibility_off' : 'visibility'} size="s" />
                                </button>
                                <div className="flex-1 min-w-0 space-y-1">
                                  <input
                                    value={assignRelabeled[q.id] ?? ''}
                                    onChange={e => setAssignRelabeled(prev => {
                                      const next = { ...prev };
                                      if (e.target.value) next[q.id] = e.target.value; else delete next[q.id];
                                      return next;
                                    })}
                                    disabled={hidden}
                                    placeholder={q.label}
                                    aria-label={`Reformular «${q.label}» para este cliente`}
                                    className="w-full bg-bg border border-hairline rounded-control px-2 py-2 text-title-s text-ink font-sans focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-40"
                                  />
                                  <label className="flex items-center gap-1.5 cursor-pointer w-fit py-1">
                                    <input
                                      type="checkbox"
                                      className="sr-only peer"
                                      checked={assignRequiredOverride[q.id] ?? q.required}
                                      disabled={hidden}
                                      onChange={() => !hidden && setAssignRequiredOverride(prev => ({ ...prev, [q.id]: !(prev[q.id] ?? q.required) }))}
                                    />
                                    <span
                                      aria-hidden
                                      className={`w-4 h-4 rounded border flex items-center justify-center transition-colors peer-focus-visible:ring-1 peer-focus-visible:ring-accent ${(assignRequiredOverride[q.id] ?? q.required) ? 'bg-accent border-accent' : 'border-hairline'}`}
                                    >
                                      {(assignRequiredOverride[q.id] ?? q.required) && <Icon name="check" size="s" className="text-on-accent" />}
                                    </span>
                                    <span className="font-mono text-caption text-ink-2">Obligatoria</span>
                                  </label>
                                </div>
                              </div>
                            );
                          })}

                          {assignExtra.map((q, idx) => (
                            <div key={q.id} className="p-2 rounded-control border border-data/30 bg-data/5 space-y-1.5">
                              <div className="flex items-center gap-2">
                                <input
                                  value={q.label}
                                  onChange={e => setAssignExtra(prev => prev.map((qq, i) => i === idx ? { ...qq, label: e.target.value } : qq))}
                                  placeholder="Pregunta exclusiva de este cliente"
                                  aria-label="Pregunta exclusiva de este cliente"
                                  className="flex-1 min-w-0 bg-bg border border-hairline rounded-control px-2 py-2 text-title-s text-ink font-sans focus:outline-none focus:ring-1 focus:ring-data"
                                />
                                <select
                                  value={q.type}
                                  onChange={e => setAssignExtra(prev => prev.map((qq, i) => i === idx ? { ...qq, ...applyTypeChange({ type: e.target.value as QuestionnaireQuestion['type'] }) } : qq))}
                                  aria-label="Tipo de respuesta"
                                  className="bg-raised border border-hairline rounded-control px-2 py-2 text-caption font-mono text-ink focus:outline-none focus:ring-1 focus:ring-data shrink-0"
                                >
                                  <option value="text">Texto</option>
                                  <option value="numeric">Número</option>
                                  <option value="scale">Escala</option>
                                  <option value="boolean">Sí/No</option>
                                  <option value="choice">Opción</option>
                                </select>
                                <button
                                  type="button"
                                  onClick={() => setAssignExtra(prev => prev.filter((_, i) => i !== idx))}
                                  aria-label="Quitar esta pregunta"
                                  className="shrink-0 grid place-items-center h-10 w-10 rounded-control text-ink-2 hover:text-danger transition-colors"
                                >
                                  <Icon name="close" size="s" />
                                </button>
                              </div>
                              {q.type === 'choice' && (
                                <textarea
                                  value={(q.options ?? []).join('\n')}
                                  onChange={e => setAssignExtra(prev => prev.map((qq, i) => i === idx ? { ...qq, options: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) } : qq))}
                                  placeholder={'Opción A\nOpción B'}
                                  aria-label="Opciones, una por línea"
                                  rows={2}
                                  className="w-full bg-bg border border-hairline rounded-control px-2 py-2 text-body-s text-ink font-mono focus:outline-none focus:ring-1 focus:ring-data resize-none"
                                />
                              )}
                            </div>
                          ))}

                          <Button
                            size="s"
                            variant="ghost"
                            icon="add"
                            onClick={() => setAssignExtra(prev => [...prev, { ...newQuestion(), id: `x_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, required: false }])}
                          >
                            Añadir pregunta solo para él/ella
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        </Sheet>
      )}

      {/* ── Sheet: crear plantilla nueva ────────────────────────────────── */}
      {showNewQEditor && (
        <Sheet
          open
          onClose={() => { setShowNewQEditor(false); setSheetAsignar(true); }}
          title="Nuevo cuestionario"
          size="xl"
        >
          <QuestionnaireEditor
            form={newQForm}
            setForm={setNewQForm}
            onSave={handleCreateNewQ}
            onCancel={() => { setShowNewQEditor(false); setSheetAsignar(true); }}
            saving={savingNewQ}
            isNew
          />
        </Sheet>
      )}
    </div>
  );
}
