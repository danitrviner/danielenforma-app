// Genera assets/icon.png y assets/splash.png a partir del logo Atlas
// (public/icon-512.png) para que @capacitor/assets regenere los iconos y
// splash screens nativos de iOS/Android. Uso puntual — no forma parte del
// build normal.
import sharp from 'sharp';
import { existsSync, mkdirSync } from 'fs';

const BG = '#111110'; // mismo fondo que manifest.json / pantalla de carga
const SOURCE = 'public/icon-512.png';

if (!existsSync('assets')) mkdirSync('assets');

async function run() {
  // Icono: el propio icon-512 ya tiene el fondo/padding correctos — se usa tal cual a 1024.
  await sharp(SOURCE).resize(1024, 1024).png().toFile('assets/icon.png');

  // Splash: lienzo 2732x2732 del color de fondo de la app, con el logo
  // centrado a un tamaño legible (evita que quede minúsculo en pantallas grandes).
  const logo = await sharp(SOURCE).resize(1000, 1000).png().toBuffer();
  await sharp({
    create: { width: 2732, height: 2732, channels: 4, background: BG },
  })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile('assets/splash.png');

  console.log('assets/icon.png y assets/splash.png generados.');
}

run();
