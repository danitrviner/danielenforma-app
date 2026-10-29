/* Las TRES propuestas visuales de «Hecho hoy» (29-10-2026). La lógica (leer
   lo aplicado, deshacer) vive en HechoHoy.tsx; aquí solo cambia cómo se ve. Se
   comparan en /dev/autopiloto y al final queda una:

   A · Lista      — una fila por cambio con quién, hora, etiqueta y «Deshacer».
   B · Cronología — hora en la columna izquierda y una línea vertical con un
                    punto por autor (latido / asistente / tú); se lee como el
                    día.
   C · Por atleta — agrupado por atleta, compacto, con el recuento al lado
                    del nombre; cada grupo se despliega. Para cuando haya
                    muchos cambios al día. */
import React, { useState } from 'react';
import type { AiProposal } from '../../types';
import { planDeDeshacer } from '../../autopiloto/deshacer';
import { Icon } from '../ui';

export type VarianteHechoHoy = 'A' | 'B' | 'C';

export interface HechoHoyVistaProps {
  variante: VarianteHechoHoy;
  recientes: AiProposal[];
  horas: number;
  error: string | null;
  ocupadaId: string | null;
  nombreDe: (email: string) => string;
  onIr: (email: string) => void;
  onDeshacer: (p: AiProposal) => Promise<unknown>;
}

const ETIQUETA_AUTOR: Record<string, string> = { latido: 'latido', asistente: 'asistente', coach: 'tú' };
const ETIQUETA_POLITICA: Record<string, string> = { automatico: 'automático', aviso: 'con aviso', proponer: 'aprobada por ti', sombra: 'sombra' };
const PUNTO_AUTOR: Record<string, string> = { latido: 'bg-data', asistente: 'bg-success', coach: 'bg-accent' };

export function hora(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
const cuandoDe = (p: AiProposal) => p.deshechaEn ?? p.aplicadaEn ?? p.reviewedAt ?? p.createdAt;

export default function HechoHoyVista(props: HechoHoyVistaProps) {
  if (props.recientes.length === 0) return null;
  if (props.variante === 'B') return <VistaB {...props} />;
  if (props.variante === 'C') return <VistaC {...props} />;
  return <VistaA {...props} />;
}

/* Piezas compartidas ------------------------------------------------------ */

function Titulo({ n, horas, abierto, onToggle, texto }: { n: number; horas: number; abierto: boolean; onToggle: () => void; texto?: string }) {
  return (
    <button type="button" onClick={onToggle} className="flex w-full items-baseline gap-2 text-left">
      <span className="h-1.5 w-1.5 rounded-full bg-success" />
      <span className="font-mono text-caption uppercase tracking-widest text-ink-3">Hecho hoy · {n}</span>
      <span className="font-mono text-caption text-ink-3 truncate">{texto ?? `lo que se aplicó en las últimas ${horas} h · con deshacer`}</span>
      <Icon name={abierto ? 'expand_less' : 'expand_more'} size="s" className="ml-auto text-ink-3" />
    </button>
  );
}

function Error_({ error }: { error: string | null }) {
  return error ? <div className="bg-danger/10 border border-danger/30 text-danger rounded-surface px-4 py-3 text-caption">{error}</div> : null;
}

function Etiqueta({ p }: { p: AiProposal }) {
  const deshecha = p.status === 'deshecha';
  return (
    <span className="font-mono text-caption text-ink-3 rounded-chip bg-hairline px-2 whitespace-nowrap">
      {ETIQUETA_AUTOR[p.autor ?? 'asistente']} · {deshecha ? 'deshecha' : ETIQUETA_POLITICA[p.politica ?? 'proponer']}
    </span>
  );
}

function Deshacer({ p, ocupada, onDeshacer, alineado = 'izquierda' }: { p: AiProposal; ocupada: boolean; onDeshacer: (p: AiProposal) => Promise<unknown>; alineado?: 'izquierda' | 'derecha' }) {
  const [confirmando, setConfirmando] = useState(false);
  if (p.status === 'deshecha') return null;
  const plan = planDeDeshacer(p);
  const textoPlan = plan.ok === true ? plan.resumen : plan.motivo;
  return (
    <div className={`flex flex-wrap items-baseline gap-3 ${alineado === 'derecha' ? 'justify-end' : ''}`}>
      {confirmando ? (
        <>
          <span className="text-caption text-ink-2">{textoPlan}.</span>
          {plan.ok && (
            <button type="button" disabled={ocupada} onClick={() => void onDeshacer(p).then(() => setConfirmando(false))}
              className="text-caption font-bold uppercase tracking-wide text-danger disabled:opacity-40">Sí, deshacer</button>
          )}
          <button type="button" onClick={() => setConfirmando(false)} className="text-caption uppercase tracking-wide text-ink-3">Cancelar</button>
        </>
      ) : (
        <button type="button" onClick={() => setConfirmando(true)} disabled={ocupada} title={textoPlan}
          className={`text-caption font-bold uppercase tracking-wide ${plan.ok ? 'text-ink-2 hover:text-danger' : 'text-ink-4'} disabled:opacity-40`}>
          Deshacer
        </button>
      )}
    </div>
  );
}

function Cambios({ p }: { p: AiProposal }) {
  if (!p.cambios || p.cambios.length === 0 || p.cambios.join(' · ') === p.summary) return null;
  return <p className="text-caption text-ink-2">{p.cambios.slice(0, 3).join(' · ')}{p.cambios.length > 3 ? ` · +${p.cambios.length - 3}` : ''}</p>;
}

/* A · Lista ---------------------------------------------------------------- */

function VistaA({ recientes, horas, error, ocupadaId, nombreDe, onIr, onDeshacer }: HechoHoyVistaProps) {
  const [abierto, setAbierto] = useState(true);
  return (
    <section className="space-y-2">
      <Titulo n={recientes.length} horas={horas} abierto={abierto} onToggle={() => setAbierto(a => !a)} />
      <Error_ error={error} />
      {abierto && (
        <ul className="divide-y divide-hairline overflow-hidden rounded-field border border-hairline bg-surface">
          {recientes.map(p => {
            const deshecha = p.status === 'deshecha';
            return (
              <li key={p.id} className={`px-4 py-3 flex flex-col gap-1 ${deshecha ? 'opacity-60' : ''}`}>
                <div className="flex items-baseline gap-2 min-w-0">
                  <button type="button" onClick={() => onIr(p.athleteId)} className="font-sans font-bold text-body-s text-ink hover:text-accent-ink text-left truncate">{nombreDe(p.athleteId)}</button>
                  <span className="font-mono text-caption text-ink-3">{hora(cuandoDe(p))}</span>
                  <Etiqueta p={p} />
                </div>
                <p className={`text-label text-ink ${deshecha ? 'line-through' : ''}`}>{p.summary}</p>
                <Cambios p={p} />
                <div className="pt-1"><Deshacer p={p} ocupada={ocupadaId === p.id} onDeshacer={onDeshacer} /></div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* B · Cronología ----------------------------------------------------------- */

function VistaB({ recientes, horas, error, ocupadaId, nombreDe, onIr, onDeshacer }: HechoHoyVistaProps) {
  const [abierto, setAbierto] = useState(true);
  const porAutor = (a: string) => recientes.filter(p => (p.autor ?? 'asistente') === a).length;
  const leyenda = (['latido', 'asistente', 'coach'] as const).filter(a => porAutor(a) > 0).map(a => `${porAutor(a)} ${ETIQUETA_AUTOR[a]}`).join(' · ');
  return (
    <section className="space-y-2">
      <Titulo n={recientes.length} horas={horas} abierto={abierto} onToggle={() => setAbierto(a => !a)} texto={leyenda} />
      <Error_ error={error} />
      {abierto && (
        <ol className="relative rounded-field border border-hairline bg-surface px-4 py-2">
          <span aria-hidden className="absolute left-[4.6rem] top-3 bottom-3 w-px bg-hairline" />
          {recientes.map(p => {
            const deshecha = p.status === 'deshecha';
            return (
              <li key={p.id} className={`relative grid grid-cols-[3rem_1rem_1fr] gap-x-3 py-2 ${deshecha ? 'opacity-60' : ''}`}>
                <span className="font-mono text-caption text-ink-3 text-right pt-0.5">{hora(cuandoDe(p))}</span>
                <span className="flex justify-center pt-1.5">
                  <span className={`h-2.5 w-2.5 rounded-full ring-2 ring-surface ${deshecha ? 'bg-ink-4' : PUNTO_AUTOR[p.autor ?? 'asistente']}`} />
                </span>
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <button type="button" onClick={() => onIr(p.athleteId)} className="font-sans font-bold text-body-s text-ink hover:text-accent-ink text-left">{nombreDe(p.athleteId)}</button>
                    <span className="font-mono text-caption text-ink-3">{ETIQUETA_AUTOR[p.autor ?? 'asistente']} · {deshecha ? 'deshecha' : ETIQUETA_POLITICA[p.politica ?? 'proponer']}</span>
                  </div>
                  <p className={`text-label text-ink ${deshecha ? 'line-through' : ''}`}>{p.summary}</p>
                  <Cambios p={p} />
                  <Deshacer p={p} ocupada={ocupadaId === p.id} onDeshacer={onDeshacer} />
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/* C · Por atleta ----------------------------------------------------------- */

function VistaC({ recientes, horas, error, ocupadaId, nombreDe, onIr, onDeshacer }: HechoHoyVistaProps) {
  const [abierto, setAbierto] = useState(true);
  const [desplegado, setDesplegado] = useState<string | null>(null);
  const grupos = new Map<string, AiProposal[]>();
  for (const p of recientes) grupos.set(p.athleteId, [...(grupos.get(p.athleteId) ?? []), p]);
  return (
    <section className="space-y-2">
      <Titulo n={recientes.length} horas={horas} abierto={abierto} onToggle={() => setAbierto(a => !a)} texto={`${grupos.size} atletas · últimas ${horas} h`} />
      <Error_ error={error} />
      {abierto && (
        <ul className="divide-y divide-hairline overflow-hidden rounded-field border border-hairline bg-surface">
          {[...grupos.entries()].map(([email, lista]) => {
            const esta = desplegado === email;
            const autores = [...new Set(lista.map(p => p.autor ?? 'asistente'))];
            return (
              <li key={email}>
                <div className="flex items-center gap-2 px-4 py-2.5">
                  <span className="flex -space-x-1">{autores.map(a => <span key={a} className={`h-2 w-2 rounded-full ring-2 ring-surface ${PUNTO_AUTOR[a]}`} />)}</span>
                  <button type="button" onClick={() => onIr(email)} className="font-sans font-bold text-body-s text-ink hover:text-accent-ink text-left truncate">{nombreDe(email)}</button>
                  <span className="font-mono text-caption text-ink-3 rounded-chip bg-hairline px-2">{lista.length}</span>
                  {!esta && <span className="font-sans text-caption text-ink-2 truncate">{lista[0].summary}{lista.length > 1 ? ` · +${lista.length - 1}` : ''}</span>}
                  <button type="button" onClick={() => setDesplegado(esta ? null : email)} aria-label={esta ? 'Plegar' : 'Desplegar'} className="ml-auto text-ink-3">
                    <Icon name={esta ? 'expand_less' : 'expand_more'} size="s" />
                  </button>
                </div>
                {esta && (
                  <ul className="border-t border-hairline bg-raised/40 divide-y divide-hairline">
                    {lista.map(p => {
                      const deshecha = p.status === 'deshecha';
                      return (
                        <li key={p.id} className={`pl-10 pr-4 py-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 ${deshecha ? 'opacity-60' : ''}`}>
                          <p className={`text-label text-ink ${deshecha ? 'line-through' : ''}`}>{p.summary}</p>
                          <span className="font-mono text-caption text-ink-3 whitespace-nowrap">{hora(cuandoDe(p))}</span>
                          <div className="flex flex-wrap items-baseline gap-2"><Etiqueta p={p} /><Cambios p={p} /></div>
                          <Deshacer p={p} ocupada={ocupadaId === p.id} onDeshacer={onDeshacer} alineado="derecha" />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
