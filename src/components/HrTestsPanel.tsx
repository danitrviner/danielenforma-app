import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UserProfile, AthleteCardioProfile, HrTestType, HrTestResult } from '../types';
import { getHrTestsForAthlete, createHrTest, createNotificationDeduped } from '../dbService';
import { HeartRateMonitor, isBleAvailable } from '../services/bleHeartRate';
import Skeleton from './Skeleton';

const COACH_EMAIL = 'danitrviner@gmail.com';

interface Props {
  profile: UserProfile;
  cardioProfile: AthleteCardioProfile | null;
}

interface TestDef {
  type: HrTestType;
  title: string;
  desc: string;
  durationSec: number; // duración del tramo que cuenta para el cálculo
  warmupSec: number;
  highEffort: boolean; // requiere PAR-Q antes
  compute: (samples: number[]) => HrTestResult;
}

const TESTS: TestDef[] = [
  {
    type: 'resting', title: 'Test 0 — FC en reposo', desc: 'Tumbado, banda puesta, 2-3 min quieto. Riesgo nulo.',
    durationSec: 150, warmupSec: 0, highEffort: false,
    compute: (s) => ({ restingHR: s.length ? Math.min(...s) : undefined }),
  },
  {
    type: 'talktest', title: 'Test 1 — Talk test / MAF', desc: 'Esfuerzo estable en el que aún puedes hablar frases completas. Fija una Z2 conservadora. Riesgo bajo.',
    durationSec: 600, warmupSec: 300, highEffort: false,
    compute: (s) => ({ z2Ceiling: s.length ? Math.round(s.reduce((a, b) => a + b, 0) / s.length) : undefined }),
  },
  {
    type: 'tt30', title: 'Test 2 — 30 min contrarreloj → LTHR', desc: 'Tras calentar, 30 min al máximo sostenible en solitario. El más útil y reproducible. Esfuerzo alto.',
    durationSec: 1800, warmupSec: 900, highEffort: true,
    compute: (s) => {
      const last20min = s.slice(-Math.floor((20 * 60) / 1)); // se recalcula con el intervalo real al guardar
      const arr = last20min.length ? last20min : s;
      return { lthr: arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : undefined };
    },
  },
  {
    type: 'maxramp', title: 'Test 3 — Rampa a FCmax', desc: 'Tras calentar, rampa progresiva 2-3 min subiendo intensidad hasta no poder + sprint final. Esfuerzo máximo — solo tras cribado PAR-Q.',
    durationSec: 300, warmupSec: 600, highEffort: true,
    compute: (s) => ({ maxHR: s.length ? Math.max(...s) : undefined }),
  },
  {
    type: 'decoupling', title: 'Test 4 — Validación de Z2 (desacople)', desc: '60 min a ritmo fijo dentro de tu Z2 estimada. Valida si el techo de Z2 es correcto. Riesgo bajo.',
    durationSec: 3600, warmupSec: 0, highEffort: false,
    compute: (s) => {
      if (s.length < 2) return {};
      const mid = Math.floor(s.length / 2);
      const firstHalf = s.slice(0, mid);
      const secondHalf = s.slice(mid);
      const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
      const a1 = avg(firstHalf), a2 = avg(secondHalf);
      return { decouplingPct: a1 > 0 ? Math.round(((a2 - a1) / a1) * 1000) / 10 : undefined };
    },
  },
];

const PARQ_QUESTIONS = [
  '¿Te ha dicho un médico que tienes un problema cardíaco y que solo debes hacer actividad física bajo supervisión?',
  '¿Sientes dolor en el pecho cuando haces actividad física?',
  '¿Has tenido dolor en el pecho en el último mes estando en reposo?',
  '¿Pierdes el equilibrio por mareo o pierdes el conocimiento?',
  '¿Tienes algún problema óseo o articular que empeore con la actividad?',
  '¿Te ha recetado un médico medicación para la tensión o el corazón?',
  '¿Conoces alguna otra razón por la que no deberías hacer ejercicio intenso?',
];

const SAMPLE_INTERVAL_SEC = 3;

export default function HrTestsPanel({ profile, cardioProfile: _cardioProfile }: Props) {
  const queryClient = useQueryClient();
  const { data: tests = [], isPending } = useQuery({ queryKey: ['hrTests', profile.email], queryFn: () => getHrTestsForAthlete(profile.email) });

  const [activeTest, setActiveTest] = useState<TestDef | null>(null);
  const [parqPassed, setParqPassed] = useState(false);
  const [phase, setPhase] = useState<'warmup' | 'testing' | 'done'>('warmup');
  const [bpm, setBpm] = useState<number | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [samples, setSamples] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  const monitorRef = useRef<HeartRateMonitor | null>(null);
  const bpmBufferRef = useRef<number[]>([]);
  const tickRef = useRef<number | null>(null);

  useEffect(() => () => cleanup(), []);

  function cleanup() {
    if (tickRef.current) { window.clearInterval(tickRef.current); tickRef.current = null; }
    monitorRef.current?.stopListening().catch(() => {});
    monitorRef.current?.disconnect().catch(() => {});
    monitorRef.current = null;
  }

  const openTest = (t: TestDef) => {
    setActiveTest(t);
    setParqPassed(false);
    setPhase(t.warmupSec > 0 ? 'warmup' : 'testing');
    setElapsedSec(0);
    setSamples([]);
    setError(null);
  };

  const startRecording = async () => {
    if (!isBleAvailable()) { setError('Conectar la banda BLE requiere la app nativa (iOS/Android).'); return; }
    try {
      const monitor = new HeartRateMonitor();
      await monitor.requestAndConnect(() => setError('La banda se desconectó.'));
      await monitor.startListening((v) => { setBpm(v); bpmBufferRef.current.push(v); });
      monitorRef.current = monitor;
      tickRef.current = window.setInterval(() => {
        setElapsedSec(s => {
          const next = s + 1;
          if (activeTest && phase === 'warmup' && next >= activeTest.warmupSec) {
            setPhase('testing');
            return 0;
          }
          return next;
        });
        if (bpmBufferRef.current.length && (elapsedSec % SAMPLE_INTERVAL_SEC === 0)) {
          const avg = Math.round(bpmBufferRef.current.reduce((a, b) => a + b, 0) / bpmBufferRef.current.length);
          bpmBufferRef.current = [];
          if (phase === 'testing') setSamples(prev => [...prev, avg]);
        }
      }, 1000);
    } catch (err: any) {
      setError(err?.message ?? 'No se pudo conectar con la banda.');
    }
  };

  const finishTest = async () => {
    if (!activeTest) return;
    cleanup();
    const result = activeTest.compute(samples);
    const test = await createHrTest({
      athleteId: profile.email, type: activeTest.type,
      date: new Date().toISOString().slice(0, 10),
      durationSec: samples.length * SAMPLE_INTERVAL_SEC,
      result, samples, approvedByCoach: false,
    });
    queryClient.setQueryData(['hrTests', profile.email], (prev: any[] = []) => [...prev, test]);
    createNotificationDeduped(`notif_hrtest_${test.id}`, {
      recipientEmail: COACH_EMAIL, type: 'hrtest_pending', title: 'Test de FC pendiente',
      body: `${profile.displayName} completó "${activeTest.title}" — revisa y aprueba sus zonas.`,
      link: 'cardio', createdAt: new Date().toISOString(), read: false,
    }).catch(err => console.warn('createNotificationDeduped (hrtest pending) failed:', err));
    setPhase('done');
  };

  if (isPending) return <Skeleton className="h-40 w-full rounded-2xl" />;

  if (activeTest) {
    if (activeTest.highEffort && !parqPassed) {
      return (
        <section className="bg-[#181816] border border-white/7 rounded-2xl p-4 sm:p-5 space-y-3">
          <h2 className="font-sans font-bold text-base text-white flex items-center gap-2">
            <span className="material-symbols-outlined text-red-400">warning</span> Cuestionario PAR-Q
          </h2>
          <p className="text-xs text-[#c6c9ab] font-mono">Este test es de esfuerzo alto. Si respondes SÍ a cualquiera, no continúes y consulta con un médico antes de hacerlo.</p>
          <ul className="text-xs text-[#c6c9ab] font-mono space-y-1.5 list-disc pl-4">
            {PARQ_QUESTIONS.map((q, i) => <li key={i}>{q}</li>)}
          </ul>
          <div className="flex gap-2">
            <button onClick={() => setActiveTest(null)} className="flex-1 py-2.5 bg-white/7 text-[#c6c9ab] font-sans font-bold text-xs uppercase rounded-lg">Cancelar</button>
            <button onClick={() => setParqPassed(true)} className="flex-1 py-2.5 bg-[#fbcb1a] text-black font-sans font-bold text-xs uppercase rounded-lg hover:bg-[#d4a800]">Ninguna aplica, continuar</button>
          </div>
        </section>
      );
    }

    if (phase === 'done') {
      return (
        <section className="bg-[#181816] border border-white/7 rounded-2xl p-4 sm:p-5 space-y-3 text-center">
          <span className="material-symbols-outlined text-4xl text-[#00eefc]">check_circle</span>
          <p className="font-sans font-bold text-white">Test completado</p>
          <p className="text-xs text-[#c6c9ab] font-mono">Tu entrenador revisará el resultado y aprobará tus zonas.</p>
          <button onClick={() => setActiveTest(null)} className="w-full py-2.5 bg-[#fbcb1a] text-black font-sans font-bold text-xs uppercase rounded-lg hover:bg-[#d4a800]">Volver</button>
        </section>
      );
    }

    return (
      <section className="bg-[#181816] border border-white/7 rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-sans font-bold text-base text-white">{activeTest.title}</h2>
          <button onClick={() => { cleanup(); setActiveTest(null); }} className="text-[#c6c9ab] hover:text-white">
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>
        {error && <p className="text-xs text-red-400 font-mono">{error}</p>}
        {!monitorRef.current ? (
          <button onClick={startRecording} className="w-full py-2.5 bg-[#fbcb1a] text-black font-sans font-bold text-xs uppercase rounded-lg hover:bg-[#d4a800]">Conectar banda y empezar</button>
        ) : (
          <div className="space-y-3 text-center">
            <p className="text-[10px] font-mono uppercase text-[#00eefc]">{phase === 'warmup' ? 'Calentando...' : 'Grabando'}</p>
            <p className="font-sans font-black text-5xl text-white tabular-nums">{bpm ?? '--'}</p>
            <p className="text-xs font-mono text-[#c6c9ab]">{Math.floor(elapsedSec / 60)}:{String(elapsedSec % 60).padStart(2, '0')} / {Math.floor((phase === 'warmup' ? activeTest.warmupSec : activeTest.durationSec) / 60)}:{String((phase === 'warmup' ? activeTest.warmupSec : activeTest.durationSec) % 60).padStart(2, '0')}</p>
            {phase === 'testing' && (
              <button onClick={finishTest} className="w-full py-2.5 bg-[#fbcb1a] text-black font-sans font-bold text-xs uppercase rounded-lg hover:bg-[#d4a800]">Terminar y calcular</button>
            )}
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="space-y-2">
      <h3 className="text-[10px] font-mono uppercase text-[#00eefc] tracking-wider">Tests de FC</h3>
      <div className="space-y-2">
        {TESTS.map(t => {
          const lastResult = [...tests].filter(x => x.type === t.type).sort((a, b) => b.date.localeCompare(a.date))[0];
          return (
            <button key={t.type} onClick={() => openTest(t)} className="w-full text-left bg-[#181816] border border-white/7 rounded-xl p-3 hover:border-[#fbcb1a]/40 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <p className="font-sans font-semibold text-sm text-white">{t.title}</p>
                {t.highEffort && <span className="text-[9px] font-mono uppercase text-red-400 flex-shrink-0">Esfuerzo alto</span>}
              </div>
              <p className="text-[10px] text-[#c6c9ab] font-mono mt-1">{t.desc}</p>
              {lastResult && (
                <p className="text-[10px] font-mono mt-1.5" style={{ color: lastResult.approvedByCoach ? '#00eefc' : '#888' }}>
                  Último: {lastResult.date} {lastResult.approvedByCoach ? '· aprobado' : '· pendiente de revisión'}
                </p>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
