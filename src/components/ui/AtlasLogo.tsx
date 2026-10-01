import React from 'react';

/**
 * El Atlas de la marca. El PNG original es oro claro: sobre el papel del modo
 * claro da 1,6:1 y desaparece. Hay una versión en oro de tinta
 * (`atlas-logo-claro.png`) y se elige con la clase `.dark` del <html>, que es
 * lo que mueve el ajuste de Perfil (un `prefers-color-scheme` ignoraría la
 * elección manual).
 */
export default function AtlasLogo({ className = '', alt = '' }: { className?: string; alt?: string }) {
  return (
    <>
      <img src="/atlas-logo-claro.png" alt={alt} className={`${className} dark:hidden`} />
      <img src="/atlas-logo.png" alt={alt} aria-hidden={alt === '' ? true : undefined} className={`${className} hidden dark:block`} />
    </>
  );
}
