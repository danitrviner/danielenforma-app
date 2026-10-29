/* Banco de pruebas del autopiloto (`/dev/autopiloto`, solo en desarrollo):
   las tres variantes visuales de la pantalla de POLÍTICA y de «HECHO HOY»,
   con datos de ejemplo en memoria. Sirve para elegir una de cada (Dani,
   29-10-2026: «dame 2-3 versiones … elegimos al final»). Guardar cambia el
   estado local; nada toca Firestore. */
import { useState } from 'react';
import type { AiProposal } from '../types';
import { POLITICA_POR_DEFECTO, type EstadisticaDeTipo, type PoliticaAutopiloto as Politica, type TipoDecision } from '../autopiloto/politica';
import PoliticaVista, { type VariantePolitica } from './autopiloto/PoliticaVista';
import HechoHoyVista, { type VarianteHechoHoy } from './autopiloto/HechoHoyVista';

const AHORA = Date.now();
const hace = (min: number) => new Date(AHORA - min * 60_000).toISOString();
const NOMBRES: Record<string, string> = { 'ana@x.com': 'Ana Ruiz', 'javi@x.com': 'Javi Moreno', 'lucia@x.com': 'Lucía Pardo', 'marcos@x.com': 'Marcos Gil' };

const prop = (id: string, athleteId: string, p: Partial<AiProposal>): AiProposal => ({
  id, athleteId, kind: 'diet', status: 'aplicada', chatId: 'c', createdAt: hace(600), summary: '', payload: {} as never,
  autor: 'asistente', politica: 'automatico', aplicadaEn: hace(60),
  snapshotAntes: [{ coleccion: 'diets', id: 'd1', datos: { budget: { kcal: 2200 } } }],
  ...p,
} as AiProposal);

const RECIENTES: AiProposal[] = [
  prop('p1', 'ana@x.com', { summary: 'Respuesta a la revisión: peso en rango, mantener', kind: 'respuestaRevision', aplicadaEn: hace(35), politica: 'automatico', cambios: ['Respuesta enviada', 'Ficha: foco de la semana'] }),
  prop('p2', 'javi@x.com', { summary: '−100 kcal: dos semanas sin bajar', aplicadaEn: hace(95), politica: 'aviso', avisoHasta: hace(-23 * 60), cambios: ['Objetivo 2.300 → 2.200 kcal', 'Proteína 180 g fija'] }),
  prop('p3', 'javi@x.com', { summary: 'Mensaje: qué cambia esta semana', kind: 'mensajeAtleta', aplicadaEn: hace(96), politica: 'automatico' }),
  prop('p4', 'lucia@x.com', { summary: 'Sesión del lunes marcada como perdida y reprogramada', kind: 'latido', autor: 'latido', politica: 'automatico', aplicadaEn: hace(8 * 60) }),
  prop('p5', 'marcos@x.com', { summary: 'Cambio de ejercicio: press banca → press en máquina (molestia hombro)', kind: 'workoutDays', autor: 'coach', politica: 'proponer', status: 'approved', reviewedAt: hace(4 * 60), cambios: ['Sesión A', 'Sesión C'] }),
  prop('p6', 'ana@x.com', { summary: 'Reto de la semana: 4 de 4 sesiones', kind: 'latido', autor: 'latido', politica: 'automatico', aplicadaEn: hace(8 * 60 + 2), snapshotAntes: undefined }),
  prop('p7', 'lucia@x.com', { summary: '+150 kcal para la semana de descarga', status: 'deshecha', deshechaEn: hace(20), aplicadaEn: hace(3 * 60), politica: 'aviso' }),
];

const est = (tipo: TipoDecision, ok: number, ed = 0, re = 0, de = 0): [TipoDecision, EstadisticaDeTipo] =>
  [tipo, { tipo, decididas: ok + ed + re + de, aprobadasSinCambios: ok, editadas: ed, rechazadas: re, deshechas: de, avisosSinDeshacer: 0 }];
const STATS = new Map<TipoDecision, EstadisticaDeTipo>([
  est('respuesta_rutinaria', 14, 1), est('menu_semanal', 9, 0, 1), est('reto', 6), est('ajuste_kcal_pequeno', 8, 0, 0, 0),
  est('ajuste_kcal_medio', 3, 2, 1), est('mensaje_atleta', 5, 3), est('mesociclo', 2, 4, 1), est('clinico', 0, 0, 2),
]);

const VARIANTES = ['A', 'B', 'C'] as const;
const ETIQUETA_P: Record<VariantePolitica, string> = { A: 'A · Tarjetas', B: 'B · Semáforo', C: 'C · Por bloques' };
const ETIQUETA_H: Record<VarianteHechoHoy, string> = { A: 'A · Lista', B: 'B · Cronología', C: 'C · Por atleta' };

function Selector<T extends string>({ valor, opciones, etiquetas, onChange }: { valor: T | 'todas'; opciones: readonly T[]; etiquetas: Record<T, string>; onChange: (v: T | 'todas') => void }) {
  const todas = [...opciones, 'todas' as const];
  return (
    <div className="inline-flex rounded-chip border border-hairline bg-raised p-0.5">
      {todas.map(o => (
        <button key={o} type="button" onClick={() => onChange(o)}
          className={`px-3 py-1 rounded-chip font-mono text-caption uppercase tracking-wider ${valor === o ? 'bg-accent text-on-accent' : 'text-ink-2'}`}>
          {o === 'todas' ? 'Las tres' : etiquetas[o as T]}
        </button>
      ))}
    </div>
  );
}

export default function AutopilotoDevHarness() {
  const [politica, setPolitica] = useState<Politica>({ ...POLITICA_POR_DEFECTO, modo: 'politica', nivelPorTipo: { ajuste_kcal_medio: 'proponer' } });
  const [msg, setMsg] = useState<string | null>(null);
  const [vp, setVp] = useState<VariantePolitica | 'todas'>('todas');
  const [vh, setVh] = useState<VarianteHechoHoy | 'todas'>('todas');
  const [recientes, setRecientes] = useState(RECIENTES);
  const guardar = (nueva: Politica) => { setPolitica(nueva); setMsg('Guardado (solo en memoria).'); };
  const deshacer = async (p: AiProposal) => { setRecientes(r => r.map(x => x.id === p.id ? { ...x, status: 'deshecha', deshechaEn: new Date().toISOString() } : x)); };

  const listaP = vp === 'todas' ? VARIANTES : [vp];
  const listaH = vh === 'todas' ? VARIANTES : [vh];

  return (
    <div className="min-h-screen bg-bg text-ink px-4 py-6 space-y-10 max-w-[1400px] mx-auto">
      <header className="space-y-1">
        <h1 className="font-sans font-bold text-title-m">Autopiloto · variantes visuales</h1>
        <p className="font-sans text-label text-ink-2">Datos de ejemplo. Guardar y deshacer solo cambian la memoria de esta página.</p>
      </header>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-mono text-caption uppercase tracking-widest text-ink-3">1 · Política (Perfil › Ajustes › Asistente)</h2>
          <Selector valor={vp} opciones={VARIANTES} etiquetas={ETIQUETA_P} onChange={setVp} />
        </div>
        <div className={`grid gap-6 ${listaP.length > 1 ? 'xl:grid-cols-3' : ''}`}>
          {listaP.map(v => (
            <div key={v} className="space-y-2 min-w-0">
              <p className="font-mono text-caption uppercase tracking-wider text-ink-3">{ETIQUETA_P[v]}</p>
              <PoliticaVista variante={v} politica={politica} stats={STATS} guardando={false} msg={msg} gastoMesUsd={17.4} onGuardar={guardar} />
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-mono text-caption uppercase tracking-widest text-ink-3">2 · Hecho hoy (Inicio del coach)</h2>
          <Selector valor={vh} opciones={VARIANTES} etiquetas={ETIQUETA_H} onChange={setVh} />
        </div>
        <div className={`grid gap-6 ${listaH.length > 1 ? 'xl:grid-cols-3' : 'max-w-[42rem]'}`}>
          {listaH.map(v => (
            <div key={v} className="space-y-2 min-w-0">
              <p className="font-mono text-caption uppercase tracking-wider text-ink-3">{ETIQUETA_H[v]}</p>
              <HechoHoyVista variante={v} recientes={recientes} horas={24} error={null} ocupadaId={null}
                nombreDe={e => NOMBRES[e] ?? e} onIr={() => undefined} onDeshacer={deshacer} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
