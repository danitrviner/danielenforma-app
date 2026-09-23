import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { WorkoutLog } from '../../types';
import { getNutritionProgram, saveNutritionProgram } from '../../dbService';
import {
  faseEnCurso, cambiarObjetivo, corregirObjetivoDeFase, SEMANAS_FASE_NUEVA,
} from '../../utils/objetivoDeFase';
import { useAthleteWeight } from '../../hooks/useAthleteWeight';
import { useBodyMeasurements } from '../../hooks/useBodyMeasurements';
import { hoyIsoLocal } from '../../utils/trainingWeek';
import {
  ObjetivoCorporal, ObjetivoCorporalTipo, EstadoVerificacion, Senal, Verificacion,
  OBJETIVO_LABEL, OBJETIVOS_ORDEN, RANGO_PCT_SEMANA, FRANJA_MANTENIMIENTO_KG, VENTANA_TENDENCIA_SEMANAS,
  verificarObjetivo,
} from '../../utils/verificacionObjetivo';
import {
  Card, Chip, Badge, BadgeTone, Button, Input, Skeleton,
  ALTURA_GRAFICA, MARGEN_GRAFICA, ANCHO_EJE_Y, REJILLA_GRAFICA, TICK_GRAFICA, EJE_GRAFICA,
  TOOLTIP_GRAFICA,
} from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   ¿Va donde queríamos? — el objetivo corporal en una palabra

   Antes, ver si un atleta iba bien exigía montar una periodización entera
   (fases, dieta enlazada, kcal, peso objetivo, ritmo). Sin eso la gráfica no
   salía. Aquí basta con elegir el objetivo: la franja se calcula sola desde la
   media de la primera semana, y los pesos del atleta dicen si va dentro.
   ═══════════════════════════════════════════════════════════════════════════ */

const DESCRIPCION: Record<ObjetivoCorporalTipo, string> = {
  volumen: 'Subir peso despacio para ganar músculo con la mínima grasa.',
  deficit: 'Perder grasa a un ritmo sostenible.',
  deficit_acelerado: 'Perder grasa rápido, por tiempo limitado.',
  salida_deficit: 'Subir kcal poco a poco tras un déficit sin recuperar grasa.',
  mantenimiento: `Mantener el peso dentro de ±${FRANJA_MANTENIMIENTO_KG} kg.`,
  recomposicion: 'Peso estable, menos cintura y más fuerza.',
};

const ESTADO: Record<EstadoVerificacion, { tono: BadgeTone; texto: string }> = {
  'en-rango':   { tono: 'success', texto: 'En rango' },
  'lento':      { tono: 'warning', texto: 'Por debajo del ritmo' },
  'rapido':     { tono: 'warning', texto: 'Demasiado rápido' },
  'contrario':  { tono: 'danger',  texto: 'Dirección contraria' },
  'por-encima': { tono: 'warning', texto: 'Fuera de franja · arriba' },
  'por-debajo': { tono: 'warning', texto: 'Fuera de franja · abajo' },
  'parcial':    { tono: 'info',    texto: 'Faltan datos' },
  'sin-datos':  { tono: 'neutral', texto: 'Sin datos aún' },
};

function fmt(n: number, dec = 2, signo = false): string {
  const s = n.toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  return signo && n > 0 ? `+${s}` : s;
}

function fmtFecha(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

function textoRango(tipo: ObjetivoCorporalTipo, pesoRef: number | null): string {
  const r = RANGO_PCT_SEMANA[tipo];
  if (!r) {
    return pesoRef == null
      ? `±${FRANJA_MANTENIMIENTO_KG} kg sobre la media de la 1ª semana`
      : `${fmt(pesoRef - FRANJA_MANTENIMIENTO_KG, 1)}–${fmt(pesoRef + FRANJA_MANTENIMIENTO_KG, 1)} kg`;
  }
  // Se lee del ritmo suave al fuerte: «−0,40 a −0,60», no al revés.
  const [suave, fuerte] = Math.abs(r.min) <= Math.abs(r.max) ? [r.min, r.max] : [r.max, r.min];
  const pct = `${fmt(suave, 2, true)} a ${fmt(fuerte, 2, true)} %/sem`;
  if (pesoRef == null) return pct;
  const g = (p: number) => fmt(Math.round((p / 100) * pesoRef * 1000), 0, true);
  return `${pct} · ${g(suave)} a ${g(fuerte)} g/sem`;
}

function lecturaSenal(s: Senal): string {
  return s === 'ok' ? '✓' : s === 'mal' ? '✗' : '—';
}

function Explicacion({ v }: { v: Verificacion }) {
  if (v.estado === 'sin-datos') {
    return (
      <p className="font-sans text-label text-ink-2">
        Hacen falta pesos de al menos dos semanas distintas desde el inicio del objetivo.
        {v.semanasConDatos === 1 && ' Hay una: la próxima ya da veredicto.'}
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {v.ritmoPct != null && v.ritmoKg != null && (
        <p className="font-sans text-label text-ink-2">
          Ritmo actual (últimas {VENTANA_TENDENCIA_SEMANAS} semanas):{' '}
          <span className="font-mono text-ink">{fmt(v.ritmoPct, 2, true)} %/sem</span>{' '}
          <span className="font-mono text-ink-3">({fmt(v.ritmoKg * 1000, 0, true)} g/sem)</span>
          {v.ritmoMedioPct != null && (
            <>{' · '}media del objetivo <span className="font-mono text-ink">{fmt(v.ritmoMedioPct, 2, true)} %/sem</span></>
          )}
        </p>
      )}
      {v.pesoReferencia != null && v.pesoActual != null && (
        <p className="font-sans text-label text-ink-2">
          Media inicial <span className="font-mono text-ink">{fmt(v.pesoReferencia, 1)} kg</span>
          {' → '}última semana <span className="font-mono text-ink">{fmt(v.pesoActual, 1)} kg</span>
        </p>
      )}
      {v.tipo === 'recomposicion' && (
        <ul className="font-sans text-label text-ink-2 space-y-1">
          <li>
            {lecturaSenal(v.cintura!.senal)} Cintura{' '}
            {v.cintura!.cambioCm != null
              ? <span className="font-mono text-ink">{fmt(v.cintura!.cambioCm, 1, true)} cm</span>
              : <span className="text-ink-3">sin dos medidas desde el inicio</span>}
          </li>
          <li>
            {lecturaSenal(v.fuerza!.senal)} Fuerza (1RM est., mediana){' '}
            {v.fuerza!.cambioPct != null
              ? <span className="font-mono text-ink">{fmt(v.fuerza!.cambioPct, 1, true)} % · {v.fuerza!.ejercicios} ejercicios</span>
              : <span className="text-ink-3">sin el mismo ejercicio registrado al principio y al final del periodo</span>}
          </li>
        </ul>
      )}
      {v.ajusteKcal != null && (
        <p className="font-sans text-label text-ink">
          Orientativo: {v.ajusteKcal > 0 ? 'subir' : 'bajar'}{' '}
          <span className="font-mono">{Math.abs(v.ajusteKcal)} kcal/día</span> para volver al centro del rango.
        </p>
      )}
    </div>
  );
}

interface Props {
  athleteEmail: string;
  /** Solo para recomposición (tendencia de fuerza). ClientHub ya los tiene cargados. */
  logs: WorkoutLog[];
}

export default function VerificacionObjetivo({ athleteEmail, logs }: Props) {
  const queryClient = useQueryClient();
  const hoy = hoyIsoLocal();
  const programKey = ['nutritionProgram', athleteEmail];
  const { data: program = null, isPending } = useQuery({
    queryKey: programKey,
    queryFn: () => getNutritionProgram(athleteEmail),
  });
  const { logs: pesos } = useAthleteWeight(athleteEmail);
  const { all: medidas } = useBodyMeasurements(athleteEmail);
  const pesoKg = pesos.length ? pesos[pesos.length - 1].weight : null;

  const enCurso = faseEnCurso(program, hoy);
  const objetivo: ObjetivoCorporal | null = enCurso?.objetivo
    ? { tipo: enCurso.objetivo.tipo, desde: enCurso.desde }
    : null;

  const [editando, setEditando] = useState(false);
  const [tipoElegido, setTipoElegido] = useState<ObjetivoCorporalTipo>('deficit');
  const [desdeElegido, setDesdeElegido] = useState(hoy);

  const guardar = useMutation({
    mutationFn: async (modo: 'nuevo' | 'corregir') => {
      // Se relee el programa: el panel de periodización o la IA pueden haberlo
      // cambiado desde que se pintó esta tarjeta, y se guarda el documento entero.
      const actual = await getNutritionProgram(athleteEmail);
      const siguiente = modo === 'corregir' && actual && enCurso
        ? corregirObjetivoDeFase(actual, enCurso.idx, tipoElegido, pesoKg)
        : cambiarObjetivo({
            program: actual, athleteEmail, tipo: tipoElegido, pesoKg,
            // Sin programa, el coach puede fechar el inicio hacia atrás para
            // que cuenten los pesos que ya hay.
            hoy: actual ? hoy : desdeElegido,
          });
      await saveNutritionProgram(siguiente);
      return siguiente;
    },
    onSuccess: (siguiente) => {
      queryClient.setQueryData(programKey, siguiente);
      setEditando(false);
    },
  });

  const verificacion = useMemo(
    () => objetivo ? verificarObjetivo({ objetivo, pesos, hoy, medidas, entrenos: logs }) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [objetivo?.tipo, objetivo?.desde, pesos, hoy, medidas, logs],
  );

  if (isPending) return <Skeleton className="w-full h-40 rounded-surface" />;

  const abrirEditor = () => {
    setTipoElegido(objetivo?.tipo ?? 'deficit');
    setDesdeElegido(hoy);
    setEditando(true);
  };

  if (!objetivo || editando) {
    const vividas = enCurso ? Math.floor((Date.parse(hoy) - Date.parse(enCurso.desde)) / (7 * 86400000)) : 0;
    const titulo = !program ? 'Objetivo corporal' : enCurso ? 'Cambiar objetivo' : 'Nuevo objetivo';
    return (
      <Card
        title={titulo}
        subtitle={!program
          ? 'Elige uno y la verificación sale sola con los pesos del atleta.'
          : enCurso && !enCurso.objetivo
            ? `La fase «${enCurso.fase.name}» no tiene objetivo marcado.`
            : !enCurso ? 'La periodización ha terminado o aún no ha empezado.' : undefined}
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {OBJETIVOS_ORDEN.map(t => (
              <Chip key={t} selected={tipoElegido === t} onClick={() => setTipoElegido(t)}>
                {OBJETIVO_LABEL[t]}
              </Chip>
            ))}
          </div>
          <p className="font-sans text-label text-ink-2">
            {DESCRIPCION[tipoElegido]}{' '}
            <span className="font-mono text-ink">{textoRango(tipoElegido, pesoKg)}</span>
          </p>
          {!program && (
            <Input
              label="Desde"
              type="date"
              value={desdeElegido}
              onChange={setDesdeElegido}
              hint="Si empezó antes, pon esa fecha y los pesos ya registrados cuentan."
            />
          )}
          {program && enCurso && vividas > 0 && (
            <p className="font-sans text-label text-ink-2">
              «Empezar nuevo» cierra «{enCurso.fase.name}» con {vividas} {vividas === 1 ? 'semana' : 'semanas'} y
              abre una fase nueva de {SEMANAS_FASE_NUEVA} semanas (la duración se ajusta en Dietas).
              Las fases planificadas después se conservan y se desplazan.
              «Corregir» solo cambia la etiqueta de la fase actual.
            </p>
          )}
          <div className="flex flex-wrap gap-2 justify-end">
            {objetivo && (
              <Button variant="ghost" onClick={() => setEditando(false)}>Cancelar</Button>
            )}
            {program && enCurso && vividas > 0 && (
              <Button variant="secondary" loading={guardar.isPending && guardar.variables === 'corregir'}
                loadingLabel="Guardando" onClick={() => guardar.mutate('corregir')}>
                Corregir esta fase
              </Button>
            )}
            <Button
              variant="primary"
              loading={guardar.isPending && guardar.variables !== 'corregir'}
              loadingLabel="Guardando"
              disabled={!program && (!desdeElegido || desdeElegido > hoy)}
              onClick={() => guardar.mutate(program && enCurso && vividas === 0 ? 'corregir' : 'nuevo')}
            >
              {program && enCurso && vividas > 0 ? 'Empezar nuevo objetivo' : 'Guardar objetivo'}
            </Button>
          </div>
          {guardar.isError && (
            <p className="font-sans text-label text-danger">No se pudo guardar. Inténtalo otra vez.</p>
          )}
        </div>
      </Card>
    );
  }

  const v = verificacion!;
  const estado = ESTADO[v.estado];
  const datos = v.puntos.map(p => ({ ...p, etiqueta: fmtFecha(p.fecha) }));
  const valores = v.puntos.flatMap(p => [p.real, ...(p.franja ?? [])]).filter((n): n is number => n != null);
  const dominio: [number, number] | undefined = valores.length
    ? [Math.floor(Math.min(...valores) - 0.5), Math.ceil(Math.max(...valores) + 0.5)]
    : undefined;

  return (
    <Card
      title={`Objetivo: ${OBJETIVO_LABEL[objetivo.tipo]}`}
      subtitle={`«${enCurso!.fase.name}» · ${fmtFecha(objetivo.desde)} → ${fmtFecha(enCurso!.hasta)} · ${textoRango(objetivo.tipo, v.pesoReferencia)}`}
      action={<Button variant="ghost" size="s" onClick={abrirEditor}>Cambiar</Button>}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={estado.tono} dot>{estado.texto}</Badge>
          {enCurso!.objetivo!.deducido && (
            <button type="button" onClick={abrirEditor} className="font-sans text-caption text-ink-3 underline">
              Objetivo deducido de las kcal · confirmar
            </button>
          )}
        </div>

        {v.pesoReferencia != null && datos.length > 1 && (
          <div style={{ height: ALTURA_GRAFICA.m }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={datos} margin={MARGEN_GRAFICA}>
                <CartesianGrid {...REJILLA_GRAFICA} />
                <XAxis dataKey="etiqueta" tick={TICK_GRAFICA} {...EJE_GRAFICA} />
                <YAxis domain={dominio} width={ANCHO_EJE_Y} tick={TICK_GRAFICA} {...EJE_GRAFICA} />
                <Tooltip
                  {...TOOLTIP_GRAFICA}
                  formatter={(valor: unknown, nombre: unknown) => {
                    if (Array.isArray(valor)) return [`${fmt(valor[0], 1)}–${fmt(valor[1], 1)} kg`, 'Rango'];
                    return [typeof valor === 'number' ? `${fmt(valor, 1)} kg` : '—', String(nombre)];
                  }}
                />
                <Area
                  dataKey="franja" name="Rango" isAnimationActive={false}
                  stroke="none" fill="var(--color-success)" fillOpacity={0.15}
                />
                {/* La tendencia manda; las medias semanales van como puntos sueltos
                    para que se vea el ruido sin que decida nada. */}
                <Line
                  dataKey="tendencia" name="Tendencia" type="monotone" connectNulls isAnimationActive={false}
                  stroke="var(--color-accent)" strokeWidth={2.5} dot={false}
                />
                <Line
                  dataKey="real" name="Media semanal" isAnimationActive={false}
                  stroke="none" dot={{ r: 3, fill: 'var(--color-ink-3)', stroke: 'none' }} activeDot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}

        <Explicacion v={v} />
      </div>
    </Card>
  );
}
