import React from 'react';

// Bloque base para estados de carga: sustituye el texto "Cargando..." por una
// silueta del contenido real — se percibe más rápido y evita el parpadeo de
// "aquí no hay nada" un instante antes de que lleguen los datos.
export default function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`bg-white/7 rounded-lg animate-pulse ${className}`} />;
}

// Silueta genérica de pantalla: usada como fallback de Suspense al cambiar de
// pestaña (App.tsx) — no conoce la forma real de cada pantalla (son muy
// distintas entre sí), así que aproxima lo común a todas: un título y unas
// tarjetas.
export function ScreenSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Skeleton className="h-32 w-full rounded-2xl" />
      <Skeleton className="h-20 w-full rounded-2xl" />
      <Skeleton className="h-20 w-full rounded-2xl" />
    </div>
  );
}
