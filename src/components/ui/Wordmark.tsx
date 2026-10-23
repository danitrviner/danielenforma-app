import React from 'react';

/**
 * «EN FORMA» escrito, para las cabeceras. El color lo decide la SUPERFICIE
 * donde se pinta, no el modo claro/oscuro:
 *
 *   · `papel` (por defecto): sobre `bg`/`surface`. «EN» en tinta y «FORMA» en
 *     el oro de texto (`accent-ink`), que se lee en los dos modos.
 *   · `velo`: sobre una superficie oscura fija (la sesión en vivo, una portada
 *     con foto, un velo). Aquí sí va en blanco, con «FORMA» en el oro claro.
 *
 * No se fuerza el blanco sobre fondos claros: en `papel` jamás sale blanco.
 */
export default function Wordmark({ sobre = 'papel', className = '' }: { sobre?: 'papel' | 'velo'; className?: string }) {
  const velo = sobre === 'velo';
  return (
    <span className={`font-sans font-extrabold text-title-m tracking-tighter uppercase select-none ${className}`}>
      <span className={velo ? 'text-on-veil' : 'text-ink'}>EN </span>
      <span className={velo ? 'text-on-veil-accent' : 'text-accent-ink'}>FORMA</span>
    </span>
  );
}
