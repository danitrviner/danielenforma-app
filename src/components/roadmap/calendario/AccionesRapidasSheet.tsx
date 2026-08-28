import React, { useState } from 'react';
import { MesocycleTemplate, Diet, Questionnaire, NutritionProgram, NutritionPhaseType, WeekDay } from '../../../types';
import { finDePlantilla, FaseNueva, refeedDe } from '../../../utils/accionesCalendario';
import { addDays } from '../../../utils/trainingWeek';
import { Sheet, Button, Icon, Input, Select } from '../../ui';
import { mezcla } from './paleta';

const DIAS_LARGO = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const DIAS_CORTO = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const DIA_A_CLAVE: WeekDay[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function fechaCorta(f: string): string {
  const [, m, d] = f.split('-');
  return `${Number(d)} de ${MESES[Number(m) - 1]}`;
}

type Accion = 'bloque' | 'menu' | 'kcal' | 'recarga' | 'cuestionario' | 'aviso';

const ACCIONES: { id: Accion; icono: string; titulo: string; pie: string; color: string }[] = [
  { id: 'bloque', icono: 'library_add', titulo: 'Importar bloque de entrenamiento', pie: 'Una de tus plantillas, empezando este día', color: 'var(--color-phase-fuerza)' },
  { id: 'menu', icono: 'restaurant_menu', titulo: 'Programar un menú', pie: 'Uno de tus menús guardados, para este día de la semana', color: 'var(--color-success)' },
  { id: 'kcal', icono: 'swap_vert', titulo: 'Subida o bajada de calorías', pie: 'Mete una fase nueva en la periodización desde aquí', color: 'var(--color-phase-hiper)' },
  { id: 'recarga', icono: 'local_fire_department', titulo: 'Día de recarga', pie: 'Un refeed suelto, sin tocar la fase que hay', color: 'var(--color-refeed)' },
  { id: 'cuestionario', icono: 'assignment', titulo: 'Cuestionario suelto', pie: 'Uno solo, este día — sin plantilla de bloque', color: 'var(--color-cat-cardio)' },
  { id: 'aviso', icono: 'campaign', titulo: 'Nota y aviso al atleta', pie: 'Le sale en su Inicio ese día; puedes avisarle además', color: 'var(--color-accent)' },
];

export interface AccionesRapidasHandlers {
  onImportarBloque: (tpl: MesocycleTemplate, inicio: string) => Promise<void>;
  onProgramarMenu: (dietId: string, dia: WeekDay) => Promise<void>;
  onEventoNutricion: (fecha: string, fase: FaseNueva) => Promise<string>;
  onAsignarCuestionario: (questionnaireId: string, fecha: string) => Promise<void>;
  onAvisarConNota: (fecha: string, texto: string, avisar: boolean) => Promise<void>;
  onMarcarRecargas: (fechas: string[], activar: boolean, opciones: { dietId?: string; note?: string }) => Promise<void>;
}

interface Props extends AccionesRapidasHandlers {
  /** Día sobre el que se actúa. Con `rango`, es el día elegido dentro de él. */
  fecha: string;
  /** Semana completa cuando el hub se abre desde la rejilla del mes. */
  rango: { inicio: string; fin: string; etiqueta: string } | null;
  plantillas: MesocycleTemplate[];
  cargandoPlantillas: boolean;
  menus: Diet[];
  dietas: Diet[];
  questionnaires: Questionnaire[];
  nutritionProgram: NutritionProgram | null;
  onClose: () => void;
}

function Fila({ children }: { children: React.ReactNode }) {
  return <div className="bg-inset border border-hairline rounded-field p-4 space-y-3.5">{children}</div>;
}

function Vacio({ texto }: { texto: string }) {
  return <p className="text-label text-ink-4 font-sans py-1">{texto}</p>;
}

/**
 * Todo lo que el coach puede programar SIN salir del calendario. Es la
 * diferencia entre "el calendario te enseña el plan" y "el calendario es donde
 * haces el plan": las cinco acciones escriben de verdad (mesociclos, fases de
 * nutrición, asignaciones, notas), no navegan a otra pantalla.
 */
export default function AccionesRapidasSheet({
  fecha, rango, plantillas, cargandoPlantillas, menus, dietas, questionnaires, nutritionProgram,
  onImportarBloque, onProgramarMenu, onEventoNutricion, onAsignarCuestionario, onAvisarConNota,
  onMarcarRecargas, onClose,
}: Props) {
  const [abierta, setAbierta] = useState<Accion | null>(null);
  // Con alcance de semana, las acciones que necesitan un día concreto usan el
  // que elijas aquí; las que van por semana (importar bloque, evento de kcal)
  // lo ignoran y usan el lunes, que es la granularidad real del modelo.
  const [diaElegido, setDiaElegido] = useState<string>(rango ? rango.inicio : fecha);
  const [diasRecarga, setDiasRecarga] = useState<string[]>([]);
  const [notaRecarga, setNotaRecarga] = useState('');
  const [dietaRecarga, setDietaRecarga] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);

  const diaAccion = rango ? diaElegido : fecha;
  const diaSemana = new Date(diaAccion + 'T00:00:00').getDay();
  const inicioBloque = rango ? rango.inicio : fecha;
  const diasDelRango = rango ? Array.from({ length: 7 }, (_, i) => addDays(rango.inicio, i)) : [];

  // Formulario del evento de kcal
  const [kcalNombre, setKcalNombre] = useState('');
  const [kcalSemanas, setKcalSemanas] = useState('2');
  const [kcalObjetivo, setKcalObjetivo] = useState('');
  const [kcalTipo, setKcalTipo] = useState<NutritionPhaseType>('deficit');
  const [kcalDieta, setKcalDieta] = useState(dietas[0]?.id ?? '');

  // Formulario de la nota
  const [notaTexto, setNotaTexto] = useState('');
  const [notaAvisar, setNotaAvisar] = useState(true);

  async function ejecutar(fn: () => Promise<string>) {
    setOcupado(true); setError(null); setHecho(null);
    try { setHecho(await fn()); setAbierta(null); }
    catch { setError('No se ha podido guardar. Inténtalo otra vez.'); }
    finally { setOcupado(false); }
  }

  return (
    <Sheet
      open onClose={onClose}
      title={rango ? 'Programar esta semana' : 'Programar aquí'}
      size="l"
      label={rango ? `Acciones para la semana del ${rango.etiqueta}` : `Acciones para el ${fechaCorta(fecha)}`}
    >
      <div className="space-y-2.5">
        {rango ? (
          <>
            <p className="text-label text-ink-2 font-sans">
              Semana del <span className="text-white font-semibold">{fechaCorta(rango.inicio)}</span> al <span className="text-white font-semibold">{fechaCorta(rango.fin)}</span>.
              Importar un bloque y el evento de calorías empiezan el lunes; el resto va al día que elijas.
            </p>
            <div className="flex items-center gap-1.5 flex-wrap">
              {diasDelRango.map((f, i) => (
                <button
                  key={f} type="button" onClick={() => setDiaElegido(f)}
                  className="rounded-control font-mono text-label px-2.5 py-1.5 transition-colors"
                  style={{
                    background: diaElegido === f ? 'var(--color-track)' : 'transparent',
                    color: diaElegido === f ? 'var(--color-ink)' : 'var(--color-ink-3)',
                    border: `1px solid ${diaElegido === f ? 'var(--color-hairline)' : 'transparent'}`,
                  }}
                >
                  {DIAS_CORTO[i]} {Number(f.slice(8, 10))}
                </button>
              ))}
            </div>
          </>
        ) : (
          <p className="text-label text-ink-2 font-sans">
            Todo lo que elijas se aplica sobre el <span className="text-white font-semibold">{DIAS_LARGO[diaSemana]} {fechaCorta(fecha)}</span>.
          </p>
        )}

        {hecho && (
          <div className="flex items-start gap-2.5 rounded-field p-3.5" style={{ background: mezcla('var(--color-success)', 10), border: '1px solid ' + mezcla('var(--color-success)', 30) }}>
            <Icon name="check_circle" size="s" style={{ color: 'var(--color-success)', marginTop: 1 }} />
            <p className="text-label font-sans text-ink">{hecho}</p>
          </div>
        )}
        {error && <p className="text-label font-sans text-danger">{error}</p>}

        {ACCIONES.map(a => {
          const activa = abierta === a.id;
          return (
            <div key={a.id} className="bg-surface border border-hairline rounded-field overflow-hidden">
              <button
                type="button"
                onClick={() => { setAbierta(activa ? null : a.id); setError(null); }}
                className="w-full flex items-center gap-3.5 p-4 text-left hover:bg-inset transition-colors"
              >
                <span className="w-9 h-9 rounded-control flex items-center justify-center flex-shrink-0" style={{ background: mezcla(a.color, 12) }}>
                  <Icon name={a.icono} size="m" style={{ color: a.color }} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-sans font-bold text-body-s text-white">{a.titulo}</span>
                  <span className="block text-caption text-ink-3 font-sans mt-0.5">{a.pie}</span>
                </span>
                <Icon name={activa ? 'expand_less' : 'expand_more'} size="m" style={{ color: 'var(--color-ink-4)' }} />
              </button>

              {activa && (
                <div className="px-4 pb-4">
                  {a.id === 'bloque' && (
                    <Fila>
                      {cargandoPlantillas && <Vacio texto="Cargando tus plantillas…" />}
                      {!cargandoPlantillas && plantillas.length === 0 && <Vacio texto="No tienes plantillas de mesociclos guardadas todavía." />}
                      {plantillas.map(tpl => {
                        const semanas = tpl.stages.reduce((s, st) => s + st.weeks, 0);
                        return (
                          <div key={tpl.id} className="flex items-center gap-3 flex-wrap">
                            <div className="flex-1 min-w-0">
                              <p className="font-sans font-semibold text-body-s text-white truncate">{tpl.name}</p>
                              <p className="font-mono text-caption text-ink-3">
                                {tpl.stages.length} meso{tpl.stages.length !== 1 ? 's' : ''} · {semanas} semanas · hasta el {fechaCorta(finDePlantilla(tpl, inicioBloque))}
                              </p>
                            </div>
                            <Button
                              variant="secondary" size="s" loading={ocupado} icon="play_arrow"
                              onClick={() => ejecutar(async () => {
                                await onImportarBloque(tpl, inicioBloque);
                                return `«${tpl.name}» empieza el ${fechaCorta(inicioBloque)} — ${tpl.stages.length} mesociclo${tpl.stages.length !== 1 ? 's' : ''} creado${tpl.stages.length !== 1 ? 's' : ''}.`;
                              })}
                            >
                              Empezar aquí
                            </Button>
                          </div>
                        );
                      })}
                    </Fila>
                  )}

                  {a.id === 'menu' && (
                    <Fila>
                      <p className="text-caption text-ink-3 font-sans">
                        El plan de comidas del atleta va por día de la semana, no por fecha suelta: esto deja el menú
                        fijado para <span className="text-ink-2 font-semibold">todos los {DIAS_LARGO[diaSemana]}</span>.
                      </p>
                      {menus.length === 0 && <Vacio texto="No tienes menús guardados. Se crean con «Guardar como menú» en Nutrición." />}
                      {menus.map(m => (
                        <div key={m.id} className="flex items-center gap-3 flex-wrap">
                          <p className="flex-1 min-w-0 font-sans font-semibold text-body-s text-white truncate">{m.name}</p>
                          <Button
                            variant="secondary" size="s" loading={ocupado} icon="event_repeat"
                            onClick={() => ejecutar(async () => {
                              await onProgramarMenu(m.id, DIA_A_CLAVE[diaSemana]);
                              return `«${m.name}» queda programado los ${DIAS_LARGO[diaSemana]}.`;
                            })}
                          >
                            Programar
                          </Button>
                        </div>
                      ))}
                    </Fila>
                  )}

                  {a.id === 'kcal' && (
                    <Fila>
                      {!nutritionProgram && <Vacio texto="Este atleta no tiene periodización de nutrición todavía — créala primero en Road map › Fases." />}
                      {nutritionProgram && (
                        <>
                          <p className="text-caption text-ink-3 font-sans">
                            La fase nueva parte en dos la que hubiera ese día. Las fases van por semanas completas,
                            así que empezará el lunes de esa semana del programa.
                          </p>
                          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
                            <Input label="Nombre" value={kcalNombre} onChange={setKcalNombre} placeholder="Refeed, subida a mantenimiento…" />
                            <Input label="Semanas" value={kcalSemanas} onChange={setKcalSemanas} inputMode="numeric" />
                            <Input label="Kcal objetivo" value={kcalObjetivo} onChange={setKcalObjetivo} inputMode="numeric" placeholder="2800" />
                            <Select
                              label="Tipo" value={kcalTipo} onChange={v => setKcalTipo(v as NutritionPhaseType)}
                              options={[{ value: 'deficit', label: 'Déficit' }, { value: 'mantenimiento', label: 'Mantenimiento' }, { value: 'superavit', label: 'Superávit' }]}
                            />
                            <Select
                              label="Dieta" value={kcalDieta} onChange={setKcalDieta}
                              options={dietas.map(d => ({ value: d.id, label: d.name }))}
                              placeholder={dietas.length === 0 ? 'Sin dietas' : undefined}
                            />
                          </div>
                          <Button
                            loading={ocupado} icon="add" size="s"
                            disabled={!kcalNombre.trim() || !kcalDieta || !(Number(kcalSemanas) > 0)}
                            onClick={() => ejecutar(async () => {
                              const inicioReal = await onEventoNutricion(inicioBloque, {
                                name: kcalNombre.trim(), weeks: Number(kcalSemanas), dietId: kcalDieta,
                                phaseType: kcalTipo,
                                ...(Number(kcalObjetivo) > 0 ? { targetKcal: Number(kcalObjetivo) } : {}),
                              });
                              setKcalNombre(''); setKcalObjetivo('');
                              return `«${kcalNombre.trim()}» empieza el ${fechaCorta(inicioReal)} y dura ${kcalSemanas} semana${Number(kcalSemanas) === 1 ? '' : 's'}.`;
                            })}
                          >
                            Insertar en la periodización
                          </Button>
                        </>
                      )}
                    </Fila>
                  )}

                  {a.id === 'recarga' && (
                    <Fila>
                      {!nutritionProgram && <Vacio texto="Sin periodización de nutrición, una recarga no tiene contra qué contrastar — créala primero en Road map › Fases." />}
                      {nutritionProgram && (
                        <>
                          <p className="text-caption text-ink-3 font-sans">
                            Una recarga no parte la fase: la deja como está y marca ese día suelto. Si le pones dieta,
                            esa manda ese día por encima de su calendario semanal.
                          </p>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {(rango ? diasDelRango : [fecha]).map((f, i) => {
                              const yaEra = !!refeedDe(nutritionProgram, f);
                              const elegido = diasRecarga.includes(f);
                              return (
                                <button
                                  key={f} type="button"
                                  onClick={() => setDiasRecarga(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f])}
                                  title={yaEra ? 'Ya es día de recarga' : undefined}
                                  className="rounded-control font-mono text-label px-2.5 py-1.5 transition-colors"
                                  style={{
                                    background: elegido ? mezcla('var(--color-refeed)', 18) : 'transparent',
                                    color: elegido ? 'var(--color-refeed)' : (yaEra ? 'var(--color-refeed)' : 'var(--color-ink-3)'),
                                    border: `1px ${yaEra && !elegido ? 'dashed' : 'solid'} ${elegido ? 'var(--color-refeed)' : 'var(--color-hairline)'}`,
                                  }}
                                >
                                  {rango ? `${DIAS_CORTO[i]} ${Number(f.slice(8, 10))}` : fechaCorta(f)}
                                </button>
                              );
                            })}
                          </div>
                          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
                            <Input label="Qué le dices" value={notaRecarga} onChange={setNotaRecarga} placeholder="Sube 500 kcal de hidratos" />
                            <Select
                              label="Dieta de ese día (opcional)" value={dietaRecarga} onChange={setDietaRecarga}
                              options={dietas.map(d => ({ value: d.id, label: d.name }))}
                              placeholder="Mantener la suya"
                            />
                          </div>
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <Button
                              loading={ocupado} icon="local_fire_department" size="s" disabled={diasRecarga.length === 0}
                              onClick={() => ejecutar(async () => {
                                const n = diasRecarga.length;
                                await onMarcarRecargas(diasRecarga, true, { note: notaRecarga, dietId: dietaRecarga || undefined });
                                setDiasRecarga([]); setNotaRecarga('');
                                return `${n} día${n === 1 ? '' : 's'} de recarga marcado${n === 1 ? '' : 's'}.`;
                              })}
                            >
                              Marcar recarga
                            </Button>
                            {diasRecarga.some(f => refeedDe(nutritionProgram, f)) && (
                              <Button
                                variant="ghost" size="s" loading={ocupado}
                                onClick={() => ejecutar(async () => {
                                  const quitar = diasRecarga.filter(f => refeedDe(nutritionProgram, f));
                                  await onMarcarRecargas(quitar, false, {});
                                  setDiasRecarga([]);
                                  return `${quitar.length} recarga${quitar.length === 1 ? '' : 's'} quitada${quitar.length === 1 ? '' : 's'}.`;
                                })}
                              >
                                Quitar recarga
                              </Button>
                            )}
                          </div>
                        </>
                      )}
                    </Fila>
                  )}

                  {a.id === 'cuestionario' && (
                    <Fila>
                      {questionnaires.length === 0 && <Vacio texto="No tienes cuestionarios en tu biblioteca todavía." />}
                      {questionnaires.map(q => (
                        <div key={q.id} className="flex items-center gap-3 flex-wrap">
                          <p className="flex-1 min-w-0 font-sans font-semibold text-body-s text-white truncate">{q.title}</p>
                          <Button
                            variant="secondary" size="s" loading={ocupado} icon="event_available"
                            onClick={() => ejecutar(async () => {
                              await onAsignarCuestionario(q.id, diaAccion);
                              return `«${q.title}» le toca el ${fechaCorta(diaAccion)}.`;
                            })}
                          >
                            Asignar
                          </Button>
                        </div>
                      ))}
                    </Fila>
                  )}

                  {a.id === 'aviso' && (
                    <Fila>
                      <textarea
                        value={notaTexto}
                        onChange={e => setNotaTexto(e.target.value)}
                        rows={3}
                        placeholder="Hoy toca ir a por todas en el press. Si el hombro molesta, para."
                        className="w-full bg-cell border border-hairline rounded-field p-3 text-body-s font-sans text-ink resize-y"
                      />
                      <label className="flex items-center gap-2.5 text-label font-sans text-ink-2 cursor-pointer">
                        <input type="checkbox" checked={notaAvisar} onChange={e => setNotaAvisar(e.target.checked)} className="accent-[var(--color-accent)]" />
                        Avisarle además con una notificación
                      </label>
                      <Button
                        loading={ocupado} icon="send" size="s" disabled={!notaTexto.trim()}
                        onClick={() => ejecutar(async () => {
                          await onAvisarConNota(diaAccion, notaTexto.trim(), notaAvisar);
                          setNotaTexto('');
                          return notaAvisar
                            ? `Nota guardada para el ${fechaCorta(diaAccion)} y aviso enviado.`
                            : `Nota guardada para el ${fechaCorta(diaAccion)} — la verá en su Inicio ese día.`;
                        })}
                      >
                        {notaAvisar ? 'Guardar y avisar' : 'Guardar nota'}
                      </Button>
                    </Fila>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}
