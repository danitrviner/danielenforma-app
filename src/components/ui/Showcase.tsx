import React from 'react';
import {
  Badge, Banner, Button, Card, Chip, CollapsingHeader, Dialog, EffortScale, EmptyState, Icon, Input,
  ListRow, PageHeader, Pager, ProgressBar, RingSeal, RirScale, SearchField, SegmentedControl, Select, Sheet,
  Skeleton, Sparkline, Stepper, SwipeRow, Tabs,
  type BadgeTone, type ButtonSize, type ButtonVariant, type IconSize, type RirValue,
  type SegmentedOption, type SelectOption, type TabItem,
} from './index';
import { ZONE_COLOR } from '../../utils/cardioZones';

/* ═══════════════════════════════════════════════════════════════════════════
   Escaparate de primitivas — ruta `/ui`, solo en desarrollo

   Para qué sirve. Una primitiva construida y nunca renderizada es una
   suposición: la app no la usa todavía —eso es F8— así que sin esta página no
   habría forma de ver lo que F7 produce hasta dentro de dos fases. Aquí cada
   primitiva se ve sola, con todas sus variantes a la vez y sin datos reales
   alrededor, que es justo lo que una pantalla nunca deja hacer.

   Cómo se lee. **A 375 px primero**, y siempre tras recarga completa: una
   verificación de layout sobre el estado caliente de HMR ya dio un falso
   negativo una vez (R9 en el panel de estado).

   Esta página se mide como cualquier otro archivo del repo: escala de
   espaciado, tokens de color, suelo tipográfico. No es un patio trasero.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Cada primitiva añade su sección aquí al entrar. */
function Seccion({
  titulo,
  resumen,
  children,
}: {
  titulo: string;
  resumen: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-sans text-title-m font-bold text-ink">{titulo}</h2>
        <p className="font-sans text-body-s text-ink-2">{resumen}</p>
      </div>
      {children}
    </section>
  );
}

/**
 * Un ejemplo con su pie: qué variante es y, cuando importa, qué la distingue.
 *
 * `key` va declarada en las props a propósito. El repo no tiene `@types/react`
 * instalado —`React.ReactNode` y compañía resuelven a `any`— y sin ellos TS no
 * fusiona `JSX.IntrinsicAttributes`, así que un componente con props tipadas a
 * mano rechaza `key` como propiedad de más. Las props propias sí se comprueban;
 * las de React, no. Anotado como hallazgo al cerrar la fase.
 */
function Muestra({
  pie,
  children,
}: {
  pie: string;
  children: React.ReactNode;
  key?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-surface border border-hairline bg-surface p-4">
      <div className="flex min-h-10 items-center justify-center text-ink">{children}</div>
      <span className="font-sans text-caption uppercase tracking-widest text-ink-3">{pie}</span>
    </div>
  );
}

const VARIANTES_BOTON: { variant: ButtonVariant; texto: string }[] = [
  { variant: 'primary', texto: 'Empezar entreno' },
  { variant: 'secondary', texto: 'Ver detalle' },
  { variant: 'ghost', texto: 'Cancelar' },
  { variant: 'danger', texto: 'Eliminar' },
];

const TAMANOS_BOTON: { size: ButtonSize; pie: string }[] = [
  { size: 's', pie: 's · 36' },
  { size: 'm', pie: 'm · 52' },
  { size: 'l', pie: 'l · 56' },
];

const OPCIONES_SEGMENTO: SegmentedOption[] = [
  { value: 'liss', label: 'LISS' },
  { value: 'hiit', label: 'HIIT' },
  { value: 'pasos', label: 'Pasos' },
];

const CATEGORIAS = ['Pecho', 'Espalda', 'Pierna', 'Hombro'];

const PESTANAS_POCAS: TabItem[] = [
  { id: 'resumen', label: 'Resumen', icon: 'dashboard' },
  { id: 'dietas', label: 'Dietas', icon: 'restaurant' },
  { id: 'revisiones', label: 'Revisiones', icon: 'fact_check', count: 3 },
];

const PESTANAS_MUCHAS: TabItem[] = [
  { id: 'revisiones', label: 'Revisiones' },
  { id: 'entrenamientos', label: 'Entrenamientos' },
  { id: 'dietas', label: 'Dietas' },
  { id: 'macrociclos', label: 'Macrociclos' },
  { id: 'roadmap', label: 'Road map' },
  { id: 'analisis', label: 'Análisis' },
];

const TONOS_BADGE: { tone: BadgeTone; texto: string; icon: string }[] = [
  { tone: 'neutral', texto: 'Borrador', icon: 'edit_note' },
  { tone: 'success', texto: 'Completado', icon: 'check' },
  { tone: 'warning', texto: 'Pendiente', icon: 'schedule' },
  { tone: 'danger', texto: 'Atrasado', icon: 'priority_high' },
  { tone: 'info', texto: 'Enviado', icon: 'send' },
  { tone: 'data', texto: 'Nuevo', icon: 'star' },
];

const OPCIONES_OBJETIVO: SelectOption[] = [
  { value: 'reducir_grasa', label: 'Reducir grasa' },
  { value: 'mantener', label: 'Mantener' },
  { value: 'aumentar_musculo', label: 'Aumentar músculo' },
];

const TAMANOS_ICONO: { size: IconSize; pie: string }[] = [
  { size: 's', pie: 's · 16' },
  { size: 'm', pie: 'm · 20' },
  { size: 'l', pie: 'l · 24' },
  { size: 'xl', pie: 'xl · 32' },
];

export default function Showcase() {
  // Estado local solo para que los ejemplos se puedan tocar de verdad. Un campo
  // que no se deja escribir no prueba nada.
  const [texto, setTexto] = React.useState('');
  const [correo, setCorreo] = React.useState('');
  const [peso, setPeso] = React.useState('');
  const [objetivo, setObjetivo] = React.useState('');
  const [pulsaciones, setPulsaciones] = React.useState(0);
  const [pestana, setPestana] = React.useState('resumen');
  const [pestanaLarga, setPestanaLarga] = React.useState('revisiones');
  const [pagina, setPagina] = React.useState(0);
  const [paginaOscura, setPaginaOscura] = React.useState(0);
  const [categorias, setCategorias] = React.useState<string[]>(['Pecho']);
  const [tags, setTags] = React.useState(['Sin gluten', 'Vegetariano', 'Rápido']);
  const [filaPulsada, setFilaPulsada] = React.useState('');
  const [vecesAtras, setVecesAtras] = React.useState(0);
  const [sheetAbierto, setSheetAbierto] = React.useState(false);
  const [sheetPickerAbierto, setSheetPickerAbierto] = React.useState(false);
  const [dialogAbierto, setDialogAbierto] = React.useState(false);
  const [dialogXlAbierto, setDialogXlAbierto] = React.useState(false);
  const [vecesCrearRutina, setVecesCrearRutina] = React.useState(0);
  const [segundoOverlayAbierto, setSegundoOverlayAbierto] = React.useState(false);
  const pesoInvalido = peso.trim() !== '' && Number.isNaN(Number(peso.replace(',', '.')));

  // Fase 3 — estado de las primitivas nuevas.
  const [carga, setCarga] = React.useState(60);
  const [segmento, setSegmento] = React.useState('liss');
  const [rir, setRir] = React.useState<RirValue | null>(null);
  const [esfuerzo, setEsfuerzo] = React.useState<number | null>(null);
  const [busqueda, setBusqueda] = React.useState('');
  const [vecesBorrado, setVecesBorrado] = React.useState(0);
  const [filaBorrada, setFilaBorrada] = React.useState(false);
  const miniaturaScrollRef = React.useRef<HTMLDivElement>(null);

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-2">
        <span className="font-sans text-caption uppercase tracking-widest text-accent">
          Design System · Fase 3
        </span>
        <h1 className="font-sans text-display font-bold text-ink">Primitivas</h1>
        <p className="font-sans text-body-s text-ink-2">
          Las piezas de components/ui, re-skineadas con los tokens del handoff de experiencia
          (docs/design/fase3/) más las nuevas de F3.3: ProgressBar, Banner, Stepper,
          SegmentedControl, RirScale, EffortScale, Sparkline, RingSeal, SwipeRow, SearchField y
          CollapsingHeader.
        </p>
      </header>

      <Seccion
        titulo="Icon"
        resumen="Material Symbols con escala propia, de 4 pasos. No es la escala tipográfica: un icono se elige por peso óptico, no por el escalón del texto que acompaña."
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {TAMANOS_ICONO.map(({ size, pie }) => (
            <Muestra key={size} pie={pie}>
              <Icon name="fitness_center" size={size} />
            </Muestra>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Muestra pie="contorno">
            <Icon name="favorite" size="l" />
          </Muestra>
          <Muestra pie="relleno">
            <Icon name="favorite" size="l" filled />
          </Muestra>
          <Muestra pie="hereda color">
            <span className="text-accent">
              <Icon name="bolt" size="l" filled />
            </span>
          </Muestra>
          <Muestra pie="con nombre">
            <Icon name="notifications" size="l" label="Notificaciones" />
          </Muestra>
        </div>

        <p className="font-sans text-body-s text-ink-3">
          El color se hereda del contenedor: la primitiva no lo decide. Sin la prop label el icono
          es decoración y queda oculto al lector de pantalla — con ella, se anuncia como imagen con
          nombre.
        </p>
      </Seccion>

      <Seccion
        titulo="Button"
        resumen="Cuatro variantes y tres tamaños. El dorado es la acción siguiente y va uno por pantalla; el tamaño por defecto mide 44 px, que es el mínimo táctil."
      >
        <div className="flex flex-col gap-3">
          {VARIANTES_BOTON.map(({ variant, texto }) => (
            <div key={variant} className="flex items-center gap-3">
              <Button variant={variant} icon="bolt">{texto}</Button>
              <span className="font-sans text-caption uppercase tracking-widest text-ink-3">
                {variant}
              </span>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* El `key` va en el envoltorio y no en el Button: sin `@types/react`
              instalado, un componente con props tipadas a mano lo rechaza como
              propiedad de más (ver la nota en Muestra). */}
          {TAMANOS_BOTON.map(({ size, pie }) => (
            <div key={size}>
              <Button size={size} variant="secondary">{pie}</Button>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" loading>Guardando</Button>
          <Button variant="secondary" disabled icon="lock">Bloqueado</Button>
          <Button variant="secondary" iconTrailing="chevron_right">Siguiente</Button>
          <Button variant="ghost" icon="close" label="Cerrar" />
          <Button variant="secondary" icon="more_vert" label="Más opciones" />
        </div>

        <Button variant="primary" fullWidth icon="check">Ancho completo</Button>

        <p className="font-sans text-body-s text-ink-3">
          Sin texto, el botón se vuelve cuadrado para no perder objetivo táctil y exige la prop
          label. Con el tabulador se ve el anillo de foco: hoy no hay ni un focus-visible en toda
          la app, y una primitiva nueva no puede nacer con esa deuda.
        </p>
      </Seccion>

      <Seccion
        titulo="Input"
        resumen="16 px siempre, porque por debajo iOS hace zoom al enfocar y no lo deshace. La etiqueta apunta a su campo: hoy hay 116 que no lo hacen."
      >
        <div className="flex flex-col gap-4">
          <Input label="Nombre" value={texto} onChange={setTexto} placeholder="Cómo te llamas" />
          <Input
            label="Correo"
            type="email"
            icon="mail"
            value={correo}
            onChange={setCorreo}
            placeholder="tu@correo.com"
            hint="Lo usamos para avisarte de tus revisiones."
            required
          />
          <Input
            label="Peso de hoy"
            value={peso}
            onChange={setPeso}
            inputMode="decimal"
            placeholder="72,4"
            hint="En kilos, con un decimal."
            error={pesoInvalido ? 'Escribe solo números.' : undefined}
          />
          <Input label="Bloqueado" value="No se puede editar" onChange={() => {}} disabled />
        </div>

        <p className="font-sans text-body-s text-ink-3">
          Al tocar la etiqueta se enfoca el campo: objetivo táctil gratis en móvil. La ayuda y el
          error ocupan el mismo sitio —mientras haya error, tapa a la ayuda— y el campo lo anuncia
          con aria-invalid. Escribe letras en el peso para verlo.
        </p>
      </Seccion>

      <Seccion
        titulo="Select"
        resumen="Sigue siendo un desplegable nativo —en móvil la rueda del sistema gana a cualquier lista que dibujemos— pero con la piel del DS en vez de la del sistema."
      >
        <div className="flex flex-col gap-4">
          <Select
            label="Objetivo"
            value={objetivo}
            onChange={setObjetivo}
            options={OPCIONES_OBJETIVO}
            placeholder="Elige uno…"
            hint="Se puede cambiar en cualquier momento."
          />
          <Select
            label="Nivel"
            value=""
            onChange={() => {}}
            options={OPCIONES_OBJETIVO}
            placeholder="Sin elegir"
            error="Elige un nivel para continuar."
          />
          <Select label="Bloqueado" value="mantener" onChange={() => {}} options={OPCIONES_OBJETIVO} disabled />
        </div>

        <p className="font-sans text-body-s text-ink-3">
          La lista desplegada la dibuja el sistema operativo y no se puede maquillar desde aquí. Un
          selector con iconos, descripciones o búsqueda necesita un menú propio: eso llega en F9,
          cuando exista Sheet.
        </p>
      </Seccion>

      <Seccion
        titulo="Card"
        resumen="Sin sombra: sobre un fondo casi negro la elevación se comunica cambiando de superficie, y el borde ya define el contorno. F6 retiró 67 sombras por esto."
      >
        <Card title="Entrenamiento de hoy" subtitle="Empuje · 5 ejercicios">
          <p className="font-sans text-body-s text-ink-2">
            El contenido va debajo de la cabecera, con el mismo hueco siempre.
          </p>
        </Card>

        <Card
          variant="raised"
          title="Con acción a la derecha"
          subtitle="La zona derecha admite un botón, un dato o una insignia"
          action={<Button size="s" variant="ghost" icon="more_vert" label="Opciones" />}
        >
          <p className="font-sans text-body-s text-ink-2">
            Variante elevada: cambia de superficie, no proyecta sombra.
          </p>
        </Card>

        <Card
          title="Tarjeta pulsable"
          subtitle="Es un button de verdad, no un div con onClick"
          onClick={() => setPulsaciones((n) => n + 1)}
          action={<Icon name="chevron_right" size="m" />}
        >
          <p className="font-sans text-body-s text-ink-2">
            Pulsada {pulsaciones} {pulsaciones === 1 ? 'vez' : 'veces'}. Con el tabulador se enfoca
            y el lector de pantalla la anuncia.
          </p>
        </Card>

        <p className="font-sans text-body-s text-ink-3">
          Radio 16 en la tarjeta y 10 en lo que lleva dentro: un hijo baja siempre un escalón. Si
          iguala al padre, las esquinas se ven descuadradas.
        </p>
      </Seccion>

      <Seccion
        titulo="Badge"
        resumen="Estado, no acción: no se pulsa. El color sale de la fórmula del DS —texto al 100 %, fondo al 10 %, borde al 25 %— y no de una elección por tarjeta."
      >
        {/* El `key` va en el envoltorio, como en el resto del escaparate: sin
            `@types/react` un componente con props tipadas lo rechaza. */}
        <div className="flex flex-wrap gap-2">
          {TONOS_BADGE.map(({ tone, texto, icon }) => (
            <span key={tone}><Badge tone={tone} icon={icon}>{texto}</Badge></span>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {TONOS_BADGE.map(({ tone, texto }) => (
            <span key={tone}><Badge tone={tone} dot>{texto}</Badge></span>
          ))}
        </div>

        <Card title="Dentro de una tarjeta" action={<Badge tone="success" icon="check">Al día</Badge>}>
          <p className="font-sans text-body-s text-ink-2">
            Es el sitio donde más aparece: la esquina derecha de una cabecera.
          </p>
        </Card>

        <p className="font-sans text-body-s text-ink-3">
          No hay tono dorado a propósito. El oro significa «lo siguiente que tienes que hacer», y un
          estado no es una acción: marcar Pendiente en oro es lo que hace que el oro deje de
          significar algo.
        </p>
      </Seccion>

      <Seccion
        titulo="Pager"
        resumen="Carrusel de páginas con puntos (F3 del plan de réplica FITIV), sin ninguna librería nueva: scroll-snap del core de Tailwind v4 + un índice derivado de scrollLeft. Nace aquí porque el inventario del DS excluye ui/ a propósito."
      >
        <Pager value={pagina} onChange={setPagina} label="Ejemplo con puntos fuera" dots="outside">
          {['Uno', 'Dos', 'Tres', 'Cuatro'].map((n) => (
            <div key={n} className="flex h-28 items-center justify-center rounded-surface border border-hairline bg-surface">
              <span className="font-mono text-title-l text-ink">{n}</span>
            </div>
          ))}
        </Pager>

        <p className="font-sans text-body-s text-ink-3">
          Con dedo o trackpad, desliza — los puntos siguen al scroll real, no al revés. Con teclado:
          tabula hasta el carrusel y usa las flechas, Inicio o Fin.
        </p>

        <p className="font-sans text-body-s text-ink-2">
          Página activa: <span className="font-bold text-ink">{pagina + 1} de 4</span>
        </p>

        <div className="rounded-surface overflow-hidden" style={{ background: `linear-gradient(180deg, ${ZONE_COLOR.z2}f2, ${ZONE_COLOR.z2}cc)` }}>
          <Pager value={paginaOscura} onChange={setPaginaOscura} label="Ejemplo con puntos dentro, fondo de color" dots="inside">
            {['FC', 'Calorías', 'Zonas'].map((n) => (
              <div key={n} className="flex h-40 flex-col items-center justify-center gap-1 pb-6">
                <span className="font-mono text-caption uppercase text-bg/70">{n}</span>
                <span className="font-sans text-hero font-bold text-bg">142</span>
              </div>
            ))}
          </Pager>
        </div>

        <p className="font-sans text-body-s text-ink-3">
          Con <code className="font-mono text-ink-2">dots=&quot;inside&quot;</code> los puntos se superponen al
          contenido — el patrón de la pantalla en vivo de cardio, a pantalla completa sobre el color
          de zona.
        </p>
      </Seccion>

      <Seccion
        titulo="Tabs"
        resumen="La píldora segmentada que la app repite en el hub de cliente, Nutrición, Entrenamiento, Academia, Cardio y el CRM. Escrita a mano cada vez, y por eso F2 tuvo que arreglar cuatro que desbordaban."
      >
        <Tabs items={PESTANAS_POCAS} value={pestana} onChange={setPestana} label="Ejemplo corto" />

        <Card padding="s">
          <p className="font-sans text-body-s text-ink-2">
            Sección activa: <span className="font-bold text-ink">{pestana}</span>. La primitiva no
            guarda el estado ni pinta el contenido: avisa y ya.
          </p>
        </Card>

        <Tabs
          items={PESTANAS_MUCHAS}
          value={pestanaLarga}
          onChange={setPestanaLarga}
          label="Ejemplo largo"
        />

        <p className="font-sans text-body-s text-ink-3">
          Seis pestañas no caben en 375 px, y no hay reparto de anchos que lo arregle: se desliza.
          Con el tabulador se entra en el grupo y con las flechas se cambia de pestaña — Inicio y
          Fin van a los extremos.
        </p>
      </Seccion>

      <Seccion
        titulo="Chip"
        resumen="Lo que Badge deja fuera a propósito: se pulsa. Filtros que se activan y desactivan, alimentos seleccionables, tags que se pueden quitar."
      >
        <div className="flex flex-wrap gap-2">
          {CATEGORIAS.map((cat) => (
            <span key={cat}>
              <Chip
                selected={categorias.includes(cat)}
                onClick={() => setCategorias((prev) =>
                  prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat])}
              >
                {cat}
              </Chip>
            </span>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span key={tag}>
              <Chip icon="local_offer" onRemove={() => setTags((prev) => prev.filter((t) => t !== tag))}>
                {tag}
              </Chip>
            </span>
          ))}
          {tags.length === 0 && (
            <span className="font-sans text-body-s text-ink-3">Sin tags — quítalos todos arriba.</span>
          )}
        </div>

        <p className="font-sans text-body-s text-ink-3">
          {categorias.length === 0
            ? 'Ningún filtro activo.'
            : `Filtros activos: ${categorias.join(', ')}.`}
          {' '}El botón de quitar es HERMANO del de seleccionar, no está anidado dentro: un botón
          dentro de otro botón es HTML inválido y el navegador lo repara moviéndolo a un sitio
          impredecible del árbol.
        </p>
      </Seccion>

      <Seccion
        titulo="ListRow"
        resumen="El patrón «icono a la izquierda, título y subtítulo en medio, algo a la derecha» que se repite en más de una docena de pantallas. Cuando es pulsable, la fila entera es el objetivo táctil, no solo el texto."
      >
        <Card padding="none">
          <ListRow
            title="Marcos García"
            subtitle="Última revisión hace 3 días"
            leading={
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-raised">
                <Icon name="person" size="m" />
              </span>
            }
            trailing={<Badge tone="warning">Pendiente</Badge>}
            onClick={() => setFilaPulsada('Marcos García')}
          />
          <ListRow
            title="Press banca"
            subtitle="Pecho · Barra"
            leading={<Icon name="fitness_center" size="m" className="text-ink-3" />}
            chevron
            onClick={() => setFilaPulsada('Press banca')}
          />
          <ListRow
            title="Sin interacción"
            subtitle="Esta fila no lleva onClick: renderiza un div, no un button"
            leading={<Icon name="info" size="m" className="text-ink-3" />}
          />
        </Card>

        <p className="font-sans text-body-s text-ink-3">
          {filaPulsada ? `Última fila pulsada: ${filaPulsada}.` : 'Ninguna fila pulsada todavía.'}
          {' '}Con onClick renderiza un button que ocupa el ancho completo; sin él, un contenedor
          simple.
        </p>
      </Seccion>

      <Seccion
        titulo="PageHeader"
        resumen="Título grande, ceja opcional, acción a la derecha. TrainingCoachScreen, ClientsScreen y ReviewsScreen la reescriben cada una a mano — es la fuente del bug de 2026-07-03 donde una pantalla se olvidó del patrón entero."
      >
        <Card padding="none">
          <div className="p-4">
            <PageHeader
              eyebrow="Consola de Entrenador"
              title="Entrenamiento"
              action={<Button size="s" icon="add" label="Añadir" />}
            />
          </div>
        </Card>

        {/* El caso que ha roto DOS veces (P0-3): acción ancha —insignia + botón con
            etiqueta larga— a 375 px. Los otros dos ejemplos usan acciones cortas
            y no lo reproducían, que es justo por lo que la regresión volvió sin
            que nadie la viera. */}
        <Card padding="none">
          <div className="p-4">
            <PageHeader
              title="Revisiones"
              subtitle="Historial cronológico de check-ins y respuestas de cuestionarios."
              action={
                <div className="flex flex-wrap items-center gap-3">
                  <Badge tone="warning" icon="pending_actions">1 pendiente</Badge>
                  <Button icon="rate_review">Empezar a revisar</Button>
                </div>
              }
            />
          </div>
        </Card>

        <Card padding="none">
          <div className="p-4">
            <PageHeader
              title="Marcos García"
              subtitle="Cliente desde marzo de 2026"
              onBack={() => setVecesAtras((n) => n + 1)}
            />
          </div>
        </Card>

        <p className="font-sans text-body-s text-ink-3">
          Veces que se pulsó volver: {vecesAtras}. La ceja usa borde de acento translúcido, no oro
          sólido: es contexto, no la acción de la pantalla — el oro se reserva para el botón que sí
          hace algo.
        </p>
      </Seccion>

      <Seccion
        titulo="Sheet"
        resumen="El panel que sube desde abajo. Plantilla de lo que a los 39 overlays artesanales de la app les falta hoy: foco atrapado, Escape, y el bloqueo de scroll sin el bug clásico de esta migración (R4)."
      >
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" icon="tune" onClick={() => setSheetAbierto(true)}>
            Abrir Sheet
          </Button>
          <Button variant="secondary" icon="search" onClick={() => setSheetPickerAbierto(true)}>
            Abrir Sheet con toolbar
          </Button>
        </div>

        <Sheet
          open={sheetAbierto}
          onClose={() => setSheetAbierto(false)}
          title="Filtrar ejercicios"
          footer={
            <>
              <Button variant="ghost" onClick={() => setSheetAbierto(false)}>Cancelar</Button>
              <Button variant="primary" onClick={() => setSheetAbierto(false)}>Aplicar</Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <Select
              label="Grupo muscular"
              value=""
              onChange={() => {}}
              options={OPCIONES_OBJETIVO}
              placeholder="Cualquiera"
            />
            <p className="font-sans text-body-s text-ink-3">
              Prueba el tabulador: el foco no sale de este panel. Prueba Escape, o toca fuera.
            </p>
          </div>
        </Sheet>

        <Sheet
          open={sheetPickerAbierto}
          onClose={() => setSheetPickerAbierto(false)}
          title="Añadir alimento"
          toolbar={(
            <div className="flex items-center gap-2 border-y border-hairline bg-raised px-4 py-2">
              <Icon name="search" size="s" className="text-ink-2" />
              <span className="font-sans text-body-s text-ink-3">Buscar alimento…</span>
            </div>
          )}
        >
          <div className="flex flex-col gap-2 pt-3">
            {Array.from({ length: 30 }, (_, i) => (
              <div key={i} className="rounded-control border border-hairline bg-surface px-4 py-3">
                <span className="font-sans text-body-s text-ink">Alimento {i + 1}</span>
              </div>
            ))}
          </div>
        </Sheet>

        <p className="font-sans text-body-s text-ink-3">
          Se monta en un portal a document.body: el z-index de la escala declarada en F2 es la
          autoridad real y no compite con overflow o position de un contenedor intermedio.
        </p>
      </Seccion>

      <Seccion
        titulo="Dialog"
        resumen="La caja centrada: confirmar una acción, un formulario corto. Comparte toda la infraestructura de Sheet — mismo foco atrapado, mismo Escape, mismo bloqueo de scroll."
      >
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" icon="edit" onClick={() => setDialogAbierto(true)}>
            Abrir Dialog
          </Button>
          <Button
            variant="danger"
            icon="delete"
            onClick={() => { setSegundoOverlayAbierto(true); setDialogAbierto(true); }}
          >
            Abrir los dos a la vez
          </Button>
          <Button variant="secondary" icon="description" onClick={() => setDialogXlAbierto(true)}>
            Abrir Dialog xl
          </Button>
        </div>

        <Dialog
          open={dialogAbierto}
          onClose={() => setDialogAbierto(false)}
          title="Eliminar ejercicio"
          footer={
            <>
              <Button variant="ghost" onClick={() => setDialogAbierto(false)}>Cancelar</Button>
              <Button variant="danger" onClick={() => setDialogAbierto(false)}>Eliminar</Button>
            </>
          }
        >
          <p className="font-sans text-body-s text-ink-2">
            Esta acción no se puede deshacer. El tono danger del botón no es una prop de Dialog: es
            pasar Button variant=&quot;danger&quot; como footer — el diálogo no conoce el dominio de
            lo que confirma.
          </p>
        </Dialog>

        <Dialog
          open={dialogXlAbierto}
          onClose={() => setDialogXlAbierto(false)}
          size="xl"
          title="Reporte de la semana"
          footer={<Button onClick={() => setDialogXlAbierto(false)}>Cerrar</Button>}
        >
          <p className="font-sans text-body-s text-ink-2">
            El escalón que añade F9. Los tres tamaños de F7 (sm, md, lg) cubren confirmaciones y
            formularios cortos, pero no la media docena de overlays reales que muestran prosa larga
            o dos columnas: a 512 px el texto de un reporte se estrecha hasta dar una columna de
            lectura peor que la que tenía antes de migrar. Aditivo — ningún uso previo cambia.
          </p>
        </Dialog>

        {/* Estado propio, aparte de sheetAbierto de la sección de arriba: es la
            prueba de R4 y necesita DOS overlays de verdad independientes, no
            dos instancias que compartan la misma variable. Si Sheet y Dialog
            se abren a la vez y se cierran en orden distinto, solo el ÚLTIMO en
            cerrarse debe restaurar el scroll de fondo. */}
        <Sheet
          open={segundoOverlayAbierto}
          onClose={() => setSegundoOverlayAbierto(false)}
          title="Segundo overlay, independiente"
          footer={<Button variant="secondary" onClick={() => setSegundoOverlayAbierto(false)}>Cerrar este</Button>}
        >
          <p className="font-sans text-body-s text-ink-2">
            Con el Dialog de arriba también abierto, ciérralos en cualquier orden: el scroll del
            fondo solo se libera cuando se cierran los dos.
          </p>
        </Sheet>

        <p className="font-sans text-body-s text-ink-3">
          «Abrir los dos a la vez» abre este Sheet y el Dialog de arriba, cada uno con su propio
          estado. Es la prueba de R4: dos overlays independientes, no anidados, cerrados en
          cualquier orden.
        </p>
      </Seccion>

      <Seccion
        titulo="EmptyState"
        resumen="La última primitiva de F7. El relleno vertical es 40 px, no un valor nuevo: F6 ya decidió que los py-12/16/20/24 que convivían en la app eran todos estados vacíos y les asignó ese paso."
      >
        <Card padding="none">
          <EmptyState
            icon="fitness_center"
            title="Aún no hay rutinas"
            description="Crea la primera rutina para este cliente desde Entrenamientos."
            actionLabel="Crear rutina"
            onAction={() => setVecesCrearRutina((n) => n + 1)}
          />
        </Card>

        <Card padding="none">
          <EmptyState icon="search_off" title="Sin resultados" description="Prueba con otro término de búsqueda." />
        </Card>

        <p className="font-sans text-body-s text-ink-3">
          {vecesCrearRutina > 0
            ? `Botón de acción pulsado ${vecesCrearRutina} ${vecesCrearRutina === 1 ? 'vez' : 'veces'}.`
            : 'El icono va en ink-3, nunca en accent: un estado vacío no es una llamada a la acción dorada por sí solo — si tiene acción, la lleva el botón, no el icono.'}
        </p>
      </Seccion>

      <Seccion titulo="Skeleton" resumen="Barrido de luz de 1,4 s, no un parpadeo de opacidad. Nunca un spinner a pantalla completa.">
        <div className="flex flex-col gap-2">
          <Skeleton className="stagger-child h-8 w-48" style={{ '--i': 0 } as React.CSSProperties} />
          <Skeleton className="stagger-child h-4 w-72" style={{ '--i': 1 } as React.CSSProperties} />
          <Skeleton className="stagger-child h-24 w-full" style={{ '--i': 2 } as React.CSSProperties} />
        </div>
        <p className="font-sans text-body-s text-ink-3">
          Se mueve en ambos ejes (background-position, 200 % de tamaño) en vez de solo cambiar de
          opacidad: es lo que hace que se perciba como "cargando algo real" y no como un parpadeo.
        </p>
      </Seccion>

      <Seccion titulo="ProgressBar" resumen="6 px, radio 4, relleno oro. Pasarse de 100 pinta la barra roja sin recortar el valor — el +N de más se muestra aparte.">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <span className="font-sans text-caption uppercase tracking-widest text-ink-3">Hidratos · 68/80</span>
            <ProgressBar value={85} label="Hidratos, 68 de 80 intercambios" />
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-sans text-caption uppercase tracking-widest text-ink-3">Proteína · 92/80 (+12)</span>
            <ProgressBar value={115} label="Proteína, 92 de 80 intercambios, 12 de más" />
          </div>
        </div>
      </Seccion>

      <Seccion titulo="Banner" resumen="Radio 18, color al 7 % de fondo y 22-24 % de borde. Solo dos tonos: oro informativo, rojo error con Reintentar en contorno.">
        <div className="flex flex-col gap-3">
          <Banner tone="info">Dani está montando tu dieta. Te avisamos en cuanto la publique.</Banner>
          <Banner tone="danger" actionLabel="Reintentar" onAction={() => {}}>
            No se pudo enviar la rutina. Revisa el plan antes de reenviar.
          </Banner>
        </div>
      </Seccion>

      <Seccion titulo="Stepper" resumen="Dos botones de 52 px —menos neutro, más oro— y una cifra mono central. Haptic light por toque, nunca medium: es un ajuste fino.">
        <Stepper value={carga} onChange={setCarga} step={2.5} min={0} unit="kg" label="Carga de la serie" format={(v) => v.toLocaleString('es-ES', { minimumFractionDigits: v % 1 !== 0 ? 1 : 0 })} />
      </Seccion>

      <Seccion titulo="SegmentedControl" resumen="El «Segmentado» del handoff: 46 px, fondo surface, pastilla de oro que se desliza entre opciones — distinto de Tabs, pensado para 2-4 opciones fijas.">
        <SegmentedControl options={OPCIONES_SEGMENTO} value={segmento} onChange={setSegmento} label="Tipo de cardio" className="max-w-xs" />
      </Seccion>

      <Seccion titulo="RirScale" resumen="7 segmentos: FALLO · 0 · 1 · 2 · 3 · 4 · 5. FALLO no es RIR 0 —decisión de Dani, 7 ago 2026— y el color se invierte respecto al viejo RPE: un número bajo es la serie dura.">
        <RirScale value={rir} onChange={setRir} label="RIR de la serie" />
        <p className="font-sans text-body-s text-ink-3">
          {rir == null ? 'Sin elegir todavía.' : `Elegido: ${rir === 'fallo' ? 'FALLO' : `RIR ${rir}`}.`}
        </p>
      </Seccion>

      <Seccion titulo="EffortScale" resumen="La única escala 1-10 que sobrevive al cambio a RIR, y solo en cardio sin pulsómetro. Campo ESFUERZO, no RPE. Una frase traduce el número elegido.">
        <EffortScale value={esfuerzo} onChange={setEsfuerzo} label="Esfuerzo percibido" />
      </Seccion>

      <Seccion titulo="Sparkline" resumen="8 barras, scaleY escalonado 40 ms, la última siempre en oro — es el dato de hoy.">
        <Sparkline values={[42, 38, 51, 47, 60, 55, 64, 58]} label="Tonelaje de las últimas 8 sesiones" />
      </Seccion>

      <Seccion titulo="RingSeal" resumen="Se cierra en 1,1 s. Con complete, un sello de check aparece a los ~550 ms. Sin confeti — el handoff lo repite en tres módulos distintos.">
        <div className="flex flex-wrap items-center gap-6">
          <RingSeal percent={68} size={110} label="68 % del objetivo semanal">
            <span className="font-mono text-title-m font-bold text-ink">68%</span>
          </RingSeal>
          <RingSeal percent={100} complete size={110} label="Semana de cardio completa" />
        </div>
      </Seccion>

      <Seccion titulo="SwipeRow" resumen="96 px de recorrido, fondo rojo con icono y etiqueta en negro. Solo revela el botón: ejecutar la acción es una pulsación aparte, para poder deshacer con un toast en vez de un diálogo.">
        <Card padding="none" className="overflow-hidden">
          {!filaBorrada ? (
            <SwipeRow actionLabel="Borrar" onAction={() => { setFilaBorrada(true); setVecesBorrado((n) => n + 1); }}>
              <ListRow
                title="Sentadilla búlgara"
                subtitle="3×10 · 24 kg"
                leading={<Icon name="fitness_center" size="m" className="text-ink-3" />}
              />
            </SwipeRow>
          ) : (
            <div className="flex items-center justify-between gap-3 p-3">
              <span className="font-sans text-body-s text-ink-3">Fila borrada.</span>
              <Button variant="ghost" size="s" onClick={() => setFilaBorrada(false)}>Deshacer</Button>
            </div>
          )}
        </Card>
        <p className="font-sans text-body-s text-ink-3">
          Borrada {vecesBorrado} {vecesBorrado === 1 ? 'vez' : 'veces'}. Desliza la fila hacia la
          izquierda con el ratón o el dedo para revelar el botón.
        </p>
      </Seccion>

      <Seccion titulo="SearchField" resumen="48 px en reposo, crece a 54 con el foco; borde e icono pasan a oro en 200 ms y aparece Cancelar. Distinto de Input: no lleva etiqueta, su propia altura es el estado.">
        <SearchField value={busqueda} onChange={setBusqueda} label="Buscar ejercicio" placeholder="Buscar ejercicio…" />
      </Seccion>

      <Seccion titulo="CollapsingHeader" resumen="Título de 46 px en reposo; al pasar 30 px de scroll sube y se desvanece mientras entra el compacto de 15,5 px con su línea. Vista en miniatura: desplaza el recuadro de abajo.">
        <div ref={miniaturaScrollRef} className="h-64 overflow-y-auto rounded-surface border border-hairline">
          <CollapsingHeader title="Rutinas" scrollRef={miniaturaScrollRef} />
          <div className="space-y-3 px-5 pb-6">
            {Array.from({ length: 12 }, (_, i) => (
              <div key={i} className="h-12 rounded-control bg-raised" />
            ))}
          </div>
        </div>
      </Seccion>
    </div>
  );
}
