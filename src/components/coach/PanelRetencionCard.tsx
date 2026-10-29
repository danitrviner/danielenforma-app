import React from 'react';
import type { PanelRetencion } from '../../utils/panelRetencion';
import { HORAS_RESPUESTA_PROMETIDA } from '../../utils/panelRetencion';

/* El panel de retención del coach (tanda 1): cuatro cifras en rejilla
   (en marcha · apagándose · respuesta · sin contestar). Versión elegida por
   Dani el 29-10 entre tres. */

export default function PanelRetencionCard({ panel }: { panel: PanelRetencion }) {
  const respuesta = panel.latenciaMedianaH === null ? '—' : `${panel.latenciaMedianaH} h`;
  const pct = panel.pctContestadas48h === null ? 'sin revisiones' : `${panel.pctContestadas48h} % en ${HORAS_RESPUESTA_PROMETIDA} h`;
  const primera = panel.primeraSemana.length > 0
    ? <p className="font-mono text-caption text-ink-2">Primera semana: {panel.primeraSemana.map(p => `${p.nombre} · día ${p.dia}`).join(' · ')}</p>
    : null;
  const tonoRespuesta: Tono = panel.latenciaMedianaH !== null && panel.latenciaMedianaH <= HORAS_RESPUESTA_PROMETIDA ? 'ok' : 'aviso';

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
