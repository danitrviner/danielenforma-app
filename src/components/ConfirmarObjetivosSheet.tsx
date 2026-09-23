import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { NutritionProgram, UserProfile } from '../types';
import { getNutritionProgram, getNutritionProgramsForAthletes, saveNutritionProgram } from '../dbService';
import { hoyIsoLocal } from '../utils/trainingWeek';
import { faseEnCurso, objetivoDeFase, phaseTypeDeObjetivo } from '../utils/objetivoDeFase';
import { ObjetivoCorporalTipo, OBJETIVO_LABEL, OBJETIVOS_ORDEN } from '../utils/verificacionObjetivo';
import { mensajeDeErrorFirestore } from '../utils/erroresFirestore';
import { Sheet, Button, Badge, Skeleton } from './ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Confirmar el objetivo de todos los clientes con plan — de una vez

   Lo mismo que scripts/asignar-objetivos.ts, pero desde la app con la sesión
   del coach: no hace falta credencial de servidor. Primero es un SIMULACRO
   (la lista de lo que se pondría, fase a fase, con de dónde sale cada
   deducción); nada se escribe hasta pulsar «Aplicar».

   Solo escribe `objetivo` (y `phaseType` si faltaba) en las fases que aún no lo
   tienen: semanas, kcal, ritmo y dietas no se tocan. Al confirmarlo, el atleta
   empieza a ver «Tu objetivo» en su Revisión.
   ═══════════════════════════════════════════════════════════════════════════ */

const POR: Record<string, string> = {
  tipo: 'por el tipo marcado',
  nombre: 'por el nombre',
  kcal: 'por las kcal · revisar',
};

type Eleccion = ObjetivoCorporalTipo | '';

interface Props {
  open: boolean;
  onClose: () => void;
  athletes: UserProfile[];
}

export default function ConfirmarObjetivosSheet({ open, onClose, athletes }: Props) {
  const queryClient = useQueryClient();
  const hoy = hoyIsoLocal();
  const emails = useMemo(() => athletes.map(a => a.email).sort(), [athletes]);
  const { data: programas = [], isPending } = useQuery({
    queryKey: ['nutritionProgramsForAthletes', emails],
    queryFn: () => getNutritionProgramsForAthletes(emails),
    enabled: open && emails.length > 0,
  });

  // Elecciones del coach por `${email}|${faseId}`. Sin entrada = lo deducido.
  const [elegido, setElegido] = useState<Record<string, Eleccion>>({});
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);

  const filas = useMemo(() => programas
    .filter(p => Array.isArray(p.phases) && p.phases.some(f => !f.objetivo))
    .map(p => ({
      program: p,
      atleta: athletes.find(a => a.email === p.athleteId),
      enCurso: faseEnCurso(p, hoy),
      fases: p.phases.map((fase, idx) => ({ fase, idx, deducido: fase.objetivo ? null : objetivoDeFase(p, idx) })),
    }))
    .sort((a, b) => (a.atleta?.displayName ?? a.program.athleteId).localeCompare(b.atleta?.displayName ?? b.program.athleteId)),
  [programas, athletes, hoy]);

  const valor = (email: string, faseId: string, deducido: ObjetivoCorporalTipo | null): Eleccion =>
    elegido[`${email}|${faseId}`] ?? deducido ?? '';

  const pendientes = filas.reduce((n, f) => n + f.fases.filter(x => !x.fase.objetivo).length, 0);
  const aRevisar = filas.reduce((n, f) =>
    n + f.fases.filter(x => !x.fase.objetivo && (!x.deducido || x.deducido.por === 'kcal') && !elegido[`${f.program.athleteId}|${x.fase.id}`]).length, 0);

  async function aplicar() {
    setGuardando(true);
    setResultado(null);
    let escritos = 0;
    try {
      for (const fila of filas) {
        const email = fila.program.athleteId;
        // Se relee: el programa puede haber cambiado desde que se abrió la hoja.
        const actual = await getNutritionProgram(email);
        if (!actual) continue;
        let cambia = false;
        const phases = actual.phases.map((fase, idx) => {
          if (fase.objetivo) return fase;
          const tipo = valor(email, fase.id, objetivoDeFase(actual, idx)?.tipo ?? null);
          if (!tipo) return fase;
          cambia = true;
          return { ...fase, objetivo: tipo, ...(fase.phaseType ? {} : { phaseType: phaseTypeDeObjetivo(tipo) }) };
        });
        if (!cambia) continue;
        const siguiente: NutritionProgram = { ...actual, phases };
        await saveNutritionProgram(siguiente);
        queryClient.setQueryData(['nutritionProgram', email], siguiente);
        escritos++;
      }
      queryClient.invalidateQueries({ queryKey: ['nutritionProgramsForAthletes'] });
      setResultado(`Hecho: objetivo confirmado en ${escritos} ${escritos === 1 ? 'cliente' : 'clientes'}.`);
    } catch (err) {
      setResultado(mensajeDeErrorFirestore(err, 'guardar los objetivos'));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Objetivos de los clientes"
      size="l"
      footer={
        <div className="flex items-center justify-between gap-3 w-full">
          <span className="font-sans text-caption text-ink-2">
            {resultado ?? (pendientes ? `${pendientes} fases por confirmar · ${aRevisar} a revisar` : '')}
          </span>
          <Button variant="primary" loading={guardando} loadingLabel="Guardando"
            disabled={pendientes === 0 || guardando} onClick={aplicar}>
            Aplicar
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="font-sans text-label text-ink-2">
          Simulacro: esto es lo que se pondría. Nada se guarda hasta pulsar «Aplicar». Revisa las
          marcadas en amarillo (deducidas por kcal o sin deducir) y cámbialas si no cuadran. Al
          confirmar, cada atleta verá «Tu objetivo» en su Revisión. Solo se escribe el objetivo:
          semanas, kcal y dietas no se tocan.
        </p>

        {isPending && open ? (
          <Skeleton className="w-full h-40 rounded-surface" />
        ) : filas.length === 0 ? (
          <p className="font-sans text-label text-ink">
            {resultado ?? 'Todos los clientes con plan ya tienen el objetivo confirmado en todas sus fases.'}
          </p>
        ) : filas.map(({ program, atleta, enCurso, fases }) => (
          <div key={program.athleteId} className="rounded-surface border border-hairline p-4 space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-sans font-bold text-label text-ink">{atleta?.displayName || program.athleteId}</span>
              {!enCurso && <span className="font-sans text-caption text-ink-3">sin fase en curso</span>}
            </div>
            {fases.map(({ fase, idx, deducido }) => {
              const clave = `${program.athleteId}|${fase.id}`;
              const dudoso = !fase.objetivo && (!deducido || deducido.por === 'kcal') && !elegido[clave];
              return (
                <div key={fase.id} className="flex flex-wrap items-center gap-2">
                  <span className={`font-mono text-caption w-4 ${enCurso?.idx === idx ? 'text-accent' : 'text-ink-3'}`}>
                    {enCurso?.idx === idx ? '▶' : idx + 1}
                  </span>
                  <span className="font-sans text-label text-ink flex-1 min-w-[8rem] truncate">
                    {fase.name} <span className="font-mono text-caption text-ink-3">{fase.weeks} sem</span>
                  </span>
                  {fase.objetivo ? (
                    <Badge tone="success">{OBJETIVO_LABEL[fase.objetivo]}</Badge>
                  ) : (
                    <>
                      <select
                        aria-label={`Objetivo de ${fase.name}`}
                        value={valor(program.athleteId, fase.id, deducido?.tipo ?? null)}
                        onChange={e => setElegido(prev => ({ ...prev, [clave]: e.target.value as Eleccion }))}
                        className={`bg-raised border text-title-s font-sans rounded-control px-2 py-2 ${dudoso ? 'border-warning text-warning' : 'border-hairline text-ink'}`}
                      >
                        <option value="">Sin objetivo</option>
                        {OBJETIVOS_ORDEN.map(t => <option key={t} value={t}>{OBJETIVO_LABEL[t]}</option>)}
                      </select>
                      <span className="font-sans text-caption text-ink-3 w-32">
                        {elegido[clave] !== undefined ? 'elegido a mano' : deducido ? POR[deducido.por] : 'no se puede deducir'}
                      </span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </Sheet>
  );
}
