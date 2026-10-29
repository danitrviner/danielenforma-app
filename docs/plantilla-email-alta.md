# Plantilla del correo de alta (tarea 10)

Esto es trabajo tuyo en la consola de Firebase, no de código — aquí solo dejo el texto
listo para pegar.

## Qué es exactamente

Cuando invitas a un atleta (desde el CRM → «Invitar atleta», o desde la ficha de un
contacto → «Dar de alta en la app»), el servidor crea la cuenta y le pide a Firebase que
mande el correo de **restablecer contraseña** (`sendPasswordResetEmail`) — no hay un
enlace mágico ni una plantilla de «bienvenida» separada, ese correo de restablecer ES el
correo de alta: es como el atleta entra por primera vez y elige su contraseña.

Ahora mismo ese correo sale con el texto por defecto de Firebase, en inglés
("Reset your password for `en-forma-...`"), sin tu marca.

## Dónde pegarlo

Firebase Console → tu proyecto → **Authentication** → pestaña **Templates** →
**Password reset** → icono de lápiz (editar) → pegar asunto y cuerpo de abajo → **Save**.

## Asunto

```
Crea tu contraseña para entrar en En Forma 💪
```

## Cuerpo

Firebase deja elegir entre el editor visual (con la variable `%LINK%` ya insertada como
botón) o HTML propio. Con el editor visual, basta con sustituir el texto y dejar el botón
del enlace donde está. Si prefieres pegar HTML entero, aquí está con el mismo texto:

```html
<p>Hola,</p>

<p>Soy Dani. Te he dado de alta en <strong>En Forma</strong>, la app con la que vamos a llevar
tu entrenamiento y tu comida. Antes de entrar, elige tu contraseña:</p>

<p><a href="%LINK%">Crear mi contraseña</a></p>

<p>Qué pasa ahora: entras, rellenas tu alta (diez minutos, contesta sin maquillar) y con eso
te monto el plan en un par de días. La primera semana te escribo cada día; los viernes te
pregunto cómo ha ido y los lunes te digo qué cambia.</p>

<p>Si no esperabas este correo, puedes ignorarlo — sin este paso la cuenta no se activa.</p>
```

Notas:
- `%LINK%` es la variable de Firebase que rellena el enlace real; no se toca.
- Desde el 29-10 el correo va firmado por Dani y dice qué pasa esta semana (contacto
  diario, viernes revisión, lunes respuesta): es exactamente lo que se promete en la venta,
  y la app lo cumple con la primera semana (docs/acompanamiento-tanda-4.md).
- El tono sigue el mismo que el resto de la app (wizard de alta, sala de espera del
  coach): directo, cercano, sin jerga corporativa, un emoji suelto en el asunto y no más.
