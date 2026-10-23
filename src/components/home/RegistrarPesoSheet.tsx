import React, { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BodyweightLog } from '../../types';
import { guardarPesoDelDia } from '../../dbService';
import { invalidarExtremosDePeso } from '../../hooks/useAthleteWeight';
import { useToast } from '../../hooks/useToast';
import { Button, Icon, Sheet } from '../ui';
import WeightWheelPicker from '../ui/WeightWheelPicker';

interface Props {
  open: boolean;
  onClose: () => void;
  athleteEmail: string;
  /** Pesajes recientes (cualquier orden). Sirven para el «último» y para saber si hoy ya hay uno. */
  logs: BodyweightLog[];
  hoy: string;
}

const coma = (n: number) => n.toFixed(1).replace('.', ',');

/**
 * Apuntar el peso de hoy sin salir de Inicio. Un solo registro por día: si ya
 * hay uno, la hoja abre con ese valor y guardar lo CORRIGE. El historial y el
 * borrado siguen en Perfil › Revisión.
 */
export default function RegistrarPesoSheet({ open, onClose, athleteEmail, logs, hoy }: Props) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const ordenados = React.useMemo(() => [...logs].sort((a, b) => a.date.localeCompare(b.date)), [logs]);
  const deHoy = ordenados.find(l => l.date === hoy);
  // «Último» = el más reciente que NO es de hoy: es lo que se compara.
  const anterior = [...ordenados].reverse().find(l => l.date < hoy);
  const inicial = deHoy?.weight ?? anterior?.weight ?? 70;
  const [peso, setPeso] = useState(inicial);
  const [guardando, setGuardando] = useState(false);

  // Cada vez que se abre, parte del valor que toca (no del que se dejó a medias).
  useEffect(() => { if (open) setPeso(inicial); }, [open, inicial]);

  const diferencia = anterior ? Math.round((peso - anterior.weight) * 10) / 10 : null;

  const guardar = async () => {
    if (guardando || !(peso > 0)) return;
    setGuardando(true);
    try {
      await guardarPesoDelDia(athleteEmail, hoy, peso, deHoy);
      await queryClient.invalidateQueries({ queryKey: ['bodyweightDesde', athleteEmail] });
      await queryClient.invalidateQueries({ queryKey: ['bodyweightForAthlete', athleteEmail] });
      invalidarExtremosDePeso(queryClient, athleteEmail);
      showToast(deHoy ? 'Peso de hoy corregido' : 'Peso de hoy guardado', 'success');
      onClose();
    } catch (err) {
      console.error(err);
      showToast('No se pudo guardar el peso. Inténtalo de nuevo.', 'error');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Peso de hoy"
      size="s"
      footer={
        <Button onClick={guardar} fullWidth size="l" disabled={guardando}>
          {guardando ? 'Guardando…' : deHoy ? 'Corregir peso' : 'Guardar peso'}
        </Button>
      }
    >
      <div className="space-y-4 pb-2">
        {anterior ? (
          <p className="flex items-center gap-2 font-sans text-body-s text-ink-2">
            <Icon name="history" size="s" />
            Último: <span className="font-mono font-bold text-ink">{coma(anterior.weight)} kg</span>
          </p>
        ) : (
          <p className="font-sans text-body-s text-ink-2">Es tu primer peso: el punto de partida.</p>
        )}
        <WeightWheelPicker value={peso} onChange={setPeso} />
        {diferencia !== null && diferencia !== 0 && (
          <p className="text-center font-mono text-body-s font-bold text-ink-2">
            {diferencia > 0 ? '+' : '−'}{coma(Math.abs(diferencia))} kg respecto al último
          </p>
        )}
        {deHoy && (
          <p className="font-sans text-label text-ink-3">
            Ya tienes un peso de hoy ({coma(deHoy.weight)} kg). Al guardar lo sustituyes: no se crea un segundo registro.
          </p>
        )}
      </div>
    </Sheet>
  );
}
