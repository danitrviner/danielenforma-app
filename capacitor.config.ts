import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // OJO: los dos nativos NO comparten identificador desde el 27-08-2026.
  //   Android: com.danielenforma.app        (el de aquí; es el que manda al
  //            generar la plataforma, y coincide con `applicationId` del
  //            build.gradle, que es el que Play tiene registrado)
  //   iOS:     app.danielenforma.entreno   (en project.pbxproj, los dos
  //            targets)
  // Divergen porque el espacio ENTERO de `com.danielenforma.*` está bloqueado
  // en el portal de Apple —no solo `com.danielenforma.app`, también nombres
  // recién inventados bajo ese prefijo— y no aparece en ningún equipo de Dani
  // para liberarlo. Por eso el de iOS empieza por `app.`: es el dominio
  // `danielenforma.app` al revés, que es la convención de Apple, y esquiva el
  // prefijo bloqueado. Este campo se queda con el de Android a
  // propósito: `cap sync` no reescribe los ids nativos, solo se usa al crear
  // una plataforma desde cero, y ahí el que interesa conservar es el que ya
  // está publicado.
  appId: 'com.danielenforma.app',
  appName: 'En Forma',
  webDir: 'dist',
  backgroundColor: '#050505',
  // Ya es el valor por defecto — se deja explícito para que un futuro
  // `npx cap sync` con otra versión de Capacitor no lo cambie sin que
  // nadie se entere (ver T1, index.html).
  zoomEnabled: false,
};

export default config;
