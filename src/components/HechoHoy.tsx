/* «Hecho hoy»: lo que se aplicó en las últimas 24 h, lo hiciera Dani al
   aprobar una propuesta, el latido de la noche o (más adelante) el asistente
   solo. Cada fila dice qué cambió y por qué, y se puede DESHACER si guardó el
   snapshot de antes. Antes de esto el latido escribía y nadie lo veía: solo un
   recuento sin nombres en `latidos/{fecha}`.

   Vive en la pantalla de inicio del coach, encima de la bandeja del día. */
import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AiProposal, UserProfile } from '../types';
import { getAiProposalsRecientes } from '../dbService';
import { useProposalActions } from './ai/useProposalActions';
import { planDeDeshacer } from '../autopiloto/deshacer';
import { Icon } from './ui';

const HORAS = 24;

const ETIQUETA_AUTOR: Record<string, string> = {
  latido: 'latido', asistente: 'asistente', coach: 'tú',
};
const ETIQUETA_POLITICA: Record<string, string> = {
  automatico: 'automático', aviso: 'con aviso', proponer: 'aprobada por ti', sombra: 'sombra',
};

function hora(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function HechoHoy({ athletes }: { athletes: UserProfile[] }) {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(true);
  const desde = useMemo(() => new Date(Date.now() - HORAS * 3600_000).toISOString(), []);
  const { data: recientes = [] } = useQuery({
    queryKey: ['aiProposalsRecientes', desde],
    queryFn: () => getAiProposalsRecientes(desde),
  });
  const acciones = useProposalActions({ onError: msg => setError(msg || null) });

  const nombreDe = (email: string) => athletes.find(a => a.email.toLowerCase() === email.toLowerCase())?.displayName || email;

  if (recientes.length === 0) return null;

  return (
    <section className="space-y-2">
      <button
        type="button"
        onClick={() => setAbierto(a => !a)}
        className="flex w-full items-baseline gap-2 text-left"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-success" />
        <span className="font-mono text-caption uppercase tracking-widest text-ink-3">
          Hecho hoy · {recientes.length}
        </span>
        <span className="font-mono text-caption text-ink-3 truncate">
          lo que se aplicó en las últimas {HORAS} h · con deshacer
        </span>
        <Icon name={abierto ? 'expand_less' : 'expand_more'} size="s" className="ml-auto text-ink-3" />
      </button>

      {error && (
        <div className="bg-danger/10 border border-danger/30 text-danger rounded-surface px-4 py-3 text-caption">{error}</div>
      )}

      {abierto && (
        <ul className="divide-y divide-hairline overflow-hidden rounded-field border border-hairline bg-surface">
          {recientes.map(p => <Fila key={p.id} p={p} nombre={nombreDe(p.athleteId)} acciones={acciones} navigate={navigate} />)}
        </ul>
      )}
    </section>
  );
}

function Fila({ p, nombre, acciones, navigate }: {
  /* Sin `@types/react` en el repo, TS no excluye `key` por su cuenta — mismo
     apaño que ProposalCard. */
  key?: React.Key;
  p: AiProposal; nombre: string;
  acciones: ReturnType<typeof useProposalActions>;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const plan = planDeDeshacer(p);
  const textoPlan = plan.ok === true ? plan.resumen : plan.motivo;
  const deshecha = p.status === 'deshecha';
  const cuando = p.deshechaEn ?? p.aplicadaEn ?? p.reviewedAt ?? p.createdAt;
  const ocupada = acciones.reviewingId === p.id;

  return (
    <li className={`px-4 py-3 flex flex-col gap-1 ${deshecha ? 'opacity-60' : ''}`}>
      <div className="flex items-baseline gap-2 min-w-0">
        <button
          type="button"
          onClick={() => navigate(`/clients/${encodeURIComponent(p.athleteId)}/revision`)}
          className="font-sans font-bold text-body-s text-ink hover:text-accent-ink text-left truncate"
        >
          {nombre}
        </button>
        <span className="font-mono text-caption text-ink-3">{hora(cuando)}</span>
        <span className="font-mono text-caption text-ink-3 rounded-chip bg-hairline px-2">
          {ETIQUETA_AUTOR[p.autor ?? 'asistente']} · {deshecha ? 'deshecha' : ETIQUETA_POLITICA[p.politica ?? 'proponer']}
        </span>
      </div>
      <p className={`text-label text-ink ${deshecha ? 'line-through' : ''}`}>{p.summary}</p>
      {p.cambios && p.cambios.length > 0 && p.cambios.join(' · ') !== p.summary && (
        <p className="text-caption text-ink-2">{p.cambios.slice(0, 3).join(' · ')}{p.cambios.length > 3 ? ` · +${p.cambios.length - 3}` : ''}</p>
      )}
      {!deshecha && (
        <div className="flex gap-3 pt-1">
          {confirmando ? (
            <>
              <span className="text-caption text-ink-2">{textoPlan}.</span>
              {plan.ok && (
                <button type="button" disabled={ocupada} onClick={() => void acciones.deshacer(p).then(() => setConfirmando(false))}
                  className="text-caption font-bold uppercase tracking-wide text-danger disabled:opacity-40">
                  Sí, deshacer
                </button>
              )}
              <button type="button" onClick={() => setConfirmando(false)} className="text-caption uppercase tracking-wide text-ink-3">
                Cancelar
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmando(true)}
              disabled={ocupada}
              title={textoPlan}
              className={`text-caption font-bold uppercase tracking-wide ${plan.ok ? 'text-ink-2 hover:text-danger' : 'text-ink-4'} disabled:opacity-40`}
            >
              Deshacer
            </button>
          )}
        </div>
      )}
    </li>
  );
}
