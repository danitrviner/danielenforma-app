import React from 'react';
import { AcademyCourse } from '../../types';
import { Icon, ProgressBar } from '../ui';
import PortadaCurso from './PortadaCurso';

/* Tarjeta de curso de la rejilla de Training Lab.
   Vive aparte de AcademyScreen por dos motivos: la pantalla ya era larga, y
   una tarjeta suelta se puede mirar con datos de mentira sin montar la app
   entera ni iniciar sesión. */

type Props = {
  curso: AcademyCourse;
  /** Porcentaje del curso, 0-100. */
  pct: number;
  /** Lecciones del curso y cuántas lleva hechas. */
  total: number;
  hechas: number;
  unlocked: boolean;
  /** Por qué está bloqueado, cuando lo está. */
  reason?: string;
  onClick: () => void;
  /** Sin `@types/react` en el repo, TS no excluye `key` por su cuenta (ver ListRow). */
  key?: React.Key;
};

export default function TarjetaCurso({ curso, pct, total, hechas, unlocked, reason, onClick }: Props) {
  const completado = pct >= 100;

  return (
    <button
      type="button"
      onClick={() => unlocked && onClick()}
      disabled={!unlocked}
      className={`group flex flex-col text-left overflow-hidden rounded-surface border bg-surface transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-accent/40 ${
        unlocked ? 'border-hairline hover:border-strong' : 'border-hairline cursor-not-allowed'
      }`}
    >
      <div className="relative">
        <PortadaCurso
          category={curso.category}
          coverImageUrl={curso.coverImageUrl}
          title={curso.title}
          className={unlocked ? '' : 'grayscale opacity-40'}
        />
        {/* Estado sobre la portada, como la insignia de una ficha de curso: se
            ve sin leer nada. */}
        <div className="absolute top-2 right-2 flex items-center gap-1">
          {!unlocked && (
            <span className="inline-flex items-center gap-1 rounded-control bg-veil/70 px-2 py-1 font-mono text-caption uppercase tracking-widest text-ink-2 backdrop-blur-sm">
              <Icon name="lock" size="s" />
              Bloqueado
            </span>
          )}
          {unlocked && completado && (
            <span className="inline-flex items-center gap-1 rounded-control bg-veil/70 px-2 py-1 font-mono text-caption uppercase tracking-widest text-success backdrop-blur-sm">
              <Icon name="check_circle" size="s" />
              Completado
            </span>
          )}
        </div>
        {unlocked && total > 0 && (
          <span className="absolute bottom-2 left-3 font-mono text-caption text-ink-2">
            {hechas > 0 && !completado
              ? `${hechas} de ${total} lecciones`
              : `${total} ${total === 1 ? 'lección' : 'lecciones'}`}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <p className="font-sans font-bold text-body-s text-ink">{curso.title}</p>
        <p className="font-sans text-label text-ink-2 mt-1 line-clamp-2">{curso.description}</p>
        <div className="mt-auto pt-3">
          {unlocked ? (
            <>
              <ProgressBar value={pct} label={`Progreso de ${curso.title}, ${pct}%`} />
              <p className={`font-mono text-caption mt-1.5 ${completado ? 'text-success' : 'text-ink-4'}`}>
                {completado ? 'Completado' : pct > 0 ? `${pct} % completado` : 'Sin empezar'}
              </p>
            </>
          ) : (
            <p className="font-mono text-caption text-ink-3">{reason}</p>
          )}
        </div>
      </div>
    </button>
  );
}
