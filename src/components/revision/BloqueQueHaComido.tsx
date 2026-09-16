import React, { useState } from 'react';
import { BudgetVec } from '../../types';
import {
  ComidaDeLaSemana, DiaComido, ItemComido, OrigenItem, totalesDeLaVentana,
} from '../../utils/comidaDeLaSemana';
import { MONTHS_ES, fechaCorta } from '../../utils/trainingWeek';
import { Badge, BarraCumplimiento, Collapsible, EmptyState, Icon } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Qué ha comido — la selección real del atleta, no su porcentaje.

   Petición de Dani (16-09-2026). En la Revisión ya se cuenta si cumple; lo que
   faltaba es PODER MIRAR lo que se ha comido: qué eligió, cuánto, y si salió de
   una receta, del menú semanal o se lo puso a mano. Es la diferencia entre
   decirle «vas al 80 %» y decirle «llevas pan seis de siete días y la cena se
   te va dos puntos».

   Tres niveles a propósito, de menos a más detalle: la ventana de un vistazo,
   el día que se abre, y los patrones al final. En el vídeo se recorre el
   primero, se abre un día para ilustrar y se cierra con los patrones.

   Sobre la marca de «comido»: en «Mi plan» todo lo que el atleta añade nace ya
   marcado, así que casi siempre está todo marcado y esa señal informa poco. Se
   enseña igual —cuando de verdad deja algo sin marcar, importa— pero el peso
   de la pantalla está en la selección y en los intercambios, no en el tic. La
   nota al pie lo dice para que nadie lea el 100 % como una medalla.
   ═══════════════════════════════════════════════════════════════════════════ */


const ORIGEN_META: Record<OrigenItem, { label: string; icon: string } | null> = {
  // Lo puesto a mano es el caso normal: no se rotula, para no llenar la tabla
  // de etiquetas que no distinguen nada.
  mano: null,
  receta: { label: 'receta', icon: 'skillet' },
  menu: { label: 'menú', icon: 'menu_book' },
};

function totalDe(v: BudgetVec): number {
  return Math.round((v.HC + v.PROT + v.GRASA) * 10) / 10;
}

function pct(comido: number, cupo: number): number | null {
  return cupo > 0 ? Math.round((comido / cupo) * 100) : null;
}

/** «+2,5» / «−1» / «en su cupo». */
function textoDesvio(desvio: number): { texto: string; color: string } {
  if (Math.abs(desvio) <= 1) return { texto: 'en su cupo', color: 'var(--color-success)' };
  const signo = desvio > 0 ? '+' : '−';
  return {
    texto: `${signo}${Math.abs(desvio).toLocaleString('es-ES', { maximumFractionDigits: 1 })}`,
    color: desvio > 0 ? 'var(--color-warning)' : 'var(--color-ink-2)',
  };
}

function CeldaMacro({ label, comido, cupo }: { label: string; comido: number; cupo: number }) {
  return (
    <div className="min-w-[68px]">
      <span className="font-mono text-caption text-ink-3 uppercase tracking-[.08em] block">{label}</span>
      <span className="font-mono text-label text-ink tabular-nums block">
        {comido.toLocaleString('es-ES', { maximumFractionDigits: 1 })}
        <span className="text-ink-3"> / {cupo.toLocaleString('es-ES', { maximumFractionDigits: 1 })}</span>
      </span>
      <BarraCumplimiento pct={pct(comido, cupo)} />
    </div>
  );
}

/* Sin `@types/react` en el repo, TS no excluye `key` por su cuenta — mismo
   apaño que Badge/ListRow y el resto de los bloques de Revisión. */
function Linea({ item }: { item: ItemComido; key?: React.Key }) {
  const origen = ORIGEN_META[item.origen];
  return (
    <li className="flex items-baseline gap-2 py-1">
      <Icon
        name={item.marcado ? 'check_circle' : 'radio_button_unchecked'}
        size="s"
        className="shrink-0 translate-y-0.5"
        style={{ color: item.marcado ? 'var(--color-success)' : 'var(--color-ink-4)' }}
        label={item.marcado ? 'Marcado como comido' : 'Sin marcar'}
      />
      <span className="font-sans text-label text-ink min-w-0 flex-1 truncate" title={item.etiquetaCompleta}>
        {item.etiqueta}
      </span>
      {origen && (
        <span className="font-mono text-caption text-ink-3 shrink-0 hidden sm:inline-flex items-center gap-1">
          <Icon name={origen.icon} size="s" />{origen.label}
        </span>
      )}
      <span className="font-mono text-caption text-ink-2 tabular-nums shrink-0 w-14 text-right">{item.peso}</span>
      <span className="font-mono text-caption text-ink-3 tabular-nums shrink-0 w-16 text-right">
        {item.categoria === 'MIX_HC' ? '½P+½HC' : item.categoria === 'MIX_GRASA' ? '½P+½G' : item.categoria}
        {' '}×{item.cantidad.toLocaleString('es-ES', { maximumFractionDigits: 2 })}
      </span>
    </li>
  );
}

function DetalleDelDia({ dia }: { dia: DiaComido }) {
  if (dia.comidas.length === 0) {
    return <p className="font-sans text-caption text-ink-3 px-1 py-2">Ese día quedó vacío a propósito: no hay ninguna comida puesta.</p>;
  }
  return (
    <div className="space-y-3 pt-1">
      {dia.comidas.map(comida => (
        <div key={comida.id} className="bg-bg border border-hairline rounded-surface px-3 py-2">
          <div className="flex items-baseline justify-between gap-3 border-b border-hairline pb-1.5">
            <span className="font-sans font-bold text-label text-ink">{comida.nombre}</span>
            <span className="font-mono text-caption text-ink-2 tabular-nums">
              {totalDe(comida.comido).toLocaleString('es-ES', { maximumFractionDigits: 1 })} int.
            </span>
          </div>
          <ul className="divide-y divide-hairline/50">
            {comida.items.map((item, i) => <Linea key={`${comida.id}_${i}`} item={item} />)}
          </ul>
        </div>
      ))}
    </div>
  );
}

function FilaDia({ dia, abierto, onAbrir }: {
  dia: DiaComido; abierto: boolean; onAbrir: () => void; key?: React.Key;
}) {
  if (!dia.registrado) {
    return (
      <li className="px-3 py-2.5 flex items-center gap-3 border-b border-hairline last:border-b-0">
        <span className="font-mono text-caption text-ink-3 tabular-nums w-[84px] shrink-0">{fechaCorta(dia.fecha, { dia: true })}</span>
        <span className="font-sans text-label text-ink-4">Sin registrar</span>
      </li>
    );
  }

  const desvio = textoDesvio(dia.desvio);
  return (
    <li className="border-b border-hairline last:border-b-0">
      <button
        type="button"
        onClick={onAbrir}
        aria-expanded={abierto}
        className="w-full px-3 py-2.5 flex items-center gap-3 text-left hover:bg-raised/50 transition-colors"
      >
        <span className="font-mono text-caption text-ink-2 tabular-nums w-[84px] shrink-0">{fechaCorta(dia.fecha, { dia: true })}</span>
        <span className="flex gap-3 flex-wrap flex-1 min-w-0">
          <CeldaMacro label="HC" comido={dia.comido.HC} cupo={dia.cupo.HC} />
          <CeldaMacro label="Prot" comido={dia.comido.PROT} cupo={dia.cupo.PROT} />
          <CeldaMacro label="Grasa" comido={dia.comido.GRASA} cupo={dia.cupo.GRASA} />
        </span>
        <span className="text-right shrink-0">
          <span className="font-mono text-label text-ink tabular-nums block">
            {dia.kcalComido.toLocaleString('es-ES')}
            <span className="text-ink-3"> / {dia.kcalCupo.toLocaleString('es-ES')}</span>
          </span>
          <span className="font-mono text-caption tabular-nums" style={{ color: desvio.color }}>{desvio.texto}</span>
        </span>
        <Icon name={abierto ? 'expand_less' : 'expand_more'} size="s" className="text-ink-3 shrink-0" />
      </button>
      {abierto && <div className="px-3 pb-3">
        <p className="font-mono text-caption text-ink-3 mb-2">
          {dia.itemsMarcados} de {dia.items} alimentos marcados
        </p>
        <DetalleDelDia dia={dia} />
      </div>}
    </li>
  );
}

interface Props {
  comida: ComidaDeLaSemana;
  /** Cuando está activo, los patrones nacen desplegados. */
  todoAbierto?: boolean;
}

export default function BloqueQueHaComido({ comida, todoAbierto = false }: Props) {
  const [diaAbierto, setDiaAbierto] = useState<string | null>(null);
  const { patrones } = comida;
  const { comido, cupo } = totalesDeLaVentana(comida);

  if (patrones.diasRegistrados === 0) {
    return (
      <EmptyState
        icon="restaurant"
        title="No ha registrado ninguna comida en esta ventana"
        description="Sin registro no se puede saber qué come ni cuánto: lo que hay en su plan es lo que tú le pautaste, no lo que se llevó a la boca."
      />
    );
  }

  const totalComido = totalDe(comido);
  const totalCupo = totalDe(cupo);

  return (
    <div className="space-y-3">
      {/* Los tres números con los que se abre: cuánto de su cupo se comió, en
          cuántos días y con qué constancia. */}
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
        <span className="font-mono text-label text-ink tabular-nums">
          {totalComido.toLocaleString('es-ES', { maximumFractionDigits: 1 })}
          <span className="text-ink-3"> de {totalCupo.toLocaleString('es-ES', { maximumFractionDigits: 1 })} intercambios</span>
        </span>
        <span className="font-mono text-caption text-ink-2">
          {patrones.kcalMediaComido.toLocaleString('es-ES')} kcal de media al día
          {patrones.kcalMediaCupo > 0 && <span className="text-ink-3"> · pautadas {patrones.kcalMediaCupo.toLocaleString('es-ES')}</span>}
        </span>
        <span className="flex items-center gap-2">
          <Badge tone={patrones.diasSinRegistrar === 0 ? 'success' : 'warning'}>
            {patrones.diasRegistrados} de {patrones.diasRegistrados + patrones.diasSinRegistrar} días registrados
          </Badge>
        </span>
      </div>

      <ul className="bg-raised border border-hairline rounded-surface overflow-hidden">
        {comida.dias.map(dia => (
          <FilaDia
            key={dia.fecha}
            dia={dia}
            abierto={diaAbierto === dia.fecha}
            onAbrir={() => setDiaAbierto(d => (d === dia.fecha ? null : dia.fecha))}
          />
        ))}
      </ul>

      <Collapsible
        key={`patrones-${todoAbierto}`}
        defaultOpen={todoAbierto}
        trigger={
          <span className="flex items-baseline gap-2">
            <span className="font-sans font-bold text-label text-ink">Lo que se repite</span>
            <span className="font-mono text-caption text-ink-3">
              {patrones.diasPorEncima > 0 || patrones.diasPorDebajo > 0
                ? `${patrones.diasPorEncima} días por encima · ${patrones.diasPorDebajo} por debajo`
                : 'sin días fuera de su cupo'}
            </span>
          </span>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {patrones.alimentosFrecuentes.length > 0 && (
            <div>
              <span className="font-mono text-caption text-ink-3 uppercase tracking-[.08em] block mb-1.5">
                Lo que más come
              </span>
              {/* Ocho, no cinco: los que come a diario ya ocupan los primeros
                  puestos, y lo que informa de verdad —qué proteína rota, qué
                  hidrato alterna— empieza justo después de ellos. */}
              <ul className="space-y-0.5">
                {patrones.alimentosFrecuentes.slice(0, 8).map(a => (
                  <li key={a.etiqueta} className="flex items-baseline justify-between gap-3">
                    <span className="font-sans text-label text-ink-2 truncate">{a.etiqueta}</span>
                    <span className="font-mono text-caption text-ink-3 tabular-nums shrink-0">
                      {a.dias} {a.dias === 1 ? 'día' : 'días'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-4">
            {patrones.porComida.length > 0 && (
              <div>
                <span className="font-mono text-caption text-ink-3 uppercase tracking-[.08em] block mb-1.5">
                  Dónde se le va el cupo
                </span>
                <ul className="space-y-0.5">
                  {patrones.porComida.slice(0, 4).map(c => {
                    const d = textoDesvio(c.desvioMedio);
                    return (
                      <li key={c.nombre} className="flex items-baseline justify-between gap-3">
                        <span className="font-sans text-label text-ink-2 truncate">{c.nombre}</span>
                        <span className="font-mono text-caption tabular-nums shrink-0" style={{ color: d.color }}>
                          {d.texto}{d.texto !== 'en su cupo' && ' int.'}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <div>
              <span className="font-mono text-caption text-ink-3 uppercase tracking-[.08em] block mb-1.5">
                De dónde sale lo que come
              </span>
              <p className="font-sans text-label text-ink-2">
                {patrones.porOrigen.mano} a mano · {patrones.porOrigen.receta} de recetas · {patrones.porOrigen.menu} del menú
              </p>
            </div>
          </div>
        </div>
      </Collapsible>

      <p className="font-mono text-caption text-ink-3">
        Los intercambios son los que el atleta ha marcado como comidos. En «Mi plan» todo lo que añade nace ya
        marcado, así que el tic dice sobre todo que lo apuntó: lo que de verdad informa es la selección de
        alimentos y cuánto suma frente a su cupo. Un día sin registrar no es un día sin comer.
      </p>
    </div>
  );
}
