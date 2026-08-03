import React from 'react';

interface Props {
  icon: string;
  titulo: string;
  descripcion?: string;
  cta?: { label: string; onClick: () => void };
}

// Estado vacío real: el CRM arranca sin un solo dato de ejemplo, así que esto
// es lo primero que se ve en cada tabla. Lleva su CTA para que la pantalla
// vacía sea accionable y no un callejón sin salida.
export default function EmptyState({ icon, titulo, descripcion, cta }: Props) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-2 py-12 px-6">
      <span className="material-symbols-outlined text-3xl text-ink-3">{icon}</span>
      <p className="font-sans font-bold text-sm text-ink">{titulo}</p>
      {descripcion && (
        <p className="font-sans text-[11px] text-[#a8a89e] max-w-[320px] leading-relaxed">{descripcion}</p>
      )}
      {cta && (
        <button
          type="button"
          onClick={cta.onClick}
          className="mt-2 px-3 py-1.5 rounded-lg bg-accent text-black font-sans font-bold text-[11px] hover:bg-accent-press transition-colors"
        >
          {cta.label}
        </button>
      )}
    </div>
  );
}
