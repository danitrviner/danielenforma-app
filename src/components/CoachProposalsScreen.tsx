/* Propuestas — la zona para revisarlas sentado.
 *
 * Hasta ahora las propuestas de la IA solo existían en la bandeja del panel
 * del asistente: media columna de un cajón lateral, encima del chat, y solo
 * las del cliente que estuviera abierto en la URL. Revisar ahí el plan de un
 * mes —ocho propuestas encadenadas, cada una con su editor— no es revisar, es
 * pelearse con un hueco.
 *
 * Esto es la misma información a pantalla completa, agrupada por atleta y con
 * una cosa que la bandeja no tiene: COMENTARIOS. Un comentario no aprueba ni
 * rechaza; queda con la propuesta y la IA lo lee (get_proposal_feedback), así
 * que se le puede decir «el volumen de dorsal se queda corto» y pedirle que la
 * rehaga, en vez de tener que elegir entre tragarla o tirarla.
 */
import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AiProposal, AiProposalPayload } from '../types';
import { getPendingAiProposals, getAllUserProfiles } from '../dbService';
import { agruparPropuestasPorAtleta } from '../utils/ordenPropuestas';
import { OPEN_AI_PANEL_EVENT, OpenAiPanelDetail } from '../ai/events';
import ProposalCard from './ai/ProposalCard';
import { useProposalActions } from './ai/useProposalActions';
import { Icon, Button, EmptyState, Skeleton } from './ui';

export default function CoachProposalsScreen() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, AiProposalPayload>>({});

  const { data: proposals = [], isPending } = useQuery({
    queryKey: ['aiProposalsPendientes'],
    queryFn: getPendingAiProposals,
  });
  const { data: perfiles = [] } = useQuery({
    queryKey: ['userProfiles'],
    queryFn: getAllUserProfiles,
  });

  const acciones = useProposalActions({
    onError: msg => setError(msg || null),
    onAprobada: id => setEdits(prev => { const { [id]: _quitado, ...resto } = prev; return resto; }),
  });

  const grupos = useMemo(() => agruparPropuestasPorAtleta(proposals), [proposals]);
  const nombreDe = (email: string) =>
    perfiles.find(u => u.email.toLowerCase() === email.toLowerCase())?.displayName || email;

  /** Devolverle a la IA lo comentado para que rehaga sus propuestas. El panel
   *  del asistente recibe el prompt ya escrito y lo manda: las propuestas
   *  nuevas vuelven aquí como cualquier otra. */
  const pedirQueLasRehaga = (email: string, lista: AiProposal[]) => {
    const conComentarios = lista.filter(p => (p.comentarios ?? []).length > 0);
    const cuales = conComentarios.length > 0
      ? conComentarios.map(p => `«${p.summary}»`).join(', ')
      : 'las que tiene pendientes';
    window.dispatchEvent(new CustomEvent<OpenAiPanelDetail>(OPEN_AI_PANEL_EVENT, {
      detail: {
        prompt: `Lee mis comentarios con get_proposal_feedback para ${email} y vuelve a proponer ${cuales} atendiéndolos. `
          + 'Di en una línea qué has cambiado respecto a la propuesta anterior por cada comentario.',
        enviar: true,
      },
    }));
  };

  if (isPending) {
    return (
      <div className="p-4 space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full rounded-surface" />
        <Skeleton className="h-40 w-full rounded-surface" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-5 max-w-3xl mx-auto">
      <div>
        <h1 className="font-sans font-bold text-title-m tracking-tight text-white uppercase flex items-center gap-2">
          <Icon name="smart_toy" size="l" filled className="text-accent" />
          Propuestas
        </h1>
        <p className="font-sans text-label text-ink-2 mt-1">
          Todo lo que el asistente ha propuesto y está sin decidir. Nada de esto lo ve el atleta hasta que lo apruebes.
        </p>
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/30 text-danger rounded-surface px-4 py-3 text-label">
          {error}
        </div>
      )}

      {grupos.length === 0 ? (
        <div className="border border-dashed border-hairline rounded-surface">
          <EmptyState
            icon="checklist"
            title="No hay nada por revisar"
            description="Cuando le pidas al asistente que monte o ajuste el plan de un cliente, sus propuestas aparecen aquí."
          />
        </div>
      ) : (
        grupos.map(({ email, lista }) => (
          <section key={email} className="space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap border-b border-hairline pb-2">
              <div className="min-w-0">
                <button
                  type="button"
                  onClick={() => navigate(`/clients/${encodeURIComponent(email)}/setup`)}
                  className="font-sans font-bold text-body-s text-white hover:text-accent transition-colors text-left"
                >
                  {nombreDe(email)}
                </button>
                <p className="font-mono text-caption text-ink-2">
                  {lista.length === 1 ? '1 propuesta' : `${lista.length} pasos, en el orden en que se aprueban`}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button variant="secondary" size="s" icon="smart_toy" onClick={() => pedirQueLasRehaga(email, lista)}>
                  Rehacer con mis comentarios
                </Button>
                {lista.length > 1 && (
                  <Button
                    size="s"
                    icon={acciones.aprobandoTodas === email ? 'progress_activity' : 'check_circle'}
                    disabled={!!acciones.aprobandoTodas || !!acciones.reviewingId}
                    onClick={() => acciones.aprobarTodas(lista, edits)}
                  >
                    {acciones.aprobandoTodas === email ? 'Aprobando…' : 'Aprobar todo en orden'}
                  </Button>
                )}
              </div>
            </div>

            {lista.map((p, idx, todas) => (
              <ProposalCard
                key={p.id}
                proposal={p}
                payload={edits[p.id] ?? p.payload}
                editada={!!edits[p.id]}
                onChangePayload={nuevo => setEdits(prev => ({ ...prev, [p.id]: nuevo }))}
                onDescartarEdicion={() => setEdits(prev => { const { [p.id]: _q, ...resto } = prev; return resto; })}
                acciones={acciones}
                posicion={{ idx, total: todas.length }}
                conComentarios
              />
            ))}
          </section>
        ))
      )}
    </div>
  );
}
