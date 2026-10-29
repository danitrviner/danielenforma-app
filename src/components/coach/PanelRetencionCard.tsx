import React from 'react';
import type { PanelRetencion } from '../../utils/panelRetencion';
import { HORAS_RESPUESTA_PROMETIDA } from '../../utils/panelRetencion';
import { VARIANTES } from '../../data/variantes';

/* El panel de retención del coach (tanda 1), en tres versiones:
   · 'cifras' — cuatro cifras en rejilla (en marcha · apagándose · respuesta · sin contestar).
   · 'linea'  — una sola línea de texto, con lo que pide mirar en ámbar.
   · 'dos'    — dos cifras grandes (apagándose, sin contestar) y el resto en una línea. */

export type VariantePanel = typeof VARIANTES.panelRetencion;

export default function PanelRetencionCard({ panel, variante = VARIANTES.panelRetencion }: { panel: PanelRetencion; variante?: VariantePanel }) {
  const respuesta = panel.latenciaMedianaH === null ? '—' : `${panel.latenciaMedianaH} h`;
  const pct = panel.pctContestadas48h === null ? 'sin revisiones' : `${panel.pctContestadas48h} % en ${HORAS_RESPUESTA_PROMETIDA} h`;
  const primera = panel.primeraSemana.length > 0
    ? <p className="font-mono text-caption text-ink-2">Primera semana: {panel.primeraSemana.map(p => `${p.nombre} · día ${p.dia}`).join(' · ')}</p>
    : null;
  const tonoRespuesta: Tono = panel.latenciaMedianaH !== null && panel.latenciaMedianaH <= HORAS_RESPUESTA_PROMETIDA ? 'ok' : 'aviso';

  if (variante === 'linea') {
    const Parte = ({ n, texto, aviso }: { n: number | string; texto: string; aviso?: boolean }) => (
      <span className={aviso ? 'text-warning font-bold' : 'text-ink'}>{n} {texto}</span>
    );
    return (
      <div className="rounded-field border border-hairline bg-surface px-4 py-3 space-y-1" aria-label="Retención">
        <p className="font-mono text-label text-ink-2">
          <Parte n={panel.enMarcha} texto="en marcha" /> · <Parte n={panel.apagandose} texto="apagándose" aviso={panel.apagandose > 0} />
          {panel.callados > 0 && <> · <Parte n={panel.callados} texto="callados" aviso /></>}
          {' · '}<Parte n={respuesta} texto={`de respuesta (${pct})`} aviso={tonoRespuesta === 'aviso'} />
          {' · '}<Parte n={panel.sinContestar} texto="sin contestar" aviso={panel.sinContestar > 0} />
          {panel.sinPlan > 0 && <> · <Parte n={panel.sinPlan} texto="sin plan" /></>}
        </p>
        {primera}
      </div>
    );
  }

  if (variante === 'dos') {
    return (
      <div className="rounded-field border border-hairline bg-surface p-4 space-y-2" aria-label="Retención">
        <div className="flex items-end gap-6">
          <Grande valor={String(panel.apagandose)} etiqueta="apagándose" tono={panel.apagandose > 0 ? 'aviso' : 'ok'} />
          <Grande valor={String(panel.sinContestar)} etiqueta="sin contestar" tono={panel.sinContestar > 0 ? 'aviso' : 'ok'} />
          <p className="flex-1 text-right font-mono text-caption text-ink-2">
            {panel.enMarcha} en marcha{panel.callados > 0 ? ` · ${panel.callados} callados` : ''}<br />
            respuesta <span className={tonoRespuesta === 'aviso' ? 'text-warning' : 'text-ink'}>{respuesta}</span> · {pct}
          </p>
        </div>
        {primera}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Retención">
      <Cifra etiqueta="En marcha" valor={String(panel.enMarcha)} tono="ok" />
      <Cifra etiqueta="Apagándose" valor={String(panel.apagandose)} tono={panel.apagandose > 0 ? 'aviso' : 'ok'}
        nota={panel.callados > 0 ? `+ ${panel.callados} callado${panel.callados === 1 ? '' : 's'}` : undefined} />
      <Cifra etiqueta="Respuesta" valor={respuesta} tono={tonoRespuesta} nota={pct} />
      <Cifra etiqueta="Sin contestar" valor={String(panel.sinContestar)} tono={panel.sinContestar > 0 ? 'aviso' : 'ok'}
        nota={panel.sinPlan > 0 ? `${panel.sinPlan} sin plan` : undefined} />
      {primera && <div className="col-span-2 sm:col-span-4">{primera}</div>}
    </div>
  );
}

type Tono = 'ok' | 'aviso';

function Cifra({ etiqueta, valor, nota, tono }: { etiqueta: string; valor: string; nota?: string; tono: Tono }) {
  return (
    <div className="rounded-field border border-hairline bg-surface px-3 py-2.5">
      <p className="font-mono text-caption uppercase tracking-widest text-ink-3">{etiqueta}</p>
      <p className={`mt-0.5 font-sans text-title-l font-bold leading-none ${tono === 'aviso' ? 'text-warning' : 'text-ink'}`}>{valor}</p>
      {nota && <p className="mt-1 truncate font-mono text-caption text-ink-2">{nota}</p>}
    </div>
  );
}

function Grande({ valor, etiqueta, tono }: { valor: string; etiqueta: string; tono: Tono }) {
  return (
    <div>
      <p className={`font-display text-title-l font-black leading-none ${tono === 'aviso' ? 'text-warning' : 'text-ink'}`}>{valor}</p>
      <p className="font-mono text-caption uppercase tracking-widest text-ink-3">{etiqueta}</p>
    </div>
  );
}
