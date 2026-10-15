import React from 'react';
import type { Novedad } from '../data/novedades';
import { Sheet, Button, Icon } from './ui';

/* ═══════════════════════════════════════════════════════════════════════════
   «Qué hay de nuevo»

   La ventana que enseña al atleta lo que ha cambiado en la app y le afecta.
   Sale sola en Inicio cuando hay algo que no ha visto (HomeScreen) y se puede
   reabrir con todo el historial desde Perfil › Ajustes.
   ═══════════════════════════════════════════════════════════════════════════ */

function fecha(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
}

interface Props {
  open: boolean;
  onClose: () => void;
  novedades: Novedad[];
  /** Hay más novedades de las que se enseñan aquí: se indica dónde verlas. */
  hayMas?: boolean;
}

export default function NovedadesSheet({ open, onClose, novedades, hayMas = false }: Props) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Qué hay de nuevo"
      size="m"
      footer={<Button onClick={onClose} className="w-full">Entendido</Button>}
    >
      {novedades.length === 0 ? (
        <p className="font-sans text-label text-ink-2 py-4">Por ahora no hay novedades.</p>
      ) : (
        <div className="space-y-6 pb-2">
          {novedades.map(n => (
            <section key={n.id} className="space-y-3" aria-label={n.titulo}>
              <header>
                <p className="font-mono text-caption text-ink-3">{fecha(n.fecha)}</p>
                <h3 className="font-sans font-bold text-title-s text-ink">{n.titulo}</h3>
              </header>
              <ul className="m-0 p-0 list-none space-y-3">
                {n.puntos.map(p => (
                  <li key={p.titulo} className="flex gap-3">
                    <Icon name="check_circle" size="s" className="text-accent-ink flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-sans text-label font-bold text-ink">{p.titulo}</p>
                      <p className="font-sans text-label text-ink-2 leading-relaxed">{p.texto}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {hayMas && (
            <p className="font-mono text-caption text-ink-3">
              Hay más novedades anteriores en Perfil › Ajustes › Qué hay de nuevo.
            </p>
          )}
        </div>
      )}
    </Sheet>
  );
}
