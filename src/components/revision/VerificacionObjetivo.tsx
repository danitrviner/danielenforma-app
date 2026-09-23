import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { AthleteNutritionConfig, WorkoutLog } from '../../types';
import { getAthleteNutritionConfig, saveAthleteNutritionConfig } from '../../dbService';
import { useAthleteWeight } from '../../hooks/useAthleteWeight';
import { useBodyMeasurements } from '../../hooks/useBodyMeasurements';
import { hoyIsoLocal } from '../../utils/trainingWeek';
import {
  ObjetivoCorporal, ObjetivoCorporalTipo, EstadoVerificacion, Senal, Verificacion,
  OBJETIVO_LABEL, OBJETIVOS_ORDEN, RANGO_PCT_SEMANA, FRANJA_MANTENIMIENTO_KG, verificarObjetivo,
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
  const pct = `${fmt(r.min, 2, true)} a ${fmt(r.max, 2, true)} %/sem`;
  if (pesoRef == null) return pct;
  const g = (p: number) => Math.round((p / 100) * pesoRef * 1000);
  return `${pct} · ${g(r.min) > 0 ? '+' : ''}${g(r.min)} a ${g(r.max) > 0 ? '+' : ''}${g(r.max)} g/sem`;
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
          Ritmo real:{' '}
          <span className="font-mono text-ink">{fmt(v.ritmoPct, 2, true)} %/sem</span>{' '}
          <span className="font-mono text-ink-3">({fmt(v.ritmoKg * 1000, 0, true)} g/sem)</span>
          {' · '}{v.semanasConDatos} semanas con pesos
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
              : <span className="text-ink-3">hacen falta 2 semanas de entrenos</span>}
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
  const configKey = ['athleteNutritionConfig', athleteEmail];
  const { data: config, isPending } = useQuery({
    queryKey: configKey,
    queryFn: () => getAthleteNutritionConfig(athleteEmail).catch(() => null),
  });
  const { logs: pesos } = useAthleteWeight(athleteEmail);
  const { all: medidas } = useBodyMeasurements(athleteEmail);

  const objetivo = config?.objetivoCorporal ?? null;
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState<ObjetivoCorporal | null>(null);

  const guardar = useMutation({
    mutationFn: async (nuevo: ObjetivoCorporal) => {
      // Se relee el documento para no pisar lo que otra pantalla haya guardado
      // (pasos, variedad de menú…) desde que se cargó este.
      const actual = await getAthleteNutritionConfig(athleteEmail);
      const siguiente: AthleteNutritionConfig = { ...actual, objetivoCorporal: nuevo };
      await saveAthleteNutritionConfig(siguiente);
      return siguiente;
    },
    onSuccess: (siguiente) => {
      queryClient.setQueryData(configKey, siguiente);
      setEditando(false);
      setBorrador(null);
    },
  });

  const verificacion = useMemo(
    () => objetivo ? verificarObjetivo({ objetivo, pesos, hoy, medidas, entrenos: logs }) : null,
    [objetivo, pesos, hoy, medidas, logs],
  );

  if (isPending) return <Skeleton className="w-full h-40 rounded-surface" />;

  const abrirEditor = () => {
    setBorrador(objetivo ?? { tipo: 'deficit', desde: hoy });
    setEditando(true);
  };

  if (!objetivo || editando) {
    const b = borrador ?? { tipo: 'deficit' as ObjetivoCorporalTipo, desde: hoy };
    return (
      <Card title="Objetivo corporal" subtitle="Elige uno y la verificación sale sola con los pesos del atleta.">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {OBJETIVOS_ORDEN.map(t => (
              <Chip key={t} selected={b.tipo === t} onClick={() => setBorrador({ ...b, tipo: t })}>
                {OBJETIVO_LABEL[t]}
              </Chip>
            ))}
          </div>
          <p className="font-sans text-label text-ink-2">
            {DESCRIPCION[b.tipo]}{' '}
            <span className="font-mono text-ink">{textoRango(b.tipo, null)}</span>
          </p>
          <Input
            label="Desde"
            type="date"
            value={b.desde}
            onChange={desde => setBorrador({ ...b, desde })}
            hint="Si empezó antes, pon esa fecha y los pesos ya registrados cuentan."
          />
          <div className="flex gap-2 justify-end">
            {objetivo && (
              <Button variant="ghost" onClick={() => { setEditando(false); setBorrador(null); }}>
                Cancelar
              </Button>
            )}
            <Button
              variant="primary"
              loading={guardar.isPending}
              loadingLabel="Guardando"
              disabled={!b.desde || b.desde > hoy}
              onClick={() => guardar.mutate(b)}
            >
              Guardar objetivo
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
      subtitle={`Desde ${fmtFecha(objetivo.desde)} · ${textoRango(objetivo.tipo, v.pesoReferencia)}`}
      action={<Button variant="ghost" size="s" onClick={abrirEditor}>Cambiar</Button>}
    >
      <div className="space-y-4">
        <Badge tone={estado.tono} dot>{estado.texto}</Badge>

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
                <Line
                  dataKey="real" name="Media semanal" type="monotone" connectNulls isAnimationActive={false}
                  stroke="var(--color-accent)" strokeWidth={2} dot={{ r: 3, fill: 'var(--color-accent)' }}
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
