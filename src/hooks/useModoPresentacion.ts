import { useEffect, useState, useCallback } from 'react';

/* ═══════════════════════════════════════════════════════════════════════════
   MODO PRESENTACIÓN — la Revisión se graba en vídeo.

   Dani abre la pantalla de un cliente, la graba con el móvil o compartiendo
   pantalla y se la manda. En ese vídeo sobran los controles —el selector de
   periodo, «desplegar todo», los botones de «ir a…»— porque el atleta no puede
   pulsarlos, y falta tamaño: lo que en un monitor se lee de sobra, en un vídeo
   comprimido visto en un móvil no se lee.

   Se enciende con la tecla P y se apaga con P o con Escape. Sin botón en la
   barra a propósito: el botón saldría en el vídeo.

   La preferencia se recuerda porque casi siempre se graban varios clientes
   seguidos; si el navegador tiene el almacenamiento bloqueado (ventana privada,
   ajustes estrictos) el modo sigue funcionando, solo que no se recuerda.
   ═══════════════════════════════════════════════════════════════════════════ */

const CLAVE = 'enforma_revision_presentacion_v1';

/** ¿El foco está en algo donde una «p» es una letra y no un atajo? */
function escribiendo(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
}

function leerGuardado(): boolean {
  try {
    return localStorage.getItem(CLAVE) === '1';
  } catch {
    return false;
  }
}

export function useModoPresentacion(): { presentando: boolean; alternar: () => void } {
  const [presentando, setPresentando] = useState(leerGuardado);

  const alternar = useCallback(() => setPresentando(v => !v), []);

  useEffect(() => {
    try {
      localStorage.setItem(CLAVE, presentando ? '1' : '0');
    } catch { /* almacenamiento bloqueado: el modo funciona igual, no se recuerda */ }
  }, [presentando]);

  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || escribiendo(e.target)) return;
      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        setPresentando(v => !v);
      } else if (e.key === 'Escape') {
        // Escape solo apaga: encenderlo sin querer con Escape sería raro, y
        // apagarlo es lo que uno busca cuando algo se ve mal en mitad de la
        // grabación.
        setPresentando(false);
      }
    };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, []);

  return { presentando, alternar };
}
