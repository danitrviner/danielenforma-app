import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { UserProfile, WeightCheckIn, WorkoutAssignment } from '../types';
import { getCrmSuscripciones, getPendingAiProposals, getMesocyclesForAthletes } from '../dbService';
import { getContactosDesde, registrarContacto } from '../db/contactos';
import { getBorradoresPorFirmar } from '../db/mensajesCoach';
import {
  construirBandejaDelDia, contarPorUrgencia, SenalDelDia, UrgenciaSenal, CategoriaSenal,
} from '../utils/bandejaDelDia';
import { calcularPanelRetencion } from '../utils/panelRetencion';
import PanelRetencionCard from './coach/PanelRetencionCard';
import ColaWhatsAppCard from './coach/ColaWhatsAppCard';
import { crearMensajeCoach } from '../db/mensajesCoach';
import { plantillaWhatsApp } from '../utils/plantillasWhatsApp';
import { useRespuestasDeLaBandeja } from '../hooks/useRevisionesSinLeer';
import { addDays, hoyIsoLocal } from '../utils/trainingWeek';
import { revisarMenusAutomaticos } from '../services/menuSemanalAutomatico';
import { auth } from '../firebase';
import { ActionRow as ActionRowPrimitive, EmptyState, Icon } from './ui';

/* ═══════════════════════════════════════════════════════════════════════════
   HomeCoachScreen (F3.13a, "Home Coach" del handoff transversal)

   La entrada del coach: "Requiere acción" (revisiones, pagos, planes sin
   publicar). Restilizada sobre `Home Coach - Experiencia.dc.html`
   (docs/design/fase3): filtro por chips, fila con avatar de iniciales
   (`ui/ActionRow`, nueva — el propio handoff pide reutilizarla en vez de
   inventar un tratamiento por pantalla), y estado vacío a pantalla completa
   cuando no hay nada pendiente. La sección "Al día" que vivía aquí se quitó
   en el rediseño (handoff Fase 3.2, "Home Coach"): esos atletas siguen
   accesibles desde la parrilla completa de `ClientsScreen`.

   La maqueta dibuja esto como una pantalla propia titulada "Hoy" — aquí
   vive insertada bajo la cabecera "Clientes" de `ClientsScreen`, así que no
   repetimos el título grande (quedaría duplicado con el de arriba); ver la
   nota en CLAUDE.md/el informe de rediseño sobre si esto debería separarse
   en su propia pestaña ahora que CRM ya tiene la suya.

   No sustituye a la parrilla de atletas ni al alta de nuevo cliente que ya
   vivían en ClientsScreen — esos siguen debajo, sin tocar: CRM→Clientes es
   un directorio de facturación (con contactos que ni siquiera tienen cuenta
   en la app, ver `Cliente.fuente`), no el lanzador del Hub de coaching por
   atleta. La tarjeta "Revisiones Pendientes" que vivía arriba de la
   parrilla SÍ se retira de ClientsScreen: esta pantalla la sustituye 1:1.
   ═══════════════════════════════════════════════════════════════════════════ */

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase() || '·';
}

const DIA_SEMANA = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];

/* Los tres niveles de prisa, con su nombre y su color. No es decorado: es lo
   que separa «este atleta no puede entrenar» de «avísale de que su bloque se
   acaba el viernes». Mezclarlos en una sola lista roja es lo que hace que se
   dejen de mirar. */
const META_URGENCIA: Record<UrgenciaSenal, { titulo: string; nota: string; punto: string }> = {
  bloqueado: {
    titulo: 'Está parado',
    nota: 'No puede entrenar hasta que lo toques',
    punto: 'bg-danger',
  },
  hoy: {
    titulo: 'Para hoy',
    nota: 'Está esperando algo tuyo',
    punto: 'bg-accent',
  },
  pronto: {
    titulo: 'Antes de que se te pase',
    nota: 'Nada urgente, pero nadie más te va a avisar',
    punto: 'bg-ink-3',
  },
};

const ORDEN_URGENCIA: UrgenciaSenal[] = ['bloqueado', 'hoy'];

const LABEL_CATEGORIA: Record<CategoriaSenal, string> = {
  plan: 'Planes', revision: 'Revisiones', pago: 'Pagos', propuesta: 'Asistente',
  ausencia: 'Ausencias', renovacion: 'Renovaciones', setup: 'Montaje',
};

interface Props {
  athletes: UserProfile[];
  /** Para la bandeja de respuestas de cuestionario (misma consulta que Revisiones). */
  coachId: string;
  checkins: WeightCheckIn[];
  assignmentsByEmail: Map<string, WorkoutAssignment[]>;
  loadingAssignments: boolean;
}

/** Ventana de contactos que se bajan: los que todavía callan una señal y los que mide el panel. */
const DIAS_DE_CONTACTOS = 28;

export default function HomeCoachScreen({ athletes, coachId, checkins, assignmentsByEmail, loadingAssignments }: Props) {
  // Menús semanales que se generan solos al cambiar la dieta de la semana
  // (ver services/menuSemanalAutomatico.ts). Una vez al día, en segundo plano.
  useEffect(() => {
    const yo = auth.currentUser;
    if (!yo?.email || athletes.length === 0) return;
    void revisarMenusAutomaticos(athletes, yo.uid, yo.email);
  }, [athletes]);

  const navigate = useNavigate();
  const [filtro, setFiltro] = useState<'todas' | CategoriaSenal>('todas');
  const { data: suscripciones = [] } = useQuery({
    queryKey: ['crmSuscripciones'],
    queryFn: getCrmSuscripciones,
  });
  // Misma clave que la bandeja del asistente y la pantalla de Propuestas:
  // comparten caché y se refrescan juntas al aprobar o rechazar.
  const { data: propuestasPendientes = [] } = useQuery({
    queryKey: ['aiProposalsPendientes'],
    queryFn: getPendingAiProposals,
  });

  // Los bloques de TODOS los atletas en una sola consulta por lotes (de 30 en
  // 30, ver getMesocyclesForAthletes): es lo que permite avisar de las
  // renovaciones sin pagar una lectura por cliente cada vez que se abre la app.
  const emails = useMemo(() => athletes.map(a => a.email), [athletes]);
  const { data: mesociclos = [] } = useQuery({
    queryKey: ['mesocyclesForAthletes', emails],
    queryFn: () => getMesocyclesForAthletes(emails),
    enabled: emails.length > 0,
  });

  const hoyIso = hoyIsoLocal();

  // Las respuestas de cuestionario de la bandeja de Revisiones (misma clave de
  // caché: no cuesta una lectura más si esa pantalla ya se abrió) y los
  // contactos del coach por WhatsApp (28-10). Con las dos cosas la bandeja
  // sabe qué revisión lleva días sin contestar y a quién ya le has escrito.
  const { responses: respuestas } = useRespuestasDeLaBandeja(coachId, true);
  const desdeContactos = useMemo(() => addDays(hoyIso, -DIAS_DE_CONTACTOS), [hoyIso]);
  const { data: contactos = [] } = useQuery({
    queryKey: ['contactos', desdeContactos],
    queryFn: () => getContactosDesde(desdeContactos),
  });
  // Borradores de mensaje que dejó la máquina (latido) y Dani no ha firmado
  // (29-10): una consulta, agrupada por atleta para la bandeja.
  const { data: borradores = [] } = useQuery({ queryKey: ['mensajesCoach', 'borradores'], queryFn: getBorradoresPorFirmar });
  const borradoresPorEmail = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of borradores) m.set(b.athleteId.toLowerCase(), (m.get(b.athleteId.toLowerCase()) ?? 0) + 1);
    return m;
  }, [borradores]);
  const queryClient = useQueryClient();
  const marcarContacto = useMutation({
    mutationFn: async (s: SenalDelDia) => {
      await registrarContacto({ athleteId: s.athleteEmail, fecha: hoyIso, motivo: s.contacto!.motivo, canal: 'whatsapp' });
      // Que la app no se quede muda (tanda 7): el atleta ve en «Lo último de
      // Dani» que le ha escrito por WhatsApp. Es verdad y va con su nombre.
      await crearMensajeCoach({
        id: `wa_${s.athleteEmail.toLowerCase()}_${hoyIso}`, athleteId: s.athleteEmail, tipo: 'libre', autor: 'coach', estado: 'aprobado',
        texto: `Te he escrito por WhatsApp: mira el móvil y contéstame por ahí.`, fecha: hoyIso, firmadoEn: new Date().toISOString(),
      }).catch(console.error);
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['contactos'] }); },
  });
  const [copiado, setCopiado] = useState<string | null>(null);
  const textoDe = (s: SenalDelDia) => plantillaWhatsApp(s.contacto!.motivo, { nombre: s.athleteName, hoy: hoyIso, ...s.contacto });
  const copiar = async (s: SenalDelDia) => {
    try { await navigator.clipboard.writeText(textoDe(s)); } catch { /* sin portapapeles: el texto se abre igual */ }
    setCopiado(s.id);
  };
  const abrirChat = (s: SenalDelDia) => {
    const tel = athletes.find(a => a.email === s.athleteEmail)?.telefono;
    const numero = tel ? `${tel.prefijo}${tel.numero}`.replace(/[^\d]/g, '') : '';
    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(textoDe(s))}`, '_blank', 'noopener');
  };
  const escribirle = async (s: SenalDelDia) => { await copiar(s); abrirChat(s); };

  // El panel de retención: las cuatro cifras de la revisión del 28-10, con lo
  // que ya está cargado (ver utils/panelRetencion.ts).
  const panel = useMemo(
    () => calcularPanelRetencion({ atletas: athletes, respuestas, contactos, hoy: hoyIso }),
    [athletes, respuestas, contactos, hoyIso],
  );

  /* Quién necesita algo tuyo, y con cuánta prisa. La decisión vive en
     `utils/bandejaDelDia.ts`, con sus tests: aquí solo se pinta. Antes estaba
     escrita a mano en este componente y solo miraba tres cosas — lo que de
     verdad se escapa (el que lleva nueve días sin entrar, el bloque que se
     acaba, el montaje que se quedó al 55 %) no avisaba por su cuenta. */
  const senales = useMemo(() => {
    if (loadingAssignments) return [];
    const pagosVencidos = suscripciones
      .filter(s => s.estado === 'activa' && s.proximoCobro <= hoyIso)
      .map(s => ({
        nombre: s.clientNombre,
        texto: `Pago vencido · ${s.concepto}`,
        destino: `/crm/clientes/${s.clientId}`,
      }));
    const propuestasPorEmail = new Map<string, number>();
    for (const p of propuestasPendientes) {
      propuestasPorEmail.set(p.athleteId, (propuestasPorEmail.get(p.athleteId) ?? 0) + 1);
    }
    return construirBandejaDelDia({
      atletas: athletes,
      checkins,
      asignacionesPorEmail: assignmentsByEmail,
      mesociclos,
      pagosVencidos,
      propuestasPorEmail,
      respuestas,
      contactos,
      borradoresPorEmail,
      hoy: hoyIso,
    // «Antes de que se te pase» (urgencia `pronto`) se retiró de la pantalla:
    // el coach no la usa. Se filtra aquí para que tampoco cuente en los chips
    // ni dispare el estado vacío con señales que no se pintan.
    }).filter(s => s.urgencia !== 'pronto');
  }, [loadingAssignments, athletes, checkins, assignmentsByEmail, mesociclos, suscripciones, propuestasPendientes, respuestas, contactos, borradoresPorEmail, hoyIso]);

  const visibles = filtro === 'todas' ? senales : senales.filter(s => s.categoria === filtro);
  // Sobre `visibles`, no sobre `senales`: con un filtro de categoría activo, la
  // cabecera decía «· 5» encima de una lista de 2.
  const porUrgencia = useMemo(() => contarPorUrgencia(visibles), [visibles]);

  const chips = useMemo(() => {
    const cuenta = new Map<CategoriaSenal, number>();
    for (const s of senales) cuenta.set(s.categoria, (cuenta.get(s.categoria) ?? 0) + 1);
    return [
      { id: 'todas' as const, label: 'Todas', count: senales.length },
      ...[...cuenta.entries()].map(([id, count]) => ({ id, label: LABEL_CATEGORIA[id], count })),
    ];
  }, [senales]);

  const irA = (s: SenalDelDia) => navigate(s.destino);

  const hoy = new Date();

  /* El panel de retención va SIEMPRE, también con la bandeja vacía: «todo al
     día» con dos atletas apagándose no es todo al día. Cuatro cifras y, si
     hay alguien en su primera semana, en qué día va (contacto diario
     prometido en la venta). */
  const panelCard = <PanelRetencionCard panel={panel} />;

  if (senales.length === 0) {
    return (
      <section className="space-y-4">
        {panelCard}
        <EmptyState
          icon="check"
          iconTone="accent"
          title="Todo al día"
          description="Ningún atleta necesita algo tuyo ahora mismo."
        />
      </section>
    );
  }

  return (
    <section className="space-y-4">
      {panelCard}

      {/* La cola de WhatsApp del día (tanda 7): todo lo que hay que mandar, junto. */}
      <ColaWhatsAppCard
        senales={senales}
        textoDe={textoDe}
        onCopiar={s => void copiar(s)}
        onAbrir={abrirChat}
        onMandado={s => marcarContacto.mutate(s)}
        copiadoId={copiado}
        ocupado={marcarContacto.isPending}
      />
      {/* Las propuestas del asistente, en la pantalla por la que se entra.
          Su pantalla vive en /propuestas y en la barra lateral de PC, pero en
          el móvil la barra de abajo está llena (cuatro destinos al límite de
          ancho) y el botón del asistente con su contador es `md:` — o sea que
          desde el móvil no había NADA que dijera que hay algo esperando.
          Aquí sí, y en los dos sitios. */}
      {propuestasPendientes.length > 0 && (
        <button
          type="button"
          onClick={() => navigate('/propuestas')}
          className="w-full flex items-center gap-3 rounded-field border border-warning/30 bg-warning/10 px-4 py-3 text-left transition-colors hover:bg-warning/15"
        >
          <Icon name="smart_toy" size="m" filled className="text-warning flex-shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block font-sans font-bold text-body-s text-ink">
              {propuestasPendientes.length === 1
                ? '1 propuesta por revisar'
                : `${propuestasPendientes.length} propuestas por revisar`}
            </span>
            <span className="block font-mono text-caption text-ink-2 truncate">
              {[...new Set(propuestasPendientes.map(p => p.athleteId))].join(' · ')}
            </span>
          </span>
          <Icon name="arrow_forward" size="s" className="text-ink-3 flex-shrink-0" />
        </button>
      )}

      <p className="font-mono text-label uppercase tracking-wider text-ink-3">
        {DIA_SEMANA[hoy.getDay()]} · {athletes.length} atleta{athletes.length === 1 ? '' : 's'} activo{athletes.length === 1 ? '' : 's'}
      </p>

      {chips.length > 1 && (
        <div className="-mx-1 flex gap-2 overflow-x-auto hide-scrollbar px-1 pb-1">
          {chips.map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => setFiltro(c.id)}
              className={
                'flex-none rounded-chip px-3 py-2 font-mono text-caption font-bold uppercase transition-colors duration-(--duration-state) '
                + (filtro === c.id ? 'bg-accent text-on-accent' : 'bg-hairline text-ink-2 hover:bg-strong')
              }
            >
              {c.label} · {c.count}
            </button>
          ))}
        </div>
      )}

      {/* Un grupo por nivel de prisa. Una sola lista roja con todo mezclado es
          lo que hace que se deje de mirar: si «no puede entrenar» y «avísale de
          que su bloque acaba el viernes» pesan igual, deja de pesar ninguno. */}
      {ORDEN_URGENCIA.filter(u => visibles.some(s => s.urgencia === u)).map(u => (
        <div key={u} className="space-y-2">
          <div className="flex items-baseline gap-2">
            <span className={`h-1.5 w-1.5 rounded-full ${META_URGENCIA[u].punto} ${u === 'bloqueado' ? 'animate-pulse' : ''}`} />
            <span className="font-mono text-caption uppercase tracking-widest text-ink-3">
              {META_URGENCIA[u].titulo} · {porUrgencia[u]}
            </span>
            <span className="font-mono text-caption text-ink-3 truncate">{META_URGENCIA[u].nota}</span>
          </div>
          <div className="divide-y divide-hairline overflow-hidden rounded-field border border-hairline bg-surface">
            {visibles.filter(s => s.urgencia === u).map(s => (
              <div key={s.id}>
                <ActionRowPrimitive
                  initials={iniciales(s.athleteName)}
                  title={s.athleteName}
                  meta={s.texto}
                  urgent
                  onClick={() => irA(s)}
                />
                {/* La señal se resuelve escribiéndole (28-10): la plantilla
                    se copia y se abre su WhatsApp; «Ya le he escrito» deja
                    constancia y calla la señal unos días. */}
                {s.contacto && (
                  <div className="flex items-center gap-2 px-4 pb-3 -mt-1">
                    <button
                      type="button"
                      onClick={() => void escribirle(s)}
                      className="inline-flex items-center gap-1.5 rounded-control border border-accent-line bg-accent-bg px-3 py-1.5 font-mono text-caption font-bold uppercase text-accent-ink transition-colors hover:bg-accent/15"
                    >
                      <Icon name="chat" size="s" />
                      {copiado === s.id ? 'Copiado' : 'Escribirle'}
                    </button>
                    <button
                      type="button"
                      onClick={() => marcarContacto.mutate(s)}
                      disabled={marcarContacto.isPending}
                      className="inline-flex items-center gap-1.5 rounded-control px-3 py-1.5 font-mono text-caption font-bold uppercase text-ink-2 transition-colors hover:bg-raised disabled:opacity-50"
                    >
                      <Icon name="check" size="s" />
                      Ya le he escrito
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
