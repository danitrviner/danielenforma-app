import React, { useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { CoachDayNote, MensajeCoach, QuestionnaireResponse, UserProfile } from '../types';
import type { PanelRetencion } from '../utils/panelRetencion';
import { addDays, hoyIsoLocal } from '../utils/trainingWeek';
import PanelRetencionCard from './coach/PanelRetencionCard';
import LoUltimoDeDani, { claveMensajesAtleta, DIAS_LO_ULTIMO } from './home/LoUltimoDeDani';
import RespuestaCoachBox from './revision/RespuestaCoachBox';
import RespuestaDelCoach from './checkin/RespuestaDelCoach';
import PrimeraSemanaCard from './home/PrimeraSemanaCard';
import PlanInPreparationCard from './PlanInPreparationCard';
import LoQueVinisteABuscar from './home/LoQueVinisteABuscar';
import RoadmapDelAtletaVista from './roadmap/RoadmapDelAtletaVista';
import VueltaCard from './home/VueltaCard';
import WeeklyChallengeCard from './roadmap/WeeklyChallengeCard';
import { FIXTURE_RESPUESTA } from './RespuestaDevHarness';
import { FIXTURE_PRIMERA_SEMANA } from './PrimeraSemanaDevHarness';
import { fixtureRoadmap, RETO_FIXTURE } from './RoadmapDevHarness';

/* ═══════════════════════════════════════════════════════════════════════════
   Galería de variantes (29-10-2026) — `/dev/variantes`

   Regla de Dani: cada pieza nueva se enseña en 2-3 versiones y se elige al
   final. Aquí están todas las de las tandas 1-5, con los mismos datos de
   mentira, una sección por pieza y una columna por versión. Lo elegido se
   fija en `src/data/variantes.ts`. `?pieza=panel|ultimo|respuesta|atleta|primera|espera|viniste|roadmap`
   enseña una sola.
   ═══════════════════════════════════════════════════════════════════════════ */

const HOY = hoyIsoLocal();
const EMAIL = FIXTURE_RESPUESTA.atleta.email;

const PANEL: PanelRetencion = { enMarcha: 11, apagandose: 2, callados: 1, sinPlan: 3, latenciaMedianaH: 87, pctContestadas48h: 20, sinContestar: 3, primeraSemana: [{ nombre: 'David Macías', dia: 3, email: 'd@x.com' }] };

const MENSAJES: MensajeCoach[] = [
  { id: 'c1', athleteId: EMAIL, tipo: 'cambio', autor: 'coach', estado: 'aprobado', texto: 'He bajado la dieta Déficit a 2.050 kcal.', porque: 'el peso iba más rápido de lo que quiero y prefiero ir con margen.', fecha: addDays(HOY, -2), creadoEn: '' },
  { id: 'p1', athleteId: EMAIL, tipo: 'problema', autor: 'app', estado: 'aprobado', texto: 'Recibido: rodilla derecha en la última serie de sentadilla. Lo lee Dani en tu revisión y te dice qué cambia.', fecha: addDays(HOY, -3), creadoEn: '', problema: { estado: 'en_curso', actualizadoEn: '', detalle: 'Esta semana sentadilla fuera y prensa en su lugar.' } },
];
const RESPUESTAS: QuestionnaireResponse[] = [{
  id: 'r1', questionnaireId: 'q', assignmentId: 'a', athleteId: EMAIL, submittedAt: `${addDays(HOY, -4)}T18:30:00.000Z`, answers: [],
  respuestaCoach: { texto: '', enviadaEn: `${addDays(HOY, -3)}T09:30:00.000Z`, canal: 'app', bloques: {
    comoHaIdo: 'Buena semana, Javier: 4 de 4 entrenos hechos y el peso bajando 0,4 kg a la semana, justo en el ritmo que buscamos. Lo de la rodilla lo he leído.',
    queCambia: 'Esta semana cambio la sentadilla por prensa, con el mismo esquema, hasta que la rodilla esté callada. Lo demás igual.',
    queEspero: 'Otra semana entre 80,1 y 80,9 kg y la prensa sin molestia.',
  } },
}];
const NOTA: CoachDayNote = { id: 'n', athleteId: EMAIL, date: HOY, text: 'Hoy la última serie de press va al fallo: apunta las reps.', createdAt: '' };

const PIEZAS = ['panel', 'ultimo', 'respuesta', 'atleta', 'primera', 'espera', 'viniste', 'vuelta', 'roadmap'] as const;
type Pieza = typeof PIEZAS[number];

export default function VariantesDevHarness() {
  const [pieza, setPieza] = useState<Pieza | 'todas'>(() => {
    const p = new URLSearchParams(window.location.search).get('pieza') as Pieza | null;
    return p && PIEZAS.includes(p) ? p : 'todas';
  });
  const client = useMemo(() => {
    const c = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
    FIXTURE_RESPUESTA.sembrar(c);
    FIXTURE_PRIMERA_SEMANA.sembrar(c);
    c.setQueryData(claveMensajesAtleta(EMAIL, addDays(HOY, -(DIAS_LO_ULTIMO - 1))), MENSAJES);
    return c;
  }, []);
  const roadmap = useMemo(fixtureRoadmap, []);
  const [respuesta, setRespuesta] = useState(FIXTURE_RESPUESTA.respuesta);
  const ver = (p: Pieza) => pieza === 'todas' || pieza === p;
  const perfil: UserProfile = { ...FIXTURE_RESPUESTA.atleta, planPublishedAt: `${addDays(HOY, -2)}T10:00:00.000Z` };
  const reto = <WeeklyChallengeCard challenge={RETO_FIXTURE} progress={{ progressValue: 8800, pct: 98, achieved: false }} />;

  return (
    <QueryClientProvider client={client}>
      <div className="min-h-screen bg-bg text-ink p-4">
        <div className="mx-auto max-w-6xl space-y-10">
          <div className="flex flex-wrap items-center gap-3">
            <p className="font-mono text-caption text-ink-3 uppercase tracking-widest flex-1">/dev/variantes — galería para elegir · datos de mentira</p>
            {(['todas', ...PIEZAS] as const).map(p => (
              <button key={p} type="button" onClick={() => setPieza(p)} className={`font-mono text-caption uppercase ${pieza === p ? 'text-accent-ink' : 'text-ink-3'}`}>{p}</button>
            ))}
          </div>

          {ver('panel') && (
            <Seccion titulo="1 · Panel de retención (coach, encima de la bandeja)" ancho="w-full">
              <Variante nombre="A · cifras"><PanelRetencionCard panel={PANEL} variante="cifras" /></Variante>
              <Variante nombre="B · línea"><PanelRetencionCard panel={PANEL} variante="linea" /></Variante>
              <Variante nombre="C · dos grandes"><PanelRetencionCard panel={PANEL} variante="dos" /></Variante>
            </Seccion>
          )}

          {ver('ultimo') && (
            <Seccion titulo="3 · «Lo último de Dani» (Inicio del atleta)">
              <Variante nombre="A · lista por fecha"><LoUltimoDeDani profile={perfil} respuestas={RESPUESTAS} notaDeHoy={NOTA} onNavigate={() => undefined} variante="lista" /></Variante>
              <Variante nombre="B · solo lo último"><LoUltimoDeDani profile={perfil} respuestas={RESPUESTAS} notaDeHoy={NOTA} onNavigate={() => undefined} variante="ultimo" /></Variante>
              <Variante nombre="C · carrusel"><LoUltimoDeDani profile={perfil} respuestas={RESPUESTAS} notaDeHoy={NOTA} onNavigate={() => undefined} variante="carrusel" /></Variante>
            </Seccion>
          )}

          {ver('respuesta') && (
            <Seccion titulo="2 · Cuadro de respuesta a la revisión (coach)" ancho="w-full" columnas={2}>
              <Variante nombre="A · tres campos"><div className="bg-surface border border-hairline rounded-surface p-4"><RespuestaCoachBox respuesta={respuesta} questionnaire={FIXTURE_RESPUESTA.cuestionario} athlete={FIXTURE_RESPUESTA.atleta} onGuardada={setRespuesta} variante="tres" /></div></Variante>
              <Variante nombre="B · un solo campo"><div className="bg-surface border border-hairline rounded-surface p-4"><RespuestaCoachBox respuesta={respuesta} questionnaire={FIXTURE_RESPUESTA.cuestionario} athlete={FIXTURE_RESPUESTA.atleta} onGuardada={setRespuesta} variante="uno" /></div></Variante>
            </Seccion>
          )}

          {ver('atleta') && (
            <Seccion titulo="2 · «Dani ha revisado tu semana» (Perfil › Revisión)" columnas={2}>
              <Variante nombre="A · bloques con título"><RespuestaDelCoach responses={RESPUESTAS} variante="bloques" /></Variante>
              <Variante nombre="B · texto corrido"><RespuestaDelCoach responses={RESPUESTAS} variante="corrido" /></Variante>
            </Seccion>
          )}

          {ver('primera') && (
            <Seccion titulo="4 · «Tu primera semana» (Inicio)" columnas={2}>
              <Variante nombre="A · lista"><PrimeraSemanaCard profile={FIXTURE_PRIMERA_SEMANA.conPlan} assignments={[{ date: addDays(HOY, -1), status: 'completed' }]} pesos={[]} respuestas={[]} onNavigate={() => undefined} variante="lista" /></Variante>
              <Variante nombre="B · tres pasos"><PrimeraSemanaCard profile={FIXTURE_PRIMERA_SEMANA.conPlan} assignments={[{ date: addDays(HOY, -1), status: 'completed' }]} pesos={[]} respuestas={[]} onNavigate={() => undefined} variante="pasos" /></Variante>
            </Seccion>
          )}

          {ver('espera') && (
            <Seccion titulo="4 · Sala de espera: la fecha comprometida" columnas={2}>
              <Variante nombre="A · insignia"><PlanInPreparationCard profile={FIXTURE_PRIMERA_SEMANA.esperando} onNavigate={() => undefined} variante="insignia" /></Variante>
              <Variante nombre="B · cuenta atrás"><PlanInPreparationCard profile={FIXTURE_PRIMERA_SEMANA.esperando} onNavigate={() => undefined} variante="cuenta" /></Variante>
            </Seccion>
          )}

          {ver('viniste') && (
            <Seccion titulo="5b · «Lo que viniste a buscar» (Inicio y Mi objetivo)" columnas={2}>
              <Variante nombre="A · cita"><LoQueVinisteABuscar athleteEmail={EMAIL} pesos={FIXTURE_RESPUESTA.pesos} pesoMeta={79} objetivo="deficit" variante="cita" /></Variante>
              <Variante nombre="B · cifras"><LoQueVinisteABuscar athleteEmail={EMAIL} pesos={FIXTURE_RESPUESTA.pesos} pesoMeta={79} objetivo="deficit" variante="cifras" /></Variante>
            </Seccion>
          )}

          {ver('vuelta') && (
            <Seccion titulo="6 · «Bienvenido de vuelta» (Inicio, tras 3 días sin registrar)" columnas={2}>
              <Variante nombre="A · banda"><VueltaCard profile={{ displayName: 'Javier', senales: { calculadoEn: HOY, ultimoRegistro: addDays(HOY, -4), registros14d: 2, perdidas14d: 1, ultimaRespuesta: null, tieneCuestionarios: true } }} variante="banda" /></Variante>
              <Variante nombre="B · línea"><div className="pt-3"><VueltaCard profile={{ displayName: 'Javier', senales: { calculadoEn: HOY, ultimoRegistro: addDays(HOY, -4), registros14d: 2, perdidas14d: 1, ultimaRespuesta: null, tieneCuestionarios: true } }} variante="linea" /></div></Variante>
            </Seccion>
          )}

          {ver('roadmap') && (
            <Seccion titulo="5a · Road map del atleta">
              <Variante nombre="A · camino"><RoadmapDelAtletaVista roadmap={roadmap} variante="camino" reto={reto} /></Variante>
              <Variante nombre="B · mapa"><RoadmapDelAtletaVista roadmap={roadmap} variante="mapa" reto={reto} /></Variante>
              <Variante nombre="C · compacta"><RoadmapDelAtletaVista roadmap={roadmap} variante="compacta" reto={reto} /></Variante>
            </Seccion>
          )}
        </div>
      </div>
    </QueryClientProvider>
  );
}

function Seccion({ titulo, children, columnas = 3, ancho = 'max-w-sm' }: { titulo: string; children: React.ReactNode; columnas?: 2 | 3; ancho?: string }) {
  return (
    <section className="space-y-3">
      <h2 className="font-sans font-bold text-title-s text-ink border-b border-hairline pb-2">{titulo}</h2>
      <div className={`grid gap-6 ${columnas === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3'}`}>
        {React.Children.map(children, child => <div className={ancho}>{child}</div>)}
      </div>
    </section>
  );
}

function Variante({ nombre, children }: { nombre: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="font-mono text-caption uppercase tracking-widest text-accent-ink">{nombre}</p>
      {children}
    </div>
  );
}
