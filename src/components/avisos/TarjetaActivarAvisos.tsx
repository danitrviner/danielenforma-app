import React, { useEffect, useState } from 'react';
import { Button, Icon } from '../ui';
import type { EstadoTarjetaAvisos } from '../../utils/avisosPush';
import {
  activarAvisos, aplazarTarjeta, estadoDeAvisos, refrescarTokenSiActivo,
} from '../../services/push/registroPush';

/* ═══════════════════════════════════════════════════════════════════════════
   «Activa los avisos» · tarjeta del Inicio del atleta (18-11-2026)

   La única puerta para pedir el permiso de notificaciones: nunca al arrancar,
   solo cuando el atleta pulsa «Activar». Mismo aspecto que «Bienvenido de
   vuelta» (VueltaCard): borde dorado suave e icono a la izquierda.

   Tres caras:
     · activar       — «Activar» pide el permiso y guarda el token; «Ahora no»
                       la esconde 14 días.
     · instalar_ios  — Safari del iPhone sin instalar: ahí la web no puede
                       recibir avisos (iOS 16.4+ solo los da a la web añadida a
                       la pantalla de inicio), así que en vez de «Activar» se
                       explica cómo añadirla.
     · denegado      — el permiso está bloqueado: se dice una vez, con
                       «Entendido», y no se insiste en un año.
   Sin clave VAPID, en la app nativa o sin soporte: no sale.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  uid: string;
  /** Solo el banco de pruebas (/dev/avisos): fija la cara sin mirar el navegador. */
  estadoForzado?: EstadoTarjetaAvisos;
}

type Aviso = { tono: 'ok' | 'error'; texto: string } | null;

export default function TarjetaActivarAvisos({ uid, estadoForzado }: Props) {
  const [estado, setEstado] = useState<EstadoTarjetaAvisos>(estadoForzado ?? 'oculta');
  const [activando, setActivando] = useState(false);
  const [aviso, setAviso] = useState<Aviso>(null);

  useEffect(() => {
    if (estadoForzado) { setEstado(estadoForzado); return; }
    let vivo = true;
    estadoDeAvisos(uid).then(e => { if (vivo) setEstado(e); }).catch(() => {});
    // De paso, la fecha de último uso del token de este dispositivo.
    void refrescarTokenSiActivo();
    return () => { vivo = false; };
  }, [uid, estadoForzado]);

  if (aviso?.tono === 'ok') {
    return (
      <section className="rounded-canvas border border-success/25 bg-success/8 p-4 flex gap-3" aria-live="polite">
        <Icon name="notifications_active" size="l" className="text-success shrink-0" />
        <p className="font-sans text-body-s text-ink-2 text-pretty min-w-0">{aviso.texto}</p>
      </section>
    );
  }
  if (estado === 'oculta') return null;

  const esconder = () => {
    if (!estadoForzado) aplazarTarjeta(uid, estado);
    setEstado('oculta');
  };

  const activar = async () => {
    setActivando(true);
    setAviso(null);
    const r = estadoForzado ? 'error' : await activarAvisos();
    setActivando(false);
    if (r === 'activado') setAviso({ tono: 'ok', texto: 'Listo: los avisos llegarán a este dispositivo. Puedes apagarlos en Perfil › Ajustes.' });
    else if (r === 'denegado') setEstado('denegado');
    else setAviso({ tono: 'error', texto: 'No se han podido activar ahora. Prueba otra vez en un rato.' });
  };

  const contenido = {
    activar: {
      icono: 'notifications',
      titulo: 'Activa los avisos',
      texto: 'Para enterarte cuando te mande algo: un cuestionario, una respuesta o un cambio en tu plan.',
    },
    instalar_ios: {
      icono: 'home',
      titulo: 'Avisos en tu iPhone',
      texto: 'En iPhone los avisos solo llegan si la app está en tu pantalla de inicio. Toca Compartir y luego «Añadir a pantalla de inicio»; ábrela desde ahí y actívalos.',
    },
    denegado: {
      icono: 'notifications_off',
      titulo: 'Los avisos están bloqueados',
      texto: 'Este navegador tiene bloqueadas las notificaciones de la app. Si quieres recibirlas, permítelas en sus ajustes.',
    },
  }[estado];

  return (
    <section className="rounded-canvas border border-accent-line bg-accent-bg/40 p-4 flex gap-3" aria-label={contenido.titulo}>
      <Icon name={contenido.icono} size="l" className="text-accent-ink shrink-0" />
      <div className="min-w-0 flex-1 space-y-3">
        <div>
          <p className="font-sans font-bold text-body-s text-ink">{contenido.titulo}</p>
          <p className="font-sans text-body-s text-ink-2 text-pretty">{contenido.texto}</p>
          {aviso?.tono === 'error' && (
            <p className="font-sans text-caption text-danger mt-1" role="alert">{aviso.texto}</p>
          )}
        </div>
        <div className="flex gap-2">
          {estado === 'activar' && (
            <Button variant="secondary" size="s" onClick={activar} loading={activando} loadingLabel="Activando">
              Activar
            </Button>
          )}
          <Button variant="ghost" size="s" onClick={esconder} disabled={activando}>
            {estado === 'denegado' ? 'Entendido' : 'Ahora no'}
          </Button>
        </div>
      </div>
    </section>
  );
}
