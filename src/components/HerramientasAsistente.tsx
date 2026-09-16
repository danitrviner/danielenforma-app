import React, { useRef, useState } from 'react';
import { bulkUpsertKnowledgeNotes } from '../dbService';
import { probarConexionProxy } from '../ai/aiClient';
import { KnowledgeNote } from '../types';
import { Button, Icon } from './ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Puesta a punto del asistente

   Estas dos vivían en la cabecera del panel del asistente, que ya tenía ocho
   botones de icono sin texto en una sola fila. Pero no son cosas que se hagan
   mientras se habla con él: probar la conexión se hace cuando algo falla, y la
   bóveda se sincroniza cuando cambia el contenido de Obsidian — una vez cada
   mucho. Ocupaban sitio permanente para un uso excepcional, y sin etiqueta
   visible había que acordarse de qué icono era cuál.

   Aquí tienen nombre, una línea de explicación y sitio para enseñar el
   resultado entero en vez de meterlo en una franja del panel.
   ═══════════════════════════════════════════════════════════════════════════ */

export default function HerramientasAsistente() {
  const [diagnosticando, setDiagnosticando] = useState(false);
  const [diagMsg, setDiagMsg] = useState<string | null>(null);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const vaultInputRef = useRef<HTMLInputElement>(null);

  /* El único diagnóstico posible sin acceso a los logs de Vercel: un OPTIONS y
     un POST mínimo al proxy, con URL, código HTTP y cuerpo de error EN CLARO.
     No cierra la duda con un «parece que ya va» — enseña el resultado real. */
  const probarConexion = async () => {
    setDiagnosticando(true);
    setDiagMsg(null);
    try {
      const d = await probarConexionProxy();
      setDiagMsg([
        `URL: ${d.url}`,
        `OPTIONS: ${d.optionsOk ? 'OK' : `falló — ${d.optionsError}`}`,
        d.postStatus !== undefined
          ? `POST: HTTP ${d.postStatus} — ${d.postBody}`
          : `POST: falló — ${d.postError}`,
      ].join('\n'));
    } finally {
      setDiagnosticando(false);
    }
  };

  const importarBoveda = async (file: File) => {
    setSyncMsg('Importando…');
    try {
      const parsed = JSON.parse(await file.text()) as { notes?: KnowledgeNote[] };
      const notes = parsed.notes ?? [];
      if (!Array.isArray(notes) || notes.length === 0) { setSyncMsg('El archivo no tiene notas válidas.'); return; }
      const n = await bulkUpsertKnowledgeNotes(notes);
      setSyncMsg(`✓ Bóveda sincronizada: ${n} notas.`);
    } catch {
      setSyncMsg('No se pudo leer el archivo (¿es el JSON de la bóveda?).');
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-surface border border-hairline rounded-surface px-5 py-[18px] space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-sans font-bold text-title-s text-ink">Probar la conexión</p>
            <p className="font-sans text-label text-ink-2 leading-relaxed mt-1">
              Comprueba que el servidor del asistente responde. Enseña la URL, el código y el
              error tal cual, sin interpretarlo.
            </p>
          </div>
          <Button variant="secondary" icon="network_check" loading={diagnosticando} onClick={probarConexion}>
            Probar
          </Button>
        </div>
        {diagMsg && (
          <pre className="bg-inset border border-hairline rounded-field px-3.5 py-3 font-mono text-caption text-ink-2 whitespace-pre-wrap overflow-x-auto">
            {diagMsg}
          </pre>
        )}
      </div>

      <div className="bg-surface border border-hairline rounded-surface px-5 py-[18px] space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-sans font-bold text-title-s text-ink">Sincronizar la bóveda</p>
            <p className="font-sans text-label text-ink-2 leading-relaxed mt-1">
              Sube el JSON exportado de la bóveda de conocimiento. Las notas se reemplazan por
              título: subir el archivo dos veces no duplica nada.
            </p>
          </div>
          <Button variant="secondary" icon="menu_book" onClick={() => vaultInputRef.current?.click()}>
            Elegir archivo
          </Button>
        </div>
        <input
          ref={vaultInputRef} type="file" accept="application/json,.json" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) void importarBoveda(f); e.target.value = ''; }}
        />
        {syncMsg && (
          <p className="flex items-center gap-2 font-mono text-caption text-data">
            <Icon name="info" size="s" />{syncMsg}
          </p>
        )}
      </div>
    </div>
  );
}
