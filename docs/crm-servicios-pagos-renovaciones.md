# CRM: servicios, pagos y renovaciones (y cuándo usar cada uno)

Las tres pestañas de la ficha de un cliente no son tres vistas de lo mismo.
Son tres cosas distintas, y confundirlas es lo que hace que un cobro
«desaparezca».

## Servicio — lo que le has vendido

Un **servicio** es el contrato: *«Asesoría 3 meses, 987 €, del 8 de septiembre
al 8 de diciembre»*. Es un hecho puntual, con principio y (casi siempre) final.

Al crearlo, si tiene importe y dejas marcada la casilla, se genera **su cobro
pendiente en la misma transacción** — o entran los dos, o ninguno.

- **Fraccionar en N cuotas**: el 3 × 329 € de las 12 semanas. Genera N pagos
  pendientes, uno al mes desde el primer cobro.
- **Primer cobro**: por defecto **el día en que arranca el servicio**, no hoy.
  Un plan contratado hoy que empieza el lunes que viene se cobra ese lunes; se
  puede mover a mano.
- **Periodicidad** aquí es una **etiqueta** del servicio (mensual, trimestral,
  pago único…) y sirve para calcular la fecha de fin sugerida. **No** hace que
  se cobre solo: eso son las renovaciones.
- Un servicio no se borra, se **archiva**: ya facturado, sigue contando en el
  historial y en lo cobrado.

## Pago — el dinero, cobrado o por cobrar

Un **pago** es una línea de dinero: concepto, importe, fecha y estado
(`pendiente` / `pagado`).

- Nacen solos desde un servicio o desde una renovación, o se registran a mano.
- Un pendiente **con fecha futura se ve igual** en la tabla y en «Pendiente de
  cobro»: aparece con su «en 5 días» y no se marca en rojo hasta que se pasa de
  plazo (más de 7 días desde la emisión).
- Un pendiente se borra si sobra. Uno **ya cobrado no se borra nunca** —ni la
  regla de Firestore lo deja—: se corrige editándolo, para no descuadrar un mes
  ya cerrado.

## Renovación (suscripción) — la regla de que vuelva a cobrarse

Una **suscripción** no es dinero: es la regla *«a esta persona le toca pagar
149 € cada mes / 450 € cada trimestre»*, con su **próximo cobro**.

- Cada vez que pulsas **«Registrar cobro»** (o «Renovar plan» en la cabecera de
  la ficha), la suscripción **genera un pago pendiente** con la fecha de ese
  ciclo y **avanza sola** al siguiente. Es idempotente: dos clics o dos
  pestañas no generan dos cobros.
- Al **crearla** puedes dejar ya el cobro de ese primer día como pendiente
  (casilla marcada por defecto). Así se ve desde el minuto uno aunque la fecha
  sea futura.
- **Pausar** deja de contarla como activa sin perder la ficha. **Borrar** la
  quita del todo; los cobros que ya generó se quedan donde están.

### La pregunta del trimestral

> Si le pongo el servicio trimestral y me renueva, ¿son tres adelantos de
> renovación, o hay que ponerlo a mano?

Ninguna de las dos, y aquí está la diferencia entera:

| Lo que quieres | Lo que creas | Lo que pasa |
|---|---|---|
| Cobrarle 987 € por un trimestre, una vez | **Servicio** trimestral, cuotas = 1 | 1 pago pendiente |
| Ese trimestre en 3 mensualidades de 329 € | **Servicio** trimestral, **cuotas = 3** | 3 pagos pendientes, uno al mes |
| Que se le cobre cada trimestre indefinidamente | **Renovación** con periodicidad trimestral | 1 pago **cada vez** que pulsas «Registrar cobro»; la fecha avanza 3 meses sola |

O sea: **cuotas** parte UN pago en varios; **periodicidad de la renovación**
repite el cobro para siempre. Una renovación trimestral no adelanta tres
cobros: genera uno cada tres meses, cuando toca.

Lo normal en un plan de 3 meses que se renueva: un **servicio** (con sus
cuotas, si lo fracciona) + una **renovación** trimestral con el primer cobro el
día que arranca.

## Archivar y borrar clientes

- **Archivar** (lista o ficha): desaparece de todas las listas, contadores y
  selectores del CRM hasta que lo desarchives desde el filtro «Archivados». No
  pierde nada, y no es lo mismo que ponerlo de **baja** —una baja es un hecho
  comercial, con fecha y motivo, que sigue contando para el churn—.
- **Borrar de verdad** solo donde no deja nada huérfano: contactos sin cuenta y
  perfiles ya anonimizados (los `borrado_xxxx` que deja el borrado de cuenta).
  Arrastra sus servicios, cobros pendientes, suscripciones y reuniones.
- Un cliente con **cobros ya cobrados no se puede borrar**: se archiva. Borrarlo
  descuadraría lo facturado de meses ya cerrados.
- Una **cuenta viva** no se borra desde el CRM: eso es el borrado de cuenta
  (`api/delete-account.ts`), que además limpia Auth, Storage y sus entrenos.
