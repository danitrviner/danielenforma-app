import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '../../../hooks/useToast';
import { importarCrmContactosBatch } from '../../../dbService';
import { useClientes } from '../hooks/useClientes';
import { crmKeys } from '../lib/crmQueries';
import {
  parsearArchivoClientes, detectarDuplicados, filaAContacto,
  type ResultadoParseo, type AvisoDuplicado, type FilaImportada,
} from '../lib/importar';
import Modal, { BotonPrimario, BotonSecundario } from './Modal';

type Paso = 'elegir' | 'analizando' | 'previa' | 'importando' | 'hecho';

// Tres pasos: elegir fichero → previsualizar filas válidas/con error/duplicadas
// → confirmar. Nada se escribe hasta que el coach pulsa «Importar» en el paso
// de previa — parsear un fichero no toca Firestore.
export default function ImportarClientes({ onCerrar }: { onCerrar: () => void }) {
  const { showToast } = useToast();
  const qc = useQueryClient();
  const { clientes } = useClientes();

  const [paso, setPaso] = useState<Paso>('elegir');
  const [nombreArchivo, setNombreArchivo] = useState('');
  const [resultado, setResultado] = useState<ResultadoParseo | null>(null);
  const [duplicados, setDuplicados] = useState<AvisoDuplicado[]>([]);
  const [filasExcluidas, setFilasExcluidas] = useState<Set<number>>(new Set());
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [importados, setImportados] = useState(0);

  const onSeleccionArchivo = async (file: File) => {
    setNombreArchivo(file.name);
    setPaso('analizando');
    setErrorGeneral(null);
    try {
      const res = await parsearArchivoClientes(file);
      if (res.filas.length === 0) {
        setErrorGeneral(
          res.cabecerasNoReconocidas.length > 0
            ? `No he encontrado una columna de nombre. Cabeceras vistas: ${res.cabecerasNoReconocidas.join(', ')}`
            : 'El fichero no tiene filas de datos.'
        );
        setPaso('elegir');
        return;
      }
      const avisos = detectarDuplicados(
        res.validas,
        clientes.map(c => ({ id: c.id, nombre: c.nombre, dni: c.dni, email: c.email }))
      );
      setResultado(res);
      setDuplicados(avisos);
      // Los duplicados se excluyen de la importación por defecto — el coach los
      // reactiva a mano fila por fila si de verdad quiere dos entradas.
      setFilasExcluidas(new Set(avisos.map(a => a.fila.fila)));
      setPaso('previa');
    } catch (err) {
      setErrorGeneral(err instanceof Error ? err.message : 'No se ha podido leer el fichero.');
      setPaso('elegir');
    }
  };

  const toggleFila = (numFila: number) => {
    setFilasExcluidas(prev => {
      const next = new Set(prev);
      if (next.has(numFila)) next.delete(numFila); else next.add(numFila);
      return next;
    });
  };

  const aImportar = (resultado?.validas ?? []).filter(f => !filasExcluidas.has(f.fila));

  const confirmar = async () => {
    if (aImportar.length === 0) return;
    setPaso('importando');
    try {
      const n = await importarCrmContactosBatch(aImportar.map(f => filaAContacto(f)));
      setImportados(n);
      setPaso('hecho');
      qc.invalidateQueries({ queryKey: crmKeys.contactos });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Fallo al importar', 'error');
      setPaso('previa');
    }
  };

  return (
    <Modal
      titulo="Importar clientes"
      onCerrar={onCerrar}
      footer={
        paso === 'previa' ? (
          <>
            <BotonSecundario onClick={onCerrar}>Cancelar</BotonSecundario>
            <BotonPrimario onClick={confirmar} disabled={aImportar.length === 0}>
              Importar {aImportar.length} {aImportar.length === 1 ? 'cliente' : 'clientes'}
            </BotonPrimario>
          </>
        ) : paso === 'hecho' ? (
          <BotonPrimario onClick={onCerrar}>Cerrar</BotonPrimario>
        ) : undefined
      }
    >
      {paso === 'elegir' && (
        <div className="space-y-3">
          <label className="flex flex-col items-center justify-center gap-2 py-10 rounded-control border-2 border-dashed border-white/12 hover:border-accent/40 cursor-pointer transition-colors">
            <span className="material-symbols-outlined text-2xl text-ink-3">upload_file</span>
            <span className="font-sans text-[11px] text-ink-2">Arrastra o elige un .xlsx o .csv</span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) onSeleccionArchivo(f); }}
            />
          </label>
          {errorGeneral && (
            <p className="flex items-start gap-1.5 px-2.5 py-2 rounded-surface bg-danger/10 border border-danger/25 font-sans text-[10px] text-danger">
              <span className="material-symbols-outlined text-[13px] shrink-0">error</span>
              {errorGeneral}
            </p>
          )}
          <p className="font-mono text-[9px] text-ink-3 leading-relaxed">
            Columnas reconocidas: nombre (obligatoria), email, dni/nif, teléfono, dirección.
            El nombre exacto de la cabecera no importa mientras sea razonable.
          </p>
        </div>
      )}

      {paso === 'analizando' && (
        <div className="flex flex-col items-center gap-2 py-10">
          <span className="material-symbols-outlined text-2xl text-accent animate-spin">progress_activity</span>
          <p className="font-sans text-[11px] text-ink-2">Leyendo {nombreArchivo}…</p>
        </div>
      )}

      {paso === 'previa' && resultado && (
        <PrevisualizacionImportacion
          nombreArchivo={nombreArchivo}
          resultado={resultado}
          duplicados={duplicados}
          filasExcluidas={filasExcluidas}
          onToggleFila={toggleFila}
        />
      )}

      {paso === 'importando' && (
        <div className="flex flex-col items-center gap-2 py-10">
          <span className="material-symbols-outlined text-2xl text-accent animate-spin">progress_activity</span>
          <p className="font-sans text-[11px] text-ink-2">Importando {aImportar.length} clientes…</p>
        </div>
      )}

      {paso === 'hecho' && (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <span className="material-symbols-outlined text-2xl text-success">check_circle</span>
          <p className="font-sans font-bold text-sm text-ink">
            {importados} {importados === 1 ? 'cliente importado' : 'clientes importados'}
          </p>
          <p className="font-sans text-[11px] text-ink-2">Ya aparecen en la lista de clientes.</p>
        </div>
      )}
    </Modal>
  );
}

function PrevisualizacionImportacion({ nombreArchivo, resultado, duplicados, filasExcluidas, onToggleFila }: {
  nombreArchivo: string;
  resultado: ResultadoParseo;
  duplicados: AvisoDuplicado[];
  filasExcluidas: Set<number>;
  onToggleFila: (numFila: number) => void;
}) {
  const duplicadosPorFila = new Map<number, AvisoDuplicado>();
  for (const d of duplicados) duplicadosPorFila.set(d.fila.fila, d);

  // "Listas" = filas válidas que se importarán con la selección actual (una
  // fila puede tener más de un aviso de duplicado — por DNI y por email a la
  // vez — así que se cuenta por número de fila único, no por aviso).
  const listasParaImportar = resultado.validas.filter(f => !filasExcluidas.has(f.fila)).length;

  return (
    <div className="space-y-3">
      <p className="font-mono text-[9px] uppercase tracking-widest text-ink-3">{nombreArchivo}</p>

      <div className="grid grid-cols-3 gap-2">
        <Resumen icono="check_circle" color="var(--color-success)" numero={listasParaImportar} label="listas" />
        <Resumen icono="content_copy" color="var(--color-warning)" numero={duplicadosPorFila.size} label="posibles duplicados" />
        <Resumen icono="error" color="var(--color-danger)" numero={resultado.conError.length} label="con error" />
      </div>

      {resultado.cabecerasNoReconocidas.length > 0 && (
        <p className="font-mono text-[9px] text-ink-3">
          Columnas ignoradas (no reconocidas): {resultado.cabecerasNoReconocidas.join(', ')}
        </p>
      )}

      <div className="max-h-[280px] overflow-y-auto custom-scrollbar border border-hairline rounded-surface divide-y divide-white/4">
        {resultado.filas.map(fila => (
          <FilaPreview
            key={fila.fila}
            fila={fila}
            duplicado={duplicadosPorFila.get(fila.fila)}
            excluida={filasExcluidas.has(fila.fila)}
            onToggle={() => onToggleFila(fila.fila)}
          />
        ))}
      </div>
    </div>
  );
}

function Resumen({ icono, color, numero, label }: { icono: string; color: string; numero: number; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1 py-2 rounded-surface bg-white/4">
      <span className="material-symbols-outlined text-base" style={{ color }}>{icono}</span>
      <span className="font-sans font-black text-base text-ink tabular-nums">{numero}</span>
      <span className="font-mono text-[8px] uppercase tracking-widest text-ink-3">{label}</span>
    </div>
  );
}

function FilaPreview({ fila, duplicado, excluida, onToggle }: {
  fila: FilaImportada; duplicado?: AvisoDuplicado; excluida: boolean; onToggle: () => void; key?: React.Key;
}) {
  const conError = fila.errores.length > 0;
  return (
    <div className={`flex items-start gap-2 px-2.5 py-2 ${excluida ? 'opacity-40' : ''}`}>
      {!conError && (
        <input
          type="checkbox"
          checked={!excluida}
          onChange={onToggle}
          className="mt-0.5 accent-accent"
          aria-label={`Incluir a ${fila.nombre}`}
        />
      )}
      {conError && <span className="material-symbols-outlined text-[13px] text-danger mt-0.5">error</span>}
      <div className="min-w-0 flex-1">
        <p className="font-sans text-[11px] text-ink truncate">
          {fila.nombre || <span className="text-ink-3">(sin nombre) — fila {fila.fila}</span>}
        </p>
        {(fila.email || fila.dni) && (
          <p className="font-mono text-[9px] text-ink-3 truncate">
            {[fila.email, fila.dni].filter(Boolean).join(' · ')}
          </p>
        )}
        {conError && (
          <p className="font-sans text-[10px] text-danger mt-0.5">{fila.errores.join('. ')}</p>
        )}
        {duplicado && (
          <p className="font-sans text-[10px] text-warning mt-0.5">
            Ya existe {duplicado.clienteExistente.nombre || 'un cliente'} con el mismo {duplicado.motivo === 'dni' ? 'DNI' : 'email'}
            {excluida ? ' — excluido' : ' — se importará igualmente'}
          </p>
        )}
      </div>
    </div>
  );
}
