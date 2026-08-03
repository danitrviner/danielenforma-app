import React from 'react';
import {
  Badge, Button, Card, Icon, Input, Select, Tabs,
  type BadgeTone, type ButtonSize, type ButtonVariant, type IconSize,
  type SelectOption, type TabItem,
} from './index';

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
  { size: 'm', pie: 'm · 44' },
  { size: 'l', pie: 'l · 48' },
];

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
  const pesoInvalido = peso.trim() !== '' && Number.isNaN(Number(peso.replace(',', '.')));

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-2">
        <span className="font-sans text-caption uppercase tracking-widest text-accent">
          Design System · F7
        </span>
        <h1 className="font-sans text-display font-bold text-ink">Primitivas</h1>
        <p className="font-sans text-body-s text-ink-2">
          Las piezas de components/ui, cada una con sus variantes. Ninguna pantalla las usa
          todavía: construirlas es F7, adoptarlas es F8.
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
    </div>
  );
}
