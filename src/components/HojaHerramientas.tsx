import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAcademyAccess } from '../dbService';
import { useRevisionDeLaSemana } from '../hooks/useRevisionDeLaSemana';
import type { AjustesRevision } from '../utils/cicloRevision';
import { Icon, Sheet } from './ui';

type Destino = 'academy' | 'cardio' | 'checkin';

interface Props {
  open: boolean;
  onClose: () => void;
  athleteEmail: string;
  /** Día de revisión y pausa del atleta (su perfil). */
  ajustesRevision?: AjustesRevision;
  onGo: (destino: Destino) => void;
}

interface Fila {
  id: Destino;
  titulo: string;
  descripcion: string;
  icono: string;
  tono: string;
  deshabilitada?: boolean;
}

/**
 * Lo que abre el «+» de la barra inferior: herramientas que complementan las
 * secciones principales (Hoy, Rutinas, Nutrición, Perfil), no otra pantalla de
 * Inicio. Una hoja inferior con tres filas grandes, un toque para elegir.
 *
 * Orden: Training Lab, Cardio, Check-ins. Cardio no va el primero: la regla del
 * módulo es que nunca aparece por delante del entreno de fuerza.
 */
export default function HojaHerramientas({ open, onClose, athleteEmail, ajustesRevision, onGo }: Props) {
  // Misma clave que AcademyScreen: una sola lectura. Mientras carga se trata
  // como disponible; si el entrenador no ha dado acceso, la fila se atenúa.
  const { data: acceso, isPending } = useQuery({
    queryKey: ['academyAccess', athleteEmail],
    queryFn: () => getAcademyAccess(athleteEmail),
    enabled: open,
  });
  const sinTrainingLab = !isPending && !acceso?.enabled;
  // Al abrir la hoja se cargan los datos de la revisión (si no estaban ya): así
  // la fila dice cuántos pasos faltan y el «+» de la barra se pone al día.
  const { faltan } = useRevisionDeLaSemana(athleteEmail, open, ajustesRevision);

  const filas: Fila[] = [
    {
      id: 'academy', titulo: 'Training Lab',
      descripcion: sinTrainingLab ? 'Tu entrenador aún no te ha dado acceso' : 'Cursos y lecciones de tu entrenador',
      icono: 'school', tono: 'bg-accent-bg text-accent-ink', deshabilitada: sinTrainingLab,
    },
    { id: 'cardio', titulo: 'Cardio', descripcion: 'Sesión libre o la pautada de hoy', icono: 'monitor_heart', tono: 'bg-raised text-data' },
    {
      id: 'checkin', titulo: 'Check-ins',
      descripcion: faltan ? `Te ${faltan === 1 ? 'queda 1 paso' : `quedan ${faltan} pasos`} de la revisión` : 'Peso, cuestionarios y fotos de la semana',
      icono: 'assignment', tono: 'bg-raised text-accent-ink',
    },
  ];

  return (
    <Sheet open={open} onClose={onClose} title="Herramientas" size="s">
      <ul className="space-y-2.5 pb-3">
        {filas.map(f => (
          <li key={f.id}>
            <button
              type="button"
              disabled={f.deshabilitada}
              onClick={() => { onClose(); onGo(f.id); }}
              className="flex w-full items-center gap-3.5 rounded-surface border border-hairline bg-surface p-3.5 text-left transition-colors duration-(--duration-state) hover:border-strong disabled:opacity-55 disabled:hover:border-hairline"
            >
              <span className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-control ${f.tono}`}>
                <Icon name={f.icono} size="l" filled />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-sans text-title-s font-bold text-ink">{f.titulo}</span>
                <span className="block font-sans text-body-s text-ink-2">{f.descripcion}</span>
              </span>
              {!f.deshabilitada && <Icon name="chevron_right" size="m" className="text-ink-3" />}
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
