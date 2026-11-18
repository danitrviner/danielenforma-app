import React from 'react';
import type { LoQueMeContaste as Contado, RespuestaContada, DatoAlLado } from '../../utils/revisionDeLaSemana';
import { fechaCorta } from '../../utils/trainingWeek';
import { Icon } from '../ui';
import type { VarianteSemana } from './VistazoDeLaSemana';

/* ═══════════════════════════════════════════════════════════════════════════
   2 · Lo que me contaste (18-11-2026)

   Sus respuestas de la semana —cuestionario y check-in— antes que las tablas,
   cada una con el dato real al lado cuando lo hay: el sueño con sus horas, la
   energía con el cansancio con el que salió de las sesiones, «el jueves salí
   reventado» con la sesión de ese jueves. La lógica está en
   utils/revisionDeLaSemana/loQueMeContaste.ts; aquí solo se pinta.

   Dos versiones, como «Tu semana de un vistazo»:
     · A «Cifras»: pregunta y respuesta a la izquierda, el dato en una caja a
       la derecha (debajo en el móvil).
     · B «Barras» (citas): la respuesta grande, entre comillas si es texto, y
       el dato debajo con una flecha.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  contado: Contado;
  variante: VarianteSemana;
}

function Dato({ dato }: { dato: DatoAlLado }) {
  return (
    <span className="flex items-start gap-1.5 font-sans text-label text-ink-2 text-pretty">
      <Icon name="insights" size="s" className="text-accent-ink shrink-0 mt-0.5" />
      <span>{dato.texto}</span>
    </span>
  );
}

// `key` a mano: sin `@types/react` TS no lo excluye solo (como en Chip).
function RespuestaA({ r }: { r: RespuestaContada; key?: React.Key }) {
  return (
    <li className="py-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:gap-4 items-start">
      <div className="min-w-0">
        <p className="font-mono text-caption text-ink-3">{r.pregunta}</p>
        <p className={r.esTexto ? 'font-sans text-body-s text-ink text-pretty' : 'font-sans font-bold text-title-s text-ink tabular-nums'}>
          {r.esTexto ? `«${r.respuesta}»` : r.respuesta}
          {r.anterior && <span className="font-mono font-normal text-caption text-ink-3 ml-2">antes {r.anterior}</span>}
        </p>
      </div>
      {r.dato && (
        <div className="bg-raised border border-hairline rounded-surface px-3 py-2">
          <Dato dato={r.dato} />
        </div>
      )}
    </li>
  );
}

function RespuestaB({ r }: { r: RespuestaContada; key?: React.Key }) {
  return (
    <li className="py-3 space-y-1">
      <p className="font-mono text-caption text-ink-3 uppercase tracking-[.08em]">{r.pregunta}</p>
      <p className={r.esTexto ? 'font-sans text-title-s text-ink text-pretty' : 'font-sans font-bold text-title-m text-ink tabular-nums'}>
        {r.esTexto ? `«${r.respuesta}»` : r.respuesta}
        {r.anterior && <span className="font-sans font-normal text-label text-ink-3 ml-2">la vez anterior, {r.anterior}</span>}
      </p>
      {r.dato && (
        <p className="flex items-start gap-1.5 font-sans text-label text-ink-2 text-pretty pl-1">
          <Icon name="arrow_forward" size="s" className="text-accent-ink shrink-0 mt-0.5" />
          <span>{r.dato.texto}</span>
        </p>
      )}
    </li>
  );
}

export default function LoQueMeContaste({ contado, variante }: Props) {
  const Respuesta = variante === 'b' ? RespuestaB : RespuestaA;
  const { checkin } = contado;
  return (
    <div className="space-y-4">
      {checkin && (
        <div className="space-y-1">
          <p className="font-mono text-caption text-ink-3 uppercase tracking-[.08em]">
            Check-in del {fechaCorta(checkin.fecha, { dia: true })}
          </p>
          <ul className="m-0 p-0 list-none divide-y divide-hairline">
            <Respuesta r={{
              questionId: 'checkin_resumen', pregunta: 'Ánimo, peso y dieta',
              respuesta: [checkin.animo, checkin.peso != null ? `${String(checkin.peso).replace('.', ',')} kg` : null, checkin.adherencia ? `dieta: ${checkin.adherencia.toLowerCase()}` : null].filter(Boolean).join(' · '),
              anterior: null, esTexto: false, dato: null,
            }} />
            {checkin.nota && (
              <Respuesta r={{ questionId: 'checkin_nota', pregunta: 'Lo que me escribiste', respuesta: checkin.nota, anterior: null, esTexto: true, dato: checkin.dato }} />
            )}
          </ul>
        </div>
      )}
      {contado.cuestionarios.map(c => (
        <div key={c.responseId} className="space-y-1">
          <p className="font-mono text-caption text-ink-3 uppercase tracking-[.08em]">
            {c.titulo} · {fechaCorta(c.fecha, { dia: true })}
          </p>
          <ul className="m-0 p-0 list-none divide-y divide-hairline">
            {c.respuestas.map(r => <Respuesta key={r.questionId} r={r} />)}
          </ul>
        </div>
      ))}
    </div>
  );
}
