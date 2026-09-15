import React from 'react';
import { WeightCheckIn, Questionnaire, QuestionnaireResponse } from '../../types';
import { getPendingReviews } from '../../hooks/usePendingReviews';
import QuestionnaireChartsPanel from '../QuestionnaireChartsPanel';
import { HubTab } from '../ClientHub';
import { Button, Badge, Collapsible, EmptyState } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Bloque 5 — Lo que el atleta ha mandado.

   Dos cosas distintas que hasta ahora vivían en pestañas distintas: sus
   check-ins (Revisiones) y las gráficas de sus cuestionarios (Cuerpo). Aquí
   van juntas porque es lo último que se comenta: primero se le cuenta cómo va,
   y después se le contesta a lo que él dijo.

   ── Por qué aquí NO se escribe el feedback ─────────────────────────────────
   `coachFeedback` es un único string sobrescribible dentro del check-in
   (types.ts). Poner un segundo formulario que escriba ese mismo campo desde
   otra pantalla es la receta para pisarse a uno mismo: escribes aquí, la
   pestaña de Revisiones sigue montada con el valor viejo y al guardar allí lo
   machaca. Así que esto ENSEÑA lo pendiente y manda a Revisiones, que es la
   dueña de ese campo. Una sola puerta de escritura.

   Las agujetas SÍ se ven: son del coach, es con lo que ajusta el volumen
   (`utils/volumeSuggestion.ts`). El atleta no las ve, y eso lo decide
   `ocultarDoms` desde su propia pantalla.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  checkins: WeightCheckIn[];
  questionnaires: Questionnaire[];
  responses: QuestionnaireResponse[];
  onGoToTab: (tab: HubTab) => void;
  /** Cuando está activo, las gráficas nacen desplegadas. */
  todoAbierto?: boolean;
}

function fecha(c: WeightCheckIn): string {
  // `dateStr` viene formateado sin año desde que se creó ("12 oct"), así que
  // para ordenar y datar se usa el timestamp, que sí es completo.
  const d = c.timestamp instanceof Date ? c.timestamp : new Date(c.timestamp);
  return Number.isNaN(d.getTime())
    ? c.dateStr
    : d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
}

export default function BloqueRecibido({
  checkins, questionnaires, responses, onGoToTab, todoAbierto = false,
}: Props) {
  const pendientes = getPendingReviews(checkins)
    .slice()
    .sort((a, b) => Number(new Date(b.timestamp)) - Number(new Date(a.timestamp)));

  const hayGraficas = responses.length > 0 && questionnaires.length > 0;

  return (
    <div className="space-y-4">
      {/* ── Check-ins sin contestar ──────────────────────────────────────── */}
      {pendientes.length === 0 ? (
        <EmptyState
          icon="mark_email_read"
          title="Nada pendiente de contestar"
          description={checkins.length === 0
            ? 'Este atleta todavía no ha enviado ningún check-in.'
            : 'Todos sus check-ins están revisados.'}
        />
      ) : (
        <div className="bg-raised border border-hairline rounded-surface overflow-hidden">
          <div className="px-4 py-2.5 border-b border-hairline flex items-center justify-between gap-3">
            <span className="font-mono text-caption text-ink-2 uppercase tracking-[.1em]">
              Sin contestar · {pendientes.length}
            </span>
            <Button variant="ghost" onClick={() => onGoToTab('revisiones')}>
              Contestar en Revisiones
            </Button>
          </div>
          <ul className="divide-y divide-hairline">
            {pendientes.slice(0, 5).map(c => (
              <li key={c.id} className="px-4 py-3 space-y-1">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-mono text-caption text-ink-2 tabular-nums">{fecha(c)}</span>
                  <span className="font-mono text-label text-ink tabular-nums">{c.weight} kg</span>
                  <span aria-hidden="true">{c.mood}</span>
                  <Badge tone={c.adherence === 'Sí' ? 'success' : c.adherence === 'Parcial' ? 'warning' : 'danger'}>
                    Adherencia: {c.adherence}
                  </Badge>
                  {c.coachFeedback && !c.approved && <Badge tone="neutral">Contestado, sin aprobar</Badge>}
                </div>
                {c.notes && (
                  <p className="font-sans text-label text-ink-2">«{c.notes}»</p>
                )}
              </li>
            ))}
          </ul>
          {pendientes.length > 5 && (
            <p className="px-4 py-2 font-mono text-caption text-ink-3 border-t border-hairline">
              Y {pendientes.length - 5} más en Revisiones.
            </p>
          )}
        </div>
      )}

      {/* ── Lo que contesta en los cuestionarios ─────────────────────────── */}
      {hayGraficas ? (
        <Collapsible
          key={`cuestionarios-${todoAbierto}`}
          defaultOpen={todoAbierto}
          trigger={
            <span className="flex items-baseline gap-2">
              <span className="font-sans font-bold text-label text-ink">Cuestionarios</span>
              <span className="font-mono text-caption text-ink-3">
                {responses.length} {responses.length === 1 ? 'respuesta' : 'respuestas'}
              </span>
            </span>
          }
        >
          <QuestionnaireChartsPanel questionnaires={questionnaires} responses={responses} />
        </Collapsible>
      ) : (
        <EmptyState
          icon="query_stats"
          title="Sin respuestas que graficar"
          description="Asígnale un cuestionario con preguntas de escala o numéricas y aquí saldrá su evolución."
          actionLabel="Asignar en Revisiones"
          onAction={() => onGoToTab('revisiones')}
        />
      )}
    </div>
  );
}
