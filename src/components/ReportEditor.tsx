import React, { useState } from 'react';
import { CoachReport } from '../types';
import ReportView from './ReportView';

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
        <div className="bg-[#111110] border border-white/7 sm:rounded-2xl w-full sm:max-w-4xl shadow-2xl">
          {/* Header */}
          <div className="sticky top-0 z-10 bg-[#111110] border-b border-white/7 px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-sans font-black text-lg text-white uppercase tracking-tight">
                {alreadySent ? 'Editar reporte enviado' : 'Reporte de la semana'}
              </h2>
              <p className="font-mono text-[10px] text-[#c6c9ab] mt-0.5">
                {draft.status === 'sent' ? 'Enviado' : 'Borrador'}
              </p>
            </div>
            <button onClick={onClose} className="text-white bg-[#2a2a2a] hover:bg-[#3e3e3e] p-1.5 h-9 w-9 rounded-full flex items-center justify-center transition-colors flex-shrink-0">
              <span className="material-symbols-outlined text-base">close</span>
            </button>
          </div>

          <div className="grid lg:grid-cols-2 gap-5 p-4 sm:p-6">
            {/* ── Left: editing controls ── */}
            <div className="space-y-4">
              <div>
                <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider mb-1.5">Título</label>
                <input
                  value={draft.title}
                  onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
                  className="w-full bg-[#181816] border border-white/7 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#fbcb1a]/50"
                />
              </div>

              <div>
                <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider mb-1.5">Mensaje para el atleta</label>
                <textarea
                  value={draft.intro}
                  onChange={e => setDraft(d => ({ ...d, intro: e.target.value }))}
                  rows={4}
                  placeholder="Escribe tu valoración de la semana, contexto, próximos pasos..."
                  className="w-full bg-[#181816] border border-white/7 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#fbcb1a]/50 resize-y placeholder-[#555]"
                />
              </div>

              <div className="space-y-2.5">
                <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider">Secciones (marca qué se cuenta)</label>
                {draft.sections.map(s => (
                  <div key={s.id} className="bg-[#181816] border border-white/7 rounded-xl p-3 space-y-2">
                    <button
                      onClick={() => setSection(s.id, { included: !s.included })}
                      className="w-full flex items-center gap-2.5 text-left"
                    >
                      <span className={`material-symbols-outlined text-lg flex-shrink-0 ${s.included ? 'text-[#fbcb1a]' : 'text-[#555]'}`} style={{ fontVariationSettings: s.included ? "'FILL' 1" : "'FILL' 0" }}>
                        {s.included ? 'check_box' : 'check_box_outline_blank'}
                      </span>
                      <span className={`text-sm font-sans font-bold ${s.included ? 'text-white' : 'text-[#555]'}`}>{s.title}</span>
                    </button>
                    {s.included && (
                      <input
                        value={s.coachNote ?? ''}
                        onChange={e => setSection(s.id, { coachNote: e.target.value })}
                        placeholder="Nota opcional para esta sección..."
                        className="w-full bg-[#1e1e1b] border border-white/7 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:border-[#fbcb1a]/50 placeholder-[#555]"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* ── Right: live preview ── */}
            <div className="lg:border-l lg:border-white/7 lg:pl-5">
              <p className="font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider mb-3">Vista previa (lo que verá el atleta)</p>
              <ReportView report={draft} />
            </div>
          </div>

          {/* Footer actions */}
          <div className="sticky bottom-0 bg-[#111110] border-t border-white/7 px-4 sm:px-6 py-4 flex items-center gap-3 flex-wrap pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <button
              onClick={() => run('delete', () => onDelete(draft))}
              disabled={busy !== null}
              className="px-3.5 py-2.5 border border-white/7 text-[#c6c9ab] hover:border-red-400/40 hover:text-red-400 font-mono text-[10px] font-bold uppercase rounded-xl transition-all disabled:opacity-40"
            >
              {busy === 'delete' ? 'Eliminando…' : 'Eliminar'}
            </button>
            <div className="flex-1" />
            <button
              onClick={() => run('save', () => onSaveDraft(draft))}
              disabled={busy !== null}
              className="px-4 py-2.5 bg-[#181816] border border-white/7 text-white font-sans text-xs font-bold uppercase rounded-xl hover:border-[#fbcb1a]/50 transition-all disabled:opacity-40"
            >
              {busy === 'save' ? 'Guardando…' : 'Guardar borrador'}
            </button>
            <button
              onClick={() => run('send', () => onSend(draft))}
              disabled={busy !== null}
              className="px-5 py-2.5 bg-[#fbcb1a] text-black font-sans text-xs font-bold uppercase rounded-xl hover:bg-[#d4a800] active:scale-95 transition-all disabled:opacity-40 flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-base">send</span>
              {busy === 'send' ? 'Enviando…' : alreadySent ? 'Reenviar' : 'Enviar al atleta'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
