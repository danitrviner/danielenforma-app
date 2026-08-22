import { useState } from 'react';
import { Sheet, Button, Input, Stepper } from '../ui';
import { OPEN_AI_PANEL_EVENT } from '../../ai/events';

// Pantalla 3 (Bloque H2.1) — "Proponer plan con IA". Formulario corto que
// compone un prompt para el asistente y abre el panel de chat con él ya
// escrito (sin enviarlo solo — mismo gesto que los chips de sugerencia del
// propio panel, ver `ai/events.ts`), en vez de duplicar la llamada al modelo
// aquí: el panel ya sabe hacer streaming, tool calls y mostrar la propuesta
// resultante con Aprobar/Rechazar — reconstruir eso en un flujo paralelo
// solo para tener una barra "revisar uno a uno" habría añadido una segunda
// vía para el mismo resultado, con el doble de superficie para romper algo
// justo antes de subir a la store. `propose_periodization_block` crea UNA
// propuesta que agrupa mesociclo + revisiones (no N eventos sueltos), así
// que aprobar/rechazar esa propuesta ya cubre "aceptar todos"/"descartar";
// lo que no cubre es la navegación ← → por eventos individuales del brief
// original, porque no hay una lista de eventos sueltos que recorrer.

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function ProposePlanSheet({ open, onClose }: Props) {
  const [objective, setObjective] = useState('');
  const [weeks, setWeeks] = useState(8);
  const [daysPerWeek, setDaysPerWeek] = useState(4);
  const [notes, setNotes] = useState('');

  if (!open) return null;

  function buildPrompt(): string {
    const parts = [
      `objetivo "${objective.trim() || 'a definir según su historial'}"`,
      `${weeks} semanas`,
      `${daysPerWeek} días/semana`,
    ];
    let prompt = `Proponme un bloque de periodización completo (propose_periodization_block) para este atleta: ${parts.join(', ')}.`;
    if (notes.trim()) prompt += ` Restricciones o notas: ${notes.trim()}.`;
    prompt += ' Revisa antes su historial de entrenamiento y las tendencias de sus cuestionarios para que la cadencia de revisiones y la semana de descarga respondan a cómo le ha ido, no a un patrón genérico.';
    return prompt;
  }

  function handleGenerate() {
    window.dispatchEvent(new CustomEvent(OPEN_AI_PANEL_EVENT, { detail: { prompt: buildPrompt() } }));
    onClose();
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Proponer plan con IA"
      footer={(
        <>
          <Button variant="secondary" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1" onClick={handleGenerate} icon="auto_awesome">Generar propuesta</Button>
        </>
      )}
    >
      <div className="space-y-4">
        <p className="font-sans text-caption text-ink-2 leading-relaxed">
          Se abre el asistente con la petición ya escrita para que la revises antes de enviarla — nada se crea hasta que
          apruebes la propuesta que te devuelva.
        </p>
        <Input
          label="Objetivo del bloque"
          value={objective}
          onChange={setObjective}
          placeholder="Ej. Hipertrofia tren superior, fuerza en básicos…"
        />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block font-mono text-caption text-ink-2 uppercase tracking-wider mb-1">Semanas</label>
            <Stepper label="Semanas" dense value={weeks} min={1} max={16} onChange={setWeeks} />
          </div>
          <div>
            <label className="block font-mono text-caption text-ink-2 uppercase tracking-wider mb-1">Días/semana</label>
            <Stepper label="Días por semana" dense value={daysPerWeek} min={1} max={7} onChange={setDaysPerWeek} />
          </div>
        </div>
        <div>
          <label className="block font-mono text-caption text-ink-2 uppercase tracking-wider mb-1">Restricciones o notas</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            placeholder="Lesiones, material disponible, preferencias…"
            className="w-full bg-surface border border-hairline rounded-control px-3 py-3 text-title-s text-white placeholder-ink-2/30 font-sans focus:outline-none focus:ring-1 focus:ring-accent resize-none"
          />
        </div>
      </div>
    </Sheet>
  );
}
