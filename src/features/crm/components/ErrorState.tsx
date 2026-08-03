import React from 'react';

interface Props {
  descripcion?: string;
}

// Estado de error de una lista/tabla. Sin esto, una query que falla (cuota de
// Firestore agotada, sin red, permiso denegado...) deja el skeleton de carga
// girando para siempre — TanStack Query nunca sale de `isPending` mientras
// `enabled` sea true y no se lea `isError` en algún sitio. Encontrado en vivo
// el 2026-08-02: la cuota gratuita diaria de lecturas de Firestore se agotó a
// mitad de esta sesión y las pestañas del CRM se quedaron cargando sin fin.
export default function ErrorState({ descripcion }: Props) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-2 py-12 px-6">
      <span className="material-symbols-outlined text-3xl text-danger">error</span>
      <p className="font-sans font-bold text-sm text-ink">No se ha podido cargar</p>
      <p className="font-sans text-caption text-ink-2 max-w-[320px] leading-relaxed">
        {descripcion ?? 'Puede ser un problema temporal de conexión. Recarga la página en un momento.'}
      </p>
    </div>
  );
}
