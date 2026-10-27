import React, { useState } from 'react';
import { Icon, Button, Banner } from '../ui';
import type { PasoRevision, RevisionSemanal } from '../../utils/revisionSemanal';

/* ═══════════════════════════════════════════════════════════════════════════
   «Tu revisión de esta semana» (K-03, lámina 08)

   Un único recorrido —peso, cuestionarios, fotos— con lo que falta y cuándo
   caduca. Cada paso abre la pantalla que ya existía para él: no se duplica
   ninguna. Qué toca y cuándo vence lo deciden `questionnaireSchedule` y las
   asignaciones; aquí solo se ve y se envía.

   «Enviar» no sube respuestas (cada cuestionario ya se envió al terminarlo):
   marca la revisión como enviada, y si faltaba algo, como incompleta.
   ═══════════════════════════════════════════════════════════════════════════ */

type Props = {
  revision: RevisionSemanal;
  /** Ya pulsó «Enviar» esta semana. */
  enviada: boolean;
  onAbrirPaso: (paso: PasoRevision) => void;
  onEnviar: (incompleta: boolean) => void;
};

const fechaLarga = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' });
const fechaCorta = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' }).toUpperCase();

export default function RevisionDeLaSemana({ revision, enviada, onAbrirPaso, onEnviar }: Props) {
  const [confirmando, setConfirmando] = useState(false);
  if (revision.estado === 'sin_revision') return null;

  const faltan = revision.pasos.filter(p => !p.hecho);
  const completa = faltan.length === 0;
  const titulo = completa
    ? (enviada ? 'Revisión enviada' : 'Todo listo para enviar')
    : enviada
      ? 'Enviada, pero incompleta'
      : `Te quedan ${faltan.length} paso${faltan.length === 1 ? '' : 's'}`;

  return (
    <section id="revision-semana" className="rounded-surface border border-hairline bg-surface p-4 space-y-4 scroll-mt-20">
      <div>
        <p className="font-mono text-caption font-semibold uppercase tracking-[.16em] text-accent-ink">
          Revisión semanal · {fechaCorta(revision.ciclo)}
        </p>
        <h2 className="pt-1 font-sans font-bold text-title-l leading-tight text-ink">{titulo}</h2>
        {!completa && (
          <p className="pt-1 font-sans text-body-s text-ink-2">
            Unos minutos. Puedes parar y seguir luego: se guarda solo.
          </p>
        )}
      </div>

      <ol className="divide-y divide-hairline rounded-field border border-hairline">
        {revision.pasos.map((p, i) => {
          const esSiguiente = revision.siguiente?.id === p.id;
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onAbrirPaso(p)}
                className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-raised"
              >
                <span
                  className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full font-mono text-caption font-bold ${
                    p.hecho ? 'bg-success text-on-fill' : esSiguiente ? 'bg-accent text-on-accent' : 'bg-raised text-ink-2'
                  }`}
                >
                  {p.hecho ? <Icon name="check" size="s" /> : i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-sans font-semibold text-body-s text-ink">{p.titulo}</span>
                  <span className="block font-sans text-caption text-ink-2">{p.detalle}</span>
                </span>
                {esSiguiente && !p.hecho && (
                  <span className="flex-shrink-0 rounded-control bg-accent-bg px-2 py-0.5 font-mono text-caption font-bold uppercase text-accent-ink">
                    Sigue aquí
                  </span>
                )}
                <Icon name="chevron_right" size="s" className="flex-shrink-0 text-ink-3" />
              </button>
            </li>
          );
        })}
      </ol>

      <p className="flex items-center gap-2 font-sans text-caption text-ink-2">
        <Icon name="schedule" size="s" />
        Caduca el <span className="font-semibold text-ink">{fechaLarga(revision.caduca)}</span>
      </p>

      {/* Resumen y envío (lámina 3). Con algo sin hacer se avisa antes de enviar. */}
      {confirmando ? (
        <div className="space-y-3">
          <Banner tone="info">
            {faltan.length === 1 ? 'Falta un paso' : `Faltan ${faltan.length} pasos`}: {faltan.map(p => p.titulo.toLowerCase()).join(', ')}.
            Puedes enviarlo hecho: la revisión quedará <strong>incompleta</strong> hasta que lo completes.
          </Banner>
          <Button fullWidth onClick={() => { setConfirmando(false); onAbrirPaso(faltan[0]); }}>Seguir con lo que falta</Button>
          <Button fullWidth variant="secondary" onClick={() => { setConfirmando(false); onEnviar(true); }}>Enviar lo hecho</Button>
        </div>
      ) : completa ? (
        !enviada && <Button fullWidth onClick={() => onEnviar(false)}>Enviar revisión</Button>
      ) : (
        <div className="space-y-2">
          {revision.siguiente && <Button fullWidth onClick={() => onAbrirPaso(revision.siguiente as PasoRevision)}>Continuar</Button>}
          {revision.hechos > 0 && !enviada && (
            <Button fullWidth variant="secondary" onClick={() => setConfirmando(true)}>Enviar lo hecho</Button>
          )}
        </div>
      )}
    </section>
  );
}
