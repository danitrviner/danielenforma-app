import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useScrollLock } from '../../components/ui/internal/overlayHooks';
import { TourStep } from './steps';
import { TourState, isBlockedByAction } from './tourReducer';
import { Icon, Button } from '../../components/ui';

/* ═══════════════════════════════════════════════════════════════════════════
   TourOverlay (F3.12)

   El motor visual: cartel de pantalla al entrar en una pestaña nueva, foco
   recortado sobre el objetivo real (mide `getBoundingClientRect()` en cada
   paso — nunca coordenadas fijas), gesto fantasma sobre el punto exacto, y
   la hoja de Dani anclada abajo (o arriba si el objetivo vive en la mitad
   inferior de la pantalla, para no taparlo).

   `getRect` puede devolver null (el objetivo todavía no se ha montado, p.
   ej. justo después de cambiar de pestaña mientras la pantalla nueva
   renderiza) — el overlay se queda sin recorte ese frame y lo vuelve a
   pedir en el siguiente `version` que dispare TourTargetContext.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  step: TourStep;
  stepIndex: number;
  totalSteps: number;
  state: TourState;
  getRect: (id: string) => DOMRect | null;
  targetVersion: number;
  isFirstPass: boolean; // primera vez (no repetible) — sin "Saltar el tour"
  onNext: () => void;
  onBack: () => void;
  onSkipStep: () => void;
  onClose: () => void;
  /** Antibloqueo (T7.c): el objetivo de un paso con acción obligatoria no
   *  apareció a tiempo — el motor marca la acción como hecha igualmente para
   *  que NEXT deje de estar bloqueado en el reducer. */
  onForceUnblock: () => void;
}

const SCREEN_BANNER_MS = 1800;
const ANTIBLOQUEO_MS = 2500;

export default function TourOverlay({
  step, stepIndex, totalSteps, state, getRect, targetVersion, isFirstPass,
  onNext, onBack, onSkipStep, onClose, onForceUnblock,
}: Props) {
  useScrollLock(true);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [showBanner, setShowBanner] = useState(!!step.targetId);
  const prevSectionRef = useRef<string | null>(null);

  // Regla de ritmo: al entrar en una sección nueva se ve el cartel con el
  // nombre de la pantalla antes que el detalle; si el paso siguiente vive en
  // la misma sección, no se repite.
  useEffect(() => {
    const isNewSection = prevSectionRef.current !== step.section;
    prevSectionRef.current = step.section;
    if (!step.targetId) { setShowBanner(false); return; }
    if (!isNewSection) { setShowBanner(false); return; }
    setShowBanner(true);
    const t = window.setTimeout(() => setShowBanner(false), SCREEN_BANNER_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id]);

  useEffect(() => {
    if (!step.targetId || showBanner) { setRect(null); return; }
    const r = getRect(step.targetId);
    setRect(r);
    if (r) {
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      el?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id, showBanner, targetVersion]);

  const blocked = isBlockedByAction(state);

  // Antibloqueo: un paso con acción obligatoria (marcar una serie, registrar
  // una ingesta) puede no tener nada que señalar ese día —no hay sesión hoy,
  // no hay comida programada— y sin esto el atleta se quedaba encerrado en
  // el primer pase sin ninguna salida. Si el objetivo sigue sin aparecer
  // ~2,5s después de dejar de mostrar el cartel de sección, se desbloquea
  // solo: un tour incompleto es mejor que un tour que encierra.
  const [autoUnblocked, setAutoUnblocked] = useState(false);
  useEffect(() => { setAutoUnblocked(false); }, [step.id]);
  useEffect(() => {
    if (!blocked || showBanner || rect) return;
    const t = window.setTimeout(() => {
      setAutoUnblocked(true);
      onForceUnblock();
    }, ANTIBLOQUEO_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocked, showBanner, rect, step.id]);

  const anchorTop = rect ? rect.top > window.innerHeight / 2 : false;

  const clipStyle = useMemo((): React.CSSProperties => {
    if (!rect) return { boxShadow: '0 0 0 9999px rgba(0,0,0,.62)' };
    const pad = 6;
    return {
      position: 'fixed',
      top: rect.top - pad,
      left: rect.left - pad,
      width: rect.width + pad * 2,
      height: rect.height + pad * 2,
      borderRadius: 14,
      border: '1px solid rgba(255,199,44,.55)',
      boxShadow: '0 0 0 9999px rgba(0,0,0,.62)',
      transition: 'top 300ms, left 300ms, width 300ms, height 300ms',
      pointerEvents: 'none',
      zIndex: 1,
    };
  }, [rect]);

  const primaryLabel = autoUnblocked
    ? 'Continuar'
    : blocked
      ? (step.actionLabel ?? 'Completa la acción')
      : stepIndex === totalSteps - 1
        ? 'Ir a mi entreno de hoy'
        : state.actionDone && step.requiresAction
          ? 'Perfecto, sigue'
          : 'Siguiente';

  return createPortal(
    <div className="fixed inset-0 z-[var(--z-modal)]" role="dialog" aria-modal="true" aria-label={`Tutorial, paso ${stepIndex + 1} de ${totalSteps}: ${step.title}`}>
      {/* Recorte del objetivo, o telón plano si no hay ninguno / se está enseñando la pantalla */}
      {rect && !showBanner ? <div style={clipStyle} /> : <div className="fixed inset-0" style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,.62)' }} />}

      {/* Cartel de pantalla — "la pantalla entera antes que el detalle" */}
      {showBanner && (
        <div className="fixed inset-x-0 top-[max(env(safe-area-inset-top),1rem)] flex justify-center z-10 animate-fade-up">
          <span className="rounded-[14px] bg-accent px-[18px] py-[10px] font-mono text-caption font-bold uppercase tracking-wider text-on-accent">
            {step.section}
          </span>
        </div>
      )}

      {/* Gesto fantasma — anillo de 48px que respira sobre el punto exacto a tocar */}
      {rect && !showBanner && (
        <div
          className="fixed pointer-events-none z-10 h-12 w-12 rounded-full bg-accent/90 animate-ghost-tap"
          style={{ top: rect.top + rect.height / 2 - 24, left: rect.right - 24 }}
        />
      )}

      {/* Hoja de Dani */}
      <div
        className={`fixed inset-x-0 z-20 ${anchorTop ? 'top-[max(env(safe-area-inset-top),1rem)]' : 'bottom-0'} px-4 ${anchorTop ? '' : 'pb-[max(env(safe-area-inset-bottom),1.25rem)]'}`}
      >
        <div className={`mx-auto max-w-md rounded-sheet bg-raised border border-hairline p-5 space-y-4 ${anchorTop ? 'animate-fade-up' : 'animate-sheet-in'}`}>
          <div className="flex items-center gap-3">
            <div className="h-[34px] w-[34px] shrink-0 rounded-full bg-accent flex items-center justify-center font-display font-black text-body-s text-on-accent">D</div>
            <span className="rounded-chip bg-accent/14 px-2 py-1 font-mono text-caption uppercase text-accent">{step.section}</span>
            <span className="ml-auto font-mono text-caption text-ink-3 tabular-nums">{String(stepIndex + 1).padStart(2, '0')} / {totalSteps}</span>
          </div>

          <div className="h-1 w-full rounded-full bg-track overflow-hidden">
            <div className="h-full rounded-full bg-accent transition-[width] duration-(--duration-bar) ease-brand" style={{ width: `${((stepIndex + 1) / totalSteps) * 100}%` }} />
          </div>

          <div>
            <p className="font-display text-title-l font-black text-ink">{step.title}</p>
            <p className="font-sans text-body-s text-ink-2 mt-1 leading-relaxed">{step.body}</p>
          </div>

          <div className="flex items-center gap-2">
            {stepIndex > 0 && (
              <Button variant="secondary" size="l" icon="arrow_back" onClick={onBack} label="Atrás" className="shrink-0" />
            )}
            <Button onClick={onNext} disabled={blocked} fullWidth size="l" className="flex-1">
              {primaryLabel}
            </Button>
          </div>

          {step.skippable && (
            <button onClick={onSkipStep} className="w-full text-center text-label font-sans text-ink-3">Ahora no</button>
          )}
          {!isFirstPass && (
            <button onClick={onClose} className="w-full text-center text-caption font-mono uppercase text-ink-3">Saltar el tour</button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
