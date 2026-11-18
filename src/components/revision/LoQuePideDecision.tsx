import React from 'react';
import type { AvisoDeDecision, TipoDeAviso } from '../../utils/revisionDeLaSemana';
import type { FilaDeSemaforo, ColorDeSemaforo } from '../../utils/hipotesisDeBloque/semaforoDeHipotesis';
import { ETIQUETA_DE_SEMAFORO } from '../../utils/hipotesisDeBloque/semaforoDeHipotesis';
import { Button, Card, Icon } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Lo que pide decisión — la cara PREPARAR (18-11-2026)

   Solo coach, arriba del todo y fuera en modo Presentar. Junta lo que la app
   ya calcula y pide decidir algo esta semana (utils/revisionDeLaSemana/
   loQuePideDecision.ts) y el semáforo de las hipótesis del bloque (el mismo
   del Seguimiento). Las zonas a subir, mantener o frenar necesitan el
   protocolo semanal del Seguimiento CDG: no se recalculan aquí, se enlaza.
   ═══════════════════════════════════════════════════════════════════════════ */

const ICONO: Record<TipoDeAviso, string> = {
  ritmo: 'monitor_weight', descarga: 'warning', sesion_dura: 'bolt', estancado: 'trending_flat', hipotesis: 'fact_check',
};
const PUNTO: Record<ColorDeSemaforo, string> = { en_camino: 'bg-success', por_detras: 'bg-warning', sin_dato: 'bg-track' };
const TEXTO: Record<ColorDeSemaforo, string> = { en_camino: 'text-success', por_detras: 'text-warning', sin_dato: 'text-ink-3' };

interface Props {
  avisos: AvisoDeDecision[];
  semaforo: FilaDeSemaforo[];
  /** Abre el bloque, donde está el Seguimiento con las zonas a subir, mantener o frenar. */
  onAbrirSeguimiento: () => void;
  /** Hay bloque en curso (si no, el enlace al Seguimiento no tiene sentido). */
  hayBloque: boolean;
}

export default function LoQuePideDecision({ avisos, semaforo, onAbrirSeguimiento, hayBloque }: Props) {
  const nada = avisos.length === 0 && semaforo.length === 0;
  return (
    <Card
      title="Lo que pide decisión"
      subtitle="Solo para ti: no sale al presentar."
      action={hayBloque ? (
        <Button variant="ghost" onClick={onAbrirSeguimiento}>
          <Icon name="open_in_new" size="s" />
          Zonas a subir, mantener o frenar
        </Button>
      ) : undefined}
    >
      {nada ? (
        <p className="font-sans text-label text-ink-2">
          Nada pide decisión esta semana: ni ejercicios parados, ni sesiones de 8 o más, ni cambios por mirar, y el peso va al ritmo de la fase.
          {hayBloque ? ' Las zonas, en el Seguimiento del bloque.' : ''}
        </p>
      ) : (
        <div className="space-y-4">
          {semaforo.length > 0 && (
            <div className="space-y-1.5">
              <p className="font-mono text-caption text-ink-3 uppercase tracking-[.08em]">Hipótesis del bloque</p>
              <ul className="m-0 p-0 list-none space-y-1.5">
                {semaforo.map(f => (
                  <li key={f.zona} className="flex items-start gap-2">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${PUNTO[f.color]}`} aria-hidden="true" />
                    <span className="min-w-0 font-sans text-label text-ink-2 text-pretty">
                      <span className="font-bold text-ink">{f.nombre}</span>
                      <span className="text-ink-3"> · {f.palanca} · </span>
                      <span className={`font-bold ${TEXTO[f.color]}`}>{ETIQUETA_DE_SEMAFORO[f.color]}</span>
                      <span className="block font-mono text-caption text-ink-3">{f.texto}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {avisos.length > 0 && (
            <ul className="m-0 p-0 list-none divide-y divide-hairline">
              {avisos.map(a => (
                <li key={a.id} className="py-2.5 first:pt-0 last:pb-0 flex items-start gap-2.5">
                  <Icon name={ICONO[a.tipo]} size="s" className="text-warning shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="font-sans font-bold text-label text-ink text-pretty">{a.titulo}</p>
                    <p className="font-sans text-label text-ink-2 text-pretty">{a.detalle}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
