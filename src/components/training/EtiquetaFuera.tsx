/* La etiqueta discreta «Fuera» que ve el coach en las sesiones hechas fuera
   del gimnasio del atleta (17-11-2026): en el historial de cargas y en la
   lista de sesiones. Ver utils/sesionFuera.ts. */
export default function EtiquetaFuera({ className = '' }: { className?: string }) {
  return (
    <span
      title="Hecha fuera de su gimnasio: sus kilos no cuentan para la fuerza"
      className={`ml-1.5 inline-flex items-center rounded-control border border-hairline px-1.5 font-mono text-caption uppercase text-ink-2 ${className}`}
    >
      Fuera
    </span>
  );
}
