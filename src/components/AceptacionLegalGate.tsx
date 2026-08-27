import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { UserProfile } from '../types';
import {
  documentosPendientes, registrarAceptacion, DOCUMENTOS_LEGALES,
  type AceptacionesLegales, type MetaDocumentoLegal,
} from '../legal/aceptacion';
import { CONTENIDO_LEGAL, type CasillaLegal } from '../legal/documentos';
import { guardarAceptaciones } from '../legal/persistencia';
import { mensajeDeErrorFirestore } from '../utils/erroresFirestore';
import { useBotonAtras } from '../services/botonAtras';
import { Button, Icon } from './ui';

/* ═══════════════════════════════════════════════════════════════════════════
   El muro legal · primer login, justo antes del alta

   Un documento por paso: se lee, se marcan las casillas, se pasa al siguiente.
   El porqué de cada decisión, por orden de importancia:

   · **No se puede cerrar.** Ni X, ni Escape, ni tocar fuera, ni el botón Atrás
     de Android mientras quede algo obligatorio. No es un aviso que se descarta:
     es la puerta. Salir es cerrar sesión, y eso está a la vista abajo del todo.

   · **Nada premarcado y el botón apagado.** Considerando 32 del RGPD: el
     silencio y las casillas premarcadas no son consentimiento. Cada casilla
     obligatoria se marca a mano y hasta que no están todas no se enciende el
     botón.

   · **Hay que llegar al final del texto.** El botón tampoco se enciende
     mientras el documento no se haya desplazado hasta abajo. No demuestra que
     nadie lo haya leído —eso no lo demuestra nada— pero sí impide el
     «siguiente, siguiente, siguiente» a ciegas, y deja el texto delante de los
     ojos, que es lo que la AEPD llama información previa. Si el texto cabe
     entero sin scroll, se da por leído desde el principio.

   · **El paso opcional no bloquea.** Sus dos casillas empiezan desmarcadas y
     el botón está encendido desde el primer momento: decir que no tiene que
     costar exactamente lo mismo que decir que sí (art. 7.2 y 7.3).

   Se guarda al terminar CADA paso, no todo junto al final: si la app se cierra
   entre el segundo y el tercero, lo aceptado sigue aceptado y al volver solo
   se le pide lo que falta.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  profile: UserProfile;
  /** Se llama con el bloque `legal` ya guardado, para refrescar el perfil en memoria. */
  onCompletado: (legal: AceptacionesLegales) => void;
  /** Cerrar sesión. Única salida mientras quede algo obligatorio. */
  onSalir?: () => void;
  /** Subconjunto a enseñar. Por defecto, lo que le falte. Perfil → Ajustes lo
   *  usa para reabrir solo el paso opcional y poder cambiar de idea. */
  documentos?: MetaDocumentoLegal[];
  /** Solo cuando no queda nada obligatorio (revisión desde Perfil). */
  onCerrar?: () => void;
  /** Costura para el banco de pruebas de `/dev/legal`, que no tiene sesión y
   *  por tanto no puede escribir en Firestore. En la app siempre es el guardado
   *  de verdad. */
  guardar?: (nuevas: AceptacionesLegales) => Promise<AceptacionesLegales>;
}

function marcasIniciales(casillas: CasillaLegal[], previas: Record<string, boolean> | undefined) {
  const estado: Record<string, boolean> = {};
  // Las obligatorias SIEMPRE arrancan en falso, aunque haya un registro previo:
  // si se está volviendo a preguntar es porque el texto cambió, y una marca
  // heredada de la versión anterior no consiente el texto nuevo. Las
  // opcionales sí conservan lo que la persona eligió: reabrir sus ajustes y
  // encontrárselos en blanco parecería que se han perdido.
  for (const c of casillas) estado[c.id] = c.obligatoria ? false : (previas?.[c.id] ?? false);
  return estado;
}

export default function AceptacionLegalGate({
  profile, onCompletado, onSalir, documentos, onCerrar, guardar,
}: Props) {
  const pasos = useMemo(
    () => documentos ?? documentosPendientes(profile.legal),
    [documentos, profile.legal],
  );
  const [indice, setIndice] = useState(0);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lo ya guardado, en memoria. No se toca `profile` —es una prop— y además
  // interesa que `pasos` quede congelado: si se recalculase al guardar cada
  // documento, el muro se iría vaciando bajo los pies del propio muro.
  const [guardado, setGuardado] = useState<AceptacionesLegales>(profile.legal ?? {});

  const meta = pasos[indice];
  const doc = meta ? CONTENIDO_LEGAL[meta.id] : undefined;

  const [marcas, setMarcas] = useState<Record<string, boolean>>({});
  const [alFinal, setAlFinal] = useState(false);
  const cuerpoRef = useRef<HTMLDivElement>(null);
  const opcionesPrevias = meta ? guardado[meta.id]?.opciones : undefined;

  // El botón Atrás de Android no puede saltarse el muro: mientras quede algo
  // obligatorio se traga la pulsación (07-9 apila cerradores; el de aquí no
  // cierra nada). Sin esto, Atrás navegaría por debajo y dejaría la app
  // abierta con el muro sin contestar.
  const bloqueado = pasos.slice(indice).some(p => p.obligatorio);
  useBotonAtras(() => { /* el muro no se cierra con Atrás */ }, bloqueado);

  // Cada paso arranca de cero: sus marcas, su scroll y su comprobación de si
  // el texto cabe entero (en cuyo caso ya está "leído" y no hay nada que bajar).
  useEffect(() => {
    if (!doc) return;
    setMarcas(marcasIniciales(doc.casillas, opcionesPrevias));
    setError(null);
    const el = cuerpoRef.current;
    if (el) {
      el.scrollTop = 0;
      setAlFinal(el.scrollHeight - el.clientHeight <= 8);
    }
  }, [doc, opcionesPrevias]);

  if (!meta || !doc) return null;

  const obligatorias = doc.casillas.filter(c => c.obligatoria);
  const faltanMarcas = obligatorias.some(c => !marcas[c.id]);
  const puedeContinuar = !faltanMarcas && alFinal && !guardando;
  const esUltimo = indice === pasos.length - 1;
  const quedaObligatorio = bloqueado;

  const alDesplazar = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) setAlFinal(true);
  };

  const continuar = async () => {
    setGuardando(true);
    setError(null);
    try {
      // Solo se guardan las respuestas de las casillas opcionales: las
      // obligatorias son todas `true` por definición —sin ellas no se llega
      // aquí— y guardar un mapa de treses no aporta nada a la prueba.
      const opcionales = doc.casillas.filter(c => !c.obligatoria);
      const opciones = opcionales.length > 0
        ? Object.fromEntries(opcionales.map(c => [c.id, !!marcas[c.id]]))
        : undefined;
      const nuevas: AceptacionesLegales = {
        [meta.id]: registrarAceptacion(meta, new Date().toISOString(), opciones),
      };
      const legal = guardar
        ? await guardar(nuevas)
        : await guardarAceptaciones(profile, nuevas);
      setGuardado(legal);
      if (esUltimo) {
        onCompletado(legal);
      } else {
        setIndice(i => i + 1);
        setGuardando(false);
      }
    } catch (err) {
      console.error('No se pudo guardar la aceptación legal:', err);
      setError(mensajeDeErrorFirestore(err));
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4 pt-[calc(1rem+var(--safe-top))] pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
      <div className="fixed inset-0 z-[var(--z-overlay)] bg-black/80 backdrop-blur-sm" aria-hidden />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={doc.titulo}
        className="relative z-[var(--z-modal)] flex max-h-[88vh] w-full max-w-lg flex-col animate-sheet-in rounded-canvas border border-strong bg-raised shadow-e2"
      >
        {/* Cabecera. El contador de pasos va en caption, no en título: lo que
            importa es el nombre del documento, no cuántos quedan. */}
        <div className="shrink-0 border-b border-hairline px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-caption font-mono uppercase tracking-wider text-ink-3">
              {pasos.length > 1 ? `${indice + 1} de ${pasos.length}` : 'Tus permisos'}
            </p>
            {onCerrar && !quedaObligatorio && (
              <button
                type="button"
                onClick={onCerrar}
                aria-label="Cerrar"
                className="flex h-8 w-8 items-center justify-center rounded-control text-ink-3 hover:bg-surface"
              >
                <Icon name="close" size="s" />
              </button>
            )}
          </div>
          <h2 className="mt-1 font-sans text-title-s font-bold text-ink">{doc.titulo}</h2>
        </div>

        {/* El documento. Contenedor propio (no el de `Dialog`) porque hace falta
            escuchar su scroll para saber si se ha llegado al final. */}
        <div
          ref={cuerpoRef}
          onScroll={alDesplazar}
          className="flex-1 overflow-y-auto px-4 py-3 space-y-2"
        >
          {doc.cuerpo}

          {doc.url && (
            <a
              href={doc.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 pt-2 text-caption font-sans text-ink-3 underline underline-offset-2 hover:text-ink-2"
            >
              <Icon name="description" size="s" />
              Leer el documento completo
            </a>
          )}
        </div>

        {/* Casillas y acción. Fuera del scroll: la decisión tiene que estar
            siempre a mano, no al fondo de un texto largo. */}
        <div className="shrink-0 border-t border-hairline px-4 py-3 space-y-3">
          {!alFinal && (
            <p className="flex items-center gap-1.5 text-caption font-sans text-ink-3">
              <Icon name="arrow_downward" size="s" />
              Desplázate hasta el final del texto para continuar.
            </p>
          )}

          <div className="space-y-2.5">
            {doc.casillas.map(casilla => (
              <label key={casilla.id} className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={!!marcas[casilla.id]}
                  disabled={guardando}
                  onChange={e => setMarcas(m => ({ ...m, [casilla.id]: e.target.checked }))}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
                />
                <span className="text-body-s font-sans text-ink-2 leading-snug">
                  {casilla.etiqueta}
                  {casilla.detalle && (
                    <span className="mt-0.5 block text-caption text-ink-3 leading-relaxed">
                      {casilla.detalle}
                    </span>
                  )}
                </span>
              </label>
            ))}
          </div>

          {error && <p className="text-caption font-sans text-danger">{error}</p>}

          <Button
            variant="primary"
            size="l"
            fullWidth
            loading={guardando}
            disabled={!puedeContinuar}
            onClick={continuar}
          >
            {doc.accion}
          </Button>

          {/* La otra salida. En tono apagado, pero a la vista: un muro sin
              salida no es una elección libre. */}
          {onSalir && quedaObligatorio && (
            <button
              type="button"
              onClick={onSalir}
              disabled={guardando}
              className="w-full py-1 text-caption font-sans text-ink-3 hover:text-ink-2"
            >
              Prefiero no aceptar · cerrar sesión
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Atajo para Perfil → Ajustes: reabre solo el paso de los permisos opcionales. */
export const SOLO_AJUSTES = DOCUMENTOS_LEGALES.filter(d => !d.obligatorio);
