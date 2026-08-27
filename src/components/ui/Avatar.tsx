import React, { useEffect, useState } from 'react';

interface Props {
  src?: string;
  /** Para sacar las iniciales cuando no hay foto. */
  name?: string;
  className?: string;
  alt?: string;
}

function iniciales(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map(p => p[0] ?? '').join('').toUpperCase();
}

/**
 * Foto de perfil con iniciales de reserva.
 *
 * Los perfiles que se crean desde la app nacen con `avatarUrl: ''`, y un
 * `<img src="">` no queda vacío: el navegador resuelve la URL a la propia
 * página, recibe HTML y pinta el icono de imagen rota. De ahí el «no cargan las
 * imágenes» en cabecera, lista de clientes, paleta de comandos y semana del
 * coach. Las iniciales van en SVG con viewBox para que escalen solas con el
 * tamaño que traiga `className` (de 24 a 56 px según el sitio).
 */
export default function Avatar({ src, name = '', className = '', alt }: Props) {
  const [fallo, setFallo] = useState(false);
  useEffect(() => { setFallo(false); }, [src]);

  if (!src || fallo) {
    return (
      <svg viewBox="0 0 40 40" role="img" aria-label={alt || name || 'Avatar'}
           className={`${className} bg-raised text-ink-2`}>
        <text x="20" y="20" textAnchor="middle" dominantBaseline="central"
              fontSize="15" fontWeight="700" fill="currentColor">
          {iniciales(name) || '?'}
        </text>
      </svg>
    );
  }

  return (
    <img
      src={src}
      alt={alt ?? name}
      loading="lazy"
      decoding="async"
      className={className}
      onError={() => setFallo(true)}
    />
  );
}
