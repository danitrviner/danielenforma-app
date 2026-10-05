import React, { useState } from 'react';
import { Icon, Button } from '../ui';
import type { NovedadesDeSemana as Novedades } from '../../utils/semanasDelBloque';

const CLAVE = 'enforma_novedades_vistas_v1';

const TITULO_EVENTO = { vacaciones: 'Semana de vacaciones', viaje: 'Semana de viaje', competicion: 'Semana de competición', otro: 'Esta semana' } as const;

function leerVistas(): string[] {
  try { return JSON.parse(localStorage.getItem(CLAVE) ?? '[]'); } catch { return []; }
}

/** Aviso al empezar una semana en la que el coach ha programado cambios: que
 *  el atleta no se encuentre el top set o la descarga sin saber por qué. Se
 *  oculta al pulsar «Entendido» (por semana y mesociclo, en este dispositivo). */
export default function NovedadesDeSemana({ novedades, clave, semana }: { novedades: Novedades; clave: string; semana: number }) {
  const [vista, setVista] = useState(() => leerVistas().includes(clave));
  if (vista) return null;

  const cerrar = () => {
    setVista(true);
    try { localStorage.setItem(CLAVE, JSON.stringify([...leerVistas(), clave].slice(-40))); } catch { /* sin almacenamiento: solo se oculta en esta visita */ }
  };

  return (
    <section className="rounded-surface border border-accent-line bg-accent/8 px-4 py-3.5 space-y-2.5" aria-label="Novedades de esta semana">
      <div className="flex items-center gap-2">
        <Icon name="event_note" size="s" className="text-accent-ink" />
        <p className="font-sans font-bold text-body-s text-ink">Novedades de esta semana</p>
        <span className="font-mono text-caption text-ink-3">Semana {semana}</span>
      </div>
      <ListaDeNovedades novedades={novedades} />
      <Button size="s" variant="ghost" icon="done_all" onClick={cerrar}>Entendido</Button>
    </section>
  );
}

/** Las líneas de novedades (descarga, test, evento, cambios por ejercicio):
 *  las usa el aviso de la semana y el de la sesión. `sinDia` quita el «· Día»
 *  cuando todos los ejercicios son de la misma sesión. */
export function ListaDeNovedades({ novedades, sinDia = false }: { novedades: Novedades; sinDia?: boolean }) {
  return (
    <ul className="space-y-1.5">
      {novedades.descarga && (
        <li className="font-sans text-label text-ink-2">
          <span className="font-bold text-info">Semana de descarga.</span> Haces la mitad de series para recuperar. Cada serie, igual de bien hecha.
        </li>
      )}
      {novedades.test && (
        <li className="font-sans text-label text-ink-2">
          <span className="font-bold text-warning">Semana de test.</span> En los ejercicios marcados AMRAP, la última serie va a todas las repeticiones que puedas con buena técnica. Con eso ajustamos tus cargas.
        </li>
      )}
      {novedades.evento && (
        <li className="font-sans text-label text-ink-2">
          <span className="font-bold text-ink">{TITULO_EVENTO[novedades.evento.tipo]}.</span>{novedades.evento.nota ? ` ${novedades.evento.nota}` : ''}
        </li>
      )}
      {novedades.vuelveElVolumen && (
        <li className="font-sans text-label text-ink-2">
          <span className="font-bold text-ink">Vuelves al volumen normal</span> después de la descarga.
        </li>
      )}
      {novedades.cambios.map((c, i) => (
        <li key={i} className="font-sans text-label text-ink-2">
          <span className="font-bold text-ink">{c.ejercicio}</span>
          {!sinDia && <span className="text-ink-3"> · {c.dia}</span>}: {c.cambios.join(' · ')}
        </li>
      ))}
    </ul>
  );
}
