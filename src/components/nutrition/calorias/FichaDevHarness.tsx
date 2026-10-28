import { useState } from 'react';
import FichaAlimentoCalorias, { racionesDe } from './FichaAlimentoCalorias';

/* Banco de pruebas de la ficha de alimento (`/dev/ficha`, solo en desarrollo):
   pan con ración de producto y mermelada sin ración. No escribe nada. */
const CASOS = {
  pan: { nombre: 'Pan de molde', porCien: { kcal: 250, p: 9, hc: 46, g: 3.5 }, opc: { racion: 40, ultimos: 60 } },
  mermelada: { nombre: 'Mermelada de fresa', porCien: { kcal: 250, p: 0.4, hc: 61, g: 0.1 }, opc: { ultimos: 20 } },
} as const;

export default function FichaDevHarness() {
  const [caso, setCaso] = useState<keyof typeof CASOS | null>('pan');
  const [log, setLog] = useState<string[]>([]);
  const c = caso ? CASOS[caso] : null;
  return (
    <div className="min-h-screen bg-bg p-4 space-y-3">
      <div className="flex gap-2">
        {(Object.keys(CASOS) as (keyof typeof CASOS)[]).map(k => (
          <button key={k} type="button" onClick={() => setCaso(k)} className="rounded-control border border-hairline px-3 py-2 text-ink">{k}</button>
        ))}
      </div>
      <pre data-testid="log" className="font-mono text-caption text-ink-2">{log.join('\n')}</pre>
      {c && (
        <div key={caso}>
        <FichaAlimentoCalorias
          nombre={c.nombre}
          porCien={c.porCien}
          raciones={racionesDe(c.opc)}
          mealId="m"
          onGuardarRacion={g => setLog(l => [...l, `ración guardada: ${g}`])}
          onConfirm={(g, m) => setLog(l => [...l, `añadir ${g} g a ${m}`])}
          onClose={() => setCaso(null)}
        />
        </div>
      )}
    </div>
  );
}
