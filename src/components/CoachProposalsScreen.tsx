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
 *
 * Desde el autopiloto (tanda 8, diseño §5.4) la pantalla tiene dos pestañas:
 * PROPUESTAS, con filtros «pendientes / aplicadas / rechazadas / sombra» (hasta
 * ahora solo las pendientes: lo que el asistente aplicaba solo no se veía en
 * ningún sitio salvo «Hecho hoy» durante 24 h), y CALIDAD, la auditoría de
 * cinco minutos de la semana. Las no pendientes se enseñan en una tarjeta de
 * solo lectura con lo que pasó, y las aplicadas con «Deshacer».
 */
import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AiProposal, AiProposalPayload } from '../types';
import { getAiProposalsPorEstado, getAllUserProfilesOrThrow } from '../dbService';
import { agruparPropuestasPorAtleta } from '../utils/ordenPropuestas';
import { ESTADOS_POR_FILTRO, FILTROS_PROPUESTAS, type FiltroPropuestas } from '../autopiloto/calidad';
import { planDeDeshacer } from '../autopiloto/deshacer';
import { OPEN_AI_PANEL_EVENT, OpenAiPanelDetail } from '../ai/events';
import ProposalCard from './ai/ProposalCard';
import { useProposalActions, type ProposalActions } from './ai/useProposalActions';
import CalidadAutopiloto from './autopiloto/CalidadAutopiloto';
import { Icon, Button, EmptyState, Skeleton, Tabs, Chip } from './ui';

type Pestana = 'propuestas' | 'calidad';
const esFiltro = (v: string | null): v is FiltroPropuestas => FILTROS_PROPUESTAS.some(f => f.id === v);

export default function CoachProposalsScreen() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const pestana: Pestana = params.get('pestana') === 'calidad' ? 'calidad' : 'propuestas';
  const filtro: FiltroPropuestas = esFiltro(params.get('filtro')) ? (params.get('filtro') as FiltroPropuestas) : 'pendientes';
  const destacada = params.get('propuesta');
  const [error, setError] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, AiProposalPayload>>({});

  const cambiar = (cambios: Record<string, string | null>) => {
    const siguiente = new URLSearchParams(params);
    for (const [k, v] of Object.entries(cambios)) { if (v === null) siguiente.delete(k); else siguiente.set(k, v); }
    setParams(siguiente, { replace: true });
  };

  const estados = ESTADOS_POR_FILTRO[filtro];
  const { data: proposals = [], isPending } = useQuery({
    // La clave del filtro pendiente es la de siempre: la invalidan las acciones.
    queryKey: filtro === 'pendientes' ? ['aiProposalsPendientes'] : ['aiProposalsPorEstado', ...estados],
    queryFn: () => getAiProposalsPorEstado(estados),
    enabled: pestana === 'propuestas',
  });
  const { data: perfiles = [] } = useQuery({ queryKey: ['userProfiles'], queryFn: getAllUserProfilesOrThrow });

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

  const ayuda = FILTROS_PROPUESTAS.find(f => f.id === filtro)!.ayuda;

  return (
    <div className="pantalla p-4 space-y-5 max-w-3xl mx-auto">
      <div>
        <h1 className="font-sans font-bold text-title-m tracking-tight text-ink uppercase flex items-center gap-2">
          <Icon name="smart_toy" size="l" filled className="text-accent-ink" />
          Propuestas
        </h1>
        <p className="font-sans text-label text-ink-2 mt-1">
          {pestana === 'calidad'
            ? 'Cinco decisiones que el asistente aplicó solo la semana pasada, al azar. Di si estuvieron bien; «no vuelvas» le baja ese tipo de decisión a propuesta.'
            : ayuda}
        </p>
      </div>

      <Tabs
        label="Zonas de Propuestas"
        value={pestana}
        onChange={id => cambiar({ pestana: id === 'calidad' ? 'calidad' : null })}
        items={[{ id: 'propuestas', label: 'Propuestas', icon: 'inbox' }, { id: 'calidad', label: 'Calidad', icon: 'fact_check' }]}
      />

      {error && (
        <div className="bg-danger/10 border border-danger/30 text-danger rounded-surface px-4 py-3 text-label">
          {error}
        </div>
      )}

      {pestana === 'calidad' ? <CalidadAutopiloto /> : (
        <>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtro de propuestas">
            {FILTROS_PROPUESTAS.map(f => (
              <Chip key={f.id} selected={filtro === f.id} onClick={() => cambiar({ filtro: f.id === 'pendientes' ? null : f.id, propuesta: null })}>
                {f.etiqueta}
              </Chip>
            ))}
          </div>

          {isPending ? (
            <div className="space-y-3">
              <Skeleton className="h-40 w-full rounded-surface" />
              <Skeleton className="h-40 w-full rounded-surface" />
            </div>
          ) : grupos.length === 0 ? (
            <div className="border border-dashed border-hairline rounded-surface">
              <EmptyState
                icon="checklist"
                title={filtro === 'pendientes' ? 'No hay nada por revisar' : 'Nada por aquí'}
                description={filtro === 'pendientes'
                  ? 'Cuando le pidas al asistente que monte o ajuste el plan de un cliente, sus propuestas aparecen aquí.'
                  : filtro === 'sombra'
                    ? 'En modo sombra el asistente decide sin escribir; lo que habría hecho aparece aquí para compararlo con lo tuyo.'
                    : 'Todavía no hay propuestas en este estado.'}
              />
            </div>
          ) : (
            grupos.map(({ email, lista }) => (
              <section key={email} className="space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap border-b border-hairline pb-2">
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => navigate(`/clients/${encodeURIComponent(email)}/${filtro === 'pendientes' ? 'setup' : 'revision'}`)}
                      className="font-sans font-bold text-body-s text-ink hover:text-accent-ink transition-colors text-left"
                    >
                      {nombreDe(email)}
                    </button>
                    <p className="font-mono text-caption text-ink-2">
                      {filtro === 'pendientes'
                        ? (lista.length === 1 ? '1 propuesta' : `${lista.length} pasos, en el orden en que se aprueban`)
                        : `${lista.length} ${lista.length === 1 ? 'decisión' : 'decisiones'}`}
                    </p>
                  </div>
                  {filtro === 'pendientes' && (
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
                  )}
                </div>

                {filtro === 'pendientes'
                  ? lista.map((p, idx, todas) => (
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
                  ))
                  : lista.map(p => <PropuestaDecididaCard key={p.id} proposal={p} acciones={acciones} destacada={destacada === p.id} />)}
              </section>
            ))
          )}
        </>
      )}
    </div>
  );
}

/* ── Una propuesta ya decidida, de solo lectura ─────────────────────────── */

const ETIQUETA_ESTADO: Record<AiProposal['status'], string> = {
  proposed: 'pendiente', approved: 'aprobada por ti', rejected: 'rechazada', aplicada: 'aplicada por el asistente',
  deshecha: 'deshecha', caducada: 'caducada', sombra: 'sombra: no se escribió',
};
const ETIQUETA_POLITICA: Record<string, string> = { automatico: 'automático', aviso: 'con aviso', proponer: 'propuesta', sombra: 'sombra' };
const ETIQUETA_AUTOR: Record<string, string> = { asistente: 'asistente', latido: 'latido', coach: 'tú' };
const fecha = (iso?: string) => iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

export function PropuestaDecididaCard({ proposal: p, acciones, destacada = false }: { proposal: AiProposal; acciones: ProposalActions; destacada?: boolean; key?: React.Key }) {
  const [confirmando, setConfirmando] = useState(false);
  const [abierta, setAbierta] = useState(destacada);
  const cuando = p.deshechaEn ?? p.aplicadaEn ?? p.reviewedAt ?? p.createdAt;
  const rechazo = (p.comentarios ?? []).filter(c => c.text.startsWith('Rechazada:')).at(-1);
  const plan = (p.status === 'aplicada' || p.status === 'approved') ? planDeDeshacer(p) : null;
  const borde = destacada ? 'border-accent-line' : p.status === 'rejected' || p.status === 'deshecha' ? 'border-danger/25' : 'border-hairline';
  return (
    <div className={`bg-surface border ${borde} rounded-surface p-3 flex flex-col gap-1.5`}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 font-mono text-caption text-ink-3">
        <span>{fecha(cuando)}</span>
        <span className="rounded-chip bg-hairline px-2">{ETIQUETA_AUTOR[p.autor ?? 'asistente']} · {ETIQUETA_ESTADO[p.status]}</span>
        {p.politica && p.status === 'aplicada' && <span>{ETIQUETA_POLITICA[p.politica]}</span>}
        {p.resultado && p.resultado.cumplioEsperado !== null && (
          <span className={p.resultado.cumplioEsperado ? 'text-success' : 'text-danger'}>{p.resultado.cumplioEsperado ? '✓ cumplió lo esperado' : '✗ no cumplió lo esperado'}</span>
        )}
        {p.calidad && <span>calidad: {p.calidad.veredicto.replace('_', ' ')}</span>}
      </div>
      <p className="font-sans text-label text-ink whitespace-pre-wrap">{p.summary}</p>
      {p.cambios && p.cambios.length > 0 && (
        <ul className="font-sans text-caption text-ink-2 bg-bg border border-hairline rounded-surface p-2.5 space-y-0.5">
          <li className="font-mono text-ink-4 uppercase tracking-wide">Qué cambió</li>
          {p.cambios.map((c, i) => <li key={i}>{c}</li>)}
        </ul>
      )}
      {rechazo && <p className="font-sans text-caption text-danger">{rechazo.text}</p>}
      {p.resultado?.nota && <p className="font-sans text-caption text-ink-3">{p.resultado.nota}</p>}
      <button type="button" onClick={() => setAbierta(v => !v)} className="flex items-center gap-1 self-start font-mono text-caption uppercase tracking-wide text-ink-3 hover:text-accent-ink">
        <Icon name={abierta ? 'expand_less' : 'expand_more'} size="s" />{abierta ? 'Menos' : 'Expediente y texto'}
      </button>
      {abierta && (
        <div className="space-y-1.5 font-sans text-caption text-ink-2">
          {p.rationale && <p className="italic">{p.rationale}</p>}
          {p.expediente?.datos && <p><span className="text-ink-4">Se apoyó en:</span> {p.expediente.datos}</p>}
          {p.expediente?.esperado && <p><span className="text-ink-4">Esperaba:</span> {p.expediente.esperado}</p>}
          {p.expediente?.notaAlAprobar && <p><span className="text-ink-4">Tu nota al aprobar:</span> {p.expediente.notaAlAprobar}</p>}
          {p.paraAtleta && <p className="border-l-2 border-accent-line pl-2.5 italic">«{p.paraAtleta}»</p>}
          {(p.comentarios ?? []).filter(c => c !== rechazo).map((c, i) => <p key={i}><span className="font-mono text-ink-4">{c.at.slice(0, 10)}</span> · {c.text}</p>)}
        </div>
      )}
      {plan && (
        <div className="flex flex-wrap items-baseline gap-3 pt-1 border-t border-hairline">
          {confirmando ? (
            <>
              <span className="font-sans text-caption text-ink-2">{plan.ok === true ? plan.resumen : plan.motivo}</span>
              {plan.ok === true && (
                <button type="button" disabled={acciones.reviewingId === p.id} onClick={() => acciones.deshacer(p).then(() => setConfirmando(false))}
                  className="font-mono text-caption uppercase tracking-wider text-danger">{acciones.reviewingId === p.id ? 'Deshaciendo…' : 'Sí, deshacer'}</button>
              )}
              <button type="button" onClick={() => setConfirmando(false)} className="font-mono text-caption text-ink-4 underline">cancelar</button>
            </>
          ) : (
            <button type="button" onClick={() => setConfirmando(true)} className="font-mono text-caption uppercase tracking-wider text-ink-3 hover:text-danger inline-flex items-center gap-1">
              <Icon name="undo" size="s" /> Deshacer
            </button>
          )}
        </div>
      )}
    </div>
  );
}
