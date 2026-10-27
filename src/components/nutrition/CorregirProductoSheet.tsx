import React, { useState } from 'react';
import { Sheet, Button, Input, Banner, Icon } from '../ui';
import ScannerSheet from './ScannerSheet';
import { resolverProducto, ATRIBUCION_OFF } from '../../services/openFoodFacts';
import { guardarProductoCorregido, borrarProductoCorregido, getProductoCorregido } from '../../db/productosCorregidos';
import { esIncompleto, type OffProducto } from '../../utils/productoOff';
import { soloDigitos, esCodigoValido } from '../../utils/codigoBarras';

/* ═══════════════════════════════════════════════════════════════════════════
   Corregir un producto de supermercado (solo el coach)

   Se busca por código (escrito o escaneado), se enseñan los datos que tiene
   ahora —la corrección anterior, la copia de Open Food Facts o su consulta en
   directo— y lo que se guarde manda para todos los atletas desde ese momento.
   Las kcal se comprueban con los macros igual que al crear un alimento.
   ═══════════════════════════════════════════════════════════════════════════ */

const VACIO = { nombre: '', marca: '', kcal: '', hc: '', prot: '', grasa: '', racion: '' };
type Form = typeof VACIO;

const aNumero = (t: string): number | null => {
  const n = parseFloat(t.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const txt = (n: number | undefined) => (n == null ? '' : String(n));

interface Props {
  onClose: () => void;
  onGuardado: (mensaje: string) => void;
}

export default function CorregirProductoSheet({ onClose, onGuardado }: Props) {
  const [codigo, setCodigo] = useState('');
  const [escaner, setEscaner] = useState(false);
  const [cargado, setCargado] = useState<{ codigo: string; corregido: boolean } | null>(null);
  const [form, setForm] = useState<Form>(VACIO);
  const [estado, setEstado] = useState<{ tono: 'info' | 'danger'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const buscar = async (crudo: string) => {
    const c = soloDigitos(crudo);
    setCodigo(c);
    setEstado(null);
    if (!esCodigoValido(c)) { setEstado({ tono: 'danger', texto: 'Ese código no es válido. Revisa los números.' }); return; }
    setOcupado(true);
    try {
      const [corregido, actual] = await Promise.all([getProductoCorregido(c), resolverProducto(c)]);
      setCargado({ codigo: actual?.c ?? c, corregido: !!corregido });
      if (actual && !esIncompleto(actual)) {
        setForm({ nombre: actual.n, marca: actual.b, kcal: txt(actual.k), hc: txt(actual.h), prot: txt(actual.p), grasa: txt(actual.g), racion: txt(actual.s) });
      } else {
        setForm({ ...VACIO, nombre: actual?.n ?? '', marca: actual?.b ?? '' });
        setEstado({ tono: 'info', texto: actual ? 'Open Food Facts lo conoce, pero sin datos completos. Complétalo con la etiqueta.' : 'No está en Open Food Facts. Créalo con la etiqueta.' });
      }
    } catch {
      setEstado({ tono: 'danger', texto: 'No se ha podido consultar el producto. Comprueba la conexión.' });
    } finally {
      setOcupado(false);
    }
  };

  const k = aNumero(form.kcal); const p = aNumero(form.prot); const h = aNumero(form.hc); const g = aNumero(form.grasa);
  const completo = !!form.nombre.trim() && k !== null && p !== null && h !== null && g !== null;
  const estimadas = completo ? 4 * (p as number) + 4 * (h as number) + 9 * (g as number) : 0;
  const noCuadra = completo && Math.abs((k as number) - estimadas) > Math.max(25, 0.2 * Math.max(k as number, estimadas));

  const guardar = async () => {
    if (!cargado || !completo) return;
    const racion = aNumero(form.racion);
    const producto: OffProducto = {
      c: cargado.codigo, n: form.nombre.trim().slice(0, 120), b: form.marca.trim().slice(0, 60),
      k: Math.round(k as number), p: p as number, h: h as number, g: g as number,
      ...(racion && racion > 0 ? { s: racion } : {}),
    };
    setOcupado(true);
    try {
      await guardarProductoCorregido(producto);
      onGuardado(`«${producto.n}» corregido para todos tus atletas`);
      onClose();
    } catch {
      setEstado({ tono: 'danger', texto: 'No se ha podido guardar. Si es la primera corrección, puede que falte desplegar las reglas de Firestore.' });
      setOcupado(false);
    }
  };

  const quitar = async () => {
    if (!cargado) return;
    setOcupado(true);
    try {
      await borrarProductoCorregido(cargado.codigo);
      onGuardado('Corrección quitada: vuelve a salir con los datos de Open Food Facts');
      onClose();
    } catch {
      setEstado({ tono: 'danger', texto: 'No se ha podido quitar la corrección.' });
      setOcupado(false);
    }
  };

  const set = (campo: keyof Form) => (v: string) => setForm(f => ({ ...f, [campo]: v }));

  return (
    <Sheet
      open
      onClose={onClose}
      title="Corregir un producto"
      alto="completo"
      footer={cargado ? (
        <Button onClick={guardar} disabled={!completo || ocupado} fullWidth>
          {ocupado ? 'Guardando…' : 'Guardar para todos'}
        </Button>
      ) : undefined}
    >
      <div className="space-y-5 pt-2">
        <p className="font-sans text-body-s text-ink-2">
          Si un producto escaneado sale con datos mal, corrígelo aquí: lo verán así todos tus atletas.
        </p>
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <Input label="Código de barras" value={codigo} onChange={setCodigo} inputMode="numeric" placeholder="8480000123456" />
          </div>
          <button
            type="button"
            onClick={() => setEscaner(true)}
            aria-label="Escanear código de barras"
            className="flex h-[46px] w-[46px] flex-none items-center justify-center rounded-control bg-surface text-ink-2 hover:text-ink"
          >
            <Icon name="qr_code_scanner" size="m" />
          </button>
        </div>
        <Button variant="secondary" fullWidth disabled={ocupado || !codigo} onClick={() => void buscar(codigo)}>
          {ocupado && !cargado ? 'Buscando…' : 'Buscar'}
        </Button>

        {estado && <Banner tone={estado.tono}>{estado.texto}</Banner>}

        {cargado && (
          <>
            {cargado.corregido && <Banner tone="info">Este producto ya tiene una corrección tuya.</Banner>}
            <Input label="Nombre" value={form.nombre} onChange={set('nombre')} />
            <Input label="Marca" value={form.marca} onChange={set('marca')} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Kcal / 100 g" value={form.kcal} onChange={set('kcal')} inputMode="decimal" />
              <Input label="Hidratos / 100 g" value={form.hc} onChange={set('hc')} inputMode="decimal" />
              <Input label="Proteínas / 100 g" value={form.prot} onChange={set('prot')} inputMode="decimal" />
              <Input label="Grasas / 100 g" value={form.grasa} onChange={set('grasa')} inputMode="decimal" />
            </div>
            <Input label="Ración (g, opcional)" value={form.racion} onChange={set('racion')} inputMode="decimal" />
            {noCuadra && (
              <Banner tone="danger">
                Las kcal no cuadran con los macros ({Math.round(estimadas)} kcal por cálculo). Revisa la etiqueta.
              </Banner>
            )}
            {cargado.corregido && (
              <Button variant="secondary" fullWidth disabled={ocupado} onClick={() => void quitar()}>
                Quitar mi corrección
              </Button>
            )}
            <p className="font-sans text-caption text-ink-3">{ATRIBUCION_OFF}</p>
          </>
        )}
      </div>

      {escaner && (
        <ScannerSheet
          onClose={() => setEscaner(false)}
          onCodigo={c => { setEscaner(false); void buscar(c); }}
        />
      )}
    </Sheet>
  );
}
