import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DecisionMaquina, Gimnasio, Maquina, MuscleGroup } from '../../types';
import { getEstadoCatalogo, guardarGimnasio, guardarGimnasioLocal, getCatalogoVersion } from '../../dbService';

/* ═══════════════════════════════════════════════════════════════════════════
   Estado del repaso del catálogo.

   El componente solo pinta y arrastra; toda la lógica de qué máquina toca, qué
   pasa al terminar una categoría y cuándo se persiste vive aquí.

   Persistencia en dos ritmos, y es deliberado:
     · localStorage en CADA decisión — es lo que hace que cerrar la app a mitad
       y volver retome exactamente en la misma máquina.
     · Firestore cada FLUSH_CADA decisiones, al cambiar de categoría y al salir.
       Una escritura por gesto serían cientos de escrituras por atleta para un
       dato que no corre ninguna prisa.
   ═══════════════════════════════════════════════════════════════════════════ */

const FLUSH_CADA = 10;

/** Orden anatómico, de arriba abajo. El atleta recorre el cuerpo, no un índice alfabético. */
export const ORDEN_CATEGORIAS: MuscleGroup[] = [
  'pecho', 'dorsal', 'trapecio',
  'deltoide_ant', 'deltoide_lat', 'deltoide_post',
  'biceps', 'triceps', 'antebrazo',
  'cuadriceps', 'isquios', 'gluteo', 'gemelo', 'core',
];

function ordenDe(c: MuscleGroup): number {
  const i = ORDEN_CATEGORIAS.indexOf(c);
  return i === -1 ? ORDEN_CATEGORIAS.length : i;
}

export interface ResumenCategoria {
  categoria: MuscleGroup;
  total: number;
  decididas: number;
  tengo: number;
}

/**
 * `vacio` no es un error: es el estado normal mientras el admin no haya
 * publicado ninguna máquina (los importadores las dejan sin publicar a
 * propósito). El flujo tiene que apartarse solo, no plantarle al atleta un
 * catálogo de cero tarjetas.
 */
export type FaseSwipe = 'cargando' | 'vacio' | 'entrada' | 'swipe' | 'checkpoint' | 'resumen';

export interface EstadoSwipe {
  fase: FaseSwipe;
  /** Cola pendiente, ya ordenada. La primera es la que se está decidiendo. */
  cola: Maquina[];
  categoriaActual: MuscleGroup | null;
  /** Categoría que se acaba de terminar, para la pantalla de checkpoint. */
  categoriaCerrada: MuscleGroup | null;
  siguienteCategoria: MuscleGroup | null;
  revisadas: number;
  total: number;
  tengoTotal: number;
  puedeDeshacer: boolean;
  porCategoria: ResumenCategoria[];
  /** Solo la primera vez: si ya había decisiones guardadas, se retoma sin pantalla de entrada. */
  reanudando: boolean;
}

export function useCatalogoSwipe(email: string) {
  const [catalogo, setCatalogo] = useState<Maquina[]>([]);
  const [decisiones, setDecisiones] = useState<DecisionMaquina[]>([]);
  const [maquinasPropias, setMaquinasPropias] = useState<Gimnasio['maquinasPropias']>([]);
  const [fase, setFase] = useState<FaseSwipe>('cargando');
  const [categoriaCerrada, setCategoriaCerrada] = useState<MuscleGroup | null>(null);

  // Refs y no estado: cambian en cada gesto y no deben provocar repintado.
  const sinVolcar = useRef(0);
  const ultimoGuardado = useRef<DecisionMaquina[]>([]);
  // Hasta que la carga inicial no termina, `decisiones` es [] porque no se ha
  // leído nada todavía, no porque el atleta no haya decidido nada. Sin esta
  // guarda, desmontar el componente antes de tiempo (una recarga, un HMR, salir
  // de la pantalla) volcaba esa lista vacía y borraba de un plumazo todo lo que
  // ya había guardado. Es el fallo que más caro sale de todo el módulo.
  const cargado = useRef(false);

  useEffect(() => {
    let cancelado = false;
    getEstadoCatalogo(email)
      .then(({ gimnasio, catalogo: todas }) => {
        if (cancelado) return;
        setCatalogo(todas);
        setDecisiones(gimnasio.maquinas);
        setMaquinasPropias(gimnasio.maquinasPropias);
        ultimoGuardado.current = gimnasio.maquinas;
        cargado.current = true;
        if (todas.length === 0) { setFase('vacio'); return; }
        // Ya había empezado: se retoma directamente, sin volver a explicar el módulo.
        const quedan = todas.some(m => !gimnasio.maquinas.some(d => d.maquinaId === m.id));
        setFase(quedan ? (gimnasio.maquinas.length > 0 ? 'swipe' : 'entrada') : 'resumen');
      })
      .catch(err => {
        console.warn('No se pudo cargar el catálogo de máquinas:', err);
        if (!cancelado) setFase('entrada');
      });
    return () => { cancelado = true; };
  }, [email]);

  const decididas = useMemo(() => new Set(decisiones.map(d => d.maquinaId)), [decisiones]);

  const cola = useMemo(
    () =>
      catalogo
        .filter(m => !decididas.has(m.id))
        .sort((a, b) => ordenDe(a.categoria) - ordenDe(b.categoria) || a.nombreMostrado.localeCompare(b.nombreMostrado, 'es')),
    [catalogo, decididas]
  );

  const porCategoria = useMemo<ResumenCategoria[]>(() => {
    const mapa = new Map<MuscleGroup, ResumenCategoria>();
    for (const m of catalogo) {
      const fila = mapa.get(m.categoria) ?? { categoria: m.categoria, total: 0, decididas: 0, tengo: 0 };
      fila.total += 1;
      const d = decisiones.find(x => x.maquinaId === m.id);
      if (d) {
        fila.decididas += 1;
        if (d.tengo) fila.tengo += 1;
      }
      mapa.set(m.categoria, fila);
    }
    return [...mapa.values()].sort((a, b) => ordenDe(a.categoria) - ordenDe(b.categoria));
  }, [catalogo, decisiones]);

  const progreso = useCallback(
    (lista: DecisionMaquina[], categoria: MuscleGroup | null, completado: boolean, pendiente: boolean) => ({
      revisadas: lista.length,
      total: catalogo.length,
      categoriaActual: categoria,
      completado,
      pendienteRecordatorio: pendiente,
      versionCatalogo: getCatalogoVersion(),
    }),
    [catalogo.length]
  );

  /**
   * Categoría por la que se retomaría el repaso: la de la primera máquina sin
   * decidir EN EL ORDEN DEL SWIPE. Ojo, no vale recorrer `catalogo` tal cual:
   * viene ordenado alfabéticamente por categoría, así que la primera pendiente
   * sería 'antebrazo' aunque el atleta esté a punto de empezar 'dorsal'.
   */
  const siguientePendiente = useCallback(
    (lista: DecisionMaquina[]): MuscleGroup | null => {
      const hechas = new Set(lista.map(d => d.maquinaId));
      return (
        catalogo
          .filter(m => !hechas.has(m.id))
          .sort((a, b) => ordenDe(a.categoria) - ordenDe(b.categoria))[0]?.categoria ?? null
      );
    },
    [catalogo]
  );

  /** Vuelca a Firestore lo acumulado. Idempotente: si no hay nada nuevo, no escribe. */
  const volcar = useCallback(
    async (lista: DecisionMaquina[], completado: boolean, pendiente: boolean) => {
      if (!cargado.current) return;
      if (lista === ultimoGuardado.current) return;
      sinVolcar.current = 0;
      ultimoGuardado.current = lista;
      await guardarGimnasio(email, {
        maquinas: lista,
        progresoCatalogo: progreso(lista, siguientePendiente(lista), completado, pendiente),
      });
    },
    [email, progreso, siguientePendiente]
  );

  const decidir = useCallback(
    (tengo: boolean) => {
      const actual = cola[0];
      if (!actual) return;

      const lista = [...decisiones, { maquinaId: actual.id, tengo, decididoEn: new Date().toISOString() }];
      setDecisiones(lista);

      const restantes = cola.slice(1);
      const terminado = restantes.length === 0;
      const cambiaCategoria = !terminado && restantes[0].categoria !== actual.categoria;

      // Respaldo inmediato y barato en cada tarjeta.
      guardarGimnasioLocal(email, {
        maquinas: lista,
        progresoCatalogo: progreso(lista, restantes[0]?.categoria ?? null, terminado, false),
      });

      sinVolcar.current += 1;
      if (terminado || cambiaCategoria || sinVolcar.current >= FLUSH_CADA) {
        // El volcado va en segundo plano y no puede cortar el swipe: desde
        // ae7106c `guardarGimnasio` relanza ante permisos, y sin este catch
        // cada tarjeta dejaría un rechazo sin gestionar. El respaldo local ya
        // está escrito arriba y del fallo avisa la barra roja global.
        volcar(lista, terminado, false).catch(err =>
          console.warn('No se pudo volcar el progreso del catálogo:', err)
        );
      }

      if (terminado) setFase('resumen');
      else if (cambiaCategoria) { setCategoriaCerrada(actual.categoria); setFase('checkpoint'); }
    },
    [cola, decisiones, email, progreso, volcar]
  );

  const deshacer = useCallback(() => {
    if (decisiones.length === 0) return;
    const lista = decisiones.slice(0, -1);
    setDecisiones(lista);
    setFase('swipe');
    setCategoriaCerrada(null);
    guardarGimnasioLocal(email, {
      maquinas: lista,
      progresoCatalogo: progreso(lista, siguientePendiente(lista), false, false),
    });
    sinVolcar.current += 1;
  }, [decisiones, email, progreso, siguientePendiente]);

  const empezar = useCallback(() => setFase('swipe'), []);
  const continuarCategoria = useCallback(() => { setCategoriaCerrada(null); setFase('swipe'); }, []);

  /**
   * Cierra el catálogo a medias. Deja constancia de que queda pendiente: es lo
   * que enciende la tarjeta en Hoy y el punto rojo de la pestaña.
   */
  const omitir = useCallback(async () => {
    await volcar(decisiones, false, true);
  }, [decisiones, volcar]);

  /** Al terminar del todo ya no hay recordatorio que dar. */
  const finalizar = useCallback(async () => {
    await volcar(decisiones, true, false);
  }, [decisiones, volcar]);

  // Salir de la pantalla o mandar la app a segundo plano vuelca lo pendiente.
  // localStorage ya lo tiene, pero así el coach lo ve sin esperar a la próxima
  // sesión del atleta.
  const refVolcar = useRef(volcar);
  refVolcar.current = volcar;
  const refDecisiones = useRef(decisiones);
  refDecisiones.current = decisiones;
  useEffect(() => {
    const alSalir = () => {
      refVolcar.current(refDecisiones.current, false, false).catch(() => {
        // Al descargar la página no hay nadie a quien avisar, y el respaldo
        // local ya está escrito. Sin este catch sería un rechazo sin gestionar.
      });
    };
    window.addEventListener('pagehide', alSalir);
    return () => {
      window.removeEventListener('pagehide', alSalir);
      alSalir();
    };
  }, []);

  const estado: EstadoSwipe = {
    fase,
    cola,
    categoriaActual: cola[0]?.categoria ?? null,
    categoriaCerrada,
    siguienteCategoria: categoriaCerrada ? cola[0]?.categoria ?? null : null,
    revisadas: decisiones.length,
    total: catalogo.length,
    tengoTotal: decisiones.filter(d => d.tengo).length + maquinasPropias.length,
    puedeDeshacer: decisiones.length > 0,
    porCategoria,
    reanudando: decisiones.length > 0,
  };

  return { estado, decidir, deshacer, empezar, continuarCategoria, omitir, finalizar };
}
