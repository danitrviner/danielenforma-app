import React, { useState } from 'react';
import { Icon, Button } from '../ui';
import type { NutritionProgram } from '../../types';
import {
  semanaDelPrograma, novedadesNutricion, hayNovedadesNutricion, suplementosDeLaSemana, faseDeLaSemana,
} from '../../utils/semanasNutricion';

const CLAVE = 'enforma_novedades_nutri_vistas_v1';
function leerVistas(): string[] {
  try { return JSON.parse(localStorage.getItem(CLAVE) ?? '[]'); } catch { return []; }
}

/** Lo que cambia esta semana en la dieta (según la periodización) y la
 *  suplementación que toca. Las novedades se ocultan con «Entendido»; la
 *  suplementación se queda, es una pauta de todos los días. */
export default function SemanaNutricionAtleta({ program, fecha }: { program: NutritionProgram; fecha: string }) {
  const semana = semanaDelPrograma(program, fecha);
  const clave = `${program.startDate}_${semana}`;
  const [vista, setVista] = useState(() => leerVistas().includes(clave));
  const n = novedadesNutricion(program, semana);
  const suplementos = suplementosDeLaSemana(program, semana);
  const fase = faseDeLaSemana(program, semana);
  const mostrarNovedades = !vista && hayNovedadesNutricion(n);
  if (!mostrarNovedades && suplementos.length === 0) return null;

  const cerrar = () => {
    setVista(true);
    try { localStorage.setItem(CLAVE, JSON.stringify([...leerVistas(), clave].slice(-40))); } catch { /* sin almacenamiento */ }
  };

  return (
    <div className="space-y-2">
      {mostrarNovedades && (
        <section className="rounded-surface border border-accent-line bg-accent/8 px-4 py-3.5 space-y-2" aria-label="Novedades de tu dieta esta semana">
          <div className="flex items-center gap-2">
            <Icon name="event_note" size="s" className="text-accent-ink" />
            <p className="font-sans font-bold text-body-s text-ink">Tu dieta esta semana</p>
            <span className="font-mono text-caption text-ink-3">
              Semana {semana}{fase ? ` · ${fase.fase.name}` : ''}
            </span>
          </div>
          <ul className="space-y-1">
            {n.mantenimiento && (
              <li className="font-sans text-label text-ink-2"><span className="font-bold text-info">Semana de mantenimiento:</span> un hidrato más en cada comida para recargar.</li>
            )}
            {n.vuelveDeMantenimiento && (
              <li className="font-sans text-label text-ink-2"><span className="font-bold text-ink">Vuelves a tu plan de la fase</span> después del mantenimiento.</li>
            )}
            {n.ajustes.map((t, i) => <li key={`a${i}`} className="font-sans text-label text-ink-2">{t}</li>)}
            {n.libres.map((t, i) => <li key={`l${i}`} className="font-sans text-label text-ink-2">{t}</li>)}
            {n.suplementos.map((t, i) => <li key={`s${i}`} className="font-sans text-label text-ink-2">Empiezas: {t}</li>)}
          </ul>
          <Button size="s" variant="ghost" icon="done_all" onClick={cerrar}>Entendido</Button>
        </section>
      )}
      {suplementos.length > 0 && (
        <section className="rounded-surface border border-hairline bg-surface px-4 py-3 space-y-1.5" aria-label="Suplementación">
          <p className="font-mono text-caption uppercase tracking-wider text-ink-2">Suplementación</p>
          <ul className="space-y-1">
            {suplementos.map(x => (
              <li key={x.id} className="font-sans text-label text-ink">
                <span className="font-bold">{x.nombre}</span>
                {[x.dosis, x.momento].filter(Boolean).length > 0 && (
                  <span className="text-ink-2"> · {[x.dosis, x.momento].filter(Boolean).join(' · ')}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
