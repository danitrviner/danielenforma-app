/* Banco de pruebas del autopiloto (`/dev/autopiloto`, solo en desarrollo):
   las pantallas del autopiloto con datos de ejemplo en memoria. Hasta el
   29-10-2026 enseñaba tres variantes de cada una; Dani eligió (Política
   semáforo, Hecho hoy cronología, Línea de tiempo tarjetas, Calidad lista,
   Muro legal de un documento) y las otras se retiraron.
   Guardar, deshacer, juzgar o marcar leído cambian el estado local; nada toca
   Firestore.

     1 · Política (Perfil › Ajustes › Asistente)
     2 · Hecho hoy (Inicio del coach)
     3 · Lo que ha hecho el asistente (Revisión)
     4 · Calidad (Propuestas › Calidad)
     5 · Muro legal unificado
   (El canal de mensajes del atleta es «Lo último de Dani», de la rama de
   acompañamiento ya en main; el autopiloto escribe ahí.) */
import React, { useMemo, useState } from 'react';
import type { AiProposal, UserProfile } from '../types';
import { POLITICA_POR_DEFECTO, type EstadisticaDeTipo, type PoliticaAutopiloto as Politica, type TipoDecision } from '../autopiloto/politica';
import type { Episodio } from '../autopiloto/episodios';
import { construirLineaDeTiempo } from '../autopiloto/lineaDeTiempo';
import { muestraDeCalidad, resumenCalidad, type Veredicto } from '../autopiloto/calidad';
import { compararSombra, informeDeSombra } from '../autopiloto/sombra';
import { hoyIsoLocal, addDays } from '../utils/trainingWeek';
import PoliticaVista from './autopiloto/PoliticaVista';
import HechoHoyVista from './autopiloto/HechoHoyVista';
import LineaDeTiempoVista from './autopiloto/LineaDeTiempoVista';
import CalidadVista from './autopiloto/CalidadVista';
import MuroLegalUnificado from './MuroLegalUnificado';

const AHORA = Date.now();
const HOY = hoyIsoLocal();
const hace = (min: number) => new Date(AHORA - min * 60_000).toISOString();
const dia = (n: number, h = '07:00') => `${addDays(HOY, -n)}T${h}:00.000Z`;
const NOMBRES: Record<string, string> = { 'ana@x.com': 'Ana Ruiz', 'javi@x.com': 'Javi Moreno', 'lucia@x.com': 'Lucía Pardo', 'marcos@x.com': 'Marcos Gil' };

const prop = (id: string, athleteId: string, p: Partial<AiProposal>): AiProposal => ({
  id, athleteId, kind: 'diet', status: 'aplicada', chatId: 'c', createdAt: hace(600), summary: '', rationale: '', payload: {} as never,
  autor: 'asistente', politica: 'automatico', aplicadaEn: hace(60),
  snapshotAntes: [{ coleccion: 'diets', id: 'd1', datos: { budget: { kcal: 2200 } } }],
  ...p,
} as AiProposal);

/* 2 · Hecho hoy ------------------------------------------------------------ */
const RECIENTES: AiProposal[] = [
  prop('p1', 'ana@x.com', { summary: 'Respuesta a la revisión: peso en rango, mantener', kind: 'respuestaRevision', aplicadaEn: hace(35), politica: 'automatico', cambios: ['Respuesta enviada', 'Ficha: foco de la semana'] }),
  prop('p2', 'javi@x.com', { summary: '−100 kcal: dos semanas sin bajar', aplicadaEn: hace(95), politica: 'aviso', avisoHasta: hace(-23 * 60), cambios: ['Objetivo 2.300 → 2.200 kcal', 'Proteína 180 g fija'] }),
  prop('p3', 'javi@x.com', { summary: 'Mensaje: qué cambia esta semana', kind: 'mensajeAtleta', aplicadaEn: hace(96), politica: 'automatico' }),
  prop('p4', 'lucia@x.com', { summary: 'Sesión del lunes marcada como perdida y reprogramada', kind: 'latido', autor: 'latido', politica: 'automatico', aplicadaEn: hace(8 * 60) }),
  prop('p5', 'marcos@x.com', { summary: 'Cambio de ejercicio: press banca → press en máquina (molestia hombro)', kind: 'workoutDays', autor: 'coach', politica: 'proponer', status: 'approved', reviewedAt: hace(4 * 60), cambios: ['Sesión A', 'Sesión C'] }),
  prop('p6', 'ana@x.com', { summary: 'Reto de la semana: 4 de 4 sesiones', kind: 'latido', autor: 'latido', politica: 'automatico', aplicadaEn: hace(8 * 60 + 2), snapshotAntes: undefined }),
  prop('p7', 'lucia@x.com', { summary: '+150 kcal para la semana de descarga', status: 'deshecha', deshechaEn: hace(20), aplicadaEn: hace(3 * 60), politica: 'aviso' }),
];

/* 1 · Política ------------------------------------------------------------- */
const est = (tipo: TipoDecision, ok: number, ed = 0, re = 0, de = 0): [TipoDecision, EstadisticaDeTipo] =>
  [tipo, { tipo, decididas: ok + ed + re + de, aprobadasSinCambios: ok, editadas: ed, rechazadas: re, deshechas: de, avisosSinDeshacer: 0 }];
const STATS = new Map<TipoDecision, EstadisticaDeTipo>([
  est('respuesta_rutinaria', 14, 1), est('menu_semanal', 9, 0, 1), est('reto', 6), est('ajuste_kcal_pequeno', 8, 0, 0, 0),
  est('ajuste_kcal_medio', 3, 2, 1), est('mensaje_atleta', 5, 3), est('mesociclo', 2, 4, 1), est('clinico', 0, 0, 2),
]);

/* 3 · Línea de tiempo de Ana ----------------------------------------------- */
const INICIO = addDays(HOY, -23); // S4 hoy
const ep = (id: string, tipo: Episodio['tipo'], diasAtras: number, e: Partial<Episodio>): Episodio => ({
  id, tipo, athleteId: 'ana@x.com', disparador: { fuente: 'latido', fecha: addDays(HOY, -diasAtras) }, estado: 'hecho', prioridad: 5,
  politica: 'automatico', ronda: 1, propuestas: [], paraDani: '', coste: { usd: 0.21, llamadas: 3, modelo: 'sonnet' },
  creadoEn: dia(diasAtras), actualizadoEn: dia(diasAtras), ...e,
});
const EPISODIOS_ANA: Episodio[] = [
  ep('e_alta', 'alta_completada', 23, { disparador: { fuente: 'onboarding', fecha: INICIO }, politica: 'proponer', propuestas: ['a_meso', 'a_dieta', 'a_menu', 'a_reto', 'a_ficha'], paraDani: 'Plan montado: 12×4, tres dietas, menú y reto. Pregunta para ella: ¿horario del gimnasio?' }),
  ep('e_s2', 'semana_nueva', 16, { propuestas: ['s2_menu', 's2_reto'], paraDani: 'Semana 2: menú publicado y reto de pasos.' }),
  ep('e_q2', 'cuestionario_recibido', 14, { disparador: { fuente: 'questionnaireResponses', fecha: addDays(HOY, -14) }, propuestas: ['q2_resp'], paraDani: 'Revisión rutinaria: peso en rango.' }),
  ep('e_s3', 'semana_nueva', 9, { propuestas: ['s3_prog', 's3_menu'], paraDani: 'Semana 3: +1 serie pecho/dorsal según progresión.' }),
  ep('e_dolor', 'dolor', 7, { disparador: { fuente: 'questionnaireResponses', fecha: addDays(HOY, -7) }, estado: 'escalado', politica: 'proponer', alertas: ['molestia hombro derecho (press militar)'], propuestas: ['d_cambio'], paraDani: 'Hombro: te lo paso; borrador de cambio press militar → máquina.' }),
  ep('e_peso', 'desvio_peso', 2, { estado: 'escalado', politica: 'proponer', propuestas: ['w_kcal'], paraDani: 'Peso lento dos semanas con adherencia 84 %: propongo −150 kcal.' }),
];
const MESO_PROPUESTO = { number: 1, weeks: 12, daysPerWeek: 4, startDate: INICIO, objective: 'Hipertrofia', groups: { gluteo: { series: 6 }, pecho: { series: 10 } } };
const pa = (id: string, p: Partial<AiProposal>) => prop(id, 'ana@x.com', p);
const PROPUESTAS_ANA: AiProposal[] = [
  pa('a_meso', { kind: 'mesocycle', status: 'approved', politica: 'proponer', episodioId: 'e_alta', reviewedAt: dia(23, '12:00'), summary: 'Mesociclo #1 · 12 semanas · 4 días', resultEntityId: 'm1', payload: MESO_PROPUESTO as never, cambios: ['Nuevo bloque: 12×4, hipertrofia'], expediente: { datos: 'alta + 2 g/kg', huecos: 'horario del gimnasio', preguntas: ['¿Horario del gimnasio?'], esperado: 'registra ≥ 3 sesiones/semana', notaAlAprobar: 'glúteo fuera: ya lo trabaja en pilates' } }),
  pa('a_dieta', { kind: 'diet', status: 'approved', politica: 'proponer', episodioId: 'e_alta', reviewedAt: dia(23, '12:01'), summary: 'Dieta Déficit 1.900 kcal · P 150 g', cambios: ['Objetivo 1.900 kcal, 150 g P, 100 g HC'] }),
  pa('a_menu', { kind: 'latido', status: 'approved', politica: 'proponer', episodioId: 'e_alta', reviewedAt: dia(23, '12:02'), summary: 'Menú semana 1 (borrador)' }),
  pa('a_reto', { kind: 'weeklyChallenge', status: 'approved', politica: 'proponer', episodioId: 'e_alta', reviewedAt: dia(23, '12:03'), summary: 'Reto: 3 de 3 sesiones' }),
  pa('a_ficha', { kind: 'dossier', status: 'approved', politica: 'proponer', episodioId: 'e_alta', reviewedAt: dia(23, '12:04'), summary: 'Ficha viva: objetivos, esperado y foco' }),
  pa('s2_menu', { kind: 'latido', episodioId: 'e_s2', aplicadaEn: dia(16), summary: 'Menú semana 2 publicado', cambios: ['Menú: 7 días, dieta Déficit'], resultado: { comprobadoEn: dia(9), cumplioEsperado: true, nota: 'registró 6 de 7 días' } }),
  pa('s2_reto', { kind: 'weeklyChallenge', episodioId: 'e_s2', aplicadaEn: dia(16), summary: 'Reto: 8.000 pasos 4 días', cambios: ['Reto: pasos 8.000 × 4'] }),
  pa('q2_resp', { kind: 'respuestaRevision', episodioId: 'e_q2', aplicadaEn: dia(14, '09:30'), summary: 'Respuesta a su revisión', paraAtleta: 'Buena semana, Ana. El peso va como esperábamos; esta semana vigila el sueño, que lo marcas en 5.' }),
  pa('s3_prog', { kind: 'weekPlan', episodioId: 'e_s3', aplicadaEn: dia(9), summary: 'Progresión S3: +1 serie pecho y dorsal', cambios: ['Press banca 3 → 4 series', 'Jalón 3 → 4 series'], resultado: { comprobadoEn: dia(2), cumplioEsperado: false, nota: 'RIR 0 en press: demasiado pronto' } }),
  pa('s3_menu', { kind: 'latido', episodioId: 'e_s3', aplicadaEn: dia(9), summary: 'Menú semana 3 publicado' }),
  pa('d_cambio', { kind: 'workoutDays', status: 'rejected', politica: 'proponer', episodioId: 'e_dolor', reviewedAt: dia(6, '18:00'), summary: 'Press militar → press en máquina', cambios: ['Sesión B: press militar → press en máquina'], comentarios: [{ at: dia(6, '18:00'), text: 'Rechazada: mejor jalón al pecho hasta que lo vea el fisio' }] }),
  pa('w_kcal', { kind: 'diet', status: 'proposed', politica: 'proponer', episodioId: 'e_peso', summary: '−150 kcal (1.900 → 1.750)', cambios: ['Objetivo 1.900 → 1.750 kcal', 'Proteína 150 g fija'] }),
  pa('chat_1', { kind: 'roadmap', status: 'approved', politica: 'proponer', reviewedAt: dia(12, '20:00'), summary: 'Día señalado: boda el sábado', cambios: ['Sábado: día libre de dieta'] }),
  pa('lat_1', { kind: 'latido', autor: 'latido', aplicadaEn: dia(11, '05:00'), summary: 'Sesión del martes marcada como perdida' }),
];
const MESO_REAL = { id: 'm1', athleteId: 'ana@x.com', ...MESO_PROPUESTO, groups: { gluteo: { series: 0 }, pecho: { series: 10 } } };

/* 4 · Calidad: automáticas de la semana pasada ------------------------------ */
const lunesPasado = (() => { const d = new Date(`${HOY}T12:00:00`); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
const sem = (n: number, h = '07:05') => `${addDays(lunesPasado, n)}T${h}:00.000Z`;
const AUTOMATICAS: AiProposal[] = [
  prop('c1', 'ana@x.com', { aplicadaEn: sem(0), kind: 'latido', summary: 'Menú semana 4 publicado', rationale: 'Dieta Déficit 2, mismas recetas que la semana 3 con dos cambios de cena.', cambios: ['Menú: 7 días, 2 cenas nuevas'], expediente: { datos: 'registro 6/7 días, peso −0,4 kg', huecos: '', preguntas: [], esperado: 'registro ≥ 5 días' } }),
  prop('c2', 'javi@x.com', { aplicadaEn: sem(1), kind: 'mensajeAtleta', summary: 'Mensaje: qué cambia esta semana', paraAtleta: 'Javi, esta semana subimos a 4 series en press y jalón. Si el RIR baja de 1, para y me lo dices.', expediente: { datos: 'progresión programada S6', huecos: '', preguntas: [], esperado: '' } }),
  prop('c3', 'lucia@x.com', { aplicadaEn: sem(2), kind: 'weeklyChallenge', summary: 'Reto: 8.000 pasos 4 días', rationale: 'Media de 6.200 pasos las dos últimas semanas; nivel intermedio.', cambios: ['Reto: pasos 8.000 × 4'] }),
  prop('c4', 'marcos@x.com', { aplicadaEn: sem(2, '09:40'), kind: 'respuestaRevision', summary: 'Respuesta a su revisión', paraAtleta: 'Marcos, buena semana. Peso estable como toca en mantenimiento. Sigue igual.', expediente: { datos: 'peso 82,1 → 82,0; adherencia 91 %', huecos: '', preguntas: [], esperado: 'peso ±0,3 kg' } }),
  prop('c5', 'ana@x.com', { aplicadaEn: sem(3), kind: 'diet', summary: '−100 kcal: dos semanas sin bajar', politica: 'automatico', cambios: ['Objetivo 2.000 → 1.900 kcal'], rationale: 'Adherencia 88 %, peso +0,1 kg en 14 días.' }),
  prop('c6', 'javi@x.com', { aplicadaEn: sem(4), kind: 'weekPlan', summary: 'Progresión S6: +1 serie dorsal', cambios: ['Jalón 3 → 4 series'] }),
  prop('c7', 'lucia@x.com', { aplicadaEn: sem(5), kind: 'latido', summary: 'Menú semana 3 publicado', calidad: { veredicto: 'bien', en: sem(6) } }),
];

/* 1b · Sombra: dos semanas de decisiones sin escribir frente a lo que hizo Dani */
const sombra = (id: string, email: string, diasAtras: number, p: Partial<AiProposal>) => prop(id, email, { status: 'sombra', politica: 'sombra', aplicadaEn: undefined, createdAt: dia(diasAtras), snapshotAntes: undefined, ...p });
const deDani = (id: string, email: string, diasAtras: number, p: Partial<AiProposal>) => prop(id, email, { status: 'approved', politica: 'proponer', aplicadaEn: undefined, reviewedAt: dia(diasAtras, '19:00'), snapshotAntes: undefined, ...p });
const dietaDe = (kcal: number) => ({ name: 'Déficit', objetivo: { kcal, p: 150, hc: 100, g: 60 }, meals: [] }) as never;
const SOMBRAS: AiProposal[] = [
  sombra('z1', 'ana@x.com', 14, { kind: 'weeklyChallenge', summary: 'Reto: 8.000 pasos 4 días', cambios: ['Reto: pasos 8.000 × 4'] }),
  sombra('z2', 'ana@x.com', 7, { kind: 'weeklyChallenge', summary: 'Reto: 4 de 4 sesiones', cambios: ['Reto: sesiones 4 × 4'] }),
  sombra('z3', 'javi@x.com', 13, { kind: 'diet', summary: '−100 kcal: dos semanas sin bajar', payload: dietaDe(2200), baseEntityId: 'd1', cambios: ['Objetivo 2.300 → 2.200 kcal'] }),
  sombra('z4', 'lucia@x.com', 12, { kind: 'weekPlan', summary: 'Progresión S3: +1 serie pecho', cambios: ['Press banca 3 → 4 series'] }),
  sombra('z5', 'marcos@x.com', 9, { kind: 'latido', summary: 'Menú semana 5 publicado', cambios: ['Menú: 7 días, dieta Mantenimiento'] }),
  sombra('z6', 'javi@x.com', 2, { kind: 'latido', summary: 'Menú semana 7 publicado', cambios: ['Menú: 7 días, dieta Déficit 2'] }),
  sombra('z7', 'ana@x.com', 10, { kind: 'respuestaRevision', summary: 'Respuesta a su revisión', payload: { responseId: 'r_ana', texto: 'x' } as never, paraAtleta: 'Buena semana, Ana.' }),
];
const REFERENCIA_DANI = {
  propuestas: [
    deDani('y1', 'ana@x.com', 13, { kind: 'weeklyChallenge', summary: 'Reto: 8.000 pasos 4 días', cambios: ['Reto: pasos 8.000 × 4'] }),
    deDani('y3', 'javi@x.com', 12, { kind: 'diet', summary: 'Dieta Déficit 2.500', payload: dietaDe(2500), baseEntityId: 'd1' }),
    deDani('y5', 'marcos@x.com', 8, { kind: 'latido', summary: 'Menú semana 5 (Dani)', cambios: ['Menú: 7 días, dieta Mantenimiento'] }),
  ],
  cambios: [{ id: 'c1', athleteId: 'lucia@x.com', area: 'entreno' as const, objeto: 'meso:m1', titulo: 'Mesociclo #2', lineas: ['Press banca 3 → 4 series', 'Jalón RIR 2 → 1'], at: dia(11, '20:00'), autor: 'coach' }],
  respuestas: [{ id: 'r_ana', respuestaCoach: { texto: 'Genial, Ana. Sigue así.', enviadaEn: dia(9, '09:00') } } as never],
};
const INFORME_SOMBRA = informeDeSombra(compararSombra(SOMBRAS, REFERENCIA_DANI, new Date().toISOString()));

const PERFIL_DEV = {
  userId: 'dev', email: 'dev@example.com', displayName: 'Dev Atleta', role: 'client', avatarUrl: '', level: 0, currentStreak: 0, maxStreak: 0,
  initialWeight: 0, targetWeight: 0, actualWeight: 0,
} as UserProfile;

function Seccion({ n, titulo, ancho = 'max-w-[48rem]', children }: { n: number; titulo: string; ancho?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="font-mono text-caption uppercase tracking-widest text-ink-3">{n} · {titulo}</h2>
      <div className={`min-w-0 ${ancho}`}>{children}</div>
    </section>
  );
}

export default function AutopilotoDevHarness() {
  const [politica, setPolitica] = useState<Politica>({ ...POLITICA_POR_DEFECTO, modo: 'politica', nivelPorTipo: { ajuste_kcal_medio: 'proponer' } });
  const [msg, setMsg] = useState<string | null>(null);
  const [recientes, setRecientes] = useState(RECIENTES);
  const [automaticas, setAutomaticas] = useState(AUTOMATICAS);
  const guardar = (nueva: Politica) => { setPolitica(nueva); setMsg('Guardado (solo en memoria).'); };
  const deshacer = async (p: AiProposal) => { setRecientes(r => r.map(x => x.id === p.id ? { ...x, status: 'deshecha', deshechaEn: new Date().toISOString() } : x)); };
  const juzgar = async (p: AiProposal, veredicto: Veredicto, nota: string) => {
    setAutomaticas(l => l.map(x => x.id === p.id ? { ...x, calidad: { veredicto, en: new Date().toISOString(), ...(nota ? { nota } : {}) } } : x));
  };

  const linea = useMemo(() => construirLineaDeTiempo(EPISODIOS_ANA, PROPUESTAS_ANA, { inicioPlan: INICIO, mesociclos: [MESO_REAL as never], dietas: [] }), []);
  const calidad = useMemo(() => ({ ...muestraDeCalidad(automaticas, HOY), resumen: resumenCalidad(automaticas) }), [automaticas]);
  const nombreDe = (e: string) => NOMBRES[e] ?? e;

  return (
    <div className="min-h-screen bg-bg text-ink px-4 py-6 space-y-12 max-w-[1400px] mx-auto">
      <header className="space-y-1">
        <h1 className="font-sans font-bold text-title-m">Autopiloto · pantallas</h1>
        <p className="font-sans text-label text-ink-2">Datos de ejemplo. Guardar, deshacer, juzgar y marcar leído solo cambian la memoria de esta página.</p>
      </header>

      <Seccion n={1} titulo="Política (Perfil › Ajustes › Asistente)" ancho="max-w-[42rem]">
        <PoliticaVista politica={politica} stats={STATS} guardando={false} msg={msg} gastoMesUsd={17.4} sombra={INFORME_SOMBRA} onGuardar={guardar} />
      </Seccion>

      <Seccion n={2} titulo="Hecho hoy (Inicio del coach)" ancho="max-w-[42rem]">
        <HechoHoyVista recientes={recientes} horas={24} error={null} ocupadaId={null} nombreDe={nombreDe} onIr={() => undefined} onDeshacer={deshacer} />
      </Seccion>

      <Seccion n={3} titulo="Lo que ha hecho el asistente (Revisión del coach · Ana)">
        <LineaDeTiempoVista linea={linea} modo="rodaje" onIrAPropuesta={() => undefined} />
      </Seccion>

      <Seccion n={4} titulo="Calidad (Propuestas › Calidad)">
        <CalidadVista semana={calidad.semana} muestra={calidad.muestra} total={calidad.total} resumen={calidad.resumen} nombreDe={nombreDe} juzgandoId={null} error={null} onVeredicto={juzgar} onIrAlAtleta={() => undefined} />
      </Seccion>

      <Seccion n={5} titulo="Muro legal unificado (primer login)" ancho="max-w-lg">
        <MuroLegalUnificado profile={PERFIL_DEV} enMarco
          guardar={async nuevas => { console.log('guardaría', nuevas); setMsg('Muro: guardaría (solo consola).'); return nuevas; }}
          onCompletado={legal => console.log('onCompletado', legal)} onSalir={() => console.log('onSalir')} />
      </Seccion>
    </div>
  );
}
