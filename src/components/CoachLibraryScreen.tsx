import React from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { PageHeader, Tabs } from './ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Biblioteca (coach)

   Las cuatro consolas de catálogo del entrenador —Ejercicios, Nutrición,
   Academia y Cardio— dejan de ser cuatro destinos de la barra de navegación
   y pasan a ser cuatro pestañas de un mismo sitio.

   El motivo: la barra del coach mezclaba dos cosas distintas. Por un lado el
   trabajo con personas (Inicio, Revisiones, CRM), donde el coach vive a
   diario; por otro estos cuatro, que son plantillas y catálogos donde se
   entra, se edita algo y se sale. Con los siete juntos en 375 px las
   etiquetas no cabían a los 11 px del Design System, y de ahí salía la
   excepción de los 10 px que documentaba DESIGN_SYSTEM_STATUS.md (R10).

   Este componente NO pinta contenido: solo la cabecera y la barra de
   pestañas, y deja el hueco al `Outlet` de las rutas hijas. La pestaña
   activa se lee de la URL (`/library/<sección>`), igual que hace la barra
   principal en App.tsx — así un refresco o el botón atrás recuperan la
   sección exacta, no la primera.

   Cada pantalla hija conserva SUS propias pestañas internas (Zonas / Tests /
   Prescripción en Cardio, Dietas / Alimentos / Recetas en Nutrición…). Dos
   filas de pestañas es el patrón correcto aquí: la de arriba dice en qué
   catálogo estás, la de abajo en qué parte de ese catálogo.
   ═══════════════════════════════════════════════════════════════════════════ */

export const LIBRARY_SECTIONS = [
  { id: 'ejercicios', label: 'Ejercicios', icon: 'fitness_center' },
  { id: 'nutricion',  label: 'Nutrición',  icon: 'restaurant'     },
  { id: 'academia',   label: 'Training Lab', icon: 'school'       },
  { id: 'cardio',     label: 'Cardio',     icon: 'favorite'       },
  // 14-08 (tarea 13). Vivía en el Inicio del coach (ClientsScreen), mezclado
  // con las tarjetas de seguimiento de atletas. Es justo el mismo tipo de
  // cosa que los otros cuatro — una biblioteca donde se entra, se gestiona
  // algo y se sale — así que se une a ellos en vez de tener sitio propio.
  { id: 'recursos',   label: 'Recursos',   icon: 'folder_open'    },
] as const;

export type LibrarySection = typeof LIBRARY_SECTIONS[number]['id'];

export const DEFAULT_LIBRARY_SECTION: LibrarySection = 'ejercicios';

export default function CoachLibraryScreen() {
  const navigate = useNavigate();
  const location = useLocation();

  const seccion = location.pathname.split('/')[2] ?? DEFAULT_LIBRARY_SECTION;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Consola de Entrenador" title="Biblioteca" />

      <Tabs
        items={LIBRARY_SECTIONS.map(s => ({ id: s.id, label: s.label, icon: s.icon }))}
        value={seccion}
        onChange={id => navigate(`/library/${id}`)}
        label="Catálogos del entrenador"
      />

      <Outlet />
    </div>
  );
}
