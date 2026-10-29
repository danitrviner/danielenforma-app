/* Las TRES propuestas visuales de CALIDAD, «la auditoría de 5 minutos»
   (diseño §5.4). La lógica (la muestra, guardar el veredicto, bajar el nivel
   con «no vuelvas») vive en CalidadAutopiloto.tsx; aquí solo cambia cómo se ve.
   Se comparan en /dev/autopiloto y al final queda una:

   A · Una a una   — una tarjeta grande con la decisión, el expediente, los
                     datos del motor y el texto al atleta; tres botones
                     abajo; «2 de 5» arriba. Se hace como un repaso.
   B · Lista       — las cinco a la vista, cada una con el detalle plegado y
                     los tres botones a la derecha. Para ir rápido.
   C · Tabla       — compacta: atleta, decisión, tipo, fecha y el veredicto
                     en una columna de tres iconos. Para cuando sean muchas.

   Los tres botones pesan igual a propósito: «bien» no es la salida fácil. */
import React, { useState } from 'react';
import type { AiProposal } from '../../types';
import type { ResumenCalidad, Veredicto } from '../../autopiloto/calidad';
import { ETIQUETA_DECISION, tipoDeDecision } from '../../autopiloto/politica';
import { Icon } from '../ui';

export type VarianteCalidad = 'A' | 'B' | 'C';

export interface CalidadVistaProps {
  variante: VarianteCalidad;
  /** Lunes de la semana auditada (YYYY-MM-DD). */
  semana: string;
  muestra: AiProposal[];
  /** Cuántas automáticas hubo esa semana en total. */
  total: number;
  resumen: ResumenCalidad;
  nombreDe: (email: string) => string;
  juzgandoId: string | null;
  error: string | null;
  onVeredicto: (p: AiProposal, veredicto: Veredicto, nota: string) => Promise<unknown>;
  onIrAlAtleta?: (email: string) => void;
}

export const ETIQUETA_VEREDICTO: Record<Veredicto, string> = { bien: 'Bien', mal: 'Mal', no_vuelvas: 'No vuelvas' };
const ICONO_VEREDICTO: Record<Veredicto, string> = { bien: 'thumb_up', mal: 'thumb_down', no_vuelvas: 'block' };
const TONO_VEREDICTO: Record<Veredicto, string> = { bien: 'text-success', mal: 'text-warning', no_vuelvas: 'text-danger' };

function semanaTexto(lunes: string): string {
  const d = new Date(`${lunes}T12:00:00`);
  const fin = new Date(d); fin.setDate(fin.getDate() + 6);
  const f = (x: Date) => `${x.getDate()} ${x.toLocaleDateString('es-ES', { month: 'short' })}`;
  return `${f(d)} – ${f(fin)}`;
}
const fechaHora = (iso?: string) => iso ? new Date(iso).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }) : '';

export default function CalidadVista(props: CalidadVistaProps) {
  const { muestra, total, semana, resumen, error } = props;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="font-mono text-caption uppercase tracking-widest text-ink-3">Semana {semanaTexto(semana)}</p>
        <p className="font-mono text-caption text-ink-3">
          {total === 0 ? 'ninguna decisión automática' : `${muestra.length} de ${total} automáticas, al azar`}
        </p>
        {resumen.juzgadas > 0 && (
          <p className="font-mono text-caption text-ink-3 ml-auto">
            histórico · <span className="text-success">{resumen.bien} bien</span> · <span className="text-warning">{resumen.mal} mal</span> · <span className="text-danger">{resumen.noVuelvas} no vuelvas</span>
            {resumen.tasa !== null && <> · {Math.round(resumen.tasa * 100)} %</>}
          </p>
        )}
      </div>
      {error && <div className="bg-danger/10 border border-danger/30 text-danger rounded-surface px-4 py-3 text-caption">{error}</div>}
      {muestra.length === 0
        ? <p className="font-sans text-label text-ink-3">Nada que auditar esta semana: el asistente no aplicó ninguna decisión solo.</p>
        : props.variante === 'B' ? <VistaB {...props} /> : props.variante === 'C' ? <VistaC {...props} /> : <VistaA {...props} />}
    </div>
  );
}

/* Piezas compartidas ------------------------------------------------------ */

function Detalle({ p, compacto = false }: { p: AiProposal; compacto?: boolean }) {
  const tipo = tipoDeDecision(p);
  return (
    <div className={`space-y-1.5 ${compacto ? 'text-caption' : 'text-label'}`}>
      <p className="font-mono text-caption text-ink-3">{ETIQUETA_DECISION[tipo]} · aplicada {fechaHora(p.aplicadaEn)}</p>
      {p.rationale && <p className="font-sans text-ink-2 italic">{p.rationale}</p>}
      {p.cambios && p.cambios.length > 0 && (
        <ul className="font-sans text-ink-2 bg-bg border border-hairline rounded-surface p-2.5 space-y-0.5">
          <li className="font-mono text-caption text-ink-4 uppercase tracking-wide">Qué cambió</li>
          {p.cambios.map((c, i) => <li key={i}>{c}</li>)}
        </ul>
      )}
      {p.expediente && (p.expediente.datos || p.expediente.esperado || p.expediente.huecos) && (
        <div className="font-sans text-ink-2 bg-bg border border-hairline rounded-surface p-2.5 space-y-0.5">
          {p.expediente.datos && <p><span className="text-ink-4">Se apoyó en:</span> {p.expediente.datos}</p>}
          {p.expediente.esperado && <p><span className="text-ink-4">Espera ver:</span> {p.expediente.esperado}</p>}
          {p.expediente.huecos && <p><span className="text-ink-4">No sabía:</span> {p.expediente.huecos}</p>}
        </div>
      )}
      {p.paraAtleta && (
        <p className="font-sans text-ink-2 border-l-2 border-accent-line pl-2.5 italic">
          <span className="font-mono text-caption text-ink-4 not-italic block">Le llegó al atleta</span>«{p.paraAtleta}»
        </p>
      )}
    </div>
  );
}

function Botones({ p, juzgando, onVeredicto, tamano = 'm' }: { p: AiProposal; juzgando: boolean; onVeredicto: CalidadVistaProps['onVeredicto']; tamano?: 's' | 'm' }) {
  const [pidiendoNota, setPidiendoNota] = useState<Veredicto | null>(null);
  const [nota, setNota] = useState('');
  const dado = p.calidad?.veredicto;
  const pad = tamano === 's' ? 'px-2 py-1' : 'px-3 py-2';
  const confirmar = async () => { if (!pidiendoNota) return; await onVeredicto(p, pidiendoNota, nota); setPidiendoNota(null); setNota(''); };
  if (dado) {
    return (
      <p className={`font-mono text-caption ${TONO_VEREDICTO[dado]} flex items-center gap-1`}>
        <Icon name={ICONO_VEREDICTO[dado]} size="s" /> {ETIQUETA_VEREDICTO[dado]}
        {p.calidad?.nota && <span className="text-ink-3 font-sans"> · {p.calidad.nota}</span>}
      </p>
    );
  }
  if (pidiendoNota) {
    return (
      <div className="flex flex-wrap items-center gap-2 w-full">
        <input value={nota} onChange={e => setNota(e.target.value)} autoFocus
          placeholder={pidiendoNota === 'no_vuelvas' ? 'Qué no debe repetir (se lo guardo como instrucción fija)' : 'Qué estuvo mal (opcional)'}
          className="flex-1 min-w-[12rem] bg-field border border-control-line rounded-control px-3 py-1.5 text-caption text-ink placeholder:text-ink-4 focus:border-accent-line focus:outline-none" />
        <button type="button" onClick={confirmar} disabled={juzgando} className={`font-mono text-caption uppercase tracking-wider rounded-chip border ${TONO_VEREDICTO[pidiendoNota]} border-current ${pad}`}>
          {juzgando ? '…' : `Confirmar ${ETIQUETA_VEREDICTO[pidiendoNota].toLowerCase()}`}
        </button>
        <button type="button" onClick={() => setPidiendoNota(null)} className="font-mono text-caption text-ink-4 underline">cancelar</button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      {(['bien', 'mal', 'no_vuelvas'] as Veredicto[]).map(v => (
        <button key={v} type="button" disabled={juzgando}
          onClick={() => (v === 'bien' ? onVeredicto(p, v, '') : setPidiendoNota(v))}
          className={`inline-flex items-center gap-1 rounded-chip border border-hairline bg-raised font-mono text-caption uppercase tracking-wider text-ink-2 hover:border-current ${pad} hover:${TONO_VEREDICTO[v]}`}>
          <Icon name={ICONO_VEREDICTO[v]} size="s" /> {ETIQUETA_VEREDICTO[v]}
        </button>
      ))}
    </div>
  );
}

/* A · Una a una ------------------------------------------------------------ */

function VistaA({ muestra, nombreDe, juzgandoId, onVeredicto, onIrAlAtleta }: CalidadVistaProps) {
  const primeraSinJuzgar = Math.max(0, muestra.findIndex(p => !p.calidad));
  const [i, setI] = useState(primeraSinJuzgar);
  const p = muestra[Math.min(i, muestra.length - 1)];
  const juzgadas = muestra.filter(x => x.calidad).length;
  return (
    <div className="bg-surface border border-hairline rounded-surface p-4 space-y-3 max-w-2xl">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {muestra.map((x, idx) => (
            <button key={x.id} type="button" onClick={() => setI(idx)} aria-label={`Decisión ${idx + 1}`}
              className={`h-1.5 rounded-full transition-all ${idx === i ? 'w-6 bg-accent' : x.calidad ? 'w-3 bg-success/60' : 'w-3 bg-hairline'}`} />
          ))}
        </div>
        <p className="font-mono text-caption text-ink-3">{i + 1} de {muestra.length} · {juzgadas} juzgadas</p>
      </div>
      <div>
        <button type="button" onClick={() => onIrAlAtleta?.(p.athleteId)} className="font-sans text-label font-bold text-ink hover:text-accent-ink text-left">{nombreDe(p.athleteId)}</button>
        <p className="font-sans text-body-s text-ink">{p.summary}</p>
      </div>
      <Detalle p={p} />
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-hairline">
        <Botones p={p} juzgando={juzgandoId === p.id} onVeredicto={async (x, v, n) => { await onVeredicto(x, v, n); if (i < muestra.length - 1) setI(i + 1); }} />
        <div className="flex items-center gap-1">
          <button type="button" disabled={i === 0} onClick={() => setI(i - 1)} className="text-ink-3 disabled:opacity-30" aria-label="Anterior"><Icon name="chevron_left" size="s" /></button>
          <button type="button" disabled={i >= muestra.length - 1} onClick={() => setI(i + 1)} className="text-ink-3 disabled:opacity-30" aria-label="Siguiente"><Icon name="chevron_right" size="s" /></button>
        </div>
      </div>
    </div>
  );
}

/* B · Lista ---------------------------------------------------------------- */

function VistaB({ muestra, nombreDe, juzgandoId, onVeredicto, onIrAlAtleta }: CalidadVistaProps) {
  const [abierta, setAbierta] = useState<string | null>(null);
  return (
    <ul className="m-0 p-0 list-none space-y-1.5">
      {muestra.map((p, idx) => (
        <li key={p.id} className="bg-surface border border-hairline rounded-surface p-3 space-y-2">
          <div className="flex flex-wrap items-start gap-2">
            <span className="font-mono text-caption text-ink-4 pt-0.5">{idx + 1}</span>
            <div className="min-w-0 flex-1">
              <button type="button" onClick={() => onIrAlAtleta?.(p.athleteId)} className="font-sans text-caption font-bold text-ink hover:text-accent-ink">{nombreDe(p.athleteId)}</button>
              <p className="font-sans text-label text-ink">{p.summary}</p>
              <button type="button" onClick={() => setAbierta(abierta === p.id ? null : p.id)} className="font-mono text-caption text-ink-3 hover:text-accent-ink inline-flex items-center gap-0.5">
                <Icon name={abierta === p.id ? 'expand_less' : 'expand_more'} size="s" /> {abierta === p.id ? 'menos' : 'expediente y texto'}
              </button>
            </div>
            <Botones p={p} juzgando={juzgandoId === p.id} onVeredicto={onVeredicto} tamano="s" />
          </div>
          {abierta === p.id && <div className="pl-5"><Detalle p={p} compacto /></div>}
        </li>
      ))}
    </ul>
  );
}

/* C · Tabla ---------------------------------------------------------------- */

function VistaC({ muestra, nombreDe, juzgandoId, onVeredicto, onIrAlAtleta }: CalidadVistaProps) {
  const [abierta, setAbierta] = useState<string | null>(null);
  return (
    <div className="border border-hairline rounded-surface overflow-x-auto">
      <table className="w-full min-w-[40rem]">
        <thead>
          <tr className="font-mono text-caption uppercase tracking-wider text-ink-4 text-left border-b border-hairline">
            <th className="px-2.5 py-1.5 font-normal">Atleta</th><th className="px-2.5 py-1.5 font-normal">Decisión</th>
            <th className="px-2.5 py-1.5 font-normal">Tipo</th><th className="px-2.5 py-1.5 font-normal">Cuándo</th><th className="px-2.5 py-1.5 font-normal">Veredicto</th>
          </tr>
        </thead>
        <tbody>
          {muestra.map(p => (
            <React.Fragment key={p.id}>
              <tr className="border-b border-hairline last:border-b-0 align-top">
                <td className="px-2.5 py-2 whitespace-nowrap"><button type="button" onClick={() => onIrAlAtleta?.(p.athleteId)} className="font-sans text-caption font-bold text-ink hover:text-accent-ink">{nombreDe(p.athleteId)}</button></td>
                <td className="px-2.5 py-2">
                  <button type="button" onClick={() => setAbierta(abierta === p.id ? null : p.id)} className="font-sans text-caption text-ink text-left hover:text-accent-ink">{p.summary}</button>
                </td>
                <td className="px-2.5 py-2 font-mono text-caption text-ink-3 whitespace-nowrap">{ETIQUETA_DECISION[tipoDeDecision(p)].split(' (')[0]}</td>
                <td className="px-2.5 py-2 font-mono text-caption text-ink-3 whitespace-nowrap">{fechaHora(p.aplicadaEn)}</td>
                <td className="px-2.5 py-2"><Botones p={p} juzgando={juzgandoId === p.id} onVeredicto={onVeredicto} tamano="s" /></td>
              </tr>
              {abierta === p.id && (
                <tr className="border-b border-hairline bg-bg"><td colSpan={5} className="px-2.5 py-2"><Detalle p={p} compacto /></td></tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
