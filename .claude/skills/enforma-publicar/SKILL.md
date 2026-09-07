---
name: enforma-publicar
description: A dónde llega cada cambio en En Forma y cómo se publica. Úsala SIEMPRE que se hable de desplegar, publicar, subir a producción, sacar una versión, mandar a revisión, App Store, Play Console, Xcode, un binario o un build nativo; cuando alguien pregunte "¿esto ya lo ven los atletas?" o "¿cuándo llega esto al móvil?"; y ANTES de dar por terminado cualquier cambio en src/ que el usuario espere ver en su teléfono.
---

# Publicar En Forma

En `capacitor.config.ts` hay `webDir: 'dist'` y **no** hay `server.url`. La web va
empaquetada **dentro** del binario de cada tienda. De ahí sale todo lo demás.

---

## 1 · A dónde llega cada cosa

| Qué tocas | A dónde llega | Cuándo |
|---|---|---|
| Código de `src/` | **Solo la web** de Vercel | Al desplegar |
| Código de `src/` | iPhone y Android | **Solo con binario nuevo y revisión** |
| `firestore.rules`, `firestore.indexes.json` | **Todo el mundo a la vez** | Al desplegar, sin revisión |
| Datos de Firestore (catálogos, recetas) | **Todo el mundo a la vez** | Al escribir |

**La asimetría es la trampa.** Un arreglo de JavaScript tarda semanas en llegar al móvil;
una regla de Firestore llega en segundos a los móviles que ya están instalados. Por eso
una regla nueva puede romper la app que un atleta tiene desde hace semanas.

> Al cerrar un cambio de `src/`, **di explícitamente** que solo estará en la web hasta que
> salga un binario nuevo. No dejes que se dé por publicado.

Para el orden de despliegue de reglas, ver la skill `enforma-firestore`.

---

## 2 · Publicar en la web (Vercel)

Lo barato: va solo al hacer push a `main`. Antes:

```bash
npm run lint && npm test -- --run
```

Aviso conocido: `lint` puede fallar por un falso positivo del verificador de iconos.
Confírmalo antes de tratarlo como un fallo real.

---

## 3 · Publicar un binario

```bash
npm run prerelease      # lint + test + sync:native (build web, bundle nativo, cap sync)
```

Si eso no pasa, no hay nada que subir.

Los dos números de versión se suben **a mano** y son independientes:

| | Dónde |
|---|---|
| iOS | `ios/App/App.xcodeproj/project.pbxproj` → `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` |
| Android | `android/app/build.gradle` → `versionName` / `versionCode` |

`versionCode` de Android sube **siempre**, aunque `versionName` no cambie: Play rechaza un
código repetido. En iOS igual con `CURRENT_PROJECT_VERSION` dentro de la misma versión de
marketing.

Los identificadores **no coinciden y es a propósito**: Android es `com.danielenforma.app`,
iOS es `app.danielenforma.entreno`.

- **iOS**: Xcode → Product → Archive → Distribute App. **Lo hace Dani a mano**, no está
  automatizado. No ofrezcas hacerlo tú.
- **Android**: `.aab` firmado con `android/keystore.properties` (fuera de git; si se
  pierde, se pierde la capacidad de actualizar la app publicada).

---

## 4 · Con una build en revisión: no se toca

**No se le pueden meter cambios a una build que ya está en revisión.** Hay que sacarla y
volver a empezar en las dos tiendas. El criterio:

- ¿Está **arreglando un rechazo**? → **No se toca.** Cambiar un bloqueo ya resuelto por
  otro que empieza de cero es mal negocio, por buenas que sean las mejoras.
- ¿Actualización normal y la mejora es urgente? → En Play (revisión de horas) puede
  compensar. En Apple casi nunca.
- ¿**Primera publicación**? → Nunca se toca; esa revisión es la lenta.

Mientras haya algo en revisión: **no sube nada**. Ni binario, ni reglas, ni índices, ni
Vercel. Si te piden desplegar en ese estado, dilo y espera confirmación explícita.

---

## 5 · Lo que arreglaría esto de raíz

Hoy un arreglo de una línea necesita una revisión de tienda. Con *live updates* la app se
baja el paquete JS nuevo sin pasar por la tienda. Está permitido (Apple 3.3.2, y Google
también) mientras no cambie el propósito de la app.

- Candidatos: `@capgo/capacitor-updater` (de pago, autoalojable) o Ionic Appflow.
- **`server.url` a secas no sirve**: convierte la app en un envoltorio de una web, expone
  a la directriz 4.2 de Apple y deja sin funcionamiento sin conexión.
- Requiere una build para activarse, así que el momento de meterlo es la siguiente que se
  suba, no una dedicada.

**Está sin decidir.** No lo instales sin que Dani lo pida.

---

## 6 · Documentos hermanos

- `docs/publicar-actualizaciones.md` — el manual completo, y la cola de lo pendiente.
- `docs/notas-para-revision.md` — texto para el revisor y credenciales de la cuenta demo.
  **Si se regeneran las credenciales, hay que actualizar las dos fichas** o el siguiente
  envío se rechaza.
- `docs/ficha-tiendas.md` — textos de las fichas con los límites contados.
- `docs/QA-pendiente-dani.md` — tiene partes anticuadas; no lo cites sin comprobar.
