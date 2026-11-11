import React, { useMemo, useState } from 'react';
import type { Exercise } from '../types';
import catalogoPrueba from '../utils/cdg/__fixtures__/catalogoPrueba.json';
import { actualizarPropio, crearVariante, conCambio, expandirCatalogo, unirPropios, type CdgCatalogoCompacto } from '../utils/cdg';
import { useMotorCdg } from '../hooks/useMotorCdg';
import { FichaEjercicioContenido } from './FichaEjercicioSheet';
import type { AccionesMatices } from './MaticesCdg';
import { SegmentedControl, Icon } from './ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Banco de pruebas de los matices de la ficha del ejercicio (ruta
   `/dev/matices`, solo en desarrollo), en un panel como el de la ficha real
   (420 px), con el catálogo de prueba de los tests. Hasta el 11-11 enseñaba
   tres variantes; Dani eligió la «tabla» y las otras se retiraron. Guardar y «Crear variante» usan la MISMA lógica que la app
   (utils/cdg/matices.ts) pero sobre un JSON en memoria: nada toca Firestore.
   ═══════════════════════════════════════════════════════════════════════════ */

const EXCEL = JSON.stringify(catalogoPrueba);
const FRANCES = 'Press francés con mancuernas - Tríceps';
const base = expandirCatalogo(catalogoPrueba as CdgCatalogoCompacto).find(e => e.exercise === FRANCES)!;

// El ejemplo de Dani: press francés vs press francés apoyado (más estable).
const inicial = (() => {
  const v = crearVariante(null, EXCEL, base, 'Press francés apoyado en banco inclinado', 'dev_frances_apoyado');
  const propio = expandirCatalogo(JSON.parse(unirPropios(EXCEL, v.json))).find(e => e.exercise === v.nombre)!;
  return { json: actualizarPropio(v.json, EXCEL, conCambio(propio, { tipo: 'inestabilidad', valor: 0.4 })).json, nombre: v.nombre };
})();

const ej = (id: string, name: string, cdgNombre: string): Exercise => ({
  id, ownerId: 'dev', name, primaryFocus: 'Tríceps', type: 'fuerza', muscleGroup: 'triceps', cdgNombre,
} as Exercise);

export default function MaticesDevHarness() {
  const [propios, setPropios] = useState(inicial.json);
  const [ejercicios, setEjercicios] = useState<Exercise[]>([
    ej('dev_frances', 'Press francés con mancuernas', FRANCES),
    ej('dev_frances_apoyado', 'Press francés apoyado en banco inclinado', inicial.nombre),
  ]);
  const [elegido, setElegido] = useState('dev_frances_apoyado');
  const json = useMemo(() => unirPropios(EXCEL, propios), [propios]);
  const estado = useMotorCdg(json);
  const ejercicio = ejercicios.find(e => e.id === elegido) ?? ejercicios[0];

  const acciones: AccionesMatices = {
    guardar: async editado => { setPropios(p => actualizarPropio(p, EXCEL, editado).json); },
    crearVariante: async (b, nombreCorto) => {
      const r = crearVariante(propios, EXCEL, b, nombreCorto, ejercicio.id);
      setPropios(r.json);
      setEjercicios(prev => prev.map(e => (e.id === ejercicio.id ? { ...e, cdgNombre: r.nombre } : e)));
    },
  };

  return (
    <div className="min-h-screen bg-bg px-4 py-6">
      <div className="mx-auto max-w-[720px] space-y-4">
        <div className="space-y-1">
          <h1 className="font-sans text-title-l font-bold text-ink">Matices del ejercicio</h1>
          <p className="font-sans text-body-s text-ink-2">
            Datos de prueba en memoria. Prueba: editar el apoyado (es propio), «Comparar con…» el press francés normal, y en el normal «Crear variante».
          </p>
        </div>
        <SegmentedControl
          label="Ejercicio de la biblioteca"
          value={elegido}
          onChange={setElegido}
          options={ejercicios.map(e => ({ value: e.id, label: e.name }))}
        />
        {/* Calco del PanelLateral de la ficha real. */}
        <div className="flex max-h-[85vh] w-[420px] max-w-full flex-col border border-strong bg-raised shadow-e2">
          <div className="flex shrink-0 items-center justify-between gap-3 px-4 pb-3 pt-4">
            <h2 className="font-sans text-title-s font-bold text-ink">Ficha del ejercicio</h2>
            <span className="flex h-9 w-9 items-center justify-center text-ink-2"><Icon name="close" size="m" /></span>
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-6">
            <FichaEjercicioContenido
              key={`${ejercicio.id}-${ejercicio.cdgNombre}`}
              ejercicio={ejercicio}
              estado={estado}
              acciones={acciones}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
