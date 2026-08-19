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

<p>Tu entrenador te ha dado de alta en <strong>En Forma</strong>, tu app de entrenamiento
y nutrición. Antes de entrar, elige tu contraseña:</p>

<p><a href="%LINK%">Crear mi contraseña</a></p>

<p>Con eso ya puedes entrar en la app y tu entrenador podrá empezar a montarte el plan.</p>

<p>Si no esperabas este correo, puedes ignorarlo — sin este paso la cuenta no se activa.</p>
```

Notas:
- `%LINK%` es la variable de Firebase que rellena el enlace real; no se toca.
- No he metido tu nombre (Dani) a pelo en el texto porque el mismo flujo lo puede usar
  cualquier coach si el día de mañana hay más de uno — "tu entrenador" queda genérico y
  sigue sonando personal. Si prefieres que diga "Dani te ha dado de alta", dímelo y lo
  cambio.
- El tono sigue el mismo que el resto de la app (wizard de alta, sala de espera del
  coach): directo, cercano, sin jerga corporativa, un emoji suelto en el asunto y no más.
