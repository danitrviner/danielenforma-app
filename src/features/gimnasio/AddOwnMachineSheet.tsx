import React, { useRef, useState } from 'react';
import { Button, Icon, Input, Sheet } from '../../components/ui';
import { addMaquinaPropia, subirFotoGimnasio } from '../../dbService';
import { useToast } from '../../hooks/useToast';

/* ═══════════════════════════════════════════════════════════════════════════
   Añadir una máquina que no está en el catálogo — pantalla 05 del handoff.

   Queda asociada SOLO al gimnasio de este atleta. No entra al catálogo global
   por su cuenta: un admin decide después si la publica (ver
   docs/catalogo-maquinas.md). El copy lo dice explícitamente, porque el atleta
   tiene que saber que está describiendo su gimnasio y no editando la app.

   Dos entradas de imagen, que en móvil son cosas distintas: `capture` abre la
   cámara directamente, sin él se abre la galería o el explorador de archivos —
   que es por donde entra una imagen encontrada fuera de la app.
   ═══════════════════════════════════════════════════════════════════════════ */

type Props = {
  open: boolean;
  onClose: () => void;
  email: string;
  onAnadida: () => void;
};

export default function AddOwnMachineSheet({ open, onClose, email, onAnadida }: Props) {
  const { showToast } = useToast();
  const [nombre, setNombre] = useState('');
  const [previsualizacion, setPrevisualizacion] = useState<string | null>(null);
  const [fichero, setFichero] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);
  const camara = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);

  const limpiar = () => {
    setNombre('');
    setFichero(null);
    setPrevisualizacion(p => { if (p) URL.revokeObjectURL(p); return null; });
  };

  const elegir = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFichero(f);
    setPrevisualizacion(p => { if (p) URL.revokeObjectURL(p); return URL.createObjectURL(f); });
    // Permite volver a elegir el mismo fichero si el atleta se arrepiente.
    e.target.value = '';
  };

  const guardar = async () => {
    if (!nombre.trim() || !fichero) return;
    setGuardando(true);
    try {
      const fotoUrl = await subirFotoGimnasio(email, fichero);
      await addMaquinaPropia(email, { nombre, fotoUrl });
      showToast('Máquina añadida a tu gimnasio', 'success');
      limpiar();
      onAnadida();
      onClose();
    } catch (err) {
      console.error('No se pudo añadir la máquina propia:', err);
      // Aquí sí hace falta decirlo: la foto va a Storage y esa escritura no
      // tiene el respaldo local que sí tienen las decisiones del catálogo.
      showToast('No se pudo subir la foto. Inténtalo de nuevo.', 'error');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={() => { limpiar(); onClose(); }}
      title="Falta una máquina"
      footer={
        <Button
          variant="primary"
          size="l"
          fullWidth
          onClick={guardar}
          disabled={!nombre.trim() || !fichero || guardando}
          loading={guardando}
          loadingLabel="Guardando"
        >
          Guardar
        </Button>
      }
    >
      <div className="space-y-5">
        <p className="font-sans text-body-s text-ink-2">
          Se añade solo a tu gimnasio. Dani decide después si la hace pública para todos.
        </p>

        {/* Alto fijo y no una proporción: con aspect-[4/3] la previsualización se
            come la hoja en un móvil y deja el campo del nombre bajo el pie. */}
        <div className="h-40 rounded-surface border border-hairline overflow-hidden bg-raised flex items-center justify-center">
          {previsualizacion ? (
            <img src={previsualizacion} alt="Foto de la máquina" className="w-full h-full object-contain bg-white" />
          ) : (
            <p className="font-sans text-body-s text-ink-4 text-center px-6">
              Foto de tu móvil o de una imagen de internet
            </p>
          )}
        </div>

        <div className="flex gap-3">
          <Button variant="secondary" size="m" icon="photo_camera" fullWidth onClick={() => camara.current?.click()}>
            Hacer foto
          </Button>
          <Button variant="secondary" size="m" icon="image" fullWidth onClick={() => galeria.current?.click()}>
            Subir imagen
          </Button>
        </div>

        <input ref={camara} type="file" accept="image/*" capture="environment" onChange={elegir} className="hidden" />
        <input ref={galeria} type="file" accept="image/*" onChange={elegir} className="hidden" />

        <Input
          label="Nombre"
          value={nombre}
          onChange={setNombre}
          placeholder="Ej. Máquina de gemelos sentado"
        />

        <p className="flex items-start gap-2 font-sans text-caption text-ink-4">
          <Icon name="info" size="s" className="mt-0.5" />
          Solo tú y Dani veis esta máquina. No aparece en el catálogo de nadie más.
        </p>
      </div>
    </Sheet>
  );
}
