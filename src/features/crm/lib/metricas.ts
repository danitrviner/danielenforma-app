import type { CrmPago, CrmServicio, Cliente, EstadoPago, TipoMovimiento } from '../types';
import { hoyISO } from './fechas';
import { cobradoDe, pendienteDe } from './dinero';

// `cobradoDe`/`pendienteDe` viven en `dinero.ts` —son primitivas de dinero, no
// KPIs— y se reexportan aquí para que quien calcule métricas no tenga que
// importar de los dos sitios.
export { cobradoDe, pendienteDe } from './dinero';

/* ═══════════════════════════════════════════════════════════════════════════
   Los KPIs del negocio.

   Todo son FUNCIONES PURAS con `hoy` inyectable. No es un capricho de estilo:
   son las cifras que Dani mira para decidir si el mes va bien, y una cifra de
   negocio que se rompe en silencio es peor que no tenerla. Un test las fija.

   Todo se calcula EN MEMORIA sobre el catálogo completo, que es como ya
   funciona el resto del CRM (`leerCatalogo` cachea las colecciones enteras y
   filtra en cliente). A la escala de este negocio —cientos de clientes, miles
   de movimientos— eso es correcto y evita índices y agregaciones en Firestore.

   El modelo y la fórmula de cada uno están en docs/crm-modelo-v2.md.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Un mes 'AAAA-MM'. */
export type ClaveMes = string;

export function mesDe(iso: string): ClaveMes {
  return iso.slice(0, 7);
}

// ─── Dinero ──────────────────────────────────────────────────────────────────

export interface FacturacionDelMes {
  mes: ClaveMes;
  totalCents: number;
  altasCents: number;
  renovacionesCents: number;
  upsellsCents: number;
  /** Descuentos y devoluciones, ya en negativo. */
  ajustesCents: number;
}

/**
 * Qué se facturó en un mes, desglosado por lo que de verdad importa: cuánto
 * viene de vender a alguien nuevo, cuánto de que un cliente siga y cuánto de
 * venderle más al que ya está. Era la pregunta del bloque 6 de Dani y no se
 * podía contestar porque los movimientos no llevaban `tipo`.
 *
 * Se agrupa por fecha de COBRO, no de emisión: es cuándo entró el dinero.
 * Un movimiento sin `tipo` (los escritos antes de 09-2026, hasta que pase el
 * script de migración) suma en el total pero no en ningún desglose — es
 * preferible que un desglose se quede corto y se note, a repartirlo por
 * adivinación y que cuadre por casualidad.
 */
export function facturacionDelMes(movimientos: CrmPago[], mes: ClaveMes): FacturacionDelMes {
  const acc: FacturacionDelMes = {
    mes, totalCents: 0, altasCents: 0, renovacionesCents: 0, upsellsCents: 0, ajustesCents: 0,
  };
  for (const m of movimientos) {
    if (!m.fechaCobro || mesDe(m.fechaCobro) !== mes) continue;
    const cents = cobradoDe(m);
    if (cents === 0) continue;
    acc.totalCents += cents;
    switch (m.tipo) {
      case 'alta':        acc.altasCents += cents; break;
      case 'renovacion':  acc.renovacionesCents += cents; break;
      case 'upsell':      acc.upsellsCents += cents; break;
      case 'descuento':
      case 'devolucion':  acc.ajustesCents += cents; break;
      default: break; // sin tipo — cuenta en el total, no en el desglose
    }
  }
  return acc;
}

/** Lo que está por cobrar, separando lo que aún no toca de lo que ya falla. */
export function porCobrar(movimientos: CrmPago[]): { pendienteCents: number; impagadoCents: number } {
  let pendienteCents = 0;
  let impagadoCents = 0;
  for (const m of movimientos) {
    const cents = pendienteDe(m);
    // Los movimientos NEGATIVOS (un descuento aún sin aplicar, una devolución
    // aún sin hacer) no son dinero que nadie te deba. Sumarlos aquí tapaba
    // deudas reales: un descuento pendiente de −100 € y una cuota impagada de
    // 300 € daban «200 € pendientes», y esos 300 € dejaban de verse.
    if (cents <= 0) continue;
    if (m.estado === 'impagado') impagadoCents += cents;
    else pendienteCents += cents;
  }
  return { pendienteCents, impagadoCents };
}

/**
 * Ingreso recurrente mensual: lo que entra cada mes si nadie se va ni entra.
 *
 * Se reparte el importe del contrato entre los meses que dura, en vez de
 * mirar la periodicidad declarada: un servicio de 900 € a seis meses son 150 €
 * al mes, lo cobre el coach de una vez o en tres cuotas. Un servicio sin fecha
 * de fin no se puede repartir —no se sabe entre cuántos meses— y no entra.
 */
export function mrr(servicios: CrmServicio[], hoy: string = hoyISO()): number {
  let cents = 0;
  for (const s of servicios) {
    if (s.archivado) continue;
    if (s.fechaInicio > hoy) continue;
    if (!s.fechaFin || s.fechaFin < hoy) continue;
    const meses = mesesEntre(s.fechaInicio, s.fechaFin);
    if (meses <= 0) continue;
    cents += Math.round(s.importeCents / meses);
  }
  return cents;
}

// ─── Clientes ────────────────────────────────────────────────────────────────

/**
 * La fecha en que un cliente empezó a serlo: el inicio de su primer servicio.
 * No se guarda en la ficha a propósito — duplicarla crea dos verdades que se
 * desincronizan en cuanto alguien corrige una fecha.
 */
export function fechaAltaDe(serviciosDelCliente: CrmServicio[]): string | null {
  const inicios = serviciosDelCliente.filter(s => !s.archivado).map(s => s.fechaInicio).sort();
  return inicios[0] ?? null;
}

/**
 * Meses que un cliente ha estado de verdad contratado: la unión de los rangos
 * de sus servicios, NO la distancia entre su alta y su baja.
 *
 * Es lo que hace que las pausas no cuenten (decidido con Dani el 10-09-2026)
 * sin necesitar un histórico de pausas: mientras está pausado no hay servicio
 * corriendo, así que esos meses no entran solos. Un cliente que entra en enero,
 * pausa marzo y abril y se va en junio ha durado TRES meses, no cinco — y esa
 * cifra cuadra con lo que se facturó, que es para lo que sirve.
 *
 * Los rangos solapados (asesoría + sesiones sueltas a la vez) cuentan una sola
 * vez: es tiempo, no dinero.
 */
export function mesesContratados(serviciosDelCliente: CrmServicio[], hoy: string = hoyISO()): number {
  const rangos = serviciosDelCliente
    .filter(s => !s.archivado)
    .map(s => ({ desde: s.fechaInicio, hasta: s.fechaFin ?? hoy }))
    .filter(r => r.hasta >= r.desde)
    .sort((a, b) => a.desde.localeCompare(b.desde));
  if (rangos.length === 0) return 0;

  let total = 0;
  let { desde, hasta } = rangos[0];
  for (const r of rangos.slice(1)) {
    if (r.desde <= hasta) {
      // Se solapa o encadena: se estira el tramo en curso.
      if (r.hasta > hasta) hasta = r.hasta;
    } else {
      total += mesesEntre(desde, hasta);
      desde = r.desde; hasta = r.hasta;
    }
  }
  total += mesesEntre(desde, hasta);
  return Math.round(total * 10) / 10;
}

/** Permanencia media en meses sobre los clientes que han contratado algo. */
export function permanenciaMedia(
  serviciosPorCliente: Map<string, CrmServicio[]>,
  hoy: string = hoyISO(),
): number | null {
  const duraciones = [...serviciosPorCliente.values()]
    .map(ss => mesesContratados(ss, hoy))
    .filter(m => m > 0);
  if (duraciones.length === 0) return null;
  return Math.round((duraciones.reduce((a, b) => a + b, 0) / duraciones.length) * 10) / 10;
}

/**
 * Bajas del mes partido por los que ya eran clientes al empezarlo.
 *
 * El denominador son CLIENTES DE VERDAD, no la lista entera: hace falta el
 * mapa de servicios para saber quién había contratado ya algo antes de que
 * empezara el mes. Sin él, el cálculo contaba también a los leads que se
 * apuntaron a la agenda ese mes y nunca compraron — cinco clientes con una baja
 * salían al 7 % de churn en vez del 20 % real solo porque habían entrado diez
 * contactos nuevos. Un churn que mejora cuando entran leads no mide nada.
 *
 * `null` cuando no había nadie: un 100 % porque se fue el único cliente del
 * primer mes no es un dato, es ruido.
 */
export function churnDelMes(
  clientes: Cliente[],
  mes: ClaveMes,
  serviciosPorCliente: Map<string, CrmServicio[]>,
): number | null {
  const eraClienteAlEmpezar = (c: Cliente) => {
    if (c.archivado) return false;
    const alta = fechaAltaDe(serviciosPorCliente.get(c.id) ?? []);
    // Sin ningún servicio contratado no es un cliente, es un contacto.
    if (!alta || mesDe(alta) >= mes) return false;
    // Y si ya se había ido antes de empezar el mes, tampoco estaba.
    return !c.fechaBaja || mesDe(c.fechaBaja) >= mes;
  };
  const base = clientes.filter(eraClienteAlEmpezar);
  if (base.length === 0) return null;
  const bajas = base.filter(c => c.fechaBaja && mesDe(c.fechaBaja) === mes).length;
  return Math.round((bajas / base.length) * 1000) / 10;
}

// ─── Valor ───────────────────────────────────────────────────────────────────

/* El LTV de UN cliente no tiene función propia: es `sumaCobrado` de sus
   movimientos, y tener dos nombres para la misma suma es cómo acaban
   separándose. `HistorialTab` la usa directamente. */

/**
 * LTV medio sobre los clientes QUE HAN COMPRADO, no sobre toda la lista.
 * Meter a los leads en la media la hunde y hace parecer que el producto vale
 * menos de lo que vale.
 */
export function ltvMedio(movimientosPorCliente: Map<string, CrmPago[]>): number | null {
  const valores = [...movimientosPorCliente.values()]
    .map(ms => ms.reduce((t, m) => t + cobradoDe(m), 0))
    .filter(v => v > 0);
  if (valores.length === 0) return null;
  return Math.round(valores.reduce((a, b) => a + b, 0) / valores.length);
}

/**
 * El importe medio de una venta de alta: cuánto entra cada vez que se cierra
 * un cliente nuevo. Junto con el LTV medio es la comparación que Dani quería
 * poder hacer — un servicio que cobra menos de entrada puede ser mejor negocio.
 */
export function ticketMedio(movimientos: CrmPago[], tipo: TipoMovimiento = 'alta'): number | null {
  const cobrados = movimientos.filter(m => m.tipo === tipo && cobradoDe(m) > 0);
  if (cobrados.length === 0) return null;
  return Math.round(cobrados.reduce((s, m) => s + cobradoDe(m), 0) / cobrados.length);
}

/** Agrupa un total de dinero por lo que sea: nombre de servicio, canal… */
export function agrupaCobrado<T>(
  filas: T[],
  clave: (f: T) => string | undefined,
  cents: (f: T) => number,
): { grupo: string; totalCents: number; n: number }[] {
  const acc = new Map<string, { totalCents: number; n: number }>();
  for (const f of filas) {
    const k = clave(f);
    if (!k) continue;
    const cur = acc.get(k) ?? { totalCents: 0, n: 0 };
    cur.totalCents += cents(f);
    cur.n += 1;
    acc.set(k, cur);
  }
  return [...acc.entries()]
    .map(([grupo, v]) => ({ grupo, ...v }))
    .sort((a, b) => b.totalCents - a.totalCents);
}

// ─── Renovaciones ────────────────────────────────────────────────────────────

export interface ResumenRenovaciones {
  previstoCents: number;
  renovadoCents: number;
  pendienteCents: number;
  perdidoCents: number;
}

/**
 * El cuadro de renovaciones de un mes: qué contratos caducan, por cuánto, y
 * cómo van. Sale de los SERVICIOS que terminan en la ventana — no hace falta
 * ninguna colección de suscripciones para contestarlo.
 */
export function renovacionesDelMes(servicios: CrmServicio[], mes: ClaveMes): ResumenRenovaciones {
  const r: ResumenRenovaciones = { previstoCents: 0, renovadoCents: 0, pendienteCents: 0, perdidoCents: 0 };
  for (const s of servicios) {
    if (s.archivado || !s.fechaFin || mesDe(s.fechaFin) !== mes) continue;
    r.previstoCents += s.importeCents;
    switch (s.resultadoRenovacion) {
      case 'renovado': r.renovadoCents += s.importeCents; break;
      case 'perdido':  r.perdidoCents += s.importeCents; break;
      default:         r.pendienteCents += s.importeCents; break;
    }
  }
  return r;
}

/** Renovados sobre los ya resueltos. Los pendientes no cuentan: aún no se sabe. */
export function tasaDeRenovacion(servicios: CrmServicio[]): number | null {
  const renovados = servicios.filter(s => s.resultadoRenovacion === 'renovado').length;
  const perdidos = servicios.filter(s => s.resultadoRenovacion === 'perdido').length;
  if (renovados + perdidos === 0) return null;
  return Math.round((renovados / (renovados + perdidos)) * 1000) / 10;
}

// ─── Estado financiero de un cliente ────────────────────────────────────────

/**
 * Cómo está un cliente de pagos. Se DERIVA de sus movimientos, no se guarda:
 * un campo aparte sería una segunda verdad que hay que mantener a mano y que
 * se queda vieja al primer despiste.
 *
 * Manda lo peor: un cliente con un impagado está impagado aunque el resto de
 * sus cuotas estén al día.
 */
export type EstadoFinanciero = 'al_dia' | 'pendiente' | 'parcial' | 'impagado';

export function estadoFinancieroDe(movimientosDelCliente: CrmPago[]): EstadoFinanciero {
  const orden: Record<EstadoPago, EstadoFinanciero | null> = {
    impagado: 'impagado', parcial: 'parcial', pendiente: 'pendiente', pagado: null,
  };
  const gravedad: EstadoFinanciero[] = ['al_dia', 'pendiente', 'parcial', 'impagado'];
  let peor: EstadoFinanciero = 'al_dia';
  for (const m of movimientosDelCliente) {
    const e = orden[m.estado];
    if (e && gravedad.indexOf(e) > gravedad.indexOf(peor)) peor = e;
  }
  return peor;
}

// ─── Interno ─────────────────────────────────────────────────────────────────

/**
 * Meses entre dos días ISO, con un decimal. Se cuenta por días partido por
 * 30,44 (la media real de un mes) en vez de restando meses de calendario: del
 * 1 de enero al 15 de febrero es mes y medio, no un mes, y en una permanencia
 * media esos medios meses se acumulan.
 */
function mesesEntre(desde: string, hasta: string): number {
  const d = Date.parse(`${desde}T00:00:00`);
  const h = Date.parse(`${hasta}T00:00:00`);
  if (!Number.isFinite(d) || !Number.isFinite(h) || h < d) return 0;
  // +1 día porque el rango es INCLUSIVO: un servicio del 1 al 31 de enero dura
  // 31 días, no 30. Sin esto la permanencia salía sistemáticamente un pelo
  // corta, un día por cada tramo contratado.
  return ((h - d) / 86_400_000 + 1) / 30.44;
}
