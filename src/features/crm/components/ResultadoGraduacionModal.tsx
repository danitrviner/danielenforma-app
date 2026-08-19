import React from 'react';
import { useToast } from '../../../hooks/useToast';
import { useActualizarReunion } from '../hooks/useReuniones';
import Modal, { BotonSecundario } from './Modal';
import type { CrmReunion, ResultadoGraduacion } from '../types';
import { Icon } from '../../../components/ui';

// Se interpone SOLO al marcar una GRADUACIÓN como realizada — es la medición
// directa de "conversión a continuidad", la palanca de negocio más grande
// según objetivo-100k-desglose.md del vault (el 40% de continuidad baja las
// ventas nuevas necesarias de ~10/mes a ~6-7/mes). Sin preguntar aquí, en el
// único momento en que el coach tiene el dato fresco, no se vuelve a capturar
// nunca. Las reuniones de "optimización" siguen siendo un toggle directo, sin
// esta fricción — ahí no hay nada que medir.
export default function ResultadoGraduacionModal({ reunion, onCerrar }: { reunion: CrmReunion; onCerrar: () => void }) {
  const { showToast } = useToast();
  const actualizar = useActualizarReunion();

  const elegir = async (resultado: ResultadoGraduacion) => {
    try {
      await actualizar.mutateAsync({
        id: reunion.id,
        clientId: reunion.clientId,
        updates: { realizada: true, resultadoGraduacion: resultado },
      });
      showToast('Graduación registrada', 'success');
      onCerrar();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se ha podido registrar', 'error');
    }
  };

  return (
    <Modal
      titulo={`Graduación · ${reunion.clientNombre}`}
      onCerrar={onCerrar}
      footer={<BotonSecundario onClick={onCerrar}>Cancelar</BotonSecundario>}
    >
      <div className="space-y-3">
        <p className="font-sans text-caption text-ink-2">¿Qué pasó en la graduación?</p>
        <div className="grid grid-cols-1 gap-2">
          <button
            type="button"
            onClick={() => elegir('continua')}
            disabled={actualizar.isPending}
            className="flex items-center gap-2 p-3 rounded-control bg-success/10 border border-success/25 hover:bg-success/15 disabled:opacity-40 transition-colors text-left"
          >
            <Icon name="trending_up" size="l" className="text-success" />
            <div>
              <p className="font-sans font-bold text-label text-ink">Sigue con nosotros</p>
              <p className="font-mono text-caption text-ink-3">Pasa a continuidad</p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => elegir('no_continua')}
            disabled={actualizar.isPending}
            className="flex items-center gap-2 p-3 rounded-control bg-white/5 border border-hairline hover:bg-white/8 disabled:opacity-40 transition-colors text-left"
          >
            <Icon name="flag" size="l" className="text-ink-2" />
            <div>
              <p className="font-sans font-bold text-label text-ink">No continúa</p>
              <p className="font-sans text-caption text-ink-3">Termina el programa aquí</p>
            </div>
          </button>
        </div>
      </div>
    </Modal>
  );
}
