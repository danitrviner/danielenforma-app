# CRM v2 — modelo de datos, KPIs y plan de migración

> Estado: **propuesta**, pendiente del OK de Dani. Nada de esto está implementado.
> Escrito el 2026-09-10 a partir de la especificación que dio Dani (seis bloques:
> ficha maestra, economía del cliente, altas y bajas, renovaciones, LTV, KPIs).

## La conclusión, primero

El CRM actual está **mucho más cerca de lo que Dani quiere de lo que parece**, y la
mayor parte del trabajo no es escribir tablas nuevas sino tres cosas:

1. **`crmPagos` ya ES la tabla de movimientos económicos** que pide Dani. Le faltan
   dos columnas (`tipo` y `metodoPago`) y sobra la ambigüedad de que un pago pueda
   no pertenecer a ningún servicio. No hay que crear una colección nueva ni migrar
   documentos: hay que **ensanchar** la que ya existe. Esto convierte un rediseño en
   una evolución, y es la decisión más importante del documento.
2. **`CrmSuscripcion` es el concepto que sobra.** Es «un servicio con renovación
   automática» modelado aparte, sin enlace al servicio, con su propia pantalla. Se
   absorbe dentro de `CrmServicio` y «Renovaciones» pasa a ser una VISTA sobre
   servicios que caducan, no una colección.
3. **Lo que de verdad falta es la capa de análisis**: LTV, permanencia media, ticket
   medio de alta, tasa de renovación, motivo de no renovación. Nada de eso existe
   hoy, y todo sale de los movimientos en cuanto lleven `tipo`.

Coste estimado: **una tanda de trabajo, no un trimestre**. El grueso del riesgo está
en el paso 1 de la migración (rellenar `tipo` en los pagos que ya existen).

---

## 1. Qué hay hoy y qué falta

Cinco colecciones en Firestore, todas con importes en **céntimos enteros**
(`importeCents`) y fechas como **strings ISO locales** (`YYYY-MM-DD`). Esas dos
convenciones son correctas y no se tocan.

| Hoy | Qué es de verdad | En el modelo de Dani |
|---|---|---|
| `crmContactos` + `user_profiles` | La persona (con o sin cuenta en la app) | **Ficha maestra** — casi completa |
| `crmServicios` | El contrato: qué se vendió, por cuánto, de cuándo a cuándo | **Contrato/Servicio** — le falta `tipo` |
| `crmPagos` | Un movimiento de dinero, con su vencimiento y su cobro | **Movimientos económicos** — le falta `tipo` |
| `crmSuscripciones` | Una regla de renovación, sin enlace al servicio | **Sobra**: se absorbe en el servicio |
| `crmReuniones` | Optimización y graduación, con `resultadoGraduacion` | **Renovaciones** — ya mide continuidad |

### Lo que ya está y no hay que inventar

- **Fraccionamiento entero y bien hecho.** `createCrmServicioConPago`
  (`src/db/crm.ts`) escribe el servicio y sus N cuotas en una sola transacción, con
  `repartirEnCuotas` (`lib/dinero.ts`) que no pierde un céntimo por redondeo y
  `sumarMeses` que no se desplaza al pasar por febrero. **Pago único = 1 cuota;
  fraccionado = N cuotas.** El modelo de Dani ya funciona aquí.
- **Estado comercial y motivo de baja.** `EstadoCrm`
  (`lead | llamada_agendada | activo | pausado | baja`), `fechaBaja`, `MotivoBaja`
  (`precio | resultados | tiempo_disponibilidad | insatisfaccion | lesion_salud | otro`)
  y `motivoBajaDetalle` ya existen en `src/types.ts`.
- **Canal de captación** (`origen`) ya existe en la ficha.
- **Continuidad medida de verdad**: `CrmReunion.resultadoGraduacion`
  (`continua | no_continua`) es la conversión a continuidad, y el dashboard ya la
  calcula.
- **Fechas locales sin trampas de UTC**, con tests (`lib/fechas.test.ts`).

### Lo que falta

| Falta | Dónde va |
|---|---|
| Distinguir alta / renovación / upsell / descuento / devolución / impago | `CrmPago.tipo` y `CrmServicio.tipo` |
| Cómo se cobró | `CrmPago.metodoPago` |
| Quién lo vendió | `CrmServicio.closer` |
| Por qué NO renovó (distinto de por qué se dio de baja) | `CrmServicio.motivoNoRenovacion` |
| LTV, permanencia media, ticket medio, tasa de renovación | Capa de cálculo nueva (`lib/metricas.ts`) |
| Pantalla de renovaciones con previsto / renovado / pendiente / perdido | Vista sobre servicios, no colección |

---

## 2. El modelo propuesto

```
CLIENTE  ──1:N──  SERVICIO  ──1:N──  MOVIMIENTO
   │                  │
   │                  └── tipo: alta | renovacion | upsell
   │
   └── estadoCrm, origen, closer, fechaBaja, motivoBaja
```

**Un movimiento SIEMPRE cuelga de un servicio.** Es el cambio estructural de verdad:
hoy `CrmPago.servicioId` es opcional y hay pagos huérfanos (los que crea
`PagoModal`, y los que genera una suscripción). Un movimiento huérfano no se puede
atribuir a nada — ni a un canal, ni a un closer, ni al LTV de un servicio — y es la
razón por la que hoy no se puede contestar «¿qué servicio genera más dinero?».

### 2.1 Cliente (`crmContactos` + `user_profiles`)

Se añaden **dos campos**; el resto ya está.

```ts
closer?: string;              // quién lo vendió (email del coach o nombre libre)
// `origen` ya existe: 'instagram' | 'referido' | 'ads' | 'importacion' | ...
```

`fechaAlta` **no se añade**: es la `fechaInicio` del primer servicio del cliente, y
duplicarla crea dos verdades que se desincronizan. Se calcula.

### 2.2 Servicio / contrato (`crmServicios`)

```ts
tipo: 'alta' | 'renovacion' | 'upsell';   // NUEVO — obligatorio
closer?: string;                           // NUEVO — quién cerró ESTA venta
renovacionAutomatica?: boolean;            // NUEVO — absorbe CrmSuscripcion
proximoCobro?: string;                     // NUEVO — solo si renovacionAutomatica
resultadoRenovacion?: 'renovado' | 'perdido' | 'pendiente';   // NUEVO
motivoNoRenovacion?: MotivoBaja;           // NUEVO — distinto de la baja
```

**`periodicidad` se deja de usar para generar nada.** Hoy hay dos ejes que dicen lo
mismo a medias: `periodicidad` (`mensual | trimestral | ... | unico`) y `cuotas`.
`cuotas` es el que de verdad genera los movimientos; `periodicidad` solo sirve para
sugerir la fecha de fin y para una etiqueta. Se conserva el campo (no se borra nada
de Firestore) pero pasa a ser **solo la duración del contrato**, y así se documenta.

`tipo` es lo que permite separar «facturación de altas» de «facturación de
renovaciones», que es la pregunta del bloque 6 de Dani.

### 2.3 Movimiento económico (`crmPagos`, ensanchada)

Ésta es la tabla de la que sale todo informe futuro.

```ts
tipo: 'alta' | 'renovacion' | 'upsell' | 'descuento' | 'devolucion';  // NUEVO
metodoPago?: 'transferencia' | 'tarjeta' | 'bizum' | 'efectivo' | 'stripe' | 'otro'; // NUEVO
servicioId: string;   // deja de ser opcional
estado: 'pendiente' | 'pagado' | 'impagado' | 'parcial' | 'devuelto';  // AMPLIADO
importeCobradoCents?: number;  // NUEVO — solo con estado 'parcial'
```

Notas de diseño que importan:

- **`descuento` y `devolucion` van con `importeCents` NEGATIVO.** Así toda la
  facturación sigue siendo una suma simple y ningún informe tiene que acordarse de
  restar. Es la diferencia entre un modelo que aguanta preguntas nuevas y uno que
  hay que parchear en cada informe.
- **`impagado` no es lo mismo que `pendiente`.** Pendiente es «aún no toca o aún no
  ha llegado»; impagado es «tenía que haber llegado y no ha llegado». Hoy sólo hay
  `pendiente`, y por eso no se puede contestar «¿cuánto tengo impagado?». El paso de
  uno a otro **lo marca el coach a mano** — deducirlo por «lleva N días de retraso»
  convertiría un olvido en una deuda.
- El **estado financiero del cliente** («al día / pendiente / impagado / parcial /
  en devolución») que pide Dani **se deriva**, no se guarda: es el peor estado entre
  sus movimientos. Guardarlo sería una segunda verdad que hay que mantener a mano.

### 2.4 `crmSuscripciones` — se apaga

No se borra (los documentos existentes se conservan), pero deja de escribirse. Una
suscripción es un servicio con `renovacionAutomatica: true` y `proximoCobro`. La
pantalla «Renovaciones» pasa a listar **servicios que caducan en la ventana**, que es
lo que Dani dibujó en su bloque 4:

| Cliente | Servicio | Finaliza | Importe | Estado |
|---|---|---|---|---|
| Cliente A | Premium | 15/10 | 600 € | Pendiente |
| Cliente B | Básico | 18/10 | 300 € | Cobrado |
| Cliente C | Premium | 21/10 | 600 € | Perdida |

Con el encabezado: **previstas · renovadas · pendientes · perdidas**, en euros.

---

## 3. KPIs y sus fórmulas

Todos se calculan **en memoria sobre el catálogo completo**, como ya hace hoy el
CRM (`leerCatalogo` cachea las colecciones enteras y las filtra en cliente). A la
escala del negocio de Dani —cientos de clientes, miles de movimientos— eso es
correcto y evita índices y agregaciones en Firestore. Van en un `lib/metricas.ts`
nuevo, **funciones puras con `hoy` inyectable**, testeadas: es la única forma de que
las cifras de negocio no se rompan en silencio.

### Dinero

| KPI | Fórmula |
|---|---|
| **Facturado del mes** | Σ `importeCents` de movimientos con `fechaCobro` en el mes (incluye descuentos y devoluciones, que son negativos) |
| **Facturación de altas** | Idem, filtrando `tipo === 'alta'` |
| **Facturación de renovaciones** | Idem, `tipo === 'renovacion'` |
| **Facturación de upsells** | Idem, `tipo === 'upsell'` |
| **Pendiente de cobro** | Σ movimientos con `estado === 'pendiente'` |
| **Impagado** | Σ movimientos con `estado === 'impagado'` |
| **MRR** | Σ (`importeCents` / meses del contrato) de servicios vigentes hoy |
| **Renovaciones previstas del mes** | Σ `importeCents` de servicios cuya `fechaFin` cae en el mes |

`fechaCobro`, no `fechaEmision`: es cuándo entró el dinero. Esa distinción ya está
implementada y testada (`ingresosPorMes`, `fechaDeCobroSugerida`).

### Clientes

| KPI | Fórmula |
|---|---|
| **Activos** | Clientes con `estadoCrm === 'activo'` y sin archivar |
| **Nuevos del mes** | Clientes cuyo primer servicio empieza en el mes |
| **Bajas del mes** | Clientes con `fechaBaja` en el mes |
| **Churn mensual** | bajas del mes / activos al principio del mes |
| **Permanencia media (meses)** | Media de (`fechaBaja` − primera `fechaInicio`) / 30,44 sobre las bajas; los activos cuentan con `hoy` |

La permanencia media es la que Dani señala como la que falta: cien clientes de tres
meses no son cien clientes de doce, y hoy el CRM no distingue esos dos negocios.

### Valor

| KPI | Fórmula |
|---|---|
| **LTV de un cliente** | Σ `importeCents` de sus movimientos cobrados (netos de devoluciones) |
| **LTV medio** | Σ LTV / nº de clientes que han comprado alguna vez (no sobre leads) |
| **LTV por servicio / canal / closer** | Agrupando por `nombre` de servicio, `origen`, `closer` |
| **Ticket medio de alta** | Σ movimientos `tipo === 'alta'` cobrados / nº de altas |
| **Tasa de renovación** | renovados / (renovados + perdidos) en la ventana |

El corte que Dani quiere poder hacer —«el servicio B cobra menos de alta pero tiene
más LTV»— sale directo de agrupar el LTV por `nombre` de servicio. Es la razón de que
`tipo` sea obligatorio.

---

## 4. Plan de migración

Cuatro pasos, cada uno desplegable por separado y sin romper lo anterior.

**Paso 1 — Campos nuevos, todos opcionales.** Se añaden a los tipos y a la UI de
creación. Nada existente se rompe: un documento viejo sin `tipo` sigue leyéndose.
Las reglas de Firestore no cambian (son permisivas por coach).

**Paso 2 — Rellenar el histórico.** Un script (`scripts/migrarCrmTipos.mjs`) que
deduce `tipo` de lo que ya hay:

- Primer servicio de un cliente por `fechaInicio` → `alta`.
- Servicio posterior cuyo nombre coincide con uno anterior del mismo cliente → `renovacion`.
- Cualquier otro servicio posterior → `upsell`.
- Movimiento hereda el `tipo` de su servicio.
- Movimiento huérfano (sin `servicioId`) → se le crea un servicio «suelto» del mismo
  importe y fecha, para que no quede fuera del análisis.

**El script escribe un informe antes de tocar nada** y se pasa con `--aplicar`, igual
que `importRecetas.mjs`. Los casos que no encajen se listan para que Dani los
clasifique a mano; no se adivina en silencio.

**Paso 3 — La capa de cálculo.** `lib/metricas.ts` con todas las fórmulas de arriba,
funciones puras, tests primero. Aquí no hay riesgo: no escribe nada.

**Paso 4 — Las pantallas.** Dashboard reorganizado en las tres preguntas (clientes /
dinero / retención), pantalla de Servicios de primer nivel, Renovaciones como vista.
`crmSuscripciones` deja de escribirse pero se sigue leyendo para no perder lo que ya
hay.

---

## 5. Lo que este documento decide y lo que deja abierto

**Decidido aquí** (con argumento, revisable):

- Ensanchar `crmPagos` en vez de crear `crmMovimientos`.
- Descuentos y devoluciones como importes negativos.
- Estado financiero del cliente derivado, no guardado.
- `impagado` lo marca el coach, no el reloj.
- `fechaAlta` del cliente calculada, no duplicada.

**Pendiente del criterio de Dani:**

1. **¿Hay más de un closer?** Si vende siempre él, `closer` es un campo muerto que
   ensucia todos los formularios. Se implementa solo si va a haber setter/closer
   distintos de él.
2. **Motivos de no renovación**: ¿valen los seis de `MotivoBaja` o hace falta una
   lista propia? («terminó su objetivo» no es una baja, y hoy no cabe en ninguno.)
3. **Márgenes**: el bloque 5 de Dani menciona «margen por cliente (si introduces
   costes)». Eso es una tabla de costes que ahora mismo no existe en ningún sitio.
   Queda fuera de esta propuesta salvo que la quiera.
4. **Pausas**: `estadoCrm: 'pausado'` existe pero no para el reloj de la permanencia.
   ¿Un cliente que pausa dos meses tiene 12 meses de permanencia o 10?
