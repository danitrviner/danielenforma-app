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

   ── Por qué hay una tabla además de la lista de pendientes ─────────────────
   La lista de arriba contesta a «¿qué me queda por contestar?», que es una
   tarea. La tabla contesta a otra cosa: «¿qué me ha ido diciendo?». Un check-in
   suelto no dice nada —80,4 kg y un «Parcial» no significan nada sin los cuatro
   anteriores—, y para verlos en fila había que abrir Revisiones y pinchar uno a
   uno. Aquí van seguidos, con el cambio de peso respecto al anterior calculado,
   que es la frase que se dice en voz alta en el vídeo.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Cuántos check-ins entran en la tabla: unos dos meses al ritmo semanal. */
const CHECKINS_EN_LA_TABLA = 8;

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

const TONO_ADHERENCIA = { 'Sí': 'success', Parcial: 'warning', No: 'danger' } as const;

function ms(c: WeightCheckIn): number {
  return Number(new Date(c.timestamp));
}

export default function BloqueRecibido({
  checkins, questionnaires, responses, onGoToTab, todoAbierto = false,
}: Props) {
  const pendientes = getPendingReviews(checkins)
    .slice()
    .sort((a, b) => ms(b) - ms(a));

  // Del más viejo al más nuevo para poder restar contra el anterior, y se le da
  // la vuelta al pintar: la tabla se lee de arriba abajo empezando por el
  // último, que es lo que se está comentando.
  const serie = checkins.slice().sort((a, b) => ms(a) - ms(b));
  const filas = serie
    .map((c, i) => {
      const previo = serie[i - 1];
      const delta = previo && typeof c.weight === 'number' && typeof previo.weight === 'number'
        ? Math.round((c.weight - previo.weight) * 10) / 10
        : null;
      return { c, delta };
    })
    .slice(-CHECKINS_EN_LA_TABLA)
    .reverse();

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

      {/* ── La serie: qué le ha ido diciendo ─────────────────────────────── */}
      {filas.length > 1 && (
        <div className="overflow-x-auto rounded-surface border border-hairline">
          <table className="w-full border-collapse" style={{ minWidth: '420px' }}>
            <caption className="sr-only">
              Sus últimos {filas.length} check-ins, con el peso, el cambio respecto al anterior,
              la adherencia que declaró y si ya está contestado.
            </caption>
            <thead>
              <tr className="bg-bg">
                <th scope="col" className="text-left px-3 py-2.5 font-mono text-caption text-ink-2 uppercase tracking-wider border-b border-hairline">Fecha</th>
                <th scope="col" className="text-right px-3 py-2.5 font-mono text-caption text-ink-2 uppercase tracking-wider border-b border-hairline">Peso</th>
                <th scope="col" className="text-right px-3 py-2.5 font-mono text-caption text-ink-2 uppercase tracking-wider border-b border-hairline">Cambio</th>
                <th scope="col" className="text-left px-3 py-2.5 font-mono text-caption text-ink-2 uppercase tracking-wider border-b border-hairline">Adherencia</th>
                <th scope="col" className="text-left px-3 py-2.5 font-mono text-caption text-ink-2 uppercase tracking-wider border-b border-hairline">Ánimo</th>
                <th scope="col" className="text-left px-3 py-2.5 font-mono text-caption text-ink-2 uppercase tracking-wider border-b border-hairline">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filas.map(({ c, delta }) => (
                <tr key={c.id} className="border-b border-hairline last:border-b-0">
                  <th scope="row" className="text-left px-3 py-2.5 font-mono font-normal text-caption text-ink-2 tabular-nums whitespace-nowrap">
                    {fecha(c)}
                  </th>
                  <td className="px-3 py-2.5 text-right font-mono text-label text-ink tabular-nums">
                    {typeof c.weight === 'number' ? `${c.weight} kg` : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-caption tabular-nums text-ink-2">
                    {/* Sin color: que el peso baje es bueno o malo según el
                        objetivo del bloque, y esta tabla no lo conoce. */}
                    {delta == null ? '—' : delta === 0 ? '=' : `${delta > 0 ? '+' : '−'}${Math.abs(delta)}`}
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge tone={TONO_ADHERENCIA[c.adherence] ?? 'neutral'}>{c.adherence}</Badge>
                  </td>
                  <td className="px-3 py-2.5 text-label" aria-label={`Ánimo: ${c.mood ?? 'sin indicar'}`}>
                    {c.mood ?? '—'}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-caption text-ink-3">
                    {c.approved ? 'aprobado' : c.coachFeedback ? 'contestado' : 'sin contestar'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
