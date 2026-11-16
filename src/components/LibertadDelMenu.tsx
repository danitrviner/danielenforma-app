import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getReglasDeReceta, saveReglasDeReceta } from '../db/recipes';
import { reglasDeRecetaKey } from '../hooks/useReglasDeReceta';
import { useToast } from '../hooks/useToast';
import type { ReglasDeReceta } from '../utils/reglasDeReceta';
import {
  FILAS, NIVELES, conNivel, conRetoque, libertadVigente, nivelDeFila, textoDeCelda,
  type FilaDeLibertad, type LibertadDelAtleta, type NivelDeLibertad,
} from '../utils/libertadDelAtleta';

/* ═══════════════════════════════════════════════════════════════════════════
   Cliente › Dietas › Información › «Libertad en su menú» (11-2026, Dani)

   Un mando de tres posiciones y, debajo, lo que permite cada una. Tocar una
   celda de otra columna retoca SOLO esa fila para este cliente. Se guarda al
   momento en `athleteRecipeRules/{email}.libertad` (lo lee «Mi menú»).
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  athleteEmail: string;
  /** Solo para el banco de pruebas: en la app se guarda en Firestore. */
  guardar?: (libertad: LibertadDelAtleta) => Promise<void>;
}

export default function LibertadDelMenu({ athleteEmail, guardar }: Props) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const key = reglasDeRecetaKey(athleteEmail);
  const { data } = useQuery({ queryKey: key, queryFn: () => getReglasDeReceta(athleteEmail), staleTime: 5 * 60_000 });
  const libertad = libertadVigente(data?.libertad);
  const retocadas = Object.keys(libertad.retoques ?? {}).length;

  async function cambiar(siguiente: LibertadDelAtleta) {
    const antes = data?.libertad;
    queryClient.setQueryData<ReglasDeReceta>(key, prev => ({ athleteId: athleteEmail, reglas: [], ...prev, libertad: siguiente }));
    try {
      await (guardar ?? (l => saveReglasDeReceta({ athleteId: athleteEmail, libertad: l })))(siguiente);
    } catch {
      queryClient.setQueryData<ReglasDeReceta>(key, prev => ({ athleteId: athleteEmail, reglas: [], ...prev, libertad: antes }));
      showToast('No se ha podido guardar. Inténtalo otra vez.');
    }
  }

  const elegirCelda = (fila: FilaDeLibertad, nivel: NivelDeLibertad) => {
    if (nivelDeFila(libertad, fila) !== nivel) void cambiar(conRetoque(libertad, fila, nivel));
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-1 p-1 bg-raised rounded-control">
        {NIVELES.map(n => (
          <button
            key={n.id}
            onClick={() => { if (n.id !== libertad.nivel || retocadas > 0) void cambiar(conNivel(n.id)); }}
            aria-pressed={n.id === libertad.nivel}
            className={`py-2 rounded-lg font-sans text-label font-bold transition-colors ${n.id === libertad.nivel ? 'bg-surface text-ink shadow-sm' : 'text-ink-3 hover:text-ink'}`}
          >{n.titulo}</button>
        ))}
      </div>
      <p className="font-sans text-caption text-ink-2">{NIVELES.find(n => n.id === libertad.nivel)!.para}.</p>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="text-left py-2 pr-2" />
              {NIVELES.map(n => (
                <th key={n.id} className={`text-left py-2 px-2 font-mono text-caption uppercase tracking-wider font-medium ${n.id === libertad.nivel ? 'text-accent-ink' : 'text-ink-3'}`}>{n.titulo}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FILAS.map(f => {
              const elegido = nivelDeFila(libertad, f.id);
              return (
                <tr key={f.id} className="border-t border-hairline">
                  <td className="py-2 pr-2 font-sans text-label text-ink-2 whitespace-nowrap">
                    {f.titulo}
                    {elegido !== libertad.nivel && <span className="ml-2 font-mono text-caption text-accent-ink">retocada</span>}
                  </td>
                  {NIVELES.map(n => {
                    const sel = n.id === elegido;
                    return (
                      <td key={n.id} className="p-1">
                        <button
                          onClick={() => elegirCelda(f.id, n.id)}
                          aria-pressed={sel}
                          className={`w-full text-left px-2 py-2 rounded-control border font-sans text-label transition-colors ${sel ? 'bg-accent-bg border-accent-line text-ink font-bold' : 'border-transparent text-ink-3 hover:text-ink hover:border-hairline'}`}
                        >{textoDeCelda(f.id, n.id)}</button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="font-sans text-caption text-ink-3">Toca una celda para retocar solo esa fila en este cliente.</p>
        {retocadas > 0 && (
          <button onClick={() => void cambiar(conNivel(libertad.nivel))} className="font-sans text-caption text-accent-ink hover:text-ink flex-shrink-0">Quitar retoques</button>
        )}
      </div>
    </div>
  );
}
