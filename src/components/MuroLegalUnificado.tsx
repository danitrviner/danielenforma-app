/* ═══════════════════════════════════════════════════════════════════════════
   El muro legal UNIFICADO · primer login, justo antes del alta (D1, 29-10-2026)

   Lo que pidió Dani (28-10): «volver a enseñarlo, pero quiero los términos y
   condiciones todos juntos, de manera general y que sea obligatorio aceptar»;
   y el 29-10: «quiero que el análisis del asistente esté dentro de los
   términos de uso, no quiero un apartado propio».

   Así que es un muro ÚNICO —un documento, un scroll, un botón— en el que cada
   texto lleva sus casillas justo debajo: Términos de uso con las suyas (y ahí,
   como tercera casilla, la del análisis con el asistente) y Privacidad con las
   suyas. Lo que no cambia, porque no puede: la casilla del asistente sigue
   siendo OPCIONAL y arranca desmarcada. Un consentimiento para datos de salud
   que sea condición del servicio no es «libre» (RGPD art. 9 y considerando 43;
   art. 7.4). Va dentro de Términos —sin apartado propio— pero no se acepta con
   ellos. Lleva además la línea de transparencia del diseño §6.

   Reglas heredadas del muro de dos pasos (AceptacionLegalGate): nada
   premarcado, botón apagado hasta marcar lo obligatorio Y llegar al final del
   texto (con re-medida al cambiar de tamaño: el atasco del 13-10), salida
   visible («cerrar sesión»), y una sola escritura con los dos documentos.

   Sustituye al muro de dos pasos en App.tsx para quien tenga algo pendiente.
   Quien ya aceptó no lo ve (mismos documentos, misma versión). Perfil ›
   Ajustes sigue reabriendo el paso de Términos en modo revisión con
   AceptacionLegalGate para cambiar la casilla del asistente.
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { UserProfile } from '../types';
import { DOCUMENTOS_LEGALES, OPCION_IA, registrarAceptacion, type AceptacionesLegales, type IdDocumentoLegal } from '../legal/aceptacion';
import { CONTENIDO_LEGAL, type CasillaLegal } from '../legal/documentos';
import { guardarAceptaciones } from '../legal/persistencia';
import { mensajeDeErrorFirestore } from '../utils/erroresFirestore';
import { useBotonAtras } from '../services/botonAtras';
import { Button, Icon } from './ui';

interface Props {
  profile: UserProfile;
  onCompletado: (legal: AceptacionesLegales) => void;
  /** Cerrar sesión: la única salida. */
  onSalir?: () => void;
  /** Costura para el banco de pruebas, que no tiene sesión. */
  guardar?: (nuevas: AceptacionesLegales) => Promise<AceptacionesLegales>;
  /** En el banco de pruebas se pinta dentro de la página, no a pantalla completa. */
  enMarco?: boolean;
}

/** La línea de transparencia del diseño §6. Información previa (art. 13), no
 *  una casilla: se lee junto a la del asistente. */
export const LINEA_TRANSPARENCIA = 'Tu plan se ajusta cada semana con lo que registras (entrenos, comidas, peso, cómo te encuentras); lo revisa Dani.';

export default function MuroLegalUnificado({ profile, onCompletado, onSalir, guardar, enMarco = false }: Props) {
  const [marcas, setMarcas] = useState<Record<string, boolean>>({});
  const [alFinal, setAlFinal] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cuerpoRef = useRef<HTMLDivElement>(null);
  const contenidoRef = useRef<HTMLDivElement>(null);

  // Atrás en Android no se salta el muro (igual que en el de dos pasos).
  useBotonAtras(() => { /* el muro no se cierra con Atrás */ }, !enMarco);

  const comprobarFinal = useCallback(() => {
    const el = cuerpoRef.current;
    if (el && el.scrollTop + el.clientHeight >= el.scrollHeight - 8) setAlFinal(true);
  }, []);
  useEffect(() => {
    const el = cuerpoRef.current; const contenido = contenidoRef.current;
    if (!el || !contenido) return;
    let cancelado = false;
    document.fonts?.ready.then(() => { if (!cancelado) comprobarFinal(); });
    comprobarFinal();
    if (typeof ResizeObserver === 'undefined') return () => { cancelado = true; };
    const o = new ResizeObserver(() => comprobarFinal());
    o.observe(el); o.observe(contenido);
    return () => { cancelado = true; o.disconnect(); };
  }, [comprobarFinal]);

  const obligatorias = DOCUMENTOS_LEGALES.flatMap(d => CONTENIDO_LEGAL[d.id].casillas.filter(c => c.obligatoria));
  const faltanMarcas = obligatorias.some(c => !marcas[c.id]);
  const puedeContinuar = !faltanMarcas && alFinal && !guardando;

  const continuar = async () => {
    setGuardando(true); setError(null);
    try {
      const ahora = new Date().toISOString();
      const nuevas: AceptacionesLegales = {};
      for (const meta of DOCUMENTOS_LEGALES) {
        // Solo las opcionales se guardan como opciones: las obligatorias son
        // todas `true` por definición (sin ellas no se llega aquí).
        const opcionales = CONTENIDO_LEGAL[meta.id].casillas.filter(c => !c.obligatoria);
        const opciones = opcionales.length > 0 ? Object.fromEntries(opcionales.map(c => [c.id, !!marcas[c.id]])) : undefined;
        nuevas[meta.id] = registrarAceptacion(meta, ahora, opciones);
      }
      const legal = guardar ? await guardar(nuevas) : await guardarAceptaciones(profile, nuevas);
      onCompletado(legal);
    } catch (err) {
      console.error('No se pudo guardar la aceptación legal:', err);
      setError(mensajeDeErrorFirestore(err));
      setGuardando(false);
    }
  };

  const casilla = (c: CasillaLegal) => (
    <label key={c.id} className="flex cursor-pointer items-start gap-2.5">
      <input type="checkbox" checked={!!marcas[c.id]} disabled={guardando}
        onChange={e => setMarcas(m => ({ ...m, [c.id]: e.target.checked }))}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent)]" />
      <span className="text-body-s font-sans text-ink-2 leading-snug">
        {c.etiqueta}
        {c.detalle && <span className="mt-0.5 block text-caption text-ink-3 leading-relaxed">{c.detalle}</span>}
        {c.id === OPCION_IA && <span className="mt-0.5 block text-caption text-ink-3 leading-relaxed">{LINEA_TRANSPARENCIA}</span>}
      </span>
    </label>
  );

  const documento = (id: IdDocumentoLegal) => {
    const doc = CONTENIDO_LEGAL[id];
    return (
      <section key={id} className="space-y-2" aria-label={doc.titulo}>
        <h3 className="font-sans text-label font-bold text-ink">{doc.titulo}</h3>
        {doc.cuerpo}
        {doc.url && (
          <a href={doc.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-caption font-sans text-ink-3 underline underline-offset-2 hover:text-ink-2">
            <Icon name="description" size="s" /> Leer el documento completo
          </a>
        )}
        {/* Las casillas de ESTE documento, justo debajo de su texto. La del
            asistente va aquí dentro, en Términos, separada por una línea y
            sin bloquear el botón. */}
        <div className="space-y-2.5 border-t border-hairline pt-3">
          {doc.casillas.filter(c => c.obligatoria).map(casilla)}
          {doc.casillas.some(c => !c.obligatoria) && (
            <div className="space-y-2.5 border-t border-hairline/60 pt-2.5">
              {doc.casillas.filter(c => !c.obligatoria).map(casilla)}
            </div>
          )}
        </div>
      </section>
    );
  };

  const marco = enMarco
    ? 'relative flex max-h-[42rem] w-full flex-col rounded-canvas border border-strong bg-raised shadow-e2'
    : 'relative z-[var(--z-modal)] flex max-h-[88vh] w-full max-w-lg flex-col animate-sheet-in rounded-canvas border border-strong bg-raised shadow-e2';

  const dialogo = (
    <div role="dialog" aria-modal={!enMarco} aria-label="Condiciones y privacidad" className={marco}>
      <div className="shrink-0 border-b border-hairline px-4 py-3">
        <p className="text-caption font-mono uppercase tracking-wider text-ink-3">Antes de empezar</p>
        <h2 className="mt-1 font-sans text-title-s font-bold text-ink">Condiciones y privacidad</h2>
        <p className="mt-1 text-caption font-sans text-ink-3">Todo en una página: cada texto con sus casillas debajo. Baja hasta el final para poder aceptar.</p>
      </div>
      <div ref={cuerpoRef} onScroll={comprobarFinal} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <div ref={contenidoRef} className="space-y-4">
          {DOCUMENTOS_LEGALES.map((d, i) => (
            <React.Fragment key={d.id}>
              {i > 0 && <hr className="border-hairline" />}
              {documento(d.id)}
            </React.Fragment>
          ))}
        </div>
      </div>
      <div className="shrink-0 border-t border-hairline px-4 py-3 space-y-3">
        {!alFinal && (
          <p className="flex items-center gap-1.5 text-caption font-sans text-ink-3">
            <Icon name="arrow_downward" size="s" />
            Desplázate hasta el final del texto para continuar.
          </p>
        )}
        {error && <p className="text-caption font-sans text-danger">{error}</p>}
        <Button variant="primary" size="l" fullWidth loading={guardando} disabled={!puedeContinuar} onClick={continuar}>
          Aceptar y entrar
        </Button>
        {onSalir && (
          <button type="button" onClick={onSalir} disabled={guardando} className="w-full py-1 text-caption font-sans text-ink-3 hover:text-ink-2">
            Prefiero no aceptar · cerrar sesión
          </button>
        )}
      </div>
    </div>
  );

  if (enMarco) return dialogo;
  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4 pt-[calc(1rem+var(--safe-top))] pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
      <div className="fixed inset-0 z-[var(--z-overlay)] bg-veil/80 backdrop-blur-sm" aria-hidden />
      {dialogo}
    </div>
  );
}
