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
import type { InformeDeSombra, FilaDeInforme } from '../../autopiloto/sombra';
import { Icon } from '../ui';

export interface PoliticaVistaProps {
  politica: Politica;
  stats: Map<TipoDecision, EstadisticaDeTipo>;
  guardando: boolean;
  msg: string | null;
  /** Gasto del mes en curso, si se conoce (solo para pintarlo contra el presupuesto). */
  gastoMesUsd?: number;
  /** Lo que el modo sombra ha medido: coincidencia con Dani por tipo (sombra.ts). */
  sombra?: InformeDeSombra;
  /** Los atletas (con consentimiento o sin él) para el selector «solo estos». */
  atletas?: { email: string; nombre: string }[];
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

/** El interruptor general y la lista «solo estos atletas» (Dani, 30-10:
 *  «quiero poder activarlo o desactivarlo de manera general o con X
 *  clientes; de momento apagado»). Apagado, el latido no encola nada, no se
 *  publican menús solos y el consumidor no llama al modelo. */
function Interruptor({ politica, atletas, guardando, onGuardar }: { politica: Politica; atletas: { email: string; nombre: string }[]; guardando: boolean; onGuardar: (p: Politica) => void }) {
  const [filtro, setFiltro] = useState('');
  const soloAlgunos = politica.soloAtletas.length > 0;
  const alternar = (email: string) => {
    const e = email.toLowerCase();
    const lista = politica.soloAtletas.includes(e) ? politica.soloAtletas.filter(x => x !== e) : [...politica.soloAtletas, e];
    onGuardar({ ...politica, soloAtletas: lista });
  };
  const visibles = atletas.filter(a => !filtro || `${a.nombre} ${a.email}`.toLowerCase().includes(filtro.toLowerCase()));
  const nombreDe = (email: string) => atletas.find(a => a.email.toLowerCase() === email)?.nombre ?? email;
  return (
    <div className={`rounded-field border px-3 py-2.5 space-y-2 ${politica.activo ? 'border-success/40 bg-success/5' : 'border-hairline bg-raised'}`}>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" role="switch" aria-checked={politica.activo} disabled={guardando}
          onClick={() => onGuardar({ ...politica, activo: !politica.activo })}
          className="inline-flex items-center gap-2 font-mono text-caption uppercase tracking-wider text-ink">
          <span className={`relative inline-block h-5 w-9 rounded-full transition-colors ${politica.activo ? 'bg-success' : 'bg-hairline'}`} aria-hidden>
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-raised shadow transition-transform ${politica.activo ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </span>
          {politica.activo ? 'Encendido' : 'Apagado'}
        </button>
        <span className="font-sans text-caption text-ink-2">
          {politica.activo
            ? (soloAlgunos ? `Trabaja solo con ${politica.soloAtletas.length} ${politica.soloAtletas.length === 1 ? 'atleta' : 'atletas'}.` : 'Trabaja con todos los atletas que hayan dado permiso.')
            : 'El asistente no decide nada por su cuenta: ni episodios, ni menús, ni propuestas automáticas.'}
        </span>
        {politica.activo && (
          <div role="radiogroup" aria-label="Con quién" className="inline-flex rounded-chip border border-hairline bg-raised p-0.5 ml-auto">
            <button type="button" role="radio" aria-checked={!soloAlgunos} disabled={guardando} onClick={() => onGuardar({ ...politica, soloAtletas: [] })}
              className={`px-3 py-1 rounded-chip font-mono text-caption uppercase tracking-wider ${!soloAlgunos ? 'bg-accent text-on-accent' : 'text-ink-2'}`}>Todos</button>
            <button type="button" role="radio" aria-checked={soloAlgunos} disabled={guardando} onClick={() => { if (!soloAlgunos && atletas[0]) alternar(atletas[0].email); }}
              className={`px-3 py-1 rounded-chip font-mono text-caption uppercase tracking-wider ${soloAlgunos ? 'bg-accent text-on-accent' : 'text-ink-2'}`}>Solo estos</button>
          </div>
        )}
      </div>
      {politica.activo && soloAlgunos && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap gap-1.5">
            {politica.soloAtletas.map(e => (
              <button key={e} type="button" onClick={() => alternar(e)} disabled={guardando} title="Quitar"
                className="inline-flex items-center gap-1 rounded-chip bg-accent text-on-accent px-2.5 py-0.5 font-sans text-caption">
                {nombreDe(e)} <Icon name="close" size="s" />
              </button>
            ))}
          </div>
          <input value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Añadir atleta…"
            className="w-full bg-field border border-control-line rounded-control px-3 py-1.5 font-sans text-caption text-ink placeholder:text-ink-4 focus:border-accent-line focus:outline-none" />
          <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
            {visibles.filter(a => !politica.soloAtletas.includes(a.email.toLowerCase())).map(a => (
              <button key={a.email} type="button" onClick={() => alternar(a.email)} disabled={guardando}
                className="rounded-chip border border-hairline bg-raised px-2.5 py-0.5 font-sans text-caption text-ink-2 hover:text-ink hover:border-strong">
                + {a.nombre}
              </button>
            ))}
            {visibles.length === 0 && <span className="font-sans text-caption text-ink-4">Nadie con ese nombre.</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function Mensaje({ msg }: { msg: string | null }) {
  return msg ? <p className="flex items-center gap-2 font-mono text-caption text-data"><Icon name="info" size="s" />{msg}</p> : null;
}

const RECOMENDACION: Record<FilaDeInforme['recomendacion'], { texto: string; tono: string }> = {
  subir: { texto: 'listo para subir', tono: 'text-success' },
  seguir: { texto: 'seguir en sombra', tono: 'text-warning' },
  pocos_datos: { texto: 'pocos datos', tono: 'text-ink-4' },
  siempre_humano: { texto: 'siempre tú', tono: 'text-ink-4' },
};
const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)} %`);

/** Lo que la sombra ha medido: por tipo, cuántas decisiones del asistente
 *  coincidieron con lo que hizo Dani. Es la prueba con la que se decide qué
 *  tipos salen de sombra. «Subir» aquí pone el tipo en aviso en la tabla. */
function Sombra({ informe, politica, onGuardar }: { informe: InformeDeSombra; politica: Politica; onGuardar: (p: Politica) => void }) {
  if (informe.total === 0) {
    return (
      <div className="rounded-field border border-dashed border-hairline px-3 py-2.5">
        <p className="font-mono text-caption uppercase tracking-wider text-ink-3">Sombra</p>
        <p className="font-sans text-caption text-ink-3 mt-0.5">Todavía no hay decisiones en sombra que comparar. Cuando el asistente lleve una o dos semanas decidiendo, aquí sale cuánto coincide contigo, tipo a tipo.</p>
      </div>
    );
  }
  return (
    <div className="rounded-field border border-hairline overflow-hidden">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-2 bg-raised">
        <p className="font-mono text-caption uppercase tracking-wider text-ink-3">Sombra · coincidencia contigo</p>
        <p className="font-mono text-caption text-ink-3">
          {informe.decididas} de {informe.total} comparadas{informe.desde ? ` · ${informe.desde.slice(5)} → ${(informe.hasta ?? informe.desde).slice(5)}` : ''} · global <span className="text-ink">{pct(informe.tasaGlobal)}</span>
        </p>
      </div>
      <ul className="divide-y divide-hairline">
        {informe.filas.map(f => {
          const r = RECOMENDACION[f.recomendacion];
          return (
            <li key={f.tipo} className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_11rem_7rem] items-center gap-x-3 px-3 py-1.5">
              <span className="font-sans text-label text-ink truncate" title={f.etiqueta}>{f.etiqueta}</span>
              <span className="font-mono text-caption text-ink-3 whitespace-nowrap" title="coincide · parecido · distinto · nada · pendiente">
                <span className="text-success">{f.coincide}✓</span> <span className="text-data">{f.parecido}≈</span> <span className="text-danger">{f.distinto}✗</span> <span className="text-ink-4">{f.nada}∅ {f.pendiente}…</span>
                <span className="text-ink ml-2">{pct(f.tasa)}</span>
              </span>
              <span className={`font-mono text-caption whitespace-nowrap sm:text-right ${r.tono}`}>
                {f.recomendacion === 'subir' && politica.modo === 'politica' && nivelDe(politica, f.tipo) === 'proponer'
                  ? <button type="button" onClick={() => onGuardar({ ...politica, nivelPorTipo: { ...politica.nivelPorTipo, [f.tipo]: 'aviso' } })} className="uppercase tracking-wide underline underline-offset-2">↑ a aviso</button>
                  : r.texto}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* Semáforo ------------------------------------------------------------- */

function Vista({ politica, stats, guardando, msg, gastoMesUsd, sombra, atletas = [], onGuardar }: PoliticaVistaProps) {
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

      <Interruptor politica={politica} atletas={atletas} guardando={guardando} onGuardar={onGuardar} />

      <Presupuesto politica={politica} gastoMesUsd={gastoMesUsd} onGuardar={onGuardar} compacto />

      {sombra && <Sombra informe={sombra} politica={politica} onGuardar={onGuardar} />}

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
