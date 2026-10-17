import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { auth } from '../firebase';
import { getCdgCatalogoJson, parsearCatalogoCdg, CDG_CATALOGO_VERSION } from '../db/cdg';
import { crearMotor, expandirCatalogo, type MotorCdg, type CdgEjercicio } from '../utils/cdg';
import { esElCoachPermanente } from '../utils/coach';

// Varias pantallas (panel, cabeceras de cada día, cierre…) piden el motor a la vez:
// se expande el catálogo UNA vez por contenido, no una por componente.
let ultimo: { json: string; catalogo: CdgEjercicio[]; motor: MotorCdg | null } | null = null;
function motorDe (json: string | null) {
  if (!json) return { catalogo: [] as CdgEjercicio[], motor: null as MotorCdg | null };
  if (!ultimo || ultimo.json !== json) {
    const catalogo = expandirCatalogo(parsearCatalogoCdg(json));
    ultimo = { json, catalogo, motor: catalogo.length ? crearMotor(catalogo) : null };
  }
  return ultimo;
}

export const cdgCatalogoKey = ['cdgCatalogo', CDG_CATALOGO_VERSION] as const;

export interface MotorCdgEstado {
  /** `null` mientras carga, si no hay catálogo subido o si quien mira no es el coach. */
  motor: MotorCdg | null;
  catalogo: CdgEjercicio[];
  cargando: boolean;
  /** El coach está dentro pero el catálogo aún no se ha subido a Firestore. */
  noSubido: boolean;
  error: Error | null;
}

/**
 * Motor de cálculo CDG listo para usar (`motor.calcularFila(...)`).
 *
 * Solo para la vista del coach: el atleta no descarga el catálogo (la regla de
 * Firestore se lo niega y aquí ni se intenta). Se guarda el string compacto,
 * que es lo que React Query persiste en el dispositivo; el motor se reconstruye
 * en memoria con `useMemo`.
 *
 * `json` permite inyectar un catálogo ya cargado (tests, o el cargador de
 * archivo de la pantalla de emparejado mientras el catálogo no está en Firestore).
 */
export function useMotorCdg (json?: string | null): MotorCdgEstado {
  const email = auth.currentUser?.email;
  const enabled = json == null && esElCoachPermanente(email);

  const { data, isPending, error } = useQuery({
    queryKey: cdgCatalogoKey,
    queryFn: getCdgCatalogoJson,
    enabled,
    staleTime: 24 * 60 * 60 * 1000,
    retry: false
  });

  const origen = json ?? data ?? null;
  const { catalogo, motor } = useMemo(() => motorDe(origen), [origen]);

  return {
    motor,
    catalogo,
    cargando: enabled && isPending,
    noSubido: enabled && !isPending && !error && data == null,
    error: (error as Error | null) ?? null
  };
}
