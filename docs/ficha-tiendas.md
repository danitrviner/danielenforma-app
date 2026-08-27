# Textos de las fichas · App Store y Google Play

Listos para pegar. Escrito el 27-08-2026, con los límites de caracteres ya contados.

Un criterio que atraviesa todo: **la app no se vende sola**. Nadie la descarga y se pone a
entrenar — la descarga alguien a quien Dani ya entrena. Así que los textos no persiguen a un
desconocido: le confirman a tu cliente que este es el sitio de su plan, y le explican al
revisor por qué no hay registro abierto. Prometer «rutinas para todos» sería mentira y además
te expone a la directriz 2.1 en cuanto el revisor no encuentre por dónde registrarse.

---

## 1 · Campos cortos

| Campo | Límite | Texto | Usados |
|---|---|---|---|
| Nombre (App Store) | 30 | `En Forma · Entrenamiento` | 24 |
| Subtítulo (App Store) | 30 | `Tu plan, tu coach, tu ritmo` | 27 |
| Título (Play) | 30 | `En Forma · Entrenamiento` | 24 |
| Descripción corta (Play) | 80 | `El plan que tu entrenador diseña para ti: entrenos, dieta y progreso real.` | 74 |
| Palabras clave (App Store) | 100 | `entrenador,personal,fuerza,gimnasio,rutina,dieta,macros,progreso,pesas,coach,fitness` | 84 |

**«En Forma» a secas está cogido** en la App Store (comprobado el 27-08: Apple lo rechaza al
crear la app). Los nombres tienen que ser únicos en toda la tienda, pero la unicidad es sobre
la cadena exacta, así que `En Forma · Entrenamiento` sí entra. No afecta al nombre bajo el
icono del móvil, que sigue siendo **En Forma** (`CFBundleDisplayName` en el Info.plist) y no
tiene que coincidir con el de la ficha.

Sobre las palabras clave: sin espacios después de las comas (Apple los cuenta), sin repetir
palabras que ya están en el nombre o el subtítulo (Apple ya indexa esas) y sin marcas ajenas,
que es motivo de rechazo.

---

## 2 · Descripción larga

Vale igual para App Store (máx. 4.000) y Play (máx. 4.000). La primera línea es la que se ve
sin pulsar «más»: ahí va la promesa entera.

```
En Forma es la app de tu entrenador personal. Aquí está tu plan: lo que toca hoy, cuánto
peso moviste la última vez y qué tienes que comer para llegar a donde quieres.

No es una app de rutinas genéricas. Cada entrenamiento, cada dieta y cada objetivo los
monta tu entrenador para ti, mirando tu historial y tus revisiones. Por eso se entra solo
por invitación: si aún no entrenas con nosotros, escríbenos antes de descargarla.

TU ENTRENAMIENTO
· El entreno del día, con series, repeticiones, descansos y el RIR que te ha marcado tu
  entrenador.
· Registra el peso de cada serie y verás al instante lo que hiciste la vez anterior.
· Tu 1RM estimado y tu progresión por ejercicio, para saber si de verdad estás subiendo.
· Temporizador de descanso que sigue sonando con el móvil bloqueado y en el bolsillo.
· Vídeo de cada ejercicio dentro de la app, sin acabar en otra aplicación.

TU NUTRICIÓN
· Tu plan por intercambios: qué comer en cada comida, con equivalencias reales para
  cambiar un alimento por otro sin romper los macros.
· Miles de recetas filtradas por tus preferencias, tus alergias y el tiempo que tengas
  para cocinar.
· Marca lo que vas cumpliendo y tu entrenador ve tu adherencia de verdad, no lo que
  recuerdas al final de la semana.

TU PROGRESO
· Peso corporal, medidas y fotos de progreso comparables lado a lado.
· Pasos diarios, sincronizados con Salud si le das permiso, o a mano si prefieres.
· Cuestionarios de revisión periódicos: tu entrenador ve cómo duermes, cómo te
  recuperas y cómo te sientes, no solo los kilos.
· Informes de rendimiento que te envía tu entrenador, con tus números y sus comentarios.

CÓMO SE ENTRA
En Forma no tiene registro abierto. Tu entrenador te invita por correo, creas tu
contraseña y entras. Todo lo que ves es tuyo y solo lo comparte contigo tu entrenador.

Puedes eliminar tu cuenta y tus datos desde la propia app, en Perfil › Ajustes.
```

---

## 3 · Titulares de las capturas

Uno por captura, en el mismo orden. Cada uno dice qué resuelve, no qué pantalla es.

1. **Hoy toca esto** — pantalla de inicio con el entreno del día
2. **Cada serie, cada kilo** — el reproductor con la tabla de series
3. **Come sin pesarlo todo** — nutrición por intercambios
4. **Mira si estás subiendo** — progresión de peso y 1RM
5. **Tu entrenador te ve** — revisiones y reporte

---

## 4 · Declaración del servicio en primer plano (Play)

Play la exige porque `RestTimerService` usa `foregroundServiceType="specialUse"`. Va en
`Contenido de la app` → `Servicios en primer plano`:

```
The app runs a foreground service only while the user is doing a workout, to keep the rest
timer between sets running when the screen is off or the app is in the background. Without
it Android suspends the timer and the user misses the end of the rest period, which is the
core of the training session.

The service starts when the user begins a rest period and stops when the workout ends. It
does not collect data, does not access location and does not run when the app is not in an
active workout. No other foreground service type applies: it is not media playback, not
navigation, not a phone call and not a data sync.
```

Si algún día molesta, la alternativa es sustituirlo por una notificación programada
(`@capacitor/local-notifications`, que ya está en el proyecto) y quitar el servicio: se pierde
el contador vivo en la notificación, pero el aviso al terminar el descanso se mantiene.

---

## 5 · Categorías

| | App Store | Play |
|---|---|---|
| Principal | Salud y forma física | Salud y bienestar |
| Secundaria | Estilo de vida | — |
| Clasificación | 17+ · «Yes» a Medical/Treatment Information | 18 y más |
| Idioma | Español (España) | es-ES |

Lo de Medical/Treatment Information no es exagerado ni opcional: la app da pautas de dieta y
de carga de entrenamiento. Declararlo evita la revisión sorpresa; ocultarlo es lo que la
provoca.
