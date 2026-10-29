/* Aprobar, rechazar, comentar y DESHACER una propuesta del asistente.
 *
 * Vivía dentro de AiChatPanel, que es donde se revisaban: la bandeja del
 * chat. Pero revisar el plan de un mes ahí es incómodo —ocupa media columna
 * de un panel lateral— y la pantalla de Propuestas necesita exactamente la
 * MISMA lógica de aprobación. Duplicarla habría sido garantizar que las dos
 * se separan en cuanto alguien toque una.
 *
 * Desde el 28-10-2026 aquí ya no se decide QUÉ escribir: eso vive en
 * `autopiloto/aplicarPropuesta.ts` (puro, con tests, el mismo que usará el
 * servidor) y lo escribe `autopiloto/ejecutarEnCliente.ts`. Este hook pone lo
 * que es de React —estado, errores, refrescar consultas— y guarda en la
 * propuesta el snapshot de lo que había antes, que es lo que permite deshacer.
 */

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AiProposal, AiProposalPayload, ProposalComment } from '../../types';
import { updateAiProposal } from '../../dbService';
import { appendDossierFacts } from '../../db/dossier';
import { dossierKey } from '../DossierPanel';
import { describirEdicion, motivoParaNoAprobar } from '../../utils/edicionPropuesta';
import { ordenarPropuestasPorPlan } from '../../utils/ordenPropuestas';
import { auth } from '../../firebase';
import { aplicarPropuesta } from '../../autopiloto/aplicarPropuesta';
import { ejecutarEnCliente, ErrorDeEjecucion } from '../../autopiloto/ejecutarEnCliente';
import { lectorDeCliente } from '../../autopiloto/lectorCliente';
import { planDeDeshacer, coleccionesDe } from '../../autopiloto/deshacer';
import { restaurarTodo } from '../../db/restauracion';

function clavesQueRefrescar(kind: AiProposal['kind'], athleteEmail: string): unknown[][] {
  switch (kind) {
    case 'workoutDays':
      return [['workouts']];
    case 'mesocycle':
    case 'periodizationBlock':
      return [['mesocycles', athleteEmail], ['workouts'], ['tasksForAthlete', athleteEmail]];
    case 'levelLadder':
    case 'roadmap':
      return [['roadmap', athleteEmail]];
    case 'specialDay':
      return [['roadmap', athleteEmail], ['tasksForAthlete', athleteEmail]];
    case 'weekPlan':
      return [['mesocycles', athleteEmail], ['workouts'], ['nutritionProgram', athleteEmail]];
    case 'nutritionProgram':
      return [['nutritionProgram', athleteEmail], ['dietsForAthlete', athleteEmail]];
    case 'diet':
      return [['dietsForAthlete', athleteEmail]];
    case 'setupConfig':
      return [
        ['userProfiles'], ['athleteNutritionConfig', athleteEmail], ['athleteDietConfig', athleteEmail],
        ['assignmentsForAthlete', athleteEmail], ['photoAssignmentsForAthlete', athleteEmail],
        ['roadmap', athleteEmail], ['cardioAssignments', athleteEmail],
      ];
    case 'publishBlock':
      // Las asignaciones se cachean por UID (ClientHub) y con otra raíz en la
      // pantalla del atleta: se invalidan las dos por prefijo, porque aquí solo
      // tenemos el email.
      return [['workoutAssignments'], ['workoutAssignmentsForAthlete'], ['workouts'], ['mesocycles', athleteEmail]];
    case 'weeklyChallenge':
      return [['weeklyChallenge', athleteEmail], ['weeklyChallengesForAthlete', athleteEmail], ['roadmap', athleteEmail]];
    case 'workoutTemplate':
      return [['workouts']];
    case 'mesocycleTemplate':
      return [['mesocycleTemplates']];
    case 'dossier':
      return [[...dossierKey(athleteEmail)]];
    default:
      return [];
  }
}

/** Qué consultas refrescar según las colecciones que tocó un deshacer. */
const CLAVES_POR_COLECCION: Record<string, (email: string) => unknown[][]> = {
  diets: e => [['dietsForAthlete', e]],
  mesocycles: e => [['mesocycles', e]],
  workouts: () => [['workouts']],
  workoutAssignments: () => [['workoutAssignments'], ['workoutAssignmentsForAthlete']],
  roadmaps: e => [['roadmap', e]],
  nutritionPrograms: e => [['nutritionProgram', e]],
  tasks: e => [['tasksForAthlete', e]],
  athleteStatus: e => [[...dossierKey(e)]],
  user_profiles: () => [['userProfiles']],
  athleteNutritionConfigs: e => [['athleteNutritionConfig', e]],
  athleteDietConfigs: e => [['athleteDietConfig', e]],
  questionnaireAssignments: e => [['assignmentsForAthlete', e]],
  photoAssignments: e => [['photoAssignmentsForAthlete', e]],
  cardioAssignments: e => [['cardioAssignments', e]],
  weeklyChallenges: e => [['weeklyChallenge', e], ['weeklyChallengesForAthlete', e]],
  mesocycleTemplates: () => [['mesocycleTemplates']],
  checkins: () => [['checkins']],
};

class AprobacionYaAvisada extends Error {
  constructor(readonly causa: unknown) { super('aprobación fallida, ya avisada'); }
}

export interface ProposalActions {
  /** Id de la propuesta que se está escribiendo ahora mismo, o null. */
  reviewingId: string | null;
  /** Email del atleta cuyo plan se está aprobando entero, o null. */
  aprobandoTodas: string | null;
  aprobar: (original: AiProposal, editado?: AiProposalPayload, nota?: string) => Promise<boolean>;
  aprobarTodas: (lista: AiProposal[], editsPorId?: Record<string, AiProposalPayload>) => Promise<void>;
  rechazar: (p: AiProposal, motivo?: string) => Promise<void>;
  comentar: (p: AiProposal, texto: string) => Promise<void>;
  /** Vuelve a dejar los documentos como estaban antes de aplicarla. */
  deshacer: (p: AiProposal) => Promise<boolean>;
}

export function useProposalActions(
  { onError, onAprobada }: { onError: (msg: string) => void; onAprobada?: (id: string) => void },
): ProposalActions {
  const queryClient = useQueryClient();
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [aprobandoTodas, setAprobandoTodas] = useState<string | null>(null);
  const setError = onError;

  /** Las dos consultas que enseñan propuestas: la bandeja (todas las
   *  pendientes) y el aviso de la ficha del cliente. Se refrescan juntas o una
   *  de las dos se queda con el número viejo. */
  const refrescarListas = () => {
    queryClient.invalidateQueries({ queryKey: ['aiProposalsPendientes'] });
    queryClient.invalidateQueries({ queryKey: ['aiProposalsForAthlete'] });
    queryClient.invalidateQueries({ queryKey: ['aiProposalsRecientes'] });
  };

  const approveProposal = async (
    original: AiProposal, editado?: AiProposalPayload, nota = '',
  ): Promise<boolean> => {
    setReviewingId(original.id);
    // Se aprueba lo que Dani tiene delante, no lo que propuso la IA.
    const p: AiProposal = editado ? { ...original, payload: editado } : original;
    try {
      const ahora = new Date().toISOString();
      const decision = await aplicarPropuesta(p, lectorDeCliente(), { coachUid: auth.currentUser?.uid ?? '', ahora });
      if (decision.ok === false) {
        setError(decision.motivo);
        throw new AprobacionYaAvisada(new Error(decision.motivo));
      }
      let ejecucion;
      try {
        ejecucion = await ejecutarEnCliente(decision.operaciones);
      } catch (err) {
        // Lo que ya se escribió está vivo: se refresca lo tocado y el error
        // dice cuánto se guardó, no solo «no se pudo».
        for (const op of decision.operaciones) for (const clave of clavesQueRefrescar(p.kind, p.athleteId).concat(op.tipo === 'crearRutina' ? [['workouts']] : [])) {
          queryClient.invalidateQueries({ queryKey: clave });
        }
        setError(err instanceof ErrorDeEjecucion ? err.message : 'No se pudo aprobar la propuesta — inténtalo de nuevo.');
        throw new AprobacionYaAvisada(err);
      }
      const resultEntityId = decision.resultEntityId ?? (decision.resultEntityRef ? ejecucion.refs[decision.resultEntityRef] : undefined);
      const notaLimpia = nota.trim();
      await updateAiProposal(p.id, {
        status: 'approved',
        reviewedAt: ahora,
        aplicadaEn: ahora,
        autor: p.autor ?? 'asistente',
        politica: p.politica ?? 'proponer',
        ...(resultEntityId ? { resultEntityId } : {}),
        // Lo que había antes, documento a documento: con esto «Deshacer»
        // no tiene que adivinar nada.
        snapshotAntes: [...decision.snapshotAntes, ...ejecucion.creados],
        ...(notaLimpia ? { expediente: { datos: '', huecos: '', preguntas: [], esperado: '', ...p.expediente, notaAlAprobar: notaLimpia } } : {}),
      });

      // Lo que se acaba de escribir tiene que verse SIN recargar.
      for (const clave of clavesQueRefrescar(p.kind, p.athleteId)) {
        queryClient.invalidateQueries({ queryKey: clave });
      }

      // Editarla antes de aprobar es la corrección más barata que existe, y la
      // que más dice de su criterio. Se apunta como hecho para que la próxima
      // propuesta ya venga con ella dentro (la IA lo lee en get_athlete_dossier).
      const hechos = [{
        at: ahora,
        kind: 'aprobacion' as const,
        text: notaLimpia ? `${p.summary} — ${notaLimpia}` : p.summary,
        proposalId: p.id,
        chatId: p.chatId,
      }];
      if (editado) {
        hechos.push({
          at: ahora,
          kind: 'aprobacion' as const,
          text: `Dani editó la propuesta antes de aprobarla: ${describirEdicion(original, editado)}`,
          proposalId: p.id,
          chatId: p.chatId,
        });
      }
      appendDossierFacts(p.athleteId, hechos)
        .catch(err => console.warn('No se pudo apuntar la aprobación en la ficha:', err));
      onAprobada?.(p.id);
      refrescarListas();
      return true;
    } catch (err) {
      // El error del guardado ya trae su propio mensaje, con qué se llegó a
      // guardar. Pisarlo con el genérico sería peor que no decir nada.
      if (!(err instanceof AprobacionYaAvisada)) {
        setError('No se pudo aprobar la propuesta — inténtalo de nuevo.');
      }
      return false;
    } finally {
      setReviewingId(null);
    }
  };

  const aprobarTodas = async (lista: AiProposal[], editsPorId: Record<string, AiProposalPayload> = {}) => {
    if (aprobandoTodas) return;
    setAprobandoTodas(lista[0]?.athleteId ?? '');
    setError('');
    try {
      for (const p of ordenarPropuestasPorPlan(lista)) {
        const payload = editsPorId[p.id] ?? p.payload;
        const bloqueo = motivoParaNoAprobar(p.kind, payload);
        if (bloqueo) {
          setError(`Parado en «${p.summary}»: ${bloqueo}`);
          return;
        }
        const ok = await approveProposal(p, editsPorId[p.id]);
        if (!ok) return; // el error ya está puesto; las siguientes siguen pendientes
      }
    } finally {
      setAprobandoTodas(null);
    }
  };

  /* Rechazar guardaba solo el estado. El motivo se perdía, y con él las dos
     cosas para las que sirve: que el asistente pueda leerlo con
     `get_proposal_feedback` y rehacer la propuesta atendiéndolo, y que dentro
     de tres semanas Dani sepa por qué dijo que no a esa. Se guarda como
     comentario, que es el canal que ya lee el asistente — no un campo nuevo
     que nadie mira. */
  const rejectProposal = async (p: AiProposal, motivo?: string) => {
    setReviewingId(p.id);
    const limpio = (motivo ?? '').trim();
    const comentarios = limpio
      ? [...(p.comentarios ?? []), { at: new Date().toISOString(), text: `Rechazada: ${limpio}` }]
      : undefined;
    try {
      await updateAiProposal(p.id, {
        status: 'rejected',
        reviewedAt: new Date().toISOString(),
        ...(comentarios ? { comentarios } : {}),
      });
      onAprobada?.(p.id);
      refrescarListas();
    } catch {
      setError('No se pudo rechazar la propuesta — inténtalo de nuevo.');
    } finally {
      setReviewingId(null);
    }
  };

  /** Un comentario de Dani sobre la propuesta. No la aprueba ni la rechaza:
   *  queda con ella para poder pedirle a la IA que la rehaga atendiéndolos
   *  (los lee con get_proposal_feedback), y para acordarse de por qué no la
   *  aprobó tal cual. */
  const comentar = async (p: AiProposal, texto: string) => {
    const limpio = texto.trim();
    if (!limpio) return;
    const comentario: ProposalComment = { at: new Date().toISOString(), text: limpio };
    const comentarios = [...(p.comentarios ?? []), comentario];
    setReviewingId(p.id);
    try {
      await updateAiProposal(p.id, { comentarios });
      refrescarListas();
    } catch {
      setError('No se pudo guardar el comentario — inténtalo de nuevo.');
    } finally {
      setReviewingId(null);
    }
  };

  /** Deshacer: cada documento del snapshot vuelve a como estaba (o se borra si
   *  no existía), en orden inverso. La propuesta queda `deshecha` y la ficha
   *  apunta que Dani lo deshizo: es la corrección más clara que puede dar. */
  const deshacer = async (p: AiProposal): Promise<boolean> => {
    const plan = planDeDeshacer(p);
    if (plan.ok === false) { setError(plan.motivo); return false; }
    setReviewingId(p.id);
    try {
      await restaurarTodo(plan.fotos);
      const ahora = new Date().toISOString();
      await updateAiProposal(p.id, { status: 'deshecha', deshechaEn: ahora });
      for (const col of coleccionesDe(plan.fotos)) {
        for (const clave of (CLAVES_POR_COLECCION[col]?.(p.athleteId) ?? [])) queryClient.invalidateQueries({ queryKey: clave });
      }
      appendDossierFacts(p.athleteId, [{
        at: ahora, kind: 'cambio', text: `Dani deshizo: ${p.summary}`, proposalId: p.id, chatId: p.chatId,
      }]).catch(err => console.warn('No se pudo apuntar el deshacer en la ficha:', err));
      onAprobada?.(p.id);
      refrescarListas();
      return true;
    } catch (err) {
      console.error('deshacer:', err);
      setError('No se pudo deshacer del todo — revisa el atleta antes de volver a intentarlo.');
      return false;
    } finally {
      setReviewingId(null);
    }
  };

  return { reviewingId, aprobandoTodas, aprobar: approveProposal, aprobarTodas, rechazar: rejectProposal, comentar, deshacer };
}
