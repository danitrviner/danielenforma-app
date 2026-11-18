import React, { useEffect, useState } from 'react';
import { Icon } from '../ui';
import type { EntornoDeAvisos } from '../../utils/avisosPush';
import { activarAvisos, desactivarAvisos, entornoDeAvisos } from '../../services/push/registroPush';

/* ═══════════════════════════════════════════════════════════════════════════
   Perfil › Ajustes › «Avisos en este dispositivo» (18-11-2026)

   El interruptor de las notificaciones push del atleta. Es por DISPOSITIVO,
   no por cuenta: encenderlo guarda el token de este móvil; apagarlo lo borra
   (y la tarjeta del Inicio ya no vuelve a ofrecerlo). Sin clave VAPID o en la
   app nativa no sale: ahí no hay nada que encender todavía (fase 2).
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  uid: string;
  /** Solo el banco de pruebas: un entorno inventado en vez del del navegador. */
  entornoForzado?: EntornoDeAvisos;
}

export default function AjusteAvisosDispositivo({ uid, entornoForzado }: Props) {
  const [entorno, setEntorno] = useState<EntornoDeAvisos | null>(entornoForzado ?? null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recargar = () => {
    if (entornoForzado) return;
    entornoDeAvisos(uid).then(setEntorno).catch(() => setEntorno(null));
  };
  useEffect(() => {
    if (entornoForzado) { setEntorno(entornoForzado); return; }
    recargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, entornoForzado]);

  if (!entorno || entorno.nativa || !entorno.hayClave) return null;

  const encendido = entorno.activo && entorno.permiso === 'granted';
  const iosSinInstalar = entorno.esIOS && !entorno.instalada;
  const bloqueado = entorno.permiso === 'denied';
  const sinSoporte = !iosSinInstalar && (!entorno.soportado || entorno.permiso === 'no_disponible');
  const deshabilitado = ocupado || (!encendido && (iosSinInstalar || bloqueado || sinSoporte));

  const explicacion = iosSinInstalar
    ? 'En iPhone, añade la app a tu pantalla de inicio (Compartir › «Añadir a pantalla de inicio») y ábrela desde ahí.'
    : bloqueado
      ? 'Bloqueados en este navegador: permítelos en sus ajustes para esta web.'
      : sinSoporte
        ? 'Este navegador no admite avisos.'
        : encendido
          ? 'Te llegan aquí los cuestionarios nuevos, las respuestas y los cambios de tu plan.'
          : 'Actívalo para que te lleguen al móvil aunque no tengas la app abierta.';

  const alternar = async () => {
    if (entornoForzado) {
      setEntorno({ ...entorno, activo: !encendido, permiso: 'granted' });
      return;
    }
    setOcupado(true);
    setError(null);
    if (encendido) {
      await desactivarAvisos(true);
    } else {
      const r = await activarAvisos();
      if (r === 'error' || r === 'sin_soporte') setError('No se han podido activar ahora. Prueba otra vez en un rato.');
    }
    setOcupado(false);
    recargar();
  };

  return (
    <div className="space-y-2">
      <h3 className="font-sans font-bold text-title-s text-ink flex items-center gap-2">
        <Icon name="notifications" size="m" className="text-accent-ink" />
        Avisos
      </h3>
      <div className="bg-surface border border-hairline rounded-surface">
        <div className="flex items-center justify-between gap-3 p-3">
          <div className="min-w-0">
            <p id="ajuste-avisos-dispositivo" className="font-sans text-caption font-bold text-ink">Avisos en este dispositivo</p>
            <p className="font-sans text-caption text-ink-3">{explicacion}</p>
            {error && <p className="font-sans text-caption text-danger mt-1" role="alert">{error}</p>}
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={encendido}
            aria-labelledby="ajuste-avisos-dispositivo"
            disabled={deshabilitado}
            onClick={alternar}
            style={{ padding: '2px' }}
            className={`w-11 h-6 rounded-full shrink-0 transition-colors disabled:opacity-50 ${encendido ? 'bg-accent' : 'bg-strong'}`}
          >
            <span className={`block w-5 h-5 rounded-full bg-bg transition-transform ${encendido ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>
      </div>
    </div>
  );
}
