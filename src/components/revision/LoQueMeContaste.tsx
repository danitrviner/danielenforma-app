import React from 'react';
import type { LoQueMeContaste as Contado, RespuestaContada } from '../../utils/revisionDeLaSemana';
import { fechaCorta } from '../../utils/trainingWeek';
import { Icon } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   2 · Lo que me contaste (18-11-2026)

   Sus respuestas de la semana —cuestionario y check-in— antes que las tablas,
   cada una con el dato real al lado cuando lo hay: el sueño con sus horas, la
   energía con el cansancio con el que salió de las sesiones, «el jueves salí
   reventado» con la sesión de ese jueves. La lógica está en
   utils/revisionDeLaSemana/loQueMeContaste.ts; aquí solo se pinta.

   La respuesta grande, entre comillas si es texto, y el dato debajo con una
   flecha (versión «Barras y citas», elegida por Dani el 18-11-2026).
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  contado: Contado;
}

// `key` a mano: sin `@types/react` TS no lo excluye solo (como en Chip).
function Respuesta({ r }: { r: RespuestaContada; key?: React.Key }) {
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

export default function LoQueMeContaste({ contado }: Props) {
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
