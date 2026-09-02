/* Ficha viva del atleta.
 *
 * Lo que se perdía al revisar un plan de la IA: el porqué de cada decisión,
 * las preguntas que quedaron abiertas, los objetivos con las palabras del
 * atleta, y lo que Dani cambiaba a mano después de aprobar. Todo eso vivía en
 * un chat que se cierra.
 *
 * La ficha tiene dos mitades con reglas distintas, y la separación es
 * deliberada: arriba los JUICIOS (los edita Dani; la IA solo puede proponerlos
 * y él aprueba desde el panel del asistente), abajo los HECHOS (los apunta la
 * IA sola, y no se editan: es un registro, no un borrador).
 *
 * El mismo componente se monta en dos sitios: la pestaña Ficha del ClientHub,
 * que es donde Dani prepara la revisión, y un diálogo del panel del asistente,
 * que es donde la IA la usa.
 */
import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AthleteDossier, DossierPatch } from '../types';
import { getDossier, saveDossierJudgement, saveDossierNote, DOSSIER_VACIO } from '../db/dossier';
import { getAiProposalsForAthlete, getMesocycles, getDietsForAthlete } from '../dbService';
import { calcularDerivas } from '../utils/derivaPropuestas';
import { Button, Card, Icon } from './ui';

export const dossierKey = (email: string) => ['dossier', email] as const;

const CAMPOS: { clave: keyof DossierPatch; titulo: string; ayuda: string; filas: number }[] = [
  { clave: 'objetivos', titulo: 'Objetivos', ayuda: 'Los suyos, con sus palabras', filas: 3 },
  { clave: 'evaluacion', titulo: 'Dónde está hoy', ayuda: 'Fuerza, composición, adherencia, contexto', filas: 4 },
  { clave: 'esperado', titulo: 'Qué esperamos en las próximas semanas', ayuda: 'Con cifras, para poder contrastarlo', filas: 3 },
  { clave: 'foco', titulo: 'Foco de la siguiente revisión', ayuda: 'En qué te vas a fijar cuando vuelvas', filas: 2 },
];

const ETIQUETA_HECHO: Record<string, string> = {
  propuesta: 'Propuso', aprobacion: 'Aprobaste', cambio: 'Cambió', observacion: 'Anotó',
};

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

  const { data: ficha } = useQuery({
    queryKey: dossierKey(athleteEmail),
    queryFn: () => getDossier(athleteEmail),
    staleTime: 60_000,
  });

  const { data: derivas = [] } = useQuery({
    queryKey: ['dossierDerivas', athleteEmail],
    queryFn: async () => {
      const [propuestas, mesos, dietas] = await Promise.all([
        getAiProposalsForAthlete(athleteEmail), getMesocycles(athleteEmail), getDietsForAthlete(athleteEmail),
      ]);
      return calcularDerivas(propuestas, mesos, dietas);
    },
    staleTime: 60_000,
  });

  // Al cambiar de atleta o al llegar la ficha, se recarga el borrador — pero
  // nunca encima de algo que Dani esté escribiendo.
  useEffect(() => {
    if (!ficha || sucio) return;
    setBorrador(ficha);
    setPreguntas(ficha.preguntasAbiertas.join('\n'));
  }, [ficha, sucio]);

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
    } catch {
      setError('No se pudo guardar la ficha. Vuelve a intentarlo.');
    } finally {
      setGuardando(false);
    }
  };

  const hechos = [...(ficha?.hechos ?? [])].reverse();

  return (
    <div className="flex flex-col gap-4">
      <Card
        title="Ficha viva"
        subtitle={`Lo que hay que saber de ${athleteName || athleteEmail} sin releer el chat. La IA la lee antes de proponer nada.`}
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
          </label>

          {ficha?.updatedAt && !sucio && (
            <p className="text-caption text-ink-4">Actualizada el {ficha.updatedAt.slice(0, 10)}</p>
          )}
        </div>
      </Card>

      {derivas.length > 0 && (
        <Card title="Lo que cambiaste después de aprobar" subtitle="Comparado con lo que propuso la IA. Ella también lo lee.">
          <ul className="flex flex-col gap-3">
            {derivas.slice(0, 8).map(d => (
              <li key={d.proposalId} className="flex flex-col gap-1 border-l-2 border-accent-line pl-3">
                <span className="text-label text-ink">{d.que}</span>
                <span className="text-caption font-mono text-ink-2">{d.cambios.join(' · ')}</span>
                <span className="text-caption text-ink-4">{d.fecha.slice(0, 10)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Qué se ha hecho" subtitle="Lo apunta la IA sola. No se edita: es el registro.">
        {hechos.length === 0 ? (
          <p className="text-caption text-ink-3">Todavía no hay nada. Se llena solo en cuanto la IA proponga algo de este atleta.</p>
        ) : (
          <ul className="flex flex-col gap-2 max-h-80 overflow-y-auto">
            {hechos.slice(0, 40).map((h, i) => (
              <li key={`${h.at}-${i}`} className="flex gap-2 items-start">
                <Icon name="chevron_right" size="s" className="text-ink-4 mt-0.5 shrink-0" />
                <div className="flex flex-col">
                  <span className="text-caption text-ink-2">
                    <span className="text-ink-4 font-mono">{h.at.slice(0, 10)}</span>
                    {' · '}
                    <span className="text-ink-3">{ETIQUETA_HECHO[h.kind] ?? h.kind}</span>
                    {': '}
                    {h.text}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
