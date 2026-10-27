import React, { useState } from 'react';
import type { QuestionnaireResponse } from '../../types';
import { guardarRespuestaCoach, uploadRespuestaCoachMedia, createNotificationDeduped } from '../../dbService';
import { mensajeDeErrorFirestore } from '../../utils/erroresFirestore';
import { useToast } from '../../hooks/useToast';
import { Button, Icon } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Respuesta del coach a una revisión (27-10)

   Cierra el ciclo: el coach contesta con texto y, si quiere, un audio o vídeo
   corto. Al enviarla la revisión queda vista, el atleta recibe un aviso y en su
   historial sale «Tu coach ha revisado tu semana» con la respuesta.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  respuesta: QuestionnaireResponse;
  onGuardada: (r: QuestionnaireResponse) => void;
}

export default function RespuestaCoachBox({ respuesta, onGuardada }: Props) {
  const { showToast } = useToast();
  const existente = respuesta.respuestaCoach;
  const [editando, setEditando] = useState(!existente);
  const [texto, setTexto] = useState(existente?.texto ?? '');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async () => {
    if (!texto.trim() && !archivo) return;
    setEnviando(true);
    try {
      let mediaUrl = existente?.mediaUrl;
      let mediaKind = existente?.mediaKind;
      if (archivo) {
        mediaUrl = await uploadRespuestaCoachMedia(respuesta.athleteId, archivo);
        mediaKind = archivo.type.startsWith('audio/') ? 'audio' : 'video';
      }
      const nueva = { texto: texto.trim(), mediaUrl, mediaKind, enviadaEn: new Date().toISOString() };
      await guardarRespuestaCoach(respuesta.id, nueva);
      onGuardada({ ...respuesta, respuestaCoach: nueva, reviewedAt: nueva.enviadaEn });
      createNotificationDeduped(`notif_rc_${respuesta.id}_${nueva.enviadaEn}`, {
        recipientEmail: respuesta.athleteId,
        type: 'revision_respondida',
        title: 'Tu coach ha revisado tu semana',
        body: nueva.texto ? nueva.texto.slice(0, 120) : (mediaKind === 'audio' ? 'Te ha dejado un audio' : 'Te ha dejado un vídeo'),
        link: 'checkin',
        createdAt: nueva.enviadaEn,
        read: false,
      }).catch(console.error);
      setArchivo(null);
      setEditando(false);
      showToast('Respuesta enviada al atleta.', 'success');
    } catch (err) {
      showToast(mensajeDeErrorFirestore(err, 'enviar tu respuesta'));
    } finally {
      setEnviando(false);
    }
  };

  if (!editando && existente) {
    return (
      <div className="rounded-control border border-accent-line bg-accent-bg/50 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Icon name="check_circle" size="s" className="text-success" />
          <span className="font-sans text-caption font-bold text-ink-2 flex-1">
            Contestada el {new Date(existente.enviadaEn).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
          </span>
          <button type="button" onClick={() => setEditando(true)} className="font-sans text-caption text-ink-4 hover:text-ink">Editar</button>
        </div>
        {existente.texto && <p className="font-sans text-label text-ink whitespace-pre-wrap">{existente.texto}</p>}
        {existente.mediaUrl && (existente.mediaKind === 'audio'
          ? <audio controls src={existente.mediaUrl} className="w-full" />
          : <video controls src={existente.mediaUrl} className="w-full rounded-control max-h-64" />)}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label htmlFor={`rc-${respuesta.id}`} className="block font-mono text-caption text-ink-2 uppercase tracking-wider">Contesta su revisión</label>
      <textarea
        id={`rc-${respuesta.id}`}
        value={texto}
        onChange={e => setTexto(e.target.value)}
        placeholder="Qué ves, qué ajustamos, qué tiene que mantener…"
        className="w-full bg-raised border border-hairline rounded-control p-3 text-label text-ink focus:ring-1 focus:ring-accent focus:outline-none min-h-[88px] resize-y font-sans"
      />
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-1.5 cursor-pointer font-sans text-caption text-ink-3 hover:text-ink border border-hairline rounded-control px-2.5 py-1.5">
          <Icon name="add" size="s" />
          {archivo ? archivo.name : 'Audio o vídeo'}
          <input type="file" accept="audio/*,video/*" className="sr-only" onChange={e => setArchivo(e.target.files?.[0] ?? null)} />
        </label>
        <span className="flex-1" />
        {existente && <Button size="s" variant="ghost" onClick={() => setEditando(false)}>Cancelar</Button>}
        <Button size="s" iconTrailing="send" onClick={enviar} loading={enviando} loadingLabel="Enviando" disabled={!texto.trim() && !archivo}>
          Enviar al atleta
        </Button>
      </div>
    </div>
  );
}
