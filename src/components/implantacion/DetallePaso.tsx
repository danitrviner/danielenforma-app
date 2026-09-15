import React from 'react';
import { UserProfile } from '../../types';
import { PasoConEstado } from '../../utils/implantacion';
import { SetupStatus } from '../../utils/clientSetup';
import { OPEN_AI_PANEL_EVENT, OpenAiPanelDetail } from '../../ai/events';
import { HubTab } from '../ClientHub';
import { Button, Badge, Icon, Input } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   El paso elegido — la columna derecha.

   Cuatro salidas, en el orden en que se usan:

     1. **Abrir el editor** — el de verdad, a pantalla completa encima. El
        recorrido no se pierde: al cerrar sigues en el mismo paso.
     2. **Dejárselo a la IA** — manda al asistente la instrucción LITERAL de
        este paso, no la tarea entera. Antes solo se podía lanzar «monta el mes
        completo»; ahora se puede pedir solo la pieza que falta.
     3. **Marcar hecho** — para los pasos que no dejan rastro comprobable.
     4. **Recordármelo el…** — una fecha para volver.

   El estado NO se marca a mano cuando los datos lo pueden decir: si el
   mesociclo existe, el paso está hecho. Una casilla que hay que marcar aparte
   de hacer la cosa es una casilla que acaba mintiendo.
   ═══════════════════════════════════════════════════════════════════════════ */

const ETIQUETA_ESTADO: Record<SetupStatus, { texto: string; tono: 'success' | 'warning' | 'neutral' }> = {
  done: { texto: 'Hecho', tono: 'success' },
  attention: { texto: 'Revisar', tono: 'warning' },
  pending: { texto: 'Pendiente', tono: 'neutral' },
  na: { texto: 'Todavía no aplica', tono: 'neutral' },
};

interface Props {
  paso: PasoConEstado;
  titulo: string;
  athlete: UserProfile;
  onAbrirEditor: (tab: HubTab) => void;
  onMarcar: (paso: PasoConEstado, hecho: boolean) => void;
  onFecha: (paso: PasoConEstado, fecha: string | undefined) => void;
}

export default function DetallePaso({
  paso, titulo, athlete, onAbrirEditor, onMarcar, onFecha,
}: Props) {
  const { estado, items, manual } = paso;
  const et = ETIQUETA_ESTADO[estado];

  const pedirALaIa = () => {
    const nombre = athlete.displayName?.trim().split(/\s+/)[0] || 'el atleta';
    const detail: OpenAiPanelDetail = {
      prompt:
        `TAREA: solo este paso del plan de ${nombre} (${athlete.email}).\n\n`
        + `${paso.paso.numero}. ${paso.paso.instruccionIA}\n\n`
        + 'Empieza por get_client_brief para tener su contexto. Haz SOLO este paso: '
        + 'no montes el resto del plan ni propongas piezas que no te he pedido.',
      enviar: true,
    };
    window.dispatchEvent(new CustomEvent(OPEN_AI_PANEL_EVENT, { detail }));
  };

  return (
    <div className="space-y-4">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-caption text-ink-3 tabular-nums">
            {paso.paso.bloque.toUpperCase()} · {paso.paso.numero}
          </span>
          <Badge tone={et.tono}>{et.texto}</Badge>
          {paso.aviso && <Badge tone="neutral">Recordatorio: {paso.aviso}</Badge>}
        </div>
        <h3 className="font-sans font-bold text-title-s text-ink">{titulo}</h3>
      </header>

      {/* Qué hay puesto ahora mismo. */}
      {items.length > 0 && (
        <ul className="space-y-1">
          {items.map(i => (
            <li key={i.id} className="flex items-start gap-2">
              <Icon
                name={i.status === 'done' ? 'check_circle' : i.status === 'attention' ? 'warning' : 'radio_button_unchecked'}
                size="s"
                style={{ color: i.status === 'done' ? 'var(--color-success)' : i.status === 'attention' ? 'var(--color-warning)' : 'var(--color-ink-3)' }}
                className="mt-0.5 shrink-0"
              />
              <span className="font-sans text-label text-ink-2">
                {i.title}
                {i.detail && <span className="font-mono text-caption text-ink-3"> · {i.detail}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* La instrucción del guion, tal cual. Es lo que se le manda a la IA y lo
          que explica qué hay que decidir en este paso; enseñarla evita que el
          coach y el asistente estén montando cosas distintas. */}
      <p className="font-sans text-label text-ink-2 leading-relaxed">
        {paso.paso.instruccionIA.replace(/\*\*/g, '')}
      </p>

      <div className="flex flex-wrap gap-2">
        {paso.paso.tab && (
          <Button variant="primary" onClick={() => onAbrirEditor(paso.paso.tab!)}>
            <Icon name="open_in_full" size="s" />
            Abrir el editor
          </Button>
        )}
        <Button variant="secondary" onClick={pedirALaIa}>
          <Icon name="auto_awesome" size="s" />
          Dejárselo a la IA
        </Button>
        {manual && (
          <Button variant="ghost" onClick={() => onMarcar(paso, estado !== 'done')}>
            <Icon name={estado === 'done' ? 'undo' : 'check'} size="s" />
            {estado === 'done' ? 'Desmarcar' : 'Marcar hecho'}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-2 pt-2 border-t border-hairline">
        <div className="min-w-[180px]">
          <Input
            type="date"
            label="Recordármelo el"
            value={paso.aviso ?? ''}
            onChange={v => onFecha(paso, v || undefined)}
          />
        </div>
        {paso.aviso && (
          <Button variant="ghost" onClick={() => onFecha(paso, undefined)}>Quitar aviso</Button>
        )}
      </div>
    </div>
  );
}
