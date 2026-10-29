/* Las TRES propuestas visuales de «Lo que ha hecho el asistente» (la línea de
   tiempo de un atleta, diseño §5.2). La lógica (leer episodios y propuestas,
   construir la línea) vive en LineaDeTiempoAsistente.tsx; aquí solo cambia
   cómo se ve. Se comparan en /dev/autopiloto y al final queda una:

   A · Tabla por semana — como el guion del diseño: una fila por episodio con
                          S·fecha, tipo, qué se decidió y cómo acabó. Se lee
                          de arriba abajo como un parte.
   B · Hilo              — una línea vertical con un punto por episodio
                          (color = cómo acabó) y las decisiones colgando;
                          la semana cambia de bloque. Se parece a Hecho hoy B.
   C · Tarjetas          — una tarjeta plegada por episodio: cabecera con
                          fecha, tipo y recuento; se despliega para ver las
                          decisiones, el expediente y el texto al atleta.

   Las tres comparten la cabecera (política, recuentos, esperado) y el bloque
   «Plan inicial vs ahora». */
import React, { useState } from 'react';
import type { DecisionDeLinea, DesenlaceDecision, EntradaDeLinea, LineaDeTiempo } from '../../autopiloto/lineaDeTiempo';
import type { ModoAutopiloto } from '../../autopiloto/politica';
import { Icon } from '../ui';

export type VarianteLinea = 'A' | 'B' | 'C';

export interface LineaDeTiempoVistaProps {
  variante: VarianteLinea;
  linea: LineaDeTiempo;
  modo: ModoAutopiloto;
  cargando?: boolean;
  /** Abrir la propuesta en la pantalla de Propuestas (o donde toque). */
  onIrAPropuesta?: (proposalId: string) => void;
  /** En modo presentación todo un punto más grande y sin controles. */
  presentando?: boolean;
}

export const ETIQUETA_DESENLACE: Record<DesenlaceDecision, string> = {
  automatico: 'automático', aviso: 'con aviso', aprobada: 'aprobaste', editada: 'aprobaste con cambios',
  rechazada: 'rechazaste', deshecha: 'deshecha', pendiente: 'pendiente', sombra: 'sombra', caducada: 'caducada',
};
const TONO_DESENLACE: Record<DesenlaceDecision, string> = {
  automatico: 'text-success', aviso: 'text-data', aprobada: 'text-accent-ink', editada: 'text-accent-ink',
  rechazada: 'text-danger', deshecha: 'text-danger', pendiente: 'text-warning', sombra: 'text-ink-3', caducada: 'text-ink-3',
};
const PUNTO_DESENLACE: Record<DesenlaceDecision, string> = {
  automatico: 'bg-success', aviso: 'bg-data', aprobada: 'bg-accent', editada: 'bg-accent',
  rechazada: 'bg-danger', deshecha: 'bg-danger', pendiente: 'bg-warning', sombra: 'bg-ink-3', caducada: 'bg-ink-3',
};
const ETIQUETA_MODO: Record<ModoAutopiloto, string> = { sombra: 'sombra', rodaje: 'rodaje', politica: 'política' };

export function fechaCorta(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split('-');
  return `${d}-${m}`;
}

/** El desenlace que resume una entrada: el peor de sus decisiones. */
export function desenlaceDeEntrada(e: EntradaDeLinea): DesenlaceDecision | null {
  const orden: DesenlaceDecision[] = ['rechazada', 'deshecha', 'pendiente', 'editada', 'aviso', 'aprobada', 'automatico', 'sombra', 'caducada'];
  for (const d of orden) if (e.decisiones.some(x => x.desenlace === d)) return d;
  return null;
}

function Esperado({ v }: { v: boolean | null }) {
  if (v === null) return <span className="font-mono text-caption text-ink-4" title="Esperado sin comprobar">—</span>;
  return v
    ? <span className="font-mono text-caption text-success" title="Cumplió lo esperado">✓</span>
    : <span className="font-mono text-caption text-danger" title="No cumplió lo esperado">✗</span>;
}

export default function LineaDeTiempoVista(props: LineaDeTiempoVistaProps) {
  const { linea, cargando } = props;
  if (cargando) return <p className="font-sans text-label text-ink-3">Leyendo lo que ha hecho…</p>;
  if (linea.entradas.length === 0) {
    return (
      <div className="space-y-2">
        <Cabecera {...props} />
        <p className="font-sans text-label text-ink-3">El asistente todavía no ha hecho nada con este atleta.</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <Cabecera {...props} />
      {props.variante === 'B' ? <VistaB {...props} /> : props.variante === 'C' ? <VistaC {...props} /> : <VistaA {...props} />}
      <PlanInicialVsAhora linea={linea} />
    </div>
  );
}

/* Piezas compartidas ------------------------------------------------------ */

function Cabecera({ linea, modo }: LineaDeTiempoVistaProps) {
  const d = linea.porDesenlace;
  const auto = (d.automatico ?? 0) + (d.aviso ?? 0);
  const dani = (d.aprobada ?? 0) + (d.editada ?? 0) + (d.rechazada ?? 0);
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 font-mono text-caption text-ink-3">
      <span>política: <span className="text-ink-2">{ETIQUETA_MODO[modo]}</span></span>
      <span>· {linea.episodios} {linea.episodios === 1 ? 'episodio' : 'episodios'}</span>
      {auto > 0 && <span>· {auto} solo</span>}
      {dani > 0 && <span>· {dani} por ti</span>}
      {(d.pendiente ?? 0) > 0 && <span className="text-warning">· {d.pendiente} pendiente{d.pendiente === 1 ? '' : 's'}</span>}
      {linea.esperado.comprobadas > 0 && (
        <span>· esperado <span className="text-ink-2">{linea.esperado.cumplidas}/{linea.esperado.comprobadas}</span> ✓</span>
      )}
    </div>
  );
}

function PlanInicialVsAhora({ linea }: { linea: LineaDeTiempo }) {
  if (linea.derivasDelAlta.length === 0) return null;
  return (
    <div className="border border-hairline rounded-surface p-3 space-y-1.5">
      <p className="font-mono text-caption uppercase tracking-widest text-ink-3">Plan inicial vs ahora</p>
      <ul className="space-y-1">
        {linea.derivasDelAlta.map(d => (
          <li key={d.proposalId} className="font-sans text-caption text-ink-2">
            <span className="text-ink font-bold">{d.que}</span> · {d.cambios.join(' · ')}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Decision({ d, onIr, presentando }: { d: DecisionDeLinea; onIr?: (id: string) => void; presentando?: boolean; key?: React.Key }) {
  const texto = presentando ? 'text-label' : 'text-caption';
  return (
    <div className={`flex items-baseline gap-2 min-w-0 ${texto}`}>
      <Esperado v={d.esperado} />
      <span className="font-sans text-ink-2 min-w-0 truncate" title={d.summary}>
        {d.cambios.length > 0 ? d.cambios.join(' · ') : d.summary}
      </span>
      <span className={`font-mono whitespace-nowrap ${TONO_DESENLACE[d.desenlace]}`}>{ETIQUETA_DESENLACE[d.desenlace]}</span>
      {onIr && !presentando && (
        <button type="button" onClick={() => onIr(d.proposalId)} className="font-mono text-ink-4 hover:text-accent-ink" aria-label="Abrir la propuesta">
          <Icon name="open_in_new" size="s" />
        </button>
      )}
    </div>
  );
}

/* A · Tabla por semana ---------------------------------------------------- */

function VistaA({ linea, onIrAPropuesta, presentando }: LineaDeTiempoVistaProps) {
  return (
    <div className="border border-hairline rounded-surface overflow-hidden">
      <table className="w-full table-fixed">
        <tbody>
          {linea.entradas.map(e => (
            <tr key={e.id} className="border-b border-hairline last:border-b-0 align-top">
              <td className="w-[4.5rem] px-2.5 py-2 font-mono text-caption text-ink-3 whitespace-nowrap">
                {e.semana !== undefined && <span className="text-ink-2">S{e.semana} </span>}{fechaCorta(e.fecha)}
              </td>
              <td className="w-[6.5rem] px-1 py-2 font-mono text-caption text-ink-2 truncate">
                {e.etiqueta}
                {e.estado === 'escalado' && <span className="text-warning"> · escalado</span>}
                {e.estado === 'fallido' && <span className="text-danger"> · falló</span>}
              </td>
              <td className="px-2 py-2 space-y-0.5 min-w-0">
                {e.alertas.length > 0 && <p className="font-sans text-caption text-warning">⚠ {e.alertas.join(' · ')}</p>}
                {e.decisiones.length === 0
                  ? <p className="font-sans text-caption text-ink-3 italic">{e.paraDani || 'Sin decisiones'}</p>
                  : e.decisiones.map(d => <Decision key={d.proposalId} d={d} onIr={onIrAPropuesta} presentando={presentando} />)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* B · Hilo ---------------------------------------------------------------- */

function VistaB({ linea, onIrAPropuesta, presentando }: LineaDeTiempoVistaProps) {
  let semanaAnterior: number | undefined | null = null;
  return (
    <ol className="relative pl-5 space-y-3 m-0 list-none">
      <span className="absolute left-[7px] top-1 bottom-1 w-px bg-hairline" aria-hidden />
      {linea.entradas.map(e => {
        const cambiaSemana = e.semana !== semanaAnterior;
        semanaAnterior = e.semana;
        const des = desenlaceDeEntrada(e);
        return (
          <li key={e.id} className="relative space-y-1">
            {cambiaSemana && e.semana !== undefined && (
              <p className="font-mono text-caption uppercase tracking-widest text-ink-4 -ml-5 pl-5 bg-bg">Semana {e.semana}</p>
            )}
            <span className={`absolute -left-5 top-[0.45rem] h-2.5 w-2.5 rounded-full ring-2 ring-bg ${des ? PUNTO_DESENLACE[des] : 'bg-ink-3'}`} aria-hidden />
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-mono text-caption text-ink-3">{fechaCorta(e.fecha)}</span>
              <span className="font-sans text-label font-bold text-ink">{e.etiqueta}</span>
              {e.estado === 'escalado' && <span className="font-mono text-caption text-warning">escalado</span>}
              {e.costeUsd !== undefined && e.costeUsd > 0 && !presentando && <span className="font-mono text-caption text-ink-4">{e.costeUsd.toFixed(2)} $</span>}
            </div>
            {e.alertas.length > 0 && <p className="font-sans text-caption text-warning">⚠ {e.alertas.join(' · ')}</p>}
            {e.decisiones.map(d => <Decision key={d.proposalId} d={d} onIr={onIrAPropuesta} presentando={presentando} />)}
            {e.paraDani && <p className="font-sans text-caption text-ink-3 italic">{e.paraDani}</p>}
          </li>
        );
      })}
    </ol>
  );
}

/* C · Tarjetas ------------------------------------------------------------ */

function VistaC({ linea, onIrAPropuesta, presentando }: LineaDeTiempoVistaProps) {
  const [abiertas, setAbiertas] = useState<Set<string>>(() => new Set(linea.entradas.slice(0, 1).map(e => e.id)));
  const toggle = (id: string) => setAbiertas(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <div className="space-y-1.5">
      {linea.entradas.map(e => {
        const abierta = presentando || abiertas.has(e.id);
        const des = desenlaceDeEntrada(e);
        return (
          <div key={e.id} className="border border-hairline rounded-surface bg-surface">
            <button type="button" onClick={() => toggle(e.id)} className="flex w-full items-center gap-2 px-3 py-2 text-left" aria-expanded={abierta}>
              <span className={`h-2 w-2 rounded-full shrink-0 ${des ? PUNTO_DESENLACE[des] : 'bg-ink-3'}`} aria-hidden />
              <span className="font-mono text-caption text-ink-3 whitespace-nowrap">{e.semana !== undefined ? `S${e.semana} · ` : ''}{fechaCorta(e.fecha)}</span>
              <span className="font-sans text-label font-bold text-ink truncate">{e.etiqueta}</span>
              <span className="font-mono text-caption text-ink-3 ml-auto whitespace-nowrap">
                {e.decisiones.length} {e.decisiones.length === 1 ? 'decisión' : 'decisiones'}
                {des && <span className={` ${TONO_DESENLACE[des]}`}> · {ETIQUETA_DESENLACE[des]}</span>}
              </span>
              {!presentando && <Icon name={abierta ? 'expand_less' : 'expand_more'} size="s" className="text-ink-3 shrink-0" />}
            </button>
            {abierta && (
              <div className="px-3 pb-3 space-y-1.5 border-t border-hairline pt-2">
                {e.alertas.length > 0 && <p className="font-sans text-caption text-warning">⚠ {e.alertas.join(' · ')}</p>}
                {e.decisiones.map(d => (
                  <div key={d.proposalId} className="space-y-0.5">
                    <Decision d={d} onIr={onIrAPropuesta} presentando={presentando} />
                    {d.nota && <p className="font-sans text-caption text-ink-3 pl-5">{d.nota}</p>}
                    {d.paraAtleta && <p className="font-sans text-caption text-ink-2 pl-5 border-l-2 border-accent-line ml-1 italic">«{d.paraAtleta}»</p>}
                  </div>
                ))}
                {e.paraDani && <p className="font-sans text-caption text-ink-3">{e.paraDani}</p>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
