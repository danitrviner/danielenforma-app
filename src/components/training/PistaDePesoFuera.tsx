import { Icon } from '../ui';
import { pistaDePesoFuera } from '../../utils/sesionFuera';

/* La pista del peso en una sesión fuera de su gimnasio (17-11-2026). El peso
   llega vacío —los kilos de la última vez son de otras máquinas— y esta línea,
   discreta, le dice cómo elegirlo: con el rango y el RIR que ha pautado el
   coach. No es un consejo del coach (no va en la caja verde): es la regla del
   día. Ver utils/sesionFuera.ts. */

interface Props {
  /** Repeticiones pautadas de la primera serie («8-10»). */
  reps: string | undefined;
  /** RIR pautado de la primera serie, como lo ve el atleta ('0'-'5' o 'fallo'). */
  rir: string | number | undefined;
  /** En una pareja de series alternas, de qué ejercicio habla. */
  nombre?: string;
}

export default function PistaDePesoFuera({ reps, rir, nombre }: Props) {
  return (
    <p className="mx-4 mt-2 flex items-start gap-1.5 font-sans text-caption text-ink-2">
      <Icon name="route" size="s" className="mt-px flex-shrink-0 text-ink-3" />
      <span>{nombre ? `${nombre}: ` : ''}{pistaDePesoFuera(reps, rir)}</span>
    </p>
  );
}
