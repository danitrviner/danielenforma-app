import React, { useEffect, useState, useSyncExternalStore } from 'react';
import {
  isLocalBypassActive, setLocalBypassMode, hayFalloDePermisos, descartarAvisoDePermisos,
  escriturasPendientes, suscribirEscriturasPendientes,
} from '../dbService';
import { decidirAviso, textoDelAviso } from '../utils/avisoConexion';
import { Icon } from './ui';

// Aviso persistente cuando lo que el usuario guarda NO está llegando al
// servidor: sin esto el fallo es invisible y sigue editando creyendo que guarda.
//
// Tres causas, tres mensajes, y la distinción no es cosmética:
//   · permisos — la cuenta no tiene acceso. Reintentar NO va a funcionar nunca,
//                y decirle "revisa tu conexión" manda a la persona a mirar su
//                wifi mientras el problema está en su cuenta (P1-6). Es
//                exactamente lo que le pasó al atleta que no podía completar el
//                onboarding.
//   · red      — Firestore no responde y se ha caído a modo local. Reintentar
//                puede funcionar. Los cambios NO se están guardando.
//   · encolado — 05-3. No hay conexión, pero Firestore SÍ tiene el dato: está
//                en IndexedDB y subirá solo. Es un aviso, no un error, y por eso
//                va en ámbar y no en rojo. Antes este estado no existía y el
//                resultado era el peor de los dos mundos: sin cobertura no salía
//                ningún aviso —el banner solo miraba `isLocalBypassActive`, que
//                solo se enciende desde un `catch` de Firestore, y con la caché
//                persistente sin red no hay `catch`— y a la vez el botón de
//                guardar se quedaba girando. La persona no tenía forma de saber
//                si su entrenamiento se había guardado o no.
//
// Polling barato para las dos banderas de módulo (booleanos sin suscripción,
// 3 s de latencia para un aviso es fina); el contador de pendientes sí avisa,
// así que va por `useSyncExternalStore` y se apaga en el mismo instante en que
// la última escritura sincroniza.
export default function LocalModeBanner() {
  const [estado, setEstado] = useState<'ok' | 'red' | 'permisos'>(
    () => (isLocalBypassActive() ? 'red' : hayFalloDePermisos() ? 'permisos' : 'ok')
  );

  useEffect(() => {
    const id = setInterval(
      () => setEstado(isLocalBypassActive() ? 'red' : hayFalloDePermisos() ? 'permisos' : 'ok'),
      3000
    );
    return () => clearInterval(id);
  }, []);

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

  // La prioridad y los textos viven en utils/avisoConexion.ts, con pruebas.
  const aviso = decidirAviso({ estado, pendientes, sinRed });
  if (aviso === 'ok') return null;

  const retry = () => {
    // Vuelve a intentar Firestore: la próxima operación real confirmará si hay
    // conexión (y si falla, el propio dbService reactivará el bypass).
    setLocalBypassMode(false);
    window.location.reload();
  };

  // El aviso de permisos no tiene "Reintentar" (no serviría), así que sin esto
  // no habría forma de quitarlo: la bandera la pone el primer permission-denied
  // de la sesión y no se limpia sola. Descartar no arregla nada — si el fallo
  // sigue vivo, la siguiente operación denegada lo devuelve a los 3 s.
  const descartar = () => {
    descartarAvisoDePermisos();
    setEstado('ok');
  };

  return (
    // pt: el aviso va por encima de todo (z-100) y en fixed top-0, así que sin
    // reservar la safe area su texto quedaba debajo de la barra de estado —
    // justo el aviso que más se tiene que leer (07-2).
    <div
      role="status"
      aria-live="polite"
      className={`fixed top-0 left-0 right-0 z-[100] text-white px-4 py-3 pt-[calc(0.75rem+var(--safe-top))] flex items-center justify-center gap-3 shadow-e1 ${
        // Ámbar, no rojo: un dato encolado no se ha perdido, y pintar de rojo de
        // error algo que sí está guardado enseña a la persona a ignorar el rojo.
        aviso === 'encolado' ? 'bg-amber-600' : 'bg-red-600'
      }`}
    >
      <Icon name={aviso === 'permisos' ? 'lock' : aviso === 'encolado' ? 'cloud_sync' : 'cloud_off'} size="m" />
      <p className="font-sans text-label font-bold">{textoDelAviso(aviso, pendientes)}</p>
      {/* Reintentar solo tiene sentido con un fallo de red. Ante uno de permisos
          recargar da exactamente el mismo resultado, y ofrecerlo solo consigue
          que la persona lo pulse cinco veces antes de rendirse. Y ante uno
          encolado no hay nada que reintentar: recargar a media sincronización es
          justo lo que no queremos que haga. */}
      {aviso === 'red' && (
        <button
          onClick={retry}
          className="font-sans text-caption font-bold uppercase bg-white/20 hover:bg-white/30 px-3 py-1 rounded-control transition-colors"
        >
          Reintentar
        </button>
      )}
      {aviso === 'permisos' && (
        <button
          onClick={descartar}
          aria-label="Descartar el aviso"
          className="shrink-0 rounded-control p-1 transition-colors hover:bg-white/20"
        >
          <Icon name="close" size="s" />
        </button>
      )}
    </div>
  );
}
