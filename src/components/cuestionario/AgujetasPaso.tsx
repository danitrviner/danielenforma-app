import React, { useMemo, useState } from 'react';
import type { QuestionnaireQuestion } from '../../types';
import { ZONA_POR_CLAVE, esZonaIem, type ZonaIem } from '../../utils/cdg/zonas';
import { diaDeLaSemana, type ZonaEntrenada } from '../../utils/cuestionarioAuto';
import MapaCorporal, { colorDeNota } from './MapaCorporal';
import { Icon, Sheet, Button } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Paso de agujetas (cuestionarios, 27-10)

   Una sola pantalla para todas las zonas, con el mapa corporal arriba. Solo se
   pregunta por lo que el atleta entrenó esa semana (sus sesiones registradas);
   el resto queda plegado por si entrenó algo fuera de la app. Escala 1–5 del
   curso CDG. Tocar una zona abre qué significa cada nota.

   Las descripciones del 2 y el 4 son propias: el curso solo define el 1
   («apenas noté trabajo»), el 3 («las noto al moverme») y el 5 («duele en
   reposo»).
   ═══════════════════════════════════════════════════════════════════════════ */

export const NOTAS_AGUJETAS: { n: number; titulo: string; detalle: string }[] = [
  { n: 1, titulo: 'Apenas noté trabajo', detalle: 'Ni me acordé de que la había entrenado' },
  { n: 2, titulo: 'Algo de tensión', detalle: 'Solo al apretar o al estirar a fondo' },
  { n: 3, titulo: 'Las noto al moverme', detalle: 'Al andar, subir escaleras o sentarme' },
  { n: 4, titulo: 'Me molestan bastante', detalle: 'Me condicionan el día a día' },
  { n: 5, titulo: 'Duelen incluso en reposo', detalle: 'Quieto ya las noto' },
];

const zonaDe = (q: QuestionnaireQuestion): ZonaIem | null => {
  const z = q.signalKey?.slice('agujetas.'.length) ?? '';
  return esZonaIem(z) ? z : null;
};

interface Props {
  preguntas: QuestionnaireQuestion[];
  answers: Record<string, string | number | boolean>;
  setAnswer: (questionId: string, value: number) => void;
  /** Zonas entrenadas esta semana. Vacío = no se sabe: se enseñan todas. */
  entrenadas: ZonaEntrenada[];
}

export default function AgujetasPaso({ preguntas, answers, setAnswer, entrenadas }: Props) {
  const [verTodas, setVerTodas] = useState(false);
  const [detalle, setDetalle] = useState<QuestionnaireQuestion | null>(null);

  const porZona = useMemo(() => {
    const m = new Map<ZonaIem, QuestionnaireQuestion>();
    for (const q of preguntas) { const z = zonaDe(q); if (z) m.set(z, q); }
    return m;
  }, [preguntas]);
  const fechaDe = useMemo(() => new Map(entrenadas.map(e => [e.zona, e.fecha])), [entrenadas]);
  const sabemos = entrenadas.length > 0;

  const notas: Partial<Record<ZonaIem, number>> = {};
  for (const [z, q] of porZona) { const v = answers[q.id]; if (typeof v === 'number') notas[z] = v; }

  const entrenadasConPregunta = [...porZona.keys()].filter(z => !sabemos || fechaDe.has(z));
  const resto = [...porZona.keys()].filter(z => sabemos && !fechaDe.has(z));
  const visibles = verTodas ? [...entrenadasConPregunta, ...resto] : entrenadasConPregunta;
  const respondidas = entrenadasConPregunta.filter(z => notas[z]).length;

  const fila = (z: ZonaIem) => {
    const q = porZona.get(z)!;
    const valor = notas[z];
    const fecha = fechaDe.get(z);
    return (
      <div key={z} className={`flex items-center gap-3 bg-surface border rounded-control px-3 py-2 ${!valor && fecha ? 'border-accent-line' : 'border-hairline'}`}>
        <button type="button" onClick={() => setDetalle(q)} className="min-w-0 flex-1 text-left">
          <span className="block font-sans text-label font-bold text-ink truncate">{ZONA_POR_CLAVE[z].nombre}</span>
          <span className="block font-sans text-caption text-ink-4">{fecha ? `Entrenada el ${diaDeLaSemana(fecha)}` : 'No registrada esta semana'}</span>
        </button>
        <div className="flex gap-1" role="radiogroup" aria-label={`Agujetas en ${ZONA_POR_CLAVE[z].nombre}`}>
          {NOTAS_AGUJETAS.map(({ n, titulo }) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={valor === n}
              aria-label={`${n}: ${titulo}`}
              onClick={() => setAnswer(q.id, n)}
              className={`w-8 h-8 rounded-[8px] font-mono text-caption tabular-nums transition-transform active:scale-95 ${valor === n ? 'font-bold text-on-accent' : 'bg-raised border border-hairline text-ink-3'}`}
              style={valor === n ? { background: colorDeNota(n), color: n <= 2 ? 'var(--color-ink)' : undefined } : undefined}
            >{n}</button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <MapaCorporal
        notas={notas}
        pendientes={new Set(entrenadasConPregunta)}
        apagadas={sabemos ? new Set(resto) : undefined}
        onZona={z => { const q = porZona.get(z); if (q) setDetalle(q); }}
        alto={150}
      />
      <div className="flex justify-between font-mono text-caption uppercase tracking-[.14em] text-ink-4">
        <span>{sabemos ? 'Entrenaste esta semana' : 'Tus zonas'}</span>
        <span className="tabular-nums">{respondidas} de {entrenadasConPregunta.length}</span>
      </div>
      <div className="flex flex-col gap-1.5">{visibles.map(fila)}</div>
      {resto.length > 0 && (
        <button type="button" onClick={() => setVerTodas(v => !v)} className="inline-flex items-center gap-1.5 font-sans text-caption text-ink-4 hover:text-ink">
          <Icon name={verTodas ? 'expand_less' : 'expand_more'} size="s" />
          {verTodas ? 'Ocultar las que no entrenaste' : `${resto.length} zonas sin entrenar esta semana`}
        </button>
      )}

      <Sheet open={!!detalle} onClose={() => setDetalle(null)} title={detalle ? ZONA_POR_CLAVE[zonaDe(detalle)!]?.nombre : ''} size="s">
        {detalle && (
          <div className="space-y-2">
            {fechaDe.get(zonaDe(detalle)!) && (
              <p className="font-sans text-caption text-ink-4">Entrenada el {diaDeLaSemana(fechaDe.get(zonaDe(detalle)!)!)} · cómo estaba unas 48 h después</p>
            )}
            {NOTAS_AGUJETAS.map(({ n, titulo, detalle: d }) => {
              const sel = answers[detalle.id] === n;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => { setAnswer(detalle.id, n); setDetalle(null); }}
                  className={`w-full flex items-center gap-3 text-left bg-raised border rounded-control px-3 py-2.5 ${sel ? 'border-accent-line ring-2 ring-accent-bg' : 'border-hairline'}`}
                >
                  <span className="w-8 h-8 rounded-[8px] grid place-items-center font-mono text-label font-bold shrink-0" style={{ background: colorDeNota(n), color: n <= 2 ? 'var(--color-ink)' : 'var(--color-on-accent)' }}>{n}</span>
                  <span>
                    <span className="block font-sans text-label font-bold text-ink">{titulo}</span>
                    <span className="block font-sans text-caption text-ink-4">{d}</span>
                  </span>
                </button>
              );
            })}
            <Button variant="secondary" fullWidth onClick={() => setDetalle(null)}>Cerrar</Button>
          </div>
        )}
      </Sheet>
    </div>
  );
}
