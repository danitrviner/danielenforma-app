# Auditoría: ¿soporta En Forma un CRM? — 2026-08-01

Alcance: clientes, servicios, pagos, suscripciones, reuniones. Sin romper lo existente.

---

## Veredicto

**Sí soporta. No reescribir.** El CRM es un dominio nuevo y aditivo: colecciones
nuevas, reglas nuevas, pantallas nuevas. No obliga a tocar ni un solo campo de
entrenamiento, nutrición, roadmap, academia o cardio.

Pero hay **4 defectos estructurales** que el CRM amplifica y que hay que arreglar
antes o durante. Ninguno justifica una reescritura; los cuatro juntos son un
trabajo acotado.

---

## 1. Lo que hay hoy

| Métrica | Valor |
|---|---|
| Ficheros TS/TSX | 196 |
| Líneas | 48.673 |
| Colecciones Firestore | ~50, todas planas (sin subcolecciones) |
| Capa de datos | `src/dbService.ts` = barril de reexports sobre `src/db/*.ts` (19 dominios) |
| Reglas | `firestore.rules`, 28 KB, auditadas el 2026-07-23 |
| Estado servidor | TanStack Query en 51 ficheros |
| Backend | 1 función serverless Vercel (`api/ai-chat.ts`) |
| Tests | 14 ficheros, todos en `src/utils/` (lógica pura). **Cero** en `src/db/`, cero de reglas |

### Lo que juega a favor (y es mucho)

1. **`src/db/` ya está partido por dominios.** Añadir `src/db/crm.ts` +
   `src/db/billing.ts` sigue el patrón exacto de `academy.ts` y `cardio.ts`, que
   son los dos dominios más recientes. Hay precedente de "añadir dominio nuevo
   sin tocar nada" ejecutado dos veces con éxito (commits `e9eb819`, `efebe5b`).

2. **`api/ai-chat.ts` ya es el patrón que necesita un webhook de Stripe.**
   Verifica el ID token de Firebase con `jose`, exige el email del coach, y usa
   `firebase-admin` para escribir con privilegios que el cliente no tiene
   (`aiAuditLog`). Un webhook de pagos es literalmente ese fichero con otra
   verificación de firma. `firebase-admin` ya está en `package.json`. **Esto es
   lo que normalmente falta y aquí ya está resuelto.**

3. **Las reglas deniegan por defecto.** No hay catch-all permisivo. Una
   colección nueva es inaccesible hasta que le escribes su bloque. Riesgo de
   exponer pagos por accidente: cero.

4. **`isCoach()` exige `email_verified`.** Post-auditoría de seguridad. Una
   colección `payments` con `allow read, write: if isCoach()` es correcta desde
   la primera línea, sin diseño nuevo.

5. **Convención de `queryKey` consistente**: `['dominio', athleteEmail]`. El CRM
   la hereda sin inventar nada.

### Lo comercial que ya existe (es casi nada)

- `UserProfile.planStartDate` + `planDurationMonths: 3 | 6 | 12`
- `hooks/usePlanExpiry.ts` → `daysLeft` / `expired` / `expiringSoon`
- `invites/{email}` con `status: 'pending' | 'joined'`

Y se acabó. Búsqueda de `pago|payment|subscription|factur|invoice|stripe|precio|cobro`
en todo `src/`: **0 resultados funcionales**. Búsqueda de
`reunion|meeting|llamada|calendly|agenda`: **0 resultados**.

Es decir: el CRM se construye sobre terreno limpio, no sobre un modelo comercial
mal hecho que haya que desmontar. Eso es la mejor noticia del informe.

---

## 2. Los 4 defectos que el CRM amplifica

### D1 — Identidad dual UID/email, sin regla que diga cuál

El mismo concepto "atleta" se referencia de dos formas incompatibles según la
colección:

| Colección | Clave del atleta |
|---|---|
| `user_profiles` | docId = **UID** |
| `workoutAssignments` | `athleteId` = **UID** |
| `workoutLogs` | `athleteId` = **EMAIL** |
| `checkins` | `userId` = **UID** + `email` |
| `diets`, `weeklyMenus`, `tasks`, `cardioSessions`, `hrTests`, `progressPhotos`, `coachReports`, `academyProgress`… | `athleteId` = **EMAIL** |

Esto **ya provocó un bug silencioso en producción**. El comentario en
`src/components/ClientsScreen.tsx:44-48` lo documenta: la adherencia de todos los
atletas ignoraba sus datos de entrenamiento porque el query estaba keyeado por
email y la escritura por UID. Nadie lo vio hasta que alguien lo buscó.

**Por qué importa para el CRM:** un pago apunta a un cliente. El email es la
clave primaria de facto en la mayoría del sistema, **y el email es mutable**. Si
un cliente cambia de correo, hoy pierdes su histórico de entrenamiento (malo);
mañana perderías su histórico de facturación (inaceptable, y probablemente con
implicaciones fiscales).

Además `getOrCreateUserProfile` ya contempla el caso de la misma persona con dos
UID distintos (registro por Google tras haberlo hecho por email+contraseña), y
existe `deduplicateByEmail()` como parche. Es un problema conocido y sin resolver.

### D2 — Fallback a localStorage silencioso y global, en 162 puntos de escritura

`grep -c "setLocalBypassMode(true)" src/db/*.ts` → **162**.

Patrón, presente en casi toda función de escritura:

```ts
try {
  await addDoc(collection(db, 'coachNotes'), stripUndefined(data));
} catch (err) {
  console.warn('createCoachNote Firestore failed, saving local:', err);
  setLocalBypassMode(true);   // ← global, toda la sesión
  saveLocalCoachNotes([...]);
  return note;                // ← devuelve éxito
}
```

Dos problemas encadenados:

1. La función **devuelve éxito** cuando ha fallado. La UI muestra "guardado".
2. `forceLocalOnly` es **global de sesión**: un fallo en cualquier dominio pasa
   la app entera a localStorage hasta que se recarga la página.

Para notas del coach es una decisión defendible (mejor perder una nota que
bloquear la app). Para **un cobro registrado, es inaceptable**: el coach ve
"pago registrado", cierra el navegador, y el pago no existe en ningún sitio.

**Este es el único punto donde el CRM no puede seguir el patrón existente.** No
hay que cambiar los 162 sitios — hay que hacer que el dominio de facturación
*no* use ese patrón.

### D3 — Lecturas sin límite y N+1 en la lista de clientes

`getWorkoutLogs(athleteId)` descarga el histórico **completo**, sin `limit()` ni
paginación. Lo mismo en varias funciones de `src/db/`.

Y `ClientsScreen.tsx` lanza, para N clientes:

```ts
useQueries({ queries: athletes.map(a => ({ queryKey: ['workoutAssignments', a.userId], ... })) })
useQueries({ queries: athletes.map(a => ({ queryKey: ['workoutLogs', a.email], ... })) })
```

= **2N queries** en cada carga de la pantalla principal del coach, cada una
trayendo historiales completos. Con 30 clientes: 60 queries. Con 60 clientes:
120 queries y varios MB.

Un CRM quiere una columna "estado de pago" y otra "próxima renovación" en esa
misma rejilla → 4N si se hace igual. **No se puede hacer igual.**

Contexto relevante: la BD es Firestore edition **Enterprise** (ver
`project_firestore_enterprise_migration`), donde el modelo de coste penaliza
exactamente esto.

### D4 — No existe el ciclo de vida del cliente

`UserProfile.role: 'client' | 'coach'`. Eso es todo el estado que tiene una
persona en el sistema.

No hay: lead, prospecto, en prueba, activo, pausado, impagado, baja, ex-cliente
que puede volver. `getAllUserProfiles()` devuelve a todos, para siempre. Cuando
alguien se da de baja, o sigue apareciendo en la rejilla de clientes o hay que
borrarlo (y pierdes su histórico).

**Un CRM sin estado de cliente no es un CRM.** Es la pieza que hay que añadir
primero porque todo lo demás (servicios contratados, suscripción activa, pagos
esperados, reuniones a agendar) cuelga de ella.

---

## 3. Coste: refactor por fases vs reescritura

### Qué se tiraría al reescribir

No es "una app de fitness". Es lógica de negocio densa y ya validada:

- Motor de menús semanales (`menuEngine.ts` + tests)
- Motor de calentamiento (`utils/warmup/`, 3 módulos con tests)
- Periodización nutricional con fases y transiciones automáticas
- Sistema de roadmap con escaleras de nivel configurables
- Asistente IA del coach con 12 herramientas + bóveda de conocimiento
- Academia con drip por días desde el alta
- Cardio con banda BLE nativa vía Capacitor (iOS + Android compilando)
- **`firestore.rules`: 28 KB con casos límite documentados uno por uno**,
  auditados hace 9 días, cada excepción con su comentario explicando qué ataque
  concreto previene

Ese último punto es el que la gente subestima. Esas reglas son conocimiento
acumulado sobre bugs reales. Reescribir la app significa reescribirlas y volver
a descubrir los mismos agujeros.

### Comparación honesta

| | Refactor por fases | Reescritura |
|---|---|---|
| Esfuerzo CRM funcional | ~6–8 sesiones | ~25–40 sesiones antes de igualar lo que ya funciona |
| App en producción durante el trabajo | Sí, siempre | No, o mantienes dos |
| Riesgo de regresión | Acotado por fase, con rollback | Alto y difuso |
| Resuelve D1 (identidad dual) | Sí, en fase 5 (opcional, aplazable) | Sí, "gratis" |
| Resuelve D2/D3/D4 | Sí, en las fases 0–2 | Sí |
| Lo que se pierde | Nada | Reglas auditadas, motores con tests, integración nativa |

**El único argumento real a favor de reescribir es D1**, y aun así: migrar la
identidad dual es un script de migración acotado (fase 5), no una reescritura.

**Recomendación: refactor por fases.** No es un empate ajustado.

---

## 4. Plan de refactor por fases

Cada fase: qué toca, checkpoint verificable, rollback.

Regla global: **una fase = una rama = un commit + un deploy**. Con
`git checkout main && npx vercel --prod` siempre vuelves atrás en <2 minutos.

---

### Fase 0 — Red de seguridad (antes de tocar nada)

**Motivación:** hoy no hay forma de saber si un cambio rompió algo. 14 tests,
todos de utilidades puras.

**Qué se hace**
1. Añadir `@firebase/rules-unit-testing` y escribir tests de las reglas para los
   casos que ya están documentados en los comentarios de `firestore.rules`
   (atleta no puede tocar `planStartDate`, no puede plantar check-ins con el UID
   de otro, no puede crear perfil sin invitación).
2. Script `npm run backup:firestore` → export a JSON con el admin SDK. Ejecutarlo
   antes de cada fase.
3. Fijar `npm run lint` (que es `tsc --noEmit`) + `npm test` como puerta previa a
   cada commit.

**Checkpoint:** `npm test` pasa e incluye ≥10 tests de reglas. Existe un backup
fechado.

**Rollback:** trivial, solo añade ficheros.

**Coste:** 1 sesión. **No te la saltes.** Es la única fase que hace que las demás
sean reversibles de verdad.

---

### Fase 1 — Ciclo de vida del cliente (arregla D4)

**Aditiva pura. Cero riesgo sobre lo existente.**

Nueva colección `clientRecords`, docId = **UID** del atleta (no email — ver D1;
el CRM nace con la clave correcta):

```ts
// src/types.ts
export type ClientStage =
  | 'lead'        // contacto, aún no ha pagado
  | 'trial'       // prueba / primera sesión
  | 'active'      // cliente de pago al corriente
  | 'paused'      // pausa acordada, no factura
  | 'overdue'     // activo pero con impago
  | 'churned';    // baja

export interface ClientRecord {
  id: string;              // = UserProfile.userId (UID) — clave canónica
  email: string;           // denormalizado, para cruzar con el resto del sistema
  stage: ClientStage;
  stageChangedAt: string;  // ISO
  source?: string;         // 'instagram' | 'referido' | 'ads' | ...
  notes?: string;
  firstContactAt?: string;
  churnedAt?: string;
  churnReason?: string;
  createdAt: string;
  updatedAt: string;
}
```

Reglas (bloque nuevo, no toca ninguno existente):

```
match /clientRecords/{uid} {
  allow read, write: if isCoach();
}
```

**Coach-only, sin excepción.** El atleta nunca lee su propio `ClientRecord`.
Eso elimina toda una clase de fugas de datos comerciales.

Nuevo `src/db/crm.ts` siguiendo el patrón de `academy.ts`, reexportado desde
`dbService.ts`. **Sin fallback a localStorage** (ver Fase 3).

UI: filtro por `stage` en `ClientsScreen`, con default `['active','trial','overdue']`
para que la rejilla siga viéndose igual que hoy. Los atletas sin `ClientRecord`
se tratan como `active` → **cero cambio visible el día del deploy**.

**Checkpoint:**
- `ClientsScreen` muestra exactamente los mismos clientes que antes del cambio
- Cambiar un cliente a `churned` lo saca de la rejilla, y quitando el filtro reaparece
- Ningún fichero fuera de `src/db/crm.ts`, `src/types.ts`, `ClientsScreen.tsx`,
  `firestore.rules` y `dbService.ts` aparece en el diff

**Rollback:** revert del commit. `clientRecords` queda huérfana en Firestore sin
afectar a nada (nadie la lee).

**Coste:** 1–2 sesiones.

---

### Fase 2 — Catálogo de servicios y suscripciones

**Aditiva. Toca `UserProfile` solo por lectura.**

```ts
export interface Service {
  id: string;
  name: string;                 // "Asesoría 3 meses", "Sesión suelta"
  description?: string;
  priceCents: number;           // SIEMPRE céntimos enteros. Nunca float.
  currency: 'EUR';
  billingPeriod: 'one_off' | 'monthly' | 'quarterly' | 'biannual' | 'annual';
  durationMonths?: number;      // para paquetes cerrados
  active: boolean;              // se archiva, no se borra
  createdAt: string;
}

export interface Subscription {
  id: string;
  clientId: string;             // = ClientRecord.id (UID)
  serviceId: string;
  serviceNameSnapshot: string;  // congelado: el catálogo cambia, el histórico no
  priceCentsSnapshot: number;   // congelado
  status: 'active' | 'paused' | 'cancelled' | 'completed';
  startDate: string;            // YYYY-MM-DD
  endDate?: string;
  nextBillingDate?: string;
  cancelledAt?: string;
  cancelReason?: string;
  createdAt: string;
}
```

Dos decisiones que evitan dolor después:
- **Céntimos enteros.** Nunca `number` decimal para dinero.
- **Snapshot de nombre y precio** en la suscripción. Cuando subas tarifas, el
  histórico no se reescribe solo.

`planStartDate`/`planDurationMonths` de `UserProfile` **se quedan donde están**.
`usePlanExpiry` sigue funcionando. La suscripción es la fuente de verdad nueva;
un helper `syncPlanFieldsFromSubscription()` mantiene los campos viejos
actualizados para que ninguna pantalla existente se entere del cambio. Se
retiran en la Fase 5, no antes.

**Checkpoint:**
- Crear servicio → crear suscripción → `usePlanExpiry` devuelve los mismos días
  restantes que calculaba antes a mano
- `PlanInPreparationCard` y el badge de caducidad del `ClientHub` sin cambios visuales

**Rollback:** revert. Los campos de `UserProfile` nunca se tocaron destructivamente.

**Coste:** 1–2 sesiones.

---

### Fase 3 — Pagos (aquí es donde el patrón existente NO sirve)

**La fase de mayor riesgo, y la única que necesita disciplina especial.**

```ts
export interface Payment {
  id: string;
  clientId: string;             // UID
  subscriptionId?: string;
  amountCents: number;
  currency: 'EUR';
  status: 'pending' | 'paid' | 'failed' | 'refunded';
  method: 'transfer' | 'card' | 'cash' | 'bizum' | 'other';
  paidAt?: string;
  dueDate?: string;
  invoiceNumber?: string;
  externalId?: string;          // id de Stripe/pasarela, si la hay
  notes?: string;
  createdAt: string;
  createdBy: string;            // email del coach — trazabilidad
}
```

**Regla dura de esta fase: `src/db/billing.ts` no implementa fallback local.**

```ts
export async function createPayment(data: Omit<Payment, 'id'>): Promise<Payment> {
  if (forceLocalOnly) {
    throw new Error('Sin conexión con la base de datos: el pago NO se ha registrado.');
  }
  const ref = await addDoc(collection(db, 'payments'), stripUndefined(data));
  return { ...data, id: ref.id };
  // Sin try/catch. Si falla, la excepción sube y la UI muestra el error real.
}
```

Es exactamente lo contrario del patrón de los otros 162 sitios, **y es
deliberado**. Documentarlo en el fichero para que nadie lo "arregle" después por
consistencia.

Reglas: coach-only, y **sin `allow delete`**. Un pago se corrige con un
documento de rectificación, no se borra.

```
match /payments/{docId} {
  allow read, create, update: if isCoach();
  allow delete: if false;
}
```

Índice necesario en `firestore.indexes.json`:
```json
{ "collectionGroup": "payments", "queryScope": "COLLECTION",
  "fields": [ { "fieldPath": "clientId", "order": "ASCENDING" },
              { "fieldPath": "createdAt", "order": "DESCENDING" } ] }
```

**Si más adelante quieres cobro automático:** `api/stripe-webhook.ts`, copiando
la estructura de `api/ai-chat.ts` (verificación de firma en lugar de ID token,
`firebase-admin` para escribir). No lo metas en la Fase 3 — registro manual
primero, automatización cuando el modelo esté probado con datos reales.

**Checkpoint:**
- Registrar un pago con la red desconectada → **error visible**, no falso éxito.
  *Este es el test que valida toda la fase.*
- Suma de pagos de un cliente = lo que dice tu hoja de cálculo actual, al céntimo
- `payments` no aparece en ninguna query del lado atleta (verificar con las reglas)

**Rollback:** revert del código. Los `payments` ya escritos se quedan; ninguna
pantalla los lee tras el revert. **Nunca borres la colección al hacer rollback.**

**Coste:** 2 sesiones.

---

### Fase 4 — Reuniones

```ts
export interface Meeting {
  id: string;
  clientId: string;             // UID
  type: 'discovery' | 'onboarding' | 'review' | 'checkin' | 'other';
  scheduledAt: string;          // ISO con hora
  durationMinutes: number;
  status: 'scheduled' | 'done' | 'no_show' | 'cancelled';
  location?: string;            // URL de videollamada o sitio
  externalId?: string;          // uuid del evento de Calendly
  notes?: string;               // notas previas
  outcome?: string;             // qué salió de la reunión
  createdAt: string;
}
```

Tienes Calendly conectado por MCP. **No integres la API de Calendly en la app
todavía** — empieza con registro manual + `externalId` reservado. La
sincronización bidireccional es una fase 6 opcional, y solo si el registro
manual demuestra que la usas.

Encaje natural en la UI: una zona nueva en `ClientHub` (que ya tiene el patrón
`ZONE_TABS`: `hoy` / `plan` / `analisis`). Las reuniones y el estado de pago
caben en `hoy` sin rediseñar nada.

**Checkpoint:** crear reunión → aparece en `ClientHub` y en un widget de "próximas"
en la pantalla de clientes. Ningún cambio en `ZONE_TABS` existentes.

**Rollback:** revert.

**Coste:** 1 sesión.

---

### Fase 5 — Consolidación (arregla D1 y D3) — *opcional, aplazable*

Solo cuando las fases 1–4 lleven semanas estables en producción.

1. **Unificar identidad.** Script `scripts/migrate-athlete-id.ts` que reescriba
   `workoutLogs.athleteId`, `diets.athleteId`, etc. de email a UID, con
   verificación de conteos antes/después y modo dry-run. Colección por colección,
   no todas de golpe.
2. **Arreglar el N+1 de `ClientsScreen`.** Denormalizar en `ClientRecord` los
   campos que la rejilla necesita (`lastPaymentAt`, `nextBillingDate`,
   `adherencePct`), actualizados al escribir. La rejilla pasa de 2N+ queries a 1.
3. **Poner `limit()` y paginación** a `getWorkoutLogs` y compañía.
4. Retirar `planStartDate`/`planDurationMonths` de `UserProfile`.

**Checkpoint por colección migrada:** conteo de documentos idéntico, y una
pantalla concreta que use esa colección muestra los mismos datos que antes.

**Rollback:** el backup de la Fase 0 + script inverso escrito *antes* de ejecutar
el directo.

**Coste:** 2–3 sesiones. Se puede posponer indefinidamente sin bloquear el CRM.

---

## 5. Resumen de fases

| Fase | Qué | Riesgo | Coste | Bloquea al CRM |
|---|---|---|---|---|
| 0 | Tests de reglas + backups | Ninguno | 1 sesión | — (pero hazla) |
| 1 | Ciclo de vida del cliente | Muy bajo | 1–2 | Sí |
| 2 | Servicios + suscripciones | Bajo | 1–2 | Sí |
| 3 | Pagos | **Medio** | 2 | Sí |
| 4 | Reuniones | Bajo | 1 | No |
| 5 | Identidad + rendimiento | Medio-alto | 2–3 | **No** |

**CRM funcional: fases 0–4 ≈ 6–8 sesiones.** La 5 es deuda técnica que puede
esperar.

---

## 6. Otras observaciones (fuera del alcance del CRM)

**Flujos de trabajo — lo que funciona**
- `ClientHub` con zonas `hoy`/`plan`/`analisis` es un buen modelo mental y tiene
  sitio para el CRM sin rediseño.
- El `ClientSetupPanel` con checklist por fases (`alta` → `programacion` →
  `primeras_semanas` → `consolidacion`) es, de hecho, ya media tubería de CRM.
  El estado comercial (Fase 1) debería enlazarse con ella, no duplicarla.
- `PendingTray` + `CommandPalette` cubren bien el "qué tengo que hacer hoy".

**Flujos de trabajo — huecos**
- No hay embudo antes del alta. Un lead solo existe cuando ya tiene cuenta en la
  app. La Fase 1 lo resuelve (`stage: 'lead'` sin `UserProfile` asociado — hay
  que permitir `ClientRecord` sin UID, con un id generado).
- No hay vista de negocio agregada: MRR, altas/bajas del mes, LTV. Con las fases
  1–3 los datos existen; la pantalla es un extra barato después.
- La bóveda / skill `metricas-negocio` lleva estos números en Google Sheets
  aparte. Merece la pena decidir conscientemente si la app sustituye a las hojas
  o convive con ellas — mantener las dos a mano es el peor de los tres mundos.

**Deuda técnica no relacionada con el CRM**
- `package.json` sigue llamándose `"react-example"`.
- `firestore-debug.log` (10 KB) commiteado en la raíz.
- `src/nutricion_seed_en_forma.ts` (30 KB) con permisos `600`, importado en el
  bundle del cliente.
- 8 ficheros con cambios sin commitear ahora mismo, incluidos `firestore.rules`
  y `vercel.json` de la auditoría de seguridad del 23-07. **Commitea eso antes
  de empezar la Fase 0** — no quieres mezclar remediación de seguridad con CRM
  en el mismo diff.
