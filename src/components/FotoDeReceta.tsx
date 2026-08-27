import React, { useEffect, useState } from 'react';
import { esFotoViva } from '../utils/fotoDeReceta';

interface Props {
  src?: string;
  alt: string;
  className?: string;
  /** Qué pintar si no hay foto, si el host está muerto o si la carga falla. */
  fallback: React.ReactNode;
}

/**
 * <img> que degrada al hueco de siempre en vez de dejar el icono de imagen rota.
 * Cubre los dos casos: URL que ya sabemos muerta (no llega a pedirse) y URL viva
 * en apariencia que falla al cargar.
 */
export default function FotoDeReceta({ src, alt, className, fallback }: Props) {
  const [fallo, setFallo] = useState(false);
  useEffect(() => { setFallo(false); }, [src]);

  if (!esFotoViva(src) || fallo) return <>{fallback}</>;

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={className}
      onError={() => setFallo(true)}
    />
  );
}
