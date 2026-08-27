# Notas para el revisor (App Store Connect y Play Console)

Texto listo para pegar. Actualizado el 27-08-2026.

Las notas van **en inglés**: es lo que espera el revisor de Apple por defecto y no depende de
que te toque uno que hable español. Debajo está la versión en castellano por si prefieres esa
para Play Console.

---

## 1. Credenciales

Las mismas para las dos tiendas. Cuenta de **atleta**, con email y contraseña fijos — no con
enlace mágico, que caduca y depende de que el revisor tenga acceso al buzón.

```
Usuario:    revision.appstore@danielenforma.app
Contraseña: Revision-EnForma-heahs7!2026
```

Si alguna vez hay que regenerarla: `node scripts/crear-atleta-demo.mjs` imprime una nueva y
deja la anterior inservible. **Actualiza entonces la ficha de las dos tiendas**, o el siguiente
envío se rechaza porque el revisor no puede entrar.

---

## 2. App Store Connect → App Review Information → Notes

```
En Forma is a private coaching app. Athletes do not sign up on their own: a personal
trainer invites them by email, and that invitation is the only way to create an account.
The demo account above is a pre-invited athlete account, ready to use.

The app does not sell anything. Coaching is contracted directly with the trainer outside
the app; there are no prices, no in-app purchases and no subscriptions anywhere in the UI.

The demo account has the athlete role. The trainer console is a separate role, granted
only to the account of the trainer who owns the service, so it is not part of what this
account can reach. Everything an end user experiences is available with these credentials:
today's workout, exercise player with set logging, nutrition and exchanges, recipes,
progress photos, check-in questionnaires and profile.

Account deletion is available in-app: Profile > Settings (gear icon) > "Eliminar mi
cuenta". It asks for the password and deletes the athlete's training, nutrition, progress,
photos and check-in data. Billing records are kept in anonymised form, as required by
Spanish tax law, and the screen states this before confirming. The same path is reachable
from the web at https://en-forma-ivory.vercel.app/eliminar-cuenta

Health data: the app reads step count from Apple Health, only after the user grants
permission, and only to display daily activity. It never writes to Health, and health data
is never used for advertising or shared with third parties. Steps can also be entered
manually if permission is denied, so no feature is blocked by refusing access.

The app content is bundled in the binary. The only calls to our own server are
/api/create-athlete (trainer invites an athlete), /api/delete-account (account deletion)
and /api/ai-chat, which is restricted to the trainer's account.

Privacy policy: https://en-forma-ivory.vercel.app/privacidad
Terms:          https://en-forma-ivory.vercel.app/terminos
```

---

## 3. Play Console → App access → All functionality is restricted

Pega las mismas credenciales y estas instrucciones:

```
Athletes are invited by their personal trainer; there is no public sign-up. Use the demo
account below, which is already invited and active. Sign in with email and password on the
welcome screen. No other steps are needed.

The app sells nothing: coaching is contracted outside the app and there are no in-app
purchases. Account deletion is in Profile > Settings (gear icon) > "Eliminar mi cuenta",
and also at https://en-forma-ivory.vercel.app/eliminar-cuenta
```

---

## 4. Versión en castellano

```
En Forma es una app de entrenamiento personal privada. Los atletas no se registran por su
cuenta: su entrenador les invita por correo, y esa invitación es la única vía de alta. La
cuenta de demostración es una cuenta de atleta ya invitada y lista para usar.

La app no vende nada. El servicio se contrata directamente con el entrenador fuera de la
aplicación: no hay precios, ni compras integradas, ni suscripciones en ninguna pantalla.

La cuenta de demostración tiene rol de atleta. La consola de entrenador es un rol aparte,
que solo tiene la cuenta del entrenador propietario del servicio. Todo lo que vive un
usuario final se puede ver con estas credenciales: el entreno del día, el reproductor de
ejercicios con registro de series, nutrición e intercambios, recetas, fotos de progreso,
cuestionarios de revisión y perfil.

El borrado de cuenta está dentro de la app, en Perfil > Ajustes > «Eliminar mi cuenta».
Pide la contraseña y borra los datos de entrenamiento, nutrición, progreso, fotos y
revisiones. Los registros de facturación se conservan anonimizados por obligación fiscal, y
la propia pantalla lo dice antes de confirmar. También está en
https://en-forma-ivory.vercel.app/eliminar-cuenta

Datos de salud: la app lee los pasos de Salud, solo con permiso del usuario y solo para
mostrar la actividad diaria. Nunca escribe en Salud, y esos datos no se usan para
publicidad ni se comparten con terceros. Los pasos también se pueden escribir a mano, así
que negar el permiso no bloquea ninguna función.

El contenido va empaquetado en el binario. Las únicas llamadas a servidor propio son
/api/create-athlete, /api/delete-account y /api/ai-chat, esta última reservada a la cuenta
del entrenador.
```

---

## 5. Antes de enviar

- [ ] **Entrar una vez con la cuenta de demostración.** Nunca se ha usado: el revisor sería el
      primero. Si algo falla ahí, es rechazo directo por la directriz 2.1.
- [ ] **Llenarla de datos.** Hoy está vacía (plan sin publicar, sin entrenamientos, sin
      histórico). Un revisor que entra y ve pantallas vacías no puede evaluar la app.
- [ ] **HealthKit.** El proyecto tiene la capacidad activada (`App.entitlements`) y la app lee
      pasos de Salud, así que hay que marcarla también en el App ID del portal de Apple. Ojo: el
      checklist antiguo decía lo contrario porque entonces no se usaba.
