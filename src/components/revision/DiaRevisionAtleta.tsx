import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { UserProfile } from '../../types';
import { updateUserProfile } from '../../dbService';
import { diasDelCiclo, normalizarDiaRevision } from '../../utils/cicloRevision';
import { mensajeDeErrorFirestore } from '../../utils/erroresFirestore';
import { useToast } from '../../hooks/useToast';
import { Icon } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Día de revisión y pausa de un atleta (27-10)

   Una línea discreta encima de sus cuestionarios: qué día le revisa el coach
   y, si hace falta, una pausa por vacaciones. Pedido así: «que sea sutil y no
   moleste ni ocupe mucho». El cuestionario se le abre 3 días antes y caduca el
   día después (utils/cicloRevision.ts); la frase lo dice para no tener que
   hacer la cuenta.
   ═══════════════════════════════════════════════════════════════════════════ */

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const SELECT_CLS = 'bg-transparent border-0 border-b border-dashed border-hairline text-ink font-sans text-caption font-bold py-0 pl-0 pr-5 focus:ring-0 focus:border-accent cursor-pointer';
const FECHA_CLS = 'bg-raised border border-hairline rounded-control px-2 py-1 text-caption text-ink font-mono';

interface Props {
  athlete: UserProfile;
  /** Para que el resto del panel recalcule fechas con el día nuevo. */
  onCambio?: (cambios: Partial<Pick<UserProfile, 'diaRevision' | 'pausaRevisiones' | 'avisoRevisionEnInicio'>>) => void;
  /** Suelto en su propia tarjeta (Hoy › Revisión) en vez de como franja de
   *  cabecera de otra: sin la raya de abajo. */
  suelto?: boolean;
}

export default function DiaRevisionAtleta({ athlete, onCambio, suelto = false }: Props) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [dia, setDia] = useState(normalizarDiaRevision(athlete.diaRevision));
  const [pausa, setPausa] = useState(athlete.pausaRevisiones ?? null);
  const [editandoPausa, setEditandoPausa] = useState(false);
  const [borrador, setBorrador] = useState({ desde: '', hasta: '' });

  const [aviso, setAviso] = useState(!!athlete.avisoRevisionEnInicio);
  const guardar = async (cambios: Partial<Pick<UserProfile, 'diaRevision' | 'pausaRevisiones' | 'avisoRevisionEnInicio'>>, deshacer: () => void) => {
    try {
      await updateUserProfile(athlete.userId, cambios);
      onCambio?.(cambios);
      // Ahora se edita desde dos pestañas (Revisión y Revisiones) y la lista
      // de Clientes filtra por él: que todas lean el día nuevo, no el viejo.
      void queryClient.invalidateQueries({ queryKey: ['userProfiles'] });
    } catch (err) {
      deshacer();
      showToast(mensajeDeErrorFirestore(err, 'guardar el día de revisión'));
    }
  };

  const cambiarDia = (nuevo: number) => {
    const antes = dia;
    setDia(nuevo);
    void guardar({ diaRevision: nuevo }, () => setDia(antes));
  };

  const guardarPausa = () => {
    if (!borrador.desde || !borrador.hasta || borrador.hasta < borrador.desde) return;
    const antes = pausa;
    setPausa(borrador);
    setEditandoPausa(false);
    void guardar({ pausaRevisiones: borrador }, () => setPausa(antes));
  };

  const quitarPausa = () => {
    const antes = pausa;
    setPausa(null);
    // `deleteField` no hace falta: una pausa ya pasada no afecta, y vaciarla con
    // fechas vacías la anula igual (enPausa exige las dos).
    void guardar({ pausaRevisiones: { desde: '', hasta: '' } }, () => setPausa(antes));
  };

  const { apertura, caducidad } = diasDelCiclo(dia);
  const pausaActiva = pausa?.desde && pausa?.hasta ? pausa : null;
  const corta = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 px-5 py-2 text-caption text-ink-3 font-sans ${suelto ? '' : 'border-b border-hairline'}`}>
      <span className="inline-flex items-center gap-1.5">
        <Icon name="event" size="s" className="text-ink-4" />
        Revisa los
        <label className="relative inline-flex items-center">
          <span className="sr-only">Día de revisión</span>
          <select value={dia} onChange={e => cambiarDia(Number(e.target.value))} className={SELECT_CLS}>
            {[1, 2, 3, 4, 5, 6, 0].map(d => <option key={d} value={d}>{DIAS[d]}</option>)}
          </select>
        </label>
      </span>
      <span className="text-ink-4">se le abre el {DIAS[apertura]} · caduca el {DIAS[caducidad]}</span>
      {/* Aviso en su Inicio los dos primeros días de la ventana (30-10): apagado por defecto. */}
      <label className="inline-flex items-center gap-1.5 cursor-pointer text-ink-4 hover:text-ink">
        <input type="checkbox" checked={aviso} onChange={e => { const v = e.target.checked; setAviso(v); void guardar({ avisoRevisionEnInicio: v }, () => setAviso(!v)); }} className="accent-[var(--color-accent)]" />
        Avisarle en Inicio cuando se abre
      </label>

      <span className="ml-auto inline-flex items-center gap-2">
        {editandoPausa ? (
          <>
            <input type="date" aria-label="Pausa desde" value={borrador.desde} onChange={e => setBorrador(b => ({ ...b, desde: e.target.value }))} className={FECHA_CLS} />
            <span>→</span>
            <input type="date" aria-label="Pausa hasta" value={borrador.hasta} onChange={e => setBorrador(b => ({ ...b, hasta: e.target.value }))} className={FECHA_CLS} />
            <button type="button" onClick={guardarPausa} className="font-bold text-accent-ink hover:underline">Guardar</button>
            <button type="button" onClick={() => setEditandoPausa(false)} className="text-ink-4 hover:text-ink">Cancelar</button>
          </>
        ) : pausaActiva ? (
          <span className="inline-flex items-center gap-1.5 text-accent-ink">
            <Icon name="pause_circle" size="s" />
            En pausa {corta(pausaActiva.desde)} – {corta(pausaActiva.hasta)}
            <button type="button" onClick={quitarPausa} className="text-ink-4 hover:text-ink underline">quitar</button>
          </span>
        ) : (
          <button type="button" onClick={() => setEditandoPausa(true)} className="inline-flex items-center gap-1 text-ink-4 hover:text-ink">
            <Icon name="pause_circle" size="s" />
            Pausa
          </button>
        )}
      </span>
    </div>
  );
}
