import React, { useMemo, useState } from 'react';
import { useToast } from '../../../hooks/useToast';
import { useServiciosDe, useActualizarServicio } from '../hooks/useServicios';
import { useSuscripcionesDe } from '../hooks/useSuscripciones';
import { formatEuros } from '../lib/dinero';
import { formatDia, tiempoRelativo, hoyISO } from '../lib/fechas';
import { renovacionesDelMes, mesDe, tasaDeRenovacion } from '../lib/metricas';
import DataTable, { Columna } from './DataTable';
import EmptyState from './EmptyState';
import MetricCard from './MetricCard';
import SuscripcionesBlock from './SuscripcionesBlock';
import type { Cliente, CrmServicio, ResultadoRenovacion } from '../types';
import { Badge, Icon } from '../../../components/ui';

/* Renovaciones ya no es «la pantalla de las suscripciones»: son los SERVICIOS
   que caducan y qué ha pasado con cada uno (docs/crm-modelo-v2.md).

   El motivo es que una suscripción era un tercer concepto —con su concepto, su
   importe y su periodicidad propios— que no apuntaba a ningún servicio, así que
   el dinero que generaba no se podía atribuir a nada. Un servicio con fecha de
   fin contesta lo mismo y además cuadra con el resto del CRM.

   Las suscripciones que ya existen se siguen enseñando debajo para no perder
   nada de vista, pero no se crean nuevas. */

const RESULTADO: Record<ResultadoRenovacion, { label: string; tone: 'success' | 'danger' | 'warning' }> = {
  renovado:  { label: 'Renovado',  tone: 'success' },
  perdido:   { label: 'Perdido',   tone: 'danger' },
  pendiente: { label: 'Pendiente', tone: 'warning' },
};

export default function RenovacionesTab({ cliente, coachEmail }: { cliente: Cliente; coachEmail: string }) {
  const { showToast } = useToast();
  const { data: servicios = [], isPending, isError } = useServiciosDe(cliente.id);
  const { data: suscripciones = [] } = useSuscripcionesDe(cliente.id);
  const actualizar = useActualizarServicio(cliente.id);
  const [mes, setMes] = useState(() => mesDe(hoyISO()));

  const hoy = hoyISO();

  // Los contratos con fecha de fin, del más próximo al más lejano: los que
  // vencen pronto son los que hay que trabajar.
  const conVencimiento = useMemo(
    () => servicios
      .filter(s => !s.archivado && s.fechaFin)
      .sort((a, b) => a.fechaFin!.localeCompare(b.fechaFin!)),
    [servicios],
  );

  const resumen = useMemo(() => renovacionesDelMes(servicios, mes), [servicios, mes]);
  const tasa = useMemo(() => tasaDeRenovacion(servicios), [servicios]);

  const marcar = async (s: CrmServicio, resultado: ResultadoRenovacion) => {
    try {
      await actualizar.mutateAsync({ id: s.id, updates: { resultadoRenovacion: resultado } });
      showToast(resultado === 'renovado' ? 'Marcado como renovado' : resultado === 'perdido' ? 'Marcado como perdido' : 'Vuelve a estar pendiente', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se ha podido guardar', 'error');
    }
  };

  const columnas: Columna<CrmServicio>[] = [
    {
      id: 'servicio',
      header: 'Servicio',
      render: s => (
        <div className="min-w-0">
          <p className="font-bold truncate">{s.nombre}</p>
          {s.tipo && <p className="font-mono text-caption text-ink-3">{s.tipo}</p>}
        </div>
      ),
    },
    {
      id: 'finaliza',
      header: 'Finaliza',
      width: '150px',
      render: s => (
        <div>
          <p className={s.fechaFin! < hoy ? 'text-ink-3' : ''}>{formatDia(s.fechaFin)}</p>
          <p className="font-mono text-caption text-ink-3">{tiempoRelativo(s.fechaFin)}</p>
        </div>
      ),
    },
    {
      id: 'importe',
      header: 'Importe',
      width: '110px',
      align: 'right',
      render: s => <span className="font-bold">{formatEuros(s.importeCents)}</span>,
    },
    {
      id: 'estado',
      header: 'Cómo acabó',
      width: '210px',
      render: s => {
        const r = s.resultadoRenovacion ?? 'pendiente';
        return (
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge tone={RESULTADO[r].tone}>{RESULTADO[r].label}</Badge>
            {/* Se puede corregir siempre: marcar «perdido» por error y no
                poder deshacerlo falsearía la tasa de renovación para siempre. */}
            {(['renovado', 'perdido', 'pendiente'] as ResultadoRenovacion[])
              .filter(v => v !== r)
              .map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={e => { e.stopPropagation(); void marcar(s, v); }}
                  className="font-mono text-caption text-ink-3 hover:text-accent underline underline-offset-2 transition-colors"
                >{RESULTADO[v].label.toLowerCase()}</button>
              ))}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <MetricCard icon="calendar_month" label="Previsto" value={formatEuros(resumen.previstoCents)} sub="vence este mes" />
        <MetricCard icon="check_circle" label="Renovado" value={formatEuros(resumen.renovadoCents)} accent="var(--color-success)" />
        <MetricCard icon="schedule" label="Pendiente" value={formatEuros(resumen.pendienteCents)} accent="var(--color-warning)" />
        <MetricCard icon="trending_down" label="Perdido" value={formatEuros(resumen.perdidoCents)} accent="var(--color-danger)" />
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <label className="flex items-center gap-2 font-sans text-caption text-ink-2">
          Mes
          <input
            type="month"
            value={mes}
            onChange={e => setMes(e.target.value)}
            className="bg-field border border-hairline rounded-control px-2 py-1 font-mono text-caption text-ink"
          />
        </label>
        {tasa != null && (
          <span className="font-mono text-caption text-ink-2">
            Tasa de renovación de este cliente: <strong className="text-ink">{tasa} %</strong>
          </span>
        )}
      </div>

      <DataTable
        columnas={columnas}
        filas={conVencimiento}
        keyOf={s => s.id}
        cargando={isPending}
        error={isError}
        vacio={
          <EmptyState
            icon="autorenew"
            titulo="Ningún contrato con fecha de fin"
            descripcion="Las renovaciones salen de los servicios que caducan. Ponle una fecha de fin a un servicio y aparecerá aquí."
          />
        }
      />

      {/* Las suscripciones de antes. No se crean nuevas —una suscripción es un
          servicio con renovación automática— pero las que hay se siguen viendo
          para no perderlas de vista. */}
      {suscripciones.length > 0 && (
        <div className="space-y-2 pt-2">
          <p className="flex items-center gap-1.5 font-mono text-caption text-ink-3 uppercase tracking-wider">
            <Icon name="history" size="s" />
            Suscripciones antiguas
          </p>
          <SuscripcionesBlock
            suscripciones={suscripciones}
            cargando={false}
            error={false}
            mostrarCliente={false}
            coachEmail={coachEmail}
          />
        </div>
      )}
    </div>
  );
}
