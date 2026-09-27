import React from 'react';
import { AcademyCategory } from '../../types';
import { Icon } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   PortadaCurso

   La imagen 16:9 de una tarjeta de curso. Existe por una razón muy concreta:
   Training Lab tenía tarjetas de solo texto y no se leía como una plataforma
   de formación, se leía como una lista de ajustes.

   Dos modos, y el orden importa:

   1. Si el curso tiene `coverImageUrl`, esa foto manda. La sube el coach.
   2. Si no la tiene, se dibuja una portada generada a partir de la CATEGORÍA.
      No es un hueco gris esperando a que alguien suba algo: es una portada
      válida, distinta por categoría, que aguanta indefinidamente.

   El modo 2 no es un adorno temporal. Hay tres cursos y ninguno tiene foto:
   sin esto, "ponerle imagen" habría sido dejar tres rectángulos vacíos hasta
   que alguien encontrase fotos.

   El oro NO entra aquí. La regla del design system es un solo elemento
   amarillo relleno por pantalla visible, y en Training Lab ese elemento es el
   botón de «seguir donde lo dejaste». Las portadas tiran de tintes fríos y
   apagados propios de cada categoría para no competir con él.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Tinte e icono por categoría. Colores literales, no tokens: son pigmento de
 *  portada —como la cubierta de un libro—, no estado ni marca. Meterlos en
 *  index.css los convertiría en vocabulario del sistema, que es justo lo que
 *  no son. */
/* Los nombres de icono salen del subconjunto YA empaquetado
   (`material-symbols-iconos.txt`). La fuente no trae los 3.000 de Google: un
   nombre de fuera se pinta como la palabra dentro de la portada. Lo caza
   `npm run lint` (scripts/comprobar-iconos.mjs), que es quien pilló aquí
   `psychology` y `cardiology`. */
const PIGMENTO: Record<AcademyCategory, { de: string; a: string; icono: string }> = {
  entrenamiento: { de: '#3B4252', a: '#1F242E', icono: 'fitness_center' },
  nutricion:     { de: '#2F4438', a: '#1B2721', icono: 'nutrition' },
  fisiologia:    { de: '#3A3350', a: '#221E30', icono: 'monitor_heart' },
  biomecanica:   { de: '#2E4350', a: '#1A262E', icono: 'accessibility_new' },
  mentalidad:    { de: '#4A3542', a: '#2A1F26', icono: 'psychiatry' },
  recuperacion:  { de: '#2B4A4A', a: '#182A2A', icono: 'self_improvement' },
};

type Props = {
  category: AcademyCategory;
  coverImageUrl?: string;
  /** Título del curso: solo para el texto alternativo de la foto. */
  title: string;
  /** Portada grande (hero de «continuar»): el icono crece y se separa más. */
  grande?: boolean;
  /**
   * Altura fija en clases de Tailwind (`h-44 sm:h-52`). Sustituye al 16:9.
   * Un `max-h-*` sobre `aspect-video` NO sirve: el navegador mantiene la
   * proporción encogiendo el ANCHO, y la portada del hero salía a media
   * pantalla con el resto en negro. Medido en el navegador.
   */
  alto?: string;
  className?: string;
};

export default function PortadaCurso({ category, coverImageUrl, title, grande = false, alto, className = '' }: Props) {
  const { de, a, icono } = PIGMENTO[category];

  return (
    <div className={`relative overflow-hidden bg-inset ${alto ?? 'aspect-video'} ${className}`}>
      {coverImageUrl ? (
        <img
          src={coverImageUrl}
          // Decorativa: el título del curso va escrito justo debajo, así que un
          // alt descriptivo lo haría decir dos veces lo mismo al lector.
          alt=""
          loading="lazy"
          className="w-full h-full object-cover"
        />
      ) : (
        <div
          className={`w-full h-full flex items-center ${grande ? 'justify-end pr-8 sm:pr-12' : 'justify-center'}`}
          style={{ background: `linear-gradient(140deg, ${de} 0%, ${a} 100%)` }}
          aria-hidden="true"
        >
          {/* En el hero el icono se va a la derecha: centrado quedaba justo
              debajo del título y las dos formas se estorbaban. */}
          {/* Trama diagonal tenue: sin ella el degradado se ve como un error de
              carga, con ella se lee como portada. */}
          <div
            className="absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage: 'repeating-linear-gradient(115deg, #fff 0 1px, transparent 1px 14px)',
            }}
          />
          <Icon
            name={icono}
            size="xl"
            className={`relative text-ink-5 ${grande ? 'scale-[2.6]' : 'scale-[1.6]'}`}
          />
        </div>
      )}
      {/* Velo inferior para que lo que se pose encima (progreso, estado) se lea
          sobre cualquier foto, clara u oscura. */}
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-veil/70 to-transparent" aria-hidden="true" />
      <span className="sr-only">{title}</span>
    </div>
  );
}
