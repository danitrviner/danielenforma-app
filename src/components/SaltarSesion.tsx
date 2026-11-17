import React, { useState } from 'react';
import { MOTIVOS_DE_SALTO, etiquetaDeMotivo, type MotivoDeSalto } from '../utils/saltarSesion';
import { Button, Icon, Sheet } from './ui';

/* ═══════════════════════════════════════════════════════════════════════════
   «No voy a poder hacerla» — la acción discreta de la tarjeta de una sesión
   en Rutinas (17-11-2026). Pregunta el motivo en un toque y avisa hacia
   arriba; quien la monta marca la sesión como saltada (utils/saltarSesion).

   Dos versiones para elegir, con la misma lógica:
     · `hoja`     el enlace abre una hoja con los cuatro motivos en grande.
                  No ocupa nada en la tarjeta hasta que se toca.
     · `enLinea`  los motivos se despliegan en la propia tarjeta, como los de
                  «¿No lo has hecho?» de un ejercicio. Un toque menos de viaje.

   `SesionSaltada` es lo que queda en la tarjeta los segundos en que todavía
   se puede deshacer.
   ═══════════════════════════════════════════════════════════════════════════ */

export type VarianteSaltar = 'hoja' | 'enLinea';
export const VARIANTE_SALTAR_POR_DEFECTO: VarianteSaltar = 'hoja';

interface Props {
  /** Nombre de la rutina, para el título de la hoja. */
  sesion: string;
  onSaltar: (motivo: MotivoDeSalto) => void;
  variante?: VarianteSaltar;
}

const ENLACE = 'inline-flex items-center gap-1 font-sans text-caption text-ink-4 underline underline-offset-2 hover:text-ink-2';

export default function SaltarSesion({ sesion, onSaltar, variante = VARIANTE_SALTAR_POR_DEFECTO }: Props) {
  const [abierto, setAbierto] = useState(false);
  const elegir = (m: MotivoDeSalto) => { setAbierto(false); onSaltar(m); };

  if (variante === 'enLinea') {
    if (!abierto) {
      return <button type="button" onClick={() => setAbierto(true)} className={ENLACE}>No voy a poder hacerla</button>;
    }
    return (
      <div className="space-y-2">
        <p className="font-mono text-caption text-ink-2 uppercase tracking-wider">¿Qué ha pasado?</p>
        <div className="flex flex-wrap gap-1.5">
          {MOTIVOS_DE_SALTO.map(m => (
            <button
              key={m.clave}
              type="button"
              onClick={() => elegir(m.clave)}
              className="rounded-control border border-hairline px-2.5 py-1.5 font-sans text-label text-ink-2 hover:text-ink transition-colors"
            >
              {m.etiqueta}
            </button>
          ))}
          <button type="button" onClick={() => setAbierto(false)} className="px-2 py-1.5 font-sans text-label text-ink-4 hover:text-ink">Cancelar</button>
        </div>
      </div>
    );
  }

  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} className={ENLACE}>No voy a poder hacerla</button>
      <Sheet open={abierto} onClose={() => setAbierto(false)} title="¿Qué ha pasado?" size="s">
        <div className="space-y-2">
          <p className="font-sans text-caption text-ink-4 text-pretty">{sesion} se queda como saltada. No pasa nada: seguimos con la siguiente.</p>
          {MOTIVOS_DE_SALTO.map(m => (
            <button
              key={m.clave}
              type="button"
              onClick={() => elegir(m.clave)}
              className="w-full flex items-center gap-3 text-left bg-raised border border-hairline rounded-control px-3 py-2.5 hover:border-accent-line transition-colors"
            >
              <span className="w-8 h-8 rounded-[8px] grid place-items-center bg-surface text-ink-2 shrink-0"><Icon name={m.icono} size="s" /></span>
              <span className="font-sans text-label font-bold text-ink">{m.etiqueta}</span>
            </button>
          ))}
          <Button variant="secondary" fullWidth onClick={() => setAbierto(false)}>Mejor no</Button>
        </div>
      </Sheet>
    </>
  );
}

/** Lo que se ve justo después de saltarla, mientras aún se puede deshacer. */
export function SesionSaltada({ motivo, onDeshacer }: { motivo: MotivoDeSalto; onDeshacer: () => void }) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-sans text-caption text-ink-3" role="status">
      <span>Saltada · {etiquetaDeMotivo(motivo).toLowerCase()}</span>
      <button type="button" onClick={onDeshacer} className="inline-flex items-center gap-1 font-bold text-accent-ink underline underline-offset-2">
        <Icon name="undo" size="s" />
        Deshacer
      </button>
    </p>
  );
}
