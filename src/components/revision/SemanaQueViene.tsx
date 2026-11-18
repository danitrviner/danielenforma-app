import React from 'react';
import type { SemanaQueViene as Semana } from '../../utils/revisionDeLaSemana';
import { TEXTO_TIPO_SEMANA } from '../../utils/revisionDeLaSemana';
import { fechaCorta } from '../../utils/trainingWeek';
import { Icon } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   5 · La semana que viene (18-11-2026)

   Solo datos reales (utils/revisionDeLaSemana/semanaQueViene.ts): qué semana
   es, lo que ya está programado que cambie, el cuestionario que le toca y el
   siguiente paso de carga de sus ejercicios principales. Quien lo monta no lo
   pinta si no hay nada (`null`): Dani prefiere que no salga a inventar.
   ═══════════════════════════════════════════════════════════════════════════ */

const EVENTO: Record<string, string> = {
  vacaciones: 'Vacaciones', viaje: 'Viaje', competicion: 'Competición', otro: 'Algo especial',
};

function Bloque({ icono, titulo, children }: { icono: string; titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1.5 font-mono text-caption text-ink-3 uppercase tracking-[.08em]">
        <Icon name={icono} size="s" className="text-accent-ink" />
        {titulo}
      </p>
      {children}
    </div>
  );
}

export default function SemanaQueViene({ semana: s }: { semana: Semana }) {
  const cabecera = s.semana > 0
    ? `${s.bloqueNuevo ? `Empieza «${s.bloque}»: semana 1` : `Semana ${s.semana} de ${s.semanas}`} · desde el ${fechaCorta(s.desde, { dia: true })}`
    : `Desde el ${fechaCorta(s.desde, { dia: true })}`;
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="font-mono text-caption text-ink-3">{cabecera}</p>
        {(s.tipo !== 'normal' || s.semana > 0) && (
          <p className="font-sans font-bold text-title-s text-ink text-pretty">
            {s.tipo === 'evento' && s.evento ? `${EVENTO[s.evento.tipo] ?? 'Semana especial'}` : TEXTO_TIPO_SEMANA[s.tipo]}
          </p>
        )}
        {s.evento?.nota && <p className="font-sans text-label text-ink-2 text-pretty">«{s.evento.nota}»</p>}
        {s.vuelveElVolumen && (
          <p className="font-sans text-label text-ink-2">Vuelve el volumen de siempre después de la descarga.</p>
        )}
      </div>

      {s.cambios.length > 0 && (
        <Bloque icono="edit_note" titulo="Lo que cambia en tus sesiones">
          <ul className="m-0 p-0 list-none space-y-1">
            {s.cambios.map((c, i) => (
              <li key={`${c.dia}-${c.ejercicio}-${i}`} className="font-sans text-label text-ink text-pretty">
                <span className="font-bold">{c.ejercicio}</span>
                <span className="text-ink-3"> · {c.dia}</span>: {c.cambios.join(', ')}
              </li>
            ))}
          </ul>
        </Bloque>
      )}

      {s.cargas.length > 0 && (
        <Bloque icono="bolt" titulo="Tu siguiente paso de carga">
          <ul className="m-0 p-0 list-none space-y-1">
            {s.cargas.map(c => (
              <li key={c.exerciseId} className="font-sans text-label text-ink text-pretty">
                <span className="font-bold">{c.ejercicio}</span>: {c.texto.charAt(0).toLowerCase() + c.texto.slice(1)}
              </li>
            ))}
          </ul>
        </Bloque>
      )}

      {s.cuestionarios.length > 0 && (
        <Bloque icono="fact_check" titulo="Lo que te toca contestar">
          <ul className="m-0 p-0 list-none space-y-1">
            {s.cuestionarios.map(c => (
              <li key={`${c.titulo}-${c.fecha}`} className="font-sans text-label text-ink">
                {c.titulo} <span className="text-ink-2">· {fechaCorta(c.fecha, { dia: true })}</span>
              </li>
            ))}
          </ul>
        </Bloque>
      )}
    </div>
  );
}
