/* Elegida por Dani el 29-10-2026: la variante B (semáforo); las otras dos se
   compararon en /dev/autopiloto y se retiraron.

   Las TRES propuestas visuales de la pantalla de política del autopiloto
   (29-10-2026). La lógica (leer, guardar, estadísticas, subida) vive en
   PoliticaAutopiloto.tsx; aquí solo cambia cómo se enseña. Se comparan en
   /dev/autopiloto y al final queda una:

   A · Tarjetas    — tres tarjetas de modo, campos de presupuesto, lista con
                     un desplegable por tipo. La más literal.
   B · Semáforo    — modo en píldora segmentada; tabla de tres columnas
                     (automático / aviso / me lo propone) con un punto por
                     fila; se ve de un vistazo cuánto hay en cada columna.
   C · Por bloques — los tipos agrupados por área (nutrición, entreno,
                     comunicación, siempre tú) con un resumen en lenguaje
                     corriente arriba; cada bloque se despliega. */
import React, { useState } from 'react';
import {
  ETIQUETA_DECISION, NIVEL_DESTINO, NUNCA_AUTOMATICO, SIEMPRE_HUMANO, evaluarSubida, nivelDe,
  type EstadisticaDeTipo, type NivelAutonomia, type PoliticaAutopiloto as Politica, type TipoDecision,
} from '../../autopiloto/politica';
import { Icon } from '../ui';

export interface PoliticaVistaProps {
  politica: Politica;
  stats: Map<TipoDecision, EstadisticaDeTipo>;
  guardando: boolean;
  msg: string | null;
  /** Gasto del mes en curso, si se conoce (solo para pintarlo contra el presupuesto). */
  gastoMesUsd?: number;
  onGuardar: (nueva: Politica) => void;
}

export const MODOS: { id: Politica['modo']; titulo: string; texto: string }[] = [
  { id: 'sombra', titulo: 'Sombra', texto: 'El asistente decide y lo apunta, pero no escribe ni propone nada. Se compara con lo que haces tú.' },
  { id: 'rodaje', titulo: 'Rodaje', texto: 'Todo lo que decide te lo propone y lo apruebas tú. Lo determinista del latido (sesiones perdidas, fase, reto) sigue solo.' },
  { id: 'politica', titulo: 'Política', texto: 'Manda la tabla: lo automático se aplica y sale en «Hecho hoy»; lo de aviso puedes deshacerlo 24 h; el resto te lo propone.' },
];
export const NIVELES: { id: NivelAutonomia; etiqueta: string; corta: string }[] = [
  { id: 'automatico', etiqueta: 'Automático', corta: 'Auto' },
  { id: 'aviso', etiqueta: 'Con aviso', corta: 'Aviso' },
  { id: 'proponer', etiqueta: 'Me lo propone', corta: 'Propone' },
];
const TIPOS = Object.keys(ETIQUETA_DECISION) as TipoDecision[];
const PUNTO: Record<NivelAutonomia, string> = { automatico: 'bg-success', aviso: 'bg-warning', proponer: 'bg-ink-3' };

export default function PoliticaVista(props: PoliticaVistaProps) {
  return <Vista {...props} />;
}

/* Piezas compartidas ------------------------------------------------------ */

function Cabecera({ hijos }: { hijos?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="font-sans font-bold text-title-s text-ink">Autopiloto</p>
        <p className="font-sans text-label text-ink-2 leading-relaxed mt-1">
          Qué decide el asistente solo, qué te avisa y qué espera a que lo apruebes. Lo clínico, el mesociclo y lo comercial nunca se aplican solos, pongas lo que pongas.
        </p>
      </div>
      {hijos}
    </div>
  );
}

function Presupuesto({ politica, gastoMesUsd, onGuardar, compacto = false }: Pick<PoliticaVistaProps, 'politica' | 'gastoMesUsd' | 'onGuardar'> & { compacto?: boolean }) {
  const [local, setLocal] = useState(politica.presupuesto);
  const campo = 'bg-field border border-control-line rounded-control px-3 py-2 font-mono text-label text-ink w-full';
  const pct = gastoMesUsd != null && politica.presupuesto.mesUsd > 0 ? Math.min(100, Math.round(gastoMesUsd / politica.presupuesto.mesUsd * 100)) : null;
  return (
    <div className={`grid gap-3 ${compacto ? 'sm:grid-cols-[1fr_1fr_2fr]' : 'sm:grid-cols-3'}`}>
      <label className="flex flex-col gap-1">
        <span className="font-mono text-caption uppercase tracking-wider text-ink-3">Al mes ($)</span>
        <input type="number" min={0} value={local.mesUsd} className={campo}
          onChange={e => setLocal({ ...local, mesUsd: Number(e.target.value) })}
          onBlur={() => onGuardar({ ...politica, presupuesto: local })} />
        {pct != null && (
          <span className="font-mono text-caption text-ink-3">{gastoMesUsd!.toFixed(2)} $ gastados · {pct} %
            <span className="block h-1 mt-1 rounded-full bg-hairline overflow-hidden"><span className={`block h-full ${pct >= 90 ? 'bg-danger' : 'bg-data'}`} style={{ width: `${pct}%` }} /></span>
          </span>
        )}
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-mono text-caption uppercase tracking-wider text-ink-3">Tope al día ($)</span>
        <input type="number" min={0} step={0.5} value={local.diaUsd} className={campo}
          onChange={e => setLocal({ ...local, diaUsd: Number(e.target.value) })}
          onBlur={() => onGuardar({ ...politica, presupuesto: local })} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-mono text-caption uppercase tracking-wider text-ink-3">Menú de la semana</span>
        <select value={politica.menuAutomatico} onChange={e => onGuardar({ ...politica, menuAutomatico: e.target.value as Politica['menuAutomatico'] })}
          className="bg-field border border-control-line rounded-control px-3 py-2 font-sans text-label text-ink">
          <option value="borrador">Borrador: lo publico yo</option>
          <option value="borrador24h">Borrador 24 h y luego se publica solo</option>
          <option value="publicar">Se publica solo</option>
        </select>
      </label>
    </div>
  );
}

function Cifras({ e }: { e?: EstadisticaDeTipo }) {
  if (!e) return null;
  return (
    <span className="font-mono text-caption text-ink-3 whitespace-nowrap" title="aprobadas sin tocar · editadas · rechazadas · deshechas">
      {e.aprobadasSinCambios}✓ {e.editadas}✎ {e.rechazadas}✗ {e.deshechas}↩
    </span>
  );
}

function Mensaje({ msg }: { msg: string | null }) {
  return msg ? <p className="flex items-center gap-2 font-mono text-caption text-data"><Icon name="info" size="s" />{msg}</p> : null;
}

/* Semáforo ------------------------------------------------------------- */

function Vista({ politica, stats, guardando, msg, gastoMesUsd, onGuardar }: PoliticaVistaProps) {
  const cambiarNivel = (tipo: TipoDecision, nivel: NivelAutonomia) =>
    onGuardar({ ...politica, nivelPorTipo: { ...politica.nivelPorTipo, [tipo]: nivel } });
  const cuenta = (n: NivelAutonomia) => TIPOS.filter(t => !SIEMPRE_HUMANO.has(t) && nivelDe(politica, t) === n).length;
  const activo = politica.modo === 'politica';
  return (
    <div className="bg-surface border border-hairline rounded-surface px-5 py-[18px] space-y-4">
      <Cabecera hijos={(
        <div role="radiogroup" aria-label="Modo" className="inline-flex rounded-chip border border-hairline bg-raised p-0.5">
          {MODOS.map(m => (
            <button key={m.id} type="button" role="radio" aria-checked={politica.modo === m.id} disabled={guardando} title={m.texto}
              onClick={() => onGuardar({ ...politica, modo: m.id })}
              className={`px-3 py-1 rounded-chip font-mono text-caption uppercase tracking-wider transition-colors ${politica.modo === m.id ? 'bg-accent text-on-accent' : 'text-ink-2 hover:text-ink'}`}>
              {m.titulo}
            </button>
          ))}
        </div>
      )} />
      <p className="font-sans text-caption text-ink-2">{MODOS.find(m => m.id === politica.modo)?.texto}</p>

      <Presupuesto politica={politica} gastoMesUsd={gastoMesUsd} onGuardar={onGuardar} compacto />

      <div className={`${activo ? '' : 'opacity-70'}`}>
        <div className="grid grid-cols-[1fr_auto_auto_auto] sm:grid-cols-[1fr_5.5rem_5.5rem_5.5rem] items-end gap-x-2 px-3 pb-1">
          <span className="font-mono text-caption uppercase tracking-wider text-ink-3">Tipo de decisión {activo ? '' : '· manda en «Política»'}</span>
          {NIVELES.map(n => (
            <span key={n.id} className="text-center font-mono text-caption uppercase tracking-wider text-ink-3">
              <span className={`inline-block h-1.5 w-1.5 rounded-full mr-1 ${PUNTO[n.id]}`} />{n.corta} <span className="text-ink-4">{cuenta(n.id)}</span>
            </span>
          ))}
        </div>
        <ul className="divide-y divide-hairline rounded-field border border-hairline overflow-hidden">
          {TIPOS.map(tipo => {
            const nivel = nivelDe(politica, tipo);
            const e = stats.get(tipo);
            const subida = e ? evaluarSubida(nivel, e) : null;
            const humano = SIEMPRE_HUMANO.has(tipo);
            return (
              <li key={tipo} className={`grid grid-cols-[1fr_auto_auto_auto] sm:grid-cols-[1fr_5.5rem_5.5rem_5.5rem] items-center gap-x-2 px-3 py-2 ${subida ? 'bg-success/5' : ''}`}>
                <div className="min-w-0 flex flex-wrap items-baseline gap-x-2">
                  <span className="font-sans text-label text-ink truncate">{ETIQUETA_DECISION[tipo]}</span>
                  <Cifras e={e} />
                  {subida && <button type="button" onClick={() => cambiarNivel(tipo, subida.a)} title={subida.motivo} className="font-mono text-caption text-success uppercase tracking-wide">↑ subir</button>}
                </div>
                {NIVELES.map(n => {
                  const permitido = !humano && !(n.id === 'automatico' && NUNCA_AUTOMATICO.has(tipo));
                  const marcado = humano ? n.id === 'proponer' : nivel === n.id;
                  return (
                    <button key={n.id} type="button" role="radio" aria-checked={marcado} aria-label={`${ETIQUETA_DECISION[tipo]}: ${n.etiqueta}`}
                      disabled={!permitido || guardando} onClick={() => cambiarNivel(tipo, n.id)}
                      className="h-8 flex items-center justify-center disabled:cursor-not-allowed">
                      {permitido || marcado ? (
                        <span className={`h-3 w-3 rounded-full transition-transform ${marcado ? `${PUNTO[n.id]} scale-110` : 'border border-strong'} ${NIVEL_DESTINO[tipo] === n.id && !marcado ? 'ring-2 ring-hairline ring-offset-1 ring-offset-surface' : ''}`} />
                      ) : <span className="text-ink-4 font-mono text-caption">—</span>}
                    </button>
                  );
                })}
              </li>
            );
          })}
        </ul>
        <p className="mt-1 px-3 font-mono text-caption text-ink-4">Anillo = destino del diseño · — = no permitido · «Siempre tú» no se mueve.</p>
      </div>
      <Mensaje msg={msg} />
    </div>
  );
}
