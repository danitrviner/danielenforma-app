import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Mesocycle, Questionnaire } from '../../../types';
import {
  PLANTILLAS, PlantillaCuestionarios, expandirPlantilla, planificarAsignaciones, rangoDelBloque,
} from '../../../utils/plantillasCuestionarios';
import { QUESTIONNAIRE_PRESETS, buildQuestionnaireFromPreset } from '../../../data/questionnairePresets';
import { createQuestionnaire, assignQuestionnaire } from '../../../dbService';
import { useToast } from '../../../hooks/useToast';
import { mensajeDeErrorFirestore } from '../../../utils/erroresFirestore';
import { Icon, Button } from '../../ui';

const MESES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function fmt(fecha: string): string {
  const [, m, d] = fecha.split('-');
  return `${Number(d)} ${MESES_CORTO[Number(m) - 1]}`;
}

interface Props {
  mesocycle: Mesocycle;
  questionnaires: Questionnaire[];
  athleteEmail: string;
  coachId: string;
  onApply: (ocurrencias: { titulo: string; fecha: string }[]) => void | Promise<void>;
  onClose: () => void;
}

export default function ModalPlantillaCuestionarios({ mesocycle, questionnaires, athleteEmail, coachId, onApply, onClose }: Props) {
  const [tpl, setTpl] = useState<PlantillaCuestionarios>(PLANTILLAS[0]);
  const [aplicando, setAplicando] = useState(false);
  const { showToast } = useToast();

  const { inicio, fin } = rangoDelBloque(mesocycle);
  const ocurrencias = expandirPlantilla(tpl, inicio, fin);
  const total = ocurrencias.length;

  async function handleAplicar() {
    setAplicando(true);
    try {
      // 1 · Resolver título → id real, creando desde el preset lo que falte en
      // la biblioteca del coach — nunca se inventa un cuestionario nuevo.
      const titulosAIds = new Map<string, string>();
      const titulosNecesarios = new Set<string>(tpl.filas.filter(f => f.schedule.kind !== 'evento').map(f => f.cuestionarioTitulo));
      for (const titulo of titulosNecesarios) {
        const existente = questionnaires.find(q => q.title === titulo);
        if (existente) { titulosAIds.set(titulo, existente.id); continue; }
        const preset = QUESTIONNAIRE_PRESETS.find(p => p.title === titulo);
        if (!preset) continue; // no debería pasar: toda fila expresable apunta a un título real o a un preset
        const nuevo = await createQuestionnaire(buildQuestionnaireFromPreset(preset, coachId));
        titulosAIds.set(titulo, nuevo.id);
      }

      // 2 · Crear las asignaciones reales (una por fila, recurrentes de verdad).
      const planificadas = planificarAsignaciones(tpl, inicio, titulosAIds);
      for (const p of planificadas) {
        await assignQuestionnaire({ questionnaireId: p.questionnaireId, athleteId: athleteEmail, schedule: p.schedule, startDate: p.startDate, active: true, createdAt: new Date().toISOString() });
      }

      // 3 · Avisar al padre con la expansión COMPLETA (una entrada por fecha
      // real) para que cada ocurrencia aparezca como hito en la rejilla.
      await onApply(ocurrencias.map(o => ({ titulo: o.fila.etiqueta, fecha: o.fecha })));
      onClose();
    } catch (err) {
      // Sin esto, un permiso denegado o un hipo de red dejaba el botón
      // cargando para siempre y el coach sin saber que no se creó nada.
      showToast(mensajeDeErrorFirestore(err, 'aplicar la plantilla'));
    } finally {
      setAplicando(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-modal flex items-center justify-center p-10" style={{ background: 'rgba(0,0,0,0.62)' }}>
      <div className="absolute inset-0" onClick={onClose} />
      <div
        className="relative bg-surface border border-hairline rounded-canvas overflow-y-auto"
        style={{ width: 1020, maxWidth: '100%', maxHeight: '88vh', boxShadow: '0 40px 100px -30px rgba(0,0,0,0.9)' }}
      >
        <div className="flex items-start justify-between gap-5 px-7 pt-6 pb-5 border-b border-hairline">
          <div className="flex flex-col gap-1.5">
            <p className="font-sans font-extrabold text-title-l text-white" style={{ letterSpacing: '-0.02em' }}>Plantilla de cuestionarios del mesociclo</p>
            <p className="text-[13.5px] text-ink-2 font-sans leading-relaxed" style={{ maxWidth: 640, textWrap: 'pretty' }}>
              Se aplica de golpe a todo el bloque: cada cuestionario se coloca en su fecha real y crea la asignación en Firestore.
              Después puedes mover o borrar cualquiera desde el calendario.
            </p>
          </div>
          <button type="button" onClick={onClose} className="w-9 h-9 rounded-control bg-inset flex items-center justify-center text-ink-2 hover:text-white flex-shrink-0">
            <Icon name="close" size="m" />
          </button>
        </div>

        <div className="px-7 pt-5 flex items-center gap-2 flex-wrap">
          <span className="font-mono text-caption uppercase tracking-wider text-ink-4 mr-1.5">Plantilla</span>
          {PLANTILLAS.map(p => (
            <button
              key={p.clave} type="button" onClick={() => setTpl(p)}
              className="rounded-control text-[12.5px] font-sans"
              style={{
                padding: '7px 13px',
                background: tpl.clave === p.clave ? 'rgba(255,199,44,0.12)' : 'transparent',
                color: tpl.clave === p.clave ? 'var(--color-accent)' : 'var(--color-ink-2)',
                fontWeight: tpl.clave === p.clave ? 600 : 400,
                border: `1px solid ${tpl.clave === p.clave ? 'rgba(255,199,44,0.35)' : 'var(--color-hairline)'}`,
              }}
            >
              {p.clave}
            </button>
          ))}
        </div>

        <div className="px-7 pt-4.5">
          <div className="grid gap-3 px-3.5 pb-2.5 font-mono text-caption uppercase tracking-wider text-ink-4" style={{ gridTemplateColumns: '1.5fr 1.6fr 0.5fr 1.2fr 0.9fr' }}>
            <div>Cuestionario</div><div>Cuándo</div><div>Veces</div><div>Canal</div><div>Tipo</div>
          </div>
          <div className="flex flex-col gap-1.5">
            {tpl.filas.map(f => {
              const vecesReales = ocurrencias.filter(o => o.fila === f).length;
              const esEvento = f.schedule.kind === 'evento';
              return (
                <div key={f.etiqueta} className="grid gap-3 items-center bg-inset border border-hairline rounded-field px-3.5 py-3" style={{ gridTemplateColumns: '1.5fr 1.6fr 0.5fr 1.2fr 0.9fr' }}>
                  <div className="text-[13.5px] font-semibold text-white font-sans">{f.etiqueta}</div>
                  <div className="text-[12.5px] text-ink-2 font-sans">{f.cuando}</div>
                  <div className="font-mono text-label text-ink-2">{esEvento ? '—' : `×${vecesReales}`}</div>
                  <div className="text-[12.5px] text-ink-3 font-sans">{f.canal}</div>
                  <span
                    className="font-mono text-caption uppercase tracking-wider px-2.5 py-1 rounded-control justify-self-start"
                    style={{ color: f.tipo === 'Obligatorio' ? 'var(--color-accent)' : 'var(--color-ink-3)', background: f.tipo === 'Obligatorio' ? 'rgba(255,199,44,0.10)' : 'var(--color-cell)' }}
                  >
                    {f.tipo}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="px-7 pt-5.5">
          <p className="font-mono text-caption uppercase tracking-wider text-ink-4 mb-3">Excepciones</p>
          <div className="flex flex-col gap-2.5">
            {tpl.excepciones.map(e => (
              <div key={e} className="flex items-start gap-2.5 text-body-s text-ink-2 font-sans leading-relaxed">
                <Icon name="rule" size="s" style={{ color: 'var(--color-ink-4)', marginTop: 1, flexShrink: 0 }} />{e}
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-5 mt-6 px-7 py-4.5 border-t border-hairline bg-surface sticky bottom-0">
          <div className="flex items-center gap-2 text-label text-ink-2 font-sans">
            <Icon name="event_available" size="s" style={{ color: 'var(--color-success)' }} />
            Se crearán {total} cuestionarios entre el {fmt(inicio)} y el {fmt(fin)}
          </div>
          <div className="flex items-center gap-2.5">
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleAplicar} loading={aplicando} icon="playlist_add_check">Aplicar al bloque</Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
