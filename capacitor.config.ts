import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
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
