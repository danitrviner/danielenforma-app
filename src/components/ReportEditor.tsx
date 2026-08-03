import React, { useState } from 'react';
import { CoachReport } from '../types';
import ReportView from './ReportView';
import { buildReportText } from '../utils/reportBuilder';

interface Props {
  initial: CoachReport;
  onSaveDraft: (r: CoachReport) => Promise<void>;
  onSend: (r: CoachReport) => Promise<void>;
  onDelete: (r: CoachReport) => Promise<void>;
  onClose: () => void;
}

// Coach-in-the-loop editor: the numbers are already computed (snapshot in
// `initial.sections[].data`); here the coach curates title/intro, toggles which
// sections the athlete sees, and adds per-section notes, with a live preview.
export default function ReportEditor({ initial, onSaveDraft, onSend, onDelete, onClose }: Props) {
  const [draft, setDraft] = useState<CoachReport>(initial);
  const [busy, setBusy] = useState<null | 'save' | 'send' | 'delete'>(null);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(buildReportText(draft));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const setSection = (id: string, patch: Partial<{ included: boolean; coachNote: string }>) =>
    setDraft(d => ({ ...d, sections: d.sections.map(s => s.id === id ? { ...s, ...patch } : s) }));

  const run = async (kind: 'save' | 'send' | 'delete', fn: () => Promise<void>) => {
    setBusy(kind);
    try { await fn(); } finally { setBusy(null); }
  };

  const alreadySent = initial.status === 'sent';

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 overflow-y-auto">
      <div className="min-h-full flex items-start justify-center sm:p-4">
        <div className="bg-bg border border-hairline sm:rounded-surface w-full sm:max-w-4xl shadow-2xl">
          {/* Header */}
          <div className="sticky top-0 z-10 bg-bg border-b border-hairline px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-sans font-bold text-title-m text-white uppercase tracking-tight">
                {alreadySent ? 'Editar reporte enviado' : 'Reporte de la semana'}
              </h2>
              <p className="font-mono text-caption text-ink-2 mt-0.5">
                {draft.status === 'sent' ? 'Enviado' : 'Borrador'}
              </p>
            </div>
            <button onClick={onClose} className="text-white bg-raised hover:bg-raised p-2 h-9 w-9 rounded-full flex items-center justify-center transition-colors flex-shrink-0">
              <span className="material-symbols-outlined text-title-s">close</span>
            </button>
          </div>

          <div className="grid lg:grid-cols-2 gap-5 p-4 sm:p-6">
            {/* ── Left: editing controls ── */}
            <div className="space-y-4">
              <div>
                <label className="block font-mono text-caption text-ink-2 uppercase tracking-wider mb-2">Título</label>
                <input
                  value={draft.title}
                  onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
                  className="w-full bg-surface border border-hairline rounded-control px-3 py-3 text-body-s text-white focus:outline-none focus:border-accent/50"
                />
              </div>

              <div>
                <label className="block font-sans text-caption text-ink-2 uppercase tracking-wider mb-2">Mensaje para el atleta</label>
                <textarea
                  value={draft.intro}
                  onChange={e => setDraft(d => ({ ...d, intro: e.target.value }))}
                  rows={4}
                  placeholder="Escribe tu valoración de la semana, contexto, próximos pasos..."
                  className="w-full bg-surface border border-hairline rounded-control px-3 py-3 text-body-s text-white focus:outline-none focus:border-accent/50 resize-y placeholder-ink-3"
                />
              </div>

              <div className="space-y-3">
                <label className="block font-sans text-caption text-ink-2 uppercase tracking-wider">Secciones (marca qué se cuenta)</label>
                {draft.sections.map(s => (
                  <div key={s.id} className="bg-surface border border-hairline rounded-surface p-3 space-y-2">
                    <button
                      onClick={() => setSection(s.id, { included: !s.included })}
                      className="w-full flex items-center gap-3 text-left"
                    >
                      <span className={`material-symbols-outlined text-title-m flex-shrink-0 ${s.included ? 'text-accent' : 'text-ink-3'}`} style={{ fontVariationSettings: s.included ? "'FILL' 1" : "'FILL' 0" }}>
                        {s.included ? 'check_box' : 'check_box_outline_blank'}
                      </span>
                      <span className={`text-body-s font-sans font-bold ${s.included ? 'text-white' : 'text-ink-3'}`}>{s.title}</span>
                    </button>
                    {s.included && (
                      <input
                        value={s.coachNote ?? ''}
                        onChange={e => setSection(s.id, { coachNote: e.target.value })}
                        placeholder="Nota opcional para esta sección..."
                        className="w-full bg-raised border border-hairline rounded-control px-3 py-2 text-label text-white focus:outline-none focus:border-accent/50 placeholder-ink-3"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* ── Right: live preview ── */}
            <div className="lg:border-l lg:border-hairline lg:pl-5">
              <p className="font-sans text-caption text-ink-2 uppercase tracking-wider mb-3">Vista previa (lo que verá el atleta)</p>
              <ReportView report={draft} />
            </div>
          </div>

          {/* Footer actions */}
          <div className="sticky bottom-0 bg-bg border-t border-hairline px-4 sm:px-6 py-4 flex items-center gap-3 flex-wrap pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <button
              onClick={() => run('delete', () => onDelete(draft))}
              disabled={busy !== null}
              className="px-4 py-3 border border-hairline text-ink-2 hover:border-red-400/40 hover:text-red-400 font-mono text-caption font-bold uppercase rounded-control transition-all disabled:opacity-40"
            >
              {busy === 'delete' ? 'Eliminando…' : 'Eliminar'}
            </button>
            <div className="flex-1" />
            <button
              onClick={handleCopy}
              className="px-4 py-3 bg-surface border border-hairline text-white font-sans text-label font-bold uppercase rounded-control hover:border-data/50 transition-all flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-title-s">{copied ? 'check' : 'content_copy'}</span>
              {copied ? '¡Copiado!' : 'Copiar texto'}
            </button>
            <button
              onClick={() => run('save', () => onSaveDraft(draft))}
              disabled={busy !== null}
              className="px-4 py-3 bg-surface border border-hairline text-white font-sans text-label font-bold uppercase rounded-control hover:border-accent/50 transition-all disabled:opacity-40"
            >
              {busy === 'save' ? 'Guardando…' : 'Guardar borrador'}
            </button>
            <button
              onClick={() => run('send', () => onSend(draft))}
              disabled={busy !== null}
              className="px-5 py-3 bg-accent text-black font-sans text-label font-bold uppercase rounded-control hover:bg-accent-press active:scale-95 transition-all disabled:opacity-40 flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-title-s">send</span>
              {busy === 'send' ? 'Enviando…' : alreadySent ? 'Reenviar' : 'Enviar al atleta'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
