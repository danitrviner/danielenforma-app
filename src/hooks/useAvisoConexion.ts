import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import {
  isLocalBypassActive, hayFalloDePermisos,
  escriturasPendientes, suscribirEscriturasPendientes,
} from '../dbService';
import { decidirAviso, Aviso } from '../utils/avisoConexion';

/* 14-08 (tarea 23). Antes esta recogida de señales vivía solo dentro de
   LocalModeBanner. La cabecera (App.tsx) necesita la MISMA respuesta —si el
   aviso está visible o no— para no reservar dos veces el hueco de la Dynamic
   Island: LocalModeBanner ya lo reserva en su propio `pt` cuando se pinta, así
   que la cabecera solo debe reservarlo cuando el aviso NO está. Sacar esto a
   un hook compartido evita que las dos vistas puedan desincronizarse (una
   pensando que hay aviso y la otra que no) y evita duplicar el `setInterval`
   de sondeo si algún día hace falta un tercer consumidor.

   `refrescar` es para cuando una acción del propio banner (p. ej. "Descartar")
   cambia la bandera de verdad y no se quiere esperar hasta 3 s al siguiente
   sondeo para que desaparezca. */
export function useAvisoConexion(): { aviso: Aviso; pendientes: number; refrescar: () => void } {
  const [estado, setEstado] = useState<'ok' | 'red' | 'permisos'>(
    () => (isLocalBypassActive() ? 'red' : hayFalloDePermisos() ? 'permisos' : 'ok')
  );

  const refrescar = useCallback(() => {
    setEstado(isLocalBypassActive() ? 'red' : hayFalloDePermisos() ? 'permisos' : 'ok');
  }, []);

  useEffect(() => {
    const id = setInterval(refrescar, 3000);
    return () => clearInterval(id);
  }, [refrescar]);

  const pendientes = useSyncExternalStore(suscribirEscriturasPendientes, escriturasPendientes, () => 0);

  // `navigator.onLine` es la única detección de conectividad de toda la app —
  // un `grep navigator.onLine` sobre src/ daba cero resultados antes de esto.
  // No es infalible (dice "sí" con un wifi de hotel que no enruta a ninguna
  // parte), y precisamente por eso no se usa solo: el aviso también se enciende
  // con escrituras encoladas, que es la señal que sí viene de haber intentado
  // hablar con el servidor de verdad.
  const [sinRed, setSinRed] = useState(() => typeof navigator !== 'undefined' && navigator.onLine === false);
  useEffect(() => {
    const desconectado = () => setSinRed(true);
    const conectado = () => setSinRed(false);
    window.addEventListener('offline', desconectado);
    window.addEventListener('online', conectado);
    return () => {
      window.removeEventListener('offline', desconectado);
      window.removeEventListener('online', conectado);
    };
  }, []);

  return { aviso: decidirAviso({ estado, pendientes, sinRed }), pendientes, refrescar };
}
