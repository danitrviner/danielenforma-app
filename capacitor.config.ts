import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // OJO: los dos nativos NO comparten identificador desde el 27-08-2026.
  //   Android: com.danielenforma.app        (el de aquí; es el que manda al
  //            generar la plataforma, y coincide con `applicationId` del
  //            build.gradle, que es el que Play tiene registrado)
  //   iOS:     com.danielenforma.entreno    (en project.pbxproj, los dos
  //            targets)
  // Divergen porque `com.danielenforma.app` estaba cogido como App ID en el
  // portal de Apple y no aparecía en ningún equipo de Dani para liberarlo:
  // Apple no reutiliza identificadores ni los traspasa entre equipos, así que
  // el de iOS hubo que cambiarlo. Este campo se queda con el de Android a
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
