/* ═══════════════════════════════════════════════════════════════════════════
   El muro legal UNIFICADO · tres variantes (tanda 8 del autopiloto, D1)

   Lo que pidió Dani (28-10): «volver a enseñarlo, pero quiero los términos y
   condiciones todos juntos, de manera general y que sea obligatorio aceptar».
   Lo que no se puede hacer tal cual: meter el análisis con el asistente en el
   paquete obligatorio. Un consentimiento para datos de salud que sea condición
   del servicio no es «libre» (RGPD art. 9 y considerando 43; art. 7.4). Así
   que esto es un muro ÚNICO —un documento, un scroll, un botón— donde todo lo
   que ya era obligatorio sigue siéndolo y la casilla del asistente va aparte,
   específica y desmarcada, con la línea de transparencia del diseño §6: «tu
   plan se ajusta cada semana con lo que registras; lo revisa Dani».

   NO está cableado al flujo real: `AceptacionLegalGate` (dos pasos) sigue
   siendo lo que ve el atleta hasta que Dani decida D1 y, si cambia el texto,
   se suba la versión de los documentos (lo que vuelve a pedírselo a todos).
   Se ve en /dev/autopiloto y en /dev/legal?unificado=A|B|C.

   Las tres variantes comparten las reglas del muro de dos pasos: nada
   premarcado, botón apagado hasta marcar lo obligatorio Y llegar al final del
   texto, salida visible («cerrar sesión»), y se guarda en una sola escritura.

   A · Un documento   — los dos textos seguidos con sus títulos, y al final las
                        cinco casillas (cuatro obligatorias + la del asistente
                        aparte). Lo más parecido a «todo junto».
   B · Acordeón       — índice con los dos documentos plegados y la casilla del
                        asistente como tercer bloque; cada uno se abre para
                        leerlo y hay que haber abierto los obligatorios.
   C · Resumen + letra — primero una tarjeta de cinco líneas en lenguaje llano
                        (qué se guarda, para qué, quién lo ve, cómo se borra,
                        cómo se ajusta el plan) y debajo los textos completos;
                        las casillas bajo el resumen, el botón al final.
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { UserProfile } from '../types';
import { DOCUMENTOS_LEGALES, OPCION_IA, registrarAceptacion, type AceptacionesLegales } from '../legal/aceptacion';
import { CONTENIDO_LEGAL, type CasillaLegal } from '../legal/documentos';
import { guardarAceptaciones } from '../legal/persistencia';
import { mensajeDeErrorFirestore } from '../utils/erroresFirestore';
import { Button, Icon } from './ui';

export type VarianteMuro = 'A' | 'B' | 'C';

interface Props {
  variante: VarianteMuro;
  profile: UserProfile;
  onCompletado: (legal: AceptacionesLegales) => void;
  onSalir?: () => void;
  guardar?: (nuevas: AceptacionesLegales) => Promise<AceptacionesLegales>;
  /** En el banco de pruebas se pinta dentro de la página, no a pantalla completa. */
  enMarco?: boolean;
}

/** La línea de transparencia del diseño §6. Va en el muro, no es una casilla:
 *  es información previa (art. 13), no un consentimiento aparte. */
export const LINEA_TRANSPARENCIA = 'Tu plan se ajusta cada semana con lo que registras (entrenos, comidas, peso, cómo te encuentras); lo revisa Dani.';

const RESUMEN_LLANO: { icono: string; texto: string }[] = [
  { icono: 'database', texto: 'Se guardan tus datos de salud y de entrenamiento: peso, medidas, lesiones, alergias, medicación, lo que entrenas y lo que comes.' },
  { icono: 'target', texto: 'Para una sola cosa: diseñar y ajustar tu plan. Nunca se venden ni se usan para publicidad.' },
  { icono: 'visibility', texto: 'Los ve tu entrenador. Nadie más dentro de la app.' },
  { icono: 'autorenew', texto: LINEA_TRANSPARENCIA },
  { icono: 'delete', texto: 'Puedes borrar la cuenta y todo lo tuyo en Perfil → Ajustes, sin escribir a nadie.' },
];

function todasLasCasillas(): { docId: 'terminos' | 'privacidad'; casilla: CasillaLegal }[] {
  return DOCUMENTOS_LEGALES.flatMap(d => CONTENIDO_LEGAL[d.id].casillas.map(casilla => ({ docId: d.id, casilla })));
}

export default function MuroLegalUnificado({ variante, profile, onCompletado, onSalir, guardar, enMarco = false }: Props) {
  const [marcas, setMarcas] = useState<Record<string, boolean>>({});
  const [alFinal, setAlFinal] = useState(false);
  const [abiertos, setAbiertos] = useState<Set<string>>(() => new Set(variante === 'B' ? [] : ['terminos', 'privacidad', 'asistente']));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cuerpoRef = useRef<HTMLDivElement>(null);
  const contenidoRef = useRef<HTMLDivElement>(null);

  const casillas = todasLasCasillas();
  const obligatorias = casillas.filter(c => c.casilla.obligatoria);
  const opcional = casillas.find(c => c.casilla.id === OPCION_IA);

  const comprobarFinal = useCallback(() => {
    const el = cuerpoRef.current;
    if (el && el.scrollTop + el.clientHeight >= el.scrollHeight - 8) setAlFinal(true);
  }, []);
  useEffect(() => {
    const el = cuerpoRef.current; const contenido = contenidoRef.current;
    if (!el || !contenido) return;
    comprobarFinal();
    if (typeof ResizeObserver === 'undefined') return;
    const o = new ResizeObserver(() => comprobarFinal());
    o.observe(el); o.observe(contenido);
    return () => o.disconnect();
  }, [comprobarFinal, abiertos]);

  // En B «llegar al final» es haber abierto los dos documentos obligatorios y
  // bajado hasta el final de lo abierto; sin abrirlos no hay nada que leer.
  const leido = variante === 'B' ? alFinal && abiertos.has('terminos') && abiertos.has('privacidad') : alFinal;
  const faltanMarcas = obligatorias.some(c => !marcas[c.casilla.id]);
  const puedeContinuar = !faltanMarcas && leido && !guardando;

  const continuar = async () => {
    setGuardando(true); setError(null);
    try {
      const ahora = new Date().toISOString();
      const nuevas: AceptacionesLegales = {};
      for (const meta of DOCUMENTOS_LEGALES) {
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

  const toggleAbierto = (id: string) => setAbiertos(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const casilla = (c: CasillaLegal) => (
    <label key={c.id} className="flex cursor-pointer items-start gap-2.5">
      <input type="checkbox" checked={!!marcas[c.id]} disabled={guardando}
        onChange={e => setMarcas(m => ({ ...m, [c.id]: e.target.checked }))}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent)]" />
      <span className="text-body-s font-sans text-ink-2 leading-snug">
        {c.etiqueta}
        {c.detalle && <span className="mt-0.5 block text-caption text-ink-3 leading-relaxed">{c.detalle}</span>}
      </span>
    </label>
  );

  const bloqueAsistente = () => opcional ? (
    <div className="rounded-surface border border-hairline bg-surface p-3 space-y-2">
      <p className="text-caption font-sans font-bold text-ink uppercase tracking-wider">Análisis con el asistente de tu entrenador</p>
      <p className="text-caption font-sans text-ink-2 leading-relaxed">{LINEA_TRANSPARENCIA} Esta casilla es aparte: decir que no no cambia el servicio, lo prepara todo a mano.</p>
      {casilla(opcional.casilla)}
    </div>
  ) : null;

  const documento = (id: 'terminos' | 'privacidad') => {
    const doc = CONTENIDO_LEGAL[id];
    return (
      <section className="space-y-2" aria-label={doc.titulo}>
        <h3 className="font-sans text-label font-bold text-ink">{doc.titulo}</h3>
        {doc.cuerpo}
        {doc.url && (
          <a href={doc.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-caption font-sans text-ink-3 underline underline-offset-2 hover:text-ink-2">
            <Icon name="description" size="s" /> Leer el documento completo
          </a>
        )}
      </section>
    );
  };

  const casillasObligatorias = (
    <div className="space-y-2.5">
      {obligatorias.map(c => casilla(c.casilla))}
    </div>
  );

  const cuerpo = variante === 'A' ? (
    <>
      {documento('terminos')}
      <hr className="border-hairline" />
      {documento('privacidad')}
      <hr className="border-hairline" />
      {casillasObligatorias}
      {bloqueAsistente()}
    </>
  ) : variante === 'B' ? (
    <>
      {(['terminos', 'privacidad'] as const).map(id => (
        <div key={id} className="rounded-surface border border-hairline overflow-hidden">
          <button type="button" onClick={() => toggleAbierto(id)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left bg-surface" aria-expanded={abiertos.has(id)}>
            <Icon name={abiertos.has(id) ? 'check_circle' : 'radio_button_unchecked'} size="s" className={abiertos.has(id) ? 'text-success' : 'text-ink-3'} />
            <span className="font-sans text-label font-bold text-ink flex-1">{CONTENIDO_LEGAL[id].titulo}</span>
            <span className="font-mono text-caption text-ink-3">{abiertos.has(id) ? 'cerrar' : 'leer'}</span>
          </button>
          {abiertos.has(id) && <div className="px-3 pb-3 pt-1 space-y-2 border-t border-hairline">{CONTENIDO_LEGAL[id].cuerpo}</div>}
        </div>
      ))}
      <div className="rounded-surface border border-hairline overflow-hidden">
        <button type="button" onClick={() => toggleAbierto('asistente')} className="flex w-full items-center gap-2 px-3 py-2.5 text-left bg-surface" aria-expanded={abiertos.has('asistente')}>
          <Icon name="smart_toy" size="s" className="text-ink-3" />
          <span className="font-sans text-label font-bold text-ink flex-1">Análisis con el asistente <span className="font-normal text-ink-3">(opcional)</span></span>
          <span className="font-mono text-caption text-ink-3">{abiertos.has('asistente') ? 'cerrar' : 'ver'}</span>
        </button>
        {abiertos.has('asistente') && <div className="px-3 pb-3 pt-2 border-t border-hairline">{bloqueAsistente()}</div>}
      </div>
      <hr className="border-hairline" />
      {casillasObligatorias}
    </>
  ) : (
    <>
      <div className="rounded-surface border border-accent-line bg-accent/8 p-3 space-y-2">
        <p className="text-caption font-mono uppercase tracking-wider text-accent-ink">En cinco líneas</p>
        <ul className="m-0 p-0 list-none space-y-1.5">
          {RESUMEN_LLANO.map(r => (
            <li key={r.icono} className="flex gap-2 text-caption font-sans text-ink-2 leading-relaxed">
              <Icon name={r.icono} size="s" className="text-accent-ink shrink-0 mt-0.5" />{r.texto}
            </li>
          ))}
        </ul>
      </div>
      {casillasObligatorias}
      {bloqueAsistente()}
      <hr className="border-hairline" />
      <p className="text-caption font-mono uppercase tracking-wider text-ink-3">Los textos completos</p>
      {documento('terminos')}
      {documento('privacidad')}
    </>
  );

  const marco = enMarco
    ? 'relative flex max-h-[42rem] w-full flex-col rounded-canvas border border-strong bg-raised shadow-e2'
    : 'relative z-[var(--z-modal)] flex max-h-[88vh] w-full max-w-lg flex-col animate-sheet-in rounded-canvas border border-strong bg-raised shadow-e2';

  const dialogo = (
    <div role="dialog" aria-modal={!enMarco} aria-label="Condiciones y privacidad" className={marco}>
      <div className="shrink-0 border-b border-hairline px-4 py-3">
        <p className="text-caption font-mono uppercase tracking-wider text-ink-3">Antes de empezar</p>
        <h2 className="mt-1 font-sans text-title-s font-bold text-ink">Condiciones y privacidad</h2>
        <p className="mt-1 text-caption font-sans text-ink-3">Todo en una página. {variante === 'B' ? 'Abre cada documento para leerlo; ' : 'Baja hasta el final; '}las casillas obligatorias están al pie y la del asistente es aparte.</p>
      </div>
      <div ref={cuerpoRef} onScroll={comprobarFinal} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <div ref={contenidoRef} className="space-y-3">{cuerpo}</div>
      </div>
      <div className="shrink-0 border-t border-hairline px-4 py-3 space-y-3">
        {!leido && (
          <p className="flex items-center gap-1.5 text-caption font-sans text-ink-3">
            <Icon name="arrow_downward" size="s" />
            {variante === 'B' ? 'Abre y lee los dos documentos para continuar.' : 'Desplázate hasta el final del texto para continuar.'}
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
