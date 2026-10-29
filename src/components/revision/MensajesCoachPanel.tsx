import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { EstadoProblema, MensajeCoach, TipoMensajeCoach, UserProfile } from '../../types';
import { getMensajesDeAtleta, crearMensajeCoach, firmarMensajeCoach, cambiarEstadoProblema } from '../../db/mensajesCoach';
import { getCambiosAtleta } from '../../db/cambios';
import { createNotificationDeduped, uploadRespuestaCoachMedia } from '../../dbService';
import { cambiosSinContar, traducirCambio } from '../../utils/mensajesCoach';
import type { CambioAtleta } from '../../utils/cambiosAtleta';
import { COACH_NOMBRE } from '../../utils/coach';
import { hoyIsoLocal } from '../../utils/trainingWeek';
import { mensajeDeErrorFirestore } from '../../utils/erroresFirestore';
import { useToast } from '../../hooks/useToast';
import { Button, Icon } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Mensajes a {nombre} (29-10-2026) — lado del coach, en Cliente › Revisión.

   Tres cosas, de más a menos urgente:
   1. Por firmar: borradores que dejó la máquina (el latido al cambiar la
      fase de la dieta) o Dani sin terminar. Nada de esto lo ve el atleta
      hasta «Firmar».
   2. Cambios sin contar: lo que Dani tocó esta semana (`cambiosAtleta`) y
      el atleta no sabe por qué. Cada uno con la frase traducida y un campo
      para el porqué; «Contárselo» lo firma.
   3. Lo que contó el atleta (acuses de problemas) con su estado: recibido →
      en ello → hecho, con una línea de Dani al cerrarlo.
   Y un campo libre para escribirle una línea.
   ═══════════════════════════════════════════════════════════════════════════ */

const ESTADOS: { id: EstadoProblema; label: string }[] = [
  { id: 'recibido', label: 'Recibido' }, { id: 'en_curso', label: 'En ello' }, { id: 'hecho', label: 'Hecho' },
];

export function claveMensajesCoach(email: string) { return ['mensajesCoachDeAtleta', email] as const; }

export default function MensajesCoachPanel({ athlete }: { athlete: UserProfile }) {
  const email = athlete.email;
  const nombre = (athlete.displayName || email).split(' ')[0];
  const hoy = hoyIsoLocal();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const { data: mensajes = [] } = useQuery({ queryKey: claveMensajesCoach(email), queryFn: () => getMensajesDeAtleta(email) });
  const { data: cambios = [] } = useQuery({ queryKey: ['cambiosAtleta', email], queryFn: () => getCambiosAtleta(email) });

  const borradores = useMemo(() => mensajes.filter(m => m.estado === 'borrador').sort((a, b) => b.fecha.localeCompare(a.fecha)), [mensajes]);
  const sinContar = useMemo(() => cambiosSinContar(cambios, mensajes, hoy), [cambios, mensajes, hoy]);
  const problemas = useMemo(() => mensajes.filter(m => m.tipo === 'problema' && m.problema?.estado !== 'hecho').sort((a, b) => b.fecha.localeCompare(a.fecha)), [mensajes]);
  const enviados = useMemo(() => mensajes.filter(m => m.estado === 'aprobado' && m.autor === 'coach').sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 5), [mensajes]);

  const refrescar = () => {
    void queryClient.invalidateQueries({ queryKey: claveMensajesCoach(email) });
    void queryClient.invalidateQueries({ queryKey: ['mensajesCoach'] });
  };
  const avisar = (titulo: string, cuerpo: string, clave: string) => createNotificationDeduped(clave, {
    recipientEmail: email, type: 'coach_mensaje', title: titulo, body: cuerpo.slice(0, 120), link: 'home',
    createdAt: new Date().toISOString(), read: false,
  }).catch(console.error);

  const firmar = useMutation({
    mutationFn: async (m: { id: string; texto: string; porque?: string }) => {
      await firmarMensajeCoach(m.id, m.texto, m.porque);
      await avisar(`${COACH_NOMBRE} te ha escrito`, m.texto, `notif_mc_${m.id}`);
    },
    onSuccess: () => { refrescar(); showToast('Firmado y enviado.', 'success'); },
    onError: err => showToast(mensajeDeErrorFirestore(err, 'firmar el mensaje')),
  });
  const contar = useMutation({
    mutationFn: async (e: { cambio: CambioAtleta; texto: string; porque: string }) => {
      const m = await crearMensajeCoach({
        id: `cambio_${e.cambio.id}`, athleteId: email, tipo: 'cambio', autor: 'coach', estado: 'aprobado',
        texto: e.texto, porque: e.porque || undefined, fecha: hoy, firmadoEn: new Date().toISOString(),
        origen: { coleccion: 'cambiosAtleta', id: e.cambio.id },
      });
      await avisar(`${COACH_NOMBRE} ha cambiado algo en tu plan`, m.texto, `notif_mc_${m.id}`);
    },
    onSuccess: () => { refrescar(); showToast('Contado al atleta.', 'success'); },
    onError: err => showToast(mensajeDeErrorFirestore(err, 'contárselo')),
  });
  const estado = useMutation({
    mutationFn: async (e: { m: MensajeCoach; estado: EstadoProblema; detalle?: string }) => {
      await cambiarEstadoProblema(e.m.id, e.estado, e.detalle);
      if (e.estado !== 'recibido') await avisar(e.estado === 'hecho' ? `${COACH_NOMBRE}: hecho` : `${COACH_NOMBRE} está en ello`, e.detalle || e.m.texto, `notif_mc_${e.m.id}_${e.estado}`);
    },
    onSuccess: refrescar,
    onError: err => showToast(mensajeDeErrorFirestore(err, 'cambiar el estado')),
  });
  const libre = useMutation({
    mutationFn: async (e: { texto: string; tipo: TipoMensajeCoach; archivo?: File | null }) => {
      let mediaUrl: string | undefined, mediaKind: 'audio' | 'video' | undefined;
      if (e.archivo) {
        mediaUrl = await uploadRespuestaCoachMedia(email, e.archivo);
        mediaKind = e.archivo.type.startsWith('audio/') ? 'audio' : 'video';
      }
      const m = await crearMensajeCoach({ athleteId: email, tipo: e.tipo, autor: 'coach', estado: 'aprobado', texto: e.texto, fecha: hoy, firmadoEn: new Date().toISOString(), mediaUrl, mediaKind });
      await avisar(e.tipo === 'hito' ? `${COACH_NOMBRE} te ha dejado un hito` : `${COACH_NOMBRE} te ha escrito`, m.texto || (mediaKind === 'audio' ? 'Te ha dejado un audio' : 'Te ha dejado un vídeo'), `notif_mc_${m.id}`);
    },
    onSuccess: () => { refrescar(); showToast('Enviado.', 'success'); },
    onError: err => showToast(mensajeDeErrorFirestore(err, 'enviar el mensaje')),
  });

  const [textoLibre, setTextoLibre] = useState('');
  const [archivoLibre, setArchivoLibre] = useState<File | null>(null);
  const [esHito, setEsHito] = useState(false);

  return (
    <section className="space-y-4" aria-label={`Mensajes a ${nombre}`}>
      <h2 className="font-sans font-bold text-title-s text-ink flex items-center gap-2">
        <Icon name="chat" size="m" className="text-accent-ink" />
        Mensajes a {nombre}
        {(borradores.length + sinContar.length) > 0 && (
          <span className="ml-1 rounded-full bg-accent px-2 font-mono text-caption font-bold text-on-accent">{borradores.length + sinContar.length}</span>
        )}
      </h2>

      {borradores.length > 0 && (
        <Bloque titulo="Por firmar" nota="Lo escribió la máquina o lo dejaste a medias: él no lo ve hasta que lo firmes.">
          {borradores.map(m => <Borrador key={m.id} m={m} onFirmar={(texto, porque) => firmar.mutate({ id: m.id, texto, porque })} ocupado={firmar.isPending} />)}
        </Bloque>
      )}

      {sinContar.length > 0 && (
        <Bloque titulo="Cambios sin contar" nota="Lo que has tocado esta semana. Una línea y el porqué, y le llega con tu nombre.">
          {sinContar.map(c => <CambioSinContar key={c.id} cambio={c} onContar={(texto, porque) => contar.mutate({ cambio: c, texto, porque })} ocupado={contar.isPending} />)}
        </Bloque>
      )}

      {problemas.length > 0 && (
        <Bloque titulo="Lo que te ha contado" nota="Pásalo a «en ello» o «hecho»; con una línea tuya, mejor.">
          {problemas.map(m => <Problema key={m.id} m={m} onEstado={(e, d) => estado.mutate({ m, estado: e, detalle: d })} ocupado={estado.isPending} />)}
        </Bloque>
      )}

      <div className="rounded-control border border-hairline bg-surface p-3 space-y-2">
        <label htmlFor={`libre-${email}`} className="block font-mono text-caption uppercase tracking-wider text-ink-2">Escribirle una línea</label>
        <textarea
          id={`libre-${email}`}
          value={textoLibre}
          onChange={e => setTextoLibre(e.target.value)}
          rows={2}
          placeholder={`Lo que le dirías por WhatsApp, pero aquí lo tiene en Inicio con tu nombre.`}
          className="w-full bg-raised border border-hairline rounded-control p-3 text-label text-ink focus:ring-1 focus:ring-accent focus:outline-none resize-y font-sans"
        />
        {/* Hitos con audio o vídeo (Dani, 28-10): primer mes, récord grande,
            peso objetivo a la vista. Mismo cuadro, marcado como hito. */}
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1.5 cursor-pointer font-sans text-caption text-ink-3 hover:text-ink border border-hairline rounded-control px-2.5 py-1.5">
            <Icon name="add" size="s" />
            {archivoLibre ? archivoLibre.name : 'Audio o vídeo'}
            <input type="file" accept="audio/*,video/*" className="sr-only" onChange={e => setArchivoLibre(e.target.files?.[0] ?? null)} />
          </label>
          <label className="inline-flex items-center gap-1.5 font-sans text-caption text-ink-2 cursor-pointer">
            <input type="checkbox" checked={esHito} onChange={e => setEsHito(e.target.checked)} className="accent-[var(--color-accent)]" />
            Es un hito (primer mes, récord, objetivo a la vista)
          </label>
          <span className="flex-1" />
          <Button size="s" iconTrailing="send" disabled={(!textoLibre.trim() && !archivoLibre) || libre.isPending} loading={libre.isPending}
            onClick={() => libre.mutate({ texto: textoLibre.trim(), tipo: esHito ? 'hito' : 'libre', archivo: archivoLibre }, { onSuccess: () => { setTextoLibre(''); setArchivoLibre(null); setEsHito(false); } })}>
            {esHito ? 'Enviar el hito' : 'Enviar con mi nombre'}
          </Button>
        </div>
      </div>

      {enviados.length > 0 && (
        <Bloque titulo="Enviados">
          {enviados.map(m => (
            <div key={m.id} className="py-2 first:pt-0 last:pb-0">
              <p className="font-mono text-caption text-ink-3">{m.fecha} · {m.tipo}</p>
              <p className="font-sans text-label text-ink whitespace-pre-wrap">{m.texto}</p>
              {m.porque && <p className="font-sans text-caption text-ink-2">Por qué: {m.porque}</p>}
            </div>
          ))}
        </Bloque>
      )}
    </section>
  );
}

function Bloque({ titulo, nota, children }: { titulo: string; nota?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-control border border-hairline bg-surface p-3">
      <p className="font-mono text-caption uppercase tracking-wider text-accent-ink">{titulo}</p>
      {nota && <p className="font-sans text-caption text-ink-3 mb-2">{nota}</p>}
      <div className="divide-y divide-hairline">{children}</div>
    </div>
  );
}

function Borrador({ m, onFirmar, ocupado }: { m: MensajeCoach; onFirmar: (texto: string, porque?: string) => void; ocupado: boolean; key?: React.Key }) {
  const [texto, setTexto] = useState(m.texto);
  const [porque, setPorque] = useState(m.porque ?? '');
  return (
    <div className="py-2.5 first:pt-0 last:pb-0 space-y-1.5">
      <p className="font-mono text-caption text-ink-3">{m.fecha} · {m.autor === 'latido' ? 'automático' : m.autor}</p>
      <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={2}
        className="w-full bg-raised border border-hairline rounded-control p-2.5 text-label text-ink focus:ring-1 focus:ring-accent focus:outline-none resize-y font-sans" />
      <input value={porque} onChange={e => setPorque(e.target.value)} placeholder="Por qué (opcional)"
        className="w-full bg-raised border border-hairline rounded-control p-2.5 text-label text-ink focus:ring-1 focus:ring-accent focus:outline-none font-sans" />
      <div className="flex justify-end">
        <Button size="s" iconTrailing="send" disabled={!texto.trim() || ocupado} onClick={() => onFirmar(texto.trim(), porque.trim() || undefined)}>Firmar y enviar</Button>
      </div>
    </div>
  );
}

function CambioSinContar({ cambio, onContar, ocupado }: { cambio: CambioAtleta; onContar: (texto: string, porque: string) => void; ocupado: boolean; key?: React.Key }) {
  const [texto, setTexto] = useState(() => traducirCambio(cambio));
  const [porque, setPorque] = useState('');
  return (
    <div className="py-2.5 first:pt-0 last:pb-0 space-y-1.5">
      <p className="font-mono text-caption text-ink-3">{cambio.at.slice(0, 10)} · {cambio.titulo} · {cambio.lineas.slice(0, 2).join(' / ')}</p>
      <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={2}
        className="w-full bg-raised border border-hairline rounded-control p-2.5 text-label text-ink focus:ring-1 focus:ring-accent focus:outline-none resize-y font-sans" />
      <input value={porque} onChange={e => setPorque(e.target.value)} placeholder="Por qué, en una frase"
        className="w-full bg-raised border border-hairline rounded-control p-2.5 text-label text-ink focus:ring-1 focus:ring-accent focus:outline-none font-sans" />
      <div className="flex justify-end">
        <Button size="s" iconTrailing="send" disabled={!texto.trim() || ocupado} onClick={() => onContar(texto.trim(), porque.trim())}>Contárselo</Button>
      </div>
    </div>
  );
}

function Problema({ m, onEstado, ocupado }: { m: MensajeCoach; onEstado: (estado: EstadoProblema, detalle?: string) => void; ocupado: boolean; key?: React.Key }) {
  const [detalle, setDetalle] = useState(m.problema?.detalle ?? '');
  const actual = m.problema?.estado ?? 'recibido';
  return (
    <div className="py-2.5 first:pt-0 last:pb-0 space-y-1.5">
      <p className="font-mono text-caption text-ink-3">{m.fecha}</p>
      <p className="font-sans text-label text-ink">{m.texto}</p>
      <input value={detalle} onChange={e => setDetalle(e.target.value)} placeholder="Qué has hecho o vas a hacer (le llega con tu nombre)"
        className="w-full bg-raised border border-hairline rounded-control p-2.5 text-label text-ink focus:ring-1 focus:ring-accent focus:outline-none font-sans" />
      <div className="flex flex-wrap gap-1.5">
        {ESTADOS.map(e => (
          <button key={e.id} type="button" disabled={ocupado} onClick={() => onEstado(e.id, detalle.trim() || undefined)}
            className={`rounded-chip px-3 py-1.5 font-mono text-caption font-bold uppercase transition-colors ${actual === e.id ? 'bg-accent text-on-accent' : 'bg-hairline text-ink-2 hover:bg-strong'}`}>
            {e.label}
          </button>
        ))}
      </div>
    </div>
  );
}
