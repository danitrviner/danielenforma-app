import React, { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AthleteDossier } from '../../types';
import { appendDossierFacts } from '../../db/dossier';
import { OPEN_AI_PANEL_EVENT, OpenAiPanelDetail } from '../../ai/events';
import { construirTitulares, TonoTitular } from '../../utils/titularesRevision';
import { RevisionDelAtleta } from '../../utils/revisionCoach';
import { ComidaDeLaSemana } from '../../utils/comidaDeLaSemana';
import { PesoVsSemanaPasada } from '../../utils/revisionCoach';
import { useToast } from '../../hooks/useToast';
import { HubTab } from '../ClientHub';
import { Button, Icon } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Bloque final — Qué le digo.

   Los ocho bloques de arriba son la prueba; este es la conclusión. Sale de un
   motor puro (`utils/titularesRevision.ts`) que ordena lo que hay que contar
   por lo que cambia una decisión: las alarmas primero, lo que va bien después,
   lo neutro al final. No dice nada que no esté medido —si falta el dato, no
   hay titular— porque un «sigue igual» de relleno es una afirmación disfrazada
   de silencio.

   Tres salidas, y ninguna manda nada sola:
     · Copiar el borrador — texto en segunda persona, para pegarlo y editarlo.
     · Convertir en reporte — abre Reportes, que es la pantalla que SÍ envía.
     · Pedírselo al asistente — precarga el chat con los titulares ya
       calculados, para que redacte encima de datos y no de su imaginación.

   Y una entrada: las notas de esta revisión, que se guardan como hecho del
   dosier. Ahí es donde vive la memoria del atleta —lo que se decidió y por
   qué—, y hasta ahora solo escribía el asistente. Lo que Dani piensa al mirar
   la pantalla es justo lo que falta para que la próxima revisión empiece con
   contexto en vez de desde cero.
   ═══════════════════════════════════════════════════════════════════════════ */

const ICONO_TONO: Record<TonoTitular, { icono: string; clase: string }> = {
  alarma: { icono: 'error', clase: 'text-danger' },
  bien: { icono: 'trending_up', clase: 'text-success' },
  neutro: { icono: 'remove', clase: 'text-ink-3' },
};

interface Props {
  athleteEmail: string;
  athleteName: string;
  revision: RevisionDelAtleta;
  comida: ComidaDeLaSemana | null;
  peso: PesoVsSemanaPasada | null;
  onGoToTab: (tab: HubTab) => void;
  /** En presentación se cae todo lo accionable: es una pantalla para mirar. */
  presentando?: boolean;
}

export default function BloqueCierre({
  athleteEmail, athleteName, revision, comida, peso, onGoToTab, presentando = false,
}: Props) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const { titulares, resumenParaCliente } = useMemo(
    () => construirTitulares({ revision, comida, peso, athleteName }),
    [revision, comida, peso, athleteName],
  );

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(resumenParaCliente);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sin permiso de portapapeles (o sin HTTPS): no se puede copiar por
      // nosotros, pero el texto está a la vista y se puede seleccionar.
      showToast('No se ha podido copiar. Selecciona el texto y cópialo a mano.', 'error');
    }
  };

  const pedirAlAsistente = () => {
    const lineas = titulares.map(t => `· ${t.texto}`).join('\n');
    window.dispatchEvent(new CustomEvent<OpenAiPanelDetail>(OPEN_AI_PANEL_EVENT, {
      detail: {
        prompt: `Redáctame el feedback de la revisión de ${athleteName} (${athleteEmail}) `
          + `para la ventana ${revision.ventana.etiqueta.toLowerCase()}. `
          + `Esto es lo que dicen los datos:\n${lineas}\n\n`
          + 'Escríbelo en segunda persona, con mi tono, sin inventar nada que no esté en esa lista.',
      },
    }));
  };

  const guardarNota = async () => {
    const texto = nota.trim();
    if (texto.length === 0) return;
    setGuardando(true);
    try {
      const ficha = await appendDossierFacts(athleteEmail, [{
        at: new Date().toISOString(),
        kind: 'observacion',
        // La ventana va DENTRO del texto: dentro de tres meses, «le veo
        // estancado» sin saber de qué semanas hablaba no vale para nada.
        text: `[Revisión ${revision.ventana.desde} → ${revision.ventana.hasta}] ${texto}`,
      }]);
      queryClient.setQueryData<AthleteDossier>(['dossier', athleteEmail], ficha);
      setNota('');
      showToast('Guardado en la ficha del atleta', 'success');
    } catch (err) {
      console.error('BloqueCierre: no se pudo guardar la nota', err);
      showToast('No se ha podido guardar la nota', 'error');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* ── Lo que hay que contar ────────────────────────────────────────── */}
      <ul className="space-y-1.5 list-none">
        {titulares.map(t => {
          const { icono, clase } = ICONO_TONO[t.tono];
          return (
            <li key={t.id} className="flex items-start gap-2">
              <Icon name={icono} size="s" className={`${clase} mt-0.5 shrink-0`} />
              <span className="font-sans text-body-s text-ink leading-relaxed">{t.texto}</span>
            </li>
          );
        })}
      </ul>

      {!presentando && (
        <>
          {/* ── El borrador ───────────────────────────────────────────────── */}
          <div className="bg-raised border border-hairline rounded-surface p-4 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="font-mono text-caption text-ink-3 uppercase tracking-[.08em]">
                Borrador para el cliente
              </span>
              {/* `flex-wrap`: los tres botones seguidos no caben en 375 px y
                  sacaban la pantalla entera a scroll horizontal. */}
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="ghost" onClick={copiar}>
                  <Icon name={copiado ? 'check' : 'content_copy'} size="s" />
                  {copiado ? 'Copiado' : 'Copiar'}
                </Button>
                <Button variant="ghost" onClick={() => onGoToTab('reportes')}>
                  Convertir en reporte
                </Button>
                <Button variant="ghost" onClick={pedirAlAsistente}>
                  <Icon name="auto_awesome" size="s" />
                  Que lo redacte el asistente
                </Button>
              </div>
            </div>
            <p className="font-sans text-label text-ink-2 whitespace-pre-line leading-relaxed">
              {resumenParaCliente}
            </p>
          </div>

          {/* ── Lo que piensa el coach ────────────────────────────────────── */}
          <div className="space-y-2">
            <label
              htmlFor="revision-nota-dosier"
              className="font-mono text-caption text-ink-3 uppercase tracking-[.08em] block"
            >
              Notas de esta revisión
            </label>
            <textarea
              id="revision-nota-dosier"
              value={nota}
              onChange={e => setNota(e.target.value)}
              rows={3}
              placeholder="Qué has decidido y por qué. Se guarda en la ficha con la fecha y la ventana, y lo lee el asistente la próxima vez."
              className="w-full bg-raised border border-hairline rounded-control px-3 py-2 font-sans text-label text-ink placeholder:text-ink-3 focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <div className="flex justify-end">
              <Button size="s" onClick={guardarNota} disabled={guardando || nota.trim().length === 0}>
                Guardar en la ficha
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
