import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { OnboardingData, Recipe, RecipeFavorites } from '../../types';
import { getOnboarding, getRecipeFavorites, saveRecipeFavorites, updateOnboardingFoods } from '../../dbService';
import { useToast } from '../../hooks/useToast';
import { fotoDeReceta } from '../../utils/fotoDeReceta';
import type { ResultadoDeArranque } from '../../utils/arranqueDeGustos';
import FotoDeReceta from '../FotoDeReceta';
import { Button, Dialog, Icon } from '../ui';
import ArranqueDeGustos, { leerBorrador, useRecetasDeArranque, type ModoDeArranque } from './ArranqueDeGustos';

/* ═══════════════════════════════════════════════════════════════════════════
   «Tus gustos»: lo que el atleta ha ido diciendo que le gusta y que no, siempre
   a mano desde «Mi menú» (Dani, 16-11-2026: «que los pueda editar desde este
   menú… por si quiere añadir información de platos más tarde o mejorar mucho
   más la personalización»).

   Tres cosas: ver más platos (diez que aún no ha visto), corregir una
   respuesta (pasarla al otro lado o quitarla) y quitar un alimento que se
   apuntó como «me gusta» o «no quiero». Todo cuenta para el PRÓXIMO menú.
   ═══════════════════════════════════════════════════════════════════════════ */

type GuardarArranque = (r: ResultadoDeArranque) => Promise<void>;

interface Props {
  email: string;
  onCerrar: () => void;
  /** Solo para el banco de pruebas: con él, nada se escribe en Firestore. */
  guardar?: GuardarArranque;
}

export default function TusGustos({ email, onCerrar, guardar }: Props) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const enBanco = !!guardar;
  const { data: favoritos } = useQuery({ queryKey: ['recipeFavorites', email], queryFn: () => getRecipeFavorites(email) });
  const { data: onboarding = null } = useQuery({ queryKey: ['onboarding', email], queryFn: () => getOnboarding(email) });
  const { data: porSlot, isPending: cargandoRecetas } = useRecetasDeArranque();
  const [lado, setLado] = useState<'si' | 'no'>('si');
  const [ronda, setRonda] = useState<ModoDeArranque | null>(null);

  const porId = useMemo(() => new Map<string, Recipe>((porSlot ?? []).flat().map(r => [r.id, r])), [porSlot]);
  const arranque = favoritos?.arranque;
  const si = arranque?.si ?? [];
  const no = arranque?.no ?? [];
  const liked = onboarding?.likedFoods ?? [];
  const disliked = onboarding?.dislikedFoods ?? [];

  async function guardarRespuestas(siguienteSi: string[], siguienteNo: string[]) {
    if (!favoritos || !arranque) return;
    const favs: RecipeFavorites = { ...favoritos, arranque: { ...arranque, si: siguienteSi, no: siguienteNo } };
    queryClient.setQueryData<RecipeFavorites>(['recipeFavorites', email], favs);
    try {
      if (!enBanco) await saveRecipeFavorites(favs);
    } catch {
      queryClient.setQueryData<RecipeFavorites>(['recipeFavorites', email], favoritos);
      showToast('No se ha podido guardar. Inténtalo otra vez.');
    }
  }
  const mover = (id: string, a: 'si' | 'no') => guardarRespuestas(
    a === 'si' ? [...si.filter(x => x !== id), id] : si.filter(x => x !== id),
    a === 'no' ? [...no.filter(x => x !== id), id] : no.filter(x => x !== id),
  );
  const quitar = (id: string) => guardarRespuestas(si.filter(x => x !== id), no.filter(x => x !== id));

  async function guardarAlimentos(siguienteLiked: string[], siguienteDisliked: string[]) {
    const previo = onboarding;
    queryClient.setQueryData<OnboardingData | null>(['onboarding', email], p => (p ? { ...p, likedFoods: siguienteLiked, dislikedFoods: siguienteDisliked } : p));
    try {
      if (!enBanco) await updateOnboardingFoods(email, siguienteLiked, siguienteDisliked);
    } catch {
      queryClient.setQueryData<OnboardingData | null>(['onboarding', email], previo);
      showToast('No se ha podido guardar. Inténtalo otra vez.');
    }
  }

  if (ronda) return <ArranqueDeGustos email={email} modo={ronda} guardar={guardar} onCerrar={() => setRonda(null)} />;

  const lista = (lado === 'si' ? si : no).slice().reverse(); // lo último que contestó, arriba
  const [a, m, d] = (arranque?.hechoEn ?? '').split('-');
  const chip = (texto: string, onQuitar: () => void) => (
    <span key={texto} className="inline-flex items-center gap-1 pl-3 pr-1 py-1 rounded-control bg-raised border border-hairline font-sans text-caption text-ink">
      {texto}
      <button type="button" onClick={onQuitar} title={`Quitar ${texto}`} className="w-7 h-7 rounded-full flex items-center justify-center text-ink-3 hover:text-ink">
        <Icon name="close" size="s" />
      </button>
    </span>
  );

  return (
    <Dialog open onClose={onCerrar} size="l" title="Tus gustos">
      <div className="space-y-4">
        <div className="p-4 bg-surface border border-hairline rounded-surface">
          <p className="font-sans text-body-s text-ink">Cuanto más me cuentes, más acierta tu menú.</p>
          <p className="font-sans text-caption text-ink-2 mt-1">
            {si.length} platos te gustan · {no.length} no{arranque ? ` · al día el ${d}-${m}-${a}` : ''}. Los cambios cuentan para tu próximo menú.
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <Button size="s" variant="primary" icon="add" onClick={() => setRonda('mas')}>Ver más platos</Button>
            <Button size="s" variant="ghost" onClick={() => setRonda('ronda')}>Repetir los 40</Button>
          </div>
        </div>

        <div>
          <div className="grid grid-cols-2 gap-1 p-1 bg-raised rounded-control">
            {([['si', `Te gustan · ${si.length}`], ['no', `No · ${no.length}`]] as const).map(([id, texto]) => (
              <button
                key={id}
                type="button"
                onClick={() => setLado(id)}
                aria-pressed={lado === id}
                className={`py-2 rounded-lg font-sans text-label font-bold transition-colors ${lado === id ? 'bg-surface text-ink shadow-sm' : 'text-ink-3 hover:text-ink'}`}
              >{texto}</button>
            ))}
          </div>
          {cargandoRecetas ? (
            <div className="flex items-center justify-center py-8"><Icon name="progress_activity" size="l" className="text-accent-ink animate-spin" /></div>
          ) : lista.length === 0 ? (
            <p className="font-sans text-label text-ink-3 text-center py-6">
              {lado === 'si' ? 'Todavía no has marcado ningún plato que te guste.' : 'No has descartado ningún plato.'}
            </p>
          ) : (
            <ul className="mt-2">
              {lista.map(id => {
                const r = porId.get(id);
                // Receta que ya no está en su recetario: no se enseña, pero tampoco se pierde.
                if (!r) return null;
                return (
                  <li key={id} className="flex items-center gap-3 py-2 border-b border-hairline last:border-0">
                    <div className="w-10 h-10 rounded-control overflow-hidden flex-shrink-0 bg-raised">
                      <FotoDeReceta src={fotoDeReceta(r)} alt="" className="w-full h-full object-cover" fallback={null} />
                    </div>
                    <p className="flex-1 min-w-0 font-sans text-body-s text-ink truncate">{r.name}</p>
                    <button
                      type="button"
                      onClick={() => void mover(id, lado === 'si' ? 'no' : 'si')}
                      title={lado === 'si' ? 'Pasar a «No»' : 'Pasar a «Te gustan»'}
                      className="w-9 h-9 rounded-control bg-surface border border-hairline flex items-center justify-center text-ink-2 hover:text-ink flex-shrink-0"
                    >
                      <Icon name={lado === 'si' ? 'thumb_down' : 'favorite'} size="m" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void quitar(id)}
                      title="Quitar la respuesta"
                      className="w-9 h-9 rounded-control bg-surface border border-hairline flex items-center justify-center text-ink-2 hover:text-ink flex-shrink-0"
                    >
                      <Icon name="close" size="m" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {(liked.length > 0 || disliked.length > 0) && (
          <div className="space-y-3">
            {liked.length > 0 && (
              <div>
                <p className="font-mono text-caption text-ink-3 uppercase mb-2">Alimentos que te gustan</p>
                <div className="flex flex-wrap gap-1.5">{liked.map(f => chip(f, () => void guardarAlimentos(liked.filter(x => x !== f), disliked)))}</div>
              </div>
            )}
            {disliked.length > 0 && (
              <div>
                <p className="font-mono text-caption text-ink-3 uppercase mb-2">Alimentos que no quieres</p>
                <div className="flex flex-wrap gap-1.5">{disliked.map(f => chip(f, () => void guardarAlimentos(liked, disliked.filter(x => x !== f))))}</div>
              </div>
            )}
            <p className="font-sans text-caption text-ink-3">Para añadir alimentos, ve a Perfil › Preferencias.</p>
          </div>
        )}
      </div>
    </Dialog>
  );
}

/**
 * La entrada a los gustos. Mientras no ha hecho el arranque, un aviso para
 * empezarlo (o seguirlo). Después, la puerta a «Tus gustos», donde ve más
 * platos y corrige lo que contestó: en «Mi menú» (`enMiMenu`) como una fila
 * fina, siempre a mano; en Perfil › Preferencias como tarjeta.
 */
export function TarjetaDeArranque({ email, enMiMenu = false, guardar }: { email: string; enMiMenu?: boolean; guardar?: GuardarArranque }) {
  const [abierto, setAbierto] = useState(false);
  const { data: favoritos, isPending } = useQuery({ queryKey: ['recipeFavorites', email], queryFn: () => getRecipeFavorites(email) });
  const hecho = favoritos?.arranque;
  const aMedias = !hecho && (leerBorrador(email)?.respuestas.length ?? 0) > 0;
  if (isPending) return null;
  const resumen = hecho ? `${hecho.si.length} te gustan · ${hecho.no.length} no` : '';
  return (
    <>
      {hecho && enMiMenu ? (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-surface border border-hairline bg-surface text-left hover:border-accent/40 transition-colors"
        >
          <Icon name="favorite" size="m" className="text-accent-ink flex-shrink-0" />
          <span className="flex-1 min-w-0">
            <span className="block font-sans font-bold text-body-s text-ink">Tus gustos</span>
            <span className="block font-sans text-caption text-ink-2 truncate">{resumen} · mira más platos o cámbialos</span>
          </span>
          <Icon name="chevron_right" size="m" className="text-ink-3 flex-shrink-0" />
        </button>
      ) : (
        <div className={`flex items-center gap-3 p-4 rounded-surface border ${hecho ? 'bg-surface border-hairline' : 'bg-accent-bg border-accent-line'}`}>
          <span className="flex-shrink-0 w-10 h-10 rounded-full bg-accent/15 flex items-center justify-center">
            <Icon name="favorite" size="m" className="text-accent-ink" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-sans font-bold text-body-s text-ink">{hecho ? 'Tus gustos' : 'Enséñame qué te gusta'}</p>
            <p className="font-sans text-caption text-ink-2">
              {hecho
                ? resumen
                : aMedias ? 'Lo dejaste a medias. Sigue donde lo dejaste.' : '40 platos, sí o no. Dos minutos y tu menú acierta más.'}
            </p>
          </div>
          <Button size="s" variant={hecho ? 'secondary' : 'primary'} onClick={() => setAbierto(true)}>{hecho ? 'Editar' : aMedias ? 'Seguir' : 'Empezar'}</Button>
        </div>
      )}
      {abierto && (hecho
        ? <TusGustos email={email} guardar={guardar} onCerrar={() => setAbierto(false)} />
        : <ArranqueDeGustos email={email} guardar={guardar} onCerrar={() => setAbierto(false)} />)}
    </>
  );
}
