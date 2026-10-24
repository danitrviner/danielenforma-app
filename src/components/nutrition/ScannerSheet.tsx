import React, { useEffect, useRef, useState } from 'react';
import { Sheet, Button, Input, Banner } from '../ui';
import { haptics } from '../../services/haptics';
import { esCodigoValido, soloDigitos } from '../../utils/codigoBarras';

/* ═══════════════════════════════════════════════════════════════════════════
   Escáner de código de barras (D-04)

   Abre la cámara trasera, lee EAN-13/EAN-8/UPC con ZXing y entrega el primer
   código con dígito de control válido. ZXing se carga al abrir la hoja (no pesa
   en el resto de la app). La cámara se apaga SIEMPRE al cerrar: sin eso la luz
   se queda encendida y la batería se va.

   Escribir el código a mano está siempre a la vista: es la salida cuando la
   cámara está denegada o no existe, y cuando un código mal impreso no se lee.
   ═══════════════════════════════════════════════════════════════════════════ */

type Estado = 'abriendo' | 'leyendo' | 'denegada' | 'sinCamara' | 'error';

type Props = { onCodigo: (codigo: string) => void; onClose: () => void };

const MENSAJE: Record<Exclude<Estado, 'abriendo' | 'leyendo'>, string> = {
  denegada: 'No tenemos permiso para usar la cámara. Puedes activarlo en los ajustes del navegador o escribir el código debajo.',
  sinCamara: 'No se ha encontrado ninguna cámara. Escribe el código debajo.',
  error: 'No se ha podido abrir la cámara. Escribe el código debajo.',
};

export default function ScannerSheet({ onCodigo, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [estado, setEstado] = useState<Estado>('abriendo');
  const [manual, setManual] = useState('');
  const entregado = useRef(false);

  useEffect(() => {
    let cancelado = false;
    let parar: (() => void) | null = null;

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) { setEstado('sinCamara'); return; }
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
          import('@zxing/browser'),
          import('@zxing/library'),
        ]);
        if (cancelado || !videoRef.current) return;
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]);
        const lector = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 150 });
        const controles = await lector.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' } }, audio: false },
          videoRef.current,
          (resultado) => {
            if (!resultado || entregado.current) return;
            const codigo = resultado.getText();
            // Una lectura sucia casi nunca cumple el dígito de control: se ignora y se sigue.
            if (!esCodigoValido(codigo)) return;
            entregado.current = true;
            void haptics.light();
            onCodigo(codigo);
          },
        );
        parar = () => controles.stop();
        // La hoja se cerró mientras se abría la cámara: apagarla ya.
        if (cancelado) { controles.stop(); return; }
        setEstado('leyendo');
      } catch (e) {
        if (cancelado) return;
        const nombre = (e as { name?: string })?.name;
        setEstado(nombre === 'NotAllowedError' || nombre === 'SecurityError' ? 'denegada'
          : nombre === 'NotFoundError' || nombre === 'OverconstrainedError' ? 'sinCamara' : 'error');
      }
    })();

    return () => { cancelado = true; parar?.(); };
    // onCodigo cambia en cada render del padre; el lector se abre una sola vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const codigoManual = soloDigitos(manual);
  const manualValido = esCodigoValido(codigoManual);

  return (
    <Sheet open onClose={onClose} title="Escanear producto" alto="completo">
      <div className="space-y-4 pt-2">
        <div className="relative overflow-hidden rounded-surface bg-black aspect-[4/3]">
          <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
          {estado === 'leyendo' && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-1/3 w-4/5 rounded-control border-2 border-accent/80" />
            </div>
          )}
          {estado === 'abriendo' && (
            <p className="absolute inset-0 flex items-center justify-center font-sans text-body-s text-white/80">Abriendo la cámara…</p>
          )}
        </div>

        {estado !== 'abriendo' && estado !== 'leyendo' && <Banner tone="info">{MENSAJE[estado]}</Banner>}
        <p className="font-sans text-caption text-ink-3">
          La cámara solo se usa para leer el código de barras. No se guarda ninguna imagen.
        </p>

        <div className="space-y-2 border-t border-hairline pt-4">
          <Input label="¿No lee? Escribe el código" value={manual} onChange={setManual} inputMode="numeric" placeholder="8410000000000" />
          {codigoManual.length >= 8 && !manualValido && (
            <p className="font-sans text-caption text-danger">Ese código no parece correcto: revisa los números.</p>
          )}
          <Button fullWidth disabled={!manualValido} onClick={() => manualValido && onCodigo(codigoManual)}>Buscar este código</Button>
        </div>
      </div>
    </Sheet>
  );
}
