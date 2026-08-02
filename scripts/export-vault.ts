// Export unidireccional del CRM hacia el vault de Obsidian.
//
// Firestore sigue siendo la ÚNICA fuente de verdad operativa. El vault es capa
// de pensamiento y contexto para Claude Code — este script nunca escribe hacia
// Firestore, solo lee de ahí y escribe archivos locales.
//
// Uso:  npm run export:vault
// Necesita FIREBASE_SERVICE_ACCOUNT en el entorno (mismo patrón que
// api/ai-chat.ts: JSON de una cuenta de servicio con acceso de lectura a
// Firestore). Sin ella, el script se detiene con un mensaje claro en vez de
// fallar a medias.
//
// Qué genera:
//   - Un .md por cliente activo o pausado en 01-Mi-Negocio/Clientes/
//     (sobrescribe el archivo entero salvo su sección "## Notas", que se
//     preserva íntegra entre ejecuciones — ahí escribe el coach a mano).
//   - Actualiza SOLO las secciones "## Agregados" y "## Último export" de
//     01-Mi-Negocio/Producto-EnForma-App/crm-enforma.md — el resto de esa nota
//     (reglas de negocio, decisiones técnicas) es contenido humano, no se toca.
//
// Qué NO exporta: DNI, dirección, teléfono. El vault se sincroniza a la nube y
// no es el sitio para datos identificativos de terceros (ver README de
// 01-Mi-Negocio/Clientes: "datos reales de clientes = interno-only siempre").

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { formatEuros, sumaCents } from '../src/features/crm/lib/dinero';
import { formatDia, hoyISO, mesesDePeriodicidad } from '../src/features/crm/lib/fechas';
import type { CrmServicio, CrmPago, CrmSuscripcion, CrmReunion, EstadoCrm } from '../src/features/crm/types';
import type { UserProfile } from '../src/types';

const PROJECT_ID = 'fleet-operator-z5xj8';
const DATABASE_ID = 'ai-studio-b38fc63b-000e-4d2c-b774-20351883e870';

const VAULT = '/Users/dani/Desktop/Bóveda/Cerebro 1.0';
const CLIENTES_DIR = join(VAULT, '01-Mi-Negocio', 'Clientes');
const RESUMEN_PATH = join(VAULT, '01-Mi-Negocio', 'Producto-EnForma-App', 'crm-enforma.md');

// ── Cliente unificado (mismo criterio que src/features/crm/hooks/useClientes.ts,
//    duplicado en plano porque ese fichero importa el SDK de Firebase de
//    navegador vía dbService.ts — no es seguro evaluarlo en Node) ────────────
interface ClienteExport {
  id: string;          // userId o id de contacto
  nombre: string;
  estadoCrm: EstadoCrm;
}

function slugify(nombre: string): string {
  return nombre
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'cliente';
}

/** El servicio vigente (no archivado, sin fin o con fin futuro) que empezó más tarde. */
function servicioActual(servicios: CrmServicio[], hoy: string): CrmServicio | null {
  const vigentes = servicios
    .filter(s => !s.archivado)
    .filter(s => !s.fechaFin || s.fechaFin >= hoy)
    .sort((a, b) => b.fechaInicio.localeCompare(a.fechaInicio));
  return vigentes[0] ?? null;
}

function fechaFinPrograma(servicios: CrmServicio[]): string | null {
  const fines = servicios.map(s => s.fechaFin).filter((f): f is string => Boolean(f));
  if (fines.length === 0) return null;
  return fines.reduce((max, f) => (f > max ? f : max));
}

function mensualizado(s: CrmSuscripcion): number {
  const meses = mesesDePeriodicidad(s.periodicidad);
  if (!meses) return s.importeCents;
  return Math.round(s.importeCents / meses);
}

/** Extrae la sección "## Notas" (hasta el final del archivo) de un .md existente. */
function extraerSeccionNotas(contenido: string): string {
  const m = contenido.match(/^## Notas[\s\S]*$/m);
  return m ? m[0] : '## Notas\n';
}

/**
 * Reemplaza (o inserta, si no existe) una sección "## Título" dentro de un .md,
 * sin tocar el resto del documento. Si la sección no existe, se inserta justo
 * antes de "## Notas" (o al final si tampoco hay Notas).
 */
function actualizarSeccion(contenido: string, titulo: string, cuerpo: string): string {
  const bloqueNuevo = `## ${titulo}\n${cuerpo}`;
  const regexExistente = new RegExp(`^## ${titulo}\\n[\\s\\S]*?(?=\\n## |$)`, 'm');
  if (regexExistente.test(contenido)) {
    return contenido.replace(regexExistente, bloqueNuevo);
  }
  const idxNotas = contenido.search(/^## Notas/m);
  if (idxNotas === -1) return `${contenido.trimEnd()}\n\n${bloqueNuevo}\n`;
  return contenido.slice(0, idxNotas) + bloqueNuevo + '\n\n' + contenido.slice(idxNotas);
}

async function main() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    console.error(
      'Falta FIREBASE_SERVICE_ACCOUNT en el entorno.\n' +
      'Este script necesita una cuenta de servicio con acceso de lectura a Firestore\n' +
      '(mismo patrón que api/ai-chat.ts). Sin ella no puede leer datos — se detiene\n' +
      'aquí en vez de fallar a medias con un export incompleto.'
    );
    process.exit(1);
  }

  const app = initializeApp({ credential: cert(JSON.parse(raw)), projectId: PROJECT_ID });
  const db = getFirestore(app, DATABASE_ID);

  console.log('Leyendo Firestore…');
  const [perfilesSnap, contactosSnap, serviciosSnap, pagosSnap, suscripcionesSnap, reunionesSnap] = await Promise.all([
    db.collection('user_profiles').get(),
    db.collection('crmContactos').get(),
    db.collection('crmServicios').get(),
    db.collection('crmPagos').get(),
    db.collection('crmSuscripciones').get(),
    db.collection('crmReuniones').get(),
  ]);

  // ── Unificar clientes (perfiles con cuenta + contactos sin cuenta) ─────────
  const clientes: ClienteExport[] = [];
  perfilesSnap.forEach(d => {
    const p = d.data() as UserProfile;
    if (p.role === 'coach') return;
    clientes.push({ id: p.userId, nombre: p.displayName || p.email, estadoCrm: p.estadoCrm ?? 'activo' });
  });
  contactosSnap.forEach(d => {
    const c = d.data() as { userId?: string; nombre: string; estadoCrm: EstadoCrm };
    if (c.userId && clientes.some(cl => cl.id === c.userId)) return; // ya registrado, el perfil manda
    clientes.push({ id: d.id, nombre: c.nombre, estadoCrm: c.estadoCrm });
  });

  const servicios = serviciosSnap.docs.map(d => ({ id: d.id, ...d.data() } as CrmServicio));
  const pagos = pagosSnap.docs.map(d => ({ id: d.id, ...d.data() } as CrmPago));
  const suscripciones = suscripcionesSnap.docs.map(d => ({ id: d.id, ...d.data() } as CrmSuscripcion));
  const reuniones = reunionesSnap.docs.map(d => ({ id: d.id, ...d.data() } as CrmReunion));

  const hoy = hoyISO();
  const exportables = clientes.filter(c => c.estadoCrm === 'activo' || c.estadoCrm === 'pausado');

  if (!existsSync(CLIENTES_DIR)) mkdirSync(CLIENTES_DIR, { recursive: true });

  console.log(`Exportando ${exportables.length} fichas de cliente…`);
  let mrrTotal = 0;

  for (const cliente of exportables) {
    const serviciosCliente = servicios.filter(s => s.clientId === cliente.id);
    const pagosCliente = pagos.filter(p => p.clientId === cliente.id);
    const suscripcionesCliente = suscripciones.filter(s => s.clientId === cliente.id);
    const reunionesCliente = reuniones.filter(r => r.clientId === cliente.id);

    const actual = servicioActual(serviciosCliente, hoy);
    const finPrograma = fechaFinPrograma(serviciosCliente);
    const activasCliente = suscripcionesCliente.filter(s => s.estado === 'activa');
    const mrrCliente = sumaCents(activasCliente.map(s => ({ importeCents: mensualizado(s) })));
    mrrTotal += mrrCliente;

    const cobrado = sumaCents(pagosCliente.filter(p => p.estado === 'pagado'));
    const pendiente = sumaCents(pagosCliente.filter(p => p.estado === 'pendiente'));

    const timeline = [...serviciosCliente].sort((a, b) => b.fechaInicio.localeCompare(a.fechaInicio));
    const proximasReuniones = reunionesCliente
      .filter(r => !r.realizada)
      .sort((a, b) => a.fecha.localeCompare(b.fecha));

    const slug = slugify(cliente.nombre);
    const path = join(CLIENTES_DIR, `${slug}-crm.md`);
    const notasPreviasRaw = existsSync(path) ? readFileSync(path, 'utf8') : '';
    const notas = extraerSeccionNotas(notasPreviasRaw);

    const frontmatter = [
      '---',
      'tipo: crm-snapshot',
      'uso: interno-only',
      `estado: ${cliente.estadoCrm}`,
      `programa_actual: ${actual ? JSON.stringify(actual.nombre) : '~'}`,
      `inicio: ${actual?.fechaInicio ?? timeline[timeline.length - 1]?.fechaInicio ?? '~'}`,
      `fin: ${finPrograma ?? '~'}`,
      `mrr: ${(mrrCliente / 100).toFixed(2)}`,
      `actualizado: ${new Date().toISOString()}`,
      '---',
    ].join('\n');

    const cuerpo = [
      `# ${cliente.nombre} — CRM`,
      '',
      '> Snapshot generado automáticamente por `npm run export:vault`. No editar a mano — se sobrescribe en cada export. La única sección que se preserva es "## Notas".',
      '',
      '## Programa',
      actual
        ? `- Actual: ${actual.nombre} (${formatEuros(actual.importeCents)} / ${actual.periodicidad})`
        : '- Sin servicio vigente',
      `- Fin de programa: ${finPrograma ? formatDia(finPrograma) : 'sin fecha definida'}`,
      '',
      '## Facturación',
      `- Cobrado: ${formatEuros(cobrado)}`,
      `- Pendiente de cobro: ${formatEuros(pendiente)}`,
      `- Recurrente / mes: ${formatEuros(mrrCliente)}`,
      '',
      '## Línea de tiempo',
      timeline.length === 0
        ? '- Sin programas todavía'
        : timeline.map(s => {
            const enCurso = !s.fechaFin || s.fechaFin >= hoy;
            return `- ${formatDia(s.fechaInicio)} → ${s.fechaFin ? formatDia(s.fechaFin) : '—'} — ${s.nombre} (${enCurso ? 'en curso' : 'finalizado'})`;
          }).join('\n'),
      '',
      '## Próximas reuniones',
      proximasReuniones.length === 0
        ? '- Ninguna programada'
        : proximasReuniones.map(r => `- ${formatDia(r.fecha)} — ${r.tipo === 'optimizacion' ? 'Optimización' : 'Graduación'}`).join('\n'),
      '',
      notas,
    ].join('\n');

    writeFileSync(path, `${frontmatter}\n\n${cuerpo}`, 'utf8');
  }

  // ── Resumen agregado en crm-enforma.md (solo dos secciones, resto intacto) ─
  const contadores = { activo: 0, pausado: 0, baja: 0 };
  for (const c of clientes) contadores[c.estadoCrm] += 1;
  const pendienteTotal = sumaCents(pagos.filter(p => p.estado === 'pendiente'));

  if (existsSync(RESUMEN_PATH)) {
    let contenido = readFileSync(RESUMEN_PATH, 'utf8');
    const agregados = [
      `- Clientes activos: ${contadores.activo}`,
      `- Clientes pausados: ${contadores.pausado}`,
      `- Clientes de baja: ${contadores.baja}`,
      `- MRR total: ${formatEuros(mrrTotal)}`,
      `- Pendiente de cobro total: ${formatEuros(pendienteTotal)}`,
      '',
    ].join('\n');
    contenido = actualizarSeccion(contenido, 'Agregados', agregados);
    contenido = actualizarSeccion(contenido, 'Último export', `${new Date().toISOString()}\n`);
    writeFileSync(RESUMEN_PATH, contenido, 'utf8');
    console.log(`✓ Actualizado ${RESUMEN_PATH}`);
  } else {
    console.warn(`⚠ No existe ${RESUMEN_PATH} — no se ha podido actualizar el resumen.`);
  }

  console.log(`✓ ${exportables.length} fichas exportadas a ${CLIENTES_DIR}`);
  console.log(`  activos: ${contadores.activo} · pausados: ${contadores.pausado} · bajas: ${contadores.baja} (no exportadas)`);
  console.log(`  MRR total: ${formatEuros(mrrTotal)} · pendiente de cobro: ${formatEuros(pendienteTotal)}`);
}

main().catch(err => {
  console.error('Export falló:', err);
  process.exit(1);
});
