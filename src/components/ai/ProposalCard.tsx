/* La tarjeta de una propuesta, tal y como se revisa.
 *
 * La misma en los dos sitios donde aparece: la bandeja del chat (para aprobar
 * sobre la marcha) y la pantalla de Propuestas (para sentarse a revisarlas).
 * Lo que ESCRIBE está en useProposalActions; aquí solo se pinta y se recogen
 * los cambios.
 *
 * El orden de lectura es el que importa: primero el titular, luego qué cambia
 * respecto a lo que el atleta tiene hoy, luego en qué se basó la IA y qué no
 * sabía. El editor, plegado: para decidir no hace falta, y desplegado convierte
 * ocho propuestas en un formulario de tres pantallas.
 */
import React, { useState } from 'react';
import { AiProposal, AiProposalPayload, Diet } from '../../types';
import { Icon, Button } from '../ui';
import ProposalEditor from './ProposalEditor';
import { motivoParaNoAprobar } from '../../utils/edicionPropuesta';
import type { ProposalActions } from './useProposalActions';

interface Props {
  /* Sin `@types/react` en el repo, TS no excluye `key` por su cuenta — mismo
     apaño que Badge/ListRow del design system. */
  key?: React.Key;
  proposal: AiProposal;
  /** Lo que se aprobaría: la propuesta de la IA o lo que ya haya tocado Dani. */
  payload: AiProposalPayload;
  onChangePayload: (nuevo: AiProposalPayload) => void;
  onDescartarEdicion: () => void;
  editada: boolean;
  acciones: ProposalActions;
  /** Numeración dentro del plan del atleta («3/8»). */
  posicion?: { idx: number; total: number };
  /** Solo en el chat: llevarse la dieta al editor de dietas de verdad. */
  onAbrirEnEditorDeDietas?: (p: AiProposal, diet: Omit<Diet, 'id'>) => void;
  /** La pantalla de Propuestas enseña el hilo de comentarios; la bandeja no. */
  conComentarios?: boolean;
}

export default function ProposalCard({
  proposal: p, payload, onChangePayload, onDescartarEdicion, editada,
  acciones, posicion, onAbrirEnEditorDeDietas, conComentarios = false,
}: Props) {
  const [abierta, setAbierta] = useState(false);
  const [nota, setNota] = useState('');
  const [comentario, setComentario] = useState('');
  const bloqueo = motivoParaNoAprobar(p.kind, payload);
  const ocupada = acciones.reviewingId === p.id || !!acciones.aprobandoTodas;
  const comentarios = p.comentarios ?? [];

  return (
    <div className="bg-surface border border-amber-500/25 rounded-surface p-3 flex flex-col gap-2">
      <p className="text-label text-white whitespace-pre-wrap">
        {posicion && posicion.total > 1 && (
          <span className="font-mono text-ink-3 mr-2">{posicion.idx + 1}/{posicion.total}</span>
        )}
        {p.summary}
      </p>
      {p.rationale && <p className="text-caption text-ink-2 italic">{p.rationale}</p>}

      {/* Antes → después frente a lo que el atleta tiene hoy. Lo calcula la
          app al crear la propuesta; sin nada con qué comparar no aparece. */}
      {p.cambios && p.cambios.length > 0 && (
        <ul className="text-caption text-ink-2 bg-bg border border-hairline rounded-surface p-3 space-y-0.5">
          <li className="text-ink-4 uppercase tracking-wide font-mono">Qué cambia</li>
          {p.cambios.map((c, i) => <li key={i}>{c}</li>)}
        </ul>
      )}

      {/* El expediente es lo que se perdía al cerrar el chat: en qué se apoyó,
          qué no sabía y qué queda por preguntar. Se lee ANTES de aprobar. */}
      {p.expediente && (p.expediente.huecos || p.expediente.esperado || p.expediente.preguntas.length > 0) && (
        <div className="flex flex-col gap-1 bg-bg border border-hairline rounded-surface p-3">
          {p.expediente.esperado && (
            <p className="text-caption text-ink-2"><span className="text-ink-4">Espera ver:</span> {p.expediente.esperado}</p>
          )}
          {p.expediente.huecos && (
            <p className="text-caption text-ink-2"><span className="text-ink-4">No sabía:</span> {p.expediente.huecos}</p>
          )}
          {p.expediente.preguntas.length > 0 && (
            <ul className="text-caption text-ink-2 list-disc pl-4">
              {p.expediente.preguntas.map((q, i) => <li key={i}>{q}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* Comentarios: ni aprueban ni rechazan. Sirven para decirle a la IA qué
          está mal sin tirar la propuesta, y para acordarse de por qué no se
          aprobó tal cual. */}
      {conComentarios && comentarios.length > 0 && (
        <ul className="flex flex-col gap-1 bg-bg border border-accent-line/40 rounded-surface p-3">
          <li className="text-caption text-ink-4 uppercase tracking-wide font-mono">Tus comentarios</li>
          {comentarios.map((c, i) => (
            <li key={i} className="text-caption text-ink-2">
              <span className="font-mono text-ink-4">{c.at.slice(0, 10)}</span> · {c.text}
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => setAbierta(v => !v)}
        className="flex items-center gap-1 self-start text-caption uppercase tracking-wide text-ink-3 hover:text-accent transition-colors"
      >
        <Icon name={abierta ? 'expand_less' : 'expand_more'} size="s" />
        {abierta ? 'Ocultar el detalle' : (editada ? 'Seguir ajustando' : 'Ver y ajustar el detalle')}
      </button>
      {abierta && <ProposalEditor proposal={p} payload={payload} onChange={onChangePayload} />}

      {editada && (
        <div className="flex items-center gap-2">
          <span className="text-caption text-accent">Editada por ti</span>
          <button type="button" onClick={onDescartarEdicion} className="text-caption text-ink-4 underline">
            volver a la propuesta original
          </button>
        </div>
      )}

      {abierta && (
        <input
          value={nota}
          onChange={e => setNota(e.target.value)}
          placeholder="Por qué la apruebas así (opcional)"
          className="w-full bg-field border border-hairline rounded-control px-3 py-2 text-caption text-ink placeholder:text-ink-4 focus:border-accent-line focus:outline-none"
        />
      )}

      {/* Las comidas se cuadran en el editor de dietas, no aquí: allí están el
          buscador de alimentos, las recetas y el balance de colocado vs
          presupuesto. */}
      {p.kind === 'diet' && onAbrirEnEditorDeDietas && (
        <Button variant="secondary" icon="edit_note" onClick={() => onAbrirEnEditorDeDietas(p, payload as Omit<Diet, 'id'>)}>
          Abrir en el editor de dietas
        </Button>
      )}

      {bloqueo && <p className="text-caption text-warning">{bloqueo}</p>}

      <div className="flex gap-2 pt-1">
        <button
          onClick={() => acciones.aprobar(p, editada ? payload : undefined, nota)}
          disabled={ocupada || !!bloqueo}
          className="flex-1 py-2 rounded-control bg-success/15 border border-success/40 text-success text-caption font-bold uppercase tracking-wide disabled:opacity-40"
        >
          Aprobar
        </button>
        <button
          onClick={() => acciones.rechazar(p)}
          disabled={ocupada}
          className="flex-1 py-2 rounded-control bg-danger/10 border border-danger/30 text-danger text-caption font-bold uppercase tracking-wide disabled:opacity-40"
        >
          Rechazar
        </button>
      </div>

      {conComentarios && (
        <div className="flex gap-2 items-center">
          <input
            value={comentario}
            onChange={e => setComentario(e.target.value)}
            onKeyDown={e => {
              if (e.key !== 'Enter' || !comentario.trim()) return;
              void acciones.comentar(p, comentario).then(() => setComentario(''));
            }}
            placeholder="Comenta sin aprobar ni rechazar…"
            className="flex-1 bg-field border border-hairline rounded-control px-3 py-2 text-caption text-ink placeholder:text-ink-4 focus:border-accent-line focus:outline-none"
          />
          <Button
            variant="secondary"
            size="s"
            icon="edit_note"
            disabled={!comentario.trim() || ocupada}
            onClick={() => void acciones.comentar(p, comentario).then(() => setComentario(''))}
          >
            Comentar
          </Button>
        </div>
      )}
    </div>
  );
}
