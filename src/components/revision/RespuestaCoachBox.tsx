import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { BloquesRespuesta, Questionnaire, QuestionnaireResponse, RespuestaCoachRevision, UserProfile } from '../../types';
import {
  guardarRespuestaCoach, uploadRespuestaCoachMedia, createNotificationDeduped,
  getNutritionProgram, getDietsForAthlete, getDietCompletionLogsForAthlete, getStepsForAthlete, getAthleteNutritionConfig,
  getWorkoutAssignmentsForAthlete, getWorkoutLogs,
} from '../../dbService';
import { getCambiosAtleta } from '../../db/cambios';
import { useAthleteWeight } from '../../hooks/useAthleteWeight';
import { mensajeDeErrorFirestore } from '../../utils/erroresFirestore';
import { useToast } from '../../hooks/useToast';
import { COACH_NOMBRE } from '../../utils/coach';
import { addDays, hoyIsoLocal } from '../../utils/trainingWeek';
import { semanasDelPlan, evaluarPlan, calcularGastoReal } from '../../utils/seguimientoPlan';
import { conEstadoReal } from '../../utils/estadoDeAsignacion';
import { borradorDeRespuesta, textoDeBloques, TITULOS_BLOQUES } from '../../utils/borradorRespuesta';
import { Button, Icon } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Respuesta del coach a una revisión (27-10; tres bloques y borrador, 29-10)

   Cierra el ciclo: el coach contesta y el atleta ve «Dani ha revisado tu
   semana» en Inicio y en Perfil › Revisión, con un aviso. Decisión de Dani
   (28-10): la respuesta tiene tres bloques fijos —cómo ha ido · qué cambia ·
   qué espero ver— que PREPARA el asistente con lo medido y FIRMA él. Nada
   sale sin pulsar «Firmar y enviar»: el borrador es texto en un cuadro.

   El borrador (utils/borradorRespuesta.ts) sale de datos que esta ficha ya
   tiene en caché si se abrió Plan › Objetivo (mismas claves que
   SeguimientoPlanPanel); si no, se leen aquí la primera vez. Son lecturas
   del atleta en cuestión, una vez por ficha, no por respuesta.

   «Copiar para WhatsApp» lleva el mismo texto sin títulos. «Contestada por
   WhatsApp» guarda la respuesta con `canal: 'whatsapp'` y sin texto: el
   atleta ve que hubo respuesta, la bandeja deja de reclamarla y la latencia
   se mide igual.
   ═══════════════════════════════════════════════════════════════════════════ */

const DEFAULT_STEP_GOAL = 8000;

interface Props {
  respuesta: QuestionnaireResponse;
  questionnaire?: Questionnaire;
  athlete: UserProfile;
  onGuardada: (r: QuestionnaireResponse) => void;
}

const VACIOS: BloquesRespuesta = { comoHaIdo: '', queCambia: '', queEspero: '' };

/** Los datos del borrador, solo cuando el cuadro está en edición. */
function useBorrador(athlete: UserProfile, respuesta: QuestionnaireResponse, questionnaire: Questionnaire | undefined, activo: boolean) {
  const email = athlete.email;
  const hoy = hoyIsoLocal();
  const { data: program = null } = useQuery({ queryKey: ['nutritionProgram', email], queryFn: () => getNutritionProgram(email), enabled: activo });
  const { data: dietsRaw = [] } = useQuery({ queryKey: ['dietsForAthlete', email], queryFn: () => getDietsForAthlete(email), enabled: activo });
  const { data: registros = [] } = useQuery({ queryKey: ['dietCompletionLogsForAthlete', email], queryFn: () => getDietCompletionLogsForAthlete(email), enabled: activo });
  const { data: pasos = [] } = useQuery({ queryKey: ['stepsForAthlete', email], queryFn: () => getStepsForAthlete(email), enabled: activo });
  const { data: config = null } = useQuery({ queryKey: ['athleteNutritionConfig', email], queryFn: () => getAthleteNutritionConfig(email).catch(() => null), enabled: activo });
  const { data: cambios = [] } = useQuery({ queryKey: ['cambiosAtleta', email], queryFn: () => getCambiosAtleta(email), enabled: activo });
  const { data: asignaciones = [] } = useQuery({
    queryKey: ['workoutAssignments', athlete.userId],
    queryFn: () => getWorkoutAssignmentsForAthlete({ uid: athlete.userId, email }),
    enabled: activo,
  });
  const { data: logs = [] } = useQuery({ queryKey: ['workoutLogs', email], queryFn: () => getWorkoutLogs(email), enabled: activo });
  const { logs: pesos } = useAthleteWeight(activo ? email : undefined);

  return useMemo(() => {
    if (!activo) return VACIOS;
    const diets = dietsRaw.filter(d => !d.selfManaged);
    const semanas = program ? semanasDelPlan({ program, diets, pesos, registros, pasos, pasosBase: config?.stepGoal ?? DEFAULT_STEP_GOAL, hoy }) : [];
    const gasto = calcularGastoReal({ pesos, registros, diets, hasta: hoy });
    const evaluacion = program ? evaluarPlan(program, semanas, gasto) : null;
    const enCurso = semanas.findIndex(s => s.enCurso);
    const semanaQueViene = enCurso >= 0 ? semanas[enCurso + 1] ?? null : null;

    const desde = addDays(hoy, -6);
    const ultimaSemana = conEstadoReal(asignaciones, logs).filter(a => a.date >= desde && a.date <= hoy);
    const sesiones = { hechas: ultimaSemana.filter(a => a.status === 'completed').length, pautadas: ultimaSemana.length };

    const preguntas = questionnaire?.questions ?? [];
    const recientes = cambios.filter(c => c.at.slice(0, 10) >= desde);
    return borradorDeRespuesta({ nombre: athlete.displayName || '', respuesta, preguntas, sesiones, evaluacion, semanaQueViene, cambios: recientes });
  }, [activo, program, dietsRaw, pesos, registros, pasos, config?.stepGoal, hoy, asignaciones, logs, cambios, questionnaire, respuesta, athlete.displayName]);
}

export default function RespuestaCoachBox({ respuesta, questionnaire, athlete, onGuardada }: Props) {
  const { showToast } = useToast();
  const existente = respuesta.respuestaCoach;
  const [editando, setEditando] = useState(!existente);
  const [bloques, setBloques] = useState<BloquesRespuesta>(existente?.bloques ?? { ...VACIOS, comoHaIdo: existente?.texto ?? '' });
  const [tocado, setTocado] = useState(!!existente);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  // El borrador rellena los bloques solo mientras el coach no haya escrito
  // nada: en cuanto toca un campo, lo suyo manda.
  const borrador = useBorrador(athlete, respuesta, questionnaire, editando && !tocado);
  useEffect(() => {
    if (editando && !tocado && borrador !== VACIOS) setBloques(borrador);
  }, [editando, tocado, borrador]);

  const texto = textoDeBloques(bloques);
  const vacio = !texto.trim() && !archivo;

  const guardar = async (canal: 'app' | 'whatsapp') => {
    setEnviando(true);
    try {
      let mediaUrl = existente?.mediaUrl;
      let mediaKind = existente?.mediaKind;
      if (archivo) {
        mediaUrl = await uploadRespuestaCoachMedia(respuesta.athleteId, archivo);
        mediaKind = archivo.type.startsWith('audio/') ? 'audio' : 'video';
      }
      const nueva: RespuestaCoachRevision = canal === 'whatsapp'
        ? { texto: '', enviadaEn: new Date().toISOString(), canal: 'whatsapp' }
        : {
            texto, mediaUrl, mediaKind, enviadaEn: new Date().toISOString(), canal: 'app',
            bloques: { comoHaIdo: bloques.comoHaIdo.trim(), queCambia: bloques.queCambia.trim(), queEspero: bloques.queEspero.trim() },
            borrador: tocado ? 'coach' : 'asistente',
          };
      await guardarRespuestaCoach(respuesta.id, nueva);
      onGuardada({ ...respuesta, respuestaCoach: nueva, reviewedAt: nueva.enviadaEn });
      createNotificationDeduped(`notif_rc_${respuesta.id}_${nueva.enviadaEn}`, {
        recipientEmail: respuesta.athleteId,
        type: 'revision_respondida',
        title: canal === 'whatsapp' ? `${COACH_NOMBRE} te ha escrito por WhatsApp` : `${COACH_NOMBRE} ha revisado tu semana`,
        body: canal === 'whatsapp'
          ? 'Tu revisión está contestada ahí.'
          : (bloques.comoHaIdo.trim() ? bloques.comoHaIdo.trim().slice(0, 120) : (mediaKind === 'audio' ? 'Te ha dejado un audio' : 'Te ha dejado un vídeo')),
        link: 'checkin',
        createdAt: nueva.enviadaEn,
        read: false,
      }).catch(console.error);
      setArchivo(null);
      setEditando(false);
      showToast(canal === 'whatsapp' ? 'Marcada como contestada por WhatsApp.' : 'Respuesta firmada y enviada al atleta.', 'success');
    } catch (err) {
      showToast(mensajeDeErrorFirestore(err, 'enviar tu respuesta'));
    } finally {
      setEnviando(false);
    }
  };

  const copiar = async () => {
    const nombre = (athlete.displayName || '').split(' ')[0];
    const paraWhatsApp = `${nombre ? `${nombre}, ` : ''}he visto tu revisión.\n\n${texto}`;
    try {
      await navigator.clipboard.writeText(paraWhatsApp);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      showToast('No he podido copiar: selecciona el texto a mano.');
    }
  };

  if (!editando && existente) {
    const porWhatsApp = existente.canal === 'whatsapp';
    return (
      <div className="rounded-control border border-accent-line bg-accent-bg/50 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Icon name="check_circle" size="s" className="text-success" />
          <span className="font-sans text-caption font-bold text-ink-2 flex-1">
            {porWhatsApp ? 'Contestada por WhatsApp' : 'Firmada'} el {new Date(existente.enviadaEn).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
          </span>
          <button type="button" onClick={() => { setEditando(true); setTocado(true); }} className="font-sans text-caption text-ink-4 hover:text-ink">Editar</button>
        </div>
        {existente.bloques ? (
          <dl className="space-y-1.5">
            {(Object.keys(TITULOS_BLOQUES) as (keyof BloquesRespuesta)[]).filter(k => existente.bloques![k]).map(k => (
              <div key={k}>
                <dt className="font-mono text-caption uppercase tracking-wider text-ink-3">{TITULOS_BLOQUES[k]}</dt>
                <dd className="font-sans text-label text-ink whitespace-pre-wrap">{existente.bloques![k]}</dd>
              </div>
            ))}
          </dl>
        ) : existente.texto ? (
          <p className="font-sans text-label text-ink whitespace-pre-wrap">{existente.texto}</p>
        ) : null}
        {existente.mediaUrl && (existente.mediaKind === 'audio'
          ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption -- audio o vídeo grabado por el coach: no hay subtítulos que enlazar
            <audio controls src={existente.mediaUrl} className="w-full" />
            )
          : (
            // eslint-disable-next-line jsx-a11y/media-has-caption -- audio o vídeo grabado por el coach: no hay subtítulos que enlazar
            <video controls src={existente.mediaUrl} className="w-full rounded-control max-h-64" />
        ))}
      </div>
    );
  }

  const campo = (k: keyof BloquesRespuesta, placeholder: string) => (
    <div key={k} className="space-y-1">
      <label htmlFor={`rc-${respuesta.id}-${k}`} className="block font-mono text-caption text-ink-2 uppercase tracking-wider">{TITULOS_BLOQUES[k]}</label>
      <textarea
        id={`rc-${respuesta.id}-${k}`}
        value={bloques[k]}
        onChange={e => { setTocado(true); setBloques(b => ({ ...b, [k]: e.target.value })); }}
        placeholder={placeholder}
        rows={2}
        className="w-full bg-raised border border-hairline rounded-control p-3 text-label text-ink focus:ring-1 focus:ring-accent focus:outline-none min-h-[60px] resize-y font-sans"
      />
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <p className="font-sans text-label font-bold text-ink flex-1">Contesta su revisión</p>
        {!tocado && texto && (
          <span className="font-mono text-caption uppercase tracking-wider text-ink-3">Borrador del asistente · edítalo y firma</span>
        )}
      </div>
      {campo('comoHaIdo', 'Qué has visto esta semana, con su nombre.')}
      {campo('queCambia', 'Qué cambias y por qué; si nada, dilo.')}
      {campo('queEspero', 'Qué tiene que pasar la semana que viene.')}
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-1.5 cursor-pointer font-sans text-caption text-ink-3 hover:text-ink border border-hairline rounded-control px-2.5 py-1.5">
          <Icon name="add" size="s" />
          {archivo ? archivo.name : 'Audio o vídeo'}
          <input type="file" accept="audio/*,video/*" className="sr-only" onChange={e => setArchivo(e.target.files?.[0] ?? null)} />
        </label>
        <Button size="s" variant="ghost" icon={copiado ? 'check' : 'content_copy'} onClick={copiar} disabled={!texto.trim()}>
          {copiado ? 'Copiado' : 'Copiar para WhatsApp'}
        </Button>
        <Button size="s" variant="ghost" icon="chat" onClick={() => guardar('whatsapp')} loading={enviando} disabled={enviando}>
          Contestada por WhatsApp
        </Button>
        <span className="flex-1" />
        {existente && <Button size="s" variant="ghost" onClick={() => setEditando(false)}>Cancelar</Button>}
        <Button size="s" iconTrailing="send" onClick={() => guardar('app')} loading={enviando} loadingLabel="Enviando" disabled={vacio}>
          Firmar y enviar
        </Button>
      </div>
    </div>
  );
}
