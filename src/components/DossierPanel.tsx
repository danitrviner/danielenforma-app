/* Ficha viva del atleta.
 *
 * Lo que se perdía al revisar un plan propuesto: el porqué de cada decisión,
 * las preguntas que quedaron abiertas, los objetivos con las palabras del
 * atleta, y lo que Dani cambiaba a mano después de aprobar. Todo eso vivía en
 * un chat que se cierra.
 *
 * Este panel es la mitad de JUICIO de la ficha: la editas tú, y el asistente
 * solo puede PROPONER cambios que apruebas desde su panel. La mitad de HECHOS
 * (el registro de qué se propuso y qué hizo el atleta) vive ahora en
 * `HistorialFichaPanel`, fusionada con la actividad del atleta — antes eran dos
 * listas separadas en la misma pantalla que nunca se veían juntas.
 *
 * El mismo componente se monta en dos sitios: la pestaña Ficha del ClientHub,
 * que es donde Dani prepara la revisión, y un diálogo del panel del asistente,
 * que es donde se consulta mientras se trabaja.
 *
 * LA NOTA LIBRE. Había dos, en dos colecciones distintas y con el mismo
 * propósito: «Nota tuya» (aquí, `dossier.note`) y «Nota del coach»
 * (`athleteStatusNote`, en el bloque de estado). Se queda esta. La otra no se
 * migra en lote a propósito —eso serían escrituras masivas en producción—:
 * cuando esta está vacía y la vieja tiene texto, se precarga aquí y se guarda
 * en cuanto Dani guarde la ficha. Migración perezosa, atleta a atleta.
 */
import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AthleteDossier, DossierPatch } from '../types';
import { getDossier, saveDossierJudgement, saveDossierNote, DOSSIER_VACIO } from '../db/dossier';
import { getAthleteStatusNote } from '../db/coachSettings';
import { Button, Card, Icon } from './ui';

export const dossierKey = (email: string) => ['dossier', email] as const;

const CAMPOS: { clave: keyof DossierPatch; titulo: string; ayuda: string; filas: number }[] = [
  { clave: 'objetivos', titulo: 'Objetivos', ayuda: 'Los suyos, con sus palabras', filas: 3 },
  { clave: 'evaluacion', titulo: 'Dónde está hoy', ayuda: 'Fuerza, composición, adherencia, contexto', filas: 4 },
  { clave: 'esperado', titulo: 'Qué esperamos en las próximas semanas', ayuda: 'Con cifras, para poder contrastarlo', filas: 3 },
  { clave: 'foco', titulo: 'Foco de la siguiente revisión', ayuda: 'En qué te vas a fijar cuando vuelvas', filas: 2 },
];

type Props = {
  athleteEmail: string;
  athleteName?: string;
  /** Sin `@types/react` en el repo, TS no excluye la key por su cuenta (ver Chip). */
  key?: React.Key;
};

export default function DossierPanel({ athleteEmail, athleteName }: Props) {
  const queryClient = useQueryClient();
  const [borrador, setBorrador] = useState<AthleteDossier>(DOSSIER_VACIO);
  const [preguntas, setPreguntas] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sucio, setSucio] = useState(false);
  const [notaHeredada, setNotaHeredada] = useState(false);

  const { data: ficha } = useQuery({
    queryKey: dossierKey(athleteEmail),
    queryFn: () => getDossier(athleteEmail),
    staleTime: 60_000,
  });

  // La nota vieja del bloque de estado, solo para heredarla si esta está vacía.
  const { data: notaEstado = '' } = useQuery({
    queryKey: ['athleteStatusNote', athleteEmail],
    queryFn: () => getAthleteStatusNote(athleteEmail),
    staleTime: 60_000,
  });

  // Al cambiar de atleta o al llegar la ficha, se recarga el borrador — pero
  // nunca encima de algo que Dani esté escribiendo.
  useEffect(() => {
    if (!ficha || sucio) return;
    // `?? ''` porque las ramas de respaldo de getDossier leen de localStorage
    // sin pasar por `normalizar`: una entrada vieja puede no traer `note`.
    const vieja = (notaEstado ?? '').trim();
    const heredar = !(ficha.note ?? '').trim() && vieja.length > 0;
    setBorrador(heredar ? { ...ficha, note: vieja } : ficha);
    setPreguntas(ficha.preguntasAbiertas.join('\n'));
    setNotaHeredada(heredar);
    // Se marca sucio a posta: así aparece «Guardar» y la nota heredada no se
    // queda en pantalla dando la falsa impresión de estar ya guardada aquí.
    if (heredar) setSucio(true);
  }, [ficha, notaEstado, sucio]);

  const editar = (clave: keyof DossierPatch, valor: string) => {
    setSucio(true);
    setBorrador(b => ({ ...b, [clave]: valor }));
  };

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      const patch: DossierPatch = {
        objetivos: borrador.objetivos,
        evaluacion: borrador.evaluacion,
        esperado: borrador.esperado,
        foco: borrador.foco,
        preguntasAbiertas: preguntas.split('\n').map(l => l.trim()).filter(Boolean),
      };
      await saveDossierJudgement(athleteEmail, patch);
      await saveDossierNote(athleteEmail, borrador.note);
      await queryClient.invalidateQueries({ queryKey: dossierKey(athleteEmail) });
      setSucio(false);
      setNotaHeredada(false);
    } catch {
      setError('No se pudo guardar la ficha. Vuelve a intentarlo.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Card
      title="Ficha viva"
      subtitle={`Lo que hay que saber de ${athleteName || athleteEmail} sin releer el chat. El entrenador la lee antes de proponer nada.`}
      action={sucio ? (
        <Button size="s" variant="primary" onClick={guardar} disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </Button>
      ) : undefined}
    >
      <div className="flex flex-col gap-4">
        {error && <p className="text-caption text-danger">{error}</p>}

        {CAMPOS.map(campo => (
          <label key={campo.clave} className="flex flex-col gap-1">
            <span className="text-label text-ink">{campo.titulo}</span>
            <span className="text-caption text-ink-3">{campo.ayuda}</span>
            <textarea
              value={(borrador[campo.clave] as string) ?? ''}
              onChange={e => editar(campo.clave, e.target.value)}
              rows={campo.filas}
              className="w-full bg-field border border-hairline rounded-control p-3 text-label text-ink resize-y focus:border-accent-line focus:outline-none"
            />
          </label>
        ))}

        <label className="flex flex-col gap-1">
          <span className="text-label text-ink">Preguntas abiertas</span>
          <span className="text-caption text-ink-3">Una por línea. Lo que falta saber, y a quién preguntárselo.</span>
          <textarea
            value={preguntas}
            onChange={e => { setSucio(true); setPreguntas(e.target.value); }}
            rows={3}
            className="w-full bg-field border border-hairline rounded-control p-3 text-label text-ink resize-y focus:border-accent-line focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-label text-ink">Nota tuya</span>
          <span className="text-caption text-ink-3">Texto libre. Lo que no encaja en ningún campo.</span>
          <textarea
            value={borrador.note}
            onChange={e => { setSucio(true); setBorrador(b => ({ ...b, note: e.target.value })); }}
            rows={2}
            className="w-full bg-field border border-hairline rounded-control p-3 text-label text-ink resize-y focus:border-accent-line focus:outline-none"
          />
          {notaHeredada && (
            <span className="text-caption text-warning flex items-start gap-1">
              <Icon name="info" size="s" className="mt-0.5 shrink-0" />
              Esta nota estaba en «Nota del coach», que era la misma cosa en otro sitio. Guarda la ficha para dejarla aquí.
            </span>
          )}
        </label>

        {ficha?.updatedAt && !sucio && (
          <p className="text-caption text-ink-4">Actualizada el {ficha.updatedAt.slice(0, 10)}</p>
        )}
      </div>
    </Card>
  );
}
