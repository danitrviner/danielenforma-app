import React, { useState } from 'react';
import { Mesocycle, Questionnaire } from '../../../types';
import {
  PLANTILLAS, PlantillaCuestionarios, expandirPlantilla, planificarAsignaciones, rangoDelBloque,
} from '../../../utils/plantillasCuestionarios';
import { QUESTIONNAIRE_PRESETS, buildQuestionnaireFromPreset } from '../../../data/questionnairePresets';
import { createQuestionnaire, assignQuestionnairesBatch } from '../../../dbService';
import { useToast } from '../../../hooks/useToast';
import { mensajeDeErrorFirestore } from '../../../utils/erroresFirestore';
import { Icon, Button, Dialog } from '../../ui';

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
      //     En UN lote: era un `for` con un `await` dentro, y un fallo a mitad
      //     dejaba media plantilla puesta. El coach volvía a darle a «Aplicar
      //     al bloque» y duplicaba la mitad que sí había entrado.
      const planificadas = planificarAsignaciones(tpl, inicio, titulosAIds);
      await assignQuestionnairesBatch(planificadas.map(p => ({
        questionnaireId: p.questionnaireId, athleteId: athleteEmail, schedule: p.schedule,
        startDate: p.startDate, active: true, createdAt: new Date().toISOString(),
      })));

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

  /* Era un modal a mano: `createPortal` propio, un fondo con su opacidad
     inventada, su botón de cerrar y un ancho fijo de 1.020 px. Con eso se
     perdían tres cosas que el `Dialog` del DS ya trae y que aquí no estaban:
     Escape para cerrar, la trampa de foco (con el tabulador se salía del modal
     a la pantalla de debajo) y el botón Atrás de Android, que en vez de cerrar
     el modal navegaba fuera del calendario. Y los 1.020 px fijos no cabían en
     una pantalla de portátil. */
  return (
    <Dialog
      open
      onClose={onClose}
      size="xl"
      title="Plantilla de cuestionarios del mesociclo"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 text-label text-ink-2 font-sans">
            <Icon name="event_available" size="s" style={{ color: 'var(--color-success)' }} />
            Se crearán {total} cuestionarios entre el {fmt(inicio)} y el {fmt(fin)}
          </div>
          <div className="flex items-center gap-2.5">
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleAplicar} loading={aplicando} icon="playlist_add_check">Aplicar al bloque</Button>
          </div>
        </div>
      }
    >
      <div>
        <p className="text-body-s text-ink-2 font-sans leading-relaxed">
          Se aplica de golpe a todo el bloque: cada cuestionario se coloca en su fecha real y crea la asignación en Firestore.
          Después puedes mover o borrar cualquiera desde el calendario.
        </p>

        <div className="pt-5 flex items-center gap-2 flex-wrap">
          <span className="font-mono text-caption uppercase tracking-wider text-ink-4 mr-1.5">Plantilla</span>
          {PLANTILLAS.map(p => (
            <button
              key={p.clave} type="button" onClick={() => setTpl(p)}
              className="rounded-control text-[12.5px] font-sans"
              style={{
                padding: '7px 13px',
                background: tpl.clave === p.clave ? 'color-mix(in oklab, var(--color-accent) 12%, transparent)' : 'transparent',
                color: tpl.clave === p.clave ? 'var(--color-accent)' : 'var(--color-ink-2)',
                fontWeight: tpl.clave === p.clave ? 600 : 400,
                border: `1px solid ${tpl.clave === p.clave ? 'color-mix(in oklab, var(--color-accent) 35%, transparent)' : 'var(--color-hairline)'}`,
              }}
            >
              {p.clave}
            </button>
          ))}
        </div>

        {/* La rejilla tiene cinco columnas con proporciones fijas: por debajo de
            unos 520 px las celdas se comen las palabras. En vez de recolocarlas
            a una tarjeta por fila —que aquí no aporta, porque lo que se lee es
            la TABLA entera de un vistazo— se le da su propio scroll lateral. */}
        <div className="pt-4.5 -mx-4 overflow-x-auto px-4">
          <div className="grid gap-3 px-3.5 pb-2.5 min-w-[520px] font-mono text-caption uppercase tracking-wider text-ink-4" style={{ gridTemplateColumns: '1.5fr 1.6fr 0.5fr 1.2fr 0.9fr' }}>
            <div>Cuestionario</div><div>Cuándo</div><div>Veces</div><div>Canal</div><div>Tipo</div>
          </div>
          <div className="flex flex-col gap-1.5 min-w-[520px]">
            {tpl.filas.map(f => {
              const vecesReales = ocurrencias.filter(o => o.fila === f).length;
              const esEvento = f.schedule.kind === 'evento';
              return (
                <div key={f.etiqueta} className="grid gap-3 items-center bg-inset border border-hairline rounded-field px-3.5 py-3 min-w-[520px]" style={{ gridTemplateColumns: '1.5fr 1.6fr 0.5fr 1.2fr 0.9fr' }}>
                  <div className="text-[13.5px] font-semibold text-ink font-sans">{f.etiqueta}</div>
                  <div className="text-[12.5px] text-ink-2 font-sans">{f.cuando}</div>
                  <div className="font-mono text-label text-ink-2">{esEvento ? '—' : `×${vecesReales}`}</div>
                  <div className="text-[12.5px] text-ink-3 font-sans">{f.canal}</div>
                  <span
                    className="font-mono text-caption uppercase tracking-wider px-2.5 py-1 rounded-control justify-self-start"
                    style={{ color: f.tipo === 'Obligatorio' ? 'var(--color-accent)' : 'var(--color-ink-3)', background: f.tipo === 'Obligatorio' ? 'color-mix(in oklab, var(--color-accent) 10%, transparent)' : 'var(--color-cell)' }}
                  >
                    {f.tipo}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="pt-5.5">
          <p className="font-mono text-caption uppercase tracking-wider text-ink-4 mb-3">Excepciones</p>
          <div className="flex flex-col gap-2.5">
            {tpl.excepciones.map(e => (
              <div key={e} className="flex items-start gap-2.5 text-body-s text-ink-2 font-sans leading-relaxed">
                <Icon name="rule" size="s" style={{ color: 'var(--color-ink-4)', marginTop: 1, flexShrink: 0 }} />{e}
              </div>
            ))}
          </div>
        </div>

      </div>
    </Dialog>
  );
}
