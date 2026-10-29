/* Las TRES propuestas visuales de la pantalla de política del autopiloto
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
import { Button, Icon } from '../ui';

export type VariantePolitica = 'A' | 'B' | 'C';

export interface PoliticaVistaProps {
  variante: VariantePolitica;
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

const BLOQUES: { titulo: string; tipos: TipoDecision[] }[] = [
  { titulo: 'Nutrición', tipos: ['menu_semanal', 'ajuste_kcal_pequeno', 'ajuste_kcal_medio', 'ajuste_kcal_grande'] },
  { titulo: 'Entrenamiento', tipos: ['reto', 'progresion_programada', 'progresion_iem', 'cambio_ejercicio_molestia', 'descarga_adelantada', 'mesociclo', 'sesiones', 'publicar_bloque'] },
  { titulo: 'Comunicación y plan', tipos: ['respuesta_rutinaria', 'mensaje_atleta', 'ficha', 'setup', 'roadmap'] },
  { titulo: 'Siempre tú', tipos: ['clinico', 'renovacion'] },
];

function nivelesPermitidos(tipo: TipoDecision) {
  return NIVELES.filter(n => !(n.id === 'automatico' && NUNCA_AUTOMATICO.has(tipo)));
}

export default function PoliticaVista(props: PoliticaVistaProps) {
  const { variante } = props;
  if (variante === 'B') return <VistaB {...props} />;
  if (variante === 'C') return <VistaC {...props} />;
  return <VistaA {...props} />;
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

function BotonSubida({ subida, onClick }: { subida: { a: NivelAutonomia; motivo: string } | null; onClick: (a: NivelAutonomia) => void }) {
  if (!subida) return null;
  return (
    <Button size="s" variant="secondary" icon="trending_up" title={subida.motivo} onClick={() => onClick(subida.a)}>
      Subir a {NIVELES.find(n => n.id === subida.a)?.etiqueta.toLowerCase()}
    </Button>
  );
}

function Mensaje({ msg }: { msg: string | null }) {
  return msg ? <p className="flex items-center gap-2 font-mono text-caption text-data"><Icon name="info" size="s" />{msg}</p> : null;
}

/* A · Tarjetas ------------------------------------------------------------- */

function VistaA({ politica, stats, guardando, msg, gastoMesUsd, onGuardar }: PoliticaVistaProps) {
  const cambiarNivel = (tipo: TipoDecision, nivel: NivelAutonomia) =>
    onGuardar({ ...politica, nivelPorTipo: { ...politica.nivelPorTipo, [tipo]: nivel } });
  return (
    <div className="bg-surface border border-hairline rounded-surface px-5 py-[18px] space-y-4">
      <Cabecera />
      <div className="grid gap-2 sm:grid-cols-3">
        {MODOS.map(m => (
          <button key={m.id} type="button" disabled={guardando} onClick={() => onGuardar({ ...politica, modo: m.id })}
            className={`rounded-field border px-3 py-3 text-left transition-colors ${politica.modo === m.id ? 'border-accent-line bg-accent/10' : 'border-hairline hover:bg-raised'}`}>
            <span className="block font-sans font-bold text-body-s text-ink">{m.titulo}{politica.modo === m.id ? ' · activo' : ''}</span>
            <span className="block font-sans text-caption text-ink-2 mt-1">{m.texto}</span>
          </button>
        ))}
      </div>
      <Presupuesto politica={politica} gastoMesUsd={gastoMesUsd} onGuardar={onGuardar} />
      <div className={`space-y-1 ${politica.modo !== 'politica' ? 'opacity-70' : ''}`}>
        <p className="font-mono text-caption uppercase tracking-wider text-ink-3">
          Tabla por tipo de decisión {politica.modo !== 'politica' ? '· manda cuando el modo sea «Política»' : ''}
        </p>
        <ul className="divide-y divide-hairline rounded-field border border-hairline overflow-hidden">
          {TIPOS.map(tipo => {
            const nivel = nivelDe(politica, tipo);
            const e = stats.get(tipo);
            return (
              <li key={tipo} className="px-3 py-2 flex flex-wrap items-center gap-2">
                <span className="flex-1 min-w-[12rem] font-sans text-label text-ink">{ETIQUETA_DECISION[tipo]}</span>
                <Cifras e={e} />
                {SIEMPRE_HUMANO.has(tipo) ? (
                  <span className="font-mono text-caption text-ink-3 rounded-chip bg-hairline px-2">siempre tú</span>
                ) : (
                  <select value={nivel} disabled={guardando} onChange={ev => cambiarNivel(tipo, ev.target.value as NivelAutonomia)}
                    className="bg-field border border-control-line rounded-control px-2 py-1 font-sans text-caption text-ink">
                    {nivelesPermitidos(tipo).map(n => <option key={n.id} value={n.id}>{n.etiqueta}{NIVEL_DESTINO[tipo] === n.id ? ' (destino)' : ''}</option>)}
                  </select>
                )}
                <BotonSubida subida={e ? evaluarSubida(nivel, e) : null} onClick={a => cambiarNivel(tipo, a)} />
              </li>
            );
          })}
        </ul>
      </div>
      <Mensaje msg={msg} />
    </div>
  );
}

/* B · Semáforo ------------------------------------------------------------- */

function VistaB({ politica, stats, guardando, msg, gastoMesUsd, onGuardar }: PoliticaVistaProps) {
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

/* C · Por bloques ---------------------------------------------------------- */

function VistaC({ politica, stats, guardando, msg, gastoMesUsd, onGuardar }: PoliticaVistaProps) {
  const [abierto, setAbierto] = useState<string | null>(BLOQUES[0].titulo);
  const cambiarNivel = (tipo: TipoDecision, nivel: NivelAutonomia) =>
    onGuardar({ ...politica, nivelPorTipo: { ...politica.nivelPorTipo, [tipo]: nivel } });
  const movibles = TIPOS.filter(t => !SIEMPRE_HUMANO.has(t));
  const n = (x: NivelAutonomia) => movibles.filter(t => nivelDe(politica, t) === x).length;
  const resumen = politica.modo === 'sombra'
    ? 'Hoy el asistente solo mira: decide en sombra y no toca nada.'
    : politica.modo === 'rodaje'
      ? `Hoy el asistente te propone todo (${movibles.length} tipos de decisión) y lo apruebas tú.`
      : `Hoy el asistente aplica solo ${n('automatico')} tipos de decisión, te avisa de ${n('aviso')} y te propone ${n('proponer')}. Lo clínico y el dinero, siempre tú.`;

  return (
    <div className="space-y-3">
      <div className="bg-surface border border-hairline rounded-surface px-5 py-[18px] space-y-3">
        <Cabecera />
        <p className="font-sans text-body-s text-ink leading-relaxed border-l-2 border-accent-line pl-3">{resumen}</p>
        <div className="flex flex-wrap gap-2">
          {MODOS.map(m => (
            <button key={m.id} type="button" disabled={guardando} title={m.texto} onClick={() => onGuardar({ ...politica, modo: m.id })}
              className={`rounded-chip border px-3 py-1 font-sans text-caption transition-colors ${politica.modo === m.id ? 'bg-accent border-accent-press text-on-accent' : 'border-strong bg-raised text-ink-2'}`}>
              {m.titulo}
            </button>
          ))}
        </div>
        <Presupuesto politica={politica} gastoMesUsd={gastoMesUsd} onGuardar={onGuardar} />
        <Mensaje msg={msg} />
      </div>

      {BLOQUES.map(b => {
        const esta = abierto === b.titulo;
        const humano = b.tipos.every(t => SIEMPRE_HUMANO.has(t));
        const porNivel = (x: NivelAutonomia) => b.tipos.filter(t => !SIEMPRE_HUMANO.has(t) && nivelDe(politica, t) === x).length;
        const subidas = b.tipos.filter(t => { const e = stats.get(t); return e && evaluarSubida(nivelDe(politica, t), e); }).length;
        return (
          <section key={b.titulo} className="bg-surface border border-hairline rounded-surface overflow-hidden">
            <button type="button" onClick={() => setAbierto(esta ? null : b.titulo)} className="w-full flex items-center gap-3 px-5 py-3 text-left">
              <span className="font-sans font-bold text-body-s text-ink">{b.titulo}</span>
              {humano ? (
                <span className="font-mono text-caption text-ink-3 rounded-chip bg-hairline px-2">siempre tú</span>
              ) : (
                <span className="flex items-center gap-2 font-mono text-caption text-ink-3">
                  {NIVELES.map(x => <span key={x.id} className="inline-flex items-center gap-1"><span className={`h-1.5 w-1.5 rounded-full ${PUNTO[x.id]}`} />{porNivel(x.id)}</span>)}
                </span>
              )}
              {subidas > 0 && <span className="font-mono text-caption text-success">{subidas} para subir</span>}
              <Icon name={esta ? 'expand_less' : 'expand_more'} size="s" className="ml-auto text-ink-3" />
            </button>
            {esta && (
              <ul className="divide-y divide-hairline border-t border-hairline">
                {b.tipos.map(tipo => {
                  const nivel = nivelDe(politica, tipo);
                  const e = stats.get(tipo);
                  const subida = e ? evaluarSubida(nivel, e) : null;
                  return (
                    <li key={tipo} className="px-5 py-3 space-y-2">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className="font-sans text-label text-ink">{ETIQUETA_DECISION[tipo]}</span>
                        <Cifras e={e} />
                      </div>
                      {SIEMPRE_HUMANO.has(tipo) ? (
                        <p className="font-sans text-caption text-ink-3">Siempre te lo propone y lo decides tú.</p>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <div role="radiogroup" className="inline-flex rounded-chip border border-hairline bg-raised p-0.5">
                            {nivelesPermitidos(tipo).map(x => (
                              <button key={x.id} type="button" role="radio" aria-checked={nivel === x.id} disabled={guardando} onClick={() => cambiarNivel(tipo, x.id)}
                                className={`px-3 py-1 rounded-chip font-sans text-caption transition-colors ${nivel === x.id ? 'bg-ink text-bg' : 'text-ink-2 hover:text-ink'}`}>
                                {x.etiqueta}{NIVEL_DESTINO[tipo] === x.id ? ' ·' : ''}
                              </button>
                            ))}
                          </div>
                          <BotonSubida subida={subida} onClick={a => cambiarNivel(tipo, a)} />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
