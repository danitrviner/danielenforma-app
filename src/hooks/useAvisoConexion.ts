import { useSyncExternalStore } from 'react';
import {
  escriturasPendientes, suscribirEscriturasPendientes,
  estadoDeConexion, suscribirEstadoDeConexion,
} from '../dbService';
import { decidirAviso, Aviso } from '../utils/avisoConexion';

/* 14-08 (tarea 23). Antes esta recogida de señales vivía solo dentro de
   LocalModeBanner. La cabecera (App.tsx) necesita la MISMA respuesta —si el
   aviso está visible o no— para no reservar dos veces el hueco de la Dynamic
   Island: LocalModeBanner ya lo reserva en su propio `pt` cuando se pinta, así
   que la cabecera solo debe reservarlo cuando el aviso NO está. Sacar esto a
   un hook compartido evita que las dos vistas puedan desincronizarse (una
   pensando que hay aviso y la otra que no).

   Ya no hay sondeo. `dbService` avisa cuando el estado cambia de verdad, así
   que las tres señales llegan por `useSyncExternalStore`: el aviso aparece y
   desaparece en el instante en que cambia la causa, no hasta 3 s después, y
   las dos vistas no pueden discrepar porque leen la misma instantánea en el
   mismo render.

   Ya no devuelve `refrescar`: existía solo para que el banner no esperase al
   siguiente sondeo tras "Descartar", y ahora `descartarAvisoDePermisos`
   notifica ella sola. */
export function useAvisoConexion(): { aviso: Aviso; pendientes: number } {
  const estado = useSyncExternalStore(suscribirEstadoDeConexion, estadoDeConexion, () => 'ok' as const);

  const pendientes = useSyncExternalStore(suscribirEscriturasPendientes, escriturasPendientes, () => 0);

  // `navigator.onLine` es la única detección de conectividad de toda la app —
  // un `grep navigator.onLine` sobre src/ daba cero resultados antes de esto.
  // No es infalible (dice "sí" con un wifi de hotel que no enruta a ninguna
  // parte), y precisamente por eso no se usa solo: el aviso también se enciende
  // con escrituras encoladas, que es la señal que sí viene de haber intentado
  // hablar con el servidor de verdad.
  const sinRed = useSyncExternalStore(suscribirRed, estaSinRed, () => false);

  return { aviso: decidirAviso({ estado, pendientes, sinRed }), pendientes };
}

function suscribirRed(oyente: () => void): () => void {
  window.addEventListener('offline', oyente);
  window.addEventListener('online', oyente);
  return () => {
    window.removeEventListener('offline', oyente);
    window.removeEventListener('online', oyente);
  };
}

function estaSinRed(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}
