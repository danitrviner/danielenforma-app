import React, { useState } from 'react';
import { Button, Icon, ProgressBar, RingSeal, Skeleton } from '../../components/ui';
import { MUSCLE_LABELS } from '../../types';
import { haptics } from '../../services/haptics';
import MachineCard from './MachineCard';
import { useCatalogoSwipe } from './useCatalogoSwipe';

/* ═══════════════════════════════════════════════════════════════════════════
   Repaso del catálogo de máquinas — pantallas 01 a 04 del handoff.

   Cuatro fases en un solo componente porque son un solo flujo: entrada, swipe,
   checkpoint de categoría y cierre. Sacarlas a rutas distintas obligaría a
   sincronizar el progreso por la URL sin ganar nada: nunca se entra a una fase
   sin venir de la anterior.

   Se usa tanto en el onboarding (a pantalla completa, con `onOmitir`) como
   desde Perfil › Mi gimnasio para retomar lo que quedó a medias.
   ═══════════════════════════════════════════════════════════════════════════ */

type Props = {
  email: string;
  /** Terminó el repaso, o el atleta pulsó "Ir a mi plan". */
  onCompletado: () => void;
  /**
   * Salir dejándolo a medias. Si no se pasa, no se ofrece la opción — es lo que
   * distingue "repasar desde Perfil" (puedes cerrar sin más) de "onboarding"
   * (omitir deja tarea pendiente).
   */
  onOmitir?: () => void;
  /** Sin `@types/react` en el repo, TS no excluye `key` por su cuenta (ver Chip). */
  key?: React.Key;
};

export default function CatalogoSwipe({ email, onCompletado, onOmitir }: Props) {
  const { estado, decidir, deshacer, empezar, continuarCategoria, omitir, finalizar } = useCatalogoSwipe(email);
  const [salidaForzada, setSalidaForzada] = useState<'izquierda' | 'derecha' | null>(null);

  const { fase, cola, categoriaActual, categoriaCerrada, siguienteCategoria, revisadas, total, tengoTotal, porCategoria } = estado;

  const pulsar = (tengo: boolean) => {
    if (salidaForzada) return;
    setSalidaForzada(tengo ? 'derecha' : 'izquierda');
  };

  const alDecidir = (tengo: boolean) => {
    setSalidaForzada(null);
    decidir(tengo);
  };

  // Salir NUNCA puede depender de que Firestore acepte la escritura.
  //
  // Desde ae7106c una escritura denegada relanza, y estos dos son las dos únicas
  // salidas de una pantalla que se monta como gate a pantalla completa: si el
  // throw sube, el atleta se queda encerrado en el catálogo sin poder terminar
  // ni omitir. Sería el mismo encierro que P0-2, que es justo lo que todo esto
  // venía a arreglar.
  //
  // Dejar salir no pierde nada: `guardarGimnasio` escribe el respaldo local
  // ANTES de intentar Firestore, así que las decisiones siguen ahí y se
  // reintentan en la próxima operación. Y del fallo ya avisa la barra roja
  // global, que no depende de esta pantalla.
  const salirOmitiendo = async () => {
    try {
      await omitir();
    } catch (err) {
      console.warn('No se pudo registrar que el catálogo queda pendiente:', err);
    }
    onOmitir?.();
  };

  const terminar = async () => {
    haptics.success();
    try {
      await finalizar();
    } catch (err) {
      console.warn('No se pudo marcar el catálogo como completado:', err);
    }
    onCompletado();
  };

  // Sin catálogo publicado no hay nada que preguntar: el flujo se aparta solo en
  // vez de enseñar una pila de cero tarjetas. Pasa mientras el admin no haya
  // revisado lo importado, que es el estado de salida del importador.
  React.useEffect(() => {
    if (fase === 'vacio') onCompletado();
  }, [fase, onCompletado]);

  if (fase === 'cargando' || fase === 'vacio') {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <Skeleton className="h-80 w-full max-w-sm" style={{ margin: '0 20px' }} />
      </div>
    );
  }

  /* ── 01 Entrada ─────────────────────────────────────────────────────────── */
  if (fase === 'entrada') {
    const categoriasPreview = porCategoria.slice(0, 6).map(c => MUSCLE_LABELS[c.categoria]);
    return (
      <div className="min-h-screen bg-bg flex flex-col px-6 py-10 gap-8">
        <div className="flex-1 flex flex-col justify-center gap-6">
          <div className="w-14 h-14 rounded-control bg-accent-bg flex items-center justify-center">
            <Icon name="fitness_center" size="l" className="text-accent" />
          </div>
          <h1 className="font-display font-black text-headline uppercase text-ink">Configura tu gimnasio</h1>
          <p className="font-sans text-body text-ink-2">
            No te preguntamos qué ejercicios haces. Solo qué máquinas tienes disponibles, para que Dani
            monte tu plan con lo que de verdad puedes usar.
          </p>

          <div className="flex items-center gap-5 rounded-surface bg-surface border border-hairline p-5">
            <div>
              <div className="font-display font-black text-feature text-accent">{total}</div>
              <div className="font-mono text-caption text-ink-4 uppercase tracking-widest">Máquinas</div>
            </div>
            <div className="w-px self-stretch bg-hairline" />
            <p className="font-sans text-body-s text-ink-3">
              Hammer Strength (Plate Loaded) y Technogym (Pure Strength)
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {categoriasPreview.map(c => (
              <span key={c} className="px-2 py-1 rounded-chip bg-raised font-mono text-caption uppercase tracking-wider text-ink-3">
                {c}
              </span>
            ))}
          </div>

          <p className="font-mono text-caption text-ink-4 uppercase tracking-widest">
            Tarda ≈ {Math.max(1, Math.round(total / 10))} minutos · Se guarda solo
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <Button variant="primary" size="l" onClick={empezar}>Empezar</Button>
          {onOmitir && (
            <Button variant="ghost" size="m" onClick={salirOmitiendo}>Ahora no, más tarde</Button>
          )}
        </div>
      </div>
    );
  }

  /* ── 03 Categoría completada ────────────────────────────────────────────── */
  if (fase === 'checkpoint' && categoriaCerrada) {
    const cerrada = porCategoria.find(c => c.categoria === categoriaCerrada);
    return (
      <div className="min-h-screen bg-bg flex flex-col px-6 py-10 gap-8">
        <div className="flex-1 flex flex-col justify-center gap-6">
          <div className="w-14 h-14 rounded-control bg-success/15 flex items-center justify-center">
            <Icon name="check" size="l" className="text-success" />
          </div>
          <h1 className="font-display font-black text-headline uppercase text-ink">
            {MUSCLE_LABELS[categoriaCerrada]} lista
          </h1>
          <p className="font-sans text-body text-ink-2">
            Marcaste {cerrada?.tengo ?? 0} de {cerrada?.total ?? 0} máquinas en tu gimnasio.
            {siguienteCategoria && ' Sigue con la siguiente categoría.'}
          </p>

          <div className="rounded-surface bg-surface border border-hairline p-5 flex flex-col gap-3">
            <div className="font-mono text-caption text-ink-4 uppercase tracking-widest">Progreso por categoría</div>
            {porCategoria.map(c => {
              const completa = c.decididas === c.total;
              return (
                <div key={c.categoria} className="flex items-center gap-3">
                  <span className={`w-1.5 h-1.5 rounded-full ${completa ? 'bg-success' : 'bg-ink-5'}`} />
                  <span className="flex-1 font-sans text-body-s text-ink-2">{MUSCLE_LABELS[c.categoria]}</span>
                  <span className={`font-mono text-caption ${completa ? 'text-success' : 'text-ink-4'}`}>
                    {c.decididas}/{c.total}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <Button variant="primary" size="l" onClick={continuarCategoria}>
            {siguienteCategoria ? `Seguir con ${MUSCLE_LABELS[siguienteCategoria].toLowerCase()}` : 'Seguir'}
          </Button>
          {onOmitir && (
            <Button variant="ghost" size="m" onClick={salirOmitiendo}>Cerrar y continuar más tarde</Button>
          )}
        </div>
      </div>
    );
  }

  /* ── 04 Resumen final ───────────────────────────────────────────────────── */
  if (fase === 'resumen') {
    return (
      <div className="min-h-screen bg-bg flex flex-col px-6 py-10 gap-8">
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-6">
          <RingSeal percent={total ? (tengoTotal / total) * 100 : 0} size={150} label={`${tengoTotal} máquinas en tu gimnasio`}>
            <span className="flex flex-col items-center leading-none">
              <span className="font-display font-black text-feature text-ink">{tengoTotal}</span>
              <span className="font-mono text-caption text-ink-4 uppercase tracking-widest mt-1">Máquinas</span>
            </span>
          </RingSeal>
          <h1 className="font-display font-black text-headline uppercase text-ink">Tu gimnasio está configurado</h1>
          <p className="font-sans text-body text-ink-2">
            Dani ya sabe qué tienes disponible. Puedes añadir o quitar máquinas cuando quieras desde
            Perfil › Mi gimnasio.
          </p>
        </div>
        <Button variant="primary" size="l" onClick={terminar}>Ir a mi plan</Button>
      </div>
    );
  }

  /* ── 02 Swipe ───────────────────────────────────────────────────────────── */
  const pila = cola.slice(0, 3);
  const enCategoria = categoriaActual ? porCategoria.find(c => c.categoria === categoriaActual) : null;

  return (
    <div className="min-h-screen bg-bg flex flex-col px-5 py-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={deshacer}
          disabled={!estado.puedeDeshacer}
          aria-label="Deshacer la última decisión"
          className="w-11 h-11 rounded-control bg-raised border border-hairline flex items-center justify-center
                     text-ink-2 disabled:opacity-30 transition-opacity"
        >
          <Icon name="undo" size="m" />
        </button>

        <div className="flex-1">
          <div className="font-mono text-caption font-semibold uppercase tracking-widest text-accent">
            {categoriaActual ? MUSCLE_LABELS[categoriaActual] : ''}
          </div>
          <div className="mt-2">
            <ProgressBar value={total ? (revisadas / total) * 100 : 0} label={`${revisadas} de ${total} máquinas revisadas`} />
          </div>
        </div>

        <span className="font-mono text-label text-ink-4">{revisadas}/{total}</span>
      </div>

      {enCategoria && (
        <p className="mt-2 font-mono text-caption text-ink-5 uppercase tracking-wider">
          {enCategoria.decididas}/{enCategoria.total} en esta categoría
        </p>
      )}

      <div className="relative flex-1 my-5">
        {/* Se pinta en orden inverso para que la primera de la cola quede arriba del todo. */}
        {pila.map((m, i) => (
          <MachineCard
            key={m.id}
            maquina={m}
            profundidad={i}
            onDecidir={alDecidir}
            salidaForzada={i === 0 ? salidaForzada : null}
          />
        ))}
      </div>

      <div className="flex justify-center gap-6 pb-4">
        <button
          type="button"
          onClick={() => pulsar(false)}
          aria-label={`No tengo ${cola[0]?.nombreMostrado ?? 'esta máquina'}`}
          className="w-15 h-15 rounded-full bg-raised border border-danger/40 flex items-center justify-center
                     text-danger active:scale-95 transition-transform"
          style={{ width: 60, height: 60 }}
        >
          <Icon name="close" size="m" />
        </button>
        <button
          type="button"
          onClick={() => pulsar(true)}
          aria-label={`Sí tengo ${cola[0]?.nombreMostrado ?? 'esta máquina'}`}
          className="rounded-full bg-raised border border-success/45 flex items-center justify-center
                     text-success active:scale-95 transition-transform"
          style={{ width: 60, height: 60 }}
        >
          <Icon name="check" size="m" />
        </button>
      </div>

      {onOmitir && (
        <Button variant="ghost" size="s" onClick={salirOmitiendo}>Cerrar y continuar más tarde</Button>
      )}
    </div>
  );
}
