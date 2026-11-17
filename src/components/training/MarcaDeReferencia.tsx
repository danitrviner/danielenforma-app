/* ═══════════════════════════════════════════════════════════════════════════
   «Otra máquina o recorrido» (D3, 11-11-2026)

   El atleta lo marca cuando hoy el ejercicio no es el mismo de siempre: otra
   máquina, otro apoyo, baja más hondo. Desde esa sesión el 1RM, los récords y
   la tendencia no se comparan con lo anterior (utils/referenciaDeEjercicio.ts).

   Es un chip, igual que los de «¿No lo has hecho?» que tiene justo encima
   (versión B, elegida por Dani el 11-11-2026 entre tres).
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  marcada: boolean;
  onCambiar: (marcada: boolean) => void;
}

export default function MarcaDeReferencia({ marcada, onCambiar }: Props) {
  return (
    <div className="mb-3">
      <p className="font-mono text-caption text-ink-2 uppercase tracking-wider mb-2">¿Algo distinto hoy?</p>
      <button
        type="button"
        onClick={() => onCambiar(!marcada)}
        aria-pressed={marcada}
        className={`rounded-control border px-2.5 py-1.5 font-sans text-label transition-colors ${
          marcada ? 'border-accent-line text-accent-ink' : 'border-hairline text-ink-2 hover:text-ink'
        }`}
      >
        Otra máquina o recorrido
      </button>
      {marcada && (
        <p className="mt-2 font-sans text-caption text-ink-2">
          Vale: empezamos a contar desde hoy. No lo comparo con tus marcas de antes.
        </p>
      )}
    </div>
  );
}
