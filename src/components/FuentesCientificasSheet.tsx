import React from 'react';
import { Sheet, Icon, Button } from './ui';
import { FUENTES, AVISO_MEDICO, AVISO_ENTRENADOR } from '../legal/fuentes';

/* ═══════════════════════════════════════════════════════════════════════════
   Fuentes científicas

   El panel que responde a la directriz 1.4.1 de Apple: toda recomendación de
   salud que enseña la app tiene aquí su cita, con enlace al documento
   original. Se abre desde la cabecera de Nutrición (el sitio que el revisor
   señaló), desde Cardio y desde Perfil > Legal.

   Los enlaces son `<a target="_blank">` de verdad, no `window.open()`: es el
   mismo patrón que ya usan las páginas legales en `ProfileScreen`, y el único
   que abre el navegador del sistema en el envoltorio nativo sin que lo bloquee
   el bloqueador de ventanas emergentes.
   ═══════════════════════════════════════════════════════════════════════════ */

export default function FuentesCientificasSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Fuentes científicas" size="l" alto="completo">
      <div className="space-y-6 pb-4">
        {/* El aviso va ARRIBA y sin acordeón: es lo primero que tiene que leer
            quien abre esto, incluido quien revisa la app. */}
        <div className="rounded-surface border border-hairline bg-raised p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Icon name="medical_information" size="m" className="text-ink-3 flex-shrink-0" />
            <p className="font-sans font-bold text-body-s text-ink">Esto no es consejo médico</p>
          </div>
          <p className="font-sans text-label text-ink-2 leading-relaxed">{AVISO_MEDICO}</p>
          <p className="font-sans text-label text-ink-2 leading-relaxed">{AVISO_ENTRENADOR}</p>
        </div>

        <p className="font-sans text-label text-ink-2 leading-relaxed">
          Cada cálculo y cada valor de referencia que ves en la app procede de una de estas fuentes.
          Toca cualquiera para abrir el documento original.
        </p>

        {FUENTES.map(bloque => (
          <section key={bloque.id} className="space-y-3">
            <div className="flex items-center gap-2">
              <Icon name={bloque.icono} size="m" className="text-ink-3 flex-shrink-0" />
              <h3 className="font-sans font-bold text-body text-ink">{bloque.titulo}</h3>
            </div>
            <p className="font-sans text-label text-ink-2 leading-relaxed">{bloque.intro}</p>

            <ul className="space-y-2 list-none">
              {bloque.fuentes.map(f => (
                <li key={f.url + f.cita.slice(0, 24)}>
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-surface border border-hairline bg-surface p-3 hover:border-ink-3 transition-colors"
                  >
                    <p className="font-sans text-label text-ink leading-relaxed">{f.usoEnLaApp}</p>
                    <p className="font-sans text-caption text-ink-2 leading-relaxed mt-1.5 italic">{f.cita}</p>
                    <span className="inline-flex items-center gap-1 mt-1.5 font-mono text-caption text-ink-2 uppercase tracking-wider">
                      <Icon name="open_in_new" size="s" />
                      Ver fuente
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <p className="font-sans text-caption text-ink-3 leading-relaxed">
          Última revisión de las fuentes: septiembre de 2026. Si detectas un dato desactualizado,
          escríbenos desde Perfil &gt; Soporte.
        </p>

        <Button variant="secondary" onClick={onClose} fullWidth>Cerrar</Button>
      </div>
    </Sheet>
  );
}

/* El acceso al panel, al PIE de la pantalla y en gris: un enlace de letra
   pequeña, no una tarjeta. Va abajo del todo a propósito —no compite con el
   contenido— pero no es el único rastro de las citas: la `NotaDeFuente` de
   arriba, pegada a los números, es la que cumple el «easy to find» de la
   directriz 1.4.1. Si algún día se quita esa nota, esto tiene que volver a
   subir a la cabecera o Apple lo vuelve a tumbar. */
export function EnlaceFuentes({ onClick, className = '' }: { onClick: () => void; className?: string }) {
  return (
    <div className={`pt-4 pb-2 text-center ${className}`}>
      <button
        type="button"
        onClick={onClick}
        className="font-sans text-caption text-ink-3 underline underline-offset-2 hover:text-ink-2 transition-colors"
      >
        Fuentes científicas y aviso médico
      </button>
    </div>
  );
}

/* Nota al pie que se pone JUNTO a un número de salud concreto (el mantenimiento
   estimado, la proyección de peso, las zonas de FC). Lleva su propio estado
   porque su gracia es poder soltarla en cualquier tarjeta sin que la pantalla
   de turno tenga que gestionar un overlay más. */
export function NotaDeFuente({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <p className="font-sans text-caption text-ink-3 leading-relaxed">
        {children}{' '}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="font-sans text-caption text-ink-2 underline underline-offset-2"
        >
          Ver fuentes
        </button>
      </p>
      <FuentesCientificasSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
