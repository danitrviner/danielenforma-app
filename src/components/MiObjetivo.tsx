import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getNutritionProgram } from '../dbService';
import { useAthleteWeight } from '../hooks/useAthleteWeight';
import { hoyIsoLocal } from '../utils/trainingWeek';
import { faseEnCurso } from '../utils/objetivoDeFase';
import { historialDeObjetivos } from '../utils/historialObjetivos';
import {
  EstadoVerificacion, OBJETIVO_LABEL, RANGO_PCT_SEMANA, FRANJA_MANTENIMIENTO_KG, verificarObjetivo,
} from '../utils/verificacionObjetivo';
import GraficaObjetivos from './revision/GraficaObjetivos';
import { Card, Badge, BadgeTone, Collapsible } from './ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Mi objetivo — lo que ve el ATLETA de la verificación

   Misma gráfica y mismo motor que el coach (Revisión › Cuerpo), otra voz:
     · Solo sale si el coach ha CONFIRMADO el objetivo de la fase. Un objetivo
       deducido puede estar mal, y enseñarle al atleta un veredicto sobre un
       objetivo equivocado resta confianza en vez de darla.
     · Sin sugerencias de kcal: ajustar es decisión del coach.
     · Veredictos que informan sin alarmar, y la explicación de por qué el
       peso sube y baja de un día a otro siempre a mano.
   ═══════════════════════════════════════════════════════════════════════════ */

const MENSAJE: Record<EstadoVerificacion, { tono: BadgeTone; etiqueta: string; texto: string }> = {
  'en-rango':   { tono: 'success', etiqueta: 'Vas bien', texto: 'Tu tendencia va al ritmo previsto. Sigue así.' },
  'lento':      { tono: 'info', etiqueta: 'Algo más lento', texto: 'Vas algo más despacio de lo previsto. Tu coach lo está siguiendo y ajustará si hace falta.' },
  'rapido':     { tono: 'info', etiqueta: 'Más rápido', texto: 'Vas más rápido de lo previsto. Tu coach lo está siguiendo para que el ritmo sea sostenible.' },
  'contrario':  { tono: 'warning', etiqueta: 'A revisar', texto: 'Estas semanas el peso va en dirección contraria al objetivo. Tu coach lo revisará contigo.' },
  'por-encima': { tono: 'info', etiqueta: 'Fuera de la franja', texto: 'Tu tendencia se ha salido de la franja por arriba. Tu coach lo revisará contigo.' },
  'por-debajo': { tono: 'info', etiqueta: 'Fuera de la franja', texto: 'Tu tendencia se ha salido de la franja por abajo. Tu coach lo revisará contigo.' },
  'parcial':    { tono: 'neutral', etiqueta: 'Recogiendo datos', texto: 'Aún faltan datos para una lectura completa.' },
  'sin-datos':  { tono: 'neutral', etiqueta: 'Recogiendo datos', texto: 'Pésate 3 o más veces por semana: con dos semanas de pesos ya se ve tu tendencia.' },
};

function fmt(n: number, dec = 2): string {
  const s = n.toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  return n > 0 ? `+${s}` : s;
}

export default function MiObjetivo({ athleteEmail }: { athleteEmail: string }) {
  const hoy = hoyIsoLocal();
  const { data: program = null } = useQuery({
    queryKey: ['nutritionProgram', athleteEmail],
    queryFn: () => getNutritionProgram(athleteEmail),
  });
  const { logs: pesos } = useAthleteWeight(athleteEmail);

  const enCurso = faseEnCurso(program, hoy);
  const tipo = enCurso?.objetivo && !enCurso.objetivo.deducido ? enCurso.objetivo.tipo : null;

  const v = useMemo(() => {
    if (!tipo || !enCurso) return null;
    // Recomposición: el atleta ve la parte del peso (la franja). Cintura y
    // fuerza las valora el coach, que tiene los entrenos y las medidas delante.
    return verificarObjetivo({
      objetivo: { tipo: tipo === 'recomposicion' ? 'mantenimiento' : tipo, desde: enCurso.desde }, pesos, hoy,
    });
  }, [tipo, enCurso?.desde, pesos, hoy]); // eslint-disable-line react-hooks/exhaustive-deps

  const historial = useMemo(
    () => (program && tipo ? historialDeObjetivos({ program, pesos, hoy }) : null),
    [program, tipo, pesos, hoy],
  );

  if (!tipo || !v || !enCurso) return null;

  const m = MENSAJE[v.estado];
  const rango = RANGO_PCT_SEMANA[tipo];

  return (
    <Card title={`Tu objetivo: ${OBJETIVO_LABEL[tipo]}`} subtitle={enCurso.fase.name !== OBJETIVO_LABEL[tipo] ? enCurso.fase.name : undefined}>
      <div className="space-y-4">
        <div className="space-y-2">
          <Badge tone={m.tono} dot>{m.etiqueta}</Badge>
          <p className="font-sans text-label text-ink">{m.texto}</p>
        </div>

        {historial && <GraficaObjetivos puntos={historial.puntos} tramos={historial.tramos} />}

        {v.ritmoPct != null && (
          <p className="font-sans text-label text-ink-2">
            Tu ritmo estas semanas: <span className="font-mono text-ink">{fmt(v.ritmoPct)} %</span> de tu peso por semana
            {rango
              ? <> · buscamos entre <span className="font-mono text-ink">{fmt(Math.abs(rango.min) < Math.abs(rango.max) ? rango.min : rango.max)}</span> y <span className="font-mono text-ink">{fmt(Math.abs(rango.min) < Math.abs(rango.max) ? rango.max : rango.min)} %</span></>
              : <> · buscamos mantenerte dentro de ±{FRANJA_MANTENIMIENTO_KG} kg</>}
          </p>
        )}

        <Collapsible trigger={<span className="font-sans font-bold text-label text-ink">¿Por qué mi peso sube y baja cada día?</span>}>
          <div className="space-y-2 font-sans text-label text-ink-2">
            <p>
              El peso de un día incluye agua, sal, glucógeno, lo que queda en el intestino y, en mujeres, el ciclo
              menstrual. Por eso puede moverse 1-2 kg de un día a otro sin que haya cambiado nada de grasa o músculo.
            </p>
            <p>
              Aquí no se mira un pesaje suelto: cada punto gris es tu peso de los últimos 7 días, y la línea es la
              tendencia de las últimas semanas. Un día raro no la mueve. La zona de color es por donde debería ir.
            </p>
            <p>Para que la lectura sea fiable: pésate por la mañana, tras ir al baño y antes de comer, 3 o más veces por semana.</p>
          </div>
        </Collapsible>
      </div>
    </Card>
  );
}
