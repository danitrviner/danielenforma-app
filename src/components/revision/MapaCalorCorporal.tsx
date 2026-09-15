import React from 'react';
import { MuscleGroup } from '../../types';
import { CeldaMapaCalor } from '../../utils/mapaCalorCorporal';
import { VolumeZone } from '../../utils/volumeZones';
import {
  VistaSilueta, VIEWBOX_SILUETA, CONTORNO_SILUETA, REGIONES_SILUETA, gruposDeVista,
} from '../../data/siluetaCorporal';

/* ═══════════════════════════════════════════════════════════════════════════
   Mapa de calor corporal — los 17 grupos sobre la silueta.

   Componente tonto: recibe `CeldaMapaCalor[]` con el relleno ya resuelto por
   `construirMapaCalor` y solo lo pinta. Por eso la capa de dibujo se puede
   sustituir entera sin tocar el motor ni la tabla.

   ── Por qué hay tramas además de color ─────────────────────────────────────
   Cinco zonas (sin volumen / MEV / productivo / MAV / MRV) distinguidas solo
   por color fallan en tres sitios a la vez: con deuteranopía, en un vídeo
   comprimido —que es exactamente para lo que existe esta pantalla— y en
   cualquier captura en escala de grises. Cada zona lleva encima su propia
   trama, así que MAV y MRV se separan sin depender del tono.

   La tabla hermana (`TablaMapaCalor`) va SIEMPRE al lado, no detrás de un
   interruptor: es donde está el número que el coach dice en voz alta.
   ═══════════════════════════════════════════════════════════════════════════ */

const TRAMA_POR_ZONA: Record<VolumeZone, string | null> = {
  sin_volumen: null,
  mev: 'trama-mev',
  productivo: 'trama-productivo',
  mav: 'trama-mav',
  mrv: 'trama-mrv',
};

interface Props {
  celdas: CeldaMapaCalor[];
  vista: VistaSilueta;
  grupoActivo: MuscleGroup | null;
  onGrupoActivo: (g: MuscleGroup | null) => void;
}

export default function MapaCalorCorporal({ celdas, vista, grupoActivo, onGrupoActivo }: Props) {
  const porGrupo = new Map(celdas.map(c => [c.group, c]));
  const grupos = gruposDeVista(vista);
  const conSeries = grupos.filter(g => (porGrupo.get(g)?.realizadasSemana ?? 0) > 0).length;

  // Cada vista necesita ids de patrón propios: dos <svg> en la misma página con
  // los mismos ids de <defs> hacen que el segundo referencie los del primero.
  const uid = `silueta-${vista}`;

  return (
    <svg
      viewBox={VIEWBOX_SILUETA}
      role="img"
      aria-labelledby={`${uid}-t ${uid}-d`}
      className="w-full max-w-[220px] h-auto mx-auto block"
    >
      <title id={`${uid}-t`}>
        Mapa de volumen, vista {vista === 'frente' ? 'frontal' : 'posterior'}
      </title>
      <desc id={`${uid}-d`}>
        {conSeries} de {grupos.length} grupos con series registradas en esta vista.
        Los datos exactos están en la tabla que acompaña al mapa.
      </desc>

      <defs>
        <pattern id={`${uid}-trama-mev`} width="6" height="6" patternUnits="userSpaceOnUse">
          <circle cx="1.5" cy="1.5" r="0.7" fill="var(--color-ink)" opacity="0.35" />
        </pattern>
        <pattern id={`${uid}-trama-productivo`} width="4" height="4" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.7" fill="var(--color-ink)" opacity="0.4" />
        </pattern>
        <pattern id={`${uid}-trama-mav`} width="5" height="5" patternUnits="userSpaceOnUse">
          <path d="M0 5 L5 0" stroke="var(--color-ink)" strokeWidth="0.9" opacity="0.45" />
        </pattern>
        <pattern id={`${uid}-trama-mrv`} width="5" height="5" patternUnits="userSpaceOnUse">
          <path d="M0 5 L5 0 M0 0 L5 5" stroke="var(--color-ink)" strokeWidth="0.9" opacity="0.5" />
        </pattern>
      </defs>

      {/* Contorno: el fondo que hace que esto se lea como un cuerpo. */}
      {CONTORNO_SILUETA[vista].map((d, i) => (
        <path
          key={i} d={d}
          fill="var(--color-surface)"
          stroke="var(--color-hairline)"
          strokeWidth="1"
        />
      ))}

      {/* Las manchas, una por grupo. */}
      {grupos.map(g => {
        const celda = porGrupo.get(g);
        if (!celda) return null;
        const region = REGIONES_SILUETA[g];
        const activo = grupoActivo === g;
        const trama = TRAMA_POR_ZONA[celda.zona];
        const etiqueta = [
          celda.label,
          `${celda.realizadasSemana} series por semana`,
          `zona ${celda.zonaLabel}`,
          celda.planificadasSemana != null ? `${celda.planificadasSemana} programadas` : 'sin volumen programado',
          celda.prioridad ? `prioridad ${celda.prioridad}` : null,
        ].filter(Boolean).join(', ');

        return (
          <g
            key={g}
            role="button"
            tabIndex={0}
            aria-label={etiqueta}
            onMouseEnter={() => onGrupoActivo(g)}
            onMouseLeave={() => onGrupoActivo(null)}
            onFocus={() => onGrupoActivo(g)}
            onBlur={() => onGrupoActivo(null)}
            onClick={() => onGrupoActivo(activo ? null : g)}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onGrupoActivo(activo ? null : g);
              }
              if (e.key === 'Escape') onGrupoActivo(null);
            }}
            style={{ cursor: 'pointer', outline: 'none' }}
          >
            {region.paths.map((d, i) => (
              <React.Fragment key={i}>
                <path
                  d={d}
                  fill={celda.fill}
                  stroke={activo ? 'var(--color-accent)' : 'var(--color-hairline)'}
                  strokeWidth={activo ? 1.8 : 0.7}
                  strokeDasharray={region.profundo ? '3 2' : undefined}
                  strokeLinejoin="round"
                />
                {/* La trama va en un path gemelo encima: así el color de zona y
                    la textura son dos capas y ninguna tapa a la otra. */}
                {trama && <path d={d} fill={`url(#${uid}-${trama})`} stroke="none" />}
              </React.Fragment>
            ))}
          </g>
        );
      })}
    </svg>
  );
}
