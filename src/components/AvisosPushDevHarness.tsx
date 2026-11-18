import React, { useEffect, useState } from 'react';
import TarjetaActivarAvisos from './avisos/TarjetaActivarAvisos';
import AjusteAvisosDispositivo from './avisos/AjusteAvisosDispositivo';
import type { EntornoDeAvisos, EstadoTarjetaAvisos } from '../utils/avisosPush';
import { claveVapid, estadoDeAvisos } from '../services/push/registroPush';

/* ═══════════════════════════════════════════════════════════════════════════
   Banco de pruebas de las notificaciones push (ruta /dev/avisos), solo en
   desarrollo (podado en producción, ver App.tsx).

   Arriba, la tarjeta tal y como la vería este navegador (sin
   VITE_FCM_VAPID_KEY no sale: es lo esperado). Debajo, sus tres caras y el
   interruptor de Ajustes en cuatro situaciones, fijadas a mano. Los botones de
   las caras fijadas no piden permiso ni escriben nada.
   ═══════════════════════════════════════════════════════════════════════════ */

const UID = 'uid_dev';

const BASE: EntornoDeAvisos = {
  nativa: false, hayClave: true, soportado: true, permiso: 'default', esIOS: false,
  instalada: false, activo: false, desactivadoAMano: false, aplazadoHasta: null, ahora: Date.now(),
};

const CARAS: EstadoTarjetaAvisos[] = ['activar', 'instalar_ios', 'denegado'];

const AJUSTES: Array<{ titulo: string; entorno: EntornoDeAvisos }> = [
  { titulo: 'Apagado (Android / ordenador)', entorno: BASE },
  { titulo: 'Encendido', entorno: { ...BASE, permiso: 'granted', activo: true } },
  { titulo: 'iPhone sin añadir a la pantalla de inicio', entorno: { ...BASE, esIOS: true, soportado: false } },
  { titulo: 'Bloqueado en el navegador', entorno: { ...BASE, permiso: 'denied' } },
];

export default function AvisosPushDevHarness() {
  const [real, setReal] = useState<string>('…');
  useEffect(() => { estadoDeAvisos(UID).then(setReal).catch(e => setReal(`error: ${String(e)}`)); }, []);

  return (
    <div className="min-h-screen bg-bg text-ink p-4">
      <div className="max-w-md mx-auto space-y-6">
        <p className="font-mono text-caption text-ink-3 uppercase tracking-widest">/dev/avisos — notificaciones push</p>

        <section className="space-y-2">
          <p className="font-mono text-caption text-ink-3 uppercase tracking-widest">En este navegador</p>
          <p className="font-sans text-caption text-ink-2">
            Clave VAPID: {claveVapid() ? 'configurada' : 'sin configurar'} · estado calculado: <strong>{real}</strong>
          </p>
          <TarjetaActivarAvisos uid={UID} />
        </section>

        {CARAS.map(c => (
          <section key={c} className="space-y-2">
            <p className="font-mono text-caption text-ink-3 uppercase tracking-widest">Cara «{c}»</p>
            <TarjetaActivarAvisos uid={UID} estadoForzado={c} />
          </section>
        ))}

        <p className="font-mono text-caption text-ink-3 uppercase tracking-widest pt-4">Perfil › Ajustes</p>
        {AJUSTES.map(a => (
          <section key={a.titulo} className="space-y-1">
            <p className="font-sans text-caption text-ink-3">{a.titulo}</p>
            <AjusteAvisosDispositivo uid={UID} entornoForzado={a.entorno} />
          </section>
        ))}
      </div>
    </div>
  );
}
