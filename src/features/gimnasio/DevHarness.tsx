import React, { useState } from 'react';
import { SEMILLA_MAQUINAS } from '../../data/maquinas';
import CatalogoSwipe from './CatalogoSwipe';
import MiGimnasioPanel from './MiGimnasioPanel';
import RecordatorioGimnasioCard from './RecordatorioGimnasioCard';
import EquipoClienteCard from './EquipoClienteCard';
import AdminMaquinasTab from './AdminMaquinasTab';

/* ═══════════════════════════════════════════════════════════════════════════
   Banco de pruebas del catálogo — SOLO DESARROLLO.

   El swipe solo muestra máquinas publicadas, y el importador las deja sin
   publicar a propósito (el scraping no decide qué entra en la app). Eso deja el
   flujo invisible hasta que un admin publica desde F6, y hace imposible probarlo
   sin credenciales de un atleta real.

   Este harness resuelve las dos cosas a la vez: siembra los overrides en
   localStorage marcando el catálogo como publicado —que es exactamente el camino
   que toma la capa de datos cuando Firestore no está disponible— y monta el
   swipe con un email de prueba. Ni toca Firestore ni existe en producción: se
   monta desde App.tsx tras la misma guarda `import.meta.env.DEV` que el
   escaparate de primitivas, así que Vite poda la rama entera al compilar.
   ═══════════════════════════════════════════════════════════════════════════ */

const EMAIL_PRUEBA = 'dev-gimnasio@enforma.local';

function sembrar() {
  const ahora = new Date().toISOString();
  localStorage.setItem(
    'enforma_maquinas_overrides_v1',
    JSON.stringify(SEMILLA_MAQUINAS.map(m => ({ id: m.id, publicadoEn: ahora, visible: true, actualizadoEn: ahora })))
  );
}

function limpiar() {
  localStorage.removeItem('enforma_maquinas_overrides_v1');
  localStorage.removeItem('enforma_gimnasios_v1');
}

export default function DevHarness() {
  const [listo, setListo] = useState(false);
  const [clave, setClave] = useState(0);
  const [vista, setVista] = useState<'swipe' | 'panel' | 'admin'>('swipe');

  if (listo && vista === 'admin') {
    return (
      <div className="min-h-screen bg-bg p-4 space-y-4">
        <AdminMaquinasTab />
        <button
          type="button"
          onClick={() => { setListo(false); setClave(k => k + 1); }}
          className="mt-4 px-4 h-11 rounded-control border border-hairline text-ink-2 font-sans text-body-s"
        >
          Volver al banco de pruebas
        </button>
      </div>
    );
  }

  if (listo && vista === 'panel') {
    return (
      <div className="min-h-screen bg-bg p-4 space-y-4">
        <RecordatorioGimnasioCard key={`r${clave}`} email={EMAIL_PRUEBA} />
        <MiGimnasioPanel key={clave} email={EMAIL_PRUEBA} />
        {/* Lo que ve el entrenador en el Hub del atleta (F5). */}
        <EquipoClienteCard key={`e${clave}`} athleteEmail={EMAIL_PRUEBA} />
        <button
          type="button"
          onClick={() => { setListo(false); setClave(k => k + 1); }}
          className="mt-4 px-4 h-11 rounded-control border border-hairline text-ink-2 font-sans text-body-s"
        >
          Volver al banco de pruebas
        </button>
      </div>
    );
  }

  if (!listo) {
    return (
      <div className="min-h-screen bg-bg flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="font-mono text-caption text-ink-4 uppercase tracking-widest">Banco de pruebas · solo desarrollo</p>
        <h1 className="font-display font-black text-headline uppercase text-ink">Catálogo de máquinas</h1>
        <p className="font-sans text-body-s text-ink-3 max-w-sm">
          {SEMILLA_MAQUINAS.length} máquinas en la semilla. Se publican en localStorage para poder
          recorrer el swipe sin Firestore ni sesión.
        </p>
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => { sembrar(); setVista('swipe'); setListo(true); }}
            className="px-5 h-14 rounded-control bg-accent text-on-accent font-sans font-bold"
          >
            Empezar
          </button>
          <button
            type="button"
            onClick={() => { sembrar(); setVista('panel'); setListo(true); }}
            className="px-5 h-14 rounded-control border border-hairline text-ink-2 font-sans"
          >
            Mi gimnasio
          </button>
          <button
            type="button"
            onClick={() => { setVista('admin'); setListo(true); }}
            className="px-5 h-14 rounded-control border border-hairline text-ink-2 font-sans"
          >
            Admin
          </button>
          <button
            type="button"
            onClick={() => { limpiar(); setClave(k => k + 1); }}
            className="px-5 h-14 rounded-control border border-hairline text-ink-2 font-sans"
          >
            Borrar progreso
          </button>
        </div>
        <span className="sr-only">{clave}</span>
      </div>
    );
  }

  return (
    <CatalogoSwipe
      key={clave}
      email={EMAIL_PRUEBA}
      onCompletado={() => { limpiar(); setListo(false); setClave(k => k + 1); }}
      onOmitir={() => { setListo(false); setClave(k => k + 1); }}
    />
  );
}
